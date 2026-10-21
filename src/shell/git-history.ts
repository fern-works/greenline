import type {
  CodeTarget,
  FilesReading,
  GitHistory,
  LoggedCommit,
  PathStatus,
} from "../core/change-history.ts";
import type { CommitsSince } from "../core/status.ts";
import { commitTreeId, readGit, workingTreeChanges } from "./code-tree.ts";

/**
 * The history reader (`workshop/components/artifact-system.md`): the commits
 * reachable from HEAD since the first change record entered the repository,
 * in one `git log` pass, with their parents, their `Greenline-Change:`
 * trailers and the paths they touched, for `src/core/change-history.ts` to
 * derive from. One read before it finds that bound: the oldest commit that
 * touched a change record. It runs git read-only, through
 * the runner of `src/shell/code-tree.ts`, and writes nothing in the owner's
 * repository. A shallow clone, a git that cannot run, a directory that is
 * not a repository and a log git could not finish are answers, not errors:
 * history cannot say there.
 */

// Each commit opens with a record separator; its fields and, with -z, the
// status and path of each change are separated by NUL.
const FORMAT =
  "--format=%x1e%H%x00%P%x00%(trailers:key=Greenline-Change,valueonly,separator=%x1f)%x00";

// A change record: a date-and-slug Markdown file directly under the ledger.
const RECORDS = ":(glob).greenline/ledger/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*.md";
// Every path but the workspace's own.
const CODE = [".", ":(exclude).greenline"] as const;

function statusOf(letter: string): PathStatus {
  // --no-renames and no copy detection leave A, M, D and T; anything else reads as a modification.
  return letter === "A" || letter === "D" || letter === "T" ? letter : "M";
}

/** One commit's record: hash, parents and trailers, then status and path pairs. */
function parseCommit(record: string): LoggedCommit | undefined {
  const [hash, parents, trailers, ...rest] = record.split("\0");
  if (hash === undefined || !/^[0-9a-f]{40,64}$/.test(hash)) return undefined;
  const paths: { status: PathStatus; path: string }[] = [];
  const tokens = rest.filter((token) => token !== "");
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    // git ends the header with a newline before the first status letter.
    const letter = (tokens[index] ?? "").replace(/^\n/, "");
    const path = tokens[index + 1] ?? "";
    paths.push({ status: statusOf(letter), path });
  }
  return {
    hash,
    parents: (parents ?? "").split(" ").filter((parent) => parent !== ""),
    changes: (trailers ?? "")
      .split("\x1f")
      .map((value) => value.trim())
      .filter((value) => value !== ""),
    paths,
  };
}

/**
 * Read the history reachable from HEAD since the first change record entered
 * the repository: no commit when none ever did.
 * @param root the repository root
 * @returns the commits, newest first, or why history cannot say
 */
export function readGitHistory(root: string): GitHistory {
  const shallow = readGit(root, ["rev-parse", "--is-shallow-repository"]);
  if (shallow._tag === "err")
    return {
      kind: "unknown",
      why: shallow.error.kind === "missing" ? "no-git" : "not-a-repository",
      detail: shallow.error.message,
    };
  if (shallow.value.trim() === "true")
    return { kind: "unknown", why: "shallow", detail: "the clone is shallow" };
  const head = readGit(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head._tag === "err") return { kind: "read", head: undefined, commits: [] };
  // The bound: the oldest commit that touched a change record, on any line HEAD reaches.
  const touched = readGit(root, [
    "rev-list",
    "--reverse",
    "--topo-order",
    "--full-history",
    "HEAD",
    "--",
    RECORDS,
  ]);
  if (touched._tag === "err")
    return { kind: "unknown", why: "unreadable", detail: touched.error.message };
  const first = touched.value.split("\n")[0]?.trim() ?? "";
  if (first === "") return { kind: "read", head: head.value.trim(), commits: [] };
  const log = readGit(root, [
    "log",
    "-z",
    "--topo-order",
    "--no-renames",
    // The root commit's paths are listed whatever the owner's log.showRoot says.
    "--root",
    "--name-status",
    FORMAT,
    "HEAD",
    // Nothing older than the first record: what its parents reach is left out.
    "--not",
    `${first}^@`,
  ]);
  // git answered before and refused the log: a missing object, or more history than one read holds.
  if (log._tag === "err") return { kind: "unknown", why: "unreadable", detail: log.error.message };
  return {
    kind: "read",
    head: head.value.trim(),
    commits: log.value
      .split("\x1e")
      .map(parseCommit)
      .filter((commit): commit is LoggedCommit => commit !== undefined),
  };
}

/**
 * The files that differ between a commit and a later commit, or the working
 * tree by the rule of its tree id (`workingTreeChanges` in
 * `src/shell/code-tree.ts`), with `.greenline/` left out. Neither reads or
 * writes the owner's index: two commits compare tree to tree.
 * @param root the repository root
 * @param from the commit a check ran on
 * @param to a later commit, or the working tree
 * @returns the paths, sorted, or why git cannot say
 */
export function changedFiles(root: string, from: string, to: CodeTarget): FilesReading {
  if (to.kind === "working-tree") return workingTreeChanges(root, from);
  const diff = readGit(root, [
    "diff-tree",
    "-r",
    "--name-only",
    "-z",
    "--no-renames",
    from,
    to.hash,
    "--",
    ...CODE,
  ]);
  return diff._tag === "ok"
    ? {
        kind: "files",
        files: diff.value
          .split("\0")
          .filter((path) => path !== "")
          .sort(),
      }
    : { kind: "unknown", reason: diff.error.message };
}

/**
 * The commits of code on the branch after the commit a check's last run
 * started on: those HEAD reaches and it does not, that change a path outside
 * `.greenline/`, newest first, with the tree id of the oldest by the code's
 * rule, so the commit made of the code the run saw can be told apart; every
 * such commit when the run recorded none. A commit HEAD no longer reaches,
 * such as one a rebase replaced, is unknown, since nothing on the branch
 * counts from it.
 * @param root the repository root
 * @param from the commit the run started on, or null when it recorded none
 * @returns the commits, or why git cannot say
 */
export function codeCommitsSince(root: string, from: string | null): CommitsSince {
  const head = readGit(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head._tag === "err")
    return from === null
      ? { kind: "commits", hashes: [], oldestTree: undefined }
      : { kind: "unknown", reason: "the repository has no commit checked out" };
  if (from !== null) {
    const base = readGit(root, ["merge-base", from, "HEAD"]);
    if (base._tag === "err" || base.value.trim() !== from)
      return {
        kind: "unknown",
        reason: `the commit ${from.slice(0, 12)} the last recorded check started on is not on the branch`,
      };
  }
  const listed = readGit(root, [
    "rev-list",
    "--topo-order",
    from === null ? "HEAD" : `${from}..HEAD`,
    "--",
    ...CODE,
  ]);
  if (listed._tag === "err") return { kind: "unknown", reason: listed.error.message };
  const hashes = listed.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const oldest = hashes.at(-1);
  return {
    kind: "commits",
    hashes,
    oldestTree: oldest === undefined ? undefined : commitTreeId(root, oldest),
  };
}
