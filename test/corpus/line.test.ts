/** The line (`src/corpus/line.ts`): a manifest's slots against the modes definition, a placement's slot against the manifest and the definition, and the line view rendered from the definition, the manifest and the chain. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCorpusManifest } from "../../src/core/corpus.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { parseChain, type Chain, type SourceEntry } from "../../src/corpus/chain.ts";
import {
  kindIssues,
  lineOf,
  placementSlotIssues,
  renderLine,
  type LineSkill,
} from "../../src/corpus/line.ts";
import {
  chainTexts,
  ENTRY_SCHEMA,
  FIXTURE_MODES,
  type FixtureEntry,
  type FixturePlacement,
} from "../fixtures/chain.ts";

const repository = join(import.meta.dirname, "..", "..");
const encoder = new TextEncoder();

function definitionOf(text: string): ModesDefinition {
  const parsed = parseModes(text, "modes.json");
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const DEFINITION = definitionOf(FIXTURE_MODES);

/** A fourth kind made of the mechanisms the loop already runs: a gate, reached on the line, writing one line, free of the budget. */
const GATE = {
  name: "gate",
  mechanism: "reach",
  record: "line",
  place: "ordered",
  budget: "free",
  when: "A fixture gate holds the change where the mode reaches it until its check passes.",
};

/** The fixture's definition with its kinds replaced, written as the file would be. */
function withKinds(kinds: (base: readonly object[]) => readonly object[]): ModesDefinition {
  // SAFETY: FIXTURE_MODES is the fixture's own definition, which declares its kinds as an array.
  const raw = JSON.parse(FIXTURE_MODES) as { kinds: readonly object[] };
  return definitionOf(JSON.stringify({ ...raw, kinds: kinds(raw.kinds) }));
}

/** The fixture's definition with the gate declared after its three kinds; no code knows the gate. */
const GATED = withKinds((base) => [...base, GATE]);

/** The fixture's line: two default skills on the check step, a start with the extra flag, a habit, and the outline step empty; no step skill is a trial (J-93 S1). */
const SKILLS: readonly LineSkill[] = [
  { name: "fixture-skill", kind: "step", slot: "check" },
  { name: "second-check", kind: "step", slot: "check" },
  { name: "fixture-start", kind: "start", extra: true },
  { name: "fixture-habit", kind: "habit" },
];

/** A habit's or a start's rows: it loads at the first step each mode runs. */
const LOADING_ROWS = [
  { mode: "quick", step: "check", depth: "inline", cost: 12 },
  { mode: "careful", step: "outline", depth: "written", cost: 12 },
];

/** A placement of `kind` on `slot` by `move`, catching `catches`. */
function placement(
  kind: string,
  slot: string,
  move: string,
  catches: string,
  modes = LOADING_ROWS,
): FixturePlacement {
  return {
    kind,
    slot,
    catches,
    evidence: "witnessed",
    move,
    boldest: { move: "reshape", needs: "A with-and-without run at every mode." },
    modes: modes.map((row) => ({ ...row })),
    ships: "trial",
  };
}

/** A source entry read from `https://example.com/<repository>` at `path`, with its verdict and, when given, its placement. */
function read(
  id: string,
  repositoryName: string,
  path: string,
  verdict: string,
  placed?: FixturePlacement,
): FixtureEntry {
  const entry: FixtureEntry = {
    schema: ENTRY_SCHEMA,
    id,
    kind: "source",
    source: { repository: `https://example.com/${repositoryName}`, commit: "a".repeat(40), path },
    licence: "mit",
    verdict,
    gist: `The ${repositoryName} source is read`,
    reason: `The ${repositoryName} source is read and ruled.`,
    authorisedBy: null,
    ruling: [],
  };
  if (placed !== undefined) entry["placement"] = placed;
  return entry;
}

const SECRET = "A secret pasted into a log.";

