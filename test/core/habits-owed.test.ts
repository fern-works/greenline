import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  changeMessages,
  fileClassesOf,
  invariantFloors,
  namedMode,
  ownersOwnWords,
  owedLine,
  owedSkills,
  owedUnmetBy,
  parseTriggers,
  situationLine,
  triggersText,
  type OwedContext,
  type Triggers,
} from "../../src/core/habits-owed.ts";
import type { LoadSeen } from "../../src/core/skill-loads.ts";

/**
 * The skills a change owes (J-134 S3, widened by J-176 S1): trigger rows a
 * habit or a start carries as data, read against the request's words, the
 * classes of the files touched, the step and the mode; the line in weight
 * order within the reading budget; the situation the proposal answers; and
 * the rendered file the installation carries, in the formatter's layout.
 */

const TRIGGERS: Triggers = {
  schema: "greenline.triggers/v1",
  skills: [
    {
      name: "redesign",
      kind: "start",
      rows: [{ words: ["redesign", "denser"], weight: 3, read: "whole" }],
    },
    {
      name: "show-me",
      kind: "habit",
      rows: [
        { words: ["diagram"], weight: 2, read: "whole" },
        { files: ["schema"], steps: ["build"], weight: 1, read: "part" },
      ],
    },
    { name: "tdd", kind: "habit", rows: [{ files: ["test"], weight: 2, read: "part" }] },
    {
      name: "ponytail",
      kind: "habit",
      rows: [{ steps: ["build"], modes: ["regular", "careful"], weight: 1, read: "part" }],
    },
  ],
};

const context = (overrides: Partial<OwedContext>): OwedContext => ({
  words: "",
  classes: new Set(),
  steps: new Set(),
  mode: undefined,
  ...overrides,
});

describe("J-176 S1 the skills a change owes by its trigger rows", () => {
  it("owes a start by the request's words, on their word boundaries, and nothing for a word inside another", () => {
    expect(
      owedSkills(TRIGGERS, context({ words: "Make the issues list denser, please." })),
    ).toEqual([
      {
        skill: "redesign",
        kind: "start",
        read: "whole",
        why: "the request says denser",
        weight: 3,
      },
    ]);
    expect(owedSkills(TRIGGERS, context({ words: "a redesigned crest" }))).toEqual([]);
  });

  it("owes a habit by a class of file touched, a step's row only at its step and a mode's row only at its mode", () => {
    const touched = new Set(["test", "schema"] as const);
    expect(owedSkills(TRIGGERS, context({ classes: touched })).map((entry) => entry.skill)).toEqual(
      ["tdd"],
    );
    const atBuild = owedSkills(
      TRIGGERS,
      context({ classes: touched, steps: new Set(["build"]), mode: "regular" }),
    );
    expect(atBuild.map((entry) => `${entry.skill} ${entry.read} ${entry.why}`)).toEqual([
      "tdd part a test file touched",
      "ponytail part at build",
      "show-me part a schema file touched, at build",
    ]);
    expect(owedSkills(TRIGGERS, context({ steps: new Set(["build"]), mode: "quick" }))).toEqual([]);
  });

  it("J-178 S1 owes only a skill the workspace installed, where the installed roster is given", () => {
    const words = "redesign it, with a diagram";
    expect(
      owedSkills(TRIGGERS, context({ words, installed: new Set(["show-me"]) })).map(
        (entry) => entry.skill,
      ),
    ).toEqual(["show-me"]);
    expect(owedSkills(TRIGGERS, context({ words })).map((entry) => entry.skill)).toEqual([
      "redesign",
      "show-me",
    ]);
  });

  it("takes a skill's heaviest row, a whole read before a part read of the same weight", () => {
    const owed = owedSkills(
      TRIGGERS,
      context({ words: "draw a diagram", classes: new Set(["schema"]), steps: new Set(["build"]) }),
    );
    expect(owed).toEqual([
      {
        skill: "show-me",
        kind: "habit",
        read: "whole",
        why: "the request says diagram",
        weight: 2,
      },
    ]);
  });
});

