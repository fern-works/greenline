import { describe, expect, it } from "vitest";
import { casesHandled, shouldNeverHappen } from "../../src/commons/defect.ts";

describe("the defect helpers", () => {
  it("S2 casesHandled throws a defect that names the value no case handled", () => {
    // SAFETY: the test forges the one value the compiler proves unreachable,
    // to observe what the defect reports when an unparsed value slips past.
    const unreachable = { depth: "deep" } as never;
    expect(() => casesHandled(unreachable)).toThrow(
      'A case no branch handles reached casesHandled: {"depth":"deep"}',
    );
  });

  it("S2 shouldNeverHappen throws a defect carrying the broken invariant", () => {
    expect(() => shouldNeverHappen("the mode lacks the step 'plan'")).toThrow(
      "the mode lacks the step 'plan'",
    );
  });

  it("S2 shouldNeverHappen without a message still names the defect", () => {
    expect(() => shouldNeverHappen()).toThrow("A branch that should never run was reached.");
  });
});
