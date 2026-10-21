import { casesHandled } from "../commons/defect.ts";
import { err, ok, type Result } from "../commons/result.ts";
import type { InvalidField } from "./contract.ts";

/**
 * The front-matter dialect every Markdown record of the product shares: a
 * fail-closed YAML subset. Fields are `key: scalar` at column 0; a key with
 * no value opens a list of two-space-indented items (bare or quoted scalars,
 * `{ k: v }` flow maps, or `[x] text` task items), and `key: [a, b]` is the
 * same list written flat. Anything else is refused, so a typo can never
 * silently reshape a record. The change record and the plan documents read
 * their fields through this one parser.
 */

/** A scalar the dialect reads: a bare token, a quoted string, an integer, a boolean or null. */
export type Scalar = string | number | boolean | null;

/** One `key: value` entry inside a `{ ... }` flow map. */
export interface FlowEntry {
  readonly key: string;
  readonly value: Scalar;
}

/** One list item: a scalar, a flow map, or a task item. */
export type YamlListItem =
  | { readonly kind: "scalar"; readonly value: Scalar }
  | { readonly kind: "flow"; readonly entries: readonly FlowEntry[] }
  | { readonly kind: "task"; readonly text: string; readonly done: boolean };

/** A field's value: a scalar or a list. */
export type YamlValue = Scalar | readonly YamlListItem[];

/** The fields of one block, in the order written. */
export type Fields = ReadonlyMap<string, YamlValue>;

/** A parsed document: its front-matter fields and the text after the closing line. */
export interface FrontMatter {
  readonly fields: Fields;
  readonly body: string;
  /** The 1-based line number of the body's first line. */
  readonly bodyLine: number;
}

/** The dialect refused the text; every issue is located by line or field. */
class FrontMatterFailed extends Error {
  readonly _tag = "FrontMatterFailed" as const;
  readonly issues: readonly InvalidField[];
  constructor(issues: readonly InvalidField[]) {
    super(`invalid front matter (${issues.length} issue(s))`);
    this.issues = issues;
  }
}

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_]*):(?:[ ](.*))?$/;
const LIST_ITEM = /^  - (.*)$/;
const FLOW_ENTRY = /^([A-Za-z][A-Za-z0-9_]*):[ ](.+)$/;
const TASK_ITEM = /^\[(x| )\] (.+)$/;
const BARE_SCALAR = /^[^\s{}[\],:"']+$/;

/** One dialect step's outcome: a value, or the issue that blocked it. */
type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: InvalidField };

function parsedScalar(raw: string, line: number): Parsed<Scalar> {
  const fail = (message: string): Parsed<Scalar> => ({
    ok: false,
    issue: { path: "", message: `line ${line}: ${message}` },
  });
  if (raw === "null") return { ok: true, value: null };
  if (raw === "true") return { ok: true, value: true };
  if (raw === "false") return { ok: true, value: false };
  if (/^-?\d+$/.test(raw)) return { ok: true, value: Number(raw) };
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    const inner = raw.slice(1, -1);
    if (inner.includes('"')) return fail("a double-quoted scalar cannot embed a quote");
    return { ok: true, value: inner };
  }
  if (BARE_SCALAR.test(raw)) return { ok: true, value: raw };
  return fail(`unsupported value '${raw}' (write a bare token, a quoted string, or null)`);
}