describe("J-176 S1 the owed line", () => {
  const owed = owedSkills(
    TRIGGERS,
    context({
      words: "redesign it, with a diagram",
      classes: new Set(["test"]),
      steps: new Set(["build"]),
      mode: "careful",
    }),
  );

  it("names the skills no load holds, each as a whole read or its front with what owed it", () => {
    expect(owedLine(owed, new Set(["show-me"]))).toBe(
      "owes: redesign (whole: the request says redesign); tdd (its front: a test file touched); ponytail (its front: at build); read what the line names before the step that uses it",
    );
    expect(owedLine(owed, new Set(["redesign", "show-me", "tdd", "ponytail"]))).toBeUndefined();
    expect(owedLine([], new Set())).toBeUndefined();
  });

  it("prints in weight order within the mode's reading budget, the first always, and counts the rest", () => {
    const cost = (skill: string): number => (skill === "redesign" ? 900 : 300);
    expect(owedLine(owed, new Set(), { headroom: 1300, cost })).toBe(
      "owes: redesign (whole: the request says redesign); show-me (whole: the request says diagram); and 2 more past the mode's reading budget; read what the line names before the step that uses it",
    );
    expect(owedLine(owed, new Set(), { headroom: 0, cost })).toContain(
      "owes: redesign (whole: the request says redesign); and 3 more past",
    );
  });
});

describe("J-176 S1 the file classes, the mode named and the situation", () => {
  it("reads a touched file's classes from its path alone, and none under greenline's folder", () => {
    expect(fileClassesOf("test/loans.test.ts")).toEqual(["test"]);
    expect(fileClassesOf("db/migrations/002_year.sql")).toEqual(["schema", "migration"]);
    expect(fileClassesOf("src/pages/Issues.tsx")).toEqual(["page"]);
    expect(fileClassesOf("packages/billing/package.json")).toEqual(["module"]);
    expect(fileClassesOf(".env.local")).toEqual(["secret"]);
    expect(fileClassesOf("api/openapi.yaml")).toEqual(["contract"]);
    expect(fileClassesOf("src/loans.ts")).toEqual([]);
    expect(fileClassesOf(".greenline/ledger/x.md")).toEqual([]);
  });

  it("J-178 S1 reads a README and a benchmark from the path, and no other document or test as either", () => {
    expect(fileClassesOf("README.md")).toEqual(["readme"]);
    expect(fileClassesOf("packages/shelf/readme")).toEqual(["readme"]);
    expect(fileClassesOf("docs/guide.md")).toEqual([]);
    expect(fileClassesOf("bench/search.ts")).toEqual(["benchmark"]);
    expect(fileClassesOf("benchmarks/sort.js")).toEqual(["benchmark"]);
    expect(fileClassesOf("src/sort.bench.ts")).toEqual(["benchmark"]);
    expect(fileClassesOf("src/bench.ts")).toEqual([]);
    expect(fileClassesOf("test/sort.test.ts")).toEqual(["test"]);
  });

  it("reads the one mode a request names, and none for none or two", () => {
    const modes = ["quick", "regular", "careful"];
    expect(namedMode("do it quick", modes)).toBe("quick");
    expect(namedMode("Careful with the data", modes)).toBe("careful");
    expect(namedMode("quickly", modes)).toBeUndefined();
    expect(namedMode("quick or careful?", modes)).toBeUndefined();
  });

  it("states the mode named, the proceed setting, the floors the files seen raise and the interface fact", () => {
    expect(
      situationLine({
        named: undefined,
        proceed: "none",
        seen: new Set(["secret", "test"]),
        interface: { roots: true, stated: undefined },
        heard: true,
      }),
    ).toBe(
      "situation: mode none named; proceed none; floors seen: security (a secret file); interface: roots stand, the proposal states yes or no",
    );
    expect(
      situationLine({
        named: "careful",
        proceed: "quick",
        seen: new Set(),
        interface: { roots: false, stated: undefined },
        heard: false,
      }),
    ).toBe(
      "situation: mode no hook saw the request; proceed quick; floors seen: none; interface: no interface roots",
    );
  });
});

