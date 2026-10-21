import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentsAtMost,
  depthOf,
  meetsFloor,
  noneLine,
  parseModes,
  recordSections,
  renderModeTable,
  roundsAtMost,
  type Floor,
  type Mode,
  type ModesDefinition,
  type StepName,
} from "../../src/core/modes.ts";

const corpusModes = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");

function parsed(text: string): ModesDefinition {
  const result = parseModes(text, "modes.json");
  if (result._tag === "err") throw result.error;
  return result.value;
}

const corpus = (): ModesDefinition => parsed(readFileSync(corpusModes, "utf8"));

function modeOf(definition: ModesDefinition, name: string): Mode {
  const mode = definition.modes.find((entry) => entry.name === name);
  if (mode === undefined) throw new Error(`the definition has no mode '${name}'`);
  return mode;
}

function stepOf(definition: ModesDefinition, name: string): StepName {
  const step = definition.steps.find((entry) => entry.name === name);
  if (step === undefined) throw new Error(`the definition has no step '${name}'`);
  return step.name;
}

function floorOf(definition: ModesDefinition, name: string): Floor {
  const floor = definition.floors.find((entry) => entry.name === name);
  if (floor === undefined) throw new Error(`the definition has no floor '${name}'`);
  return floor;
}

/** The written form a test edits before the parse sees it; any string may stand where a name or depth goes. */
interface SampleDepth {
  readonly depth: string;
  readonly agents?: number;
  readonly rounds?: number;
}
interface SampleMode {
  readonly name: string;
  readonly promise: string;
  readonly typicalRequest: string;
  readonly fixRounds: number;
  readonly budget?: { readonly words?: unknown };
  readonly steps: { readonly [step: string]: SampleDepth };
}
interface SampleFloor {
  readonly name: string;
  readonly risk: string;
  readonly mode: string;
}
interface SampleKind {
  readonly name: string;
  readonly mechanism: string;
  readonly record: string;
  readonly place: string;
  readonly budget: string;
  readonly when: string;
}
interface SampleDefinition {
  readonly schemaVersion: number;
  readonly kinds: readonly SampleKind[];
  readonly steps: readonly {
    readonly name: string;
    readonly whenSplit: string;
    readonly fixPass: boolean;
  }[];
  readonly modes: readonly SampleMode[];
  readonly floors: readonly SampleFloor[];
}

// A small definition whose names are none of the corpus's, so nothing can pass by naming them.
function brisk(
  steps: SampleMode["steps"] = { sketch: { depth: "inline" }, check: { depth: "none" } },
): SampleMode {
  return {
    name: "brisk",
    promise: "soon",
    typicalRequest: "a typo",
    fixRounds: 0,
    budget: { words: 500 },
    steps,
  };
}

function sure(
  steps: SampleMode["steps"] = {
    sketch: { depth: "independent", agents: 2 },
    check: { depth: "looped", rounds: 2 },
  },
): SampleMode {
  return {
    name: "sure",
    promise: "certain",
    typicalRequest: "a migration",
    fixRounds: 1,
    budget: { words: 2000 },
    steps,
  };
}

const security = (): SampleFloor => ({
  name: "security",
  risk: "secrets or security",
  mode: "sure",
});

/** The three kinds the loop runs today, with when-sentences of the sample's own. */
function kinds(): SampleKind[] {
  return [
    {
      name: "step",
      mechanism: "reach",
      record: "section",
      place: "ordered",
      budget: "counts",
      when: "A step runs where the mode reaches it.",
    },
    {
      name: "start",
      mechanism: "open",
      record: "section",
      place: "beside",
      budget: "free",
      when: "A start is chosen when a request begins.",
    },
    {
      name: "habit",
      mechanism: "arise",
      record: "none",
      place: "beside",
      budget: "free",
      when: "A habit loads when its situation arises.",
    },
  ];
}

function sample(modes: readonly SampleMode[] = [brisk(), sure()]): SampleDefinition {
  return {
    schemaVersion: 5,
    kinds: kinds(),
    steps: [
      { name: "sketch", whenSplit: "plan", fixPass: true },
      { name: "check", whenSplit: "both", fixPass: true },
    ],
    modes,
    floors: [security()],
  };
}

