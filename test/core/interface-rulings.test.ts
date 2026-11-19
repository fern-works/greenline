import { describe, expect, it } from "vitest";
import {
  parseInterfaceRulings,
  registerOf,
  renderInterfaceRulings,
  withInterfaceRulings,
  type InterfaceRulings,
} from "../../src/core/interface-rulings.ts";

/**
 * The `## Interface` section of the decisions book (J-123 S1): the register
 * per root, the platform, the anti-references, the direction's pin, the
 * shell, the standing waivers and the bar, read and written as dash lines.
 */

const RULINGS: InterfaceRulings = {
  registers: [
    { root: "apps/console", register: "app" },
    { root: "apps/site", register: "site" },
  ],
  platform: "web",
  antiReferences: ["no glass panels over data"],
  direction: { entry: "graphite-night", catalog: "0.2.0", date: "2026-10-25" },
  shell: "sidebar with a top bar",
  waivers: [{ rule: "style-default-face", reason: "the brand's face is Inter, ruled 2026-10-25" }],
  bar: "every screen holds the floor at 390",
};

describe("J-123 S1 the interface rulings in the decisions book", () => {
  it("writes the section and reads it back whole", () => {
    const section = renderInterfaceRulings(RULINGS);
    expect(section).toBe(
      [
        "## Interface",
        "",
        "- register: app at apps/console",
        "- register: site at apps/site",
        "- platform: web",
        "- anti-reference: no glass panels over data",
        "- direction: graphite-night, catalog 0.2.0, 2026-10-25",
        "- shell: sidebar with a top bar",
        "- waiver: style-default-face: the brand's face is Inter, ruled 2026-10-25",
        "- bar: every screen holds the floor at 390",
        "",
      ].join("\n"),
    );
    expect(parseInterfaceRulings(`# Decisions\n\n${section}`)).toEqual({
      present: true,
      rulings: RULINGS,
      issues: [],
    });
  });

  it("replaces the section in a book and keeps every other byte, or appends it where none stands", () => {
    const book =
      "# Decisions\n\nWe ship on Fridays.\n\n## Interface\n\n- platform: ios\n\n## Data\n\nPostgres.\n";
    const next = withInterfaceRulings(book, RULINGS);
    expect(next.startsWith("# Decisions\n\nWe ship on Fridays.\n\n## Interface\n")).toBe(true);
    expect(
      next.endsWith("- bar: every screen holds the floor at 390\n\n## Data\n\nPostgres.\n"),
    ).toBe(true);
    expect(withInterfaceRulings("# Decisions\n", { ...RULINGS, waivers: [] })).toContain(
      "# Decisions\n\n## Interface\n\n- register: app",
    );
  });

  it("names a line that is no ruling, and reads a book with no section as none", () => {
    const reading = parseInterfaceRulings("## Interface\n\n- platform: watch\n- mood: calm\n");
    expect(reading.issues.map((issue) => issue.line)).toEqual(["platform: watch", "mood: calm"]);
    expect(parseInterfaceRulings("# Decisions\n").present).toBe(false);
  });

  it("gives a path the register of the nearest root that holds it", () => {
    expect(registerOf(RULINGS, "apps/site/pricing.tsx")).toBe("site");
    expect(registerOf(RULINGS, "apps/console/table.tsx")).toBe("app");
    expect(registerOf(RULINGS, "packages/ui/x.tsx")).toBeUndefined();
  });
});
