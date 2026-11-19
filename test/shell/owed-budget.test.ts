import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GARDEN_COMMAND } from "../../src/core/connectors/garden.ts";
import {
  FILE_CLASSES,
  owedLine,
  owedSkills,
  type OwedSkill,
  type Triggers,
} from "../../src/core/habits-owed.ts";
import type { Installation } from "../../src/core/installation.ts";
import {
  HOOKS_ON,
  MANIFEST_SCHEMA_VERSION,
  NO_PROCEED,
  trialSkillNames,
  type Manifest,
} from "../../src/core/manifest.ts";
import { installedSkills } from "../../src/core/render.ts";
import { readingBudget } from "../../src/shell/habits-owed.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

/**
 * The owed line's worst case at each mode (J-178 S1;
 * workshop/components/modes.md, "The owed reads by mode"): every row's
 * words said, every class of file touched and every step the mode runs, in
 * the widest workspace, every extra included, every trial enabled and
 * garden on. The rows loosen by mode, so a mode owes every skill a lighter
 * mode owes, never by a lighter read; and the line prints within the mode's
 * reading budget, J-176 S1's room under the words ceiling, the first owed
 * skill always and the rest counted past it.
 */

const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
if (compiled._tag !== "ok") throw new Error("the corpus does not compile");
const installation: Installation = compiled.value;
const triggers: Triggers = installation.triggers ?? { schema: "greenline.triggers/v1", skills: [] };

const BASE: Manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  targets: ["codex", "claude-code"],
  skills: { exclude: [], include: [] },
  connectors: {},
  proceed: NO_PROCEED,
  trials: [],
  checks: [],
  hooks: HOOKS_ON,
};

const WIDEST: Manifest = {
  ...BASE,
  skills: {
    exclude: [],
    include: installation.skills.filter((skill) => skill.extra === true).map((skill) => skill.name),
  },
  connectors: { garden: { endpoint: "https://garden.invalid/", executable: GARDEN_COMMAND } },
  trials: [...trialSkillNames(installation.modes, installation.skills)],
};

const everyWord = triggers.skills
  .flatMap((skill) => skill.rows.flatMap((row) => row.words ?? []))
  .join(". ");

const MODES = installation.modes.modes.map((mode) => mode.name);

function stepsOf(name: string): ReadonlySet<string> {
  const mode = installation.modes.modes.find((each) => each.name === name);
  return new Set(
    installation.modes.steps
      .filter((step) => (mode?.steps[step.name]?.depth ?? "none") !== "none")
      .map((step) => step.name),
  );
}

function worstCase(mode: string, manifest: Manifest = WIDEST): readonly OwedSkill[] {
  return owedSkills(triggers, {
    words: everyWord,
    classes: new Set(FILE_CLASSES),
    steps: stepsOf(mode),
    mode,
    installed: new Set(installedSkills(manifest, installation).map((skill) => skill.name)),
  });
}

