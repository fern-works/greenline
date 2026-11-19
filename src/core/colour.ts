/**
 * CSS colours as numbers (J-123 S1 and S4): a colour value parsed into its
 * sRGB channels, the distance between two colours by channel, and the WCAG 2
 * contrast ratio between ink and ground. The drift read compares the colours
 * the code uses with the home's palette by channel, the floor's contrast
 * rules measure ratios from the tokens, and a colour beyond the sRGB gamut is
 * flagged where an oklch value has no sRGB fallback. Pure arithmetic: no
 * named colour table beyond the few CSS keywords the code most often writes.
 */

/** A colour in sRGB, each channel 0 to 255, alpha 0 to 1; `inGamut` is false where an oklch or oklab value lay outside sRGB before it was clamped. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
  readonly inGamut: boolean;
}

const KEYWORDS: ReadonlyMap<string, readonly [number, number, number]> = new Map([
  ["black", [0, 0, 0]],
  ["white", [255, 255, 255]],
  ["red", [255, 0, 0]],
  ["green", [0, 128, 0]],
  ["blue", [0, 0, 255]],
  ["gray", [128, 128, 128]],
  ["grey", [128, 128, 128]],
]);

/** A colour value's pattern in source text: a hex, or one of the functional forms. */
export const COLOUR_IN_TEXT: RegExp =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/g;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function rgb(r: number, g: number, b: number, alpha = 1, inGamut = true): Rgb {
  return {
    r: Math.round(clamp(r, 0, 255)),
    g: Math.round(clamp(g, 0, 255)),
    b: Math.round(clamp(b, 0, 255)),
    alpha: clamp(alpha, 0, 1),
    inGamut,
  };
}

function hexColour(hex: string): Rgb | undefined {
  const digits = hex.slice(1);
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
  if (!/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(full)) return undefined;
  const channel = (at: number): number => Number.parseInt(full.slice(at, at + 2), 16);
  return rgb(channel(0), channel(2), channel(4), full.length === 8 ? channel(6) / 255 : 1);
}

/** The numbers of a functional colour's arguments, a percentage read as a fraction of its scale. */
function argumentsOf(
  body: string,
): readonly { readonly value: number; readonly percent: boolean }[] {
  return body
    .split(/[\s,/]+/)
    .filter((part) => part !== "")
    .map((part) => ({
      value: Number.parseFloat(part),
      percent: part.endsWith("%"),
    }));
}

function hslToRgb(hue: number, saturation: number, lightness: number, alpha: number): Rgb {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb(f(0) * 255, f(8) * 255, f(4) * 255, alpha);
}

/** Linear sRGB to the gamma-encoded channel, 0 to 1. */
function encode(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
}

function oklabToRgb(lightness: number, a: number, b: number, alpha: number): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const inGamut = linear.every((channel) => channel >= -0.0005 && channel <= 1.0005);
  const [r, g, bl] = linear.map((channel) => encode(clamp(channel, 0, 1)) * 255);
  return rgb(r ?? 0, g ?? 0, bl ?? 0, alpha, inGamut);
}

/**
 * Parse a CSS colour value: a hex of three, four, six or eight digits,
 * `rgb()`, `rgba()`, `hsl()`, `hsla()`, `oklch()`, `oklab()`, or one of a
 * few keywords.
 * @param value the value as written
 * @returns the colour in sRGB, or undefined where it is no colour this reads
 */
export function parseColour(value: string): Rgb | undefined {
  const text = value.trim().toLowerCase();
  if (text.startsWith("#")) return hexColour(text);
  const keyword = KEYWORDS.get(text);
  if (keyword !== undefined) return rgb(keyword[0], keyword[1], keyword[2]);
  const match = /^(rgba?|hsla?|oklch|oklab)\(([^)]*)\)$/.exec(text);
  if (match === null) return undefined;
  const [first, second, third, fourth] = argumentsOf(match[2] ?? "");
  if (first === undefined || second === undefined || third === undefined) return undefined;
  if ([first, second, third].some((part) => Number.isNaN(part.value))) return undefined;
  const alpha =
    fourth === undefined || Number.isNaN(fourth.value)
      ? 1
      : fourth.percent
        ? fourth.value / 100
        : fourth.value;
  const form = match[1] ?? "";
  if (form.startsWith("rgb")) {
    const channel = (part: { readonly value: number; readonly percent: boolean }): number =>
      part.percent ? (part.value / 100) * 255 : part.value;
    return rgb(channel(first), channel(second), channel(third), alpha);
  }
  if (form.startsWith("hsl")) return hslToRgb(first.value, second.value, third.value, alpha);
  const lightness = first.percent ? first.value / 100 : first.value;
  if (form === "oklab") return oklabToRgb(lightness, second.value, third.value, alpha);
  const chroma = second.percent ? (second.value / 100) * 0.4 : second.value;
  const hue = (third.value * Math.PI) / 180;
  return oklabToRgb(lightness, chroma * Math.cos(hue), chroma * Math.sin(hue), alpha);
}

/**
 * Whether two colours lie within a tolerance of each other on every channel.
 * @param one a colour
 * @param other another
 * @param tolerance the largest difference allowed per channel
 * @returns true when every channel is within it
 */
export function withinChannels(one: Rgb, other: Rgb, tolerance: number): boolean {
  return (
    Math.abs(one.r - other.r) <= tolerance &&
    Math.abs(one.g - other.g) <= tolerance &&
    Math.abs(one.b - other.b) <= tolerance
  );
}

/** A colour over a ground, its alpha composited. */
function over(colour: Rgb, ground: Rgb): Rgb {
  const mix = (top: number, bottom: number): number =>
    top * colour.alpha + bottom * (1 - colour.alpha);
  return rgb(mix(colour.r, ground.r), mix(colour.g, ground.g), mix(colour.b, ground.b));
}

/**
 * A colour's relative luminance, as WCAG 2 defines it.
 * @param colour the colour, opaque
 * @returns its luminance, 0 to 1
 */
function luminance(colour: Rgb): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b);
}

/**
 * The WCAG 2 contrast ratio of ink on a ground, the ink's alpha composited
 * over the ground first.
 * @param ink the text's or the mark's colour
 * @param ground the colour behind it, opaque
 * @returns the ratio, 1 to 21, to two decimals
 */
export function contrastRatio(ink: Rgb, ground: Rgb): number {
  const shown = over(ink, ground);
  const [light, dark] = [luminance(shown), luminance(ground)].sort((a, b) => b - a);
  const ratio = ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
  return Math.round(ratio * 100) / 100;
}