function refusal(value: SampleDefinition) {
  return parseModes(JSON.stringify(value), "modes.json");
}

function issues(path: string, message: string) {
  return { _tag: "err", error: expect.objectContaining({ issues: [{ path, message }] }) };
}

describe("the modes definition", () => {
  it("J-93 S1 the corpus definition parses and renders the three modes' table in 15 lines", () => {
    const table = renderModeTable(corpus());
    expect(table).toBe(
      [
        "| Mode | quick | regular | careful |",
        "| --- | --- | --- | --- |",
        "| Promise | quick, the builder alone | one fresh review and one fix pass | the premise attacked, two reviews and a fresh verifier |",
        "| Typical request | a settled one-commit fix | a bounded change with a clear goal | open decisions, a floor, or several tickets |",
        "| Agents, at most | 1 | 2 | 5 |",
        "| frame | inline | written | written |",
        "| plan | inline | written | written |",
        "| anticipate | none | none | independent, 1 agent |",
        "| build | inline | written | written |",
        "| review | none | independent, 1 agent | independent, 2 agents |",
        "| verify | inline | written | independent, 1 agent |",
        "| close | inline | written | written |",
        "| Fix rounds, per step | 0 | 1 | 2 |",
        "",
        "The agents count the builder; review and verify each take the mode's fix rounds.",
        "",
      ].join("\n"),
    );
  });

  it("J-93 S1 the table explains a loop only where a mode loops", () => {
    const own = parsed(JSON.stringify(sample()));
    expect(renderModeTable(own)).toContain(
      "The agents count the builder. A looped step repeats until clean, and its rounds include its fixes; outside a loop, sketch and check each take the mode's fix rounds.",
    );
  });

  it("S2 a definition with names of its own parses to exactly what it states", () => {
    expect(refusal(sample())).toEqual({ _tag: "ok", value: sample() });
  });

  it("R5 the corpus definition declares the three kinds, each with its mechanism, its contract and its when-sentence", () => {
    expect(corpus().kinds.map(({ when, ...kind }) => ({ ...kind, when: when.length > 0 }))).toEqual(
      [
        {
          name: "step",
          mechanism: "reach",
          record: "section",
          place: "ordered",
          budget: "counts",
          when: true,
        },
        {
          name: "start",
          mechanism: "open",
          record: "section",
          place: "beside",
          budget: "free",
          when: true,
        },
        {
          name: "habit",
          mechanism: "arise",
          record: "none",
          place: "beside",
          budget: "free",
          when: true,
        },
      ],
    );
  });

  it("R5 a kind made of the mechanisms the loop runs parses as data, with no code of its own", () => {
    const gate: SampleKind = {
      name: "gate",
      mechanism: "reach",
      record: "line",
      place: "ordered",
      budget: "free",
      when: "A gate holds the change where the mode reaches it until its check passes.",
    };
    const withGate = { ...sample(), kinds: [...kinds(), gate] };
    expect(refusal(withGate)).toEqual({ _tag: "ok", value: withGate });
  });
});

