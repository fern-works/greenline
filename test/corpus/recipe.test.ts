/** The recipe record (`src/corpus/recipe.ts`): its parse and its check against the fixture's snapshots, and the gists of this tree's recipes. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseModesRecipe } from "../../src/corpus/modes-recipe.ts";
import {
  checkRecipe,
  gistIssues,
  isAuthored,
  parseRecipe,
  type Account,
  type Recipe,
} from "../../src/corpus/recipe.ts";
import {
  fixtureRecipe,
  fixtureSnapshots,
  NOTES_IDS,
  SKILL_IDS,
  SOURCE,
  TINY_IDS,
  type FixturePassage,
  type FixtureRecipe,
} from "../fixtures/recipe.ts";

function parsed(recipe: FixtureRecipe) {
  return parseRecipe(JSON.stringify(recipe), "fixture.json");
}

/** The parse's issues as `path: message`, or ["parsed"]. */
function parseIssues(recipe: FixtureRecipe): readonly string[] {
  const result = parsed(recipe);
  return result._tag === "ok"
    ? ["parsed"]
    : result.error.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function checked(recipe: FixtureRecipe) {
  const result = parsed(recipe);
  if (result._tag === "err") throw result.error;
  return checkRecipe(result.value, fixtureSnapshots);
}

/** The check's refusals as [segment, message]. */
function refusals(recipe: FixtureRecipe): readonly (readonly [string | undefined, string])[] {
  const result = checked(recipe);
  return result._tag === "ok"
    ? []
    : result.error.issues.map((issue) => [issue.segment, issue.message] as const);
}

function skillPassages(recipe: FixtureRecipe): FixturePassage[] {
  const file = recipe.files[0];
  if (file === undefined) throw new Error("the fixture has a SKILL.md");
  return file.passages;
}

function taken(
  recipe: FixtureRecipe,
  index: number,
): Extract<FixturePassage, { passage: "taken" }> {
  const passage = skillPassages(recipe)[index];
  if (passage?.passage !== "taken") throw new Error(`passage ${index} is taken in the fixture`);
  return passage;
}

describe("parseRecipe", () => {
  it("parses the fixture recipe into its files, passages, copies and drops", () => {
    const result = parsed(fixtureRecipe());
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.files.map((file) => [file.path, file.passages.length])).toEqual([
      ["SKILL.md", 4],
      ["notes.md", 1],
    ]);
    expect(result.value.copies).toEqual([
      { path: "scripts/run.sh", source: SOURCE, file: "fixture/run.sh" },
    ]);
    expect(result.value.drops.map((drop) => drop.segment)).toEqual([SKILL_IDS[7]]);
  });

  it("refuses another schema, an unknown field and a kind outside the seven", () => {
    const recipe = fixtureRecipe();
    recipe.schema = "greenline.recipe/v2";
    const drop = recipe.drops[0];
    if (drop !== undefined) drop.kind = "vocabulary";
    expect(parseIssues({ ...recipe, ...{ extra: true } })).toEqual([
      'schema: Invalid input: expected "greenline.recipe/v1"',
      'drops[0].kind: Invalid option: expected one of "name"|"home"|"harness"|"pointer"|"scope"|"correction"|"method"',
      ': Unrecognized key: "extra"',
    ]);
  });

  it("refuses a method item without the operator's ruling and a ruling on any other item", () => {
    const recipe = fixtureRecipe();
    const drop = recipe.drops[0];
    if (drop !== undefined) drop.kind = "method";
    const edit = taken(recipe, 0).edits?.[0];
    if (edit !== undefined) edit.ruling = "a ruling on a name edit";
    expect(parseIssues(recipe)).toEqual([
      "files[0].passages[0].edits[0]: a method item carries the operator's ruling, and only a method item does",
      "drops[0]: a method item carries the operator's ruling, and only a method item does",
    ]);
  });

  it("refuses a front matter that does not open with the recipe's name and a description, and a duplicate field", () => {
    const recipe = fixtureRecipe();
    recipe.frontMatter = [
      { field: "description", value: "d" },
      { field: "name", value: "other" },
      { field: "name", value: "again" },
    ];
    expect(parseIssues(recipe)).toEqual([
      "frontMatter: the front matter opens with name, then description",
      "frontMatter[0]: the front matter's name is not 'fixture-skill'",
      "frontMatter[2]: duplicate field 'name'",
    ]);
  });

  it("refuses prose files that do not open with SKILL.md, a copy of Markdown and a path named twice", () => {
    const recipe = fixtureRecipe();
    recipe.files.reverse();
    recipe.copies.push({ path: "notes.md", source: SOURCE, file: "fixture/notes.md" });
    expect(parseIssues(recipe)).toEqual([
      "copies[1].path: a Markdown file is prose: give it passages, not a copy",
      "files[0].path: the first prose file is SKILL.md",
      "files: the skill directory names 'notes.md' twice",
    ]);
  });

  it("J-93 S2 takes a references part on a page of written mechanics, and refuses it on SKILL.md, over taken text or with a credit", () => {
    const recipe = fixtureRecipe();
    const pages = recipe.files;
    // `Object.assign` adds the part the fixture's type leaves out.
    const part = <T extends object>(file: T, value: string): T =>
      Object.assign(file, { part: value });
    pages.push(
      part(
        {
          path: "references/greenline.md",
          passages: [
            { passage: "written", text: "Where the work lands.", kind: "home", reason: "r" },
          ],
        },
        "references",
      ),
    );
    expect(parseIssues(recipe)).toEqual(["parsed"]);
    const result = parsed(recipe);
    expect(result._tag === "ok" ? result.value.files.map((file) => file.part) : []).toEqual([
      undefined,
      undefined,
      "references",
    ]);
    // SKILL.md is the front; notes.md takes upstream text; the page credits a source.
    for (const file of pages.slice(0, 2)) part(file, "references");
    const written = pages[2]?.passages[0];
    if (written?.passage === "written") written.credits = [SOURCE];
    expect(parseIssues(recipe)).toEqual([
      "files[0].part: SKILL.md is the skill's front",
      "files[0].passages[0]: a references page holds greenline's mechanics alone: it takes no upstream text",
      "files[0].passages[2]: a references page holds greenline's mechanics alone: it takes no upstream text",
      "files[0].passages[3]: a references page holds greenline's mechanics alone: it takes no upstream text",
      "files[1].passages[0]: a references page holds greenline's mechanics alone: it takes no upstream text",
      "files[2].passages[0].credits: a references page credits no source: upstream prose stands in the front",
    ]);
    // A part is the front or the references, and nothing else.
    const other = fixtureRecipe();
    for (const file of other.files.slice(1, 2)) part(file, "elsewhere");
    expect(parseIssues(other).filter((issue) => issue.startsWith("files[1].part"))).toHaveLength(1);
  });

  it("refuses a join before a file's first passage and a join that is not white space", () => {
    const recipe = fixtureRecipe();
    taken(recipe, 0).join = "\n";
    taken(recipe, 2).join = "\n- ";
    expect(parseIssues(recipe)).toEqual([
      "files[0].passages[2].join: a join is white space",
      "files[0].passages[0].join: a file's first passage has nothing to join to",
    ]);
    taken(recipe, 2).join = "\n";
    expect(parseIssues(recipe)).toEqual([
      "files[0].passages[0].join: a file's first passage has nothing to join to",
    ]);
  });

  it("accepts a source the recipe takes nothing of and credits in a written passage, a credit line", () => {
    const recipe = fixtureRecipe();
    recipe.files = [
      {
        path: "SKILL.md",
        passages: [
          {
            passage: "written",
            text: "# Tiny\n\nHand the work to the other skill.",
            kind: "home",
            reason: "greenline's words for a source it takes nothing of",
            credits: [SOURCE],
          },
        ],
      },
    ];
    recipe.copies = [];
    recipe.drops = TINY_IDS.map((segment) => ({
      source: SOURCE,
      file: "tiny/SKILL.md",
      segment,
      kind: "scope",
      reason: "rewritten in the written passage",
      replacedBy: { path: "SKILL.md", passage: 0 },
    }));
    expect(parseIssues(recipe)).toEqual(["parsed"]);
    expect(refusals(recipe)).toEqual([]);
  });

  it("refuses a source the recipe does not list, one it lists and never uses, and taken text in a stub", () => {
    const recipe = fixtureRecipe();
    recipe.sources = ["other-source"];
    recipe.credit = { source: SOURCE, file: "tiny/SKILL.md", ruling: "a stub" };
    const issues = parseIssues(recipe);
    expect(issues).toContain(
      "files[0].passages[0].source: 'fixture-upstream' is not among the recipe's sources",
    );
    expect(issues).toContain(
      "sources[0]: the recipe takes, copies and credits nothing of 'other-source'",
    );
    expect(issues).toContain("credit: a stub holds only written passages and its credit");
  });

  it("refuses a notStub ruling beside a stub's credit, on an unlisted source, or on one body twice", () => {
    const stub = fixtureRecipe();
    stub.credit = { source: SOURCE, file: "tiny/SKILL.md", ruling: "a stub" };
    stub.notStub = [{ source: SOURCE, file: "tiny/SKILL.md", ruling: "not a stub" }];
    expect(parseIssues(stub)).toContain(
      "notStub: a stub carries its credit, and a recipe ruled not a stub takes its source: never both",
    );
    const twice = fixtureRecipe();
    twice.notStub = [
      { source: SOURCE, file: "tiny/SKILL.md", ruling: "not a stub" },
      { source: SOURCE, file: "tiny/SKILL.md", ruling: "not a stub, again" },
      { source: "other-source", file: "other/SKILL.md", ruling: "not a stub" },
    ];
    expect(parseIssues(twice)).toEqual([
      `notStub[1]: '${SOURCE}/tiny/SKILL.md' is ruled twice`,
      "notStub[2].source: 'other-source' is not among the recipe's sources",
    ]);
  });

  /** The fixture with a gist on its edit, its written passage, its drop and an authored copy. */
  function gisted(gists: {
    readonly edit: string;
    readonly written: string;
    readonly drop: string;
    readonly copy: string;
  }): FixtureRecipe {
    const recipe = fixtureRecipe();
    const edit = taken(recipe, 0).edits?.[0];
    const written = skillPassages(recipe)[1];
    const drop = recipe.drops[0];
    if (edit === undefined || written === undefined || drop === undefined)
      throw new Error("the fixture holds an edit, a written passage and a drop");
    Object.assign(edit, { gist: gists.edit });
    Object.assign(written, { gist: gists.written });
    Object.assign(drop, { gist: gists.drop });
    recipe.copies.push({
      path: "scripts/authored.sh",
      sha256: "0".repeat(64),
      kind: "home",
      reason: "the fixture's own script",
      ...{ gist: gists.copy },
    });
    return recipe;
  }

  it("S1 accepts a gist on a written passage, an edit, a drop and an authored copy, and keeps it", () => {
    const result = parsed(
      gisted({
        edit: "Says restate, the house word for repeating a request",
        written: "Adds the fixture's own line",
        drop: "Leaves out a sentence that only announces the drop",
        copy: "Ships the fixture's own script",
      }),
    );
    if (result._tag === "err") throw result.error;
    const [takenPassage, written] = result.value.files[0]?.passages ?? [];
    expect(takenPassage?.passage === "taken" ? takenPassage.edits[0]?.gist : "no edit").toBe(
      "Says restate, the house word for repeating a request",
    );
    expect(written?.passage === "written" ? written.gist : "not written").toBe(
      "Adds the fixture's own line",
    );
    expect(result.value.drops[0]?.gist).toBe("Leaves out a sentence that only announces the drop");
    expect(result.value.copies[1]).toEqual({
      path: "scripts/authored.sh",
      sha256: "0".repeat(64),
      kind: "home",
      reason: "the fixture's own script",
      gist: "Ships the fixture's own script",
    });
  });

  it("S1 refuses a gist over twelve words, one ending in a full stop, one with a middle dot and one with an em dash", () => {
    expect(
      parseIssues(
        gisted({
          edit: "one two three four five six seven eight nine ten eleven twelve thirteen",
          written: "Adds the fixture's own line.",
          drop: "Leaves out the announcement · nothing else",
          copy: "Ships the script — its own",
        }),
      ),
    ).toEqual([
      "files[0].passages[0].edits[0].gist: a gist holds at most twelve words, and this one holds 13",
      "files[0].passages[1].gist: a gist ends without a full stop",
      "copies[1].gist: a gist carries no em dash",
      "drops[0].gist: a gist carries no middle dot",
    ]);
  });

  it("S1 accepts a gist of exactly twelve words and refuses an empty one", () => {
    expect(
      parseIssues(
        gisted({
          edit: "one two three four five six seven eight nine ten eleven twelve",
          written: "Adds the fixture's own line",
          drop: "Leaves out the announcement",
          copy: "",
        }),
      ),
    ).toEqual(["copies[1].gist: a gist is a clause of at least one word"]);
  });
});

