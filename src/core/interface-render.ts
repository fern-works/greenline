import { z } from "zod";
import { contrastRatio, parseColour, type Rgb } from "./colour.ts";
import type { DesignDocument } from "./design-file.ts";
import { pixelsOf } from "./design-drift.ts";
import { facetsMatch, type FacetsInPlay, type Register } from "./interface-facets.ts";
import type { InterfaceFinding, Unmeasured } from "./interface-check.ts";
import { interfaceRules, type InterfaceRule } from "./interface-registry.ts";

/**
 * The render engine's judges (J-123 S5; `workshop/components/interface-rules.md`,
 * "The engines"): the registry's render rules judged, in code with no model,
 * from what a browser read of a page at each width and variant. The shell
 * drives the browser (`src/shell/interface-render.ts`) and hands over the
 * snapshots the page's reader returned (`./interface-collector.ts`); every
 * judgement here is pure, so a rule's test feeds it a planted snapshot. A
 * rule that needs a scripted flow or frame timing is listed as unmeasured
 * with why, never passed.
 */

/** The widths the captures are taken at, each with its height. */
export const CAPTURE_SIZES: readonly CaptureSize[] = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

/** The floor's own width, for the reflow and clipping floors alone, at a short height. */
export const FLOOR_SIZE: CaptureSize = { width: 320, height: 320 };

/** A viewport. */
export interface CaptureSize {
  readonly width: number;
  readonly height: number;
}

/** An element's animation, where it runs one. */
export interface ElementAnimation {
  readonly name: string;
  readonly seconds: number;
  readonly infinite: boolean;
  readonly count: number;
  readonly running: boolean;
}

/** An image's load, where the element is one. */
export interface ElementImage {
  readonly src: string;
  readonly loading: string;
  readonly complete: boolean;
  readonly naturalWidth: number;
}

/** One element a snapshot recorded: its place in the tree, its box, its paint, its type and its overflow. */
export interface RenderElement {
  readonly i: number;
  /** The nearest recorded ancestor's index, -1 for none. */
  readonly parent: number;
  readonly tag: string;
  readonly role: string;
  readonly id: string;
  /** The accessible name, for a control, an image, a dialog or a landmark. */
  readonly name: string;
  /** A control's visible text. */
  readonly label: string;
  /** The element's own text. */
  readonly text: string;
  /** The length of a paragraph's whole text, else of its own text. */
  readonly length: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly visible: boolean;
  /** Its opacity with every ancestor's applied. */
  readonly opacity: number;
  readonly colour: string;
  /** The first opaque ground behind it, null where an image stands behind it alone. */
  readonly ground: string | null;
  readonly groundImage: boolean;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly fontFamily: string;
  readonly fontStyle: string;
  readonly lineHeight: number;
  readonly lines: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly overflowX: string;
  readonly overflowY: string;
  readonly textOverflow: string;
  readonly lineClamp: string;
  readonly whiteSpace: string;
  readonly position: string;
  readonly top: number | null;
  readonly zIndex: number;
  readonly interactive: boolean;
  readonly focusable: boolean;
  readonly inline: boolean;
  readonly inputType: string;
  readonly borderColour: string;
  readonly borderWidth: number;
  readonly animation: ElementAnimation | null;
  readonly backdrop: boolean;
  readonly shadow: boolean;
  readonly gradient: boolean;
  readonly clipText: boolean;
  readonly backgroundColour: string;
  readonly pointerEvents: string;
  readonly img: ElementImage | null;
  readonly expanded: string;
  readonly haspopup: string;
  readonly open: boolean;
  /** What stands on top at the element's sample points: -1 itself, -4 an ancestor, -2 off-screen, -3 an element not recorded, else the index of the recorded element. */
  readonly cover?: readonly number[] | undefined;
}

/** What a page holds that a redesign keeps: links, fields, form actions, handlers, test hooks, ids and headings. */
export interface Inventory {
  readonly links: readonly string[];
  readonly fields: readonly string[];
  readonly actions: readonly string[];
  readonly handlers: readonly string[];
  readonly testHooks: readonly string[];
  readonly ids: readonly string[];
  readonly headings: readonly string[];
}

/** A face the document holds. */
export interface DocumentFont {
  readonly family: string;
  readonly weight: string;
  readonly style: string;
  readonly status: string;
}

/** A page read at one size and variant. */
export interface RenderSnapshot {
  readonly width: number;
  readonly height: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly lang: string;
  /** The root element's computed `color-scheme`, as the browser resolved it (J-148 S3); absent from an older reader. */
  readonly colorScheme?: string | undefined;
  readonly elements: readonly RenderElement[];
  readonly fonts: readonly DocumentFont[];
  readonly inventory: Inventory;
}

