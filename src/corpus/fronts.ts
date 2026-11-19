import type { CheckedRecipe } from "./recipe.ts";
import { frontMatterBlock, placeProse } from "./render.ts";
import { wordsOf } from "./segments.ts";

/**
 * The split's front rule (J-93 S2, N-56 item 2;
 * `workshop/components/recipes.md`, "The front and the references"): a
 * skill's front is the upstream prose its recipe cuts and merges, and
 * greenline's mechanics stand on its references page, so a front holds no
 * greenline command, no workspace path and no record form. The parts of a
 * front exempt are `SKILL.md`'s `## Handoff` section and a habit's
 * `Durable output:` line, which the handoff check and the loop read where
 * they stand, and a fenced code block, which is upstream's code or example:
 * a script there may need greenline's home to run, as constraint-driven
 * development's floor guard defaults its bar to the decisions book.
 *
 * The front's cap (the register's row of 2026-11-05, "The seven cuts", its
 * sixth, at the number ruled on 2026-11-06; J-180 S1, J-181 S1): `SKILL.md`
 * as a workspace receives it, its front matter and its Handoff section
 * included, holds under {@link FRONT_WORDS} words by `wordsOf`, the first
 * move of its step; every later moment's method stands on a page of the
 * front its pointer names (`workshop/components/roster-skill.md`, "The
 * front and the references"). The rule and the goldens' test count with
 * {@link frontWords}, so the number lives here once. Pure: the instrument
 * hands it a checked recipe and reports what it finds.
 */

/** A front's `SKILL.md` holds fewer words than this. */
export const FRONT_WORDS = 300;

/**
 * A front's words, the count its cap reads.
 * @param text the `SKILL.md` as a workspace receives it, front matter included
 * @returns its words by `wordsOf`
 */
export function frontWords(text: string): number {
  return wordsOf(text).length;
}

/** One thing a front's text holds that the rule refuses, by file and line: a mechanic, or a `SKILL.md` at its cap. */
export interface FrontFinding {
  readonly path: string;
  /** The line it stands on in the rendered file, from 1: a mechanic's, or the line of a long front's {@link FRONT_WORDS}th word. */
  readonly line: number;
  /** What the text names, a command, a path or a record form, or a front of {@link FRONT_WORDS} words or more. */
  readonly what: string;
  /** The text matched, or a long front's count. */
  readonly text: string;
}

/**
 * The CLI's verbs, as a skill would write them. A word after `greenline`
 * outside this list is the product's name in a sentence, not a command.
 */
const VERBS = [
  "brief",
  "check",
  "connectors",
  "event",
  "init",
  "inspect",
  "mark",
  "status",
  "sync",
  "tidy",
] as const;

/**
 * The CLI's own flags, the connector call's among them, which a front would
 * write as a code span of their own beside the command it names by its noun.
 * Generic flags, `--json` or `--help`, are left out, since upstream's tools
 * share them.
 */
const FLAGS = [
  "anchor",
  "axis",
  "call-id",
  "change",
  "concern",
  "exclude",
  "executable",
  "force-managed",
  "id",
  "intent",
  "kind",
  "language",
  "max-bytes",
  "max-units",
  "probe",
  "purpose",
  "request",
  "requires",
  "responsibility",
  "root",
  "round",
  "snapshot",
  "step",
  "targets",
  "task",
  "technology",
  "timeout-ms",
  "url",
] as const;

/** Each mechanic a front may not hold, the pattern that finds it and what it is called. */
const MECHANICS: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  {
    pattern: new RegExp(`\\bgreenline (?:${VERBS.join("|")})\\b`, "g"),
    what: "a greenline command",
  },
  {
    pattern: new RegExp(`\`--(?:${FLAGS.join("|")})\\b[^\`]*\``, "g"),
    what: "a greenline command's flag",
  },
  { pattern: /\.greenline\/[^\s`'"),;]*/g, what: "a workspace path" },
  { pattern: /\bstatus: (?:draft|complete)\b/g, what: "a plan document's mark" },
  { pattern: /\bGL\d{4}\b/g, what: "a finding code" },
  { pattern: /\bGreenline-Change:/g, what: "the change's trailer" },
  { pattern: /\bnone at <mode>/g, what: "a record section's form" },
];

/** The heading that opens the section of `SKILL.md` a front keeps greenline's words in. */
const HANDOFF = "\n## Handoff\n";

/** A habit's line naming what it leaves, which the handoff check reads in `SKILL.md`. */
const DURABLE = /^Durable output: .*$/gm;

/** A fenced code block, from its opening fence to the closing one or the end of the text. */
const FENCE = /^([ \t>]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1\2[`~]*[ \t]*$|(?![\s\S]))/gm;

/** The text with each exempt part blanked in place, so every line keeps its number. */
function searched(text: string, skill: boolean): string {
  const blank = (part: string): string => part.replace(/[^\n]/g, " ");
  const unfenced = text.replace(FENCE, blank);
  return skill ? unfenced.replace(DURABLE, blank) : unfenced;
}

/**
 * A `SKILL.md` at its cap, as a finding on the line of its {@link FRONT_WORDS}th word.
 * @param text the `SKILL.md` as a workspace receives it
 * @returns the finding, or undefined when the front holds fewer words than the cap
 */
function longFront(text: string): FrontFinding | undefined {
  const words = frontWords(text);
  if (words < FRONT_WORDS) return undefined;
  // A word never spans a line, so the lines' counts add up to the front's.
  const lines = text.split("\n");
  let line = 0;
  for (let seen = 0; line < lines.length; line += 1) {
    seen += wordsOf(lines[line] ?? "").length;
    if (seen >= FRONT_WORDS) break;
  }
  return {
    path: "SKILL.md",
    line: line + 1,
    what: `a front of ${String(FRONT_WORDS)} words or more`,
    text: `${String(words)} words by wordsOf`,
  };
}

/**
 * Every mechanic the front of a checked recipe holds, and its `SKILL.md` at its cap.
 * @param checked a recipe the snapshots accepted
 * @returns each finding, by file in the recipe's order and then by place, a long `SKILL.md` after its mechanics; empty when the front is clean
 */
export function frontFindings(checked: CheckedRecipe): readonly FrontFinding[] {
  const findings: FrontFinding[] = [];
  for (const file of checked.files) {
    if (file.part !== "front") continue;
    const rendered = placeProse(file).text;
    const at = file.path === "SKILL.md" ? rendered.lastIndexOf(HANDOFF) : -1;
    // SKILL.md's front matter is searched too: a description names a home by its noun.
    const head = file.path === "SKILL.md" ? frontMatterBlock(checked.recipe.frontMatter) : "";
    const text = searched(
      head + (at === -1 ? rendered : rendered.slice(0, at)),
      file.path === "SKILL.md",
    );
    const found: { readonly index: number; readonly what: string; readonly text: string }[] = [];
    for (const { pattern, what } of MECHANICS)
      for (const match of text.matchAll(pattern))
        found.push({ index: match.index, what, text: match[0] });
    found.sort((left, right) => left.index - right.index);
    for (const item of found)
      findings.push({
        path: file.path,
        line: text.slice(0, item.index).split("\n").length,
        what: item.what,
        text: item.text,
      });
    const long = file.path === "SKILL.md" ? longFront(head + rendered) : undefined;
    if (long !== undefined) findings.push(long);
  }
  return findings;
}

/**
 * Whether a checked recipe names a references page.
 * @param checked a recipe the snapshots accepted
 * @returns true when one of its prose files is a references part
 */
export function hasReferences(checked: CheckedRecipe): boolean {
  return checked.files.some((file) => file.part === "references");
}
