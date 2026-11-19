import { describe, expect, it } from "vitest";
import { h } from "preact";
import type { ChangeListEntry } from "../../../src/core/inspector/documents.ts";
import {
  ChangesList,
  listAddress,
  listGroups,
  listView,
  newestFirst,
} from "../../../src/shell/inspect/app/changes-list.ts";
import {
  CHANGE_ROWS,
  DECISIONS_HOME,
  NAMES,
  PRACTICE,
  RECORDS_HOME,
  ROSTER_DOCUMENT,
  SETTINGS,
  SKILL_DOCUMENT,
} from "../../../src/shell/inspect/app/fixtures.ts";
import {
  CAPTURE,
  CAPTURE_PHONE,
  INTERFACE,
} from "../../../src/shell/inspect/app/interface-fixtures.ts";
import {
  draftLines,
  homeCards,
  KnowledgeOverview,
  namedHtml,
  PolicyEditor,
  RulingsEditor,
} from "../../../src/shell/inspect/app/knowledge-pages.ts";
import { openingWidth } from "../../../src/shell/inspect/app/marks.ts";
import {
  BoxWire,
  boxKind,
  captureChange,
  PageCard,
  pageGroups,
} from "../../../src/shell/inspect/app/pages.ts";
import { healthSentence, PracticeHome } from "../../../src/shell/inspect/app/practice.ts";
import { SkillPage } from "../../../src/shell/inspect/app/roster.ts";
import { InstallationForm, pendingChanges } from "../../../src/shell/inspect/app/settings.ts";
import { namesOf } from "../../../src/shell/inspect/app/ui.ts";
import { count, draw } from "./draw.ts";

/**
 * The second cut's pages on planted data (J-166 S1): the changes list's
 * order, groups and address; Interface's page cards with the wireframe a
 * capture's boxes draw; Knowledge's overview and its policy read and edited
 * in place; Practice's home with its health groups, a skill's page and the
 * installation as a form. The Linear workspace's pages are held in
 * `linear-workspace.test.ts`.
 */

const AT = new Date("2026-10-24T12:00:00Z");
const unpicked = (): void => undefined;

describe("J-166 S1 the changes list", () => {
  it("reads and writes its filter and its grouping in the address", () => {
    expect(listView("")).toEqual({ filter: "all", group: "day" });
    expect(listView("?state=done&group=plan")).toEqual({ filter: "done", group: "plan" });
    expect(listView("?state=nonsense")).toEqual({ filter: "all", group: "day" });
    expect(listAddress("all", "day")).toBe("/changes");
    expect(listAddress("waiting", "day")).toBe("/changes?state=waiting");
    expect(listAddress("done", "plan")).toBe("/changes?state=done&group=plan");
  });

  it("orders the changes by their last activity, the newest first, never by their ids", () => {
    const one = (id: string, lastAt: string | null): ChangeListEntry => ({
      ...(CHANGE_ROWS[2]?.change ?? CHANGE_ROWS[0]!.change),
      id,
      lastAt,
      closedAt: lastAt,
    });
    const sorted = newestFirst([
      one("2026-10-28-tracker-t5", "2026-10-28T05:00:00Z"),
      one("2026-10-28-comments", "2026-10-28T09:10:00Z"),
      one("2026-10-28-dense-list", "2026-10-28T10:28:00Z"),
    ]);
    expect(sorted.map((change) => change.id)).toEqual([
      "2026-10-28-dense-list",
      "2026-10-28-comments",
      "2026-10-28-tracker-t5",
    ]);
  });

  it("groups the open changes by state in the owner's order, then the finished by day or by plan", () => {
    const changes = newestFirst(CHANGE_ROWS.map((row) => row.change));
    const groups = listGroups(changes, "day", AT);
    expect(groups.map((group) => group.id.split(":")[0])).toEqual([
      "state",
      "state",
      "state",
      "state",
      "day",
    ]);
    expect(groups.slice(0, 4).map((group) => group.title)).toEqual([
      "Waiting on you",
      "In progress",
      "Stopped",
      "Unreadable",
    ]);
    // The finished by the day they closed, named by the reader's own calendar.
    expect(String(groups.at(-1)?.title)).toMatch(
      /^(Today|Yesterday|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2})$/,
    );
    const byPlan = listGroups(changes, "plan", AT);
    expect(byPlan.at(-1)?.title).toBe("No plan");
    // The list draws its summary without the tally, the chips with each count, a group per day.
    const drawn = draw(
      h(ChangesList, {
        changes,
        filter: "all",
        group: "day",
        at: AT,
        pick: unpicked,
        regroup: unpicked,
      }),
    );
    expect(drawn.text).toMatch(/^5 changes last closed /);
    expect(count(drawn, "ChangeRow")).toBe(5);
    expect(drawn.text).toContain("Waiting on you");
    expect(drawn.text).toContain("By day");
  });
});

