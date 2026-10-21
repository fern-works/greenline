import { shouldNeverHappen } from "../commons/defect.ts";
import { err, ok, type Result } from "../commons/result.ts";
import { renderRecordSkeleton } from "../core/change.ts";
import {
  agentsAtMost,
  depthOf,
  kindNamed,
  noneLine,
  type Depth,
  type ModesDefinition,
} from "../core/modes.ts";
import type { LineSkill } from "./line.ts";
import type {
  FileCoverage,
  PassageOrigin,
  PlacedEdit,
  ProseProvenance,
  SegmentCoverage,
  SkillProvenance,
} from "./provenance.ts";

/**
 * The edition's data (the plan site-for-the-practice, "The data contract
 * (S2)"): what the website's skill pages, its roster, its line section,
 * its worked record and its release notes render, computed here as pure
 * functions so the website's renderer computes nothing of its own. A
 * shipped file's blocks, a skill's place on the line and its numbered
 * rulings, the line's facts, one example change record and the released
 * sections of the changelog. Every offset counts UTF-16 code units, as
 * JavaScript indexes a string and as the provenance's offsets do.
 */

/** A refusal of the edition's data, with every reason. */
class EditionRefused extends Error {
  /** The tag the Result law switches on. */
  readonly _tag = "EditionRefused" as const;
  /** Every reason. */
  readonly issues: readonly string[];
  /** @param issues every reason */
  constructor(issues: readonly string[]) {
    super(`the edition's data is refused: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

/** What a block of a shipped text is. */
export type BlockType = "front-matter" | "heading" | "paragraph" | "list-item" | "fence" | "blank";

/**
 * One block of a shipped text: whole lines, from `start` to just past
 * `end`, the last line's newline included. A heading's level is its count
 * of `#`; a list item's is its nesting, 0 for a top-level item; any other
 * block's is 0.
 */
export interface Block {
  readonly type: BlockType;
  readonly start: number;
  readonly end: number;
  readonly level: number;
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const BLANK = /^[ \t\r]*$/;
/** A thematic break, such as `---` or `* * *`, which no list item opens. */
const BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t\r]*$/;

/** A line's text without its newline. */
const bare = (line: string): string => (line.endsWith("\n") ? line.slice(0, -1) : line);

/** The width of a line's indent, a tab counted as four columns. */
const indentWidth = (indent: string): number =>
  [...indent].reduce((width, character) => width + (character === "\t" ? 4 : 1), 0);

/** Whether a line closes a fence opened with `marker`: the same character, at least as many, nothing else but space. */
function closesFence(line: string, marker: string): boolean {
  const run = new RegExp(
    `^[ \\t]*(${marker[0] === "`" ? "`" : "~"}{${marker.length},})[ \\t\\r]*$`,
  );
  return run.test(line);
}

/**
 * The blocks of a shipped text, read from the text alone, line by line:
 * front matter at the very start, from a `---` line to the next; a blank
 * run; a fence, from its opening line to the closing one or the text's
 * end, whatever it holds; an ATX heading; a list item with the lines that
 * carry it on; and a paragraph, the lines up to the next blank line or the
 * next line that opens another block. A table, a quotation or a thematic
 * break such as `---` or `* * *` reads as a paragraph. The blocks are in
 * order and tile the text, so every character falls in exactly one.
 * @param text a shipped file's text
 * @returns its blocks, none for empty text
 */
export function blocksOf(text: string): readonly Block[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const blocks: Block[] = [];
  let at = 0;
  let index = 0;
  /** The indents of the list items open above the current line, outermost first. */
  let nesting: number[] = [];
  const take = (type: BlockType, count: number, level: number): void => {
    const length = lines.slice(index, index + count).reduce((sum, line) => sum + line.length, 0);
    blocks.push({ type, start: at, end: at + length, level });
    at += length;
    index += count;
  };
  /** The lines from `from` while `keep` holds, counted. */
  const run = (from: number, keep: (line: string) => boolean): number => {
    let end = from;
    while (end < lines.length && keep(bare(lines[end] ?? ""))) end += 1;
    return end - from;
  };
  const opens = (line: string): boolean =>
    BLANK.test(line) ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    (LIST_ITEM.test(line) && !BREAK.test(line));

  if (bare(lines[0] ?? "") === "---") {
    const close = lines.findIndex((line, position) => position > 0 && bare(line) === "---");
    if (close > 0) take("front-matter", close + 1, 0);
  }
  while (index < lines.length) {
    const line = bare(lines[index] ?? "");
    if (BLANK.test(line)) {
      take(
        "blank",
        run(index, (next) => BLANK.test(next)),
        0,
      );
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? "```";
      const close = lines.findIndex(
        (next, position) => position > index && closesFence(bare(next), marker),
      );
      take("fence", (close === -1 ? lines.length : close + 1) - index, 0);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      nesting = [];
      take("heading", 1, heading[1]?.length ?? 1);
      continue;
    }
    const item = BREAK.test(line) ? null : LIST_ITEM.exec(line);
    if (item !== null) {
      const indent = indentWidth(item[1] ?? "");
      while (nesting.length > 0 && (nesting.at(-1) ?? 0) >= indent) nesting.pop();
      const level = nesting.length;
      nesting.push(indent);
      take("list-item", 1 + run(index + 1, (next) => !opens(next)), level);
      continue;
    }
    if (indentWidth(/^[ \t]*/.exec(line)?.[0] ?? "") === 0) nesting = [];
    take("paragraph", 1 + run(index + 1, (next) => !opens(next)), 0);
  }
  return blocks;
}

/** A skill's place on the line: its kind, the step it stands at for a kind on the line, its flags and its position. */
export interface LinePlace {
  readonly kind: string;
  readonly slot?: string | undefined;
  readonly extra: boolean;
  readonly trial: boolean;
  /** 1 for the first skill in line order, up to the roster's size. */
  readonly position: number;
}

/**
 * Each roster skill's place in line order: the kinds in the definition's
 * order; within a kind placed on the line, its skills by the order of the
 * step they stand at; then, within a step or a kind beside the line, the
 * defaults, then the extras, then the trials, names alphabetical within
 * each group.
 * @param definition the modes definition
 * @param skills the manifest's skills
 * @returns each skill's place, by name
 */
export function linePlaces(
  definition: ModesDefinition,
  skills: readonly LineSkill[],
): ReadonlyMap<string, LinePlace> {
  const kindRank = (skill: LineSkill): number => {
    const rank = definition.kinds.findIndex((kind) => kind.name === skill.kind);
    return rank === -1 ? definition.kinds.length : rank;
  };
  const slotRank = (skill: LineSkill): number =>
    kindNamed(definition, skill.kind)?.place === "ordered"
      ? definition.steps.findIndex((step) => step.name === skill.slot)
      : -1;
  const group = (skill: LineSkill): number =>
    skill.trial === true ? 2 : skill.extra === true ? 1 : 0;
  const ordered = [...skills].sort(
    (a, b) =>
      kindRank(a) - kindRank(b) ||
      slotRank(a) - slotRank(b) ||
      group(a) - group(b) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return new Map(
    ordered.map((skill, index): [string, LinePlace] => [
      skill.name,
      {
        kind: skill.kind,
        slot: skill.slot,
        extra: skill.extra === true,
        trial: skill.trial === true,
        position: index + 1,
      },
    ]),
  );
}

/** One numbered ruling of a skill. */
export interface Ruling {
  readonly number: number;
  readonly text: string;
}

/** A ruling as a citation is compared with it: trimmed, a leading "and " and a closing period left out. */
const rulingKey = (text: string): string =>
  text
    .trim()
    .replace(/^and\s+/, "")
    .replace(/\.$/, "");

/**
 * A skill's numbered rulings: the distinct ruling texts its passages, its
 * edits, its drops and its credit cite, in order of first appearance (each
 * file's passages in order, a taken passage's edits after it, then each
 * source file's dropped segments, then the credit), each as first written,
 * trimmed and its leading "and " stripped; then the items of its latest
 * entry's ruling list that equal none of them, each item's words whole with
 * no cut at a semicolon. Two texts are equal compared trimmed and without a
 * leading "and " or a closing period.
 * @param skill the skill's provenance
 * @returns the rulings numbered from 1
 */
function skillRulings(skill: SkillProvenance): readonly Ruling[] {
  const cited = [
    ...skill.files.flatMap((file) =>
      file.passages.flatMap((passage) =>
        passage.origin === "written" ? [passage.ruling] : passage.edits.map((edit) => edit.ruling),
      ),
    ),
    ...skill.coverage.flatMap((file) =>
      file.segments.map((segment) => (segment.account === "dropped" ? segment.ruling : undefined)),
    ),
    skill.credit?.ruling,
  ];
  const texts: string[] = [];
  const keys = new Set<string>();
  const add = (text: string | undefined, whole = false): void => {
    if (text === undefined || text.trim() === "" || keys.has(rulingKey(text))) return;
    keys.add(rulingKey(text));
    texts.push(whole ? text.trim() : text.trim().replace(/^and\s+/, ""));
  };
  for (const text of cited) add(text);
  for (const item of skill.entry.ruling) add(item.words, true);
  return texts.map((text, index) => ({ number: index + 1, text }));
}

/**
 * The number a ruling cites among a skill's numbered rulings, compared
 * trimmed and without a leading "and " or a closing period.
 * @param rulings the skill's numbered rulings, which hold every ruling it cites
 * @param ruling a passage's, an edit's, a drop's or a credit's ruling
 * @returns the ruling's number, or undefined when none is stated
 */
export function citationOf(
  rulings: readonly Ruling[],
  ruling: string | undefined,
): number | undefined {
  if (ruling === undefined || ruling.trim() === "") return undefined;
  const key = rulingKey(ruling);
  return (
    rulings.find((candidate) => rulingKey(candidate.text) === key)?.number ??
    shouldNeverHappen(`the skill's rulings hold every ruling it cites, and not '${ruling}'`)
  );
}

/** An edit as the edition carries it: its ruling's number. */
export type EditionEdit = Omit<PlacedEdit, "ruling"> & {
  readonly ruling?: number | undefined;
};

/** A passage as the edition carries it: its ruling's number, and each edit's. */
export type EditionPassage =
  | (Omit<Extract<PassageOrigin, { origin: "taken" }>, "edits"> & {
      readonly edits: readonly EditionEdit[];
    })
  | (Omit<Extract<PassageOrigin, { origin: "written" }>, "ruling"> & {
      readonly ruling?: number | undefined;
    });

/** A shipped file as the edition carries it: its text, its passages and its blocks. */
export interface EditionFile extends Omit<ProseProvenance, "passages"> {
  readonly passages: readonly EditionPassage[];
  readonly blocks: readonly Block[];
}

/** An upstream segment as the edition carries it: a drop's ruling its number. */
export type EditionSegment =
  | Extract<SegmentCoverage, { account: "taken" }>
  | (Omit<Extract<SegmentCoverage, { account: "dropped" }>, "ruling"> & {
      readonly ruling?: number | undefined;
    });

/** One source file's coverage as the edition carries it. */
export interface EditionCoverage extends Omit<FileCoverage, "segments"> {
  readonly segments: readonly EditionSegment[];
}

/** A skill's record in the edition: its provenance, its place on the line, its numbered rulings, and each file's blocks. */
export interface EditionSkill
  extends Omit<SkillProvenance, "files" | "credit" | "coverage">, LinePlace {
  readonly rulings: readonly Ruling[];
  readonly credit?:
    | { readonly source: string; readonly file: string; readonly ruling: number }
    | undefined;
  readonly files: readonly EditionFile[];
  readonly coverage: readonly EditionCoverage[];
}

/**
 * A skill's record in the edition: its provenance with its place on the
 * line, its numbered rulings ({@link skillRulings}), every passage's,
 * edit's, drop's and credit's ruling replaced by its number, and each
 * shipped file's blocks.
 * @param skill the skill's provenance
 * @param place its place on the line
 * @returns the record
 */
export function editionSkill(skill: SkillProvenance, place: LinePlace): EditionSkill {
  const rulings = skillRulings(skill);
  const cite = <T extends { readonly ruling?: string | undefined }>(item: T) => {
    const { ruling, ...rest } = item;
    const cited = citationOf(rulings, ruling);
    return cited === undefined ? rest : { ...rest, ruling: cited };
  };
  const { credit } = skill;
  return {
    name: skill.name,
    ...place,
    entry: skill.entry,
    rulings,
    stub: skill.stub,
    credit:
      credit === undefined
        ? undefined
        : {
            source: credit.source,
            file: credit.file,
            ruling:
              citationOf(rulings, credit.ruling) ??
              shouldNeverHappen("a stub's credit states its ruling"),
          },
    sources: skill.sources,
    files: skill.files.map((file) => ({
      path: file.path,
      text: file.text,
      passages: file.passages.map((passage): EditionPassage =>
        passage.origin === "written"
          ? cite(passage)
          : { ...passage, edits: passage.edits.map((edit) => cite(edit)) },
      ),
      blocks: blocksOf(file.text),
    })),
    copies: skill.copies,
    coverage: skill.coverage.map((file) => ({
      source: file.source,
      file: file.file,
      segments: file.segments.map((segment): EditionSegment =>
        segment.account === "dropped" ? cite(segment) : segment,
      ),
    })),
  };
}

/** A step's depth in one mode, named by its step. */
export type StepDepth = { readonly step: string } & Depth;

/** The line's facts: the steps in order, each mode's cost and depth per step, and the floors. */
export interface LineFacts {
  readonly steps: readonly { readonly name: string }[];
  readonly modes: readonly {
    readonly name: string;
    readonly promise: string;
    readonly typicalRequest: string;
    /** The most agents the mode may start, the builder included. */
    readonly agents: number;
    /** The fix passes after each step that takes one, outside a loop. */
    readonly fixRounds: number;
    readonly budget: { readonly words: number };
    readonly steps: readonly StepDepth[];
  }[];
  readonly floors: readonly {
    readonly name: string;
    readonly risk: string;
    readonly mode: string;
  }[];
}

/**
 * The line's facts as the modes definition holds them: the steps in the
 * line's order; each mode, least assurance first, with its promise, its
 * typical request, the most agents it may start ({@link agentsAtMost}), its
 * fix rounds, its
 * words budget and the depth it gives each step in the line's order, with
 * the agents of an independent depth or the rounds of a looped one; and
 * the floors.
 * @param definition the modes definition
 * @returns the facts
 */
export function lineFacts(definition: ModesDefinition): LineFacts {
  return {
    steps: definition.steps.map((step) => ({ name: step.name })),
    modes: definition.modes.map((mode) => ({
      name: mode.name,
      promise: mode.promise,
      typicalRequest: mode.typicalRequest,
      agents: agentsAtMost(definition, mode),
      fixRounds: mode.fixRounds,
      budget: { words: mode.budget.words },
      steps: definition.steps.map((step): StepDepth => {
        const depth = mode.steps[step.name] ?? { depth: "none" };
        return { step: step.name, ...depth };
      }),
    })),
    floors: definition.floors.map((floor) => ({
      name: floor.name,
      risk: floor.risk,
      mode: floor.mode,
    })),
  };
}

/** The example record's id, the change of the guide's pipeline page. */
export const EXAMPLE_RECORD_ID = "2026-10-08-retry-deadline";

/** The mode the example record runs at. */
const EXAMPLE_MODE = "regular";

/** The example's front matter: each field of the skeleton with its value, then the fields stated at close. */
const EXAMPLE_FIELDS: ReadonlyMap<string, string> = new Map([
  ["choice", "accepted"],
  ["why", `"Keep the caller's deadline across retries."`],
  ["state", "done"],
  ["next", "none"],
]);
const EXAMPLE_CLOSE_FIELDS = [
  "reviewed: independent",
  "agents: 2",
  "rounds: 1",
  `starts: ["review 1"]`,
];

/** The example's first line, saying what it is. */
const EXAMPLE_LINE =
  "An example change record, for the change on the guide's pipeline page; no workspace holds it.";

/** The example's section of each step the regular mode runs; a step it skips keeps the skeleton's one line. */
const EXAMPLE_SECTIONS: ReadonlyMap<string, string> = new Map([
  ["frame", "Retries reset the deadline; the caller's deadline must hold for the whole call."],
  ["plan", "Carry the deadline in the retry context and stop retrying once it passes."],
  ["build", "The context now holds the deadline; a test covers three retries."],
  [
    "review",
    [
      `[review](${EXAMPLE_RECORD_ID}/review-1.md)`,
      "",
      "| Finding                                        | Severity | What was done                              |",
      "| ---------------------------------------------- | -------- | ------------------------------------------ |",
      "| The last retry could start after the deadline. | major    | Fixed: each attempt checks the time first. |",
    ].join("\n"),
  ],
  [
    "verify",
    [
      "The suite passed on the final code through `greenline check`: the",
      "three-retry test and the two-second deadline test pass, and no other test",
      "changed.",
    ].join("\n"),
  ],
  [
    "close",
    [
      "Done in two commits, each with the trailer",
      `\`Greenline-Change: ${EXAMPLE_RECORD_ID}\`. One fix round was used.`,
    ].join("\n"),
  ],
]);

/**
 * The example change record (the guide's pipeline page, "The change
 * record"): the regular skeleton, as the installed ledger guide gives it, filled for the retry-deadline
 * change and finished. The skeleton's fields take the example's values and
 * the fields stated at close follow them; the line saying it is an example
 * opens the body; each step's section takes the example's text; a kind's
 * optional section is left out.
 * @param definition the modes definition
 * @returns the record, or a refusal when the skeleton holds a step the example does not fill or no longer holds one it fills
 */
export function exampleRecord(definition: ModesDefinition): Result<string, EditionRefused> {
  const mode = definition.modes.find((candidate) => candidate.name === EXAMPLE_MODE);
  if (mode === undefined)
    return err(new EditionRefused([`the modes definition holds no mode '${EXAMPLE_MODE}'`]));
  const skeleton = renderRecordSkeleton(definition, mode);
  const [, front = "", body = ""] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(skeleton) ?? [];
  const fields = front.split("\n").map((line) => {
    const field = line.slice(0, line.indexOf(":"));
    const value = EXAMPLE_FIELDS.get(field);
    return value === undefined ? line : `${field}: ${value}`;
  });
  const steps = new Set<string>(definition.steps.map((step) => step.name));
  const sections = body
    .split(/^(?=## )/m)
    .map((section) => /^## (\S+)/.exec(section)?.[1])
    .filter((heading): heading is string => heading !== undefined && steps.has(heading));
  // A step the mode skips keeps its section, the skeleton's one line, so the example fills only the steps it runs.
  const skipped = new Set<string>(
    definition.steps
      .filter((step) => depthOf(mode, step.name).depth === "none")
      .map((step) => step.name),
  );
  const issues = [
    ...sections
      .filter((step) => !skipped.has(step) && !EXAMPLE_SECTIONS.has(step))
      .map(
        (step) =>
          `the ${EXAMPLE_MODE} skeleton holds the step '${step}', which the example does not fill`,
      ),
    ...[...EXAMPLE_SECTIONS.keys()]
      .filter((step) => skipped.has(step) || !sections.includes(step))
      .map(
        (step) =>
          `the example fills the step '${step}', which the ${EXAMPLE_MODE} skeleton does not hold`,
      ),
  ];
  if (issues.length > 0) return err(new EditionRefused(issues));
  return ok(
    [
      "---",
      ...fields,
      ...EXAMPLE_CLOSE_FIELDS,
      "---",
      "",
      EXAMPLE_LINE,
      "",
      ...sections.flatMap((step) => [
        `## ${step}`,
        "",
        skipped.has(step) ? noneLine(mode) : (EXAMPLE_SECTIONS.get(step) ?? ""),
        "",
      ]),
    ].join("\n"),
  );
}

/** One group of a released version's items: its `###` title, empty for items under no group. */
export interface ReleaseGroup {
  readonly title: string;
  readonly items: readonly string[];
}

/** One released version of the changelog: its version, its date, its summary paragraphs and its groups. */
export interface Release {
  readonly version: string;
  readonly date: string;
  readonly summary: readonly string[];
  readonly groups: readonly ReleaseGroup[];
}

/**
 * The released sections of the changelog, newest first as it lists them:
 * each `## <version> (<date>)` section with its summary, the paragraphs
 * before its first group, and its groups, each `### <title>` with its
 * items; items under no group form one group with an empty title. A
 * paragraph's or a list item's wrapped lines are joined by one space, and
 * a table row is its first cell, a colon and the rest; a table's header and
 * separator rows and a paragraph inside a group are left out. Every text
 * keeps the changelog's inline Markdown. `## Unreleased` and any other
 * heading without a version and a date are no release.
 * @param changelog the text of CHANGELOG.md
 * @returns each release
 */
export function releasedChanges(changelog: string): readonly Release[] {
  type Building = { version: string; date: string; summary: string[]; groups: ReleaseGroup[] };
  const releases: Building[] = [];
  let current: Building | undefined;
  /** The lines of the list item or the paragraph being read, and which it is. */
  let open: { kind: "item" | "paragraph"; lines: string[] } | undefined;
  /** Whether the line before was a table row, so the next row is no header. */
  let inTable = false;
  const push = (item: string): void => {
    if (current === undefined) return;
    const last = current.groups.at(-1);
    if (last === undefined) current.groups.push({ title: "", items: [item] });
    else current.groups[current.groups.length - 1] = { ...last, items: [...last.items, item] };
  };
  const finish = (): void => {
    if (open !== undefined && current !== undefined) {
      const text = open.lines.join(" ");
      if (open.kind === "item") push(text);
      else if (current.groups.length === 0) current.summary.push(text);
    }
    open = undefined;
  };
  for (const line of changelog.split("\n")) {
    const table = line.startsWith("|");
    const header = table && !inTable;
    inTable = table;
    if (line.startsWith("## ")) {
      finish();
      const release = /^## (\d+\.\d+\.\d+\S*) \((\d{4}-\d{2}-\d{2})\)\s*$/.exec(line);
      current =
        release === null
          ? undefined
          : { version: release[1] ?? "", date: release[2] ?? "", summary: [], groups: [] };
      if (current !== undefined) releases.push(current);
      continue;
    }
    if (current === undefined) continue;
    if (line.startsWith("### ")) {
      finish();
      current.groups.push({ title: line.slice(4).trim(), items: [] });
      continue;
    }
    const listed = /^[-*] (.*)$/.exec(line);
    if (listed !== null) {
      finish();
      open = { kind: "item", lines: [(listed[1] ?? "").trim()] };
      continue;
    }
    if (line.trim() === "") {
      finish();
      continue;
    }
    if (table) {
      finish();
      if (header) continue;
      const cells = line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
      push(`${cells[0] ?? ""}: ${cells.slice(1).join(" | ")}`);
      continue;
    }
    if (open !== undefined && (open.kind === "paragraph" || /^\s+\S/.test(line))) {
      open.lines.push(line.trim());
      continue;
    }
    finish();
    open = { kind: "paragraph", lines: [line.trim()] };
  }
  finish();
  return releases;
}
