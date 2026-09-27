/** The name-boundary row (J-4, 2026-09-14): the workshop's agent is named in no product file. */
import { describe, expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (the gate-outcome precedent)
import { nameLeaks, scannedFile } from "../../scripts/lib/name-boundary.mjs";

describe("nameLeaks", () => {
  it("accepts product files that never name the workshop's agent", () => {
    const pages = [
      { file: "corpus/runtime/agent.md", text: "You are the active greenline agent.\n" },
      { file: "src/cli.ts", text: 'const site = "https://fernworks.dev";\n' },
    ];
    expect(nameLeaks(pages)).toEqual([]);
  });
  it("refuses a page that names the Fernworks agent, with its line", () => {
    const pages = [
      {
        file: "corpus/skills/x/SKILL.md",
        text: "# X\n\nAsk the Fernworks agent for the ruling.\n",
      },
    ];
    expect(nameLeaks(pages)).toEqual([
      'corpus/skills/x/SKILL.md:3: names the workshop\'s agent or its role ("Fernworks agent"), a name no product file carries',
    ]);
  });
  it("refuses the overseer's role name and keeps a package's or a later maintainer", () => {
    expect(
      nameLeaks([
        {
          file: "corpus/x.md",
          text: "the overseer verifies\na later maintainer re-evaluates\nthe package maintainer\n",
        },
      ]).map((p: string) => p.split(":")[1]),
    ).toEqual(["1"]);
  });
  it("matches the name in any case and across spaces on the line", () => {
    const pages = [{ file: "src/a.ts", text: "// FERNWORKS   AGENT\n" }];
    expect(nameLeaks(pages)).toHaveLength(1);
  });
  it("reports one problem per line that carries the name", () => {
    const pages = [
      { file: "src/b.ts", text: "fernworks agent\nfine\nthe Fernworks agent again\n" },
    ];
    expect(nameLeaks(pages).map((p: string) => p.split(":")[1])).toEqual(["1", "3"]);
  });
});

describe("scannedFile", () => {
  it("scans every text format the product carries, shell, Python and TSX included", () => {
    for (const f of [
      "corpus/skills/x/scripts/loop.sh",
      "corpus/skills/x/references/check.py",
      "corpus/skills/x/assets/Panel.tsx",
      "corpus/runtime/agent.md",
      "src/cli.ts",
    ]) {
      expect(scannedFile(f)).toBe(true);
    }
  });
  it("skips binary files by their extension", () => {
    for (const f of ["corpus/skills/x/assets/logo.png", "src/fonts/a.woff2", "corpus/x.pdf"]) {
      expect(scannedFile(f)).toBe(false);
    }
  });
  it("skips the frozen outside bytes under corpus/upstream/", () => {
    expect(scannedFile("corpus/upstream/pstack/abc/skills/unslop/SKILL.md")).toBe(false);
  });
});
