/** The budget (S23): per mode, the agents and the rounds derived from its depths, the steps it runs and the words an agent reads, against the definition's words budget. */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contractFailure } from "../../src/core/contract.ts";
import type { Installation } from "../../src/core/installation.ts";
import { parseModes } from "../../src/core/modes.ts";
import type { SkillSource } from "../../src/core/skill.ts";
import { budgetReport, renderBudgetTable, type BudgetOutput } from "../../src/corpus/budget.ts";
import { budgetVerb } from "../../src/corpus/instrument.ts";
import { parseModesRecipe, type ModesRecipe } from "../../src/corpus/modes-recipe.ts";
import { wordsOf } from "../../src/corpus/segments.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  made.push(directory);
  return directory;
}

/** The fixture's definition: a mode at each end of the budget, one of them looping. */
function definitionText(budgets: { readonly quick: number; readonly careful: number }): string {
  const kind = (name: string, mechanism: string, record: string, place: string) => ({
    name,
    mechanism,
    record,
    place,
    budget: place === "ordered" ? "counts" : "free",
    when: `A fixture ${name} applies.`,
  });
  return `${JSON.stringify(
    {
      schemaVersion: 5,
      kinds: [
        kind("step", "reach", "section", "ordered"),
        kind("start", "open", "section", "beside"),
        kind("habit", "arise", "none", "beside"),
      ],
      steps: [
        { name: "sketch", whenSplit: "plan", fixPass: true },
        { name: "check", whenSplit: "both", fixPass: true },
      ],
      modes: [
        {
          name: "quick",
          promise: "a quick fixture change",
          typicalRequest: "a fixture typo",
          fixRounds: 0,
          budget: { words: budgets.quick },
          steps: { sketch: { depth: "none" }, check: { depth: "inline" } },
        },
        {
          name: "careful",
          promise: "a careful fixture change",
          typicalRequest: "a fixture contract",
          fixRounds: 1,
          budget: { words: budgets.careful },
          steps: {
            sketch: { depth: "independent", agents: 2 },
            check: { depth: "looped", rounds: 2 },
          },
        },
      ],
      floors: [],
    },
    null,
    2,
  )}\n`;
}

const skill = (
  name: string,
  facts: Pick<SkillSource, "kind" | "description" | "body"> & Partial<SkillSource>,
): SkillSource => ({ name, activation: "implicit", ...facts });

/**
 * The fixture's roster. The words, counted by hand from each installed
 * SKILL.md (its front matter's two fields and its body): sketch 15, check
 * 16, begin 14, tidy 12, use-garden 16; check's reference file 6 and its
 * references page 5.
 */
const SKILLS: readonly SkillSource[] = [
  skill("sketch", {
    kind: "step",
    slot: "sketch",
    description: "Sketch the fixture change.",
    body: "# Sketch\n\nWrite the change down in one paragraph.\n",
  }),
  skill("check", {
    kind: "step",
    slot: "check",
    description: "Check the fixture change.",
    body: "# Check\n\nRun the check and read what it prints.\n",
    supportFiles: [
      { path: "references/list.md", content: "# The list\n\nEvery item is verified.\n" },
      { path: "references/greenline.md", content: "# Mechanics\n\nWrite the check section.\n" },
      { path: "scripts/run.sh", content: "echo run the fixture check now\n" },
    ],
  }),
  skill("begin", {
    kind: "start",
    description: "Begin a fixture job.",
    body: "# Begin\n\nPick the mode the request needs.\n",
  }),
  skill("tidy", {
    kind: "habit",
    trial: true,
    description: "Tidy as you go.",
    body: "# Tidy\n\nLeave the code cleaner.\n",
  }),
  skill("use-garden", {
    kind: "habit",
    description: "Consult garden on an open choice.",
    body: "# Use garden\n\nAsk garden before choosing.\n",
  }),
];

function installation(
  budgets = { quick: 1000, careful: 2000 },
  skills: readonly SkillSource[] = SKILLS,
): Installation {
  const modes = parseModes(definitionText(budgets), "modes.json");
  if (modes._tag === "err") throw modes.error;
  return fixtureInstallation({
    modes: modes.value,
    skills,
    intents: [
      { intent: "a fixture job begins", skills: ["begin"] },
      { intent: "the code is messy", skills: ["tidy"] },
      { intent: "an open choice", skills: ["use-garden"] },
    ],
  });
}

