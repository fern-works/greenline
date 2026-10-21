import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { err, ok, type Result } from "../commons/result.ts";
import { parseJson } from "../core/contract.ts";
import { parseCorpusManifest, type CorpusManifest } from "../core/corpus.ts";
import type { EntryFile } from "./chain.ts";
import type { SourceName, Snapshots } from "./recipe.ts";
import type { SkillFile } from "./render.ts";
import type { View } from "./views.ts";

/**
 * The corpus on disk, for the recipe instrument
 * (`workshop/components/recipes.md`): the only module under `src/corpus/`
 * that reads or writes the corpus. It reads the manifest and its pins, the
 * frozen snapshots, their inventories and licence files, the recipes, the
 * committed skill directories, the fresh chain's entries and the committed
 * views, and, beside the corpus, whether the repository holds the workshop
 * and a craft page of it; it writes a drafted or re-anchored recipe, a rendered skill
 * directory, a new snapshot with its inventory, the entries a pinned
 * snapshot gains at its own commit, the manifest a refresh moves, a new entry and the views; and it runs the fetch below, the
 * instrument's one read that leaves the machine. It reads no environment
 * variable itself: the fetch's git runs with the environment its caller
 * hands over.
 */

/** The fresh chain's directory under the corpus (`workshop/components/ledger.md`). */
const ENTRIES = "ledger/entries";

/** The workshop's directory beside the corpus, in the repository that holds both. */
const WORKSHOP = "workshop";

/**
 * Whether the repository that holds the corpus holds the workshop: the
 * outbox of handoffs is a workshop view, rendered and checked only there,
 * so a tree that carries the corpus without the workshop has no outbox.
 * @param corpus the corpus directory
 * @returns true when the workshop's directory stands beside the corpus
 */
export function holdsWorkshop(corpus: string): boolean {
  return existsSync(join(corpus, "..", WORKSHOP));
}

/**
 * Whether the workshop beside the corpus holds a craft's page, which a
 * handoff to that craft names.
 * @param corpus the corpus directory
 * @param name the craft's page name, `craft-<name>`
 * @returns true when `workshop/skills/<name>/SKILL.md` exists
 */
export function hasCraftPage(corpus: string, name: string): boolean {
  return existsSync(join(corpus, "..", WORKSHOP, "skills", name, "SKILL.md"));
}

/** The register's rows as they stood before the old ledger, frozen; read while the file exists. */
const FROZEN_ROWS = "ledger/sources-before-the-ledger.md";

