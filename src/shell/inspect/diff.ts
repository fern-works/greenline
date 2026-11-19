import type {
  DiffCommit,
  DiffDocument,
  DiffNet,
  NumberedDiffLine,
} from "../../core/inspector/documents.ts";

import { readGit } from "../code-tree.ts";

/** What a changed file's lines read to: each commit that touched it, the net change, or why git could not read them. */
export type FileAcrossCommits = Pick<DiffDocument, "commits" | "net" | "unknown">;

/*
 * One changed file's lines across a change's commits (J-155 S2): what each
 * commit did to the file, read from git as it printed the commit, every line
 * added, removed or around one, the oldest commit first, each line with its
 * numbers before and after from the hunk headers; and the net change, the
 * file from before the change's first commit that touched it to its last
 * (J-165 S1). Nothing here writes, and only a commit id and the file's path,
 * as the change's commits name it, reach git's arguments, after `--`.
 */

/** A commit id as git prints it; nothing else reaches git's arguments before `--`. */
const COMMIT = /^[0-9a-f]{7,64}$/;

/** Past this many lines of one commit's patch the rest is said, not shown. */
const LINES_SHOWN = 2_000;

/** A hunk's header: where its lines start before and after. */
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * The lines of one patch to one file, the patch's headers left out, each
 * numbered from its hunk's header; a gap between two hunks is one line with
 * no number.
 * @param patch git's patch text for the file
 * @returns the lines, added, removed and around
 */
function linesOf(patch: string): readonly NumberedDiffLine[] {
  const lines: NumberedDiffLine[] = [];
  let inHunk = false;
  let before = 0;
  let after = 0;
  for (const line of patch.split("\n")) {
    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      inHunk = true;
      before = Number(hunk[1]);
      after = Number(hunk[2]);
      if (lines.length > 0) lines.push({ kind: "same", line: "…", oldLine: null, newLine: null });
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+"))
      lines.push({ kind: "add", line: line.slice(1), oldLine: null, newLine: after++ });
    else if (line.startsWith("-"))
      lines.push({ kind: "del", line: line.slice(1), oldLine: before++, newLine: null });
    else if (line.startsWith(" "))
      lines.push({ kind: "same", line: line.slice(1), oldLine: before++, newLine: after++ });
  }
  if (lines.length > LINES_SHOWN)
    return [
      ...lines.slice(0, LINES_SHOWN),
      {
        kind: "same",
        line: `and ${String(lines.length - LINES_SHOWN)} more lines`,
        oldLine: null,
        newLine: null,
      },
    ];
  return lines;
}

/**
 * The file from before the first commit to the last: the first's parent,
 * where it has one, to the last.
 * @param root the repository root
 * @param first the oldest commit that touched the file
 * @param last the newest commit that touched the file
 * @param path the file's path from the root
 * @returns the net change, or null where git cannot read it or it changes no line
 */
function netChange(root: string, first: string, last: string, path: string): DiffNet | null {
  const parent = readGit(root, ["rev-parse", "--verify", "--quiet", `${first}^`]);
  const from = parent._tag === "ok" ? parent.value.trim() : "";
  const read = readGit(root, [
    "-c",
    "core.quotePath=off",
    "diff",
    "--no-renames",
    "--no-color",
    "--no-ext-diff",
    // A file the first commit made is read against nothing: git's empty tree.
    from === "" ? "4b825dc642cb6eb9a060e54bf8d69288fbee4904" : from,
    last,
    "--",
    path,
  ]);
  if (read._tag === "err") return null;
  const lines = linesOf(read.value);
  return lines.length === 0 ? null : { from: from === "" ? null : from, to: last, lines };
}

/**
 * What each of a change's commits did to one file, the commits that left it
 * alone left out, and the net change across them.
 * @param root the repository root
 * @param commits the change's commits by their ids
 * @param path the file's path from the root
 * @returns each commit that touched it with its lines, the oldest first, the net change, or why git could not read them
 */
export function fileAcrossCommits(
  root: string,
  commits: readonly string[],
  path: string,
): FileAcrossCommits {
  const found: DiffCommit[] = [];
  for (const hash of commits.filter((commit) => COMMIT.test(commit))) {
    const read = readGit(root, [
      "-c",
      "core.quotePath=off",
      "show",
      "--no-renames",
      // A merge commit's own diff is none: its parents' commits carry the lines.
      "--diff-merges=off",
      "--no-color",
      "--format=%H%x00%s%x00%cI",
      hash,
      "--",
      path,
    ]);
    if (read._tag === "err")
      return {
        commits: found,
        net: null,
        unknown: `git cannot read ${hash}: ${read.error.message}`,
      };
    const [head = "", ...rest] = read.value.split("\n");
    const [full = hash, subject = "", date = ""] = head.split("\0");
    const lines = linesOf(rest.join("\n"));
    if (lines.length > 0) found.push({ hash: full, subject, date, lines });
  }
  const ordered = found.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const first = ordered[0];
  const last = ordered.at(-1);
  return {
    commits: ordered,
    net:
      first === undefined || last === undefined
        ? null
        : netChange(root, first.hash, last.hash, path),
    unknown: null,
  };
}