/** A modes recipe whose account for the careful mode carries the excess given, if any. */
function recipe(excess?: { readonly words: number; readonly ruling: string }): ModesRecipe {
  const careful = { part: "mode:careful", kind: "method", reason: "r", ruling: "w" };
  const parsed = parseModesRecipe(
    JSON.stringify({
      schema: "greenline.modes-recipe/v1",
      definition: { path: "runtime/modes.json", sha256: "a".repeat(64) },
      parts: [excess === undefined ? careful : { ...careful, excess }],
    }),
    "modes.json",
  );
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

/**
 * The fixture block's words: default, and with the garden row the connector
 * adds. J-73 S2's mode table added 19 words, counted by hand: "The agents
 * count the builder." (5), "outside a loop, sketch and check each take the
 * mode's fix rounds" (12) and "per step" (2). J-93 S1 took 16 away with the
 * trial step: "A trial step runs only where the workspace enabled it." (10),
 * the row's "(trial)" (1) and the line's "(trial, runs only where enabled)"
 * (5). J-145 S1 added 6 to the note: "never an agent a method starts".
 */
const BLOCK = { default: 118, garden: 132 };

describe("S23 the budget of each mode", () => {
  it("J-73 S2 totals each mode's agents and rounds, derived from its depths, the steps it runs and the words an agent reads there", () => {
    const report = budgetReport(installation(), undefined, []);
    expect(report.block).toEqual(BLOCK);
    expect(report.line).toEqual([
      { step: "sketch", skills: ["sketch"], words: 15, moments: [] },
      { step: "check", skills: ["check"], words: 16, moments: [] },
    ]);
    expect(report.modes).toEqual([
      {
        mode: "quick",
        agents: 1,
        fixRounds: 0,
        rounds: 0,
        steps: [
          { step: "check", skills: ["check"], words: 16, moments: [], depth: { depth: "inline" } },
        ],
        pages: [],
        total: { default: BLOCK.default + 16, garden: BLOCK.garden + 16 },
        // No step of the fixture applies by a record fact, so a change without one reads the same.
        withoutFacts: { default: BLOCK.default + 16, garden: BLOCK.garden + 16 },
        budget: 1000,
        excess: 0,
        ruled: null,
        refused: false,
      },
      {
        mode: "careful",
        // The builder, sketch's two agents and check's two rounds.
        agents: 5,
        fixRounds: 1,
        // Sketch's one fix pass; check's two rounds, which include their fixes.
        rounds: 3,
        steps: [
          {
            step: "sketch",
            skills: ["sketch"],
            words: 15,
            moments: [],
            depth: { depth: "independent", agents: 2 },
          },
          {
            step: "check",
            skills: ["check"],
            words: 16,
            moments: [],
            depth: { depth: "looped", rounds: 2 },
          },
        ],
        pages: [],
        total: { default: BLOCK.default + 31, garden: BLOCK.garden + 31 },
        withoutFacts: { default: BLOCK.default + 31, garden: BLOCK.garden + 31 },
        budget: 2000,
        excess: 0,
        ruled: null,
        refused: false,
      },
    ]);
    expect(report.refused).toEqual([]);
  });

  it("S23 the habits' section the garden connector's row opens is the one difference between the two blocks", () => {
    const report = budgetReport(installation(), undefined, []);
    const section = [
      "## Habit skills",
      "",
      "A fixture habit applies.",
      "",
      "| The situation | Habit |",
      "| --- | --- |",
      "| an open choice | `use-garden` |",
    ].join("\n");
    expect((report.block?.garden ?? 0) - (report.block?.default ?? 0)).toBe(
      wordsOf(section).length,
    );
  });

  it("S23 counts apart each skill's SKILL.md and its Markdown reference files, trials and extras marked, in the kinds' order", () => {
    expect(budgetReport(installation(), undefined, []).skills).toEqual([
      {
        name: "check",
        kind: "step",
        slot: "check",
        trial: false,
        extra: false,
        words: 16,
        // With no recipe naming a references page, every Markdown page is a reference file.
        files: [
          { path: "references/list.md", words: 6 },
          { path: "references/greenline.md", words: 5 },
        ],
        references: [],
      },
      {
        name: "sketch",
        kind: "step",
        slot: "sketch",
        trial: false,
        extra: false,
        words: 15,
        files: [],
        references: [],
      },
      {
        name: "begin",
        kind: "start",
        slot: null,
        trial: false,
        extra: false,
        words: 14,
        files: [],
        references: [],
      },
      {
        name: "tidy",
        kind: "habit",
        slot: null,
        trial: true,
        extra: false,
        words: 12,
        files: [],
        references: [],
      },
      {
        name: "use-garden",
        kind: "habit",
        slot: null,
        trial: false,
        extra: false,
        words: 16,
        files: [],
        references: [],
      },
    ]);
  });

  it("J-93 S2 lists a skill's references pages apart from its reference files, the front's SKILL.md alone counted", () => {
    const pages = new Map([["check", new Set(["references/greenline.md"])]]);
    const report = budgetReport(installation(), undefined, [], pages);
    expect(report.skills[0]).toMatchObject({
      name: "check",
      words: 16,
      files: [{ path: "references/list.md", words: 6 }],
      references: [{ path: "references/greenline.md", words: 5 }],
    });
    // The references page is read apart: no mode's words move.
    expect(report.modes).toEqual(budgetReport(installation(), undefined, []).modes);
  });

  it("S23 measures only the modes named, and refuses a name the definition does not hold", () => {
    const report = budgetReport(installation(), undefined, ["careful", "slow"]);
    expect(report.modes.map((mode) => mode.mode)).toEqual(["careful"]);
    expect(report.refused).toEqual([
      { mode: "slow", message: "the modes definition holds no mode 'slow'" },
    ]);
  });

  it("S23 refuses a mode over its words budget, by name, when its account names no ruling", () => {
    const report = budgetReport(installation({ quick: 1000, careful: 150 }), recipe(), []);
    const most = BLOCK.garden + 31;
    expect(
      report.modes.map(({ mode, excess, ruled, refused }) => ({ mode, excess, ruled, refused })),
    ).toEqual([
      { mode: "quick", excess: 0, ruled: null, refused: false },
      { mode: "careful", excess: most - 150, ruled: null, refused: true },
    ]);
    expect(report.refused).toEqual([
      {
        mode: "careful",
        message: `mode 'careful' reads ${most} words, ${most - 150} over its words budget of 150, and the modes recipe's account for 'mode:careful' names no ruling on an excess`,
      },
    ]);
    expect(
      budgetReport(installation({ quick: 1000, careful: 150 }), undefined, []).refused,
    ).toEqual(report.refused);
  });

  it("J-123 S2 leaves a step that applies by a record fact out of a change without the fact, and judges the larger total", () => {
    const base = installation({ quick: 1000, careful: 150 });
    const gated: Installation = {
      ...base,
      modes: {
        ...base.modes,
        steps: base.modes.steps.map((step) =>
          step.name === "sketch" ? { ...step, appliesWhen: "interface" } : step,
        ),
      },
    };
    const careful = budgetReport(gated, undefined, []).modes[1];
    expect([careful?.total.garden, careful?.withoutFacts.garden]).toEqual([
      BLOCK.garden + 31,
      BLOCK.garden + 16,
    ]);
    expect(careful?.excess).toBe(BLOCK.garden + 31 - 150);
  });

  it("S23 a ruling on the excess in the mode's account lets it pass, and a smaller one is refused again", () => {
    const over = installation({ quick: 1000, careful: 150 });
    const excess = BLOCK.garden + 31 - 150;
    const ruling = 'The operator\'s words: "the careful mode may read the extra page"';
    const ruled = budgetReport(over, recipe({ words: excess, ruling }), []);
    expect(ruled.refused).toEqual([]);
    expect(ruled.modes[1]).toMatchObject({ excess, ruled: excess, refused: false });
    const short = budgetReport(over, recipe({ words: excess - 1, ruling }), []);
    expect(short.refused).toEqual([
      {
        mode: "careful",
        message: `mode 'careful' reads ${BLOCK.garden + 31} words, ${excess} over its words budget of 150, and the ruling in the modes recipe's account for 'mode:careful' names an excess of ${excess - 1}`,
      },
    ]);
  });

  it("S23 the table gives the operator each mode's column, the steps in the line's order and the skills apart", () => {
    const pages = new Map([["check", new Set(["references/greenline.md"])]]);
    const report = budgetReport(installation({ quick: 1000, careful: 150 }), recipe(), [], pages);
    expect(renderBudgetTable(report)).toBe(
      [
        "## The words an agent reads, per mode",
        "",
        "| Mode | quick | careful |",
        "| --- | --- | --- |",
        "| Agents, at most | 1 | 5 |",
        "| Fix rounds, per step | 0 | 1 |",
        "| Rounds, fixes and loops | 0 | 3 |",
        "| sketch, 15 words | none | independent, 2 agents |",
        "| check, 16 words | inline | looped, 2 rounds |",
        "| The block | 118 | 118 |",
        "| The block, garden enabled | 132 | 132 |",
        "| The steps' SKILL.md | 16 | 31 |",
        "| Front pages only its depths name | 0 | 0 |",
        "| Words read | 134 | 149 |",
        "| Words read, garden enabled | 148 | 163 |",
        "| Words read, garden enabled, no step a record fact gates | 148 | 163 |",
        "| Words budget | 1000 | 150 |",
        "| Against the budget | within | 13 over, refused |",
        "",
        "## Read apart, on demand",
        "",
        "A start loads once, a habit on its situation, a reference file when its skill sends the reader there, and a references page, the skill's mechanics, when its record section is written.",
        "",
        "| Skill | Kind | Marks | SKILL.md | Reference files | References |",
        "| --- | --- | --- | --- | --- | --- |",
        "| `check` | step |  | 16 | 6 in 1 file | 5 in 1 file |",
        "| `sketch` | step |  | 15 | none | none |",
        "| `begin` | start |  | 14 | none | none |",
        "| `tidy` | habit | trial | 12 | none | none |",
        "| `use-garden` | habit |  | 16 | none | none |",
        "",
        "## Refused",
        "",
        "- careful: mode 'careful' reads 163 words, 13 over its words budget of 150, and the modes recipe's account for 'mode:careful' names no ruling on an excess",
        "",
      ].join("\n"),
    );
  });
});

/**
 * The check step with pages of its front that its references page's depth
 * bullets name (J-98 S2; the operator's ruling of 2026-10-20, "Count it
 * against careful's ceiling"). Their words, counted by hand: `deep.md` 8,
 * named by careful's bullet alone; `both.md` 3, named by a bullet that names
 * quick and careful; `short.md` 5, named by a bullet that names no mode;
 * `shared.md` 6, named by careful's bullet and by the page's prose outside
 * the bullets; `hinted.md` 4, named by careful's bullet and by `SKILL.md`.
 */
const DEPTHS_PAGE = [
  "# Mechanics",
  "",
  "## The depths",
  "",
  "- **Inline, at quick.** Write the check section.",
  "- **Looped, at careful.** Read [the deep list](deep.md), [the shared list](shared.md)",
  "  and [the hint](hinted.md) whole, then write the check section.",
  "- **Inline, at quick and careful, when a fixture asks.** Read [both](both.md#top).",
  "- **Inline, where the harness has no delegation.** Read [the short list](short.md).",
  "",
  "At the looped depth the builder reads [the shared list](shared.md) again.",
  "",
].join("\n");

const CHECK_WITH_DEPTH_PAGES = skill("check", {
  kind: "step",
  slot: "check",
  description: "Check the fixture change.",
  body: "# Check\n\nRun the check; read [it](references/hinted.md).\n",
  supportFiles: [
    { path: "references/greenline.md", content: DEPTHS_PAGE },
    { path: "references/deep.md", content: "# The deep list\n\nEvery item is verified twice.\n" },
    { path: "references/both.md", content: "# Both\n\nCheck twice.\n" },
    { path: "references/short.md", content: "# The short list\n\nOne item.\n" },
    { path: "references/shared.md", content: "# The shared list\n\nRead it again.\n" },
    { path: "references/hinted.md", content: "# The hint\n\nRead first.\n" },
  ],
});

const WITH_DEPTH_PAGES = SKILLS.map((entry) =>
  entry.name === "check" ? CHECK_WITH_DEPTH_PAGES : entry,
);
const CHECK_REFERENCES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["check", new Set(["references/greenline.md"])],
]);

