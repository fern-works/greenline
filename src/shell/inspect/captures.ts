import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { BOXES_SUFFIX, parseCaptureBoxes } from "../../core/interface-boxes.ts";
import { sameElement } from "../../core/interface-hits.ts";
import { MARK_INTENTS } from "../../core/marks.ts";
import type {
  CaptureView,
  CaptureWidthView,
  MarkView,
  NotesReading,
} from "../../core/inspector/documents.ts";
import { MANIFEST_SUFFIX, tierOf } from "../../core/visuals.ts";
import { captureImages } from "../interface-capture.ts";
import { viewerOriginRefusal, type CaptureLimit } from "../../core/interface-check.ts";
import { captureNow } from "../interface-check.ts";
import {
  addMark,
  closeMark,
  markStale,
  marksRevision,
  readCapture,
  readMarksFiles,
  type MarkWritten,
} from "../marks.ts";
import { driftFacts, readVisualsHome } from "../visuals.ts";
import { noteRef } from "./refs.ts";

/**
 * The capture view's documents (J-124 S1; `workshop/components/inspector.md`,
 * "The views"): one capture of an address with its full-page image and its
 * boxes at each width, and capture now, which renders an address of the
 * owner's running page and keeps it as a capture. Reading only reads; capture
 * now writes the capture through the render engine.
 */

