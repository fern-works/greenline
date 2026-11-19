/**
 * The waiting line and the stopped fact read beside the owner's message of
 * the turn (J-205 S1; the register's row of 2026-11-05, "The keeper over
 * the oracle"; the close page, "Stops"), the run j196t-conduct-emptyb's
 * case: the farewell change stopped at the review's wait, and a fresh
 * session told "Carry on with that change.", "Go on." and "Yes, please."
 * left it stopped while the mirror kept saying the work went no further
 * than that wait. Where the owner's words answer the wait the line says so
 * and that the first write sets the record open; otherwise it names the
 * wait as the record states it, and never that the work goes no further.
 */
import { describe, expect, it } from "vitest";
import {
  mirrorText,
  recordAnswer,
  stopCommitLine,
  stopCommitOwed,
  stoppedHeldLine,
  waitingLine,
} from "../../src/core/mirror.ts";

const ID = "2026-11-08-farewell";
const NEXT = "review: wait for the owner to resume independent review";
const WAIT = "wait for the owner to resume independent review";
const STOPPED = { readable: true, mode: "regular", state: "stopped", next: NEXT } as const;
const ANSWER = "the owner's words this turn answer it: set state open as the first write and go on";
const base = { checks: [], declared: 0, agents: 0, git: { state: "off" as const } };

describe("J-205 S1 the waiting line admits the owner's answer to the wait (j196t-conduct-emptyb)", () => {
  for (const words of ["Carry on with that change.", "Go on.", "Yes, please."])
    it(`says the owner's words answer the stopped change's wait on "${words}"`, () => {
      expect(waitingLine(STOPPED, ID, words)).toBe(
        `waiting on: ${WAIT}, from the stopped change ${ID}'s next line; ${ANSWER}`,
      );
    });

  it("names the wait as the record states it on a message off the list, and on none, never that the work goes no further", () => {
    for (const words of ["What does the farewell function return?", undefined]) {
      const line = waitingLine(STOPPED, ID, words);
      expect(line).toBe(
        `waiting on: ${WAIT}, from the stopped change ${ID}'s next line; the Waiting on row says it`,
      );
      expect(line).not.toContain("goes no further");
    }
  });

  it("tells an open record's answered wait to go on, with no state to set", () => {
    const open = { ...STOPPED, state: "open" };
    expect(waitingLine(open, undefined, "Go on.")).toBe(
      `waiting on: ${WAIT}, from the record's next line; the owner's words this turn answer it: rewrite the next line and go on`,
    );
  });

  it("prints the answered line in the mirror of an open change from the turn's words", () => {
    const change = { id: ID, record: STOPPED };
    const text = mirrorText({ ...base, change, turnWords: "Go on." });
    expect(text).toContain(`waiting on: ${WAIT}, from the record's next line; ${ANSWER}`);
    expect(text).not.toContain("goes no further");
  });
});

describe("J-205 S1 the stopped fact admits the owner's answer", () => {
  const path = `.greenline/ledger/${ID}.md`;

  it("says the owner's words this turn answer it where they resume the change", () => {
    expect(
      stoppedHeldLine(ID, "Stop here for today; we carry on later.", { kind: "answered" }),
    ).toBe(`stopped: ${path} reads stopped while this session still holds the change; ${ANSWER}`);
  });

  it("keeps the wait's words where they answer nothing", () => {
    const line = stoppedHeldLine(ID, undefined, undefined);
    expect(line).toContain("is no stop and leaves the record open");
    expect(line).toContain("set state: open and wait with it open");
  });
});

describe("J-210 S1 the stop's commit is owed while no commit holds the stop (j196t-states-stop-2c)", () => {
  const STOP = "Stop there for today; I will pick this up tomorrow.";
  const stopped = { ...STOPPED, stopped: STOP };

  it("owes it for a stopped record HEAD holds nowhere, open, or stopped on other words", () => {
    expect(stopCommitOwed(stopped, undefined)).toBe(true);
    expect(stopCommitOwed(stopped, { ...STOPPED, state: "open" })).toBe(true);
    expect(stopCommitOwed(stopped, { ...STOPPED, stopped: "Enough for today." })).toBe(true);
  });

  it("owes none for a stop HEAD holds on the same words, or a record that reads no stop", () => {
    expect(stopCommitOwed(stopped, stopped)).toBe(false);
    expect(stopCommitOwed({ ...STOPPED, state: "open" }, undefined)).toBe(false);
    expect(stopCommitOwed(undefined, undefined)).toBe(false);
  });

  it("prints the line in the mirror beside the stopped fact of a change open on its branch", () => {
    const text = mirrorText({
      ...base,
      change: { id: ID, record: stopped },
      stopCommit: stopCommitLine(ID),
    });
    expect(text).toContain(
      `  stopped: .greenline/ledger/${ID}.md reads stopped and no commit holds it; commit the record and its folder now`,
    );
  });
});

