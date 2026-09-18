import { describe, expect, it } from "vitest";
import { parseHouseRulings } from "../../src/core/house-rulings.ts";

const block =
  "<!-- greenline:managed begin policy -->\n" +
  "> Owned region.\n\n## House rulings\n\n- never parsed: this sits inside the managed block\n" +
  "<!-- greenline:managed end policy -->\n";

describe("parseHouseRulings (ADR 0028 amendment: the CLI parses one shape)", () => {
  it("lists the dash lines under the House rulings heading in the user region, in order", () => {
    const text =
      "# birdwatch\n\n## House rulings\n\n- Errors are thrown, never returned.\n- No default exports.\n\n" +
      block;
    expect(parseHouseRulings(text)).toEqual([
      "Errors are thrown, never returned.",
      "No default exports.",
    ]);
  });

  it("joins an indented continuation line onto its ruling and stops at the next heading", () => {
    const text =
      "## House rulings\n- Tests live beside the file they test,\n  never in a test tree.\n\n## Working here\n\n- not a ruling\n";
    expect(parseHouseRulings(text)).toEqual([
      "Tests live beside the file they test, never in a test tree.",
    ]);
  });

  it("counts nothing but dash lines: a paragraph under the heading is the user's, not a ruling", () => {
    const text =
      "## House rulings\n\nThe stack is TypeScript only, ruled 2026-09-02.\n\n- One ruling.\n";
    expect(parseHouseRulings(text)).toEqual(["One ruling."]);
  });

  it("returns nothing when the heading is absent or lives only inside the managed block", () => {
    expect(parseHouseRulings("# notes\n\n- a bullet with no heading\n")).toEqual([]);
    expect(parseHouseRulings(block)).toEqual([]);
  });
});
