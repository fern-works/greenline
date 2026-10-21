/** The comparison sheet (`src/corpus/intake.ts`, `intake` in `src/corpus/instrument.ts`): a candidate in a source's snapshot beside a roster skill, in the four sorts, with the stub trigger's count and the projected retention; it writes nothing. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJson } from "../../src/core/contract.ts";
import { intakeVerb } from "../../src/corpus/instrument.ts";
import { segmentProse } from "../../src/corpus/segments.ts";
import { writeFixtureCorpus, writeTree } from "../fixtures/corpus-disk.ts";
import { COMMIT, NOTES_IDS, RENDERED_SKILL, SKILL_IDS, SOURCE } from "../fixtures/recipe.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A candidate skill beside the fixture skill: two segments the same, one sentence in conflict, one its own. */
const RIVAL = `---
name: rival
description: A rival skill the intake compares.
---

# Fixture method

Read the request before you touch the code, and say back what you heard in one sentence. Ask which behavior matters most before you start.

- Delete a test that cannot fail for a reason you can name.
`;

const RIVAL_IDS = segmentProse(RIVAL).segments.map((segment) => segment.id);
const rendered = segmentProse(RENDERED_SKILL).segments;

/** The fixture corpus with the rival skill in the fixture source's snapshot. */
function corpusWithRival(): string {
  const corpus = mkdtempSync(join(tmpdir(), "greenline-intake-"));
  made.push(corpus);
  writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
  writeTree(corpus, new Map([[`upstream/${SOURCE}/${COMMIT}/rival/SKILL.md`, RIVAL]]));
  return corpus;
}

describe("intake", () => {
  it("sorts the candidate and the roster skill into the four sorts, quoting both sides of a conflict", () => {
    const outcome = intakeVerb(corpusWithRival(), SOURCE, "rival", ["fixture-skill"]);
    expect(outcome.failed).toBe(false);
    const [comparison] = outcome.output.comparisons;
    expect(comparison?.agree).toEqual([
      {
        file: "SKILL.md",
        segment: RIVAL_IDS[0],
        there: { file: "SKILL.md", segment: SKILL_IDS[0] },
      },
      {
        file: "SKILL.md",
        segment: RIVAL_IDS[3],
        there: { file: "SKILL.md", segment: SKILL_IDS[6] },
      },
    ]);
    expect(comparison?.conflict).toEqual([
      {
        here: {
          file: "SKILL.md",
          segment: SKILL_IDS[1],
          text: "Read the request before you touch the code, and say back what you heard in one sentence.",
        },
        there: {
          file: "SKILL.md",
          segment: rendered[1]?.id,
          text: "Read the request before you touch the code, and restate what you heard in one sentence.",
        },
      },
    ]);
    expect(comparison?.onlyHere).toEqual([
      {
        file: "SKILL.md",
        segment: RIVAL_IDS[2],
        text: "Ask which behavior matters most before you start.",
      },
    ]);
    expect(comparison?.onlyThere.map((segment) => [segment.file, segment.segment])).toEqual([
      ...rendered
        .filter((_, index) => ![0, 1, 7].includes(index))
        .map((segment) => ["SKILL.md", segment.id]),
      ...NOTES_IDS.map((id) => ["notes.md", id]),
    ]);
  });

  it("counts the candidate's body against the stub trigger and projects the retention per source", () => {
    const { output } = intakeVerb(corpusWithRival(), SOURCE, "rival", ["fixture-skill"]);
    expect(output.stub).toEqual({ words: 39, trigger: 100, underTrigger: true });
    expect(output.retention?.candidate).toEqual({
      source: SOURCE,
      segments: 4,
      taken: 4,
      exact: 4,
      retention: 1,
      coverage: 1,
      meetsMinimum: true,
      creditLine: false,
    });
    expect(output.retention?.against).toEqual([
      {
        skill: "fixture-skill",
        sources: [
          {
            source: SOURCE,
            duplicates: 2,
            measured: {
              source: SOURCE,
              segments: 12,
              taken: 11,
              exact: 10,
              retention: 10 / 11,
              coverage: 11 / 12,
              meetsMinimum: true,
              creditLine: false,
            },
            projected: {
              source: SOURCE,
              segments: 12,
              taken: 9,
              exact: 8,
              retention: 8 / 9,
              coverage: 9 / 12,
              meetsMinimum: false,
              creditLine: false,
            },
          },
        ],
      },
    ]);
  });

  it("with no roster skill named prints the candidate's segments and its word count", () => {
    const { output, failed } = intakeVerb(corpusWithRival(), SOURCE, "rival", []);
    expect(failed).toBe(false);
    expect(output.comparisons).toEqual([]);
    expect(output.segments.map((segment) => segment.segment)).toEqual(RIVAL_IDS);
    expect(output.stub?.words).toBe(39);
  });

  it("refuses a directory the snapshot does not hold and a roster skill with no recipe", () => {
    const corpus = corpusWithRival();
    expect(intakeVerb(corpus, SOURCE, "absent", []).output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message: `the snapshot of '${SOURCE}' holds no skill directory 'absent' with a SKILL.md`,
          },
        ],
      },
    ]);
    expect(intakeVerb(corpus, SOURCE, "rival", ["no-such-skill"]).output.refused).toEqual([
      {
        skill: "no-such-skill",
        issues: [{ message: "no recipe 'corpus/recipes/no-such-skill.json' for 'no-such-skill'" }],
      },
    ]);
  });
});

