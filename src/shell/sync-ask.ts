import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { namesSync } from "../core/guardrails.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionsHome } from "./git.ts";
import { ownerSpokeAfter, turnMessages } from "./owner-words.ts";
import { sessionFileName, sessionTurn } from "./skill-loads.ts";

/*
 * The sync's wait for a turn of the owner's (J-224 S1, the runs
 * j217t-states-stop and j217c-states-stop): in a checkout whose git
 * configuration registers none of greenline's hooks, the agent's
 * `greenline sync` goes on only once a message of the owner's was journaled
 * in a turn after the one the checkout's hold began in, the session's first
 * showing of the hooks line for its own checkout or its first refusal of the
 * sync there, or in a turn whose message of the owner's names the sync. A
 * turn the harness starts with a notice alone holds no message of the
 * owner's and admits nothing. The hold is the session's for one checkout
 * (after the falsifier's reading): a turn that answered one checkout's line
 * admits no sync in another, which is held from its own first refusal. The
 * note is a working file beside the session's turn counter, no commit's;
 * a note in any other shape reads as no hold, and the hold begins at the
 * next refusal. The hook reads a turn, never an answer: whether the owner
 * said yes is the agent's reading.
 */

const HOLD = z.object({ checkout: z.string().min(1), turn: z.number().int().min(0) });
const NOTE = z.object({ holds: z.array(HOLD) });

/** The note's file for a session, or undefined where its id names no file. */
function noteFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}.sync.json`);
}

/** A checkout as the note keys it: its real path, or the path as given where it reads no real one. */
function keyOf(checkout: string): string {
  try {
    return realpathSync(checkout);
  } catch {
    return checkout;
  }
}

/** The holds a session's note keeps; none where it keeps none or reads in another shape. */
function holds(path: string): readonly z.infer<typeof HOLD>[] {
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data.holds : [];
  } catch {
    return [];
  }
}

/** Note the turn a checkout's hold begins in, where none began before. */
function hold(path: string, checkout: string, turn: number): void {
  const kept = holds(path);
  if (kept.some((each) => each.checkout === checkout)) return;
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify({ holds: [...kept, { checkout, turn }] })}\n`);
}

/**
 * Note that the session was shown the hooks line for its own checkout, the
 * mirror's `git hooks: absent` row: at a session's start, for the turn that
 * follows, since the owner's first message there was written before
 * anything was said to them; at a turn's start, for that turn. The first
 * showing is kept.
 * @param root the session's checkout, whose turns are counted and whose line it is
 * @param session the harness's session id
 * @param at the event that showed it
 */
export function noteHooksShown(
  root: string,
  session: string,
  at: "session-start" | "turn-start",
): void {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return;
  hold(path, keyOf(root), at === "session-start" ? turn + 1 : turn);
}

/**
 * The hook's reading of the agent's sync in a checkout without the hooks:
 * `admit` where a message of the owner's this turn names the sync, or where
 * one was journaled in a turn after the one the checkout's hold began in;
 * `ask` otherwise, the checkout's hold noted from this turn where none
 * began; `terminal` where no turn of the owner's reaches the hooks, a
 * session the harness names not or a turn that never started, so the owner
 * runs it from their own terminal.
 * @param root the repository root the session's turns are counted in
 * @param session the harness's session id, null where the payload names none
 * @param checkout the checkout the sync is judged in
 * @returns the reading
 */
export function syncWait(
  root: string,
  session: string | null,
  checkout: string,
): "admit" | "ask" | "terminal" {
  if (session === null) return "terminal";
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null || turn === 0) return "terminal";
  if (turnMessages(root, session).some(namesSync)) return "admit";
  const key = keyOf(checkout);
  const since = holds(path).find((each) => each.checkout === key)?.turn;
  if (since !== undefined && ownerSpokeAfter(root, session, since)) return "admit";
  try {
    hold(path, key, turn);
  } catch {
    // A hold greenline cannot note begins at the next refusal instead.
  }
  return "ask";
}
