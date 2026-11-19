import { describe, expect, it } from "vitest";
import {
  CONTRACT_DOCUMENTS,
  parseInspectorDocument,
} from "../../../src/core/inspector/contract.ts";
import { pathOf, placeOf, viewOf, type Place } from "../../../src/shell/inspect/app/addresses.ts";
import { CATALOGUE, COLOUR_ROLES } from "../../../src/shell/inspect/app/catalogue.ts";
import { stateTone } from "../../../src/shell/inspect/app/ui.ts";
import { HOUSE_COLOURS } from "../../../src/shell/inspect/page.ts";
import { fixtureDocuments } from "../../../src/shell/inspect/app/fixtures.ts";
import { commandFor } from "../../../src/shell/inspect/app/keys.ts";
import { matchEntries, paletteEntries } from "../../../src/shell/inspect/app/search.ts";

/**
 * The client app's pure parts: the addresses the agent prints and the shell
 * reads, the keys, the palette's matching, and the catalogue's fixtures held
 * to the contract's schemas. What the components draw is the render check's
 * (`scripts/check-inspect-render.mjs`), in a browser.
 */

const PLACES: readonly (readonly [string, Place])[] = [
  ["/", { page: "now" }],
  ["/changes", { page: "changes" }],
  ["/plans", { page: "plans" }],
  ["/changes/2026-10-08-sessions", { page: "change", id: "2026-10-08-sessions", part: null }],
  [
    "/changes/2026-10-08-sessions/files/review-1.md",
    { page: "change", id: "2026-10-08-sessions", part: null, file: "review-1.md" },
  ],
  [
    "/changes/2026-10-08-sessions/files/verify/browser/results.txt",
    { page: "change", id: "2026-10-08-sessions", part: null, file: "verify/browser/results.txt" },
  ],
  ["/plans/004-search/T2", { page: "plan", name: "004-search", part: "T2" }],
  ["/discussions", { page: "discussions" }],
  ["/discussions/2026-10-21-offline-mode", { page: "discussion", id: "2026-10-21-offline-mode" }],
  ["/knowledge/map", { page: "atlas", tab: "map" }],
  ["/knowledge/pictures", { page: "atlas", tab: "visuals" }],
  // The interactive maps and figures the two skills make (J-221 S1).
  ["/knowledge/maps", { page: "atlas", tab: "maps" }],
  ["/knowledge/map/http", { page: "subsystem", name: "http" }],
  [
    "/pictures/2026-10-24-cache-headers/request-flow",
    { page: "picture", id: "2026-10-24-cache-headers/request-flow" },
  ],
  ["/pictures/map/architecture", { page: "picture", id: "map/architecture" }],
  ["/pictures/subsystems/http/a-request", { page: "picture", id: "subsystems/http/a-request" }],
  ["/knowledge/decisions/storage", { page: "home", home: "decisions", part: "storage" }],
  ["/knowledge/adr/0001%20first.md", { page: "home", home: "adr", part: "0001 first.md" }],
  ["/practice/roster", { page: "roster" }],
  // Practice's home, its health (J-166 S1); the settings the installation as a form.
  ["/practice", { page: "practice" }],
  ["/practice/receipts", { page: "checks", tab: "receipts" }],
  ["/practice/settings", { page: "settings", tab: "installation" }],
  ["/practice/files", { page: "settings", tab: "files" }],
  // The house rulings, read and edited in Knowledge (J-166 S1).
  ["/knowledge/rulings", { page: "rulings" }],
  ["/catalogue", { page: "catalogue" }],
];

