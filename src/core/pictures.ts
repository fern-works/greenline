import { z } from "zod";
import type { Harness } from "./adapters.ts";
import type { JsonValue } from "./contract.ts";

/**
 * The reply's pictures counted at the turn's end (J-129 S6; the block's
 * reply section and `show-me`): an inline picture holds at most twelve
 * nodes and 72 columns. The after-turn hook reads the reply's text where
 * the harness hands it, counts each fenced picture and leaves the next
 * turn's mirror a line for one past its cap; where the harness hands no
 * reply's text the fact reads unrun. The count is code with no model, so it
 * reads the shape of a picture and never its meaning: a fenced block is a
 * picture when it is mermaid or holds box-drawing, tree or arrow glyphs, and
 * a code block in a language is none. A text picture's nodes are its boxes,
 * else its tree's lines, else a sequence's lifelines, else its labels
 * (J-204 S1), so no text picture reads as none.
 *
 * A durable picture is kept only on the owner's ask, through `greenline
 * picture keep` (J-176 S1); the reply offers one at most once per change,
 * where the shape passes the caps, in the line `Picture offered: <what it
 * would show>, <form>, <finish>; say keep`, which the turn's end counts,
 * and never a lost picture's remake (J-204 S1; the register's row of
 * 2026-11-08, "One offer per change at the caps", amending "The seven
 * cuts").
 */

/** The caps an inline picture keeps. */
const PICTURE_CAPS = { nodes: 12, columns: 72 } as const;

/** One fenced picture of a reply: the nodes counted and its widest line's columns. */
export interface PictureCount {
  readonly nodes: number;
  readonly columns: number;
}

/** The fact a turn's end leaves: the largest picture past its cap, or why none was counted. */
export type PictureNote =
  | {
      readonly turn: number;
      readonly state: "counted";
      readonly nodes: number;
      readonly columns: number;
    }
  | { readonly turn: number; readonly state: "unrun" };

/** A fence's opening: three or more backticks or tildes and an optional language word. */
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;

/** The info strings a picture's fence may carry; any other language marks code. */
const PICTURE_LANGUAGES = new Set(["", "text", "txt", "plain", "plaintext", "mermaid", "ascii"]);

/** Box-drawing, tree and arrow glyphs, the marks of a text picture. */
const GLYPHS = /[─-╿←-⇿▲△▶▷►▸▼▽◀◁◄◂]/u;

/** A box's top-left corner, one per box drawn. */
const CORNERS = /[┌╭╔╒╓]/gu;

/** A tree's branch, one per child line. */
const BRANCH = /[├└╠╚]/u;

/** A vertical line glyph, which a sequence's lifeline is drawn in. */
const VERTICAL = /[│┃║┆┇┊┋╎╏]/u;

/**
 * What parts a line of labels: a run of line, arrow or box glyphs, an ASCII
 * arrow, or a gap of two spaces or more (J-204 S1).
 */
const CONNECTOR = /[─-╿←-⇿▲△▶▷►▸▼▽◀◁◄◂]+|-+>|<-+|=+>|\s{2,}/u;

/** A line of lines alone, which underlines a lane's title above it. */
const UNDERLINE = /^[\s─━═]+$/u;

/** A label: some letter or digit. */
const LABELLED = /[\p{L}\p{N}]/u;

/** A mermaid arrow, which a line of a chain holds more than once. */
const MERMAID_ARROW = /-\.->|==>|-->|---/;

/** The id a mermaid segment between two arrows opens with, past an edge label. */
const MERMAID_ID = /^\s*(?:\|[^|]*\|\s*)?([A-Za-z_][\w-]*)/;

