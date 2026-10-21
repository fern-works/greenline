import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { isHarness, type Harness } from "../../core/adapters.ts";
import { matchedCheck, ROOT_DIR, type DeclaredCheck } from "../../core/checks.ts";
import { parseJson } from "../../core/contract.ts";
import {
  contextOutput,
  inHomes,
  isEventKind,
  normaliseEvent,
  type EventKind,
  type NormalisedEvent,
} from "../../core/event.ts";
import {
  hookRunFileName,
  parseChecksFile,
  serializeHookRun,
  type CheckFacts,
  type HookRun,
} from "../../core/facts.ts";
import {
  changeOfBranch,
  holdsNoChange,
  noChangeReason,
  recordPath,
  standingReason,
  type BranchChange,
  type BranchFacts,
  type ProceedSetting,
} from "../../core/git-hooks.ts";
import { agentsCounted, checkStandings, mirrorText } from "../../core/mirror.ts";
import type { Manifest } from "../../core/manifest.ts";
import { headCommit, workingTreeId } from "../code-tree.ts";
import { atomicWriteFile } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import {
  checksFolder,
  gitHooksState,
  lockedRevision,
  branchFacts,
  merging,
  workingRecord,
  workspaceManifest,
} from "../hooks.ts";
import type { CliWriter } from "./output.ts";

/**
 * `greenline event [<kind>] --harness <name> [--native <event>]`
 * (`docs/SPEC.md` §4): the one entry point every harness adapter pipes its
 * events into, the harness's JSON on stdin. It normalises the event, appends
 * it to the open change's raw log, `.greenline/tmp/<id>/events.jsonl`,
 * matches a shell command against the declared checks and writes a matched
 * run whole as a hook-recorded run beside the change's check facts, prints
 * the status mirror at a session's and a turn's start, and refuses one act:
 * a write-class tool's path outside the homes while the record lacks the
 * owner's yes, a `standing` choice the manifest's `proceed` does not admit
 * lacking it, or while no change is open on the branch HEAD names (J-102
 * S1). It exits 2 with one line to refuse, and 0 otherwise, on its own error
 * and without a workspace included, so greenline never stops a tool by
 * failing.
 */

/** Where the command runs, its stdin, and the clock and file names a test may fix. */
export interface EventEnvironment {
  readonly cwd: string;
  /** The harness's JSON, read whole. */
  readonly stdin: () => string;
  readonly now?: () => Date;
  readonly factsFile?: (startedAt: string) => string;
  /** The modes definition's modes in order, fastest first, read only when a standing choice's mode is not the one `proceed` names; undefined when they cannot be read. */
  readonly modes?: () => readonly string[] | undefined;
}

/** greenline's refusal, which every command-hook harness reads as its own. */
const EXIT_REFUSE = 2;
const EXIT_ALLOW = 0;

/** The arguments, or why they do not read, which lets the tool go on. */
type Parsed =
  | {
      readonly kind: EventKind | undefined;
      readonly harness: Harness;
      readonly native: string | undefined;
    }
  | { readonly refused: string };

function parseEventArgs(argv: readonly string[]): Parsed {
  let kind: EventKind | undefined;
  let harness: string | undefined;
  let native: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    const value = argv[index + 1];
    if (argument === "--harness" && value !== undefined) {
      harness = value;
      index += 1;
    } else if (argument === "--native" && value !== undefined) {
      native = value;
      index += 1;
    } else if (kind === undefined && isEventKind(argument)) kind = argument;
    else return { refused: `unknown argument '${argument}'` };
  }
  if (harness === undefined || !isHarness(harness))
    return {
      refused: `--harness names one of the harnesses greenline reads, not '${harness ?? ""}'`,
    };
  return { kind, harness, native };
}

/** A path from the root, `/`-separated; undefined when it lies outside the repository. */
function fromRoot(root: string, path: string, base: string): string | undefined {
  const relation = relative(root, isAbsolute(path) ? path : resolve(base, path));
  if (relation === "") return ROOT_DIR;
  if (relation.startsWith("..") || isAbsolute(relation)) return undefined;
  return relation.split(sep).join("/");
}

/** The raw log of a change, its ignored working folder's events.jsonl. */
function eventsPath(root: string, id: string): string {
  return join(root, ".greenline", "tmp", id, "events.jsonl");
}

/** The commit and tree a matched before-tool event records for its run. */
const OPENED = z.object({ commit: z.string().nullable(), tree: z.string().nullable() });
type Opened = z.infer<typeof OPENED>;

/** What the raw log's lines are read for: the kind, the pairing, the time and a matched run's start. */
const LOGGED = z.object({
  kind: z.string().optional().catch(undefined),
  call: z.string().nullable().optional().catch(undefined),
  at: z.string().optional().catch(undefined),
  opened: OPENED.optional().catch(undefined),
});
type Logged = z.infer<typeof LOGGED>;