describe("J-98 S2 a front page only some modes' depths name counts against their ceilings", () => {
  it("J-98 S2 counts a page careful's depth bullet alone names in careful's total, and leaves out one SKILL.md, the page's prose or a bullet naming no mode also names", () => {
    const report = budgetReport(
      installation(undefined, WITH_DEPTH_PAGES),
      undefined,
      [],
      CHECK_REFERENCES,
    );
    // The check SKILL.md: its front matter's two fields and its body, 16 words.
    const check = 16;
    expect(report.modes.map(({ mode, pages, total }) => ({ mode, pages, total }))).toEqual([
      {
        mode: "quick",
        pages: [{ skill: "check", path: "references/both.md", words: 3 }],
        total: { default: BLOCK.default + check + 3, garden: BLOCK.garden + check + 3 },
      },
      {
        mode: "careful",
        pages: [
          { skill: "check", path: "references/deep.md", words: 8 },
          { skill: "check", path: "references/both.md", words: 3 },
        ],
        total: {
          default: BLOCK.default + 15 + check + 8 + 3,
          garden: BLOCK.garden + 15 + check + 8 + 3,
        },
      },
    ]);
  });

  it("J-98 S2 names no page without the references page that carries the depth bullets", () => {
    const report = budgetReport(installation(undefined, WITH_DEPTH_PAGES), undefined, []);
    expect(report.modes.map((mode) => mode.pages)).toEqual([[], []]);
  });

  it("J-98 S2 refuses careful when the page careful alone reads takes it past its ceiling, and the table prints the pages' row", () => {
    // Within the ceiling by the step skills alone, over it by the pages careful reads.
    const ceiling = BLOCK.garden + 15 + 16 + 5;
    const report = budgetReport(
      installation({ quick: 1000, careful: ceiling }, WITH_DEPTH_PAGES),
      undefined,
      [],
      CHECK_REFERENCES,
    );
    const read = BLOCK.garden + 15 + 16 + 11;
    expect(report.refused).toEqual([
      {
        mode: "careful",
        message: `mode 'careful' reads ${read} words, ${read - ceiling} over its words budget of ${ceiling}, and the modes recipe's account for 'mode:careful' names no ruling on an excess`,
      },
    ]);
    const table = renderBudgetTable(report).split("\n");
    expect(table).toContain("| The steps' SKILL.md | 16 | 31 |");
    expect(table).toContain("| Front pages only its depths name | 3 | 11 |");
    expect(table).toContain(`| Words read | ${BLOCK.default + 19} | ${BLOCK.default + 42} |`);
  });
});

