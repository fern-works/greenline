import { describe, expect, it } from "vitest";
import { designDrift, designDriftLine, usedValues } from "../../src/core/design-drift.ts";
import { parseDesign, type DesignDocument } from "../../src/core/design-file.ts";

/**
 * DESIGN.md's drift (J-123 S1): the values the code under the roots uses
 * that the home does not name, within the registry's tolerances, and the
 * tokens the code no longer uses.
 */

const HOME = `---
name: Drift fixture
colors:
  ink: "#1c1c1a"
  accent: "#dc2626"
  unused-wash: "#e0f2fe"
typography:
  body:
    fontFamily: "Source Serif 4, serif"
    fontSize: 16px
rounded:
  md: 8px
  lg: 12px
spacing:
  sm: 8px
  md: 1rem
---
`;

function home(): DesignDocument {
  const parsed = parseDesign(HOME, "DESIGN.md");
  if (parsed._tag === "err") throw new Error("fixture");
  return parsed.value;
}

describe("J-123 S1 the drift between the code and DESIGN.md", () => {
  it("reads the colours, faces, radii, spacing and sizes a stylesheet and a component use, with their lines", () => {
    const css = ".card {\n  color: #e11;\n  border-radius: 10px;\n  padding: 8px 15px;\n}\n";
    expect(usedValues("src/a.css", css)).toEqual([
      { kind: "colour", value: "#e11", path: "src/a.css", line: 2 },
      { kind: "radius", value: "10px", path: "src/a.css", line: 3 },
      { kind: "spacing", value: "8px", path: "src/a.css", line: 4 },
      { kind: "spacing", value: "15px", path: "src/a.css", line: 4 },
    ]);
    const tsx = `<p className="text-[15px] rounded-[12px] p-[16px]" style={{ fontFamily: "Inter" }} />`;
    expect(usedValues("src/A.tsx", tsx).map((value) => [value.kind, value.value])).toEqual([
      ["font", "Inter"],
      ["size", "15px"],
      ["radius", "12px"],
      ["spacing", "16px"],
    ]);
  });

  it("reports each planted value the home does not name, and none the tolerances admit", () => {
    const files = [
      {
        path: "src/a.css",
        text: [
          ".a { color: #1c1c1a; background: #dc2627; }",
          ".b { color: #e11; font-family: 'Inter', sans-serif; }",
          ".c { border-radius: 8.4px; padding: 16px; margin: 13px; font-size: 15px; }",
          ".d { border-radius: 10px; font-family: Source Serif 4; gap: var(--md); }",
        ].join("\n"),
      },
    ];
    const drift = designDrift(home(), files);
    expect(drift.undeclared.map((value) => `${value.kind} ${value.value}`)).toEqual([
      "colour #e11",
      "font Inter",
      "radius 10px",
      "spacing 13px",
      "size 15px",
    ]);
    expect(drift.unused).toEqual([
      { group: "colors", name: "unused-wash" },
      { group: "rounded", name: "lg" },
      { group: "spacing", name: "sm" },
    ]);
    expect(designDriftLine(drift)).toBe(
      "interface drift: 1 colour, 1 face, 1 radius, 1 spacing step, 1 font size the code uses that DESIGN.md does not name; 3 tokens the code no longer uses",
    );
  });

  it("counts a token named in the code as used, and says nothing where the code and the home agree", () => {
    const files = [
      {
        path: "src/a.css",
        text: ".a { color: var(--ink); background: #dc2626; border-color: var(--unused-wash); border-radius: 8px; padding: 8px; }\n.b { border-radius: var(--lg); margin: 1rem; }",
      },
    ];
    const drift = designDrift(home(), files);
    expect(drift).toEqual({ undeclared: [], unused: [] });
    expect(designDriftLine(drift)).toBeUndefined();
  });
});
