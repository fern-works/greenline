/**
 * The atlas's index and its facts (J-147 S1): the refresh's cost, the
 * major-change reading and its words, and the atlas line the mirror and
 * status print; the index remembers no offer (J-176 S1).
 */
import { describe, expect, it } from "vitest";
import {
  atlasLine,
  majorChange,
  majorWords,
  parseAtlas,
  type MajorFacts,
} from "../../src/core/atlas.ts";

const ATLAS = {
  schema: "greenline.atlas/v1",
  layers: ["entry", "core"],
  subsystems: [
    {
      name: "loans",
      title: "Loans",
      layer: "core",
      summary: "Lends a book.",
      files: ["src/loans/"],
      commit: "0123abc",
      read: "2026-10-28",
      calls: [],
    },
  ],
  refreshes: [
    {
      change: "2026-10-28-loans",
      commit: "0123abc",
      whole: false,
      pages: ["loans"],
      greenline: "0.2.0",
      cost: "one agent, four minutes",
    },
  ],
};

const NONE: MajorFacts = {
  newModules: [],
  modelPaths: [],
  spanned: [],
  mapBehind: 3,
  drifting: 0,
  pages: 6,
};

describe("J-147 S1 the atlas's index keeps the refresh's cost, and no offer (J-176 S1)", () => {
  it("reads the cost, and an index with no pages and no layers yet", () => {
    expect(parseAtlas(JSON.stringify(ATLAS), "atlas.json")._tag).toBe("ok");
    const empty = { schema: "greenline.atlas/v1", layers: [], subsystems: [], refreshes: [] };
    expect(parseAtlas(JSON.stringify(empty), "atlas.json")._tag).toBe("ok");
  });

  it("refuses an index that still holds the offers it once remembered", () => {
    const offers = [{ subject: "the map", kind: "map", answer: "no" }];
    expect(parseAtlas(JSON.stringify({ ...ATLAS, offers }), "a")._tag).toBe("err");
  });
});

describe("J-147 S1 the major change since the map", () => {
  it("reads nothing below the thresholds", () => {
    expect(majorChange(NONE)).toBeUndefined();
    expect(
      majorChange({ ...NONE, mapBehind: 19, drifting: 1, spanned: ["loans"] }),
    ).toBeUndefined();
  });

  it("names each fact in the row's order: a module, a shape, a span, twenty commits, a third of the pages", () => {
    expect(
      majorChange({ ...NONE, newModules: ["billing"], modelPaths: ["db/schema.sql"] }),
    ).toEqual({
      kind: "module",
      module: "billing",
    });
    expect(majorChange({ ...NONE, modelPaths: ["db/schema.sql"] })).toEqual({
      kind: "model",
      path: "db/schema.sql",
    });
    expect(majorChange({ ...NONE, spanned: ["loans", "members"] })).toEqual({
      kind: "span",
      subsystems: ["loans", "members"],
    });
    expect(majorChange({ ...NONE, mapBehind: 20 })).toEqual({ kind: "commits", commits: 20 });
    expect(majorChange({ ...NONE, drifting: 2 })).toEqual({ kind: "pages", drifting: 2, pages: 6 });
    expect(majorChange({ ...NONE, mapBehind: null, pages: 0 })).toBeUndefined();
  });

  it("says each fact in the owner's words", () => {
    expect(majorWords({ kind: "module", module: "billing" })).toBe(
      "a new top-level module, billing/, holds code",
    );
    expect(majorWords({ kind: "span", subsystems: ["loans", "members"] })).toBe(
      "this change spans loans and members",
    );
    expect(majorWords({ kind: "commits", commits: 21 })).toBe(
      "21 commits touched the map's files since it was made",
    );
    expect(majorWords({ kind: "pages", drifting: 2, pages: 6 })).toBe(
      "2 of the atlas's 6 pages drift",
    );
  });
});

describe("J-147 S1 the atlas line", () => {
  it("says none, and a major change since the map as a fact, never an offer", () => {
    expect(atlasLine({ pages: 0, drifting: 0, mapBehind: null })).toBe("atlas: none");
    expect(
      atlasLine({
        pages: 0,
        drifting: 0,
        mapBehind: null,
        major: { kind: "module", module: "billing" },
      }),
    ).toBe(
      "atlas: none; a major change since the map: a new top-level module, billing/, holds code",
    );
  });

  it("counts the pages, the drifting ones and the map's commits behind, the major change and the pages the close refreshes", () => {
    expect(atlasLine({ pages: 4, drifting: 1, mapBehind: 3 })).toBe(
      "atlas: 4 pages, 1 drifting; map 3 commits behind",
    );
    expect(atlasLine({ pages: 1, drifting: 0, mapBehind: null })).toBe("atlas: 1 page, 0 drifting");
    expect(
      atlasLine({
        pages: 4,
        drifting: 2,
        mapBehind: 1,
        major: { kind: "pages", drifting: 2, pages: 4 },
        touched: ["loans", "map"],
      }),
    ).toBe(
      "atlas: 4 pages, 2 drifting; map 1 commit behind; a major change since the map: 2 of the atlas's 4 pages drift; this change touched loans, map: the close refreshes them",
    );
  });
});

describe("J-147 the atlas line past the close's three pages", () => {
  it("leaves the pages past the close's three to the owner's ask", () => {
    expect(
      atlasLine({
        pages: 6,
        drifting: 4,
        mapBehind: null,
        touched: ["a", "b", "c", "d"],
      }),
    ).toBe(
      "atlas: 6 pages, 4 drifting; this change touched 4 pages, more than the three the close refreshes: the rest wait for the owner's ask",
    );
  });
});
