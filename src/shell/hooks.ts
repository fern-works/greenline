import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isChangeId } from "../core/change.ts";
import type { DeclaredCheck, ProjectFiles } from "../core/checks.ts";
import { discussionPath } from "../core/discussion.ts";
import { parseChecksFile } from "../core/facts.ts";
import {
  aloneChange,
  changeOfBranch,
  concludes,
  GIT_HOOK_NAMES,
  gitVersionOf,
  HOOKS_DIRECTORY,
  isDefaultBranch,
  manualLine,
  recordFacts,
  recordPath,
  registrationFor,
  TRAILER_KEY,
  type BranchChange,
  type BranchFacts,
  type RecordEntry,
  type RecordedFact,
  type RecordFacts,
  type Registration,
  type WorktreePlace,
} from "../core/git-hooks.ts";
import { parseLock } from "../core/lock.ts";
import { parseManifest, type HookSettings, type Manifest } from "../core/manifest.ts";
import { SHOWN_PATCH, stopCommitOwed, type ShownEdits } from "../core/mirror.ts";
import {
  FILE_ADAPTERS,
  HARNESSES,
  JSON_ADAPTERS,
  PRESENCE_MARKERS,
  SYNC_ON_WORD,
  type Harness,
  type HooksReport,
} from "../core/adapters.ts";
import type { DesiredFile } from "../core/render.ts";
import { gitExitCode, readGit } from "./code-tree.ts";
import { setLocalConfig, unsetLocalConfig } from "./git.ts";
import { onLastingPath } from "./process.ts";

/**
 * What the git hooks and `greenline event` read on the disk and from git,
 * and the hooks' registration (`workshop/components/installation-payload.md`,
 * "The git hooks"). Both run on every commit or every tool call, so nothing
 * here loads the installation: a record is read for the front-matter lines
 * the hooks need, never judged against the modes, and every git command is
 * read-only but the registration's local configuration.
 */

const LEDGER = ".greenline/ledger";
const MANAGED_GUIDE = "README.md";

/**
 * The branch HEAD names, undefined when it is detached or git cannot say.
 * @param root the repository root
 * @returns the branch's short name
 */
export function currentBranch(root: string): string | undefined {
  const read = readGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (read._tag === "err") return undefined;
  const branch = read.value.trim();
  return branch === "" ? undefined : branch;
}

/**
 * Whether a merge is under way: git's `MERGE_HEAD` stands, as it does while
 * a commit concludes a merge that stopped on a conflict, the landing's
 * merge among them.
 * @param root the repository root
 * @returns true while git holds a merge to conclude
 */
export function merging(root: string): boolean {
  return gitExitCode(root, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]) === 0;
}

/**
 * The records the working tree holds, each with its lines, sorted by id.
 * @param root the repository root
 * @returns the records; none when the ledger is absent or unreadable
 */
function workingRecords(root: string): readonly RecordEntry[] {
  let names: readonly string[];
  try {
    names = readdirSync(join(root, LEDGER)).filter(
      (name) => name.endsWith(".md") && name !== MANAGED_GUIDE,
    );
  } catch {
    return [];
  }
  return names
    .map((name) => name.slice(0, -".md".length))
    .filter((id) => isChangeId(id))
    .sort()
    .flatMap((id) => {
      const facts = workingRecord(root, id);
      return facts === undefined ? [] : [{ id, facts }];
    });
}

/**
 * The repository's default branch, as its remote's HEAD or git's
 * `init.defaultBranch` names it; undefined when nothing names one.
 * @param root the repository root
 * @returns the branch's short name
 */
export function defaultBranch(root: string): string | undefined {
  const remote = readGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remote._tag === "ok" && remote.value.trim().startsWith("origin/"))
    return remote.value.trim().slice("origin/".length);
  const configured = readGit(root, ["config", "--get", "init.defaultBranch"]);
  return configured._tag === "ok" && configured.value.trim() !== ""
    ? configured.value.trim()
    : undefined;
}

/**
 * Whether the repository names a remote, read from its configuration alone,
 * never by contacting one. Where git cannot say, it is taken as having one,
 * so the default branch is held for no change on a fact git did not give.
 * @param root the repository root
 * @returns true when `git remote` lists one, or git cannot say
 */
function hasRemote(root: string): boolean {
  const read = readGit(root, ["remote"]);
  return read._tag === "err" || read.value.trim() !== "";
}

/**
 * The records as the index carries them (J-135 S1): each record's staged
 * version where the index holds one apart from the working tree's, and the
 * working tree's otherwise, so a working copy set apart from the index
 * changes no verdict of the commit's hooks.
 * @param root the repository root
 * @returns the records, sorted by id; none when the ledger is absent or unreadable
 */
