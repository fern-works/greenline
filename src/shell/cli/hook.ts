import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  changeOfBranch,
  doneVerdict,
  isGitHookName,
  messageHasText,
  noChangeVerdict,
  pushUpdates,
  pushVerdict,
  rebaseVerdict,
  refUpdates,
  rewriteVerdict,
  TRAILER_KEY,
  trailerVerdict,
  yesVerdict,
  type GitHookName,
  type HookVerdict,
  type ProceedSetting,
  type RewriteFacts,
} from "../../core/git-hooks.ts";
import type { Manifest } from "../../core/manifest.ts";
import { gitExitCode, readGit } from "../code-tree.ts";
import { addTrailer, findGitRoot } from "../git.ts";
import {
  ancestry,
  branchFacts,
  changeReader,
  committedRecord,
  currentBranch,
  declaredChecks,
  merging,
  recordedFacts,
  stagedRecord,
  stagedRecordIds,
  workingRecord,
  workspaceManifest,
} from "../hooks.ts";
import { EXIT_FAILURE, EXIT_OK, type CliWriter } from "./output.ts";

/**
 * `greenline hook <name> [<arg>...]` (`docs/SPEC.md` §4): what the scripts
 * under `.greenline/hooks/` run, with git's own arguments and stdin. It
 * reads git's facts and the change record's and exits 1 with one line
 * naming the fact to refuse, or 0 to let git go on. greenline's own error,
 * a repository with no workspace and hooks the manifest turned off all let
 * git go on, since a refusal rests only on a fact greenline could read. A
 * trailer git cannot write stops the commit with git's own words, since
 * every commit of a change carries it. In a workspace, pre-commit also
 * refuses a commit while no change is open on the branch HEAD names, and
 * reads a `standing` choice against the manifest's `proceed` (J-102 S1).
 */

/** What the hook needs beyond its arguments: where it runs and git's stdin. */
export interface HookEnvironment {
  readonly cwd: string;
  /** The hook's stdin, read whole; git writes the updates or the rewrites there. */
  readonly stdin: () => string;
  /** The modes definition's modes in order, fastest first, read only when a standing choice's mode is not the one `proceed` names; undefined when they cannot be read. */
  readonly modes?: () => readonly string[] | undefined;
}

/** The trailer values a message carries, as git reads its trailers. */
function messageTrailers(root: string, file: string): readonly string[] {
  const read = readGit(root, ["interpret-trailers", "--parse", file]);
  if (read._tag === "err") return [];
  return read.value.split("\n").flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator === -1) return [];
    const key = line.slice(0, separator).trim();
    return key.toLowerCase() === TRAILER_KEY.toLowerCase()
      ? [line.slice(separator + 1).trim()]
      : [];
  });
}

/** The ids whose staged record sets `state: done` while HEAD's does not: the commit that closes them. */
function closingChanges(root: string): readonly string[] {
  return stagedRecordIds(root).filter(
    (id) =>
      stagedRecord(root, id)?.state === "done" &&
      committedRecord(root, "HEAD", id)?.state !== "done",
  );
}

function rewriteFacts(root: string): RewriteFacts {
  return {
    changeOf: changeReader(root),
    recordOf: (id) => workingRecord(root, id) ?? committedRecord(root, "HEAD", id),
    isAncestor: ancestry(root),
    currentObject: (ref) => {
      const read = readGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return read._tag === "ok" && read.value.trim() !== "" ? read.value.trim() : undefined;
    },
  };
}

/**
 * pre-commit: no commit while no change is open on the branch HEAD names,
 * a commit that concludes a merge aside, since it is the merge's; no commit
 * on a change's branch before the owner's yes; and no done over a check that
 * is not green.
 */
function preCommit(root: string, manifest: Manifest, setting: ProceedSetting): HookVerdict {
  const facts = branchFacts(root);
  const current = facts.current;
  const change = current === undefined ? undefined : changeOfBranch(current, facts);
  if (change === undefined) {
    const none = noChangeVerdict(current, facts);
    if (none.kind === "refuse" && !merging(root)) return none;
  }
  const yes = yesVerdict(
    change,
    change === undefined ? undefined : stagedRecord(root, change.id),
    setting,
  );
  if (yes.kind === "refuse") return yes;
  const checks = declaredChecks(manifest);
  for (const id of closingChanges(root)) {
    const done = doneVerdict(id, checks, recordedFacts(root, id));
    if (done.kind === "refuse") return done;
  }
  return { kind: "allow" };
}

/** The message file's text, or undefined when it cannot be read. */
function messageText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * prepare-commit-msg and commit-msg: the change's trailer written into a
 * message that has text, and a message carrying another change's trailer
 * refused. prepare-commit-msg runs under `--no-verify` too; commit-msg
 * writes the trailer a message written in the editor still lacks.
 */
