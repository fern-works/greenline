import { describe, expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (audit 7, W4 finding 1)
import { outcome, skip } from "../../scripts/lib/gate-outcome.mjs";

/**
 * Audit 7, law walk, finding 1: the gate's `skip(reason)` hung the reason
 * on a throwaway inner function and returned a bare string, so the row
 * runner never saw it and every SKIP printed with no reason. The
 * coverage row's council docket and a fired clock's name both travel in
 * that reason, so it must reach the summary. One module, so the runner
 * and this regression test cannot drift.
 */

describe("gate row outcomes", () => {
  it("carries a skip's reason to the summary", () => {
    expect(outcome(skip("fired clocks awaiting re-verification: rust-floor (2026-10-01)"))).toEqual(
      {
        status: "SKIP",
        reason: "fired clocks awaiting re-verification: rust-floor (2026-10-01)",
      },
    );
  });

  it("reads a row that returns nothing as a pass with no reason", () => {
    expect(outcome(undefined)).toEqual({ status: "PASS", reason: "" });
  });

  it("does not mistake a row's incidental return value for a skip", () => {
    expect(outcome("SKIP")).toEqual({ status: "PASS", reason: "" });
    expect(outcome(42)).toEqual({ status: "PASS", reason: "" });
  });
});