/** A mermaid node declared with a shape: `id[text]`, `id(text)`, `id{text}`. */
const MERMAID_NODE = /(?:^|[\s;])([A-Za-z_][\w-]*)\s*[[({]/g;

/** A line's width in columns, a code point each. */
function columnsOf(line: string): number {
  return [...line].length;
}

/** The nodes of a mermaid picture: every id an arrow joins or a shape declares, once each. */
function mermaidNodes(lines: readonly string[]): number {
  const ids = new Set<string>();
  const keywords = new Set(["graph", "flowchart", "subgraph", "end", "TD", "TB", "LR", "RL", "BT"]);
  for (const line of lines) {
    const segments = line.split(MERMAID_ARROW);
    if (segments.length > 1)
      for (const segment of segments) {
        const id = MERMAID_ID.exec(segment)?.[1];
        if (id !== undefined && !keywords.has(id)) ids.add(id);
      }
    for (const match of line.matchAll(MERMAID_NODE))
      if (match[1] !== undefined && !keywords.has(match[1])) ids.add(match[1]);
  }
  return ids.size;
}

/**
 * The nodes of a text picture: its boxes where it draws any, else its
 * tree's lines with a branch and the root above them, else a sequence's
 * lifelines, else its labels (J-204 S1, the run j196c-pictures-home note 8,
 * whose drawing of labels joined by arrows read as no node).
 */
function textNodes(lines: readonly string[]): number {
  const boxes = lines.reduce((sum, line) => sum + (line.match(CORNERS)?.length ?? 0), 0);
  if (boxes > 0) return boxes;
  // A box's bottom corner and its divider rows draw the tree's glyphs too, so a drawing with boxes counts its boxes.
  const branches = lines.filter((line) => BRANCH.test(line)).length;
  if (branches > 0) return branches + 1;
  const lifelines = lifelinesOf(lines);
  return lifelines >= 2 ? lifelines : labelsOf(lines);
}

/**
 * A sequence's lifelines: the columns a vertical line holds on at least
 * half the picture's lines, three at the least, so a lone arrow down a
 * column is no lifeline.
 * @param lines the picture's lines
 * @returns the lifelines counted
 */
function lifelinesOf(lines: readonly string[]): number {
  const held = new Map<number, number>();
  for (const line of lines)
    [...line].forEach((character, column) => {
      if (VERTICAL.test(character)) held.set(column, (held.get(column) ?? 0) + 1);
    });
  const needed = Math.max(3, Math.ceil(lines.length / 2));
  return [...held.values()].filter((count) => count >= needed).length;
}

/**
 * The labels of a picture drawn as labels joined by lines and arrows, each
 * once: the text between its connectors, a lane's underlined title aside.
 * @param lines the picture's lines
 * @returns the labels counted
 */
function labelsOf(lines: readonly string[]): number {
  const labels = new Set<string>();
  lines.forEach((line, at) => {
    const below = lines[at + 1];
    // A title over a line of lines names a lane, not a node.
    if (below !== undefined && UNDERLINE.test(below) && below.trim() !== "") return;
    for (const part of line.split(CONNECTOR)) {
      const label = part.replace(/[│┃║┆┇┊┋╎╏|]/gu, "").trim();
      if (LABELLED.test(label)) labels.add(label.toLowerCase());
    }
  });
  return labels.size;
}

/**
 * Every fenced picture a reply holds, counted.
 * @param reply the reply's text
 * @returns one count per picture, in order; none for a reply with no picture
 */
export function picturesOf(reply: string): readonly PictureCount[] {
  const lines = reply.split("\n");
  const found: PictureCount[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const open = FENCE.exec(lines[index] ?? "");
    if (open === null) continue;
    const marker = open[1] ?? "```";
    const language = (open[2] ?? "").toLowerCase();
    const body: string[] = [];
    let end = index + 1;
    while (end < lines.length && !(lines[end] ?? "").trimStart().startsWith(marker)) {
      body.push(lines[end] ?? "");
      end += 1;
    }
    index = end;
    if (!PICTURE_LANGUAGES.has(language)) continue;
    const mermaid = language === "mermaid";
    if (!mermaid && !body.some((line) => GLYPHS.test(line))) continue;
    found.push({
      nodes: mermaid ? mermaidNodes(body) : textNodes(body),
      columns: Math.max(0, ...body.map(columnsOf)),
    });
  }
  return found;
}

/**
 * The largest picture past a cap, or undefined where every one keeps them.
 * @param pictures the reply's pictures
 * @returns the picture past its cap with the most nodes, then the widest
 */
export function pastCap(pictures: readonly PictureCount[]): PictureCount | undefined {
  return pastCapOf(pictures);
}

/**
 * The widest line of every fenced block a reply draws in, a picture's
 * language, a plain text fence or `diff` (J-147 S3): an aligned text block
 * holds no box glyph the count reads, yet its width is the cap's.
 * @param reply the reply's text
 * @returns the widest line's columns, 0 where none is fenced
 */
export function widestDrawn(reply: string): number {
  const lines = reply.split("\n");
  let widest = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const open = FENCE.exec(lines[index] ?? "");
    if (open === null) continue;
    const marker = open[1] ?? "```";
    const drawn = DRAWN_LANGUAGES.has((open[2] ?? "").toLowerCase());
    index += 1;
    while (index < lines.length && !(lines[index] ?? "").trimStart().startsWith(marker)) {
      if (drawn) widest = Math.max(widest, columnsOf(lines[index] ?? ""));
      index += 1;
    }
  }
  return widest;
}

/**
 * The reply's picture past a cap (J-129 S6, J-147 S3): the counted picture
 * past its nodes or its columns, else a drawn fence wider than 72 columns
 * read as one with no nodes counted.
 * @param reply the reply's text
 * @returns the picture past its cap, or undefined
 */
export function replyPastCap(reply: string): PictureCount | undefined {
  const counted = pastCapOf(picturesOf(reply));
  if (counted !== undefined) return counted;
  const widest = widestDrawn(reply);
  return widest > PICTURE_CAPS.columns ? { nodes: 0, columns: widest } : undefined;
}

/** The largest picture past a cap among those counted. */
function pastCapOf(pictures: readonly PictureCount[]): PictureCount | undefined {
  return pictures
    .filter(
      (picture) => picture.nodes > PICTURE_CAPS.nodes || picture.columns > PICTURE_CAPS.columns,
    )
    .sort((a, b) => b.nodes - a.nodes || b.columns - a.columns)[0];
}

/** The payload fields a harness hands the reply's text in at its turn's end, read where they are text. */
const replyFields = z
  .object({
    last_assistant_message: z.string().optional().catch(undefined),
    prompt_response: z.string().optional().catch(undefined),
  })
  .catch({});

/** The field a harness hands the reply's text in; undefined for one that hands none. */
function replyFieldOf(harness: Harness): "last_assistant_message" | "prompt_response" | undefined {
  switch (harness) {
    case "claude-code":
    case "codex":
      return "last_assistant_message";
    case "gemini":
      return "prompt_response";
    default:
      return undefined;
  }
}

/**
 * The reply's text the harness handed its turn's end, or undefined where it
 * hands none, so the count reads unrun.
 * @param harness the harness the adapter names
 * @param payload the event's payload
 * @returns the text, or undefined
 */
export function replyTextOf(harness: Harness, payload: JsonValue): string | undefined {
  const field = replyFieldOf(harness);
  return field === undefined ? undefined : replyFields.parse(payload)[field];
}

/**
 * The mirror's line for the previous turn's picture past its cap, or
 * undefined: an unrun reading and an older turn's note print nothing.
 * @param note the session's picture note
 * @param turn the turn the mirror opens
 * @returns the line, unindented
 */
export function pictureLine(note: PictureNote | undefined, turn: number): string | undefined {
  if (note === undefined || note.state === "unrun" || note.turn !== turn - 1) return undefined;
  return `picture: one past its cap at turn ${String(note.turn)} (${String(note.nodes)} nodes, ${String(note.columns)} columns; the caps are ${String(PICTURE_CAPS.nodes)} and ${String(PICTURE_CAPS.columns)}); draw the next within them, the part that decides`;
}

/** The payload field a harness hands the owner's words in at a turn's start. */
const promptField = z.object({ prompt: z.string().optional().catch(undefined) }).catch({});

/**
 * The owner's words the harness handed a turn's start, or undefined where
 * it hands none.
 * @param payload the event's payload
 * @returns the words
 */
export function promptTextOf(payload: JsonValue): string | undefined {
  return promptField.parse(payload).prompt;
}

/** The info strings a fence carries for a drawing: a picture's, and a shape diff's. */
const DRAWN_LANGUAGES = new Set([...PICTURE_LANGUAGES, "diff"]);

/*
 * The reply's own facts the turn's end reads (J-199 S1; the block's reply
 * section and step 2; the register's row of 2026-11-05, "The keeper over
 * the oracle"): the address the turn's mirror printed in its `View` row,
 * which every reply carries, a decline and a stop included (the run
 * j196c-conduct-empty, finding 1); and, on the first reply of a request
 * the `proceed` setting lets go on, the mode taken, named in one line
 * before the first edit (the run j196t-wait-proceed-1). The hook that reads
 * the reply's text for the picture cap reads these too, as code with no
 * model, and the next turn's mirror names a reply that lacks one; it is a
 * notice, never a refusal.
 */

/** What a turn's start noted of the reply it owes. */
export interface ReplyOwed {
  /** The turn the note is of. */
  readonly turn: number;
  /** The address the turn's mirror printed in its `View` row, null where it printed none. */
  readonly printed: string | null;
  /** The `proceed` setting where the turn opened on the owner's words with no change open and the setting lets a request go on, null otherwise. */
  readonly proceed: string | null;
}

/** The origin an address names, `http://127.0.0.1:51270`, or undefined where it names none. */
function originOf(address: string): string | undefined {
  try {
    return new URL(address).origin;
  } catch {
    return undefined;
  }
}

/**
 * Whether a reply carries the viewer's address: the origin of the address
 * the turn printed, whichever of its pages the reply names.
 * @param reply the reply's text
 * @param address the address the turn printed
 * @returns true where it does
 */
function replyNamesAddress(reply: string, address: string): boolean {
  const origin = originOf(address);
  return reply.includes(origin ?? address);
}

/**
 * Whether a reply names one of the modes, as a word in any case.
 * @param reply the reply's text
 * @param modes the modes definition's modes by name
 * @returns true where it names one
 */
function replyNamesMode(reply: string, modes: readonly string[]): boolean {
  const words = new Set(reply.toLowerCase().match(/[a-z]+/g) ?? []);
  return modes.some((mode) => words.has(mode.toLowerCase()));
}

/*
 * The picture decision's facts at a turn's end (J-204 S1; the register's
 * row of 2026-11-08, "One offer per change at the caps"): a turn that
 * changed code and whose reply drew no shape is named at the next turn's
 * mirror, a notice and never a refusal; and the reply's offers of a kept
 * picture, each in its one line form, are counted per change, a second one
 * in a change named, and one that remakes a picture status names lost.
 */

/** A kept picture status names lost: drifting or stale by GL0601, or deleted from the change's home. */
export interface LostPicture {
  /** Its id in the visual home, `<change>/<slug>` for a change's. */
  readonly id: string;
  readonly title: string;
  /** The tier status names, or `deleted`. */
  readonly state: string;
}

/** What the turn's end read of the turn beside its reply. */
export interface TurnPictures {
  /** The code files the turn changed, tests, documents and greenline's own folder aside. */
  readonly moved: number;
  /** The picture offers the change made before this reply. */
  readonly offeredBefore: number;
  /** The kept pictures status names lost; read only where the reply offers one. */
  readonly lost: readonly LostPicture[];
}

/** The extensions of a file whose change can move a shape: source code, a schema, a page. */
const CODE_FILE =
  /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|kts|swift|rb|php|cs|c|h|cc|cpp|hpp|scala|ex|exs|erl|clj|dart|lua|zig|sh|sql|prisma|graphql|gql|proto|vue|svelte|astro|html?|css|scss)$/i;

/** A test by its path, the forms `fileClassesOf` reads and a Python or Go test's name. */
const TEST_FILE =
  /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[^/]+$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go)$/i;

