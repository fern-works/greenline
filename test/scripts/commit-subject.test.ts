import { describe, expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (the gate-outcome precedent)
import { checkCommit, parseCommits, walkPlan } from "../../scripts/lib/commit-subject.mjs";

/** The commit-subject row (step 6, ruling 6): the shape docs/SHIPPING.md states, and the walk. */
const trailer = "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>";
const good = {
  subject: "fix(gate): the row reads HEAD",
  body: `The mechanism and the why.\n\n${trailer}`,
};

describe("checkCommit", () => {
  it("accepts type(scope): outcome with a body and the trailer, with or without a scope", () => {
    expect(checkCommit(good)).toEqual([]);
    expect(checkCommit({ ...good, subject: "docs: a scopeless subject" })).toEqual([]);
  });
  it("accepts a subject of exactly 72 characters and refuses one of 73", () => {
    const seventyTwo = `docs(plans): ${"x".repeat(59)}`;
    expect(seventyTwo).toHaveLength(72);
    expect(checkCommit({ ...good, subject: seventyTwo })).toEqual([]);
    expect(checkCommit({ ...good, subject: `${seventyTwo}x` })).toEqual([
      "subject is 73 characters (cap 72)",
    ]);
  });
  it("refuses a type not in use", () => {
    expect(checkCommit({ ...good, subject: "style(x): tidy" })).toEqual([
      "subject is not type(scope): outcome with one of docs, feat, fix, refactor, qa, chore, export",
    ]);
  });
  it("refuses wip and a bare fixes as the outcome or the subject's first word", () => {
    expect(checkCommit({ ...good, subject: "fix: wip" })).toContain(
      "the outcome is wip or a bare fixes",
    );
    expect(checkCommit({ ...good, subject: "fixes" })).toContain(
      "the outcome is wip or a bare fixes",
    );
    expect(checkCommit({ ...good, subject: "wip: a thing" })).toContain(
      "the outcome is wip or a bare fixes",
    );
  });
  it("wants a prose body unless the subject is the accounting or the release formula", () => {
    expect(checkCommit({ subject: "feat(cli): a thing", body: trailer })).toEqual(["no body"]);
    expect(
      checkCommit({ subject: "docs(ledger): record D; the plan notes D", body: trailer }),
    ).toEqual([]);
    expect(
      checkCommit({ subject: "release: v0.0.2 — what a consumer gets", body: trailer }),
    ).toEqual([]);
  });
  it("strips only the trailer block, so a colon-led prose line still counts as a body", () => {
    expect(
      checkCommit({
        subject: "fix(gate): a thing",
        body: `Ruling: the operator's word, 2026-09-12.\n\n${trailer}`,
      }),
    ).toEqual([]);
  });
  it("refuses a trailer that is not the body's last paragraph", () => {
    expect(
      checkCommit({
        subject: "fix(gate): a thing",
        body: `${trailer}\n\nProse after the trailer.`,
      }),
    ).toEqual(["the Co-Authored-By trailer is not the body's last paragraph"]);
  });
  it("wants the trailer on every commit, in either spelling", () => {
    expect(checkCommit({ subject: "feat(cli): a thing", body: "Why." })).toEqual([
      "no Co-Authored-By trailer",
    ]);
    expect(
      checkCommit({ ...good, body: "Why.\n\nCo-authored-by: Someone <s@example.com>" }),
    ).toEqual([]);
  });
});

describe("walkPlan", () => {
  it("asserts HEAD alone without --full", () => {
    expect(walkPlan({ full: false, shallow: true, cut: "abc" })).toEqual({
      ranges: [["-1"]],
      skipped: undefined,
    });
  });
  it("walks from the cut forward, the cut included, under --full", () => {
    expect(walkPlan({ full: true, shallow: false, cut: "abc" })).toEqual({
      ranges: [["abc^..HEAD"]],
      skipped: undefined,
    });
  });
  it("skips the walk with its reason on a shallow clone or with no cut, and still asserts HEAD", () => {
    expect(walkPlan({ full: true, shallow: true, cut: "abc" })).toEqual({
      ranges: [["-1"]],
      skipped: "shallow clone: HEAD checked, the walk from the cut needs history",
    });
    expect(walkPlan({ full: true, shallow: false, cut: undefined }).ranges).toEqual([["-1"]]);
  });
});

it("parseCommits reads the log's hash, subject and body records, a missing body as empty", () => {
  const text = `abc\0fix(x): one\0Body one.\n\n${trailer}\n\x1e\ndef\0docs(ledger): record D; the plan notes D\x1e`;
  expect(parseCommits(text)).toEqual([
    { hash: "abc", subject: "fix(x): one", body: `Body one.\n\n${trailer}` },
    { hash: "def", subject: "docs(ledger): record D; the plan notes D", body: "" },
  ]);
});
