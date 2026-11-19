import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { owedSkills, plannedTest, type OwedContext } from "../../src/core/habits-owed.ts";
import {
  HOOKS_ON,
  MANIFEST_SCHEMA_VERSION,
  NO_PROCEED,
  type Manifest,
} from "../../src/core/manifest.ts";
import { owedAtDone, owedNow, proposalLines } from "../../src/shell/habits-owed.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

/**
 * The owes line reads what the change owes (J-225 S1, part A): the research
 * and ponytail rows fire on their own words (j217c-conduct-empty finding 5,
 * j217c-ground finding 3); a plan's named files count until the build ends
 * and the touched files alone after it and at the done door (j201c-visuals
 * finding 5, whose diagram's plan named the four files its picture draws);
 * and a plan that says a test is written owes tdd before the first file
 * (j217t-roster-use finding 1, whose theme plan added a failing test and
 * named no path).
 */

const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
if (compiled._tag !== "ok") throw new Error("the corpus does not compile");
const installation = compiled.value;
const triggers = installation.triggers;
if (triggers === undefined) throw new Error("no triggers");

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

/** The steps a mode runs, from the installation's definition. */
function stepsOf(mode: string): ReadonlySet<string> {
  const found = installation.modes.modes.find((each) => each.name === mode);
  return new Set(
    installation.modes.steps
      .filter((step) => (found?.steps[step.name]?.depth ?? "none") !== "none")
      .map((step) => step.name),
  );
}

const owedBy = (overrides: Partial<OwedContext>): readonly string[] =>
  owedSkills(triggers, {
    words: "",
    classes: new Set(),
    steps: new Set(),
    mode: undefined,
    ...overrides,
  }).map((entry) => entry.skill);

describe("J-225 S1 A1 the research row fires on its own words (j217c-conduct-empty finding 5)", () => {
  // The owner's question at 002/009, a careful change open.
  const EXCEL =
    "Yes to all three. One thing I worry about: will Excel open it right with accented names?";

  it("owes no research at careful for the owner's question whether Excel will open the file", () => {
    expect(owedBy({ words: EXCEL, mode: "careful", steps: stepsOf("careful") })).not.toContain(
      "research",
    );
  });

  it("still owes research at careful for a message that is not sure the work is worth it", () => {
    expect(
      owedBy({
        words: "I am not sure this is worth it.",
        mode: "careful",
        steps: stepsOf("careful"),
      }),
    ).toContain("research");
  });
});

describe("J-225 S1 A2 the ponytail row fires on a clean-up of code (j217c-ground finding 3)", () => {
  const WORKTREE = "Leave the branch, and clean up the worktree.";

  it("owes no ponytail for cleaning up a worktree where no change is open, at quick, or with build left out", () => {
    // No change open: the words alone, no step and no mode.
    expect(owedBy({ words: WORKTREE })).not.toContain("ponytail");
    expect(owedBy({ words: WORKTREE, mode: "quick", steps: stepsOf("quick") })).not.toContain(
      "ponytail",
    );
    expect(
      owedBy({ words: WORKTREE, mode: "regular", steps: new Set(["frame", "plan"]) }),
    ).not.toContain("ponytail");
  });

  it("still owes ponytail for a clean-up of code, and at a regular build by its step row", () => {
    for (const words of ["clean up this function", "Can you clean it up?", "clean up the code"])
      expect(owedBy({ words }), words).toContain("ponytail");
    expect(owedBy({ words: "cleaned up the parser" })).toContain("ponytail");
    // The second row holds at a regular or careful build whatever the words say (R3).
    expect(owedBy({ words: WORKTREE, mode: "regular", steps: new Set(["build"]) })).toContain(
      "ponytail",
    );
  });
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A workspace holding one record, a git repository where files are touched. */
function workspace(id: string, record: string, touched: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-owed-reads-"));
  roots.push(root);
  mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
  writeFileSync(join(root, ".greenline", "ledger", `${id}.md`), record);
  if (touched.length > 0) {
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], { cwd: root });
    for (const path of touched) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "touched\n");
    }
  }
  return root;
}

