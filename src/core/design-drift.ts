import { COLOUR_IN_TEXT, parseColour, withinChannels, type Rgb } from "./colour.ts";
import { resolveValue, type DesignDocument } from "./design-file.ts";

/**
 * DESIGN.md's drift (J-123 S1; `workshop/components/interface-rules.md`, the
 * drift engine): every colour, face, radius, spacing step and font size the
 * code under the interface roots uses that the governing DESIGN.md does not
 * name, and every token the code no longer uses. A colour matches a token
 * within 6 per channel, a length within half a pixel, the tolerances the
 * registry's drift rules state. Pure: the shell reads the files and the
 * home, this reads their text.
 */

/** The kinds of value the drift read compares with the home. */
export type DriftKind = "colour" | "font" | "radius" | "spacing" | "size";

/** One value a file uses, where it stands. */
export interface UsedValue {
  readonly kind: DriftKind;
  /** The value as written. */
  readonly value: string;
  readonly path: string;
  readonly line: number;
}

/** A token of the home no file uses, by group and name. */
export interface UnusedToken {
  readonly group: "colors" | "rounded" | "spacing" | "typography";
  readonly name: string;
}

/** The drift between the code and its home. */
export interface DesignDrift {
  readonly undeclared: readonly UsedValue[];
  readonly unused: readonly UnusedToken[];
}

/** A colour within this many units per channel of a token is the token. */
const COLOUR_TOLERANCE = 6;
/** A length within this many pixels of a token is the token. */
const LENGTH_TOLERANCE = 0.5;

const GENERIC_FACES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "cursive",
  "fantasy",
  "inherit",
  "initial",
  "unset",
  "-apple-system",
  "blinkmacsystemfont",
]);

/** Declarations whose values the read collects, by kind: a CSS property and its camel-cased form in a style object. */
const DECLARATIONS: readonly (readonly [DriftKind, RegExp])[] = [
  ["font", /(?:font-family|fontFamily)\s*:\s*([^;}\n]+)/g],
  ["radius", /(?:border-radius|borderRadius)\s*:\s*([^;}\n,]+)/g],
  [
    "spacing",
    /(?:margin|padding|gap|row-gap|column-gap|rowGap|columnGap)(?:-?(?:top|right|bottom|left|inline|block|Top|Right|Bottom|Left|Inline|Block))?\s*:\s*([^;}\n,]+)/g,
  ],
  ["size", /(?:font-size|fontSize)\s*:\s*([^;}\n,]+)/g],
];

/** Tailwind's arbitrary values, `prefix-[value]`, by the kind the prefix names. */
const ARBITRARY = /\b(rounded|p[xytrbl]?|m[xytrbl]?|gap|text|font)-\[([^\]\s]+)\]/g;

function arbitraryKind(prefix: string, value: string): DriftKind | undefined {
  if (prefix === "rounded") return "radius";
  if (prefix === "gap" || /^[pm][xytrbl]?$/.test(prefix)) return "spacing";
  if (prefix === "font") return "font";
  if (prefix === "text") return /^\d/.test(value) ? "size" : undefined;
  return undefined;
}

/** The 1-based line of an offset in a text. */
function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

/** A face's first family, unquoted, or undefined for a generic family or a variable. */
function firstFace(value: string): string | undefined {
  const first = value
    .split(",")[0]
    ?.trim()
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  if (first === undefined || first === "" || first.startsWith("var(") || first.startsWith("$"))
    return undefined;
  return GENERIC_FACES.has(first.toLowerCase()) ? undefined : first;
}

/** The lengths a value holds, each in px or rem, as written. */
function lengthsIn(value: string): readonly string[] {
  return [...value.matchAll(/(?<![\w.-])-?\d*\.?\d+(?:px|rem)\b/g)].map((match) => match[0]);
}

/**
 * The values a file uses that the drift read compares: its colours, its
 * faces, its radii, its spacing and its font sizes, each where it stands.
 * @param path the file's path from the root
 * @param text the file's text
 * @returns each value, in the file's order
 */