/** The fixture chain the line is rendered from, oldest first. */
function lineEntries(): FixtureEntry[] {
  return [
    read(
      "2026-10-04-habit-one",
      "one",
      "skills/one",
      "lift",
      placement("habit", "fixture-habit", "strengthen", SECRET),
    ),
    read(
      "2026-10-05-habit-two",
      "two",
      "skills/two",
      "copy",
      placement("habit", "fixture-habit", "strengthen", SECRET),
    ),
    read(
      "2026-10-06-fill-outline",
      "three",
      "skills/three",
      "lift",
      placement("step", "outline", "fill", "A plan nobody wrote down.", [
        { mode: "quick", step: "outline", depth: "none", cost: 0 },
        { mode: "careful", step: "outline", depth: "written", cost: 30 },
      ]),
    ),
    read(
      "2026-10-07-four-placed",
      "four",
      ".",
      "lift",
      placement("step", "fixture-skill", "strengthen", "A check that cannot fail.", [
        { mode: "quick", step: "check", depth: "inline", cost: 20 },
        { mode: "careful", step: "check", depth: "independent", cost: 20 },
      ]),
    ),
    read("2026-10-08-four-held", "four", ".", "hold"),
    read(
      "2026-10-09-five-placed",
      "five",
      ".",
      "lift",
      placement("start", "fixture-start", "strengthen", "A job begun without a goal."),
    ),
    read("2026-10-10-five-declined", "five", ".", "decline"),
    read(
      "2026-10-11-six-added",
      "six",
      "skills/six",
      "lift",
      placement("habit", "new-habit", "add", "A flaky test kept."),
    ),
    read(
      "2026-10-12-seven-reshape",
      "seven",
      ".",
      "lift",
      placement("step", "quick", "reshape", "A fast change nobody reviewed.", [
        { mode: "quick", step: "check", depth: "inline", cost: 5 },
        { mode: "careful", step: "check", depth: "independent", cost: 5 },
      ]),
    ),
    read(
      "2026-10-13-eight-handed",
      "eight",
      ".",
      "lift",
      placement("habit", "fixture-habit", "strengthen", SECRET),
    ),
    {
      ...read("2026-10-14-eight-handed-off", "eight", ".", "hand-off"),
      reason: "Its rules are knowledge for garden.",
      handoff: { recipient: "garden", parts: [{ part: "its rules", locator: "." }] },
    },
  ];
}

function chainOf(entries: readonly FixtureEntry[]): Chain {
  const chain = parseChain(
    chainTexts(entries).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
  );
  if (chain._tag === "err") throw chain.error;
  return chain.value;
}

/** The view's row whose first cell is `slot`, its cells trimmed. */
function rowOf(text: string, slot: string): readonly string[] | undefined {
  return text
    .split("\n")
    .find((line) => line.startsWith(`| ${slot} `))
    ?.split(" | ")
    .map((cell) => cell.replace(/^\| /, "").replace(/ \|$/, "").trim());
}

describe("R4: a manifest's slots against the modes definition", () => {
  it("accepts a step skill whose slot is a step of the definition", () => {
    expect(kindIssues(SKILLS, DEFINITION)).toEqual([]);
  });

  it("refuses a slot naming a step the definition lacks, by name", () => {
    expect(
      kindIssues([{ name: "fixture-skill", kind: "step", slot: "review" }], DEFINITION),
    ).toEqual([
      {
        skill: "fixture-skill",
        message: "the slot 'review' names no step of the modes definition",
      },
    ]);
  });
});

describe("J-93 S1: no skill on the line is a trial", () => {
  it("refuses a trial flag on a skill of a kind placed on the line, by name", () => {
    expect(
      kindIssues([{ name: "fixture-skill", kind: "step", slot: "check", trial: true }], DEFINITION),
    ).toEqual([
      {
        skill: "fixture-skill",
        message:
          "a step is placed on the line, where every slot runs as its mode reaches it, so it is never a trial",
      },
    ]);
  });
});

