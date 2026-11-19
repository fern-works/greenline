import { mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import {
  codeMoved,
  pictureOffers,
  picturesOf,
  replyLacks,
  replyPastCap,
  type PictureNote,
  type ReplyOwed,
  type TurnPictures,
} from "../core/pictures.ts";
import { headCommit, readGit } from "./code-tree.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionsHome } from "./git.ts";
import { workingRecord } from "./hooks.ts";
import { changesNamedThisTurn, sessionFileName, sessionTurn } from "./skill-loads.ts";
import { worktreesOf } from "./situation.ts";
import { lostPictures, workingChanges } from "./visuals.ts";

/*
 * The picture note a turn's end leaves for the next turn's mirror (J-129
 * S6; `../core/pictures.ts`): the largest picture past its cap, or unrun
 * where the harness handed no reply's text, written beside the session's
 * turn counter under `.greenline/tmp/sessions/`, a working file no commit
 * carries. A turn with every picture inside its caps leaves none. A turn's
 * start notes the commit HEAD names and the change open with its state,
 * `<session>.start.json` beside the counter, which the close's reading, the
 * deal's pick and a resume read, and the turn's end the files it changed
 * (J-204 S1). The offers of a kept picture are counted per change in the
 * sessions' `offers.json` (J-204 S1).
 */

const NOTE = z.union([
  z
    .object({
      turn: z.number().int().min(0),
      state: z.literal("counted"),
      nodes: z.number().int().min(0),
      columns: z.number().int().min(0),
    })
    .strict(),
  z.object({ turn: z.number().int().min(0), state: z.literal("unrun") }).strict(),
]);

/**
 * What a turn's start notes for its end: the turn, the commit HEAD named,
 * the change open and its state, and each linked worktree's head by its
 * path (J-227 S1).
 */
const START = z.object({
  turn: z.number().int().min(0),
  head: z.string().nullable(),
  change: z.string().nullable(),
  state: z.string().nullable(),
  worktrees: z.record(z.string(), z.string().nullable()).optional(),
});
type TurnStart = z.infer<typeof START>;

/** The turn start's file for a session, or undefined where its id names no file. */
function startFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined
    ? undefined
    : join(root, ".greenline", "tmp", "sessions", `${safe}.start.json`);
}

/** The repository's other checkouts git lists, each by its path, the root's own left out. */
function otherCheckouts(root: string): readonly string[] {
  const here = sameDir(root);
  return worktreesOf(root)
    .map((entry) => entry.path)
    .filter((path) => sameDir(path) !== here);
}

/** A directory's real path, or the path as given where it does not resolve. */
function sameDir(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Note a turn's start for its end's reading: the commit HEAD names and the
 * change the branch holds open, with its record's state, and each other
 * checkout's head, so the turn's end reads code changed in a linked
 * worktree as the turn's own (J-227 S1). Written after the turn is counted,
 * so it carries the turn it opens.
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change the branch holds, undefined where none
 */
export function noteTurnStart(root: string, session: string, change: string | undefined): void {
  const path = startFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return;
  const head = headCommit(root);
  const worktrees = Object.fromEntries(
    otherCheckouts(root).map((path) => {
      const at = headCommit(path);
      return [path, at.kind === "commit" ? at.id : null];
    }),
  );
  const start: TurnStart = {
    turn,
    head: head.kind === "commit" ? head.id : null,
    change: change ?? null,
    state: change === undefined ? null : (workingRecord(root, change)?.state ?? null),
    worktrees,
  };
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify(start)}\n`);
}

/** The turn's start as noted, where it is the turn the session is in. */
function turnStart(root: string, session: string, turn: number): TurnStart | undefined {
  const path = startFile(root, session);
  if (path === undefined) return undefined;
  try {
    const read = START.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success && read.data.turn === turn ? read.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * When the session's last noted turn started (J-149 S4): its start file's
 * time, read at a turn's start before this turn's start is noted, so it
 * names the turn before, the one whose reply the owner's words answer.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the time in milliseconds, or undefined where no turn was noted
 */
export function lastTurnStartedAt(root: string, session: string): number | undefined {
  const path = startFile(root, session);
  if (path === undefined) return undefined;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * The start the session's current turn noted (J-149 S3): the change the
 * branch held open then and its record's state, which a resume's first
 * write reads.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the change and its state, or undefined where no start of this turn was noted
 */
export function currentTurnStart(
  root: string,
  session: string,
): { readonly change: string | null; readonly state: string | null } | undefined {
  const turn = sessionTurn(root, session);
  const start = turn === null ? undefined : turnStart(root, session, turn);
  return start === undefined ? undefined : { change: start.change, state: start.state };
}

/**
 * Whether a turn's end closes its change (J-147 S3): the change's record
 * went done during the turn, as the turn's start noted it; or a change the
 * session wrote during the turn, opening it there, whose record now reads
 * done, a one-turn close (J-151 S2).
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change the branch holds at the turn's end, undefined where none
 * @returns the change it closes, or undefined
 */
export function closingChange(
  root: string,
  session: string,
  change: string | undefined,
): string | undefined {
  const turn = sessionTurn(root, session);
  const start = turn === null ? undefined : turnStart(root, session, turn);
  if (start === undefined) return undefined;
  const id = change ?? start.change ?? undefined;
  if (id !== undefined && start.change === id)
    return workingRecord(root, id)?.state === "done" && start.state !== "done" ? id : undefined;
  return changesNamedThisTurn(root, session).find(
    (named) => named !== start.change && workingRecord(root, named)?.state === "done",
  );
}

/** The note's file for a session, or undefined where its id names no file. */
function noteFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined
    ? undefined
    : join(root, ".greenline", "tmp", "sessions", `${safe}.picture.json`);
}

/**
 * Count the reply's pictures at a turn's end and leave the note: the
 * picture past its cap, unrun where no reply's text reached the hook, and
 * no note where every picture keeps its caps.
 * @param root the repository root
 * @param session the harness's session id
 * @param reply the reply's text, undefined where the harness hands none
 * @returns the note left, undefined where none was
 */
export function notePictures(
  root: string,
  session: string,
  reply: string | undefined,
): PictureNote | undefined {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined || turn === null) return undefined;
  const past = reply === undefined ? undefined : replyPastCap(reply);
  const note: PictureNote | undefined =
    reply === undefined
      ? { turn, state: "unrun" }
      : past === undefined
        ? undefined
        : { turn, state: "counted", nodes: past.nodes, columns: past.columns };
  if (note === undefined) return undefined;
  mkdirSync(join(path, ".."), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify(note)}\n`);
  return note;
}

