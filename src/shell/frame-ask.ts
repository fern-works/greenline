import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import {
  droppedUnconfirmed,
  frameUnconfirmed,
  planningChangesOf,
  recordPath,
  type RecordEntry,
  type RecordFacts,
} from "../core/git-hooks.ts";
import { carefulFrameGaps, type RecordBreach } from "../core/record-lint.ts";
import {
  CAREFUL_MODE,
  confirmedSettled,
  confirmState,
  type ConfirmJournal,
  type ConfirmState,
} from "../core/record-lines.ts";
import { recordIds } from "./changes.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionsHome } from "./git.ts";
import { committedRecord, recordTexts, stagedRecordText, workingRecord } from "./hooks.ts";
import { journaledMessages } from "./owner-words.ts";
import { sessionFileName, sessionTurn } from "./skill-loads.ts";

/*
 * The careful frame's ask (J-223 S1; the register's row of 2026-11-05, "The
 * keeper over the oracle"): the CLI's note that a careful change's
 * restatement was put to the owner, written while its record is open, its
 * frame whole by the lint and no confirmation held, at a turn's end and at a
 * question tool's card before the card's answers are journaled, so a confirm
 * card answered in the same turn counts. Kept per session in
 * `<session>.frame-ask.json` in the main checkout's sessions, a working file
 * no commit carries, outside the homes a change's write may reach, with the
 * time the hook saw it, never the turn alone; each change the session asked
 * for keeps its own first ask, one never replacing another's. The session's
 * acts in a linked worktree of a change's own are kept beside the asks, so
 * the turn's end notes the ask for the change the session writes in on any
 * ground (after the falsifier's reading). The owner's words journaled at or
 * after the earliest ask any session noted are the ones a record's
 * `confirmed` line is held against; the agent writes no line that says it
 * asked.
 */

const ASK_ENTRY = z.object({
  change: z.string(),
  at: z.string(),
  turn: z.number().int().min(0).optional().catch(undefined),
});

const ACTED_ENTRY = z.object({ change: z.string(), checkout: z.string() });

const NOTE = z.object({
  asks: z.array(ASK_ENTRY).catch([]),
  acted: z.array(ACTED_ENTRY).catch([]),
});

type Note = z.infer<typeof NOTE>;

/** The suffix of a session's ask note. */
const ASK = ".frame-ask.json";

function askFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}${ASK}`);
}

function readNote(path: string): Note {
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data : { asks: [], acted: [] };
  } catch {
    return { asks: [], acted: [] };
  }
}

function writeNote(path: string, note: Note): void {
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify(note)}\n`);
}

/**
 * When a change's restatement was first noted put to the owner, every
 * session's note read; undefined where none was.
 * @param root the repository root
 * @param change the change
 * @returns the earliest time, as the hooks wrote it
 */
function frameAskedAt(root: string, change: string): string | undefined {
  let names: readonly string[];
  try {
    names = readdirSync(sessionsHome(root)).filter((name) => name.endsWith(ASK));
  } catch {
    return undefined;
  }
  let first: string | undefined;
  for (const name of names)
    for (const ask of readNote(join(sessionsHome(root), name)).asks)
      if (ask.change === change && (first === undefined || ask.at < first)) first = ask.at;
  return first;
}

/** Every session's journaled messages with their times, oldest first; none where no journal stands. */
function timedMessages(
  root: string,
): readonly { readonly at: string; readonly words: string }[] | undefined {
  let names: readonly string[];
  try {
    names = readdirSync(sessionsHome(root)).filter((name) => name.endsWith(".owner.jsonl"));
  } catch {
    return undefined;
  }
  if (names.length === 0) return undefined;
  return names
    .flatMap((name) => journaledMessages(root, name.slice(0, -".owner.jsonl".length)))
    .map((entry) => ({ at: entry.at, words: entry.words }))
    .toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * The journal a careful record's `confirmed` line is held against (J-223
 * S1), as `yesJournal` gives the yes's: none once HEAD's commit carries the
 * careful record with the same line, the owner's settled word; every
 * session's messages with their times and the earliest ask otherwise; none
 * kept where no hook journaled, so the line's presence is read.
 * @param root the root of the checkout the record stands in
 * @param id the change
 * @param confirmed the `confirmed` line of the record being judged
 * @returns the journal
 */
