import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";

/**
 * Repository-root detection by filesystem walk only: no `git` child
 * process, no network, works in worktrees and bare markers alike.
 * `start` must be an absolute directory path.
 */
export function findGitRoot(start: string): string | undefined {
  let current: string = start;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent: string = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** `git init` could not make a repository: git is missing, or it refused. */
class GitInitFailed extends Error {
  readonly _tag = "GitInitFailed" as const;
}

/**
 * Make the directory a Git repository with `git init`: the one git write the
 * CLI makes, run only when the owner answered yes to init's offer or passed
 * `--yes` (`docs/SPEC.md` §4). It contacts no remote and makes no commit.
 * @param directory the directory init runs in
 * @returns nothing, or why git made no repository
 */
export function initRepository(directory: string): Result<void, GitInitFailed> {
  try {
    execFileSync("git", ["init", "--quiet"], {
      cwd: directory,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    return ok(undefined);
  } catch (error) {
    if (z.object({ code: z.literal("ENOENT") }).safeParse(error).success)
      return err(new GitInitFailed("git cannot run"));
    const refused = z.object({ stderr: z.string() }).safeParse(error);
    const said = refused.success ? (refused.data.stderr.trim().split("\n")[0] ?? "") : "";
    return err(new GitInitFailed(said === "" ? "git refused" : said));
  }
}

/** A git write the hooks' registration or a commit's trailer asked for did not happen. */
class GitWriteFailed extends Error {
  readonly _tag = "GitWriteFailed" as const;
  /** git's exit code, when it ran and refused. */
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.status = status;
  }
}

/**
 * Run one git command that writes: a key of the repository's local
 * configuration, which registers greenline's hooks, or the trailer a commit
 * message gains. It contacts no remote and makes no commit.
 */
function gitWrite(root: string, args: readonly string[]): Result<void, GitWriteFailed> {
  try {
    execFileSync("git", [...args], {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    return ok(undefined);
  } catch (error) {
    const said = z.object({ stderr: z.string(), status: z.number() }).safeParse(error);
    const first = said.success ? (said.data.stderr.trim().split("\n")[0] ?? "") : "";
    return err(
      new GitWriteFailed(
        first === "" ? "git refused" : first,
        said.success ? said.data.status : undefined,
      ),
    );
  }
}

/**
 * Set a key of the repository's local configuration, the hooks' registration.
 * @param root the repository root
 * @param key the key, such as `hook.greenline-pre-commit.command`
 * @param value its value
 * @returns nothing, or why git did not set it
 */
export function setLocalConfig(
  root: string,
  key: string,
  value: string,
): Result<void, GitWriteFailed> {
  return gitWrite(root, ["config", "--local", key, value]);
}

/** git's exit code for a configuration key that is not set. */
const KEY_NOT_SET = 5;

/**
 * Remove a key of the repository's local configuration; a key already absent is no failure.
 * @param root the repository root
 * @param key the key
 * @returns nothing, or why git did not remove it
 */
export function unsetLocalConfig(root: string, key: string): Result<void, GitWriteFailed> {
  const removed = gitWrite(root, ["config", "--local", "--unset-all", key]);
  return removed._tag === "err" && removed.error.status === KEY_NOT_SET ? ok(undefined) : removed;
}

/**
 * Add a change's trailer to a commit message file in place, as git places a
 * trailer: in the message's last paragraph, beside any other trailer there,
 * once, so a message that already carries it is left as it is.
 * @param root the repository root
 * @param file the message file git named
 * @param trailer the trailer line, such as `Greenline-Change: <id>`
 * @returns nothing, or why git did not add it
 */
export function addTrailer(
  root: string,
  file: string,
  trailer: string,
): Result<void, GitWriteFailed> {
  return gitWrite(root, [
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "addIfDifferent",
    "--trailer",
    trailer,
    file,
  ]);
}

/**
 * Write trailers into a commit message file in place, in the order given, as
 * the last lines of its last paragraph: each one added where the message
 * lacks it, and an existing one of the same key moved down to its place, so
 * the change's trailer stays the last line below the agent's.
 * @param root the repository root
 * @param file the message file git named
 * @param trailers the trailer lines, in the order they stand
 * @returns nothing, or why git did not write them
 */
export function addTrailers(
  root: string,
  file: string,
  trailers: readonly string[],
): Result<void, GitWriteFailed> {
  return gitWrite(root, [
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "replace",
    ...trailers.flatMap((trailer) => ["--trailer", trailer]),
    file,
  ]);
}

/**
 * Remove a linked worktree with `git worktree remove`, never forced, so git
 * refuses one that holds modified or untracked files; the branch stays.
 * @param root the repository root
 * @param path the worktree's path
 * @returns nothing, or why git did not remove it
 */
export function removeWorktree(root: string, path: string): Result<void, GitWriteFailed> {
  return gitWrite(root, ["worktree", "remove", path]);
}

/*
 * The one home of a session's facts the owner's words are read by (J-199
 * S1; the run j196c-conduct-runner, whose keep in a worktree of the
 * change's own found no message of the owner's): the turn counter, the
 * turn's words and the owner's journal stand in the main checkout's
 * `.greenline/tmp/sessions/` for every worktree of the repository, resolved
 * through git's common directory, so a reading finds them wherever the
 * command runs. Read from the disk alone, no git process: the `.git`
 * directory itself, or the `gitdir` a linked worktree's `.git` file names,
 * through its `commondir`. A bare repository's or a submodule's checkout,
 * whose common directory is no `.git`, keeps its own.
 */

/** The sessions' folder, from a checkout's root. */
const SESSIONS = join(".greenline", "tmp", "sessions");

/**
 * The git directory every worktree of the repository shares, read from the
 * disk; undefined where the root holds no `.git` that reads.
 * @param root a checkout's root
 * @returns the common directory's real path, or undefined
 */
export function commonGitDirectory(root: string): string | undefined {
  const dotGit = join(root, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return realpathSync(dotGit);
    const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"))?.[1];
    if (pointer === undefined) return undefined;
    const gitdir = resolve(root, pointer);
    const common = join(gitdir, "commondir");
    return realpathSync(
      existsSync(common) ? resolve(gitdir, readFileSync(common, "utf8").trim()) : gitdir,
    );
  } catch {
    return undefined;
  }
}

/**
 * The main checkout of the repository a root stands in: the directory
 * holding the common `.git`, or the root itself where none reads so.
 * @param root a checkout's root, the main one's or a linked worktree's
 * @returns the main checkout's root
 */
export function mainCheckout(root: string): string {
  const common = commonGitDirectory(root);
  return common === undefined || basename(common) !== ".git" ? root : dirname(common);
}

/**
 * The sessions' home the turn counter, the turn's words and the owner's
 * journal stand in: the main checkout's, for every worktree.
 * @param root a checkout's root
 * @returns the folder's path
 */
export function sessionsHome(root: string): string {
  return join(mainCheckout(root), SESSIONS);
}
