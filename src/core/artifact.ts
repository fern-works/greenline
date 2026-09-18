import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import { isRepositoryPath } from "../commons/repository-path.ts";
import type { InvalidField } from "./contract.ts";

/**
 * Artifact contracts (`docs/SPEC.md` §7): the frontmatter grammar, the
 * per-type field sets, and the id/file-slot coherence that make a
 * Markdown file under `.greenline/work/` a durable artifact. The CLI
 * only ever READS artifacts — agents author them under their selected
 * skill's contract — so this module parses and never serializes.
 */

const INITIATIVE_STATUSES = [
  "proposed",
  "shaping",
  "decided",
  "specified",
  "planned",
  "executing",
  "reviewing",
  "verifying",
  "complete",
] as const;

const TICKET_STATUSES = [
  "draft",
  "ready",
  "claimed",
  "implementing",
  "implemented",
  "reviewing",
  "verifying",
  "complete",
] as const;

const SUPPORT_STATUSES = ["draft", "complete"] as const;

/** Artifact types, one per file slot family in the `work/` layout. */
export type ArtifactType =
  | "initiative"
  | "decisions"
  | "spec"
  | "map"
  | "ticket"
  | "research"
  | "prototype"
  | "review";

/** Initiative lifecycle (`docs/SPEC.md` §7). */
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

/** Ticket lifecycle; `blocked` is an orthogonal flag, not a state. */
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Supporting artifacts carry the minimal two-state lifecycle. */
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Legal lifecycle states per type; membership only — transition history is Git's to judge. */
export function artifactStatuses(type: ArtifactType): readonly string[] {
  switch (type) {
    case "initiative":
      return INITIATIVE_STATUSES;
    case "ticket":
      return TICKET_STATUSES;
    default:
      return SUPPORT_STATUSES;
  }
}

/** An exact upstream revision an artifact was built from. */
export interface ConsumedReference {
  readonly id: string;
  readonly revision: number;
}

/** One acceptance checklist item (`- [x] text` / `- [ ] text`). */
export interface TaskItem {
  readonly text: string;
  readonly done: boolean;
}

interface ArtifactCommon {
  readonly id: string;
  readonly revision: number;
  readonly consumes: readonly ConsumedReference[];
}

export interface InitiativeArtifact extends ArtifactCommon {
  readonly type: "initiative";
  readonly status: InitiativeStatus;
  /** Membership references stable tickets; joining an initiative never moves them. */
  readonly tickets: readonly string[];
}

export interface TicketArtifact extends ArtifactCommon {
  readonly type: "ticket";
  readonly status: TicketStatus;
  readonly intent: string;
  readonly scope: readonly string[];
  readonly dependsOn: readonly string[];
  readonly claimedBy: string | null;
  readonly baseCommit: string | null;
  readonly resultCommit: string | null;
  readonly acceptance: readonly TaskItem[];
  readonly blocked: boolean;
}

export interface ReviewArtifact extends ArtifactCommon {
  readonly type: "review";
  readonly status: SupportStatus;
  /** The committed range under review, `<base>..<head>`. */
  readonly range: string;
  /** The exact ticket and implementation account delivered by this range. */
  readonly ticket: string;
  readonly implementationAccount: string;
}

/** decisions, spec, map, research, and prototype artifacts share one shape. */
export interface SupportArtifact extends ArtifactCommon {
  readonly type: "decisions" | "spec" | "map" | "research" | "prototype";
  readonly status: SupportStatus;
}

export type Artifact = InitiativeArtifact | TicketArtifact | ReviewArtifact | SupportArtifact;