function indexedRecords(root: string): readonly RecordEntry[] {
  const working = workingRecords(root);
  // The paths whose working copy differs from the index's, a deleted one included.
  const differing = readGit(root, ["diff", "--name-only", "--no-renames", "-z", "--", LEDGER]);
  // The records the index deletes, which the commit carries as absent whatever the working tree holds.
  const deleted = readGit(root, [
    "diff",
    "--cached",
    "--name-only",
    "--no-renames",
    "--diff-filter=D",
    "-z",
    "--",
    LEDGER,
  ]);
  if (differing._tag === "err" || deleted._tag === "err") return working;
  const apart = recordIdsOf(differing.value);
  const gone = recordIdsOf(deleted.value);
  if (apart.size === 0 && gone.size === 0) return working;
  const ids = [...new Set([...working.map((entry) => entry.id), ...apart])]
    .filter((id) => !gone.has(id))
    .sort();
  return ids.flatMap((id) => {
    const facts = apart.has(id)
      ? stagedRecord(root, id)
      : working.find((entry) => entry.id === id)?.facts;
    return facts === undefined ? [] : [{ id, facts }];
  });
}

/** The change ids whose records a NUL-separated list of paths names. */
function recordIdsOf(listed: string): ReadonlySet<string> {
  return new Set(
    listed
      .split("\0")
      .flatMap((path) => /^\.greenline\/ledger\/([^/]+)\.md$/.exec(path)?.[1] ?? [])
      .filter((id) => isChangeId(id)),
  );
}

/**
 * The changes the commit being made concludes ({@link concludes}), as the
 * commit's own hooks read it: a record the commit stages with its folder
 * alone, in every state (J-139 S1), or one it stages `done` or `stopped`
 * beside other paths that HEAD does not hold `done`, a stopped record's
 * amendment aside, so the commit that closes or stops a change, and the
 * record's own commit after it, is that change's (J-135 S1).
 * Every other reader keeps the narrower fact it read before: a record HEAD
 * holds open that the index no longer holds open.
 * @param root the repository root
 * @param reader the commit's own hooks, or any other reader
 * @returns their ids, sorted; none when git cannot say
 */
function finishingChanges(root: string, reader: "commit" | "other"): readonly string[] {
  const ids = stagedRecordIds(root);
  if (reader === "other")
    return ids.filter(
      (id) =>
        committedRecord(root, "HEAD", id)?.state === "open" &&
        stagedRecord(root, id)?.state !== "open",
    );
  const paths = ids.length === 0 ? [] : stagedPaths(root);
  return ids.filter((id) =>
    concludes(
      committedRecord(root, "HEAD", id),
      stagedRecord(root, id),
      paths.every((path) => path === recordPath(id) || path.startsWith(`${LEDGER}/${id}/`)),
    ),
  );
}

/**
 * The change records a commit holds `open` or `stopped` (J-139 S1): what a
 * push of that commit to the default branch would land unfinished.
 * @param root the repository root
 * @param object the commit
 * @returns each record's id and state, sorted by id; none when git cannot say
 */
export function unfinishedRecordsAt(
  root: string,
  object: string,
): readonly { readonly id: string; readonly state: string }[] {
  const listed = readGit(root, ["ls-tree", "-z", "--name-only", object, "--", `${LEDGER}/`]);
  if (listed._tag === "err") return [];
  return [...recordIdsOf(listed.value)].sort().flatMap((id) => {
    const state = committedRecord(root, object, id)?.state;
    return state === "open" || state === "stopped" ? [{ id, state }] : [];
  });
}

/**
 * The change a commit pushed from a branch other than the default one
 * carries, read from the commit's records (J-139 S1): the one change
 * record the branch's commits since the default branch touched that the
 * commit holds `open`, `stopped` or `done`, so a done change's landing push
 * from a branch the proposal named finds its record. None where the
 * repository has no remote, HEAD names the default branch, no default
 * branch is found, or the commits touched none or several such records.
 * @param root the repository root
 * @param object the commit pushed
 * @returns the change's id, or undefined
 */