describe("checkRecipe", () => {
  it("accepts the fixture and resolves each taken segment with its edited text", () => {
    const result = checked(fixtureRecipe());
    if (result._tag === "err") throw result.error;
    const first = result.value.files[0]?.passages[0];
    expect(
      first?.passage === "taken" &&
        first.resolved.map((segment) => [segment.edited, segment.text.slice(0, 40)]),
    ).toEqual([
      [false, "# Fixture method"],
      [true, "Read the request before you touch the co"],
      [false, "Then write the smallest test that fails "],
      [false, "Run it and watch it fail before you writ"],
    ]);
  });

  it("refuses an unknown segment id, naming it", () => {
    const recipe = fixtureRecipe();
    taken(recipe, 3).segments = ["0123456789ab"];
    expect(refusals(recipe)).toContainEqual([
      "0123456789ab",
      `'${SOURCE}/fixture/SKILL.md' has no segment 0123456789ab`,
    ]);
  });

  it("refuses a run out of upstream order, naming the segment that breaks it", () => {
    const recipe = fixtureRecipe();
    taken(recipe, 2).segments = [SKILL_IDS[4], SKILL_IDS[6], SKILL_IDS[5]];
    expect(refusals(recipe)).toEqual([
      [
        SKILL_IDS[6],
        `segment ${SKILL_IDS[6]} does not follow the segment before it in upstream order`,
      ],
      [
        SKILL_IDS[5],
        `segment ${SKILL_IDS[5]} does not follow the segment before it in upstream order`,
      ],
    ]);
  });

  it("refuses a segment taken twice, naming it", () => {
    const recipe = fixtureRecipe();
    skillPassages(recipe).push({
      passage: "taken",
      source: SOURCE,
      file: "fixture/SKILL.md",
      segments: [SKILL_IDS[8]],
    });
    expect(refusals(recipe)).toEqual([[SKILL_IDS[8], `segment ${SKILL_IDS[8]} is taken twice`]]);
  });

  it("refuses a segment neither taken nor dropped, naming it", () => {
    const recipe = fixtureRecipe();
    recipe.drops = [];
    expect(refusals(recipe)).toEqual([
      [
        SKILL_IDS[7],
        `segment ${SKILL_IDS[7]} of '${SOURCE}/fixture/SKILL.md' is neither taken nor dropped`,
      ],
    ]);
  });

  it("refuses a drop of a taken segment and a drop replaced by a passage that does not exist", () => {
    const recipe = fixtureRecipe();
    recipe.drops.push({
      source: SOURCE,
      file: "fixture/SKILL.md",
      segment: SKILL_IDS[8],
      kind: "scope",
      reason: "taken already",
      replacedBy: { path: "SKILL.md", passage: 9 },
    });
    expect(refusals(recipe)).toEqual([
      [SKILL_IDS[8], `segment ${SKILL_IDS[8]} is taken and dropped`],
      [
        SKILL_IDS[8],
        `segment ${SKILL_IDS[8]} is replaced by passage 9 of 'SKILL.md', which does not exist`,
      ],
    ]);
  });

  it("refuses a written passage that repeats eight consecutive words of a dropped segment it does not credit", () => {
    const recipe = fixtureRecipe();
    const notes = recipe.files[1];
    if (notes === undefined) throw new Error("the fixture has notes.md");
    notes.passages = [
      { passage: "taken", source: SOURCE, file: "fixture/notes.md", segments: [NOTES_IDS[0]] },
    ];
    for (const segment of [NOTES_IDS[1], NOTES_IDS[2]])
      recipe.drops.push({
        source: SOURCE,
        file: "fixture/notes.md",
        segment,
        kind: "scope",
        reason: "shortened",
      });
    // Seven words of the dropped sentence repeat nothing the rule counts; eight do.
    notes.passages.push({
      passage: "written",
      text: "A note the skill carries beside its own words.",
      kind: "home",
      reason: "a rewrite",
      join: "\n\n",
    });
    expect(refusals(recipe)).toEqual([]);
    notes.passages.push({
      passage: "written",
      text: "Here: a note the skill carries beside its method, again.",
      kind: "home",
      reason: "a copy in disguise",
    });
    expect(refusals(recipe)).toEqual([
      [
        NOTES_IDS[1],
        `a written passage of 'notes.md' repeats 8 consecutive words of dropped segment ${NOTES_IDS[1]} and does not credit '${SOURCE}'`,
      ],
    ]);
    const disguised = notes.passages[2];
    if (disguised?.passage === "written") disguised.credits = [SOURCE];
    expect(refusals(recipe)).toEqual([]);
  });

  it("refuses an edit whose find text does not occur exactly once, and edits that change more than half a segment", () => {
    const recipe = fixtureRecipe();
    const passage = taken(recipe, 0);
    passage.edits = [
      {
        segment: SKILL_IDS[2],
        find: "the",
        replace: "a",
        kind: "name",
        reason: "twice in the sentence",
      },
      {
        segment: SKILL_IDS[3],
        find: "Run it and watch it fail before you write any code",
        replace: "Watch",
        kind: "correction",
        reason: "too much",
      },
    ];
    expect(refusals(recipe)).toEqual([
      [SKILL_IDS[2], `the find text 'the' does not occur exactly once in segment ${SKILL_IDS[2]}`],
      [
        SKILL_IDS[3],
        `the edits change 50 of the 58 characters of segment ${SKILL_IDS[3]}, more than half: write it as a passage that credits its source`,
      ],
    ]);
  });

  it("refuses an edit of a segment its passage does not take", () => {
    const recipe = fixtureRecipe();
    taken(recipe, 2).edits = [
      {
        segment: SKILL_IDS[0],
        find: "Fixture",
        replace: "Example",
        kind: "name",
        reason: "elsewhere",
      },
    ];
    expect(refusals(recipe)).toEqual([
      [SKILL_IDS[0], `an edit names segment ${SKILL_IDS[0]}, which its passage does not take`],
    ]);
  });

  it("refuses a source the manifest does not pin and a file its snapshot lacks", () => {
    const recipe = fixtureRecipe();
    taken(recipe, 3).file = "fixture/missing.md";
    expect(refusals(recipe)).toEqual([
      [undefined, `the snapshot of '${SOURCE}' has no file 'fixture/missing.md'`],
    ]);
    const unpinned = fixtureRecipe();
    unpinned.sources = ["unpinned"];
    for (const file of unpinned.files)
      for (const passage of file.passages)
        if (passage.passage === "taken") passage.source = "unpinned";
    for (const item of [...unpinned.copies, ...unpinned.drops]) item.source = "unpinned";
    expect(refusals(unpinned)).toEqual([[undefined, "the manifest pins no source 'unpinned'"]]);
  });
});

