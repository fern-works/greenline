/**
 * The one YAML form greenline reads and writes: a block of nested mappings
 * whose leaves are scalars, as DESIGN.md's front matter holds its tokens
 * (`./design-file.ts`). Comments and blank lines are kept where they stand,
 * and each scalar keeps the quoting it was written with, so a file read and
 * written again comes back byte for byte when it is indented by two spaces.
 * Sequences, anchors, flow collections and multi-line scalars are no part
 * of the form and are refused with the line that holds them.
 */

/** A scalar as written: its text and the quoting it carried. */
export interface YamlScalar {
  readonly kind: "scalar";
  readonly text: string;
  readonly style: "plain" | "double" | "single";
}

/** A mapping: its entries in the order written, comments and blank lines among them. */
export interface YamlMap {
  readonly kind: "map";
  readonly entries: readonly YamlEntry[];
}

/** A mapping's value. */
export type YamlValue = YamlScalar | YamlMap;

/** One line of a mapping: a key and its value, a comment, or a blank line. */
export type YamlEntry =
  | { readonly kind: "pair"; readonly key: string; readonly value: YamlValue }
  | { readonly kind: "comment"; readonly text: string }
  | { readonly kind: "blank" };

/** A line of the form that could not be read, by its 1-based number. */
export interface YamlIssue {
  readonly line: number;
  readonly message: string;
}

/** What a read gives: the mapping, or the issues that refused it. */
export type YamlReading =
  | { readonly ok: true; readonly map: YamlMap }
  | { readonly ok: false; readonly issues: readonly YamlIssue[] };

interface Line {
  readonly number: number;
  readonly indent: number;
  readonly text: string;
}

const KEY = /^([A-Za-z0-9_][A-Za-z0-9_.-]*|"[^"]*"|'[^']*'):(?: (.*))?$/;

/** A scalar read from its written form, or the issue that refused it. */
type ScalarReading =
  | { readonly ok: true; readonly scalar: YamlScalar }
  | { readonly ok: false; readonly message: string };

/** A scalar's text read from its written form, or the issue that refused it. */
function scalarOf(raw: string): ScalarReading {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"(?:\s+#.*)?$/.exec(value);
    if (match === null)
      return { ok: false, message: "a double-quoted scalar is closed on its line" };
    const text = (match[1] ?? "").replace(/\\(.)/g, "$1");
    return { ok: true, scalar: { kind: "scalar", text, style: "double" } };
  }
  if (value.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(value);
    if (match === null)
      return { ok: false, message: "a single-quoted scalar is closed on its line" };
    const text = (match[1] ?? "").replace(/''/g, "'");
    return { ok: true, scalar: { kind: "scalar", text, style: "single" } };
  }
  if (/^[[{&*!|>]|^-(?:\s|$)/.test(value))
    return {
      ok: false,
      message: "flow collections, sequences, anchors and block scalars are no part of the form",
    };
  // A space before '#' opens a comment, as YAML reads it.
  const plain = value.replace(/\s+#.*$/, "");
  return { ok: true, scalar: { kind: "scalar", text: plain, style: "plain" } };
}

function keyOf(raw: string): string {
  return raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
}

/** A mapping read, and the index of the first line after it. */
interface MapRead {
  readonly map: YamlMap;
  readonly next: number;
}

/** Parse the lines of one mapping at one indent, from `at`, returning where it stopped. */
function mapAt(lines: readonly Line[], at: number, indent: number, issues: YamlIssue[]): MapRead {
  const entries: YamlEntry[] = [];
  let index = at;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.text === "") {
      entries.push({ kind: "blank" });
      index += 1;
      continue;
    }
    if (line.text.startsWith("#")) {
      entries.push({ kind: "comment", text: line.text });
      index += 1;
      continue;
    }
    if (line.indent < indent) break;
    if (line.indent > indent) {
      issues.push({ line: line.number, message: "the line is indented deeper than its mapping" });
      index += 1;
      continue;
    }
    const match = KEY.exec(line.text);
    if (match === null) {
      issues.push({ line: line.number, message: "a line of the form is `key: value` or `key:`" });
      index += 1;
      continue;
    }
    const key = keyOf(match[1] ?? "");
    const rest = match[2];
    if (entries.some((entry) => entry.kind === "pair" && entry.key === key))
      issues.push({ line: line.number, message: `the key '${key}' stands twice in its mapping` });
    if (rest === undefined || rest.trim() === "" || rest.trim().startsWith("#")) {
      // A key with no value opens a nested mapping; a value of only a comment is the colour mistake.
      if (rest !== undefined && rest.trim().startsWith("#"))
        issues.push({
          line: line.number,
          message: `the value of '${key}' starts with '#', which YAML reads as a comment; quote it`,
        });
      const child = lines
        .slice(index + 1)
        .find((next) => next.text !== "" && !next.text.startsWith("#"));
      if (child === undefined || child.indent <= indent) {
        issues.push({ line: line.number, message: `'${key}' holds no value` });
        index += 1;
        continue;
      }
      const nested = mapAt(lines, index + 1, child.indent, issues);
      entries.push({ kind: "pair", key, value: nested.map });
      index = nested.next;
      continue;
    }
    const scalar = scalarOf(rest);
    if (scalar.ok) entries.push({ kind: "pair", key, value: scalar.scalar });
    else issues.push({ line: line.number, message: scalar.message });
    index += 1;
  }
  // Trailing blank lines and comments belong to the enclosing mapping.
  let keep = entries.length;
  while (keep > 0 && entries[keep - 1]?.kind !== "pair") keep -= 1;
  const trailing = entries.length - keep;
  return { map: { kind: "map", entries: entries.slice(0, keep) }, next: index - trailing };
}