describe("the addresses", () => {
  it("reads every page's path as its place, and prints each place as that path", () => {
    for (const [path, place] of PLACES) {
      expect(placeOf(path), path).toEqual(place);
      expect(pathOf(place), path).toBe(path);
    }
  });

  it("reads a heading inside a plan document or a decision record, which the house renderer links to", () => {
    for (const [path, place] of [
      [
        "/plans/004-search/spec.md/scope",
        { page: "plan", name: "004-search", part: "spec.md", anchor: "scope" },
      ],
      [
        "/knowledge/adr/0001-typescript.md/context",
        { page: "home", home: "adr", part: "0001-typescript.md", anchor: "context" },
      ],
    ] as const) {
      expect(placeOf(path), path).toEqual(place);
      expect(pathOf(place), path).toBe(path);
    }
    expect(placeOf("/changes/a/b/c")).toBeUndefined();
    expect(placeOf("/pictures/a/b/c")).toBeUndefined();
    expect(placeOf("/pictures/request-flow")).toBeUndefined();
    expect(placeOf("/pictures/subsystems/http")).toBeUndefined();
  });

  it("J-142 S1, J-154 S3 reads a frame map's node, a deal's direction, the waiting part and the notes, and prints each back", () => {
    for (const [path, place, view] of [
      [
        "/changes/2026-10-08-sessions/waiting",
        { page: "change", id: "2026-10-08-sessions", part: "waiting" },
        "changes",
      ],
      ["/practice/roster/frame", { page: "roster", skill: "frame" }, "practice"],
      ["/interface", { page: "atlas", tab: "interfaces" }, "interface"],
      ["/interface/catalog", { page: "atlas", tab: "catalog" }, "interface"],
      ["/knowledge", { page: "atlas", tab: "homes" }, "knowledge"],
      ["/knowledge/documents/docs/a.md", { page: "document", path: "docs/a.md" }, "knowledge"],
      [
        "/changes/2026-10-08-sessions/frame-map/scope",
        { page: "change", id: "2026-10-08-sessions", part: "frame-map", anchor: "scope" },
        "changes",
      ],
      [
        "/changes/2026-10-08-sessions/deal/Calm%20Ledger",
        { page: "change", id: "2026-10-08-sessions", part: "deal", anchor: "Calm Ledger" },
        "changes",
      ],
      [
        "/changes/2026-10-08-sessions/loads",
        { page: "change", id: "2026-10-08-sessions", part: "loads" },
        "changes",
      ],
      ["/interface/notes", { page: "marks" }, "interface"],
      ["/interface/notes/m1a2b3c4", { page: "mark", id: "m1a2b3c4" }, "interface"],
    ] as const) {
      expect(placeOf(path), path).toEqual(place);
      expect(pathOf(place), path).toBe(path);
      expect(viewOf(place), path).toBe(view);
    }
    // Only the frame map and the deal hold anchors of their own; the frame step keeps the part frame.
    expect(placeOf("/changes/2026-10-08-sessions/frame")).toEqual({
      page: "change",
      id: "2026-10-08-sessions",
      part: "frame",
    });
    expect(placeOf("/changes/2026-10-08-sessions/frame/scope")).toBeUndefined();
    expect(placeOf("/changes/2026-10-08-sessions/loads/x")).toBeUndefined();
    expect(placeOf("/now/x")).toBeUndefined();
  });

  it("J-154 S3 reads no address of the first design: no converter, the not-found page answers each", () => {
    for (const path of [
      "/now",
      "/atlas",
      "/atlas/visuals",
      "/atlas/visuals/map/architecture",
      "/atlas/interfaces",
      "/atlas/interfaces/marks",
      "/atlas/interfaces/captures/interface/capture-home",
      "/atlas/homes/decisions",
      "/atlas/catalog",
      "/atlas/subsystems/http",
      "/atlas/documents/README.md",
      "/roster",
      "/checks",
      "/checks/receipts",
      "/settings",
      "/settings/files",
    ])
      expect(placeOf(path), path).toBeUndefined();
  });

  it("names no page for a path no page shows, an escape that does not decode, or a step out of the tree", () => {
    for (const path of [
      "/nowhere",
      "/changes/a/b/c",
      "/changes/a/files",
      "/knowledge/a/b/c/d",
      "/practice/other",
      "/changes/%E0",
      "/changes/..",
      "/plans/a%2Fb",
      "/practice/roster/x/y",
      "/a/b/c/d/e",
    ])
      expect(placeOf(path), path).toBeUndefined();
  });

  it("J-164 S1 puts every page under one of the five places, the catalogue apart", () => {
    expect(PLACES.map(([, place]) => viewOf(place))).toEqual([
      "desk",
      "changes",
      "changes",
      "changes",
      "changes",
      "changes",
      "changes",
      "changes",
      "changes",
      "knowledge",
      "knowledge",
      "knowledge",
      "knowledge",
      "knowledge",
      "knowledge",
      "knowledge",
      "knowledge",
      "knowledge",
      "practice",
      "practice",
      "practice",
      "practice",
      "practice",
      "knowledge",
      "catalogue",
    ]);
  });
});

describe("the keys", () => {
  const none = { meta: false, ctrl: false, alt: false };
  it("gives every action a key, and `g` then a place's letter that place", () => {
    expect(commandFor("/", none, false, false)).toEqual({ kind: "palette" });
    expect(commandFor("k", { ...none, meta: true }, true, false)).toEqual({ kind: "palette" });
    expect(commandFor("g", none, false, false)).toEqual({ kind: "await-view" });
    expect(commandFor("p", none, false, true)).toEqual({ kind: "go", path: "/practice" });
    expect(commandFor("d", none, false, true)).toEqual({ kind: "go", path: "/" });
    for (const [key, kind] of [
      ["j", "next"],
      ["k", "previous"],
      ["r", "reload"],
      ["t", "theme"],
      ["c", "copy"],
      ["?", "keys"],
      ["Escape", "back"],
    ] as const)
      expect(commandFor(key, none, false, false), key).toEqual({ kind });
  });

  it("leaves a key typed in a field to the field, but for Escape and the palette's chord", () => {
    expect(commandFor("r", none, true, false)).toBeUndefined();
    expect(commandFor("Escape", none, true, false)).toEqual({ kind: "back" });
    expect(commandFor("k", { ...none, ctrl: true }, true, false)).toEqual({ kind: "palette" });
    expect(commandFor("r", { ...none, meta: true }, false, false)).toBeUndefined();
  });
});