describe("R5: a manifest's kinds against the modes definition", () => {
  it("refuses a skill whose kind the definition lacks, by name", () => {
    expect(kindIssues([{ name: "fixture-gate", kind: "gate", slot: "check" }], DEFINITION)).toEqual(
      [{ skill: "fixture-gate", message: "the kind 'gate' is no kind of the modes definition" }],
    );
  });

  it("refuses a slot on a kind placed beside the line", () => {
    expect(
      kindIssues([{ name: "fixture-habit", kind: "habit", slot: "check" }], DEFINITION),
    ).toEqual([
      {
        skill: "fixture-habit",
        message: "a habit is placed beside the line, so it is its own slot and names none",
      },
    ]);
  });

  it("requires a slot on a kind placed on the line, the step kind or another", () => {
    expect(
      kindIssues(
        [
          { name: "fixture-skill", kind: "step" },
          { name: "fixture-gate", kind: "gate" },
        ],
        GATED,
      ),
    ).toEqual([
      {
        skill: "fixture-skill",
        message:
          "a step is placed on the line, so it names its slot, a step of the modes definition",
      },
      {
        skill: "fixture-gate",
        message:
          "a gate is placed on the line, so it names its slot, a step of the modes definition",
      },
    ]);
  });

  it("S16a refuses an activation the skill's kind already implies, and accepts one that differs", () => {
    expect(
      kindIssues(
        [
          { name: "fixture-skill", kind: "step", slot: "check", activation: "explicit" },
          { name: "fixture-start", kind: "start", activation: "explicit" },
          { name: "fixture-habit", kind: "habit", activation: "implicit" },
          { name: "second-check", kind: "step", slot: "check", activation: "implicit" },
          { name: "other-habit", kind: "habit", activation: "explicit" },
        ],
        DEFINITION,
      ),
    ).toEqual([
      {
        skill: "fixture-skill",
        message: "activation 'explicit' is the one a step implies; it is stated only to differ",
      },
      {
        skill: "fixture-start",
        message: "activation 'explicit' is the one a start implies; it is stated only to differ",
      },
      {
        skill: "fixture-habit",
        message: "activation 'implicit' is the one a habit implies; it is stated only to differ",
      },
    ]);
  });

  it("S16a takes a gained kind's activation from its mechanism, with no code of its own", () => {
    expect(
      kindIssues(
        [{ name: "fixture-gate", kind: "gate", slot: "check", activation: "explicit" }],
        GATED,
      ),
    ).toEqual([
      {
        skill: "fixture-gate",
        message: "activation 'explicit' is the one a gate implies; it is stated only to differ",
      },
    ]);
  });

  it("accepts a skill of a kind the definition declares, with no code of its own", () => {
    expect(
      kindIssues([...SKILLS, { name: "fixture-gate", kind: "gate", slot: "check" }], GATED),
    ).toEqual([]);
  });

  it("S16a finds no skill class under src/, the classes retired with the cutover", () => {
    const source = join(repository, "src");
    const files = readdirSync(source, { recursive: true, encoding: "utf8" }).filter((path) =>
      path.endsWith(".ts"),
    );
    const named = files.filter((path) =>
      /(["'])(?:entry|stage|support|discipline|situational)\1|SKILL_CLASSES|CLASS_ACTIVATION|SkillClass|\.class\b/.test(
        readFileSync(join(source, path), "utf8"),
      ),
    );
    expect(named).toEqual([]);
  });

  it("finds no literal kind list under src/", () => {
    const source = join(repository, "src");
    const files = readdirSync(source, { recursive: true, encoding: "utf8" }).filter((path) =>
      path.endsWith(".ts"),
    );
    const listed = files.filter((path) =>
      /(["'])(?:start|habit)\1|start, step or habit|SKILL_KINDS/.test(
        readFileSync(join(source, path), "utf8"),
      ),
    );
    expect(listed).toEqual([]);
  });
});

describe("R4: a placement's slot against the manifest and the definition", () => {
  /** The refusals of a source entry whose placement is `placed`, read from a pinned source. */
  function issues(placed: FixturePlacement, builtFrom: readonly string[] = []): readonly string[] {
    const entry = read("2026-10-20-placed", "nine", "skills/nine", "lift", placed);
    const chain = chainOf([entry]);
    const [chained] = chain.entries;
    if (chained === undefined || chained.entry.kind !== "source") throw new Error("a source entry");
    const source: SourceEntry = chained.entry;
    return placementSlotIssues(source, SKILLS, DEFINITION, (skill) => builtFrom.includes(skill));
  }

  it.each<[string, FixturePlacement]>([
    ["a fill of an empty step", placement("step", "outline", "fill", "A plan nobody wrote down.")],
    [
      "a strengthen of a step's skill",
      placement("step", "fixture-skill", "strengthen", "A check that cannot fail."),
    ],
    [
      "a strengthen of a start",
      placement("start", "fixture-start", "strengthen", "A job begun blind."),
    ],
    ["a strengthen of a habit", placement("habit", "fixture-habit", "strengthen", SECRET)],
    ["an add of a new habit", placement("habit", "new-habit", "add", "A flaky test kept.")],
    ["an add of a new start", placement("start", "new-start", "add", "A job begun blind.")],
    [
      "a reshape of a mode",
      placement("step", "careful", "reshape", "A careful change unreviewed."),
    ],
  ])("accepts %s", (_name, placed) => {
    expect(issues(placed)).toEqual([]);
  });

  it.each<[string, FixturePlacement, readonly string[]]>([
    [
      "a fill of a slot the definition holds no step for",
      placement("step", "review", "fill", "A change unreviewed."),
      ["the placement fills the slot 'review', which is no step of the modes definition"],
    ],
    [
      "a strengthen of a slot naming no roster skill",
      placement("habit", "secrets", "strengthen", SECRET),
      ["the placement strengthens the slot 'secrets', which names no roster skill"],
    ],
    [
      "a strengthen whose kind is not the roster skill's",
      placement("habit", "fixture-skill", "strengthen", SECRET),
      [
        "the placement's kind is 'habit', but the roster skill 'fixture-skill' it strengthens is a step",
      ],
    ],
    [
      "an add whose name a roster skill already holds",
      placement("habit", "fixture-habit", "add", SECRET),
      ["the placement adds the slot 'fixture-habit', which the roster skill of that name holds"],
    ],
    [
      "an add of a habit named as a step of the definition",
      placement("habit", "outline", "add", SECRET),
      ["the placement adds the slot 'outline', which the modes definition holds as a step"],
    ],
    [
      "an add named as a mode of the definition",
      placement("habit", "quick", "add", SECRET),
      ["the placement adds the slot 'quick', which the modes definition holds as a mode"],
    ],
    [
      "an add of a step the definition does not hold yet",
      placement("step", "rehearse", "add", "A plan never attacked."),
      [
        "the placement adds the step 'rehearse', which the modes definition does not hold; an added step is recorded after the change that adds it",
      ],
    ],
    [
      "a reshape of a slot naming no mode",
      placement("step", "check", "reshape", "A change unreviewed."),
      ["the placement reshapes 'check', which is no mode of the modes definition"],
    ],
  ])("refuses %s", (_name, placed, said) => {
    expect(issues(placed)).toEqual(said);
  });

  it("R5 refuses a placement whose kind the definition lacks, by name", () => {
    expect(
      issues(placement("gate", "fixture-skill", "strengthen", "A check that cannot fail.")),
    ).toEqual(["the placement's kind 'gate' is no kind of the modes definition"]);
  });

  it("accepts an add that names the roster skill its own source built, at its kind, and refuses another kind", () => {
    expect(issues(placement("habit", "fixture-habit", "add", SECRET), ["fixture-habit"])).toEqual(
      [],
    );
    expect(issues(placement("start", "fixture-habit", "add", SECRET), ["fixture-habit"])).toEqual([
      "the placement's kind is 'start', but the roster skill 'fixture-habit' it added is a habit",
    ]);
  });
});

describe("R4: the line view of the fixture", () => {
  const text = renderLine(
    lineOf({ definition: DEFINITION, skills: SKILLS, chain: chainOf(lineEntries()) }),
  );

  it("lists the steps in the definition's order with each mode's depth, then the starts, then the habits", () => {
    const headings = text.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## The steps",
      "## The starts",
      "## The habits",
      "## The reshapes",
      "## The pages",
    ]);
    expect(text.indexOf("| `outline`")).toBeLessThan(text.indexOf("| `check`"));
    expect(rowOf(text, "Slot")).toEqual([
      "Slot",
      "quick",
      "careful",
      "Default skills",
      "Trials",
      "Absorbed",
      "Candidates",
      "Marks",
    ]);
  });

  it("fills an empty step's row with its candidate", () => {
    expect(rowOf(text, "`outline`")).toEqual([
      "`outline`",
      "none",
      "written",
      "none",
      "none",
      "none",
      "`https://example.com/three/skills/three` (`lift`, `fill`): A plan nobody wrote down.",
      "",
    ]);
  });

  it("marks a step two default skills serve for the re-cut and keeps a hold listed", () => {
    expect(rowOf(text, "`check`")).toEqual([
      "`check`",
      "inline",
      "independent, 1 agent",
      "`fixture-skill`, `second-check`",
      "none",
      "none",
      "`https://example.com/four` (`hold`, `strengthen`): A check that cannot fail.",
      "re-cut: 2 default skills",
    ]);
  });

  it("drops a candidate whose latest verdict is decline, and names the extra flag", () => {
    expect(rowOf(text, "`fixture-start`")).toEqual([
      "`fixture-start`",
      "`fixture-start` (extra)",
      "none",
      "none",
      "none",
      "",
    ]);
  });

  it("lists a habit's two sources that entered it as absorbed, with no combine mark, and drops the one handed off", () => {
    // J-66: an absorbed source has entered its skill already, so a shared catch among absorbed sources marks nothing.
    expect(rowOf(text, "`fixture-habit`")).toEqual([
      "`fixture-habit`",
      "`fixture-habit`",
      "none",
      `\`https://example.com/one/skills/one\` (\`lift\`, \`strengthen\`): ${SECRET}; \`https://example.com/two/skills/two\` (\`copy\`, \`strengthen\`): ${SECRET}`,
      "none",
      "",
    ]);
  });

  it("lists an added habit on a row of its own, and a reshape by its mode", () => {
    expect(rowOf(text, "`new-habit`")).toEqual([
      "`new-habit`",
      "none",
      "none",
      "none",
      "`https://example.com/six/skills/six` (`lift`, `add`): A flaky test kept.",
      "proposed: no roster skill holds the slot yet",
    ]);
    expect(rowOf(text, "`quick`")).toEqual([
      "`quick`",
      "`https://example.com/seven` (`lift`, `reshape`, absorbed): A fast change nobody reviewed.",
    ]);
  });
});