/** A corpus file that cannot be read or written as it must be. */
class CorpusFileFailed extends Error {
  readonly _tag = "CorpusFileFailed" as const;
  readonly path: string;
  /** The repository-relative paths written before the failure; none when nothing was. */
  readonly wrote: readonly string[];
  constructor(path: string, message: string, wrote: readonly string[] = []) {
    super(`${path}: ${message}`);
    this.path = path;
    this.wrote = wrote;
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * The corpus manifest.
 * @param corpus the corpus directory
 * @returns the manifest, or why it cannot be read
 */
export function readManifest(corpus: string): Result<CorpusManifest, CorpusFileFailed> {
  const path = join(corpus, "manifest.json");
  if (!isFile(path)) return err(new CorpusFileFailed(path, "the corpus manifest is missing"));
  const manifest = parseCorpusManifest(readFileSync(path, "utf8"), path);
  return manifest._tag === "err"
    ? err(new CorpusFileFailed(path, manifest.error.message))
    : ok(manifest.value);
}

/**
 * The frozen snapshots the manifest pins, read on demand. A file that is
 * missing or is not UTF-8 text reads as undefined.
 * @param corpus the corpus directory
 * @param instead a snapshot path under the corpus to read for a source in place of its pin, as `verify` reads a snapshot the manifest no longer pins
 * @returns the snapshots, or why the manifest cannot be read
 */
export function readSnapshots(
  corpus: string,
  instead: ReadonlyMap<string, string> = new Map(),
): Result<Snapshots, CorpusFileFailed> {
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return manifest;
  const roots = new Map(
    manifest.value.sources.map((source) => [
      source.name,
      join(corpus, instead.get(source.name) ?? source.snapshot),
    ]),
  );
  const bytes = (source: SourceName, file: string): Uint8Array | undefined => {
    const root = roots.get(source);
    if (root === undefined || !isFile(join(root, file))) return undefined;
    return new Uint8Array(readFileSync(join(root, file)));
  };
  return ok({
    sources: new Set(roots.keys()),
    bytes,
    text: (source, file) => {
      const raw = bytes(source, file);
      if (raw === undefined) return undefined;
      try {
        return utf8.decode(raw);
      } catch {
        return undefined;
      }
    },
  });
}

/** The modes definition's recipe's name under `recipes/`: no skill takes it. */
export const MODES_RECIPE = "modes";

/**
 * The skills' recipes on disk, by skill name; the modes recipe is not a skill's.
 * @param corpus the corpus directory
 * @returns the names of `recipes/<skill>.json`, sorted; none when the directory is absent
 */
export function recipeNames(corpus: string): readonly string[] {
  const directory = join(corpus, "recipes");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter((name) => name !== MODES_RECIPE)
    .sort();
}

/**
 * The modes definition's bytes, which its recipe and a `modes` change entry account for.
 * @param corpus the corpus directory
 * @returns the bytes of `runtime/modes.json`, or undefined when it is absent
 */
export function readModesBytes(corpus: string): Uint8Array | undefined {
  const path = join(corpus, "runtime", "modes.json");
  return isFile(path) ? new Uint8Array(readFileSync(path)) : undefined;
}

/** A recipe file: its bytes, which a change entry's digest covers, and their text. */
export interface RecipeFile {
  readonly bytes: Uint8Array;
  /** The bytes as UTF-8 text; undefined when they are not UTF-8. */
  readonly text: string | undefined;
}

/**
 * A recipe file's bytes and text.
 * @param corpus the corpus directory
 * @param skill a skill name the caller has checked
 * @returns the file, or undefined when there is no such recipe
 */
export function readRecipe(corpus: string, skill: string): RecipeFile | undefined {
  const path = join(corpus, "recipes", `${skill}.json`);
  if (!isFile(path)) return undefined;
  const bytes = new Uint8Array(readFileSync(path));
  try {
    return { bytes, text: utf8.decode(bytes) };
  } catch {
    return { bytes, text: undefined };
  }
}

/**
 * Write a recipe `refresh` re-anchored over the one on disk.
 * @param corpus the corpus directory
 * @param skill a skill name the caller has checked
 * @param text the re-anchored recipe's text
 * @returns the repository-relative path written, or the write that failed
 */
export function rewriteRecipe(
  corpus: string,
  skill: string,
  text: string,
): Result<string, CorpusFileFailed> {
  return writeAt(join(corpus, "recipes", `${skill}.json`), text, `corpus/recipes/${skill}.json`);
}

/** Write a file, making its directory, over the one there unless `fresh`; name it by its repository-relative path. */
function writeAt(
  path: string,
  text: string,
  named: string,
  fresh = false,
): Result<string, CorpusFileFailed> {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, fresh ? { flag: "wx" } : {});
  } catch (cause) {
    return err(new CorpusFileFailed(path, `cannot be written: ${String(cause)}`));
  }
  return ok(named);
}

/**
 * Write a recipe `draft` proposed; a recipe that exists is never rewritten.
 * @param corpus the corpus directory
 * @param skill a skill name the caller has checked
 * @param text the recipe's text
 * @returns the repository-relative path written, or the write that failed
 */
export function writeRecipe(
  corpus: string,
  skill: string,
  text: string,
): Result<string, CorpusFileFailed> {
  return writeAt(
    join(corpus, "recipes", `${skill}.json`),
    text,
    `corpus/recipes/${skill}.json`,
    true,
  );
}

/**
 * The committed files of a skill directory.
 * @param corpus the corpus directory
 * @param skill a skill name the caller has checked
 * @returns every file with its bytes, by path; none when the directory is absent
 */
export function readSkillDirectory(corpus: string, skill: string): readonly SkillFile[] {
  const root = join(corpus, "skills", skill);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map(String)
    .map((path) => path.split("\\").join("/"))
    .filter((path) => isFile(join(root, path)))
    .sort()
    .map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(root, path))) }));
}

/**
 * Write a rendered skill directory's files; files the rendering does not
 * hold are left for `verify` to name.
 * @param corpus the corpus directory
 * @param skill a skill name the caller has checked
 * @param files the rendered files
 * @returns the paths written, or the write that failed
 */
export function writeSkillDirectory(
  corpus: string,
  skill: string,
  files: readonly SkillFile[],
): Result<readonly string[], CorpusFileFailed> {
  const root = join(corpus, "skills", skill);
  for (const file of files) {
    const path = join(root, file.path);
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.bytes);
    } catch (cause) {
      return err(new CorpusFileFailed(path, `cannot be written: ${String(cause)}`));
    }
  }
  return ok(files.map((file) => file.path));
}

/**
 * The fresh chain's entry files.
 * @param corpus the corpus directory
 * @returns every `ledger/entries/*.json` with its bytes, by name; none when the directory is absent
 */