const elementSchema: z.ZodType<RenderElement> = z.object({
  i: z.number().int(),
  parent: z.number().int(),
  tag: z.string(),
  role: z.string(),
  id: z.string(),
  name: z.string(),
  label: z.string(),
  text: z.string(),
  length: z.number(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  visible: z.boolean(),
  opacity: z.number(),
  colour: z.string(),
  ground: z.string().nullable(),
  groundImage: z.boolean(),
  fontSize: z.number(),
  fontWeight: z.number(),
  fontFamily: z.string(),
  fontStyle: z.string(),
  lineHeight: z.number(),
  lines: z.number(),
  scrollWidth: z.number(),
  clientWidth: z.number(),
  scrollHeight: z.number(),
  clientHeight: z.number(),
  overflowX: z.string(),
  overflowY: z.string(),
  textOverflow: z.string(),
  lineClamp: z.string(),
  whiteSpace: z.string(),
  position: z.string(),
  top: z.number().nullable(),
  zIndex: z.number(),
  interactive: z.boolean(),
  focusable: z.boolean(),
  inline: z.boolean(),
  inputType: z.string(),
  borderColour: z.string(),
  borderWidth: z.number(),
  animation: z
    .object({
      name: z.string(),
      seconds: z.number(),
      infinite: z.boolean(),
      count: z.number(),
      running: z.boolean(),
    })
    .nullable(),
  backdrop: z.boolean(),
  shadow: z.boolean(),
  gradient: z.boolean(),
  clipText: z.boolean(),
  backgroundColour: z.string(),
  pointerEvents: z.string(),
  img: z
    .object({
      src: z.string(),
      loading: z.string(),
      complete: z.boolean(),
      naturalWidth: z.number(),
    })
    .nullable(),
  expanded: z.string(),
  haspopup: z.string(),
  open: z.boolean(),
  cover: z.array(z.number()).optional(),
});

const inventorySchema: z.ZodType<Inventory> = z.object({
  links: z.array(z.string()),
  fields: z.array(z.string()),
  actions: z.array(z.string()),
  handlers: z.array(z.string()),
  testHooks: z.array(z.string()),
  ids: z.array(z.string()),
  headings: z.array(z.string()),
});

/** The schema of the page reader's JSON, which the shell parses before any judge reads it. */
export const renderSnapshotSchema: z.ZodType<RenderSnapshot> = z.object({
  width: z.number(),
  height: z.number(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
  lang: z.string(),
  colorScheme: z.string().optional(),
  elements: z.array(elementSchema),
  fonts: z.array(
    z.object({ family: z.string(), weight: z.string(), style: z.string(), status: z.string() }),
  ),
  inventory: inventorySchema,
});

/** The variants a page is read in: as it rests, at the floor's width, with the text spacing applied, with text at 200%, and with no script. */
export type VariantKind = "base" | "floor" | "spacing" | "resize" | "noscript";

/** One read of the page. */
export interface RenderVariant {
  readonly kind: VariantKind;
  readonly width: number;
  readonly height: number;
  readonly scheme: "light" | "dark";
  readonly motion: "full" | "reduce";
  readonly snapshot: RenderSnapshot;
}

/** One stop of the focus walk at the widest size. */
export interface FocusStop {
  /** The stop's key, or null where focus left the page's elements. */
  readonly at: string | null;
  readonly tag: string;
  readonly name: string;
  /** Whether its look changed when it was reached. */
  readonly changed: boolean;
  /** Whether every sample point of it lay under another layer. */
  readonly covered: boolean;
}

/** Everything one address's render read. */
export interface RenderRun {
  readonly address: string;
  readonly variants: readonly RenderVariant[];
  readonly focus: readonly FocusStop[];
  /** The focus stops the page holds, which the walk is read against. */
  readonly focusables: number;
  /** The console's errors and the uncaught exceptions while the page loaded. */
  readonly console: readonly string[];
  /** Whether the home declares a dark scheme, so the dark variants were read. */
  readonly homeDark: boolean;
  /** The register in play at the address, where the rulings give one. */
  readonly register?: Register | undefined;
  /** The control heights the home names, the ladder; none where it names none. */
  readonly ladder: readonly number[];
}

/** A judge's word on one rule: the places it fails, or why it was not measured. */
export type Judgement =
  | { readonly kind: "measured"; readonly hits: readonly RenderHit[] }
  | { readonly kind: "unmeasured"; readonly why: string };

/** One place a render rule fails: the width it was read at and what was seen. */
export interface RenderHit {
  readonly width: number;
  readonly detail: string;
}

const measured = (hits: readonly RenderHit[]): Judgement => ({ kind: "measured", hits });
const unmeasured = (why: string): Judgement => ({ kind: "unmeasured", why });

/** The reason a rule that needs a scripted flow states. */
const FLOW = "needs a scripted flow through the page, which the render engine does not drive";

/** The variants of a kind, in the order read. */
function variantsOf(
  run: RenderRun,
  kind: VariantKind,
  scheme: "light" | "dark" = "light",
  motion: "full" | "reduce" = "full",
): readonly RenderVariant[] {
  return run.variants.filter(
    (variant) => variant.kind === kind && variant.scheme === scheme && variant.motion === motion,
  );
}

/** The base read at a width. */
function baseAt(run: RenderRun, width: number): RenderVariant | undefined {
  return variantsOf(run, "base").find((variant) => variant.width === width);
}

/** The widest base read. */
function widest(run: RenderRun): RenderVariant | undefined {
  return [...variantsOf(run, "base")].sort((a, b) => b.width - a.width)[0];
}

/** An element's short description for a finding. */
function shown(element: RenderElement): string {
  const words = (element.text || element.label || element.name).slice(0, 48);
  return `${element.tag}${element.id === "" ? "" : `#${element.id}`}${words === "" ? "" : ` "${words}"`}`;
}

/** Whether an element shows text a reader sees. */
function showsText(element: RenderElement): boolean {
  return element.visible && element.opacity >= 0.1 && element.text.length > 0;
}

const CODE_TAGS = new Set(["code", "pre", "kbd", "samp", "var"]);

/** Whether an element stands inside code, where raw words and monospace belong. */
function inCode(element: RenderElement, elements: readonly RenderElement[]): boolean {
  for (
    let node: RenderElement | undefined = element;
    node !== undefined;
    node = elements[node.parent]
  )
    if (CODE_TAGS.has(node.tag)) return true;
  return false;
}

/** An element's ink as painted: its colour with its opacity applied. */
function inkOf(element: RenderElement): Rgb | undefined {
  const colour = parseColour(element.colour);
  return colour === undefined
    ? undefined
    : { ...colour, alpha: colour.alpha * Math.min(1, element.opacity) };
}

/** Whether text is large in WCAG's sense: 24px, or 18.66px at weight 700 or more. */
function isLarge(element: RenderElement): boolean {
  return element.fontSize >= 24 || (element.fontSize >= 18.66 && element.fontWeight >= 700);
}

/** The WCAG 2 contrast of an element's text on its ground, where both are known. */
function textContrast(element: RenderElement): number | undefined {
  if (element.ground === null || element.groundImage) return undefined;
  const ink = inkOf(element);
  const ground = parseColour(element.ground);
  return ink === undefined || ground === undefined ? undefined : contrastRatio(ink, ground);
}

/** The text that fails AA in a snapshot. */
function aaFailures(snapshot: RenderSnapshot): readonly string[] {
  return snapshot.elements.flatMap((element) => {
    if (!showsText(element)) return [];
    const ratio = textContrast(element);
    const floor = isLarge(element) ? 3 : 4.5;
    return ratio !== undefined && ratio < floor
      ? [`${shown(element)} at ${String(ratio)}:1, under ${String(floor)}:1`]
      : [];
  });
}

/** Hits from each variant's details, each detail once, at the first width it was seen. */
function onceEach(
  variants: readonly RenderVariant[],
  details: (variant: RenderVariant) => readonly string[],
): readonly RenderHit[] {
  const seen = new Set<string>();
  const hits: RenderHit[] = [];
  for (const variant of variants)
    for (const detail of details(variant)) {
      if (seen.has(detail)) continue;
      seen.add(detail);
      hits.push({ width: variant.width, detail });
    }
  return hits;
}

/** The sRGB channels' luminance APCA reads, with its soft clamp of the darks. */
function apcaLuminance(colour: Rgb): number {
  const y =
    0.2126729 * (colour.r / 255) ** 2.4 +
    0.7151522 * (colour.g / 255) ** 2.4 +
    0.072175 * (colour.b / 255) ** 2.4;
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
}

/**
 * The APCA lightness contrast of text on a ground (APCA-W3 0.0.98G), its
 * sign the polarity: positive for dark text on a light ground.
 * @param ink the text's colour, opaque
 * @param ground the ground's colour
 * @returns Lc
 */
export function apcaContrast(ink: Rgb, ground: Rgb): number {
  const text = apcaLuminance(ink);
  const back = apcaLuminance(ground);
  if (back > text) {
    const value = (back ** 0.56 - text ** 0.57) * 1.14;
    return value < 0.1 ? 0 : (value - 0.027) * 100;
  }
  const value = (back ** 0.65 - text ** 0.62) * 1.14;
  return value > -0.1 ? 0 : (value + 0.027) * 100;
}

/** An ink blended over its ground, opaque. */
function blended(ink: Rgb, ground: Rgb): Rgb {
  const a = ink.alpha;
  return {
    r: Math.round(ink.r * a + ground.r * (1 - a)),
    g: Math.round(ink.g * a + ground.g * (1 - a)),
    b: Math.round(ink.b * a + ground.b * (1 - a)),
    alpha: 1,
    inGamut: true,
  };
}

/** A colour's hue in degrees, and its saturation and lightness from 0 to 1. */
export interface Hsl {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

/**
 * A colour in hue, saturation and lightness.
 * @param colour the colour
 * @returns its hue, saturation and lightness
 */
function hslOf(colour: Rgb): Hsl {
  const r = colour.r / 255;
  const g = colour.g / 255;
  const b = colour.b / 255;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const lightness = (high + low) / 2;
  if (high === low) return { hue: 0, saturation: 0, lightness };
  const span = high - low;
  const saturation = lightness > 0.5 ? span / (2 - high - low) : span / (high + low);
  const hue =
    high === r
      ? ((g - b) / span + (g < b ? 6 : 0)) * 60
      : high === g
        ? ((b - r) / span + 2) * 60
        : ((r - g) / span + 4) * 60;
  return { hue, saturation, lightness };
}

/** Whether an element's own text runs out of its box: wider than its box with nothing clipping it. */
function runsOut(element: RenderElement): boolean {
  return (
    element.text.length > 0 &&
    element.overflowX === "visible" &&
    element.scrollWidth > element.clientWidth + 1 &&
    element.clientWidth > 0
  );
}

/** Whether an element's text is clipped: its content larger than its box where the box hides the rest. */
function clipped(element: RenderElement): boolean {
  if (element.text.length === 0 && element.length === 0) return false;
  const hidesX = element.overflowX === "hidden" || element.overflowX === "clip";
  const hidesY = element.overflowY === "hidden" || element.overflowY === "clip";
  return (
    (hidesX && element.scrollWidth > element.clientWidth + 1) ||
    (hidesY && element.scrollHeight > element.clientHeight + 1)
  );
}

/** The elements clipped in a snapshot, by their description. */
function clippedIn(snapshot: RenderSnapshot): ReadonlySet<string> {
  return new Set(
    snapshot.elements.filter((element) => element.visible && clipped(element)).map(shown),
  );
}

/** What a text clipped in a variant and not in the base read at its width. */
function newlyClipped(run: RenderRun, kind: VariantKind): readonly RenderHit[] {
  return variantsOf(run, kind).flatMap((variant) => {
    const base = baseAt(run, variant.width);
    const before = base === undefined ? new Set<string>() : clippedIn(base.snapshot);
    return [...clippedIn(variant.snapshot)]
      .filter((detail) => !before.has(detail))
      .map((detail) => ({ width: variant.width, detail: `${detail} clips` }));
  });
}

/** Whether the snapshot shows an element in its first screen. */
function inFirstScreen(element: RenderElement, snapshot: RenderSnapshot): boolean {
  return element.y < snapshot.height && element.y + element.h > 0;
}

/** Interactive elements a pointer aims at: rendered, not inline in running text. */
function targets(snapshot: RenderSnapshot): readonly RenderElement[] {
  return snapshot.elements.filter(
    (element) =>
      element.interactive &&
      element.visible &&
      element.opacity >= 0.05 &&
      !element.inline &&
      element.w > 0,
  );
}

/** Whether a target is under 24 by 24. */
function undersized(element: RenderElement): boolean {
  return element.w < 24 || element.h < 24;
}

/**
 * Whether an undersized target fails WCAG 2.5.8's spacing exception: a 24px
 * circle on its centre meets another target, or another undersized target's circle.
 */
function spacingFails(element: RenderElement, others: readonly RenderElement[]): boolean {
  const cx = element.x + element.w / 2;
  const cy = element.y + element.h / 2;
  return others.some((other) => {
    if (other.i === element.i) return false;
    if (undersized(other)) {
      const ox = other.x + other.w / 2;
      const oy = other.y + other.h / 2;
      return (ox - cx) ** 2 + (oy - cy) ** 2 < 24 ** 2;
    }
    const nx = Math.max(other.x, Math.min(cx, other.x + other.w));
    const ny = Math.max(other.y, Math.min(cy, other.y + other.h));
    return (nx - cx) ** 2 + (ny - cy) ** 2 < 12 ** 2;
  });
}

/**
 * Whether an element lies outside the viewport's right edge where nothing
 * scrolls it into reach. The width is the read's own: a phone's browser
 * widens its layout to what overflows, so the page's own width would hide it.
 */
function pastRightEdge(element: RenderElement, snapshot: RenderSnapshot, width: number): boolean {
  if (element.x >= width || element.x + element.w <= width + 1) return false;
  for (
    let node = snapshot.elements[element.parent];
    node !== undefined;
    node = snapshot.elements[node.parent]
  )
    if (node.overflowX === "auto" || node.overflowX === "scroll") return false;
  return true;
}

/** The input kinds that take typed text. */
const TYPED = new Set(["", "text", "email", "password", "search", "tel", "url", "number"]);

/** The judges, one per render rule of the registry. */
/** Why the dark scheme's rule is not measured where the home declares no dark scheme. */
const NO_DARK_VARIANT = "the home declares no dark scheme, so no dark variant of the page was read";

/** Whether an element's look differs between two reads of the page: its ink or its ground. */
function restyled(light: RenderElement, dark: RenderElement): boolean {
  return light.colour !== dark.colour || light.ground !== dark.ground;
}

/**
 * The dark scheme's declaration read from the computed styles (J-148 S3):
 * at each width where the page's dark read restyles any element against
 * its light read, the root's computed `color-scheme` names `dark`, so the
 * browser draws its own controls and scrollbars dark too.
 * @param run what the render read
 * @returns one hit per width where dark rules apply and the root does not declare dark
 */
function darkSchemeHits(run: RenderRun): readonly RenderHit[] {
  const light = variantsOf(run, "base");
  return variantsOf(run, "base", "dark").flatMap((dark) => {
    const pair = light.find((variant) => variant.width === dark.width);
    if (pair === undefined) return [];
    const byIndex = new Map(pair.snapshot.elements.map((element) => [element.i, element]));
    const applies = dark.snapshot.elements.some((element) => {
      const twin = byIndex.get(element.i);
      return twin !== undefined && restyled(twin, element);
    });
    const scheme = dark.snapshot.colorScheme ?? "normal";
    return applies && !/\bdark\b/.test(scheme)
      ? [
          {
            width: dark.width,
            detail: `dark rules restyle the page, and its computed color-scheme is "${scheme}"`,
          },
        ]
      : [];
  });
}

const JUDGES: ReadonlyMap<string, (run: RenderRun) => Judgement> = new Map([
  [
    "text-contrast-aa",
    (run) => measured(onceEach(variantsOf(run, "base"), (variant) => aaFailures(variant.snapshot))),
  ],
  [
    "contrast-nontext",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements.flatMap((element) => {
            if (!element.visible || element.borderWidth < 1 || element.ground === null) return [];
            if (
              !(
                element.tag === "select" ||
                element.tag === "textarea" ||
                (element.tag === "input" && TYPED.has(element.inputType))
              )
            )
              return [];
            const border = parseColour(element.borderColour);
            const ground = parseColour(element.ground);
            const fill = parseColour(element.backgroundColour);
            if (border === undefined || ground === undefined) return [];
            // A field whose own fill stands out from the ground is bounded by its fill.
            if (fill !== undefined && fill.alpha > 0.9 && contrastRatio(fill, ground) >= 3)
              return [];
            const ratio = contrastRatio(border, ground);
            return ratio < 3 ? [`${shown(element)} boundary at ${String(ratio)}:1, under 3:1`] : [];
          }),
        ),
      ),
  ],
  [
    "contrast-apca-advisory",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements.flatMap((element) => {
            if (
              !showsText(element) ||
              element.fontSize >= 24 ||
              element.ground === null ||
              element.groundImage
            )
              return [];
            const ink = inkOf(element);
            const ground = parseColour(element.ground);
            if (ink === undefined || ground === undefined) return [];
            const lc = Math.abs(apcaContrast(blended(ink, ground), ground));
            return lc < 60
              ? [
                  `${shown(element)} at Lc ${lc.toFixed(0)}, WCAG 2 ${String(textContrast(element) ?? "?")}:1`,
                ]
              : [];
          }),
        ),
      ),
  ],
  [
    "contrast-both-schemes",
    (run) =>
      run.homeDark
        ? measured(
            onceEach(variantsOf(run, "base", "dark"), (variant) =>
              aaFailures(variant.snapshot).map((detail) => `dark: ${detail}`),
            ),
          )
        : measured([]),
  ],
  [
    // Read from the computed styles, never the source's text, so a reshaped source cannot pass it (J-148 S3, F2).
    "dark-scheme-declared",
    (run) => (run.homeDark ? measured(darkSchemeHits(run)) : unmeasured(NO_DARK_VARIANT)),
  ],
  [
    "focus-visible",
    (run) => {
      const width = widest(run)?.width ?? 0;
      const seen = new Set<string>();
      return measured(
        run.focus.flatMap((stop) => {
          if (stop.at === null || stop.changed || seen.has(stop.at)) return [];
          seen.add(stop.at);
          return [{ width, detail: `${stop.tag} "${stop.name}" shows no change on focus` }];
        }),
      );
    },
  ],
  [
    "focus-not-obscured",
    (run) => {
      const width = widest(run)?.width ?? 0;
      const seen = new Set<string>();
      return measured(
        run.focus.flatMap((stop) => {
          if (stop.at === null || !stop.covered || seen.has(stop.at)) return [];
          seen.add(stop.at);
          return [
            {
              width,
              detail: `${stop.tag} "${stop.name}" lies wholly under another layer when focused`,
            },
          ];
        }),
      );
    },
  ],
  [
    "no-keyboard-trap",
    (run) => {
      const width = widest(run)?.width ?? 0;
      const half = run.focus.slice(Math.floor(run.focus.length / 2));
      const keys = new Set(half.map((stop) => stop.at ?? "page"));
      const trapped = run.focusables > 2 && half.length >= 6 && keys.size <= 2 && !keys.has("page");
      return measured(
        trapped
          ? [
              {
                width,
                detail: `focus cycles among ${[...keys].join(", ")} of ${String(run.focusables)} stops`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "label-in-name",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements.flatMap((element) => {
            if (!element.interactive || element.label === "" || element.name === "") return [];
            const label = element.label.toLowerCase();
            return element.name.toLowerCase().includes(label)
              ? []
              : [
                  `${element.tag} shows "${element.label.slice(0, 40)}" and is named "${element.name.slice(0, 40)}"`,
                ];
          }),
        ),
      ),
  ],
  ["error-associated", () => unmeasured(FLOW)],
  [
    "target-size-floor",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const all = targets(variant.snapshot);
      return measured(
        all
          .filter((element) => undersized(element) && spacingFails(element, all))
          .map((element) => ({
            width: variant.width,
            detail: `${shown(element)} at ${element.w.toFixed(0)} by ${element.h.toFixed(0)}`,
          })),
      );
    },
  ],
  [
    "target-size-touch",
    (run) => {
      const variant = baseAt(run, 390);
      if (variant === undefined) return measured([]);
      return measured(
        targets(variant.snapshot)
          .filter((element) => element.w < 44 || element.h < 44)
          .map((element) => ({
            width: 390,
            detail: `${shown(element)} at ${element.w.toFixed(0)} by ${element.h.toFixed(0)}`,
          })),
      );
    },
  ],
  [
    "decorative-layer-intercepts",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          targets(variant.snapshot).flatMap((element) => {
            const top = element.cover?.[0];
            if (top === undefined || top === -1 || top === -2) return [];
            const over = top >= 0 ? variant.snapshot.elements[top] : undefined;
            if (over !== undefined && (over.interactive || over.tag === "label")) return [];
            if (element.opacity < 0.05) return [];
            return [
              `${shown(element)} lies under ${over === undefined ? (top === -4 ? "a layer of its container" : "another layer") : shown(over)} at its centre`,
            ];
          }),
        ),
      ),
  ],
  [
    "reflow-320",
    (run) =>
      measured(
        variantsOf(run, "floor").flatMap((variant) => {
          const sideways =
            variant.snapshot.scrollWidth > variant.width + 1
              ? [
                  {
                    width: variant.width,
                    detail: `the page is ${String(variant.snapshot.scrollWidth)} wide and scrolls sideways`,
                  },
                ]
              : [];
          const cut = variant.snapshot.elements
            .filter(
              (element) =>
                element.visible &&
                clipped(element) &&
                element.overflowX !== "auto" &&
                element.overflowX !== "scroll",
            )
            .map((element) => ({ width: variant.width, detail: `${shown(element)} clips` }));
          return [...sideways, ...cut];
        }),
      ),
  ],
  ["text-spacing-survives", (run) => measured(newlyClipped(run, "spacing"))],
  ["text-resize-200", (run) => measured(newlyClipped(run, "resize"))],
  [
    "text-contained",
    (run) =>
      measured(
        onceEach([...variantsOf(run, "base"), ...variantsOf(run, "floor")], (variant) =>
          variant.snapshot.elements
            .filter((element) => element.visible && runsOut(element))
            .map((element) => `${shown(element)} runs out of its box`),
        ),
      ),
  ],
  [
    "text-not-covered",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements.flatMap((element) => {
            if (!showsText(element) || element.text.length < 2) return [];
            const top = element.cover?.[0];
            if (top === undefined || top < 0) return [];
            const over = variant.snapshot.elements[top];
            if (over === undefined) return [];
            const fill = parseColour(over.backgroundColour);
            const paints =
              (fill !== undefined && fill.alpha > 0.5) ||
              over.gradient ||
              ["img", "video", "canvas", "svg", "picture"].includes(over.tag);
            return paints ? [`${shown(element)} lies under ${shown(over)}`] : [];
          }),
        ),
      ),
  ],
  [
    "content-visible-at-rest",
    (run) =>
      measured(
        onceEach(variantsOf(run, "noscript"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                element.text.length > 1 &&
                inFirstScreen(element, variant.snapshot) &&
                element.w > 0 &&
                (element.opacity < 0.05 || !element.visible),
            )
            .map((element) => `${shown(element)} stays hidden with no script`),
        ),
      ),
  ],
  [
    "reduced-motion-hidden",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base", "light", "reduce"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                element.text.length > 1 &&
                inFirstScreen(element, variant.snapshot) &&
                element.w > 0 &&
                element.opacity < 0.05,
            )
            .map((element) => `${shown(element)} stays hidden under reduced motion`),
        ),
      ),
  ],
  [
    "motion-pause-5s",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const { elements } = variant.snapshot;
      const control = elements.some(
        (element) =>
          element.interactive &&
          /\b(pause|stop|hide|play)\b/i.test(`${element.name} ${element.label}`),
      );
      if (control) return measured([]);
      return measured(
        elements
          .filter(
            (element) =>
              element.visible &&
              (element.tag === "marquee" ||
                (element.animation !== null &&
                  element.animation.running &&
                  (element.animation.infinite ||
                    element.animation.seconds * element.animation.count > 5))),
          )
          .map((element) => ({
            width: variant.width,
            detail: `${shown(element)} moves ${element.animation?.infinite === true ? "without end" : "past five seconds"} with no pause control`,
          })),
      );
    },
  ],
  [
    "flash-limit",
    () => unmeasured("needs the page's frames over time, which the render engine does not record"),
  ],
  ["dialog-focus", () => unmeasured(FLOW)],
  [
    "no-raw-empty",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                showsText(element) &&
                /\b(?:undefined|null|NaN)\b|\[object Object\]/.test(element.text) &&
                !inCode(element, variant.snapshot.elements),
            )
            .map((element) => `${shown(element)} shows a raw empty value`),
        ),
      ),
  ],
  [
    "image-loads",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                element.img !== null &&
                element.img.src !== "" &&
                element.img.complete &&
                element.img.naturalWidth === 0,
            )
            .map((element) => `img ${element.img?.src ?? ""} did not load`),
        ),
      ),
  ],
  [
    "track-overflow",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                element.visible &&
                element.position !== "fixed" &&
                pastRightEdge(element, variant.snapshot, variant.width),
            )
            .map(
              (element) =>
                `${shown(element)} ends at ${(element.x + element.w).toFixed(0)}, past ${String(variant.width)}`,
            ),
        ),
      ),
  ],
  [
    "trailing-action-reachable",
    (run) =>
      measured(
        variantsOf(run, "floor").flatMap((variant) =>
          targets(variant.snapshot)
            .filter((element) => pastRightEdge(element, variant.snapshot, variant.width))
            .map((element) => ({
              width: variant.width,
              detail: `${shown(element)} is cut at the right edge`,
            })),
        ),
      ),
  ],
  [
    "dialog-fits-short",
    (run) =>
      measured(
        variantsOf(run, "floor").flatMap((variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                element.open &&
                element.visible &&
                element.y + element.h > variant.height + 1 &&
                element.overflowY !== "auto" &&
                element.overflowY !== "scroll",
            )
            .map((element) => ({
              width: variant.width,
              detail: `${shown(element)} runs ${(element.y + element.h - variant.height).toFixed(0)}px below a ${String(variant.height)}px viewport and does not scroll`,
            })),
        ),
      ),
  ],
  [
    "narrow-nav-cue",
    (run) =>
      measured(
        variantsOf(run, "floor").flatMap((variant) => {
          const { elements } = variant.snapshot;
          const cue = elements.some(
            (element) =>
              element.visible &&
              element.interactive &&
              (element.expanded !== "" ||
                element.haspopup !== "" ||
                /\bmenu\b/i.test(`${element.name} ${element.label}`)),
          );
          if (cue) return [];
          const navs = elements.filter(
            (element) => element.tag === "nav" || element.role === "navigation",
          );
          return navs.flatMap((nav) => {
            const items = elements.filter((element) => {
              for (
                let node = elements[element.parent];
                node !== undefined;
                node = elements[node.parent]
              )
                if (node.i === nav.i) return element.interactive;
              return false;
            });
            const cut = items.filter((item) => item.x + item.w > variant.width + 1 || clipped(nav));
            return cut.length > 0
              ? [
                  {
                    width: variant.width,
                    detail: `${String(cut.length)} navigation items cut at ${String(variant.width)} with no menu`,
                  },
                ]
              : [];
          });
        }),
      ),
  ],
  [
    "single-sticky-top",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const stuck = variant.snapshot.elements.filter(
        (element) =>
          element.visible &&
          (element.position === "sticky" || element.position === "fixed") &&
          element.top !== null &&
          Math.abs(element.top) <= 1 &&
          element.w >= variant.width / 2,
      );
      return measured(
        stuck.length > 1
          ? [
              {
                width: variant.width,
                detail: `${String(stuck.length)} bars stick to the top: ${stuck.map(shown).join(", ")}`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "essential-truncation",
    (run) =>
      measured(
        variantsOf(run, "floor").flatMap((variant) =>
          variant.snapshot.elements
            .filter((element) => {
              const essential =
                element.interactive ||
                /^h[1-6]$/.test(element.tag) ||
                element.role === "alert" ||
                element.role === "status";
              const cut =
                (element.textOverflow === "ellipsis" &&
                  element.scrollWidth > element.clientWidth + 1) ||
                (element.lineClamp !== "" && element.scrollHeight > element.clientHeight + 1);
              return essential && element.visible && cut;
            })
            .map((element) => ({ width: variant.width, detail: `${shown(element)} is truncated` })),
        ),
      ),
  ],
  [
    "loop-offscreen-paused",
    () =>
      unmeasured(
        "needs the page scrolled and its animations timed off-screen, which the render engine does not do",
      ),
  ],
  [
    "prose-measure",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      return measured(
        variant.snapshot.elements
          .filter(
            (element) =>
              element.tag === "p" &&
              element.visible &&
              element.length >= 160 &&
              element.lines >= 2 &&
              element.length / element.lines > 88,
          )
          .map((element) => ({
            width: variant.width,
            detail: `${shown(element)} holds ${(element.length / element.lines).toFixed(0)} characters a line`,
          })),
      );
    },
  ],
  [
    "body-size",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const least = run.register === "site" ? 16 : 13;
      return measured(
        variant.snapshot.elements
          .filter(
            (element) =>
              (element.tag === "p" || element.tag === "li") &&
              showsText(element) &&
              element.length >= 40 &&
              element.fontSize < least,
          )
          .map((element) => ({
            width: variant.width,
            detail: `${shown(element)} at ${String(element.fontSize)}px, under ${String(least)}px`,
          })),
      );
    },
  ],
  [
    "text-under-11",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) => showsText(element) && element.text.length >= 2 && element.fontSize < 11,
            )
            .map((element) => `${shown(element)} at ${String(element.fontSize)}px`),
        ),
      ),
  ],
  [
    "input-font-16",
    (run) => {
      const variant = baseAt(run, 390);
      if (variant === undefined) return measured([]);
      return measured(
        variant.snapshot.elements
          .filter(
            (element) =>
              element.visible &&
              (element.tag === "textarea" ||
                element.tag === "select" ||
                (element.tag === "input" && TYPED.has(element.inputType))) &&
              element.fontSize < 16,
          )
          .map((element) => ({
            width: 390,
            detail: `${shown(element)} at ${String(element.fontSize)}px`,
          })),
      );
    },
  ],
  [
    "family-count",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const families = [
        ...new Set(
          variant.snapshot.elements.filter(showsText).map((element) => element.fontFamily),
        ),
      ];
      return measured(
        families.length > 3
          ? [
              {
                width: variant.width,
                detail: `${String(families.length)} families: ${families.join(", ")}`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "font-loaded",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const { fonts, elements } = variant.snapshot;
      const failed = fonts
        .filter((face) => face.status === "error")
        .map((face) => `${face.family} ${face.weight} failed to load`);
      const loaded = fonts.filter((face) => face.status === "loaded");
      const covers = (weight: string, used: number): boolean => {
        const [low, high] = weight.split(/\s+/).map(Number);
        return high === undefined ? low === used : (low ?? 0) <= used && used <= high;
      };
      const synthesised = new Set<string>();
      for (const element of elements.filter(showsText)) {
        const faces = loaded.filter((face) => face.family === element.fontFamily);
        if (faces.length === 0) continue;
        if (!faces.some((face) => covers(face.weight, element.fontWeight)))
          synthesised.add(`${element.fontFamily} ${String(element.fontWeight)} is synthesised`);
      }
      return measured(
        [...failed, ...synthesised].map((detail) => ({ width: variant.width, detail })),
      );
    },
  ],
  [
    "headline-two-lines",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements
            .filter(
              (element) =>
                (element.tag === "h1" || element.tag === "h2") &&
                showsText(element) &&
                element.lines > 2,
            )
            .map((element) => `${shown(element)} wraps to ${String(element.lines)} lines`),
        ),
      ),
  ],
  ["pending-no-repeat", () => unmeasured(FLOW)],
  ["error-focus-first", () => unmeasured(FLOW)],
  ["input-keeps-value", () => unmeasured(FLOW)],
  ["toast-timing", () => unmeasured(FLOW)],
  [
    "plural-rules",
    (run) =>
      measured(
        onceEach(variantsOf(run, "base"), (variant) =>
          variant.snapshot.elements.flatMap((element) => {
            if (!showsText(element) || inCode(element, variant.snapshot.elements)) return [];
            const match = /(?:^|[^\d.,])1 ([a-z]{2,}s)\b/i.exec(element.text);
            return match !== null && !/(?:ss|us|is|ics|news)$/i.test(match[1] ?? "")
              ? [`"${match[0].trim()}"`]
              : [];
          }),
        ),
      ),
  ],
  [
    "lcp-not-lazy",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const [largest] = variant.snapshot.elements
        .filter(
          (element) =>
            element.img !== null && element.visible && inFirstScreen(element, variant.snapshot),
        )
        .sort((a, b) => b.w * b.h - a.w * a.h);
      return measured(
        largest?.img?.loading === "lazy"
          ? [
              {
                width: variant.width,
                detail: `img ${largest.img.src} is the largest first-screen image and is lazy`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "console-clean",
    (run) => {
      const width = widest(run)?.width ?? 0;
      return measured(
        [...new Set(run.console)].map((message) => ({ width, detail: message.slice(0, 200) })),
      );
    },
  ],
  [
    "style-gradient",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const area = variant.width * variant.height;
      return measured(
        variant.snapshot.elements
          .filter(
            (element) =>
              element.visible &&
              element.gradient &&
              (element.w * element.h >= area * 0.3 ||
                element.tag === "button" ||
                element.role === "button" ||
                element.clipText),
          )
          .map((element) => ({
            width: variant.width,
            detail: `${shown(element)} has a gradient fill`,
          })),
      );
    },
  ],
  [
    "style-purple-default",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const seen = new Set<string>();
      for (const element of variant.snapshot.elements.filter(
        (entry) => entry.visible && entry.interactive,
      ))
        for (const value of [element.backgroundColour, element.colour]) {
          const colour = parseColour(value);
          if (colour === undefined || colour.alpha < 0.5) continue;
          const { hue, saturation, lightness } = hslOf(colour);
          // The stock indigo and violet carry red beside their blue, which a link's plain blue does not.
          if (
            hue >= 235 &&
            hue <= 285 &&
            saturation >= 0.45 &&
            lightness >= 0.35 &&
            lightness <= 0.75 &&
            colour.r >= colour.b * 0.25
          )
            seen.add(value);
        }
      return measured(
        [...seen].map((value) => ({
          width: variant.width,
          detail: `the accent ${value} is the stock violet`,
        })),
      );
    },
  ],
  [
    "style-cream-terracotta",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const grounds = new Map<string, number>();
      for (const element of variant.snapshot.elements.filter(showsText))
        if (element.ground !== null)
          grounds.set(element.ground, (grounds.get(element.ground) ?? 0) + 1);
      const ground = [...grounds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const groundColour = ground === undefined ? undefined : parseColour(ground);
      if (groundColour === undefined) return measured([]);
      const g = hslOf(groundColour);
      const cream =
        g.hue >= 25 &&
        g.hue <= 55 &&
        g.saturation >= 0.15 &&
        g.lightness >= 0.86 &&
        g.lightness <= 0.97;
      if (!cream) return measured([]);
      const accent = variant.snapshot.elements.some((element) =>
        [element.backgroundColour, element.colour].some((value) => {
          const colour = parseColour(value);
          if (colour === undefined || colour.alpha < 0.5) return false;
          const a = hslOf(colour);
          return (
            a.hue >= 8 &&
            a.hue <= 28 &&
            a.saturation >= 0.4 &&
            a.lightness >= 0.35 &&
            a.lightness <= 0.62
          );
        }),
      );
      return measured(
        accent
          ? [
              {
                width: variant.width,
                detail: `cream ground ${ground ?? ""} with a terracotta accent`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "style-numbered-labels",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const numbers = variant.snapshot.elements.filter(
        (element) => showsText(element) && /^0\d\.?$/.test(element.text),
      );
      return measured(
        numbers.length >= 2
          ? [
              {
                width: variant.width,
                detail: `${String(numbers.length)} section numbers: ${numbers.map((element) => element.text).join(", ")}`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "style-mono-costume",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const costume = variant.snapshot.elements.filter(
        (element) =>
          showsText(element) &&
          /mono|courier|menlo|consolas|monaco/.test(element.fontFamily) &&
          !inCode(element, variant.snapshot.elements) &&
          element.tag !== "td" &&
          element.tag !== "th",
      );
      return measured(
        costume.slice(0, 5).map((element) => ({
          width: variant.width,
          detail: `${shown(element)} set in ${element.fontFamily}`,
        })),
      );
    },
  ],
  [
    "style-icon-card-row",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const { elements } = variant.snapshot;
      const children = (parent: number): readonly RenderElement[] =>
        elements.filter((element) => element.parent === parent);
      const iconCard = (card: RenderElement): boolean => {
        const own = children(card.i);
        const icon = own.find((element) => element.tag === "svg" || element.tag === "img");
        const heading = own.find((element) => /^h[2-4]$/.test(element.tag));
        return icon !== undefined && heading !== undefined && icon.y <= heading.y;
      };
      const rows = new Map<number, RenderElement[]>();
      for (const element of elements.filter((entry) => entry.visible && iconCard(entry)))
        rows.set(element.parent, [...(rows.get(element.parent) ?? []), element]);
      const hits = [...rows.values()].filter((row) => {
        if (row.length < 3) return false;
        const first = row[0];
        return (
          first !== undefined &&
          row.every(
            (card) =>
              Math.abs(card.w - first.w) <= first.w * 0.05 && Math.abs(card.y - first.y) <= 4,
          )
        );
      });
      return measured(
        hits.map((row) => ({
          width: variant.width,
          detail: `${String(row.length)} equal cards each topped by an icon`,
        })),
      );
    },
  ],
  [
    "style-resting-shadow",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const overlay = /^(?:dialog|menu|listbox|tooltip|alertdialog)$/;
      const resting = variant.snapshot.elements.filter(
        (element) =>
          element.visible &&
          element.shadow &&
          !element.interactive &&
          element.tag !== "dialog" &&
          !overlay.test(element.role) &&
          element.position !== "fixed" &&
          element.position !== "absolute" &&
          element.w * element.h >= 4000,
      );
      return measured(
        resting.length > 0
          ? [
              {
                width: variant.width,
                detail: `${String(resting.length)} resting surfaces carry a shadow, ${resting.slice(0, 3).map(shown).join(", ")}`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "style-glass",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const blurred = variant.snapshot.elements.filter(
        (element) => element.visible && element.backdrop,
      );
      return measured(
        blurred.length > 1
          ? [{ width: variant.width, detail: `${String(blurred.length)} backdrop-blurred layers` }]
          : [],
      );
    },
  ],
  [
    "section-gap",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const sections = variant.snapshot.elements
        .filter((element) => element.tag === "section" && element.visible)
        .sort((a, b) => a.y - b.y);
      const gaps = sections
        .slice(1)
        .map((section, index) =>
          Math.round(section.y - ((sections[index]?.y ?? 0) + (sections[index]?.h ?? 0))),
        );
      const same = gaps.length >= 3 && gaps.every((gap) => Math.abs(gap - (gaps[0] ?? 0)) <= 2);
      return measured(
        same
          ? [
              {
                width: variant.width,
                detail: `every gap between ${String(sections.length)} sections is ${String(gaps[0] ?? 0)}px`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "flat-type-scale",
    (run) => {
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      const sizes = [
        ...new Set(
          variant.snapshot.elements
            .filter(showsText)
            .map((element) => Math.round(element.fontSize)),
        ),
      ]
        .filter((size) => size >= 12)
        .sort((a, b) => a - b);
      const flat = sizes.slice(1).flatMap((size, index) => {
        const below = sizes[index] ?? size;
        return size / below < 1.24 ? [`${String(below)}/${String(size)}px`] : [];
      });
      return measured(
        flat.length > 0
          ? [
              {
                width: variant.width,
                detail: `adjacent sizes under 1.25 apart: ${flat.join(", ")}`,
              },
            ]
          : [],
      );
    },
  ],
  [
    "control-height-ladder",
    (run) => {
      if (run.ladder.length === 0)
        return unmeasured(
          "the home names no control heights, so there is no ladder to read against",
        );
      const variant = widest(run);
      if (variant === undefined) return measured([]);
      return measured(
        targets(variant.snapshot)
          .filter(
            (element) =>
              (element.tag === "button" || element.tag === "input" || element.tag === "select") &&
              !run.ladder.some((step) => Math.abs(step - element.h) <= 1),
          )
          .map((element) => ({
            width: variant.width,
            detail: `${shown(element)} is ${element.h.toFixed(0)}px tall, off the ladder ${run.ladder.join("/")}`,
          })),
      );
    },
  ],
  [
    "press-feedback",
    () => unmeasured("needs a press timed in the page, which the render engine does not do"),
  ],
]);

/** The render rules a judge stands for, which the gate row reads against the list. */
export function renderRuleIds(): readonly string[] {
  return [...JUDGES.keys()];
}

/**
 * Judge one render rule.
 * @param id the rule's id
 * @param run what the render read
 * @returns the places it fails, or why it was not measured
 */
export function judgeRenderRule(id: string, run: RenderRun): Judgement {
  return JUDGES.get(id)?.(run) ?? unmeasured("no judge stands for this rule");
}

/** The render rules' findings on a address and the rules left unmeasured. */
export interface RenderOutcome {
  readonly findings: readonly InterfaceFinding[];
  readonly unmeasured: readonly Unmeasured[];
}

/**
 * Judge every render rule whose facets match the facets in play.
 * @param run what the render read
 * @param play the facets in play
 * @param rules the registry's rules
 * @returns the findings at the address, without waivers, and the rules unmeasured
 */
export function judgeRender(
  run: RenderRun,
  play: FacetsInPlay,
  rules: readonly InterfaceRule[] = interfaceRules(),
): RenderOutcome {
  const findings: InterfaceFinding[] = [];
  const left: Unmeasured[] = [];
  for (const rule of rules.filter(
    (entry) => entry.engine === "render" && facetsMatch(entry.facets, play),
  )) {
    const judgement = judgeRenderRule(rule.id, run);
    if (judgement.kind === "unmeasured") left.push({ rule: rule.id, why: judgement.why });
    else
      for (const hit of judgement.hits)
        findings.push({
          rule: rule.id,
          tier: rule.tier,
          path: run.address,
          line: 0,
          detail: hit.detail,
          width: hit.width,
        });
  }
  return { findings, unmeasured: left };
}

/**
 * Every render rule in play unmeasured, for a run with no browser.
 * @param play the facets in play
 * @param why why no browser ran
 * @param rules the registry's rules
 * @returns one entry per rule
 */
export function allUnmeasured(
  play: FacetsInPlay,
  why: string,
  rules: readonly InterfaceRule[] = interfaceRules(),
): readonly Unmeasured[] {
  return rules
    .filter((rule) => rule.engine === "render" && facetsMatch(rule.facets, play))
    .map((rule) => ({ rule: rule.id, why }));
}

/**
 * Whether a home declares a dark scheme: a colour token named dark, or its
 * Colors section naming a dark scheme or dark mode.
 * @param design the home
 * @returns true where it does
 */
export function homeDeclaresDark(design: DesignDocument | undefined): boolean {
  if (design === undefined) return false;
  if (design.tokens.colors.some((token) => /(?:^|[-_.])dark(?:[-_.]|$)/i.test(token.name)))
    return true;
  const colours = design.sections.find((section) => section.heading.toLowerCase() === "colors");
  return colours !== undefined && /\bdark (?:scheme|mode|theme)\b/i.test(colours.text);
}

/**
 * The ladder of control heights a home names: each component token's
 * `height`, in pixels, ascending.
 * @param design the home
 * @returns the heights, none where it names none
 */
export function homeLadder(design: DesignDocument | undefined): readonly number[] {
  if (design === undefined) return [];
  const heights = design.tokens.components.flatMap((component) =>
    component.fields.flatMap((field) => {
      if (field.name !== "height") return [];
      const pixels = pixelsOf(field.value);
      return pixels === undefined ? [] : [pixels];
    }),
  );
  return [...new Set(heights)].sort((a, b) => a - b);
}