describe("J-176 S1 the triggers file the instrument renders", () => {
  it("renders the skills by name in the formatter's layout and reads it back", () => {
    const text = triggersText(TRIGGERS.skills);
    expect(text).toContain(
      '      "rows": [\n        {\n          "words": ["redesign", "denser"],',
    );
    const read = parseTriggers(text, "triggers.json");
    expect(read._tag === "ok" ? read.value.skills.map((skill) => skill.name) : []).toEqual([
      "ponytail",
      "redesign",
      "show-me",
      "tdd",
    ]);
  });

  it("refuses a row that holds on nothing, a weight past three and a class it does not know", () => {
    for (const row of [
      { weight: 1, read: "part" },
      { words: ["x1"], weight: 4, read: "part" },
      { files: ["mood"], weight: 1, read: "part" },
    ])
      expect(
        parseTriggers(
          JSON.stringify({
            schema: "greenline.triggers/v1",
            skills: [{ name: "tdd", kind: "habit", rows: [row] }],
          }),
          "t",
        )._tag,
      ).toBe("err");
  });

  it("holds the rows the corpus renders, as the recipes carry them", () => {
    const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "triggers.json");
    const read = parseTriggers(readFileSync(path, "utf8"), path);
    expect(read._tag).toBe("ok");
    if (read._tag !== "ok") return;
    // J-178 S1: every start and habit of the roster carries its rows.
    // SAFETY: corpus/manifest.json is the manifest the installation compiles and checks; only each skill's name and kind are read.
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "corpus", "manifest.json"), "utf8"),
    ) as { skills: { name: string; kind: string }[] };
    expect(read.value.skills.map((skill) => skill.name)).toEqual(
      manifest.skills
        .filter((skill) => skill.kind !== "step")
        .map((skill) => skill.name)
        .sort(),
    );
    // A loosely owed start's rows hold at careful alone.
    expect(
      read.value.skills.some(
        (skill) =>
          skill.kind === "start" &&
          skill.rows.some((row) => row.modes?.length === 1 && row.modes[0] === "careful"),
      ),
    ).toBe(true);
    expect(triggersText(read.value.skills)).toBe(readFileSync(path, "utf8"));
  });
});

describe("J-189 S1 the request's words a change's owed skills are read from", () => {
  it("J-189 S1 reads a harness's notification as no word of the owner's, the owner's words beside it kept", () => {
    // j179c-mode-choice-careful: an agent's finished notice journaled at a turn's start.
    const notice =
      "<task-notification>\n<task-id>a1</task-id>\n<summary>Agent finished: the test fails, sketch the map</summary>\n</task-notification>";
    expect(ownersOwnWords(notice)).toBe("");
    expect(ownersOwnWords(`${notice}\nYes, go on.`)).toBe("Yes, go on.");
    expect(ownersOwnWords("Show the export as CSV.")).toBe("Show the export as CSV.");
  });

  it("J-189 S1 gives each message to the change its turn opened or held, so an earlier change's request is never a later change's", () => {
    // j179c-skills-upstream: the verification's request, then the figure's in the turn the verification's landing was answered.
    const messages = [
      { at: "2026-11-06T22:25:39.291Z", turn: 1, words: "I want to be sure, not just tested." },
      { at: "2026-11-06T22:26:31.158Z", turn: 2, words: "Yes, go ahead." },
      { at: "2026-11-06T22:35:09.139Z", turn: 3, words: "Yes." },
      {
        at: "2026-11-06T23:02:53.717Z",
        turn: 5,
        words: "Leave it. Make me an interactive figure.",
      },
      { at: "2026-11-06T23:03:51.914Z", turn: 6, words: "Yes, please." },
      { at: "2026-11-07T04:17:24.027Z", turn: 7, words: "Carry on with the figure." },
    ];
    const namings = [
      { change: "2026-11-07-verify", turn: 2, at: "2026-11-06T22:26:46.690Z" },
      { change: "2026-11-07-figure", turn: 6, at: "2026-11-06T23:04:05.159Z" },
    ];
    expect(changeMessages("2026-11-07-figure", [{ messages, namings }])).toEqual([
      "Leave it. Make me an interactive figure.",
      "Yes, please.",
      "Carry on with the figure.",
    ]);
    expect(changeMessages("2026-11-07-verify", [{ messages, namings }])).toEqual([
      "I want to be sure, not just tested.",
      "Yes, go ahead.",
      "Yes.",
    ]);
  });

  it("J-189 S1 gives a turn's request to the change the turn opened, past a change it only stopped, and drops a notification", () => {
    // j179c-roster-use thread 002: the held change stopped and the new one opened in the request's own turn.
    const messages = [
      {
        at: "2026-11-06T21:12:41.342Z",
        turn: 1,
        words: "Show the export of the members list as CSV.",
      },
      {
        at: "2026-11-06T21:26:01.601Z",
        turn: 4,
        words: "<task-notification>the token fails a mutation</task-notification>",
      },
      { at: "2026-11-06T21:26:40.282Z", turn: 5, words: "Yes." },
    ];
    const namings = [
      { change: "2026-11-07-settings", turn: 1, at: "2026-11-06T21:13:18.804Z" },
      { change: "2026-11-07-csv", turn: 1, at: "2026-11-06T21:13:37.350Z" },
    ];
    expect(changeMessages("2026-11-07-csv", [{ messages, namings }])).toEqual([
      "Show the export of the members list as CSV.",
      "Yes.",
    ]);
    expect(changeMessages("2026-11-07-settings", [{ messages, namings }])).toEqual([]);
  });
});