export function readEntryFiles(corpus: string): readonly EntryFile[] {
  const directory = join(corpus, ENTRIES);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json") && isFile(join(directory, name)))
    .sort()
    .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(directory, name))) }));
}

/**
 * A text file the caller names, such as the entry handed to `record`.
 * @param path the file's path
 * @returns its text, or undefined when there is no such file
 */
export function readTextFile(path: string): string | undefined {
  return isFile(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * Write a new entry; a file that exists is never rewritten.
 * @param corpus the corpus directory
 * @param id the entry's id, which names its file
 * @param text the entry's canonical bytes
 * @returns the repository-relative path written, or the write that failed
 */
export function writeEntry(
  corpus: string,
  id: string,
  text: string,
): Result<string, CorpusFileFailed> {
  return writeAt(join(corpus, ENTRIES, `${id}.json`), text, `corpus/${ENTRIES}/${id}.json`, true);
}

/**
 * A snapshot's licence file.
 * @param corpus the corpus directory
 * @param snapshot the snapshot's path under the corpus, as the manifest states it
 * @returns the text of its `LICENSE`, or undefined when it carries none
 */
export function readLicence(corpus: string, snapshot: string): string | undefined {
  return readTextFile(join(corpus, snapshot, "LICENSE"));
}

/**
 * The sources register's frozen rows, while their file exists.
 * @param corpus the corpus directory
 * @returns the rows' text, or undefined
 */
export function readFrozenRows(corpus: string): string | undefined {
  return readTextFile(join(corpus, FROZEN_ROWS));
}

/**
 * A committed view, at its path in the repository that holds the corpus.
 * @param corpus the corpus directory
 * @param path the view's repository-relative path
 * @returns its text, or undefined when there is no such file
 */
export function readView(corpus: string, path: string): string | undefined {
  return readTextFile(join(corpus, "..", path));
}

/**
 * Write the views at their paths in the repository that holds the corpus.
 * @param corpus the corpus directory
 * @param views each view's repository-relative path and text
 * @returns the paths written, or the write that failed
 */
export function writeViews(
  corpus: string,
  views: readonly View[],
): Result<readonly string[], CorpusFileFailed> {
  for (const view of views) {
    const path = join(corpus, "..", view.path);
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, view.text);
    } catch (cause) {
      return err(new CorpusFileFailed(path, `cannot be written: ${String(cause)}`));
    }
  }
  return ok(views.map((view) => view.path));
}

/**
 * The manifest's text, which `refresh` rewrites in place.
 * @param corpus the corpus directory
 * @returns its text, or undefined when there is none
 */
export function readManifestText(corpus: string): string | undefined {
  return readTextFile(join(corpus, "manifest.json"));
}

/**
 * Write the manifest a refresh moved.
 * @param corpus the corpus directory
 * @param text the manifest's new text, which the caller has parsed
 * @returns the repository-relative path written, or the write that failed
 */
export function writeManifestText(corpus: string, text: string): Result<string, CorpusFileFailed> {
  return writeAt(join(corpus, "manifest.json"), text, "corpus/manifest.json");
}

/** A snapshot directory on disk, `upstream/<source>/<commit>` under the corpus. */
export interface SnapshotDirectory {
  readonly source: string;
  readonly commit: string;
  /** Its path under the corpus, as the manifest states a pin. */
  readonly snapshot: string;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Every snapshot directory under `corpus/upstream/`, pinned or not.
 * @param corpus the corpus directory
 * @returns each `upstream/<source>/<commit>` directory, sorted; none when there is no `upstream`
 */
export function snapshotDirectories(corpus: string): readonly SnapshotDirectory[] {
  const upstream = join(corpus, "upstream");
  if (!isDirectory(upstream)) return [];
  return readdirSync(upstream)
    .sort()
    .filter((source) => isDirectory(join(upstream, source)))
    .flatMap((source) =>
      readdirSync(join(upstream, source))
        .sort()
        .filter((commit) => isDirectory(join(upstream, source, commit)))
        .map((commit) => ({ source, commit, snapshot: `upstream/${source}/${commit}` })),
    );
}

/** Every file under a directory by its path from it, each directory's names visited in sorted order: the inventory's order. */
function filesUnder(root: string): readonly string[] {
  const out: string[] = [];
  const visit = (relative: string): void => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      const path = relative === "" ? name : `${relative}/${name}`;
      if (isDirectory(join(root, path))) visit(path);
      else out.push(path);
    }
  };
  if (isDirectory(root)) visit("");
  return out;
}

/**
 * The files of a snapshot, or of one directory inside it.
 * @param corpus the corpus directory
 * @param snapshot the snapshot's path under the corpus
 * @param inside a directory inside the snapshot; the whole snapshot when empty
 * @returns every file's bytes by its path from that directory, in the inventory's order; none when it is absent
 */
