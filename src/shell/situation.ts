import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { isChangeId, parseRecordForm } from "../core/change.ts";
import { changeOfBranch, isDefaultBranch, recordFacts } from "../core/git-hooks.ts";
import { parseWorktreeList, type GroundSetting, type WorktreeEntry } from "../core/ground.ts";
import {
  KNOWLEDGE_HOMES,
  documentsAt,
  languagesAt,
  orientationOf,
  remoteKindOf,
  type CommitsReading,
  type GroundReading,
  type KnowledgeHome,
  type LanguagesReading,
  type OpenElsewhere,
  type Orientation,
  type PredatingBranches,
  type RecordsReading,
  type RemoteReading,
  type Situation,
  type StoppedElsewhere,
} from "../core/situation.ts";
import { readGit } from "./code-tree.ts";
import { NO_PROCEED } from "../core/manifest.ts";
import { branchFacts, currentBranch, holdsManifest, practiceBase } from "./hooks.ts";

/**
 * Gather the situation `status` prints above the changes
 * (`src/core/situation.ts`) from the tree and `.git` alone. Every git
 * command here only reads: `rev-parse`, `symbolic-ref` without a new value,
 * `rev-list`, `ls-files`, `for-each-ref`, `ls-tree`, `cat-file` (`-e` among
 * them),
 * `worktree list`, `remote` and `remote get-url`, run by
 * `readGit` in `src/shell/code-tree.ts`; none contacts a remote, writes the
 * index, a ref or an object, or records a time. Where git cannot answer,
 * each git fact is unknown with git's reason, never guessed.
 */

/** What the caller already read: the records on disk and the paths greenline installed. */
export interface SituationContext {
  /** How many change records the ledger holds; undefined when the ledger cannot be read. */
  readonly records: number | undefined;
  /** The ids of the change records on disk, which the changes view already shows. */
  readonly onDisk: ReadonlySet<string>;
  /** The paths greenline installed, from the lock. */
  readonly installed: ReadonlySet<string>;
  /** The manifest's standing `ground` preference; undefined where it sets none or cannot be read. */
  readonly groundSetting?: GroundSetting | undefined;
  /** The manifest's `proceed`, a mode's name or `none`; undefined where the manifest cannot be read (J-213 S1). */
  readonly proceed?: string | undefined;
}

const LEDGER = ".greenline/ledger";
const BRANCHES = "refs/heads/greenline/";
const HEADS = "refs/heads/";
const REMOTES = "refs/remotes/";
const RECORD = /^\.greenline\/ledger\/([^/]+)\.md$/;

/** Whether git can read a repository at the root; its reason when it cannot. */
function unreadable(root: string): string | undefined {
  const directory = readGit(root, ["rev-parse", "--git-dir"]);
  if (directory._tag === "ok") return undefined;
  return directory.error.kind === "missing" ? "git cannot run" : "git cannot read this repository";
}

function commitsOf(root: string): CommitsReading {
  const why = unreadable(root);
  if (why !== undefined) return { kind: "unknown", why };
  const named = readGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const branch = named._tag === "ok" ? named.value.trim() : null;
  const head = readGit(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head._tag === "err") return { kind: "known", count: 0, branch };
  const counted = readGit(root, ["rev-list", "--count", "HEAD"]);
  if (counted._tag === "err") return { kind: "unknown", why: "git could not count the commits" };
  return { kind: "known", count: Number(counted.value.trim()), branch };
}

/** Whether a name stands in its folder exactly as written, whatever the filesystem's case rule. */
function standsAsWritten(root: string, path: string, folder: boolean): boolean {
  try {
    const names = readdirSync(join(root, dirname(path)));
    if (!names.includes(path.slice(path.lastIndexOf("/") + 1))) return false;
    const stat = statSync(join(root, path));
    return folder ? stat.isDirectory() : stat.isFile();
  } catch {
    return false;
  }
}

/**
 * The knowledge homes standing at the root, as the situation lists them;
 * the landing's offer reads the contributing guide among them (J-228 S1).
 * @param root the repository root
 * @returns each home found, a folder's path ending in a slash
 */
export function homesOf(root: string): readonly KnowledgeHome[] {
  return KNOWLEDGE_HOMES.filter((home) => standsAsWritten(root, home.path, home.folder)).map(
    (home) => ({ kind: home.kind, path: home.folder ? `${home.path}/` : home.path }),
  );
}

/** The languages at the roots and the documents counted, each from one listing of the files. */
interface TreeReading {
  readonly languages: LanguagesReading;
  /** Undefined where the files could not be listed. */
  readonly documents: number | undefined;
}

