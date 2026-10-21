/** The split's front rule (`src/corpus/fronts.ts`, J-93 S2): a front holds the upstream prose alone, and a step's skill keeps its mechanics on a references page. */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { frontFindings, hasReferences } from "../../src/corpus/fronts.ts";
import { frontsVerb } from "../../src/corpus/instrument.ts";
import { checkRecipe, parseRecipe } from "../../src/corpus/recipe.ts";
import {
  fixtureCorpus,
  fixtureRecipe,
  fixtureSnapshots,
  type FixturePassage,
  type FixtureRecipe,
} from "../fixtures/recipe.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A written passage of greenline's text, one blank line after the passage before it. */
const written = (text: string): FixturePassage => ({
  passage: "written",
  text,
  kind: "home",
  reason: "the fixture's mechanics",
});

/** A references page holding one written passage; `Object.assign` adds the part the fixture's type leaves out. */
function referencesPage(text: string): FixtureRecipe["files"][number] {
  return Object.assign(
    { path: "references/greenline.md", passages: [written(text)] },
    { part: "references" },
  );
}

/** The fixture with a mechanic in its front's SKILL.md, in its Handoff, in notes.md and on a references page. */
function split(): FixtureRecipe {
  const recipe = fixtureRecipe();
  const pages = recipe.files;
  pages[0]?.passages.push(
    written(
      "Write the section into `.greenline/ledger/<id>.md` and run `greenline check -- npm test`.",
    ),
    written("Durable output: .greenline/map/ (map.md)"),
    written("```js\nconst bar = '.greenline/DECISIONS.md';\n```"),
    written("## Handoff\n\nProduces: the check section of .greenline/ledger/<id>.md\nNext: none"),
  );
  pages[1]?.passages.push(written("Mark it `status: draft` until GL0406 clears."));
  pages.push(
    referencesPage("Every commit carries `Greenline-Change: <id>`; run `greenline status`."),
  );
  return recipe;
}

function checked(recipe: FixtureRecipe) {
  const parsed = parseRecipe(JSON.stringify(recipe), "fixture.json");
  if (parsed._tag === "err") throw parsed.error;
  const result = checkRecipe(parsed.value, fixtureSnapshots);
  if (result._tag === "err") throw result.error;
  return result.value;
}

describe("J-93 S2 the front rule", () => {
  it("finds each greenline command, workspace path and record form a front holds, by file and line", () => {
    expect(frontFindings(checked(split()))).toEqual([
      { path: "SKILL.md", line: 16, what: "a workspace path", text: ".greenline/ledger/<id>.md" },
      { path: "SKILL.md", line: 16, what: "a greenline command", text: "greenline check" },
      { path: "notes.md", line: 5, what: "a plan document's mark", text: "status: draft" },
      { path: "notes.md", line: 5, what: "a finding code", text: "GL0406" },
    ]);
  });

  it("reads neither SKILL.md's Handoff section, a habit's durable-output line, a fenced code block nor a references page, and finds nothing in the fixture's own front", () => {
    const recipe = split();
    // What is left once the two front passages naming mechanics leave.
    recipe.files[0]?.passages.splice(4, 1);
    recipe.files[1]?.passages.pop();
    expect(frontFindings(checked(recipe))).toEqual([]);
    expect(frontFindings(checked(fixtureRecipe()))).toEqual([]);
  });

  it("names the product in a sentence without finding a command", () => {
    const recipe = fixtureRecipe();
    recipe.files[0]?.passages.push(written("greenline keeps the record; greenline's way."));
    expect(frontFindings(checked(recipe))).toEqual([]);
  });

  it("finds a greenline command's flag a front names apart from the command, and a path in the description", () => {
    const recipe = fixtureRecipe();
    recipe.files[0]?.passages.push(
      written("Name the change with `--change <id>`, and leave git's `--no-commit` to git."),
    );
    const description = recipe.frontMatter[1];
    if (description !== undefined) description.value = "A fixture saved under .greenline/map/.";
    expect(frontFindings(checked(recipe))).toEqual([
      { path: "SKILL.md", line: 3, what: "a workspace path", text: ".greenline/map/." },
      { path: "SKILL.md", line: 16, what: "a greenline command's flag", text: "`--change <id>`" },
    ]);
  });

  it("tells whether a recipe names a references page", () => {
    expect(hasReferences(checked(split()))).toBe(true);
    expect(hasReferences(checked(fixtureRecipe()))).toBe(false);
  });
});

describe("J-93 S2 the fronts verb", () => {
  function corpus(recipe: FixtureRecipe): string {
    const root = mkdtempSync(join(tmpdir(), "greenline-fronts-"));
    made.push(root);
    for (const [path, text] of fixtureCorpus(recipe)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    mkdirSync(join(root, "runtime"), { recursive: true });
    copyFileSync(join(repository, "corpus/runtime/modes.json"), join(root, "runtime/modes.json"));
    return root;
  }

  it("fails on a front's mechanic and on a skill on the line with no references page", () => {
    const outcome = frontsVerb(corpus(split()), []);
    expect(outcome.failed).toBe(true);
    expect(outcome.output.findings.map((finding) => [finding.skill, finding.text])).toEqual([
      ["fixture-skill", ".greenline/ledger/<id>.md"],
      ["fixture-skill", "greenline check"],
      ["fixture-skill", "status: draft"],
      ["fixture-skill", "GL0406"],
    ]);
    expect(outcome.output.unreferenced).toEqual([]);
    // The fixture skill is a step: with no references page it is named.
    const bare = frontsVerb(corpus(fixtureRecipe()), []);
    expect(bare.output).toMatchObject({ findings: [], unreferenced: ["fixture-skill"] });
    expect(bare.failed).toBe(true);
  });

  it("passes a clean front on a step whose recipe names its references page", () => {
    const recipe = fixtureRecipe();
    recipe.files.push(referencesPage("Run `greenline check` on every check."));
    const outcome = frontsVerb(corpus(recipe), []);
    expect(outcome.output).toMatchObject({
      recipes: 1,
      findings: [],
      unreferenced: [],
      refused: [],
    });
    expect(outcome.failed).toBe(false);
  });

  it("holds the tree's every front to the rule, and every step's skill to its references page", () => {
    const outcome = frontsVerb(join(repository, "corpus"), []);
    expect(outcome.output.findings).toEqual([]);
    expect(outcome.output.unreferenced).toEqual([]);
    expect(outcome.failed).toBe(false);
  });
});
