import { parseColour } from "./colour.ts";

/**
 * Values safe to place in an inline style (J-123 S7): a colour the colour
 * parser reads, a length, a weight. A specimen, a composite and the viewer's
 * token tiles place a DESIGN.md or catalog value only through these, so no
 * value can close the declaration or reach a URL.
 */

/** A token's value, as DESIGN.md and the catalog hold it. */
type StyleValue = string | number;

/** A colour value safe to place in a style: one the colour parser reads, as written. */
export function safeColour(value: string | undefined): string | undefined {
  return value !== undefined &&
    parseColour(value) !== undefined &&
    /^[#a-z0-9.,%()\s/-]+$/i.test(value)
    ? value
    : undefined;
}

/** A length safe to place in a style. */
export function safeLength(value: StyleValue | undefined, fallback: string): string {
  const text = String(value ?? "").trim();
  return /^(?:[\d.]+(?:px|rem|em|%)|clamp\([\d.a-z,+\-*\s%()]+\))$/i.test(text) ? text : fallback;
}

/** A weight safe to place in a style. */
export function safeWeight(value: StyleValue | undefined, fallback: number): string {
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 100 && weight <= 1000
    ? String(Math.round(weight))
    : String(fallback);
}
