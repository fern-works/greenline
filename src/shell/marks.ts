import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "../commons/hash.ts";
import { isChangeId } from "../core/change.ts";
import {
  BOXES_SUFFIX,
  parseCaptureBoxes,
  type Box,
  type CaptureBoxes,
} from "../core/interface-boxes.ts";
import { boundsOf, elementsUnder } from "../core/interface-hits.ts";
import {
  closedMark,
  closureWordsRefusal,
  INTERFACE_MARKS,
  markId,
  MARKS_FILE,
  marksFileOf,
  proposed,
  markSchema,
  readMarks,
  type Mark,
  type MarkClosed,
  type MarkClosure,
  type MarkIntent,
  type MarkProposal,
  type OpenMark,
} from "../core/marks.ts";
import { MANIFEST_SUFFIX, tierOf, type VisualManifest } from "../core/visuals.ts";
import { withWorkspaceWrite } from "./fs/workspace-write.ts";
import { workingRecord, workspaceManifest } from "./hooks.ts";
import { driftFacts, readVisualsHome } from "./visuals.ts";

/**
 * The marks on disk (J-124 S2; `src/core/marks.ts`): every marks file the
 * ledger holds, one per change's folder and one under the interface ledger
 * home; the revision the viewer's saves check; the open marks with their
 * staleness by the commits since their captures; and the one way a mark is
 * written, an appended line under the writer lock, which `greenline mark`
 * and the viewer both take.
 */

/** One marks file read, with where it stands. */
export interface MarksFile {
  /** The file's path from the root. */
  readonly path: string;
  /** The change whose folder holds it; undefined for the interface ledger home's. */
  readonly change: string | undefined;
  readonly text: string;
  readonly marks: readonly Mark[];
  readonly unreadable: readonly { readonly line: number; readonly why: string }[];
}