/** A file's text, or undefined. */
function textAt(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * One capture with its images and its boxes, which its picture's document carries (J-154 S3).
 * @param root the repository root
 * @param id the capture's visual id
 * @returns the capture, or undefined where the home holds no capture by that id
 */
export function captureView(root: string, id: string): CaptureView | undefined {
  const entries = readVisualsHome(root);
  const entry = entries.find((visual) => visual.id === id);
  if (entry === undefined || entry.manifest._tag === "err") return undefined;
  const manifest = entry.manifest.value;
  const facts = manifest.capture;
  if (manifest.form !== "capture" || facts === undefined) return undefined;
  const stem = entry.manifestPath.slice(0, -MANIFEST_SUFFIX.length);
  const html = entry.file === null ? undefined : textAt(root, entry.file.path);
  const images = html === undefined ? [] : captureImages(html);
  const boxesText = textAt(root, `${stem}${BOXES_SUFFIX}`);
  const boxes = boxesText === undefined ? undefined : parseCaptureBoxes(boxesText, stem);
  const widths: CaptureWidthView[] =
    boxes?._tag === "ok"
      ? boxes.value.widths.map((kept) => ({
          width: kept.width,
          height: kept.height,
          image:
            images.find(
              (image) =>
                image.width === kept.width &&
                image.part === "full page" &&
                image.scheme === "light" &&
                image.motion === "full",
            )?.dataUrl ?? null,
          imageHeight: kept.image.height,
          page: kept.page,
          elements: kept.elements,
          truncated: kept.truncated,
        }))
      : [];
  const staleness = tierOf(driftFacts(root, manifest.commit, manifest.files));
  const history = entries
    .flatMap((visual) =>
      visual.manifest._tag === "ok" &&
      visual.manifest.value.form === "capture" &&
      visual.manifest.value.capture?.address === facts.address
        ? [
            {
              id: visual.id,
              made: visual.manifest.value.made,
              commit: visual.manifest.value.commit,
            },
          ]
        : [],
    )
    .sort((a, b) => (a.made < b.made ? -1 : a.made > b.made ? 1 : a.id < b.id ? -1 : 1))
    // Each other capture is earlier or later than this one by its time, the same time by its place in the order (J-165 S1).
    .map((capture, index, all) => {
      const here = all.findIndex((each) => each.id === id);
      const when: "earlier" | "this" | "later" =
        capture.id === id ? "this" : index < here ? "earlier" : "later";
      return { ...capture, when };
    });
  return {
    id,
    address: facts.address,
    change: manifest.change,
    commit: manifest.commit,
    made: manifest.made,
    files: manifest.files,
    tier: staleness.tier,
    commitsSince: staleness.commitsSince,
    widths,
    boxes:
      boxes === undefined
        ? "This capture was taken before the captures kept their boxes; capture the address again to mark it."
        : boxes._tag === "err"
          ? `Its boxes do not read: ${boxes.error.issues.map((issue) => issue.message).join("; ")}`
          : null,
    scores: facts.scores,
    history,
  };
}

/**
 * Every mark on the captures, each with its file, its staleness and the
 * capture after it: the one the agent's proposal names, else the newest
 * capture of its address made after it, with the marked element's box
 * there where its selector or its source finds it (J-124 S2 and S3), with
 * the revision a write names; the interface's, a change's and a picture's
 * documents carry them (J-154 S3).
 * @param root the repository root
 * @returns the notes
 */
export function notesReading(root: string): NotesReading {
  const files = readMarksFiles(root);
  const visuals = readVisualsHome(root);
  const marks: MarkView[] = files.flatMap((file) =>
    file.marks.map((mark): MarkView => {
      const later = visuals
        .flatMap((entry) =>
          entry.manifest._tag === "ok" &&
          entry.manifest.value.form === "capture" &&
          entry.manifest.value.capture?.address === mark.address &&
          entry.id !== mark.capture.id &&
          entry.manifest.value.made > mark.at
            ? [{ id: entry.id, made: entry.manifest.value.made }]
            : [],
        )
        .sort((a, b) => (a.made < b.made ? 1 : -1))[0]?.id;
      const afterId = mark.proposed?.capture ?? later;
      const after = afterId === undefined ? undefined : readCapture(root, afterId);
      const elements =
        after?.boxes?.widths.find((entry) => entry.width === mark.width)?.elements ?? [];
      const found = mark.element === null ? undefined : sameElement(elements, mark.element);
      return {
        ref: noteRef(mark.id, mark.note),
        mark,
        file: file.path,
        change: file.change ?? null,
        stale:
          mark.state === "open" &&
          markStale(root, mark, readCapture(root, mark.capture.id)?.manifest),
        after:
          afterId === undefined
            ? null
            : { capture: afterId, box: found === undefined ? null : found.box },
      };
    }),
  );
  return {
    revision: marksRevision(files),
    notes: marks,
    unreadable: files.flatMap((file) =>
      file.unreadable.map((line) => `${file.path}:${String(line.line)}: ${line.why}`),
    ),
  };
}

/** What the viewer's mark sends: the capture, the width, an element or a stroke, the note, the intent and the revision read. */
const markRequestSchema = z
  .object({
    capture: z.string().min(1),
    width: z.number().int().positive(),
    selector: z.string().min(1).optional(),
    region: z
      .array(z.tuple([z.number(), z.number()]))
      .min(2)
      .optional(),
    note: z.string().trim().min(1).max(2000),
    intent: z.enum(MARK_INTENTS),
    revision: z.string().min(1),
  })
  .strict();

/**
 * The owner's mark from the viewer, appended with the revision check.
 * @param root the repository root
 * @param body the request's body
 * @param now when
 * @returns the mark written, or why not
 */
export function markFromViewer(root: string, body: string, now: Date = new Date()): MarkWritten {
  const parsed = markRequestSchema.safeParse(parseJson(body));
  if (
    !parsed.success ||
    (parsed.data.selector === undefined) === (parsed.data.region === undefined)
  )
    return {
      kind: "refused",
      conflict: false,
      error: "The mark does not read: one element or one stroke, a note and an intent.",
    };
  const { data } = parsed;
  return addMark(
    root,
    {
      capture: data.capture,
      width: data.width,
      target:
        data.selector === undefined
          ? { kind: "region", path: data.region ?? [] }
          : { kind: "element", selector: data.selector },
      note: data.note,
      intent: data.intent,
      by: "owner",
      words: null,
    },
    now,
    data.revision,
  );
}

/** What the viewer's close sends: addressed or declined, and the revision read. */
const closeRequestSchema = z
  .object({ as: z.enum(["addressed", "declined"]), revision: z.string().min(1) })
  .strict();

/**
 * The owner's closure of a mark from the viewer, the owner's own act.
 * @param root the repository root
 * @param id the mark
 * @param body the request's body
 * @param now when
 * @returns the mark written, or why not
 */
export function closeFromViewer(
  root: string,
  id: string,
  body: string,
  now: Date = new Date(),
): MarkWritten {
  const parsed = closeRequestSchema.safeParse(parseJson(body));
  if (!parsed.success)
    return { kind: "refused", conflict: false, error: "The closure does not read." };
  return closeMark(root, id, parsed.data.as, { via: "viewer" }, now, parsed.data.revision);
}

/** What capture now is sent: the running page's whole address. */
const captureRequestSchema = z.object({ url: z.string().min(1).max(2048) }).strict();

/** What capture now answers: the capture's id, a limit it names, or why the request was refused. */
export type CaptureAnswer =
  | { readonly kind: "captured"; readonly capture: string }
  | { readonly kind: "limit"; readonly limit: string; readonly detail: CaptureLimit | null }
  | { readonly kind: "refused"; readonly error: string };

/**
 * Capture an address of the owner's running page now (J-124 S1).
 * @param root the repository root
 * @param body the request's body, `{ "url": "http://localhost:3000/settings" }`
 * @param environment the process environment, where the browser is looked for
 * @param marked the capture ids a mark names, never overwritten
 * @param viewer the viewer's own base address, which is never the app's (J-191 S1)
 * @returns the capture's id, or the limit with its cause, or the refusal
 */
export async function captureAt(
  root: string,
  body: string,
  environment: NodeJS.ProcessEnv,
  marked: ReadonlySet<string>,
  viewer?: string,
): Promise<CaptureAnswer> {
  const parsed = captureRequestSchema.safeParse(parseJson(body));
  if (!parsed.success)
    return { kind: "refused", error: "Send the running page's address as { url }." };
  let url: URL;
  try {
    url = new URL(parsed.data.url);
  } catch {
    return { kind: "refused", error: `${parsed.data.url} is no address a browser opens.` };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password)
    return {
      kind: "refused",
      error: "The address is an http or https page with no name or password in it.",
    };
  const refused = viewerOriginRefusal(url.origin, viewer);
  if (refused !== undefined) return { kind: "refused", error: refused };
  const captured = await captureNow(
    root,
    url.origin,
    `${url.pathname}${url.search}`,
    environment,
    marked,
  );
  return captured.kind === "captured"
    ? { kind: "captured", capture: captured.capture }
    : { kind: "limit", limit: captured.limit, detail: captured.detail ?? null };
}
