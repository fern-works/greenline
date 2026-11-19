import { describe, expect, it } from "vitest";
import { h } from "preact";
import type { DeskDocument } from "../../../src/core/inspector/documents.ts";
import {
  agoText,
  CareList,
  checkedText,
  CloseCard,
  Desk,
  SinceLine,
  whenText,
} from "../../../src/shell/inspect/app/desk.ts";
import { CLOSES, DESK_AT, deskSpecimen } from "../../../src/shell/inspect/app/desk-fixtures.ts";
import { DISCUSSION_ROWS, DRIFT } from "../../../src/shell/inspect/app/fixtures.ts";
import { dayName, dayTime, tookWords } from "../../../src/shell/inspect/app/ui.ts";
import { count, draw } from "./draw.ts";

/**
 * The desk (J-155 S1, redrawn by J-166 S1): its components drawn from
 * their specimens without a browser. The briefing answers what is in
 * progress, what waits on the owner and what closed, at most three cards
 * and the closes one row each, the newest open; beside it, what moved since
 * the owner's last look, what needs care and the open discussions. The
 * desk on the Linear workspace is held in `linear-workspace.test.ts`; the
 * fixture there has nothing in progress, so the cards and the waiting
 * tiles are proven here, on planted data.
 */

/** The desk's specimen document: three changes in progress, the last closes, the drift and the discussions. */
const SPECIMEN: DeskDocument = deskSpecimen(DISCUSSION_ROWS, DRIFT);

