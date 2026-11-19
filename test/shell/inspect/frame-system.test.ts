import { h } from "preact";
import { describe, expect, it } from "vitest";
import {
  PLACE_TABS,
  pathOf,
  placeOf,
  tabOfPlace,
  viewOf,
  VIEWS,
} from "../../../src/shell/inspect/app/addresses.ts";
import { commandFor } from "../../../src/shell/inspect/app/keys.ts";
import { placesShown } from "../../../src/shell/inspect/app/bar.ts";
import {
  ArtefactFold,
  Delta,
  deltaBlocks,
  FileRow,
  FilesLine,
  Group,
  groupOpens,
  LinesDelta,
  liveWords,
  nextView,
  ReadState,
  SectionHead,
  viewAddress,
  viewAsked,
  worstState,
} from "../../../src/shell/inspect/app/ui.ts";
import { COMPONENT_STYLE, HOUSE_COLOURS } from "../../../src/shell/inspect/page.ts";
import { count, draw } from "./draw.ts";

/**
 * J-164 S1, the viewer's frame and system: the five places in the bar with
 * their keys and the old addresses still answering, the group's open rules
 * and its closed head, the fold's three views and the address that follows
 * it, the lines added and removed in their two tones, the read states, and
 * the tokens the section system and the colour rules read.
 */

const none = { meta: false, ctrl: false, alt: false };

describe("J-164 S1 the five places", () => {
  it("names Desk, Changes, Interface, Knowledge and Practice in the bar, each with its key after g", () => {
    expect(VIEWS.map((view) => [view.label, view.path, view.key])).toEqual([
      ["Desk", "/", "d"],
      ["Changes", "/changes", "c"],
      ["Interface", "/interface", "i"],
      ["Knowledge", "/knowledge", "k"],
      ["Practice", "/practice", "p"],
    ]);
    for (const [key, path] of [
      ["d", "/"],
      ["c", "/changes"],
      ["i", "/interface"],
      ["k", "/knowledge"],
      ["p", "/practice"],
    ] as const)
      expect(commandFor(key, none, false, true), key).toEqual({ kind: "go", path });
    // Atlas and Checks name no place, and their old letters reach nothing.
    expect(VIEWS.map((view) => view.label)).not.toContain("Atlas");
    expect(VIEWS.map((view) => view.label)).not.toContain("Checks");
    expect(commandFor("a", none, false, true)).toBeUndefined();
    expect(commandFor("s", none, false, true)).toBeUndefined();
  });

  it("keeps every address of the merged app answering, each lit under its place", () => {
    for (const [path, view, tab] of [
      ["/", "desk", undefined],
      ["/changes", "changes", "Changes"],
      ["/plans", "changes", "Plans"],
      ["/plans/004-search", "changes", "Plans"],
      ["/discussions", "changes", "Discussions"],
      ["/discussions/2026-10-21-offline-mode", "changes", "Discussions"],
      ["/changes/2026-10-08-sessions/review", "changes", "Changes"],
      ["/interface", "interface", "Pages"],
      ["/interface/catalog", "interface", "Catalog"],
      ["/interface/notes", "interface", "Your notes"],
      ["/interface/notes/m1a2b3c4", "interface", "Your notes"],
      // Knowledge's overview, the decisions book and the house rulings read and edited there (J-166 S1).
      ["/knowledge", "knowledge", "Overview"],
      ["/knowledge/decisions", "knowledge", "Decisions"],
      ["/knowledge/glossary", "knowledge", "Overview"],
      ["/knowledge/rulings", "knowledge", "House rulings"],
      ["/knowledge/pictures", "knowledge", "Pictures"],
      ["/knowledge/maps", "knowledge", "Maps"],
      // The atlas's tab is named Atlas, its address kept (J-221 S1).
      ["/knowledge/map", "knowledge", "Atlas"],
      ["/knowledge/map/http", "knowledge", "Subsystems"],
      ["/knowledge/subsystems", "knowledge", "Subsystems"],
      ["/knowledge/documents/docs/a.md", "knowledge", "Subsystems"],
      ["/pictures/map/architecture", "knowledge", "Pictures"],
      ["/practice", "practice", "Health"],
      ["/practice/checks", "practice", "Checks"],
      ["/practice/roster", "practice", "Roster"],
      ["/practice/roster/frame", "practice", "Roster"],
      ["/practice/settings", "practice", "Settings"],
      ["/practice/files", "practice", "Installed files"],
      ["/practice/receipts", "practice", "Receipts"],
    ] as const) {
      const place = placeOf(path);
      if (place === undefined) throw new Error(`${path} answers no page`);
      expect(pathOf(place), path).toBe(path);
      expect(viewOf(place), path).toBe(view);
      expect(tabOfPlace(place), path).toBe(tab);
    }
  });

  it("gives every place's tabs an address that answers, the place's own first", () => {
    for (const view of VIEWS) {
      const tabs = PLACE_TABS[view.name];
      if (tabs.length > 0) expect(pathOf(tabs[0]?.place ?? { page: "now" })).toBe(view.path);
      for (const tab of tabs) expect(placeOf(pathOf(tab.place)), tab.label).toEqual(tab.place);
    }
  });

  it("hides Interface where the workspace has no app, but on Interface's own page", () => {
    const names = (shown: readonly { readonly name: string }[]): string[] =>
      shown.map((view) => view.name);
    expect(names(placesShown(true, "desk"))).toHaveLength(5);
    expect(names(placesShown(undefined, "desk"))).toHaveLength(5);
    expect(names(placesShown(false, "desk"))).toEqual(["desk", "changes", "knowledge", "practice"]);
    expect(names(placesShown(false, "interface"))).toContain("interface");
  });
});