/** The raw events already logged for a change; a line that does not read is left out. */
function loggedEvents(root: string, id: string): readonly Logged[] {
  let text: string;
  try {
    text = readFileSync(eventsPath(root, id), "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    const read = LOGGED.safeParse(parseJson(line));
    return read.success ? [read.data] : [];
  });
}

/** One line of the raw log: an event, a matched before-tool event with the code its run starts on. */
type LogLine = NormalisedEvent | (NormalisedEvent & { readonly opened: Opened });

/** Append one line to the change's raw log, making its working folder when it is absent. */
function logEvent(root: string, id: string, line: LogLine): void {
  mkdirSync(join(root, ".greenline", "tmp", id), { recursive: true });
  appendFileSync(eventsPath(root, id), `${JSON.stringify(line)}\n`);
}

/** The declared check a shell command is a run of, in the directory it ran in, or at the session's when the harness gave none. */
function checkOf(
  root: string,
  checks: readonly DeclaredCheck[],
  event: NormalisedEvent,
  base: string,
): DeclaredCheck | undefined {
  const text = event.command?.text;
  if (text === null || text === undefined) return undefined;
  const dir = fromRoot(root, event.command?.dir ?? base, base);
  return dir === undefined ? undefined : matchedCheck(checks, text, dir);
}

/** The first path a write-class tool names outside the homes, the repository's outside included; undefined for any other event. */
function writtenOutside(
  root: string,
  change: string | undefined,
  event: NormalisedEvent,
  base: string,
): string | undefined {
  if (event.kind !== "before-tool" || event.write === null) return undefined;
  return event.write.paths.find((path) => {
    const where = fromRoot(root, path, base);
    return where === undefined || !inHomes(where, change);
  });
}

/** The refusal of a write outside the homes before the owner's yes, or undefined. */
function writeRefusal(
  root: string,
  change: BranchChange,
  event: NormalisedEvent,
  base: string,
  setting: ProceedSetting,
): string | undefined {
  const outside = writtenOutside(root, change.id, event, base);
  if (outside === undefined) return undefined;
  const record = workingRecord(root, change.id);
  const homes = `.greenline/ledger/ and .greenline/tmp/${change.id}/`;
  if (record?.choice !== undefined) {
    const standing = standingReason(change.id, record, setting);
    return standing === undefined
      ? undefined
      : `the write to ${outside} lies outside ${homes}; ${standing}`;
  }
  const why =
    record === undefined
      ? `${recordPath(change.id)} stands nowhere yet`
      : `${recordPath(change.id)} carries no choice line`;
  return `the write to ${outside} lies outside ${homes}, and ${why}, so the owner has not said yes; propose the change and wait`;
}

/**
 * The refusal of a write outside the homes while no change is open on the
 * branch HEAD names, or undefined: a detached HEAD names no branch, and a
 * merge under way is the landing's to conclude.
 */
function noChangeRefusal(
  root: string,
  facts: BranchFacts,
  event: NormalisedEvent,
  base: string,
): string | undefined {
  const branch = facts.current;
  if (branch === undefined || !holdsNoChange(branch, facts)) return undefined;
  const outside = writtenOutside(root, undefined, event, base);
  if (outside === undefined || merging(root)) return undefined;
  return `the write to ${outside} lies outside .greenline/ledger/ and .greenline/tmp/, and ${noChangeReason(branch)}`;
}

/** The check facts and the hook-recorded runs a change's folder holds. */
interface ChecksOnDisk {
  readonly facts: readonly CheckFacts[];
  readonly runs: readonly HookRun[];
}

function checksOnDisk(root: string, id: string): ChecksOnDisk {
  const folder = join(root, checksFolder(id));
  const facts: CheckFacts[] = [];
  const runs: HookRun[] = [];
  let names: readonly string[] = [];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json"));
  } catch {
    return { facts, runs };
  }
  for (const name of names) {
    try {
      const read = parseChecksFile(readFileSync(join(folder, name), "utf8"), name);
      if (read.kind === "hook" && read.parsed._tag === "ok") runs.push(read.parsed.value);
      if (read.kind === "check" && read.parsed._tag === "ok") facts.push(read.parsed.value);
    } catch {
      // An unreadable file is status's to report; the mirror shows what reads.
    }
  }
  return { facts, runs };
}

/** The mirror's text for the workspace as it stands. */
function mirror(root: string, manifest: Manifest, change: BranchChange | undefined): string {
  const onDisk: ChecksOnDisk =
    change === undefined ? { facts: [], runs: [] } : checksOnDisk(root, change.id);
  const kinds =
    change === undefined
      ? []
      : loggedEvents(root, change.id).flatMap((line) =>
          line.kind === undefined ? [] : [line.kind],
        );
  return mirrorText({
    change:
      change === undefined ? undefined : { id: change.id, record: workingRecord(root, change.id) },
    checks: checkStandings(manifest.checks, onDisk.facts, onDisk.runs),
    declared: manifest.checks.length,
    agents: agentsCounted(kinds),
    git: gitHooksState(root, manifest.hooks),
  });
}

