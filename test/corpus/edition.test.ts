/** The edition's data (`src/corpus/edition.ts`): the blocks of a shipped text, a skill's place on the line, its numbered rulings, the line's facts, the example record and the released changes, on small inputs and on this tree's modes definition. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mismatches, parseChangeRecord } from "../../src/core/change.ts";
import { parseModes, type Depth, type ModesDefinition } from "../../src/core/modes.ts";
import {
  blocksOf,
  citationOf,
  editionSkill,
  exampleRecord,
  EXAMPLE_RECORD_ID,
  lineFacts,
  linePlaces,
  releasedChanges,
  type Block,
} from "../../src/corpus/edition.ts";
import type { SkillProvenance } from "../../src/corpus/provenance.ts";

const repository = join(import.meta.dirname, "..", "..");

function definition(): ModesDefinition {
  const parsed = parseModes(
    readFileSync(join(repository, "corpus/runtime/modes.json"), "utf8"),
    "corpus/runtime/modes.json",
  );
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

/** Each block as its type, level and text, so a case reads as the text it cuts. */
const cut = (text: string): readonly (readonly [string, number, string])[] =>
  blocksOf(text).map((block: Block) => [
    block.type,
    block.level,
    text.slice(block.start, block.end),
  ]);

/** Whether the blocks tile the text: in order, contiguous, from 0 to its length. */
function tiles(text: string, blocks: readonly Block[]): boolean {
  let at = 0;
  for (const block of blocks) {
    if (block.start !== at || block.end <= block.start) return false;
    at = block.end;
  }
  return at === text.length;
}

describe("the blocks of a shipped text", () => {
  it("cuts front matter, headings with their level, paragraphs, list items with their nesting, fences and blank runs", () => {
    const text = [
      "---",
      "name: tiny",
      "description: A tiny skill.",
      "---",
      "",
      "# Tiny",
      "",
      "A paragraph that",
      "runs on two lines.",
      "",
      "",
      "## The steps",
      "- one",
      "  carried on",
      "  - nested",
      "- two",
      "1. first",
      "",
      "```sh",
      "pnpm test",
      "",
      "# not a heading",
      "```",
      "| a | b |",
      "| - | - |",
      "",
    ].join("\n");
    expect(cut(text)).toEqual([
      ["front-matter", 0, "---\nname: tiny\ndescription: A tiny skill.\n---\n"],
      ["blank", 0, "\n"],
      ["heading", 1, "# Tiny\n"],
      ["blank", 0, "\n"],
      ["paragraph", 0, "A paragraph that\nruns on two lines.\n"],
      ["blank", 0, "\n\n"],
      ["heading", 2, "## The steps\n"],
      ["list-item", 0, "- one\n  carried on\n"],
      ["list-item", 1, "  - nested\n"],
      ["list-item", 0, "- two\n"],
      ["list-item", 0, "1. first\n"],
      ["blank", 0, "\n"],
      ["fence", 0, "```sh\npnpm test\n\n# not a heading\n```\n"],
      ["paragraph", 0, "| a | b |\n| - | - |\n"],
    ]);
    expect(tiles(text, blocksOf(text))).toBe(true);
  });

  it("keeps an unclosed fence to the end, a last line without its newline, an indented fence inside a list, and a longer closing fence", () => {
    expect(cut("Text\n```\ncode")).toEqual([
      ["paragraph", 0, "Text\n"],
      ["fence", 0, "```\ncode"],
    ]);
    expect(cut("- item\n\n  ```\n  - not an item\n  ```\n")).toEqual([
      ["list-item", 0, "- item\n"],
      ["blank", 0, "\n"],
      ["fence", 0, "  ```\n  - not an item\n  ```\n"],
    ]);
    expect(cut("````md\n```\ninside\n````\nafter\n")).toEqual([
      ["fence", 0, "````md\n```\ninside\n````\n"],
      ["paragraph", 0, "after\n"],
    ]);
    expect(cut("~~~\nx\n~~~\n")).toEqual([["fence", 0, "~~~\nx\n~~~\n"]]);
  });

  it("reads front matter only at the start, a thematic break as a paragraph, and gives nothing for empty text", () => {
    expect(cut("Intro\n---\nname: x\n---\n")).toEqual([
      ["paragraph", 0, "Intro\n---\nname: x\n---\n"],
    ]);
    expect(cut("Text\n\n* * *\n- - -\n---\n")).toEqual([
      ["paragraph", 0, "Text\n"],
      ["blank", 0, "\n"],
      ["paragraph", 0, "* * *\n- - -\n---\n"],
    ]);
    expect(cut("#hashtag is prose\n####### seven\n")).toEqual([
      ["paragraph", 0, "#hashtag is prose\n####### seven\n"],
    ]);
    expect(blocksOf("")).toEqual([]);
    expect(cut("  \n\t\n")).toEqual([["blank", 0, "  \n\t\n"]]);
  });

  it("tiles any text it is given", () => {
    for (const text of [
      "a",
      "\n",
      "---\n",
      "---\nunclosed",
      "- a\n    - b\n        - c\n  - d\n",
      "# h\n##\n### h3 ###\n",
      "1) one\n2) two\n\nx\r\ny\n",
    ])
      expect([text, tiles(text, blocksOf(text))]).toEqual([text, true]);
  });
});