export function readSnapshotFiles(
  corpus: string,
  snapshot: string,
  inside = "",
): ReadonlyMap<string, Uint8Array> {
  const root = join(corpus, snapshot, inside);
  return new Map(
    filesUnder(root).map((path) => [path, new Uint8Array(readFileSync(join(root, path)))]),
  );
}

/** Where one entry of a snapshot came from: its directory in the snapshot and its path upstream. */
export interface SnapshotEntry {
  readonly name: string;
  readonly path: string;
}

const inventoryEntries = z.object({
  entries: z.array(z.object({ name: z.string(), path: z.string() })).default([]),
});

/**
 * The entries a snapshot's inventory records beside its files, which
 * `refresh` writes; an inventory written before it records none.
 * @param corpus the corpus directory
 * @param snapshot the snapshot's path under the corpus
 * @returns the recorded entries; none when the inventory is absent or records none
 */
export function readInventoryEntries(corpus: string, snapshot: string): readonly SnapshotEntry[] {
  const text = readTextFile(join(corpus, `${snapshot}.inventory.json`));
  const parsed = inventoryEntries.safeParse(text === undefined ? {} : parseJson(text));
  return parsed.success ? parsed.data.entries : [];
}

function sameFiles(
  left: ReadonlyMap<string, Uint8Array>,
  right: ReadonlyMap<string, Uint8Array>,
): boolean {
  if (left.size !== right.size) return false;
  return [...left].every(([path, bytes]) => {
    const other = right.get(path);
    return other !== undefined && sha256Hex(other) === sha256Hex(bytes);
  });
}

/**
 * Write a new snapshot and its inventory, `<snapshot>.inventory.json`: the
 * commit, every file in the inventory's order with its sha256, and the
 * entries the snapshot holds with their paths upstream. A snapshot is
 * immutable: one on disk is never rewritten, and is accepted only when it
 * holds exactly these bytes.
 * @param corpus the corpus directory
 * @param snapshot the snapshot's path under the corpus, `upstream/<source>/<commit>`
 * @param commit the full commit the inventory records
 * @param files every file's bytes by its path in the snapshot
 * @param entries the snapshot's entries and their paths upstream
 * @returns the repository-relative paths written, none when the same snapshot is on disk, or why it cannot be written
 */
export function writeSnapshot(
  corpus: string,
  snapshot: string,
  commit: string,
  files: ReadonlyMap<string, Uint8Array>,
  entries: readonly SnapshotEntry[],
): Result<readonly string[], CorpusFileFailed> {
  const root = join(corpus, snapshot);
  if (existsSync(root))
    return sameFiles(readSnapshotFiles(corpus, snapshot), files)
      ? ok([])
      : err(
          new CorpusFileFailed(
            root,
            "a snapshot is immutable, and the one on disk holds other bytes than the fetch",
          ),
        );
  try {
    for (const [path, bytes] of files) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), bytes, { flag: "wx" });
    }
    const inventory = {
      commit,
      files: filesUnder(root).map((path) => ({
        path,
        sha256: sha256Hex(readFileSync(join(root, path))),
      })),
      entries,
    };
    writeFileSync(`${root}.inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`, {
      flag: "wx",
    });
  } catch (cause) {
    return err(new CorpusFileFailed(root, `cannot be written: ${String(cause)}`));
  }
  return ok([`corpus/${snapshot}/`, `corpus/${snapshot}.inventory.json`]);
}

/**
 * Why a pinned snapshot cannot gain entries at its own commit from the
 * files a fetch assembled: a held file the fetch lacks or gives other
 * bytes, and a new file outside the added entries' directories, such as a
 * licence the snapshot never held. A snapshot is immutable, so every held
 * byte must be the commit's.
 * @param held the snapshot's files as it stands
 * @param files every file's bytes by its path in the snapshot, the held ones and the added ones
 * @param added the names of the entries the snapshot gains
 * @returns each reason, none when the snapshot can gain the entries
 */
export function extensionIssues(
  held: ReadonlyMap<string, Uint8Array>,
  files: ReadonlyMap<string, Uint8Array>,
  added: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  const differs = [...held].filter(([path, bytes]) => {
    const other = files.get(path);
    return other === undefined || sha256Hex(other) !== sha256Hex(bytes);
  });
  if (differs.length > 0)
    issues.push(
      `a snapshot is immutable, and the commit holds other bytes than its ${differs.map(([path]) => `'${path}'`).join(", ")}`,
    );
  const outside = [...files.keys()].filter(
    (path) => !held.has(path) && !added.some((name) => path.startsWith(`${name}/`)),
  );
  if (outside.length > 0)
    issues.push(
      `adding entries at the pinned commit would add ${outside.map((path) => `'${path}'`).join(", ")} beside them, which a refresh to a new commit takes`,
    );
  return issues;
}