describe("J-214 S1 the waiting line tells a resume apart from an answer to the wait on the owner (j196t-states-stop-2d)", () => {
  const RUN = "2026-11-09-find-by-year";
  /** The record at the stop commit a483507 of the run's sandbox. */
  const NEXT_AT_STOP = "build: wait for the owner's review of the tests, then implement findByYear";
  const ACTION = "wait for the owner's review of the tests, then implement findByYear";
  const STOP = "Stop there for today; I will pick this up tomorrow.";
  const stopped = {
    readable: true,
    mode: "careful",
    state: "stopped",
    next: NEXT_AT_STOP,
    stopped: STOP,
  } as const;
  const RESUMED =
    "the owner's words this turn resume the work: set state open as the first write, at build; the wait on the owner stands, the owner's review of the tests: do its act first, show again what it waits on where this checkout holds none, and wait for the owner's answer to it";
  const PATCH = `.greenline/ledger/${RUN}/shown.patch`;
  const SHOWN = `the folder's shown.patch holds the edits the owner saw: apply it before the wait's act, \`git apply ${PATCH}\``;

  it('says "Carry on with that change." resumes the work while the wait on the owner stands (002/001, rollout line 13)', () => {
    const line = waitingLine(stopped, undefined, "Carry on with that change.");
    expect(line).toBe(`waiting on: ${ACTION}, from the record's next line; ${RESUMED}`);
    expect(line).not.toContain(ANSWER);
    expect(waitingLine(stopped, RUN, "Carry on with that change.")).toBe(
      `waiting on: ${ACTION}, from the stopped change ${RUN}'s next line; ${RESUMED}`,
    );
  });

  it("says the wait is answered on the review's words and on 2b's explicit approval", () => {
    for (const words of ["Looks good, go ahead", "The tests look right; go on and write the code."])
      expect(waitingLine(stopped, undefined, words), words).toBe(
        `waiting on: ${ACTION}, from the record's next line; ${ANSWER}`,
      );
  });

  it("tells an open record's resumed wait to stand, with no state to set", () => {
    expect(waitingLine({ ...stopped, state: "open" }, undefined, "Go on.")).toBe(
      `waiting on: ${ACTION}, from the record's next line; the owner's words this turn resume the work; the wait on the owner stands, the owner's review of the tests: do its act first, show again what it waits on where this checkout holds none, and wait for the owner's answer to it`,
    );
  });

  it("names the folder's shown patch beside the wait where the shell found it owed", () => {
    expect(waitingLine(stopped, undefined, "Carry on with that change.", PATCH)).toBe(
      `waiting on: ${ACTION}, from the record's next line; ${RESUMED}; ${SHOWN}`,
    );
    expect(waitingLine(stopped, undefined, undefined, PATCH)).toBe(
      `waiting on: ${ACTION}, from the record's next line; the Waiting on row says it; ${SHOWN}`,
    );
  });

  it("gives the stopped fact the same resume, and the record's answer to the stop's commit", () => {
    const answer = recordAnswer(stopped, "Carry on with that change.");
    expect(answer).toEqual({
      kind: "resumed",
      wait: "the owner's review of the tests",
      step: "build",
    });
    expect(stoppedHeldLine(RUN, STOP, answer)).toBe(
      `stopped: .greenline/ledger/${RUN}.md reads stopped while this session still holds the change; ${RESUMED}`,
    );
    expect(recordAnswer(stopped, "Looks good, go ahead")).toEqual({ kind: "answered" });
    expect(recordAnswer(stopped, "What does findByYear return?")).toBeUndefined();
  });

  it("names the uncommitted edits at the stop and the patch the stop's commit carries (F2)", () => {
    const line = stopCommitLine(RUN, { tracked: ["test/shelf.test.js"], untracked: [] });
    expect(line).toBe(
      `stopped: .greenline/ledger/${RUN}.md reads stopped and no commit holds it; commit the record and its folder now, the stop's commit, since a clone and a fresh session carry commits alone; uncommitted edits outside its folder: test/shelf.test.js; keep them as ${PATCH}, which the stop's commit carries, since a clone carries commits alone: \`git diff HEAD -- test/shelf.test.js > ${PATCH}\``,
    );
    expect(
      stopCommitLine(RUN, { tracked: ["src/shelf.js"], untracked: ["test/find by year.test.js"] }),
    ).toContain(
      `uncommitted edits outside its folder: src/shelf.js and test/find by year.test.js; keep them as ${PATCH}, which the stop's commit carries, since a clone carries commits alone: \`git diff HEAD -- src/shelf.js > ${PATCH}; git diff --no-index /dev/null 'test/find by year.test.js' >> ${PATCH}\``,
    );
    expect(stopCommitLine(RUN, { tracked: [], untracked: [] })).toBe(stopCommitLine(RUN));
    expect(stopCommitLine(RUN)).not.toContain("shown.patch");
  });
});