/**
 * The code among the files a turn changed: a source, schema or page file,
 * tests, documents and greenline's own folder aside.
 * @param paths the files changed, from the root, `/`-separated
 * @returns the code files, in the order given
 */
export function codeMoved(paths: readonly string[]): readonly string[] {
  return paths.filter(
    (path) =>
      !path.startsWith(".greenline/") &&
      !path.startsWith("docs/") &&
      CODE_FILE.test(path) &&
      !TEST_FILE.test(path),
  );
}

/**
 * Whether a reply draws a shape: a fenced picture the count reads, or a
 * shape diff holding a picture's glyphs.
 * @param reply the reply's text
 * @returns true where it draws one
 */
function drawsPicture(reply: string): boolean {
  if (picturesOf(reply).length > 0) return true;
  return /^ {0,3}(`{3,}|~{3,})\s*diff\b[\s\S]*?[─-╿]/m.test(reply);
}

/** A reply's line offering a kept picture: `Picture offered: <what>, <form>, <finish>; say keep`, a list marker or emphasis allowed. */
const OFFER_LINE = /^\s*(?:[-*>]\s+)?(?:\*\*|__)?Picture offered:(?:\*\*|__)?\s*(.+?)\s*$/gim;

/** An offer's words that ask to remake a picture. */
const REMAKE = /\bre-?(?:make|draw|keep|kept|made|drawn)\b/i;

/**
 * The offers of a kept picture a reply makes, each the words after its
 * line's `Picture offered:`.
 * @param reply the reply's text
 * @returns the offers, in order
 */
export function pictureOffers(reply: string): readonly string[] {
  return [...reply.matchAll(OFFER_LINE)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/** The lost picture an offer names, by its id, its slug in words or its title. */
function lostNamed(offer: string, lost: readonly LostPicture[]): LostPicture | undefined {
  const words = offer.toLowerCase();
  return lost.find((picture) => {
    const slug = picture.id.slice(picture.id.lastIndexOf("/") + 1);
    return (
      words.includes(picture.id.toLowerCase()) ||
      words.includes(slug) ||
      words.includes(slug.replaceAll("-", " ")) ||
      words.includes(picture.title.toLowerCase())
    );
  });
}

/**
 * The mirror's lines for the turn's pictures: a code-moving turn that drew
 * no shape, a second offer in the change, and an offer of a lost
 * picture's remake.
 * @param turn the turn the reply ends
 * @param reply the reply's text
 * @param facts what the turn's end read beside the reply
 * @returns the lines, unindented
 */
function pictureLacks(turn: string, reply: string, facts: TurnPictures): string[] {
  const lines: string[] = [];
  if (facts.moved > 0 && !drawsPicture(reply))
    lines.push(
      `picture: the turn changed ${String(facts.moved)} file${facts.moved === 1 ? "" : "s"} and drew no shape; draw the resulting shape where one moved, in show-me's form for it`,
    );
  const offers = pictureOffers(reply);
  if (facts.offeredBefore + offers.length > 1)
    lines.push(
      `offer: a second picture offer in this change at turn ${turn}; a change offers a kept picture once, where the shape passes twelve nodes or 72 columns`,
    );
  for (const offer of offers) {
    const named = lostNamed(offer, facts.lost);
    if (named !== undefined)
      lines.push(
        `offer: the offer at turn ${turn} remakes ${named.id}, which status names ${named.state}; a lost picture's remake is the owner's ask alone, never offered`,
      );
    else if (REMAKE.test(offer))
      lines.push(
        `offer: the offer at turn ${turn} offers a remake; a lost picture's remake is the owner's ask alone, never offered`,
      );
  }
  return lines;
}

