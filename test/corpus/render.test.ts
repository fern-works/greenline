/** Render and verify (`src/corpus/render.ts`) over the fixture recipe and its snapshots. */
import { describe, expect, it } from "vitest";
import { checkRecipe, parseRecipe, type CheckedRecipe } from "../../src/corpus/recipe.ts";
import { compareSkill, renderSkill, type SkillFile } from "../../src/corpus/render.ts";
import {
  fixtureRecipe,
  fixtureSnapshots,
  RENDERED_FILES,
  RENDERED_SKILL,
  SKILL_IDS,
  SOURCE,
  type FixtureRecipe,
} from "../fixtures/recipe.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function checkedOf(recipe: FixtureRecipe): CheckedRecipe {
  const parsed = parseRecipe(JSON.stringify(recipe), "fixture.json");
  if (parsed._tag === "err") throw parsed.error;
  const checked = checkRecipe(parsed.value, fixtureSnapshots);
  if (checked._tag === "err") throw checked.error;
  return checked.value;
}

function renderedText(recipe: FixtureRecipe, path = "SKILL.md"): string | undefined {
  const file = renderSkill(checkedOf(recipe)).find((entry) => entry.path === path);
  return file === undefined ? undefined : decoder.decode(file.bytes);
}

const committed: readonly SkillFile[] = [...RENDERED_FILES].map(([path, text]) => ({
  path,
  bytes: encoder.encode(text),
}));

describe("renderSkill", () => {
  it("renders the fixture recipe to the bytes of the fixture skill directory, SKILL.md first", () => {
    const rendered = renderSkill(checkedOf(fixtureRecipe()));
    expect(rendered.map((file) => [file.path, decoder.decode(file.bytes)])).toEqual([
      ...RENDERED_FILES,
    ]);
  });

  it("joins two consecutive taken passages adjacent in the same source file by the source's own separator", () => {
    const recipe = fixtureRecipe();
    const passages = recipe.files[0]?.passages ?? [];
    passages.splice(
      2,
      1,
      { passage: "taken", source: SOURCE, file: "fixture/SKILL.md", segments: [SKILL_IDS[4]] },
      {
        passage: "taken",
        source: SOURCE,
        file: "fixture/SKILL.md",
        segments: [SKILL_IDS[5], SKILL_IDS[6]],
      },
    );
    expect(renderedText(recipe)).toBe(RENDERED_SKILL);
  });

  it("puts one blank line before a passage that states no join and does not continue its neighbour", () => {
    const recipe = fixtureRecipe();
    const written = recipe.files[0]?.passages[1];
    if (written?.passage === "written") delete written.join;
    expect(renderedText(recipe)).toBe(
      RENDERED_SKILL.replace(
        "any code at all. Greenline adds",
        "any code at all.\n\nGreenline adds",
      ),
    );
  });

  it("writes every further front matter field in order, each a double-quoted string", () => {
    const recipe = fixtureRecipe();
    recipe.frontMatter.push({ field: "source", value: "greenline native; a test" });
    expect(renderedText(recipe)?.split("\n---\n")[0]).toBe(
      '---\nname: "fixture-skill"\ndescription: "A recipe fixture: one taken source, one \\"edit\\", one drop."\nsource: "greenline native; a test"',
    );
  });
});

describe("compareSkill", () => {
  it("reports no difference between the rendering and the fixture directory", () => {
    expect(compareSkill(renderSkill(checkedOf(fixtureRecipe())), committed)).toEqual([]);
  });

  it("names a changed file with its first differing line, a missing file and an unexpected one", () => {
    const changed = committed
      .filter((file) => file.path !== "scripts/run.sh")
      .map((file) =>
        file.path === "notes.md"
          ? { path: file.path, bytes: encoder.encode("# Notes\n\nA different note.\n") }
          : file,
      );
    expect(
      compareSkill(renderSkill(checkedOf(fixtureRecipe())), [
        ...changed,
        { path: "extra.txt", bytes: encoder.encode("x") },
      ]),
    ).toEqual([
      { path: "extra.txt", difference: "unexpected" },
      { path: "notes.md", difference: "changed", line: 3 },
      { path: "scripts/run.sh", difference: "missing" },
    ]);
  });
});