describe("R5: the line view renders a fourth kind from the definition, with no code change", () => {
  const gated: readonly LineSkill[] = [
    ...SKILLS,
    { name: "fixture-gate", kind: "gate", slot: "check" },
    { name: "outline-gate", kind: "gate", slot: "outline", trial: true },
  ];
  const entries = [
    ...lineEntries(),
    read(
      "2026-10-15-nine-gated",
      "nine",
      ".",
      "lift",
      placement("gate", "fixture-gate", "strengthen", "A change merged with a red check.", [
        { mode: "quick", step: "check", depth: "inline", cost: 15 },
        { mode: "careful", step: "check", depth: "independent", cost: 15 },
      ]),
    ),
  ];
  const text = renderLine(lineOf({ definition: GATED, skills: gated, chain: chainOf(entries) }));

  /** The lines of the view under one heading, up to the next. */
  function sectionOf(heading: string): string {
    const start = text.indexOf(`${heading}\n`);
    const next = text.indexOf("\n## ", start + heading.length);
    return text.slice(start, next === -1 ? undefined : next);
  }

  it("groups the gates as their own section, after the kinds declared before it", () => {
    const headings = text.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## The steps",
      "## The starts",
      "## The habits",
      "## The gates",
      "## The reshapes",
      "## The pages",
    ]);
    expect(text).toContain(
      "A slot is a position on it that one skill serves: a step, a start, a habit or a gate.",
    );
  });

  it("orders the gates' rows in the line's order, each with its step's depth at every mode, and its stack", () => {
    const gates = sectionOf("## The gates");
    expect(rowOf(gates, "Slot")).toEqual([
      "Slot",
      "quick",
      "careful",
      "Default skills",
      "Trials",
      "Absorbed",
      "Candidates",
      "Marks",
    ]);
    expect(gates.indexOf("| `outline`")).toBeLessThan(gates.indexOf("| `check`"));
    expect(rowOf(gates, "`outline`")).toEqual([
      "`outline`",
      "none",
      "written",
      "none",
      "`outline-gate`",
      "none",
      "none",
      "",
    ]);
    expect(rowOf(gates, "`check`")).toEqual([
      "`check`",
      "inline",
      "independent, 1 agent",
      "`fixture-gate`",
      "none",
      "`https://example.com/nine` (`lift`, `strengthen`): A change merged with a red check.",
      "none",
      "",
    ]);
  });

  it("keeps the step section as it was, the gates on no step's row", () => {
    expect(rowOf(sectionOf("## The steps"), "`check`")?.[3]).toBe(
      "`fixture-skill`, `second-check`",
    );
  });

  it("orders the sections as the definition declares its kinds", () => {
    const reordered = withKinds((base) => [...base].reverse());
    const headings = renderLine(
      lineOf({ definition: reordered, skills: SKILLS, chain: { entries: [] } }),
    )
      .split("\n")
      .filter((line) => line.startsWith("## "));
    expect(headings).toEqual(["## The habits", "## The starts", "## The steps", "## The pages"]);
  });
});

