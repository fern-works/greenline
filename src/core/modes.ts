import { z } from "zod";
import { casesHandled, shouldNeverHappen } from "../commons/defect.ts";
import type { Result } from "../commons/result.ts";
import {
  checkContractVersion,
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";

/**
 * The modes (`corpus/runtime/modes.json`, `workshop/components/modes.md`):
 * the kinds of skill the loop runs, the steps a change can run, the three
 * promises of time and assurance, the budget of each in rounds and the
 * words an agent reads, the agents each may start derived from its depths,
 * and the floors that raise a proposal. Every kind, step, mode, budget and
 * floor is data this module parses once at the boundary; only the five
 * depth names and the mechanisms and contracts a kind is made of are code.
 * A mode's steps are an object keyed by step, so their order is the definition's step order
 * and cannot be written out of it, and a looped depth carries its rounds,
 * so an uncapped loop cannot be written. Names are checked against the
 * loaded definition, never against literals, save the one kind the steps
 * list names, {@link STEP_KIND}.
 */

/**
 * The definition's schema version; an earlier one is refused by its
 * version, with no converter. Version 3 gave each mode its words budget;
 * version 4 dropped each mode's stated agents, which {@link agentsAtMost}
 * derives from its depths, and says of each step whether its findings take
 * a fix pass; version 5 drops a step's trial mark, since every step runs
 * where its mode reaches it (J-93 S1: anticipate became careful's premise
 * review).
 */
const MODES_SCHEMA_VERSION = 5 as const;

/** A kind's name, such as the corpus's step, start or habit. */
export type KindName = string & z.$brand<"KindName">;

/**
 * The kind the steps list names: every entry of `steps` is a slot of this
 * kind, so the definition must declare it, placed on the line.
 */
export const STEP_KIND = "step";

/**
 * How the loop runs a kind's skills: `reach`, where the mode reaches the
 * skill's place on the line; `open`, chosen once from the situation a
 * request begins in; `arise`, loaded when its situation arises at any step.
 */
const MECHANISMS = ["reach", "open", "arise"] as const;

/** What a kind's skill writes into the change record: a section, a line, or nothing of its own. */
const RECORDS = ["section", "line", "none"] as const;

/** Where a kind's skill stands: `ordered`, at a place on the line; `beside`, off it, each skill its own slot. */
const PLACES = ["ordered", "beside"] as const;

/** Whether a kind's skill spends the mode's agents or rounds (`counts`) or none of them (`free`). */
const BUDGETS = ["counts", "free"] as const;

/**
 * One kind of roster skill: a trigger the loop runs and a contract with it
 * (`docs/VOCABULARY.md`, "Skill kind"), and the sentence the block prints
 * saying when the kind applies.
 */
export interface Kind {
  readonly name: KindName;
  readonly mechanism: (typeof MECHANISMS)[number];
  readonly record: (typeof RECORDS)[number];
  readonly place: (typeof PLACES)[number];
  readonly budget: (typeof BUDGETS)[number];
  readonly when: string;
}

/** A step's name, which is also the name of the skill that serves it. */
export type StepName = string & z.$brand<"StepName">;

/** A mode's name, such as the corpus's quick, regular or careful. */
export type ModeName = string & z.$brand<"ModeName">;

/** A floor's name: the risk it stands for, as an identifier. */
export type FloorName = string & z.$brand<"FloorName">;

/**
 * How a mode runs a step: none skips it; inline, the builder does it in one
 * line; written, the builder writes its section; independent, fresh agents
 * do it and the record cites their reports; looped, independent and repeated
 * until clean, up to its rounds.
 */
export type Depth =
  | { readonly depth: "none" }
  | { readonly depth: "inline" }
  | { readonly depth: "written" }
  | { readonly depth: "independent"; readonly agents: number }
  | { readonly depth: "looped"; readonly rounds: number };

/** One ordered step, run wherever a mode gives it a depth other than none. */
export interface Step {
  readonly name: StepName;
  /** Which record holds the step when the work is split into tickets: the plan's, each ticket's, or both. */
  readonly whenSplit: "plan" | "ticket" | "both";
  /** Whether the step's findings go back to the build step in a fix pass, which spends the mode's fix rounds outside a loop. */
  readonly fixPass: boolean;
}

/** One mode: its promise, the request it suits, its budget and the depth of every step. */
export interface Mode {
  readonly name: ModeName;
  readonly promise: string;
  readonly typicalRequest: string;
  /**
   * The fix passes after each step that takes one, outside a loop, counted
   * per step; a looped step's rounds include its own.
   */
  readonly fixRounds: number;
  /**
   * The most words an agent may have to read at the mode: the installed
   * block and the `SKILL.md` of each step the mode runs, as the corpus
   * instrument's `budget` counts them; a whole number, at least 1.
   */
  readonly budget: { readonly words: number };
  readonly steps: Readonly<Record<StepName, Depth>>;
}

/** A risk that makes the agent's proposal at least the mode it names. */
export interface Floor {
  readonly name: FloorName;
  readonly risk: string;
  readonly mode: ModeName;
}

/** The whole definition: its kinds, steps in order, modes from least to most assurance, and the floors. */
export interface ModesDefinition {
  readonly schemaVersion: typeof MODES_SCHEMA_VERSION;
  readonly kinds: readonly Kind[];
  readonly steps: readonly Step[];
  readonly modes: readonly Mode[];
  readonly floors: readonly Floor[];
}

/**
 * One section a record of a mode holds: every step of the line, at the depth
 * the mode gives it; a step at none keeps its section, which says so, since
 * every mode keeps the whole record for the audit (J-93 S1).
 */
export interface RecordSection {
  readonly step: StepName;
  readonly depth: Depth;
}

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
const text = z.string().min(1);
const count = z.number().int().min(1);
const stepName = z.string().regex(IDENTIFIER).brand<"StepName">();
const modeName = z.string().regex(IDENTIFIER).brand<"ModeName">();
const depth = z.discriminatedUnion("depth", [
  z.object({ depth: z.literal("none") }).strict(),
  z.object({ depth: z.literal("inline") }).strict(),
  z.object({ depth: z.literal("written") }).strict(),
  z.object({ depth: z.literal("independent"), agents: count }).strict(),
  z.object({ depth: z.literal("looped"), rounds: count }).strict(),
]);
/** One closed set of a kind's fields, refused with the set named. */
function closedSet<const Values extends readonly [string, ...string[]]>(
  values: Values,
  noun: string,
) {
  const listed = `${values.slice(0, -1).join(", ")} or ${values.at(-1) ?? ""}`;
  return z.enum(values, {
    error: (issue) => `${noun} is ${listed}, not '${String(issue.input)}'`,
  });
}
const kind = z
  .object({
    name: z.string().regex(IDENTIFIER).brand<"KindName">(),
    mechanism: closedSet(MECHANISMS, "a mechanism"),
    record: closedSet(RECORDS, "a kind's record"),
    place: closedSet(PLACES, "a kind's place"),
    budget: closedSet(BUDGETS, "a kind's budget"),
    when: text,
  })
  .strict();
const declared = z
  .object({
    schemaVersion: z.literal(MODES_SCHEMA_VERSION),
    kinds: z.array(kind, { error: "the modes definition declares its kinds" }),
    steps: z.array(
      z
        .object({
          name: stepName,
          whenSplit: z.enum(["plan", "ticket", "both"]),
          fixPass: z.boolean(),
        })
        .strict(),
    ),
    modes: z.array(
      z
        .object({
          name: modeName,
          promise: text,
          typicalRequest: text,
          fixRounds: z.number().int().min(0),
          // Checked whole in the cross-references, so a refusal names its mode.
          budget: z.object({ words: z.number().optional() }).strict().optional(),
          steps: z.record(stepName, depth),
        })
        .strict(),
    ),
    floors: z.array(
      z
        .object({
          name: z.string().regex(IDENTIFIER).brand<"FloorName">(),
          risk: text,
          mode: modeName,
        })
        .strict(),
    ),
  })
  .strict();

interface CrossReferenceIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

function duplicateIssues(
  names: readonly string[],
  list: string,
  noun: string,
): readonly CrossReferenceIssue[] {
  return names.flatMap((name, index) =>
    names.indexOf(name) < index
      ? [{ path: [list, index, "name"], message: `duplicate ${noun} '${name}'` }]
      : [],
  );
}

/** The kind the steps list names, declared and placed on the line. */
function stepKindIssues(kinds: readonly z.infer<typeof kind>[]): readonly CrossReferenceIssue[] {
  const index = kinds.findIndex((declaredKind) => declaredKind.name === STEP_KIND);
  if (index === -1)
    return [
      {
        path: ["kinds"],
        message: `the steps list names the kind '${STEP_KIND}', which the definition does not declare`,
      },
    ];
  return kinds[index]?.place === "ordered"
    ? []
    : [
        {
          path: ["kinds", index, "place"],
          message: `the kind '${STEP_KIND}' is the steps list's, so its place is ordered`,
        },
      ];
}

/** A mode's words budget, refused by the mode's name when it is missing or not a whole number of at least 1. */
function wordsBudgetIssues(
  mode: z.infer<typeof declared>["modes"][number],
  index: number,
): readonly CrossReferenceIssue[] {
  const words = mode.budget?.words;
  if (words === undefined)
    return [
      {
        path: mode.budget === undefined ? ["modes", index] : ["modes", index, "budget"],
        message: `mode '${mode.name}' states no words budget, budget.words`,
      },
    ];
  return Number.isInteger(words) && words >= 1
    ? []
    : [
        {
          path: ["modes", index, "budget", "words"],
          message: `mode '${mode.name}' states a words budget of ${words}; a words budget is a whole number of words, at least 1`,
        },
      ];
}

/** The refusals one field cannot see: names unique, the step kind declared, every mode's steps exactly the definition's, budgets that fit, floors that name a mode. */
function crossReferenceIssues(value: z.infer<typeof declared>): readonly CrossReferenceIssue[] {
  const issues: CrossReferenceIssue[] = [
    ...duplicateIssues(
      value.kinds.map((declaredKind) => declaredKind.name),
      "kinds",
      "kind",
    ),
    ...stepKindIssues(value.kinds),
    ...duplicateIssues(
      value.steps.map((step) => step.name),
      "steps",
      "step",
    ),
    ...duplicateIssues(
      value.modes.map((mode) => mode.name),
      "modes",
      "mode",
    ),
    ...duplicateIssues(
      value.floors.map((floor) => floor.name),
      "floors",
      "floor",
    ),
  ];
  const steps = new Set<string>(value.steps.map((step) => step.name));
  for (const [index, mode] of value.modes.entries()) {
    issues.push(...wordsBudgetIssues(mode, index));
    for (const step of value.steps)
      if (!Object.hasOwn(mode.steps, step.name))
        issues.push({
          path: ["modes", index, "steps"],
          message: `mode '${mode.name}' gives no depth for the step '${step.name}'`,
        });
    for (const step of Object.keys(mode.steps)) {
      if (!steps.has(step))
        issues.push({
          path: ["modes", index, "steps", step],
          message: `mode '${mode.name}' names '${step}', which is not a step`,
        });
    }
  }
  const modes = new Set<string>(value.modes.map((mode) => mode.name));
  for (const [index, floor] of value.floors.entries())
    if (!modes.has(floor.mode))
      issues.push({
        path: ["floors", index, "mode"],
        message: `floor '${floor.name}' names '${floor.mode}', which is not a mode`,
      });
  return issues;
}

/**
 * The definition's schema, cross-references included. The installation
 * payload embeds it, so the payload's modes pass the same refusals as the
 * corpus file.
 */
export const modesDefinition: z.ZodType<ModesDefinition> = declared
  .superRefine((value, context) => {
    for (const issue of crossReferenceIssues(value))
      context.addIssue({ code: "custom", path: [...issue.path], message: issue.message });
  })
  // Reached only when every refusal passed, so every mode states its words budget.
  .transform((value) => ({
    ...value,
    modes: value.modes.map(({ budget, ...mode }) => ({
      ...mode,
      budget: {
        words:
          budget?.words ?? shouldNeverHappen(`mode '${mode.name}' passed with no words budget`),
      },
    })),
  }));

/**
 * Parse the definition's text: refuse invalid JSON, a schema version other
 * than this module's, before any field is read; no kinds, a mechanism or a
 * contract outside the loop's closed sets, and no step kind; an unknown
 * field, a mode's stated agents and a step's trial mark among them, a step that does not say
 * whether it takes a fix pass, a missing or unknown step in a mode, an
 * unknown depth, an agent or round count below one, a mode without a words
 * budget or with one that is not a whole number of at least 1, named by its
 * mode, duplicate names and a floor that names no mode.
 * @param input the file's text
 * @param source where the text came from, for the refusal
 * @returns the definition, or every issue found
 */
export function parseModes(
  input: string,
  source: string,
): Result<ModesDefinition, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [
      { path: "", message: "the modes definition is not valid JSON" },
    ]);
  const versionIssue = checkContractVersion(raw, "modes definition", MODES_SCHEMA_VERSION);
  if (versionIssue !== undefined) return contractFailure(source, [versionIssue]);
  const parsed = modesDefinition.safeParse(raw);
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/**
 * A kind of the definition, by its name.
 * @param definition the loaded definition
 * @param name a kind's name, as a manifest skill or a placement states it
 * @returns the kind, or undefined when the definition declares none of that name
 */
