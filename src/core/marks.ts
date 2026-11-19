import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { CHANGE_ID } from "./change.ts";
import { parseJson } from "./contract.ts";
import { boxedElementSchema, type Box, type BoxedElement } from "./interface-boxes.ts";

/**
 * The marks (J-124 S2; design's marks page; `corpus/runtime/ledger.md`,
 * "Marks"): the owner's hand on a capture. A mark names one element of a
 * capture at one width, or a region drawn over it, with a note and an
 * intent, and it binds the capture's commit, so it knows when the files it
 * shows moved. Marks are kept as `marks.jsonl`, append-only JSON Lines, in
 * the folder of the change open on the mark's address, else under the
 * interface ledger home; each line is the whole mark as it stands after
 * one act, and a mark is its last line. The agent proposes a mark
 * addressed or declined with its evidence; only the owner's act, in the
 * viewer or in words the line quotes, closes one.
 */

/** The marks file's name, in a change's folder or the interface ledger home. */
export const MARKS_FILE = "marks.jsonl";

/** The interface ledger home's marks file, for marks no open change takes. */
export const INTERFACE_MARKS: string = `.greenline/ledger/interface/${MARKS_FILE}`;

/** What the owner wants of a mark. */
export const MARK_INTENTS: readonly ["fix", "question", "options", "idea"] = [
  "fix",
  "question",
  "options",
  "idea",
];
export type MarkIntent = (typeof MARK_INTENTS)[number];

/** Where a mark stands: open until the owner closes it addressed or declined. */
const MARK_STATES: readonly ["open", "addressed", "declined"] = ["open", "addressed", "declined"];
export type MarkState = (typeof MARK_STATES)[number];

/** A closure: addressed or declined. */
export type MarkClosure = Exclude<MarkState, "open">;

/** A region drawn on a capture: the stroke's points in the page's coordinates, and the elements it lies over. */
export interface MarkRegion {
  readonly path: readonly (readonly [number, number])[];
  /** The selectors of the elements under the stroke, the smallest first. */
  readonly elements: readonly string[];
}

/** The agent's proposal to close a mark, with its evidence. */
export interface MarkProposal {
  readonly as: MarkClosure;
  /** The capture that shows the mark answered, its after; null for a decline with none. */
  readonly capture: string | null;
  /** The commit or the range that answers it; null where the change is not committed yet. */
  readonly diff: string | null;
  readonly note: string;
  readonly at: string;
}

/** The owner's act that closed a mark: in the viewer, or in words the line quotes. */
export interface MarkClosed {
  readonly by: "owner";
  readonly via: "viewer" | "words";
  readonly words: string | null;
  readonly at: string;
}

/** One mark as it stands. */
export interface Mark {
  /** `m` and seven hex characters. */
  readonly id: string;
  /** The page's address the capture shows. */
  readonly address: string;
  readonly width: number;
  /** The capture marked, by its visual id, and the commit it was taken at. */
  readonly capture: { readonly id: string; readonly commit: string };
  /** The element marked; null for a region. */
  readonly element: BoxedElement | null;
  /** The region drawn; null for an element. */
  readonly region: MarkRegion | null;
  /** The part of the capture the mark shows, in the page's coordinates. */
  readonly crop: Box;
  readonly note: string;
  readonly intent: MarkIntent;
  readonly state: MarkState;
  /** Who made it: the owner in the viewer, or the agent recording the owner's words. */
  readonly by: "owner" | "agent";
  /** The owner's words a mark made in chat quotes; null for a mark made in the viewer. */
  readonly words: string | null;
  readonly at: string;
  readonly proposed: MarkProposal | null;
  readonly closed: MarkClosed | null;
}

const at = z.iso.datetime();
const box = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
  })
  .strict();
const point = z.tuple([z.number(), z.number()]);