/** The commit and the tree of the code as it stands now. */
function codeNow(root: string): Opened {
  const commit = headCommit(root);
  const tree = workingTreeId(root);
  return {
    commit: commit.kind === "commit" ? commit.id : null,
    tree: tree.kind === "tree" ? tree.id : null,
  };
}

/** Write a matched run whole beside the change's check facts, the tree read at its start where the before-tool event recorded it. */
function recordRun(
  root: string,
  change: BranchChange,
  event: NormalisedEvent,
  check: DeclaredCheck,
  base: string,
  env: EventEnvironment,
): void {
  const started = loggedEvents(root, change.id).find(
    (line) =>
      line.kind === "before-tool" &&
      event.call !== null &&
      line.call === event.call &&
      line.opened !== undefined,
  );
  const code = started?.opened ?? codeNow(root);
  const duration = event.command?.durationMs ?? null;
  const startedAt =
    started?.at ??
    (duration === null ? event.at : new Date(Date.parse(event.at) - duration).toISOString());
  const run: HookRun = {
    schemaVersion: 1,
    source: "hook",
    harness: event.harness,
    check: check.name,
    arguments: [event.command?.text ?? check.command],
    dir: fromRoot(root, event.command?.dir ?? base, base) ?? ROOT_DIR,
    startedAt,
    commit: code.commit,
    tree: code.tree,
    treeAt: started?.opened === undefined ? "run-end" : "run-start",
    installation: lockedRevision(root),
    state: "finished",
    outcome: { kind: event.command?.outcome ?? "unknown", code: event.command?.exit ?? null },
    durationMs: duration,
  };
  const folder = join(root, checksFolder(change.id));
  mkdirSync(folder, { recursive: true });
  const name =
    env.factsFile?.(startedAt) ?? hookRunFileName(startedAt, randomBytes(3).toString("hex"));
  // A recorded run is never written over: a name already standing takes no second file.
  if (!existsSync(join(folder, name))) atomicWriteFile(join(folder, name), serializeHookRun(run));
}

/**
 * Run `greenline event`.
 * @param argv the arguments after `event`
 * @param writer greenline's own streams: the mirror to stdout, a refusal's line to stderr
 * @param env where it runs and the harness's payload
 * @returns 2 to refuse, 0 otherwise
 */
export function runEventCli(
  argv: readonly string[],
  writer: CliWriter,
  env: EventEnvironment,
): number {
  try {
    const parsed = parseEventArgs(argv);
    if ("refused" in parsed) {
      writer.stderr.write(`greenline event: ${parsed.refused}; the tool goes on\n`);
      return EXIT_ALLOW;
    }
    const at = (env.now?.() ?? new Date()).toISOString();
    // A payload that does not read leaves every field null, never guessed.
    const event = normaliseEvent({
      harness: parsed.harness,
      kind: parsed.kind,
      native: parsed.native,
      payload: parseJson(env.stdin()) ?? {},
      at,
    });
    if (event === undefined) return EXIT_ALLOW;
    const root = findGitRoot(env.cwd) ?? (event.cwd === null ? undefined : findGitRoot(event.cwd));
    if (root === undefined) return EXIT_ALLOW;
    const manifest = workspaceManifest(root);
    // No workspace, or the adapters turned off: nothing is read or written.
    if (manifest === undefined || !manifest.hooks.adapters) return EXIT_ALLOW;
    const facts = branchFacts(root);
    const change = changeOfBranch(facts.current, facts);
    const base = event.cwd ?? root;
    if (event.kind === "session-start" || event.kind === "turn-start") {
      if (change !== undefined) logEvent(root, change.id, event);
      writer.stdout.write(contextOutput(parsed.harness, event, mirror(root, manifest, change)));
      return EXIT_ALLOW;
    }
    if (change === undefined) {
      const refusal = noChangeRefusal(root, facts, event, base);
      if (refusal === undefined) return EXIT_ALLOW;
      writer.stderr.write(`greenline: refused: ${refusal}\n`);
      return EXIT_REFUSE;
    }
    const check = event.command === null ? undefined : checkOf(root, manifest.checks, event, base);
    const matched: NormalisedEvent = check === undefined ? event : { ...event, check: check.name };
    // The commit and tree a matched run starts on, for its record at the after-tool event.
    if (event.kind === "before-tool" && check !== undefined)
      logEvent(root, change.id, { ...matched, opened: codeNow(root) });
    else logEvent(root, change.id, matched);
    if (event.kind === "after-tool" && check !== undefined)
      recordRun(root, change, matched, check, base, env);
    const refusal = writeRefusal(root, change, event, base, {
      proceed: manifest.proceed,
      modes: env.modes ?? (() => undefined),
    });
    if (refusal === undefined) return EXIT_ALLOW;
    writer.stderr.write(`greenline: refused: ${refusal}\n`);
    return EXIT_REFUSE;
  } catch (error) {
    writer.stderr.write(
      `greenline event: greenline's own error, so the tool goes on: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT_ALLOW;
  }
}