/**
 * The check step cut as J-180 S1 cut every front (J-181 S1; the register's
 * row of 2026-11-06, "The words budget bounds the first move"): its
 * `SKILL.md` points at its method page, `method.md`, and names the moment it
 * is read, and at its references page. The words, counted by hand:
 * `method.md` 8; `references/list.md` 6, which no page links.
 */
const CHECK_WITH_METHOD = skill("check", {
  kind: "step",
  slot: "check",
  description: "Check the fixture change.",
  body: "# Check\n\nBefore the run read [method.md](method.md); write [it](references/greenline.md).\n",
  supportFiles: [
    { path: "method.md", content: "# Method\n\nRun every check, then read each result.\n" },
    { path: "references/list.md", content: "# The list\n\nEvery item is verified.\n" },
    { path: "references/greenline.md", content: "# Mechanics\n\nWrite the check section.\n" },
  ],
});

describe("J-181 S1 the moment pages, printed per step beside each mode and uncapped", () => {
  const withMethod = SKILLS.map((entry) => (entry.name === "check" ? CHECK_WITH_METHOD : entry));

  it("J-181 S1 names each page of a step's front its SKILL.md points to, with its words, and counts none of them against a ceiling", () => {
    const report = budgetReport(
      installation(undefined, withMethod),
      undefined,
      [],
      CHECK_REFERENCES,
    );
    expect(report.line).toEqual([
      { step: "sketch", skills: ["sketch"], words: 15, moments: [] },
      {
        step: "check",
        skills: ["check"],
        words: wordsOf(
          '---\nname: "check"\ndescription: "Check the fixture change."\n---\n\n# Check\n\nBefore the run read [method.md](method.md); write [it](references/greenline.md).\n',
        ).length,
        moments: [{ skill: "check", path: "method.md", words: 8 }],
      },
    ]);
    // The method page is read at its moment: the ceiling counts the first move alone.
    const check = report.line[1]?.words ?? 0;
    expect(report.modes.map(({ mode, total }) => ({ mode, total }))).toEqual([
      { mode: "quick", total: { default: BLOCK.default + check, garden: BLOCK.garden + check } },
      {
        mode: "careful",
        total: { default: BLOCK.default + 15 + check, garden: BLOCK.garden + 15 + check },
      },
    ]);
  });

  it("J-181 S1 prints the moment pages per step, each mode's column naming the words where the mode runs the step", () => {
    const report = budgetReport(
      installation(undefined, withMethod),
      undefined,
      [],
      CHECK_REFERENCES,
    );
    const table = renderBudgetTable(report);
    expect(table).toContain(
      [
        "## The moment pages, per step, uncapped",
        "",
        "A step's front points at each page below and names the moment it is read; the ceiling above bounds the first move, and these pages stand outside it.",
        "",
        "| Step | Pages | quick | careful |",
        "| --- | --- | --- | --- |",
        "| sketch | none | not run | 0 |",
        "| check | `method.md` of `check`, 8 words | 8 | 8 |",
        "| Moment pages |  | 8 | 8 |",
        "",
      ].join("\n"),
    );
    // A roster whose fronts point at no page prints no such section.
    expect(renderBudgetTable(budgetReport(installation(), undefined, []))).not.toContain(
      "## The moment pages",
    );
  });
});