describe("J-164 S1 the keys", () => {
  it("moves over heads and rows, toggles, opens and closes a fold, all of them, and turns its view", () => {
    for (const [key, kind] of [
      ["j", "next"],
      ["k", "previous"],
      ["o", "toggle"],
      ["l", "open"],
      ["h", "close"],
      ["]", "open-all"],
      ["[", "close-all"],
      ["v", "view"],
      ["Escape", "back"],
    ] as const)
      expect(commandFor(key, none, false, false), key).toEqual({ kind });
    // A key typed in a field stays the field's.
    expect(commandFor("v", none, true, false)).toBeUndefined();
    expect(commandFor("o", none, true, false)).toBeUndefined();
  });
});

describe("J-164 S1 the group", () => {
  it("opens for the step now or anything waiting, a failed, error, stale or waiting tally, or three items or fewer", () => {
    expect(groupOpens(12, [["done", 12]], false)).toBe(false);
    expect(groupOpens(12, [["done", 12]], true)).toBe(true);
    for (const word of ["failed", "error", "stale", "waiting"])
      expect(
        groupOpens(
          12,
          [
            ["done", 11],
            [word, 1],
          ],
          false,
        ),
        word,
      ).toBe(true);
    expect(groupOpens(12, [["failed", 0]], false)).toBe(false);
    expect(groupOpens(3, [], false)).toBe(true);
    expect(groupOpens(4, [["drifting", 4]], false)).toBe(false);
  });

  it("shows the worst state's mark while closed: failed before waiting before drifting before done", () => {
    expect(
      worstState([
        ["done", 3],
        ["drifting", 1],
      ]),
    ).toBe("drifting");
    expect(
      worstState([
        ["done", 3],
        ["waiting", 1],
        ["drifting", 1],
      ]),
    ).toBe("waiting");
    expect(
      worstState([
        ["waiting", 1],
        ["failed", 1],
      ]),
    ).toBe("failed");
    expect(
      worstState([
        ["failed", 0],
        ["done", 2],
      ]),
    ).toBe("done");
    expect(worstState([])).toBeNull();
  });

  it("draws its head with its title, count, tally and quantity, and a group of one flat", () => {
    const closed = draw(
      h(
        Group,
        {
          id: "finished",
          title: "Finished",
          count: 15,
          tally: [
            ["done", 14],
            ["stale", 0],
            ["dropped", 1],
          ],
          quantity: h(Delta, { added: 719, removed: 94 }),
        },
        h("p", null, "the rows"),
      ),
    );
    expect(closed.components).toContain("Group");
    expect(closed.text).toContain("Finished 15 14 done 1 dropped +719 −94");
    expect(closed.text).not.toContain("stale");
    const one = draw(h(Group, { id: "one", title: "A folder", count: 1 }, h("p", null, "a file")));
    expect(one.text).toBe("a file");
  });
});

