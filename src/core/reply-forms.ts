import { z } from "zod";
import type { JsonValue } from "./contract.ts";

/*
 * The reply's forms, read (J-150 S2; the block's reply section): the three
 * parts a reply carries (J-176 S1; the register's row of 2026-11-05, "The
 * seven cuts"), one sentence of what happened, one line of what it waits
 * on and the viewer's address where the inspector serves, with whether it
 * carries a table the shrunk contract leaves out; the refusal lines
 * greenline's hooks print; and the labels of the cards a question tool
 * asks. Each reads the text by its form, never its meaning: a reading is a
 * fact the status and the QA apparatus hold a reply to, never a judgment
 * of it. The facts live in status and the viewer, and no reply copies them.
 * Pure.
 */

/** The three parts of a reply (the block's reply section), each as written or null where it holds none. */
export interface ReplyParts {
  /** The first sentence of its prose: what happened. */
  readonly happened: string | null;
  /** The line naming what it waits on, opening `Waiting on`. */
  readonly waiting: string | null;
  /** The viewer's address it names, a local address the inspector serves. */
  readonly address: string | null;
  /** Whether it carries a table, which no reply holds since the facts table left it. */
  readonly table: boolean;
}

/** The fence that opens or closes a block, at any indent, a list item's among them. */
const FENCE = /^(?:`{3,}|~{3,})/;

/** A line naming the wait, its label marked or not. */
const WAITING = /^(?:[-*+]\s+)?(?:\*\*|__)?waiting on\b/i;

/** The viewer's address: the inspector serves on this machine alone. */
const ADDRESS = /\bhttps?:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}\/[^\s)>`"'\]]*/;

/**
 * The three parts a reply holds, read by their form: its first sentence of
 * prose outside fences and tables and the wait line, the line that opens
 * `Waiting on`, and the first local address it names.
 * @param reply the reply's text
 * @returns the parts
 */
export function replyPartsOf(reply: string): ReplyParts {
  let fenced = false;
  let table = false;
  let waiting: string | null = null;
  const prose: string[] = [];
  for (const line of reply.split("\n")) {
    const trimmed = line.trim();
    if (FENCE.test(trimmed)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || trimmed === "") continue;
    if (trimmed.startsWith("|")) {
      table = true;
      continue;
    }
    if (WAITING.test(trimmed)) {
      waiting ??= trimmed;
      continue;
    }
    prose.push(trimmed.replace(/^(?:[-*+]|\d+[.)])\s+/, "").replaceAll(/\*\*|__/g, ""));
  }
  const first = prose
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence !== "");
  return {
    happened: first ?? null,
    waiting,
    // A sentence's closing mark after the address is no part of it.
    address: ADDRESS.exec(reply)?.[0].replace(/[.,;:!?]+$/, "") ?? null,
    table,
  };
}

/** One refusal line of greenline's: what stopped and the way forward, the rule, and the hook that printed it. */
export interface RefusalLine {
  /** The line as greenline printed it, a harness's prefix taken off. */
  readonly line: string;
  /** What stopped and the way forward, the words before the rule. */
  readonly words: string;
  readonly rule: string;
  /** The hook that printed it: `harness` for the harness hook, else git's hook by its name. */
  readonly hook: string;
}

/** The refusal form's tail: the rule's id after a semicolon, then the hook that printed the line. */
const REFUSAL_TAIL = /;\s*([a-z][a-z0-9]*(?:-[a-z0-9]+)*), greenline's ([a-z][a-z-]*) hook\b/;

/** A harness's own prefix to a hook's line (Claude Code's `PreToolUse:Write hook error: [<command>]: `), no part of greenline's words. */
const HARNESS_PREFIX = /^.*?\bhook error:\s*(?:\[[^\]]*\]:\s*)?/;

/**
 * A line read as a refusal of greenline's hooks, by its form: the words,
 * then `; <rule>, greenline's <hook> hook`.
 * @param line the line
 * @returns the refusal, or undefined for a line in no such form
 */
export function refusalOf(line: string): RefusalLine | undefined {
  const found = REFUSAL_TAIL.exec(line);
  if (found === null) return undefined;
  const whole = line.replace(HARNESS_PREFIX, "").trim();
  const at = whole.lastIndexOf(found[0]);
  return {
    line: whole,
    words: (at === -1 ? whole : whole.slice(0, at)).trim(),
    rule: found[1] ?? "",
    hook: found[2] ?? "",
  };
}

/**
 * Every refusal line of greenline's a text holds, in order.
 * @param text a hook's output or a tool's result
 * @returns the refusals
 */
export function refusalsIn(text: string): readonly RefusalLine[] {
  return text.split("\n").flatMap((line) => {
    const found = refusalOf(line);
    return found === undefined ? [] : [found];
  });
}

/** A question tool's input: its questions, each with its options' labels. */
const questionInput = z
  .object({
    questions: z
      .array(
        z
          .object({
            options: z
              .array(z.object({ label: z.string().catch("") }).catch({ label: "" }))
              .catch([]),
          })
          .catch({ options: [] }),
      )
      .catch([]),
  })
  .catch({ questions: [] });

/** The label's ending that marks a card's first option as the one the agent puts forward (J-149 S2). */
export const MARKED_LABEL = "(Recommended)";

/** A question tool's cards with their headers, read for the first option's mark. */
const headedInput = z
  .object({
    questions: z
      .array(
        z
          .object({
            header: z.string().catch(""),
            question: z.string().catch(""),
            options: z
              .array(z.object({ label: z.string().catch("") }).catch({ label: "" }))
              .catch([]),
          })
          .catch({ header: "", question: "", options: [] }),
      )
      .catch([]),
  })
  .catch({ questions: [] });

/** A card whose first option does not carry the mark: its header, or its question where it has none, and that option's label. */
export interface UnmarkedCard {
  readonly card: string;
  readonly first: string;
}

/**
 * The cards of a question tool's call whose first option's label does not
 * end with "(Recommended)" (J-149 S2; frame's interview page): each card
 * puts the answer it puts forward first, so a yes takes it. A deal's card,
 * the one that carries the reroll among its options, is the owner's pick
 * and puts nothing forward, so it is never read as unmarked.
 * @param input the call's input as the harness handed it
 * @returns each such card once, in order; none for an input that holds no cards
 */
export function unmarkedCards(input: JsonValue): readonly UnmarkedCard[] {
  return headedInput.parse(input).questions.flatMap((question) => {
    const first = question.options[0]?.label;
    if (first === undefined || first.trimEnd().endsWith(MARKED_LABEL)) return [];
    if (question.options.some((option) => /\bre-?roll\b/i.test(option.label))) return [];
    return [{ card: question.header === "" ? question.question : question.header, first }];
  });
}

/**
 * The labels of the cards a question tool's call asks: one list per
 * question, its options' labels in order.
 * @param input the call's input as the harness handed it
 * @returns the labels; none for an input that holds no questions
 */
export function cardLabelsOf(input: JsonValue): readonly (readonly string[])[] {
  return questionInput
    .parse(input)
    .questions.map((question) => question.options.map((option) => option.label));
}
