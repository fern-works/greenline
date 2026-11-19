import type {
  DocumentKind,
  DocumentOf,
  InspectSchema,
  NotesReading,
} from "../../../core/inspector/documents.ts";

/*
 * The app's one way to the server: a document of the contract read from
 * its own origin, checked for the version and the kind this build reads,
 * and a save posted with the revision it read. A refusal carries the
 * server's own words.
 */

/** The contract version this build of the app reads, typed by the contract's own so the two cannot part. */
const READS: InspectSchema = "greenline.inspect/v2";

/** A refusal from the server, with its status, such as 409 for a stale revision. */
export class Refused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Opening {
  readonly schema?: unknown;
  readonly kind?: unknown;
  readonly error?: unknown;
}

async function bodyOf(response: Response): Promise<Opening> {
  // SAFETY: the server answers JSON objects only; the fields read are checked one by one below.
  const body = (await response.json()) as Opening;
  if (!response.ok || body.error !== undefined)
    throw new Refused(
      response.status,
      String(body.error ?? `the server answered ${response.status}`),
    );
  return body;
}

/**
 * One document of the contract.
 * @param address the document's address under /api/
 * @param kind the kind the address serves
 * @returns the document
 */
export async function readDocument<K extends DocumentKind>(
  address: string,
  kind: K,
): Promise<DocumentOf<K>> {
  const body = await bodyOf(await fetch(address, { cache: "no-store" }));
  if (body.schema !== READS)
    throw new Refused(
      200,
      `The server sent a document of ${String(body.schema)}; this page reads ${READS}. Reload the page.`,
    );
  if (body.kind !== kind)
    throw new Refused(
      200,
      `The server sent a ${String(body.kind)} document where ${kind} was asked.`,
    );
  // SAFETY: the version and the kind are this build's, and the server built the document from the same contract.
  return body as DocumentOf<K>;
}

/**
 * Whether the inspector still answers: the contract's own document, the
 * smallest ask, which the bar's read age says Stopped without (J-164 S1).
 * @returns whether it answered
 */
export async function answering(): Promise<boolean> {
  try {
    return (await fetch("/api/contract", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

/** What a save sends: a prose file's text, or the installation's choices, each with the revision read; a sync sends nothing. */
export type SavePayload =
  | { readonly expectedRevision: string; readonly body: string }
  | {
      readonly expectedRevision: string;
      readonly targets: readonly string[];
      readonly skills: { readonly include: readonly string[]; readonly exclude: readonly string[] };
      readonly proceed: string;
      readonly trials: readonly string[];
    }
  | { readonly sync: true };

/** What a save or a sync answers: the command's outcome and the settings read again. */
export interface SaveAnswer {
  readonly outcome: {
    readonly ok: boolean;
    /** What the command changed; none for a save that changed nothing. */
    readonly effects: readonly unknown[];
    readonly diagnostics: readonly { readonly message: string }[];
  };
}

/**
 * Delete one picture, naming the revision the page read; a stale one is
 * refused with 409 and the server's words.
 * @param id the visual's id
 * @param expectedRevision the revision the page read
 */
export async function deleteVisual(id: string, expectedRevision: string): Promise<void> {
  const response = await fetch("/api/pictures/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, expectedRevision }),
  });
  await bodyOf(response);
}

/**
 * Post a save or a sync.
 * @param address the save's address
 * @param payload what to save, the revision read included
 * @returns the server's answer
 */
export async function post(address: string, payload: SavePayload): Promise<SaveAnswer> {
  const response = await fetch(address, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await bodyOf(response);
  // SAFETY: a save's answer carries the command's outcome, which the server always sets.
  return body as SaveAnswer;
}

/** What the deal view's pick sends: the direction, the deal it was read from and the pick file's revision. */
export interface PickPayload {
  readonly direction: number;
  /** The ask's query the view read the deal with, as `dealAskQuery` keeps it. */
  readonly ask: string;
  readonly seed: number;
  readonly reroll: boolean;
  readonly revision: string;
}

/**
 * Pick one direction of a change's deal (J-123 S7); a pick written since the page read refuses with 409.
 * @param change the change's id
 * @param payload the pick and the revision read
 */
export async function postPick(change: string, payload: PickPayload): Promise<void> {
  const response = await fetch(`/api/changes/${encodeURIComponent(change)}/deal/pick`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  await bodyOf(response);
}

/** What the capture view's mark sends: the capture, the width, one element or one stroke, the note, the intent and the marks' revision. */
export interface MarkPayload {
  readonly capture: string;
  readonly width: number;
  readonly selector?: string;
  readonly region?: readonly (readonly [number, number])[];
  readonly note: string;
  readonly intent: string;
  readonly revision: string;
}

/** What the owner's close sends: addressed or declined, and the marks' revision read. */
interface ClosePayload {
  readonly as: "addressed" | "declined";
  readonly revision: string;
}

/** A mark's write answered: the mark written and the notes as they then stand. */
export interface MarksAnswer {
  readonly mark: { readonly id: string };
  readonly notes: NotesReading;
}

/** Post a mark's write and read the marks it answers with. */
async function postMarks(
  address: string,
  payload: MarkPayload | ClosePayload,
): Promise<MarksAnswer> {
  const response = await fetch(address, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  // SAFETY: a mark's write answers the mark and the interface document the server built from the contract.
  const answer = (await bodyOf(response)) as {
    readonly mark: { readonly id: string };
    readonly interface: DocumentOf<"interface">;
  };
  return { mark: answer.mark, notes: answer.interface.notes };
}

/**
 * Append the owner's mark (J-124 S3); marks written since the page read refuse with 409.
 * @param payload the mark and the revision read
 * @returns the mark written and the marks as they then stand
 */
export function postMark(payload: MarkPayload): Promise<MarksAnswer> {
  return postMarks("/api/marks", payload);
}

/**
 * Close a mark as the owner, addressed or declined (J-124 S3).
 * @param id the mark
 * @param as addressed or declined
 * @param revision the marks' revision read
 * @returns the notes as they then stand
 */
export function postClose(
  id: string,
  as: "addressed" | "declined",
  revision: string,
): Promise<NotesReading> {
  return postMarks(`/api/marks/${encodeURIComponent(id)}/close`, { as, revision }).then(
    (answer) => answer.notes,
  );
}

/** What capture now answers: the capture kept, or the limit that kept none. */
export interface CaptureNowAnswer {
  readonly captured: string | null;
  /** The limit in the check's words, its cause and the origin tried among them (J-191 S1). */
  readonly limit: string | null;
}

/**
 * Capture an address of the owner's running page now (J-124 S1).
 * @param url the page's whole address
 * @returns the capture's id, or the limit
 */
export async function postCapture(url: string): Promise<CaptureNowAnswer> {
  const response = await fetch("/api/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  // SAFETY: capture now answers { captured, limit }, one of them null.
  return (await bodyOf(response)) as CaptureNowAnswer;
}