describe("S1 the gists of this tree's recipes", () => {
  const recipes = join(import.meta.dirname, "..", "..", "corpus", "recipes");
  /** The step skills whose every account carries a gist (J-59 S1). */
  const STEPS = ["frame", "plan", "anticipate", "build", "review", "verify", "close"];
  /** The starts whose every account carries a gist (J-59 S2). */
  const STARTS = [
    "router",
    "what-to-build",
    "wayfinder",
    "diagnose",
    "architecture-survey",
    "sweep-tests",
    "groundwork",
    "product-description",
    "idea-refine",
    "constraint-driven-development",
    "correct",
    "improve-instructions",
  ];
  /** The habits whose every account carries a gist (J-59 S3). */
  const HABITS = [
    "tdd",
    "ponytail",
    "deep-modules",
    "boundaries",
    "domain-and-types",
    "concurrency",
    "secrets",
    "prose",
    "show-me",
    "progress-check",
    "use-garden",
    "diagram-design",
    "architecture-map",
    "build-the-lever",
    "guard-the-context-window",
    "pr-writing",
    "to-questionnaire",
    "benchmark-checklist",
  ];
  /** Every recipe of the roster, each carrying its gists. */
  const GISTED = [...STEPS, ...STARTS, ...HABITS];
  /** The voice page's never-words and the lexical tells the gate refuses on the live pages. */
  const NEVER =
    /\b(powerful|seamless|seamlessly|effortless|effortlessly|magical|blazing|supercharges?|revolutioni[sz]es?|game-changing|delightful|simply|easy|easily|best-in-class|cutting-edge|leverag(?:e|es|ed|ing)|delve|tapestry|testament|pivotal|crucial|garner|vibrant|intricate|showcase|fostering|interplay|enhances?|serves as|stands as|boasts|in order to|utili[sz]e|facilitates?|numerous)\b/i;

  function recipe(name: string): Recipe {
    const read = parseRecipe(readFileSync(join(recipes, `${name}.json`), "utf8"), name);
    if (read._tag === "err") throw read.error;
    return read.value;
  }

  function accounts(of: Recipe): readonly Account[] {
    return [
      ...of.files.flatMap((file) =>
        file.passages.flatMap((item): readonly Account[] =>
          item.passage === "written" ? [item] : item.edits,
        ),
      ),
      ...of.copies.filter(isAuthored),
      ...of.drops,
    ];
  }

  /** What {@link gisted} read: the accounts and the distinct reasons among them. */
  interface GistTally {
    readonly count: number;
    readonly reasons: number;
  }

  /**
   * Expect every account of the named recipes to carry a gist within the
   * rule, without its kind word or a never-word, the same reason always the
   * same gist.
   * @param names the recipes read
   * @returns the accounts read and the distinct reasons among them
   */
  function gisted(names: readonly string[]): GistTally {
    const byReason = new Map<string, Set<string>>();
    let count = 0;
    for (const name of names)
      for (const account of accounts(recipe(name))) {
        count += 1;
        const gist = account.gist ?? "";
        expect([name, account.reason, gistIssues(gist)]).toEqual([name, account.reason, []]);
        expect([name, gist, NEVER.test(gist)]).toEqual([name, gist, false]);
        expect([name, gist, new RegExp(`\\b${account.kind}\\b`, "i").test(gist)]).toEqual([
          name,
          gist,
          false,
        ]);
        const gists = byReason.get(account.reason) ?? new Set<string>();
        gists.add(gist);
        byReason.set(account.reason, gists);
      }
    for (const [reason, gists] of byReason) expect([reason, gists.size]).toEqual([reason, 1]);
    return { count, reasons: byReason.size };
  }

  it("S1 gives every account of the seven step skills a gist within the rule, without its kind word or a never-word, the same reason always the same gist", () => {
    // J-93 S1 added 29 accounts, the seven steps' references pages, each with its own reason;
    // J-93 S2 folded the depth bullets and the moved mechanics into those pages.
    // J-98 S1 adds frame interview page's passage on the reply that ends the turn.
    expect(gisted(STEPS)).toEqual({ count: 2269, reasons: 512 });
  });

  it("S2 gives every account of the twelve starts a gist within the rule, without its kind word or a never-word, the same reason always the same gist", () => {
    // J-93 S2 gave the starts that carry a mechanic a references page and a pointer to it.
    // J-98 S1 adds groundwork's section on the setup change's commit.
    expect(gisted(STARTS)).toEqual({ count: 1181, reasons: 283 });
  });

  it("S3 gives every account of the eighteen habits a gist within the rule, without its kind word or a never-word, the same reason always the same gist", () => {
    expect(gisted(HABITS)).toEqual({ count: 1546, reasons: 346 });
  });

  it("S3 gives the same reason the same gist across the whole roster, and the roster is every recipe but the modes recipe", () => {
    expect(gisted(GISTED)).toEqual({ count: 4996, reasons: 1139 });
    const roster = readdirSync(recipes)
      .filter((file) => file.endsWith(".json") && file !== "modes.json")
      .map((file) => file.slice(0, -".json".length));
    expect([...roster].sort()).toEqual([...GISTED].sort());
  });

  it("S3 leaves the modes recipe, the one recipe outside the roster, without a gist", () => {
    const modes = parseModesRecipe(readFileSync(join(recipes, "modes.json"), "utf8"), "modes.json");
    if (modes._tag === "err") throw modes.error;
    expect(modes.value.parts.filter((part) => part.gist !== undefined)).toEqual([]);
  });
});