/** The session's picture note as the mirror reads it, beside the turn the session is in. */
export interface PictureReading {
  readonly note: PictureNote | undefined;
  /** The turn the session is in; null where its id names no file. */
  readonly turn: number | null;
}

/**
 * The session's picture note and the turn it is in, for the mirror.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the note, undefined where none reads, and the turn
 */
export function readPictureNote(root: string, session: string): PictureReading {
  const path = noteFile(root, session);
  const turn = sessionTurn(root, session);
  if (path === undefined) return { note: undefined, turn };
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return { note: read.success ? read.data : undefined, turn };
  } catch {
    return { note: undefined, turn };
  }
}

/*
 * The reply note (J-199 S1; `../core/pictures.ts`): what a turn's start
 * owes its reply, the address its mirror printed and the `proceed` setting
 * where the turn opens a request with no change open, and, at its end, the
 * lines a reply that lacks them leaves for the next turn's mirror. One file
 * per session beside the turn counter, `<session>.reply.json` in the main
 * checkout's sessions, a working file no commit carries.
 */

const REPLY_NOTE = z.object({
  turn: z.number().int().min(0),
  printed: z.string().nullable(),
  proceed: z.string().nullable(),
  lacks: z.array(z.string()),
  /** The previous turn's lacks, kept where this turn's note is written before its mirror read them (J-225 S1). */
  earlier: z.array(z.string()).optional(),
});
type ReplyNote = z.infer<typeof REPLY_NOTE>;

function replyNoteFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}.reply.json`);
}

function readReplyNote(root: string, session: string): ReplyNote | undefined {
  const path = replyNoteFile(root, session);
  if (path === undefined) return undefined;
  try {
    const read = REPLY_NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
}

function writeReplyNote(root: string, session: string, note: ReplyNote): void {
  const path = replyNoteFile(root, session);
  if (path === undefined) return;
  mkdirSync(join(path, ".."), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify(note)}\n`);
}

/**
 * Note what the turn the session is in owes its reply: once before its
 * start's mirror, so a hook cut inside the mirror loses no reply check,
 * and again once the mirror printed the address its `View` row names
 * (J-225 S1). The turn before's lacks are kept beside the note, so the
 * mirror still reads them.
 * @param root the repository root
 * @param session the harness's session id
 * @param owed the address printed and the `proceed` setting owed, each null where none is
 */
export function noteReplyOwed(root: string, session: string, owed: Omit<ReplyOwed, "turn">): void {
  const turn = sessionTurn(root, session);
  if (turn === null) return;
  const before = readReplyNote(root, session);
  const earlier =
    before === undefined
      ? []
      : before.turn === turn - 1
        ? before.lacks
        : before.turn === turn
          ? (before.earlier ?? [])
          : [];
  writeReplyNote(root, session, { turn, ...owed, lacks: [], earlier });
}

/**
 * The files the turn the session is in changed (J-204 S1): the working
 * tree's changed and added files and those the commits since its start
 * changed, each written at or after the turn's start, so code changed
 * before the turn began is none of its own; in the root's checkout and in
 * each other checkout git lists, each read since the head its start noted,
 * a worktree added during the turn since the root's (J-227 S1).
 * @param root the repository root
 * @param session the harness's session id
 * @param turn the turn the session is in
 * @returns the paths, each from its checkout's root; none where the turn's start was not noted
 */
