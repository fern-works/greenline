import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import type { FilesReading } from "../core/change-history.ts";
import { parseLock } from "../core/lock.ts";

/**
 * The code a check ran on, named the way git names it: the tree id of the
 * working tree with the practice's own files left out, and the tree id of
 * a commit by the same rule, so a working tree and the commit made of it give the same
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
 * add, and no ignored one; none of the practice's own files, which are
 * `.greenline/` and every file `.greenline/lock.json` names, its orphans
 * among them (J-229 S1). The lock is read at each reading, the working
 * tree's, never a commit's own, so a commit's tree is read by the files the
 * lock names now; where the lock cannot be read, `.greenline/` alone is left
 * out. A file the lock names that holds a managed region, such as AGENTS.md,
 * leaves the tree whole, the owner's part of it with greenline's. A
 * directory that is not a git repository, or a git that cannot run, is
 * reported as unknown rather than thrown.
 */

/**
 * The practice's own files beyond `.greenline/`: the paths the lock names
 * outside it, sorted, and a key that names the set, for answers kept by it.
 */
export interface PracticeFiles {
  readonly paths: readonly string[];
  readonly key: string;
}

const LOCK = ".greenline/lock.json";

/**
 * The paths greenline installed, as the lock records them, those under
 * `.greenline/` among them; none when the lock cannot be read, which the
 * installation's diagnosis reports.
 * @param root the repository root
 * @returns the paths
 */
export function installedPaths(root: string): ReadonlySet<string> {
  let text: string;
  try {
    text = readFileSync(join(root, LOCK), "utf8");
  } catch {
    return new Set();
  }
  const lock = parseLock(text, LOCK);
  return new Set(lock._tag === "ok" ? lock.value.files.keys() : []);
}

/**
 * The practice's own files the code's tree leaves out beside `.greenline/`,
 * read from the lock as it stands now.
 * @param root the repository root
 * @returns the paths and their key; none where the lock cannot be read
 */
export function practiceFiles(root: string): PracticeFiles {
  const paths = [...installedPaths(root)].filter((path) => !underWorkspace(path)).sort();
  return {
    paths,
    key:
      paths.length === 0
        ? ""
        : createHash("sha256").update(paths.join("\0")).digest("hex").slice(0, 16),
  };
}

function underWorkspace(path: string): boolean {
  return path === ".greenline" || path.startsWith(".greenline/");
}

/**
 * Whether a path is one of the practice's own files, out of the code's
 * tree: under `.greenline/`, or a path the lock names.
 * @param practice the lock's paths
 * @param path a path from the root, `/`-separated
 * @returns true for a practice file
 */
export function isPracticeFile(practice: PracticeFiles, path: string): boolean {
  return underWorkspace(path) || practiceSet(practice).has(path);
}

const sets = new WeakMap<PracticeFiles, ReadonlySet<string>>();

function practiceSet(practice: PracticeFiles): ReadonlySet<string> {
  const known = sets.get(practice);
  if (known !== undefined) return known;
  const made = new Set(practice.paths);
  sets.set(practice, made);
  return made;
}

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
function git(root: string, args: readonly string[], scratch?: Scratch, input?: string): string {
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
    input,
  ).trim();
}

/** The one place this module starts git: at the root, stdin closed unless given, stderr dropped, output returned whole. */
function execGit(
  root: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  input?: string,
): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    ...(input === undefined
      ? { stdio: ["ignore", "pipe", "ignore"] }
      : { input, stdio: ["pipe", "pipe", "ignore"] }),
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
  const reading = pinnedReading(root);
  if (reading === undefined) return askGit(root, args);
  const question = args.join("\0");
  const known = reading.reads.get(question);
  if (known !== undefined) return known;
  const answer = askGit(root, args);
  reading.reads.set(question, answer);
  return answer;
}

