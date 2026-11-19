import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../commons/hash.ts";
import {
  calledBy,
  majorWords,
  subsystemPage,
  type Atlas,
  type AtlasSubsystem,
} from "../../core/atlas.ts";
import { parseJson } from "../../core/contract.ts";
import { INSPECT_SCHEMA } from "../../core/inspector/contract.ts";
import type {
  AtlasDocument,
  DocumentPageDocument,
  DocumentView,
  DriftNotice,
  HomeReading,
  JourneyView,
  MapLayer,
  NotesReading,
  PictureDocument,
  PicturesDocument,
  SubsystemDocument,
  SubsystemView,
  Unread,
  VisualView,
} from "../../core/inspector/documents.ts";
import { BOXES_SUFFIX } from "../../core/interface-boxes.ts";
import { MANIFEST_SUFFIX, tierOf, type VisualManifest } from "../../core/visuals.ts";
import { applyFilePlan } from "../fs/apply.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import {
  atlasStanding,
  driftFacts,
  readAtlas,
  readDocuments,
  readDrift,
  readVisualsHome,
  refusalText,
  writeChangeLinks,
  type VisualEntry,
} from "../visuals.ts";
import { captureView } from "./captures.ts";
import { repositoryResolver } from "./links.ts";
import { pictureRef } from "./refs.ts";
import { renderMarkdown } from "./markdown.ts";
import { readInstalledFile, readShownFile } from "./repository-read.ts";

/*
 * The visual home's documents (J-110 S2 and S7): the Visuals tab's cards,
 * one visual with its picture, the atlas's map and subsystem pages, the
 * drift on the desk, a visual's own bytes for the page to show in place,
 * and the view's one write, the delete, with its revision check. Each reads
 * the home through `src/shell/visuals.ts`, the reader `greenline status`
 * uses, so the inspector's tier and status's notice never disagree.
 */

/** A visual whose manifest reads, with its view. */
interface Shown {
  readonly entry: VisualEntry;
  readonly manifest: VisualManifest;
  readonly view: VisualView;
}

/** The digest of what a visual's manifest and file hold, which a delete names. */
function revisionOf(root: string, entry: VisualEntry): string {
  const io = createNodeFileIo();
  const read = (path: string): string => {
    const text = readInstalledFile(root, io, path);
    return text._tag === "ok" ? text.value : "";
  };
  return sha256Hex(
    JSON.stringify([read(entry.manifestPath), entry.file === null ? "" : read(entry.file.path)]),
  );
}

/** Every visual whose manifest reads, with its tier: the map first, then the journeys, then the changes' newest first; one change's alone where it names one. */
function shownVisuals(root: string, change?: string): readonly Shown[] {
  const rank = { map: 0, journey: 1, change: 2, interface: 3, style: 4 } as const;
  return readVisualsHome(root)
    .flatMap((entry): Shown[] => {
      if (entry.manifest._tag === "err") return [];
      const manifest = entry.manifest.value;
      // A change's page reads its own pictures, and no other's drift is read for it.
      if (change !== undefined && manifest.change !== change) return [];
      const staleness = tierOf(driftFacts(root, manifest.commit, manifest.files));
      const view: VisualView = {
        id: entry.id,
        ref: pictureRef(entry.id, manifest.title),
        path: entry.file?.path ?? entry.manifestPath,
        place: entry.place.kind,
        file: entry.file === null ? null : { path: entry.file.path, kind: entry.file.extension },
        revision: revisionOf(root, entry),
        title: manifest.title,
        form: manifest.form,
        skill: manifest.skill,
        change: manifest.change,
        commit: manifest.commit,
        files: manifest.files,
        made: manifest.made,
        madeBy: manifest.madeBy ?? null,
        summary: manifest.summary,
        // The brief's question and finish, which the card shows (J-204 S1).
        question: manifest.brief?.question ?? null,
        finish: manifest.brief?.finish ?? null,
        // A capture's scores as numbers, which the summary words (J-165 S1).
        scores: manifest.form === "capture" ? (manifest.capture?.scores ?? null) : null,
        tier: staleness.tier,
        commitsSince: staleness.commitsSince,
      };
      return [{ entry, manifest, view }];
    })
    .sort((a, b) => {
      const byPlace = rank[a.view.place] - rank[b.view.place];
      if (byPlace !== 0) return byPlace;
      // Change ids open with their date, so a later id is a newer change.
      if (a.view.place === "change") return a.view.id < b.view.id ? 1 : -1;
      return a.view.id < b.view.id ? -1 : 1;
    });
}

