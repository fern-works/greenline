/** The recipe instrument (`src/corpus/instrument.ts`, `scripts/corpus.mjs`) on a fixture corpus on disk, and the dependency rule that fences `src/corpus/`. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson } from "../../src/core/contract.ts";
import { parseChain } from "../../src/corpus/chain.ts";
import { measureVerb, renderVerb, verifyVerb, viewsVerb } from "../../src/corpus/instrument.ts";
import { readEntryFiles, recipeNames } from "../../src/corpus/tree.ts";
import { RECORDED, writeFixtureCorpus, writeTree } from "../fixtures/corpus-disk.ts";
import { fixtureRecipe, RENDERED_FILES, SOURCE } from "../fixtures/recipe.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  made.push(directory);
  return directory;
}

/** A fixture corpus on disk; without the committed skill directory, or with the two recorded entries, when asked. */
function corpusOnDisk(options: {
  readonly skillDirectory: boolean;
  readonly recorded?: boolean;
}): string {
  const corpus = temporary("greenline-recipes-");
  writeFixtureCorpus(corpus, {
    skillDirectory: options.skillDirectory,
    recorded: options.recorded === true,
  });
  return corpus;
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The tip `verify` reports once the two fixture entries are recorded. */
const RECORDED_TIP = {
  id: "2026-10-05-fixture-skill-recipe",
  sha256: sha256(RECORDED[1]?.text ?? ""),
};

describe("the verbs", () => {
  it("verify reports the fixture directory matching its recipe and the views matching their rendering", () => {
    const root = temporary("greenline-recipes-");
    const corpus = join(root, "corpus");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
    expect(viewsVerb(corpus, true).failed).toBe(false);
    expect(verifyVerb(corpus, [])).toEqual({
      output: {
        verb: "verify",
        recipes: 1,
        verified: ["fixture-skill"],
        differences: [],
        refused: [],
        entries: 2,
        tip: RECORDED_TIP,
        chain: [],
        ledger: [],
        views: [],
        snapshots: [],
      },
      failed: false,
    });
  });

  it("verify names a view that is not committed and one that differs from its rendering, and checks none for a named skill", () => {
    const root = temporary("greenline-recipes-");
    const corpus = join(root, "corpus");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
    expect(viewsVerb(corpus, true).failed).toBe(false);
    rmSync(join(root, "corpus/NOTICE.md"));
    writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "# Notices\n");
    const outcome = verifyVerb(corpus, []);
    expect(outcome.failed).toBe(true);
    expect(outcome.output.views).toEqual([
      {
        path: "THIRD_PARTY_NOTICES.md",
        message: "the committed view differs from its rendering; run views --write",
      },
      { path: "corpus/NOTICE.md", message: "the view is not committed; run views --write" },
    ]);
    expect(verifyVerb(corpus, ["fixture-skill"]).output.views).toEqual([]);
    expect(verifyVerb(corpus, ["fixture-skill"]).failed).toBe(false);
  });

  it("verify finds a skill directory file the recipe does not render, such as a page left behind", () => {
    const corpus = corpusOnDisk({ skillDirectory: true, recorded: true });
    writeFileSync(join(corpus, "skills/fixture-skill/PAGE.md"), "# Left behind\n");
    expect(verifyVerb(corpus, ["fixture-skill"]).output.differences).toEqual([
      { skill: "fixture-skill", path: "PAGE.md", difference: "unexpected" },
    ]);
  });

  it("verify names a committed file that differs and fails, and never writes", () => {
    const corpus = corpusOnDisk({ skillDirectory: true, recorded: true });
    const notes = join(corpus, "skills/fixture-skill/notes.md");
    writeFileSync(notes, "# Notes\n\nEdited by hand.\n");
    expect(verifyVerb(corpus, ["fixture-skill"])).toEqual({
      output: {
        verb: "verify",
        recipes: 1,
        verified: [],
        differences: [{ skill: "fixture-skill", path: "notes.md", difference: "changed", line: 3 }],
        refused: [],
        entries: 2,
        tip: RECORDED_TIP,
        chain: [],
        ledger: [],
        views: [],
        snapshots: [],
      },
      failed: true,
    });
    expect(readFileSync(notes, "utf8")).toBe("# Notes\n\nEdited by hand.\n");
  });

  it("render writes the skill directory the recipe defines, byte for byte", () => {
    const corpus = corpusOnDisk({ skillDirectory: false });
    expect(renderVerb(corpus, "fixture-skill")).toEqual({
      output: {
        verb: "render",
        skill: "fixture-skill",
        wrote: ["SKILL.md", "notes.md", "scripts/run.sh"],
        refused: [],
      },
      failed: false,
    });
    for (const [path, text] of RENDERED_FILES)
      expect([path, readFileSync(join(corpus, "skills/fixture-skill", path), "utf8")]).toEqual([
        path,
        text,
      ]);
  });

  it("measure reports the fixture's measure", () => {
    const outcome = measureVerb(corpusOnDisk({ skillDirectory: true }), []);
    expect(outcome.failed).toBe(false);
    expect(outcome.output.measures.map((measure) => measure.sources)).toEqual([
      [
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
    ]);
  });

  it("refuses a recipe whose file names another skill", () => {
    const corpus = corpusOnDisk({ skillDirectory: true });
    writeTree(corpus, new Map([["recipes/other-skill.json", JSON.stringify(fixtureRecipe())]]));
    expect(measureVerb(corpus, ["other-skill"]).output.refused).toEqual([
      {
        skill: "other-skill",
        issues: [{ message: "'corpus/recipes/other-skill.json' names the skill 'fixture-skill'" }],
      },
    ]);
  });
});

describe("scripts/corpus.mjs", () => {
  function run(...args: string[]) {
    const result = spawnSync(process.execPath, ["scripts/corpus.mjs", ...args], {
      cwd: repository,
      encoding: "utf8",
      // The views verb prints every view whole, the ledger's index among them, past
      // the default buffer of 1 MiB since J-93 S1's entries; a short buffer reads as no exit.
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: result.status, output: parseJson(result.stdout) };
  }

  it("verifies every recipe in this tree, each recorded by its latest change entry, and exits 0", () => {
    const names = recipeNames(join(repository, "corpus"));
    expect(names.length).toBeGreaterThanOrEqual(6);
    const result = run("verify");
    expect(result.status).toBe(0);
    // The skills' recipes and the modes definition's (S16b), which verifies first.
    expect(result.output).toMatchObject({
      verb: "verify",
      recipes: names.length + 1,
      verified: ["modes", ...names],
      differences: [],
      refused: [],
      chain: [],
      ledger: [],
      views: [],
      snapshots: [],
    });
  });

  it("starts the fresh chain with an entry that cites the old chain's tip", () => {
    const chain = parseChain(readEntryFiles(join(repository, "corpus")));
    if (chain._tag === "err") throw chain.error;
    const first = chain.value.entries[0]?.entry.previous;
    expect(first !== undefined && "oldChain" in first ? first.oldChain.id : first).toBe(
      "use-garden-answers-2026-09-28",
    );
  });

  it("draft refuses a skill whose recipe exists, naming it, and exits 1", () => {
    expect(run("draft", "tdd")).toEqual({
      status: 1,
      output: {
        verb: "draft",
        skill: "tdd",
        wrote: null,
        todos: 0,
        differences: [],
        refused: [
          {
            skill: "tdd",
            issues: [
              {
                message:
                  "the recipe 'corpus/recipes/tdd.json' exists, and draft never rewrites one",
              },
            ],
          },
        ],
      },
    });
  });

  it("prints this tree's views without writing them, and exits 0", () => {
    const result = run("views");
    expect(result.status).toBe(0);
    expect(result.output).toMatchObject({ verb: "views", wrote: [], refused: [] });
  });

  it("exits 1 for record of an entry file that is not there, naming it, and for an unknown verb", () => {
    const missing = join(repository, "no-such-entry.json");
    expect(run("record", "no-such-entry.json")).toEqual({
      status: 1,
      output: {
        verb: "record",
        entry: null,
        wrote: null,
        refused: [{ entry: missing, message: `no entry file '${missing}'` }],
      },
    });
    expect(run("views", "--force").status).toBe(1);
  });

  it("exits 1 for render and measure of an unknown skill, naming it", () => {
    const issues = [
      { message: "no recipe 'corpus/recipes/no-such-skill.json' for 'no-such-skill'" },
    ];
    expect(run("render", "no-such-skill")).toEqual({
      status: 1,
      output: {
        verb: "render",
        skill: "no-such-skill",
        wrote: [],
        refused: [{ skill: "no-such-skill", issues }],
      },
    });
    expect(run("measure", "no-such-skill")).toEqual({
      status: 1,
      output: { verb: "measure", measures: [], refused: [{ skill: "no-such-skill", issues }] },
    });
  });
});

describe("the dependency rule", () => {
  const depcruise = join(repository, "node_modules", ".bin", "depcruise");
  /** The part of depcruise's JSON report the test reads. */
  const cruiseReport = z.object({
    summary: z.object({
      violations: z.array(z.object({ rule: z.object({ name: z.string() }) })),
    }),
  });

  /** depcruise over a small tree holding one importing file; the names of the rules it breaks. */
  function brokenRules(from: string, to: string): readonly string[] {
    const root = temporary("greenline-spine-");
    copyFileSync(
      join(repository, ".dependency-cruiser.cjs"),
      join(root, ".dependency-cruiser.cjs"),
    );
    writeTree(
      root,
      new Map([
        [to, "export const value = 1;\n"],
        [
          from,
          `import { value } from "${"../".repeat(from.split("/").length - 2)}${to.slice("src/".length)}";\nexport const used = value;\n`,
        ],
      ]),
    );
    const result = spawnSync(
      depcruise,
      ["src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    const report = cruiseReport.parse(parseJson(result.stdout));
    return report.summary.violations.map((violation) => violation.rule.name).sort();
  }

  it("refuses an import of src/corpus/ from src/core/, src/shell/ and src/commons/", () => {
    expect(brokenRules("src/core/x.ts", "src/corpus/y.ts")).toEqual([
      "core-below-shell",
      "product-never-imports-corpus",
    ]);
    expect(brokenRules("src/shell/x.ts", "src/corpus/y.ts")).toEqual([
      "product-never-imports-corpus",
    ]);
    expect(brokenRules("src/commons/x.ts", "src/corpus/y.ts")).toEqual([
      "commons-depends-on-nothing",
      "product-never-imports-corpus",
    ]);
  });

  it("refuses an import of src/shell/ from src/corpus/ and accepts one of src/core/", () => {
    expect(brokenRules("src/corpus/x.ts", "src/shell/y.ts")).toEqual(["corpus-above-core"]);
    expect(brokenRules("src/corpus/x.ts", "src/core/y.ts")).toEqual([]);
  });
});
