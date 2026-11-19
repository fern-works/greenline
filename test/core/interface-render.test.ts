import { describe, expect, it } from "vitest";
import { parseDesign, type DesignDocument } from "../../src/core/design-file.ts";
import { interfaceRules } from "../../src/core/interface-registry.ts";
import {
  allUnmeasured,
  apcaContrast,
  homeDeclaresDark,
  homeLadder,
  judgeRender,
  judgeRenderRule,
  renderRuleIds,
  renderSnapshotSchema,
  type FocusStop,
  type RenderElement,
  type RenderRun,
  type RenderSnapshot,
  type RenderVariant,
  type VariantKind,
} from "../../src/core/interface-render.ts";
import { parseColour } from "../../src/core/colour.ts";

/**
 * The render engine's judges (J-123 S5): each measured render rule fails a
 * planted read of the page and passes its fix, judged in code from the
 * snapshot alone; the rules that need a scripted flow are listed as
 * unmeasured with why, never passed.
 */

let next = 0;

/** An element with every field a plain visible paragraph holds, the given ones over it. */
function el(overrides: Partial<RenderElement>): RenderElement {
  next += 1;
  return {
    i: next,
    parent: -1,
    tag: "p",
    role: "",
    id: "",
    name: "",
    label: "",
    text: "Plain words",
    length: 11,
    x: 0,
    y: 100,
    w: 200,
    h: 24,
    visible: true,
    opacity: 1,
    colour: "rgb(28, 28, 26)",
    ground: "rgb(255, 255, 255)",
    groundImage: false,
    fontSize: 17,
    fontWeight: 400,
    fontFamily: "georgia",
    fontStyle: "normal",
    lineHeight: 24,
    lines: 1,
    scrollWidth: 200,
    clientWidth: 200,
    scrollHeight: 24,
    clientHeight: 24,
    overflowX: "visible",
    overflowY: "visible",
    textOverflow: "clip",
    lineClamp: "",
    whiteSpace: "normal",
    position: "static",
    top: null,
    zIndex: 0,
    interactive: false,
    focusable: false,
    inline: false,
    inputType: "",
    borderColour: "rgb(0, 0, 0)",
    borderWidth: 0,
    animation: null,
    backdrop: false,
    shadow: false,
    gradient: false,
    clipText: false,
    backgroundColour: "rgba(0, 0, 0, 0)",
    pointerEvents: "auto",
    img: null,
    expanded: "",
    haspopup: "",
    open: false,
    cover: [-1, -1, -1],
    ...overrides,
  };
}

/** A control: a button, interactive and focusable. */
function control(overrides: Partial<RenderElement>): RenderElement {
  return el({
    tag: "button",
    text: "Save",
    label: "Save",
    name: "Save",
    interactive: true,
    focusable: true,
    w: 96,
    h: 44,
    ...overrides,
  });
}

function snap(
  elements: readonly RenderElement[],
  width: number,
  overrides: Partial<RenderSnapshot> = {},
): RenderSnapshot {
  return {
    width,
    height: 900,
    scrollWidth: width,
    scrollHeight: 900,
    lang: "en",
    elements: elements.map((element, index) => ({ ...element, i: index })),
    fonts: [],
    inventory: {
      links: [],
      fields: [],
      actions: [],
      handlers: [],
      testHooks: [],
      ids: [],
      headings: [],
    },
    ...overrides,
  };
}

interface PlantedRead {
  readonly kind?: VariantKind;
  readonly width?: number;
  readonly height?: number;
  readonly scheme?: "light" | "dark";
  readonly motion?: "full" | "reduce";
  readonly elements: readonly RenderElement[];
  readonly snapshot?: Partial<RenderSnapshot>;
}

function variant(planted: PlantedRead): RenderVariant {
  const width = planted.width ?? 1440;
  return {
    kind: planted.kind ?? "base",
    width,
    height: planted.height ?? 900,
    scheme: planted.scheme ?? "light",
    motion: planted.motion ?? "full",
    snapshot: snap(planted.elements, width, { height: planted.height ?? 900, ...planted.snapshot }),
  };
}