describe("S23 the budget verb", () => {
  it("S23 reads the rulings from the corpus's modes recipe and fails on a refusal", () => {
    const corpus = temporary("greenline-budget-");
    mkdirSync(join(corpus, "recipes"));
    const over = installation({ quick: 1000, careful: 150 });
    expect(budgetVerb(corpus, { _tag: "ok", value: over }, []).failed).toBe(true);
    const excess = BLOCK.garden + 31 - 150;
    writeFileSync(
      join(corpus, "recipes/modes.json"),
      JSON.stringify({
        schema: "greenline.modes-recipe/v1",
        definition: { path: "runtime/modes.json", sha256: "a".repeat(64) },
        parts: [
          {
            part: "mode:careful",
            kind: "method",
            reason: "r",
            ruling: "w",
            excess: { words: excess, ruling: "The operator's words" },
          },
        ],
      }),
    );
    const ruled = budgetVerb(corpus, { _tag: "ok", value: over }, []);
    expect(ruled.failed).toBe(false);
    expect(ruled.output.modes[1]?.ruled).toBe(excess);
  });

  it("S23 refuses a modes recipe it cannot parse and an installation that could not be compiled", () => {
    const corpus = temporary("greenline-budget-");
    mkdirSync(join(corpus, "recipes"));
    writeFileSync(join(corpus, "recipes/modes.json"), "{");
    expect(budgetVerb(corpus, { _tag: "ok", value: installation() }, []).output.refused).toEqual([
      { mode: "*", message: "corpus/recipes/modes.json : the recipe is not valid JSON" },
    ]);
    const failed = contractFailure("corpus", [{ path: "runtime", message: "unavailable" }]);
    if (failed._tag === "ok") throw new Error("a failure");
    expect(budgetVerb(corpus, failed, [])).toEqual({
      output: {
        verb: "budget",
        block: null,
        line: [],
        modes: [],
        skills: [],
        keepers: {
          promises: 0,
          none: [],
          kept: 0,
          byKind: { fact: 0, hold: 0, record: 0, oracle: 0, gap: 0 },
          byCost: { free: 0, cheap: 0, dear: 0 },
          gaps: { mechanism: 0, prose: 0 },
          holds: [],
          owed: 0,
        },
        refused: [{ mode: "*", message: "corpus runtime: unavailable" }],
      },
      failed: true,
    });
  });

  it("J-153 S3 refuses a skill's recipe it cannot read, since the keepers it counts would be short", () => {
    const corpus = temporary("greenline-budget-");
    mkdirSync(join(corpus, "recipes"));
    writeFileSync(join(corpus, "recipes/probe.json"), "{");
    expect(budgetVerb(corpus, { _tag: "ok", value: installation() }, []).output.refused).toEqual([
      { mode: "*", message: "corpus/recipes/probe.json : the recipe is not valid JSON" },
    ]);
  });
});

