import { posix } from "node:path";
import type { ChangedFile, ChangedFiles } from "../../core/inspector/documents.ts";
import { parseLock } from "../../core/lock.ts";
import { FixedAnswers, readGit } from "../code-tree.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { readInstalledFile } from "./repository-read.ts";

/*
 * The files a change's commits touched (J-154 S3): each commit's files with
 * the lines added and removed, read from git once a process, since a
 * commit's id fixes them, and grouped by folder for the change page and the
 * desk. The files under the trees the installation writes, which its lock
 * lists, and the practice's own folder `.greenline/` are counted apart and
 * not listed: they are the installation's, not the change's code.
 */

/** One commit with its time and the files it touched. */
export interface CommitFiles {
  readonly hash: string;
  readonly date: string;
  readonly files: readonly ChangedFile[];
}

/** A commit id as git prints it; nothing else reaches git's arguments. */
const COMMIT = /^[0-9a-f]{7,64}$/;

const known = new FixedAnswers<CommitFiles | undefined>();

/** One `--numstat` line: added, removed and the path, a binary file's counts as `-`. */
const NUMSTAT = /^(\d+|-)\t(\d+|-)\t(.+)$/;

/** Parse `git log --numstat` output, each commit opened by a record separator. */
function parsedLog(text: string): ReadonlyMap<string, CommitFiles> {
  const found = new Map<string, CommitFiles>();
  for (const record of text.split("\x1e")) {
    const [head = "", ...lines] = record.split("\n");
    const [hash, date] = head.split("\0");
    if (hash === undefined || date === undefined || !COMMIT.test(hash)) continue;
    const files = lines.flatMap((line): ChangedFile[] => {
      const stat = NUMSTAT.exec(line);
      if (stat?.[3] === undefined) return [];
      const count = (value: string | undefined): number | null =>
        value === undefined || value === "-" ? null : Number(value);
      return [{ path: stat[3], added: count(stat[1]), removed: count(stat[2]) }];
    });
    found.set(hash, { hash, date, files });
  }
  return found;
}

/**
 * Each commit's time and files, asked of git in one read for the commits
 * not yet answered this process.
 * @param root the repository root
 * @param hashes the commits, by their whole ids
 * @returns each commit read, by its id, or why git could not read them
 */
export function commitFiles(
  root: string,
  hashes: readonly string[],
): ReadonlyMap<string, CommitFiles> | { readonly unknown: string } {
  const asked = [...new Set(hashes.filter((hash) => COMMIT.test(hash)))];
  const unanswered = asked.filter(
    (hash) =>
      known.answer(
        root,
        hash,
        () => undefined,
        () => false,
      ) === undefined,
  );
  if (unanswered.length > 0) {
    const read = readGit(root, [
      "-c",
      "core.quotePath=off",
      "log",
      "--no-walk=unsorted",
      "--no-renames",
      "--numstat",
      "--format=%x1e%H%x00%cI",
      ...unanswered,
    ]);
    if (read._tag === "err")
      return { unknown: `git cannot read the commits: ${read.error.message}` };
    const parsed = parsedLog(read.value);
    for (const hash of unanswered)
      known.answer(
        root,
        hash,
        () => parsed.get(hash),
        (value) => value !== undefined,
      );
  }
  const found = new Map<string, CommitFiles>();
  for (const hash of asked) {
    const reading = known.answer(
      root,
      hash,
      () => undefined,
      () => false,
    );
    if (reading !== undefined) found.set(hash, reading);
  }
  return found;
}

/**
 * Whether a path is the installation's: under `.greenline/`, or a file its
 * lock lists.
 * @param root the repository root
 * @returns the test
 */
export function installedTest(root: string): (path: string) => boolean {
  const text = readInstalledFile(root, createNodeFileIo(), ".greenline/lock.json");
  const lock = text._tag === "ok" ? parseLock(text.value, ".greenline/lock.json") : undefined;
  const files = lock?._tag === "ok" ? new Set(lock.value.files.keys()) : new Set<string>();
  return (path) => path.startsWith(".greenline/") || files.has(path);
}

/** No files: the answer for no commits, or for commits git cannot read. */
export function noFiles(unknown: string | null): ChangedFiles {
  return { groups: [], totals: { files: 0, added: 0, removed: 0 }, installed: 0, unknown };
}

const sum = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a + b;

/**
 * The files a set of commits touched, each path once with its lines summed,
 * grouped by folder, the largest group first, the installation's counted apart.
 * @param commits the commits
 * @param installed whether a path is the installation's
 * @returns the files
 */
export function changedFilesOf(
  commits: readonly CommitFiles[],
  installed: (path: string) => boolean,
): ChangedFiles {
  const files = new Map<string, ChangedFile>();
  const theirs = new Set<string>();
  for (const commit of commits)
    for (const file of commit.files) {
      if (installed(file.path)) {
        theirs.add(file.path);
        continue;
      }
      const before = files.get(file.path);
      files.set(
        file.path,
        before === undefined
          ? file
          : {
              path: file.path,
              added: sum(before.added, file.added),
              removed: sum(before.removed, file.removed),
            },
      );
    }
  const folders = new Map<string, ChangedFile[]>();
  for (const file of [...files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const folder = posix.dirname(file.path);
    folders.set(folder, [...(folders.get(folder) ?? []), file]);
  }
  const groups = [...folders.entries()]
    .map(([folder, held]) => ({ folder, count: held.length, files: held }))
    .sort((a, b) => b.count - a.count || (a.folder < b.folder ? -1 : 1));
  const all = [...files.values()];
  return {
    groups,
    totals: {
      files: all.length,
      added: all.reduce((total, file) => total + (file.added ?? 0), 0),
      removed: all.reduce((total, file) => total + (file.removed ?? 0), 0),
    },
    installed: theirs.size,
    unknown: null,
  };
}