describe("J-166 S1 Interface's page cards", () => {
  it("draws a card per page, the newest capture's tier alone, its scores as chips and the earlier captures folded", () => {
    const [page] = INTERFACE.pages.items;
    if (page === undefined) throw new Error("no page");
    const drawn = draw(
      h(PageCard, {
        page,
        visuals: new Map(),
        at: AT,
        capture: {
          ...CAPTURE.capture,
          widths: CAPTURE.capture.widths.map((width) => ({ ...width, image: null })),
        },
      }),
    );
    expect(drawn.components).toContain("PageCard");
    expect(drawn.text).toContain("/pricing");
    expect(count(drawn, "ScoreChips")).toBe(1);
    expect(drawn.text).toContain("floor 0 reflex 1 finish 3");
    expect(count(drawn, "Sparkline")).toBe(1);
    // The earlier capture is history, quiet, with no tier of its own.
    expect(drawn.text).toContain("1 earlier capture");
    expect(count(drawn, "CaptureHistory")).toBe(1);
    // A capture that kept no image draws its wireframe from its boxes.
    expect(count(drawn, "BoxWire")).toBe(1);
    expect(captureChange("2026-10-25-pricing-table/capture-pricing")).toBe(
      "2026-10-25-pricing-table",
    );
    expect(captureChange("interface/capture-home")).toBeNull();
  });

  it("draws a capture's boxes at the page's coordinates, landmarks filled, controls outlined, text as bars, the first screen by default", () => {
    const first = draw(h(BoxWire, { width: CAPTURE_PHONE, address: "/plans" }));
    expect(first.text).toContain("its first screen is drawn from its");
    const whole = draw(h(BoxWire, { width: CAPTURE_PHONE, address: "/plans", whole: true }));
    expect(whole.text).toContain("the page is drawn from its");
    expect(boxKind({ role: "main", tag: "main", text: "" })).toBe("landmark");
    expect(boxKind({ role: "button", tag: "button", text: "Start" })).toBe("control");
    expect(boxKind({ role: null, tag: "p", text: "Plans for teams" })).toBe("text");
    expect(boxKind({ role: null, tag: "div", text: "" })).toBe("box");
  });

  it("groups the cards by page, by change or by tier, the newest capture first", () => {
    const pages = INTERFACE.pages.items;
    expect(pageGroups(pages, "page")).toHaveLength(1);
    expect(pageGroups(pages, "tier").map((group) => group.key)).toEqual(["drifting"]);
    expect(pageGroups(pages, "change").map((group) => group.key)).toEqual([
      "2026-10-25-pricing-table",
    ]);
  });

  it("opens a capture at the width closest to the reader's window", () => {
    expect(openingWidth(CAPTURE.capture, undefined, 390)).toBe(390);
    expect(openingWidth(CAPTURE.capture, undefined, 1280)).toBe(1440);
    expect(openingWidth(CAPTURE.capture, undefined, 800)).toBe(768);
    expect(openingWidth(CAPTURE.capture, 1440, 390)).toBe(1440);
  });
});