function askGit(root: string, args: readonly string[]): Result<string, GitUnanswered> {
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
  const reading = pinnedReading(root);
  if (reading === undefined) return askExit(root, args);
  const question = args.join("\0");
  if (reading.exits.has(question)) return reading.exits.get(question);
  const answer = askExit(root, args);
  reading.exits.set(question, answer);
  return answer;
}

function askExit(root: string, args: readonly string[]): number | undefined {
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

/** A git step in the temporary index: its arguments, and what it reads on stdin where it reads anything. */
type Step = readonly string[] | { readonly args: readonly string[]; readonly input: string };

/**
 * The steps that take the practice's own files out of the temporary index:
 * `.greenline` whole, then each path the lock names, given on stdin by its
 * exact name, so no pathspec reads it and a long list needs no long command.
 */
function dropPractice(practice: PracticeFiles): readonly Step[] {
  return practice.paths.length === 0
    ? [DROP_LEDGER]
    : [
        DROP_LEDGER,
        {
          args: ["update-index", "--force-remove", "-z", "--stdin"],
          input: practice.paths.map((path) => `${path}\0`).join(""),
        },
      ];
}

/**
 * Run git commands against a temporary index and object directory and return
 * what the last one prints. The index starts empty, or as a copy of the
 * owner's when `seed` asks for it; the owner's own files are only read.
 */
function inTemporaryIndex(
  root: string,
  seed: "empty" | "owner",
  steps: readonly Step[],
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
      if (existsSync(owners)) {
        copyFileSync(owners, scratch.index);
        // Git reads an entry again when it is no older than its index, the
        // guard for a file edited in the second the index was written; the
        // copy keeps the owner's second, so an edit of the same size in that
        // second is still read (J-232 S1).
        const second = Math.floor(statSync(owners).mtimeMs / 1000);
        utimesSync(scratch.index, second, second);
      }
    }
    for (const step of steps)
      if ("input" in step) git(root, step.args, scratch, step.input);
      else git(root, step, scratch);
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
 * The tree id of the working tree as it stands, the practice's own files left out.
 * @param root the repository root
 * @returns the tree id, or unknown with git's reason
 */
export function workingTreeId(root: string): TreeReading {
  // Seeded from the owner's index, so a tracked file stays tracked even where an
  // ignore rule matches it, and a sparse checkout keeps the files it does not check out.
  // The add never reads .greenline, so a ledger file being written or removed at
  // that moment cannot fail it; the drop takes out what the owner's index tracks there.
  return treeOf(inTemporaryIndex(root, "owner", workingTree(practiceFiles(root)), ["write-tree"]));
}

/** The steps that make the temporary index the working tree, by the rule above. */
function workingTree(practice: PracticeFiles): readonly Step[] {
  return [["add", "--all", "--", ".", ":(exclude).greenline"], ...dropPractice(practice)];
}

function treeOf(written: Result<string, GitUnanswered>): TreeReading {
  return written._tag === "ok"
    ? { kind: "tree", id: written.value }
    : { kind: "unknown", reason: written.error.message };
}

/**
 * The files where the working tree differs from a commit, by the same rule
 * as its tree id: untracked files git would add count, ignored ones do not,
 * and the practice's own files are left out. The comparison runs in the
 * temporary index, so the owner's index is never refreshed or written.
 * @param root the repository root
 * @param commit the commit to compare with
 * @returns the paths, sorted, or unknown with git's reason
 */
export function workingTreeChanges(root: string, commit: string): FilesReading {
  const practice = practiceFiles(root);
  const listed = inTemporaryIndex(root, "owner", workingTree(practice), [
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
          .filter((path) => path !== "" && !isPracticeFile(practice, path))
          .sort(),
      }
    : { kind: "unknown", reason: listed.error.message };
}

/** The installed files that differ from HEAD, those under `.greenline/` apart from the rest, or why git cannot say. */
export type UncommittedInstallation =
  | {
      readonly kind: "files";
      readonly workspace: readonly string[];
      readonly outside: readonly string[];
    }
  | { readonly kind: "unknown"; readonly reason: string };

/**
 * The installation left uncommitted (J-229 S1): each file greenline
 * installed, the lock's paths with the lock and the manifest, that differs
 * from HEAD, modified, new or deleted, read by git read-only, so the owner's
 * index is never refreshed or written. Where HEAD holds no commit, every
 * installed file counts; a file git ignores is never named, the owner's
 * ignore rule being their word on it. Sync and status warn from it.
 * @param root the repository root
 * @returns the paths, sorted, under `.greenline/` and outside it, or unknown with git's reason
 */
export function uncommittedInstallation(root: string): UncommittedInstallation {
  const installed = new Set([...installedPaths(root), LOCK, ".greenline/manifest.json"]);
  // The whole tree's status, read by a short command whatever the lock names, then kept to the installed files.
  const listed = readGit(root, [
    "--no-optional-locks",
    "status",
    "--porcelain=v1",
    "-z",
    "--no-renames",
    "--untracked-files=all",
    "--ignored=no",
  ]);
  if (listed._tag === "err") return { kind: "unknown", reason: listed.error.message };
  const paths = listed.value
    .split("\0")
    .filter((entry) => entry.length > 3)
    .map((entry) => entry.slice(3))
    .filter((path) => installed.has(path))
    .sort();
  return {
    kind: "files",
    workspace: paths.filter(underWorkspace),
    outside: paths.filter((path) => !underWorkspace(path)),
  };
}

/** A whole object id, sha-1 or sha-256: a name that means one object for good. */
export const OBJECT_ID: RegExp = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Answers a commit's id fixes for good, such as its code's tree id or the
 * files it holds under some paths, kept for the life of the process so a
 * long-running reader, the inspector's server, asks git once; a short
 * command never asks twice and gains nothing. Each answer is keyed on the
 * repository's root and the question; the store empties itself past its cap.
 */
export class FixedAnswers<T> {
  private readonly answers = new Map<string, T>();
  private readonly cap: number;
  constructor(cap = 20_000) {
    this.cap = cap;
  }

  /**
   * The answer to a question, asked of git only the first time.
   * @param root the repository root
   * @param question what is asked, every argument that fixes the answer
   * @param read how to ask git
   * @param keep whether an answer is kept: an unknown is asked again next time
   * @returns the answer
   */
  answer(root: string, question: string, read: () => T, keep: (value: T) => boolean): T {
    const key = `${resolve(root)}\0${question}`;
    const known = this.answers.get(key);
    if (known !== undefined) return known;
    const value = read();
    if (keep(value)) {
      if (this.answers.size >= this.cap) this.answers.clear();
      this.answers.set(key, value);
    }
    return value;
  }
}

const commitTrees = new FixedAnswers<TreeReading>();

/**
 * A pinned reading: the commit HEAD named when it began, and each read-only
 * git question it asked with git's answer, for that reading alone.
 */
interface PinnedReading {
  readonly root: string;
  readonly head: string;
  /** The whole state the reading reads, where its caller names one, so a reading made once for that state is shared. */
  readonly state: string | undefined;
  readonly reads: Map<string, Result<string, GitUnanswered>>;
  readonly exits: Map<string, number | undefined>;
}

let pinned: PinnedReading | undefined;

/**
 * Read with HEAD pinned to the commit it names now: within `read`, a
 * question about HEAD is asked about that commit by its id, so its answer is
 * one a commit's id fixes and is kept, and each read-only git question is
 * asked of git once, since nothing writes the repository while it reads (the
 * inspector pins HEAD for each document it builds). Outside a pinned reading
 * HEAD is asked as HEAD and every question is asked each time.
 * @param root the repository root
 * @param read the reading, synchronous
 * @returns what it returns
 */
export function withPinnedHead<T>(root: string, read: () => T, state?: string): T {
  const head = headCommit(root);
  const before = pinned;
  pinned =
    head.kind === "commit"
      ? { root: resolve(root), head: head.id, state, reads: new Map(), exits: new Map() }
      : undefined;
  try {
    return read();
  } finally {
    pinned = before;
  }
}

/**
 * The commit HEAD is pinned to for a root, or undefined outside a pinned reading.
 * @param root the repository root
 * @returns the commit's id, or undefined
 */
export function pinnedHead(root: string): string | undefined {
  return pinnedReading(root)?.head;
}

/**
 * One reading kept for the state a pinned reading names: asked once for that
 * state and that root, and asked again once a reading names another; outside
 * a pinned reading that names its state, asked each time. The inspector keeps
 * the status this way, so the documents built for one state run it once.
 */
export class OncePerState<T> {
  private kept: { readonly root: string; readonly state: string; readonly value: T } | undefined;

  /**
   * The reading, made once for the state the pinned reading names.
   * @param root the repository root
   * @param read how to make it
   * @returns the reading
   */
  answer(root: string, read: () => T): T {
    const reading = pinnedReading(root);
    if (reading?.state === undefined) return read();
    if (
      this.kept !== undefined &&
      this.kept.state === reading.state &&
      this.kept.root === reading.root
    )
      return this.kept.value;
    const value = read();
    this.kept = { root: reading.root, state: reading.state, value };
    return value;
  }
}

/** The pinned reading for a root, or undefined outside one. */
function pinnedReading(root: string): PinnedReading | undefined {
  return pinned !== undefined && pinned.root === resolve(root) ? pinned : undefined;
}

/**
 * The tree id of a commit by the same rule, the practice's own files left
 * out: its trees read by `git cat-file --batch`, the entries the rule drops
 * taken out and the trees above them hashed again here, the way git would
 * write them, or, where that read does not parse, built in a temporary
 * index. A commit named by its whole id is answered once a process for the
 * paths the lock names: the answer is kept by the commit's id together with
 * the set of paths left out, since the lock's list can change within one
 * process's life.
 * @param root the repository root
 * @param commit the commit
 * @returns the tree id, or unknown with git's reason
 */
export function commitTreeId(root: string, commit: string): TreeReading {
  const practice = practiceFiles(root);
  const read = (): TreeReading => {
    const id = treesWithout(root, [commit], practice).get(commit);
    return id === undefined ? commitTreeByIndex(root, commit, practice) : { kind: "tree", id };
  };
  return OBJECT_ID.test(commit)
    ? commitTrees.answer(
        root,
        `${commit}\0${practice.key}`,
        read,
        (reading) => reading.kind === "tree",
      )
    : read();
}

/**
 * The tree ids of many commits by the same rule, the practice's own files
 * left out, in one batched read for each depth of the paths left out: each
 * commit's top tree, then each tree below it that holds a path left out,
 * read by `git cat-file --batch`, the entries dropped and the trees above
 * them hashed as git hashes a tree. A commit already answered this process
 * for the same paths is not asked again, and one the batch cannot read is
 * answered by `commitTreeId`.
 * @param root the repository root
 * @param commits the commits
 * @returns each commit's tree id, or unknown with git's reason
 */
export function commitTreeIds(
  root: string,
  commits: readonly string[],
): ReadonlyMap<string, TreeReading> {
  const answers = new Map<string, TreeReading>();
  const practice = practiceFiles(root);
  const asked = [...new Set(commits)].filter((commit) => OBJECT_ID.test(commit));
  if (asked.length > 1) {
    const trees = treesWithout(root, asked, practice);
    for (const [commit, id] of trees)
      answers.set(
        commit,
        commitTrees.answer(
          root,
          `${commit}\0${practice.key}`,
          () => ({ kind: "tree", id }),
          () => true,
        ),
      );
  }
  for (const commit of commits)
    if (!answers.has(commit)) answers.set(commit, commitTreeId(root, commit));
  return answers;
}

/** The paths the rule drops below a tree, by name: a name that ends a path, or one that leads to more. */
interface DropNode {
  /** The entry leaves whole: `.greenline` at the top, or a path the lock names, where it is no tree. */
  readonly whole: boolean;
  readonly below: Map<string, DropNode>;
}

/** The rule's paths as a tree of names: `.greenline` at the top, and each path the lock names. */
function dropTree(practice: PracticeFiles): DropNode {
  const top: DropNode = { whole: false, below: new Map() };
  const at = (node: DropNode, name: string, whole: boolean): DropNode => {
    const known = node.below.get(name);
    const next: DropNode = {
      whole: whole || known?.whole === true,
      below: known?.below ?? new Map(),
    };
    node.below.set(name, next);
    return next;
  };
  at(top, ".greenline", true);
  for (const path of practice.paths) {
    const names = path.split("/");
    let node = top;
    names.forEach((name, index) => {
      node = at(node, name, index === names.length - 1);
    });
  }
  return top;
}

/** One entry of a tree object: its bytes up to its id, its mode, its name and its id's bytes. */
interface TreeEntry {
  readonly head: Buffer;
  readonly mode: string;
  readonly name: string;
  readonly id: Buffer;
}

/** A tree object's entries, in git's order; undefined where the bytes do not read as a tree. */
function treeEntries(content: Buffer, idBytes: number): readonly TreeEntry[] | undefined {
  const entries: TreeEntry[] = [];
  let at = 0;
  while (at < content.length) {
    const space = content.indexOf(32, at);
    const nul = content.indexOf(0, space + 1);
    if (space === -1 || nul === -1 || nul + 1 + idBytes > content.length) return undefined;
    entries.push({
      head: content.subarray(at, nul + 1),
      mode: content.subarray(at, space).toString("latin1"),
      name: content.subarray(space + 1, nul).toString("utf8"),
      id: content.subarray(nul + 1, nul + 1 + idBytes),
    });
    at = nul + 1 + idBytes;
  }
  return entries;
}

/** A tree's mode as git writes it in a tree object. */
const TREE_MODE = "40000";

/** An object `git cat-file --batch` answered: its id, its type and its bytes. */
interface ReadObject {
  readonly id: string;
  readonly type: string;
  readonly content: Buffer;
}

/** Read objects by name in one `git cat-file --batch`, each by the name asked; a name git does not hold is left out. */
function readObjects(root: string, names: readonly string[]): Map<string, ReadObject> {
  const found = new Map<string, ReadObject>();
  if (names.length === 0) return found;
  let out: Buffer;
  try {
    out = execFileSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: names.map((name) => `${name}\n`).join(""),
      stdio: ["pipe", "pipe", "ignore"],
      env: process.env,
      maxBuffer: 1024 * 1024 * 1024,
    });
  } catch {
    return found;
  }
  let at = 0;
  for (const name of names) {
    const lineEnd = out.indexOf(10, at);
    if (lineEnd === -1) break;
    const header = /^([0-9a-f]{40}|[0-9a-f]{64}) (\w+) (\d+)$/.exec(
      out.subarray(at, lineEnd).toString("latin1"),
    );
    at = lineEnd + 1;
    // A missing object answers one line, `<name> missing`, and no content.
    if (header === null) continue;
    const [, id = "", type = "", size = "0"] = header;
    const length = Number(size);
    found.set(name, { id, type, content: out.subarray(at, at + length) });
    at += length + 1;
  }
  return found;
}

