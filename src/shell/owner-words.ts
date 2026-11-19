import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson, type JsonValue } from "../core/contract.ts";
import { ownersOwnWords } from "../core/habits-owed.ts";
import { yesSettled, type OwnerJournal } from "../core/record-lines.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { committedRecord } from "./hooks.ts";
import { sessionsHome } from "./git.ts";
import { latestSession, sessionFileName, sessionTurn } from "./skill-loads.ts";

/*
 * The owner's words a turn holds (J-149 S4): the prompt its start handed
 * and each answer a question tool's card brought back during it, kept for
 * the session beside the turn, so a hold whose exit is the owner's word,
 * the deal's reroll and seed, reads this turn's words and no earlier ones.
 * A working file of the session's, local and never committed, in the main
 * checkout's sessions for every worktree of the repository, beside the
 * turn counter it is read against (J-199 S1).
 */

const NOTE = z.object({ turn: z.number().int().min(0), words: z.array(z.string()) });

function noteFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}.words.json`);
}

/**
 * The owner's words this turn holds so far.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the words, in the order given; none where the turn noted none
 */
export function ownerWords(root: string, session: string): readonly string[] {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return [];
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success && read.data.turn === turn ? read.data.words : [];
  } catch {
    return [];
  }
}

/**
 * Note words of the owner's for the session's current turn, after any it holds.
 * @param root the repository root
 * @param session the harness's session id
 * @param words the words
 */
export function noteOwnerWords(root: string, session: string, words: readonly string[]): void {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null || words.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(
    path,
    `${JSON.stringify({ turn, words: [...ownerWords(root, session), ...words] })}\n`,
  );
}

/** A question tool's result, its answers by question, as Claude Code's tool response carries them. */
const answered = z
  .object({
    tool_response: z
      .object({ answers: z.record(z.string(), z.string()).optional().catch(undefined) })
      .optional()
      .catch(undefined),
  })
  .catch({});

/**
 * The answers a question tool's after-tool payload carries, each the
 * label or the free text the owner gave; none where it carries none.
 * @param payload the after-tool event's payload
 * @returns the answers
 */
export function cardAnswers(payload: JsonValue): readonly string[] {
  return Object.values(answered.parse(payload).tool_response?.answers ?? {});
}

/*
 * The owner's journal (J-176 S1): every message of the owner's the hooks
 * see, the prompt at each turn's start and each card's answer, appended for
 * the session to `.greenline/tmp/sessions/<session>.owner.jsonl`, a working
 * file no commit carries and no tidy removes. A record's `yes` line and its
 * lifting lines, `landing`, `rebase` and `discard`, hold only words one of
 * these messages holds; where no journal stands, the harness handed the
 * hooks no owner text, and nothing is read against it. The journal stands
 * in the main checkout's sessions for every worktree of the repository,
 * resolved through git's common directory, so a reading finds it wherever
 * its command runs (J-199 S1, the run j196c-conduct-runner).
 */

/** The journal's file suffix. */
const JOURNAL = ".owner.jsonl";

const ENTRY = z.object({
  at: z.string(),
  words: z.string(),
  turn: z.number().int().min(0).optional().catch(undefined),
});

/**
 * Append the owner's messages to the session's journal.
 * @param root the repository root
 * @param session the harness's session id
 * @param words the messages, each whole
 * @param at when the hook saw them
 */
export function journalOwner(
  root: string,
  session: string,
  words: readonly string[],
  at: string,
): void {
  const safe = sessionFileName(session);
  const said = words.filter((each) => each.trim() !== "");
  if (safe === undefined || said.length === 0) return;
  const path = join(sessionsHome(root), `${safe}${JOURNAL}`);
  // The turn each message came in, which gives it to the change its turn opened or held (J-189 S1).
  const turn = sessionTurn(root, session) ?? undefined;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    said.map((each) => `${JSON.stringify({ at, words: each, turn })}\n`).join(""),
  );
}

/**
 * A session's journaled messages, each with its time and the turn it came
 * in where the hooks noted one (J-189 S1), oldest first; none where the
 * session's journal stands nowhere.
 * @param root the repository root
 * @param session the harness's session id, or the file name it takes
 * @returns the messages
 */
export function journaledMessages(
  root: string,
  session: string,
): readonly { readonly at: string; readonly words: string; readonly turn?: number | undefined }[] {
  const safe = sessionFileName(session);
  if (safe === undefined) return [];
  try {
    return journalEntries(join(sessionsHome(root), `${safe}${JOURNAL}`)).toSorted((a, b) =>
      a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
    );
  } catch {
    return [];
  }
}

/** The entries one journal file holds; a line that does not read is passed over. */
function journalEntries(path: string): readonly z.infer<typeof ENTRY>[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line) => {
      const read = ENTRY.safeParse(parseJson(line));
      return read.success ? [read.data] : [];
    });
}

/** One message of the owner's with its time and the session that journaled it. */
export interface JournaledRequest {
  readonly at: string;
  readonly words: string;
  /** The session's id as its files are named. */
  readonly session: string;
}

/**
 * The owner's last message the hooks journaled (J-203 S1), the session's or
 * every session's where none is named, a harness's notice taken out; the
 * owes line reads its words and the loads its session noted since it.
 * @param root the repository root
 * @param session the harness's session id, null for every session's
 * @returns the message, undefined where none stands
 */
export function lastJournaled(root: string, session: string | null): JournaledRequest | undefined {
  const folder = sessionsHome(root);
  const safe = session === null ? undefined : sessionFileName(session);
  if (session !== null && safe === undefined) return undefined;
  let names: readonly string[];
  try {
    names = readdirSync(folder).filter((name) =>
      safe === undefined ? name.endsWith(JOURNAL) : name === `${safe}${JOURNAL}`,
    );
  } catch {
    return undefined;
  }
  let last: JournaledRequest | undefined;
  for (const name of names)
    for (const entry of journalEntries(join(folder, name))) {
      const words = ownersOwnWords(entry.words);
      if (words !== "" && (last === undefined || entry.at >= last.at))
        last = { at: entry.at, words, session: name.slice(0, -JOURNAL.length) };
    }
  return last;
}

/**
 * The owner's message of the session's current turn, as the hooks journaled
 * it at the turn's start (J-205 S1): the message the waiting line and the
 * stopped fact read against the wait, a harness's notice taken out; the
 * session whose turn started last where none is named, as for `greenline
 * status`. None where the turn brought no words of the owner's, a session's
 * start among them.
 * @param root the repository root
 * @param session the harness's session id, null for the session whose turn started last
 * @returns the message, undefined where none stands
 */
export function turnWords(root: string, session: string | null): string | undefined {
  const named = session ?? latestSession(root);
  return named === undefined ? undefined : turnMessages(root, named).at(-1);
}

/**
 * Whether the session's journal holds a message of the owner's from a turn
 * later than the one given (J-224 S1, after the falsifier's reading): a
 * turn the harness started with a notice alone journals nothing and counts
 * for nothing, and an entry with no turn admits nothing.
 * @param root the repository root
 * @param session the harness's session id
 * @param turn the turn the message must come after
 * @returns true where such a message stands
 */
export function ownerSpokeAfter(root: string, session: string, turn: number): boolean {
  return journaledMessages(root, session).some(
    (entry) => entry.turn !== undefined && entry.turn > turn && ownersOwnWords(entry.words) !== "",
  );
}

/**
 * Every message of the owner's the session's current turn holds, as the
 * hooks journaled them, the prompt at its start and each card's answer
 * after it, a harness's notice taken out (J-224 S1: a sync the owner names
 * in any of them goes on in that turn).
 * @param root the repository root
 * @param session the harness's session id
 * @returns the messages, oldest first; none where the turn brought none
 */
export function turnMessages(root: string, session: string): readonly string[] {
  const turn = sessionTurn(root, session);
  if (turn === null) return [];
  return journaledMessages(root, session)
    .filter((entry) => entry.turn === turn)
    .map((entry) => ownersOwnWords(entry.words))
    .filter((words) => words !== "");
}

/**
 * The owner's journaled messages: the session's, or every session's where
 * none is named, as git's hooks read them, oldest first by when the hooks
 * saw them; none kept where no journal stands.
 * @param root the repository root
 * @param session the harness's session id, undefined for every session's
 * @returns the journal
 */
export function ownerJournal(root: string, session?: string): OwnerJournal {
  const folder = sessionsHome(root);
  let files: readonly string[];
  try {
    const safe = session === undefined ? undefined : sessionFileName(session);
    files = readdirSync(folder).filter((name) =>
      safe === undefined ? name.endsWith(JOURNAL) : name === `${safe}${JOURNAL}`,
    );
  } catch {
    return { kept: false };
  }
  if (files.length === 0) return { kept: false };
  const entries = files.flatMap((name) => journalEntries(join(folder, name)));
  return {
    kept: true,
    messages: entries
      .toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .map((entry) => entry.words),
  };
}

/**
 * The journal a change record's `yes` line is held against (J-186 S1): none
 * once HEAD's commit carries the record with the same accepted yes, the
 * owner's settled word, so a fresh session, a clone or a worktree resumes
 * without a second yes; every session's journal of the checkout while the
 * yes stands uncommitted, never one session's alone, the main checkout's
 * sessions read for every worktree (J-199 S1).
 * @param root the root of the checkout the record stands in
 * @param id the change
 * @param yes the `yes` line of the record being judged
 * @returns the journal to hold the yes against
 */
export function yesJournal(root: string, id: string, yes: string | undefined): OwnerJournal {
  return yesSettled(committedRecord(root, "HEAD", id), yes) ? { kept: false } : ownerJournal(root);
}