describe("J-178 S1 the owed line's worst case, by mode", () => {
  it("owes at each mode every skill a lighter mode owes, never by a lighter read", () => {
    const rank = { part: 0, whole: 1 } as const;
    for (const [lighter, heavier] of [
      ["quick", "regular"],
      ["regular", "careful"],
    ] as const) {
      const light = worstCase(lighter);
      const heavy = new Map(worstCase(heavier).map((entry) => [entry.skill, entry]));
      for (const entry of light) {
        const there = heavy.get(entry.skill);
        expect(there, `${heavier} owes ${entry.skill}`).toBeDefined();
        expect(rank[there?.read ?? "part"]).toBeGreaterThanOrEqual(rank[entry.read]);
      }
      expect(heavy.size).toBeGreaterThanOrEqual(light.length);
    }
  });

  it("owes at quick each habit a file class owes, by its front, a secret apart", () => {
    const quick = worstCase("quick");
    const byFiles = triggers.skills.filter(
      (skill) =>
        skill.kind === "habit" &&
        skill.rows.some((row) => row.files !== undefined && row.modes === undefined),
    );
    for (const skill of byFiles)
      expect(quick.some((entry) => entry.skill === skill.name)).toBe(true);
    const fileOnly = owedSkills(triggers, {
      words: "",
      classes: new Set(FILE_CLASSES),
      steps: stepsOf("quick"),
      mode: "quick",
    });
    // A secret in reach is read whole at every mode, the floor its habit holds.
    for (const entry of fileOnly.filter((each) => each.kind === "habit"))
      if (entry.skill !== "secrets" && entry.skill !== "interface-catalog")
        expect(`${entry.skill} ${entry.read}`).toBe(`${entry.skill} part`);
  });

  it("prints within the mode's reading budget, the first always and the rest counted", () => {
    for (const mode of MODES) {
      const owed = worstCase(mode);
      const budget = readingBudget(installation, BASE, mode);
      const headroom = budget.headroom ?? 0;
      expect(headroom, `${mode}'s room`).toBeGreaterThanOrEqual(0);
      const line = owedLine(owed, new Set(), budget) ?? "";
      const printed = owed.filter((entry) => line.includes(`${entry.skill} (`));
      const past = printed
        .slice(1)
        .reduce((sum, entry) => sum + budget.cost(entry.skill, entry.read), 0);
      expect(past, `${mode}: the reads printed after the first`).toBeLessThanOrEqual(headroom);
      expect(printed[0]?.skill).toBe(owed[0]?.skill);
      const rest = owed.length - printed.length;
      if (rest > 0)
        expect(line).toContain(`and ${String(rest)} more past the mode's reading budget`);
    }
  });

  it("J-180 S1 names more than the first owed skill at each mode, every front under 300 words", () => {
    // Before J-180 S1 the room was 353 words at each mode, less than any
    // habit's front, so the line named one owed skill and counted the rest.
    for (const mode of MODES) {
      const owed = worstCase(mode);
      const budget = readingBudget(installation, BASE, mode);
      expect(budget.headroom ?? 0, `${mode}'s room`).toBeGreaterThan(7000);
      for (const entry of owed)
        if (entry.read === "part")
          expect(budget.cost(entry.skill, "part"), entry.skill).toBeLessThan(300);
      const line = owedLine(owed, new Set(), budget) ?? "";
      const printed = owed.filter((entry) => line.includes(`${entry.skill} (`));
      expect(printed.length, `${mode}: the owed skills named`).toBeGreaterThan(1);
    }
  });

  it("owes nothing of a skill the workspace did not install", () => {
    const initialized = new Set(worstCase("careful", BASE).map((entry) => entry.skill));
    for (const name of trialSkillNames(installation.modes, installation.skills))
      expect(initialized.has(name), name).toBe(false);
    expect(initialized.has("use-garden")).toBe(false);
    expect(initialized.has("interface-catalog")).toBe(false);
  });
});

describe("J-178 S1 the roster-use cases", () => {
  const settingsPage = (mode: string, step: string): readonly string[] =>
    owedSkills(triggers, {
      words: "Add a settings page with a theme switch, and keep the choice.",
      classes: new Set(["page", "schema", "test"] as const),
      steps: new Set([step]),
      mode,
      installed: new Set(installedSkills(WIDEST, installation).map((skill) => skill.name)),
    }).map((entry) => `${entry.skill} ${entry.read}`);

  it("a settings page at regular owes the catalog's front, domain-and-types and tdd whole at build", () => {
    expect(settingsPage("regular", "build")).toEqual(
      expect.arrayContaining(["domain-and-types whole", "tdd whole", "interface-catalog part"]),
    );
    expect(settingsPage("regular", "build").some((entry) => entry.startsWith("anatomy"))).toBe(
      false,
    );
    expect(settingsPage("quick", "build")).toEqual(
      expect.arrayContaining(["domain-and-types part", "tdd part", "interface-catalog part"]),
    );
  });

  it("careful owes show-me's front at verify, where regular owes it nothing", () => {
    expect(settingsPage("careful", "verify")).toContain("show-me part");
    expect(settingsPage("regular", "verify").some((entry) => entry.startsWith("show-me"))).toBe(
      false,
    );
  });
});