/** The files git tracks and the untracked ones it would add, no ignored one: what the repository holds. */
function treeOf(root: string, installed: ReadonlySet<string>): TreeReading {
  const why = unreadable(root);
  if (why !== undefined) return { languages: { kind: "unknown", why }, documents: undefined };
  const listed = readGit(root, [
    "-c",
    "core.fsmonitor=false",
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  if (listed._tag === "err")
    return {
      languages: { kind: "unknown", why: "git could not list the files" },
      documents: undefined,
    };
  const files = [...new Set(listed.value.split("\0").filter((path) => path !== ""))];
  return {
    languages: { kind: "known", languages: languagesAt(files, installed) },
    documents: documentsAt(files, installed),
  };
}

/**
 * The checkouts git lists, the main one first; none when git cannot list them.
 * @param root the repository root of any checkout of the repository
 * @returns each checkout's path, its branch and whether it is the main one
 */
export function worktreesOf(root: string): readonly WorktreeEntry[] {
  const listed = readGit(root, ["worktree", "list", "--porcelain"]);
  return listed._tag === "ok" ? parseWorktreeList(listed.value) : [];
}

/** A worktree's path from the main checkout's root where it stands inside it, else as git gives it. */
function shownPath(main: string | undefined, path: string): string {
  if (main === undefined) return path;
  const inside = relative(main, path);
  return inside === "" || inside.startsWith("..") || isAbsolute(inside)
    ? path
    : inside.split(sep).join("/");
}

/** Whether two paths name the same directory, their links resolved. */
function sameDirectory(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}

/**
 * The changes whose records stand open in the working tree of another
 * checkout git lists (J-143 S2): a change open in a worktree of its own is
 * named from the main checkout, and the main checkout's from a worktree,
 * each with the checkout's path from the main checkout's root. The
 * checkout at the root is left out, since its records are the ones on disk.
 * A copy standing open in another checkout of a record this checkout holds
 * done or dropped is returned apart, `left` naming this checkout's state: it
 * is a copy left behind after the change closed here, never an open change
 * (J-228 S1, the run j201t-linear-visuals, whose worktrees kept their open
 * copies after their merges).
 * @param root the repository root of this checkout
 * @returns each open change or copy left behind and its checkout's path, in git's order and by id
 */
export function openInWorktrees(root: string): readonly OpenElsewhere[] {
  const checkouts = worktreesOf(root);
  if (checkouts.length < 2) return [];
  const main = checkouts.find((entry) => entry.main)?.path;
  // A change open in this checkout too is this checkout's, wherever else a copy of its record stands open.
  const here = recordStates(root);
  return checkouts.flatMap((entry) => {
    if (sameDirectory(entry.path, root)) return [];
    const path = shownPath(main, entry.path);
    return [...recordStates(entry.path)].flatMap(([id, state]): readonly OpenElsewhere[] => {
      const own = here.get(id);
      if (state !== "open" || own === "open") return [];
      return own === "done" || own === "dropped" ? [{ id, path, left: own }] : [{ id, path }];
    });
  });
}

/** The change records a checkout's working tree holds, each with its state, by id; none where its ledger cannot be read. */
function recordStates(checkout: string): ReadonlyMap<string, string | undefined> {
  let names: readonly string[];
  try {
    names = readdirSync(join(checkout, LEDGER));
  } catch {
    return new Map();
  }
  const ids = names
    .flatMap((name) => RECORD.exec(`${LEDGER}/${name}`)?.[1] ?? [])
    .filter((id) => isChangeId(id))
    .sort();
  return new Map(
    ids.flatMap((id): readonly [string, string | undefined][] => {
      try {
        return [[id, recordFacts(readFileSync(join(checkout, LEDGER, `${id}.md`), "utf8")).state]];
      } catch {
        return [];
      }
    }),
  );
}

/**
 * The changes stopped on the other local `greenline/*` branches: each
 * record directly under a branch's ledger whose change has no record on
 * disk, read for its form alone, and named when its state is stopped. The
 * branch HEAD names is left out, since its records are the ones on disk.
 */
function stoppedElsewhere(root: string, onDisk: ReadonlySet<string>): StoppedElsewhere {
  const why = unreadable(root);
  if (why !== undefined) return { kind: "unknown", why };
  const current = readGit(root, ["symbolic-ref", "--quiet", "HEAD"]);
  const here = current._tag === "ok" ? current.value.trim() : undefined;
  const refs = readGit(root, ["for-each-ref", "--format=%(refname)", BRANCHES]);
  if (refs._tag === "err") return { kind: "unknown", why: "git could not list the branches" };
  const stopped = new Set<string>();
  for (const ref of refs.value.split("\n").map((line) => line.trim())) {
    if (ref === "" || ref === here) continue;
    const listed = readGit(root, ["ls-tree", "-z", "--name-only", ref, "--", `${LEDGER}/`]);
    if (listed._tag === "err")
      return { kind: "unknown", why: `git could not read the ledger of ${ref}` };
    for (const path of listed.value.split("\0")) {
      const id = RECORD.exec(path)?.[1];
      if (id === undefined || id === "README" || onDisk.has(id) || stopped.has(id)) continue;
      const text = readGit(root, ["cat-file", "blob", `${ref}:${path}`]);
      if (text._tag === "err") continue;
      const form = parseRecordForm(`${id}.md`, text.value);
      if (form._tag === "ok" && form.value.position.state === "stopped") stopped.add(id);
    }
  }
  // A stopped change whose branch a worktree holds is resumed there, so its path is named.
  const checkouts = worktreesOf(root);
  const main = checkouts.find((entry) => entry.main)?.path;
  const changes = [...stopped].sort();
  const worktrees = changes.flatMap((id) => {
    const held = checkouts.find((entry) => !entry.main && entry.branch === `greenline/${id}`);
    return held === undefined ? [] : [{ id, path: shownPath(main, held.path) }];
  });
  return { kind: "known", changes, worktrees };
}

/**
 * The branches cut before the install (J-213 S1, the run
 * j196t-wait-proceed-1c): where the default branch holds
 * `.greenline/manifest.json` (`practiceBase`), each local branch and each
 * remote-tracking branch no local branch names whose commit holds none, by
 * one `git for-each-ref` and one `git cat-file -e` a branch, as
 * `predatingBranch` reads the branch HEAD names. The default branch's own
 * copies, a remote's `HEAD` and the branch HEAD names are left out: its own
 * line names a branch HEAD stands on.
 * @param root the repository root
 * @param proceed the manifest's `proceed`, undefined where it cannot be read
 * @returns the branches, local ones first, each group in git's order
 */
export function readPredating(root: string, proceed: string | undefined): PredatingBranches {
  const why = unreadable(root);
  if (why !== undefined) return { kind: "unknown", why };
  const mode = proceed === undefined || proceed === NO_PROCEED ? null : proceed;
  const base = practiceBase(root);
  if (base === undefined) return { kind: "known", base: null, branches: [], proceed: mode };
  const refs = readGit(root, [
    "for-each-ref",
    "--format=%(refname) %(symref)",
    "refs/heads/",
    "refs/remotes/",
  ]);
  if (refs._tag === "err") return { kind: "unknown", why: "git could not list the branches" };
  const listed = refs.value
    .split("\n")
    .map((line) => line.trim().split(" "))
    .filter(([ref, symref]) => ref !== undefined && ref !== "" && (symref ?? "") === "")
    .map(([ref]) => ref ?? "");
  const locals = new Set(
    listed.filter((ref) => ref.startsWith(HEADS)).map((ref) => ref.slice(HEADS.length)),
  );
  const here = currentBranch(root);
  const candidates = listed.flatMap((ref): { ref: string; name: string }[] => {
    if (ref.startsWith(HEADS)) {
      const name = ref.slice(HEADS.length);
      return name === base || name === here ? [] : [{ ref, name }];
    }
    const name = ref.slice(REMOTES.length);
    const branch = name.slice(name.indexOf("/") + 1);
    // A remote's copy of the default branch is the default branch, and a local branch of the same name is the one worked on.
    return branch === base || branch === "HEAD" || locals.has(branch) ? [] : [{ ref, name }];
  });
  const branches: string[] = [];
  for (const { ref, name } of candidates) {
    const holds = holdsManifest(root, ref);
    if (holds === undefined) return { kind: "unknown", why: "git cannot run" };
    if (!holds) branches.push(name);
  }
  return { kind: "known", base, branches, proceed: mode };
}

/**
 * The ground of the change open on the branch HEAD names, its record's
 * lines as the working tree holds them, or the manifest's preference while
 * none is open.
 */
function groundOf(root: string, setting: GroundSetting | undefined): GroundReading {
  const facts = branchFacts(root);
  const change = changeOfBranch(facts.current, facts);
  if (change === undefined)
    return {
      kind: "none",
      setting: setting ?? null,
      branch: facts.current ?? null,
      offered:
        facts.current !== undefined &&
        facts.hasRemote &&
        isDefaultBranch(facts.current, facts.defaultBranch),
    };
  const record = facts.records.find((entry) => entry.id === change.id)?.facts;
  return {
    kind: "change",
    id: change.id,
    branch: facts.current ?? null,
    ground: record?.ground ?? null,
    agent: record?.agent ?? null,
  };
}

/**
 * Whether any commit a ref reaches, a local or a remote-tracking branch's
 * among them, holds a change record directly under the ledger, the ledger's
 * guide left out: one read-only `git log --all` with a pathspec. A clone
 * whose records sit only on `origin/greenline/*` has had its orientation.
 * @param root the repository root
 * @returns true where one does, false where none does, undefined where git cannot say
 */
function recordsOnAnyBranch(root: string): boolean | undefined {
  if (unreadable(root) !== undefined) return undefined;
  const found = readGit(root, [
    "log",
    "--all",
    "-1",
    "--format=%H",
    "--",
    `:(glob)${LEDGER}/*.md`,
    `:(exclude)${LEDGER}/README.md`,
  ]);
  return found._tag === "ok" ? found.value.trim() !== "" : undefined;
}

/**
 * The remote a landing goes to and whether it is a forge (J-130 S1): `origin`,
 * or the first remote `git remote` lists where none is named so, its URL as
 * `git remote get-url` reads it from the configuration, classified by
 * `remoteKindOf`. No command here contacts the remote.
 * @param root the repository root
 * @returns the reading; none where the repository names no remote, unknown where git cannot say
 */
export function readRemote(root: string): RemoteReading {
  const why = unreadable(root);
  if (why !== undefined) return { kind: "unknown", why };
  const listed = readGit(root, ["remote"]);
  if (listed._tag === "err") return { kind: "unknown", why: "git could not list the remotes" };
  const names = listed.value
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const name = names.includes("origin") ? "origin" : names[0];
  if (name === undefined) return { kind: "none" };
  const url = readGit(root, ["remote", "get-url", name]);
  const kind = remoteKindOf(url._tag === "ok" ? url.value : "");
  return kind.kind === "forge"
    ? { kind: "forge", name, host: kind.host }
    : { kind: "not-forge", name, why: kind.why };
}

function recordsOf(records: number | undefined): RecordsReading {
  return records === undefined
    ? { kind: "unknown", why: "the ledger cannot be read" }
    : { kind: "known", count: records };
}

/**
 * Read the orientation alone, as the mirror prints it while no change is
 * open (J-129 S1): the same facts and the same classification `status`'s
 * situation uses, without the homes and the ground.
 * @param root the repository root
 * @param context the records on disk and the paths greenline installed
 * @returns the orientation
 */
export function readOrientation(
  root: string,
  context: Omit<SituationContext, "groundSetting">,
): Orientation {
  const records = recordsOf(context.records);
  // A record on disk settles it: no orientation, and no git command is run.
  if (records.kind === "known" && records.count > 0) return { kind: "none" };
  if (recordsOnAnyBranch(root) === true) return { kind: "none" };
  const tree = treeOf(root, context.installed);
  return orientationOf({
    commits: commitsOf(root),
    records,
    stoppedElsewhere: stoppedElsewhere(root, context.onDisk),
    recordsElsewhere: recordsOnAnyBranch(root),
    languages: tree.languages,
    documents: tree.documents,
  });
}

/**
 * Read the situation of the repository at the root.
 * @param root the repository root
 * @param context the records on disk and the paths greenline installed
 * @returns the situation; each fact git could not give is unknown with why
 */
export function readSituation(root: string, context: SituationContext): Situation {
  const commits = commitsOf(root);
  const records = recordsOf(context.records);
  const tree = treeOf(root, context.installed);
  // A change open in another checkout is open there, never stopped (J-143 S2).
  const openElsewhere = openInWorktrees(root);
  const stopped = stoppedElsewhere(
    root,
    new Set([...context.onDisk, ...openElsewhere.map((entry) => entry.id)]),
  );
  return {
    commits,
    records,
    homes: homesOf(root),
    languages: tree.languages,
    orientation: orientationOf({
      commits,
      records,
      stoppedElsewhere: stopped,
      // Read only while no record is on disk, where it can change the answer.
      recordsElsewhere:
        records.kind === "known" && records.count === 0 ? recordsOnAnyBranch(root) : undefined,
      languages: tree.languages,
      documents: tree.documents,
    }),
    stoppedElsewhere: stopped,
    predating: readPredating(root, context.proceed),
    openElsewhere,
    remote: readRemote(root),
    ground: groundOf(root, context.groundSetting),
  };
}
