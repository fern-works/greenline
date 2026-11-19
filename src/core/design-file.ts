import type { Result } from "../commons/result.ts";
import { contractFailure, contractOk, type ContractParseFailed } from "./contract.ts";
import {
  pairsOf,
  parseYamlMap,
  scalarFor,
  serializeYamlMap,
  valueAt,
  withValue,
  type YamlMap,
  type YamlValue,
} from "./yaml-map.ts";

/**
 * DESIGN.md, the interface's home (J-123 S1; the register's row of
 * 2026-10-24; `workshop/components/interface-practice.md`, "The home"), read
 * and written in the format of Google's DESIGN.md spec
 * (google-labs-code/design.md at 6e5da538, its schema and section order kept
 * because tools interoperate on them, its prose and code never copied): YAML
 * front matter holding the tokens as normative values in five groups,
 * `colors`, `typography`, `spacing`, `rounded` and `components`, beside
 * `version`, `name` and `description`; then the prose in eight sections in
 * their order. A token refers to another as `{group.name}`. greenline adds
 * nothing to the format. Where two roots' registers diverge each root holds a
 * DESIGN.md of its own, and the nearest file to a path governs it whole.
 */

/** The file's name, at the workspace's root and at a root that holds its own. */
export const DESIGN_FILE = "DESIGN.md";

/** The format's eight prose sections, in their order. */
export const DESIGN_SECTIONS = [
  "Overview",
  "Colors",
  "Typography",
  "Layout",
  "Elevation & Depth",
  "Shapes",
  "Components",
  "Do's and Don'ts",
] as const;

/** The token groups of the format, in the order the front matter holds them. */
const TOKEN_GROUPS = ["colors", "typography", "rounded", "spacing", "components"] as const;
/** A token group's name. */
export type TokenGroup = (typeof TOKEN_GROUPS)[number];

/** The keys the front matter defines beside the token groups. */
const DESCRIPTIVE_KEYS = ["version", "name", "description"] as const;

/** A token whose value is one scalar: a colour, a radius or a spacing step. */
export interface ValueToken {
  readonly name: string;
  readonly value: string;
}

/** A typography token: its name and the fields it sets. */
export interface TypeToken {
  readonly name: string;
  readonly fields: readonly ValueToken[];
}

/** The tokens the front matter holds, each group in its written order. */
export interface DesignTokens {
  readonly colors: readonly ValueToken[];
  readonly typography: readonly TypeToken[];
  readonly rounded: readonly ValueToken[];
  readonly spacing: readonly ValueToken[];
  readonly components: readonly TypeToken[];
}

/** One second-level section of the prose: its heading and its text. */
export interface DesignSection {
  readonly heading: string;
  readonly text: string;
}

/** A DESIGN.md read: its front matter as written, its body, the tokens and the sections. */
export interface DesignDocument {
  readonly front: YamlMap;
  /** The text after the front matter's closing fence, as written. */
  readonly body: string;
  readonly name: string | undefined;
  readonly tokens: DesignTokens;
  readonly sections: readonly DesignSection[];
  /** The front matter's keys the format does not define, which its readers drop. */
  readonly unknownKeys: readonly string[];
}

const FENCE = "---";

function scalarText(value: YamlValue | undefined): string | undefined {
  return value?.kind === "scalar" ? value.text : undefined;
}

/** A mapping's scalar pairs, as tokens. */
function scalarsOf(map: YamlMap): readonly ValueToken[] {
  return pairsOf(map).flatMap(([name, entry]) =>
    entry.kind === "scalar" ? [{ name, value: entry.text }] : [],
  );
}

/** A group's flat tokens: each pair whose value is a scalar. */
function valueTokens(front: YamlMap, group: TokenGroup): readonly ValueToken[] {
  const value = valueAt(front, group);
  return value?.kind === "map" ? scalarsOf(value) : [];
}

/** A group's nested tokens: each pair whose value is a mapping of scalars. */
function nestedTokens(front: YamlMap, group: TokenGroup): readonly TypeToken[] {
  const value = valueAt(front, group);
  if (value?.kind !== "map") return [];
  return pairsOf(value).flatMap(([name, entry]) =>
    entry.kind === "map" ? [{ name, fields: scalarsOf(entry) }] : [],
  );
}