describe("the palette", () => {
  it("reaches the records the lists hold, every view and tab as a page, and the actions", () => {
    const documents = fixtureDocuments();
    const changes = documents.find((document) => document.kind === "changes");
    const plans = documents.find((document) => document.kind === "plans");
    if (changes?.kind !== "changes" || plans?.kind !== "plans") throw new Error("fixtures");
    const entries = paletteEntries({ changes, plans });
    const groups = new Set(entries.map((entry) => entry.group));
    expect([...groups]).toEqual(["Changes", "Plans", "Pages", "Actions"]);
    expect(matchEntries("cache headers", entries)[0]).toMatchObject({
      group: "Changes",
      target: { path: "/changes/2026-10-24-cache-headers" },
    });
    expect(matchEntries("receipts", entries).map((entry) => entry.label)).toContain(
      "Receipts, a tab of Practice",
    );
    expect(matchEntries("theme", entries)[0]).toMatchObject({ target: { action: "theme" } });
    expect(matchEntries("no such words at all", entries)).toEqual([]);
  });
});

describe("the one vocabulary of states", () => {
  it("gives every state its tone, waiting on you apart, done and passed green, the step now the accent", () => {
    const drawn = (words: readonly string[]): Record<string, string> =>
      Object.fromEntries(
        words.map((word) => {
          const { tone, settled } = stateTone(word);
          return [word, `${tone}${settled ? ", filled" : ", outlined"}`];
        }),
      );
    expect(
      drawn([
        "waiting",
        "in-progress",
        "now",
        "stopped",
        "done",
        "dropped",
        "proposed",
        "passed",
        "failed",
        "unfinished",
        "not-run",
        "fresh",
        "drifting",
        "stale",
        "open",
        "addressed",
        "declined",
        "written",
        "skipped",
      ]),
    ).toEqual({
      waiting: "need, outlined",
      "in-progress": "accent, outlined",
      now: "accent, outlined",
      stopped: "idle, outlined",
      done: "pass, filled",
      dropped: "idle, filled",
      proposed: "plain, outlined",
      passed: "pass, filled",
      failed: "fail, filled",
      unfinished: "fail, filled",
      "not-run": "idle, outlined",
      fresh: "pass, filled",
      drifting: "warn, outlined",
      stale: "fail, filled",
      open: "accent, outlined",
      addressed: "pass, filled",
      declined: "idle, filled",
      written: "pass, filled",
      skipped: "idle, filled",
    });
  });

  it("draws a word it does not know plainly, never as a state it is not", () => {
    expect(stateTone("a word no record uses")).toEqual({ tone: "plain", settled: false });
  });
});

describe("the catalogue's fixtures", () => {
  it("each validate against their document's schema", () => {
    for (const document of fixtureDocuments()) {
      const parsed = parseInspectorDocument(JSON.parse(JSON.stringify(document)));
      if (parsed._tag === "err")
        throw new Error(
          `${document.kind}: ${parsed.error.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
        );
    }
  });

  it("open on the look: every house colour by its role, in the token table's order, and the type scale", () => {
    expect(CATALOGUE[0]?.kind).toBe("the look");
    expect(CATALOGUE[0]?.specimens.map((specimen) => specimen.component)).toEqual([
      "ColourTokens",
      "TypeScale",
    ]);
    expect(COLOUR_ROLES.flatMap((group) => group.tokens.map((token) => token.name))).toEqual(
      HOUSE_COLOURS.map((token) => token.name),
    );
    const shared = CATALOGUE.find((kind) => kind.kind === "shared");
    expect(shared?.specimens.map((specimen) => specimen.component)).toEqual(
      expect.arrayContaining(["StateWord", "Tag", "Button", "Kbd", "Callout", "Empty"]),
    );
  });

  it("carry no top-level error, the key the app reads as a refusal (J-154 S3)", () => {
    for (const document of fixtureDocuments())
      expect(Object.keys(document), document.kind).not.toContain("error");
  });

  it("cover every artefact kind the contract serves, each with at least one fixture per component", () => {
    const kinds = new Set(CATALOGUE.map((entry) => entry.kind));
    for (const entry of CONTRACT_DOCUMENTS)
      if (entry.kind !== "contract") expect(kinds, entry.artefact).toContain(entry.artefact);
    for (const kind of CATALOGUE)
      for (const specimen of kind.specimens)
        expect(specimen.fixtures.length, specimen.component).toBeGreaterThan(0);
  });
});