describe("R4: the line of this tree", () => {
  const manifest = parseCorpusManifest(
    readFileSync(join(repository, "corpus/manifest.json"), "utf8"),
    "corpus/manifest.json",
  );
  if (manifest._tag === "err") throw manifest.error;
  const definition = definitionOf(
    readFileSync(join(repository, "corpus/runtime/modes.json"), "utf8"),
  );
  const line = lineOf({ definition, skills: manifest.value.skills, chain: { entries: [] } });

  it("places every roster skill on exactly one row", () => {
    const placed = line.sections.flatMap((section) =>
      section.rows.flatMap((slot) => [...slot.defaults, ...slot.trials].map((skill) => skill.name)),
    );
    expect([...placed].sort()).toEqual(manifest.value.skills.map((skill) => skill.name).sort());
  });

  it("holds the seven steps in the definition's order, each served by a default skill and none by a trial", () => {
    const [steps] = line.sections;
    expect(steps?.rows.map((slot) => slot.name)).toEqual(definition.steps.map((step) => step.name));
    expect(
      steps?.rows.find((slot) => slot.name === "anticipate")?.defaults.map((skill) => skill.name),
    ).toEqual(["anticipate"]);
    expect(steps?.rows.flatMap((slot) => slot.trials)).toEqual([]);
  });

  it("refuses no kind or slot of the manifest", () => {
    expect(kindIssues(manifest.value.skills, definition)).toEqual([]);
  });
});