describe("J-155 S1, J-166 S1 the desk's components", () => {
  it("names a time by its clock and its age, a day by its name, and a span of work", () => {
    expect(agoText("2026-10-28T10:18:35.000Z", DESK_AT)).toBe("30 min ago");
    expect(agoText("2026-10-28T10:48:10.000Z", DESK_AT)).toBe("just now");
    expect(agoText("2026-10-28T06:48:35.000Z", DESK_AT)).toBe("4 h ago");
    expect(agoText("2026-10-26T10:48:35.000Z", DESK_AT)).toBe("2 days ago");
    expect(whenText("2026-10-28T10:18:35.000Z", DESK_AT)).toMatch(/^\d\d:\d\d, 30 min ago$/);
    const at = new Date(2026, 9, 28, 16, 0);
    expect(dayTime(new Date(2026, 9, 28, 15, 58).toISOString(), at)).toBe("15:58");
    expect(dayTime(new Date(2026, 9, 27, 9, 5).toISOString(), at)).toBe("yesterday 09:05");
    expect(dayTime(new Date(2026, 9, 2, 9, 5).toISOString(), at)).toBe("2 Oct 09:05");
    expect(dayTime(new Date(2025, 9, 2, 9, 5).toISOString(), at)).toBe("2 Oct 2025");
    expect(dayName(new Date(2026, 9, 28, 1, 0).toISOString(), at)).toBe("Today");
    expect(dayName(new Date(2026, 9, 26, 1, 0).toISOString(), at)).toBe("Mon 26 Oct");
    expect(tookWords(33)).toBe("33 min");
    expect(tookWords(70)).toBe("1 h 10");
  });

  it("leads with the change that waits, its question in the agent's words and its options as tiles with Copy", () => {
    const drawn = draw(h(Desk, { now: SPECIMEN, at: DESK_AT }));
    expect(count(drawn, "DeskSummary")).toBe(1);
    expect(drawn.text).toMatch(/^Dense list waits on you\./);
    expect(count(drawn, "ChangeCard")).toBe(3);
    expect(count(drawn, "WaitingCard")).toBe(1);
    expect(count(drawn, "ChoiceTiles")).toBe(1);
    // Each option a tile with its own Copy, which writes nothing.
    expect(count(drawn, "CopyButton")).toBe(2);
    expect(drawn.text).toContain("1 always shown, quiet Copy");
    expect(drawn.text).toContain("2 shown on hover and focus Copy");
    expect(drawn.text).toMatch(/waiting on you at build, asked \d\d:\d\d, 30 min ago/);
    expect(drawn.text).toContain(
      "The owner chooses how the Move buttons show, then rerun the browser check",
    );
    expect(drawn.links).toContain("/changes/2026-10-28-dense-list/build");
    expect(count(drawn, "NextLine")).toBe(2);
    expect(drawn.text).toContain("Next: Write the review section from the fresh reviewer's report");
  });

  it("gives each card the change's sentence, its steps with the step named, and one line of its facts", () => {
    const drawn = draw(h(Desk, { now: SPECIMEN, at: DESK_AT }));
    expect(drawn.text).toContain(
      "The owner wants the issues list denser, with the keys between issues still working.",
    );
    expect(drawn.text).toContain("at build");
    expect(count(drawn, "FactLine")).toBe(3);
    // Its commits, its files with their lines, its last check, its last activity.
    expect(drawn.text).toMatch(
      /9 commits · 6 files \+148 \u221257 · test passed \S+ · last activity \S+/,
    );
  });

  it("folds what each change changed since the last look, each file opening its lines", () => {
    const drawn = draw(h(Desk, { now: SPECIMEN, at: DESK_AT }));
    expect(count(drawn, "ChangedFiles")).toBe(3);
    expect(drawn.text).toMatch(
      /Changed since your last look, \d\d:\d\d, 43 min ago 6 \+148 \u221257/,
    );
    expect(drawn.links).toContain("/changes/2026-10-28-dense-list/changed/src/web/list.ts");
    expect(drawn.text).toContain("No file changed since your last look.");
  });

  it("draws at most three cards, then how many more", () => {
    const four = {
      ...SPECIMEN,
      inProgress: [...SPECIMEN.inProgress, ...SPECIMEN.inProgress.slice(0, 1)],
    };
    const drawn = draw(h(Desk, { now: four, at: DESK_AT }));
    expect(count(drawn, "ChangeCard")).toBe(3);
    expect(drawn.text).toContain("and 1 more change in progress");
  });

  it("draws the closes as rows, the newest open, its why, its files, its check badge, when it closed and how long it took", () => {
    const drawn = draw(h(Desk, { now: SPECIMEN, at: DESK_AT }));
    expect(count(drawn, "CloseCard")).toBe(CLOSES.length);
    expect(count(drawn, "CheckBadge")).toBe(CLOSES.length);
    expect(drawn.text).toContain("5/5");
    // The failing close opens too, its check named.
    expect(drawn.text).toContain("1 of 3 checks failed: npm run e2e.");
    expect(drawn.text).toContain("All 5 checks passed on the final code.");
    expect(drawn.text).toMatch(/17 commits, \S+ to \S+\./);
    expect(drawn.text).toContain("33 min");
    // The record's own last commit no longer stands for the change.
    expect(drawn.text).not.toContain("docs(record)");
  });

  it("says what moved since the last look, the commits, the changes and the files folded", () => {
    const drawn = draw(h(SinceLine, { since: SPECIMEN.since, at: DESK_AT }));
    expect(drawn.text).toContain("9 commits, Projects closed, 1 picture.");
    expect(drawn.text).toContain("6 files 3 +148 \u221257");
    const first = draw(h(SinceLine, { since: null, at: DESK_AT }));
    expect(first.text).toContain("This is your first look from this browser");
  });

  it("lists what needs care, at most five lines by kind: the drift by change, the failing checks, the health and the notes", () => {
    const drawn = draw(h(CareList, { now: SPECIMEN }));
    expect(count(drawn, "DriftLine")).toBe(1);
    expect(drawn.text).toContain(
      "2 pictures and pages from 1 change drifted, the oldest 14 commits behind",
    );
    expect(drawn.text).toContain("Keyboard shortcuts: npm run e2e failed");
    expect(drawn.text).toContain("2 errors and 1 warning in greenline's health");
    expect(drawn.text).toContain("1 note open on the captures");
    expect(drawn.links).toContain("/practice");
  });

  it("keeps the discussions under their own label, beside the briefing", () => {
    const drawn = draw(h(Desk, { now: SPECIMEN, at: DESK_AT }));
    expect(count(drawn, "OpenDiscussions")).toBe(1);
    expect(drawn.text).toContain("Discussions");
    for (const discussion of DISCUSSION_ROWS) expect(drawn.text).toContain(discussion.title);
    expect(drawn.text).not.toContain("Drift and discussions");
  });

  it("never shows an id as text: each is a link's address", () => {
    const drawn = draw(h(Desk, { now: SPECIMEN, at: DESK_AT }));
    for (const change of SPECIMEN.inProgress) {
      expect(drawn.text).not.toContain(change.id);
      expect(drawn.links).toContain(`/changes/${change.id}`);
    }
    for (const close of SPECIMEN.closes) expect(drawn.links).toContain(`/changes/${close.id}`);
  });

  it("with nothing in progress says so and shows the closes", () => {
    const drawn = draw(h(Desk, { now: { ...SPECIMEN, inProgress: [] }, at: DESK_AT }));
    expect(drawn.text).toMatch(/^Nothing is in progress\. The last change closed 57 min ago\./);
    expect(count(drawn, "ChangeCard")).toBe(0);
    expect(count(drawn, "CloseCard")).toBe(3);
    // A close with no file of its own says nothing of files in its row.
    expect(drawn.text).not.toContain("0 files");
    expect(drawn.text).toContain("no check");
  });

  it("names a close's checks and its moved code", () => {
    const [first] = CLOSES;
    if (first === undefined) throw new Error("no close");
    const moved = { ...first.close, checked: { ...first.close.checked, onFinal: 3 } };
    expect(checkedText(moved)).toBe("All 5 checks passed 3 of them on the final code.");
    const drawn = draw(h(CloseCard, { close: moved, at: DESK_AT, open: true }));
    expect(drawn.components).toContain("CloseCard");
    expect(drawn.links).toContain(`/changes/${first.close.id}/code`);
  });
});
