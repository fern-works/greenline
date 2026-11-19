import { describe, expect, it } from "vitest";
import { loadsOf, shellSightings, type LoadsReader } from "../../src/core/skill-loads.ts";

/**
 * A skill read is one fact per call, skill and file (J-225 S1, part B): a
 * shell read that names one page on both sides of an alternative is one
 * fact whichever side ran, the rule reading no exit code (j217c-roster-use,
 * the reviewer's `cat ... || cat ...` at 002/004, two facts in the
 * session's file), and a brace list is read as each of its files
 * (j217t-conduct-runner finding 5, the reviewer's four references pages in
 * one `cat`, none noted).
 */

const SANDBOX = "/runs/j217c-roster-use/enclosure/sandbox";
const PAGES: ReadonlyMap<string, number> = new Map([
  [".claude/skills/review/SKILL.md", 40],
  [".claude/skills/review/references/brief.md", 30],
  [".agents/skills/review/references/brief.md", 30],
  [".agents/skills/review/references/greenline.md", 20],
  [".agents/skills/review/references/lens.md", 25],
  [".agents/skills/review/references/REGISTER.md", 15],
  [".agents/skills/review/references/excess.md", 10],
]);
const reader: LoadsReader = {
  fromRoot: (path) => (path.startsWith(`${SANDBOX}/`) ? path.slice(SANDBOX.length + 1) : undefined),
  installed: (path) => PAGES.has(path),
  lines: (path) => PAGES.get(path),
};

describe("J-225 S1 B1 a read is one fact per call, skill and file", () => {
  it("notes the run's alternative of one page under two roots once, whole (j217c-roster-use)", () => {
    const command =
      "cat .claude/skills/review/references/brief.md 2>/dev/null || cat .agents/skills/review/references/brief.md";
    expect(loadsOf(shellSightings(command, SANDBOX), reader)).toEqual([
      { skill: "review", file: "references/brief.md", whole: true, via: "cat" },
    ]);
  });

  it("keeps a part and a whole read of one page in one call as one whole fact, and two pages two facts", () => {
    const command =
      "sed -n '1,5p' .agents/skills/review/references/lens.md; cat .agents/skills/review/references/lens.md";
    expect(loadsOf(shellSightings(command, SANDBOX), reader)).toEqual([
      { skill: "review", file: "references/lens.md", whole: true, via: "cat" },
    ]);
    const two = loadsOf(
      shellSightings(
        "cat .agents/skills/review/references/lens.md .agents/skills/review/references/excess.md",
        SANDBOX,
      ),
      reader,
    );
    expect(two.map((load) => load.file)).toEqual(["references/lens.md", "references/excess.md"]);
  });
});

describe("J-225 S1 B1 a brace list is read as each of its files (j217t-conduct-runner finding 5)", () => {
  it("notes the reviewer's four references pages of one cat, each read with another page", () => {
    const command =
      "cat .agents/skills/review/references/{greenline.md,lens.md,REGISTER.md,excess.md}";
    const seen = loadsOf(shellSightings(command, SANDBOX), reader);
    expect(seen.map((load) => load.file)).toEqual([
      "references/greenline.md",
      "references/lens.md",
      "references/REGISTER.md",
      "references/excess.md",
    ]);
    expect(seen.every((load) => !load.whole && load.cause === "together")).toBe(true);
  });

  it("expands a list beside a variable and in the middle of a path, and leaves a lone brace word as it stands", () => {
    const seen = loadsOf(
      shellSightings(
        "D=.agents/skills/review; cat $D/{SKILL.md,references/brief.md}",
        SANDBOX,
      ).filter((sighting) => sighting.kind === "path"),
      { ...reader, installed: (path) => path.startsWith(".agents/") && PAGES.has(path) },
    );
    expect(seen.map((load) => load.file)).toEqual(["references/brief.md"]);
    expect(
      loadsOf(shellSightings("cat .agents/skills/review/references/{lens.md}", SANDBOX), reader),
    ).toEqual([]);
  });
});