describe("J-164 S1 the fold of one artefact", () => {
  it("turns Read, Source and JSON in order, reads a view from its address, and writes it back", () => {
    expect(nextView(["read", "source", "json"], "read")).toBe("source");
    expect(nextView(["read", "source", "json"], "json")).toBe("read");
    expect(nextView(["read", "json"], "read")).toBe("json");
    expect(viewAsked("?view=source", ["read", "source", "json"])).toBe("source");
    expect(viewAsked("?view=source", ["read", "json"])).toBeUndefined();
    expect(viewAsked("", ["read", "source", "json"])).toBeUndefined();
    expect(viewAddress("/changes/a/review", "read")).toBe("/changes/a/review");
    expect(viewAddress("/changes/a/review", "json")).toBe("/changes/a/review?view=json");
  });

  it("closed, shows its facts and carries its address, its body unread", () => {
    const drawn = draw(
      h(ArtefactFold<"step">, {
        id: "review",
        kind: "step",
        component: "StepFold",
        head: h("span", null, "review written"),
        open: false,
        address: "/changes/a/review",
        closed: "/changes/a",
        document: {
          address: "/api/changes/a/steps/review",
          kind: "step",
          reads: "this step's words",
          read: (document) => document.section.text,
          source: (document) => document.section.text,
        },
      }),
    );
    expect(drawn.components).toEqual(["StepFold"]);
    expect(drawn.text).toBe("review written");
    expect(drawn.links).toContain("/changes/a/review");
  });

  it("open, reads its document, and draws held content in its Read view at once", () => {
    const reading = draw(
      h(ArtefactFold<"step">, {
        id: "review",
        kind: "step",
        component: "StepFold",
        head: "review",
        open: true,
        address: "/changes/a/review",
        closed: "/changes/a",
        document: {
          address: "/api/changes/a/steps/review",
          kind: "step",
          reads: "this step's words",
          read: (document) => document.section.text,
          source: (document) => document.section.text,
        },
      }),
    );
    expect(reading.text).toContain("Reading this step's words.");
    const held = draw(
      h(ArtefactFold, {
        id: "record",
        kind: "front matter",
        component: "RecordFold",
        head: "The record's front matter",
        open: true,
        address: null,
        closed: null,
        held: { read: () => "the facts", source: null, json: { text: "{}", address: null } },
      }),
    );
    expect(held.text).toBe("The record's front matter the facts");
  });
});

describe("J-164 S1 the lines added and removed", () => {
  it("reads +n in the add tone and −n in the del tone, U+2212 the minus", () => {
    const drawn = draw(h(Delta, { added: 148, removed: 57 }));
    expect(drawn.text).toBe("+148 −57");
    expect(drawn.components).toEqual(["Delta"]);
    expect(draw(h(Delta, { added: null, removed: 3 })).text).toBe("binary");
    expect(draw(h(LinesDelta, { added: 148, removed: 57 })).components).toEqual(["LinesDelta"]);
  });

  it("splits five blocks between the two, each side with a line keeping one", () => {
    expect(deltaBlocks(0, 0)).toEqual(["none", "none", "none", "none", "none"]);
    expect(deltaBlocks(148, 57)).toEqual(["add", "add", "add", "add", "del"]);
    expect(deltaBlocks(1000, 1)).toEqual(["add", "add", "add", "add", "del"]);
    expect(deltaBlocks(5, 0)).toEqual(["add", "add", "add", "add", "add"]);
    expect(deltaBlocks(0, 2)).toEqual(["del", "del", "del", "del", "del"]);
    for (const [added, removed] of [
      [3, 3],
      [1, 1],
      [7, 2],
    ] as const)
      expect(deltaBlocks(added, removed)).toHaveLength(5);
  });

  it("draws the files line as parts and a file as a row of its name, +n, −n and its bar", () => {
    const line = draw(
      h(FilesLine, {
        files: {
          groups: [
            { folder: "src/web", count: 3, files: [] },
            { folder: "test", count: 2, files: [] },
            { folder: ".", count: 1, files: [] },
            { folder: "docs", count: 1, files: [] },
          ],
          totals: { files: 7, added: 148, removed: 57 },
          installed: 68,
          unknown: null,
        },
      }),
    );
    expect(line.text).toBe(
      "7 files +148 −57 in src/web/ test/ the root and 1 more folder and 68 of greenline's own",
    );
    const row = draw(h(FileRow, { path: "src/web/comments.ts", added: 130, removed: 17 }));
    expect(row.text).toBe("comments.ts +130 −17");
    expect(row.components).toEqual(["FileRow"]);
  });
});

