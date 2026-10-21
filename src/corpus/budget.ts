import { casesHandled, shouldNeverHappen } from "../commons/defect.ts";
import { GARDEN_COMMAND } from "../core/connectors/garden.ts";
import type { Installation } from "../core/installation.ts";
import { MANIFEST_SCHEMA_VERSION, NO_PROCEED, HOOKS_ON, type Manifest } from "../core/manifest.ts";
import {
  agentsAtMost,
  depthOf,
  roundsAtMost,
  type Depth,
  type Mode,
  type ModesDefinition,
  type StepName,
} from "../core/modes.ts";
import { renderProjection, renderSkillFile } from "../core/render.ts";
import type { SkillSource } from "../core/skill.ts";
import { excessOf, type ModesRecipe } from "./modes-recipe.ts";
import { wordsOf } from "./segments.ts";

/**
 * The budget (`workshop/components/modes.md`, "The words budget";
 * `workshop/components/recipes.md`, "The instrument"): per mode of the
 * definition, the agents and the rounds derived from its depths, the steps
 * it runs with their depths, and the words an agent must read there, which are the installed
 * block, the `SKILL.md` of each skill serving a step the mode runs at a
 * depth other than none, and each page of such a skill's front that only
 * that mode's depths read; then, apart, every roster skill's `SKILL.md`, its
 * reference files and its references pages, which load on demand. A skill's
 * front is its `SKILL.md` and the reference files of method it names, the
 * upstream prose its recipe cuts; its references pages are greenline's
 * mechanics for it, written apart (J-93 S2), so the budget counts the
 * front's `SKILL.md` and lists the references apart. A page of a step's
 * front that the depth bullets of its references page alone name, under
 * "The depths", is read only at the modes those bullets name, and counts
 * against each one's ceiling (the operator's ruling of 2026-10-20, "Count it
 * against careful's ceiling": a step method only careful reads enters on
 * such a page). The block is the one the renderer
 * writes into `AGENTS.md` for the installation `greenline init` makes,
 * garden disabled, and the same workspace with garden enabled. A word is
 * the corpus's word (`wordsOf` in `src/corpus/segments.ts`), the one growth
 * and the stub trigger count.
 *
 * Every mode, step, kind and words budget is read from the definition the
 * installation carries; this module names none. A mode reads at most the
 * larger of its two totals, and one over its words budget is refused, unless
 * the modes recipe's account for the mode carries the operator's ruling on
 * an excess at least as large. The words budget is a ceiling: lowered by
 * each change that cuts, never raised without that ruling.
 */

/** One step of the line: the skills of a kind on the line serving it, and their `SKILL.md` words. */
export interface LineStep {
  readonly step: StepName;
  readonly skills: readonly string[];
  readonly words: number;
}

/** One step a mode runs, at its depth there. */
export interface StepWords extends LineStep {
  readonly depth: Depth;
}

/** The words of the block and of a mode's totals, for the default installation and with garden enabled. */
export interface InstalledWords {
  readonly default: number;
  readonly garden: number;
}

/** One mode's budget: its agents and rounds, the steps it runs, the words an agent reads there, and the verdict. */
export interface ModeBudget {
  readonly mode: string;
  /** The most agents it may start, the builder included ({@link agentsAtMost}). */
  readonly agents: number;
  /** Its fix rounds, counted once for each step that takes a fix pass outside a loop. */
  readonly fixRounds: number;
  /** Its fix passes and every looped step's rounds ({@link roundsAtMost}). */
  readonly rounds: number;
  readonly steps: readonly StepWords[];
  /** The pages of its steps' fronts that only the depths of the modes they name read, this mode among them ({@link DepthPage}). */
  readonly pages: readonly DepthPage[];
  /** The block, the steps' `SKILL.md` words and its pages' words. */
  readonly total: InstalledWords;
  readonly budget: number;
  /** The larger total's words over the budget; 0 within it. */
  readonly excess: number;
  /** The excess the modes recipe's ruling names for the mode, or null. */
  readonly ruled: number | null;
  readonly refused: boolean;
}

/** One Markdown file beside a skill's `SKILL.md`, with its words. */
export interface ReferenceWords {
  readonly path: string;
  readonly words: number;
}

/**
 * A page of a step skill's front that only some modes read: every link to it
 * on the skill's pages stands in a depth bullet of its references page that
 * names a mode, so `SKILL.md`, the page's other prose and a bullet naming no
 * mode never send a reader there. It counts against the ceiling of each mode
 * those bullets name.
 */
