/** The provenance of a skill (`src/corpus/provenance.ts`, `provenanceData` in `src/corpus/instrument.ts`): the shipped text, each passage's origin, each edit's offsets and each source's coverage, on the fixture and on this tree. */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeEntry } from "../../src/corpus/chain.ts";
import { provenanceData } from "../../src/corpus/instrument.ts";
import { measureRecipe } from "../../src/corpus/measure.ts";
import { skillProvenance } from "../../src/corpus/provenance.ts";
import { checkRecipe, parseRecipe } from "../../src/corpus/recipe.ts";
import { chainTexts, fixtureEntries } from "../fixtures/chain.ts";
import { writeFixtureCorpus, writeTree } from "../fixtures/corpus-disk.ts";
import {
  COMMIT,
  fixtureRecipe,
  fixtureSnapshots,
  NOTES_IDS,
  RENDERED_SKILL,
  REPOSITORY,
  SKILL_IDS,
  SOURCE,
  UPSTREAM_NOTES,
  WRITTEN,
  type FixtureRecipe,
} from "../fixtures/recipe.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const PINS = new Map([
  [SOURCE, { name: SOURCE, repo: REPOSITORY, commit: COMMIT, license: "MIT" }],
]);

/** A change entry naming the fixture skill, as `skillProvenance` reads it. */
const ENTRY = {
  kind: "change",
  id: "2026-10-05-fixture-skill-recipe",
  previous: { id: "2026-10-04-fixture-upstream-read", sha256: "0".repeat(64) },
  subject: "skill:fixture-skill",
  recipe: "1".repeat(64),
  result: "2".repeat(64),
  pages: [{ path: "SKILL.md" }],
  gist: "The fixture skill moves to its recipe",
  reason: "The fixture skill moves to its recipe.",
  authorisedBy: null,
  ruling: [],
  measure: { stub: false, sources: [], growth: 0 },
} satisfies ChangeEntry;

/** The provenance of a fixture recipe. */
function provenanceOf(recipe: FixtureRecipe) {
  const parsed = parseRecipe(JSON.stringify(recipe), "fixture.json");
  if (parsed._tag === "err") throw parsed.error;
  const checked = checkRecipe(parsed.value, fixtureSnapshots);
  if (checked._tag === "err") throw checked.error;
  const measured = measureRecipe(checked.value);
  if (measured._tag === "err") throw measured.error;
  return skillProvenance({
    checked: checked.value,
    measures: measured.value.sources,
    entry: ENTRY,
    pins: PINS,
  });
}

