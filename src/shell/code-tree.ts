import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import type { FilesReading } from "../core/change-history.ts";

/**
 * The code a check ran on, named the way git names it: the tree id of the
 * working tree with `.greenline/` left out, and the tree id of a commit by
 * the same rule, so a working tree and the commit made of it give the same
 * id. Both are built in a temporary directory that is removed after: a
 * temporary index, the working tree's starting as a copy of the owner's, and
 * a temporary object directory that takes every blob and tree git writes,
 * with the repository's own object store read through as an alternate.
 * Neither the owner's index nor the owner's object store is written, and the
 * ids are the ones git would give in the repository itself. A clean filter
 * the owner configured, such as Git LFS, still runs as it would for the
 * owner's own `git add`, and a process killed outright leaves the temporary
 * directory behind.
 *
 * The rule for files: every file git tracks, as it stands in the working
 * tree, even where an ignore rule matches it; every untracked file git would
 * add, and no ignored one; nothing under `.greenline/`. A directory that is
 * not a git repository, or a git that cannot run, is reported as unknown
 * rather than thrown.
 */

/** A tree id, or why there is none. */
export type TreeReading =
  | { readonly kind: "tree"; readonly id: string }
  | { readonly kind: "unknown"; readonly reason: string };

/** The commit checked out: its id, none in a repository with no commit, or unknown. */
export type CommitReading =
  | { readonly kind: "commit"; readonly id: string }
  | { readonly kind: "none" }
  | { readonly kind: "unknown"; readonly reason: string };

/** Where a run reads and writes instead of the owner's index and object store. */
interface Scratch {
  readonly index: string;
  readonly objects: string;
  /** The alternates list: the repository's own object directory, read and never written, then any the owner set. */
  readonly alternates: string;
}

/**
 * One entry of git's alternates list. git splits the list on the path
 * delimiter and reads an entry that starts with a double quote as a C-style
 * quoted path, so a path holding either is quoted.
 */