function run(variants: readonly RenderVariant[], overrides: Partial<RenderRun> = {}): RenderRun {
  return {
    address: "/",
    variants,
    focus: [],
    focusables: 0,
    console: [],
    homeDark: false,
    ladder: [],
    ...overrides,
  };
}

/** The widths at which a rule fails on a run; none where it passes. */
function failsAt(rule: string, read: RenderRun): readonly number[] {
  const judged = judgeRenderRule(rule, read);
  if (judged.kind === "unmeasured") throw new Error(`${rule} was not measured: ${judged.why}`);
  return judged.hits.map((hit) => hit.width);
}

const stop = (overrides: Partial<FocusStop>): FocusStop => ({
  at: "1",
  tag: "button",
  name: "Save",
  changed: true,
  covered: false,
  ...overrides,
});

/** Each measured rule's planted failure and its fix. */
const PAIRS: ReadonlyMap<string, { readonly fail: RenderRun; readonly pass: RenderRun }> = new Map([
  [
    "text-contrast-aa",
    {
      fail: run([variant({ elements: [el({ colour: "rgb(153, 153, 153)" })] })]),
      pass: run([variant({ elements: [el({ colour: "rgb(89, 89, 89)" })] })]),
    },
  ],
  [
    "contrast-nontext",
    {
      fail: run([
        variant({
          elements: [
            el({
              tag: "input",
              inputType: "text",
              text: "",
              borderWidth: 1,
              borderColour: "rgba(0, 0, 0, 0.2)",
            }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({
              tag: "input",
              inputType: "text",
              text: "",
              borderWidth: 1,
              borderColour: "rgb(118, 118, 118)",
            }),
          ],
        }),
      ]),
    },
  ],
  [
    "contrast-apca-advisory",
    {
      fail: run([variant({ elements: [el({ colour: "rgb(150, 150, 150)" })] })]),
      pass: run([variant({ elements: [el({ colour: "rgb(40, 40, 40)" })] })]),
    },
  ],
  [
    "contrast-both-schemes",
    {
      fail: run(
        [
          variant({
            scheme: "dark",
            elements: [el({ colour: "rgb(70, 70, 70)", ground: "rgb(18, 18, 18)" })],
          }),
        ],
        { homeDark: true },
      ),
      pass: run(
        [
          variant({
            scheme: "dark",
            elements: [el({ colour: "rgb(220, 220, 220)", ground: "rgb(18, 18, 18)" })],
          }),
        ],
        { homeDark: true },
      ),
    },
  ],
  [
    // J-148 S3: read from the computed styles, so a source reshaped to match a pattern cannot pass it.
    "dark-scheme-declared",
    {
      fail: run(
        [
          variant({ elements: [el({ colour: "rgb(20, 20, 20)", ground: "rgb(255, 255, 255)" })] }),
          variant({
            scheme: "dark",
            elements: [el({ colour: "rgb(230, 230, 230)", ground: "rgb(18, 18, 18)" })],
            snapshot: { colorScheme: "light" },
          }),
        ],
        { homeDark: true },
      ),
      pass: run(
        [
          variant({ elements: [el({ colour: "rgb(20, 20, 20)", ground: "rgb(255, 255, 255)" })] }),
          variant({
            scheme: "dark",
            elements: [el({ colour: "rgb(230, 230, 230)", ground: "rgb(18, 18, 18)" })],
            snapshot: { colorScheme: "light dark" },
          }),
        ],
        { homeDark: true },
      ),
    },
  ],
  [
    "focus-visible",
    {
      fail: run([variant({ elements: [] })], { focus: [stop({ changed: false })] }),
      pass: run([variant({ elements: [] })], { focus: [stop({})] }),
    },
  ],
  [
    "focus-not-obscured",
    {
      fail: run([variant({ elements: [] })], { focus: [stop({ covered: true })] }),
      pass: run([variant({ elements: [] })], { focus: [stop({})] }),
    },
  ],
  [
    "no-keyboard-trap",
    {
      fail: run([variant({ elements: [] })], {
        focusables: 6,
        focus: Array.from({ length: 12 }, (_, index) =>
          stop({ at: index < 3 ? String(index) : String(3 + (index % 2)) }),
        ),
      }),
      pass: run([variant({ elements: [] })], {
        focusables: 6,
        focus: Array.from({ length: 12 }, (_, index) =>
          stop({ at: index % 7 === 6 ? null : String(index % 7) }),
        ),
      }),
    },
  ],
  [
    "label-in-name",
    {
      fail: run([variant({ elements: [control({ label: "Send", name: "Submit message" })] })]),
      pass: run([variant({ elements: [control({ label: "Send", name: "Send message" })] })]),
    },
  ],
  [
    "target-size-floor",
    {
      fail: run([
        variant({ elements: [control({ x: 0, w: 16, h: 16 }), control({ x: 20, w: 16, h: 16 })] }),
      ]),
      pass: run([
        variant({ elements: [control({ x: 0, w: 24, h: 24 }), control({ x: 40, w: 24, h: 24 })] }),
      ]),
    },
  ],
  [
    "target-size-touch",
    {
      fail: run([variant({ width: 390, elements: [control({ w: 32, h: 32 })] })]),
      pass: run([variant({ width: 390, elements: [control({ w: 44, h: 44 })] })]),
    },
  ],
  [
    "decorative-layer-intercepts",
    {
      fail: run([variant({ elements: [control({ cover: [-4, -1, -1] })] })]),
      pass: run([variant({ elements: [control({ cover: [-1, -1, -1] })] })]),
    },
  ],
  [
    "reflow-320",
    {
      fail: run([
        variant({
          kind: "floor",
          width: 320,
          height: 320,
          elements: [el({ w: 480 })],
          snapshot: { scrollWidth: 480 },
        }),
      ]),
      pass: run([variant({ kind: "floor", width: 320, height: 320, elements: [el({ w: 320 })] })]),
    },
  ],
  [
    "text-spacing-survives",
    {
      fail: run([
        variant({ width: 390, elements: [control({ overflowY: "hidden" })] }),
        variant({
          kind: "spacing",
          width: 390,
          elements: [control({ overflowY: "hidden", scrollHeight: 60, clientHeight: 44 })],
        }),
      ]),
      pass: run([
        variant({ width: 390, elements: [control({})] }),
        variant({
          kind: "spacing",
          width: 390,
          elements: [control({ h: 60, scrollHeight: 60, clientHeight: 60 })],
        }),
      ]),
    },
  ],
  [
    "text-resize-200",
    {
      fail: run([
        variant({ elements: [el({ overflowY: "hidden" })] }),
        variant({
          kind: "resize",
          elements: [el({ overflowY: "hidden", scrollHeight: 48, clientHeight: 24 })],
        }),
      ]),
      pass: run([
        variant({ elements: [el({})] }),
        variant({ kind: "resize", elements: [el({ h: 48, scrollHeight: 48, clientHeight: 48 })] }),
      ]),
    },
  ],
  [
    "text-contained",
    {
      fail: run([
        variant({
          elements: [
            el({ text: "a.very.long.address@example.com", scrollWidth: 320, clientWidth: 200 }),
          ],
        }),
      ]),
      pass: run([variant({ elements: [el({ text: "a.very.long.address@example.com" })] })]),
    },
  ],
  [
    "text-not-covered",
    {
      fail: run([
        variant({
          elements: [
            el({ tag: "h2", text: "Pricing", cover: [1, -1, -1] }),
            el({ tag: "img", text: "", w: 300, h: 200 }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({ tag: "h2", text: "Pricing" }),
            el({ tag: "img", text: "", y: 400, w: 300, h: 200 }),
          ],
        }),
      ]),
    },
  ],
  [
    "content-visible-at-rest",
    {
      fail: run([variant({ kind: "noscript", elements: [el({ opacity: 0 })] })]),
      pass: run([variant({ kind: "noscript", elements: [el({})] })]),
    },
  ],
  [
    "reduced-motion-hidden",
    {
      fail: run([variant({ motion: "reduce", elements: [el({ opacity: 0 })] })]),
      pass: run([variant({ motion: "reduce", elements: [el({})] })]),
    },
  ],
  [
    "motion-pause-5s",
    {
      fail: run([
        variant({
          elements: [
            el({
              tag: "div",
              animation: { name: "slide", seconds: 8, infinite: true, count: 0, running: true },
            }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({
              tag: "div",
              animation: { name: "slide", seconds: 8, infinite: true, count: 0, running: true },
            }),
            control({ label: "Pause", name: "Pause" }),
          ],
        }),
      ]),
    },
  ],
  [
    "no-raw-empty",
    {
      fail: run([variant({ elements: [el({ text: "NaN members" })] })]),
      pass: run([variant({ elements: [el({ text: "- members" })] })]),
    },
  ],
  [
    "image-loads",
    {
      fail: run([
        variant({
          elements: [
            el({
              tag: "img",
              text: "",
              img: { src: "/missing.png", loading: "", complete: true, naturalWidth: 0 },
            }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({
              tag: "img",
              text: "",
              img: { src: "/a.png", loading: "", complete: true, naturalWidth: 40 },
            }),
          ],
        }),
      ]),
    },
  ],
  [
    "track-overflow",
    {
      fail: run([variant({ width: 390, elements: [el({ tag: "div", w: 480 })] })]),
      pass: run([variant({ width: 390, elements: [el({ tag: "div", w: 390 })] })]),
    },
  ],
  [
    "trailing-action-reachable",
    {
      fail: run([
        variant({ kind: "floor", width: 320, height: 320, elements: [control({ x: 280, w: 80 })] }),
      ]),
      pass: run([
        variant({ kind: "floor", width: 320, height: 320, elements: [control({ x: 200, w: 80 })] }),
      ]),
    },
  ],
  [
    "dialog-fits-short",
    {
      fail: run([
        variant({
          kind: "floor",
          width: 320,
          height: 320,
          elements: [el({ tag: "dialog", open: true, y: 40, h: 400 })],
        }),
      ]),
      pass: run([
        variant({
          kind: "floor",
          width: 320,
          height: 320,
          elements: [el({ tag: "dialog", open: true, y: 40, h: 400, overflowY: "auto" })],
        }),
      ]),
    },
  ],
  [
    "narrow-nav-cue",
    {
      fail: run([
        variant({
          kind: "floor",
          width: 320,
          height: 320,
          elements: [el({ tag: "nav", text: "" }), control({ tag: "a", parent: 0, x: 300, w: 80 })],
        }),
      ]),
      pass: run([
        variant({
          kind: "floor",
          width: 320,
          height: 320,
          elements: [
            el({ tag: "nav", text: "" }),
            control({ tag: "a", parent: 0, x: 300, w: 80 }),
            control({ label: "Menu", name: "Menu", expanded: "false" }),
          ],
        }),
      ]),
    },
  ],
  [
    "single-sticky-top",
    {
      fail: run([
        variant({
          elements: [
            el({ tag: "header", position: "sticky", top: 0, w: 1440 }),
            el({ tag: "nav", position: "sticky", top: 0, w: 1440 }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({ tag: "header", position: "sticky", top: 0, w: 1440 }),
            el({ tag: "nav", position: "sticky", top: 64, w: 1440 }),
          ],
        }),
      ]),
    },
  ],
  [
    "essential-truncation",
    {
      fail: run([
        variant({
          kind: "floor",
          width: 320,
          height: 320,
          elements: [control({ textOverflow: "ellipsis", scrollWidth: 140, clientWidth: 96 })],
        }),
      ]),
      pass: run([variant({ kind: "floor", width: 320, height: 320, elements: [control({})] })]),
    },
  ],
  [
    "prose-measure",
    {
      fail: run([variant({ elements: [el({ length: 480, lines: 4 })] })]),
      pass: run([variant({ elements: [el({ length: 480, lines: 7 })] })]),
    },
  ],
  [
    "body-size",
    {
      fail: run([variant({ elements: [el({ length: 80, fontSize: 14 })] })], { register: "site" }),
      pass: run([variant({ elements: [el({ length: 80, fontSize: 17 })] })], { register: "site" }),
    },
  ],
  [
    "text-under-11",
    {
      fail: run([variant({ elements: [el({ fontSize: 9 })] })]),
      pass: run([variant({ elements: [el({ fontSize: 12 })] })]),
    },
  ],
  [
    "input-font-16",
    {
      fail: run([
        variant({
          width: 390,
          elements: [el({ tag: "input", inputType: "email", text: "", fontSize: 14 })],
        }),
      ]),
      pass: run([
        variant({
          width: 390,
          elements: [el({ tag: "input", inputType: "email", text: "", fontSize: 16 })],
        }),
      ]),
    },
  ],
  [
    "family-count",
    {
      fail: run([
        variant({ elements: ["a", "b", "c", "d"].map((family) => el({ fontFamily: family })) }),
      ]),
      pass: run([variant({ elements: ["a", "b"].map((family) => el({ fontFamily: family })) })]),
    },
  ],
  [
    "font-loaded",
    {
      fail: run([
        variant({
          elements: [el({ fontFamily: "inter", fontWeight: 700 })],
          snapshot: {
            fonts: [{ family: "inter", weight: "400", style: "normal", status: "loaded" }],
          },
        }),
      ]),
      pass: run([
        variant({
          elements: [el({ fontFamily: "inter", fontWeight: 700 })],
          snapshot: {
            fonts: [{ family: "inter", weight: "100 900", style: "normal", status: "loaded" }],
          },
        }),
      ]),
    },
  ],
  [
    "headline-two-lines",
    {
      fail: run([variant({ width: 390, elements: [el({ tag: "h1", lines: 3 })] })]),
      pass: run([variant({ width: 390, elements: [el({ tag: "h1", lines: 2 })] })]),
    },
  ],
  [
    "plural-rules",
    {
      fail: run([variant({ elements: [el({ text: "1 members" })] })]),
      pass: run([variant({ elements: [el({ text: "1 member" })] })]),
    },
  ],
  [
    "lcp-not-lazy",
    {
      fail: run([
        variant({
          elements: [
            el({
              tag: "img",
              text: "",
              w: 1200,
              h: 600,
              img: { src: "/hero.jpg", loading: "lazy", complete: true, naturalWidth: 1200 },
            }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({
              tag: "img",
              text: "",
              w: 1200,
              h: 600,
              img: { src: "/hero.jpg", loading: "", complete: true, naturalWidth: 1200 },
            }),
          ],
        }),
      ]),
    },
  ],
  [
    "console-clean",
    {
      fail: run([variant({ elements: [] })], { console: ["uncaught: TypeError: x is undefined"] }),
      pass: run([variant({ elements: [] })]),
    },
  ],
  [
    "style-gradient",
    {
      fail: run([variant({ elements: [control({ gradient: true })] })]),
      pass: run([variant({ elements: [control({})] })]),
    },
  ],
  [
    "style-purple-default",
    {
      fail: run([
        variant({
          elements: [
            control({ backgroundColour: "rgb(99, 102, 241)", colour: "rgb(255, 255, 255)" }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            control({ backgroundColour: "rgb(31, 58, 95)", colour: "rgb(255, 255, 255)" }),
          ],
        }),
      ]),
    },
  ],
  [
    "style-cream-terracotta",
    {
      fail: run([
        variant({
          elements: [
            el({ ground: "rgb(245, 240, 230)" }),
            control({ backgroundColour: "rgb(201, 100, 66)", ground: "rgb(245, 240, 230)" }),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [
            el({ ground: "rgb(245, 240, 230)" }),
            control({ backgroundColour: "rgb(31, 58, 95)", ground: "rgb(245, 240, 230)" }),
          ],
        }),
      ]),
    },
  ],
  [
    "style-numbered-labels",
    {
      fail: run([variant({ elements: [el({ text: "01" }), el({ text: "02" })] })]),
      pass: run([variant({ elements: [el({ text: "Plans" })] })]),
    },
  ],
  [
    "style-mono-costume",
    {
      fail: run([variant({ elements: [el({ fontFamily: "jetbrains mono" })] })]),
      pass: run([variant({ elements: [el({ tag: "code", fontFamily: "jetbrains mono" })] })]),
    },
  ],
  [
    "style-icon-card-row",
    {
      fail: run([
        variant({
          elements: [
            el({ tag: "section", text: "" }),
            ...[0, 1, 2].flatMap((index) => [
              el({ tag: "div", text: "", parent: 0, x: index * 400, w: 360 }),
              el({ tag: "svg", text: "", parent: 1 + index * 3, y: 100 }),
              el({ tag: "h3", text: "Fast", parent: 1 + index * 3, y: 140 }),
            ]),
          ],
        }),
      ]),
      pass: run([
        variant({
          elements: [el({ tag: "section", text: "" }), el({ tag: "h3", text: "Fast", parent: 0 })],
        }),
      ]),
    },
  ],
  [
    "style-resting-shadow",
    {
      fail: run([variant({ elements: [el({ tag: "div", shadow: true, w: 300, h: 200 })] })]),
      pass: run([
        variant({ elements: [el({ tag: "div", shadow: true, role: "menu", w: 300, h: 200 })] }),
      ]),
    },
  ],
  [
    "style-glass",
    {
      fail: run([variant({ elements: [el({ backdrop: true }), el({ backdrop: true })] })]),
      pass: run([variant({ elements: [el({ backdrop: true })] })]),
    },
  ],
  [
    "section-gap",
    {
      fail: run([
        variant({
          elements: [0, 1, 2, 3].map((index) =>
            el({ tag: "section", text: "", y: index * 480, h: 400 }),
          ),
        }),
      ]),
      pass: run([
        variant({
          elements: [0, 600, 1100, 1800].map((y) => el({ tag: "section", text: "", y, h: 400 })),
        }),
      ]),
    },
  ],
  [
    "flat-type-scale",
    {
      fail: run([variant({ elements: [16, 18, 19].map((fontSize) => el({ fontSize })) })]),
      pass: run([variant({ elements: [16, 20, 32].map((fontSize) => el({ fontSize })) })]),
    },
  ],
  [
    "control-height-ladder",
    {
      fail: run([variant({ elements: [control({ h: 40 })] })], { ladder: [28, 36] }),
      pass: run([variant({ elements: [control({ h: 36 })] })], { ladder: [28, 36] }),
    },
  ],
]);

const UNMEASURED = [
  "error-associated",
  "flash-limit",
  "dialog-focus",
  "loop-offscreen-paused",
  "pending-no-repeat",
  "error-focus-first",
  "input-keeps-value",
  "toast-timing",
  "press-feedback",
];

describe("the render judges", () => {
  it("stand for every render rule of the registry, and for nothing else", () => {
    const render = interfaceRules()
      .filter((rule) => rule.engine === "render")
      .map((rule) => rule.id);
    expect([...renderRuleIds()].sort()).toEqual([...render].sort());
    expect([...PAIRS.keys(), ...UNMEASURED].sort()).toEqual([...render].sort());
  });

  for (const [rule, pair] of PAIRS)
    it(`${rule} fails its planted read and passes its fix`, () => {
      expect(failsAt(rule, pair.fail).length, rule).toBeGreaterThan(0);
      expect(failsAt(rule, pair.pass), rule).toEqual([]);
    });

  it("lists the rules a scripted flow or frame timing needs as unmeasured, with why", () => {
    for (const rule of UNMEASURED) {
      const judged = judgeRenderRule(rule, run([]));
      expect(judged.kind, rule).toBe("unmeasured");
    }
    const ladderless = judgeRenderRule(
      "control-height-ladder",
      run([variant({ elements: [control({ h: 40 })] })]),
    );
    expect(ladderless).toEqual({
      kind: "unmeasured",
      why: "the home names no control heights, so there is no ladder to read against",
    });
  });

  it("names the width a finding was read at, each detail once at the first width", () => {
    const faint = el({ colour: "rgb(153, 153, 153)" });
    const read = run([
      variant({ width: 1440, elements: [faint] }),
      variant({ width: 768, elements: [faint] }),
      variant({ width: 390, elements: [el({ tag: "h1", lines: 3 })] }),
    ]);
    expect(failsAt("text-contrast-aa", read)).toEqual([1440]);
    expect(failsAt("headline-two-lines", read)).toEqual([390]);
  });

  it("finds a phone's overflow at the read's own width, which the page's widened layout would hide", () => {
    const read = run([
      variant({ width: 390, elements: [el({ tag: "div", w: 480 })], snapshot: { width: 480 } }),
    ]);
    expect(failsAt("track-overflow", read)).toEqual([390]);
  });

  it("selects the render rules by the facets in play and turns hits into findings at the route", () => {
    const read = run([variant({ width: 390, elements: [control({ w: 32, h: 32 })] })], {
      address: "/pricing",
    });
    const outcome = judgeRender(read, { platform: "web" });
    expect(outcome.findings).toContainEqual(
      expect.objectContaining({
        rule: "target-size-touch",
        tier: "reflex",
        path: "/pricing",
        line: 0,
        width: 390,
      }),
    );
    expect(outcome.unmeasured.map((entry) => entry.rule)).toEqual(
      expect.arrayContaining(UNMEASURED),
    );
    expect(
      allUnmeasured({ platform: "web" }, "no browser").every((entry) => entry.why === "no browser"),
    ).toBe(true);
  });
});

describe("the readers' helpers", () => {
  it("parses the page reader's snapshot under its schema and refuses another planted", () => {
    const snapshot = snap([el({})], 1440);
    expect(renderSnapshotSchema.safeParse(JSON.parse(JSON.stringify(snapshot))).success).toBe(true);
    expect(renderSnapshotSchema.safeParse({ ...snapshot, elements: [{ tag: "p" }] }).success).toBe(
      false,
    );
  });

  it("measures APCA's Lc with its polarity", () => {
    const black = parseColour("#000000");
    const white = parseColour("#ffffff");
    if (black === undefined || white === undefined) throw new Error("colours");
    expect(Math.round(apcaContrast(black, white))).toBe(106);
    expect(Math.round(apcaContrast(white, black))).toBe(-108);
  });

  const home = (front: string, body = "## Colors\n\nInk on paper.\n"): DesignDocument => {
    const parsed = parseDesign(`---\nname: Home\n${front}---\n\n${body}`, "DESIGN.md");
    if (parsed._tag === "err") throw new Error(JSON.stringify(parsed.error.issues));
    return parsed.value;
  };

  it("reads a dark scheme and the control ladder from the home", () => {
    expect(homeDeclaresDark(home('colors:\n  ink: "#111111"\n  ink-dark: "#eeeeee"\n'))).toBe(true);
    expect(
      homeDeclaresDark(
        home('colors:\n  ink: "#111111"\n', "## Colors\n\nA dark mode follows the system.\n"),
      ),
    ).toBe(true);
    expect(homeDeclaresDark(home('colors:\n  ink: "#111111"\n'))).toBe(false);
    expect(
      homeLadder(home("components:\n  button:\n    height: 36px\n  input:\n    height: 28px\n")),
    ).toEqual([28, 36]);
    expect(homeLadder(undefined)).toEqual([]);
  });
});