const input = (root: string, change: string) => ({
  root,
  installation,
  manifest: MANIFEST,
  change,
  session: null,
});

const DIAGRAM = "2026-11-10-find-by-year-diagram";

/** The diagram change's record (j201c-visuals, 001/008 to 001/011), at quick, its plan verbatim, at the step named. */
function diagramRecord(next: string): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'yes: "Yes, go ahead."',
    'why: "The owner asked for the findByYear change drawn as a diagram they can keep, so the method\'s decisions and the files the change touched read at a glance."',
    "state: open",
    `next: "${next}"`,
    "ground: branch",
    'agent: "claude-code/claude-sonnet-5-5"',
    "---",
    "",
    "## frame",
    "",
    "Intent: keep one lasting diagram of the finished `findByYear` change.",
    "",
    "## design",
    "",
    "none, no interface",
    "",
    "## plan",
    "",
    "Skills followed: `diagram-design`, `show-me`. Acceptance, each a condition that can fail: the kept file is one SVG under `.greenline/visuals/2026-11-10-find-by-year-diagram/` with its manifest and no outside address; it draws at most twelve nodes with the code's own names; every decision in `findByYear` appears; it marks `src/shelf.js`, `test/shelf.test.js`, `README.md` and `docs/decisions.md` (D4) as the files the change touched. Check: `greenline picture keep` accepts it, and I read the SVG against `src/shelf.js` lines 20 to 28.",
    "",
    "## anticipate",
    "",
    "none at quick",
    "",
    "## build",
    "",
    "Skills followed: `show-me`, `diagram-design`. One fresh agent drew `find-by-year.svg`.",
    "",
    "## review",
    "",
    "none at quick",
    "",
    "## verify",
    "",
    "VERIFIED by reading: each plan condition holds.",
    "",
  ].join("\n");
}

describe("J-225 S1 A3 the plan's files count until the build ends (j201c-visuals finding 5)", () => {
  it("owes neither prose nor tdd at verify or at the done door for a diagram whose plan names files the change never touched", () => {
    const root = workspace(DIAGRAM, diagramRecord("verify: read the picture against the code"));
    const line = proposalLines(input(root, DIAGRAM)).owed ?? "";
    expect(line).not.toContain("prose");
    expect(line).not.toContain("tdd");
    const done = owedAtDone(input(root, DIAGRAM)).map((entry) => entry.skill);
    expect(done).not.toContain("prose");
    expect(done).not.toContain("tdd");
  });

  it("counts the plan's files at build, its reason naming the plan and never a touch", () => {
    const root = workspace(DIAGRAM, diagramRecord("build: draw the picture"));
    const owed = owedNow(input(root, DIAGRAM), stepsOf("quick"));
    const tdd = owed.find((entry) => entry.skill === "tdd");
    expect(tdd?.why).toBe("the plan names a test file");
    expect(owed.find((entry) => entry.skill === "prose")?.why).toBe("the plan names a readme file");
    expect(owed.map((entry) => entry.why).join("; ")).not.toContain("touched");
    // The done door reads the touched files alone, whatever the step.
    expect(owedAtDone(input(root, DIAGRAM)).map((entry) => entry.skill)).not.toContain("tdd");
  });

  it("owes tdd at the done door for a test file the change touched, its reason the touch", () => {
    const root = workspace(DIAGRAM, diagramRecord("verify: read the picture"), [
      "test/shelf.test.js",
    ]);
    const tdd = owedAtDone(input(root, DIAGRAM)).find((entry) => entry.skill === "tdd");
    expect(tdd?.why).toBe("a test file touched");
  });

  it("counts the plan's files on a record with no step, a fresh skeleton's (R1)", () => {
    const skeleton = [
      "---",
      'choice: "<proposed, accepted, owner or standing>"',
      'why: "<the request in one line>"',
      "state: open",
      "---",
      "",
      "## plan",
      "",
      "1. **The index, test first** (`test/shelf.test.js`, `src/shelf.js`).",
      "",
    ].join("\n");
    const root = workspace(DIAGRAM, skeleton);
    const owed = owedNow(input(root, DIAGRAM), stepsOf("regular"));
    expect(owed.find((entry) => entry.skill === "tdd")?.why).toBe("the plan names a test file");
    expect(owedAtDone(input(root, DIAGRAM)).map((entry) => entry.skill)).not.toContain("tdd");
  });
});

