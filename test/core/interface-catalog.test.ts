import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import {
  catalogIssues,
  deal,
  dealText,
  parseCatalog,
  seedOf,
  sketchRows,
  specimenHtml,
  type CatalogEntry,
  type DealRequest,
} from "../../src/core/interface-catalog.ts";

/**
 * The interface catalog (J-123 S6): every entry held to the schema, its
 * provenance and the floor on its own colours; the deal drawing three
 * directions by the facets in play, the job and the material, the same
 * under the same seed; and every entry with tokens or a sketch rendering its
 * specimen from the data alone.
 */

const TEXT = readFileSync(
  join(import.meta.dirname, "../../corpus/interface/catalog/entries.json"),
  "utf8",
);
const ENTRIES = parseCatalog(TEXT) ?? [];
const FILE: {
  readonly schema: string;
  readonly recipe: string;
  readonly entries: readonly JsonValue[];
} = JSON.parse(TEXT);

/** The catalog file with one planted entry beside the real ones. */
const planted = (entry: JsonValue): string =>
  JSON.stringify({ ...FILE, entries: [...FILE.entries, entry] });

const PALETTE = {
  id: "planted-grey",
  kind: "palette",
  register: "site",
  platform: [],
  facets: { concern: ["colour"] },
  tokens: { colors: { ground: "#ffffff", ink: "#8a8a8a" } },
  contrast: [{ ink: "ink", ground: "ground", use: "text", ratio: 3.45 }],
  words: "A grey body ink on white.",
  provenance: {
    repository: "https://github.com/example/palettes",
    commit: "0".repeat(40),
    path: "palettes.md",
    licence: "mit",
    pin: "example",
    basis: "authored values in the source",
  },
};

const request = (overrides: Partial<DealRequest>): DealRequest => ({
  register: "site",
  platform: "web",
  seed: 11,
  reroll: false,
  ...overrides,
});

const ids = (directions: ReturnType<typeof deal>): readonly (readonly string[])[] =>
  directions.map((direction) => direction.parts.map((part) => part.entry.id));

describe("the catalog's entries", () => {
  it("hold to the schema, their provenance and the floor", () => {
    expect(ENTRIES).toHaveLength(FILE.entries.length);
    expect(catalogIssues(TEXT)).toEqual([]);
  });

  it("refuse a planted body ink at 3.8:1", () => {
    const issues = catalogIssues(
      planted({
        ...PALETTE,
        tokens: { colors: { ground: "#ffffff", ink: "#838383" } },
        contrast: [{ ink: "ink", ground: "ground", use: "text", ratio: 3.79 }],
      }),
    );
    expect(issues).toEqual([
      "planted-grey: ink on ground is 3.79:1, under the floor's 4.5:1 for text",
    ]);
    const large = catalogIssues(
      planted({
        ...PALETTE,
        tokens: { colors: { ground: "#ffffff", ink: "#838383" } },
        contrast: [{ ink: "ink", ground: "ground", use: "large", ratio: 3.79 }],
      }),
    );
    expect(large).toEqual([]);
  });

  it("refuse an entry with no provenance, a ratio its tokens do not give, colours with no pair, and nothing to show", () => {
    const { provenance: _gone, ...bare } = PALETTE;
    expect(catalogIssues(planted(bare)).join("\n")).toContain("provenance");
    expect(
      catalogIssues(
        planted({
          ...PALETTE,
          tokens: { colors: { ground: "#ffffff", ink: "#111111" } },
          contrast: [{ ink: "ink", ground: "ground", use: "text", ratio: 9 }],
        }),
      ),
    ).toEqual([expect.stringContaining("records 9:1, and its tokens give 18.88:1")]);
    expect(catalogIssues(planted({ ...PALETTE, contrast: [] }))).toEqual([
      "planted-grey: colours with no ink-on-ground pair named",
    ]);
    const { tokens: _none, contrast: _pairs, ...hollow } = PALETTE;
    expect(catalogIssues(planted(hollow))).toEqual([
      "planted-grey: a palette entry with neither tokens nor a sketch",
    ]);
    expect(catalogIssues(planted(FILE.entries[0] ?? {}))).toEqual([
      expect.stringContaining(": the id is named twice"),
    ]);
  });

  it("render a specimen for every entry with tokens or a sketch, from the data alone", () => {
    for (const entry of ENTRIES) {
      const html = specimenHtml(entry);
      expect(html, entry.id).toContain(`data-entry="${entry.id}"`);
      expect(html, entry.id).not.toMatch(/<(?:script|img|link)\b|url\(/);
    }
    const palette = ENTRIES.find((entry) => entry.kind === "palette");
    expect(palette === undefined ? "" : specimenHtml(palette)).toContain('class="gl-pair"');
  });

  it("place only colours, lengths and weights the style helpers read in a specimen", () => {
    const palette = ENTRIES.find((entry) => entry.kind === "palette");
    if (palette === undefined) throw new Error("no palette entry");
    const crafted: CatalogEntry = {
      ...palette,
      tokens: {
        colors: { ink: "#111", ground: "red;position:fixed;inset:0" },
        typography: {
          body: { fontSize: "1px;position:fixed", fontWeight: "bold", lineHeight: "2;top:0" },
        },
      },
      contrast: [{ ink: "ink", ground: "ground", use: "text", ratio: 12 }],
    };
    const html = specimenHtml(crafted) ?? "";
    expect(html).not.toMatch(/style="[^"]*position/);
    expect(html).toContain("background:transparent;color:#111");
    expect(html).toContain("font-size:16px;font-weight:400;line-height:1.3");
  });

  it("read a sketch's rows as proportions and slots", () => {
    expect(
      sketchRows([
        "row 1: columns 7/5; slot claim+action | slot proof-image",
        "column 1 (230px): slot navigation",
      ]),
    ).toEqual([
      {
        spans: [7, 5],
        slots: ["claim+action", "proof-image"],
        line: "row 1: columns 7/5; slot claim+action | slot proof-image",
      },
      {
        spans: [12],
        slots: ["(230px): slot navigation"],
        line: "column 1 (230px): slot navigation",
      },
    ]);
  });
});

