import { describe, expect, it } from "vitest";
import {
  dealAddress,
  dealApiPath,
  dealAskQuery,
  dealViewPath,
  namesReroll,
} from "../../src/core/deal-ask.ts";

/**
 * A deal's ask as an address carries it (J-123 S7): the command's fields in
 * the view's address, passed on to the document whole, and nothing else.
 */

describe("the deal's ask in an address", () => {
  it("writes the command's fields in order, leaving out the absent ones", () => {
    expect(
      dealViewPath("2026-10-25-pricing-table", {
        register: "site",
        job: "sign-up",
        tone: "calm and plain",
        material: ["copy", "logo"],
        seed: 42,
      }),
    ).toBe(
      "/changes/2026-10-25-pricing-table/deal?register=site&job=sign-up&tone=calm+and+plain&material=copy%2Clogo&seed=42",
    );
  });

  it("passes the ask on to the document, the reroll beside it, and drops every other key", () => {
    const ask = dealAskQuery("?seed=7&job=book&utm=x&tone=&register=app");
    expect(ask).toBe("register=app&job=book&seed=7");
    expect(dealApiPath("c", ask, true)).toBe(
      "/api/changes/c/deal?register=app&job=book&seed=7&reroll=1",
    );
    expect(dealApiPath("c", "", false)).toBe("/api/changes/c/deal");
  });

  it("J-144 S7 names the reroll in the address the command prints, keeps it on the way and links the first three", () => {
    const rerolled = dealViewPath("c", { register: "site", seed: 7, reroll: true });
    expect(rerolled).toBe("/changes/c/deal?register=site&seed=7&reroll=1");
    expect(dealViewPath("c", { register: "site", seed: 7, reroll: false })).toBe(
      "/changes/c/deal?register=site&seed=7",
    );
    expect(dealAskQuery("?register=site&seed=7&reroll=1")).toBe("register=site&seed=7&reroll=1");
    expect(dealAskQuery("?register=site&seed=7&reroll=0")).toBe("register=site&seed=7");
    expect(namesReroll("register=site&seed=7&reroll=1")).toBe(true);
    expect(namesReroll("register=site&seed=7")).toBe(false);
    expect(dealApiPath("c", "register=site&seed=7&reroll=1", false)).toBe(
      "/api/changes/c/deal?register=site&seed=7&reroll=1",
    );
    expect(dealAddress("c", "register=site&seed=7&reroll=1", false)).toBe(
      "/changes/c/deal?register=site&seed=7",
    );
    expect(dealAddress("c", "register=site&seed=7", true)).toBe(
      "/changes/c/deal?register=site&seed=7&reroll=1",
    );
  });
});