describe("the parse refuses a kind", () => {
  it("R5 refuses a definition without kinds, by name", () => {
    const { kinds: _kinds, ...without } = sample();
    expect(parseModes(JSON.stringify(without), "modes.json")).toEqual(
      issues("kinds", "the modes definition declares its kinds"),
    );
  });

  it.each([
    ["mechanism", "dispatch", "a mechanism is reach, open or arise, not 'dispatch'"],
    ["record", "report", "a kind's record is section, line or none, not 'report'"],
    ["place", "parallel", "a kind's place is ordered or beside, not 'parallel'"],
    ["budget", "spends", "a kind's budget is counts or free, not 'spends'"],
  ])("R5 refuses a %s the loop does not run, by name", (field, value, message) => {
    const changed = kinds().map((kind, index) =>
      index === 1 ? { ...kind, [field]: value } : kind,
    );
    expect(refusal({ ...sample(), kinds: changed })).toEqual(issues(`kinds[1].${field}`, message));
  });

  it("R5 refuses a duplicate kind name", () => {
    const [step, start, habit] = kinds();
    if (step === undefined || start === undefined || habit === undefined) throw new Error("three");
    expect(refusal({ ...sample(), kinds: [step, start, habit, { ...start }] })).toEqual(
      issues("kinds[3].name", "duplicate kind 'start'"),
    );
  });

  it("R5 refuses a definition with no step kind, since the steps list names it", () => {
    expect(refusal({ ...sample(), kinds: kinds().slice(1) })).toEqual(
      issues(
        "kinds",
        "the steps list names the kind 'step', which the definition does not declare",
      ),
    );
  });

  it("R5 refuses the step kind placed beside the line, since the steps list is the line", () => {
    const changed = kinds().map((kind) =>
      kind.name === "step" ? { ...kind, place: "beside" } : kind,
    );
    expect(refusal({ ...sample(), kinds: changed })).toEqual(
      issues("kinds[0].place", "the kind 'step' is the steps list's, so its place is ordered"),
    );
  });

  it("R5 refuses a kind name that is not an identifier, an empty when-sentence and a field a kind does not define", () => {
    const [step, start, habit] = kinds();
    if (step === undefined || start === undefined || habit === undefined) throw new Error("three");
    const text = JSON.stringify({
      ...sample(),
      kinds: [step, { ...start, name: "Start" }, { ...habit, when: "", owner: "x" }],
    });
    expect(parseModes(text, "modes.json")).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [
          {
            path: "kinds[1].name",
            message: "Invalid string: must match pattern /^[a-z][a-z0-9-]*$/",
          },
          { path: "kinds[2].when", message: "Too small: expected string to have >=1 characters" },
          { path: "kinds[2]", message: 'Unrecognized key: "owner"' },
        ],
      }),
    });
  });

  it("R5 refuses the old schema version by version", () => {
    const { schemaVersion: _version, ...unversioned } = sample();
    expect(parseModes(JSON.stringify(unversioned), "modes.json")).toEqual(
      issues(
        "schemaVersion",
        "unsupported modes definition schema version 'undefined' (expected 5)",
      ),
    );
    expect(parseModes(JSON.stringify({ ...sample(), schemaVersion: 1 }), "modes.json")).toEqual(
      issues("schemaVersion", "unsupported modes definition schema version '1' (expected 5)"),
    );
  });

  it("S23 refuses a definition of schema 2, which carried no words budget, by its version", () => {
    const modes = sample().modes.map(({ budget: _budget, ...mode }) => mode);
    expect(refusal({ ...sample(), schemaVersion: 2, modes })).toEqual(
      issues("schemaVersion", "unsupported modes definition schema version '2' (expected 5)"),
    );
  });

  it("J-93 S1 refuses a definition of schema 4, which marked a trial step, by its version", () => {
    const steps = sample().steps.map((step) => ({ ...step, trial: false }));
    const text = JSON.stringify({ ...sample(), schemaVersion: 4, steps });
    expect(parseModes(text, "modes.json")).toEqual(
      issues("schemaVersion", "unsupported modes definition schema version '4' (expected 5)"),
    );
  });

  it("J-93 S1 refuses a step that states a trial mark, which schema 5 dropped", () => {
    const steps = [{ ...sample().steps[0], trial: true }, ...sample().steps.slice(1)];
    expect(parseModes(JSON.stringify({ ...sample(), steps }), "modes.json")).toEqual(
      issues("steps[0]", 'Unrecognized key: "trial"'),
    );
  });

  it("J-73 S2 refuses a definition of schema 3, which stated each mode's agents, by its version", () => {
    const modes = sample().modes.map((mode) => ({ ...mode, agents: 1 }));
    const steps = sample().steps.map(({ fixPass: _fixPass, ...step }) => step);
    const text = JSON.stringify({ ...sample(), schemaVersion: 3, steps, modes });
    expect(parseModes(text, "modes.json")).toEqual(
      issues("schemaVersion", "unsupported modes definition schema version '3' (expected 5)"),
    );
  });

  it("S23, J-93 S1 and J-93 S2 the corpus definition gives each mode its words budget, a ceiling the split lowered", () => {
    expect(
      Object.fromEntries(corpus().modes.map((mode) => [mode.name, mode.budget.words])),
    ).toEqual({ quick: 9500, regular: 10400, careful: 11700 });
  });

  it("S23 refuses a mode that states no words budget, by the mode's name", () => {
    const { budget: _budget, ...unbudgeted } = sure();
    expect(refusal(sample([brisk(), unbudgeted]))).toEqual(
      issues("modes[1]", "mode 'sure' states no words budget, budget.words"),
    );
    expect(refusal(sample([brisk(), { ...sure(), budget: {} }]))).toEqual(
      issues("modes[1].budget", "mode 'sure' states no words budget, budget.words"),
    );
  });

  it.each([
    [0, "0"],
    [-200, "-200"],
    [1500.5, "1500.5"],
  ])("S23 refuses a words budget of %s, by the mode's name", (words, shown) => {
    expect(refusal(sample([{ ...brisk(), budget: { words } }, sure()]))).toEqual(
      issues(
        "modes[0].budget.words",
        `mode 'brisk' states a words budget of ${shown}; a words budget is a whole number of words, at least 1`,
      ),
    );
  });

  it("S23 refuses a words budget that is not a number and a field a budget does not define", () => {
    expect(refusal(sample([{ ...brisk(), budget: { words: "many" } }, sure()]))).toEqual(
      issues("modes[0].budget.words", "Invalid input: expected number, received string"),
    );
    const text = JSON.stringify({
      ...sample(),
      modes: [{ ...brisk(), budget: { words: 500, agents: 1 } }, sure()],
    });
    expect(parseModes(text, "modes.json")).toEqual(
      issues("modes[0].budget", 'Unrecognized key: "agents"'),
    );
  });
});

