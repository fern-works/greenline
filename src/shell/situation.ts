import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRecordForm } from "../core/change.ts";
import {
  KNOWLEDGE_HOMES,
  languagesAt,
  type CommitsReading,
  type KnowledgeHome,
  type LanguagesReading,
  type Situation,
  type StoppedElsewhere,
} from "../core/situation.ts";
import { readGit } from "./code-tree.ts";

/**
 * Gather the situation `status` prints above the changes
 * (`src/core/situation.ts`) from the tree and `.git` alone. Every git
 * command here only reads: `rev-parse`, `symbolic-ref` without a new value,
 * `rev-list`, `ls-files`, `for-each-ref`, `ls-tree` and `cat-file`, run by
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
}

const LEDGER = ".greenline/ledger";
const BRANCHES = "refs/heads/greenline/";
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

function homesOf(root: string): readonly KnowledgeHome[] {
  return KNOWLEDGE_HOMES.filter((home) => standsAsWritten(root, home.path, home.folder)).map(
    (home) => ({ kind: home.kind, path: home.folder ? `${home.path}/` : home.path }),
  );
}

/** The files git tracks and the untracked ones it would add, no ignored one: what the repository holds. */
function languagesOf(root: string, installed: ReadonlySet<string>): LanguagesReading {
  const why = unreadable(root);
  if (why !== undefined) return { kind: "unknown", why };
  const listed = readGit(root, [
    "-c",
    "core.fsmonitor=false",
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  if (listed._tag === "err") return { kind: "unknown", why: "git could not list the files" };
  const files = [...new Set(listed.value.split("\0").filter((path) => path !== ""))];
  return { kind: "known", languages: languagesAt(files, installed) };
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
  return { kind: "known", changes: [...stopped].sort() };
}

/**
 * Read the situation of the repository at the root.
 * @param root the repository root
 * @param context the records on disk and the paths greenline installed
 * @returns the situation; each fact git could not give is unknown with why
 */
export function readSituation(root: string, context: SituationContext): Situation {
  return {
    commits: commitsOf(root),
    records:
      context.records === undefined
        ? { kind: "unknown", why: "the ledger cannot be read" }
        : { kind: "known", count: context.records },
    homes: homesOf(root),
    languages: languagesOf(root, context.installed),
    stoppedElsewhere: stoppedElsewhere(root, context.onDisk),
  };
}