export interface DepthPage {
  readonly skill: string;
  readonly path: string;
  readonly words: number;
}

/** One roster skill's words, read apart: its `SKILL.md`, its reference files and its references pages. */
export interface SkillWords {
  readonly name: string;
  readonly kind: string;
  readonly slot: string | null;
  readonly trial: boolean;
  readonly extra: boolean;
  /** The front's `SKILL.md`, which the words budget counts; of the other pages it counts only a {@link DepthPage}. */
  readonly words: number;
  /** The front's other Markdown pages, the method a depth or a question loads. */
  readonly files: readonly ReferenceWords[];
  /** The references pages, greenline's mechanics for the skill, which its recipe names as its references part. */
  readonly references: readonly ReferenceWords[];
}

/** A mode `budget` refused, or a reason it measured none. */
export interface BudgetRefusal {
  /** The mode refused, or `*` when nothing could be measured. */
  readonly mode: string;
  readonly message: string;
}

/** `budget`'s report: the block's words, one budget per mode named, every skill's words apart, and every refusal. */
export interface BudgetOutput {
  readonly verb: "budget";
  readonly block: InstalledWords | null;
  /** Every step of the definition, in its order, with the words of the skills serving it. */
  readonly line: readonly LineStep[];
  readonly modes: readonly ModeBudget[];
  /** The roster in the definition's kind order, each kind's skills in the installation's order. */
  readonly skills: readonly SkillWords[];
  readonly refused: readonly BudgetRefusal[];
}

/** The workspace `greenline init` writes: no skill chosen, no connector enabled, no trial skill, waiting under every mode. */
const INITIALIZED: Manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  targets: ["codex", "claude-code"],
  skills: { exclude: [], include: [] },
  connectors: {},
  proceed: NO_PROCEED,
  trials: [],
  checks: [],
  hooks: HOOKS_ON,
};

/** The same workspace with garden enabled; the block names no endpoint, so this one is never shown. */
const GARDEN_ENABLED: Manifest = {
  ...INITIALIZED,
  connectors: { garden: { endpoint: "https://garden.invalid/", executable: GARDEN_COMMAND } },
};

const count = (text: string): number => wordsOf(text).length;

/** The managed block the renderer writes into `AGENTS.md` for a workspace. */
function blockWords(manifest: Manifest, installation: Installation): number {
  const block = renderProjection(manifest, installation).find((file) => file.path === "AGENTS.md");
  return count(block?.content ?? shouldNeverHappen("the projection writes no AGENTS.md block"));
}

/** The references pages of each skill, by name: the paths its recipe names as its references part. */
export type ReferencesPages = ReadonlyMap<string, ReadonlySet<string>>;

/** A skill's installed `SKILL.md`, its reference files and its references pages, with their words. */
function skillWords(skill: SkillSource, pages: ReadonlySet<string> | undefined): SkillWords {
  const markdown = (skill.supportFiles ?? [])
    .filter((file) => file.path.endsWith(".md"))
    .map((file) => ({ path: file.path, words: count(file.content) }));
  return {
    name: skill.name,
    kind: skill.kind,
    slot: skill.slot ?? null,
    trial: skill.trial === true,
    extra: skill.extra === true,
    words: count(renderSkillFile(skill)),
    files: markdown.filter((file) => pages?.has(file.path) !== true),
    references: markdown.filter((file) => pages?.has(file.path) === true),
  };
}

/** A Markdown link's target, `[text](target)`, its anchor and title left out. */
const LINK = /\[[^\]]*\]\(\s*<?([^)\s#>]+)/g;

/** The heading under which a references page states a step at each mode's depth, one bullet per depth. */
const DEPTHS_HEADING = "## The depths";

/** A depth bullet's opening, its bold label naming the depth and the modes that run it. */
const DEPTH_BULLET = /^- \*\*(.+?)\*\*/;

/**
 * The path a link on a skill's page names, from the skill's root.
 * @param from the linking page's path from the skill's root, `SKILL.md` for the front's own
 * @param target the link's target as written
 * @returns the path, or undefined for a link off the skill: a scheme, an absolute path or one above the root
 */
function linkTarget(from: string, target: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) return undefined;
  const parts = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (parts.pop() === undefined) return undefined;
  }
  return parts.join("/");
}