describe("the place of a skill on the line", () => {
  it("orders the steps by their slot, then each kind beside the line, defaults before extras before trials, names alphabetical within a group", () => {
    const places = linePlaces(definition(), [
      { name: "habit-b", kind: "habit" },
      { name: "close", kind: "step", slot: "close" },
      { name: "start-trial", kind: "start", trial: true },
      { name: "habit-a", kind: "habit" },
      { name: "frame", kind: "step", slot: "frame" },
      { name: "start-extra", kind: "start", extra: true },
      { name: "start-a", kind: "start" },
      { name: "habit-extra", kind: "habit", extra: true },
    ]);
    expect([...places].sort(([, a], [, b]) => a.position - b.position)).toEqual([
      ["frame", { kind: "step", slot: "frame", extra: false, trial: false, position: 1 }],
      ["close", { kind: "step", slot: "close", extra: false, trial: false, position: 2 }],
      ["start-a", { kind: "start", extra: false, trial: false, position: 3 }],
      ["start-extra", { kind: "start", extra: true, trial: false, position: 4 }],
      ["start-trial", { kind: "start", extra: false, trial: true, position: 5 }],
      ["habit-a", { kind: "habit", extra: false, trial: false, position: 6 }],
      ["habit-b", { kind: "habit", extra: false, trial: false, position: 7 }],
      ["habit-extra", { kind: "habit", extra: true, trial: false, position: 8 }],
    ]);
  });
});