describe("R4: intake --slot", () => {
  it("compares the candidate with exactly the slot's stack, the roster skills on that row", () => {
    const outcome = intakeVerb(corpusWithRival(), SOURCE, "rival", [], "check");
    expect(outcome.failed).toBe(false);
    expect(outcome.output.slot).toEqual({ name: "check", stack: ["fixture-skill"] });
    expect(outcome.output.comparisons.map((comparison) => comparison.against)).toEqual([
      "fixture-skill",
    ]);
    expect(outcome.output.segments).toEqual([]);
  });

  it("prints the candidate's segments for an empty slot, and keeps the skills --against names", () => {
    const empty = intakeVerb(corpusWithRival(), SOURCE, "rival", [], "outline");
    expect(empty.output.slot).toEqual({ name: "outline", stack: [] });
    expect(empty.output.comparisons).toEqual([]);
    expect(empty.output.segments.map((segment) => segment.segment)).toEqual(RIVAL_IDS);
    const named = intakeVerb(corpusWithRival(), SOURCE, "rival", ["fixture-skill"], "outline");
    expect(named.output.comparisons.map((comparison) => comparison.against)).toEqual([
      "fixture-skill",
    ]);
  });

  it("refuses a slot that is not on the line, and a step skill named in place of its slot", () => {
    const corpus = corpusWithRival();
    expect(intakeVerb(corpus, SOURCE, "rival", [], "review").output.refused).toEqual([
      { skill: "*", issues: [{ message: "the slot 'review' is not on the line" }] },
    ]);
    expect(intakeVerb(corpus, SOURCE, "rival", [], "fixture-skill").output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message:
              "'fixture-skill' is a step skill on the slot 'check'; --slot names the slot, 'check'",
          },
        ],
      },
    ]);
  });
});

describe("R5: intake --slot with a second kind on the line", () => {
  it("takes the stack from every kind's row at the step, so a gate the definition declares joins it", () => {
    const corpus = corpusWithRival();
    const modesPath = join(corpus, "runtime/modes.json");
    // SAFETY: the fixture's modes definition, written by the fixture, declares its kinds as an array.
    const modes = JSON.parse(readFileSync(modesPath, "utf8")) as { kinds: object[] };
    modes.kinds.push({
      name: "gate",
      mechanism: "reach",
      record: "line",
      place: "ordered",
      budget: "free",
      when: "A fixture gate holds the change where the mode reaches it until its check passes.",
    });
    writeFileSync(modesPath, `${JSON.stringify(modes, null, 2)}\n`);
    const manifestPath = join(corpus, "manifest.json");
    // SAFETY: the fixture's manifest, written by the fixture, holds a skills array of named kinds.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      skills: { name: string; kind: string; slot?: string }[];
    };
    manifest.skills.push({ name: "gate-skill", kind: "gate", slot: "check" });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const outcome = intakeVerb(corpus, SOURCE, "rival", [], "check");
    expect(outcome.output.slot).toEqual({ name: "check", stack: ["fixture-skill", "gate-skill"] });
  });
});

describe("scripts/corpus.mjs intake in this tree", () => {
  it("R4: compares a candidate with the stack of a slot named by --slot", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/corpus.mjs", "intake", "pstack", "principle-boundary-discipline", "--slot", "plan"],
      { cwd: repository, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    // SAFETY: the report printed by the verb under test; the assertions read its slot and comparisons.
    const output = parseJson(result.stdout) as {
      slot: { name: string; stack: string[] };
      comparisons: { against: string }[];
    };
    expect(output.slot).toEqual({ name: "plan", stack: ["plan"] });
    expect(output.comparisons.map((comparison) => comparison.against)).toEqual(["plan"]);
  });

  it("S18a finds a merged habit in agreement with its grafted source, only the source's title left out", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/corpus.mjs",
        "intake",
        "pstack",
        "principle-boundary-discipline",
        "--against",
        "boundaries",
      ],
      { cwd: repository, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    // SAFETY: the report printed by the verb under test; the assertions read its first comparison.
    const output = parseJson(result.stdout) as {
      comparisons: {
        agree: unknown[];
        conflict: unknown[];
        onlyHere: { text: string }[];
        onlyThere: unknown[];
      }[];
    };
    const [comparison] = output.comparisons;
    expect(comparison?.agree.length).toBeGreaterThan(0);
    expect(comparison?.agree).toHaveLength(29);
    expect(comparison?.conflict).toEqual([]);
    expect(comparison?.onlyHere.map((part) => part.text)).toEqual(["# Boundary Discipline"]);
  });
});