export function kindNamed(definition: ModesDefinition, name: string): Kind | undefined {
  return definition.kinds.find((declaredKind) => declaredKind.name === name);
}

/**
 * The depth at which a mode runs a step.
 * @param mode a mode of the definition the step belongs to
 * @param step a step of that definition
 * @returns the stated depth
 * @throws when the step belongs to another definition, a defect the parse rules out within one
 */
export function depthOf(mode: Mode, step: StepName): Depth {
  return (
    mode.steps[step] ??
    shouldNeverHappen(`mode '${mode.name}' holds no depth for the step '${step}'`)
  );
}

/**
 * The sections a record of a mode holds: one per step of the line, in the
 * definition's order, each at the depth the mode gives it, none included.
 * @param definition the definition the mode belongs to
 * @param mode the record's mode
 * @returns one section per step
 */
export function recordSections(definition: ModesDefinition, mode: Mode): readonly RecordSection[] {
  return definition.steps.map((step) => ({ step: step.name, depth: depthOf(mode, step.name) }));
}

/**
 * The one line a step a mode does not run holds in that mode's record:
 * `none at <mode>`, so the record keeps every section and says which the
 * mode skipped.
 * @param mode the record's mode
 * @returns the line
 */
export function noneLine(mode: Pick<Mode, "name">): string {
  return `none at ${mode.name}`;
}