describe("J-166 S1 Knowledge", () => {
  it("opens on a card per home, each with its question, what it holds and when it was written", () => {
    const cards = homeCards([DECISIONS_HOME, RECORDS_HOME], null, null, SETTINGS);
    expect(cards.map((card) => card.key)).toEqual([
      "decisions",
      "rulings",
      "adr",
      "atlas",
      "figures",
      "maps",
    ]);
    // The overview's words are the tabs' own: the atlas named Atlas, the maps and figures Maps (J-221 S1).
    expect(cards.map((card) => [card.title, card.address]).slice(-3)).toEqual([
      ["Atlas", "/knowledge/map"],
      ["Figures", "/knowledge/pictures"],
      ["Maps", "/knowledge/maps"],
    ]);
    const drawn = draw(h(KnowledgeOverview, { cards, at: AT }));
    expect(count(drawn, "HomeCard")).toBe(cards.length);
    expect(drawn.text).toContain("What did we decide, and why?");
    expect(drawn.text).toContain("2 sections, 1 root statement");
    expect(drawn.text).toContain("1 ruling");
    // An absent home is quiet and says what makes it: the map, the sentence to say to the agent.
    expect(drawn.text).toContain('Ask the agent "how does this code fit together?"');
  });

  it("names each change the book quotes by id, a link to its page, and leaves an id in code as written", () => {
    const names = namesOf(NAMES);
    const named = namedHtml(
      "<p>Chosen by 2026-10-24-cache-headers.</p><p><code>2026-10-24-cache-headers</code></p>",
      names,
    );
    expect(named).toContain(
      '<a href="/changes/2026-10-24-cache-headers" title="2026-10-24-cache-headers">Cache headers</a>',
    );
    expect(named).toContain("<code>2026-10-24-cache-headers</code>");
  });

  it("reads the book rendered, its source, and edits it in place with the consequence above Save and the draft's lines in their tones", () => {
    const read = draw(
      h(PolicyEditor, { settings: SETTINGS, home: DECISIONS_HOME, saved: unpicked }),
    );
    expect(read.components).toContain("PolicyEditor");
    expect(read.text).toContain("Read Source Edit");
    expect(read.text).toContain("Root statements");
    const source = draw(
      h(PolicyEditor, {
        settings: SETTINGS,
        home: DECISIONS_HOME,
        saved: unpicked,
        mode: "source",
      }),
    );
    expect(source.components).toContain("SourceView");
    const edit = draw(
      h(PolicyEditor, { settings: SETTINGS, home: DECISIONS_HOME, saved: unpicked, mode: "edit" }),
    );
    expect(edit.text).toContain(
      "Saving writes .greenline/DECISIONS.md; the agent reads it at its next turn. Installation sync is a separate action.",
    );
    expect(edit.text.indexOf("Saving writes")).toBeLessThan(edit.text.indexOf("Save decisions"));
    expect(draftLines("a\nb\nc", "a\nc\nd").map((line) => `${line.kind} ${line.line}`)).toEqual([
      "same a",
      "del b",
      "same c",
      "add d",
    ]);
  });

  it("says what the house rulings keep where none is written", () => {
    const empty = draw(
      h(RulingsEditor, {
        settings: { ...SETTINGS, houseRulings: { stanza: "", rulings: [] } },
        saved: unpicked,
      }),
    );
    expect(empty.text).toContain(
      "No house ruling yet. A ruling you give the agent for this repository is kept here.",
    );
  });
});

