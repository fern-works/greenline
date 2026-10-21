/** The measure and the stub trigger (`src/corpus/measure.ts`) over the fixture recipe. */
import { describe, expect, it } from "vitest";
import { measureRecipe } from "../../src/corpus/measure.ts";
import { checkRecipe, parseRecipe } from "../../src/corpus/recipe.ts";
import {
  CREDITED,
  fixtureRecipe,
  fixtureSnapshots,
  SKILL_IDS,
  SOURCE,
  TINY_IDS,
  type FixtureRecipe,
} from "../fixtures/recipe.ts";

function measured(recipe: FixtureRecipe) {
  const parsed = parseRecipe(JSON.stringify(recipe), "fixture.json");
  if (parsed._tag === "err") throw parsed.error;
  const checked = checkRecipe(parsed.value, fixtureSnapshots);
  if (checked._tag === "err") throw checked.error;
  return measureRecipe(checked.value);
}

describe("measureRecipe", () => {
  it("measures the fixture: 12 segments, 11 taken, 10 exact, and 7 written words", () => {
    // SKILL.md has 9 segments and notes.md 3; one is dropped and one of the
    // 11 taken is edited; the written passage has 7 words.
    expect(measured(fixtureRecipe())).toEqual({
      _tag: "ok",
      value: {
        skill: "fixture-skill",
        stub: false,
        sources: [
          {
            source: SOURCE,
            segments: 12,
            taken: 11,
            exact: 10,
            retention: 10 / 11,
            coverage: 11 / 12,
            meetsMinimum: true,
            creditLine: false,
          },
        ],
        growth: 7,
      },
    });
  });

  it("labels a source the recipe takes no text of exactly a credit line, and a taken one not (C14)", () => {
    const recipe = fixtureRecipe();
    recipe.sources.push(CREDITED);
    const written = recipe.files[0]?.passages[1];
    if (written?.passage === "written") written.credits = [CREDITED];
    const result = measured(recipe);
    expect(result._tag === "ok" && result.value.sources).toEqual([
      expect.objectContaining({ source: SOURCE, exact: 10, creditLine: false }),
      {
        source: CREDITED,
        segments: 0,
        taken: 0,
        exact: 0,
        retention: null,
        coverage: null,
        meetsMinimum: null,
        creditLine: true,
      },
    ]);
  });

  it("counts a moved passage's segments as out of upstream order, so they are not exact", () => {
    const recipe = fixtureRecipe();
    const passages = recipe.files[0]?.passages ?? [];
    const [last] = passages.splice(3, 1);
    if (last !== undefined) passages.splice(2, 0, last);
    // Unedited SKILL.md places in recipe order: 0 2 3 8 4 5 6; the longest
    // rising run, 0 2 3 4 5 6, holds six, and notes.md adds three.
    const result = measured(recipe);
    expect(result._tag === "ok" && result.value.sources[0]).toMatchObject({
      taken: 11,
      exact: 9,
      retention: 9 / 11,
      meetsMinimum: false,
    });
  });

  it("refuses a recipe that takes from an upstream skill body under 100 words and carries no credit", () => {
    const recipe = fixtureRecipe();
    recipe.files[0]?.passages.push({
      passage: "taken",
      source: SOURCE,
      file: "tiny/SKILL.md",
      segments: [...TINY_IDS],
    });
    const result = measured(recipe);
    expect(result._tag === "err" && result.error.issues).toEqual([
      {
        message: `'${SOURCE}/tiny/SKILL.md' has 7 words of body, under the stub trigger of 100: does it state a method of its own, with steps, an order or criteria, or does it only delegate to other skills or tools? The operator rules it: a stub's recipe carries the credit, and a recipe whose source the operator rules is not a stub names the body in notStub with that ruling.`,
      },
    ]);
  });

  it("measures a taken body under the trigger that the recipe names in notStub with the operator's ruling, like any taken source (research, S11e)", () => {
    const recipe = fixtureRecipe();
    recipe.files[0]?.passages.push({
      passage: "taken",
      source: SOURCE,
      file: "tiny/SKILL.md",
      segments: [...TINY_IDS],
    });
    recipe.notStub = [
      { source: SOURCE, file: "tiny/SKILL.md", ruling: "not a stub, the fixture's ruling" },
    ];
    expect(measured(recipe)).toEqual({
      _tag: "ok",
      value: {
        skill: "fixture-skill",
        stub: false,
        sources: [
          {
            source: SOURCE,
            segments: 14,
            taken: 13,
            exact: 12,
            retention: 12 / 13,
            coverage: 13 / 14,
            meetsMinimum: true,
            creditLine: false,
          },
        ],
        growth: 7,
      },
    });
  });

  it("refuses a notStub ruling on a body the trigger does not read: over 100 words, or not taken", () => {
    const recipe = fixtureRecipe();
    recipe.notStub = [
      { source: SOURCE, file: "fixture/SKILL.md", ruling: "not a stub" },
      { source: SOURCE, file: "tiny/SKILL.md", ruling: "not a stub" },
    ];
    const result = measured(recipe);
    expect(result._tag === "err" && result.error.issues).toEqual(
      ["fixture/SKILL.md", "tiny/SKILL.md"].map((file) => ({
        message: `'${SOURCE}/${file}' is ruled not a stub, but the recipe takes no skill body of it under the stub trigger of 100 words: the ruling answers only a body the trigger reads`,
      })),
    );
  });

  it("measures a stub as none: no source, its written words as growth", () => {
    const recipe: FixtureRecipe = {
      ...fixtureRecipe(),
      files: [
        {
          path: "SKILL.md",
          passages: [
            {
              passage: "written",
              text: "# Tiny\n\nHand the work to the other skill, and say which.",
              kind: "home",
              reason: "the stub in greenline's words",
              credits: [SOURCE],
            },
          ],
        },
      ],
      copies: [],
      drops: [],
      credit: { source: SOURCE, file: "tiny/SKILL.md", ruling: "a stub, the fixture's ruling" },
    };
    expect(measured(recipe)).toEqual({
      _tag: "ok",
      value: { skill: "fixture-skill", stub: true, sources: [], growth: 11 },
    });
  });

  it("counts each edited segment as taken and not exact", () => {
    const recipe = fixtureRecipe();
    const first = recipe.files[0]?.passages[0];
    // Two segments edited in place of the fixture's one: 11 taken, 9 exact.
    if (first?.passage === "taken")
      first.edits = [SKILL_IDS[0], SKILL_IDS[2]].map((segment) => ({
        segment,
        find: segment === SKILL_IDS[0] ? "Fixture" : "smallest",
        replace: segment === SKILL_IDS[0] ? "Example" : "least",
        kind: "name",
        reason: "house words",
      }));
    const result = measured(recipe);
    expect(result._tag === "ok" && result.value.sources[0]).toMatchObject({
      taken: 11,
      exact: 9,
      meetsMinimum: false,
    });
  });
});
