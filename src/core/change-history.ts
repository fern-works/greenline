import { CHANGE_ID } from "./change.ts";

/**
 * A change's commits (`workshop/components/artifact-system.md`), derived
 * from one reading of git history and stored nowhere. A commit belongs to a
 * change when it carries the change's `Greenline-Change:` trailer or touches
 * the change's record or folder under `.greenline/ledger/`. A change's commits
 * are a set, not a range, so a planning change and its tickets interleaved on
 * one branch keep their own; a commit that belongs to two changes is shared
 * and both keep it. When the history is shallow or git cannot read it, every
 * answer is unknown, never "no commits".
 */

/** How a commit touched a path: added, modified, deleted, or its type changed. */
export type PathStatus = "A" | "M" | "D" | "T";

/** One commit as the history reader logged it. */
export interface LoggedCommit {
  readonly hash: string;
  /** Its parents, the first parent first; two or more make a merge. */
  readonly parents: readonly string[];
  /** The values of its `Greenline-Change:` trailers. */
  readonly changes: readonly string[];
  /** The paths it touched against its first parent; a merge lists none. */
  readonly paths: readonly { readonly status: PathStatus; readonly path: string }[];
}

/** Why history cannot answer: a shallow clone, no git to run, not a repository, or a log git could not finish. */
export type HistoryGap = "shallow" | "no-git" | "not-a-repository" | "unreadable";

/**
 * What the history reader found: the commits reachable from HEAD since the
 * first change record entered the repository, newest first, or why there
 * are none to read.
 */
export type GitHistory =
  | {
      readonly kind: "read";
      /** The commit checked out; undefined in a repository with no commit yet. */
      readonly head: string | undefined;
      readonly commits: readonly LoggedCommit[];
    }
  | { readonly kind: "unknown"; readonly why: HistoryGap; readonly detail: string };

/** One commit of a change, and whether another change claims it too. */
export interface ChangeCommit {
  readonly hash: string;
  readonly shared: boolean;
}

/** A change's commits and the code files they changed, or why history cannot say. */
export type ChangeCommits =
  | { readonly kind: "unknown"; readonly why: HistoryGap }
  | {
      readonly kind: "known";
      readonly commits: readonly ChangeCommit[];
      /** The union of those commits' paths, sorted, with `.greenline/` left out. */
      readonly files: readonly string[];
    };

/** The code a check is compared with: a commit, or the working tree as it stands. */
export type CodeTarget =
  | { readonly kind: "commit"; readonly hash: string }
  | { readonly kind: "working-tree" };

/** The files that differ from a commit, sorted, with `.greenline/` left out, or why git cannot say. */
export type FilesReading =
  | { readonly kind: "files"; readonly files: readonly string[] }
  | { readonly kind: "unknown"; readonly reason: string };

/** A list history gives, or why it cannot. */
export type HistoryList =
  | { readonly kind: "unknown"; readonly why: HistoryGap }
  | { readonly kind: "known"; readonly items: readonly string[] };

// A ledger path whose first segment is not a change id belongs to no change:
// the managed guide and the garden receipts share the folder (README.md, receipts/).
const LEDGER = ".greenline/ledger/";
const WORKSPACE = ".greenline/";

/** The change a ledger path belongs to: its record `<id>.md` or anything under its folder `<id>/`. */
function changeOfPath(path: string): string | undefined {
  if (!path.startsWith(LEDGER)) return undefined;
  const rest = path.slice(LEDGER.length);
  const slash = rest.indexOf("/");
  const id = slash === -1 ? (rest.endsWith(".md") ? rest.slice(0, -3) : "") : rest.slice(0, slash);
  return CHANGE_ID.test(id) ? id : undefined;
}

/** Every change a commit belongs to: its trailers and the ledger paths it touched. */
function changesOfCommit(commit: LoggedCommit): ReadonlySet<string> {
  const ids = new Set(commit.changes);
  for (const { path } of commit.paths) {
    const id = changeOfPath(path);
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

/**
 * Each change's commits, as a set, and the code files they changed.
 * @param history what the history reader found
 * @param ids the changes to answer for
 * @returns one answer per id; every answer unknown when the history is
 */
export function commitsOfChanges(
  history: GitHistory,
  ids: readonly string[],
): ReadonlyMap<string, ChangeCommits> {
  if (history.kind === "unknown")
    return new Map(ids.map((id) => [id, { kind: "unknown", why: history.why }]));
  const owners = history.commits.map((commit) => ({ commit, ids: changesOfCommit(commit) }));
  return new Map(
    ids.map((id): [string, ChangeCommits] => {
      const mine = owners.filter((entry) => entry.ids.has(id));
      const files = new Set(
        mine.flatMap((entry) =>
          entry.commit.paths
            .map((touched) => touched.path)
            .filter((path) => !path.startsWith(WORKSPACE)),
        ),
      );
      return [
        id,
        {
          kind: "known",
          commits: mine.map((entry) => ({ hash: entry.commit.hash, shared: entry.ids.size > 1 })),
          files: [...files].sort(),
        },
      ];
    }),
  );
}

/**
 * The changes whose record history shows as added and later deleted: the
 * first commit in the log's topological order that touched
 * `.greenline/ledger/<id>.md` deleted it. Across a merge that order is not
 * the order of HEAD's own line, so `status` confirms each against the
 * records on disk.
 * @param history what the history reader found
 * @returns the ids, sorted, or why history cannot say
 */
export function deletedRecords(history: GitHistory): HistoryList {
  if (history.kind === "unknown") return { kind: "unknown", why: history.why };
  const latest = new Map<string, PathStatus>();
  const added = new Set<string>();
  for (const commit of history.commits)
    for (const { status, path } of commit.paths) {
      const id = changeOfPath(path);
      if (id === undefined || path !== `${LEDGER}${id}.md`) continue;
      if (!latest.has(id)) latest.set(id, status);
      if (status === "A") added.add(id);
    }
  return {
    kind: "known",
    items: [...latest]
      .filter(([id, status]) => status === "D" && added.has(id))
      .map(([id]) => id)
      .sort(),
  };
}

/**
 * The commits that belong to no change: on HEAD's first-parent line, not
 * merges, touching at least one file greenline did not install (outside
 * `.greenline/` and not among `installed`), and carrying no trailer and no
 * ledger path of a change. `status` bounds and counts them.
 * @param history what the history reader found
 * @param installed the paths greenline installs and owns in the workspace, such as its skill files
 * @returns their hashes, newest first, or why history cannot say
 */
export function unclaimedCommits(history: GitHistory, installed: ReadonlySet<string>): HistoryList {
  if (history.kind === "unknown") return { kind: "unknown", why: history.why };
  const byHash = new Map(history.commits.map((commit) => [commit.hash, commit]));
  const items: string[] = [];
  let next = history.head;
  while (next !== undefined) {
    const commit = byHash.get(next);
    if (commit === undefined) break;
    if (
      commit.parents.length <= 1 &&
      changesOfCommit(commit).size === 0 &&
      commit.paths.some(
        (touched) => !touched.path.startsWith(WORKSPACE) && !installed.has(touched.path),
      )
    )
      items.push(commit.hash);
    next = commit.parents[0];
  }
  return { kind: "known", items };
}