/**
 * Add entries to a pinned snapshot at its own commit: write the files
 * `files` holds that the snapshot does not, then rewrite its inventory
 * with every file and entry, refusing first whatever `extensionIssues`
 * names. A write that fails is refused with the files already written in
 * `wrote`: the inventory stands as it stood when the failure comes before
 * it is written, and is named in `wrote` when its own write fails.
 * @param corpus the corpus directory
 * @param snapshot the pinned snapshot's path under the corpus, `upstream/<source>/<commit>`
 * @param commit the full commit the inventory records
 * @param files every file's bytes by its path in the snapshot, the held ones and the added ones
 * @param entries the snapshot's entries and their paths upstream, the added ones last
 * @param added the names of the entries the snapshot gains
 * @returns the repository-relative paths written, none when nothing is added, or why it cannot be written
 */
export function extendSnapshot(
  corpus: string,
  snapshot: string,
  commit: string,
  files: ReadonlyMap<string, Uint8Array>,
  entries: readonly SnapshotEntry[],
  added: readonly string[],
): Result<readonly string[], CorpusFileFailed> {
  const root = join(corpus, snapshot);
  const held = readSnapshotFiles(corpus, snapshot);
  const issues = extensionIssues(held, files, added);
  if (issues.length > 0) return err(new CorpusFileFailed(root, issues.join("; ")));
  const fresh = [...files].filter(([path]) => !held.has(path));
  if (fresh.length === 0) return ok([]);
  const written: string[] = [];
  let inventoryWriting = false;
  try {
    for (const [path, bytes] of fresh) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), bytes, { flag: "wx" });
      written.push(`corpus/${snapshot}/${path}`);
    }
    const inventory = {
      commit,
      files: filesUnder(root).map((path) => ({
        path,
        sha256: sha256Hex(readFileSync(join(root, path))),
      })),
      entries,
    };
    inventoryWriting = true;
    writeFileSync(`${root}.inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`);
  } catch (cause) {
    const inventory = inventoryWriting
      ? `the inventory, \`corpus/${snapshot}.inventory.json\`, failed as it was written and may hold neither form`
      : "the inventory is as it stood";
    return err(
      new CorpusFileFailed(
        root,
        `cannot be extended: ${String(cause)}; ${written.length} of its ${fresh.length} new files were written, and ${inventory}`,
        inventoryWriting ? [...written, `corpus/${snapshot}.inventory.json`] : written,
      ),
    );
  }
  return ok([
    ...added
      .filter((name) => fresh.some(([path]) => path.startsWith(`${name}/`)))
      .map((name) => `corpus/${snapshot}/${name}/`),
    `corpus/${snapshot}.inventory.json`,
  ]);
}

/**
 * The fetch (`workshop/components/recipes.md`, "Refreshing a source"): the
 * one read under `src/corpus/` that leaves the machine, and only for
 * `refresh` with a commit named. It runs `git` in a temporary directory
 * and removes it after: a clone of the repository's commits alone (no
 * trees, no file contents) resolves the commit and shows whether the
 * default branch holds it, then a fetch at depth one of that commit reads
 * the named paths' bytes from their blobs, as committed, with no checkout
 * and no line-ending conversion. Every command names its repository with
 * `--git-dir`, and git runs with the environment the caller hands over:
 * the entry script's, the variables that locate a repository (`GIT_DIR`
 * and its kin) removed, so a git hook's repository is never the one
 * written. This module reads no environment variable itself.
 */

/** Why a fetch cannot give the paths: git failed, the commit is not one the request may read, or a path holds what a snapshot cannot. */
class FetchFailed extends Error {
  /** The tag the Result law switches on. */
  readonly _tag = "FetchFailed" as const;
}

/** What a refresh asks of the repository. */
export interface FetchRequest {
  /** The environment git runs with, the variables that locate a repository removed by the caller. */
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly repo: string;
  /** A commit, full or abbreviated to at least seven hex characters. */
  readonly commit: string;
  /** The paths to read at the commit, each a directory or one file. */
  readonly paths: readonly string[];
  /** Whether a commit the default branch does not hold may be read; it must then be named in full. */
  readonly anyBranch: boolean;
}

/** One path read at the commit: a directory's files by their paths inside it, or one file. */
export type FetchedPath =
  | { readonly kind: "directory"; readonly files: ReadonlyMap<string, Uint8Array> }
  | { readonly kind: "file"; readonly bytes: Uint8Array };