function alternateEntry(path: string): string {
  return path.includes(delimiter) || path.startsWith('"')
    ? `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : path;
}

/** Run git at the root, against the scratch index and object store when given; its stderr is dropped. */
function git(root: string, args: readonly string[], scratch?: Scratch): string {
  return execGit(
    root,
    // A split index would write its shared part beside the owner's files.
    scratch === undefined ? args : ["-c", "core.splitIndex=false", ...args],
    scratch === undefined
      ? process.env
      : {
          ...process.env,
          GIT_INDEX_FILE: scratch.index,
          GIT_OBJECT_DIRECTORY: scratch.objects,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: scratch.alternates,
        },
  ).trim();
}

/** The one place this module starts git: at the root, stdin closed, stderr dropped, output returned whole. */
function execGit(root: string, args: readonly string[], environment: NodeJS.ProcessEnv): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: environment,
    maxBuffer: 1024 * 1024 * 1024,
  });
}

/** git could not answer: it is not installed, or it ran and refused. */
class GitUnanswered extends Error {
  readonly _tag = "GitUnanswered" as const;
  readonly kind: "missing" | "refused";
  constructor(kind: "missing" | "refused", detail: string) {
    super(detail);
    this.kind = kind;
  }
}

/**
 * Run a read-only git command at the root the way this module runs git, and
 * return its output exactly, untrimmed. The history reader shares it.
 * @param root the repository root
 * @param args the git arguments
 * @returns git's standard output, or why git gave none: missing, or refused
 */
export function readGit(root: string, args: readonly string[]): Result<string, GitUnanswered> {
  try {
    return ok(execGit(root, args, process.env));
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    return err(
      new GitUnanswered(
        missing ? "missing" : "refused",
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}

/**
 * Run a read-only git command whose answer is its exit code, such as
 * `merge-base --is-ancestor` or `cat-file -e`, the way this module runs git.
 * @param root the repository root
 * @param args the git arguments
 * @returns the exit code, or undefined when git could not run or a signal ended it
 */
export function gitExitCode(root: string, args: readonly string[]): number | undefined {
  try {
    execGit(root, args, process.env);
    return 0;
  } catch (error) {
    // git ran and answered with its exit code; anything else is no answer.
    const ran = EXITED.safeParse(error);
    return ran.success ? ran.data.status : undefined;
  }
}

/** A git that ran and exited, as `execFileSync` reports its non-zero exit. */
const EXITED = z.object({ status: z.number().int() });

/** Every `.greenline` entry out of the temporary index, whatever its state. */
const DROP_LEDGER = [
  "rm",
  "-r",
  "--cached",
  "--force",
  "--quiet",
  "--ignore-unmatch",
  "--",
  ".greenline",
];

/**
 * Run git commands against a temporary index and object directory and return
 * what the last one prints. The index starts empty, or as a copy of the
 * owner's when `seed` asks for it; the owner's own files are only read.
 */
function inTemporaryIndex(
  root: string,
  seed: "empty" | "owner",
  steps: readonly (readonly string[])[],
  last: readonly string[],
): Result<string, GitUnanswered> {
  let directory: string | undefined;
  try {
    git(root, ["rev-parse", "--git-dir"]);
    directory = mkdtempSync(join(tmpdir(), "greenline-tree-"));
    const scratch: Scratch = {
      index: join(directory, "index"),
      objects: join(directory, "objects"),
      // Through git, so a linked worktree reads its repository's common store.
      alternates: [
        alternateEntry(resolve(root, git(root, ["rev-parse", "--git-path", "objects"]))),
        process.env["GIT_ALTERNATE_OBJECT_DIRECTORIES"] ?? "",
      ]
        .filter((entry) => entry !== "")
        .join(delimiter),
    };
    mkdirSync(scratch.objects);
    if (seed === "owner") {
      const owners = resolve(root, git(root, ["rev-parse", "--git-path", "index"]));
      if (existsSync(owners)) copyFileSync(owners, scratch.index);
    }
    for (const args of steps) git(root, args, scratch);
    return ok(git(root, last, scratch));
  } catch (error) {
    return err(
      new GitUnanswered("refused", error instanceof Error ? error.message : String(error)),
    );
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * The tree id of the working tree as it stands, `.greenline/` left out.
 * @param root the repository root
 * @returns the tree id, or unknown with git's reason
 */
export function workingTreeId(root: string): TreeReading {
  // Seeded from the owner's index, so a tracked file stays tracked even where an
  // ignore rule matches it, and a sparse checkout keeps the files it does not check out.
  // The add never reads .greenline, so a ledger file being written or removed at
  // that moment cannot fail it; the drop takes out what the owner's index tracks there.
  return treeOf(inTemporaryIndex(root, "owner", WORKING_TREE, ["write-tree"]));
}

/** The steps that make the temporary index the working tree, by the rule above. */
const WORKING_TREE: readonly (readonly string[])[] = [
  ["add", "--all", "--", ".", ":(exclude).greenline"],
  DROP_LEDGER,
];

function treeOf(written: Result<string, GitUnanswered>): TreeReading {
  return written._tag === "ok"
    ? { kind: "tree", id: written.value }
    : { kind: "unknown", reason: written.error.message };
}

/**
 * The files where the working tree differs from a commit, by the same rule
 * as its tree id: untracked files git would add count, ignored ones do not,
 * and `.greenline/` is left out. The comparison runs in the temporary index,
 * so the owner's index is never refreshed or written.
 * @param root the repository root
 * @param commit the commit to compare with
 * @returns the paths, sorted, or unknown with git's reason
 */
export function workingTreeChanges(root: string, commit: string): FilesReading {
  const listed = inTemporaryIndex(root, "owner", WORKING_TREE, [
    "diff-index",
    "--cached",
    "--name-only",
    "-z",
    "--no-renames",
    commit,
    "--",
    ".",
    ":(exclude).greenline",
  ]);
  return listed._tag === "ok"
    ? {
        kind: "files",
        files: listed.value
          .split("\0")
          .filter((path) => path !== "")
          .sort(),
      }
    : { kind: "unknown", reason: listed.error.message };
}

/**
 * The tree id of a commit by the same rule, `.greenline/` left out.
 * @param root the repository root
 * @param commit the commit
 * @returns the tree id, or unknown with git's reason
 */
export function commitTreeId(root: string, commit: string): TreeReading {
  return treeOf(
    inTemporaryIndex(
      root,
      "empty",
      [["read-tree", `${commit}^{tree}`], DROP_LEDGER],
      ["write-tree"],
    ),
  );
}

/**
 * The commit checked out at the root.
 * @param root the repository root
 * @returns the commit, none when the repository has no commit, or unknown when git cannot say
 */
export function headCommit(root: string): CommitReading {
  try {
    git(root, ["rev-parse", "--git-dir"]);
  } catch (error) {
    return { kind: "unknown", reason: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { kind: "commit", id: git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]) };
  } catch {
    return { kind: "none" };
  }
}