describe("J-195 S1 the invariants' floor and the two starts' rows", () => {
  const LIST = [
    "# Invariants",
    "",
    "| Invariant | Relied on at | Door | Boundary |",
    "| --- | --- | --- | --- |",
    "| A fee is never negative | `src/fees.ts` computeFee | a check in computeFee | public contract |",
    "| Only the account's owner reads its fees | `src/api/fees.ts` | a guard on the route | security |",
    "| Fees are summed in cents | `src/fees.ts` | a type | none |",
  ].join("\n");

  it("reads a floor from each entry on a public contract or a security boundary, and none from another", () => {
    expect(invariantFloors(LIST)).toEqual([
      { floor: "public-contract", entry: "A fee is never negative" },
      { floor: "security", entry: "Only the account's owner reads its fees" },
    ]);
    expect(
      invariantFloors(LIST.replace("public contract |", "none |").replace("security |", "none |")),
    ).toEqual([]);
    expect(invariantFloors("no list here")).toEqual([]);
  });

  it("names each such entry on the situation line as a floor seen, the way the file classes' floors are named", () => {
    expect(
      situationLine({
        named: undefined,
        proceed: "none",
        seen: new Set(),
        interface: { roots: false, stated: undefined },
        heard: true,
        invariants: invariantFloors(LIST),
      }),
    ).toBe(
      "situation: mode none named; proceed none; floors seen: public-contract (an invariant: A fee is never negative), security (an invariant: Only the account's owner reads its fees); interface: no interface roots",
    );
  });

  it("owes each start on the owner's phrase verbatim and on its words", () => {
    const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "triggers.json");
    const read = parseTriggers(readFileSync(path, "utf8"), path);
    if (read._tag !== "ok") throw new Error("the triggers file does not parse");
    const owes = (words: string): readonly string[] =>
      owedSkills(read.value, context({ words, mode: "regular" }))
        .filter((each) => each.skill === "state-machines" || each.skill === "invariants")
        .map((each) => each.skill);
    expect(owes("find all of the implicit state machines in my app")).toEqual(["state-machines"]);
    expect(owes("map the states and transitions of the order flow")).toEqual(["state-machines"]);
    expect(owes("find every invariant my app relies on but doesn't explicitly enforce")).toEqual([
      "invariants",
    ]);
    expect(owes("what does the billing code rely on that nothing enforces")).toEqual([
      "invariants",
    ]);
    expect(owes("rename the button")).toEqual([]);
  });
});