/** A symbolic link the fetch held as its target's bytes: the link's path and the regular file it resolves to, both upstream. */
export interface ResolvedLink {
  readonly path: string;
  readonly target: string;
}

/** What the fetch gives. */
export interface Fetched {
  /** The commit in full. */
  readonly commit: string;
  /** Each requested path at the commit; a path the commit does not hold is absent. */
  readonly paths: ReadonlyMap<string, FetchedPath>;
  /**
   * The licence: the repository's licence file at its root, `LICENSE`,
   * `LICENSE.md` or `LICENSE.txt`; or, when the root holds none, the one
   * licence every requested path finds nearest walking up from its own
   * directory. `from` names the file or files upstream. Absent when the
   * root holds none and the commit holds none of the paths, or a held path
   * finds none above it (`licenceMissing`).
   */
  readonly licence: { readonly bytes: Uint8Array; readonly from: readonly string[] } | undefined;
  /** When the root holds no licence file, the held paths that find none above them; the refresh refuses them by name where the source must carry a licence. */
  readonly licenceMissing: readonly string[];
  /** Each symbolic link under the paths, held as its target's bytes. */
  readonly links: readonly ResolvedLink[];
}

const LICENCE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt"] as const;
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const SOME_COMMIT = /^[0-9a-f]{7,40}$/;

/** A git run's exit status and output. */
interface Run {
  readonly status: number | null;
  readonly stdout: Buffer;
  readonly stderr: string;
}

/** Runs git with its arguments and standard input. */
type Git = (args: readonly string[], input?: string) => Run;

function gitWith(environment: FetchRequest["environment"]): Git {
  return (args, input) => runGit(environment, args, input);
}