export function confirmJournal(
  root: string,
  id: string,
  confirmed: string | undefined,
): ConfirmJournal {
  if (confirmedSettled(committedRecord(root, "HEAD", id), confirmed)) return { kept: false };
  const messages = timedMessages(root);
  if (messages === undefined) return { kept: false };
  return { kept: true, asked: frameAskedAt(root, id), messages };
}

/**
 * Where the doors read a change's records (after the falsifier's third
 * reading): the working tree's at the before-write door, since a write is no
 * commit, and the index's at the commit, as `commitFacts` reads them, so a
 * working record deleted or changed after staging moves no verdict of the
 * commit.
 */
export interface RecordSource {
  /** Every record the source holds, by id with its lines, sorted by id. */
  readonly records: () => readonly RecordEntry[];
  /** One record's lines, undefined where the source holds none. */
  readonly facts: (id: string) => RecordFacts | undefined;
  /** One record's text, undefined where the source holds none. */
  readonly text: (id: string) => string | undefined;
}

/** The working tree's records. */
function workingSource(root: string): RecordSource {
  return {
    records: () =>
      [...(recordIds(root) ?? [])].sort().flatMap((each): RecordEntry[] => {
        const facts = workingRecord(root, each);
        return facts === undefined ? [] : [{ id: each, facts }];
      }),
    facts: (id) => workingRecord(root, id),
    text: (id) => recordTexts(root, id).working,
  };
}

/**
 * The records as the commit being made carries them: the index's reading
 * `commitFacts` takes, each record's staged version where the index holds
 * one apart from the working tree's, a staged deletion carried as absent.
 * @param root the repository root
 * @param records the records the commit's facts hold
 * @returns the source
 */
export function indexSource(root: string, records: readonly RecordEntry[]): RecordSource {
  return {
    records: () => records,
    facts: (id) => records.find((entry) => entry.id === id)?.facts,
    text: (id) =>
      records.some((entry) => entry.id === id) ? stagedRecordText(root, id) : undefined,
  };
}

/** What the doors read of a careful change's frame: whose record holds it, its gaps and where its confirmation stands. */
interface FrameConfirmation {
  /** The change whose record holds the frame: the change, or a ticket's planning change. */
  readonly of: string;
  readonly gaps: readonly RecordBreach[];
  readonly state: ConfirmState;
  /** Whether the record that holds the frame says it is dropped. */
  readonly dropped: boolean;
  /** The refusal's clause for a careful ticket whose planning change no record names, with its cure. */
  readonly notFound?: string;
}

/**
 * A careful change's frame as the source holds its record (J-223 S1), or
 * undefined where the record is not careful, stands done in HEAD's commit,
 * its doors closed by the done door, or stands nowhere; a record whose state
 * says dropped is read as an open one (after the falsifier's third
 * reading). A record whose mode line reads careful and whose form does not
 * parse is a frame not whole. A ticket's frame, of any mode, is its planning
 * change's, read in its place.
 */
function frameConfirmation(
  root: string,
  id: string,
  source: RecordSource,
): FrameConfirmation | undefined {
  const record = source.facts(id);
  if (committedRecord(root, "HEAD", id)?.state === "done") return undefined;
  if (record?.ticket !== undefined) return ticketFrame(root, id, record, source);
  const text = source.text(id);
  const gaps = text === undefined ? undefined : carefulFrameGaps(id, text);
  if (gaps === undefined) return undefined;
  return {
    of: id,
    gaps,
    state: confirmState(record?.confirmed, confirmJournal(root, id, record?.confirmed)),
    dropped: record?.state === "dropped",
  };
}

/** Whether a frame the doors read is whole and confirmed. */
function held(frame: FrameConfirmation): boolean {
  return frame.gaps.length === 0 && frame.state.kind === "held";
}

/**
 * A ticket's frame (J-223 S1, after the falsifier's second and third
 * readings): its planning change's, read as the trailers read it
 * (`planningChangesOf`). Every record that names the plan, a dropped one
 * among them, and the stand-in hold the ticket while one is careful and
 * unconfirmed, named; a dropped record never opens one, so "several" and
 * "not found" are read over the records that are not dropped. A stand-in
 * never opens a careful ticket, and a careful ticket whose plan no live
 * record names is held with the cure named. A ticket below careful with
 * no planning change found is a change at its own mode.
 */