/** A file's text, or undefined. */
function textAt(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Every marks file the ledger holds: the interface ledger home's, then each
 * change's folder's, in id order.
 * @param root the repository root
 * @returns the files read
 */
export function readMarksFiles(root: string): readonly MarksFile[] {
  let folders: readonly string[];
  try {
    folders = readdirSync(join(root, ".greenline", "ledger"))
      .filter(isChangeId)
      .sort();
  } catch {
    folders = [];
  }
  const paths: { path: string; change: string | undefined }[] = [
    { path: INTERFACE_MARKS, change: undefined },
    ...folders.map((change) => ({ path: `.greenline/ledger/${change}/${MARKS_FILE}`, change })),
  ];
  return paths.flatMap(({ path, change }): MarksFile[] => {
    const text = textAt(root, path);
    if (text === undefined) return [];
    return [{ path, change, text, ...readMarks(text) }];
  });
}

/**
 * The revision of the marks as they stand, which a viewer's save names:
 * one digest over every marks file's path and text, `none` while none stands.
 * @param files the files read
 * @returns the revision
 */
export function marksRevision(files: readonly MarksFile[]): string {
  return files.length === 0
    ? "none"
    : sha256Hex(JSON.stringify(files.map((file) => [file.path, file.text])));
}

/** A capture's manifest and boxes, by its visual id. */
export interface CaptureRead {
  readonly id: string;
  readonly manifest: VisualManifest;
  readonly boxes: CaptureBoxes | undefined;
}

/**
 * A capture the visual home holds, with its boxes where they stand.
 * @param root the repository root
 * @param id the capture's visual id
 * @returns the capture, or undefined
 */
export function readCapture(root: string, id: string): CaptureRead | undefined {
  const entry = readVisualsHome(root).find((visual) => visual.id === id);
  if (entry === undefined || entry.manifest._tag === "err") return undefined;
  if (entry.manifest.value.form !== "capture" || entry.manifest.value.capture === undefined)
    return undefined;
  const stem = entry.manifestPath.slice(0, -MANIFEST_SUFFIX.length);
  const text = textAt(root, `${stem}${BOXES_SUFFIX}`);
  const boxes = text === undefined ? undefined : parseCaptureBoxes(text, stem);
  return {
    id,
    manifest: entry.manifest.value,
    boxes: boxes?._tag === "ok" ? boxes.value : undefined,
  };
}

/** Whether a change is open: its record stands and is neither done nor dropped. */
function isOpen(root: string, change: string): boolean {
  const state = workingRecord(root, change)?.state;
  return state !== undefined && state !== "done" && state !== "dropped";
}

/**
 * The change open on an address: the change whose capture is marked, while
 * it is open, else an open change whose folder in the visual home holds a
 * capture of the address; undefined where none is.
 * @param root the repository root
 * @param address the address
 * @param capture the capture marked
 * @returns the change's id, or undefined
 */
function changeOnAddress(root: string, address: string, capture: string): string | undefined {
  const own = capture.split("/")[0] ?? "";
  if (isChangeId(own) && isOpen(root, own)) return own;
  const holding = readVisualsHome(root).flatMap((entry) =>
    entry.place.kind === "change" &&
    entry.manifest._tag === "ok" &&
    entry.manifest.value.capture?.address === address
      ? [entry.place.change]
      : [],
  );
  return [...new Set(holding)].sort().find((change) => isOpen(root, change));
}

/**
 * Whether the files a mark's capture shows moved since it was taken: the
 * marked element's source file where the build named one, else the files
 * its capture covers, else the manifest's interface roots; an unreadable
 * commit is stale too.
 * @param root the repository root
 * @param mark the mark
 * @param manifest its capture's manifest, where it still stands
 * @returns whether it is stale
 */
export function markStale(root: string, mark: Mark, manifest: VisualManifest | undefined): boolean {
  const source = mark.element?.source?.file;
  const covered =
    source !== undefined && !source.startsWith("/") ? [source] : (manifest?.files ?? []);
  // A capture that names no file, a page with no source hints captured with no change open or a capture deleted, falls back to the interface roots.
  const files =
    covered.length > 0
      ? covered
      : (workspaceManifest(root)?.interface?.roots ?? [])
          // A root at the repository's root would count every commit, the record's own among them.
          .filter((path) => path !== "." && path !== "")
          .map((path) => `${path.replace(/\/+$/, "")}/`);
  return tierOf(driftFacts(root, mark.capture.commit, files)).tier !== "fresh";
}

/**
 * The open marks, each with its staleness.
 * @param root the repository root
 * @param files the marks files read
 * @returns the open marks
 */
export function openMarks(root: string, files: readonly MarksFile[]): readonly OpenMark[] {
  return files.flatMap((file) =>
    file.marks
      .filter((mark) => mark.state === "open")
      .map((mark) => ({
        mark,
        stale: markStale(root, mark, readCapture(root, mark.capture.id)?.manifest),
      })),
  );
}

/**
 * The capture ids a mark names, as its capture or as its proposal's
 * after, which a new capture never overwrites.
 * @param root the repository root
 * @returns the ids
 */
export function markedCaptures(root: string): ReadonlySet<string> {
  return new Set(
    readMarksFiles(root).flatMap((file) =>
      file.marks.flatMap((mark) => [
        mark.capture.id,
        ...(mark.proposed?.capture === null || mark.proposed === null
          ? []
          : [mark.proposed.capture]),
      ]),
    ),
  );
}

/** A mark's target on its capture: an element by its selector, or a region by its stroke. */
export type MarkTarget =
  | { readonly kind: "element"; readonly selector: string }
  | { readonly kind: "region"; readonly path: readonly (readonly [number, number])[] };

/** What a new mark names. */
export interface MarkRequest {
  readonly capture: string;
  readonly width: number;
  readonly target: MarkTarget;
  readonly note: string;
  readonly intent: MarkIntent;
  /** The owner in the viewer, or the agent recording the owner's words. */
  readonly by: "owner" | "agent";
  readonly words: string | null;
}

/** What a write answers: the mark as it then stands and its file, or why not, a stale revision a conflict. */
export type MarkWritten =
  | { readonly kind: "written"; readonly mark: Mark; readonly file: string }
  | { readonly kind: "refused"; readonly conflict: boolean; readonly error: string };

const refused = (error: string, conflict = false): MarkWritten => ({
  kind: "refused",
  conflict,
  error,
});

/** A rectangle grown by a margin, held inside the page. */
function cropAround(box: Box, page: { readonly width: number; readonly height: number }): Box {
  const margin = 24;
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  return {
    x,
    y,
    width: Math.max(0, Math.min(page.width, box.x + box.width + margin) - x),
    height: Math.max(0, Math.min(page.height, box.y + box.height + margin) - y),
  };
}

/** Append one line to a marks file, making its folder, once it reads as a mark; a line that would not read back is refused. */
function appendLine(root: string, path: string, mark: Mark): MarkWritten {
  const checked = markSchema.safeParse(mark);
  if (!checked.success)
    return refused(
      `The mark does not read: ${checked.error.issues.map((issue) => `${issue.path.join(".") || "mark"}: ${issue.message}`).join("; ")}.`,
    );
  mkdirSync(dirname(join(root, path)), { recursive: true });
  appendFileSync(join(root, path), `${JSON.stringify(mark)}\n`);
  return { kind: "written", mark, file: path };
}

/** Run a write under the writer lock, after the revision check where one is named. */
function underLock(
  root: string,
  expected: string | undefined,
  write: (files: readonly MarksFile[]) => MarkWritten,
): MarkWritten {
  const locked = withWorkspaceWrite(root, (): MarkWritten => {
    const files = readMarksFiles(root);
    if (expected !== undefined && marksRevision(files) !== expected)
      return refused("The marks changed since this page read them; read them again first.", true);
    return write(files);
  });
  return locked._tag === "ok" ? locked.value : refused(locked.error.message, true);
}

/**
 * Append a new mark, in the folder of the change open on its address or
 * under the interface ledger home.
 * @param root the repository root
 * @param request what it marks
 * @param now when
 * @param expected the revision the viewer read; undefined from the CLI, which reads under the lock
 * @returns the mark written, or why not
 */
export function addMark(
  root: string,
  request: MarkRequest,
  now: Date,
  expected?: string,
): MarkWritten {
  const capture = readCapture(root, request.capture);
  if (capture === undefined) return refused(`No capture ${request.capture} in the visual home.`);
  const address = capture.manifest.capture?.address ?? "/";
  if (capture.boxes === undefined)
    return refused(
      `The capture ${request.capture} keeps no boxes; capture ${address} again to mark it.`,
    );
  const width = capture.boxes.widths.find((entry) => entry.width === request.width);
  if (width === undefined)
    return refused(
      `The capture ${request.capture} holds the widths ${capture.boxes.widths.map((entry) => entry.width).join(", ")}, not ${String(request.width)}.`,
    );
  let element: Mark["element"] = null;
  let region: Mark["region"] = null;
  let crop: Box;
  const { target } = request;
  if (target.kind === "element") {
    const found = width.elements.find((entry) => entry.selector === target.selector);
    if (found === undefined)
      return refused(
        `No element ${target.selector} at ${String(request.width)} in the capture ${request.capture}.`,
      );
    element = found;
    crop = cropAround(found.box, width.page);
  } else {
    const bounds = boundsOf(target.path);
    if (bounds === undefined || target.path.length < 2)
      return refused("A region is a stroke of two points or more.");
    region = {
      path: target.path,
      elements: elementsUnder(width.elements, target.path).map((entry) => entry.selector),
    };
    crop = cropAround(bounds, width.page);
  }
  const at = now.toISOString();
  const note = request.note.trim();
  const mark: Mark = {
    id: markId(JSON.stringify([request.capture, request.width, target, note, at])),
    address,
    width: request.width,
    capture: { id: request.capture, commit: capture.manifest.commit },
    element,
    region,
    crop,
    note,
    intent: request.intent,
    state: "open",
    by: request.by,
    words: request.words,
    at,
    proposed: null,
    closed: null,
  };
  return underLock(root, expected, () => {
    const file = marksFileOf(changeOnAddress(root, address, request.capture));
    return appendLine(root, file, mark);
  });
}

/** Find a mark as it stands, with its file. */
function standing(
  files: readonly MarksFile[],
  id: string,
): { readonly mark: Mark; readonly file: string } | undefined {
  for (const file of files) {
    const mark = file.marks.find((entry) => entry.id === id);
    if (mark !== undefined) return { mark, file: file.path };
  }
  return undefined;
}

/**
 * The agent's proposal to close a mark, with its evidence; the mark stays open.
 * @param root the repository root
 * @param id the mark
 * @param proposal what it proposes and shows
 * @returns the mark written, or why not
 */
export function proposeMark(
  root: string,
  id: string,
  proposal: Omit<MarkProposal, "at">,
  now: Date,
): MarkWritten {
  if (proposal.capture !== null && readCapture(root, proposal.capture) === undefined)
    return refused(`No capture ${proposal.capture} in the visual home.`);
  return underLock(root, undefined, (files) => {
    const found = standing(files, id);
    if (found === undefined) return refused(`No mark ${id}.`);
    if (found.mark.state !== "open")
      return refused(`The mark ${id} is ${found.mark.state} already.`);
    const mark = proposed(found.mark, { ...proposal, at: now.toISOString() });
    return appendLine(root, found.file, mark);
  });
}

/**
 * Close a mark on the owner's act: in the viewer, or in the owner's words,
 * which the line quotes; a closure with neither is refused.
 * @param root the repository root
 * @param id the mark
 * @param as addressed or declined
 * @param act how the owner acted: the viewer, or the words quoted
 * @param now when
 * @param expected the revision the viewer read; undefined from the CLI
 * @returns the mark written, or why not
 */
export function closeMark(
  root: string,
  id: string,
  as: MarkClosure,
  act: { readonly via: "viewer" } | { readonly via: "words"; readonly words: string },
  now: Date,
  expected?: string,
): MarkWritten {
  if (act.via === "words" && act.words.trim() === "")
    return refused(
      "A mark closes only on the owner's act: quote the owner's words, or let the owner close it in the viewer.",
    );
  return underLock(root, expected, (files) => {
    const found = standing(files, id);
    if (found === undefined) return refused(`No mark ${id}.`);
    if (found.mark.state !== "open")
      return refused(`The mark ${id} is ${found.mark.state} already.`);
    // Words close a mark only as the owner's verdict on it; the viewer's click is unchanged (J-129 S5).
    const verdict = act.via === "words" ? closureWordsRefusal(act.words, found.mark) : undefined;
    if (verdict !== undefined) return refused(verdict);
    const closed: MarkClosed = {
      by: "owner",
      via: act.via,
      words: act.via === "words" ? act.words.trim() : null,
      at: now.toISOString(),
    };
    const mark = closedMark(found.mark, as, closed);
    return appendLine(root, found.file, mark);
  });
}