describe("S13: the line follows a retirement to the skill that took its place", () => {
  /** A retirement of `skill` by `replacedBy`, as the chain fixture writes one. */
  function retirement(id: string, skill: string, replacedBy: string | null): FixtureEntry {
    return {
      schema: ENTRY_SCHEMA,
      id,
      kind: "retirement",
      skill,
      slice: "S13 of the fixture plan",
      replacedBy,
      recipe: "1".repeat(64),
      gist: `The ${skill} skill leaves`,
      reason: `The ${skill} skill leaves the roster.`,
      authorisedBy: null,
      ruling: [],
    };
  }
  const placedOn = (id: string, name: string, slot: string, catches: string): FixtureEntry =>
    read(id, name, ".", "lift", placement("step", slot, "strengthen", catches, LOADING_ROWS));
  const change = (id: string, skill: string): FixtureEntry => ({
    schema: ENTRY_SCHEMA,
    id,
    kind: "change",
    subject: `skill:${skill}`,
    recipe: "1".repeat(64),
    result: "2".repeat(64),
    pages: [{ path: "SKILL.md" }],
    gist: `The ${skill} skill is recorded`,
    reason: `The ${skill} skill is recorded.`,
    authorisedBy: null,
    ruling: [],
    measure: { stub: false, sources: [], growth: 1 },
  });
  const skills: readonly LineSkill[] = [
    { name: "fixture-frame", kind: "step", slot: "check" },
    { name: "fixture-habit", kind: "habit" },
  ];
  const text = renderLine(
    lineOf({
      definition: DEFINITION,
      skills,
      chain: chainOf([
        change("2026-10-01-old-check-recorded", "old-check"),
        change("2026-10-02-older-check-recorded", "older-check"),
        change("2026-10-03-gone-habit-recorded", "gone-habit"),
        placedOn("2026-10-04-on-old", "nine", "old-check", "A frame built on a guess."),
        placedOn("2026-10-05-on-older", "ten", "older-check", "A plan with no check."),
        placedOn("2026-10-06-on-gone", "eleven", "gone-habit", "A habit nobody keeps."),
        retirement("2026-10-07-older-retired", "older-check", "old-check"),
        retirement("2026-10-08-old-retired", "old-check", "fixture-frame"),
        retirement("2026-10-09-gone-retired", "gone-habit", null),
      ]),
    }),
  );

  it("stands a candidate on a retired skill on its replacement's row, through a replacement retired in turn", () => {
    expect(rowOf(text, "`check`")).toEqual([
      "`check`",
      "inline",
      "independent, 1 agent",
      "`fixture-frame`",
      "none",
      "`https://example.com/nine` (`lift`, `strengthen`): A frame built on a guess.; `https://example.com/ten` (`lift`, `strengthen`): A plan with no check.",
      "none",
      "",
    ]);
  });

  it("puts no retired name on a slot's row, and lists a candidate whose skill no other replaced apart", () => {
    for (const name of ["old-check", "older-check", "gone-habit"])
      expect(rowOf(text, `\`${name}\``)?.length ?? 0).toBeLessThan(3);
    expect(text).toContain("## On a retired skill");
    expect(rowOf(text, "`gone-habit`")).toEqual([
      "`gone-habit`",
      "`https://example.com/eleven` (`lift`, `strengthen`, pending): A habit nobody keeps.",
    ]);
  });
});
