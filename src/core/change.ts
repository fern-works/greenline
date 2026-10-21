import { z } from "zod";
import { shouldNeverHappen } from "../commons/defect.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  type ContractParseFailed,
  type InvalidField,
} from "./contract.ts";
import {
  bodyLines,
  fieldData,
  parseFrontMatter,
  type BodyLine,
  type FieldData,
} from "./front-matter.ts";
import {
  agentsAtMost,
  depthOf,
  meetsFloor,
  noneLine,
  recordSections,
  roundsAtMost,
  STEP_KIND,
  type Depth,
  type FloorName,
  type Kind,
  type KindName,
  type Mode,
  type ModeName,
  type ModesDefinition,
  type RecordSection,
  type StepName,
} from "./modes.ts";

/**
 * The change record (`workshop/components/artifact-system.md`): the one
 * Markdown record of a change in a workspace, the work done under one mode.
 * Its front matter says how the mode was chosen, why, where the change
 * stands and what it cost; its body holds one section per step of the
 * line, headed by the step's name, a step its mode does not run saying
 * `none at <mode>`, so every mode keeps the whole record (J-93 S1). The record is parsed given the loaded modes definition,
 * so every mode, step and floor it names is checked against that
 * definition, and every kind's contract is read from it (the rulings Q1
 * to Q3 on S16b of the plan modes-records-recipes): a kind
 * whose record is a section writes one optional `## <kind>` section, before
 * the steps' sections when its mechanism is `open` and after them
 * otherwise; a kind whose record is a line writes one optional front-matter
 * line `<kind>: <text>`; a kind whose record is none writes nothing. A
 * record that parses but does not match its mode is not refused: the
 * mismatch is a finding `mismatches` derives.
 */

/** The workspace's ledger guide, which holds the skeleton of each mode and which every refusal of the skeleton cites. */
const LEDGER_GUIDE = ".greenline/ledger/README.md";

/** A change's id: its file name without `.md`, a real date and a slug. */
export type ChangeId = string & z.$brand<"ChangeId">;

/** How the mode was chosen: the owner named it, the owner accepted the agent's proposal, or the agent took it without waiting, under the `proceed` setting or the request's own words. */
export type Choice =
  | {
      readonly by: "owner";
      /** The mode the agent proposed, when the owner chose another. */
      readonly proposed?: ModeName;
    }
  | { readonly by: "accepted" }
  | { readonly by: "standing" };

/** Where the change stands: its state with its "next" line. A stopped change always names the action that resumes it; a finished one names none. */
export type Position =
  | { readonly state: "open"; readonly next?: string }
  | { readonly state: "stopped"; readonly next: string }
  | { readonly state: "done" }
  | { readonly state: "dropped" };

/**
 * A move to a higher mode during the work: the mode it was raised from, and
 * why. Where it went is the next raise's `from`, or the record's mode for
 * the last, so a raise cannot disagree with the mode.
 */
export interface Raise {
  readonly from: ModeName;
  readonly reason: string;
}

/** The agents and rounds the change used, stated at close. */
export interface Cost {
  readonly agents: number;
  readonly rounds: number;
}

/**
 * One fresh agent the line's depths started, as the record names it at
 * close: the step it served and the number its report takes, and whether it
 * was a restart of that agent, which counts as one more start.
 */
export interface Start {
  readonly step: string;
  readonly number: number;
  readonly restarted: boolean;
}

/** The plan a change belongs to, and the ticket within it; a ticket cannot be named without its plan. */
export interface Membership {
  readonly plan: string;
  readonly ticket?: string;
}

/** One section of the body: a step's heading, its text, and the third-level headings it holds, which count a looped step's rounds. */
export interface Section {
  readonly step: StepName;
  readonly text: string;
  readonly rounds: number;
}

/** The section of a kind whose record is a section, other than the steps' kind: the skill that ran and what it handed on. */
export interface KindSection {
  readonly kind: KindName;
  readonly text: string;
}

/** The front-matter line of a kind whose record is a line. */
export interface KindLine {
  readonly kind: KindName;
  readonly text: string;
}

/** One parsed change record. */
export interface ChangeRecord {
  readonly id: ChangeId;
  readonly mode: ModeName;
  readonly choice: Choice;
  readonly why: string;
  readonly position: Position;
  readonly floors: readonly FloorName[];
  readonly raises: readonly Raise[];
  /** The depth the review ran at. */
  readonly reviewed?: Depth["depth"];
  readonly belongs?: Membership;
  readonly cost?: Cost;
  /** Each fresh agent started, as the record names it, when it names any. */
  readonly starts?: readonly Start[];
  /** The owner's words for a push, a pull request or a merge, written at close; absent, no push. */
  readonly landing?: string;
  /** The owner's words for a rebase of the change's branch; absent, git's hooks refuse one. */
  readonly rebase?: string;
  readonly sections: readonly Section[];
  /** The sections of the other kinds whose record is a section, in the order the record holds them. */
  readonly kindSections: readonly KindSection[];
  /** The front-matter lines of the kinds whose record is a line, in the order the record holds them. */
  readonly kindLines: readonly KindLine[];
}