/** The second-level sections of a body, outside fenced code. */
function sectionsOf(body: string): readonly DesignSection[] {
  const sections: { heading: string; lines: string[] }[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (/^(?:```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^## (.+?)\s*$/.exec(line);
    if (heading !== null) sections.push({ heading: heading[1] ?? "", lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  return sections.map((section) => ({
    heading: section.heading,
    text: section.lines.join("\n").trim(),
  }));
}

/**
 * Read a DESIGN.md.
 * @param text the file's text
 * @param source where it came from, for a refusal
 * @returns the document, or the issues that refused its front matter
 */
export function parseDesign(
  text: string,
  source: string,
): Result<DesignDocument, ContractParseFailed> {
  const lines = text.split("\n");
  if (lines[0] !== FENCE)
    return contractFailure(source, [
      { path: "", message: "DESIGN.md opens with its front matter between two '---' lines" },
    ]);
  const close = lines.indexOf(FENCE, 1);
  if (close === -1)
    return contractFailure(source, [
      { path: "", message: "the front matter has no closing '---'" },
    ]);
  const yaml = lines.slice(1, close).join("\n");
  const read = parseYamlMap(yaml === "" ? "" : `${yaml}\n`, 2);
  if (!read.ok)
    return contractFailure(
      source,
      read.issues.map((issue) => ({ path: `line ${String(issue.line)}`, message: issue.message })),
    );
  const front = read.map;
  const body = lines.slice(close + 1).join("\n");
  const known: readonly string[] = [...DESCRIPTIVE_KEYS, ...TOKEN_GROUPS];
  return contractOk({
    front,
    body,
    name: scalarText(valueAt(front, "name")),
    tokens: {
      colors: valueTokens(front, "colors"),
      typography: nestedTokens(front, "typography"),
      rounded: valueTokens(front, "rounded"),
      spacing: valueTokens(front, "spacing"),
      components: nestedTokens(front, "components"),
    },
    sections: sectionsOf(body),
    unknownKeys: pairsOf(front)
      .map(([key]) => key)
      .filter((key) => !known.includes(key)),
  });
}

/**
 * Write a DESIGN.md: its front matter between the fences, then its body as
 * it stands, so a document read and written again comes back as it was.
 * @param document the document
 * @returns the file's text
 */
export function serializeDesign(document: Pick<DesignDocument, "front" | "body">): string {
  return `${FENCE}\n${serializeYamlMap(document.front)}${FENCE}\n${document.body}`;
}

/**
 * A document with one token set in its group: the group made where it is
 * missing, the token replaced where it stands, appended where it does not.
 * @param document the document
 * @param group the token's group, a flat one
 * @param name the token's name
 * @param value its value
 * @returns the document's front matter and body, to write
 */
export function withToken(
  document: Pick<DesignDocument, "front" | "body">,
  group: "colors" | "rounded" | "spacing",
  name: string,
  value: string,
): Pick<DesignDocument, "front" | "body"> {
  const current = valueAt(document.front, group);
  const map: YamlMap = current?.kind === "map" ? current : { kind: "map", entries: [] };
  return {
    front: withValue(document.front, group, withValue(map, name, scalarFor(value))),
    body: document.body,
  };
}

/**
 * A new DESIGN.md for a workspace that has none, as the home's offer writes
 * it: the name and the description, and the eight sections, each holding the
 * line that says what it is for until the owner and the design step fill it.
 * @param name the system's name
 * @param description one line on what it serves
 * @returns the file's text
 */
export function designSkeleton(name: string, description: string): string {
  const front: YamlMap = {
    kind: "map",
    entries: [
      { kind: "pair", key: "version", value: scalarFor("alpha") },
      { kind: "pair", key: "name", value: scalarFor(name) },
      { kind: "pair", key: "description", value: scalarFor(description) },
    ],
  };
  const body = DESIGN_SECTIONS.map((heading) => `## ${heading}\n\nNot yet written.\n`).join("\n");
  return serializeDesign({ front, body: `\n${body}` });
}

/** A token reference, `{group.name}` or `{group.name.field}`. */
const REFERENCE = /^\{([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)\}$/;

/** What a reference reads to: the value it ends at, or why it ends nowhere. */
export type ReferenceReading =
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "broken"; readonly path: string }
  | { readonly kind: "cycle"; readonly path: string };

/**
 * Follow a value through the references it makes to the value it ends at.
 * @param document the document whose tokens it refers to
 * @param value the value as written
 * @returns the final value, or the reference that breaks or loops
 */
export function resolveValue(document: DesignDocument, value: string): ReferenceReading {
  const seen = new Set<string>();
  let current = value;
  for (;;) {
    const path = REFERENCE.exec(current)?.[1];
    if (path === undefined) return { kind: "value", value: current };
    if (seen.has(path)) return { kind: "cycle", path };
    seen.add(path);
    let node: YamlValue | undefined = document.front;
    for (const key of path.split(".")) node = node?.kind === "map" ? valueAt(node, key) : undefined;
    const next = scalarText(node);
    if (next === undefined) return { kind: "broken", path };
    current = next;
  }
}

/**
 * Every value in the token groups that refers to another, each with where
 * it ends.
 * @param document the document
 * @returns each token's path and its reading, references only
 */
export function referenceReadings(
  document: DesignDocument,
): readonly { readonly token: string; readonly reading: ReferenceReading }[] {
  const found: { token: string; reading: ReferenceReading }[] = [];
  const walk = (map: YamlMap, path: string): void => {
    for (const [key, value] of pairsOf(map)) {
      const here = path === "" ? key : `${path}.${key}`;
      if (value.kind === "map") walk(value, here);
      else if (REFERENCE.test(value.text))
        found.push({ token: here, reading: resolveValue(document, value.text) });
    }
  };
  for (const group of TOKEN_GROUPS) {
    const value = valueAt(document.front, group);
    if (value?.kind === "map") walk(value, group);
  }
  return found;
}

/**
 * The format's sections a document holds out of their order, each named
 * with the section it should follow.
 * @param document the document
 * @returns the misplaced headings, in the document's order
 */
export function sectionOrderIssues(document: DesignDocument): readonly string[] {
  const ranked = document.sections
    .map((section) => section.heading)
    .filter((heading) => DESIGN_SECTIONS.some((known) => known === heading));
  const rank = (heading: string): number => DESIGN_SECTIONS.findIndex((known) => known === heading);
  return ranked.filter((heading, index) =>
    ranked.slice(0, index).some((before) => rank(before) > rank(heading)),
  );
}

/**
 * The DESIGN.md that governs a path: the one whose directory holds the path
 * most nearly, the root's governing what no nested file does.
 * @param path the path from the repository root
 * @param homes the directories holding a DESIGN.md, `.` for the root
 * @returns the governing directory, or undefined where none governs
 */
export function governingHome(path: string, homes: readonly string[]): string | undefined {
  const holding = homes.filter(
    (home) => home === "." || path === home || path.startsWith(`${home}/`),
  );
  const depth = (home: string): number => (home === "." ? 0 : home.split("/").length);
  return [...holding].sort((one, other) => depth(other) - depth(one))[0];
}