/** A link a skill's page holds, with the modes of the depth bullet holding it; undefined where no bullet naming a mode does. */
interface LinkSeen {
  readonly target: string;
  readonly modes: ReadonlySet<string> | undefined;
}

/** Text matched literally inside a regular expression. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The modes of the definition a depth bullet's label names, each as a whole word; undefined when it names none. */
function modesNamed(label: string, modes: readonly string[]): ReadonlySet<string> | undefined {
  const named = modes.filter((mode) => new RegExp(`\\b${literal(mode)}\\b`, "i").test(label));
  return named.length === 0 ? undefined : new Set(named);
}

/**
 * Every link on one page of a skill. On a references page, a link inside a
 * depth bullet under "The depths", on its opening line or an indented line
 * that continues it, carries the modes the bullet's label names.
 * @param path the page's path from the skill's root
 * @param text the page's text
 * @param references whether the page is one of the skill's references pages
 * @param modes the definition's mode names
 * @returns the links, a link to the page itself left out
 */
function linksOf(
  path: string,
  text: string,
  references: boolean,
  modes: readonly string[],
): readonly LinkSeen[] {
  const seen: LinkSeen[] = [];
  let depths = false;
  let bullet: ReadonlySet<string> | undefined;
  for (const line of text.split("\n")) {
    if (/^#{1,6} /.test(line)) {
      depths = references && line.trim() === DEPTHS_HEADING;
      bullet = undefined;
      continue;
    }
    const opened = depths ? DEPTH_BULLET.exec(line) : null;
    if (opened !== null) bullet = modesNamed(opened[1] ?? "", modes);
    // A bullet runs on over its indented lines; any other line ends it.
    else if (!/^\s+\S/.test(line)) bullet = undefined;
    for (const match of line.matchAll(LINK)) {
      const target = linkTarget(path, match[1] ?? "");
      if (target !== undefined && target !== path) seen.push({ target, modes: bullet });
    }
  }
  return seen;
}

/** A page of a skill's front with its words and the modes whose depths alone name it. */
interface BoundPage extends DepthPage {
  readonly modes: ReadonlySet<string>;
}

/**
 * The pages of a skill's front that only some modes read: each Markdown page
 * beside `SKILL.md`, a references page aside, that some link names and every
 * link naming it stands in a depth bullet that names a mode. A page
 * `SKILL.md` or any other prose names may be read at every depth, so it is
 * left to load on demand, as is a page no link names.
 * @param skill the skill as installed
 * @param references its references pages, which carry the depth bullets
 * @param modes the definition's mode names
 * @returns the pages, in the skill's file order
 */
function boundPages(
  skill: SkillSource,
  references: ReadonlySet<string> | undefined,
  modes: readonly string[],
): readonly BoundPage[] {
  if (references === undefined || references.size === 0) return [];
  const markdown = (skill.supportFiles ?? []).filter((file) => file.path.endsWith(".md"));
  const seen = [
    ...linksOf("SKILL.md", skill.body, false, modes),
    ...markdown.flatMap((file) =>
      linksOf(file.path, file.content, references.has(file.path), modes),
    ),
  ];
  return markdown.flatMap((file) => {
    if (references.has(file.path)) return [];
    const links = seen.filter((link) => link.target === file.path);
    if (links.length === 0 || links.some((link) => link.modes === undefined)) return [];
    const named = new Set(links.flatMap((link) => [...(link.modes ?? [])]));
    return [{ skill: skill.name, path: file.path, words: count(file.content), modes: named }];
  });
}

/** Every step of the definition, each with the skills of a kind on the line that serve it. */
function lineOf(definition: ModesDefinition, skills: readonly SkillWords[]): readonly LineStep[] {
  const onTheLine = new Set<string>(
    definition.kinds.filter((kind) => kind.place === "ordered").map((kind) => kind.name),
  );
  return definition.steps.map((step) => {
    const serving = skills.filter((skill) => onTheLine.has(skill.kind) && skill.slot === step.name);
    return {
      step: step.name,
      skills: serving.map((skill) => skill.name),
      words: serving.reduce((sum, skill) => sum + skill.words, 0),
    };
  });
}

/** The steps a mode runs: every step of the line at a depth other than none. */
function stepsRun(mode: Mode, line: readonly LineStep[]): readonly StepWords[] {
  return line.flatMap((step) => {
    const depth = depthOf(mode, step.step);
    return depth.depth === "none" ? [] : [{ ...step, depth }];
  });
}