describe("a skill's provenance", () => {
  it("ships the rendered text, front matter included, and places every passage in it", () => {
    const skill = provenanceOf(fixtureRecipe());
    const [main, notes] = skill.files;
    expect(main?.text).toBe(RENDERED_SKILL);
    expect(notes?.text).toBe(UPSTREAM_NOTES);
    const passages = main?.passages ?? [];
    expect(passages.map((passage) => passage.origin)).toEqual([
      "taken",
      "written",
      "taken",
      "taken",
    ]);
    const written = passages[1];
    expect(written).toEqual({
      origin: "written",
      start: RENDERED_SKILL.indexOf(WRITTEN),
      end: RENDERED_SKILL.indexOf(WRITTEN) + WRITTEN.length,
      kind: "home",
      reason: "the fixture's own line",
      credits: [],
    });
    const first = passages[0];
    expect(first?.origin === "taken" && RENDERED_SKILL.slice(first.start, first.end)).toBe(
      RENDERED_SKILL.slice(
        RENDERED_SKILL.indexOf("# Fixture method"),
        RENDERED_SKILL.indexOf(" Greenline adds"),
      ),
    );
    expect(notes?.passages).toEqual([
      {
        origin: "taken",
        start: 0,
        end: UPSTREAM_NOTES.length - 1,
        source: SOURCE,
        file: "fixture/notes.md",
        segments: [...NOTES_IDS],
        edits: [],
      },
    ]);
  });

  it("places each edit at its replacement in the shipped text", () => {
    const skill = provenanceOf(fixtureRecipe());
    const first = skill.files[0]?.passages[0];
    const at = RENDERED_SKILL.indexOf("restate what you heard");
    expect(first?.origin === "taken" ? first.edits : []).toEqual([
      {
        segment: SKILL_IDS[1],
        start: at,
        end: at + "restate what you heard".length,
        find: "say back what you heard",
        replace: "restate what you heard",
        kind: "name",
        reason: "the house word for repeating a request",
      },
    ]);
  });

  it("moves an earlier edit by every later edit before it, and widens it over a later edit inside it", () => {
    const recipe = fixtureRecipe();
    const taken = recipe.files[0]?.passages[0];
    if (taken?.passage !== "taken") throw new Error("the fixture's first passage is taken");
    const account = { kind: "name", reason: "a reason" };
    taken.edits = [
      { segment: SKILL_IDS[1], find: "one sentence", replace: "a single sentence", ...account },
      { segment: SKILL_IDS[1], find: "Read the request", replace: "Read it", ...account },
      { segment: SKILL_IDS[1], find: "a single", replace: "one short", ...account },
    ];
    const skill = provenanceOf(recipe);
    const main = skill.files[0];
    const first = main?.passages[0];
    const spans = first?.origin === "taken" ? first.edits : [];
    expect(spans.map((edit) => main?.text.slice(edit.start, edit.end))).toEqual([
      "one short sentence",
      "Read it",
      "one short",
    ]);
  });

  it("covers every segment of each source file, taken or dropped with its account", () => {
    const skill = provenanceOf(fixtureRecipe());
    const file = skill.coverage.find((entry) => entry.file === "fixture/SKILL.md");
    expect(file?.segments.map((segment) => [segment.id, segment.account])).toEqual(
      SKILL_IDS.map((id) => [id, id === SKILL_IDS[7] ? "dropped" : "taken"]),
    );
    expect(file?.segments[1]).toMatchObject({ account: "taken", edited: true });
    expect(file?.segments[7]).toEqual({
      id: SKILL_IDS[7],
      text: "This sentence is one the recipe drops.",
      account: "dropped",
      kind: "scope",
      reason: "it only announces the drop",
      replacedBy: { path: "SKILL.md", passage: 1 },
    });
  });

  it("S1 carries each written passage's, edit's and drop's gist with its account, and none where the recipe writes none", () => {
    const recipe = fixtureRecipe();
    const [takenPassage, written] = recipe.files[0]?.passages ?? [];
    const edit = takenPassage?.passage === "taken" ? takenPassage.edits?.[0] : undefined;
    const drop = recipe.drops[0];
    if (edit === undefined || written === undefined || drop === undefined)
      throw new Error("the fixture holds an edit, a written passage and a drop");
    Object.assign(edit, { gist: "Says restate, the house word" });
    Object.assign(written, { gist: "Adds the fixture's own line" });
    Object.assign(drop, { gist: "Leaves out a sentence that only announces the drop" });
    const skill = provenanceOf(recipe);
    const [first, second] = skill.files[0]?.passages ?? [];
    expect(first?.origin === "taken" ? first.edits[0]?.gist : "not taken").toBe(
      "Says restate, the house word",
    );
    expect(second).toMatchObject({ origin: "written", gist: "Adds the fixture's own line" });
    const segments = skill.coverage.find((entry) => entry.file === "fixture/SKILL.md")?.segments;
    expect(segments?.[7]).toMatchObject({
      account: "dropped",
      gist: "Leaves out a sentence that only announces the drop",
    });

    const plain = provenanceOf(fixtureRecipe());
    const accounts = [
      ...plain.files.flatMap((file) =>
        file.passages.flatMap((passage): readonly object[] =>
          passage.origin === "written" ? [passage] : passage.edits,
        ),
      ),
      ...plain.coverage.flatMap((file) => file.segments),
    ];
    expect(accounts.length).toBeGreaterThan(0);
    for (const account of accounts)
      expect(JSON.parse(JSON.stringify(account))).not.toHaveProperty("gist");
  });

  it("names its latest change entry, its source's pin and measure, and its copies", () => {
    const skill = provenanceOf(fixtureRecipe());
    expect(skill.entry).toEqual({
      id: ENTRY.id,
      gist: ENTRY.gist,
      reason: ENTRY.reason,
      pages: ENTRY.pages,
      authorisedBy: ENTRY.authorisedBy,
      ruling: ENTRY.ruling,
    });
    // J-66: the pages, then the authorising ruling before the cumulative list.
    expect(Object.keys(skill.entry)).toEqual([
      "id",
      "gist",
      "reason",
      "pages",
      "authorisedBy",
      "ruling",
    ]);
    expect(skill.stub).toBe(false);
    expect(skill.sources).toEqual([
      {
        name: SOURCE,
        repository: REPOSITORY,
        commit: COMMIT,
        licence: "MIT",
        measure: {
          segments: 12,
          taken: 11,
          exact: 10,
          retention: 10 / 11,
          coverage: 11 / 12,
          meetsMinimum: true,
          creditLine: false,
        },
      },
    ]);
    expect(skill.copies).toEqual([
      { path: "scripts/run.sh", origin: "copied", source: SOURCE, file: "fixture/run.sh" },
    ]);
  });
});