describe("the numbered rulings", () => {
  const ruling = [
    { date: "2026-10-08", words: 'R1 of 2026-10-08, "yes": the first thing' },
    { date: "2026-10-08", words: "R2: the second thing" },
    { date: "2026-10-08", words: "R3: the third thing." },
  ];

  /** A skill whose passages, edits, drop and credit cite rulings, some the entry's items and some not. */
  const tiny: SkillProvenance = {
    name: "tiny",
    entry: {
      id: "2026-10-09-tiny",
      gist: "A gist",
      reason: "A reason.",
      pages: [{ path: "SKILL.md" }],
      authorisedBy: null,
      ruling,
    },
    stub: true,
    credit: { source: "upstream", file: "SKILL.md", ruling: "R9: the credit" },
    sources: [],
    files: [
      {
        path: "SKILL.md",
        text: "Written. Taken.",
        passages: [
          {
            origin: "written",
            start: 0,
            end: 8,
            kind: "scope",
            reason: "Why written.",
            ruling: "R7: a recipe's own words",
            credits: [],
          },
          {
            origin: "taken",
            start: 9,
            end: 15,
            source: "upstream",
            file: "SKILL.md",
            segments: ["s1"],
            edits: [
              {
                segment: "s1",
                start: 9,
                end: 15,
                find: "Took.",
                replace: "Taken.",
                kind: "name",
                reason: "Why edited.",
                ruling: "and R2: the second thing.",
              },
              {
                segment: "s1",
                start: 9,
                end: 15,
                find: "Took",
                replace: "Taken",
                kind: "name",
                reason: "Why again.",
                ruling: " R7: a recipe's own words. ",
              },
              {
                segment: "s1",
                start: 9,
                end: 15,
                find: "T",
                replace: "T",
                kind: "name",
                reason: "No ruling.",
              },
            ],
          },
        ],
      },
    ],
    copies: [],
    coverage: [
      {
        source: "upstream",
        file: "SKILL.md",
        segments: [
          { id: "s1", text: "Took.", account: "taken", edited: true },
          {
            id: "s2",
            text: "Dropped.",
            account: "dropped",
            kind: "scope",
            reason: "Why dropped.",
            ruling: "R8: a drop's ruling",
          },
        ],
      },
    ],
  };
  const place = { kind: "habit", extra: false, trial: false, position: 1 } as const;

  it("numbers the distinct rulings of the passages, edits, drops and credit in order of first appearance, then the entry's items none of them equals", () => {
    const record = editionSkill(tiny, place);
    expect(record.rulings).toEqual([
      { number: 1, text: "R7: a recipe's own words" },
      { number: 2, text: "R2: the second thing." },
      { number: 3, text: "R8: a drop's ruling" },
      { number: 4, text: "R9: the credit" },
      { number: 5, text: 'R1 of 2026-10-08, "yes": the first thing' },
      { number: 6, text: "R3: the third thing." },
    ]);
  });

  it("makes every passage, edit, drop and credit cite its ruling's number, and leaves a citation out where none is stated", () => {
    const record = editionSkill(tiny, place);
    const [written, taken] = record.files[0]?.passages ?? [];
    expect(written).toMatchObject({ origin: "written", ruling: 1 });
    expect(taken?.origin === "taken" ? taken.edits.map((edit) => edit.ruling) : []).toEqual([
      2,
      1,
      undefined,
    ]);
    expect(
      record.coverage[0]?.segments.map((segment) =>
        segment.account === "dropped" ? segment.ruling : "taken",
      ),
    ).toEqual(["taken", 3]);
    expect(record.credit?.ruling).toBe(4);
    expect(record.entry.ruling).toEqual(ruling);
    expect(citationOf(record.rulings, "R3: the third thing")).toBe(6);
    expect(citationOf(record.rulings, undefined)).toBeUndefined();
  });

  it("S8b: numbers an entry's ruling list item by item, with no cut at a semicolon and its words whole, and carries the list and the gist", () => {
    const list = [
      { date: "2026-10-08", words: 'R1, "yes": the first thing; and its second clause' },
      { date: "2026-10-09", words: "R2: the second thing." },
      { date: "2026-10-11", words: "R10: the tenth thing; its own clause" },
      { date: "2026-10-12", words: "and R11: the words kept whole" },
    ];
    const record = editionSkill(
      {
        ...tiny,
        entry: {
          id: "2026-10-11-tiny",
          gist: "A gist",
          reason: "A reason.",
          pages: [{ path: "SKILL.md" }],
          authorisedBy: null,
          ruling: list,
        },
      },
      place,
    );
    expect(record.rulings).toEqual([
      { number: 1, text: "R7: a recipe's own words" },
      { number: 2, text: "R2: the second thing." },
      { number: 3, text: "R8: a drop's ruling" },
      { number: 4, text: "R9: the credit" },
      { number: 5, text: 'R1, "yes": the first thing; and its second clause' },
      { number: 6, text: "R10: the tenth thing; its own clause" },
      { number: 7, text: "and R11: the words kept whole" },
    ]);
    expect(record.entry).toEqual({
      id: "2026-10-11-tiny",
      gist: "A gist",
      reason: "A reason.",
      pages: [{ path: "SKILL.md" }],
      authorisedBy: null,
      ruling: list,
    });
  });

  it("S1 carries a written passage's, an edit's and a dropped segment's gist beside its cited ruling, and no gist where the account has none", () => {
    const [file] = tiny.files;
    const [written, taken] = file?.passages ?? [];
    const [coverage] = tiny.coverage;
    if (written?.origin !== "written" || taken?.origin !== "taken" || coverage === undefined)
      throw new Error("tiny holds a written passage, a taken one and its coverage");
    const gisted: SkillProvenance = {
      ...tiny,
      files: [
        {
          path: "SKILL.md",
          text: file?.text ?? "",
          passages: [
            { ...written, gist: "Writes the recipe's own words" },
            {
              ...taken,
              edits: taken.edits.map((edit, index) =>
                index === 0 ? { ...edit, gist: "Takes the house word" } : edit,
              ),
            },
          ],
        },
      ],
      coverage: [
        {
          ...coverage,
          segments: coverage.segments.map((segment) =>
            segment.account === "dropped" ? { ...segment, gist: "Leaves out the drop" } : segment,
          ),
        },
      ],
    };
    const record = editionSkill(gisted, place);
    const [editionWritten, editionTaken] = record.files[0]?.passages ?? [];
    expect(editionWritten).toMatchObject({ gist: "Writes the recipe's own words", ruling: 1 });
    expect(
      editionTaken?.origin === "taken" ? editionTaken.edits.map((edit) => edit.gist) : [],
    ).toEqual(["Takes the house word", undefined, undefined]);
    expect(record.coverage[0]?.segments[1]).toMatchObject({
      account: "dropped",
      gist: "Leaves out the drop",
      ruling: 3,
    });
    const plain = editionSkill(tiny, place);
    expect(JSON.stringify([plain.files, plain.coverage])).not.toContain('"gist"');
  });
});

