import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import { joined } from "./record-lines.ts";
import type { LoadSeen } from "./skill-loads.ts";

/**
 * The skills a change owes (J-134 S3, widened by J-176 S1; the register's
 * row of 2026-11-05, "The keeper over the oracle"): a skill's invocation
 * cases are trigger rows it carries as data, each in its recipe and
 * rendered by the corpus instrument into `corpus/runtime/triggers.json`,
 * which the installation carries. A row names the request's words, the
 * file classes a change touches, the steps and the modes it applies at,
 * its weight and whether it owes a part read, the skill's front, or a
 * whole read. Status prints the skills a change owes in weight order
 * within the mode's reading budget, the hooks' facts and the record's
 * words its inputs, and the record lint holds a done change to a load of
 * each habit and start it owed, or the owner's waiver. Widening a skill's
 * cases adds rows and no words to the block. The line is a prompt the
 * agent reads; the load is the agent's choice. Pure.
 */

/** The triggers file's schema identifier. */
export const TRIGGERS_SCHEMA = "greenline.triggers/v1";

/** The classes a touched file is read as, from its path alone. */
export const FILE_CLASSES = [
  "test",
  "schema",
  "migration",
  "page",
  "module",
  "secret",
  "contract",
  "readme",
  "benchmark",
] as const;

/** One class of touched file. */
export type FileClass = (typeof FILE_CLASSES)[number];

/** A read a row owes: the skill's front, its `SKILL.md`, or the skill whole with its pages. */
export type OwedRead = "part" | "whole";

/** One trigger row: the conditions it holds on, all of them, and what it owes. */
export interface TriggerRow {
  /** The request's words, any of them, each a word or a phrase read on its word boundaries. */
  readonly words?: readonly string[] | undefined;
  /** The classes of the files the change touched, any of them. */
  readonly files?: readonly FileClass[] | undefined;
  /** The steps it applies at, any of them. */
  readonly steps?: readonly string[] | undefined;
  /** The modes it applies at, any of them. */
  readonly modes?: readonly string[] | undefined;
  /** Its weight, 1 to 3, the heaviest printed first. */
  readonly weight: number;
  readonly read: OwedRead;
}

const name = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/** A trigger row as a recipe and the triggers file hold it. */
export const triggerRowSchema: z.ZodType<TriggerRow> = z
  .object({
    words: z.array(z.string().trim().min(2)).min(1).optional(),
    files: z.array(z.enum(FILE_CLASSES)).min(1).optional(),
    steps: z.array(name).min(1).optional(),
    modes: z.array(name).min(1).optional(),
    weight: z.number().int().min(1).max(3),
    read: z.enum(["part", "whole"]),
  })
  .strict()
  .refine(
    (row) => row.words !== undefined || row.files !== undefined || row.steps !== undefined,
    "a row names the request's words, a file class or a step it holds on",
  );

/** One skill's rows. */
export interface SkillTriggers {
  readonly name: string;
  /** The skill's kind, one the modes definition places beside the line: the kinds a change owes. */
  readonly kind: string;
  /**
   * The pages a whole read includes beyond its `SKILL.md` (J-203 S1), each
   * a Markdown page of the skill's folder, as its recipe names them; absent
   * where a whole read is the front alone.
   */
  readonly wholeRead?: readonly string[] | undefined;
  readonly rows: readonly TriggerRow[];
}

/** A page a whole read includes: a Markdown page of the skill's folder, never its front. */
const wholePageSchema: z.ZodType<string> = z
  .string()
  .regex(/^(?!SKILL\.md$)(?:[a-z0-9][a-z0-9-]*\/)*[a-z0-9][a-z0-9-]*\.md$/);

/** The pages a whole read includes, each once. */
export const wholeReadSchema: z.ZodType<readonly string[]> = z
  .array(wholePageSchema)
  .min(1)
  .refine((pages) => new Set(pages).size === pages.length, "each page is named once");