/** One mode measured: its budget, and its refusal when it reads more than its budget and its ruling allow. */
interface Measured {
  readonly budget: ModeBudget;
  readonly refusal: BudgetRefusal | undefined;
}

/** Measure one mode against its words budget and the ruling on its excess. */
function modeBudget(
  definition: ModesDefinition,
  mode: Mode,
  line: readonly LineStep[],
  block: InstalledWords,
  recipe: ModesRecipe | undefined,
  bound: ReadonlyMap<string, readonly BoundPage[]>,
): Measured {
  const steps = stepsRun(mode, line);
  const pages = steps.flatMap((step) =>
    step.skills.flatMap((skill) =>
      (bound.get(skill) ?? [])
        .filter((page) => page.modes.has(mode.name))
        .map(({ skill: name, path, words }) => ({ skill: name, path, words })),
    ),
  );
  const read =
    steps.reduce((sum, step) => sum + step.words, 0) +
    pages.reduce((sum, page) => sum + page.words, 0);
  const total = { default: block.default + read, garden: block.garden + read };
  const most = Math.max(total.default, total.garden);
  const excess = Math.max(0, most - mode.budget.words);
  const ruled = recipe === undefined ? undefined : excessOf(recipe, mode.name);
  const over = excess > 0 && (ruled === undefined || ruled.words < excess);
  const budget: ModeBudget = {
    mode: mode.name,
    agents: agentsAtMost(definition, mode),
    fixRounds: mode.fixRounds,
    rounds: roundsAtMost(definition, mode),
    steps,
    pages,
    total,
    budget: mode.budget.words,
    excess,
    ruled: ruled?.words ?? null,
    refused: over,
  };
  if (!over) return { budget, refusal: undefined };
  const named =
    ruled === undefined
      ? `the modes recipe's account for 'mode:${mode.name}' names no ruling on an excess`
      : `the ruling in the modes recipe's account for 'mode:${mode.name}' names an excess of ${ruled.words}`;
  return {
    budget,
    refusal: {
      mode: mode.name,
      message: `mode '${mode.name}' reads ${most} words, ${excess} over its words budget of ${mode.budget.words}, and ${named}`,
    },
  };
}

/**
 * Measure each mode named, or every mode of the definition when none is.
 * @param installation the installation as the payload is compiled, its definition and roster included
 * @param recipe the modes recipe, whose accounts carry any ruling on an excess; undefined when the corpus holds none
 * @param named the modes to measure, by name; every mode when empty
 * @param pages each skill's references pages, which the report lists apart from its reference files
 * @returns the report, with a refusal for a mode over its budget and for a name the definition does not hold
 */
export function budgetReport(
  installation: Installation,
  recipe: ModesRecipe | undefined,
  named: readonly string[],
  pages: ReferencesPages = new Map(),
): BudgetOutput {
  const definition = installation.modes;
  const kinds: readonly string[] = definition.kinds.map((kind) => kind.name);
  const skills = installation.skills
    .map((skill) => skillWords(skill, pages.get(skill.name)))
    .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  const block = {
    default: blockWords(INITIALIZED, installation),
    garden: blockWords(GARDEN_ENABLED, installation),
  };
  const line = lineOf(definition, skills);
  const modeNames = definition.modes.map((mode) => mode.name);
  const onTheLine = new Set(line.flatMap((step) => step.skills));
  const bound = new Map(
    installation.skills
      .filter((skill) => onTheLine.has(skill.name))
      .map((skill) => [skill.name, boundPages(skill, pages.get(skill.name), modeNames)] as const),
  );
  const unknown = named.filter((name) => !definition.modes.some((mode) => mode.name === name));
  const measured = definition.modes
    .filter((mode) => named.length === 0 || named.includes(mode.name))
    .map((mode) => modeBudget(definition, mode, line, block, recipe, bound));
  return {
    verb: "budget",
    block,
    line,
    modes: measured.map((entry) => entry.budget),
    skills,
    refused: [
      ...unknown.map((mode) => ({
        mode,
        message: `the modes definition holds no mode '${mode}'`,
      })),
      ...measured.flatMap((entry) => (entry.refusal === undefined ? [] : [entry.refusal])),
    ],
  };
}

const counted = (amount: number, noun: string): string =>
  `${amount} ${noun}${amount === 1 ? "" : "s"}`;