describe("the line's facts", () => {
  it("J-73 S2 states the steps in order, each mode's agents derived from its depths, its fix rounds and depth per step, and the floors, as the definition holds them", () => {
    const modes = definition();
    const facts = lineFacts(modes);
    expect(facts.steps).toEqual(modes.steps.map((step) => ({ name: step.name })));
    expect(facts.floors).toEqual(
      modes.floors.map((floor) => ({ name: floor.name, risk: floor.risk, mode: floor.mode })),
    );
    expect(facts.modes.map((mode) => mode.name)).toEqual(["quick", "regular", "careful"]);
    // The agents derived from the depths, the builder counted.
    const agents = new Map([
      ["quick", 1],
      ["regular", 2],
      ["careful", 5],
    ]);
    for (const mode of modes.modes) {
      const stated = facts.modes.find((candidate) => candidate.name === mode.name);
      expect(stated).toEqual({
        name: mode.name,
        promise: mode.promise,
        typicalRequest: mode.typicalRequest,
        agents: agents.get(mode.name),
        fixRounds: mode.fixRounds,
        budget: { words: mode.budget.words },
        steps: modes.steps.map((step) => ({ step: step.name, ...mode.steps[step.name] })),
      });
    }
    expect(facts.modes[2]?.steps[2]).toEqual({
      step: "anticipate",
      depth: "independent",
      agents: 1,
    });
    expect(facts.modes[1]?.steps[4]).toEqual({ step: "review", depth: "independent", agents: 1 });
  });
});

describe("the example record", () => {
  it("is a done regular record that the product's parser reads and finds no mismatch in, written from the regular skeleton", () => {
    const modes = definition();
    const record = exampleRecord(modes);
    if (record._tag === "err") throw record.error;
    const text = record.value;
    expect(text.split("\n").length).toBeLessThan(60);
    expect(text.startsWith("---\nmode: regular\n")).toBe(true);
    const parsed = parseChangeRecord(modes, `${EXAMPLE_RECORD_ID}.md`, text);
    if (parsed._tag === "err") throw parsed.error;
    expect(parsed.value.position).toMatchObject({ state: "done" });
    expect(parsed.value.why).toBe("Keep the caller's deadline across retries.");
    // Its cost names the one fresh agent regular's review starts, so the builder and that start make its agents.
    expect(text).toContain('\nagents: 2\nrounds: 1\nstarts: ["review 1"]\n');
    expect(parsed.value.starts).toEqual([{ step: "review", number: 1, restarted: false }]);
    expect(mismatches(modes, parsed.value, { ticketsFile: "absent" })).toEqual([]);
    // J-93 S1: the step regular skips keeps its section, the one line saying so.
    expect(parsed.value.sections.map((section) => section.step)).toEqual([
      "frame",
      "plan",
      "anticipate",
      "build",
      "review",
      "verify",
      "close",
    ]);
    // The first line after the front matter says it is an example.
    const body = text.slice(text.indexOf("---\n", 4) + 4);
    expect(body.split("\n").find((line) => line.trim() !== "")).toMatch(/^An example/);
  });

  it("holds its frame, plan and build sections to the guide's pipeline page, each body verbatim in the guide's example", () => {
    const record = exampleRecord(definition());
    if (record._tag === "err") throw record.error;
    const guide = readFileSync(join(repository, "guide/pipeline.md"), "utf8");
    const fenced = /```markdown\n(---\nmode: regular\n[\s\S]*?)```/.exec(guide)?.[1] ?? "";
    expect(fenced).toContain('why: "Keep the caller\'s deadline across retries."');
    for (const step of ["frame", "plan", "build"]) {
      const body = (record.value.split(`\n## ${step}\n`)[1] ?? "").split("\n## ")[0]?.trim() ?? "";
      expect([step, body !== "" && fenced.includes(`## ${step}\n\n${body}\n`)]).toEqual([
        step,
        true,
      ]);
    }
  });

  it("refuses a definition whose regular skeleton holds a step the example does not fill", () => {
    // The definition on disk with its last step renamed, read through the product's own parse.
    const raw: {
      steps: { name: string }[];
      modes: { steps: Record<string, Depth> }[];
    } = JSON.parse(readFileSync(join(repository, "corpus/runtime/modes.json"), "utf8"));
    for (const step of raw.steps) if (step.name === "close") step.name = "finish";
    for (const mode of raw.modes) {
      const { close, ...rest } = mode.steps;
      if (close !== undefined) mode.steps = { ...rest, finish: close };
    }
    const renamed = parseModes(JSON.stringify(raw), "corpus/runtime/modes.json");
    if (renamed._tag === "err") throw renamed.error;
    const record = exampleRecord(renamed.value);
    expect(record._tag).toBe("err");
    if (record._tag === "err")
      expect(record.error.issues).toEqual([
        "the regular skeleton holds the step 'finish', which the example does not fill",
        "the example fills the step 'close', which the regular skeleton does not hold",
      ]);
  });
});