/** A flow map's entries, split at each ", " outside double quotes, so a quoted value can hold prose with commas. */
function flowParts(body: string): readonly string[] {
  const parts: string[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '"') quoted = !quoted;
    else if (!quoted && body.startsWith(", ", index)) {
      parts.push(body.slice(start, index));
      start = index + 2;
      index += 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

/** Parse the inner body of a `{ id: X, revision: N }` flow map. */
function parsedFlowEntries(body: string, line: number): Parsed<readonly FlowEntry[]> {
  const entries: FlowEntry[] = [];
  for (const part of flowParts(body)) {
    const match = FLOW_ENTRY.exec(part);
    const key = match?.[1];
    const valueRaw = match?.[2];
    if (key === undefined || valueRaw === undefined) {
      return {
        ok: false,
        issue: {
          path: "",
          message: `line ${line}: flow-map entry '${part}' is not 'key: value'`,
        },
      };
    }
    const value = parsedScalar(valueRaw, line);
    if (!value.ok) return { ok: false, issue: value.issue };
    entries.push({ key, value: value.value });
  }
  return { ok: true, value: entries };
}

function parsedListItem(raw: string, line: number): Parsed<YamlListItem> {
  const task = TASK_ITEM.exec(raw);
  if (task !== null) {
    const text = task[2] ?? "";
    if (text.length === 0) {
      return {
        ok: false,
        issue: { path: "", message: `line ${line}: a task item needs text after the bracket` },
      };
    }
    return { ok: true, value: { kind: "task", text, done: task[1] === "x" } };
  }
  if (raw.startsWith("{ ") && raw.endsWith(" }")) {
    const entries = parsedFlowEntries(raw.slice(2, -2), line);
    if (!entries.ok) return { ok: false, issue: entries.issue };
    return { ok: true, value: { kind: "flow", entries: entries.value } };
  }
  const scalar = parsedScalar(raw, line);
  if (!scalar.ok) return { ok: false, issue: scalar.issue };
  return { ok: true, value: { kind: "scalar", value: scalar.value } };
}

/** Parse field lines into the fields, collecting every issue; `firstLine` numbers the first of them. */
function fieldsOf(
  lines: readonly string[],
  firstLine: number,
  issues: InvalidField[],
): Map<string, YamlValue> {
  const fields = new Map<string, YamlValue>();
  let listKey: string | undefined;
  let listItems: YamlListItem[] = [];

  const endList = (): void => {
    if (listKey !== undefined) fields.set(listKey, listItems);
    listKey = undefined;
    listItems = [];
  };

  for (const [index, line] of lines.entries()) {
    const lineNo = firstLine + index;
    if (line.length === 0) {
      issues.push({
        path: "",
        message: `line ${lineNo}: blank lines are not allowed in frontmatter`,
      });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      if (listKey === undefined) {
        issues.push({ path: "", message: `line ${lineNo}: list item outside a 'key:' list` });
        continue;
      }
      const parsed = parsedListItem(item[1] ?? "", lineNo);
      if (!parsed.ok) {
        issues.push(parsed.issue);
        continue;
      }
      listItems.push(parsed.value);
      continue;
    }
    const keyMatch = KEY_LINE.exec(line);
    if (keyMatch !== null) {
      const key = keyMatch[1] ?? "";
      if (fields.has(key) || key === listKey) {
        issues.push({ path: key, message: `duplicate field '${key}'` });
        continue;
      }
      endList();
      const raw = keyMatch[2];
      if (raw === undefined) {
        listKey = key; // a list (possibly empty) follows
        continue;
      }
      // A flow list `key: [a, b]` is the block list's equal (agents
      // reach for it naturally; refusing it tore a QA run, 2026-08-26).
      const flow = /^\[(.*)\]$/.exec(raw.trim());
      if (flow !== null) {
        const inner = flow[1] ?? "";
        const items: YamlListItem[] = [];
        let bad = false;
        for (const piece of inner.length === 0 ? [] : inner.split(",")) {
          const parsed = parsedScalar(piece.trim(), lineNo);
          if (!parsed.ok) {
            issues.push(parsed.issue);
            bad = true;
            break;
          }
          items.push({ kind: "scalar", value: parsed.value });
        }
        if (!bad) fields.set(key, items);
        continue;
      }
      const scalar = parsedScalar(raw, lineNo);
      if (!scalar.ok) {
        issues.push(scalar.issue);
        continue;
      }
      fields.set(key, scalar.value);
      continue;
    }
    issues.push({
      path: "",
      message: `line ${lineNo}: unsupported frontmatter line '${line}'`,
    });
  }
  endList();
  return fields;
}

/**
 * Parse field lines that stand outside a `---` block, such as one ticket's
 * entry in a tickets file.
 * @param lines the field lines, with no delimiters
 * @param firstLine the 1-based line number of the first of them in their file
 * @returns the fields, or every issue found
 */
export function parseFieldLines(
  lines: readonly string[],
  firstLine: number,
): Result<Fields, FrontMatterFailed> {
  const issues: InvalidField[] = [];
  const fields = fieldsOf(lines, firstLine, issues);
  return issues.length > 0 ? err(new FrontMatterFailed(issues)) : ok(fields);
}

/**
 * Parse a document that opens with a `---` front-matter block.
 * @param text the whole document
 * @param what the document's kind as the refusal names it, such as "a change record"
 * @returns the fields and the body after the closing `---`, or every issue found
 */
export function parseFrontMatter(
  text: string,
  what: string,
): Result<FrontMatter, FrontMatterFailed> {
  if (!text.startsWith("---\n"))
    return err(
      new FrontMatterFailed([
        { path: "", message: `${what} must start with a '---' frontmatter block` },
      ]),
    );
  const lines = text.split("\n").slice(1);
  const closing = lines.indexOf("---");
  const issues: InvalidField[] = [];
  // Line 1 is the opening '---', so the first field line is line 2.
  const fields = fieldsOf(closing === -1 ? lines : lines.slice(0, closing), 2, issues);
  if (closing === -1)
    issues.push({ path: "", message: "frontmatter block is not closed with a '---' line" });
  if (issues.length > 0) return err(new FrontMatterFailed(issues));
  return ok({
    fields,
    body: lines.slice(closing + 1).join("\n"),
    bodyLine: closing + 3,
  });
}

/** A field value as plain data: a scalar, or a list of scalars, flow maps as objects, and task items. */
export type FieldData =
  | Scalar
  | readonly (
      | Scalar
      | { readonly [key: string]: Scalar }
      | { readonly task: string; readonly done: boolean }
    )[];

/**
 * The fields as one plain object, for a schema to parse: a flow map becomes
 * an object, a task item becomes `{ task, done }`.
 * @param fields the parsed fields
 * @returns an object with one key per field
 */
export function fieldData(fields: Fields): { readonly [key: string]: FieldData } {
  return Object.fromEntries(
    [...fields].map(([key, value]): [string, FieldData] => [
      key,
      isList(value) ? value.map(itemData) : value,
    ]),
  );
}

function isList(value: YamlValue): value is readonly YamlListItem[] {
  return Array.isArray(value);
}

function itemData(item: YamlListItem): Exclude<FieldData, Scalar>[number] {
  switch (item.kind) {
    case "scalar":
      return item.value;
    case "flow":
      return Object.fromEntries(item.entries.map((entry) => [entry.key, entry.value]));
    case "task":
      return { task: item.text, done: item.done };
    default:
      return casesHandled(item);
  }
}

/** One line of a record's body, marked when it stands inside a fenced code block. */
export interface BodyLine {
  readonly text: string;
  /** True for a fence's own lines and every line between them: body text, never a heading. */
  readonly fenced: boolean;
}

/**
 * A body's lines, each marked fenced or not. A fence opens on a line that
 * starts with three or more backticks or tildes, and closes the CommonMark
 * way: on a line holding only a run of the same character at least as long,
 * so a longer fence can hold a shorter one. An unclosed fence runs to the end.
 * @param body the text after the front matter
 * @returns one entry per line, in order
 */
export function bodyLines(body: string): readonly BodyLine[] {
  let fence: string | undefined;
  return body.split("\n").map((text) => {
    if (fence === undefined) {
      fence = /^(`{3,}|~{3,})/.exec(text)?.[1];
      return { text, fenced: fence !== undefined };
    }
    const closing = /^(`{3,}|~{3,})[ \t]*$/.exec(text)?.[1];
    if (closing !== undefined && closing[0] === fence[0] && closing.length >= fence.length)
      fence = undefined;
    return { text, fenced: true };
  });
}