describe("J-203 S1 the pages a whole read includes, and what still holds a skill owed whole", () => {
  const PAGED: Triggers = {
    schema: "greenline.triggers/v1",
    skills: [
      {
        name: "tdd",
        kind: "habit",
        wholeRead: ["method.md", "tests.md"],
        rows: [{ files: ["test"], steps: ["build"], weight: 2, read: "whole" }],
      },
      {
        name: "ponytail",
        kind: "habit",
        wholeRead: ["simplify.md"],
        rows: [{ words: ["simplify"], weight: 1, read: "part" }],
      },
    ],
  };
  const load = (
    skill: string,
    file: string,
    whole: boolean,
    cause?: "together" | "cut",
  ): LoadSeen => {
    const seen: LoadSeen = { skill, file, whole, via: "cat" };
    return cause === undefined ? seen : { ...seen, cause };
  };
  const owedAtBuild = owedSkills(
    PAGED,
    context({ words: "add the index", classes: new Set(["test"]), steps: new Set(["build"]) }),
  );

  it("renders a skill's pages beside its rows and reads them back, and refuses a page that is no Markdown page", () => {
    const text = triggersText(PAGED.skills);
    expect(text).toContain('"wholeRead": ["method.md", "tests.md"],');
    const read = parseTriggers(text, "triggers.json");
    expect(read._tag === "ok" ? read.value.skills.map((skill) => skill.wholeRead) : []).toEqual([
      ["simplify.md"],
      ["method.md", "tests.md"],
    ]);
    for (const pages of [[], ["SKILL.md"], ["../tdd/method.md"], ["method.txt"]])
      expect(
        parseTriggers(
          JSON.stringify({
            schema: "greenline.triggers/v1",
            skills: [
              {
                name: "tdd",
                kind: "habit",
                wholeRead: pages,
                rows: [{ words: ["x1"], weight: 1, read: "part" }],
              },
            ],
          }),
          "t",
        )._tag,
        JSON.stringify(pages),
      ).toBe("err");
  });

  it("holds tdd whole on the run's loads: its front by the Skill tool, the method page read with another page and cut, the tests page unread", () => {
    const loads = [
      { skill: "tdd", file: "SKILL.md", whole: true, via: "Skill" },
      load("tdd", "method.md", false, "cut"),
      load("ponytail", "simplify.md", false, "cut"),
    ];
    const unmet = owedUnmetBy(owedAtBuild, loads, PAGED);
    expect(unmet.map((entry) => [entry.skill, entry.held])).toEqual([
      [
        "tdd",
        [
          { file: "method.md", state: "cut" },
          { file: "tests.md", state: "unread" },
        ],
      ],
    ]);
    expect(owedLine(unmet, new Set())).toBe(
      "owes: tdd (whole: a test file touched, at build; method.md cut by the harness, read it again; tests.md unread); read what the line names before the step that uses it",
    );
    const together = owedUnmetBy(
      owedAtBuild,
      [
        { skill: "tdd", file: "SKILL.md", whole: true, via: "Skill" },
        load("tdd", "method.md", false, "together"),
        load("tdd", "tests.md", false),
      ],
      PAGED,
    );
    expect(owedLine(together, new Set())).toContain(
      "tdd (whole: a test file touched, at build; method.md read with another page, read it alone; tests.md read in part, read it whole)",
    );
  });

  it("lets tdd go once each page is read whole, a later whole read meeting an earlier part, and a front read whole where no pages are named", () => {
    const read = [
      load("tdd", "SKILL.md", true),
      load("tdd", "method.md", false, "together"),
      load("tdd", "method.md", true),
      load("tdd", "tests.md", true),
    ];
    expect(owedUnmetBy(owedAtBuild, read, PAGED)).toEqual([]);
    const bare: Triggers = {
      schema: "greenline.triggers/v1",
      skills: [
        {
          name: "tdd",
          kind: "habit",
          rows: [{ files: ["test"], steps: ["build"], weight: 2, read: "whole" }],
        },
      ],
    };
    const owed = owedSkills(
      bare,
      context({ classes: new Set(["test"]), steps: new Set(["build"]) }),
    );
    expect(owedUnmetBy(owed, [load("tdd", "SKILL.md", true)], bare)).toEqual([]);
    expect(
      owedUnmetBy(owed, [load("tdd", "SKILL.md", false)], bare).map((entry) => entry.held),
    ).toEqual([[{ file: "SKILL.md", state: "part" }]]);
  });

  it("meets a front owed by any load of the skill, and names no page for a skill not loaded at all", () => {
    const owed = owedSkills(PAGED, context({ words: "simplify the shelf module" }));
    expect(owedUnmetBy(owed, [load("ponytail", "SKILL.md", false)], PAGED)).toEqual([]);
    const unread = owedUnmetBy(owedAtBuild, [], PAGED);
    expect(unread.map((entry) => [entry.skill, entry.held])).toEqual([["tdd", undefined]]);
    expect(owedLine(unread, new Set())).toBe(
      "owes: tdd (whole: a test file touched, at build); read what the line names before the step that uses it",
    );
  });
});