function changedThisTurn(root: string, session: string, turn: number): readonly string[] {
  const start = turnStart(root, session, turn);
  const path = startFile(root, session);
  if (start === undefined || path === undefined) return [];
  let since: number;
  try {
    since = statSync(path).mtimeMs;
  } catch {
    return [];
  }
  const noted = start.worktrees;
  const others =
    noted === undefined
      ? []
      : otherCheckouts(root).map((checkout) =>
          changedIn(checkout, noted[checkout] ?? start.head, since),
        );
  return [...changedIn(root, start.head, since), ...others.flat()];
}

/**
 * The files one checkout changed since a turn's start: its working tree's
 * and its commits' since the head noted, each written at or after the start.
 * @param checkout the checkout's root
 * @param head the head its start noted, null where none
 * @param since the turn's start, in milliseconds
 * @returns the paths from the checkout's root, each once
 */
function changedIn(checkout: string, head: string | null, since: number): readonly string[] {
  const committed =
    head === null ? undefined : readGit(checkout, ["diff", "--name-only", `${head}..HEAD`]);
  const paths = [
    ...workingChanges(checkout),
    ...(committed?._tag === "ok" ? committed.value.split("\n") : []),
  ];
  return [...new Set(paths)].filter((each) => {
    if (each.trim() === "") return false;
    try {
      return statSync(join(checkout, each)).mtimeMs >= since;
    } catch {
      return false;
    }
  });
}

/*
 * The offers of a kept picture each change made (J-204 S1; the register's
 * row of 2026-11-08, "One offer per change at the caps"): one count per
 * change, or per session where no change is open, in `offers.json` in the
 * main checkout's sessions, a working file no commit carries.
 */

const OFFERS = z.record(z.string(), z.number().int().min(0));

function offersFile(root: string): string {
  return join(sessionsHome(root), "offers.json");
}

function readOffers(root: string): Readonly<Record<string, number>> {
  try {
    const read = OFFERS.safeParse(parseJson(readFileSync(offersFile(root), "utf8")));
    return read.success ? read.data : {};
  } catch {
    return {};
  }
}

/** The key a turn's offers are counted under: its change, else its session. */
function offersKey(session: string, change: string | undefined): string {
  return change ?? `session:${sessionFileName(session) ?? session}`;
}

/**
 * Read the reply at its turn's end against what its start noted, and keep
 * the lines a reply that lacks them leaves for the next turn's mirror: the
 * address, the mode line, the turn's pictures (J-204 S1), a turn that
 * changed code and drew no shape, a second offer in the change and an
 * offer of a lost picture's remake, and the merge withheld (J-209 S1); the
 * reply's offers are then counted for the change.
 * @param root the repository root
 * @param session the harness's session id
 * @param reply the reply's text, undefined where the harness hands none, which reads nothing
 * @param modes the modes definition's modes by name
 * @param change the change the branch holds at the turn's end, undefined where none
 * @param withheld whether the turn withheld the merge the owner's words asked for (J-209 S1)
 */
export function readReplyOwed(
  root: string,
  session: string,
  reply: string | undefined,
  modes: readonly string[],
  change?: string,
  withheld = false,
): void {
  const turn = sessionTurn(root, session);
  const note = readReplyNote(root, session);
  if (reply === undefined || note === undefined || turn === null || note.turn !== turn) return;
  const under = change ?? turnStart(root, session, turn)?.change ?? undefined;
  const offers = pictureOffers(reply);
  const key = offersKey(session, under);
  const counted = readOffers(root);
  // The turn's code is read only where the reply drew nothing, and the lost pictures only where it offers one.
  const pictures: TurnPictures = {
    moved:
      picturesOf(reply).length > 0 ? 0 : codeMoved(changedThisTurn(root, session, turn)).length,
    offeredBefore: counted[key] ?? 0,
    lost: offers.length === 0 ? [] : lostPictures(root, under),
  };
  writeReplyNote(root, session, {
    ...note,
    lacks: replyLacks(note, reply, modes, pictures, withheld),
  });
  if (offers.length === 0) return;
  const path = offersFile(root);
  mkdirSync(join(path, ".."), { recursive: true });
  atomicWriteFile(
    path,
    `${JSON.stringify({ ...counted, [key]: (counted[key] ?? 0) + offers.length })}\n`,
  );
}

/**
 * The lines the previous turn's reply left for the mirror; none where it
 * lacked nothing or no note of that turn reads.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the lines, unindented
 */
export function replyLacksLines(root: string, session: string): readonly string[] {
  const turn = sessionTurn(root, session);
  const note = readReplyNote(root, session);
  if (turn === null || note === undefined) return [];
  // This turn's note, written before its mirror, keeps the turn before's lacks (J-225 S1).
  if (note.turn === turn) return note.earlier ?? [];
  return note.turn === turn - 1 ? note.lacks : [];
}