/** Artifact frontmatter failed to parse; issues are field-located. */
class ArtifactFrontmatterFailed extends Error {
  readonly _tag = "ArtifactFrontmatterFailed" as const;
  readonly source: string;
  readonly issues: readonly InvalidField[];
  constructor(source: string, issues: readonly InvalidField[]) {
    super(`${source}: invalid artifact frontmatter (${issues.length} issue(s))`);
    this.source = source;
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// The frontmatter grammar: a fail-closed YAML subset. Fields are
// `key: scalar` at column 0; a key with no value opens a list of
// two-space-indented items (bare/quoted scalars, `{ k: v }` flow maps,
// or `[x] text` task items). Anything else is rejected so a typo can
// never silently reshape an artifact.
// ---------------------------------------------------------------------------

type Scalar = string | number | boolean | null;
type YamlValue = Scalar | readonly YamlListItem[];

interface FlowEntry {
  readonly key: string;
  readonly value: Scalar;
}

type YamlListItem =
  | { readonly kind: "scalar"; readonly value: Scalar }
  | { readonly kind: "flow"; readonly entries: readonly FlowEntry[] }
  | { readonly kind: "task"; readonly text: string; readonly done: boolean };

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

/** Parse the inner body of a `{ id: X, revision: N }` flow map. */
function parsedFlowEntries(body: string, line: number): Parsed<readonly FlowEntry[]> {
  const entries: FlowEntry[] = [];
  for (const part of body.split(", ")) {
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

/** Dialect parse outcome: the fields, or every issue found. */
type DialectParse =
  | { readonly ok: true; readonly fields: ReadonlyMap<string, YamlValue> }
  | { readonly ok: false; readonly issues: readonly InvalidField[] };

/** Parse the constrained frontmatter dialect into key → value items. */
function parseFrontmatterDialect(text: string): DialectParse {
  if (!text.startsWith("---\n")) {
    return {
      ok: false,
      issues: [{ path: "", message: "artifact must start with a '---' frontmatter block" }],
    };
  }
  const issues: InvalidField[] = [];
  const fields = new Map<string, YamlValue>();
  let listKey: string | undefined;
  let listItems: YamlListItem[] = [];
  let closed = false;

  const endList = (): void => {
    if (listKey !== undefined) fields.set(listKey, listItems);
    listKey = undefined;
    listItems = [];
  };

  for (const [index, line] of text.split("\n").slice(1).entries()) {
    const lineNo = index + 2; // 1-based, counting the opening '---'
    if (line === "---") {
      closed = true;
      break;
    }
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
          const item = parsedScalar(piece.trim(), lineNo);
          if (!item.ok) {
            issues.push(item.issue);
            bad = true;
            break;
          }
          items.push({ kind: "scalar", value: item.value });
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
  if (!closed) {
    issues.push({ path: "", message: "frontmatter block is not closed with a '---' line" });
  }
  if (issues.length > 0) return { ok: false, issues };
  endList();
  return { ok: true, fields };
}

// ---------------------------------------------------------------------------
// File slots: every artifact lives at exactly one path shape, and its
// id and type are bound to that slot (`tickets/TKT-002.md`
// is `TKT-002`, a global ticket).
// ---------------------------------------------------------------------------

/** One recognized artifact location in the `work/` layout. */
export interface ArtifactSlot {
  readonly id: string;
  readonly type: ArtifactType;
}

/** Slot resolution: the slot a path occupies, or its placement issues. */
type SlotResolution =
  | { readonly ok: true; readonly slot: ArtifactSlot }
  | { readonly ok: false; readonly issues: readonly InvalidField[] };

const INITIATIVE_DIR = /^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
/** Subdirectory -> (artifact type, file prefix) for numbered artifact files. */
const NUMBERED_DIRS: readonly {
  readonly dir: string;
  readonly type: ArtifactType;
  readonly prefix: string;
}[] = [
  { dir: "research", type: "research", prefix: "RSRCH" },
  { dir: "prototypes", type: "prototype", prefix: "PROTO" },
];

function resolveSlot(path: string): SlotResolution {
  const parts = path.split("/");
  const ticket = /^tickets\/(TKT-\d{3,})\.md$/.exec(path)?.[1];
  if (ticket !== undefined) return { ok: true, slot: { id: ticket, type: "ticket" } };
  const review = /^reviews\/(REV-\d{3,})\.md$/.exec(path)?.[1];
  if (review !== undefined) return { ok: true, slot: { id: review, type: "review" } };

  const dirMatch = INITIATIVE_DIR.exec(parts[0] ?? "");
  if (dirMatch === null) {
    return {
      ok: false,
      issues: [
        {
          path: "",
          message: `'${path}' does not sit inside an initiative directory '<NNN>-<name>'`,
        },
      ],
    };
  }
  const init = `INIT-${dirMatch[1] ?? ""}`;
  if (parts.length === 2) {
    const file = parts[1] ?? "";
    if (file === "initiative.md") return { ok: true, slot: { id: init, type: "initiative" } };
    if (file === "decisions.md") {
      return { ok: true, slot: { id: `${init}/DEC`, type: "decisions" } };
    }
    if (file === "spec.md") return { ok: true, slot: { id: `${init}/SPEC`, type: "spec" } };
    // The wayfinder map: one per initiative, decision tickets tracked as
    // checklist items in the body (`docs/SPEC.md` §7).
    if (file === "map.md") return { ok: true, slot: { id: `${init}/MAP`, type: "map" } };
    return {
      ok: false,
      issues: [
        {
          path: "",
          message: `'${file}' is not an initiative-root artifact (expected initiative.md, decisions.md, spec.md, or map.md)`,
        },
      ],
    };
  }
  if (parts.length === 3) {
    const numbered = NUMBERED_DIRS.find((entry) => entry.dir === (parts[1] ?? ""));
    const fileMatch =
      numbered !== undefined
        ? new RegExp(`^${numbered.prefix}-(\\d{3,})\\.md$`).exec(parts[2] ?? "")
        : null;
    if (numbered === undefined || fileMatch === null) {
      const expected = [
        "initiative.md, decisions.md, spec.md, map.md at the initiative root",
        ...NUMBERED_DIRS.map((entry) => `${entry.dir}/${entry.prefix}-NNN.md`),
      ].join(", ");
      return {
        ok: false,
        issues: [
          {
            path: "",
            message: `'${path}' is not an artifact slot (expected one of: ${expected})`,
          },
        ],
      };
    }
    return {
      ok: true,
      slot: { id: `${init}/${numbered.prefix}-${fileMatch[1] ?? ""}`, type: numbered.type },
    };
  }
  return {
    ok: false,
    issues: [
      {
        path: "",
        message: `'${path}' nests deeper than the artifact layout allows`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Value predicates: zod is the decoder at this boundary (no runtime
// representation checks downstream); these predicates expose zod's
// verdicts to the field validation below.
// ---------------------------------------------------------------------------

const nonEmptyString = z.string().min(1);
const positiveInteger = z.number().int().min(1);

function isNonEmptyString(value: Scalar | undefined): value is string {
  return nonEmptyString.safeParse(value).success;
}

function isPositiveInteger(value: Scalar | undefined): value is number {
  return positiveInteger.safeParse(value).success;
}

function isBooleanFlag(value: Scalar | undefined): value is boolean {
  return z.boolean().safeParse(value).success;
}

function isInitiativeStatus(value: string): value is InitiativeStatus {
  return new Set<string>(INITIATIVE_STATUSES).has(value);
}

function isTicketStatus(value: string): value is TicketStatus {
  return new Set<string>(TICKET_STATUSES).has(value);
}

function isSupportStatus(value: string): value is SupportStatus {
  return new Set<string>(SUPPORT_STATUSES).has(value);
}

function statusIsValid(type: ArtifactType, status: string): boolean {
  return new Set<string>(artifactStatuses(type)).has(status);
}

function isScalarValue(value: YamlValue | undefined): value is Scalar {
  return value !== undefined && !Array.isArray(value);
}

/** The scalar a key declares, or undefined when absent or list-shaped. */
function scalarOf(fields: ReadonlyMap<string, YamlValue>, key: string): Scalar | undefined {
  const value = fields.get(key);
  return isScalarValue(value) ? value : undefined;
}

/** The list a key declares, or undefined when absent or scalar-shaped. */
function listOf(
  fields: ReadonlyMap<string, YamlValue>,
  key: string,
): readonly YamlListItem[] | undefined {
  const value = fields.get(key);
  const items = value;
  return items !== undefined && Array.isArray(items) ? items : undefined;
}

/** The global id shape a `depends_on` entry must carry (`TKT-002`). */
const TICKET_ID = /^TKT-\d{3,}$/;

/** Field names only a ticket may declare. */
const TICKET_ONLY_FIELDS: readonly string[] = [
  "intent",
  "scope",
  "depends_on",
  "claimed_by",
  "base_commit",
  "result_commit",
  "acceptance",
  "blocked",
];

// ---------------------------------------------------------------------------
// parseArtifact: grammar, per-type field sets, and slot coherence, in
// one collected pass.
// ---------------------------------------------------------------------------

/** The typed values validation fills; the constructor never re-derives. */
interface ValidatedFields {
  id?: string;
  status?: string;
  revision?: number;
  consumes: ConsumedReference[];
  dependsOn?: string[];
  claimedBy?: string | null;
  baseCommit?: string | null;
  resultCommit?: string | null;
  acceptance?: TaskItem[];
  blocked: boolean;
  intent?: string;
  scope?: string[];
  tickets?: string[];
  implementationAccount?: string;
  range?: string;
  ticket?: string;
}

function validatedConsumes(
  items: readonly YamlListItem[] | undefined,
  issues: InvalidField[],
): readonly ConsumedReference[] {
  const consumed: ConsumedReference[] = [];
  for (const [index, item] of (items ?? []).entries()) {
    const at = `consumes[${index}]`;
    if (item.kind !== "flow") {
      issues.push({
        path: at,
        message: "a consumes entry must be a '{ id: ..., revision: N }' map",
      });
      continue;
    }
    const id = item.entries.find((entry) => entry.key === "id");
    const revision = item.entries.find((entry) => entry.key === "revision");
    const extra = item.entries.filter((entry) => entry.key !== "id" && entry.key !== "revision");
    if (id === undefined || revision === undefined || extra.length > 0) {
      issues.push({
        path: at,
        message: "a consumes entry has exactly the keys 'id' and 'revision'",
      });
      continue;
    }
    if (!isNonEmptyString(id.value)) {
      issues.push({ path: `${at}.id`, message: "consumed id must be a non-empty string" });
      continue;
    }
    if (!isPositiveInteger(revision.value)) {
      issues.push({
        path: `${at}.revision`,
        message: "consumed revision must be a positive integer",
      });
      continue;
    }
    consumed.push({ id: id.value, revision: revision.value });
  }
  return consumed;
}

/**
 * Parse one artifact file: frontmatter grammar, per-type field sets,
 * and id/type coherence with the file's slot. `path` is relative to
 * `.greenline/work/` with forward slashes. All rejections are
 * collected so one run reports every fixable issue.
 */
export function parseArtifact(
  path: string,
  text: string,
): Result<Artifact, ArtifactFrontmatterFailed> {
  const placement = resolveSlot(path);
  if (!placement.ok) {
    return err(new ArtifactFrontmatterFailed(path, placement.issues));
  }
  const slot = placement.slot;
  const dialect = parseFrontmatterDialect(text);
  if (!dialect.ok) {
    return err(new ArtifactFrontmatterFailed(path, dialect.issues));
  }
  const fields = dialect.fields;

  const issues: InvalidField[] = [];
  const validated: ValidatedFields = { consumes: [], blocked: false };

  const id = scalarOf(fields, "id");
  if (!isNonEmptyString(id)) {
    issues.push({ path: "id", message: "id must be a non-empty string" });
  } else if (id !== slot.id) {
    issues.push({
      path: "id",
      message: `file '${path}' must carry id '${slot.id}' (found '${id}')`,
    });
  } else {
    validated.id = id;
  }

  const type = scalarOf(fields, "type");
  if (type !== slot.type) {
    issues.push({
      path: "type",
      message: `file '${path}' must declare type '${slot.type}' (found '${String(type)}')`,
    });
  }

  const status = scalarOf(fields, "status");
  if (!isNonEmptyString(status)) {
    issues.push({ path: "status", message: "status must be a non-empty string" });
  } else if (!statusIsValid(slot.type, status)) {
    issues.push({
      path: "status",
      message: `invalid status '${status}' for type ${slot.type} (expected one of: ${artifactStatuses(slot.type).join(", ")})`,
    });
  } else {
    validated.status = status;
  }

  const revision = scalarOf(fields, "revision");
  if (!isPositiveInteger(revision)) {
    issues.push({
      path: "revision",
      message: "revision is required and starts at 1 (a positive integer)",
    });
  } else {
    validated.revision = revision;
  }

  if (fields.has("consumes") && listOf(fields, "consumes") === undefined) {
    issues.push({ path: "consumes", message: "field 'consumes' must be a list" });
  } else {
    validated.consumes = [...validatedConsumes(listOf(fields, "consumes"), issues)];
  }

  if (slot.type === "ticket") {
    const intent = scalarOf(fields, "intent");
    if (!isNonEmptyString(intent) || intent.trim().length === 0)
      issues.push({ path: "intent", message: "a ticket needs its concrete intent" });
    else validated.intent = intent;
    const scope: string[] = [];
    for (const item of listOf(fields, "scope") ?? []) {
      if (
        item.kind !== "scalar" ||
        !isNonEmptyString(item.value) ||
        (item.value !== "." && !isRepositoryPath(item.value))
      )
        issues.push({
          path: "scope",
          message: "scope contains repository-relative roots or paths",
        });
      else scope.push(item.value);
    }
    if (scope.length === 0)
      issues.push({ path: "scope", message: "a ticket needs at least one explicit scope" });
    validated.scope = scope;
    if (fields.has("depends_on") && listOf(fields, "depends_on") === undefined) {
      issues.push({ path: "depends_on", message: "field 'depends_on' must be a list" });
    } else {
      const ids: string[] = [];
      for (const [index, item] of (listOf(fields, "depends_on") ?? []).entries()) {
        if (item.kind !== "scalar" || !isNonEmptyString(item.value)) {
          issues.push({
            path: `depends_on[${index}]`,
            message: "a depends_on entry must be a full ticket id like 'TKT-002'",
          });
        } else if (TICKET_ID.test(item.value) === false) {
          issues.push({
            path: `depends_on[${index}]`,
            message: `'${item.value}' is not a full ticket id like 'TKT-002'`,
          });
        } else {
          ids.push(item.value);
        }
      }
      validated.dependsOn = ids;
    }
    for (const key of ["claimed_by", "base_commit", "result_commit"] as const) {
      const value = scalarOf(fields, key);
      if (value === undefined || value === null) {
        // Absent and explicit null are the same state: unset.
        if (key === "claimed_by") validated.claimedBy = null;
        if (key === "base_commit") validated.baseCommit = null;
        if (key === "result_commit") validated.resultCommit = null;
        continue;
      }
      if (!isNonEmptyString(value)) {
        issues.push({
          path: key,
          message: `field '${key}' must be a non-empty string; write null when unset`,
        });
      } else if (key === "claimed_by") {
        validated.claimedBy = value;
      } else if (key === "base_commit") {
        validated.baseCommit = value;
      } else {
        validated.resultCommit = value;
      }
    }
    if (fields.has("acceptance") && listOf(fields, "acceptance") === undefined) {
      issues.push({ path: "acceptance", message: "field 'acceptance' must be a list" });
    } else {
      const items: TaskItem[] = [];
      for (const [index, item] of (listOf(fields, "acceptance") ?? []).entries()) {
        if (item.kind !== "task") {
          issues.push({
            path: `acceptance[${index}]`,
            message: "an acceptance entry must be a task item '- [x] text' or '- [ ] text'",
          });
        } else {
          items.push({ text: item.text, done: item.done });
        }
      }
      validated.acceptance = items;
    }
    const blocked = scalarOf(fields, "blocked");
    if (blocked === undefined) {
      validated.blocked = false;
    } else if (isBooleanFlag(blocked)) {
      validated.blocked = blocked;
    } else {
      issues.push({ path: "blocked", message: "blocked must be true or false" });
    }
  } else {
    for (const key of TICKET_ONLY_FIELDS) {
      if (fields.has(key)) {
        issues.push({ path: key, message: `field '${key}' belongs to tickets only` });
      }
    }
    const range = scalarOf(fields, "range");
    if (slot.type === "review") {
      if (!isNonEmptyString(range)) {
        issues.push({
          path: "range",
          message: "range must be a non-empty string '<base>..<head>'",
        });
      } else {
        validated.range = range;
      }
      const ticket = scalarOf(fields, "ticket");
      if (!isNonEmptyString(ticket) || !TICKET_ID.test(ticket))
        issues.push({ path: "ticket", message: "a review names its exact global ticket ID" });
      else validated.ticket = ticket;
      const implementationAccount = scalarOf(fields, "implementation_account");
      if (
        !isNonEmptyString(implementationAccount) ||
        !/^[a-z][a-z0-9-]*$/.test(implementationAccount)
      )
        issues.push({
          path: "implementation_account",
          message: "a review names its exact implementation account ID",
        });
      else validated.implementationAccount = implementationAccount;
    } else if (range !== undefined) {
      issues.push({ path: "range", message: "field 'range' belongs to reviews only" });
    }
  }

  const known: ReadonlySet<string> = new Set([
    "id",
    "type",
    "status",
    "revision",
    "consumes",
    ...(slot.type === "ticket" ? TICKET_ONLY_FIELDS : []),
    ...(slot.type === "review" ? ["range", "ticket", "implementation_account"] : []),
    ...(slot.type === "initiative" ? ["tickets"] : []),
  ]);
  // A field already reported as misplaced must not be reported twice.
  const misplaced = new Set(issues.map((issue) => issue.path));
  for (const key of fields.keys()) {
    if (!known.has(key) && !misplaced.has(key)) {
      issues.push({
        path: key,
        message: `unknown field '${key}' — a ${slot.type} artifact's fields are: ${[...known].join(", ")}`,
      });
    }
  }

  if (slot.type === "initiative") {
    const tickets: string[] = [];
    if (fields.has("tickets") && listOf(fields, "tickets") === undefined)
      issues.push({
        path: "tickets",
        message: "initiative membership must be a list of global ticket IDs",
      });
    for (const item of listOf(fields, "tickets") ?? []) {
      if (item.kind !== "scalar" || !isNonEmptyString(item.value) || !TICKET_ID.test(item.value))
        issues.push({ path: "tickets", message: "initiative membership names global ticket IDs" });
      else tickets.push(item.value);
    }
    if (new Set(tickets).size !== tickets.length)
      issues.push({ path: "tickets", message: "duplicate ticket membership" });
    validated.tickets = tickets;
  }

  if (issues.length > 0) return err(new ArtifactFrontmatterFailed(path, issues));

  if (
    validated.id !== undefined &&
    validated.status !== undefined &&
    validated.revision !== undefined
  ) {
    const { id: artifactId, status: artifactStatus, revision: artifactRevision } = validated;
    if (slot.type === "initiative" && isInitiativeStatus(artifactStatus)) {
      return ok({
        id: artifactId,
        type: "initiative",
        status: artifactStatus,
        revision: artifactRevision,
        consumes: validated.consumes,
        tickets: validated.tickets ?? [],
      });
    }
    if (slot.type === "ticket" && isTicketStatus(artifactStatus)) {
      return ok({
        id: artifactId,
        type: "ticket",
        status: artifactStatus,
        revision: artifactRevision,
        consumes: validated.consumes,
        intent: validated.intent ?? "",
        scope: validated.scope ?? [],
        dependsOn: validated.dependsOn ?? [],
        claimedBy: validated.claimedBy ?? null,
        baseCommit: validated.baseCommit ?? null,
        resultCommit: validated.resultCommit ?? null,
        acceptance: validated.acceptance ?? [],
        blocked: validated.blocked,
      });
    }
    if (slot.type === "review" && isSupportStatus(artifactStatus)) {
      return ok({
        id: artifactId,
        type: "review",
        status: artifactStatus,
        revision: artifactRevision,
        consumes: validated.consumes,
        range: validated.range ?? "",
        ticket: validated.ticket ?? "",
        implementationAccount: validated.implementationAccount ?? "",
      });
    }
    if (
      (slot.type === "decisions" ||
        slot.type === "spec" ||
        slot.type === "map" ||
        slot.type === "research" ||
        slot.type === "prototype") &&
      isSupportStatus(artifactStatus)
    ) {
      return ok({
        id: artifactId,
        type: slot.type,
        status: artifactStatus,
        revision: artifactRevision,
        consumes: validated.consumes,
      });
    }
  }
  // SAFETY: every branch above pushes an issue on any undefined or
  // non-membership path, and issues returned early; unreachable.
  return err(new ArtifactFrontmatterFailed(path, [{ path: "", message: "incomplete artifact" }]));
}