function message(root: string, name: GitHookName, file: string | undefined): HookVerdict {
  if (file === undefined) return { kind: "allow" };
  // git names the message file from the root, or whole in a linked worktree.
  const path = resolve(root, file);
  const current = currentBranch(root);
  const change = current === undefined ? undefined : changeReader(root)(current);
  if (change === undefined) return { kind: "allow" };
  const trailers = messageTrailers(root, path);
  if (name === "commit-msg") {
    const verdict = trailerVerdict(change, trailers);
    if (verdict.kind === "refuse") return verdict;
  }
  const text = messageText(path);
  // An empty message stays empty, so git's own refusal of an empty message still stands.
  // A message that carries a trailer the branch allows keeps it; a ticket's on its plan's branch among them.
  if (
    trailers.some((value) => change.trailers.includes(value)) ||
    text === undefined ||
    !messageHasText(text)
  )
    return { kind: "allow" };
  const trailer = `${TRAILER_KEY}: ${change.id}`;
  const written = addTrailer(root, path, trailer);
  // The trailer is the promise on every commit of a change, so a commit git could not give it stops here, with git's own words.
  return written._tag === "ok"
    ? { kind: "allow" }
    : {
        kind: "refuse",
        reason: `git could not write '${trailer}' into the commit message: ${written.error.message}; every commit of change ${change.id} carries it, so commit again once git can write the message file`,
      };
}

/** post-rewrite: each rewrite of the change's branch recorded in its event log, for status to show. */
function postRewrite(root: string, by: string | undefined, input: string): void {
  const current = currentBranch(root);
  const change = current === undefined ? undefined : changeReader(root)(current);
  if (change === undefined) return;
  const pairs = input.split("\n").flatMap((line) => {
    const [old, next] = line.trim().split(" ");
    return old === undefined || next === undefined || next === "" ? [] : [{ old, next }];
  });
  if (pairs.length === 0) return;
  const folder = join(root, ".greenline", "tmp", change.id);
  mkdirSync(folder, { recursive: true });
  appendFileSync(
    join(folder, "events.jsonl"),
    `${JSON.stringify({
      v: 1,
      at: new Date().toISOString(),
      harness: null,
      kind: "rewrite",
      native: "post-rewrite",
      rewrite: { by: by ?? null, branch: current ?? null, pairs },
    })}\n`,
  );
}

/** The hook's verdict, its stdin read only by the hooks that take one. */
function verdictOf(
  root: string,
  manifest: Manifest,
  name: GitHookName,
  args: readonly string[],
  env: HookEnvironment,
): HookVerdict {
  const stdin = env.stdin;
  switch (name) {
    case "pre-commit":
      return preCommit(root, manifest, {
        proceed: manifest.proceed,
        modes: env.modes ?? (() => undefined),
      });
    case "prepare-commit-msg":
    case "commit-msg":
      return message(root, name, args[0]);
    case "reference-transaction":
      return args[0] === "prepared"
        ? rewriteVerdict(refUpdates(stdin()), rewriteFacts(root))
        : { kind: "allow" };
    case "pre-rebase":
      return rebaseVerdict(args[1] ?? currentBranch(root), rewriteFacts(root));
    case "pre-push":
      return pushVerdict(pushUpdates(stdin()), {
        ...rewriteFacts(root),
        hasObject: (object) => gitExitCode(root, ["cat-file", "-e", object]) === 0,
      });
    case "post-rewrite":
      postRewrite(root, args[0], stdin());
      return { kind: "allow" };
  }
}

/**
 * Run `greenline hook`.
 * @param argv the arguments after `hook`: the hook's name, then git's arguments
 * @param writer greenline's own streams; a refusal's one line goes to stderr
 * @param env where it runs and git's stdin
 * @returns 1 to refuse, 0 to let git go on
 */
export function runHookCli(
  argv: readonly string[],
  writer: CliWriter,
  env: HookEnvironment,
): number {
  const [name, ...args] = argv;
  if (name === undefined || !isGitHookName(name)) {
    writer.stderr.write(
      `greenline hook: '${name ?? ""}' is no hook greenline installs, so git goes on\n`,
    );
    return EXIT_OK;
  }
  try {
    const root = findGitRoot(env.cwd);
    if (root === undefined) return EXIT_OK;
    const manifest = workspaceManifest(root);
    // Without a workspace's manifest, or with the hooks turned off, no fact is read.
    if (manifest === undefined || !manifest.hooks.git) return EXIT_OK;
    const verdict = verdictOf(root, manifest, name, args, env);
    if (verdict.kind === "allow") return EXIT_OK;
    writer.stderr.write(`greenline: refused: ${verdict.reason}\n`);
    return EXIT_FAILURE;
  } catch (error) {
    writer.stderr.write(
      `greenline hook ${name}: greenline's own error, so git goes on: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT_OK;
  }
}
