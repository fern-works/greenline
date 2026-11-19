import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOOKS_ON,
  MANIFEST_SCHEMA_VERSION,
  NO_PROCEED,
  type Manifest,
} from "../../src/core/manifest.ts";
import { owedSkills } from "../../src/core/habits-owed.ts";
import { owedAtDone, proposalLines } from "../../src/shell/habits-owed.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

/**
 * The owed habits at a regular build (J-200 S1, the run j196c-roster-use,
 * whose settings-page change at regular saw "owes: ponytail (its front: at
 * build); pr-writing (its front: at close)" before its build and closed done
 * with no domain-and-types load): the trigger rows are read for the files
 * the change touches, the files its plan names to touch among them before
 * any is written, and the request's words, so the run's own record owes
 * domain-and-types and tdd whole at build, and the done door holds both.
 */

const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
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

const ID = "2026-11-08-settings-theme";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The run's record at its build, its plan as the agent wrote it (j196c-roster-use, 001/002), no file written yet. */
function settingsRecord(plan: readonly string[]): string {
  return [
    "---",
    "mode: regular",
    "choice: owner",
    'why: "The owner wants a settings page with a theme switch that follows the system, can be changed, and keeps the choice."',
    "state: open",
    'next: "build: write the theme logic test first"',
    "ground: branch",
    'agent: "claude-code/claude-sonnet-5-5"',
    'interface: "yes, app"',
    "---",
    "",
    "## frame",
    "",
    "Read first: `DESIGN.md`, `src/app/layout.tsx`, `src/lib/members.js` and `test/members.test.js`.",
    "",
    "## plan",
    "",
    ...plan,
    "",
    "## build",
    "",
    "none yet",
    "",
  ].join("\n");
}

const RUN_PLAN = [
  "**The shape of the code.** From that, in `src/lib/theme.js`: `parseChoice(raw)`, `resolveTheme(choice, systemIsDark)`, `readChoice(storage)` and `saveChoice(storage, choice)`; the kept choice is the local-storage key `members-desk:theme`.",
  "",
  "1. **Theme logic, test first** (S, `test/theme.test.js`, `src/lib/theme.js`): `tdd`.",
  "2. **The dark tokens in the code** (S, `src/app/globals.css`, `tailwind.config.js`).",
  "3. **The page, its switch and its door** (M, `src/components/theme-switch.tsx`, `src/app/settings/page.tsx`, `src/app/layout.tsx`).",
];

function workspace(record: string, touched: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-owed-build-"));
  roots.push(root);
  mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
  writeFileSync(join(root, ".greenline", "ledger", `${ID}.md`), record);
  if (touched.length > 0) {
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], { cwd: root });
    for (const path of touched) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "touched\n");
    }
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

describe("J-200 S1 the owed habits at a regular build, read from the trigger rows (j196c-roster-use)", () => {
  it("owes domain-and-types and tdd whole at build for the settings page's plan, before any file is written", () => {
    const owed = proposalLines(input(workspace(settingsRecord(RUN_PLAN)))).owed ?? "";
    expect(owed).toContain("tdd (whole:");
    expect(owed).toContain("domain-and-types (whole:");
  });

  it("holds the done door to both once the test file is touched, and to tdd only then (J-225 S1)", () => {
    const touched = owedAtDone(
      input(workspace(settingsRecord(RUN_PLAN), ["test/theme.test.js"])),
    ).map((entry) => entry.skill);
    expect(touched).toEqual(expect.arrayContaining(["domain-and-types", "tdd"]));
    // The door reads the touched files alone: a planned test never written owes no tdd there.
    const planned = owedAtDone(input(workspace(settingsRecord(RUN_PLAN)))).map(
      (entry) => entry.skill,
    );
    expect(planned).toContain("domain-and-types");
    expect(planned).not.toContain("tdd");
  });

  it("owes domain-and-types whole from J-178 S1's request words alone with no schema file, and only at a regular or careful build", () => {
    const triggers = installation.triggers;
    if (triggers === undefined) throw new Error("no triggers");
    const read = (mode: string, step: string, words: string): string | undefined =>
      owedSkills(triggers, {
        words,
        classes: new Set(["page"] as const),
        steps: new Set([step]),
        mode,
      }).find((entry) => entry.skill === "domain-and-types")?.read;
    const request = "Add a settings page with a theme switch, and keep the choice.";
    expect(read("regular", "build", request)).toBe("whole");
    expect(read("careful", "build", request)).toBe("whole");
    expect(read("regular", "plan", request)).toBeUndefined();
    expect(read("quick", "build", request)).toBeUndefined();
    // A stray word J-189 left owing a front still owes a front, and a plain request owes nothing.
    expect(read("regular", "build", "Show the loans with their statuses.")).toBe("part");
    expect(read("regular", "build", "Store the saved list in a new page.")).toBeUndefined();
  });

  it("owes nothing for a file the frame only read: a test the plan never names owes no tdd", () => {
    const plan = ["1. **The copy** (S, `src/app/settings/copy.txt`): the page's words."];
    const owed = owedAtDone(input(workspace(settingsRecord(plan)))).map((entry) => entry.skill);
    expect(owed).not.toContain("tdd");
  });
});