/**
 * Each commit's code tree, the rule's entries dropped, hashed: the top trees
 * in one read, then the trees of each depth that hold a dropped path in one
 * read more; a commit whose tree git does not hold, or whose answer does
 * not read, is left out.
 */
function treesWithout(
  root: string,
  commits: readonly string[],
  practice: PracticeFiles,
): Map<string, string> {
  const found = new Map<string, string>();
  const drop = dropTree(practice);
  const tops = readObjects(
    root,
    commits.map((commit) => `${commit}^{tree}`),
  );
  // Every tree read, by its id.
  const contents = new Map<string, Buffer>();
  let width: number | undefined;
  let wanted = new Map<string, DropNode>();
  for (const top of tops.values()) {
    if (top.type !== "tree") continue;
    width ??= top.id.length;
    contents.set(top.id, top.content);
    wanted.set(top.id, drop);
  }
  if (width === undefined) return found;
  const idBytes = width / 2;
  // Each depth's trees that hold a dropped path, read in one batch.
  while (wanted.size > 0) {
    const next = new Map<string, DropNode>();
    for (const [id, node] of wanted)
      for (const entry of treeEntries(contents.get(id) ?? Buffer.alloc(0), idBytes) ?? []) {
        const below = node.below.get(entry.name);
        if (below === undefined || below.below.size === 0 || entry.mode !== TREE_MODE) continue;
        const child = entry.id.toString("hex");
        if (!contents.has(child)) next.set(child, below);
      }
    const read = readObjects(root, [...next.keys()]);
    for (const [id, object] of read) if (object.type === "tree") contents.set(id, object.content);
    wanted = new Map([...next].filter(([id]) => contents.has(id)));
  }
  const hash = (bytes: Buffer): string =>
    createHash(width === 40 ? "sha1" : "sha256")
      .update(`tree ${bytes.length}\0`, "latin1")
      .update(bytes)
      .digest("hex");
  // A tree's id once its dropped entries are out: null for a tree left empty, which git never writes below the top; undefined where it cannot be read.
  const memo = new Map<string, string | null | undefined>();
  const rewrite = (id: string, node: DropNode): string | null | undefined => {
    const key = `${id}\0${dropKey(node)}`;
    if (memo.has(key)) return memo.get(key);
    const content = contents.get(id);
    const entries = content === undefined ? undefined : treeEntries(content, idBytes);
    const result = entries === undefined ? undefined : rewritten(id, node, entries);
    memo.set(key, result);
    return result;
  };
  const rewritten = (
    id: string,
    node: DropNode,
    entries: readonly TreeEntry[],
  ): string | null | undefined => {
    const kept: Buffer[] = [];
    let changed = false;
    for (const entry of entries) {
      const below = node.below.get(entry.name);
      const isTree = entry.mode === TREE_MODE;
      // `.greenline` leaves whatever it is; a path the lock names leaves where it is no tree.
      if (below !== undefined && below.whole && (!isTree || node === drop)) {
        changed = true;
        continue;
      }
      if (below === undefined || !isTree || below.below.size === 0) {
        kept.push(entry.head, entry.id);
        continue;
      }
      const child = rewrite(entry.id.toString("hex"), below);
      if (child === undefined) return undefined;
      if (child === entry.id.toString("hex")) {
        kept.push(entry.head, entry.id);
        continue;
      }
      changed = true;
      if (child !== null) kept.push(entry.head, Buffer.from(child, "hex"));
    }
    if (!changed) return id;
    const bytes = Buffer.concat(kept);
    return bytes.length === 0 && node !== drop ? null : hash(bytes);
  };
  for (const commit of commits) {
    const top = tops.get(`${commit}^{tree}`);
    if (top?.type !== "tree") continue;
    const id = rewrite(top.id, drop);
    if (id !== undefined && id !== null) found.set(commit, id);
  }
  return found;
}

/** A name for each node of a drop tree, so one tree met under two nodes is rewritten for each. */
const dropKeys = new WeakMap<DropNode, number>();
let dropCount = 0;
function dropKey(node: DropNode): number {
  const known = dropKeys.get(node);
  if (known !== undefined) return known;
  dropCount += 1;
  dropKeys.set(node, dropCount);
  return dropCount;
}

/**
 * The tree id of a commit by the rule, built in a temporary index: the
 * commit's tree read in, the practice's own files dropped, the index written.
 * @param root the repository root
 * @param commit the commit
 * @param practice the paths the lock names, read now where not given
 * @returns the tree id, or unknown with git's reason
 */
export function commitTreeByIndex(
  root: string,
  commit: string,
  practice: PracticeFiles = practiceFiles(root),
): TreeReading {
  return treeOf(
    inTemporaryIndex(
      root,
      "empty",
      [["read-tree", `${commit}^{tree}`], ...dropPractice(practice)],
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