/**
 * The fresh agents a depth starts: an independent depth's agents, a looped
 * depth's rounds, none otherwise.
 * @param value the depth
 * @returns the number, 0 where the depth starts none
 */
export function freshAgents(value: Depth): number {
  switch (value.depth) {
    case "none":
    case "inline":
    case "written":
      return 0;
    case "independent":
      return value.agents;
    case "looped":
      return value.rounds;
    default:
      return casesHandled(value);
  }
}

/**
 * The most agents a mode may start, derived from its depths: one, the
 * builder, plus each independent step's agents plus each looped step's
 * rounds, every round one fresh agent.
 * @param definition the definition the mode belongs to
 * @param mode the mode
 * @returns the number, at least 1
 */
export function agentsAtMost(definition: ModesDefinition, mode: Mode): number {
  return definition.steps.reduce((total, step) => total + freshAgents(depthOf(mode, step.name)), 1);
}

/**
 * The most rounds a mode may run: its fix rounds once for each step that
 * takes a fix pass and runs outside a loop, plus each looped step's rounds,
 * which include their fixes.
 * @param definition the definition the mode belongs to
 * @param mode the mode
 * @returns the number, at least 0
 */
export function roundsAtMost(definition: ModesDefinition, mode: Mode): number {
  return definition.steps.reduce((total, step) => {
    const stated = depthOf(mode, step.name);
    if (stated.depth === "looped") return total + stated.rounds;
    if (stated.depth === "none" || !step.fixPass) return total;
    return total + mode.fixRounds;
  }, 0);
}

