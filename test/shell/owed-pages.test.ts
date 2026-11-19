import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOOKS_ON,
  MANIFEST_SCHEMA_VERSION,
  NO_PROCEED,
  type Manifest,
} from "../../src/core/manifest.ts";
import type { SkillLoadFact } from "../../src/core/skill-loads.ts";
import { parseRecipe } from "../../src/corpus/recipe.ts";
import { owedAtDone, proposalLines } from "../../src/shell/habits-owed.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

/**
 * The pages a skill's whole read includes (J-203 S1, the run
 * j196c-merged-skills, whose agent read tdd's method page in one `cat` with
 * ponytail's simplify page, the harness cut the result, and tdd's tests
 * page went unread while tests were kept): the recipe names the pages, the
 * corpus instrument renders them into the triggers file the installation
 * carries, and the owes line and the done door hold a skill owed whole
 * until its front and each of its pages is read whole, naming each page
 * cut, read with another page or unread.
 */

const CORPUS = join(import.meta.dirname, "..", "..", "corpus");
const compiled = compileInstallation(CORPUS);
if (compiled._tag !== "ok") throw new Error("the corpus does not compile");
const installation = compiled.value;

const MANIFEST: Manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  targets: ["claude-code"],
  skills: { exclude: [], include: [] },
  connectors: {},
  proceed: NO_PROCEED,
  trials: [],
  checks: [],
  hooks: HOOKS_ON,
};

const ID = "2026-11-08-author-index";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The run's record at its build (j196c-merged-skills, 001/001): regular, the owner's mode, its plan naming the test file. */
const RECORD = [
  "---",
  "mode: regular",
  "choice: owner",
  'why: "The owner wants findByAuthor fast for big shelves."',
  "state: open",
  'next: "build: the author index, test first"',
  "ground: branch",
  'agent: "claude-code/claude-sonnet-5-5"',
  "skills: [frame, plan, build, tdd, ponytail]",
  "---",
  "",
  "## plan",
  "",
  "1. **The index, test first** (S, `test/shelf.test.js`, `src/shelf.js`): `tdd`.",
  "",
].join("\n");

/** A load line as the hooks write it in the change's folder. */
function fact(file: string, skill: string, whole: boolean, via: string, cause?: "cut"): string {
  const load: SkillLoadFact = {
    skill,
    file,
    whole,
    via,
    at: "2026-11-08T06:29:00.000Z",
    step: "build",
    agent: null,
    session: "s1",
    turn: 1,
  };
  return JSON.stringify(cause === undefined ? load : { ...load, cause });
}

/** The workspace at the run's build; with the test file touched, a repository whose tree holds it, as the done door reads the touched files alone (J-225 S1). */
function workspace(loads: readonly string[], touched = false): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-owed-pages-"));
  roots.push(root);
  mkdirSync(join(root, ".greenline", "ledger", ID, "skills"), { recursive: true });
  writeFileSync(join(root, ".greenline", "ledger", `${ID}.md`), RECORD);
  writeFileSync(
    join(root, ".greenline", "ledger", ID, "skills", "2026-11-08.jsonl"),
    loads.map((line) => `${line}\n`).join(""),
  );
  if (touched) {
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], { cwd: root });
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "test", "shelf.test.js"), "test\n");
  }
  return root;
}

const input = (root: string) => ({
  root,
  installation,
  manifest: MANIFEST,
  change: ID,
  session: null,
});

/** The run's loads at build: tdd and ponytail by the Skill tool, then the one `cat` the harness cut. */
const RUN_LOADS = [
  fact("SKILL.md", "tdd", true, "Skill"),
  fact("SKILL.md", "ponytail", true, "Skill"),
  fact("method.md", "ponytail", true, "Read"),
  fact("method.md", "tdd", false, "cat", "cut"),
  fact("simplify.md", "ponytail", false, "cat", "cut"),
];

describe("J-203 S1 the pages a whole read includes, named by the recipe and held by the owes line and the done door (j196c-merged-skills)", () => {
  it("renders tdd's method and tests pages and ponytail's simplify page into the triggers file the installation carries", () => {
    const pages = new Map(
      (installation.triggers?.skills ?? []).map((skill) => [skill.name, skill.wholeRead]),
    );
    expect(pages.get("tdd")).toEqual(["method.md", "tests.md"]);
    expect(pages.get("ponytail")).toEqual(["simplify.md"]);
    // Each page stands in the skill the installation carries.
    for (const name of ["tdd", "ponytail"]) {
      const skill = installation.skills.find((each) => each.name === name);
      const files = (skill?.supportFiles ?? []).map((file) => file.path);
      for (const page of pages.get(name) ?? []) expect(files).toContain(page);
    }
  });

  it("names the method page the harness cut and the tests page unread on the owes line, while the skill stays owed", () => {
    const owed = proposalLines(input(workspace(RUN_LOADS))).owed ?? "";
    expect(owed).toContain(
      "tdd (whole: the plan names a test file, at build; method.md cut by the harness, read it again; tests.md unread)",
    );
    expect(owed).not.toContain("ponytail");
  });

  it("holds the done door while the pages stand read in part, the skills line naming tdd, and lets it go once each page is read whole", () => {
    const held = owedAtDone(input(workspace(RUN_LOADS, true))).find(
      (entry) => entry.skill === "tdd",
    );
    expect(held?.held).toEqual([
      { file: "method.md", state: "cut" },
      { file: "tests.md", state: "unread" },
    ]);
    const read = workspace(
      [...RUN_LOADS, fact("method.md", "tdd", true, "Read"), fact("tests.md", "tdd", true, "Read")],
      true,
    );
    expect(owedAtDone(input(read)).find((entry) => entry.skill === "tdd")?.held).toBeUndefined();
    expect(proposalLines(input(read)).owed ?? "").not.toContain("tdd");
  });

  it("refuses a recipe whose pages are not its own Markdown pages, its front among them, or which owes by no row", () => {
    const text = readFileSync(join(CORPUS, "recipes", "tdd.json"), "utf8");
    const named = '"wholeRead": ["method.md", "tests.md"]';
    expect(text).toContain(named);
    expect(parseRecipe(text, "tdd.json")._tag).toBe("ok");
    for (const pages of ['["SKILL.md"]', '["missing.md"]', '["method.md", "method.md"]'])
      expect(
        parseRecipe(text.replace(named, `"wholeRead": ${pages}`), "tdd.json")._tag,
        pages,
      ).toBe("err");
    // The rows taken out, the pages stand beside no row that owes the read.
    const rows = text.indexOf(',\n  "triggers": [');
    const after = text.indexOf('\n  ],\n  "wholeRead"');
    expect(rows).toBeGreaterThan(0);
    const bare = `${text.slice(0, rows)}${text.slice(after + "\n  ]".length)}`;
    expect(bare).not.toContain('"triggers"');
    expect(parseRecipe(bare, "tdd.json")._tag).toBe("err");
    expect(parseRecipe(bare.replace(`,\n  ${named}`, ""), "tdd.json")._tag).toBe("ok");
  });
});
