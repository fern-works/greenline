import { z } from "zod";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Result } from "../commons/result.ts";
import {
  ATLAS_INDEX,
  atlasLine,
  isModelFile,
  majorChange,
  parseAtlas,
  subsystemPage,
  type Atlas,
  type AtlasStanding,
  type MajorFacts,
} from "../core/atlas.ts";
import { isChangeId } from "../core/change.ts";
import { parseJson, type ContractParseFailed, type JsonValue } from "../core/contract.ts";
import { recordFacts, ruled, TRAILER_KEY } from "../core/git-hooks.ts";
import type { LostPicture } from "../core/pictures.ts";
import {
  DOCUMENTS_INDEX,
  documentsKept,
  manifestAtCommit,
  manifestWithReaches,
  parseDocuments,
  reachesOf,
  LINKS_FILE,
  linksFileText,
  MANIFEST_SUFFIX,
  manifestWithMaker,
  parseVisualManifest,
  placeOfManifest,
  tierOf,
  VISUAL_EXTENSIONS,
  visualId,
  VISUALS_HOME,
  type ChangePin,
  type ChangeVisualLink,
  type DocumentAuthor,
  type DocumentsIndex,
  type DriftFacts,
  type KeptAnchor,
  type LinksWriter,
  type PinnedVisual,
  type Staleness,
  type VisualExtension,
  type VisualMaker,
  type VisualManifest,
  type VisualPlace,
} from "../core/visuals.ts";
import {
  FixedAnswers,
  gitExitCode,
  headCommit,
  OBJECT_ID,
  pinnedHead,
  readGit,
} from "./code-tree.ts";
import { atomicWriteFile } from "./fs/io.ts";

/**
 * The visual home on disk (`src/core/visuals.ts`): every manifest the
 * home's layout holds, the visual beside each, git's answers about the
 * files each covers, and a change's links file. Status, the inspector and
 * the event hook read the home through this module alone.
 */

/** One manifest the home holds, with the visual beside it. */
export interface VisualEntry {
  readonly id: string;
  readonly place: VisualPlace;
  /** The manifest's path from the repository root. */
  readonly manifestPath: string;
  /** The visual's file from the root, by its slug; null when none stands beside the manifest. */
  readonly file: { readonly path: string; readonly extension: VisualExtension } | null;
  readonly manifest: Result<VisualManifest, ContractParseFailed>;
}

