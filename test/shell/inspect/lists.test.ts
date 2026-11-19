import { h } from "preact";
import { describe, expect, it } from "vitest";
import {
  ChangeRow,
  RecordFacts,
  StepStrip,
  stripWords,
} from "../../../src/shell/inspect/app/change.ts";
import {
  CHANGE_PAGE,
  CHANGE_ROWS,
  ROSTER_DOCUMENT,
  ROSTER_SKILLS,
  ROSTER_USE,
} from "../../../src/shell/inspect/app/fixtures.ts";
import { RosterGroups, RosterView } from "../../../src/shell/inspect/app/roster.ts";
import { FilterBar, StateWord } from "../../../src/shell/inspect/app/ui.ts";
import { draw, READY, withNames } from "./walk.ts";

/**
 * J-158 S3: the lists read at a glance. The step strip is a dot per step
 * with the step now named; a change is one dense row of its state, its name
 * and sentence, its dots, its mode, its plan's ticket and its age; the
 * filters are chips with their counts; the roster is a card per skill with
 * its kind, its loads and its loads off its step. The phone layout and the
 * three widths are the render check's, in a browser.
 */

const row = (index: number) => {
  const found = CHANGE_ROWS[index]?.change;
  if (found === undefined) throw new Error(`no row ${index}`);
  return found;
};

describe("J-158 S3 the step strip as dots", () => {
  it("names the step a change is at, or how many steps are written where it is at none", () => {
    expect(stripWords(row(0).strip)).toBe("at build");
    expect(stripWords(row(1).strip)).toBe("at verify");
    const closed = CHANGE_ROWS.find((entry) => entry.change.strip.every((step) => !step.current));
    expect(stripWords(closed?.change.strip ?? [])).toMatch(/^\d+ of \d+ written$/);
  });

  it("draws one strip with the step now named beside its dots", () => {
    const drawn = draw(h(StepStrip, { strip: row(0).strip, form: "dots" }));
    expect(drawn.components).toEqual(["StepStrip"]);
    expect(drawn.text).toBe("at build");
  });
});

/** The time the rows are read at, the day after the stopped change's last commit. */
const AT = new Date("2026-10-24T12:00:00Z");

describe("J-158 S3, J-166 S1 a change as one dense row", () => {
  it("holds an open change's state, its name led by its ticket, its sentence, its dots, its commits and its last activity, and no next line", () => {
    const drawn = draw(h(ChangeRow, { change: row(1), at: AT }), withNames(READY));
    expect(drawn.components).toContain("ChangeRow");
    expect(drawn.components).toContain("StepStrip");
    expect(drawn.components).toContain("When");
    for (const fact of [
      "stopped",
      "T2 · Login rate limit",
      "Rate-limit the login endpoint",
      "at verify",
      "3 commits",
    ])
      expect(drawn.text, fact).toContain(fact);
    expect(drawn.text).not.toContain("Next");
    expect(drawn.links).toContain("/changes/2026-10-23-login-rate-limit");
  });

  it("shows a finished change's size in place of its dots, its files and its lines in their tones", () => {
    const done = CHANGE_ROWS.find((entry) => entry.change.state === "done")?.change;
    if (done === undefined) throw new Error("no done row");
    const drawn = draw(h(ChangeRow, { change: done, at: AT }), withNames(READY));
    expect(drawn.components).toContain("RowSize");
    expect(drawn.components).not.toContain("StepStrip");
    expect(drawn.text).toContain("4 files");
    expect(drawn.text).toContain("+130 −22");
    expect(drawn.text).toContain("4 commits");
  });

  it("states why a record that does not parse has no sentence, in the sentence's place", () => {
    const unread = CHANGE_ROWS.find((entry) => entry.change.state === null)?.change;
    if (unread === undefined) throw new Error("no unreadable row");
    const drawn = draw(h(ChangeRow, { change: unread, at: AT }), withNames(READY));
    expect(drawn.text).toContain("unreadable");
    expect(drawn.text).toContain("The record does not parse:");
  });
});

describe("J-158 S3 the filters as chips", () => {
  it("offers every state with its count, the whole set first, a state no change stands in kept at 0", () => {
    const drawn = draw(
      h(FilterBar<string>, {
        label: "Show changes by state",
        chips: [
          { key: "all", label: "All", count: 6 },
          { key: "waiting", label: "Waiting on you", count: 1 },
          { key: "proposed", label: "Proposed", count: 0 },
          { key: "done", label: "Done", count: 2 },
        ],
        current: "all",
        pick: () => undefined,
      }),
    );
    expect(drawn.components).toEqual(["FilterBar"]);
    // The vocabulary never shifts: a state no change stands in stays, reading 0 (J-156, Filters and grouping).
    expect(drawn.text).toBe("All 6Waiting on you 1Proposed 0Done 2");
  });
});

describe("J-158 S3 the states and the plan in the practice's words", () => {
  it("says a state the contract spells with a hyphen as the practice says it", () => {
    for (const [word, said] of [
      ["in-progress", "in progress"],
      ["waiting", "waiting on you"],
      ["not-run", "not run"],
      ["done", "done"],
    ] as const)
      expect(draw(h(StateWord, { word })).text, word).toBe(said);
  });

  it("names a change's plan on its page by the plan's name, never its folder", () => {
    const card = { ...CHANGE_PAGE.card, plan: "007-auth", ticket: "T2" };
    const drawn = draw(h(RecordFacts, { card }), withNames(READY));
    expect(drawn.text).toContain("Auth, ticket T2");
    expect(drawn.text).not.toContain("007-auth");
  });
});

describe("J-166 S1 the roster grouped by kind and ranked by loads", () => {
  it("ranks each kind's skills by loads, each row with its sentence, its meter, its cells, off its step and its last load", () => {
    const drawn = draw(h(RosterGroups, { roster: ROSTER_DOCUMENT, at: AT }));
    expect(drawn.components).toContain("RosterGroups");
    const rows = drawn.components.filter((name) => name === "RosterRow").length;
    expect(rows).toBe(
      ROSTER_USE.filter((use) =>
        ROSTER_SKILLS.some((skill) => skill.installed && skill.name === use.skill),
      ).length,
    );
    // The most loaded first: frame's 14 before review's 9.
    expect(drawn.text.indexOf("frame")).toBeLessThan(drawn.text.indexOf("review"));
    expect(drawn.components).toContain("Meter");
    expect(drawn.components).toContain("StepCells");
    expect(drawn.text).toContain("1 off its step");
    // The kind's sentence under its head, the never-loaded folded into one line.
    expect(drawn.text).toContain(ROSTER_DOCUMENT.kinds[0]?.when ?? "\u0000");
    expect(drawn.text).toMatch(/\d+ never loaded/);
    expect(drawn.links).toContain("/practice/roster/frame");
  });

  it("keeps the nine-column table as the raw view, ranked by loads", () => {
    const drawn = draw(h(RosterView, { roster: ROSTER_DOCUMENT, at: AT, form: "table" }));
    expect(drawn.components).toContain("RosterTable");
    expect(drawn.components).not.toContain("RosterGroups");
    expect(drawn.links).toContain("/api/roster");
  });
});