export function pushedChange(root: string, object: string): string | undefined {
  if (!hasRemote(root)) return undefined;
  const named = defaultBranch(root);
  const current = currentBranch(root);
  if (current !== undefined && isDefaultBranch(current, named)) return undefined;
  const base = (named === undefined ? ["main", "master"] : [named])
    .flatMap((branch) => [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`])
    .find((ref) => gitExitCode(root, ["rev-parse", "--verify", "--quiet", ref]) === 0);
  if (base === undefined) return undefined;
  const touched = readGit(root, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    `${base}...${object}`,
    "--",
    `${LEDGER}/`,
  ]);
  if (touched._tag === "err") return undefined;
  const held = [...recordIdsOf(touched.value)].filter((id) => {
    const state = committedRecord(root, object, id)?.state;
    return state === "open" || state === "stopped" || state === "done";
  });
  return held.length === 1 ? held[0] : undefined;
}

/**
 * The change records the index holds changed from HEAD, added, modified or renamed.
 * @param root the repository root
 * @returns their ids, sorted; none when git cannot say
 */
export function stagedRecordIds(root: string): readonly string[] {
  const staged = readGit(root, [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=AMR",
    "--",
    LEDGER,
  ]);
  if (staged._tag === "err") return [];
  return staged.value
    .split("\n")
    .flatMap((path) => /^\.greenline\/ledger\/([^/]+)\.md$/.exec(path.trim())?.[1] ?? [])
    .filter((id) => isChangeId(id))
    .sort();
}

/**
 * The paths the index holds changed from HEAD, added, modified, deleted or
 * renamed, a rename's old path and its new one both, from the root (J-118
 * S1): what tells a discussion's commit apart.
 * @param root the repository root
 * @returns the paths, sorted; none when git cannot say
 */
export function stagedPaths(root: string): readonly string[] {
  const staged = readGit(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"]);
  if (staged._tag === "err") return [];
  return staged.value
    .split("\0")
    .filter((path) => path !== "")
    .sort();
}

/**
 * A discussion record's text as the commit stages it.
 * @param root the repository root
 * @param id the discussion
 * @returns the text, or undefined when the index holds none
 */
export function stagedDiscussion(root: string, id: string): string | undefined {
  const staged = readGit(root, ["show", `:${discussionPath(id)}`]);
  return staged._tag === "ok" ? staged.value : undefined;
}

/**
 * A discussion record's text as a commit holds it.
 * @param root the repository root
 * @param commit the commit
 * @param id the discussion
 * @returns the text, or undefined when the commit holds none
 */
export function committedDiscussion(root: string, commit: string, id: string): string | undefined {
  const read = readGit(root, ["show", `${commit}:${discussionPath(id)}`]);
  return read._tag === "ok" ? read.value : undefined;
}

/** A path with its links resolved, or as given where it stands nowhere. */
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * The linked worktree a root is, read from git (J-193 S1): its own root and
 * the main checkout's, where its git directory is not the one every
 * worktree shares; undefined in the main checkout, a bare or a submodule's
 * own git directory, and where git cannot say.
 * @param root the repository root
 * @returns the worktree's place, or undefined
 */
function worktreePlace(root: string): WorktreePlace | undefined {
  const read = readGit(root, [
    "rev-parse",
    "--path-format=absolute",
    "--git-dir",
    "--git-common-dir",
  ]);
  if (read._tag === "err") return undefined;
  const [own, common] = read.value.split("\n").map((line) => line.trim());
  if (own === undefined || common === undefined || own === "" || common === "") return undefined;
  if (realPath(own) === realPath(common) || basename(common) !== ".git") return undefined;
  return { roots: [...new Set([realPath(root), resolve(root)])], main: realPath(dirname(common)) };
}

/**
 * The linked worktree's place and the change trailers HEAD's commit
 * carries, which the ground line's reading takes (J-193 S1); nothing in the
 * main checkout, where no git command beyond one is run.
 */
function groundFacts(root: string): Pick<BranchFacts, "worktree" | "tip"> {
  const worktree = worktreePlace(root);
  if (worktree === undefined) return {};
  const carried = readGit(root, [
    "log",
    "-1",
    `--format=%(trailers:key=${TRAILER_KEY},valueonly)`,
    "HEAD",
  ]);
  const tip =
    carried._tag === "err"
      ? []
      : carried.value
          .split("\n")
          .map((value) => value.trim())
          .filter((value) => isChangeId(value));
  return { worktree, tip };
}

/**
 * What decides the change of a branch, read from the repository as it stands.
 * @param root the repository root
 * @returns the branch HEAD names, the default branch, whether a remote exists, the working tree's records and the changes the commit being made concludes
 */
export function branchFacts(root: string): BranchFacts {
  return factsOver(root, workingRecords(root), "other");
}

/** The branch's facts over the records given, the working tree's or the index's, for the reader given. */
function factsOver(
  root: string,
  records: readonly RecordEntry[],
  reader: "commit" | "other",
): BranchFacts {
  return {
    current: currentBranch(root),
    defaultBranch: defaultBranch(root),
    hasRemote: hasRemote(root),
    records,
    // Only a record the facts no longer hold open can be one a commit concludes.
    finishing: records.every((entry) => entry.facts.state === "open")
      ? []
      : finishingChanges(root, reader),
    ...groundFacts(root),
  };
}

/**
 * The records HEAD's commit holds, each with its lines, sorted by id: what
 * the harness hook's guardrails read the change and its state from, so a
 * record whose state the working tree alone moves lifts nothing (J-144 S4).
 * @param root the repository root
 * @returns the records; none where HEAD holds none or git cannot say
 */
function headRecords(root: string): readonly RecordEntry[] {
  const listed = readGit(root, ["ls-tree", "-z", "--name-only", "HEAD", "--", `${LEDGER}/`]);
  if (listed._tag === "err") return [];
  return [...recordIdsOf(listed.value)].sort().flatMap((id) => {
    const facts = committedRecord(root, "HEAD", id);
    return facts === undefined ? [] : [{ id, facts }];
  });
}

/**
 * The branch's facts over the records as HEAD's commit holds them (J-144
 * S4): the change the guardrails judge an act under and the state it
 * stands in are the committed record's, never the working tree's.
 * @param root the repository root
 * @returns the branch's facts, no commit being made
 */
export function committedFacts(root: string): BranchFacts {
  return {
    current: currentBranch(root),
    defaultBranch: defaultBranch(root),
    hasRemote: hasRemote(root),
    records: headRecords(root),
    finishing: [],
    ...groundFacts(root),
  };
}

/**
 * What decides the change of the commit being made, read by the commit's
 * own hooks alone, pre-commit, prepare-commit-msg and commit-msg: the
 * branch's facts over the records as the index carries them (J-135 S1),
 * with the change whose local landing's merge HEAD is (J-130 S1) and the
 * change whose record and folder alone the commit stages (J-143 S1). Every
 * other reader, the harness's guards, a push's hook, status and the mirror,
 * takes {@link branchFacts}, the working tree's, so the landing's last
 * commit lifts nothing but itself.
 * @param root the repository root
 * @returns the branch's facts and the landed change, if any
 */
export function commitFacts(root: string): BranchFacts {
  return {
    ...factsOver(root, indexedRecords(root), "commit"),
    landed: landedChange(root),
    alone: aloneChange(stagedPaths(root)),
  };
}

/**
 * The change whose local landing's merge HEAD is, while the index stages
 * only that change's record and folder (J-130 S1): HEAD a merge commit, a
 * second parent standing, whose message carries one change's trailer and no
 * other. The commit being made then records the merge's checks, the
 * change's last on the base branch, and is that change's.
 * @param root the repository root
 * @returns the change's id, or undefined
 */
function landedChange(root: string): string | undefined {
  if (gitExitCode(root, ["rev-parse", "--verify", "--quiet", "HEAD^2"]) !== 0) return undefined;
  const carried = readGit(root, [
    "log",
    "-1",
    `--format=%(trailers:key=${TRAILER_KEY},valueonly)`,
    "HEAD",
  ]);
  if (carried._tag === "err") return undefined;
  const ids = [
    ...new Set(
      carried.value
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value !== ""),
    ),
  ];
  const [id, ...others] = ids;
  if (id === undefined || others.length > 0 || !isChangeId(id)) return undefined;
  const paths = stagedPaths(root);
  const record = recordPath(id);
  const folder = `${LEDGER}/${id}/`;
  return paths.length > 0 && paths.every((path) => path === record || path.startsWith(folder))
    ? id
    : undefined;
}

/**
 * Whether a change's record stands `done` or `dropped` in the working tree:
 * its working folder is the tidy's to remove, so no hook writes an event
 * there after it (J-143 S2). A record not yet written is still to open.
 * @param root the repository root
 * @param id the change
 * @returns true for a finished change
 */
export function recordFinished(root: string, id: string): boolean {
  const state = workingRecord(root, id)?.state;
  return state === "done" || state === "dropped";
}

/** A record's two texts, the working tree's and HEAD's commit's, each undefined where it stands nowhere. */
export interface RecordTexts {
  readonly working: string | undefined;
  readonly head: string | undefined;
}

/**
 * A record's text as the working tree holds it, and as HEAD's commit holds
 * it (J-208 S1): what the harness hook reads a record with status's parser
 * from before a `git commit`, a record HEAD already holds as it stands
 * being no commit's to refuse.
 * @param root the repository root
 * @param id the change
 * @returns the working tree's text and HEAD's, each undefined where it stands nowhere
 */
export function recordTexts(root: string, id: string): RecordTexts {
  let working: string | undefined;
  try {
    working = readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    working = undefined;
  }
  const head = readGit(root, ["show", `HEAD:${recordPath(id)}`]);
  return { working, head: head._tag === "ok" ? head.value : undefined };
}

/** A record's lines as the working tree holds it; undefined when it stands nowhere there. */
export function workingRecord(root: string, id: string): RecordFacts | undefined {
  try {
    return recordFacts(readFileSync(join(root, recordPath(id)), "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * A record's lines as a commit would carry them: its staged version when the
 * index holds it, else the working tree's.
 * @param root the repository root
 * @param id the change
 * @returns the lines, or undefined when it stands nowhere
 */
export function stagedRecord(root: string, id: string): RecordFacts | undefined {
  const staged = readGit(root, ["show", `:${recordPath(id)}`]);
  return staged._tag === "ok" ? recordFacts(staged.value) : workingRecord(root, id);
}

/**
 * A record's text as a commit would carry it: its staged version when the
 * index holds it, else the working tree's (J-149 S1).
 * @param root the repository root
 * @param id the change
 * @returns the text, or undefined when it stands nowhere
 */
export function stagedRecordText(root: string, id: string): string | undefined {
  const staged = readGit(root, ["show", `:${recordPath(id)}`]);
  if (staged._tag === "ok") return staged.value;
  try {
    return readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    return undefined;
  }
}

/** The plans' folder, from the root. */
const PLANS = ".greenline/plans";

/**
 * The one change whose record stands `stopped` in the working tree and in
 * HEAD's commit (J-149 S3): the change a resume on a branch that names no
 * change of its own reopens, as on a default branch with no remote. None
 * where no record or several stand so, since a write then names no one
 * change.
 * @param root the repository root
 * @returns the change's id, or undefined
 */
export function stoppedHere(root: string): string | undefined {
  const stopped = workingRecords(root).filter(
    (entry) =>
      entry.facts.state === "stopped" &&
      committedRecord(root, "HEAD", entry.id)?.state === "stopped",
  );
  return stopped.length === 1 ? stopped[0]?.id : undefined;
}

/**
 * The changes whose records read stopped in the working tree while no
 * commit holds the stop (J-210 S1, `stopCommitOwed`): the record untracked,
 * or HEAD's commit holding it in another state or on another stopped line.
 * @param root the repository root
 * @param ids the changes to read, every record the working tree holds where none are given
 * @returns the ids, sorted
 */
export function stopsUncommitted(root: string, ids?: readonly string[]): readonly string[] {
  const entries =
    ids === undefined
      ? workingRecords(root)
      : ids.flatMap((id) => {
          const facts = workingRecord(root, id);
          return facts === undefined ? [] : [{ id, facts }];
        });
  return entries
    .filter((entry) => stopCommitOwed(entry.facts, committedRecord(root, "HEAD", entry.id)))
    .map((entry) => entry.id)
    .sort();
}

/**
 * The uncommitted edits outside `.greenline/` the working tree holds beside
 * a change's record (J-214 S1, the run j196t-states-stop-2d F2, whose stop
 * left the shown test file uncommitted and the clone without it): every
 * tracked file git reports changed, staged or not, and each untracked file
 * whose path the record's text names, so a scratch file the record never
 * names stays out. Read-only.
 * @param root the repository root
 * @param id the change
 * @returns the paths from the root, each list sorted, empty where git cannot say
 */
function uncommittedEdits(root: string, id: string): ShownEdits {
  // No optional lock: a hook's read never refreshes the index under the agent's own git.
  const read = readGit(root, [
    "--no-optional-locks",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (read._tag === "err") return { tracked: [], untracked: [] };
  let text = "";
  try {
    text = readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    text = "";
  }
  const tracked: string[] = [];
  const untracked: string[] = [];
  const fields = read.value.split("\0");
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? "";
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    const path = field.slice(3);
    // A rename or a copy names its source in the next field, which no edit of its own is.
    if (code.includes("R") || code.includes("C")) index += 1;
    if (path.startsWith(".greenline/")) continue;
    if (code === "??") {
      if (text.includes(path)) untracked.push(path);
    } else tracked.push(path);
  }
  return { tracked: tracked.sort(), untracked: untracked.sort() };
}

/**
 * The shown patch a change's folder holds while the working tree lacks the
 * edits it keeps (J-214 S1): the folder's `shown.patch` stands and the tree
 * holds none of the edits `uncommittedEdits` reads, as a clone of the stop's
 * commit stands, so the waiting line names it to apply before the wait's
 * act; in the checkout that stopped, whose tree still holds the edits, and
 * once the patch is applied, none is owed.
 * @param root the repository root
 * @param id the change
 * @returns the patch's path from the root, or undefined where none is owed
 */
export function shownPatchOwed(root: string, id: string): string | undefined {
  const path = `${LEDGER}/${id}/${SHOWN_PATCH}`;
  if (!existsSync(join(root, path))) return undefined;
  const edits = uncommittedEdits(root, id);
  return edits.tracked.length + edits.untracked.length === 0 ? path : undefined;
}

/**
 * The uncommitted edits a stop keeps as the folder's shown patch (J-214
 * S1): none where the folder already holds the patch.
 * @param root the repository root
 * @param id the change
 * @returns the edits, or undefined where the folder holds the patch
 */
export function editsToKeep(root: string, id: string): ShownEdits | undefined {
  return existsSync(join(root, LEDGER, id, SHOWN_PATCH)) ? undefined : uncommittedEdits(root, id);
}

/**
 * The plan files and planning records a commit leaves with edits outside
 * it (J-149 S3): for a record that names its plan, each path under that
 * plan's `.greenline/plans/<plan>/` the working tree holds changed or new
 * beside the index, and the planning change's record so changed, the
 * record of that plan that names no ticket; none for a record that names
 * no plan.
 * @param root the repository root
 * @param plan the plan the closing record names, undefined where it names none
 * @returns the paths, from the root, sorted
 */
export function planEdits(root: string, plan: string | undefined): readonly string[] {
  // Only the plan the closing record names is its own; another change's plan edits are that change's.
  if (plan === undefined || !/^[\w.-]+$/.test(plan)) return [];
  const planning = workingRecords(root)
    .filter((entry) => entry.facts.plan === plan && entry.facts.ticket === undefined)
    .map((entry) => recordPath(entry.id));
  const read = readGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    `${PLANS}/${plan}`,
    ...planning,
  ]);
  if (read._tag === "err") return [];
  const entries = read.value.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? "";
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    // A rename names its source after it, which is no edit of its own.
    if (code.startsWith("R") || code.startsWith("C")) index += 1;
    // An edit the index holds goes with the commit; one the working tree holds beside it does not.
    if (code === "??" || (code[1] !== " " && code[1] !== undefined)) paths.push(entry.slice(3));
  }
  return [...new Set(paths)].sort();
}

/**
 * A record's lines as a commit holds it.
 * @param root the repository root
 * @param commit the commit
 * @param id the change
 * @returns the lines, or undefined when the commit holds no record of it
 */
export function committedRecord(root: string, commit: string, id: string): RecordFacts | undefined {
  const read = readGit(root, ["show", `${commit}:${recordPath(id)}`]);
  return read._tag === "ok" ? recordFacts(read.value) : undefined;
}

/**
 * A record's lines as they lift an act (J-129 S4, "Committed before the
 * act"): the record committed at HEAD, with each owner-words line its
 * change's branch tip holds where HEAD's lacks it, never the working tree's.
 * @param root the repository root
 * @param id the change
 * @returns the lines, or undefined where no commit holds the record
 */
export function liftingRecord(root: string, id: string): RecordFacts | undefined {
  const head = committedRecord(root, "HEAD", id);
  const tip = committedRecord(root, `refs/heads/greenline/${id}`, id);
  if (head === undefined || tip === undefined) return head ?? tip;
  return {
    ...head,
    discard: head.discard ?? tip.discard,
    rebase: head.rebase ?? tip.rebase,
    landing: head.landing ?? tip.landing,
  };
}

/**
 * The change a branch belongs to, read from the repository as it stands.
 * @param root the repository root
 * @returns a reader from a branch to its change
 */
export function changeReader(root: string): (branch: string) => BranchChange | undefined {
  const facts = branchFacts(root);
  return (branch) => changeOfBranch(branch, facts);
}

/**
 * The change a branch belongs to for the commit being made, the landing's
 * last commit included ({@link commitFacts}); read by the message hooks alone.
 * @param root the repository root
 * @returns a reader of the change of each branch
 */
export function commitChangeReader(root: string): (branch: string) => BranchChange | undefined {
  const facts = commitFacts(root);
  return (branch) => changeOfBranch(branch, facts);
}

/**
 * Whether git holds the first commit as an ancestor of the second.
 * @param root the repository root
 * @returns a reader that answers true, false, or undefined when git cannot say
 */
export function ancestry(root: string): (old: string, next: string) => boolean | undefined {
  return (old, next) => {
    const code = gitExitCode(root, ["merge-base", "--is-ancestor", old, next]);
    return code === 0 ? true : code === 1 ? false : undefined;
  };
}

/**
 * The workspace's manifest, read without the installation; undefined when
 * there is none or it does not read, so a hook that needs it lets git go on.
 * @param root the repository root
 * @returns the manifest
 */
export function workspaceManifest(root: string): Manifest | undefined {
  try {
    const parsed = parseManifest(
      readFileSync(join(root, ".greenline", "manifest.json"), "utf8"),
      ".greenline/manifest.json",
    );
    return parsed._tag === "ok" ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The installation's revision the lock names, which a hook-recorded run carries.
 * @param root the repository root
 * @returns the revision, or null when the lock cannot be read
 */
export function lockedRevision(root: string): string | null {
  try {
    const lock = parseLock(
      readFileSync(join(root, ".greenline", "lock.json"), "utf8"),
      ".greenline/lock.json",
    );
    return lock._tag === "ok" ? lock.value.installationRevision : null;
  } catch {
    return null;
  }
}

/** A change's `checks/` folder from the root. */
export function checksFolder(id: string): string {
  return `${LEDGER}/${id}/checks`;
}

/**
 * The facts `greenline check` recorded for a change, each with its file;
 * a hook-recorded run and a file that does not parse are left out, since
 * neither is a run `check` vouches for.
 * @param root the repository root
 * @param id the change
 * @returns the facts
 */
export function recordedFacts(root: string, id: string): readonly RecordedFact[] {
  const folder = join(root, checksFolder(id));
  let names: readonly string[];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      const read = parseChecksFile(readFileSync(join(folder, name), "utf8"), name);
      return read.kind === "check" && read.parsed._tag === "ok"
        ? [{ file: `checks/${name}`, facts: read.parsed.value }]
        : [];
    } catch {
      return [];
    }
  });
}

/** The keys of greenline's config-based registration of one hook. */
interface ConfigKeys {
  readonly event: string;
  readonly command: string;
}

function configKeys(name: string): ConfigKeys {
  return { event: `hook.greenline-${name}.event`, command: `hook.greenline-${name}.command` };
}

/**
 * The hooks' directory by an absolute path, in the main checkout: the
 * local configuration is shared by every worktree, and git runs a hook at
 * the top of the worktree it fires in, where a relative path names a
 * directory a branch from before the install does not hold, so `git
 * worktree add` failed on it (J-148 S4).
 * @param root the repository root, the main checkout's or a linked worktree's
 * @returns the directory's absolute path
 */
function hooksDirectoryOf(root: string): string {
  const common = readGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const dir = common._tag === "ok" ? common.value.trim() : "";
  const main = dir !== "" && basename(dir) === ".git" ? dirname(dir) : root;
  return join(main, HOOKS_DIRECTORY);
}

/** A path quoted for sh, so a space or a quote in it stays one word. */
function shellQuoted(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/**
 * The command a config-based hook runs: the script through sh, so its file
 * mode never matters, by its absolute path; where the script stands nowhere,
 * as after the repository moved, git goes on and `status` names the hooks
 * absent until sync registers them again, as when greenline is not on the
 * `PATH`.
 */
function configCommand(root: string, name: string): string {
  const script = shellQuoted(join(hooksDirectoryOf(root), name));
  return `test -f ${script} || exit 0; sh ${script}`;
}

/** Whether `core.hooksPath` names greenline's directory, by the path a registration writes or the one it once wrote. */
function greenlinePath(root: string, value: string | undefined): boolean {
  return value === hooksDirectoryOf(root) || value === HOOKS_DIRECTORY;
}

function configValue(root: string, key: string): string | undefined {
  const read = readGit(root, ["config", "--local", "--get", key]);
  if (read._tag === "err") return undefined;
  const value = read.value.trim();
  return value === "" ? undefined : value;
}

/**
 * The hooks in the repository's hook directory that are not git's samples,
 * the owner's or a manager's.
 * @param root the repository root
 * @returns their names, sorted
 */
function ownerHooks(root: string): readonly string[] {
  const read = readGit(root, ["rev-parse", "--git-path", "hooks"]);
  if (read._tag === "err") return [];
  // git gives the path from the root, or whole in a linked worktree.
  const directory = resolve(root, read.value.trim());
  try {
    return readdirSync(directory)
      .filter((name) => !name.endsWith(".sample") && statSync(join(directory, name)).isFile())
      .sort();
  } catch {
    return [];
  }
}

/**
 * The registration this repository's git calls for.
 * @param root the repository root
 * @returns the registration, read from git's version, `core.hooksPath` and the hook directory
 */
function registrationHere(root: string): Registration {
  const version = readGit(root, ["--version"]);
  const hooksPath = configValue(root, "core.hooksPath");
  return registrationFor(
    version._tag === "ok" ? gitVersionOf(version.value) : undefined,
    // greenline's own path, the absolute one or the relative one it once wrote, is its registration to refresh.
    greenlinePath(root, hooksPath) ? HOOKS_DIRECTORY : hooksPath,
    ownerHooks(root),
  );
}

/**
 * How the git hooks stand in this repository: registered as config-based
 * hooks, through `core.hooksPath`, absent, or off by the manifest's setting.
 * Given the environment greenline runs with, a registration also says when
 * greenline is not on the `PATH` the hooks run under, where every hook lets
 * git go on without reading a fact (J-98 S1).
 * @param root the repository root
 * @param settings the manifest's hooks settings
 * @param environment the environment whose `PATH` is read; left out, the `PATH` is not read
 * @returns the state, with the line to add when they are absent
 */
export function gitHooksState(
  root: string,
  settings: HookSettings,
  environment?: NodeJS.ProcessEnv,
): HooksReport["git"] {
  if (!settings.git) return { state: "off" };
  const missing =
    environment !== undefined && !onLastingPath("greenline", environment)
      ? { greenline: "missing" as const }
      : {};
  const registered = GIT_HOOK_NAMES.every(
    (name) => configValue(root, configKeys(name).command) === configCommand(root, name),
  );
  if (registered) return { state: "config", ...missing };
  if (configValue(root, "core.hooksPath") === hooksDirectoryOf(root))
    return { state: "hooks-path", ...missing };
  const registration = registrationHere(root);
  return {
    state: "absent",
    reason:
      registration.kind === "manual"
        ? registration.reason
        : `they are not registered in this clone's local configuration; ${SYNC_ON_WORD}`,
    line: manualLine(),
  };
}

/**
 * Whether the checkout's git configuration registers none of greenline's
 * hooks where nothing else holds them (J-193 S1): the hooks are on in the
 * manifest, neither the config-based registration nor greenline's
 * `core.hooksPath` stands, and the registration git calls for here is one
 * sync makes, a clone before its first sync above all. A registration the
 * owner's hooks or a manager's leave to a manual line is named by the hooks'
 * own line instead.
 * @param root the repository root
 * @param settings the manifest's hooks settings
 * @returns true where `greenline sync` would install them
 */
export function hooksNotInstalled(root: string, settings: HookSettings): boolean {
  const state = gitHooksState(root, settings);
  return state.state === "absent" && registrationHere(root).kind !== "manual";
}

/**
 * The branch HEAD names and the default branch, where the branch predates
 * the practice (J-193 S1): the checkout holds no manifest, HEAD is not the
 * default branch, and the default branch, local or the remote's, holds
 * `.greenline/manifest.json` in its commit. Undefined elsewhere, a
 * repository that never held the install among them.
 * @param root the repository root
 * @returns the branch, `HEAD` when detached, and the default branch
 */
export function predatingBranch(
  root: string,
): { readonly branch: string; readonly base: string } | undefined {
  if (existsSync(join(root, ".greenline", "manifest.json"))) return undefined;
  const current = currentBranch(root);
  for (const base of baseCandidates(root)) {
    if (current === base) return undefined;
    if (baseHoldsManifest(root, base)) return { branch: current ?? "HEAD", base };
  }
  return undefined;
}

/** The default branch as git names it, else `main` and `master`, the names a base is looked for under. */
function baseCandidates(root: string): readonly string[] {
  const named = defaultBranch(root);
  return named === undefined ? ["main", "master"] : [named];
}

/** Whether a base's commit, local or the remote's, holds `.greenline/manifest.json`. */
function baseHoldsManifest(root: string, base: string): boolean {
  return [`refs/heads/${base}`, `refs/remotes/origin/${base}`].some(
    (ref) => holdsManifest(root, ref) === true,
  );
}

/**
 * Whether a ref's commit holds `.greenline/manifest.json`, by one
 * read-only `git cat-file -e`.
 * @param root the repository root
 * @param ref the ref, such as `refs/heads/main`
 * @returns true where it does, false where it does not, undefined where git could not run
 */
export function holdsManifest(root: string, ref: string): boolean | undefined {
  const code = gitExitCode(root, ["cat-file", "-e", `${ref}:.greenline/manifest.json`]);
  return code === undefined ? undefined : code === 0;
}

/**
 * The default branch that holds the install (J-213 S1): the first base
 * {@link predatingBranch} looks for whose commit, local or the remote's,
 * holds `.greenline/manifest.json`; undefined where none does.
 * @param root the repository root
 * @returns the base's short name
 */
export function practiceBase(root: string): string | undefined {
  return baseCandidates(root).find((base) => baseHoldsManifest(root, base));
}

/**
 * Register the git hooks, or take greenline's registration out when the
 * manifest turns them off: config-based hooks on git 2.54 or later, which
 * also lets go of a `core.hooksPath` greenline set before; `core.hooksPath`
 * on an older git where nothing else holds the hooks, which runs the scripts
 * directly, the projection having written them executable; nothing where the
 * owner's hooks or a manager's stand. The local configuration is the one git write here, and
 * it reaches no remote.
 * @param root the repository root
 * @param settings the manifest's hooks settings
 * @returns the state afterwards, or why a write failed
 */
export function registerGitHooks(root: string, settings: HookSettings): HooksReport["git"] {
  const failed = (message: string): HooksReport["git"] => ({
    state: "absent",
    reason: `git could not record the registration: ${message}`,
    line: manualLine(),
  });
  if (!settings.git) {
    for (const name of GIT_HOOK_NAMES)
      for (const key of Object.values(configKeys(name))) {
        const removed = unsetLocalConfig(root, key);
        if (removed._tag === "err") return failed(removed.error.message);
      }
    if (greenlinePath(root, configValue(root, "core.hooksPath"))) {
      const removed = unsetLocalConfig(root, "core.hooksPath");
      if (removed._tag === "err") return failed(removed.error.message);
    }
    return { state: "off" };
  }
  const registration = registrationHere(root);
  if (registration.kind === "manual")
    return { state: "absent", reason: registration.reason, line: manualLine() };
  if (registration.kind === "config") {
    // Both ways at once would run each hook twice: the configured one and the hookdir's.
    if (greenlinePath(root, configValue(root, "core.hooksPath"))) {
      const removed = unsetLocalConfig(root, "core.hooksPath");
      if (removed._tag === "err") return failed(removed.error.message);
    }
    for (const name of GIT_HOOK_NAMES) {
      const keys = configKeys(name);
      if (configValue(root, keys.event) !== name) {
        const set = setLocalConfig(root, keys.event, name);
        if (set._tag === "err") return failed(set.error.message);
      }
      if (configValue(root, keys.command) !== configCommand(root, name)) {
        const set = setLocalConfig(root, keys.command, configCommand(root, name));
        if (set._tag === "err") return failed(set.error.message);
      }
    }
    return { state: "config" };
  }
  if (configValue(root, "core.hooksPath") !== hooksDirectoryOf(root)) {
    const set = setLocalConfig(root, "core.hooksPath", hooksDirectoryOf(root));
    if (set._tag === "err") return failed(set.error.message);
  }
  return { state: "hooks-path" };
}

/**
 * The harnesses the repository shows besides the installation's targets, by
 * the files their configuration keeps at the root.
 * @param root the repository root
 * @returns the harnesses found
 */
export function presentHarnesses(root: string): ReadonlySet<Harness> {
  return new Set(
    HARNESSES.filter((harness) =>
      PRESENCE_MARKERS[harness].some((marker) => existsSync(join(root, marker))),
    ),
  );
}

/**
 * The project files `init` reads for its proposal of the checks.
 * @param root the repository root
 * @returns each file's text where it stands, and the lock files at the root
 */
export function projectFiles(root: string): ProjectFiles {
  const text = (name: string): string | undefined => {
    try {
      return readFileSync(join(root, name), "utf8");
    } catch {
      return undefined;
    }
  };
  return {
    packageJson: text("package.json"),
    makefile: text("Makefile"),
    cargoToml: text("Cargo.toml"),
    pyprojectToml: text("pyproject.toml"),
    goMod: text("go.mod"),
    lockFiles: ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "package-lock.json"].filter(
      (name) => existsSync(join(root, name)),
    ),
  };
}

/**
 * What init, sync and status report of the hooks.
 * @param manifest the workspace's settings
 * @param desired the files the projection holds, whose adapters are named
 * @param git the git hooks' state
 * @returns the report
 */
export function hooksReport(
  manifest: Manifest,
  desired: readonly DesiredFile[],
  git: HooksReport["git"],
): HooksReport {
  const paths = new Set(desired.map((file) => file.path));
  const adapters = HARNESSES.filter((harness) =>
    [...JSON_ADAPTERS, ...FILE_ADAPTERS].some(
      (adapter) => adapter.harness === harness && paths.has(adapter.path),
    ),
  );
  return { git, checks: manifest.checks, adapters };
}

/** The checks a manifest declares, none without one. */
export function declaredChecks(manifest: Manifest | undefined): readonly DeclaredCheck[] {
  return manifest?.checks ?? [];
}