export function usedValues(path: string, text: string): readonly UsedValue[] {
  const found: UsedValue[] = [];
  for (const match of text.matchAll(COLOUR_IN_TEXT))
    found.push({ kind: "colour", value: match[0], path, line: lineAt(text, match.index) });
  for (const [kind, pattern] of DECLARATIONS)
    for (const match of text.matchAll(pattern)) {
      const raw = (match[1] ?? "").replace(/["'`]/g, (quote) => (kind === "font" ? quote : ""));
      const line = lineAt(text, match.index);
      if (kind === "font") {
        const face = firstFace(raw);
        if (face !== undefined) found.push({ kind, value: face, path, line });
      } else for (const length of lengthsIn(raw)) found.push({ kind, value: length, path, line });
    }
  for (const match of text.matchAll(ARBITRARY)) {
    const value = match[2] ?? "";
    const kind = arbitraryKind(match[1] ?? "", value);
    if (kind === undefined || value.startsWith("#") || value.startsWith("var(")) continue;
    found.push({
      kind,
      value: kind === "font" ? value.replace(/_/g, " ") : value,
      path,
      line: lineAt(text, match.index),
    });
  }
  return found;
}

/**
 * A length in pixels: px as written, rem at 16px.
 * @param value the length
 * @returns its pixels, or undefined where it is no px or rem length
 */
export function pixelsOf(value: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value.trim());
  if (match === null) return undefined;
  const number = Number.parseFloat(match[1] ?? "");
  return match[2] === "rem" ? number * 16 : number;
}

/** The home's values a kind is compared with, each resolved through its references. */
interface Declared {
  readonly colours: readonly { readonly name: string; readonly rgb: Rgb }[];
  readonly faces: readonly string[];
  readonly radii: readonly { readonly name: string; readonly px: number }[];
  readonly spacing: readonly { readonly name: string; readonly px: number }[];
  readonly sizes: readonly number[];
}

function declaredOf(design: DesignDocument): Declared {
  const resolved = (value: string): string | undefined => {
    const reading = resolveValue(design, value);
    return reading.kind === "value" ? reading.value : undefined;
  };
  const lengths = (
    tokens: readonly { readonly name: string; readonly value: string }[],
  ): readonly { readonly name: string; readonly px: number }[] =>
    tokens.flatMap((token) => {
      const px = pixelsOf(resolved(token.value) ?? "");
      return px === undefined ? [] : [{ name: token.name, px }];
    });
  const field = (name: string): readonly string[] =>
    design.tokens.typography.flatMap((token) =>
      token.fields.flatMap((entry) => {
        const value = entry.name === name ? resolved(entry.value) : undefined;
        return value === undefined ? [] : [value];
      }),
    );
  return {
    colours: design.tokens.colors.flatMap((token) => {
      const rgb = parseColour(resolved(token.value) ?? "");
      return rgb === undefined ? [] : [{ name: token.name, rgb }];
    }),
    faces: field("fontFamily").flatMap((value) => firstFace(value) ?? []),
    radii: lengths(design.tokens.rounded),
    spacing: lengths(design.tokens.spacing),
    sizes: field("fontSize").flatMap((value) => pixelsOf(value) ?? []),
  };
}

/** Whether a used value is one the home names. */
function isDeclared(used: UsedValue, declared: Declared): boolean {
  const near = (px: number | undefined, values: readonly number[]): boolean =>
    px === undefined ||
    px === 0 ||
    values.some((value) => Math.abs(value - px) <= LENGTH_TOLERANCE);
  switch (used.kind) {
    case "colour": {
      const rgb = parseColour(used.value);
      return (
        rgb === undefined ||
        declared.colours.some((token) => withinChannels(token.rgb, rgb, COLOUR_TOLERANCE))
      );
    }
    case "font":
      return declared.faces.some((face) => face.toLowerCase() === used.value.toLowerCase());
    case "radius":
      return near(
        pixelsOf(used.value),
        declared.radii.map((token) => token.px),
      );
    case "spacing":
      return near(
        pixelsOf(used.value),
        declared.spacing.map((token) => token.px),
      );
    case "size":
      return near(pixelsOf(used.value), declared.sizes);
  }
}

/** Whether a token's name appears as a word in the code: a custom property, a class or a key. */
function namedIn(name: string, texts: readonly string[]): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9-])`);
  return texts.some((text) => pattern.test(text));
}

/**
 * The drift between the code under the roots and its home: each value used
 * that the home does not name, and each token neither used by value nor
 * named in the code.
 * @param design the governing DESIGN.md
 * @param files the interface files it governs, each with its text
 * @returns the drift
 */
export function designDrift(
  design: DesignDocument,
  files: readonly { readonly path: string; readonly text: string }[],
): DesignDrift {
  const declared = declaredOf(design);
  const used = files.flatMap((file) => usedValues(file.path, file.text));
  const texts = files.map((file) => file.text);
  const undeclared = used.filter((value) => !isDeclared(value, declared));
  const usedColours = used.flatMap((value) =>
    value.kind === "colour" ? (parseColour(value.value) ?? []) : [],
  );
  const usedPx = (kind: DriftKind): readonly number[] =>
    used.flatMap((value) => (value.kind === kind ? (pixelsOf(value.value) ?? []) : []));
  const unused: UnusedToken[] = [
    ...declared.colours
      .filter(
        (token) =>
          !usedColours.some((rgb) => withinChannels(token.rgb, rgb, COLOUR_TOLERANCE)) &&
          !namedIn(token.name, texts),
      )
      .map((token): UnusedToken => ({ group: "colors", name: token.name })),
    ...declared.radii
      .filter(
        (token) =>
          !usedPx("radius").some((px) => Math.abs(px - token.px) <= LENGTH_TOLERANCE) &&
          !namedIn(token.name, texts),
      )
      .map((token): UnusedToken => ({ group: "rounded", name: token.name })),
    ...declared.spacing
      .filter(
        (token) =>
          !usedPx("spacing").some((px) => Math.abs(px - token.px) <= LENGTH_TOLERANCE) &&
          !namedIn(token.name, texts),
      )
      .map((token): UnusedToken => ({ group: "spacing", name: token.name })),
  ];
  return { undeclared, unused };
}

/** The noun of a kind, singular and plural. */
const NOUNS = {
  colour: ["colour", "colours"],
  font: ["face", "faces"],
  radius: ["radius", "radii"],
  spacing: ["spacing step", "spacing steps"],
  size: ["font size", "font sizes"],
} as const satisfies Readonly<Record<DriftKind, readonly [string, string]>>;

/**
 * The drift line `greenline status` prints, or undefined while the code and
 * its home agree.
 * @param drift the drift
 * @returns the line, unindented
 */
export function designDriftLine(drift: DesignDrift): string | undefined {
  if (drift.undeclared.length === 0 && drift.unused.length === 0) return undefined;
  const distinct = new Map<DriftKind, Set<string>>();
  for (const value of drift.undeclared)
    distinct.set(
      value.kind,
      (distinct.get(value.kind) ?? new Set()).add(value.value.toLowerCase()),
    );
  const parts = [...distinct].map(([kind, values]) => {
    const [one, many] = NOUNS[kind];
    return `${String(values.size)} ${values.size === 1 ? one : many}`;
  });
  const undeclared =
    parts.length === 0 ? [] : [`${parts.join(", ")} the code uses that DESIGN.md does not name`];
  const unused =
    drift.unused.length === 0
      ? []
      : [
          `${String(drift.unused.length)} token${drift.unused.length === 1 ? "" : "s"} the code no longer uses`,
        ];
  return `interface drift: ${[...undeclared, ...unused].join("; ")}`;
}