/** The words of a golden block, as the corpus counts them. */
const goldenWords = (path: string): number =>
  wordsOf(readFileSync(join(repository, path), "utf8")).length;

describe("S23 scripts/corpus.mjs budget on this tree", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/corpus.mjs", "budget", ...args], {
      cwd: repository,
      encoding: "utf8",
    });

  it("S23 measures every mode of the definition, refuses none, and reads the blocks the goldens hold", () => {
    const result = run();
    expect(result.status).toBe(0);
    // SAFETY: the script prints the verb's report, a BudgetOutput, as JSON.
    const report = JSON.parse(result.stdout) as BudgetOutput;
    expect(report.refused).toEqual([]);
    expect(report.block).toEqual({
      default: goldenWords("test/goldens/corpus/AGENTS.md"),
      garden: goldenWords("test/goldens/garden-enabled/AGENTS.md"),
    });
    const definition = parseModes(
      readFileSync(join(repository, "corpus/runtime/modes.json"), "utf8"),
      "modes.json",
    );
    if (definition._tag === "err") throw definition.error;
    expect(report.modes.map((mode) => [mode.mode, mode.budget])).toEqual(
      definition.value.modes.map((mode) => [mode.name, mode.budget.words]),
    );
    for (const mode of report.modes)
      expect(Math.max(mode.total.default, mode.total.garden)).toBeLessThanOrEqual(mode.budget);
  });

  it("S23 prints the operator's table with --table, and refuses an unknown mode and an unknown flag", () => {
    const table = run("--table", "quick");
    expect(table.status).toBe(0);
    expect(table.stdout.split("\n").slice(0, 4)).toEqual([
      "## The words an agent reads, per mode",
      "",
      "| Mode | quick |",
      "| --- | --- |",
    ]);
    const unknown = run("slow");
    expect(unknown.status).toBe(1);
    // SAFETY: the script prints the verb's report, a BudgetOutput, as JSON.
    expect((JSON.parse(unknown.stdout) as BudgetOutput).refused).toEqual([
      { mode: "slow", message: "the modes definition holds no mode 'slow'" },
    ]);
    const flag = run("--wide");
    expect(flag.status).toBe(1);
    expect(JSON.parse(flag.stdout)).toMatchObject({ verb: "budget" });
  });
});