/** The triggers file: every skill's rows, by name. */
export interface Triggers {
  readonly schema: typeof TRIGGERS_SCHEMA;
  readonly skills: readonly SkillTriggers[];
}

/** The triggers file as the installation carries it. */
export const triggersSchema: z.ZodType<Triggers> = z
  .object({
    schema: z.literal(TRIGGERS_SCHEMA),
    skills: z.array(
      z
        .object({
          name,
          kind: name,
          wholeRead: wholeReadSchema.optional(),
          rows: z.array(triggerRowSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Parse the triggers file.
 * @param text the file's text
 * @param source where it was read, for the refusal
 * @returns the triggers, or every field it gets wrong
 */
export function parseTriggers(text: string, source: string): Result<Triggers, ContractParseFailed> {
  const parsed = triggersSchema.safeParse(parseJson(text));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/**
 * The triggers file's text, the skills by name, as the instrument renders it.
 * @param skills each skill's rows
 * @returns the text, ending in a newline
 */
export function triggersText(skills: readonly SkillTriggers[]): string {
  const sorted = skills.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const skillText = (skill: SkillTriggers, pad: string): string =>
    objectText(
      [
        ["name", () => JSON.stringify(skill.name)],
        ["kind", () => JSON.stringify(skill.kind)],
        ...(skill.wholeRead === undefined
          ? []
          : [
              [
                "wholeRead",
                (inner: string, lead: string) => namesText(skill.wholeRead ?? [], inner, lead),
              ] as const,
            ]),
        [
          "rows",
          (inner) =>
            blockText(
              skill.rows.map((row) => (at) => rowText(row, at)),
              inner,
            ),
        ],
      ],
      pad,
    );
  return `${objectText(
    [
      ["schema", () => JSON.stringify(TRIGGERS_SCHEMA)],
      [
        "skills",
        (inner) =>
          blockText(
            sorted.map((skill) => (at) => skillText(skill, at)),
            inner,
          ),
      ],
    ],
    "",
  )}\n`;
}

/** The widest line the repository's formatter keeps a list of names on. */
const PRINT_WIDTH = 100;

/** A value's text at an indent, the line's text before it given for the width. */
type Printer = (pad: string, lead: string) => string;

/**
 * An object in the repository formatter's own layout, so the rendered file
 * passes its check: two spaces a level and each key on a line of its own.
 * @param entries each key with its value's printer, in order
 * @param pad the indent of the line the object opens on
 * @returns the text
 */
function objectText(entries: readonly (readonly [string, Printer])[], pad: string): string {
  const inner = `${pad}  `;
  const lines = entries.map(([key, value]) => {
    const head = `${JSON.stringify(key)}: `;
    return `${inner}${head}${value(inner, head)}`;
  });
  return `{\n${lines.join(",\n")}\n${pad}}`;
}

/**
 * A list of objects, one under another.
 * @param items each item's printer at the inner indent
 * @param pad the indent of the line the list opens on
 * @returns the text
 */
function blockText(items: readonly ((pad: string) => string)[], pad: string): string {
  if (items.length === 0) return "[]";
  const inner = `${pad}  `;
  return `[\n${items.map((item) => `${inner}${item(inner)}`).join(",\n")}\n${pad}]`;
}

/**
 * A list of names on its key's line where the line fits the print width, the
 * comma that may follow it counted, and one a line otherwise.
 * @param items the names
 * @param pad the indent of the line the list opens on
 * @param lead the line's text before the list
 * @returns the text
 */
function namesText(items: readonly string[], pad: string, lead: string): string {
  const inline = `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (pad.length + lead.length + inline.length + 1 <= PRINT_WIDTH) return inline;
  const inner = `${pad}  `;
  return `[\n${items.map((item) => `${inner}${JSON.stringify(item)}`).join(",\n")}\n${pad}]`;
}

/**
 * One trigger row, its conditions in the schema's order, then its weight and read.
 * @param row the row
 * @param pad the indent of the line it opens on
 * @returns the text
 */
function rowText(row: TriggerRow, pad: string): string {
  const lists: (readonly [string, Printer])[] = [];
  for (const [key, list] of [
    ["words", row.words],
    ["files", row.files],
    ["steps", row.steps],
    ["modes", row.modes],
  ] as const)
    if (list !== undefined) lists.push([key, (inner, lead) => namesText(list, inner, lead)]);
  return objectText(
    [...lists, ["weight", () => String(row.weight)], ["read", () => JSON.stringify(row.read)]],
    pad,
  );
}

/** The extensions of a page a reader sees, which the `page` class reads. */
const PAGE = /\.(?:html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro)$/i;

/** The extensions of a file that is a schema whatever its name. */
const SCHEMA = /\.(?:sql|prisma|graphql|gql|proto|avsc)$|(?:^|\/)schemas?(?:\/|\.|$)/i;

/**
 * The classes a touched file is read as, from its path alone, so a class
 * the path does not name is not seen.
 * @param path the file, from the root, `/`-separated
 * @returns its classes, none for a file of none
 */
export function fileClassesOf(path: string): readonly FileClass[] {
  if (path.startsWith(".greenline/")) return [];
  const lower = path.toLowerCase();
  const base = lower.split("/").at(-1) ?? lower;
  const classes: FileClass[] = [];
  if (/(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[^/]+$/.test(lower))
    classes.push("test");
  if (SCHEMA.test(lower)) classes.push("schema");
  if (/(?:^|\/)migrations?\//.test(lower)) classes.push("migration");
  if (PAGE.test(lower)) classes.push("page");
  if (/^(?:index\.[jt]sx?|mod\.rs|__init__\.py|package\.json|go\.mod|cargo\.toml)$/.test(base))
    classes.push("module");
  if (/^\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$|^id_(?:rsa|ed25519)|credentials|secrets?\./.test(base))
    classes.push("secret");
  if (/(?:^|\/)openapi\.|swagger\.|\.proto$|\.d\.ts$|(?:^|\/)api\//.test(lower))
    classes.push("contract");
  // A README and a benchmark (J-178 S1): the pages prose and benchmark-checklist answer.
  if (/^readme(?:\.|$)/.test(base)) classes.push("readme");
  if (/(?:^|\/)bench(?:marks?)?\/|\.bench\.[^/]+$/.test(lower)) classes.push("benchmark");
  return classes;
}

/** A path a record names in code: no space, and a folder or an extension, as `test/theme.test.js` reads. */
const NAMED_PATH =
  /^(?:[\w.@~-]+\/)*[\w@~-][\w.@~-]*\.[A-Za-z0-9]+$|^[\w.@~-]+(?:\/[\w.@~-]+)+\/?$/;

/**
 * The files a change's plan names to touch (J-200 S1, the run
 * j196c-roster-use, whose settings-page plan named `test/theme.test.js`
 * before any file was written): each code span of the record's `## plan`
 * section that reads as a path, so the trigger rows read the classes of the
 * files the change will touch at its build as well as those it touched. A
 * file the frame only read is no file of the plan's.
 * @param text the record's text
 * @returns the paths, each once, in the plan's order
 */
function plannedPaths(text: string): readonly string[] {
  const section = planSection(text);
  const spans = [...section.matchAll(/`([^`\n]+)`/g)].map((match) => (match[1] ?? "").trim());
  return [...new Set(spans.filter((span) => NAMED_PATH.test(span)))];
}

/** A record's `## plan` section, empty where it has none. */
function planSection(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trimEnd() === "## plan");
  if (at === -1) return "";
  const after = lines.slice(at + 1);
  const end = after.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? after : after.slice(0, end)).join("\n");
}

/** A making verb, any of its forms: add, write or create. */
const MAKING = String.raw`(?:add(?:s|ed|ing)?|writ(?:e|es|ing|ten)|wrote|creat(?:e|es|ed|ing))`;
/** A word that ends a test's noun phrase where it follows the test: the clause's end, a preposition or a conjunction. */
const AFTER_TEST = String.raw`(?=[ \t]*(?:$|[,.;:!?)]|(?:and|or|then|for|that|which|to|before|after|first|in|on|of|with|against|covering|so|once|until|under|at)\b))`;
/** The forms a plan says a test is written in (J-225 S1): a making verb whose object ends in a test, within one clause, either way round, or one of three phrases. */
const PLANNED_TEST = [
  // The object runs to the test within the clause, never past a conjunction that opens another verb's, as "add the export and run the tests" does.
  new RegExp(
    String.raw`\b${MAKING}\b(?:(?!\b(?:and|or|then|but)\b)[^.;:,!?\n])*?\btests?\b${AFTER_TEST}`,
    "im",
  ),
  new RegExp(String.raw`\btests?[ \t]+(?:is|are|gets?)[ \t]+${MAKING}\b`, "i"),
  /\b(?:failing|red) tests?\b/i,
  /\btests? first\b/i,
];

/**
 * Whether a change's plan says a test is written (J-225 S1, the run
 * j217t-roster-use, whose theme plan added "a failing theme test" and named
 * no path): a making verb, add, write or create, whose object ends in a
 * test within one clause, or the phrases `failing test`, `red test` and
 * `test first`, read in the prose of the record's `## plan` section alone,
 * never its `next:` line. A plan that only names the test command, or says
 * the tests catch a case, plans none.
 * @param text the record's text
 * @returns true where the plan plans a test
 */
export function plannedTest(text: string): boolean {
  const section = planSection(text);
  return PLANNED_TEST.some((form) => form.test(section));
}

/**
 * The classes a change's plan names (J-225 S1), each with the words its
 * reason gives: the class of each file the plan names in code, as `the plan
 * names a test file`, and a test file where the plan says a test is
 * written and names none, as `the plan names a test to write`. Read until
 * the build ends; from review on, and at the done door, the touched files
 * alone hold.
 * @param text the record's text
 * @returns each class beside its reason's words
 */
export function plannedClasses(text: string): ReadonlyMap<FileClass, string> {
  const planned = new Map<FileClass, string>();
  for (const path of plannedPaths(text))
    for (const each of fileClassesOf(path))
      if (!planned.has(each)) planned.set(each, `the plan names a ${each} file`);
  if (!planned.has("test") && plannedTest(text))
    planned.set("test", "the plan names a test to write");
  return planned;
}

/** What a change's owed skills are read from: the request's words, the classes touched, the steps and the mode. */
export interface OwedContext {
  /** The request's words, as the owner said them or the record restates them. */
  readonly words: string;
  /** The classes of the files the change touched. */
  readonly classes: ReadonlySet<FileClass>;
  /**
   * The classes the change's plan names, each with its reason's words
   * (J-225 S1), read until the build ends; none from review on and at the
   * done door.
   */
  readonly planned?: ReadonlyMap<FileClass, string> | undefined;
  /** The steps the rows' steps are matched against: the change's step now, or the steps it ran. */
  readonly steps: ReadonlySet<string>;
  /** The change's mode, undefined before a record states one. */
  readonly mode: string | undefined;
  /** The skills the workspace installed (J-178 S1): a skill outside them is owed nothing; every skill where undefined. */
  readonly installed?: ReadonlySet<string> | undefined;
}

/** One skill a change owes: its kind, the read, the trigger in words and its weight. */
export interface OwedSkill {
  readonly skill: string;
  readonly kind: string;
  readonly read: OwedRead;
  /** What owed it, as the line says it: the request's word, the class touched or the step. */
  readonly why: string;
  readonly weight: number;
  /**
   * The pages that still hold a whole read the loads began (J-203 S1), its
   * front and the pages its whole includes, each unread or read in part;
   * absent before any load of the skill.
   */
  readonly held?: readonly PageHeld[] | undefined;
}

/** A page of a whole read the loads have not shown whole, and how they showed it (J-203 S1). */
export interface PageHeld {
  /** The page in the skill's folder, `SKILL.md` or `method.md`. */
  readonly file: string;
  /** Unread; read with another page; cut by the harness; or read in part another way. */
  readonly state: "unread" | "together" | "cut" | "part";
}

/** The words the owes line and the done door give a page still held. */
function heldWords(page: PageHeld): string {
  switch (page.state) {
    case "unread":
      return `${page.file} unread`;
    case "together":
      return `${page.file} read with another page, read it alone`;
    case "cut":
      return `${page.file} cut by the harness, read it again`;
    case "part":
      return `${page.file} read in part, read it whole`;
  }
}

/**
 * The pages still held, in the words the owes line and the done door print.
 * @param held the pages
 * @returns the words, joined
 */
export function heldText(held: readonly PageHeld[]): string {
  return held.map(heldWords).join("; ");
}

/**
 * The owed skills the loads have not met (J-203 S1, J-189 S1's rule kept):
 * a front owed is met by any load of the skill; a whole read by its front
 * and each page its recipe's whole read includes, each shown whole by a
 * load, one page per read, the harness's cut settled in. A whole read the
 * loads began names each page still held; one no load began names none.
 * @param owed the owed skills, in order
 * @param loads the loads of the change, or of the turn while none is open, settled
 * @param triggers the installation's triggers, read for the pages a whole includes
 * @returns the unmet skills, in order, each whole read the loads began with its held pages
 */
export function owedUnmetBy(
  owed: readonly OwedSkill[],
  loads: readonly LoadSeen[],
  triggers: Triggers,
): readonly OwedSkill[] {
  return owed.flatMap((entry): readonly OwedSkill[] => {
    const own = loads.filter((load) => load.skill === entry.skill);
    if (entry.read === "part") return own.length > 0 ? [] : [entry];
    if (own.length === 0) return [entry];
    const pages = [
      "SKILL.md",
      ...(triggers.skills.find((skill) => skill.name === entry.skill)?.wholeRead ?? []),
    ];
    const held = pages.flatMap((file): readonly PageHeld[] => {
      const reads = own.filter((load) => load.file === file);
      if (reads.some((load) => load.whole)) return [];
      const last = reads.at(-1);
      if (last === undefined) return [{ file, state: "unread" }];
      // A settled load carries no mark of a read never made (J-207 S1), so such a cause reads as a part.
      return [
        { file, state: last.cause === undefined || last.cause === "unrun" ? "part" : last.cause },
      ];
    });
    return held.length === 0 ? [] : [{ ...entry, held }];
  });
}

/** A phrase read on its word boundaries, any case. */
function said(words: string, phrase: string): boolean {
  const escaped = phrase
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(words);
}

/** Why a row holds on the context, in words, or undefined where it does not. */
function rowHolds(row: TriggerRow, context: OwedContext): string | undefined {
  if (row.modes !== undefined && (context.mode === undefined || !row.modes.includes(context.mode)))
    return undefined;
  const step = row.steps?.find((each) => context.steps.has(each));
  if (row.steps !== undefined && step === undefined) return undefined;
  const word = row.words?.find((each) => said(context.words, each));
  if (row.words !== undefined && word === undefined) return undefined;
  const touched = row.files?.find((each) => context.classes.has(each));
  // A class the plan names alone owes by the plan's words, never by a touch (J-225 S1).
  const plan =
    touched === undefined
      ? row.files?.flatMap((each) => context.planned?.get(each) ?? []).at(0)
      : undefined;
  if (row.files !== undefined && touched === undefined && plan === undefined) return undefined;
  const reasons = [
    ...(word === undefined ? [] : [`the request says ${word}`]),
    ...(touched === undefined ? [] : [`a ${touched} file touched`]),
    ...(plan === undefined ? [] : [plan]),
    ...(step === undefined ? [] : [`at ${step}`]),
  ];
  return reasons.join(", ");
}

/**
 * The skills a change owes, each once by its heaviest row, a whole read
 * before a part read of the same weight, the heaviest first and then by
 * name.
 * @param triggers the installation's triggers
 * @param context the change's words, classes, steps and mode
 * @returns the owed skills, in the order the line prints them
 */
export function owedSkills(triggers: Triggers, context: OwedContext): readonly OwedSkill[] {
  const owed: OwedSkill[] = [];
  for (const skill of triggers.skills) {
    if (context.installed !== undefined && !context.installed.has(skill.name)) continue;
    let best: OwedSkill | undefined;
    for (const row of skill.rows) {
      const why = rowHolds(row, context);
      if (why === undefined) continue;
      const candidate = {
        skill: skill.name,
        kind: skill.kind,
        read: row.read,
        why,
        weight: row.weight,
      };
      if (
        best === undefined ||
        row.weight > best.weight ||
        (row.weight === best.weight && row.read === "whole" && best.read === "part")
      )
        best = candidate;
    }
    if (best !== undefined) owed.push(best);
  }
  return owed.toSorted(
    (a, b) => b.weight - a.weight || (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0),
  );
}

/**
 * A harness's notice that reaches the hooks as a turn's prompt, never the
 * owner's words (J-189 S1): Claude Code hands a fresh agent's finished
 * notice, its summary and its result among them, as the next turn's prompt.
 */
const HARNESS_NOTICE = /<task-notification>[\s\S]*?(?:<\/task-notification>|$)/g;

/**
 * The owner's own words a journaled message holds, a harness's notice taken
 * out (J-189 S1; the run j179c-mode-choice-careful, whose owed line read a
 * reviewer's report as the request).
 * @param message the message as the hooks journaled it
 * @returns the owner's words, empty where the message held none
 */
export function ownersOwnWords(message: string): string {
  return message.replace(HARNESS_NOTICE, "").trim();
}

/** One message of the owner's the hooks journaled, with the turn it came in where they noted one. */
export interface JournaledMessage {
  readonly at: string;
  readonly words: string;
  readonly turn?: number | undefined;
}

/** A change a session named by writing its record, at the turn and the time it did. */
export interface SessionNaming {
  readonly change: string;
  readonly turn: number | null;
  readonly at: string;
}

/**
 * The change a message of the owner's belongs to (J-189 S1): the change its
 * own turn last named, which a turn that stops one change and opens another
 * leaves at the one it opened; else a change the next turn opened, the
 * owner's yes to a proposal opening it there; else the change the session
 * held when the message came; else the next change the session names.
 * @param message the message
 * @param namings the session's namings, oldest first
 * @returns the change, or undefined where the session names none
 */
function messageChange(
  message: JournaledMessage,
  namings: readonly SessionNaming[],
): string | undefined {
  const turn = message.turn;
  if (turn !== undefined) {
    const own = namings.filter((naming) => naming.turn === turn).at(-1);
    if (own !== undefined) return own.change;
  }
  const held = namings.filter((naming) => naming.at <= message.at).at(-1)?.change;
  if (turn !== undefined) {
    const opened = namings.find((naming) => naming.turn === turn + 1 && naming.change !== held);
    if (opened !== undefined) return opened.change;
  }
  return held ?? namings.find((naming) => naming.at > message.at)?.change;
}

/**
 * The owner's words a change's request said, from each session that worked
 * on it (J-189 S1): every message the session's journal holds that belongs
 * to the change, a harness's notice taken out, so a skill one change's
 * request owed is never charged to another.
 * @param id the change
 * @param sessions each session's journaled messages and its namings
 * @returns the owner's words, in each session's order
 */
export function changeMessages(
  id: string,
  sessions: readonly {
    readonly messages: readonly JournaledMessage[];
    readonly namings: readonly SessionNaming[];
  }[],
): readonly string[] {
  return sessions.flatMap(({ messages, namings }) => {
    const ordered = namings.toSorted((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return messages.flatMap((message) => {
      const words = ownersOwnWords(message.words);
      return words !== "" && messageChange(message, ordered) === id ? [words] : [];
    });
  });
}

/** The words a skill's read costs, and the words the mode leaves for owed reads. */
export interface ReadingBudget {
  /** The words the mode's budget leaves after the block and its steps' skills; undefined where it is not known. */
  readonly headroom: number | undefined;
  /** The words a read of a skill costs: its front, or its front with its pages. */
  readonly cost: (skill: string, read: OwedRead) => number;
}

/**
 * The line status and the mirror print, naming the skills the change owes
 * and has not loaded, in weight order within the mode's reading budget,
 * each as a part read or a whole read with what owed it; undefined while
 * none is owed or every one is loaded.
 * @param owed the owed skills, in order
 * @param loaded the skills the change or the session loaded
 * @param budget the reading budget, where it is known
 * @returns the line, unindented
 */
export function owedLine(
  owed: readonly OwedSkill[],
  loaded: ReadonlySet<string>,
  budget?: ReadingBudget,
): string | undefined {
  const unread = owed.filter((entry) => !loaded.has(entry.skill));
  if (unread.length === 0) return undefined;
  let left = budget?.headroom;
  const printed: OwedSkill[] = [];
  for (const entry of unread) {
    const cost = budget === undefined ? 0 : budget.cost(entry.skill, entry.read);
    // The first always prints; the rest while the budget holds them.
    if (left !== undefined && printed.length > 0 && cost > left) break;
    printed.push(entry);
    if (left !== undefined) left -= cost;
  }
  const rest = unread.length - printed.length;
  const items = printed.map(
    (entry) =>
      `${entry.skill} (${entry.read === "whole" ? "whole" : "its front"}: ${entry.why}${entry.held === undefined ? "" : `; ${heldText(entry.held)}`})`,
  );
  return `owes: ${items.join("; ")}${rest === 0 ? "" : `; and ${String(rest)} more past the mode's reading budget`}; read what the line names before the step that uses it`;
}

/**
 * The mode a request names, read on its word boundaries, or undefined where
 * it names none or more than one.
 * @param words the owner's words
 * @param modes the modes, by name
 * @returns the mode named
 */
export function namedMode(words: string, modes: readonly string[]): string | undefined {
  const named = modes.filter((mode) => said(words, mode));
  return named.length === 1 ? named[0] : undefined;
}

/** The floors a class of touched or read file raises, by the floors' names (J-176 S1). */
const FLOOR_OF: ReadonlyMap<FileClass, string> = new Map([
  ["secret", "security"],
  ["migration", "data-migration"],
  ["contract", "public-contract"],
]);

/** A floor an entry of the invariants start's list raises (J-195 S1): the entry sits on a public contract or a security boundary. */
export interface InvariantFloor {
  readonly floor: "public-contract" | "security";
  /** The invariant, as the list states it. */
  readonly entry: string;
}

/** The boundaries an entry of the invariants list names, by the floor each raises. */
const BOUNDARY_FLOOR: ReadonlyMap<string, InvariantFloor["floor"]> = new Map([
  ["public contract", "public-contract"],
  ["security", "security"],
  ["security boundary", "security"],
]);

/** The cells of one Markdown table row, or undefined for a line that is no row. */
function cellsOf(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|") || trimmed.length < 2) return undefined;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * The floors the invariants start's list raises (J-195 S1): one per entry
 * whose `Boundary` cell names a public contract or a security boundary, in
 * the list's order, the list being the table whose head names `Invariant`
 * and `Boundary`; none where the text holds no such table.
 * @param text the list's file, `.greenline/ledger/<id>/invariants.md`
 * @returns the floors with their entries
 */
export function invariantFloors(text: string): readonly InvariantFloor[] {
  const floors: InvariantFloor[] = [];
  let columns: { readonly entry: number; readonly boundary: number } | undefined;
  for (const line of text.split("\n")) {
    const cells = cellsOf(line);
    if (cells === undefined) {
      columns = undefined;
      continue;
    }
    const lower = cells.map((cell) => cell.toLowerCase());
    if (columns === undefined) {
      const entry = lower.indexOf("invariant");
      const boundary = lower.indexOf("boundary");
      if (entry !== -1 && boundary !== -1) columns = { entry, boundary };
      continue;
    }
    if (lower.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const floor = BOUNDARY_FLOOR.get(lower[columns.boundary] ?? "");
    const entry = cells[columns.entry] ?? "";
    if (floor !== undefined && entry !== "") floors.push({ floor, entry });
  }
  return floors;
}

/** The situation the proposal answers (J-176 S1): what the hooks and the files show before it. */
export interface ProposalSituation {
  /** The mode the request names, undefined where it names none or no hook saw it. */
  readonly named: string | undefined;
  /** The manifest's `proceed` setting. */
  readonly proceed: string;
  /** The classes of the files the hooks saw read or written, and the change touched. */
  readonly seen: ReadonlySet<FileClass>;
  /** Whether the workspace names interface roots, and the record's interface line where it states one. */
  readonly interface: { readonly roots: boolean; readonly stated: string | undefined };
  /** Whether a hook saw the request; where none did, the line says what the files alone show. */
  readonly heard: boolean;
  /** The floors the invariants start's list raises, its entries on a public contract or a security boundary (J-195 S1). */
  readonly invariants?: readonly InvariantFloor[] | undefined;
  /**
   * The floors the acting change's record names, an unanswered line read as
   * none; undefined where no change is acting (J-226 S1).
   */
  readonly recorded?: readonly string[] | undefined;
}

/**
 * The situation line status and the mirror print while a request is read
 * or a change is open (J-176 S1): the mode the request names, the
 * `proceed` setting, the floors the files seen raise and the invariants
 * list's entries raise (J-195 S1), and the interface fact, each a fact the
 * proposal answers.
 * @param situation what the hooks and the files show
 * @returns the line, unindented
 */
export function situationLine(situation: ProposalSituation): string {
  const named: string[] = [];
  const floors = [...situation.seen].flatMap((each) => {
    const floor = FLOOR_OF.get(each);
    if (floor !== undefined) named.push(floor);
    return floor === undefined ? [] : [`${floor} (a ${each} file)`];
  });
  for (const each of situation.invariants ?? []) {
    named.push(each.floor);
    floors.push(`${each.floor} (an invariant: ${each.entry})`);
  }
  // A floor the hooks saw that the acting change's line leaves out is printed for the agent's judgment, never refused (J-226 S1).
  const recorded = situation.recorded;
  const left =
    recorded === undefined ? [] : [...new Set(named)].filter((floor) => !recorded.includes(floor));
  const lacks =
    left.length === 0
      ? ""
      : `; the record's floors line lacks ${joined(left)}: add ${left.length === 1 ? "it" : "each"} there where you judge it a floor`;
  const mode = situation.heard ? (situation.named ?? "none named") : "no hook saw the request";
  const face = !situation.interface.roots
    ? "no interface roots"
    : situation.interface.stated === undefined
      ? "roots stand, the proposal states yes or no"
      : `the record says ${situation.interface.stated}`;
  return `situation: mode ${mode}; proceed ${situation.proceed}; floors seen: ${floors.length === 0 ? "none" : floors.join(", ")}${lacks}; interface: ${face}`;
}
