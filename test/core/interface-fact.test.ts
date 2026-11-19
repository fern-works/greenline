import { describe, expect, it } from "vitest";
import {
  declaredComponents,
  interfaceFactText,
  interfaceLine,
  parseInterfaceFact,
} from "../../src/core/interface-fact.ts";
import { facetsMatch } from "../../src/core/interface-facets.ts";

/**
 * The interface fact the proposal states (J-123 S1): `no`, or `yes` with the
 * register; the components the design section declares; the mirror's line
 * with the facets in play.
 */

describe("J-123 S1 the interface fact", () => {
  it("reads no, yes and yes with its registers, and refuses any other form", () => {
    expect(parseInterfaceFact("no")).toEqual({ touches: false });
    expect(parseInterfaceFact("yes")).toEqual({ touches: true, registers: [] });
    expect(parseInterfaceFact("yes, app")).toEqual({ touches: true, registers: ["app"] });
    expect(parseInterfaceFact("yes, site and app")).toEqual({
      touches: true,
      registers: ["site", "app"],
    });
    for (const refused of ["No", "yes app", "yes, mobile", "maybe", "yes,"])
      expect([refused, parseInterfaceFact(refused)]).toEqual([refused, undefined]);
    expect(interfaceFactText({ touches: true, registers: ["site", "app"] })).toBe("yes, site, app");
    expect(interfaceFactText({ touches: false })).toBe("no");
  });

  it("reads the components a design section declares, leaving a name off the list out", () => {
    expect(declaredComponents("Lock read.\ncomponents: table, form and toast, widget\n")).toEqual([
      "table",
      "form",
      "toast",
    ]);
    expect(declaredComponents("none, no interface")).toEqual([]);
  });

  it("prints the mirror's line with the facets in play, the fact as stated, or the nudge", () => {
    const facets = {
      platform: "web" as const,
      frameworks: ["next", "react", "tailwind"] as const,
      rulingRegisters: ["app"] as const,
      components: ["table", "form"] as const,
    };
    expect(interfaceLine({ ...facets, stated: "yes" })).toBe(
      "interface: yes; facets: app · web · next · react · tailwind; this change: table, form",
    );
    expect(interfaceLine({ ...facets, stated: "yes, site", components: [] })).toBe(
      "interface: yes; facets: site · web · next · react · tailwind",
    );
    expect(interfaceLine({ ...facets, stated: "no" })).toBe("interface: no");
    expect(interfaceLine({ ...facets, stated: undefined })).toBe(
      'interface: not stated; the proposal states it in the record, interface: no or interface: "yes, <register>"',
    );
  });

  it("selects a unit by the facets in play, an empty facet applying to every value", () => {
    const unit = {
      register: [],
      platform: ["ios", "cross"] as const,
      framework: [],
      concern: ["layout"] as const,
      component: [],
    };
    expect(facetsMatch(unit, { platform: "cross" })).toBe(true);
    expect(facetsMatch(unit, { platform: "web" })).toBe(false);
    expect(facetsMatch(unit, {})).toBe(true);
    const table = { ...unit, platform: [], component: ["table"] as const };
    expect(facetsMatch(table, { components: ["form"] })).toBe(false);
    expect(facetsMatch(table, { components: ["table", "form"] })).toBe(true);
  });
});