function ticketFrame(
  root: string,
  id: string,
  record: RecordFacts,
  source: RecordSource,
): FrameConfirmation | undefined {
  const { named, standIn } = planningChangesOf(
    record,
    source.records(),
    (entry) => entry.facts.state === "open",
  );
  const others = named.filter((entry) => entry.id !== id);
  for (const entry of others) {
    const frame = frameConfirmation(root, entry.id, source);
    if (frame !== undefined && !held(frame)) return frame;
  }
  if (others.some((entry) => entry.facts.state !== "dropped")) return undefined;
  if (standIn !== undefined && standIn.id !== id) {
    const frame = frameConfirmation(root, standIn.id, source);
    if (frame !== undefined && !held(frame)) return frame;
  }
  if (record.mode !== CAREFUL_MODE) return undefined;
  const plan = record.plan === undefined ? "none" : record.plan;
  const notFound = `the ticket's planning change is not found: no record names its plan ${plan} with no ticket line; write the plan line on the planning change's record, or take the plan and ticket lines out of ${recordPath(id)} so the change owes its own frame`;
  return {
    of: id,
    gaps: [{ rule: "careful", message: notFound }],
    state: { kind: "missing" },
    dropped: false,
    notFound,
  };
}

/**
 * The doors' clause for a careful change (J-223 S1), or undefined where its
 * frame is whole and confirmed or it is not careful; a ticket's names its
 * planning change's record, and a dropped one names a cure the agent can
 * reach, never a restatement put for a change the owner dropped.
 * @param root the root of the checkout the record stands in
 * @param id the change
 * @param source where the records are read: the working tree's by default, the index's at the commit
 * @returns the clause naming what is missing and what to do next
 */
export function frameUnconfirmedAt(
  root: string,
  id: string,
  source: RecordSource = workingSource(root),
): string | undefined {
  const frame = frameConfirmation(root, id, source);
  if (frame === undefined) return undefined;
  if (frame.notFound !== undefined) return frame.notFound;
  const clause = frameUnconfirmed(frame.of, frame.gaps, frame.state);
  if (clause === undefined) return undefined;
  if (frame.of === id) return frame.dropped ? droppedUnconfirmed(id) : clause;
  return frame.dropped
    ? `the frame is its planning change's, ${recordPath(frame.of)}, which is dropped and holds no confirmation: take the plan and ticket lines out of ${recordPath(id)} so the change owes its own frame`
    : `the frame is its planning change's, ${recordPath(frame.of)}, and ${clause}`;
}

/**
 * Note that the session acted on a change in a linked worktree of its own
 * (J-223 S1, after the falsifier's reading), so its turn's end notes the ask
 * for that change too. Never throws.
 * @param root the repository root the hook runs in
 * @param session the harness's session id
 * @param change the change the worktree's branch holds
 * @param checkout the worktree's root
 */
export function noteFrameActing(
  root: string,
  session: string,
  change: string,
  checkout: string,
): void {
  try {
    const path = askFile(root, session);
    if (path === undefined) return;
    const note = readNote(path);
    const place = resolve(checkout);
    if (note.acted.some((entry) => entry.change === change && entry.checkout === place)) return;
    writeNote(path, { ...note, acted: [...note.acted, { change, checkout: place }] });
  } catch {
    // An act greenline cannot note leaves the worktree's ask to its own turn's end in that checkout.
  }
}

/**
 * Note that the restatement was put to the owner (J-223 S1): for the change
 * the branch holds and each change of a linked worktree the session acted
 * on, while its careful record is open, its frame whole by the lint and no
 * confirmation held, the session's first note for that frame's change is
 * kept with the hook's time; a later one moves nothing, and one change's
 * note never replaces another's. Never throws.
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change the branch holds, undefined where none
 * @param at when the hook saw the event
 */
export function noteFrameAsk(
  root: string,
  session: string,
  change: string | undefined,
  at: string,
): void {
  try {
    const path = askFile(root, session);
    if (path === undefined) return;
    const note = readNote(path);
    const places = [...(change === undefined ? [] : [{ change, checkout: root }]), ...note.acted];
    const asks = [...note.asks];
    for (const place of places) {
      const frame = frameConfirmation(place.checkout, place.change, workingSource(place.checkout));
      // A dropped change's restatement is never put; its doors name the record-alone commit.
      if (
        frame === undefined ||
        frame.dropped ||
        frame.gaps.length > 0 ||
        frame.state.kind === "held"
      )
        continue;
      if (asks.some((ask) => ask.change === frame.of)) continue;
      asks.push({ change: frame.of, at, turn: sessionTurn(root, session) ?? undefined });
    }
    if (asks.length !== note.asks.length) writeNote(path, { ...note, asks });
  } catch {
    // An ask greenline cannot note leaves the doors waiting on one, which the next turn's end notes.
  }
}
