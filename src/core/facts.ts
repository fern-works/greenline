import { z } from "zod";
import { isRepositoryPath } from "../commons/repository-path.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";

/**
 * Check facts (`workshop/components/cli-contracts.md`): the one JSON file
 * `greenline check` writes for each run under a change's
 * `checks/` folder. It holds what ran and how it ended, never what the
 * command printed: the arguments as given, the step when one was named,
 * when it started, the commit and the tree id of the code outside
 * `.greenline/`, the installation's revision, and, once the run is over,
 * its outcome and duration. The file is written in the started state
 * before the command starts and rewritten in the finished state after, so
 * a file still in the started state is a run that was killed, or is still
 * running, and has no outcome. Each run names the newest facts file already
 * in the folder when it started, so a fact removed from between two runs is
 * seen; and a run recorded as a check by mistake, a probe, is marked so by
 * `greenline check --probe`, the one write a finished file ever takes. The
 * agent never removes or edits a facts file. A run a declared check matched
 * names the check and the directory `check` ran it in, which the close reads
 * it by (J-98 S1).
 */

/** How the checked command ended. `unstarted` is a resolved command that the system then refused to start. */
export type CheckOutcome =
  | { readonly kind: "exited"; readonly code: number }
  | { readonly kind: "signalled"; readonly signal: string }
  | { readonly kind: "unstarted"; readonly message: string };

/** What is known when the run starts. */
export interface CheckStart {
  /** The command and its arguments, exactly as given after `--`. */
  readonly arguments: readonly string[];
  /** The step the check belongs to, when named. */
  readonly step?: string | undefined;
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  /** The commit checked out when the run started; null when the repository has no commit or git cannot say. */
  readonly commit: string | null;
  /** The tree id of the working tree outside `.greenline/` when the run started; null when git cannot say. */
  readonly tree: string | null;
  /** The installation payload's revision. */
  readonly installation: string;
  /** The newest facts file already in the change's `checks/` folder when the run started; absent for the first. */
  readonly previous?: string | undefined;
  /** The declared check the run was taken as; absent when no declaration matched. */
  readonly check?: string | undefined;
  /** The directory the run ran in, from the root, the declared check's; absent for a run at the root. */
  readonly dir?: string | undefined;
}

/** Set only by `greenline check --probe`: the run was a probe, recorded as a check by mistake. */
interface ProbeMark {
  readonly probe?: true | undefined;
}

/** One run's facts: started, or finished with its outcome and duration. */
export type CheckFacts =
  | (CheckStart & ProbeMark & { readonly schemaVersion: 1; readonly state: "started" })
  | (CheckStart &
      ProbeMark & {
        readonly schemaVersion: 1;
        readonly state: "finished";
        readonly outcome: CheckOutcome;
        readonly durationMs: number;
      });

/** A facts file's name, as {@link factsFileName} makes it. */
const FACTS_FILE = /^\d{8}T\d{9}Z-[0-9a-f]+\.json$/;

/**
 * Whether a name is a facts file's, as `greenline check` names one.
 * @param name a file name, with no directory
 * @returns true for a facts file's name
 */
export function isFactsFileName(name: string): boolean {
  return FACTS_FILE.test(name);
}

const GIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const start = {
  schemaVersion: z.literal(1),
  arguments: z.array(z.string()).min(1),
  step: z.string().min(1).optional(),
  startedAt: z.iso.datetime(),
  commit: z.string().regex(GIT_ID).nullable(),
  tree: z.string().regex(GIT_ID).nullable(),
  installation: z.string().regex(/^[0-9a-f]{64}$/),
  previous: z.string().regex(FACTS_FILE).optional(),
  check: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .optional(),
  dir: z
    .string()
    .refine(isRepositoryPath, "a run's dir is a path inside the repository")
    .optional(),
  probe: z.literal(true).optional(),
};
const outcome = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exited"), code: z.number().int() }).strict(),
  z.object({ kind: z.literal("signalled"), signal: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("unstarted"), message: z.string() }).strict(),
]);
const facts: z.ZodType<CheckFacts> = z.discriminatedUnion("state", [
  z.object({ ...start, state: z.literal("started") }).strict(),
  z
    .object({
      ...start,
      state: z.literal("finished"),
      outcome,
      durationMs: z.number().int().min(0),
    })
    .strict(),
]);

/**
 * The facts of a run that is about to start.
 * @param known what is known before the command starts
 * @returns the started facts
 */
export function startedFacts(known: CheckStart): CheckFacts {
  const { previous, check, dir, ...rest } = known;
  // A field with no value is left out of the file: the first run names no fact before it, and a run no declaration matched names no check and ran at the root.
  let facts: CheckFacts = { schemaVersion: 1, state: "started", ...rest };
  if (previous !== undefined) facts = { ...facts, previous };
  if (check !== undefined) facts = { ...facts, check };
  if (dir !== undefined) facts = { ...facts, dir };
  return facts;
}

/**
 * The facts of a run that has ended.
 * @param started the facts written before it started
 * @param ended how the command ended
 * @param durationMs how long it ran, in whole milliseconds
 * @returns the finished facts
 */
export function finishedFacts(
  started: CheckFacts,
  ended: CheckOutcome,
  durationMs: number,
): CheckFacts {
  const { state: _state, ...known } = started;
  return { ...known, state: "finished", outcome: ended, durationMs };
}