/**
 * The durable pictures, each with its tier, the captures among them.
 * @param root the repository root
 * @param change a change whose own pictures alone are read, for its page
 * @returns the document
 */
export function picturesDocument(root: string, change?: string): Unread<PicturesDocument> {
  return {
    schema: INSPECT_SCHEMA,
    kind: "pictures",
    pictures: { available: true, items: shownVisuals(root, change).map((shown) => shown.view) },
  };
}

/**
 * One picture, looked up among those the home holds, with a Markdown visual
 * rendered by the house renderer, and a capture with its boxes and the
 * notes pinned to it (J-154 S3).
 * @param root the repository root
 * @param id the visual's id
 * @param notes the notes on every capture, with their revision
 * @returns the document, or undefined for an id the home does not hold
 */
export function pictureDocument(
  root: string,
  id: string,
  notes: NotesReading,
): Unread<PictureDocument> | undefined {
  const found = shownVisuals(root).find((shown) => shown.view.id === id);
  if (found === undefined) return undefined;
  const file = found.entry.file;
  let html: string | null = null;
  if (file?.extension === "md") {
    const shown = readShownFile(root, file.path);
    html =
      shown.text === null
        ? null
        : renderMarkdown(shown.text, repositoryResolver(posix.dirname(file.path)));
  }
  const capture = found.manifest.form === "capture" ? (captureView(root, id) ?? null) : null;
  return {
    schema: INSPECT_SCHEMA,
    kind: "picture",
    picture: found.view,
    html,
    capture,
    notes: {
      ...notes,
      notes: capture === null ? [] : notes.notes.filter((view) => view.mark.capture.id === id),
    },
  };
}

/** A subsystem's view, with its journeys from the home and its tier from its covered files. */
function subsystemView(
  root: string,
  atlas: Atlas,
  subsystem: AtlasSubsystem,
  visuals: readonly Shown[],
): SubsystemView {
  const journeys = visuals
    .filter(
      (shown) =>
        shown.entry.place.kind === "journey" && shown.entry.place.subsystem === subsystem.name,
    )
    .map((shown): JourneyView => ({
      id: shown.view.id,
      title: shown.view.title,
      path: shown.view.path,
      tier: shown.view.tier,
    }));
  return {
    name: subsystem.name,
    title: subsystem.title,
    page: subsystemPage(subsystem.name),
    layer: subsystem.layer,
    summary: subsystem.summary,
    files: subsystem.files,
    commit: subsystem.commit,
    tier: tierOf(driftFacts(root, subsystem.commit, subsystem.files)).tier,
    journeys,
    calls: subsystem.calls,
    calledBy: calledBy(atlas, subsystem.name),
  };
}

/** The atlas's subsystems as views, or why the atlas cannot be read. */
function subsystemViews(
  root: string,
):
  | { readonly atlas: Atlas; readonly views: readonly SubsystemView[] }
  | { readonly reason: string } {
  const atlas = readAtlas(root);
  if (atlas === undefined) return { atlas: EMPTY_ATLAS, views: [] };
  if (atlas._tag === "err")
    return { reason: `The atlas's index does not read: ${refusalText(atlas.error)}.` };
  const visuals = shownVisuals(root);
  return {
    atlas: atlas.value,
    views: atlas.value.subsystems.map((subsystem) =>
      subsystemView(root, atlas.value, subsystem, visuals),
    ),
  };
}

const EMPTY_ATLAS: Atlas = {
  schema: "greenline.atlas/v1",
  layers: [],
  subsystems: [],
  refreshes: [],
};

/**
 * The atlas: the map's bands from the index's layers, each with its
 * subsystems and their tiers, and the subsystem pages; both empty before
 * the `explain` start first writes the index.
 * @param root the repository root
 * @returns the document
 */
export function atlasDocument(root: string): Unread<AtlasDocument> {
  const read = subsystemViews(root);
  const drift = readDrift(root);
  const standing = atlasStanding(root, drift, undefined, false);
  const facts = {
    standing: {
      pages: standing?.pages ?? 0,
      major: standing?.major === undefined ? null : majorWords(standing.major),
      mapBehind: standing?.mapBehind ?? null,
    },
    documents: documentsReading(root),
  } as const;
  if ("reason" in read) {
    const unread = { available: false, reason: read.reason, items: [] } as const;
    return {
      schema: INSPECT_SCHEMA,
      kind: "atlas",
      map: unread,
      subsystems: unread,
      ...facts,
      refreshes: [],
    };
  }
  const map: MapLayer[] = read.atlas.layers.map((name) => ({
    name,
    subsystems: read.views
      .filter((view) => view.layer === name)
      .map((view) => ({ name: view.name, tier: view.tier })),
  }));
  return {
    schema: INSPECT_SCHEMA,
    kind: "atlas",
    map: { available: true, items: map },
    subsystems: { available: true, items: read.views },
    ...facts,
    refreshes: read.atlas.refreshes.map((refresh) => ({
      change: refresh.change,
      whole: refresh.whole,
      pages: refresh.pages,
      cost: refresh.cost ?? null,
    })),
  };
}