const THEME = "2026-11-10-theme-settings";

/** The theme change's record at its plan (j217t-roster-use, 001/003), regular, the plan as the agent wrote it. */
function themeRecord(plan: string): string {
  return [
    "---",
    "mode: regular",
    "choice: owner",
    "proposed: careful",
    'why: "Let staff choose a theme and keep it across visits."',
    "state: open",
    'next: "build: wait for the owner\'s decision on style-check exceptions"',
    "ground: branch",
    'agent: "codex/gpt-6.1-terra"',
    'interface: "yes, app"',
    "---",
    "",
    "## frame",
    "",
    "`frame`: Add settings with System, Light and Dark choices. Existing tests in `test/members.test.js` cover member logic only.",
    "",
    "## plan",
    "",
    plan,
    "",
    "## build",
    "",
    "none yet",
    "",
  ].join("\n");
}

const THEME_PLAN =
  "`plan`: A settings page offers System, Light and Dark; selection applies throughout the app, System follows changes to the OS, and explicit choices survive reloads. Storage failure is reported. The existing npm test command checks the theme's browser boundary; the interface check assesses the affected screens.\n\nConsidered a shared React provider versus a small browser theme controller. Add the approved palette to the design tokens, then add a failing theme test, implement the controller and page, connect the shell and run checks. The tests catch selection, persistence, system changes and storage failure, while rendered checks cover layout and accessibility.";

describe("J-225 S1 A4 a plan that says a test is written owes tdd before the first file (j217t-roster-use finding 1)", () => {
  it("owes tdd whole at build for the theme plan, which adds a failing test and names no path", () => {
    const root = workspace(THEME, themeRecord(THEME_PLAN));
    expect(proposalLines(input(root, THEME)).owed ?? "").toContain(
      "tdd (whole: the plan names a test to write, at build",
    );
  });

  it("owes nothing for a plan that only says the existing test command checks a boundary", () => {
    const plan =
      "`plan`: A settings page offers System, Light and Dark. The existing npm test command checks the theme's browser boundary; the tests catch selection.";
    const root = workspace(THEME, themeRecord(plan));
    expect(proposalLines(input(root, THEME)).owed ?? "").not.toContain("tdd");
  });

  it("reads a making verb whose object ends in a test, and the three phrases, from the plan section alone", () => {
    const plan = (text: string): string => `---\nnext: "build"\n---\n\n## plan\n\n${text}\n`;
    for (const text of [
      "Write the parser tests, then the parser.",
      "Create a regression test for the empty shelf.",
      "Adds two tests.",
      "A failing theme test is added after the tokens.",
      "Start with a failing test.",
      "Keep a red test before the fix.",
      "The index, test first.",
    ])
      expect(plannedTest(plan(text)), text).toBe(true);
    for (const text of [
      "The existing npm test command checks the boundary.",
      "Add the test command to the CI file.",
      "The tests catch selection and persistence.",
      "Run the tests after the build.",
      "Add the export and run the tests.",
    ])
      expect(plannedTest(plan(text)), text).toBe(false);
    // The next line is never read, nor another section.
    expect(
      plannedTest(
        '---\nnext: "build: write the theme logic test first"\n---\n\n## frame\n\nAdd a test.\n\n## plan\n\nThe copy.\n',
      ),
    ).toBe(false);
  });
});