/**
 * The facts of a run marked as a probe, every other fact as it was.
 * @param facts the run's facts
 * @returns the same facts with the probe mark
 */
export function markedProbe(facts: CheckFacts): CheckFacts {
  return { ...facts, probe: true };
}

/**
 * The facts as the file holds them.
 * @param value the facts
 * @returns indented JSON with a final newline
 */
export function serializeFacts(value: CheckFacts): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * A facts file's name: its start time without separators and a short
 * random part, so runs sort by time and two runs never share a file.
 * @param startedAt the run's ISO 8601 start time
 * @param nonce a few random hex characters
 * @returns the file name, such as `20261004T120000123Z-a1b2c3.json`
 */
export function factsFileName(startedAt: string, nonce: string): string {
  return `${startedAt.replace(/[-:.]/g, "")}-${nonce}.json`;
}

/**
 * Parse a facts file, refusing an unknown field, a started file with an
 * outcome, a finished one without, and malformed ids or times.
 * @param input the file's text
 * @param source where it came from, for the refusal
 * @returns the facts, or every issue found
 */
export function parseFacts(input: string, source: string): Result<CheckFacts, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [{ path: "", message: "check facts are not valid JSON" }]);
  const parsed = facts.safeParse(raw);
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/**
 * A hook-recorded run (`docs/SPEC.md` §4, `greenline event`): a command the
 * harness reported whose text matched a declared check, written whole at the
 * harness's after-tool event beside the change's check facts with
 * `source: hook`. It names the declared check, the harness, the text as the
 * harness gave it (never split), its directory and the outcome the harness
 * reported, `unknown` where it gave none. Only `check`, which runs the
 * command itself, vouches for a run, so a hook-recorded run feeds the status
 * mirror and its nudges and never a refusal or a finding.
 */
export interface HookRun {
  readonly schemaVersion: 1;
  readonly source: "hook";
  readonly harness: string;
  /** The declared check's name the text matched. */
  readonly check: string;
  /** The command's text as the harness reported it, whole. */
  readonly arguments: readonly [string];
  /** The directory it ran in, relative to the root, `.` for the root. */
  readonly dir: string;
  readonly startedAt: string;
  readonly commit: string | null;
  readonly tree: string | null;
  /** When the tree was read: as the run started, from the paired before-tool event, or after it ended. */
  readonly treeAt: "run-start" | "run-end";
  /** The installation's revision the lock names; null when the lock cannot be read. */
  readonly installation: string | null;
  readonly state: "finished";
  /** What the harness reported: ok or failed, with the exit code when it gave one, or unknown. */
  readonly outcome: { readonly kind: "ok" | "failed" | "unknown"; readonly code: number | null };
  readonly durationMs: number | null;
}

const hookRun: z.ZodType<HookRun> = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("hook"),
    harness: z.string().regex(/^[a-z][a-z0-9-]*$/),
    check: z.string().regex(/^[a-z][a-z0-9-]*$/),
    arguments: z.tuple([z.string().min(1)]),
    dir: z.string().min(1),
    startedAt: z.iso.datetime(),
    commit: z.string().regex(GIT_ID).nullable(),
    tree: z.string().regex(GIT_ID).nullable(),
    treeAt: z.enum(["run-start", "run-end"]),
    installation: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    state: z.literal("finished"),
    outcome: z
      .object({ kind: z.enum(["ok", "failed", "unknown"]), code: z.number().int().nullable() })
      .strict(),
    durationMs: z.number().int().min(0).nullable(),
  })
  .strict();

/** One JSON file of a change's `checks/` folder: the facts `check` wrote, or a run a hook recorded. */
export type ChecksFile =
  | { readonly kind: "check"; readonly parsed: Result<CheckFacts, ContractParseFailed> }
  | { readonly kind: "hook"; readonly parsed: Result<HookRun, ContractParseFailed> };

/**
 * Read one file of a change's `checks/` folder: a file whose `source` is
 * `hook` is a hook-recorded run, and every other file is read as the facts
 * `check` writes, so a file that is neither is refused as those facts.
 * @param input the file's text
 * @param source where it came from, for the refusal
 * @returns which it is, with its parse
 */
export function parseChecksFile(input: string, source: string): ChecksFile {
  const raw = parseJson(input);
  const hooked = z.object({ source: z.literal("hook") }).safeParse(raw);
  if (!hooked.success) return { kind: "check", parsed: parseFacts(input, source) };
  const parsed = hookRun.safeParse(raw);
  return {
    kind: "hook",
    parsed: parsed.success
      ? contractOk(parsed.data)
      : contractFailure(source, issuesFrom(parsed.error.issues)),
  };
}

/**
 * A hook-recorded run's file name: a facts file's name with `.hook` before
 * its extension, so it sorts beside the facts by time and yet is never a
 * facts file's name, which `check`'s `previous` chain and the missing-fact
 * notice read alone.
 * @param startedAt the run's ISO 8601 start time
 * @param nonce a few random hex characters
 * @returns the file name, such as `20261004T120000123Z-a1b2c3.hook.json`
 */
export function hookRunFileName(startedAt: string, nonce: string): string {
  return factsFileName(startedAt, nonce).replace(/\.json$/, ".hook.json");
}

/**
 * The hook-recorded run as its file holds it.
 * @param run the run
 * @returns indented JSON with a final newline
 */
export function serializeHookRun(run: HookRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}