describe("the parse refuses", () => {
  it("S2 refuses text that is not JSON", () => {
    expect(parseModes("{", "modes.json")).toEqual(
      issues("", "the modes definition is not valid JSON"),
    );
  });

  it("S2 refuses a field the definition does not define", () => {
    expect(parseModes(JSON.stringify({ ...sample(), budgets: [] }), "modes.json")).toEqual(
      issues("", 'Unrecognized key: "budgets"'),
    );
  });

  it("S2 refuses a mode that gives no depth for a step", () => {
    expect(refusal(sample([brisk({ sketch: { depth: "inline" } }), sure()]))).toEqual(
      issues("modes[0].steps", "mode 'brisk' gives no depth for the step 'check'"),
    );
  });

  it("S2 refuses a mode that names a step the definition lacks", () => {
    const polished = brisk({ ...brisk().steps, polish: { depth: "inline" } });
    expect(refusal(sample([polished, sure()]))).toEqual(
      issues("modes[0].steps.polish", "mode 'brisk' names 'polish', which is not a step"),
    );
  });

  it("S2 refuses a depth the code does not know", () => {
    const deep = brisk({ sketch: { depth: "deep" }, check: { depth: "none" } });
    expect(refusal(sample([deep, sure()]))).toEqual(
      issues(
        "modes[0].steps.sketch.depth",
        "Invalid discriminator value. Expected 'none' | 'inline' | 'written' | 'independent' | 'looped'",
      ),
    );
  });

  it("S2 refuses a looped depth that states no rounds, so a loop cannot run uncapped", () => {
    const uncapped = sure({ ...sure().steps, check: { depth: "looped" } });
    expect(refusal(sample([brisk(), uncapped]))).toEqual(
      issues("modes[1].steps.check.rounds", "Invalid input: expected number, received undefined"),
    );
  });

  it("J-73 S2 refuses a mode that states its agents, which the definition derives", () => {
    const text = JSON.stringify({ ...sample(), modes: [brisk(), { ...sure(), agents: 3 }] });
    expect(parseModes(text, "modes.json")).toEqual(
      issues("modes[1]", 'Unrecognized key: "agents"'),
    );
  });

  it("S2 refuses an independent depth with fewer than one agent", () => {
    const unstaffed = sure({ ...sure().steps, sketch: { depth: "independent", agents: 0 } });
    expect(refusal(sample([brisk(), unstaffed]))).toEqual(
      issues("modes[1].steps.sketch.agents", "Too small: expected number to be >=1"),
    );
  });

  it("S2 refuses a looped depth with fewer than one round", () => {
    const empty = sure({ ...sure().steps, check: { depth: "looped", rounds: 0 } });
    expect(refusal(sample([brisk(), empty]))).toEqual(
      issues("modes[1].steps.check.rounds", "Too small: expected number to be >=1"),
    );
  });

  it("S2 refuses fix rounds below zero", () => {
    expect(refusal(sample([{ ...brisk(), fixRounds: -1 }, sure()]))).toEqual(
      issues("modes[0].fixRounds", "Too small: expected number to be >=0"),
    );
  });

  it("S2 refuses a duplicate step name", () => {
    const steps = [...sample().steps, { name: "sketch", whenSplit: "plan", fixPass: true }];
    expect(refusal({ ...sample(), steps })).toEqual(
      issues("steps[2].name", "duplicate step 'sketch'"),
    );
  });

  it("S2 refuses a duplicate mode name", () => {
    expect(refusal(sample([brisk(), sure(), brisk()]))).toEqual(
      issues("modes[2].name", "duplicate mode 'brisk'"),
    );
  });

  it("S2 refuses a duplicate floor name", () => {
    expect(refusal({ ...sample(), floors: [security(), security()] })).toEqual(
      issues("floors[1].name", "duplicate floor 'security'"),
    );
  });

  it("S2 refuses a floor that names no mode", () => {
    expect(refusal({ ...sample(), floors: [{ ...security(), mode: "careful" }] })).toEqual(
      issues("floors[0].mode", "floor 'security' names 'careful', which is not a mode"),
    );
  });

  const notIdentifier = "Invalid string: must match pattern /^[a-z][a-z0-9-]*$/";

  it("S2 refuses a step name that is not an identifier, where it is listed and where a mode keys it", () => {
    const steps = [
      { name: "Sketch", whenSplit: "plan", fixPass: true },
      ...sample().steps.slice(1),
    ];
    const modes = [
      brisk({ Sketch: { depth: "inline" }, check: { depth: "none" } }),
      sure({ Sketch: { depth: "independent", agents: 2 }, check: { depth: "looped", rounds: 2 } }),
    ];
    expect(refusal({ ...sample(modes), steps })).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [
          { path: "steps[0].name", message: notIdentifier },
          { path: "modes[0].steps.Sketch", message: "Invalid key in record" },
          { path: "modes[1].steps.Sketch", message: "Invalid key in record" },
        ],
      }),
    });
  });

  it("S2 refuses a mode name that is not an identifier", () => {
    expect(refusal(sample([{ ...brisk(), name: "Quick" }, sure()]))).toEqual(
      issues("modes[0].name", notIdentifier),
    );
  });

  it("S2 refuses a floor name that is not an identifier", () => {
    expect(refusal({ ...sample(), floors: [{ ...security(), name: "secrets!" }] })).toEqual(
      issues("floors[0].name", notIdentifier),
    );
  });

  const empty = "Too small: expected string to have >=1 characters";

  it("S2 refuses an empty promise", () => {
    expect(refusal(sample([{ ...brisk(), promise: "" }, sure()]))).toEqual(
      issues("modes[0].promise", empty),
    );
  });

  it("S2 refuses an empty typical request", () => {
    expect(refusal(sample([{ ...brisk(), typicalRequest: "" }, sure()]))).toEqual(
      issues("modes[0].typicalRequest", empty),
    );
  });

  it("S2 refuses an empty risk", () => {
    expect(refusal({ ...sample(), floors: [{ ...security(), risk: "" }] })).toEqual(
      issues("floors[0].risk", empty),
    );
  });

  // Each depth's object is strict on its own, so each gets its own case.
  it.each([
    ["none", "check", { depth: "none", rounds: 1 }, "rounds"],
    ["inline", "sketch", { depth: "inline", agents: 1 }, "agents"],
    ["written", "sketch", { depth: "written", rounds: 1 }, "rounds"],
    ["independent", "sketch", { depth: "independent", agents: 2, rounds: 1 }, "rounds"],
    ["looped", "check", { depth: "looped", rounds: 2, agents: 1 }, "agents"],
  ])("S2 refuses a field a %s depth does not carry", (_name, step, stated, extra) => {
    const loaded = sure({ ...sure().steps, [step]: stated });
    expect(refusal(sample([brisk(), loaded]))).toEqual(
      issues(`modes[1].steps.${step}`, `Unrecognized key: "${extra}"`),
    );
  });

  it("S2 refuses a field a step entry does not define", () => {
    const text = JSON.stringify({
      ...sample(),
      steps: [
        { name: "sketch", whenSplit: "plan", fixPass: true, owner: "x" },
        { name: "check", whenSplit: "both", fixPass: true },
      ],
    });
    expect(parseModes(text, "modes.json")).toEqual(issues("steps[0]", 'Unrecognized key: "owner"'));
  });

  it("S3 refuses a step that does not say which record holds it when the work is split", () => {
    const steps = [{ name: "sketch", fixPass: true }, ...sample().steps.slice(1)];
    expect(parseModes(JSON.stringify({ ...sample(), steps }), "modes.json")).toEqual(
      issues("steps[0].whenSplit", 'Invalid option: expected one of "plan"|"ticket"|"both"'),
    );
  });

  it("J-73 S2 refuses a step that does not say whether its findings take a fix pass", () => {
    const steps = [{ name: "sketch", whenSplit: "plan" }, ...sample().steps.slice(1)];
    expect(parseModes(JSON.stringify({ ...sample(), steps }), "modes.json")).toEqual(
      issues("steps[0].fixPass", "Invalid input: expected boolean, received undefined"),
    );
  });

  it("S3 refuses a whenSplit other than plan, ticket or both", () => {
    const steps = [
      { name: "sketch", whenSplit: "spec", fixPass: true },
      ...sample().steps.slice(1),
    ];
    expect(refusal({ ...sample(), steps })).toEqual(
      issues("steps[0].whenSplit", 'Invalid option: expected one of "plan"|"ticket"|"both"'),
    );
  });

  it("S2 refuses a field a mode does not define", () => {
    const text = JSON.stringify({ ...sample(), modes: [{ ...brisk(), owner: "x" }, sure()] });
    expect(parseModes(text, "modes.json")).toEqual(issues("modes[0]", 'Unrecognized key: "owner"'));
  });

  it("S2 refuses a field a floor does not define", () => {
    const text = JSON.stringify({ ...sample(), floors: [{ ...security(), owner: "x" }] });
    expect(parseModes(text, "modes.json")).toEqual(
      issues("floors[0]", 'Unrecognized key: "owner"'),
    );
  });
});