describe("the deal", () => {
  it("draws three directions that differ entry by entry, the same under the same seed", () => {
    const first = deal(ENTRIES, request({ job: "sign-up" }));
    expect(first).toHaveLength(3);
    expect(ids(deal(ENTRIES, request({ job: "sign-up" })))).toEqual(ids(first));
    for (const role of ["material", "palette", "type", "composition"]) {
      const chosen = first.map(
        (direction) => direction.parts.find((part) => part.role === role)?.entry.id,
      );
      expect(new Set(chosen).size, role).toBe(3);
    }
    expect(
      first.every((direction) =>
        direction.parts.some((part) => part.role === "anatomy" && part.entry.id === "job-sign-up"),
      ),
    ).toBe(true);
  });

  it("draws again on the one reroll and under another seed", () => {
    const first = ids(deal(ENTRIES, request({})));
    expect(ids(deal(ENTRIES, request({ reroll: true })))).not.toEqual(first);
    expect(ids(deal(ENTRIES, request({ seed: 12 })))).not.toEqual(first);
    expect(seedOf("a")).toBe(seedOf("a"));
    expect(seedOf("a")).not.toBe(seedOf("b"));
  });

  it("deals only the entries whose register and platform match", () => {
    const app = deal(ENTRIES, request({ register: "app" })).flatMap((direction) =>
      direction.parts.map((part) => part.entry),
    );
    expect(app.every((entry) => entry.register !== "site")).toBe(true);
    expect(app.some((entry) => entry.kind === "shell" || entry.kind === "screen pattern")).toBe(
      true,
    );
    const site = deal(ENTRIES, request({})).flatMap((direction) =>
      direction.parts.map((part) => part.entry),
    );
    expect(site.every((entry: CatalogEntry) => entry.register !== "app")).toBe(true);
    const web = deal(ENTRIES, request({ register: "app", seed: 5 })).flatMap((direction) =>
      direction.parts.map((part) => part.entry),
    );
    expect(
      web.every((entry) => entry.platform.length === 0 || entry.platform.includes("web")),
    ).toBe(true);
  });

  it("never deals a composition that needs pictures to a product with none", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const parts = deal(ENTRIES, request({ seed, material: ["copy", "logo"] })).flatMap(
        (direction) => direction.parts,
      );
      expect(
        parts.filter(
          (part) =>
            part.role === "composition" &&
            (part.entry.sketch ?? []).some((line) => /image|photo/.test(line)),
        ),
      ).toEqual([]);
    }
  });

  it("prints each direction with its reasons, the job's anatomy once, and never the catalog whole", () => {
    const text = dealText(deal(ENTRIES, request({ job: "sign-up" })));
    expect(text).toMatch(/^Direction 1: .+\n- material: /);
    expect(text).toContain("\n\nDirection 3: ");
    expect(text.match(/The job's anatomy, for all three:/g)).toHaveLength(1);
    const named = ENTRIES.filter((entry) => text.includes(`: ${entry.id} (`));
    expect(named.length).toBeLessThan(ENTRIES.length / 2);
    expect(dealText([])).toBe(
      "No direction can be dealt: the catalog holds no entry for the facets in play.\n",
    );
  });
});