/** A directory's entries that are real directories or real files, never a symbolic link, sorted. */
function listed(dir: string): readonly { readonly name: string; readonly dir: boolean }[] {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return [];
  }
  return names.flatMap((name): { name: string; dir: boolean }[] => {
    try {
      const stat = lstatSync(join(dir, name));
      if (stat.isDirectory()) return [{ name, dir: true }];
      return stat.isFile() ? [{ name, dir: false }] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Whether the visual home resolves inside the repository: a `.greenline/`
 * or a home that links elsewhere is read as holding nothing, so no byte from
 * outside reaches status or the inspector.
 */
function homeInside(root: string): boolean {
  try {
    return realpathSync(join(root, VISUALS_HOME)).startsWith(realpathSync(root) + sep);
  } catch {
    return false;
  }
}

/** The manifests' paths under the home, relative to it: a folder's and, under `subsystems/`, each subsystem's. */
function manifestPaths(root: string): readonly string[] {
  if (!homeInside(root)) return [];
  const home = join(root, VISUALS_HOME);
  const inFolder = (folder: string): readonly string[] =>
    listed(join(home, folder))
      .filter((entry) => !entry.dir && entry.name.endsWith(MANIFEST_SUFFIX))
      .map((entry) => `${folder}/${entry.name}`);
  return listed(home).flatMap((entry) => {
    if (!entry.dir) return [];
    if (entry.name !== "subsystems") return inFolder(entry.name);
    return listed(join(home, "subsystems")).flatMap((sub) =>
      sub.dir ? inFolder(`subsystems/${sub.name}`) : [],
    );
  });
}

/** The visual file beside a manifest, by its slug and the first extension that stands. */
function visualFile(root: string, underHome: string): VisualEntry["file"] {
  const stem = underHome.slice(0, -MANIFEST_SUFFIX.length);
  for (const extension of VISUAL_EXTENSIONS) {
    const path = `${VISUALS_HOME}/${stem}.${extension}`;
    try {
      if (lstatSync(join(root, path)).isFile()) return { path, extension };
    } catch {
      // Not this extension.
    }
  }
  return null;
}

/**
 * Every visual the home holds, in id order; a manifest that does not read
 * is kept with its refusal, a path the layout does not hold is left out.
 * @param root the repository root
 * @returns the entries
 */
export function readVisualsHome(root: string): readonly VisualEntry[] {
  return manifestPaths(root).flatMap((underHome): VisualEntry[] => {
    const place = placeOfManifest(underHome);
    if (place === undefined) return [];
    const manifestPath = `${VISUALS_HOME}/${underHome}`;
    let text: string;
    try {
      text = readFileSync(join(root, manifestPath), "utf8");
    } catch {
      return [];
    }
    return [
      {
        id: visualId(place),
        place,
        manifestPath,
        file: visualFile(root, underHome),
        manifest: parseVisualManifest(text, manifestPath),
      },
    ];
  });
}

/** What a commit named by its whole id holds under some paths, and that it is a commit: fixed for good. */
const heldUnder = new FixedAnswers<readonly string[] | undefined>();
const commitsKnown = new FixedAnswers<boolean>();

/**
 * Whether git holds a commit by that name; a whole id git holds is known
 * for the process's life, any other name is asked each time.
 */
function isCommit(root: string, commit: string): boolean {
  const ask = (): boolean => gitExitCode(root, ["cat-file", "-e", `${commit}^{commit}`]) === 0;
  return OBJECT_ID.test(commit) ? commitsKnown.answer(root, commit, ask, (known) => known) : ask();
}

/** The files a tree holds under the covered paths, or undefined when git cannot read the tree. */
function filesUnder(
  root: string,
  tree: string,
  files: readonly string[],
): readonly string[] | undefined {
  const read = (): readonly string[] | undefined => listUnder(root, tree, files);
  return OBJECT_ID.test(tree)
    ? heldUnder.answer(root, `${tree}\0${files.join("\0")}`, read, (held) => held !== undefined)
    : read();
}

function listUnder(
  root: string,
  tree: string,
  files: readonly string[],
): readonly string[] | undefined {
  const listed = readGit(root, [
    "--literal-pathspecs",
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    tree,
    "--",
    ...files,
  ]);
  return listed._tag === "err" ? undefined : listed.value.split("\0").filter((path) => path !== "");
}

/** Whether a tree's listing holds a covered path: the file itself, or a file under the directory it names. */
function holds(listing: readonly string[], covered: string): boolean {
  const path = covered.replace(/\/+$/, "");
  return listing.some((file) => file === path || file.startsWith(`${path}/`));
}

/**
 * The covered paths a commit does not hold (J-147 S3), for the refusal of a
 * manifest naming a file absent at its commit; undefined where git cannot
 * read the commit, which the drift's own notice reports.
 * @param root the repository root
 * @param commit the manifest's commit
 * @param files the paths it covers
 * @returns the paths the commit lacks, in order
 */
export function absentAt(
  root: string,
  commit: string,
  files: readonly string[],
): readonly string[] | undefined {
  if (!isCommit(root, commit)) return undefined;
  if (files.length === 0) return [];
  const then = filesUnder(root, commit, files);
  return then === undefined ? undefined : files.filter((file) => !holds(then, file));
}

/**
 * What git answers about the paths a visual or an atlas page covers since
 * the commit it was made or read at: the commits up to HEAD that touched
 * one, and the covered paths its commit held that HEAD no longer holds, so
 * a path planned and not yet written is never counted gone; an unknown
 * commit when git cannot read it or there is no HEAD. Three git reads, however
 * many paths it covers; commits are counted, never the wall clock.
 * @param root the repository root
 * @param commit the commit it was made at
 * @param files the paths it covers
 * @returns git's answers
 */
export function driftFacts(root: string, commit: string, files: readonly string[]): DriftFacts {
  if (!isCommit(root, commit)) return { kind: "unknown-commit" };
  if (files.length === 0) return { kind: "read", touching: 0, missing: 0 };
  // Within a pinned reading HEAD is a commit's id, so the count is one the two ids fix.
  const head = pinnedHead(root) ?? "HEAD";
  const count = (): number | undefined => {
    const counted = readGit(root, [
      "--literal-pathspecs",
      "rev-list",
      "--count",
      `${commit}..${head}`,
      "--",
      ...files,
    ]);
    return counted._tag === "err" ? undefined : Number.parseInt(counted.value.trim(), 10) || 0;
  };
  const touching =
    OBJECT_ID.test(commit) && OBJECT_ID.test(head)
      ? touchingSince.answer(
          root,
          `${commit}\0${head}\0${files.join("\0")}`,
          count,
          (n) => n !== undefined,
        )
      : count();
  const then = filesUnder(root, commit, files);
  const now = filesUnder(root, head, files);
  if (touching === undefined || then === undefined || now === undefined)
    return { kind: "unknown-commit" };
  const missing = files.filter((file) => holds(then, file) && !holds(now, file)).length;
  return { kind: "read", touching, missing };
}

/** How many commits between two commits named by their ids touched some paths: fixed for good. */
const touchingSince = new FixedAnswers<number | undefined>();

/** A links file's list as the writer compares it: the change and its visuals, its writer aside. */
const LISTED = z.object({ change: z.unknown(), visuals: z.unknown() });

/**
 * Write a change's links file, `.greenline/ledger/<id>/visuals.json`, from
 * its folder in the home: written when its list would change, and kept with
 * an empty list once its folder holds no visual that reads, since the record
 * links it. The event hook calls it after a tool,
 * and the inspector after a delete; an unchanged list keeps the
 * writer that wrote it, so the inspector's stamp on its delete stands until
 * the list moves, which status reads as the owner's delete (J-227 S1).
 * @param root the repository root
 * @param change the change's id
 * @param writer the command writing it, its `generatedBy`
 */
export function writeChangeLinks(root: string, change: string, writer: LinksWriter): void {
  const links: ChangeVisualLink[] = readVisualsHome(root).flatMap((entry) =>
    entry.place.kind === "change" && entry.place.change === change && entry.manifest._tag === "ok"
      ? [
          {
            id: entry.id,
            title: entry.manifest.value.title,
            file: entry.file?.path ?? null,
            manifest: entry.manifestPath,
          },
        ]
      : [],
  );
  const path = join(root, ".greenline", "ledger", change, LINKS_FILE);
  // A record may link the file, so once written it stays, empty when its last visual goes.
  if (links.length === 0 && !existsSync(path)) return;
  const text = linksFileText(change, links, writer);
  let current: string | undefined;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = undefined;
  }
  if (current === text) return;
  // The same list under another writer is left alone, its stamp kept (J-227 S1).
  const stated = current === undefined ? undefined : LISTED.safeParse(parseJson(current));
  const next = LISTED.parse(parseJson(text));
  if (
    stated?.success === true &&
    JSON.stringify([stated.data.change, stated.data.visuals]) ===
      JSON.stringify([next.change, next.visuals])
  )
    return;
  atomicWriteFile(path, text);
}

/**
 * The atlas's index on disk: undefined where it stands nowhere, or its
 * refusal when it does not read.
 * @param root the repository root
 * @returns the atlas
 */
export function readAtlas(root: string): Result<Atlas, ContractParseFailed> | undefined {
  let text: string;
  try {
    if (!homeInside(root) || !lstatSync(join(root, ATLAS_INDEX)).isFile()) return undefined;
    text = readFileSync(join(root, ATLAS_INDEX), "utf8");
  } catch {
    return undefined;
  }
  return parseAtlas(text, ATLAS_INDEX);
}

/** A visual, an atlas page or an indexed document that drifted from the code it covers. */
export interface DriftItem {
  readonly kind: "visual" | "subsystem" | "document";
  /** The visual's id, the subsystem's name, or the document's path. */
  readonly id: string;
  readonly title: string;
  /** The file the notice names: the visual's manifest, the subsystem's page, or the document. */
  readonly path: string;
  readonly commit: string;
  readonly staleness: Staleness;
  /** A visual's form, `capture` for a capture; undefined for an atlas page (J-143 S3). */
  readonly form?: string | undefined;
  /** The change whose record links the visual; null for none, undefined for an atlas page (J-143 S3). */
  readonly change?: string | null | undefined;
  /** A document's author, the practice or the owner; undefined for a visual or a page (J-147 S1). */
  readonly author?: DocumentAuthor | undefined;
  /** Who drew a visual, as its manifest records it; undefined where it records none (J-198 S1). */
  readonly madeBy?: VisualMaker | undefined;
}

/** What the home says of its drift: every visual and page that is not fresh, and every file that does not read. */
export interface HomeDrift {
  readonly items: readonly DriftItem[];
  readonly unreadable: readonly { readonly path: string; readonly message: string }[];
}

/**
 * Record who made each visual a write touched (J-129 S6): for each written
 * path under the home, a visual's file or its manifest, the manifest beside
 * it gains `madeBy`, the session sticking once it wrote. A manifest not yet
 * written, or one that is no JSON object, is left alone; its own write
 * records the maker.
 * @param root the repository root
 * @param written the paths written, from the root, `/`-separated
 * @param maker who wrote them
 * @param absentOnly true for a shell command's writes, read by their files' times, which fill a maker where none stands and replace none (J-135 S2)
 */
export function recordMakers(
  root: string,
  written: readonly string[],
  maker: VisualMaker,
  absentOnly = false,
): void {
  const manifests = new Set(
    written.flatMap((path) => {
      if (!path.startsWith(`${VISUALS_HOME}/`)) return [];
      if (path.endsWith(MANIFEST_SUFFIX)) return [path];
      const dot = path.lastIndexOf(".");
      const extension = path.slice(dot + 1);
      return dot === -1 || !VISUAL_EXTENSIONS.some((kind) => kind === extension)
        ? []
        : [`${path.slice(0, dot)}${MANIFEST_SUFFIX}`];
    }),
  );
  for (const path of manifests) {
    try {
      const next = manifestWithMaker(readFileSync(join(root, path), "utf8"), maker, absentOnly);
      if (next !== undefined) atomicWriteFile(join(root, path), next);
    } catch {
      // A manifest not yet written records its maker at its own write.
    }
  }
}

/**
 * A change's visuals whose manifest says the root session made them, which
 * status and the mirror name (J-129 S6): the visual an offer's yes makes is a
 * fresh agent's, the map and the atlas's journeys among them under the one
 * maker rule (J-147 S4); a capture and the style guide are left out.
 * @param root the repository root
 * @returns each one's id, title and manifest's path, in id order
 */
export function sessionMadeVisuals(
  root: string,
): readonly { readonly id: string; readonly title: string; readonly path: string }[] {
  return readVisualsHome(root).flatMap((entry) =>
    entry.place.kind !== "interface" &&
    entry.place.kind !== "style" &&
    entry.manifest._tag === "ok" &&
    entry.manifest.value.madeBy === "session" &&
    // A capture is the interface check's output, never the session's visual (J-134 S2).
    entry.manifest.value.capture === undefined
      ? [{ id: entry.id, title: entry.manifest.value.title, path: entry.manifestPath }]
      : [],
  );
}

/**
 * A change's kept pictures whose manifest carries no brief (J-204 S1), which
 * status names: a picture `greenline picture keep` kept on the owner's ask,
 * its `ask` stated, with no `brief` read into it; a capture, the map, the
 * atlas's journeys and the style guide are left out.
 * @param root the repository root
 * @returns each one's id, title and manifest's path, in id order
 */
export function brieflessVisuals(
  root: string,
): readonly { readonly id: string; readonly title: string; readonly path: string }[] {
  return readVisualsHome(root).flatMap((entry) =>
    entry.place.kind === "change" &&
    entry.manifest._tag === "ok" &&
    entry.manifest.value.ask !== undefined &&
    entry.manifest.value.capture === undefined &&
    entry.manifest.value.brief === undefined
      ? [{ id: entry.id, title: entry.manifest.value.title, path: entry.manifestPath }]
      : [],
  );
}

/**
 * The change folders of the visual home a restore could write under: those
 * the working tree holds and those HEAD's commit holds, a folder the owner
 * emptied in the inspector among them, each `.greenline/visuals/<id>` from
 * the root, sorted.
 */
export function changeVisualFolders(root: string): readonly string[] {
  let standing: readonly string[] = [];
  try {
    standing = readdirSync(join(root, VISUALS_HOME));
  } catch {
    standing = [];
  }
  const committed = readGit(root, ["ls-tree", "-d", "--name-only", "HEAD", `${VISUALS_HOME}/`]);
  const named =
    committed._tag === "ok"
      ? committed.value.split("\n").map((path) => path.split("/").at(-1) ?? "")
      : [];
  return [...new Set([...standing, ...named])]
    .filter((name) => isChangeId(name))
    .sort()
    .map((name) => `${VISUALS_HOME}/${name}`);
}

/** A links file's visuals as the lost pictures read them, with its writer. */
const LINKED = z.object({
  generatedBy: z.string().optional().catch(undefined),
  visuals: z.array(z.object({ id: z.string(), title: z.string() })).catch([]),
});

/** A change's kept picture its committed links file lists that the home no longer holds (J-227 S1). */
export interface DeletedPicture {
  readonly id: string;
  readonly title: string;
  readonly change: string;
  /** Whether the working links file carries the inspector's stamp, the owner's delete. */
  readonly byOwner: boolean;
  /** The links file's path from the root. */
  readonly links: string;
}

/**
 * The kept pictures deleted from the home (J-204 S1, J-227 S1): for each
 * change whose links file HEAD holds and whose folder of the home lost a
 * file HEAD holds, the pictures the committed links file lists that the
 * folder no longer holds; the owner's where the working links file says
 * `greenline inspect` wrote it, the inspector's delete. Once the deletion
 * is committed, nothing is named.
 * @param root the repository root
 * @param change one change to read, or every change HEAD's links files name
 * @returns the pictures, by change and in the links file's order
 */
export function deletedPictures(root: string, change?: string): readonly DeletedPicture[] {
  const files =
    change === undefined
      ? committedLinksFiles(root)
      : [`.greenline/ledger/${change}/${LINKS_FILE}`];
  if (files.length === 0) return [];
  const standing = new Set(readVisualsHome(root).map((entry) => entry.id));
  return files.flatMap((links) => {
    const id = links.split("/")[2] ?? "";
    const committed = readGit(root, ["show", `HEAD:${links}`]);
    if (committed._tag !== "ok") return [];
    const linked = LINKED.safeParse(parseJson(committed.value));
    const working = LINKED.safeParse(parseJson(textOf(root, links) ?? ""));
    const byOwner = working.success && working.data.generatedBy === "greenline inspect";
    return (linked.success ? linked.data.visuals : []).flatMap((visual) =>
      standing.has(visual.id)
        ? []
        : [{ id: visual.id, title: visual.title, change: id, byOwner, links }],
    );
  });
}

/**
 * The links files of the changes whose folder of the home lost a file HEAD
 * holds, staged or not, one per change, from the root: the only changes a
 * deleted picture can stand under, read by one git call rather than every
 * change's links file.
 */
function committedLinksFiles(root: string): readonly string[] {
  const gone = readGit(root, [
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=D",
    "HEAD",
    "--",
    `${VISUALS_HOME}/`,
  ]);
  if (gone._tag !== "ok") return [];
  const changes = gone.value.split("\n").flatMap((path) => {
    const id = path.split("/")[2] ?? "";
    return path.startsWith(`${VISUALS_HOME}/`) && isChangeId(id) ? [id] : [];
  });
  return [...new Set(changes)].sort().map((id) => `.greenline/ledger/${id}/${LINKS_FILE}`);
}

/** A kept picture a later remake replaces, which status names (J-227 S1). */
export interface ReplacedPicture {
  readonly id: string;
  readonly title: string;
  /** The replaced picture's manifest, from the root. */
  readonly path: string;
  /** The remake that names it, by its id and title. */
  readonly by: { readonly id: string; readonly title: string };
}

/**
 * The kept pictures a remake's manifest names in its `replaces` that still
 * stand in the home (J-227 S1): each named to the owner as replaced, whom
 * the inspector's delete serves; nothing is deleted or hidden.
 * @param root the repository root
 * @returns each replaced picture with the remake that names it, in the remakes' id order
 */
export function replacedPictures(root: string): readonly ReplacedPicture[] {
  const entries = readVisualsHome(root);
  return entries.flatMap((remake) => {
    if (remake.place.kind !== "change" || remake.manifest._tag !== "ok") return [];
    const named = remake.manifest.value.replaces;
    const replaced = entries.find((entry) => entry.id === named);
    if (replaced === undefined || replaced.manifest._tag !== "ok") return [];
    return [
      {
        id: replaced.id,
        title: replaced.manifest.value.title,
        path: replaced.manifestPath,
        by: { id: remake.id, title: remake.manifest.value.title },
      },
    ];
  });
}

/**
 * The kept pictures status names lost (J-204 S1): every visual GL0601 names
 * drifting or stale, and the change's pictures its committed links file
 * lists that its folder of the home no longer holds, deleted. The turn's
 * end reads them where a reply offers a picture, so an offer of a lost
 * picture's remake is named.
 * @param root the repository root
 * @param change the change open, undefined where none is
 * @returns the pictures, the drifted first
 */
export function lostPictures(root: string, change: string | undefined): readonly LostPicture[] {
  const lost: LostPicture[] = readDrift(root).items.flatMap((item) =>
    item.kind === "visual" ? [{ id: item.id, title: item.title, state: item.staleness.tier }] : [],
  );
  if (change === undefined) return lost;
  for (const visual of deletedPictures(root, change))
    lost.push({ id: visual.id, title: visual.title, state: "deleted" });
  return lost;
}

/**
 * Every visual and atlas page whose covered files changed since its commit,
 * and every manifest or index that does not read: the drift status reports
 * and the mirror counts.
 * @param root the repository root
 * @returns the drift
 */
export function readDrift(root: string): HomeDrift {
  const items: DriftItem[] = [];
  const unreadable: { path: string; message: string }[] = [];
  for (const entry of readVisualsHome(root)) {
    if (entry.manifest._tag === "err") {
      unreadable.push({ path: entry.manifestPath, message: refusalText(entry.manifest.error) });
      continue;
    }
    const manifest = entry.manifest.value;
    const staleness = tierOf(driftFacts(root, manifest.commit, manifest.files));
    if (staleness.tier !== "fresh")
      items.push({
        kind: "visual",
        id: entry.id,
        title: manifest.title,
        path: entry.manifestPath,
        commit: manifest.commit,
        staleness,
        form: manifest.form,
        change: manifest.change,
        madeBy: manifest.madeBy,
      });
  }
  const atlas = readAtlas(root);
  if (atlas?._tag === "err")
    unreadable.push({ path: ATLAS_INDEX, message: refusalText(atlas.error) });
  if (atlas?._tag === "ok")
    for (const subsystem of atlas.value.subsystems) {
      const staleness = tierOf(driftFacts(root, subsystem.commit, subsystem.files));
      if (staleness.tier !== "fresh")
        items.push({
          kind: "subsystem",
          id: subsystem.name,
          title: subsystem.title,
          path: subsystemPage(subsystem.name),
          commit: subsystem.commit,
          staleness,
        });
    }
  const documents = readDocuments(root);
  if (documents?._tag === "err")
    unreadable.push({ path: DOCUMENTS_INDEX, message: refusalText(documents.error) });
  if (documents?._tag === "ok")
    for (const document of documents.value.documents) {
      const staleness = tierOf(driftFacts(root, document.commit, document.files));
      if (staleness.tier !== "fresh")
        items.push({
          kind: "document",
          id: document.path,
          title: document.path,
          path: document.path,
          commit: document.commit,
          staleness,
          author: document.author,
        });
    }
  return { items, unreadable };
}

/**
 * A parse refusal's issues in one line.
 * @param error the refusal
 * @returns its issues, each with its field
 */
export function refusalText(error: ContractParseFailed): string {
  return error.issues
    .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
    .join("; ");
}

/**
 * The documents index on disk (J-147 S1): undefined where it stands
 * nowhere, or its refusal when it does not read.
 * @param root the repository root
 * @returns the index
 */
export function readDocuments(
  root: string,
): Result<DocumentsIndex, ContractParseFailed> | undefined {
  let text: string;
  try {
    if (!homeInside(root) || !lstatSync(join(root, DOCUMENTS_INDEX)).isFile()) return undefined;
    text = readFileSync(join(root, DOCUMENTS_INDEX), "utf8");
  } catch {
    return undefined;
  }
  return parseDocuments(text, DOCUMENTS_INDEX);
}

/**
 * The docs line the mirror and `greenline status` print after the atlas
 * line (J-147 S1), or undefined where no documents index stands:
 * `docs: 2 pages drifting: README.md, docs/api.md`, or none drifting.
 * @param root the repository root
 * @param drift the home's drift, read once
 * @returns the line, unindented
 */
export function docsLineOf(root: string, drift: HomeDrift): string | undefined {
  const index = readDocuments(root);
  if (index === undefined || index._tag === "err") return undefined;
  const drifting = drift.items.filter((item) => item.kind === "document").map((item) => item.id);
  if (drifting.length === 0)
    return `docs: none drifting of ${String(index.value.documents.length)} indexed`;
  return `docs: ${String(drifting.length)} page${drifting.length === 1 ? "" : "s"} drifting: ${drifting.join(", ")}`;
}

/**
 * Whether a path lies under one a page covers: the file itself, or a file
 * under the directory it names.
 * @param files the covered paths, a trailing `/` naming a directory
 * @param path the path, from the root
 * @returns true where one covers it
 */
function coversPath(files: readonly string[], path: string): boolean {
  return files.some((file) => {
    const stem = file.replace(/\/+$/, "");
    return path === stem || path.startsWith(`${stem}/`);
  });
}

/**
 * The working tree's changed, added and renamed files, as git's status
 * lists them with no optional lock, so the read never refreshes the index
 * and status writes nothing (J-176 S1): status reads the owed skills from
 * the files an open change touched, and a turn's end the code it changed
 * (J-204 S1).
 * @param root the repository root
 * @returns the paths from the root
 */
export function workingChanges(root: string): readonly string[] {
  const read = readGit(root, [
    "--no-optional-locks",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (read._tag !== "ok") return [];
  const out: string[] = [];
  const fields = read.value.split("\0");
  for (let at = 0; at < fields.length; at += 1) {
    const field = fields[at] ?? "";
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    if (!code.includes("D")) out.push(field.slice(3));
    // A rename or a copy carries its source as the next field.
    if (code.includes("R") || code.includes("C")) at += 1;
  }
  return out;
}

/**
 * The paths a change touched (J-147 S1): those its commits changed, found
 * by its trailer, deletions included, and the working tree's changed and
 * added files, outside greenline's own folder.
 * @param root the repository root
 * @param id the change
 * @returns the paths from the root, sorted, each once
 */
export function changeTouched(root: string, id: string): readonly string[] {
  const committed = readGit(root, [
    "log",
    "--format=",
    "--name-only",
    "--fixed-strings",
    `--grep=${TRAILER_KEY}: ${id}`,
  ]);
  const paths = committed._tag === "ok" ? committed.value.split("\n") : [];
  return [...new Set([...paths, ...workingChanges(root)])]
    .filter((path) => path.trim() !== "" && !path.startsWith(".greenline/"))
    .sort();
}

/** One page, journey or the map a change touched, with its staleness. */
export interface TouchedPage {
  /** The subsystem's name, `<subsystem>/<slug>` for a journey, or `map`. */
  readonly name: string;
  readonly kind: "page" | "journey" | "map";
  readonly staleness: Staleness;
}

/**
 * The atlas pages and journeys whose covered files a change touched, and
 * the map when such a page stands, each with its staleness (J-147 S1): the
 * pages the close refreshes, which status names at the close and the
 * finished-record verdict holds done for.
 * @param root the repository root
 * @param touched the paths the change touched
 * @returns the pages, the map last
 */
export function touchedPages(root: string, touched: readonly string[]): readonly TouchedPage[] {
  const atlas = readAtlas(root);
  if (atlas?._tag !== "ok" || touched.length === 0) return [];
  const pages: TouchedPage[] = atlas.value.subsystems
    .filter((subsystem) => touched.some((path) => coversPath(subsystem.files, path)))
    .map((subsystem) => ({
      name: subsystem.name,
      kind: "page",
      staleness: tierOf(driftFacts(root, subsystem.commit, subsystem.files)),
    }));
  const visuals = readVisualsHome(root);
  for (const entry of visuals)
    if (
      entry.place.kind === "journey" &&
      entry.manifest._tag === "ok" &&
      touched.some(
        (path) => entry.manifest._tag === "ok" && coversPath(entry.manifest.value.files, path),
      )
    )
      pages.push({
        name: `${entry.place.subsystem}/${entry.place.slug}`,
        kind: "journey",
        staleness: tierOf(
          driftFacts(root, entry.manifest.value.commit, entry.manifest.value.files),
        ),
      });
  if (pages.length === 0) return pages;
  const map = visuals.find((entry) => entry.place.kind === "map" && entry.manifest._tag === "ok");
  if (map?.manifest._tag === "ok")
    pages.push({
      name: "map",
      kind: "map",
      staleness: tierOf(driftFacts(root, map.manifest.value.commit, map.manifest.value.files)),
    });
  return pages;
}

/**
 * The touched pages that drift and that the record's refreshes name
 * nowhere, by name (J-147 S3): what the finished-record verdict holds done
 * for.
 * @param root the repository root
 * @param id the change
 * @param refreshed the pages the record's refreshes name
 * @returns the names, the map last
 */
export function refreshOwed(
  root: string,
  id: string,
  refreshed: readonly string[],
): readonly string[] {
  if (readAtlas(root)?._tag !== "ok") return [];
  return touchedPages(root, changeTouched(root, id))
    .filter((page) => page.staleness.tier !== "fresh" && !refreshed.includes(page.name))
    .map((page) => page.name);
}

/** The folders of the atlas's pages and journeys and of the map, under the home. */
const ATLAS_FOLDERS = [`${VISUALS_HOME}/subsystems/`, `${VISUALS_HOME}/map/`] as const;

/**
 * The page, journey or map a file of the home is, by name as the record's
 * `refreshes` names it: `<subsystem>` for its page, `<subsystem>/<slug>`
 * for a journey's drawing, `map` for any file of the map's folder; a
 * manifest or a capture's boxes, which the hooks write, is none.
 */
function pageOfFile(path: string): string | undefined {
  if (path.endsWith(MANIFEST_SUFFIX) || path.endsWith(".boxes.json")) return undefined;
  if (path.startsWith(`${VISUALS_HOME}/map/`)) return "map";
  const under = path.startsWith(`${VISUALS_HOME}/subsystems/`)
    ? path.slice(`${VISUALS_HOME}/subsystems/`.length).split("/")
    : [];
  const [name, file] = under;
  if (under.length === 1 && name?.endsWith(".md") === true) return name.slice(0, -".md".length);
  if (under.length !== 2 || name === undefined || file === undefined) return undefined;
  const dot = file.lastIndexOf(".");
  return dot !== -1 && VISUAL_EXTENSIONS.some((kind) => kind === file.slice(dot + 1))
    ? `${name}/${file.slice(0, dot)}`
    : undefined;
}

/**
 * The atlas pages, journeys and the map a change rewrote (J-227 S1): their
 * files under the atlas's and the map's folders that its commits, found by
 * its trailer, or its working tree changed and that stood before its first
 * commit, so a page the change made is none; by name, the pages first,
 * then the journeys, the map last.
 * @param root the repository root
 * @param id the change
 * @returns the names, each once
 */
function changeRewrote(root: string, id: string): readonly string[] {
  // The trailer's whole line, so another change whose id begins with this one's is none of its commits; an id holds no pattern character.
  const grep = [`--grep=^${TRAILER_KEY}: ${id}$`];
  const commits = readGit(root, ["log", "--format=%H", ...grep]);
  const oldest =
    commits._tag === "ok"
      ? commits.value
          .split("\n")
          .filter((line) => line !== "")
          .at(-1)
      : undefined;
  // A file the change added or modified; a page it deleted is no refresh.
  const files = readGit(root, ["log", "--format=", "--name-only", "--diff-filter=AM", ...grep]);
  const touched = [
    ...(files._tag === "ok" ? files.value.split("\n") : []),
    ...workingChanges(root),
  ].filter((path) => ATLAS_FOLDERS.some((folder) => path.startsWith(folder)));
  if (touched.length === 0) return [];
  const before = readGit(root, [
    "ls-tree",
    "-r",
    "--name-only",
    oldest === undefined ? "HEAD" : `${oldest}^`,
    "--",
    ...ATLAS_FOLDERS,
  ]);
  if (before._tag !== "ok") return [];
  const stood = new Set(before.value.split("\n"));
  const names = [
    ...new Set(
      touched.flatMap((path) => {
        const name = stood.has(path) ? pageOfFile(path) : undefined;
        return name === undefined ? [] : [name];
      }),
    ),
  ];
  const rank = (name: string): number => (name === "map" ? 2 : name.includes("/") ? 1 : 0);
  return names.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The pages, journeys and the map a change rewrote that the record's
 * `refreshes` name nowhere, by name (J-227 S1): what the done door holds
 * done for whatever the owner's words, and what the atlas line names at
 * the close.
 * @param root the repository root
 * @param id the change
 * @param refreshed the pages the record's refreshes name
 * @returns the names, the pages first and the map last
 */
export function refreshUnnamed(
  root: string,
  id: string,
  refreshed: readonly string[],
): readonly string[] {
  return changeRewrote(root, id).filter((name) => !refreshed.includes(name));
}

/** The map's manifest and its git answers, or undefined where no map stands. */
function mapOf(
  root: string,
): { readonly commit: string; readonly behind: number | null } | undefined {
  const map = readVisualsHome(root).find(
    (entry) => entry.place.kind === "map" && entry.manifest._tag === "ok",
  );
  if (map?.manifest._tag !== "ok") return undefined;
  const staleness = tierOf(driftFacts(root, map.manifest.value.commit, map.manifest.value.files));
  return { commit: map.manifest.value.commit, behind: staleness.commitsSince };
}

/** The code files' extensions a new top-level module must hold to count as code. */
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "rb",
  "php",
  "cs",
  "swift",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "scala",
  "ex",
  "exs",
  "clj",
  "lua",
  "dart",
  "vue",
  "svelte",
]);

/** The top-level folders a tree holds with a code file, by name. */
function codeModules(root: string, tree: string): ReadonlySet<string> {
  const inTree = readGit(root, ["ls-tree", "-r", "-z", "--name-only", tree]);
  if (inTree._tag === "err") return new Set();
  return new Set(
    inTree.value.split("\0").flatMap((path) => {
      const slash = path.indexOf("/");
      if (slash === -1 || path.startsWith(".")) return [];
      const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      return CODE_EXTENSIONS.has(extension) ? [path.slice(0, slash)] : [];
    }),
  );
}

/**
 * What the major-change reading reads since a commit (J-147 S1): the new
 * top-level modules with code, the shapes' files changed, the subsystems
 * the open change touches, the map's commits behind and the pages drifting.
 * @param root the repository root
 * @param atlas the index
 * @param since the commit read from, the map's or the first page's; null where none
 * @param change the open change, undefined where none
 * @param drifting the atlas pages drifting
 * @returns the facts
 */
function majorFacts(
  root: string,
  atlas: Atlas | undefined,
  since: string | null,
  mapBehind: number | null,
  change: string | undefined,
  drifting: number,
): MajorFacts {
  const known = since !== null && isCommit(root, since);
  const then = known ? codeModules(root, since) : undefined;
  const now = known ? codeModules(root, "HEAD") : new Set<string>();
  const changed = known ? readGit(root, ["diff", "--name-only", "-z", since, "HEAD"]) : undefined;
  const subsystems = atlas?.subsystems ?? [];
  const touched = change === undefined ? [] : changeTouched(root, change);
  return {
    newModules: then === undefined ? [] : [...now].filter((module) => !then.has(module)).sort(),
    modelPaths:
      changed?._tag === "ok"
        ? changed.value.split("\0").filter((path) => path !== "" && isModelFile(path))
        : [],
    spanned: subsystems
      .filter((subsystem) => touched.some((path) => coversPath(subsystem.files, path)))
      .map((subsystem) => subsystem.name),
    mapBehind,
    drifting,
    pages: subsystems.length,
  };
}

/**
 * The atlas line's facts as the home stands (J-147 S1): the pages and the
 * drifting ones, the map's commits behind, a major change since the map
 * where pages or a map stand, and at the close the pages the change
 * touched that drift, which the close refreshes.
 * @param root the repository root
 * @param drift the home's drift, read once
 * @param change the open change, undefined where none
 * @param atClose whether the change stands at its close step
 * @returns the standing, or undefined where the index does not read
 */
export function atlasStanding(
  root: string,
  drift: HomeDrift,
  change: string | undefined,
  atClose: boolean,
): AtlasStanding | undefined {
  const read = readAtlas(root);
  if (read?._tag === "err") return undefined;
  const atlas = read?.value;
  const map = mapOf(root);
  const drifting = drift.items.filter((item) => item.kind === "subsystem").length;
  const pages = atlas?.subsystems.length ?? 0;
  // A major change is read against the map's commit, or the first page's where no map stands.
  const since = map?.commit ?? atlas?.subsystems[0]?.commit ?? null;
  const major =
    pages > 0 || map !== undefined
      ? majorChange(majorFacts(root, atlas, since, map?.behind ?? null, change, drifting))
      : undefined;
  const touched =
    atClose && change !== undefined
      ? touchedPages(root, changeTouched(root, change))
          .filter((page) => page.staleness.tier !== "fresh")
          .map((page) => page.name)
      : undefined;
  // The pages the change rewrote that its record's refreshes line does not name, read as the done door reads them (J-227 S1).
  const unnamed =
    atClose && change !== undefined
      ? refreshUnnamed(root, change, recordRefreshes(root, change))
      : undefined;
  return { pages, drifting, mapBehind: map?.behind ?? null, major, touched, unnamed };
}

/** The pages the working tree's record of a change names in its `refreshes`, none where it stands nowhere. */
function recordRefreshes(root: string, change: string): readonly string[] {
  const text = textOf(root, `.greenline/ledger/${change}.md`);
  if (text === undefined) return [];
  const facts = recordFacts(text);
  return facts.readable ? (facts.refreshed ?? []) : [];
}

/**
 * The atlas line as the home stands, or undefined where the index does not
 * read (its notice says so).
 * @param root the repository root
 * @param drift the home's drift, read once
 * @param change the open change, undefined where none
 * @param atClose whether the change stands at its close step
 * @returns the line, unindented
 */
export function atlasLineOf(
  root: string,
  drift: HomeDrift,
  change: string | undefined,
  atClose: boolean,
): string | undefined {
  const standing = atlasStanding(root, drift, change, atClose);
  return standing === undefined ? undefined : atlasLine(standing);
}

/** The text a file holds, or undefined where it cannot be read. */
function textOf(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Keep the documents a change wrote at the commit HEAD names (J-147 S1):
 * each listed path among the written takes the commit and the change, so
 * the document no longer drifts for the change's own commits. Never stops
 * the event.
 * @param root the repository root
 * @param written the paths written, from the root
 * @param change the change that wrote them
 */
export function keepDocuments(root: string, written: readonly string[], change: string): void {
  const index = readDocuments(root);
  const head = headCommit(root);
  if (index?._tag !== "ok" || head.kind !== "commit") return;
  const next = documentsKept(index.value, written, head.id, change);
  if (next !== undefined) atomicWriteFile(join(root, DOCUMENTS_INDEX), next);
}

/**
 * Keep the documents a change kept at the commit the close stands at
 * (J-147 S1): when its record goes done, each listed document whose
 * `change` is the change takes HEAD, so no document drifts at its own
 * change's close.
 * @param root the repository root
 * @param change the change that closes
 * @param commit the commit the close stands at
 */
export function keepChangeDocuments(root: string, change: string, commit: string): void {
  const index = readDocuments(root);
  if (index?._tag !== "ok") return;
  const written = index.value.documents
    .filter((document) => document.change === change)
    .map((document) => document.path);
  const next = documentsKept(index.value, written, commit, change);
  if (next !== undefined) atomicWriteFile(join(root, DOCUMENTS_INDEX), next);
}

/**
 * Record in each written visual's manifest the addresses its file loads
 * from outside the repository (J-147 S3): after a write under the home, an
 * HTML or SVG visual's `reaches` follows its file. A manifest not yet
 * written, or one that is no JSON object, is left alone.
 * @param root the repository root
 * @param written the paths written, from the root, `/`-separated
 */
export function recordReaches(root: string, written: readonly string[]): void {
  const touched = new Set(
    written.flatMap((path) => {
      if (!path.startsWith(`${VISUALS_HOME}/`)) return [];
      const stem = path.endsWith(MANIFEST_SUFFIX)
        ? path.slice(0, -MANIFEST_SUFFIX.length)
        : path.slice(0, path.lastIndexOf("."));
      return [stem];
    }),
  );
  for (const stem of touched) {
    const manifest = `${stem}${MANIFEST_SUFFIX}`;
    const text = textOf(root, manifest);
    if (text === undefined) continue;
    const file = ["html", "svg"]
      .map((extension) => `${stem}.${extension}`)
      .find((path) => textOf(root, path) !== undefined);
    const reaches = file === undefined ? [] : reachesOf(textOf(root, file) ?? "");
    const next = manifestWithReaches(text, reaches);
    if (next !== undefined) atomicWriteFile(join(root, manifest), next);
  }
}

/**
 * The visuals whose manifest records an address outside the repository,
 * which status names as GL0608 and the mirror in one line (J-147 S3).
 * @param root the repository root
 * @returns each one's id, title, manifest's path and the addresses
 */
export function reachingVisuals(root: string): readonly {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly reaches: readonly string[];
  /** Who drew it, as its manifest records it (J-198 S1). */
  readonly madeBy: VisualMaker | undefined;
}[] {
  return readVisualsHome(root).flatMap((entry) =>
    entry.manifest._tag === "ok" && (entry.manifest.value.reaches ?? []).length > 0
      ? [
          {
            id: entry.id,
            title: entry.manifest.value.title,
            path: entry.manifestPath,
            reaches: entry.manifest.value.reaches ?? [],
            madeBy: entry.manifest.value.madeBy,
          },
        ]
      : [],
  );
}

/**
 * Pin the change's visuals to a commit (J-147 S3, J-216 S1): when the
 * record goes done, a manifest under the change's folder takes the commit
 * HEAD names only where none of the files it covers changed between its own
 * commit and that one, read by one `git diff --quiet`; a manifest whose
 * covered files changed, or whose commit the history does not hold, keeps
 * its commit, so status names its drift as before the close (the run
 * j196t-conduct-emptyd, the judge's finding 2). A capture is the interface
 * check's and keeps its own commit.
 * @param root the repository root
 * @param change the change
 * @param commit the commit to pin
 * @returns the manifests moved, and the ones kept with their reason
 */
export function repinChangeVisuals(root: string, change: string, commit: string): ChangePin {
  const moved: PinnedVisual[] = [];
  const kept: KeptAnchor[] = [];
  for (const entry of readVisualsHome(root)) {
    if (entry.place.kind !== "change" || entry.place.change !== change) continue;
    if (entry.manifest._tag !== "ok" || entry.manifest.value.capture !== undefined) continue;
    const stated = entry.manifest.value;
    if (stated.commit === commit) continue;
    const visual: PinnedVisual = { id: entry.id, path: entry.manifestPath };
    const covered = coveredSince(root, stated.commit, commit, stated.files);
    if (covered !== "unchanged") {
      kept.push({ ...visual, commit: stated.commit, reason: covered });
      continue;
    }
    const text = textOf(root, entry.manifestPath);
    const next = text === undefined ? undefined : manifestAtCommit(text, commit);
    if (next === undefined) continue;
    atomicWriteFile(join(root, entry.manifestPath), next);
    moved.push(visual);
  }
  return { moved, kept };
}

/**
 * Whether the files a visual covers changed between its commit and another,
 * by their bytes in the two trees: `unchanged` where `git diff --quiet`
 * finds no difference or the visual covers no file.
 */
function coveredSince(
  root: string,
  from: string,
  to: string,
  files: readonly string[],
): "unchanged" | KeptAnchor["reason"] {
  if (!isCommit(root, from)) return "commit-unknown";
  if (files.length === 0) return "unchanged";
  const code = gitExitCode(root, [
    "--literal-pathspecs",
    "diff",
    "--quiet",
    from,
    to,
    "--",
    ...files,
  ]);
  if (code === 0) return "unchanged";
  return code === 1 ? "covered-changed" : "commit-unknown";
}

/**
 * The refusal of a visual's manifest that names a file its commit does not
 * hold (J-147 S3; the register's row of 2026-10-28 on the one maker rule):
 * before a write tool writes a manifest under the visual home, the text it
 * will hold is read, the whole text a write gives or the current text with
 * an edit's replacement made, and each covered path is read against the
 * tree at the manifest's commit. A manifest that does not read, a commit
 * the history does not hold and a tool whose text the payload does not
 * carry are left to status's notices.
 */

/** The write tools' inputs the refusal reads: a whole text, or one replacement. */
const WRITE_INPUT = z
  .object({
    tool_input: z
      .object({
        file_path: z.string().optional().catch(undefined),
        content: z.string().optional().catch(undefined),
        old_string: z.string().optional().catch(undefined),
        new_string: z.string().optional().catch(undefined),
      })
      .catch({}),
  })
  .catch({ tool_input: {} });

/** A path from the root, `/`-separated, or undefined outside the repository. */
function underRoot(root: string, path: string, base: string): string | undefined {
  const relation = relative(root, isAbsolute(path) ? path : resolve(base, path));
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) return undefined;
  return relation.split(sep).join("/");
}

/** The text the write leaves the file holding, or undefined where the payload does not say. */
function textAfter(
  root: string,
  where: string,
  input: z.infer<typeof WRITE_INPUT>,
): string | undefined {
  const { content, old_string: before, new_string: after } = input.tool_input;
  if (content !== undefined) return content;
  if (before === undefined || after === undefined) return undefined;
  try {
    return readFileSync(join(root, where), "utf8").replace(before, after);
  } catch {
    return undefined;
  }
}

/**
 * The refusal of a write that leaves a manifest naming a file its commit
 * does not hold, or undefined.
 * @param root the repository root
 * @param payload the before-tool event's payload
 * @param base the directory a relative path is read from
 * @returns the refusal's line, the rule after it
 */
export function manifestFilesRefusal(
  root: string,
  payload: JsonValue,
  base: string,
): string | undefined {
  const input = WRITE_INPUT.parse(payload);
  const path = input.tool_input.file_path;
  if (path === undefined) return undefined;
  const where = underRoot(root, path, base);
  if (
    where === undefined ||
    !where.startsWith(`${VISUALS_HOME}/`) ||
    !where.endsWith(MANIFEST_SUFFIX)
  )
    return undefined;
  const text = textAfter(root, where, input);
  if (text === undefined) return undefined;
  const manifest = parseVisualManifest(text, where);
  if (manifest._tag === "err") return undefined;
  const absent = absentAt(root, manifest.value.commit, manifest.value.files);
  const first = absent?.[0];
  if (first === undefined) return undefined;
  const short = manifest.value.commit.slice(0, 7);
  return ruled(
    `the manifest ${where} is not written: it names ${first}, which its commit ${short} does not hold; a visual covers the files as they stand at the commit it was made at, so name the files that stand there, or make it at the commit that adds ${first}`,
    "manifest-files",
  );
}