describe("what the definition answers", () => {
  it("S2 the depth of a step in a mode is the one the definition states", () => {
    const modes = corpus();
    expect(depthOf(modeOf(modes, "careful"), stepOf(modes, "review"))).toEqual({
      depth: "independent",
      agents: 2,
    });
    expect(depthOf(modeOf(modes, "careful"), stepOf(modes, "anticipate"))).toEqual({
      depth: "independent",
      agents: 1,
    });
    expect(depthOf(modeOf(modes, "regular"), stepOf(modes, "verify"))).toEqual({
      depth: "written",
    });
    expect(depthOf(modeOf(modes, "quick"), stepOf(modes, "review"))).toEqual({ depth: "none" });
  });

  it("S2 asking a mode for a step another definition holds is a defect", () => {
    const own = parsed(JSON.stringify(sample()));
    expect(() => depthOf(modeOf(corpus(), "quick"), stepOf(own, "sketch"))).toThrow(
      "mode 'quick' holds no depth for the step 'sketch'",
    );
  });

  it("J-93 S1 a record of every mode holds a section for every step, in step order, at the depth its mode gives it", () => {
    const modes = corpus();
    expect(recordSections(modes, modeOf(modes, "quick"))).toEqual([
      { step: "frame", depth: { depth: "inline" } },
      { step: "plan", depth: { depth: "inline" } },
      { step: "anticipate", depth: { depth: "none" } },
      { step: "build", depth: { depth: "inline" } },
      { step: "review", depth: { depth: "none" } },
      { step: "verify", depth: { depth: "inline" } },
      { step: "close", depth: { depth: "inline" } },
    ]);
    expect(recordSections(modes, modeOf(modes, "regular"))).toEqual([
      { step: "frame", depth: { depth: "written" } },
      { step: "plan", depth: { depth: "written" } },
      { step: "anticipate", depth: { depth: "none" } },
      { step: "build", depth: { depth: "written" } },
      { step: "review", depth: { depth: "independent", agents: 1 } },
      { step: "verify", depth: { depth: "written" } },
      { step: "close", depth: { depth: "written" } },
    ]);
    expect(noneLine(modeOf(modes, "quick"))).toBe("none at quick");
  });

  it("J-93 S1 the floors raise a proposal to careful, and only careful meets them", () => {
    const modes = corpus();
    expect(new Set(modes.floors.map((floor) => floor.mode))).toEqual(new Set(["careful"]));
    const secrets = floorOf(modes, "security");
    expect(
      ["quick", "regular", "careful"].map((name) =>
        meetsFloor(modes, modeOf(modes, name), secrets),
      ),
    ).toEqual([false, false, true]);
  });

  it("J-73 S2 the most agents a mode may start is the builder, each independent step's agents and each looped step's rounds", () => {
    const own = parsed(JSON.stringify(sample()));
    // brisk runs sketch inline and skips check: the builder alone.
    expect(agentsAtMost(own, modeOf(own, "brisk"))).toBe(1);
    // sure: the builder, sketch's two agents and check's two rounds.
    expect(agentsAtMost(own, modeOf(own, "sure"))).toBe(5);
  });

  it("J-93 S1 the corpus's modes start the builder alone, the builder and one reviewer, and the builder with four fresh agents", () => {
    const modes = corpus();
    const derived = Object.fromEntries(
      modes.modes.map((mode) => [mode.name, agentsAtMost(modes, mode)]),
    );
    // Careful: the builder, anticipate's premise reader, review's two and verify's one.
    expect(derived).toEqual({ quick: 1, regular: 2, careful: 1 + 1 + 2 + 1 });
    // No mode loops: max's agents and rounds folded into careful.
    for (const mode of modes.modes)
      expect(
        Object.values(mode.steps).some((depth) => depth.depth === "looped"),
        mode.name,
      ).toBe(false);
  });

  it("J-73 S2 the most rounds a mode may run count its fix rounds once for each step that takes a fix pass outside a loop, and each looped step's rounds", () => {
    const modes = corpus();
    const rounds = Object.fromEntries(
      modes.modes.map((mode) => [mode.name, roundsAtMost(modes, mode)]),
    );
    // quick: no fix round; regular one after review and one after verify; careful two of each.
    expect(rounds).toEqual({ quick: 0, regular: 2, careful: 4 });
    expect(modes.steps.filter((step) => step.fixPass).map((step) => step.name)).toEqual([
      "review",
      "verify",
    ]);
  });

  it("J-73 S2 a step that takes no fix pass adds no fix round, and a looped step's rounds replace its fix pass", () => {
    const steps = [
      { name: "sketch", whenSplit: "plan", fixPass: true },
      { name: "check", whenSplit: "both", fixPass: false },
    ];
    const written = {
      ...brisk({ sketch: { depth: "written" }, check: { depth: "written" } }),
      fixRounds: 2,
    };
    const own = parsed(JSON.stringify({ ...sample([written, sure()]), steps }));
    expect(roundsAtMost(own, modeOf(own, "brisk"))).toBe(2);
    // sure: sketch independent takes one fix pass; check looped brings its 2 rounds and no fix pass.
    expect(roundsAtMost(own, modeOf(own, "sure"))).toBe(3);
  });

  it("S2 a floor naming a mode another definition holds is a defect", () => {
    const own = parsed(JSON.stringify(sample()));
    expect(() =>
      meetsFloor(corpus(), modeOf(corpus(), "careful"), floorOf(own, "security")),
    ).toThrow("the definition holds no mode 'sure'");
  });
});