function runGit(
  environment: FetchRequest["environment"],
  args: readonly string[],
  input: string | undefined,
): Run {
  const result = spawnSync("git", args, {
    env: environment,
    input,
    maxBuffer: 1 << 30,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr.toString("utf8").trim(),
  };
}

function failure(what: string, run: Run): FetchFailed {
  return new FetchFailed(`${what}: ${run.stderr.split("\n").slice(-3).join(" ") || "git failed"}`);
}

/** One blob a tree listing names. */
interface Listed {
  readonly mode: string;
  readonly type: string;
  readonly oid: string;
  readonly path: string;
}

function listTree(
  git: Git,
  gitDir: string,
  commit: string,
  path: string,
): Result<readonly Listed[], FetchFailed> {
  const run = git(["--git-dir", gitDir, "ls-tree", "-r", "-z", "--full-tree", commit, "--", path]);
  if (run.status !== 0) return err(failure(`cannot list '${path}' at ${commit}`, run));
  const listed: Listed[] = [];
  for (const line of run.stdout.toString("utf8").split("\0")) {
    if (line === "") continue;
    const tab = line.indexOf("\t");
    const [mode = "", type = "", oid = ""] = line.slice(0, tab).split(" ");
    listed.push({ mode, type, oid, path: line.slice(tab + 1) });
  }
  return ok(listed);
}

/** The blobs' bytes, by object id, read in one `cat-file --batch`. */
function readBlobs(
  git: Git,
  gitDir: string,
  oids: readonly string[],
): Result<ReadonlyMap<string, Uint8Array>, FetchFailed> {
  const blobs = new Map<string, Uint8Array>();
  if (oids.length === 0) return ok(blobs);
  const run = git(["--git-dir", gitDir, "cat-file", "--batch"], `${oids.join("\n")}\n`);
  if (run.status !== 0) return err(failure("cannot read the files", run));
  const out = run.stdout;
  let at = 0;
  while (at < out.length) {
    const newline = out.indexOf(10, at);
    const [oid = "", type = "", size = ""] = out.subarray(at, newline).toString("utf8").split(" ");
    if (type !== "blob") return err(new FetchFailed(`object ${oid} is not a file's contents`));
    const start = newline + 1;
    const end = start + Number(size);
    blobs.set(oid, new Uint8Array(out.subarray(start, end)));
    at = end + 1;
  }
  return ok(blobs);
}

/** The commit in full, refused when the request may not read it. */
function resolveCommit(
  git: Git,
  history: string,
  request: FetchRequest,
): Result<string, FetchFailed> {
  const found = git([
    "--git-dir",
    history,
    "rev-parse",
    "--verify",
    "--quiet",
    `${request.commit}^{commit}`,
  ]);
  const full = found.status === 0 ? found.stdout.toString("utf8").trim() : undefined;
  const onDefault =
    full !== undefined &&
    git(["--git-dir", history, "merge-base", "--is-ancestor", full, "HEAD"]).status === 0;
  if (onDefault) return ok(full);
  if (!request.anyBranch)
    return err(
      new FetchFailed(
        `the default branch of ${request.repo} does not hold commit ${request.commit}; refresh reads another branch's commit only with --any-branch`,
      ),
    );
  if (full !== undefined) return ok(full);
  return FULL_COMMIT.test(request.commit)
    ? ok(request.commit)
    : err(
        new FetchFailed(
          `no branch of ${request.repo} holds commit ${request.commit}; name it in full to fetch it with --any-branch`,
        ),
      );
}

const SYMBOLIC_LINK = "120000";
/** How many links a link may lead through before it is refused as a loop. */
const LINK_HOPS = 8;

function refusedAt(path: string, commit: string, why: string): FetchFailed {
  return new FetchFailed(`'${path}' at ${commit} ${why}, which a snapshot does not hold`);
}

/** The text of one blob, read alone. */
function blobText(git: Git, gitDir: string, oid: string): Result<string, FetchFailed> {
  const read = readBlobs(git, gitDir, [oid]);
  if (read._tag === "err") return read;
  return ok(new TextDecoder().decode(read.value.get(oid)));
}

/**
 * A symbolic link resolved inside the commit's tree to the regular file it
 * ends at, through at most {@link LINK_HOPS} links; refused when a link is
 * absolute, leaves the repository, names nothing, or ends at a directory or
 * a submodule.
 */
function resolveLink(
  git: Git,
  gitDir: string,
  commit: string,
  link: Listed,
): Result<Listed, FetchFailed> {
  let at = link;
  for (let hop = 0; hop < LINK_HOPS; hop += 1) {
    const text = blobText(git, gitDir, at.oid);
    if (text._tag === "err") return text;
    const target = text.value;
    if (posix.isAbsolute(target))
      return err(
        refusedAt(link.path, commit, `is a symbolic link to the absolute path '${target}'`),
      );
    const resolved = posix.normalize(posix.join(posix.dirname(at.path), target));
    if (resolved === ".." || resolved.startsWith("../") || resolved === ".")
      return err(
        refusedAt(link.path, commit, `is a symbolic link to '${target}', outside the repository`),
      );
    const listed = listTree(git, gitDir, commit, resolved);
    if (listed._tag === "err") return listed;
    const only = listed.value[0];
    if (only === undefined)
      return err(
        refusedAt(
          link.path,
          commit,
          `is a symbolic link to '${resolved}', a path the commit does not hold`,
        ),
      );
    if (listed.value.length > 1 || only.path !== resolved)
      return err(refusedAt(link.path, commit, `is a symbolic link to the directory '${resolved}'`));
    if (only.type !== "blob")
      return err(refusedAt(link.path, commit, `is a symbolic link to the submodule '${resolved}'`));
    if (only.mode !== SYMBOLIC_LINK) return ok(only);
    at = only;
  }
  return err(
    refusedAt(link.path, commit, `is a symbolic link through more than ${LINK_HOPS} links`),
  );
}

/** The licence file in one directory of the commit (the root for ""), when it holds one. */
function licenceIn(
  git: Git,
  gitDir: string,
  commit: string,
  directory: string,
): Result<Listed | undefined, FetchFailed> {
  for (const name of LICENCE_FILES) {
    const path = directory === "" ? name : `${directory}/${name}`;
    const listed = listTree(git, gitDir, commit, path);
    if (listed._tag === "err") return listed;
    const found = listed.value.find(
      (item) => item.path === path && item.type === "blob" && item.mode !== SYMBOLIC_LINK,
    );
    if (found !== undefined) return ok(found);
  }
  return ok(undefined);
}

/**
 * Each held path's nearest licence file, walking up from its own directory
 * (a file's directory, or the directory itself) to just below the root.
 */
function nearestLicences(
  git: Git,
  gitDir: string,
  commit: string,
  held: ReadonlyMap<string, "file" | "directory">,
): Result<
  { readonly found: ReadonlyMap<string, Listed>; readonly missing: readonly string[] },
  FetchFailed
> {
  const found = new Map<string, Listed>();
  const missing: string[] = [];
  for (const [path, kind] of held) {
    let directory = kind === "file" ? posix.dirname(path) : path;
    let licence: Listed | undefined;
    while (licence === undefined && directory !== "." && directory !== "") {
      const here = licenceIn(git, gitDir, commit, directory);
      if (here._tag === "err") return here;
      licence = here.value;
      directory = posix.dirname(directory);
    }
    if (licence === undefined) missing.push(path);
    else found.set(path, licence);
  }
  return ok({ found, missing });
}

/** Read the request's paths and the licence from a repository holding the commit. */
function readPaths(
  git: Git,
  gitDir: string,
  commit: string,
  request: FetchRequest,
): Result<Fetched, FetchFailed> {
  const listings = new Map<string, readonly Listed[]>();
  const links: ResolvedLink[] = [];
  for (const path of request.paths) {
    const listed = listTree(git, gitDir, commit, path);
    if (listed._tag === "err") return listed;
    const items: Listed[] = [];
    for (const item of listed.value) {
      if (item.type !== "blob") return err(refusedAt(item.path, commit, "is a submodule"));
      if (item.mode !== SYMBOLIC_LINK) {
        items.push(item);
        continue;
      }
      const target = resolveLink(git, gitDir, commit, item);
      if (target._tag === "err") return target;
      links.push({ path: item.path, target: target.value.path });
      items.push({ ...item, oid: target.value.oid, mode: target.value.mode });
    }
    if (items.length > 0) listings.set(path, items);
  }
  const held = new Map<string, "file" | "directory">(
    [...listings].map(([path, listed]) => [
      path,
      listed.length === 1 && listed[0]?.path === path ? "file" : "directory",
    ]),
  );
  const root = licenceIn(git, gitDir, commit, "");
  if (root._tag === "err") return root;
  let licences: readonly Listed[] = root.value === undefined ? [] : [root.value];
  let licenceMissing: readonly string[] = [];
  if (root.value === undefined && held.size > 0) {
    const nearest = nearestLicences(git, gitDir, commit, held);
    if (nearest._tag === "err") return nearest;
    const { found, missing } = nearest.value;
    const differing = new Set([...found.values()].map((item) => item.oid));
    if (differing.size > 1)
      return err(
        new FetchFailed(
          `the repository's root holds no licence file, and its entries' nearest licences differ: ${[
            ...found,
          ]
            .map(([path, item]) => `'${path}' takes '${item.path}'`)
            .join(", ")}`,
        ),
      );
    // A licence only when every held path finds it; whether a source may lack one is the refresh's to say.
    licenceMissing = missing;
    licences = missing.length > 0 ? [] : [...found.values()];
  }
  const blobs = readBlobs(git, gitDir, [
    ...new Set([...[...listings.values()].flat(), ...licences].map((item) => item.oid)),
  ]);
  if (blobs._tag === "err") return blobs;
  const bytesOf = (item: Listed): Uint8Array => blobs.value.get(item.oid) ?? new Uint8Array();
  const paths = new Map<string, FetchedPath>();
  for (const [path, listed] of listings) {
    const only = listed[0];
    paths.set(
      path,
      held.get(path) === "file" && only !== undefined
        ? { kind: "file", bytes: bytesOf(only) }
        : {
            kind: "directory",
            files: new Map(listed.map((item) => [item.path.slice(path.length + 1), bytesOf(item)])),
          },
    );
  }
  const first = licences[0];
  return ok({
    commit,
    paths,
    licence:
      first === undefined
        ? undefined
        : { bytes: bytesOf(first), from: [...new Set(licences.map((item) => item.path))].sort() },
    licenceMissing,
    links,
  });
}

/**
 * Fetch the named paths of a repository at one commit, into a temporary
 * directory removed after.
 * @param request the repository, the commit, the paths and whether another branch's commit may be read
 * @returns the commit in full, each path's bytes and the licence file, or why they cannot be read
 */
export function fetchUpstream(request: FetchRequest): Result<Fetched, FetchFailed> {
  if (!SOME_COMMIT.test(request.commit))
    return err(new FetchFailed(`'${request.commit}' is not a commit: 7 to 40 lowercase hex`));
  const git = gitWith(request.environment);
  const root = mkdtempSync(join(tmpdir(), "greenline-refresh-"));
  try {
    const history = join(root, "history.git");
    const cloned = git([
      "clone",
      "--quiet",
      "--bare",
      "--filter=tree:0",
      "--",
      request.repo,
      history,
    ]);
    if (cloned.status !== 0) return err(failure(`cannot clone ${request.repo}`, cloned));
    const commit = resolveCommit(git, history, request);
    if (commit._tag === "err") return commit;
    const at = join(root, "commit.git");
    const made = git(["--git-dir", at, "init", "--quiet", "--bare"]);
    if (made.status !== 0) return err(failure("cannot make the temporary repository", made));
    const fetched = git([
      "--git-dir",
      at,
      "fetch",
      "--quiet",
      "--depth",
      "1",
      "--",
      request.repo,
      commit.value,
    ]);
    if (fetched.status !== 0)
      return err(failure(`cannot fetch ${commit.value} from ${request.repo}`, fetched));
    return readPaths(git, at, commit.value, request);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