function depthCell(depth: Depth): string {
  switch (depth.depth) {
    case "none":
    case "inline":
    case "written":
      return depth.depth;
    case "independent":
      return `independent, ${counted(depth.agents, "agent")}`;
    case "looped":
      return `looped, ${counted(depth.rounds, "round")}`;
    default:
      return casesHandled(depth);
  }
}

const row = (cells: readonly (string | number)[]): string => `| ${cells.join(" | ")} |`;

/** The per-mode table: the agents and rounds, each step's depth, and the words against the budget. */
function modesTable(report: BudgetOutput, block: InstalledWords): readonly string[] {
  const { modes } = report;
  const stepRows = report.line.map((step) => {
    const label = `${step.step}, ${step.words} words`;
    return row([
      label,
      ...modes.map((mode) => {
        const run = mode.steps.find((entry) => entry.step === step.step);
        return run === undefined ? "none" : depthCell(run.depth);
      }),
    ]);
  });
  const verdict = (mode: ModeBudget): string =>
    mode.excess === 0
      ? "within"
      : mode.refused
        ? `${mode.excess} over, refused`
        : `${mode.excess} over, ruled`;
  return [
    row(["Mode", ...modes.map((mode) => mode.mode)]),
    row(["---", ...modes.map(() => "---")]),
    row(["Agents, at most", ...modes.map((mode) => mode.agents)]),
    row(["Fix rounds, per step", ...modes.map((mode) => mode.fixRounds)]),
    row(["Rounds, fixes and loops", ...modes.map((mode) => mode.rounds)]),
    ...stepRows,
    row(["The block", ...modes.map(() => block.default)]),
    row(["The block, garden enabled", ...modes.map(() => block.garden)]),
    row([
      "The steps' SKILL.md",
      ...modes.map((mode) => mode.steps.reduce((sum, step) => sum + step.words, 0)),
    ]),
    row([
      "Front pages only its depths name",
      ...modes.map((mode) => mode.pages.reduce((sum, page) => sum + page.words, 0)),
    ]),
    row(["Words read", ...modes.map((mode) => mode.total.default)]),
    row(["Words read, garden enabled", ...modes.map((mode) => mode.total.garden)]),
    row(["Words budget", ...modes.map((mode) => mode.budget)]),
    row(["Against the budget", ...modes.map(verdict)]),
  ];
}

/** The words of some pages, as the table prints them. */
function pagesCell(pages: readonly ReferenceWords[]): string {
  const words = pages.reduce((sum, file) => sum + file.words, 0);
  return pages.length === 0 ? "none" : `${words} in ${counted(pages.length, "file")}`;
}

/** The skills read apart: each one's kind, marks, `SKILL.md` words, reference files' and references pages' words. */
function skillsTable(skills: readonly SkillWords[]): readonly string[] {
  return [
    row(["Skill", "Kind", "Marks", "SKILL.md", "Reference files", "References"]),
    row(["---", "---", "---", "---", "---", "---"]),
    ...skills.map((skill) => {
      const marks = [skill.trial ? "trial" : "", skill.extra ? "extra" : ""].filter(Boolean);
      return row([
        `\`${skill.name}\``,
        skill.kind,
        marks.length === 0 ? "" : marks.join(", "),
        skill.words,
        pagesCell(skill.files),
        pagesCell(skill.references),
      ]);
    }),
  ];
}

/**
 * The report as the operator reads it: the per-mode table, the skills read
 * apart, and each refusal.
 * @param report `budget`'s report
 * @returns Markdown, ending in a newline
 */
export function renderBudgetTable(report: BudgetOutput): string {
  const lines: string[] = [];
  if (report.block !== null && report.modes.length > 0)
    lines.push(
      "## The words an agent reads, per mode",
      "",
      ...modesTable(report, report.block),
      "",
    );
  if (report.skills.length > 0)
    lines.push(
      "## Read apart, on demand",
      "",
      "A start loads once, a habit on its situation, a reference file when its skill sends the reader there, and a references page, the skill's mechanics, when its record section is written.",
      "",
      ...skillsTable(report.skills),
      "",
    );
  if (report.refused.length > 0)
    lines.push(
      "## Refused",
      "",
      ...report.refused.map((refusal) => `- ${refusal.mode}: ${refusal.message}`),
      "",
    );
  return lines.join("\n");
}