describe("J-164 S1 the bar's read age and the read states", () => {
  it("says Live within a minute, the age after, Stopped once the inspector stops answering", () => {
    const read = new Date("2026-10-31T10:00:00Z");
    expect(liveWords(read, new Date("2026-10-31T10:00:40Z"), true)).toEqual({
      state: "live",
      words: "Live",
    });
    expect(liveWords(read, new Date("2026-10-31T10:03:10Z"), true)).toEqual({
      state: "behind",
      words: "Read 3 min ago",
    });
    expect(liveWords(read, new Date("2026-10-31T12:30:00Z"), true).words).toBe("Read 2 h ago");
    expect(liveWords(read, new Date("2026-10-31T10:00:10Z"), false)).toEqual({
      state: "stopped",
      words: "Stopped",
    });
  });

  it("draws a skeleton of the section's form while it reads, and one quiet empty state", () => {
    const rows = draw(h(ReadState, { face: "loading", reads: "the changes" }));
    expect(rows.text).toBe("Reading the changes.");
    const empty = draw(h(ReadState, { face: "empty", title: "No change yet." }));
    expect(empty.text).toBe("No change yet.");
    // No box: the one empty state is a quiet line.
    const rule = /\.empty \{([^}]*)\}/.exec(COMPONENT_STYLE)?.[1] ?? "";
    expect(rule).not.toContain("border");
    expect(rule).toContain("color: var(--ink-3)");
    expect(COMPONENT_STYLE).toContain('.skeleton[data-form="rows"]');
    expect(COMPONENT_STYLE).toContain('.skeleton[data-form="cards"]');
  });

  it("heads a section in the section's size with its count", () => {
    const head = draw(h(SectionHead, { title: "Documents", count: 4, aside: "newest today" }));
    expect(head.text).toBe("Documents 4 newest today");
    expect(count(head, "SectionHead")).toBe(1);
  });
});

describe("J-164 S1 the tokens and the colour rules", () => {
  const value = (name: string, look: "light" | "dark"): string => {
    const token = HOUSE_COLOURS.find((entry) => entry.name === name);
    if (token === undefined) throw new Error(`no token ${name}`);
    return token[look];
  };

  it("lifts the light page off its cards, raises the dark cards, and adds the group band and the add and del pair", () => {
    expect(value("canvas", "light")).toBe("#fbfbfb");
    expect(value("raised", "light")).toBe("#ffffff");
    expect(value("sunk", "light")).toBe("#f4f4f5");
    expect(value("raised", "dark")).toBe("#151618");
    expect(value("group", "dark")).toBe("#1c1c1f");
    expect(value("add", "light")).toBe(value("pass", "light"));
    expect(value("del", "dark")).toBe(value("fail", "dark"));
  });

  it("writes the section system and the colour rules into the stylesheet once", () => {
    for (const rule of [
      ".section-head",
      ".listbox",
      ".group > .group-head",
      ".delta",
      ".meter > span { display: block; height: 100%; background: var(--meter); }",
      ".diff-line.add { background: var(--add-wash); box-shadow: inset 2px 0 var(--add-edge);",
      '.word[data-fact="yes"]::before { display: none; }',
      ".rows .word, tbody .word, .fold > summary .word { color: var(--ink-3); }",
    ])
      expect(COMPONENT_STYLE, rule).toContain(rule);
    // One diff rule, the sunk well of the old second one gone.
    expect(COMPONENT_STYLE.match(/^\.diff \{/gm)).toBeNull();
    // A quantity is never drawn in the done green.
    expect(COMPONENT_STYLE).not.toMatch(/\.meter[^{]*\{[^}]*var\(--pass\)/);
  });
});