function rankOf(definition: ModesDefinition, name: ModeName): number {
  const rank = definition.modes.findIndex((mode) => mode.name === name);
  return rank === -1 ? shouldNeverHappen(`the definition holds no mode '${name}'`) : rank;
}

/**
 * Whether a mode meets a floor: it stands at or above the floor's mode in
 * the definition's order.
 * @param definition the definition both belong to
 * @param mode the mode proposed or chosen
 * @param floor the floor found
 * @returns true when the mode is the floor's mode or a later one
 * @throws when either names a mode the definition does not hold, a defect the parse rules out within one
 */
export function meetsFloor(definition: ModesDefinition, mode: Mode, floor: Floor): boolean {
  return rankOf(definition, mode.name) >= rankOf(definition, floor.mode);
}

function counted(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

function depthCell(value: Depth): string {
  switch (value.depth) {
    case "none":
    case "inline":
    case "written":
      return value.depth;
    case "independent":
      return `independent, ${counted(value.agents, "agent")}`;
    case "looped":
      return `looped, up to ${counted(value.rounds, "round")}`;
    default:
      return casesHandled(value);
  }
}

/** Names joined as a list reads: a, b and c. */
function namesInWords(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The mode table an agent reads to pick a mode: each mode's promise,
 * typical request and agents, derived from its depths, the depth of every
 * step, and the fix rounds per step, with one line on the agents, the fix
 * passes and, where a mode loops, the loops.
 * @param definition the loaded definition
 * @returns the table as Markdown, ending in a newline
 */
export function renderModeTable(definition: ModesDefinition): string {
  const { modes } = definition;
  const fixing = definition.steps.filter((step) => step.fixPass).map((step) => step.name);
  // The loop's sentence is printed only where a mode loops, so the table never explains a depth no mode uses.
  const loops = modes.some((mode) => Object.values(mode.steps).some((d) => d.depth === "looped"));
  const fixes =
    fixing.length === 0
      ? ""
      : `${loops ? "; outside a loop, " : "; "}${namesInWords(fixing)} ${fixing.length === 1 ? "takes" : "each take"} the mode's fix rounds`;
  const row = (label: string, cells: readonly string[]): string =>
    `| ${[label, ...cells].join(" | ")} |`;
  return [
    row(
      "Mode",
      modes.map((mode) => mode.name),
    ),
    row(
      "---",
      modes.map(() => "---"),
    ),
    row(
      "Promise",
      modes.map((mode) => mode.promise),
    ),
    row(
      "Typical request",
      modes.map((mode) => mode.typicalRequest),
    ),
    row(
      "Agents, at most",
      modes.map((mode) => String(agentsAtMost(definition, mode))),
    ),
    ...definition.steps.map((step) =>
      row(
        step.name,
        modes.map((mode) => depthCell(depthOf(mode, step.name))),
      ),
    ),
    row(
      "Fix rounds, per step",
      modes.map((mode) => String(mode.fixRounds)),
    ),
    "",
    loops
      ? `The agents count the builder. A looped step repeats until clean, and its rounds include its fixes${fixes}.`
      : `The agents count the builder${fixes}.`,
    "",
  ].join("\n");
}
