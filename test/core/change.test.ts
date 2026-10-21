import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mismatches,
  nextStep,
  parseChangeRecord,
  parseRecordForm,
  renderRecordSkeleton,
  requiredSections,
  stepReached,
  type ChangeRecord,
  type RecordContext,
} from "../../src/core/change.ts";
import {
  parseModes,
  type Mode,
  type ModesDefinition,
  type StepName,
} from "../../src/core/modes.ts";

const modesPath = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");

function corpus(): ModesDefinition {
  const parsed = parseModes(readFileSync(modesPath, "utf8"), modesPath);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const definition = corpus();

function text(front: readonly string[], body: readonly string[]): string {
  return ["---", ...front, "---", "", ...body].join("\n");
}

function parse(
  front: readonly string[],
  body: readonly string[] = [],
  file = "2026-10-04-fix-typo.md",
) {
  return parseChangeRecord(definition, file, text(front, body));
}

function record(front: readonly string[], body: readonly string[] = []): ChangeRecord {
  const parsed = parse(front, body);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

function refused(path: string, message: string) {
  return { _tag: "err", error: expect.objectContaining({ issues: [{ path, message }] }) };
}

const plain: RecordContext = { ticketsFile: "absent" };
const quickFront = [
  "mode: quick",
  "choice: accepted",
  'why: "the install line has a typo"',
  "state: done",
];
const quickBody = [
  "## frame",
  "The typo is in the install line of the README.",
  "## plan",
  "The README's install line runs as written.",
  "## anticipate",
  "none at quick",
  "## build",
  "Fixed the command.",
  "## review",
  "none at quick",
  "## verify",
  "Ran the command from the README.",
  "## close",
  "Nothing to carry forward.",
];
const regularFront = [
  "mode: regular",
  "choice: owner",
  "proposed: quick",
  'why: "a bounded change"',
];

describe("the change record parses", () => {
  it("S3 a quick record of a few lines parses, its id the file name", () => {
    expect(parse(quickFront, quickBody)).toEqual({
      _tag: "ok",
      value: {
        id: "2026-10-04-fix-typo",
        mode: "quick",
        choice: { by: "accepted" },
        why: "the install line has a typo",
        position: { state: "done" },
        floors: [],
        raises: [],
        sections: [
          { step: "frame", text: "The typo is in the install line of the README.", rounds: 0 },
          { step: "plan", text: "The README's install line runs as written.", rounds: 0 },
          { step: "anticipate", text: "none at quick", rounds: 0 },
          { step: "build", text: "Fixed the command.", rounds: 0 },
          { step: "review", text: "none at quick", rounds: 0 },
          { step: "verify", text: "Ran the command from the README.", rounds: 0 },
          { step: "close", text: "Nothing to carry forward.", rounds: 0 },
        ],
        kindSections: [],
        kindLines: [],
      },
    });
  });

  it("S3 a careful record with every agent's report parses, its third-level headings counted as rounds", () => {
    const careful = record(
      [
        "mode: careful",
        "choice: owner",
        "proposed: regular",
        'why: "the migration moves every customer row"',
        "state: done",
        "next: none",
        "floors: [data-migration, security]",
        "raises:",
        '  - { from: regular, reason: "a data migration surfaced" }',
        "reviewed: independent",
        "plan: 004-row-migration",
        "agents: 5",
        "rounds: 4",
      ],
      [
        "## frame",
        "What moves and what must not.",
        "## plan",
        "Three phases with a rollback each.",
        "## anticipate",
        "Report: anticipate-1.md",
        "## build",
        "Built the three phases.",
        "## review",
        "### Round 1",
        "Reports: review-1.md and review-2.md",
        "### Round 2",
        "Reports: review-3.md, clean.",
        "## verify",
        "Report: verify-1.md, every item verified.",
        "## close",
        "The decision home has the rollback rule.",
      ],
    );
    expect(careful.choice).toEqual({ by: "owner", proposed: "regular" });
    expect(careful.belongs).toEqual({ plan: "004-row-migration" });
    expect(careful.cost).toEqual({ agents: 5, rounds: 4 });
    expect(careful.raises).toEqual([{ from: "regular", reason: "a data migration surfaced" }]);
    expect(careful.sections.map((section) => [section.step, section.rounds])).toEqual([
      ["frame", 0],
      ["plan", 0],
      ["anticipate", 0],
      ["build", 0],
      ["review", 2],
      ["verify", 0],
      ["close", 0],
    ]);
    expect(mismatches(definition, careful, plain)).toEqual([]);
  });

  it("S3 a stopped record keeps its next line, and a ticket names its plan", () => {
    const stopped = record([
      ...regularFront,
      "state: stopped",
      'next: "review: rerun the reviewer on the fixed range"',
      "plan: 003-login",
      "ticket: T2",
    ]);
    expect(stopped.position).toEqual({
      state: "stopped",
      next: "review: rerun the reviewer on the fixed range",
    });
    expect(stopped.belongs).toEqual({ plan: "003-login", ticket: "T2" });
  });
});

describe("the change record refuses", () => {
  it("S3 refuses a file name that is not a real date and a slug", () => {
    for (const file of ["2026-02-30-fix.md", "2026-10-04-Fix.md", "2026-10-04-fix.txt", "fix.md"])
      expect(parse(quickFront, quickBody, file)).toEqual(
        refused("", "a change record's file name is '<real date>-<slug>.md'"),
      );
  });

  it("S3 refuses a record with no front matter", () => {
    expect(parseChangeRecord(definition, "2026-10-04-fix.md", "## build\n")).toEqual(
      refused("", "a change record must start with a '---' frontmatter block"),
    );
  });

  it("S3 refuses a field the record does not define", () => {
    expect(parse([...quickFront, "owner: sam"], quickBody)).toEqual(
      refused("", 'Unrecognized key: "owner"'),
    );
  });

  it.each([
    ["choice", "choice: asked", 'Invalid option: expected one of "owner"|"accepted"|"standing"'],
    ["state", "state: paused", 'Invalid option: expected one of "open"|"stopped"|"done"|"dropped"'],
    [
      "reviewed",
      "reviewed: deep",
      'Invalid option: expected one of "none"|"inline"|"written"|"independent"|"looped"',
    ],
    [
      "plan",
      "plan: login",
      "Invalid string: must match pattern /^\\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/",
    ],
    ["ticket", "ticket: 2nd", "Invalid string: must match pattern /^[A-Za-z][A-Za-z0-9-]*$/"],
    ["agents", "agents: 0", "Too small: expected number to be >=1"],
    ["rounds", "rounds: -1", "Too small: expected number to be >=0"],
    ["why", 'why: ""', "Too small: expected string to have >=1 characters"],
  ])("S3 refuses a value its field does not take: %s", (field, line, message) => {
    const base = [
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: done",
      "plan: 001-a",
      "agents: 1",
      "rounds: 0",
    ];
    const front = [...base.filter((entry) => !entry.startsWith(`${field}:`)), line];
    expect(parse(front, quickBody)).toEqual(refused(field, message));
  });

  it("S3 refuses a mode the definition does not hold", () => {
    expect(parse(["mode: turbo", ...quickFront.slice(1)], quickBody)).toEqual(
      refused("mode", "'turbo' is not a mode"),
    );
  });

  it("S3 refuses a proposal outside an owner's choice", () => {
    expect(parse([...quickFront, "proposed: careful"], quickBody)).toEqual(
      refused("proposed", "a proposal is stated only when the owner chose"),
    );
  });

  it("S3 refuses a proposal equal to the chosen mode", () => {
    expect(
      parse(["mode: regular", "choice: owner", "proposed: regular", 'why: "w"', "state: open"]),
    ).toEqual(
      refused("proposed", "the owner chose the proposed mode, which is the choice 'accepted'"),
    );
  });

  it("S3 refuses a stopped record with no next line, or a next line of none", () => {
    expect(parse([...regularFront, "state: stopped"])).toEqual(
      refused("next", "a stopped record names the action that resumes it"),
    );
    expect(parse([...regularFront, "state: stopped", "next: none"])).toEqual(
      refused("next", "a stopped record names the action that resumes it"),
    );
  });

  it("S3 refuses a finished record whose next line is not none", () => {
    expect(parse([...quickFront, 'next: "close: write it up"'], quickBody)).toEqual(
      refused("next", `a done record's "next" line is none`),
    );
    expect(parse([...regularFront, "state: dropped", 'next: "build"'])).toEqual(
      refused("next", `a dropped record's "next" line is none`),
    );
  });

  it("S3 refuses a floor the definition does not hold", () => {
    expect(parse([...quickFront, "floors: [security, haste]"], quickBody)).toEqual(
      refused(
        "floors[1]",
        `'haste' is not a floor; the floors are security, data-migration, concurrency, public-contract, unchecked-behavior (${GUIDE})`,
      ),
    );
  });

  const raised = (mode: string, ...froms: readonly string[]): readonly string[] => [
    `mode: ${mode}`,
    "choice: accepted",
    'why: "w"',
    "state: open",
    "raises:",
    ...froms.map((from) => `  - { from: ${from}, reason: "r" }`),
  ];

  it("S3 a raise states only the mode it was raised from and why, and its reason may hold a comma", () => {
    const parsed = record([
      ...regularFront,
      "state: open",
      "raises:",
      '  - { from: quick, reason: "a public contract, and its two callers" }',
    ]);
    expect(parsed.raises).toEqual([
      { from: "quick", reason: "a public contract, and its two callers" },
    ]);
  });

  it("S3 refuses a raise from the record's mode or above it", () => {
    expect(parse(raised("regular", "regular"))).toEqual(
      refused(
        "raises[0].from",
        "a raise starts below the record's mode, and 'regular' is not below 'regular'",
      ),
    );
    expect(parse(raised("regular", "careful"))).toEqual(
      refused(
        "raises[0].from",
        "a raise starts below the record's mode, and 'careful' is not below 'regular'",
      ),
    );
  });

  it("S3 refuses raises out of order", () => {
    expect(parse(raised("careful", "regular", "quick"))).toEqual(
      refused("raises[1].from", "the raises ascend, and 'quick' is not above 'regular'"),
    );
    expect(parse(raised("careful", "quick", "quick"))).toEqual(
      refused("raises[1].from", "the raises ascend, and 'quick' is not above 'quick'"),
    );
    expect(record(raised("careful", "quick", "regular")).raises.map((raise) => raise.from)).toEqual(
      ["quick", "regular"],
    );
  });

  it("S3 refuses a raise from a mode the definition does not hold", () => {
    expect(parse(raised("careful", "idle"))).toEqual(
      refused("raises[0].from", "'idle' is not a mode"),
    );
  });

  it("S3 refuses a raise that states where it went", () => {
    const to = [
      ...regularFront,
      "state: open",
      "raises:",
      '  - { from: quick, to: regular, reason: "r" }',
    ];
    expect(parse(to)).toEqual(refused("raises[0]", 'Unrecognized key: "to"'));
  });

  it("S3 refuses a proposal of a mode the definition does not hold", () => {
    expect(
      parse(["mode: regular", "choice: owner", "proposed: turbo", 'why: "w"', "state: open"]),
    ).toEqual(refused("proposed", "'turbo' is not a mode"));
  });

  it("S3 refuses a ticket named without its plan", () => {
    expect(parse([...quickFront, "ticket: T1"], quickBody)).toEqual(
      refused("ticket", "a ticket is named only with its plan"),
    );
  });

  it("S3 refuses a cost that states only one of its two counts", () => {
    expect(parse([...quickFront, "agents: 1"], quickBody)).toEqual(
      refused("agents", "the cost states both agents and rounds"),
    );
  });

  it("S3 refuses a second-level heading that is not a step", () => {
    expect(parse(quickFront, ["## frame", "x", "## notes", "y"])).toEqual(
      refused(
        "",
        `line 10: the heading 'notes' is not a step or a kind's section; ${GUIDE} gives the skeleton of each mode`,
      ),
    );
  });

  it("S3 refuses a step's second section", () => {
    expect(parse(quickFront, ["## build", "x", "## build", "y"])).toEqual(
      refused("", "line 10: the step 'build' has a section already"),
    );
  });

  it("S3 refuses a section out of step order", () => {
    expect(parse(quickFront, ["## build", "x", "## frame", "y"])).toEqual(
      refused("", "line 10: the step 'frame' comes before 'build'"),
    );
  });

  it("S3 a heading inside a fenced block is body text: no section, no round, no refusal", () => {
    const quoting = record(quickFront, [
      ...quickBody.slice(0, 6),
      "## build",
      "Fixed the README's install section:",
      "```md",
      "## Install",
      "### Round 9",
      "```",
      "~~~",
      "## frame",
      "~~~",
      ...quickBody.slice(8),
    ]);
    const build = quoting.sections.find((section) => section.step === "build");
    expect(quoting.sections.map((section) => section.step)).toEqual([
      "frame",
      "plan",
      "anticipate",
      "build",
      "review",
      "verify",
      "close",
    ]);
    expect(build?.rounds).toBe(0);
    expect(build?.text).toBe(
      [
        "Fixed the README's install section:",
        "```md",
        "## Install",
        "### Round 9",
        "```",
        "~~~",
        "## frame",
        "~~~",
      ].join("\n"),
    );
  });
});

describe("what a record derives", () => {
  const regular = (state: string, body: readonly string[]): ChangeRecord =>
    record(
      [
        ...regularFront,
        `state: ${state}`,
        ...(state === "stopped" ? ['next: "review: go on"'] : []),
      ],
      body,
    );
  const steps = (found: readonly { readonly step: StepName }[]): readonly string[] =>
    found.map((section) => section.step);
  const every = ["frame", "plan", "anticipate", "build", "review", "verify", "close"];

  it("J-93 S1 a record of every mode holds a section for every step of the line, a step its mode skips at none", () => {
    const open = regular("open", []);
    expect(
      requiredSections(definition, open, plain).map((section) => [
        section.step,
        section.depth.depth,
      ]),
    ).toEqual([
      ["frame", "written"],
      ["plan", "written"],
      ["anticipate", "none"],
      ["build", "written"],
      ["review", "independent"],
      ["verify", "written"],
      ["close", "written"],
    ]);
  });

  const carefulIn = (...lines: readonly string[]): ChangeRecord =>
    record(["mode: careful", "choice: accepted", 'why: "w"', "state: open", ...lines]);

  it("S3 a ticket's record omits the steps the definition gives the plan's record when the work is split", () => {
    const ticket = carefulIn("plan: 003-login", "ticket: T1");
    expect(steps(requiredSections(definition, ticket, plain))).toEqual([
      "build",
      "review",
      "verify",
      "close",
    ]);
  });

  it("S3 the planning record holds frame, plan, anticipate, verify and close, leaving build and review to the tickets", () => {
    const planning = carefulIn("plan: 003-login");
    expect(steps(requiredSections(definition, planning, { ticketsFile: "present" }))).toEqual([
      "frame",
      "plan",
      "anticipate",
      "verify",
      "close",
    ]);
  });

  it("S3 a record outside a split holds every step, a plan without a tickets file included", () => {
    expect(steps(requiredSections(definition, carefulIn(), plain))).toEqual(every);
    expect(steps(requiredSections(definition, carefulIn("plan: 003-login"), plain))).toEqual(every);
    expect(steps(requiredSections(definition, record(quickFront, quickBody), plain))).toEqual(
      every,
    );
  });

  it("S3 the step reached is the first section of a run step left empty, and emptying a section moves it back", () => {
    const body = ["## frame", "Goal.", "## plan", "Two steps.", "## build", "Done."];
    expect(stepReached(definition, regular("stopped", body), plain)).toBe("review");
    const emptied = ["## frame", "Goal.", "## plan", "", "## build", "Done."];
    expect(stepReached(definition, regular("stopped", emptied), plain)).toBe("plan");
    expect(stepReached(definition, record(quickFront, quickBody), plain)).toBeUndefined();
  });

  it("J-93 S1 a run step whose section still holds the line of a mode that skipped it is the step reached", () => {
    const raised = record(
      [
        "mode: careful",
        "choice: accepted",
        'why: "w"',
        "state: open",
        "raises:",
        '  - { from: quick, reason: "a public contract" }',
      ],
      quickBody,
    );
    expect(stepReached(definition, raised, plain)).toBe("anticipate");
  });
});

describe("the mismatches a record derives", () => {
  it("J-93 S1 a skipped step's section that holds more than its one line is a mismatch, not a refusal", () => {
    const reviewed = record(quickFront, [
      ...quickBody.slice(0, 9),
      "Read the diff; one line.",
      ...quickBody.slice(10),
    ]);
    expect(mismatches(definition, reviewed, plain)).toEqual([
      { kind: "unrun-section", step: "review", line: "none at quick" },
    ]);
    // A raise from quick to regular leaves anticipate's quick line, which stands.
    const raised = record(
      [
        "mode: regular",
        "choice: accepted",
        'why: "w"',
        "state: open",
        "raises:",
        '  - { from: quick, reason: "a second reader is wanted" }',
      ],
      quickBody.slice(0, 6),
    );
    expect(mismatches(definition, raised, plain)).toEqual([]);
    const empty = record(quickFront, [...quickBody.slice(0, 9), ...quickBody.slice(10)]);
    expect(mismatches(definition, empty, plain)).toEqual([
      { kind: "unrun-section", step: "review", line: "none at quick" },
    ]);
  });

  it("S6 a section the split gives to the other record names the record that holds it", () => {
    const held = (front: readonly string[], heading: string, context: RecordContext) =>
      mismatches(definition, record(front, [`## ${heading}`, "x"]), context).find(
        (mismatch) => mismatch.kind === "unrequired-section",
      );
    const open = ["choice: accepted", 'why: "w"', "state: open"];
    const inPlan: RecordContext = { ticketsFile: "present" };
    expect(held(["mode: quick", ...open, "plan: 001-a", "ticket: T1"], "frame", inPlan)).toEqual({
      kind: "unrequired-section",
      step: "frame",
      holder: "plan",
    });
    expect(held(["mode: careful", ...open, "plan: 001-a"], "build", inPlan)).toEqual({
      kind: "unrequired-section",
      step: "build",
      holder: "ticket",
    });
    expect(
      held(["mode: careful", ...open, "plan: 001-a", "ticket: T1"], "anticipate", inPlan),
    ).toEqual({ kind: "unrequired-section", step: "anticipate", holder: "plan" });
    expect(held(["mode: careful", ...open], "anticipate", plain)).toBeUndefined();
  });

  it("S3 a done regular record with no review section is a mismatch, and J-93 S1 so is a skipped step with no section saying so; an open one is still under way", () => {
    const body = [
      "## frame",
      "Goal.",
      "## plan",
      "Steps.",
      "## build",
      "Built.",
      "## verify",
      "Verified.",
      "## close",
      "Closed.",
    ];
    const done = record([...regularFront, "state: done"], body);
    expect(mismatches(definition, done, plain)).toEqual([
      { kind: "missing-none-line", step: "anticipate", line: "none at regular" },
      { kind: "missing-section", step: "review" },
    ]);
    const open = record([...regularFront, "state: open"], body);
    expect(mismatches(definition, open, plain)).toEqual([]);
  });

  it("S3 an inline section of more than one line is a mismatch", () => {
    const long = record(quickFront, ["## frame", "One.", "Two.", ...quickBody.slice(2)]);
    expect(mismatches(definition, long, plain)).toEqual([
      { kind: "inline-over-one-line", step: "frame" },
    ]);
  });

  it("S3 a looped section with more rounds than its cap is a mismatch, on a definition whose mode loops", () => {
    const looping = withModes({
      name: "looping",
      promise: "until clean",
      typicalRequest: "a fixture",
      fixRounds: 0,
      budget: { words: 1 },
      steps: {
        frame: { depth: "written" },
        plan: { depth: "written" },
        anticipate: { depth: "none" },
        build: { depth: "written" },
        review: { depth: "looped", rounds: 3 },
        verify: { depth: "written" },
        close: { depth: "written" },
      },
    });
    const parsed = parseChangeRecord(
      looping,
      "2026-10-04-fix-typo.md",
      text(
        ["mode: looping", "choice: accepted", 'why: "w"', "state: open"],
        [
          "## review",
          "### Round 1",
          "a",
          "### Round 2",
          "b",
          "### Round 3",
          "c",
          "### Round 4",
          "d",
        ],
      ),
    );
    if (parsed._tag === "err") throw parsed.error;
    expect(mismatches(looping, parsed.value, plain)).toEqual([
      { kind: "rounds-over-cap", step: "review", rounds: 4, cap: 3 },
    ]);
  });

  it("S3 a floor the mode does not meet is a mismatch only for a mode taken without waiting (choice: standing), since the owner's choice is final", () => {
    const secured = (mode: string, choice: string): ChangeRecord =>
      record([
        `mode: ${mode}`,
        `choice: ${choice}`,
        'why: "w"',
        "state: open",
        "floors: [security]",
      ]);
    expect(mismatches(definition, secured("regular", "standing"), plain)).toEqual([
      { kind: "below-floor", floor: "security" },
    ]);
    expect(mismatches(definition, secured("regular", "accepted"), plain)).toEqual([]);
    expect(mismatches(definition, secured("regular", "owner"), plain)).toEqual([]);
    expect(mismatches(definition, secured("careful", "standing"), plain)).toEqual([]);
  });

  it("S3 a cost over the mode's budget is a mismatch", () => {
    const over = record([...regularFront, "state: open", "agents: 3", "rounds: 1"]);
    expect(mismatches(definition, over, plain)).toEqual([
      { kind: "over-budget", cost: { agents: 3, rounds: 1 }, budget: { agents: 2, rounds: 2 } },
    ]);
    const overRounds = record([...regularFront, "state: open", "agents: 2", "rounds: 3"]);
    expect(mismatches(definition, overRounds, plain)).toEqual([
      { kind: "over-budget", cost: { agents: 2, rounds: 3 }, budget: { agents: 2, rounds: 2 } },
    ]);
  });

  it("J-73 S2 a cost at each mode's derived budget, the builder counted, is within it, and one more is over", () => {
    const costed = (mode: string, agents: number, rounds: number): ChangeRecord =>
      record([
        `mode: ${mode}`,
        "choice: owner",
        'why: "w"',
        "state: open",
        `agents: ${agents}`,
        `rounds: ${rounds}`,
      ]);
    // The builder and each fresh agent; review's and verify's fix passes, each at the mode's fix rounds.
    const budgets: readonly [string, number, number][] = [
      ["quick", 1, 0],
      ["regular", 2, 2],
      ["careful", 5, 4],
    ];
    for (const [mode, agents, rounds] of budgets) {
      expect(mismatches(definition, costed(mode, agents, rounds), plain)).toEqual([]);
      expect(mismatches(definition, costed(mode, agents + 1, rounds), plain)).toEqual([
        {
          kind: "over-budget",
          cost: { agents: agents + 1, rounds },
          budget: { agents, rounds },
        },
      ]);
      expect(mismatches(definition, costed(mode, agents, rounds + 1), plain)).toEqual([
        {
          kind: "over-budget",
          cost: { agents, rounds: rounds + 1 },
          budget: { agents, rounds },
        },
      ]);
    }
  });
});

describe("a record read for its form alone", () => {
  const form = (
    front: readonly string[],
    body: readonly string[] = [],
    file = "2026-10-04-old.md",
  ) => parseRecordForm(file, text(front, body));

  it("S6 keeps the mode, floors, raises and headings a record states, whether or not a definition holds them", () => {
    expect(
      form(
        [
          "mode: turbo",
          "choice: owner",
          "proposed: idle",
          'why: "an old record"',
          "state: done",
          "floors: [haste]",
          "raises:",
          '  - { from: idle, reason: "r" }',
          "reviewed: inline",
          "plan: 001-a",
          "ticket: T1",
          "agents: 1",
          "rounds: 0",
        ],
        ["## sketch", "first", "### Round 1", "## build", "second"],
      ),
    ).toEqual({
      _tag: "ok",
      value: {
        id: "2026-10-04-old",
        mode: "turbo",
        choice: { by: "owner", proposed: "idle" },
        why: "an old record",
        position: { state: "done" },
        floors: ["haste"],
        raises: [{ from: "idle", reason: "r" }],
        reviewed: "inline",
        belongs: { plan: "001-a", ticket: "T1" },
        cost: { agents: 1, rounds: 0 },
        sections: [
          { heading: "sketch", text: "first\n### Round 1", rounds: 1 },
          { heading: "build", text: "second", rounds: 0 },
        ],
        lines: [],
      },
    });
  });

  it("S6 still refuses what is wrong with the form itself", () => {
    const front = ["mode: turbo", "choice: accepted", 'why: "w"'];
    expect(form([...front, "state: done"], [], "old.md")).toEqual(
      refused("", "a change record's file name is '<real date>-<slug>.md'"),
    );
    expect(parseRecordForm("2026-10-04-old.md", "## build\n")).toEqual(
      refused("", "a change record must start with a '---' frontmatter block"),
    );
    expect(form([...front, "state: stopped"])).toEqual(
      refused("next", "a stopped record names the action that resumes it"),
    );
    expect(form([...front, "state: done", 'next: "build"'])).toEqual(
      refused("next", `a done record's "next" line is none`),
    );
    expect(form([...front, "state: done", "proposed: careful"])).toEqual(
      refused("proposed", "a proposal is stated only when the owner chose"),
    );
    expect(form([...front, "state: done", "ticket: T1"])).toEqual(
      refused("ticket", "a ticket is named only with its plan"),
    );
    expect(form([...front, "state: done", "rounds: 1"])).toEqual(
      refused("agents", "the cost states both agents and rounds"),
    );
    expect(form([...front, "state: done"], ["## build", "x", "## build", "y"])).toEqual(
      refused("", "line 10: the heading 'build' has a section already"),
    );
    expect(form([...front, "state: done", "raises:", "  - { from: idle }"])).toEqual(
      refused("raises[0].reason", "Invalid input: expected string, received undefined"),
    );
    expect(form([...front, "state: done", "owner:", "  - sam"])).toEqual(
      refused("owner", "the field 'owner' is not a record field, and a kind's line holds one text"),
    );
    expect(form([...front, "state: stopped", 'next: "Go on"'])).toEqual(
      refused("next", `the "next" line is '<step>: <action>', or none (${GUIDE})`),
    );
  });

  it("S16b reads a line and a heading of any name as the record states them, and a next line naming any step", () => {
    const front = ["mode: turbo", "choice: accepted", 'why: "w"', "state: stopped"];
    const read = form([...front, 'next: "sketch: draw it"', 'gate: "passed"'], ["## start", "x"]);
    expect(read._tag === "ok" ? read.value.lines : read).toEqual([
      { field: "gate", text: "passed" },
    ]);
    expect(
      read._tag === "ok" ? read.value.sections.map((section) => section.heading) : read,
    ).toEqual(["start"]);
  });
});

/** The ledger guide every refusal about the record's skeleton names. */
const GUIDE = ".greenline/ledger/README.md";

/** The corpus definition with modes added after its own, written as the file would be. */
function withModes(...added: readonly object[]): ModesDefinition {
  // SAFETY: the corpus file is the definition the parse above accepted, so it holds a modes array.
  const raw = JSON.parse(readFileSync(modesPath, "utf8")) as { modes: readonly object[] };
  const parsed = parseModes(JSON.stringify({ ...raw, modes: [...raw.modes, ...added] }), "m");
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

/** The corpus definition with kinds added after its own, written as the file would be. */
function withKinds(...added: readonly object[]): ModesDefinition {
  // SAFETY: the corpus file is the definition the parse above accepted, so it holds a kinds array.
  const raw = JSON.parse(readFileSync(modesPath, "utf8")) as { kinds: readonly object[] };
  const parsed = parseModes(JSON.stringify({ ...raw, kinds: [...raw.kinds, ...added] }), "m");
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

/** A fourth kind no code knows, whose contract is a line (the overseer's ruling Q1 on S16b). */
const GATE = {
  name: "gate",
  mechanism: "reach",
  record: "line",
  place: "ordered",
  budget: "free",
  when: "A fixture gate holds the change where the mode reaches it until its check passes.",
};
/** A fifth, a section kind that arises during the work, so its section follows the steps'. */
const ASIDE = {
  name: "aside",
  mechanism: "arise",
  record: "section",
  place: "beside",
  budget: "free",
  when: "A fixture aside arises at any step and writes its own section.",
};

describe("S16b the kinds in the record, read from the definition (rulings Q1 and Q2)", () => {
  const openFront = ["mode: quick", "choice: accepted", 'why: "w"', "state: open"];

  it("S16b a start's section stands before the steps, at most once, and is kept apart from them", () => {
    const parsed = record(openFront, ["## start", "diagnose reproduced it.", ...quickBody]);
    expect(parsed.kindSections).toEqual([{ kind: "start", text: "diagnose reproduced it." }]);
    expect(parsed.sections.map((section) => section.step)).toEqual([
      "frame",
      "plan",
      "anticipate",
      "build",
      "review",
      "verify",
      "close",
    ]);
    expect(mismatches(definition, parsed, plain)).toEqual([]);
    expect(parse(openFront, ["## frame", "x", "## start", "y"])).toEqual(
      refused("", "line 10: the section 'start' stands before the steps' sections"),
    );
    expect(parse(openFront, ["## start", "x", "## start", "y"])).toEqual(
      refused("", "line 10: the kind 'start' has a section already"),
    );
  });

  it("S16b refuses by name a heading of a kind that writes nothing, citing the ledger guide", () => {
    expect(parse(openFront, ["## habit", "x"])).toEqual(
      refused(
        "",
        `line 8: the kind 'habit' writes nothing into the record; ${GUIDE} gives the skeleton of each mode`,
      ),
    );
  });

  it("S16b refuses by name a heading that is no step and no section kind, citing the ledger guide", () => {
    expect(parse(openFront, ["## notes", "x"])).toEqual(
      refused(
        "",
        `line 8: the heading 'notes' is not a step or a kind's section; ${GUIDE} gives the skeleton of each mode`,
      ),
    );
  });

  it("S16b a section for a step the mode runs at none holding work stays a mismatch with the raise, never a refusal", () => {
    const quick = record(openFront, ["## anticipate", "A premise review."]);
    expect(mismatches(definition, quick, plain)).toEqual([
      { kind: "unrun-section", step: "anticipate", line: "none at quick" },
    ]);
  });

  it("S16b a line kind writes one front-matter line, accepted only for a kind whose record is a line", () => {
    const gated = withKinds(GATE);
    const parsed = parseChangeRecord(
      gated,
      "2026-10-04-fix-typo.md",
      text([...openFront, 'gate: "the license check passed"'], []),
    );
    expect(parsed._tag === "ok" ? parsed.value.kindLines : parsed).toEqual([
      { kind: "gate", text: "the license check passed" },
    ]);
    expect(
      parseChangeRecord(gated, "2026-10-04-fix-typo.md", text(openFront, ["## gate", "x"])),
    ).toEqual(
      refused(
        "",
        `line 8: the kind 'gate' writes a front-matter line 'gate: "<text>"', not a section; ${GUIDE} gives the skeleton of each mode`,
      ),
    );
    expect(parse([...openFront, 'start: "x"'])).toEqual(
      refused(
        "start",
        `the kind 'start' writes a section, not a front-matter line; ${GUIDE} gives the skeleton of each mode`,
      ),
    );
    expect(parse([...openFront, 'gate: "x"'])).toEqual(refused("", 'Unrecognized key: "gate"'));
  });

  it("S16b a section kind whose mechanism is not open stands after the steps", () => {
    const aside = withKinds(ASIDE);
    const parse = (body: readonly string[]) =>
      parseChangeRecord(aside, "2026-10-04-fix-typo.md", text(openFront, body));
    const parsed = parse(["## frame", "x", "## aside", "y"]);
    expect(parsed._tag === "ok" ? parsed.value.kindSections : parsed).toEqual([
      { kind: "aside", text: "y" },
    ]);
    expect(parse(["## aside", "y", "## frame", "x"])).toEqual(
      refused(
        "",
        "line 10: the step 'frame' comes after the section 'aside', which stands after the steps' sections",
      ),
    );
  });
});

describe("S16b the next line names the step reached (ruling Q3)", () => {
  const front = (state: string, next: string): readonly string[] => [
    ...regularFront,
    `state: ${state}`,
    `next: "${next}"`,
  ];

  it("S16b an open or stopped record's next line opens with a step of the definition", () => {
    expect(record(front("stopped", "review: rerun the reviewer")).position).toEqual({
      state: "stopped",
      next: "review: rerun the reviewer",
    });
    expect(nextStep(record(front("open", "build: finish the parser")).position)).toBe("build");
    expect(
      nextStep(record([...regularFront, "state: open", "next: none"]).position),
    ).toBeUndefined();
    expect(parse(front("stopped", "go on"))).toEqual(
      refused("next", `the "next" line is '<step>: <action>', or none (${GUIDE})`),
    );
    expect(parse(front("open", "sketch: draw it"))).toEqual(
      refused("next", `the "next" line names 'sketch', which is not a step (${GUIDE})`),
    );
  });

  it("S16b a next line naming a step the record does not run is a mismatch with its cause", () => {
    const quick = record([
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: stopped",
      'next: "review: start the reviewer"',
    ]);
    expect(mismatches(definition, quick, plain)).toEqual([
      { kind: "next-unrequired", step: "review", why: { by: "mode" } },
    ]);
    const ticket = record([
      "mode: careful",
      "choice: accepted",
      'why: "w"',
      "state: open",
      "plan: 001-a",
      "ticket: T1",
      'next: "anticipate: attack the plan"',
    ]);
    expect(mismatches(definition, ticket, plain)).toEqual([
      { kind: "next-unrequired", step: "anticipate", why: { by: "split", holder: "plan" } },
    ]);
    const careful = record([
      "mode: careful",
      "choice: accepted",
      'why: "w"',
      "state: open",
      'next: "anticipate: attack the plan"',
    ]);
    expect(mismatches(definition, careful, plain)).toEqual([]);
  });
});

describe("S16b the record skeleton reads every kind's contract from the definition", () => {
  const modeOf = (modes: ModesDefinition, name: string): Mode => {
    const found = modes.modes.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`no mode '${name}'`);
    return found;
  };
  const head = (mode: string, lines: readonly string[] = []): readonly string[] => [
    "---",
    `mode: ${mode}`,
    "choice: <owner, accepted or standing>",
    'why: "<why the change exists>"',
    "state: open",
    'next: "<step>: <the action that resumes it>"',
    ...lines,
    "---",
    "",
  ];
  const START = [
    "## start",
    "",
    "<the start skill that began the change, by name, and what it handed on; leave the section out when none did>",
    "",
  ];

  it("J-93 S1 the regular skeleton: the start's section, then one section per step, a skipped step's its one line", () => {
    expect(renderRecordSkeleton(definition, modeOf(definition, "regular"))).toBe(
      [
        ...head("regular"),
        ...START,
        "## frame",
        "",
        "<the builder's section>",
        "",
        "## plan",
        "",
        "<the builder's section>",
        "",
        "## anticipate",
        "",
        "none at regular",
        "",
        "## build",
        "",
        "<the builder's section>",
        "",
        "## review",
        "",
        "<the reports of 1 fresh agent, each cited by a link into the change's folder>",
        "",
        "## verify",
        "",
        "<the builder's section>",
        "",
        "## close",
        "",
        "<the builder's section>",
        "",
      ].join("\n"),
    );
  });

  it("J-93 S1 the careful skeleton holds the premise review's report, and a looped section names its cap", () => {
    expect(renderRecordSkeleton(definition, modeOf(definition, "careful"))).toContain(
      [
        "## anticipate",
        "",
        "<the reports of 1 fresh agent, each cited by a link into the change's folder>",
      ].join("\n"),
    );
    const quick = renderRecordSkeleton(definition, modeOf(definition, "quick"));
    expect(quick).toContain(["## review", "", "none at quick"].join("\n"));
    const looping = withModes({
      name: "looping",
      promise: "until clean",
      typicalRequest: "a fixture",
      fixRounds: 0,
      budget: { words: 1 },
      steps: Object.fromEntries(
        definition.steps.map((entry) => [
          entry.name,
          entry.name === "review" ? { depth: "looped", rounds: 2 } : { depth: "written" },
        ]),
      ),
    });
    expect(renderRecordSkeleton(looping, modeOf(looping, "looping"))).toContain(
      [
        "## review",
        "",
        '<one "### Round <n>" sub-heading per round, up to 2, each citing a fresh agent\'s report>',
      ].join("\n"),
    );
  });

  it("S16b on a fixture whose fourth kind has a line contract, the skeleton holds its line and no section", () => {
    const gated = withKinds(GATE, ASIDE);
    const quick = renderRecordSkeleton(gated, modeOf(gated, "quick"));
    expect(quick.split("\n").slice(0, 9)).toEqual([
      ...head("quick", [
        'gate: "<one line by the gate skill that ran; leave the line out when none did>"',
      ]),
    ]);
    expect(quick).not.toContain("## gate");
    expect(quick.trimEnd().split("\n").slice(-3)).toEqual([
      "## aside",
      "",
      "<the aside skill that ran, by name, and what it handed on; leave the section out when none did>",
    ]);
    expect(quick).not.toContain("## habit");
  });
});

describe("J-89 S3 the starts a record names", () => {
  const highDone = ["mode: careful", "choice: accepted", 'why: "w"', "state: done"];

  it("reads each start a record names, its step, its number and a restart, flat or one per line", () => {
    const listed = record([
      ...highDone,
      "agents: 4",
      "rounds: 1",
      "starts:",
      '  - "review 1"',
      '  - "review 1 restarted"',
      '  - "verify 1"',
    ]);
    expect(listed.starts).toEqual([
      { step: "review", number: 1, restarted: false },
      { step: "review", number: 1, restarted: true },
      { step: "verify", number: 1, restarted: false },
    ]);
    const flat = record([...highDone, "agents: 2", "rounds: 0", 'starts: ["review 2"]']);
    expect(flat.starts).toEqual([{ step: "review", number: 2, restarted: false }]);
    expect(record(highDone).starts).toBeUndefined();
  });

  it("refuses a start that is not a step and a number, a restart after them or not", () => {
    for (const item of ["review", "review one", "review 0", "review 1 again", "Review 1"])
      expect(parse([...highDone, `starts: ["${item}"]`])).toEqual(
        refused(
          "starts[0]",
          `a start is "<step> <n>", or "<step> <n> restarted" for a restart, and '${item}' is neither`,
        ),
      );
    expect(
      parseRecordForm("2026-10-04-fix-typo.md", text([...highDone, 'starts: ["review"]'], [])),
    ).toEqual(
      refused(
        "starts[0]",
        `a start is "<step> <n>", or "<step> <n> restarted" for a restart, and 'review' is neither`,
      ),
    );
  });

  it("refuses a start whose step the modes do not hold, and reads it for its form as history", () => {
    expect(parse([...highDone, 'starts: ["audit 1"]'])).toEqual(
      refused("starts[0]", `the start 'audit 1' names 'audit', which is not a step (${GUIDE})`),
    );
    const form = parseRecordForm(
      "2026-10-04-fix-typo.md",
      text([...highDone, 'starts: ["audit 1"]'], []),
    );
    expect(form._tag).toBe("ok");
  });
});

describe("J-93 S3 the owner's landing and rebase words", () => {
  it("reads the landing and rebase lines as text, judged and as history alike", () => {
    const front = [
      ...quickFront,
      'landing: "push and open the pull request, the owner, 2026-10-19"',
      'rebase: "rebase onto main, the owner"',
    ];
    expect(record(front)).toMatchObject({
      landing: "push and open the pull request, the owner, 2026-10-19",
      rebase: "rebase onto main, the owner",
    });
    const form = parseRecordForm("2026-10-04-fix-typo.md", text(front, []));
    expect(
      form._tag === "ok" ? [form.value.landing, form.value.rebase, form.value.lines] : [],
    ).toEqual([
      "push and open the pull request, the owner, 2026-10-19",
      "rebase onto main, the owner",
      [],
    ]);
    expect(record(quickFront).landing).toBeUndefined();
  });

  it("refuses a landing line that holds no text", () => {
    expect(parse([...quickFront, "landing: []"])._tag).toBe("err");
  });
});