describe("provenanceData", () => {
  it("reads the fixture corpus on disk: the index's tip, entries and rows, and one record per recipe", () => {
    const corpus = mkdtempSync(join(tmpdir(), "greenline-provenance-"));
    made.push(corpus);
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
    const data = provenanceData(corpus);
    if (data._tag === "err") throw data.error;
    expect(data.value.index.tip?.id).toBe("2026-10-05-fixture-skill-recipe");
    expect(data.value.index.entries.map((entry) => entry.kind)).toEqual(["source", "change"]);
    expect(data.value.index.skills).toEqual([
      {
        name: "fixture-skill",
        entry: "2026-10-05-fixture-skill-recipe",
        stub: false,
        sources: [{ name: SOURCE, retention: 10 / 11, coverage: 11 / 12, creditLine: false }],
      },
    ]);
    expect(data.value.skills.map((skill) => skill.files[0]?.text)).toEqual([RENDERED_SKILL]);
  });

  it("S8b: carries each entry's gist and ruling list in the index and in its skill's record, as its file states them", () => {
    const corpus = mkdtempSync(join(tmpdir(), "greenline-provenance-"));
    made.push(corpus);
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
    const [read, change] = fixtureEntries();
    if (read === undefined || change === undefined) throw new Error("the fixture holds entries");
    const ruling = [{ date: "2026-10-11", words: "R1: the first ruling; with its clause" }];
    const texts = chainTexts([
      read,
      { ...change, gist: "Moved to its recipe", authorisedBy: { ...ruling[0]! }, ruling },
    ]);
    writeTree(corpus, new Map(texts.map(({ name, text }) => [`ledger/entries/${name}`, text])));
    const data = provenanceData(corpus);
    if (data._tag === "err") throw data.error;
    expect(data.value.index.entries[0]).toMatchObject({ gist: read["gist"], ruling: [] });
    expect(data.value.index.entries[1]).toMatchObject({ gist: "Moved to its recipe", ruling });
    expect(data.value.skills[0]?.entry).toEqual({
      id: change.id,
      gist: "Moved to its recipe",
      reason: change["reason"],
      pages: change["pages"],
      authorisedBy: ruling[0],
      ruling,
    });
  });

  it("refuses a recipe no change entry records", () => {
    const corpus = mkdtempSync(join(tmpdir(), "greenline-provenance-"));
    made.push(corpus);
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
    const data = provenanceData(corpus);
    expect(data._tag === "err" ? data.error.issues : []).toEqual([
      { message: "fixture-skill: no change entry records the recipe" },
    ]);
  });

  it("refuses a recipe edited after its latest change entry, so no provenance names an earlier recipe", () => {
    const corpus = mkdtempSync(join(tmpdir(), "greenline-provenance-"));
    made.push(corpus);
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
    const recipe = fixtureRecipe();
    const drop = recipe.drops[0];
    if (drop === undefined) throw new Error("the fixture recipe holds a drop");
    drop.reason = "a reason reworded";
    writeFileSync(
      join(corpus, "recipes/fixture-skill.json"),
      `${JSON.stringify(recipe, null, 2)}\n`,
    );
    const data = provenanceData(corpus);
    expect(data._tag === "err" ? data.error.issues.map((issue) => issue.message) : []).toEqual([
      expect.stringMatching(
        /^fixture-skill: it records the recipe [0-9a-f]{64}; the recipe on disk is [0-9a-f]{64}$/,
      ),
    ]);
  });

  it("ships this tree's committed bytes for every roster skill, each edit at its replacement", () => {
    const data = provenanceData(join(repository, "corpus"));
    if (data._tag === "err") throw data.error;
    expect(data.value.skills.map((skill) => skill.name).sort()).toEqual(
      readdirSync(join(repository, "corpus/recipes"))
        .map((name) => name.replace(/\.json$/, ""))
        // The modes recipe is the definition's, not a skill's (S16b).
        .filter((name) => name !== "modes")
        .sort(),
    );
    const wrong = data.value.skills.flatMap((skill) =>
      skill.files.flatMap((file) => [
        ...(readFileSync(join(repository, "corpus/skills", skill.name, file.path), "utf8") ===
        file.text
          ? []
          : [`${skill.name}/${file.path}`]),
        ...file.passages.flatMap((passage) =>
          passage.origin === "taken"
            ? passage.edits
                .filter((edit) => file.text.slice(edit.start, edit.end) !== edit.replace)
                .map((edit) => `${skill.name}/${file.path} ${edit.segment}`)
            : [],
        ),
      ]),
    );
    expect(wrong).toEqual([]);
  });
});