/** A record under construction, its optional fields added one statement at a time. */
type RecordDraft = { -readonly [K in keyof ChangeRecord]: ChangeRecord[K] };

/**
 * A change record read for its form alone: every mode, floor and heading as
 * the record states it, none checked against a modes definition. `status`
 * reads a finished record this way once the installation has moved on, so a
 * later definition never re-judges it.
 */
export interface RecordForm {
  readonly id: ChangeId;
  readonly mode: string;
  readonly choice:
    | { readonly by: "owner"; readonly proposed?: string }
    | { readonly by: "accepted" }
    | { readonly by: "standing" };
  readonly why: string;
  readonly position: Position;
  readonly floors: readonly string[];
  readonly raises: readonly { readonly from: string; readonly reason: string }[];
  readonly reviewed?: Depth["depth"];
  readonly belongs?: Membership;
  readonly cost?: Cost;
  readonly landing?: string;
  readonly rebase?: string;
  /** Each second-level heading outside a fence, in order, with its text and its rounds. */
  readonly sections: readonly {
    readonly heading: string;
    readonly text: string;
    readonly rounds: number;
  }[];
  /** Each front-matter field the record does not define, read as a kind's line: `<identifier>: <text>`. */
  readonly lines: readonly { readonly field: string; readonly text: string }[];
}

type FormDraft = { -readonly [K in keyof RecordForm]: RecordForm[K] };

const DEPTH_NAMES = [
  "none",
  "inline",
  "written",
  "independent",
  "looped",
] as const satisfies readonly Depth["depth"][];
/** A change id's pattern: a date and a slug; `changeId` also requires the date to be real. */
export const CHANGE_ID: RegExp = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAN_NAME = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TICKET_ID = /^[A-Za-z][A-Za-z0-9-]*$/;
const NONE = "none";
const text = z.string().min(1);

const declared = z
  .object({
    mode: text,
    choice: z.enum(["owner", "accepted", "standing"]),
    proposed: text.optional(),
    why: text,
    state: z.enum(["open", "stopped", "done", "dropped"]),
    next: text.optional(),
    floors: z.array(text).optional(),
    raises: z.array(z.object({ from: text, reason: text }).strict()).optional(),
    reviewed: z.enum(DEPTH_NAMES).optional(),
    plan: z.string().regex(PLAN_NAME).optional(),
    ticket: z.string().regex(TICKET_ID).optional(),
    agents: z.number().int().min(1).optional(),
    rounds: z.number().int().min(0).optional(),
    starts: z.array(text).optional(),
    landing: text.optional(),
    rebase: text.optional(),
  })
  .strict();

/** A real calendar date, so 2026-02-30 is refused. */
function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function changeId(fileName: string): ChangeId | undefined {
  const id = fileName.endsWith(".md") ? fileName.slice(0, -3) : "";
  const match = CHANGE_ID.exec(id);
  if (match === null) return undefined;
  // SAFETY: the pattern matched, so all three date groups are digit runs.
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  // SAFETY: the file name matched the id pattern and names a real date;
  // this is the one place a ChangeId is made.
  return isCalendarDate(year, month, day) ? (id as ChangeId) : undefined;
}

/**
 * Whether a name is a change id: a real date and a slug, the name a record's
 * file and its working folder carry.
 * @param name the name to test, without `.md`
 * @returns true when it is a change id
 */
export function isChangeId(name: string): boolean {
  return changeId(`${name}.md`) !== undefined;
}

function modeNamed(definition: ModesDefinition, name: string): Mode | undefined {
  return definition.modes.find((mode) => mode.name === name);
}

function rankOf(definition: ModesDefinition, name: ModeName): number {
  return definition.modes.findIndex((mode) => mode.name === name);
}

type Declared = z.infer<typeof declared>;

/** A record's id, front matter and body, before any name it states is checked. */
interface ReadRecord {
  readonly id: ChangeId;
  readonly value: Declared;
  /** The front-matter fields the record does not define, in order: each may be a kind's line. */
  readonly extra: readonly { readonly field: string; readonly value: FieldData }[];
  readonly body: string;
  readonly bodyLine: number;
}

/** The fields the record itself defines; any other field may only be a kind's line. */
const RECORD_FIELDS: ReadonlySet<string> = new Set<string>(declared.keyof().options);
const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
/** The "next" line's form: a step, a colon and a space, and the action that resumes it. */
const NEXT_LINE = /^([a-z][a-z0-9-]*): (\S.*)$/;
/** A start's form: a step, its number, and `restarted` for a restart. */
const START = /^([a-z][a-z0-9-]*) ([1-9]\d*)( restarted)?$/;

/** One second-level heading outside a fence, where it stands and the lines under it. */
interface Heading {
  readonly title: string;
  readonly at: string;
  readonly lines: readonly BodyLine[];
}