describe("the released changes", () => {
  it("reads each released section's version, date, summary paragraphs and groups, list items and table rows alike, and leaves Unreleased out", () => {
    const changelog = [
      "# Changelog",
      "",
      "Intro.",
      "",
      "## Unreleased",
      "",
      "- not yet",
      "",
      "## 0.2.0 (2026-11-01)",
      "",
      "A summary paragraph",
      "on two lines.",
      "",
      "A second paragraph.",
      "",
      "### The first group",
      "",
      "- First item,",
      "  wrapped.",
      "- Second `item`.",
      "",
      "### The second group",
      "",
      "- Third item.",
      "",
      "## 0.0.1 (2026-08-28)",
      "",
      "| Part     | What changed |",
      "| -------- | ------------ |",
      "| Commands | `init` works. |",
      "| Roster   | 38 skills.   |",
      "",
    ].join("\n");
    expect(releasedChanges(changelog)).toEqual([
      {
        version: "0.2.0",
        date: "2026-11-01",
        summary: ["A summary paragraph on two lines.", "A second paragraph."],
        groups: [
          { title: "The first group", items: ["First item, wrapped.", "Second `item`."] },
          { title: "The second group", items: ["Third item."] },
        ],
      },
      {
        version: "0.0.1",
        date: "2026-08-28",
        summary: [],
        groups: [{ title: "", items: ["Commands: `init` works.", "Roster: 38 skills."] }],
      },
    ]);
  });

  it("reads this tree's changelog as two released versions, 0.1.0 with its two summary paragraphs and nine groups, then 0.0.1 with its four rows in one untitled group", () => {
    const released = releasedChanges(readFileSync(join(repository, "CHANGELOG.md"), "utf8"));
    expect(
      released.map((release) => [
        release.version,
        release.date,
        release.summary.length,
        release.groups.map((group) => [group.title, group.items.length]),
      ]),
    ).toEqual([
      [
        "0.1.0",
        "2026-10-21",
        2,
        [
          ["Offline by default, garden optional", 5],
          ["The modes and the proposal", 11],
          ["The change record", 9],
          ["The roster by kind", 10],
          ["The two settings", 1],
          ["The commands", 10],
          ["The hooks and the declared checks", 7],
          ["Schemas and the lock", 4],
          ["The public source", 2],
        ],
      ],
      ["0.0.1", "2026-08-28", 0, [["", 4]]],
    ]);
    expect(released[0]?.summary[0]).toMatch(/^greenline 0\.1\.0 installs a practice/);
    expect(released[0]?.groups[0]?.items[0]).toMatch(/^A greenline install needs no account/);
    expect(released[1]?.groups[0]?.items[0]).toMatch(/^Commands: `npx greenline init` initializes/);
  });
});
