import type {
  CaptureView,
  CaptureWidthView,
  CatalogEntryView,
  DealDocument,
  InterfaceChecksDocument,
  InterfaceDocument,
  NotesReading,
  Read,
  Ref,
  VisualView,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";

/** When the specimens were read, as the server stamps every document. */
export const READ: Read = { at: "2026-10-26T12:00:00.000Z", revision: "specimen" };

/** A note's reference: its words. */
function noteRef(id: string, words: string): Ref {
  return { id, name: words, address: pathOf({ page: "mark", id }) };
}

/*
 * The interface components' fixtures (J-123 S7): a palette and a hero as
 * the catalog browser shows them, a deal of three directions with their
 * composites, the Interfaces tab with a address captured twice and a drift,
 * and a change's interface with its check by tier and a pick. The specimens
 * and composites are small pages written here, as the server renders them
 * from the data, so the catalogue reads nothing.
 */

const SPECIMEN_PALETTE =
  '<figure class="gl-specimen" data-entry="stone-one-accent" data-kind="palette"><div class="gl-pair" style="background:#f4f3ef;color:#1d1d1b">ink on ground, 16.2:1</div><div class="gl-pair" style="background:#f4f3ef;color:#b3261e">accent on ground, 5.9:1</div><div class="gl-swatches"><span class="gl-swatch" style="background:#f4f3ef"></span><span class="gl-swatch" style="background:#1d1d1b"></span><span class="gl-swatch" style="background:#b3261e"></span></div><figcaption>stone-one-accent, palette, both</figcaption></figure>';

const SPECIMEN_HERO =
  '<figure class="gl-specimen" data-entry="hero-even-split" data-kind="hero"><div class="gl-row" style="grid-template-columns:6fr 6fr"><span class="gl-slot">claim+action</span><span class="gl-slot">proof-image</span></div><figcaption>hero-even-split, hero, site</figcaption></figure>';

/** Two entries as the catalog browser lists them. */
export const CATALOG_ENTRIES: readonly CatalogEntryView[] = [
  {
    id: "stone-one-accent",
    kind: "palette",
    register: "both",
    platform: [],
    concerns: ["colour"],
    components: [],
    words:
      "Warm stone greys with one strong accent, used sparingly for a rule, a link or a single action.",
    source: "swiss-design",
    seen: null,
    specimen: SPECIMEN_PALETTE,
  },
  {
    id: "hero-even-split",
    kind: "hero",
    register: "site",
    platform: [],
    concerns: [],
    components: ["hero"],
    words: "The claim and the action on one half, the proof on the other, at even weight.",
    source: "https://stripe.com/",
    seen: "2026-10-24",
    specimen: SPECIMEN_HERO,
  },
];

/** A composite page as the server renders one, in a ground and an accent. */
function composite(ground: string, accent: string, title: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>${title}</title><style>body{margin:0;background:${ground};color:#1d1d1b;font:16px/1.5 system-ui,sans-serif}nav{padding:16px 24px;border-bottom:1px solid rgba(0,0,0,.14)}main{padding:24px}.action{display:inline-block;background:${accent};color:#fff;padding:10px 18px;border-radius:6px}</style></head><body><nav><strong>Name</strong></nav><main><h1>A claim in one line</h1><a class="action">Start</a></main></body></html>`;
}

/** A deal of three directions for a change, the second picked. */
export const DEAL: DealDocument = {
  schema: "greenline.inspect/v2",
  read: READ,
  kind: "deal",
  change: "2026-10-25-pricing-table",
  register: "site",
  job: "sign-up",
  catalog: "4230c655b9ed",
  seed: 1428,
  reroll: false,
  dealt: true,
  directions: {
    available: true,
    items: [
      {
        index: 1,
        name: "layered-soft-elevation with hero-full-bleed",
        parts: [
          {
            role: "material",
            id: "layered-soft-elevation",
            kind: "material",
            words: "Cards lifted by two soft shadows tinted toward the navy.",
          },
        ],
        light: composite("#ffffff", "#635bff", "Direction 1"),
        dark: null,
      },
      {
        index: 2,
        name: "hairline-flat with split-hero-three-column",
        parts: [
          {
            role: "material",
            id: "hairline-flat",
            kind: "material",
            words: "Flat surfaces separated by hairline rules.",
          },
        ],
        light: composite("#fafafa", "#111111", "Direction 2"),
        dark: composite("#0a0a0a", "#ededed", "Direction 2, dark"),
      },
      {
        index: 3,
        name: "layered-shadow-ring with banded-platform-page",
        parts: [
          {
            role: "material",
            id: "layered-shadow-ring",
            kind: "material",
            words: "Elevation from stacked shadows, finished with a one-pixel ring.",
          },
        ],
        light: composite("#f4f3ef", "#b3261e", "Direction 3"),
        dark: null,
      },
    ],
  },
  pick: {
    generatedBy: "greenline inspect",
    change: "2026-10-25-pricing-table",
    direction: 2,
    name: "hairline-flat with split-hero-three-column",
    entries: [
      "hairline-flat",
      "monochrome-near-white",
      "geometric-grotesk-tight",
      "split-hero-three-column",
    ],
    catalog: "4230c655b9ed",
    seed: 1428,
    reroll: false,
    job: "sign-up",
    at: "2026-10-25T14:00:00.000Z",
  },
  revision: "a".repeat(64),
};

/** The Interfaces tab of a web app with one address captured twice and a drift. */
const INTERFACE_FIELDS: Omit<InterfaceDocument, "notes"> = {
  schema: "greenline.inspect/v2",
  read: READ,
  kind: "interface",
  pages: {
    available: true,
    items: [
      {
        address: "/pricing",
        register: "site",
        capture: {
          visual: "2026-10-25-pricing-table/capture-pricing",
          widths: [1440, 768, 390],
          commit: "0123456789abcdef0123456789abcdef01234567",
          at: "2026-10-25T13:00:00.000Z",
        },
        scores: { floor: 0, reflex: 1, finish: 3 },
        fidelity: { inPalette: 0.91, offPalette: ["#e01010"] },
        history: [
          {
            visual: "2026-10-20-pricing/capture-pricing",
            made: "2026-10-20T10:00:00.000Z",
            floor: 2,
            reflex: 3,
            finish: 4,
          },
          {
            visual: "2026-10-25-pricing-table/capture-pricing",
            made: "2026-10-25T13:00:00.000Z",
            floor: 0,
            reflex: 1,
            finish: 3,
          },
        ],
        tier: "drifting",
        limit: null,
      },
    ],
  },
  facets: { platform: "web", frameworks: ["next", "react", "tailwind"], registers: ["site"] },
  tokens: [
    { group: "colors", name: "ground", value: "#f4f3ef" },
    { group: "colors", name: "ink", value: "#1d1d1b" },
    { group: "colors", name: "accent", value: "#b3261e" },
    { group: "typography", name: "body", value: "fontFamily Source Serif 4, fontSize 17px" },
    { group: "rounded", name: "md", value: "6px" },
  ],
  drift: "interface drift: 1 colour the code uses that DESIGN.md does not name",
  specimen: SPECIMEN_PALETTE,
  page: { light: composite("#f4f3ef", "#b3261e", "The home"), dark: null },
  notices: ["The capture of /pricing is drifting: a covered file changed since it was taken."],
};

/** A change's interface: its check by tier, its design section and a pick. */
export const INTERFACE_CHECKS: InterfaceChecksDocument = {
  schema: "greenline.inspect/v2",
  read: READ,
  kind: "interface-checks",
  change: "2026-10-25-pricing-table",
  touches: true,
  fact: {
    generatedBy: "greenline check interface",
    at: "2026-10-25T13:00:00.000Z",
    commit: null,
    paths: ["src/components/Price.tsx"],
    counts: { floor: 1, reflex: 1, waived: 1, finish: 1 },
    findings: [
      {
        rule: "keyboard-operable",
        tier: "floor",
        path: "src/components/Price.tsx",
        line: 4,
        detail: "div",
      },
      { rule: "transition-all", tier: "reflex", path: "src/components/menu.css", line: 2 },
      {
        rule: "style-eyebrow",
        tier: "reflex",
        path: "src/components/Price.tsx",
        line: 9,
        waived: "record",
      },
      {
        rule: "headline-two-lines",
        tier: "finish",
        path: "/pricing",
        line: 0,
        width: 390,
        detail: "h1 wraps to 3 lines",
      },
    ],
    unmeasured: [{ rule: "dialog-focus", why: "needs a scripted flow" }],
    widths: [1440, 768, 390, 320],
  },
  design:
    "## design\n\ncomponents: pricing, table\n\nThree directions dealt; the owner picked the second, hairline-flat.",
  pick: DEAL.pick,
};

/** A captured page drawn small, as an image the capture view shows under its boxes. */
function page(width: number, height: number, buttonY: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><rect width="100%" height="100%" fill="#ffffff"/><rect x="24" y="24" width="${String(Math.min(560, width - 48))}" height="40" fill="#1c1c1a"/><rect x="24" y="88" width="${String(Math.min(420, width - 48))}" height="16" fill="#9a9a96"/><rect x="24" y="${String(buttonY)}" width="160" height="48" rx="6" fill="#1f3a5f"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** One width of the fixture capture: the heading, the lede and the button, the button lower at 390. */
function captureWidth(width: number, height: number, buttonY: number): CaptureWidthView {
  return {
    width,
    height,
    image: page(width, 1200, buttonY),
    imageHeight: 1200,
    page: { width, height: 1200 },
    elements: [
      {
        selector: "main",
        tag: "main",
        role: "main",
        text: "Plans for every team",
        box: { x: 0, y: 0, width, height: 1200 },
        source: { file: "src/pages/Home.tsx", line: 9, column: 3, via: "react" },
      },
      {
        selector: "main > h1",
        tag: "h1",
        role: "heading",
        text: "Plans for every team",
        box: { x: 24, y: 24, width: Math.min(560, width - 48), height: 40 },
        source: { file: "src/pages/Home.tsx", line: 12, column: 5, via: "react" },
      },
      {
        selector: "#start-trial",
        tag: "button",
        role: "button",
        text: "Start a trial",
        box: { x: 24, y: buttonY, width: 160, height: 48 },
        source: { file: "src/components/Cta.tsx", line: 8, column: 7, via: "react" },
      },
    ],
    truncated: false,
  };
}

/** The fixture capture's widest and narrowest widths, which the stage's specimens draw. */
export const CAPTURE_WIDE: CaptureWidthView = captureWidth(1440, 900, 140);
export const CAPTURE_PHONE: CaptureWidthView = captureWidth(390, 844, 900);

const COMMIT = "4b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c";

/** A capture of /plans at three widths with its boxes, the one a mark was made on. */
/** A capture as a picture's document carries it. */
export interface CaptureFixture {
  readonly capture: CaptureView;
}

export const CAPTURE: CaptureFixture = {
  capture: {
    id: "2026-10-26-plans-page/capture-plans",
    address: "/plans",
    change: "2026-10-26-plans-page",
    commit: COMMIT,
    made: "2026-10-26T09:00:00.000Z",
    files: ["src/components/Cta.tsx", "src/pages/Home.tsx"],
    tier: "fresh",
    commitsSince: 0,
    widths: [
      captureWidth(1440, 900, 140),
      captureWidth(768, 1024, 140),
      captureWidth(390, 844, 900),
    ],
    boxes: null,
    scores: { floor: 0, reflex: 1, finish: 12 },
    history: [
      {
        id: "2026-10-26-plans-page/capture-plans",
        made: "2026-10-26T09:00:00.000Z",
        commit: COMMIT,
        when: "this",
      },
      {
        id: "2026-10-26-plans-page/capture-plans-2",
        made: "2026-10-26T11:00:00.000Z",
        commit: COMMIT,
        when: "later",
      },
    ],
  },
};

/** The capture after the fix: the button above the fold at 390. */
export const CAPTURE_AFTER: CaptureFixture = {
  ...CAPTURE,
  capture: {
    ...CAPTURE.capture,
    id: "2026-10-26-plans-page/capture-plans-2",
    made: "2026-10-26T11:00:00.000Z",
    widths: [
      captureWidth(1440, 900, 140),
      captureWidth(768, 1024, 140),
      captureWidth(390, 844, 140),
    ],
  },
};

const BUTTON = captureWidth(390, 844, 900).elements[2] ?? null;

/** Three marks: one open with the agent's proposal, one addressed with its after, one declined. */
export const MARKS: NotesReading = {
  revision: "4f3c0a9e1b2d3c4e5f60718293a4b5c6d7e8f90112233445566778899aabbccd",
  notes: [
    {
      ref: noteRef("m3f9a2c1", "The call to action sits below the fold on a phone."),
      mark: {
        id: "m3f9a2c1",
        address: "/plans",
        width: 390,
        capture: { id: CAPTURE.capture.id, commit: COMMIT },
        element: BUTTON,
        region: null,
        crop: { x: 0, y: 876, width: 208, height: 96 },
        note: "The call to action sits below the fold on a phone.",
        intent: "fix",
        state: "addressed",
        by: "owner",
        words: null,
        at: "2026-10-26T09:30:00.000Z",
        proposed: {
          as: "addressed",
          capture: CAPTURE_AFTER.capture.id,
          diff: "a1b2c3d",
          note: "Moved the button above the lede at small widths.",
          at: "2026-10-26T11:05:00.000Z",
        },
        closed: { by: "owner", via: "viewer", words: null, at: "2026-10-26T11:20:00.000Z" },
      },
      file: ".greenline/ledger/2026-10-26-plans-page/marks.jsonl",
      change: "2026-10-26-plans-page",
      stale: false,
      after: { capture: CAPTURE_AFTER.capture.id, box: { x: 24, y: 140, width: 160, height: 48 } },
    },
    {
      ref: noteRef("m7d01e4b", "Try the heading in three weights, side by side."),
      mark: {
        id: "m7d01e4b",
        address: "/plans",
        width: 1440,
        capture: { id: CAPTURE.capture.id, commit: COMMIT },
        element: null,
        region: {
          path: [
            [16, 16],
            [600, 16],
            [600, 120],
            [16, 120],
          ],
          elements: ["main > h1"],
        },
        crop: { x: 0, y: 0, width: 624, height: 144 },
        note: "Try the heading in three weights, side by side.",
        intent: "options",
        state: "open",
        by: "agent",
        words: "show me a few options for the heading",
        at: "2026-10-26T09:40:00.000Z",
        proposed: null,
        closed: null,
      },
      file: ".greenline/ledger/2026-10-26-plans-page/marks.jsonl",
      change: "2026-10-26-plans-page",
      stale: true,
      after: null,
    },
    {
      ref: noteRef("m0a11b2c", "Could the heading say who it is for?"),
      mark: {
        id: "m0a11b2c",
        address: "/plans",
        width: 768,
        capture: { id: CAPTURE.capture.id, commit: COMMIT },
        element: captureWidth(768, 1024, 140).elements[1] ?? null,
        region: null,
        crop: { x: 0, y: 0, width: 608, height: 88 },
        note: "Could the heading say who it is for?",
        intent: "question",
        state: "declined",
        by: "owner",
        words: null,
        at: "2026-10-26T09:45:00.000Z",
        proposed: null,
        closed: {
          by: "owner",
          via: "words",
          words: "leave the heading as it is",
          at: "2026-10-26T10:00:00.000Z",
        },
      },
      file: ".greenline/ledger/2026-10-26-plans-page/marks.jsonl",
      change: "2026-10-26-plans-page",
      stale: false,
      after: null,
    },
  ],
  unreadable: [],
};

/** The workspace's interface with the notes on its captures. */
export const INTERFACE: InterfaceDocument = { ...INTERFACE_FIELDS, notes: MARKS };

/** The capture of /plans as a picture of the home. */
export const CAPTURE_PICTURE: VisualView = {
  id: CAPTURE.capture.id,
  ref: {
    id: CAPTURE.capture.id,
    name: "Capture of /plans",
    address: pathOf({ page: "picture", id: CAPTURE.capture.id }),
  },
  path: `.greenline/visuals/${CAPTURE.capture.id}.html`,
  place: "change",
  file: { path: `.greenline/visuals/${CAPTURE.capture.id}.html`, kind: "html" },
  revision: "5".repeat(64),
  title: "Capture of /plans",
  form: "capture",
  skill: "design",
  change: CAPTURE.capture.change,
  commit: COMMIT,
  files: CAPTURE.capture.files,
  made: CAPTURE.capture.made,
  madeBy: "agent",
  summary: "The plans page at three widths.",
  question: null,
  finish: null,
  scores: CAPTURE.capture.scores,
  tier: "fresh",
  commitsSince: 0,
};