/** The indexed documents, each with its tier, or why the index does not read (J-147 S5). */
function documentsReading(root: string): HomeReading<DocumentView> {
  const index = readDocuments(root);
  if (index === undefined) return { available: true, items: [] };
  if (index._tag === "err")
    return {
      available: false,
      reason: `The documents index does not read: ${refusalText(index.error)}.`,
      items: [],
    };
  return {
    available: true,
    items: index.value.documents.map((document) => {
      const staleness = tierOf(driftFacts(root, document.commit, document.files));
      return {
        path: document.path,
        author: document.author,
        files: document.files,
        commit: document.commit,
        change: document.change,
        tier: staleness.tier,
        commitsSince: staleness.commitsSince,
      };
    }),
  };
}

/**
 * One indexed document's page (J-147 S5), looked up among those the index
 * lists, never by a path the request builds: its facts and its text
 * rendered by the house renderer.
 * @param root the repository root
 * @param path the document's path from the root
 * @returns the document, or undefined for a path the index does not list
 */
export function documentPage(root: string, path: string): Unread<DocumentPageDocument> | undefined {
  const reading = documentsReading(root);
  const document = reading.items.find((entry) => entry.path === path);
  if (document === undefined) return undefined;
  const shown = readShownFile(root, document.path);
  const html =
    shown.text === null
      ? null
      : renderMarkdown(shown.text, repositoryResolver(posix.dirname(document.path)));
  return { schema: INSPECT_SCHEMA, kind: "document", document, html };
}

/**
 * One subsystem's page, looked up among those the atlas's index holds.
 * @param root the repository root
 * @param name the subsystem's name
 * @returns the document, or undefined for a name the index does not hold
 */
export function subsystemDocument(
  root: string,
  name: string,
): Unread<SubsystemDocument> | undefined {
  const read = subsystemViews(root);
  if ("reason" in read) return undefined;
  const view = read.views.find((entry) => entry.name === name);
  if (view === undefined) return undefined;
  const shown = readShownFile(root, view.page);
  const html =
    shown.text === null
      ? null
      : renderMarkdown(shown.text, repositoryResolver(posix.dirname(view.page)));
  return { schema: INSPECT_SCHEMA, kind: "subsystem", subsystem: view, html };
}

/**
 * The drift the desk shows: every visual and atlas page that is not fresh.
 * @param root the repository root
 * @returns the reading
 */
export function driftReading(root: string): HomeReading<DriftNotice> {
  return {
    available: true,
    items: readDrift(root).items.map((item): DriftNotice => ({
      kind: item.kind,
      id: item.id,
      title: item.title,
      tier: item.staleness.tier,
      detail:
        item.staleness.commitsSince === null
          ? `its commit ${item.commit.slice(0, 7)} is not in the history`
          : `${String(item.staleness.commitsSince)} commit${item.staleness.commitsSince === 1 ? "" : "s"} since ${item.commit.slice(0, 7)}${item.kind === "document" ? (item.author === "owner" ? ", the owner's page, offered and never rewritten unasked" : ", a page the practice keeps") : ""}`,
    })),
  };
}

/** The largest visual the page shows in place. */
const RAW_LIMIT = 8 * 1024 * 1024;

/** What a visual's own bytes answer: the bytes with their type, or why none. */
export type RawVisual =
  | {
      readonly status: 200;
      readonly type: string;
      readonly body: string;
      /** The policy the bytes are served under, the sandbox they run in (J-144 S7). */
      readonly policy: string;
    }
  | {
      readonly status: 404 | 413;
      readonly type: "text/plain; charset=utf-8";
      readonly body: string;
    };

/**
 * A visual's own file, looked up among those the home holds, for the page
 * to show in place: an SVG drawing as an image, an HTML page in a frame. A
 * path is never built from the id, and a file that resolves outside the
 * repository is refused.
 * @param root the repository root
 * @param id the visual's id
 * @returns the bytes and their type, or why none
 */
