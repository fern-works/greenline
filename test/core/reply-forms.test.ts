import { describe, expect, it } from "vitest";
import { cardLabelsOf, refusalOf, replyPartsOf } from "../../src/core/reply-forms.ts";

/**
 * The reply's forms read by their form (J-150 S2, J-176 S1): the three parts
 * a reply carries, the refusal form and the cards' labels, each in the
 * product's own words.
 */

describe("J-176 S1 the reply's three parts", () => {
  it("reads the sentence of what happened, the wait line and the viewer's address", () => {
    const reply = [
      "The overdue letters now go out on Mondays, and the check is green.",
      "",
      "Waiting on: your word to land the branch.",
      "",
      "See it at http://127.0.0.1:4747/changes/2026-11-06-overdue.",
    ].join("\n");
    expect(replyPartsOf(reply)).toEqual({
      happened: "The overdue letters now go out on Mondays, and the check is green.",
      waiting: "Waiting on: your word to land the branch.",
      address: "http://127.0.0.1:4747/changes/2026-11-06-overdue",
      table: false,
    });
  });

  it("reads a facts table as the part the reply no longer carries, and no part inside a fence", () => {
    const reply = [
      "| Fact | Now |",
      "| --- | --- |",
      "| Mode | quick |",
      "",
      "```text",
      "Waiting on: nothing in a fence",
      "```",
      "- **Waiting on** your yes",
    ].join("\n");
    expect(replyPartsOf(reply)).toEqual({
      happened: null,
      waiting: "- **Waiting on** your yes",
      address: null,
      table: true,
    });
  });

  it("reads no address off this machine as the viewer's", () => {
    expect(replyPartsOf("Done. See https://example.com/x.").address).toBeNull();
    expect(replyPartsOf("Done. See http://localhost:4747/.").address).toBe(
      "http://localhost:4747/",
    );
  });
});

describe("J-150 S2 the refusal form", () => {
  it("reads a refusal behind the harness's prefix, its words, rule and hook", () => {
    expect(
      refusalOf(
        "PreToolUse:Bash hook error: [greenline event]: commit the words first; discard-words, greenline's harness hook",
      ),
    ).toEqual({
      line: "commit the words first; discard-words, greenline's harness hook",
      words: "commit the words first",
      rule: "discard-words",
      hook: "harness",
    });
    expect(refusalOf("greenline: no open change")).toBeUndefined();
  });
});

describe("J-150 S2 the cards' labels", () => {
  it("reads each question's option labels, and none from an input with no questions", () => {
    expect(
      cardLabelsOf({
        questions: [
          { question: "Which?", options: [{ label: "Core (Recommended)" }, { label: "Labels" }] },
        ],
      }),
    ).toEqual([["Core (Recommended)", "Labels"]]);
    expect(cardLabelsOf("not an input")).toEqual([]);
  });
});
