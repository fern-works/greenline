import { z } from "zod";
import { parseJson } from "./contract.ts";

/**
 * The deal view's pick (J-123 S7; the design step's mechanics page): where
 * cards do not render, the owner picks one of the three directions in the
 * viewer, which writes `.greenline/ledger/<id>/design-pick.json`, opening
 * with its `generatedBy` key, with the revision check every viewer write
 * makes; the mirror prints it at the next turn until the design section
 * names it, and the agent writes it into the section and the lock.
 */

/** The pick's file in the change's folder. */
export const DESIGN_PICK_FILE = "design-pick.json";

/** The owner's pick of one direction dealt: in the viewer, or in the owner's words, which the event hook reads (J-149 S4). */
export interface DesignPick {
  readonly generatedBy: "greenline inspect" | "greenline event";
  /** The owner's words that picked it, quoted, where the pick was made in words. */
  readonly words?: string | undefined;
  readonly change: string;
  /** The direction's place in the deal, from 1. */
  readonly direction: number;
  readonly name: string;
  /** The catalog entries the direction holds, by id. */
  readonly entries: readonly string[];
  /** The installed catalog's pin the deal was drawn from. */
  readonly catalog: string;
  /** The deal it was picked from: its seed, whether rerolled, and the job asked. */
  readonly seed: number;
  readonly reroll: boolean;
  readonly job: string | null;
  readonly at: string;
}

/** The pick's schema, which the inspector's contract serves. */
export const designPickSchema: z.ZodType<DesignPick> = z
  .object({
    generatedBy: z.enum(["greenline inspect", "greenline event"]),
    words: z.string().min(1).optional(),
    change: z.string().min(1),
    direction: z.number().int().min(1).max(3),
    name: z.string().min(1),
    entries: z.array(z.string().min(1)).min(1),
    catalog: z.string().regex(/^[0-9a-f]{12}$/),
    seed: z.number().int().min(0),
    reroll: z.boolean(),
    job: z.string().min(1).nullable(),
    at: z.iso.datetime(),
  })
  .strict();

/**
 * Parse a pick file's text.
 * @param text the file's text
 * @returns the pick, or undefined where it does not read
 */
export function parseDesignPick(text: string): DesignPick | undefined {
  const parsed = designPickSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The mirror's line of a pick the design section does not name yet.
 * @param pick the pick
 * @param design the record's design section, undefined where it has none
 * @returns the line, or undefined where the section names the pick's entries
 */
export function designPickLine(pick: DesignPick, design: string | undefined): string | undefined {
  if (design !== undefined && pick.entries.every((entry) => design.includes(entry)))
    return undefined;
  const where =
    pick.words === undefined
      ? "picked in the viewer"
      : `picked in the owner's words, "${pick.words}"`;
  return `design pick: direction ${String(pick.direction)}, ${pick.name} (${pick.entries.join(", ")}, catalog ${pick.catalog}), ${where}; write it into the design section and the lock`;
}

/** An ordinal's direction, the deal's three in order. */
const ORDINALS = new Map([
  ["first", 1],
  ["second", 2],
  ["third", 3],
]);

/**
 * The direction of a deal the owner's words pick (J-149 S4): its number, as
 * "direction 2", "option 2", "#2" or the words "2" alone; its ordinal, as
 * "the second one", "second direction" or "the second" alone; or its name.
 * Words that name no direction, or more than one, pick none.
 * @param words the owner's words
 * @param names the deal's directions' names, in order
 * @returns the direction, from 1, or undefined
 */
export function pickedDirection(words: string, names: readonly string[]): number | undefined {
  const text = words.toLowerCase();
  // Words that turn a direction down, or ask about one, pick none: the pick is the owner's yes.
  if (/\b(?:not|no|don't|dont|never|neither|nor|instead of|rather than)\b|\?/.test(text))
    return undefined;
  const found = new Set<number>();
  for (const match of text.matchAll(/\b(?:direction|option|number)\s*([123])\b|#([123])\b/g))
    found.add(Number(match[1] ?? match[2]));
  const alone = /^\s*([123])\s*[.!]?\s*$/.exec(text)?.[1];
  if (alone !== undefined) found.add(Number(alone));
  for (const match of text.matchAll(/\b(first|second|third)\s+(?:one|direction|option|deal)\b/g))
    found.add(ORDINALS.get(match[1] ?? "") ?? 0);
  const ordinal = /^\s*(?:the\s+)?(first|second|third)(?:\s+one)?\s*[.!]?\s*$/.exec(text)?.[1];
  if (ordinal !== undefined) found.add(ORDINALS.get(ordinal) ?? 0);
  names.forEach((name, index) => {
    // A name counts as whole words in the owner's words, never inside another word.
    const escaped = name
      .trim()
      .toLowerCase()
      .replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped !== "" && new RegExp(`(?:^|[^a-z0-9-])${escaped}(?:$|[^a-z0-9-])`).test(text))
      found.add(index + 1);
  });
  found.delete(0);
  const [only] = found;
  return found.size === 1 && only !== undefined && only <= names.length ? only : undefined;
}
