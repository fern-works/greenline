import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionsHome } from "./git.ts";
import { sessionFileName, sessionTurn } from "./skill-loads.ts";

/*
 * The after-tool lines kept for the next turn's mirror (J-149 S2, S3):
 * where the harness takes no context after a tool, as Codex's after-tool
 * event does not, a line the hook owes the agent there, a card whose first
 * option is not marked, a record line the hooks wrote, is noted for the
 * session with the turn it came in, and the mirror prints it at the next
 * turn's start, once: the turn-start's mirror alone reads it, since the
 * turn counter moves only at a turn's start and a session's start between
 * two turns would print it again (J-225 S1; j217c-conduct-interface, the
 * nudge at 001/005 and 001/006).
 */

const NOTE = z.object({ turn: z.number().int().min(0), line: z.string().min(1) });

/** The note's file for a session, or undefined where its id names no file. */
function noteFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined
    ? undefined
    : join(root, ".greenline", "tmp", "sessions", `${safe}.cards.json`);
}

/**
 * Note the cards' line for the session's next turn.
 * @param root the repository root
 * @param session the harness's session id
 * @param line the line
 */
export function noteCards(root: string, session: string, line: string): void {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return;
  // A line noted earlier in the same turn stays beside this one.
  const earlier = noted(path);
  const kept = earlier?.turn === turn && earlier.line !== line ? `${earlier.line}\n${line}` : line;
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify({ turn, line: kept })}\n`);
}

/** The note a session's file holds, undefined where none reads. */
function noted(path: string): z.infer<typeof NOTE> | undefined {
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The cards' line the previous turn noted, for the mirror at this turn's start.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the line, or undefined where the previous turn noted none
 */
export function cardsNoteLine(root: string, session: string): string | undefined {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return undefined;
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success && read.data.turn === turn - 1 ? read.data.line : undefined;
  } catch {
    return undefined;
  }
}

/*
 * The start mirror's delivery (J-225 S1; j217t-conduct-runner finding 1,
 * two Codex turns that began with no mirror and nothing that said so): the
 * turn-start notes, per session, the last turn whose mirror reached the
 * harness's stdout, `<session>.mirror.json` in the main checkout's
 * sessions, a working file no commit carries. A turn counted and not
 * noted began without its mirror: its first later event that carries
 * context prints the mirror and names the gap, and where none can, the
 * next turn's mirror names it.
 */

const DELIVERED = z.object({ turn: z.number().int().min(0) });

function deliveryFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}.mirror.json`);
}

/** The last turn whose start's mirror was delivered, 0 where none is noted. */
function deliveredTurn(root: string, session: string): number {
  const path = deliveryFile(root, session);
  if (path === undefined) return 0;
  try {
    const read = DELIVERED.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data.turn : 0;
  } catch {
    return 0;
  }
}

/**
 * Note that the turn the session is in had its mirror delivered: its
 * start's, written once the mirror reached stdout, or a later event's that
 * printed it in the start's place. Never fails.
 * @param root the repository root
 * @param session the harness's session id
 */
export function noteMirrorDelivered(root: string, session: string): void {
  const path = deliveryFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    atomicWriteFile(path, `${JSON.stringify({ turn })}\n`);
  } catch {
    // A note greenline cannot write leaves the turn read as one without its mirror, which says so once.
  }
}

/**
 * Whether a turn of the session began without its mirror: counted by its
 * start and never noted delivered.
 * @param root the repository root
 * @param session the harness's session id
 * @param which `this`, the turn the session is in, or `previous`, the one before it
 * @returns true where that turn, the first or later, holds no delivery
 */
export function mirrorMissed(root: string, session: string, which: "this" | "previous"): boolean {
  const turn = sessionTurn(root, session);
  if (turn === null) return false;
  const asked = which === "this" ? turn : turn - 1;
  return asked >= 1 && deliveredTurn(root, session) < asked;
}
