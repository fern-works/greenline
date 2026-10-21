import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const goldenRoot = join(import.meta.dirname, "..", "goldens", "corpus");
const block = readFileSync(join(goldenRoot, "AGENTS.md"), "utf8");
const guides = [".greenline/WORK.md", ".greenline/ledger/README.md"].map((path) => ({
  path,
  text: readFileSync(join(goldenRoot, path), "utf8"),
}));

/** The ten roster names the merged habits retired at S18a. */
const RETIRED = [
  "codebase-design",
  "model-the-domain",
  "type-system-discipline",
  "boundary-discipline",
  "fail-loud",
  "concurrency-method",
  "airgap-secrets",
  "unslop",
  "technical-writing",
  "answer-plainly",
];

describe("S18a the block's habit table", () => {
  const table = block.slice(block.indexOf("## Habit skills"));
  const rows = (habit: string) =>
    table.split("\n").filter((line) => line.startsWith("| ") && line.endsWith(` | \`${habit}\` |`));

  it("S18a lists the eight habits by situation, one row per situation each covers", () => {
    const counts = {
      tdd: 3,
      ponytail: 4,
      "deep-modules": 3,
      "domain-and-types": 3,
      boundaries: 3,
      concurrency: 3,
      secrets: 3,
      prose: 4,
    };
    for (const [habit, count] of Object.entries(counts))
      expect(rows(habit), habit).toHaveLength(count);
    expect(table).toContain("| Fixing a bug whose cause is known | `tdd` |");
    expect(table).toContain("| The owner says a reply did not land | `prose` |");
    expect(table).toContain("| Comparing alternative interfaces for one module | `deep-modules` |");
  });

  it("S18a names none of the ten retired habits in the block or the installed guides", () => {
    for (const name of RETIRED) {
      expect(block, name).not.toMatch(new RegExp(`(?<![\\w-])${name}(?![\\w-])`));
      for (const { path, text } of guides)
        expect(text, `${path} ${name}`).not.toMatch(new RegExp(`(?<![\\w-])${name}(?![\\w-])`));
    }
  });
});