describe("S23 the corpus-budget gate row", () => {
  /** A tree holding the gate script, the instrument and the product code, and the corpus `setup` writes. */
  function gateTree(setup: (root: string) => void): string {
    const root = temporary("greenline-budget-row-");
    for (const path of [
      "scripts/check.mjs",
      "scripts/corpus.mjs",
      "scripts/lib/commit-subject.mjs",
      "scripts/lib/gate-outcome.mjs",
      "scripts/lib/name-boundary.mjs",
      "THIRD_PARTY_NOTICES.md",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(join(repository, path), join(root, path));
    }
    symlinkSync(join(repository, "src"), join(root, "src"), "dir");
    symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
    setup(root);
    return root;
  }

  function runRow(root: string) {
    const result = spawnSync(process.execPath, ["scripts/check.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CHECK_ROWS: "corpus-budget" },
    });
    const line = result.stdout
      .split("\n")
      .find((text) => text.startsWith("corpus-budget "))
      ?.replace(/\s+/g, " ");
    return { status: result.status, line, stdout: result.stdout };
  }

  it("S23 passes on this tree, whose modes all read within their words budgets", () => {
    const result = runRow(
      gateTree((root) => symlinkSync(join(repository, "corpus"), join(root, "corpus"), "dir")),
    );
    expect(result.status).toBe(0);
    expect(result.line).toBe("corpus-budget PASS");
  });

  it("S23 fails on a corpus whose quick mode reads more than its words budget, naming the mode", () => {
    const result = runRow(
      gateTree((root) => {
        const corpus = join(root, "corpus");
        mkdirSync(join(corpus, "runtime"), { recursive: true });
        for (const path of ["manifest.json", "skills"])
          symlinkSync(join(repository, "corpus", path), join(corpus, path));
        // The recipes as they stand, the modes recipe's excesses taken out, so the tight ceiling meets no ruling (J-107 S3 gave each mode one).
        mkdirSync(join(corpus, "recipes"));
        for (const file of readdirSync(join(repository, "corpus/recipes")))
          if (file !== "modes.json")
            symlinkSync(join(repository, "corpus/recipes", file), join(corpus, "recipes", file));
        // SAFETY: the modes recipe the corpus verifies is an object whose parts are objects.
        const unruled = JSON.parse(
          readFileSync(join(repository, "corpus/recipes/modes.json"), "utf8"),
        ) as { parts: { excess?: unknown }[] };
        for (const part of unruled.parts) delete part.excess;
        writeFileSync(join(corpus, "recipes/modes.json"), `${JSON.stringify(unruled, null, 2)}\n`);
        for (const guide of ["agent.md", "work.md", "ledger.md"])
          copyFileSync(join(repository, "corpus/runtime", guide), join(corpus, "runtime", guide));
        const definition = readFileSync(join(repository, "corpus/runtime/modes.json"), "utf8");
        const tight = definition.replace(
          /"budget": \{\s*"words": \d+\s*\}/,
          '"budget": { "words": 100 }',
        );
        expect(tight).not.toBe(definition);
        writeFileSync(join(corpus, "runtime/modes.json"), tight);
      }),
    );
    expect(result.status).toBe(1);
    expect(result.line).toMatch(
      /^corpus-budget FAIL — corpus-budget refused 1: quick: mode 'quick' reads \d+ words, \d+ over its words budget of 100, and the modes recipe's account for 'mode:quick' names no ruling on an excess$/,
    );
  });

  it("J-153 S3 prints the keepers by kind and by cost, and fails a corpus whose holds name more hook rules than the cap", () => {
    const passing = runRow(
      gateTree((root) => symlinkSync(join(repository, "corpus"), join(root, "corpus"), "dir")),
    );
    expect(passing.stdout).toMatch(
      /keepers: \d+ promises, \d+ kept \(fact \d+, hold \d+, record \d+, oracle \d+, gap \d+; free \d+, cheap \d+, dear \d+\), \d+ hook rules held \(cap \d+\)/,
    );
    const result = runRow(
      gateTree((root) => {
        const corpus = join(root, "corpus");
        mkdirSync(corpus);
        for (const path of ["manifest.json", "skills", "runtime"])
          symlinkSync(join(repository, "corpus", path), join(corpus, path));
        mkdirSync(join(corpus, "recipes"));
        for (const file of readdirSync(join(repository, "corpus/recipes")))
          if (file !== "secrets.json")
            symlinkSync(join(repository, "corpus/recipes", file), join(corpus, "recipes", file));
        // SAFETY: a skill's recipe is an object whose keepers are a list.
        const planted = JSON.parse(
          readFileSync(join(repository, "corpus/recipes/secrets.json"), "utf8"),
        ) as { keepers: unknown[] };
        for (let at = 0; at < 40; at += 1)
          planted.keepers.push({
            promise: `A planted promise ${String(at)}.`,
            page: "SKILL.md",
            kind: "hold",
            where: `planted-rule-${String(at)}`,
            cost: "cheap",
          });
        writeFileSync(
          join(corpus, "recipes/secrets.json"),
          `${JSON.stringify(planted, null, 2)}\n`,
        );
      }),
    );
    expect(result.status).toBe(1);
    expect(result.line).toMatch(
      /^corpus-budget FAIL — corpus-budget refused 1: the holds name \d+ hook rules, past the cap of \d+ \(.*planted-rule-0.*\); retire or merge one, or a register row raises the cap$/,
    );
  });
});
