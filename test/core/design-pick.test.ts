import { describe, expect, it } from "vitest";
import { designPickLine, parseDesignPick, type DesignPick } from "../../src/core/design-pick.ts";

/**
 * The deal view's pick (J-123 S7): its file reads under its schema, and the
 * mirror prints it until the design section names every entry it picked.
 */

const PICK: DesignPick = {
  generatedBy: "greenline inspect",
  change: "2026-10-25-pricing-table",
  direction: 2,
  name: "hairline-flat with split-hero-three-column",
  entries: ["hairline-flat", "split-hero-three-column"],
  catalog: "4230c655b9ed",
  seed: 9,
  reroll: false,
  job: "sign-up",
  at: "2026-10-25T14:00:00.000Z",
};

describe("the pick", () => {
  it("reads under its schema and refuses another writer or a direction past three", () => {
    expect(parseDesignPick(JSON.stringify(PICK))).toEqual(PICK);
    expect(parseDesignPick(JSON.stringify({ ...PICK, generatedBy: "an agent" }))).toBeUndefined();
    expect(parseDesignPick(JSON.stringify({ ...PICK, direction: 4 }))).toBeUndefined();
  });

  it("is printed until the design section names its entries", () => {
    expect(designPickLine(PICK, undefined)).toBe(
      "design pick: direction 2, hairline-flat with split-hero-three-column (hairline-flat, split-hero-three-column, catalog 4230c655b9ed), picked in the viewer; write it into the design section and the lock",
    );
    expect(designPickLine(PICK, "components: pricing\nthe pick: hairline-flat")).toBeDefined();
    expect(
      designPickLine(PICK, "the pick: hairline-flat with split-hero-three-column"),
    ).toBeUndefined();
  });
});
