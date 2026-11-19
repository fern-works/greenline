import { describe, expect, it } from "vitest";
import { parseDesign } from "../../src/core/design-file.ts";
import {
  fidelityOf,
  keptMissing,
  parseKept,
  unionInventory,
  withKeptRoute,
  withPathEntry,
} from "../../src/core/interface-kept.ts";
import type { Inventory } from "../../src/core/interface-render.ts";

/**
 * The kept list and the fidelity read (J-123 S5): the before of a route is
 * written once, the after is checked against it, a loss the owner records
 * is no failure, and a capture's colours are read against the home's palette.
 */

const BEFORE: Inventory = {
  links: ["/pricing Pricing", "/login Log in"],
  fields: ["email email", "password password"],
  actions: ["form /session"],
  handlers: ["onclick save"],
  testHooks: ["login-form"],
  ids: ["login"],
  headings: ["h1 Log in"],
};

describe("the kept list", () => {
  it("writes a route's before once and keeps the list's other routes", () => {
    const first = withKeptRoute(undefined, "/login", BEFORE, "greenline check interface");
    expect(first.addresses.map((route) => route.address)).toEqual(["/login"]);
    const again = withKeptRoute(
      first,
      "/login",
      { ...BEFORE, fields: [] },
      "greenline check interface",
    );
    expect(again).toEqual(first);
    const second = withKeptRoute(first, "/signup", BEFORE, "greenline check interface");
    expect(second.addresses.map((route) => route.address)).toEqual(["/login", "/signup"]);
    const parsed = parseKept(JSON.stringify(second), "kept.json");
    expect(parsed._tag === "ok" ? parsed.value : parsed.error.issues).toEqual(second);
    expect(parseKept(JSON.stringify({ ...second, extra: 1 }), "kept.json")._tag).toBe("err");
  });

  it("catches a removed field, and lets through a loss the owner recorded", () => {
    const list = withKeptRoute(undefined, "/login", BEFORE, "greenline check interface");
    const [route] = list.addresses;
    if (route === undefined) throw new Error("no route");
    const after: Inventory = { ...BEFORE, fields: ["email email"] };
    expect(keptMissing(route, after)).toEqual([{ kind: "fields", entry: "password password" }]);
    const recorded = {
      ...route,
      losses: [
        {
          kind: "fields" as const,
          entry: "password password",
          reason: "the login moves to a magic link",
        },
      ],
    };
    expect(keptMissing(recorded, after)).toEqual([]);
    expect(keptMissing(route, BEFORE)).toEqual([]);
  });

  it("unites the inventories read at several widths", () => {
    const narrow: Inventory = { ...BEFORE, links: ["/menu Menu"] };
    expect(unionInventory([BEFORE, narrow]).links).toEqual([
      "/pricing Pricing",
      "/login Log in",
      "/menu Menu",
    ]);
  });
});

describe("the fidelity read and the path index", () => {
  const design = parseDesign(
    '---\nname: H\ncolors:\n  paper: "#ffffff"\n  ink: "#1c1c1a"\n---\n\n## Overview\n\nH.\n',
    "DESIGN.md",
  );

  it("measures the share of sampled colours the palette names and the most seen it does not", () => {
    if (design._tag === "err") throw new Error("home");
    const samples = new Map([
      ["#ffffff", 80],
      ["#181818", 10],
      ["#e01010", 9],
      ["#0000f0", 1],
    ]);
    expect(fidelityOf(design.value, samples)).toEqual({
      inPalette: 0.9,
      offPalette: ["#e01010", "#0000f0"],
    });
    expect(fidelityOf(undefined, samples)).toBeUndefined();
    expect(fidelityOf(design.value, new Map())).toBeUndefined();
  });

  it("writes one address's entry, replacing its own and keeping the others in order", () => {
    const first = withPathEntry(
      undefined,
      { address: "/", scores: { floor: 1, reflex: 0, finish: 0 } },
      "greenline check interface",
    );
    const second = withPathEntry(first, { address: "/pricing" }, "x");
    const third = withPathEntry(
      second,
      { address: "/", scores: { floor: 0, reflex: 0, finish: 2 } },
      "x",
    );
    expect(third).toEqual({
      generatedBy: "greenline check interface",
      paths: [
        { address: "/", scores: { floor: 0, reflex: 0, finish: 2 } },
        { address: "/pricing" },
      ],
    });
  });

  it("keeps an address's last capture when a later read wrote none", () => {
    const capture = {
      visual: "c1/home",
      widths: [1440, 768, 390],
      commit: "abc",
      at: "2026-10-25T00:00:00Z",
    };
    const first = withPathEntry(undefined, { address: "/", capture }, "x");
    const second = withPathEntry(
      first,
      { address: "/", scores: { floor: 0, reflex: 1, finish: 0 } },
      "x",
    );
    expect(second.paths).toEqual([
      { address: "/", capture, scores: { floor: 0, reflex: 1, finish: 0 } },
    ]);
  });
});