describe("J-222 S1 the waiting line keeps the wait on the owner under every form of the next line (j217c-states-stop)", () => {
  const RUN = "2026-11-10-find-by-year";
  /** The Claude run's action at the stop commit 83caaba, the owner's words at 002/001 "Carry on with that change.". */
  const ACTION =
    "wait on the owner's review of the five red tests (test/shelf.test.js, kept as 2026-11-10-find-by-year/shown.patch), then write findByYear in src/shelf.js";
  const STOP = "Stop there for today; I will pick this up tomorrow.";
  const stoppedAt = (next: string) =>
    ({ readable: true, mode: "regular", state: "stopped", next, stopped: STOP }) as const;
  const stopped = stoppedAt(`build: ${ACTION}`);
  const PATCH = `.greenline/ledger/${RUN}/shown.patch`;
  const SHOWN = `the folder's shown.patch holds the edits the owner saw: apply it before the wait's act, \`git apply ${PATCH}\``;
  const resumed = (wait: string) =>
    `the owner's words this turn resume the work: set state open as the first write, at build; the wait on the owner stands, ${wait}: do its act first, show again what it waits on where this checkout holds none, and wait for the owner's answer to it`;

  it("says the run's carry-on resumes the work while its wait stands, never that the words answer it (002/001)", () => {
    const line = waitingLine(stopped, undefined, "Carry on with that change.", PATCH);
    expect(line).toBe(
      `waiting on: ${ACTION}, from the record's next line; ${resumed("the owner's review of the five red tests")}; ${SHOWN}`,
    );
    expect(line).not.toContain(ANSWER);
    expect(recordAnswer(stopped, "Carry on with that change.")).toEqual({
      kind: "resumed",
      wait: "the owner's review of the five red tests",
      step: "build",
    });
    expect(waitingLine(stopped, undefined, "The tests look right; go on and write the code.")).toBe(
      `waiting on: ${ACTION}, from the record's next line; ${ANSWER}`,
    );
  });

  it("brings each form of the list to the standing wait, never to the answer", () => {
    for (const [action, wait] of [
      [
        "wait for the owner's review of the tests, then implement",
        "the owner's review of the tests",
      ],
      ["wait until the owner reviews the tests, then implement", "the owner reviews the tests"],
      [
        "waiting on the owner's answer on the name; then rename it",
        "the owner's answer on the name",
      ],
      ["the owner's yes to write the code", "the owner's yes to write the code"],
      ["ask the owner to review the tests, then implement", "the owner to review the tests"],
      [
        "show the five red tests for review again, then implement",
        "show the five red tests for review again",
      ],
    ] as const) {
      const line = waitingLine(stoppedAt(`build: ${action}`), undefined, "Go on.");
      expect(line, action).toBe(
        `waiting on: ${action}, from the record's next line; ${resumed(wait)}`,
      );
      expect(line, action).not.toContain(ANSWER);
    }
  });

  it("prints the standing wait in the mirror from the turn's words", () => {
    const text = mirrorText({
      ...base,
      change: { id: RUN, record: stopped },
      turnWords: "Carry on with that change.",
    });
    expect(text).toContain(
      `the wait on the owner stands, the owner's review of the five red tests`,
    );
    expect(text).not.toContain(ANSWER);
  });

  it("names no wait from a line that names none", () => {
    expect(waitingLine(stoppedAt("build: implement findByYear"), undefined, "Go on.")).toBe(
      undefined,
    );
  });
});