describe("J-166 S1 Practice", () => {
  it("opens on one sentence of health and a line per kind of finding with the act that clears it", () => {
    expect(healthSentence(PRACTICE)).toMatch(
      /^\d+ errors? of \d+ kinds? and \d+ warnings? of \d+ kinds? in greenline's health\.$/,
    );
    const drawn = draw(
      h(PracticeHome, { practice: PRACTICE, roster: ROSTER_DOCUMENT, settings: SETTINGS, at: AT }),
    );
    expect(count(drawn, "HealthGroups")).toBe(1);
    expect(count(drawn, "HealthAct")).toBe(PRACTICE.health.groups.length);
    expect(count(drawn, "RosterTile")).toBe(1);
    expect(count(drawn, "SettingsTile")).toBe(1);
    expect(drawn.text).toContain("Most loaded: frame 14");
    // A group of an installation out of step leads to the sync.
    const sync = draw(
      h(PracticeHome, {
        practice: {
          ...PRACTICE,
          health: {
            ...PRACTICE.health,
            groups: [
              {
                kind: "error",
                code: "GL0110",
                count: 51,
                text: "installed skills do not match; run greenline sync",
                address: null,
                findings: Array.from({ length: 51 }, () => ({})),
              },
            ],
          },
        },
        roster: null,
        settings: null,
        at: AT,
      }),
    );
    expect(sync.links).toContain("/practice/settings#sync");
  });

  it("J-232 S1 draws each finding of a group as its row, the group's message where the finding carries none of its own", () => {
    const group = {
      kind: "error" as const,
      code: "GL0405",
      count: 3,
      text: "the record links to a file not in its folder",
      address: null,
      findings: [
        { path: ".greenline/ledger/a.md" },
        {
          message: "the record links to a picture not in its folder",
          path: ".greenline/ledger/b.md",
        },
        {},
      ],
    };
    const drawn = draw(
      h(PracticeHome, {
        practice: { ...PRACTICE, health: { ...PRACTICE.health, groups: [group] } },
        roster: null,
        settings: null,
        at: AT,
      }),
    );
    expect(count(drawn, "DiagnosticRow")).toBe(3);
    const rows = drawn.text;
    // The group's title and the two rows that carry no message of their own.
    expect(rows.split(group.text).length - 1).toBe(3);
    expect(rows).toContain("the record links to a picture not in its folder");
    expect(rows).toContain(".greenline/ledger/a.md");
    expect(rows).toContain(".greenline/ledger/b.md");
  });

  it("answers a skill's page: its sentence, its loads over the line, the changes that loaded it and every load", () => {
    const drawn = draw(h(SkillPage, { document: SKILL_DOCUMENT, at: AT }));
    expect(drawn.components).toContain("SkillPage");
    expect(drawn.components).toContain("StepCells");
    expect(drawn.text).toContain(SKILL_DOCUMENT.skill.description);
    expect(drawn.text).toContain("14 loads");
    expect(drawn.text).toContain("Every load, as the hooks saw it");
    expect(drawn.links).toContain("/practice/roster");
  });

  it("draws the installation as a form, the skills grouped by kind, a bar naming what saving writes and the sync apart", () => {
    const drawn = draw(
      h(InstallationForm, {
        settings: SETTINGS,
        saved: unpicked,
        roster: ROSTER_DOCUMENT,
        outOfSync: 51,
      }),
    );
    expect(drawn.components).toContain("InstallationForm");
    expect(drawn.components).toContain("SyncBanner");
    expect(drawn.components).toContain("PendingBar");
    expect(drawn.text).toContain("The installed files do not match these settings: 51 files.");
    expect(drawn.text).toContain("Saving writes .greenline/manifest.json; the sync is separate.");
    expect(drawn.text).toContain("Steps");
    const before = {
      targets: ["claude-code"],
      proceed: "quick",
      trials: [],
      installed: ["frame", "prose"],
    };
    expect(
      pendingChanges(before, { ...before, installed: ["frame", "tdd"], proceed: "regular" }),
    ).toEqual(["proceed regular", "+ tdd", "− prose"]);
  });
});