/**
 * The lines the next turn's mirror prints for a reply that lacks what its
 * turn owed: the address its turn printed, the mode line of the first
 * reply under `proceed`, the turn's pictures (J-204 S1): a shape where
 * the turn moved code, one offer per change, no lost picture's remake;
 * and the merge the owner's words asked for (J-209 S1); none where it
 * lacks nothing.
 * @param owed what the turn's start noted
 * @param reply the reply's text
 * @param modes the modes definition's modes by name
 * @param pictures what the turn's end read of the turn's code and the change's offers; none read where absent
 * @param withheld whether the turn withheld the merge the owner's words asked for, its change carrying no landing line and its base not holding the branch (J-209 S1)
 * @returns the lines, unindented
 */
export function replyLacks(
  owed: ReplyOwed,
  reply: string,
  modes: readonly string[],
  pictures?: TurnPictures,
  withheld = false,
): string[] {
  const lines: string[] = [];
  const turn = String(owed.turn);
  if (owed.printed !== null && !replyNamesAddress(reply, owed.printed))
    lines.push(
      `address: the reply at turn ${turn} named no address, where its turn printed ${owed.printed}; every reply carries the address its turn printed, a decline and a stop included`,
    );
  if (owed.proceed !== null && !replyNamesMode(reply, modes))
    lines.push(
      `mode line: the first reply at turn ${turn} named no mode, where proceed ${owed.proceed} lets a request for a change go on; state the mode taken and its ground in one line before the first edit, a question needing none`,
    );
  if (pictures !== undefined) lines.push(...pictureLacks(turn, reply, pictures));
  // The merge the owner asked for, withheld with no landing line written and no merge run (J-209 S1, the run j196c-landing-4b).
  if (withheld)
    lines.push(
      `landing: the reply at turn ${turn} withheld the merge the owner asked for; no reading of the merge stands for the check on the merge commit`,
    );
  return lines;
}