export function rawVisual(root: string, id: string): RawVisual {
  const entry = readVisualsHome(root).find((candidate) => candidate.id === id);
  const file = entry?.file;
  if (file === undefined || file === null || file.extension === "md")
    return { status: 404, type: "text/plain; charset=utf-8", body: "No such visual file." };
  try {
    const resolved = realpathSync(join(root, file.path));
    if (!resolved.startsWith(realpathSync(root) + sep))
      return { status: 404, type: "text/plain; charset=utf-8", body: "No such visual file." };
    if (statSync(resolved).size > RAW_LIMIT)
      return {
        status: 413,
        type: "text/plain; charset=utf-8",
        body: "The visual is too large to show here; open its file.",
      };
  } catch {
    return { status: 404, type: "text/plain; charset=utf-8", body: "No such visual file." };
  }
  const read = readInstalledFile(root, createNodeFileIo(), file.path);
  if (read._tag === "err")
    return { status: 404, type: "text/plain; charset=utf-8", body: "No such visual file." };
  const capture = entry?.manifest._tag === "ok" && entry.manifest.value.form === "capture";
  return {
    status: 200,
    type: file.extension === "svg" ? "image/svg+xml" : "text/html; charset=utf-8",
    body: read.value,
    policy: capture ? CAPTURE_POLICY : VISUAL_POLICY,
  };
}

/**
 * What a visual's bytes may do in the page: nothing from the network, no
 * form, no navigation of the page, its own inline style and script inside a
 * sandbox with an opaque origin, so it can never call the inspector's API.
 * The raw address's own policy is the sandbox, whatever frames it (J-144 S7): the
 * pages embed the address with no sandbox attribute of their own, which an
 * embedding browser's client may refuse to load, so the picture page and the
 * address show the same bytes with the same type.
 */
export const VISUAL_POLICY =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; sandbox allow-scripts";

/**
 * A capture's policy: the visual's, with no script at all, since a capture
 * is the owner's page as it stood and runs nothing of it here (J-144 S7).
 */
export const CAPTURE_POLICY =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'; sandbox";

const DELETE = z
  .object({ id: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

/**
 * The Visuals view's one write: delete a visual, its manifest and its file,
 * under the workspace lock with both rolled back on a failure, refused with
 * a conflict when the visual changed since the page read it; the change's
 * links file follows.
 * @param root the repository root
 * @param body the request's body, `{ id, expectedRevision }`
 * @returns the removed paths, or why not, a conflict for a stale revision
 */
export function deleteVisual(
  root: string,
  body: string,
):
  | { readonly removed: readonly string[] }
  | { readonly error: string; readonly conflict?: boolean } {
  const parsed = DELETE.safeParse(parseJson(body));
  if (!parsed.success) return { error: "A delete names the visual's id and the revision it read." };
  try {
    const base = join(root, ".greenline");
    if (
      lstatSync(base).isSymbolicLink() ||
      (existsSync(join(base, "visuals")) && lstatSync(join(base, "visuals")).isSymbolicLink())
    )
      return { error: "A redirected visual home is refused." };
  } catch {
    return { error: "The visual home is unavailable." };
  }
  const locked = withWorkspaceWrite(
    root,
    (): { removed: readonly string[] } | { error: string; conflict?: boolean } => {
      const entry = readVisualsHome(root).find((candidate) => candidate.id === parsed.data.id);
      if (entry === undefined)
        return { error: "No such visual: it may have been deleted already.", conflict: true };
      if (revisionOf(root, entry) !== parsed.data.expectedRevision)
        return {
          error:
            "The visual changed since this page read it, so the delete is refused; read it again first.",
          conflict: true,
        };
      // A capture's boxes go with it (J-124 S1).
      const boxes = entry.manifestPath.slice(0, -MANIFEST_SUFFIX.length) + BOXES_SUFFIX;
      const paths = [
        entry.manifestPath,
        ...(entry.file === null ? [] : [entry.file.path]),
        ...(existsSync(join(root, boxes)) ? [boxes] : []),
      ];
      const removed = applyFilePlan(
        paths.map((path) => ({ path: join(root, path), remove: true as const })),
        createNodeFileIo(),
      );
      if (removed._tag === "err") return { error: removed.error.message };
      if (entry.place.kind === "change")
        writeChangeLinks(root, entry.place.change, "greenline inspect");
      return { removed: paths };
    },
  );
  return locked._tag === "err" ? { error: locked.error.message, conflict: true } : locked.value;
}