/** One mark's schema, a line of the marks file, which the inspector's contract serves too. */
export const markSchema: z.ZodType<Mark> = z
  .object({
    id: z.string().regex(/^m[0-9a-f]{7}$/, "a mark's id, m and seven hex characters"),
    address: z.string().regex(/^\//, "an address starts with '/'"),
    width: z.number().int().positive(),
    capture: z
      .object({
        id: z.string().min(1),
        commit: z.string().regex(/^[0-9a-f]{7,40}$/, "a commit's hash"),
      })
      .strict(),
    element: boxedElementSchema.nullable(),
    region: z
      .object({ path: z.array(point).min(2), elements: z.array(z.string()) })
      .strict()
      .nullable(),
    crop: box,
    note: z.string().trim().min(1).max(2000),
    intent: z.enum(MARK_INTENTS),
    state: z.enum(MARK_STATES),
    by: z.enum(["owner", "agent"]),
    words: z.string().trim().min(1).nullable(),
    at,
    proposed: z
      .object({
        as: z.enum(["addressed", "declined"]),
        capture: z.string().min(1).nullable(),
        diff: z.string().min(1).nullable(),
        note: z.string().trim().min(1),
        at,
      })
      .strict()
      .nullable(),
    closed: z
      .object({
        by: z.literal("owner"),
        via: z.enum(["viewer", "words"]),
        words: z.string().trim().min(1).nullable(),
        at,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((mark) => (mark.element === null) !== (mark.region === null), {
    message: "a mark names an element or a region, one of the two",
  })
  .refine((mark) => (mark.state === "open") === (mark.closed === null), {
    message: "a mark is addressed or declined only with the owner's act that closed it",
  })
  .refine(
    (mark) =>
      mark.closed === null || (mark.closed.via === "words") === (mark.closed.words !== null),
    {
      message: "a closure in words quotes them, and one in the viewer quotes none",
    },
  )
  .refine((mark) => mark.by === "owner" || mark.words !== null, {
    message: "a mark the agent records quotes the owner's words",
  });

/** A marks file read: its marks as they stand, in the order they were made, and the lines that do not read. */
export interface MarksRead {
  readonly marks: readonly Mark[];
  readonly unreadable: readonly { readonly line: number; readonly why: string }[];
}

/**
 * Read a marks file: each line a mark after one act, the last line of an id
 * the mark as it stands.
 * @param text the file's text
 * @returns the marks and the lines that do not read
 */
export function readMarks(text: string): MarksRead {
  const byId = new Map<string, Mark>();
  const unreadable: { line: number; why: string }[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue;
    const parsed = markSchema.safeParse(parseJson(line));
    if (!parsed.success) {
      unreadable.push({
        line: index + 1,
        why: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }
    byId.set(parsed.data.id, parsed.data);
  }
  return { marks: [...byId.values()], unreadable };
}

/**
 * A new mark's id, from what it marks and when.
 * @param seed the mark's capture, width, target, note and time, as one string
 * @returns `m` and seven hex characters
 */
export function markId(seed: string): string {
  return `m${sha256Hex(seed).slice(0, 7)}`;
}

/**
 * The folder a mark's file stands in: the change open on its address, else
 * the interface ledger home.
 * @param change the change open on the mark's address, or undefined
 * @returns the marks file's path from the root
 */
export function marksFileOf(change: string | undefined): string {
  return change === undefined || !CHANGE_ID.test(change)
    ? INTERFACE_MARKS
    : `.greenline/ledger/${change}/${MARKS_FILE}`;
}

/** An open mark with where it stands and whether the files its capture shows moved since. */
export interface OpenMark {
  readonly mark: Mark;
  readonly stale: boolean;
}

/**
 * The mirror's and status's marks line (J-107 S2's edition): the open marks
 * counted by address, the stale ones named; undefined while none is open.
 * `marks: 3 open on /settings, 1 on /; 1 stale since its capture (m1a2b3c)`.
 * @param open the open marks
 * @returns the line, unindented, or undefined
 */
export function marksLine(open: readonly OpenMark[]): string | undefined {
  if (open.length === 0) return undefined;
  const byAddress = new Map<string, number>();
  for (const entry of open)
    byAddress.set(entry.mark.address, (byAddress.get(entry.mark.address) ?? 0) + 1);
  const counted = [...byAddress.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(
      ([address, count], index) => `${String(count)}${index === 0 ? " open" : ""} on ${address}`,
    );
  const stale = open.filter((entry) => entry.stale).map((entry) => entry.mark.id);
  return `marks: ${counted.join(", ")}${stale.length === 0 ? "" : `; ${String(stale.length)} stale since ${stale.length === 1 ? "its capture" : "their captures"} (${stale.join(", ")})`}`;
}

/**
 * A mark after the agent proposes it closed, with the evidence.
 * @param mark the open mark
 * @param proposal the closure proposed
 * @returns the mark as it then stands, still open
 */
export function proposed(mark: Mark, proposal: MarkProposal): Mark {
  return { ...mark, proposed: proposal };
}

/**
 * A mark after the owner closes it.
 * @param mark the mark
 * @param as addressed or declined
 * @param closed the owner's act
 * @returns the mark as it then stands
 */
export function closedMark(mark: Mark, as: MarkClosure, closed: MarkClosed): Mark {
  return { ...mark, state: as, closed };
}

/**
 * The phrases that delegate or defer the owner's verdict on a mark (J-129
 * S5; the operator's card of 2026-10-26, "Words must be the owner's
 * verdict"): words holding one are no verdict, whatever else they say.
 * Matched on the words lower-cased, their apostrophes straightened and
 * their white space collapsed.
 */
const DELEGATING_PHRASES: readonly string[] = [
  "yourself",
  "you decide",
  "your call",
  "up to you",
  "whatever you think",
  "as you see fit",
  "close them all",
  "not looked",
  "haven't looked",
  "haven't seen",
  "have not seen",
  "without looking",
  "unseen",
  "i trust you",
];

/** The outcome words a closure in words may give: the owner's verdict on the mark, whole words. */
const OUTCOME_WORDS: readonly string[] = [
  "fixed",
  "done",
  "fine",
  "good",
  "ok",
  "okay",
  "yes",
  "decline",
  "declined",
  "no",
  "drop",
];

/** Words too common to name a mark's note or element. */
const COMMON = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "into",
  "onto",
  "over",
  "under",
  "there",
  "here",
  "what",
  "when",
  "where",
  "which",
  "they",
  "them",
  "then",
  "than",
  "have",
  "has",
  "had",
  "been",
  "were",
  "will",
  "would",
  "should",
  "could",
  "just",
  "only",
  "also",
  "very",
  "some",
  "more",
  "most",
  "less",
  "now",
  "not",
  "its",
  "it's",
  "is",
  "are",
  "was",
  "for",
  "but",
  "all",
]);

/** The words of a text, lower-cased, apostrophes straightened. */
function wordsIn(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .split(/[^a-z0-9']+/)
    .filter((word) => word !== "");
}

/**
 * Whether words may close a mark (J-129 S5): they are the owner's verdict on
 * that mark when they hold no delegating or deferring phrase
 * ({@link DELEGATING_PHRASES}) and give an outcome word ({@link OUTCOME_WORDS})
 * or name the mark's note or its element, a word of four letters or more
 * they share or two words in a row, such as `top bar`, so one sentence
 * naming two marks reads the same for each (J-143 S2). The rule cannot read intent: it refuses the plain delegations,
 * and the pages carry the rest. The refusal says it as the agent tells the
 * owner (J-144 S3): the mark stays open, why a mark the owner has not seen
 * cannot close, and what closes it, the mark in the viewer or a verdict on it.
 * @param words the owner's words the closure quotes
 * @param mark the mark to close
 * @returns undefined where the words may close it, else why not, naming the rule
 */
export function closureWordsRefusal(words: string, mark: Mark): string | undefined {
  const plain = wordsIn(words).join(" ");
  const delegating = DELEGATING_PHRASES.find((phrase) => ` ${plain} `.includes(` ${phrase} `));
  const forward = `so it stays open: open it in greenline inspect and close it there, or give your verdict on that mark in a word, fixed, done, fine, good, ok, okay, yes, decline, declined, no or drop, or in words that name its note or its element; a mark closes in words only on the owner's verdict on that mark, quoted`;
  if (delegating !== undefined)
    return `I can't close the mark ${mark.id} on these words: they leave the verdict to me or for later ('${delegating}'), and a mark you have not judged is not mine to close, ${forward}.`;
  const said = wordsIn(words);
  const given = new Set(said);
  if (OUTCOME_WORDS.some((word) => given.has(word))) return undefined;
  const texts = [
    mark.note,
    mark.element?.text ?? "",
    mark.element?.selector ?? "",
    mark.element?.role ?? "",
  ].map(wordsIn);
  const named = texts.flat().filter((word) => word.length >= 4 && !COMMON.has(word));
  if (named.some((word) => given.has(word))) return undefined;
  // Two words of the note or the element in a row name it whatever their length, `top bar` among them (J-143 S2).
  const pairs = new Set(said.slice(1).map((word, index) => `${said[index] ?? ""} ${word}`));
  if (texts.some((text) => namingPairs(text).some((pair) => pairs.has(pair)))) return undefined;
  return `I can't close the mark ${mark.id} on these words: they give no verdict on it, and a mark you have not judged is not mine to close, ${forward}.`;
}

/** The pairs of words in a row a text holds that may name it: neither word a lone letter, and one of three letters or more that is not too common to name anything. */
function namingPairs(text: readonly string[]): readonly string[] {
  const naming = (word: string): boolean => word.length >= 3 && !COMMON.has(word);
  return text.slice(1).flatMap((word, index) => {
    const before = text[index] ?? "";
    const named = before.length >= 2 && word.length >= 2 && (naming(before) || naming(word));
    return named ? [`${before} ${word}`] : [];
  });
}