/** The file name, the front matter and the fields, refused at the first that fails. */
function readRecord(fileName: string, input: string): Result<ReadRecord, ContractParseFailed> {
  const id = changeId(fileName);
  if (id === undefined)
    return contractFailure(fileName, [
      { path: "", message: "a change record's file name is '<real date>-<slug>.md'" },
    ]);
  const document = parseFrontMatter(input, "a change record");
  if (document._tag === "err") return contractFailure(fileName, document.error.issues);
  const data = Object.entries(fieldData(document.value.fields));
  const parsed = declared.safeParse(
    Object.fromEntries(data.filter(([field]) => RECORD_FIELDS.has(field))),
  );
  if (!parsed.success) return contractFailure(fileName, issuesFrom(parsed.error.issues));
  return contractOk({
    id,
    value: parsed.data,
    extra: data
      .filter(([field]) => !RECORD_FIELDS.has(field))
      .map(([field, value]) => ({ field, value })),
    body: document.value.body,
    bodyLine: document.value.bodyLine,
  });
}

/** A line's text: one non-empty string, or undefined for any other value. */
function lineText(value: FieldData): string | undefined {
  const parsed = text.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The "next" line's form, checked whatever the definition: an open or
 * stopped record's line other than none is `<step>: <action>`.
 * @returns the step it names, or undefined when the record states none
 */
function nextLineIssue(value: Declared, issues: InvalidField[]): string | undefined {
  if (value.state !== "open" && value.state !== "stopped") return undefined;
  if (value.next === undefined || value.next === NONE) return undefined;
  const named = NEXT_LINE.exec(value.next);
  if (named === null) {
    issues.push({
      path: "next",
      message: `the "next" line is '<step>: <action>', or none (${LEDGER_GUIDE})`,
    });
    return undefined;
  }
  return named[1];
}

/**
 * The step a "next" line names: for an open or stopped record, the step
 * before the colon; none for a line of none, an absent one or a finished
 * record. The parse has checked its form.
 * @param position the record's position
 * @returns the step's name as the line states it, or undefined
 */
export function nextStep(position: Position): string | undefined {
  if (position.state !== "open" && position.state !== "stopped") return undefined;
  if (position.next === undefined || position.next === NONE) return undefined;
  return NEXT_LINE.exec(position.next)?.[1];
}

/** What the form requires whatever the definition: a proposal only under the owner's choice, a "next" line that fits the state, a ticket only with its plan, a cost stated whole. */
function formIssues(value: Declared, issues: InvalidField[]): void {
  if (value.proposed !== undefined && value.choice !== "owner")
    issues.push({ path: "proposed", message: "a proposal is stated only when the owner chose" });
  const finished = value.state === "done" || value.state === "dropped";
  if (value.state === "stopped" && (value.next === undefined || value.next === NONE))
    issues.push({ path: "next", message: "a stopped record names the action that resumes it" });
  if (finished && value.next !== undefined && value.next !== NONE)
    issues.push({ path: "next", message: `a ${value.state} record's "next" line is none` });
  if (value.ticket !== undefined && value.plan === undefined)
    issues.push({ path: "ticket", message: "a ticket is named only with its plan" });
  if ((value.agents === undefined) !== (value.rounds === undefined))
    issues.push({ path: "agents", message: "the cost states both agents and rounds" });
}

/**
 * The starts a record names, each read once: its form, `"<step> <n>"` or
 * `"<step> <n> restarted"` for a restart, and, given the definition, its
 * step; read for its form alone, as history is, without one.
 * @param value the record's front matter
 * @param issues where each refusal goes
 * @param definition the loaded modes, whose steps a start names; none for the form-only read
 * @returns the starts, undefined when the record names none
 */
function startsOf(
  value: Declared,
  issues: InvalidField[],
  definition?: ModesDefinition,
): readonly Start[] | undefined {
  if (value.starts === undefined) return undefined;
  const starts: Start[] = [];
  for (const [index, item] of value.starts.entries()) {
    const path = `starts[${index}]`;
    const form = START.exec(item);
    const step = form?.[1];
    if (form === null || step === undefined)
      issues.push({
        path,
        message: `a start is "<step> <n>", or "<step> <n> restarted" for a restart, and '${item}' is neither`,
      });
    else if (definition !== undefined && !definition.steps.some((entry) => entry.name === step))
      issues.push({
        path,
        message: `the start '${item}' names '${step}', which is not a step (${LEDGER_GUIDE})`,
      });
    else starts.push({ step, number: Number(form[2]), restarted: form[3] !== undefined });
  }
  return starts;
}

/** Every second-level heading outside a fence, in order; text before the first belongs to none. */
function headingsOf(body: string, firstLine: number): readonly Heading[] {
  const headings: { title: string; at: string; lines: BodyLine[] }[] = [];
  for (const [index, line] of bodyLines(body).entries()) {
    const heading = line.fenced ? null : /^## (.*)$/.exec(line.text);
    if (heading === null) headings.at(-1)?.lines.push(line);
    else
      headings.push({
        title: (heading[1] ?? "").trim(),
        at: `line ${firstLine + index}`,
        lines: [],
      });
  }
  return headings;
}

function textOf(heading: Heading): string {
  return heading.lines
    .map((line) => line.text)
    .join("\n")
    .trim();
}

/** The third-level headings outside a fence, which count a looped step's rounds. */
function roundsOf(heading: Heading): number {
  return heading.lines.filter((line) => !line.fenced && line.text.startsWith("### ")).length;
}

/** A kind other than the steps' whose record is a section: its section is the record's. */
function writesSection(kind: Kind): boolean {
  return kind.name !== STEP_KIND && kind.record === "section";
}

/** A kind whose section runs before the mode does: one chosen once, from the situation a request begins in. */
function sectionBeforeSteps(kind: Kind): boolean {
  return kind.mechanism === "open";
}

/** Why a heading that names a kind or nothing is not a section the record may hold. */
function headingRefusal(definition: ModesDefinition, title: string): string {
  const skeleton = `${LEDGER_GUIDE} gives the skeleton of each mode`;
  const kind = definition.kinds.find((entry) => entry.name === title);
  if (kind === undefined || kind.name === STEP_KIND)
    return `the heading '${title}' is not a step or a kind's section; ${skeleton}`;
  switch (kind.record) {
    case "none":
      return `the kind '${title}' writes nothing into the record; ${skeleton}`;
    case "line":
      return `the kind '${title}' writes a front-matter line '${title}: "<text>"', not a section; ${skeleton}`;
    case "section":
      return shouldNeverHappen("a kind that writes a section has one");
  }
}

/** The body's sections: the steps' and the other kinds'. */
interface BodySections {
  readonly sections: readonly Section[];
  readonly kindSections: readonly KindSection[];
}

/** The body's step sections and kind sections, refusing a heading that is neither, is repeated or is out of place. */
function sectionsOf(
  definition: ModesDefinition,
  headings: readonly Heading[],
  issues: InvalidField[],
): BodySections {
  const order = definition.steps.map((step) => step.name);
  const sections: Section[] = [];
  const kindSections: KindSection[] = [];
  // The section kind after the steps whose section the record has already reached, if any.
  let after: KindName | undefined;
  for (const heading of headings) {
    const kind = definition.kinds.find((entry) => entry.name === heading.title);
    if (kind !== undefined && writesSection(kind)) {
      if (kindSections.some((section) => section.kind === kind.name))
        issues.push({
          path: "",
          message: `${heading.at}: the kind '${kind.name}' has a section already`,
        });
      else if (sectionBeforeSteps(kind) && (sections.length > 0 || after !== undefined))
        issues.push({
          path: "",
          message: `${heading.at}: the section '${kind.name}' stands before the steps' sections`,
        });
      else {
        if (!sectionBeforeSteps(kind)) after = kind.name;
        kindSections.push({ kind: kind.name, text: textOf(heading) });
      }
      continue;
    }
    const step = order.find((name) => name === heading.title);
    if (step === undefined) {
      issues.push({
        path: "",
        message: `${heading.at}: ${headingRefusal(definition, heading.title)}`,
      });
      continue;
    }
    if (sections.some((section) => section.step === step)) {
      issues.push({ path: "", message: `${heading.at}: the step '${step}' has a section already` });
      continue;
    }
    if (after !== undefined) {
      issues.push({
        path: "",
        message: `${heading.at}: the step '${step}' comes after the section '${after}', which stands after the steps' sections`,
      });
      continue;
    }
    const previous = sections.at(-1);
    if (previous !== undefined && order.indexOf(previous.step) > order.indexOf(step)) {
      issues.push({
        path: "",
        message: `${heading.at}: the step '${step}' comes before '${previous.step}'`,
      });
      continue;
    }
    sections.push({ step, text: textOf(heading), rounds: roundsOf(heading) });
  }
  return { sections, kindSections };
}

/** The record's other front-matter fields, each the line of a kind whose record is a line. */
function kindLinesOf(
  definition: ModesDefinition,
  extra: ReadRecord["extra"],
  issues: InvalidField[],
): readonly KindLine[] {
  const lines: KindLine[] = [];
  for (const { field, value } of extra) {
    const kind = definition.kinds.find((entry) => entry.name === field);
    if (kind === undefined) {
      issues.push({ path: "", message: `Unrecognized key: "${field}"` });
      continue;
    }
    if (kind.record !== "line") {
      const writes = kind.record === "section" ? "a section" : "nothing into the record";
      issues.push({
        path: field,
        message: `the kind '${field}' writes ${writes}, not a front-matter line; ${LEDGER_GUIDE} gives the skeleton of each mode`,
      });
      continue;
    }
    const lineValue = lineText(value);
    if (lineValue === undefined)
      issues.push({ path: field, message: `the kind '${field}' writes one line of text` });
    else lines.push({ kind: kind.name, text: lineValue });
  }
  return lines;
}

function positionOf(value: Declared): Position {
  if (value.state === "stopped")
    return { state: "stopped", next: value.next ?? shouldNeverHappen("checked by formIssues") };
  if (value.state === "open")
    return value.next === undefined ? { state: "open" } : { state: "open", next: value.next };
  return { state: value.state };
}

function membershipOf(value: Declared): Membership | undefined {
  if (value.plan === undefined) return undefined;
  return value.ticket === undefined
    ? { plan: value.plan }
    : { plan: value.plan, ticket: value.ticket };
}

function costOf(value: Declared): Cost | undefined {
  return value.agents === undefined || value.rounds === undefined
    ? undefined
    : { agents: value.agents, rounds: value.rounds };
}

/**
 * Read a change record for its form alone, as `status` reads history: the
 * file name, the front-matter dialect, the fields, the state and its "next"
 * line, the shape of each raise and the heading grammar, with no repeated
 * heading. Nothing it names is checked against a modes definition, so a
 * record whose mode, step or floor a later definition renamed or removed
 * still reads, with the names it states.
 * @param fileName the record's file name, `<date>-<slug>.md`
 * @param input the record's text
 * @returns the record's form, or every issue found
 */
export function parseRecordForm(
  fileName: string,
  input: string,
): Result<RecordForm, ContractParseFailed> {
  const read = readRecord(fileName, input);
  if (read._tag === "err") return read;
  const { id, value } = read.value;
  const issues: InvalidField[] = [];
  formIssues(value, issues);
  nextLineIssue(value, issues);
  startsOf(value, issues);
  // A field the record does not define is read as a kind's line, whatever the definition holds.
  const lines: { field: string; text: string }[] = [];
  for (const { field, value: stated } of read.value.extra) {
    const lineValue = lineText(stated);
    if (IDENTIFIER.test(field) && lineValue !== undefined) lines.push({ field, text: lineValue });
    else
      issues.push({
        path: field,
        message: `the field '${field}' is not a record field, and a kind's line holds one text`,
      });
  }
  const sections: { heading: string; text: string; rounds: number }[] = [];
  for (const heading of headingsOf(read.value.body, read.value.bodyLine)) {
    if (sections.some((section) => section.heading === heading.title))
      issues.push({
        path: "",
        message: `${heading.at}: the heading '${heading.title}' has a section already`,
      });
    else
      sections.push({ heading: heading.title, text: textOf(heading), rounds: roundsOf(heading) });
  }
  if (issues.length > 0) return contractFailure(fileName, issues);
  const form: FormDraft = {
    id,
    mode: value.mode,
    choice:
      value.choice === "owner"
        ? value.proposed === undefined
          ? { by: "owner" }
          : { by: "owner", proposed: value.proposed }
        : { by: value.choice },
    why: value.why,
    position: positionOf(value),
    floors: value.floors ?? [],
    raises: (value.raises ?? []).map((raise) => ({ from: raise.from, reason: raise.reason })),
    sections,
    lines,
  };
  if (value.reviewed !== undefined) form.reviewed = value.reviewed;
  const belongs = membershipOf(value);
  if (belongs !== undefined) form.belongs = belongs;
  const cost = costOf(value);
  if (cost !== undefined) form.cost = cost;
  if (value.landing !== undefined) form.landing = value.landing;
  if (value.rebase !== undefined) form.rebase = value.rebase;
  return contractOk(form);
}

/**
 * Parse one change record given the loaded modes. It refuses an id that is
 * not a real date and a slug, an unknown field or value, a mode or floor the
 * definition does not hold, a proposal outside an owner's choice or equal to
 * the chosen mode, a stopped record with no "next" line, a finished record
 * whose "next" line is not none, a raise from a mode at or above the
 * record's mode or not above the raise before it, a ticket with no plan, a
 * cost with only one of its two counts, a start that is not a step and a
 * number or names no step of the definition, and a second-level heading
 * outside a fence that is not a step, is repeated or is out of order.
 * @param definition the loaded modes definition
 * @param fileName the record's file name, `<date>-<slug>.md`
 * @param input the record's text
 * @returns the record, or every issue found
 */
export function parseChangeRecord(
  definition: ModesDefinition,
  fileName: string,
  input: string,
): Result<ChangeRecord, ContractParseFailed> {
  const read = readRecord(fileName, input);
  if (read._tag === "err") return read;
  const { id, value } = read.value;
  const issues: InvalidField[] = [];
  const known = (path: string, name: string): ModeName | undefined => {
    const mode = modeNamed(definition, name);
    if (mode === undefined) issues.push({ path, message: `'${name}' is not a mode` });
    return mode?.name;
  };

  const mode = known("mode", value.mode);
  const proposed = value.proposed === undefined ? undefined : known("proposed", value.proposed);
  formIssues(value, issues);
  if (proposed !== undefined && proposed === mode)
    issues.push({
      path: "proposed",
      message: "the owner chose the proposed mode, which is the choice 'accepted'",
    });

  const floors: FloorName[] = [];
  for (const [index, name] of (value.floors ?? []).entries()) {
    const floor = definition.floors.find((entry) => entry.name === name);
    if (floor === undefined)
      issues.push({
        path: `floors[${index}]`,
        message: `'${name}' is not a floor; the floors are ${definition.floors.map((entry) => entry.name).join(", ")} (${LEDGER_GUIDE})`,
      });
    else floors.push(floor.name);
  }

  // The raises ascend strictly and all stand below the record's mode.
  const raises: Raise[] = [];
  for (const [index, raise] of (value.raises ?? []).entries()) {
    const from = known(`raises[${index}].from`, raise.from);
    if (from === undefined || mode === undefined) continue;
    const previous = raises.at(-1);
    if (rankOf(definition, from) >= rankOf(definition, mode))
      issues.push({
        path: `raises[${index}].from`,
        message: `a raise starts below the record's mode, and '${from}' is not below '${mode}'`,
      });
    else if (
      previous !== undefined &&
      rankOf(definition, from) <= rankOf(definition, previous.from)
    )
      issues.push({
        path: `raises[${index}].from`,
        message: `the raises ascend, and '${from}' is not above '${previous.from}'`,
      });
    else raises.push({ from, reason: raise.reason });
  }

  const named = nextLineIssue(value, issues);
  if (named !== undefined && !definition.steps.some((entry) => entry.name === named))
    issues.push({
      path: "next",
      message: `the "next" line names '${named}', which is not a step (${LEDGER_GUIDE})`,
    });
  const starts = startsOf(value, issues, definition);
  const kindLines = kindLinesOf(definition, read.value.extra, issues);
  const { sections, kindSections } = sectionsOf(
    definition,
    headingsOf(read.value.body, read.value.bodyLine),
    issues,
  );
  if (issues.length > 0 || mode === undefined) return contractFailure(fileName, issues);

  const choice: Choice =
    value.choice === "owner"
      ? proposed === undefined
        ? { by: "owner" }
        : { by: "owner", proposed }
      : { by: value.choice };
  const record: RecordDraft = {
    id,
    mode,
    choice,
    why: value.why,
    position: positionOf(value),
    floors,
    raises,
    sections,
    kindSections,
    kindLines,
  };
  if (value.reviewed !== undefined) record.reviewed = value.reviewed;
  const belongs = membershipOf(value);
  if (belongs !== undefined) record.belongs = belongs;
  const cost = costOf(value);
  if (cost !== undefined) record.cost = cost;
  if (starts !== undefined) record.starts = starts;
  if (value.landing !== undefined) record.landing = value.landing;
  if (value.rebase !== undefined) record.rebase = value.rebase;
  return contractOk(record);
}

/** What a derivation needs beyond the record: whether the record's plan has a tickets file. */
export interface RecordContext {
  /**
   * Whether the plan the record names has a tickets file, always stated: for a
   * record that names a plan and no ticket, `present` makes it the planning
   * record. A record outside a plan states `absent`.
   */
  readonly ticketsFile: "present" | "absent";
}

/** Which record holds steps when the work is split: a ticket's, the planning record, or a record outside any split. */
function splitPart(record: ChangeRecord, context: RecordContext): "ticket" | "plan" | "whole" {
  if (record.belongs === undefined) return "whole";
  if (record.belongs.ticket !== undefined) return "ticket";
  return context.ticketsFile === "present" ? "plan" : "whole";
}

function modeOf(definition: ModesDefinition, record: ChangeRecord): Mode {
  return (
    modeNamed(definition, record.mode) ??
    shouldNeverHappen(`the record's mode '${record.mode}' is not in the definition`)
  );
}

/**
 * The record that holds a step instead of this one when the work is split:
 * a ticket's record leaves a `plan` step to the planning record, and the
 * planning record leaves a `ticket` step to its tickets' records.
 */
function heldElsewhere(
  definition: ModesDefinition,
  record: ChangeRecord,
  context: RecordContext,
  step: StepName,
): "plan" | "ticket" | undefined {
  const part = splitPart(record, context);
  // The other record's share: what a ticket's record leaves to the plan's, and the reverse.
  const holder = part === "ticket" ? "plan" : part === "plan" ? "ticket" : undefined;
  const declared =
    definition.steps.find((entry) => entry.name === step) ??
    shouldNeverHappen(`the step '${step}' is not in the definition`);
  return holder !== undefined && declared.whenSplit === holder ? holder : undefined;
}

/**
 * The sections a record holds: one for every step of the line, a step its
 * mode does not run included, since every mode keeps the whole record, and,
 * when the work is split into tickets, only the steps the definition gives
 * that record: a ticket's record omits each step whose `whenSplit` is
 * `plan`, and the planning record each step whose `whenSplit` is `ticket`.
 * @param definition the definition the record was parsed with
 * @param record the record
 * @param context whether the record's plan has a tickets file
 * @returns the sections, in step order, each with its mode's depth
 */
export function requiredSections(
  definition: ModesDefinition,
  record: ChangeRecord,
  context: RecordContext,
): readonly RecordSection[] {
  return recordSections(definition, modeOf(definition, record)).filter(
    (section) => heldElsewhere(definition, record, context, section.step) === undefined,
  );
}

/**
 * Why a record does not run a step: its mode gives the step the depth none,
 * or the work is split and the step belongs to the other record (a ticket's
 * record leaves it to the plan's record, the planning record to its
 * tickets' records).
 */
export type Unrequired =
  | { readonly by: "mode" }
  | { readonly by: "split"; readonly holder: "plan" | "ticket" };

/** Why this record does not run the step, or undefined when it does. */
function unrunBecause(
  definition: ModesDefinition,
  record: ChangeRecord,
  context: RecordContext,
  step: StepName,
): Unrequired | undefined {
  const holder = heldElsewhere(definition, record, context, step);
  if (holder !== undefined) return { by: "split", holder };
  return depthOf(modeOf(definition, record), step).depth === "none" ? { by: "mode" } : undefined;
}

/** The line a skipped step's section holds, whichever mode it names, as a raise from a mode that skipped the step leaves it. */
const NONE_LINE = /^none at [a-z][a-z0-9-]*$/;

/** A run step's section with its work in it: present, not empty, and not the line of a mode that skipped it. */
function written(record: ChangeRecord, step: StepName): Section | undefined {
  return record.sections.find(
    (section) => section.step === step && section.text.length > 0 && !NONE_LINE.test(section.text),
  );
}

/**
 * The step reached: the first section of a step the record runs that is
 * empty, absent or still the line of a mode that skipped it.
 * @param definition the definition the record was parsed with
 * @param record the record
 * @param context whether the record's plan has a tickets file
 * @returns that step, or undefined when every run step's section is written
 */
export function stepReached(
  definition: ModesDefinition,
  record: ChangeRecord,
  context: RecordContext,
): StepName | undefined {
  return requiredSections(definition, record, context).find(
    (section) => section.depth.depth !== "none" && written(record, section.step) === undefined,
  )?.step;
}

/**
 * The step the record is in, as `greenline status` reports it and
 * `greenline check` records it when no `--step` is given: the step its "next"
 * line names, and for a record with none the step reached ({@link stepReached}).
 * @param definition the definition the record was parsed with
 * @param record the record
 * @param context whether the record's plan has a tickets file
 * @returns that step, or undefined when the "next" line names none and every run step's section is written
 */
export function currentStep(
  definition: ModesDefinition,
  record: ChangeRecord,
  context: RecordContext,
): StepName | undefined {
  const named = nextStep(record.position);
  return (
    definition.steps.find((entry) => entry.name === named)?.name ??
    stepReached(definition, record, context)
  );
}

/** One way a record fails to match its mode. */
export type Mismatch =
  | {
      readonly kind: "unrequired-section";
      readonly step: StepName;
      readonly holder: "plan" | "ticket";
    }
  | { readonly kind: "unrun-section"; readonly step: StepName; readonly line: string }
  | { readonly kind: "missing-section"; readonly step: StepName }
  | { readonly kind: "missing-none-line"; readonly step: StepName; readonly line: string }
  | { readonly kind: "next-unrequired"; readonly step: StepName; readonly why: Unrequired }
  | { readonly kind: "inline-over-one-line"; readonly step: StepName }
  | {
      readonly kind: "rounds-over-cap";
      readonly step: StepName;
      readonly rounds: number;
      readonly cap: number;
    }
  | { readonly kind: "below-floor"; readonly floor: FloorName }
  | { readonly kind: "over-budget"; readonly cost: Cost; readonly budget: Cost };

/**
 * Each way a record fails to match its mode: a section the other record of
 * a split holds, a section of a step the mode does not run that is not the
 * one line `none at <mode>`, a run step's section missing from a done
 * record, a done record's skipped step with no section saying so, an inline
 * section of more than one line, a looped section with more rounds than its cap, a
 * floor the mode does not meet when the agent took the mode without waiting
 * (`choice: standing`), under the `proceed` setting or the request's own
 * words, and a cost over the mode's budget: the agents and the rounds the
 * definition derives for the mode ({@link agentsAtMost}, {@link roundsAtMost}).
 * @param definition the definition the record was parsed with
 * @param record the record
 * @param context whether the record's plan has a tickets file
 * @returns the mismatches, none for a record that matches
 */
export function mismatches(
  definition: ModesDefinition,
  record: ChangeRecord,
  context: RecordContext,
): readonly Mismatch[] {
  const mode = modeOf(definition, record);
  const required = requiredSections(definition, record, context);
  const found: Mismatch[] = [];
  const line = noneLine(mode);
  // A raise leaves the line of the mode it was raised from on a step neither mode runs, and that line stands.
  const lines = new Set([line, ...record.raises.map((raise) => noneLine({ name: raise.from }))]);
  for (const section of record.sections) {
    const wanted = required.find((entry) => entry.step === section.step);
    if (wanted === undefined) {
      found.push({
        kind: "unrequired-section",
        step: section.step,
        holder:
          heldElsewhere(definition, record, context, section.step) ??
          shouldNeverHappen("a step outside the required sections is held elsewhere"),
      });
      continue;
    }
    // A step the mode skips keeps its section: the one line saying so, and nothing else.
    if (wanted.depth.depth === "none") {
      if (!lines.has(section.text)) found.push({ kind: "unrun-section", step: section.step, line });
      continue;
    }
    if (wanted.depth.depth === "inline" && section.text.includes("\n"))
      found.push({ kind: "inline-over-one-line", step: section.step });
    if (wanted.depth.depth === "looped" && section.rounds > wanted.depth.rounds)
      found.push({
        kind: "rounds-over-cap",
        step: section.step,
        rounds: section.rounds,
        cap: wanted.depth.rounds,
      });
  }
  if (record.position.state === "done")
    for (const section of required)
      if (section.depth.depth === "none") {
        if (!record.sections.some((entry) => entry.step === section.step))
          found.push({ kind: "missing-none-line", step: section.step, line });
      } else if (written(record, section.step) === undefined)
        found.push({ kind: "missing-section", step: section.step });
  // The parse checked that the "next" line names a step of the definition.
  const next = nextStep(record.position);
  const resumes = definition.steps.find((entry) => entry.name === next)?.name;
  const unrun =
    resumes === undefined ? undefined : unrunBecause(definition, record, context, resumes);
  if (resumes !== undefined && unrun !== undefined)
    found.push({ kind: "next-unrequired", step: resumes, why: unrun });
  // The owner's choice is final, an acceptance included; only a mode the
  // agent took without waiting (`choice: standing`), under the `proceed`
  // setting or the request's own words, answers for a floor.
  if (record.choice.by === "standing")
    for (const name of record.floors) {
      const floor =
        definition.floors.find((entry) => entry.name === name) ??
        shouldNeverHappen(`the record's floor '${name}' is not in the definition`);
      if (!meetsFloor(definition, mode, floor)) found.push({ kind: "below-floor", floor: name });
    }
  // The record's own mode's budget, the builder counted in the agents as the
  // cost counts it; a planning record and each ticket's are judged apart,
  // never summed.
  if (record.cost !== undefined) {
    const budget: Cost = {
      agents: agentsAtMost(definition, mode),
      rounds: roundsAtMost(definition, mode),
    };
    if (record.cost.agents > budget.agents || record.cost.rounds > budget.rounds)
      found.push({ kind: "over-budget", cost: record.cost, budget });
  }
  return found;
}

function counted(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

/** What a step's section holds at the depth its mode gives it; a skipped step's is its one line, written as it stands. */
function sectionPlaceholder(value: RecordSection["depth"], mode: Mode): string {
  switch (value.depth) {
    case "none":
      return noneLine(mode);
    case "inline":
      return "<one line by the builder>";
    case "written":
      return "<the builder's section>";
    case "independent":
      return `<the reports of ${counted(value.agents, "fresh agent")}, each cited by a link into the change's folder>`;
    case "looped":
      return `<one "### Round <n>" sub-heading per round, up to ${value.rounds}, each citing a fresh agent's report>`;
  }
}

/** One optional section of a kind whose record is a section. */
function kindSection(kind: Kind): string {
  const ran = sectionBeforeSteps(kind) ? "began the change" : "ran";
  return [
    `## ${kind.name}`,
    "",
    `<the ${kind.name} skill that ${ran}, by name, and what it handed on; leave the section out when none did>`,
    "",
  ].join("\n");
}

/**
 * The skeleton of a record of one mode, from the definition's kinds and
 * their contracts (the ruling Q1 on S16b): the front matter a
 * record opens with, a line for each kind whose record is a line; then a
 * section for each other kind whose record is a section and whose mechanism
 * is `open`; one section per step of the line, each saying what its depth
 * asks, a step the mode does not run holding `none at <mode>`; and a
 * section for each remaining kind whose record is a section. A kind whose
 * record is none adds nothing.
 * @param definition the loaded modes definition
 * @param mode a mode of that definition
 * @returns the skeleton as Markdown, ending in a newline
 */
export function renderRecordSkeleton(definition: ModesDefinition, mode: Mode): string {
  const lines = definition.kinds
    .filter((kind) => kind.record === "line")
    .map(
      (kind) =>
        `${kind.name}: "<one line by the ${kind.name} skill that ran; leave the line out when none did>"`,
    );
  const kinds = definition.kinds.filter(writesSection);
  const steps = recordSections(definition, mode).map((section) =>
    [`## ${section.step}`, "", sectionPlaceholder(section.depth, mode), ""].join("\n"),
  );
  return [
    [
      "---",
      `mode: ${mode.name}`,
      "choice: <owner, accepted or standing>",
      'why: "<why the change exists>"',
      "state: open",
      'next: "<step>: <the action that resumes it>"',
      ...lines,
      "---",
      "",
    ].join("\n"),
    ...kinds.filter(sectionBeforeSteps).map(kindSection),
    ...steps,
    ...kinds.filter((kind) => !sectionBeforeSteps(kind)).map(kindSection),
  ].join("\n");
}
