/** The recipe's keepers (J-153 S3; `workshop/components/recipes.md`, "The keepers"): their parse and refusals, the tally the budget reports and the ledger's keepers table. */
import { describe, expect, it } from "vitest";
import { tallyKeepers } from "../../src/corpus/keepers.ts";
import { parseRecipe } from "../../src/corpus/recipe.ts";
import {
  FIXTURE_KEEPER,
  fixtureRecipe,
  type FixtureKeeper,
  type FixtureRecipe,
} from "../fixtures/recipe.ts";

/** The parse's issues as `path: message`, or ["parsed"]. */
function parseIssues(recipe: FixtureRecipe | Omit<FixtureRecipe, "keepers">): readonly string[] {
  const result = parseRecipe(JSON.stringify(recipe), "fixture.json");
  return result._tag === "ok"
    ? ["parsed"]
    : result.error.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

/** The fixture recipe with the keepers given in place of its own. */
function withKeepers(keepers: FixtureKeeper[], promises?: string): FixtureRecipe {
  const recipe = fixtureRecipe();
  recipe.keepers = keepers;
  if (promises !== undefined) recipe.promises = promises;
  return recipe;
}

const GAP = {
  promise: "The agent says what it checked.",
  page: "SKILL.md",
  kind: "gap",
  warrants: "prose",
  reason: "it reaches the owner, but no run observed it fail",
};

describe("the recipe's keepers", () => {
  it("parses the fixture's keeper, a gap that stays prose, and a skill that promises nothing", () => {
    expect(parseIssues(fixtureRecipe())).toEqual(["parsed"]);
    expect(parseIssues(withKeepers([{ ...FIXTURE_KEEPER }, GAP]))).toEqual(["parsed"]);
    expect(parseIssues(withKeepers([], "none"))).toEqual(["parsed"]);
  });

  it("refuses a recipe with no keepers outright, naming the rule, and an empty list without promises: none", () => {
    const { keepers: _dropped, ...bare } = fixtureRecipe();
    const message =
      'the recipe lists no keepers: each promise its pages state names its keeper or its gap, or the recipe states promises: "none" beside an empty list (workshop/components/recipes.md, "The keepers")';
    expect(parseIssues(bare)).toEqual([`keepers: ${message}`]);
    expect(parseIssues(withKeepers([]))).toEqual([`keepers: ${message}`]);
  });

  it("refuses promises: none beside a promise, and any other word", () => {
    expect(parseIssues(withKeepers([{ ...FIXTURE_KEEPER }], "none"))).toEqual([
      'promises: promises: "none" stands only beside an empty keepers list',
    ]);
    expect(parseIssues(withKeepers([], "some"))).toEqual([
      'promises: Invalid input: expected "none"',
    ]);
  });

  it("refuses a promise with no keeper, a kind outside the five and the cost never", () => {
    const { kind: _kind, ...unkept } = FIXTURE_KEEPER;
    expect(parseIssues(withKeepers([unkept]))).toEqual([
      "keepers[0].kind: a promise with no keeper: name its fact, hold, record or oracle, or its gap",
    ]);
    expect(parseIssues(withKeepers([{ ...FIXTURE_KEEPER, kind: "habit" }]))).toEqual([
      "keepers[0].kind: a keeper's kind is one of fact, hold, record, oracle, gap",
    ]);
    expect(parseIssues(withKeepers([{ ...FIXTURE_KEEPER, cost: "never" }]))).toEqual([
      "keepers[0].cost: the cost class never, a model call or a second agent, is refused by definition",
    ]);
  });

  it("refuses a keeper with no where or no cost, and a dear keeper with no irreversible act", () => {
    const { where: _where, cost: _cost, ...bare } = FIXTURE_KEEPER;
    expect(parseIssues(withKeepers([{ ...bare, kind: "hold" }]))).toEqual([
      "keepers[0].where: a hold keeper names where it stands: the fact's line, the hook's rule, the record's field or the scenario's title",
      "keepers[0].cost: a keeper states its cost: free, cheap or dear",
    ]);
    expect(
      parseIssues(
        withKeepers([{ ...FIXTURE_KEEPER, kind: "fact", where: "status: done", cost: "dear" }]),
      ),
    ).toEqual([
      "keepers[0].irreversible: a dear keeper names the irreversible act its promise guards",
    ]);
    expect(
      parseIssues(withKeepers([{ ...FIXTURE_KEEPER, irreversible: "the push to the default" }])),
    ).toEqual(["keepers[0].irreversible: only a dear keeper names an irreversible act"]);
  });

  it("refuses a gap with a where, no warrants or no reason, and a mechanism gap with no need or no cost", () => {
    expect(parseIssues(withKeepers([{ ...GAP, where: "a hook" }]))).toEqual([
      "keepers[0].where: a gap names no where: no mechanism holds it",
    ]);
    const { warrants: _warrants, reason: _reason, ...bare } = GAP;
    expect(parseIssues(withKeepers([bare]))).toEqual([
      "keepers[0].warrants: a gap states what the keeper test leads to: mechanism or prose",
      "keepers[0].reason: a gap states the keeper test's reading",
    ]);
    expect(parseIssues(withKeepers([{ ...GAP, warrants: "mechanism" }]))).toEqual([
      "keepers[0].need: a gap that warrants a mechanism names the keeper it needs",
      "keepers[0].cost: a gap that warrants a mechanism states the cost of the keeper it needs",
    ]);
  });

  it("refuses a gap's fields on a keeper, owed with no oracle, and an oracle keeper naming its scenario outside where", () => {
    expect(parseIssues(withKeepers([{ ...FIXTURE_KEEPER, warrants: "prose" }]))).toEqual([
      "keepers[0].kind: only a gap carries warrants, need and reason",
    ]);
    expect(parseIssues(withKeepers([{ ...GAP, owed: true }]))).toEqual([
      "keepers[0].owed: owed marks an oracle, and the entry names none",
    ]);
    expect(parseIssues(withKeepers([{ ...FIXTURE_KEEPER, oracle: "Another scenario" }]))).toEqual([
      "keepers[0].oracle: an oracle keeper names its conduct row or scenario in where",
    ]);
  });
});

describe("the keepers' tally", () => {
  it("counts the promises by kind and by cost, the gaps by what they warrant, and each hook rule once", () => {
    const hold = (where: string) => ({
      promise: `held at ${where}`,
      page: "SKILL.md",
      kind: "hold" as const,
      where,
      cost: "cheap" as const,
    });
    const tally = tallyKeepers([
      {
        skill: "close",
        keepers: [hold("close-offer"), hold("close-offer"), hold("atlas-refresh")],
      },
      {
        skill: "frame",
        keepers: [
          FIXTURE_KEEPER,
          { ...GAP, kind: "gap", warrants: "prose" },
          {
            ...GAP,
            kind: "gap",
            warrants: "mechanism",
            need: "a fact",
            cost: "free",
            oracle: "A scenario",
            owed: true,
          },
        ],
      },
      { skill: "prose", keepers: [] },
    ]);
    expect(tally).toEqual({
      promises: 6,
      none: ["prose"],
      kept: 4,
      byKind: { fact: 0, hold: 3, record: 0, oracle: 1, gap: 2 },
      byCost: { free: 1, cheap: 3, dear: 0 },
      gaps: { mechanism: 1, prose: 1 },
      holds: ["atlas-refresh", "close-offer"],
      owed: 1,
    });
  });
});