/**
 * Read the form from its text.
 * @param text the YAML text, without the `---` fences
 * @param firstLine the 1-based number of the text's first line in its file
 * @returns the mapping, or the issues that refused it
 */
export function parseYamlMap(text: string, firstLine = 1): YamlReading {
  const raw = text.endsWith("\n") ? text.slice(0, -1) : text;
  const lines: Line[] =
    raw === ""
      ? []
      : raw.split("\n").map((line, offset) => {
          const trimmed = line.trimEnd();
          const indent = trimmed.length - trimmed.trimStart().length;
          return { number: firstLine + offset, indent, text: trimmed.trimStart() };
        });
  const issues: YamlIssue[] = [];
  const tabbed = raw.split("\n").findIndex((line) => /^ *\t/.test(line));
  if (tabbed !== -1)
    issues.push({
      line: firstLine + tabbed,
      message: "the form is indented with spaces, never a tab",
    });
  const read = mapAt(lines, 0, 0, issues);
  // Comments and blank lines past the last pair still belong to the top mapping.
  const tail = lines
    .slice(read.next)
    .map((line): YamlEntry =>
      line.text === "" ? { kind: "blank" } : { kind: "comment", text: line.text },
    );
  if (lines.slice(read.next).some((line) => line.text !== "" && !line.text.startsWith("#")))
    issues.push({ line: firstLine + read.next, message: "the line stands outside any mapping" });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, map: { kind: "map", entries: [...read.map.entries, ...tail] } };
}

/** A scalar's written form, in the quoting it carries. */
function writtenScalar(scalar: YamlScalar): string {
  if (scalar.style === "double") return `"${scalar.text.replace(/(["\\])/g, "\\$1")}"`;
  if (scalar.style === "single") return `'${scalar.text.replace(/'/g, "''")}'`;
  return scalar.text;
}

function writtenKey(key: string): string {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(key) ? key : `"${key}"`;
}

function linesOf(map: YamlMap, depth: number): readonly string[] {
  const pad = "  ".repeat(depth);
  return map.entries.flatMap((entry): readonly string[] => {
    if (entry.kind === "blank") return [""];
    if (entry.kind === "comment") return [`${pad}${entry.text}`];
    if (entry.value.kind === "scalar")
      return [`${pad}${writtenKey(entry.key)}: ${writtenScalar(entry.value)}`];
    return [`${pad}${writtenKey(entry.key)}:`, ...linesOf(entry.value, depth + 1)];
  });
}

/**
 * Write the form, indented by two spaces per level.
 * @param map the mapping
 * @returns its text, ending with a newline when it holds any line
 */
export function serializeYamlMap(map: YamlMap): string {
  const lines = linesOf(map, 0);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/**
 * A scalar in the quoting a value needs: plain where YAML reads it back as
 * the same text, double-quoted where it would read otherwise.
 * @param text the value
 * @returns the scalar
 */
export function scalarFor(text: string): YamlScalar {
  const plain =
    text !== "" &&
    text === text.trim() &&
    !/^[#{[&*!|>'"%@`,?:-]/.test(text) &&
    !/: | #/.test(text) &&
    !/^(?:true|false|null|yes|no|~)$/i.test(text);
  return { kind: "scalar", text, style: plain ? "plain" : "double" };
}

/**
 * The value at a key of a mapping.
 * @param map the mapping
 * @param key the key
 * @returns the value, or undefined where the key stands nowhere
 */
export function valueAt(map: YamlMap, key: string): YamlValue | undefined {
  for (const entry of map.entries)
    if (entry.kind === "pair" && entry.key === key) return entry.value;
  return undefined;
}

/**
 * The pairs of a mapping, comments and blank lines left out.
 * @param map the mapping
 * @returns each key with its value, in order
 */
export function pairsOf(map: YamlMap): readonly (readonly [string, YamlValue])[] {
  return map.entries.flatMap((entry) =>
    entry.kind === "pair" ? [[entry.key, entry.value] as const] : [],
  );
}

/**
 * A mapping with a key's value set: replaced where the key stands, appended
 * after the last pair where it does not.
 * @param map the mapping
 * @param key the key
 * @param value the value
 * @returns the new mapping
 */
export function withValue(map: YamlMap, key: string, value: YamlValue): YamlMap {
  if (valueAt(map, key) !== undefined)
    return {
      kind: "map",
      entries: map.entries.map((entry) =>
        entry.kind === "pair" && entry.key === key ? { kind: "pair", key, value } : entry,
      ),
    };
  let last = -1;
  map.entries.forEach((entry, index) => {
    if (entry.kind === "pair") last = index;
  });
  const entries = [...map.entries];
  entries.splice(last + 1, 0, { kind: "pair", key, value });
  return { kind: "map", entries };
}
