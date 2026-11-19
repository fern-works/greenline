/**
 * The landing's words before the offer and the stop bound to a step (J-228
 * S1; the register's row of 2026-11-05, "The keeper over the oracle"), each
 * case a run's own:
 *
 * - j201c-visuals finding 6, 001/010 and 001/012: a yes to a proposal, given
 *   in the turn whose own close made the record done, read as the merge into
 *   main; j217c-workspace-010 finding 7, 002/002, the review's words read the
 *   same way. Before the offer is noted, only words that name a merge, a push
 *   or a landing answer it.
 * - j217t-conduct-empty finding 4, 001/003 `item_40`: "Yes, go ahead at
 *   regular, and pause after the build." read as a stop. A stop word bound to
 *   a step by `after`, `before`, `once` or `when` is a wait, and the words
 *   that remain decide.
 */
import { describe, expect, it } from "vitest";
import {
  answersOwnerWait,
  landingAnswer,
  readsAsResume,
  readsAsStop,
  stopNotHeld,
  waitAnswer,
} from "../../src/core/record-lines.ts";

/** The owner's words at j201c-visuals' 001/010 and 001/012, and j217c-workspace-010's 002/002. */
const YES_SHELF =
  "Yes, go ahead. Take the shelf and the overdue letters; leave the formatting out.";
const YES_FIGURE = "Yes, go ahead. After that, explain the loan lifecycle with a figure.";
const REVIEWED = "The tests look right; go on and write the code.";

/** The owner's words at j217t-conduct-empty's 001/003. */
const BOUND = "Yes, go ahead at regular, and pause after the build.";

describe("J-228 S1 before the offer, only an act's words answer the landing (j201c-visuals F6)", () => {
  it("reads a yes to a proposal and the review's words as no answer where no offer is noted", () => {
    for (const words of [YES_SHELF, YES_FIGURE, REVIEWED, "Yes, write the code.", "Yes, go ahead."])
      expect(landingAnswer(words, "merge", false), words).toBeUndefined();
  });

  it("reads the merge, push and land words where no offer is noted", () => {
    expect(landingAnswer("Close it and merge it into main.", "merge", false)).toEqual({
      kind: "merge",
      base: "main",
    });
    expect(landingAnswer("Push the branch.", "merge", false)).toEqual({ kind: "push" });
    expect(landingAnswer("Land it.", "merge", false)).toEqual({ kind: "merge", base: undefined });
    expect(landingAnswer("Don't merge it.", "merge", false)).toEqual({ kind: "decline" });
  });

  it("reads a yes after the noted offer as the offer's act, as before", () => {
    expect(landingAnswer("Yes, go ahead.", "merge", true)).toEqual({
      kind: "merge",
      base: undefined,
    });
    expect(landingAnswer("Yes, go ahead.", "merge")).toEqual({ kind: "merge", base: undefined });
  });
});

describe("J-228 S1 a stop bound to a step is a wait (j217t-conduct-empty F4)", () => {
  it("reads a stop word bound to a step as no stop, and the words that remain decide", () => {
    expect(readsAsStop(BOUND)).toBe(false);
    for (const words of [
      "Pause before the review.",
      "Stop once the tests are red.",
      "Halt when the build is done.",
    ])
      expect(readsAsStop(words), words).toBe(false);
    expect(readsAsStop("pause after the build; we pick it up tomorrow")).toBe(true);
    // The bound clause ends at "and", "then" or "but", so the stop after it is read (the verdict review's F2).
    expect(readsAsStop("Stop after the build and pick it up tomorrow.")).toBe(true);
    expect(readsAsStop("Pause after the build, then we stop for today.")).toBe(true);
    expect(readsAsStop("Pause after the build and the review.")).toBe(false);
    expect(readsAsStop("Stop there; we build it another day.")).toBe(true);
    expect(readsAsStop("Stop there for today")).toBe(true);
    expect(readsAsStop("Pause here.")).toBe(true);
  });

  it("refuses a stopped line that quotes only a bound pause, and admits the owner's stop", () => {
    const journal = { kept: true, messages: [BOUND] } as const;
    expect(stopNotHeld(BOUND, journal)).toBe(
      `has the stopped line "${BOUND}", and the owner's message that holds it reads as no stop`,
    );
    for (const words of ["Stop there; we build it another day.", "Stop there for today"])
      expect(stopNotHeld(words, { kept: true, messages: [words] }), words).toBeUndefined();
  });

  it("reads a yes holding a bound pause as the words that remain, in each reader", () => {
    expect(answersOwnerWait(BOUND)).toBe(true);
    expect(waitAnswer("build: wait for the owner's review of the tests", BOUND)).toEqual({
      kind: "answered",
    });
    expect(landingAnswer(BOUND, "merge", true)).toEqual({ kind: "merge", base: undefined });
    expect(readsAsResume("Carry on with that change, and pause after the build.")).toBe(true);
  });
});
