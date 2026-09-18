import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import { parseJson } from "./contract.ts";
import { sha256Hex } from "../commons/hash.ts";

/** Version of the authenticated cabinet wire contract. */
export const CABINET_PROTOCOL = 1 as const;

/**
 * The cabinet (`docs/cabinet-contract.md`): a published snapshot of guidance
 * units and the four reads over it. Pure: the shell loads files and hands
 * their text here. The cabinet stores, filters, delivers, validates, and
 * records; it ranks nothing and judges nothing. This module is the
 * in-process implementation the fixture cabinet and the tests use, and the
 * behaviour the PostgreSQL store must match field for field.
 */

export const FACETS: readonly ["language", "purpose", "technology", "task", "concern"] = [
  "language",
  "purpose",
  "technology",
  "task",
  "concern",
];
export type Facet = (typeof FACETS)[number];

const KINDS: readonly [
  "rule",
  "pattern",
  "explanation",
  "option",
  "recipe",
  "disagreement",
  "reference",
] = ["rule", "pattern", "explanation", "option", "recipe", "disagreement", "reference"];
export type Kind = (typeof KINDS)[number];

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const dayOrMonth = /^\d{4}-\d{2}(-\d{2})?$/;

const SOURCE_KINDS: readonly [
  "sheet",
  "ruling",
  "docs",
  "early-access",
  "treatment",
  "attribution",
] = ["sheet", "ruling", "docs", "early-access", "treatment", "attribution"];
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface OptionGroup {
  readonly responsibility: string;
  readonly member: string;
}

export interface Watch {
  readonly condition: string;
  readonly due?: string | undefined;
}

export interface Verification {
  readonly verified: string;
  readonly window_days: number;
  readonly watch?: readonly Watch[] | undefined;
}

/** A dated fact about a version or tool; `verified` is day or month precision. */
export interface Compatibility {
  readonly technology: string;
  readonly value: string;
  readonly grammar: string;
  readonly verified: string;
  readonly condition: string;
  readonly note?: string | undefined;
}

export interface Source {
  readonly kind: SourceKind;
  readonly ref: string;
  readonly note?: string | undefined;
}

/** A source span or a historical identity, as fixed by the cabinet contract. */
export type Lineage =
  | { readonly source: string; readonly lines: string; readonly disposition: string }
  | { readonly old: string }
  | { readonly renamed_from: string };

const lineageSchema: z.ZodType<Lineage> = z.union([
  z
    .object({ source: z.string().min(1), lines: z.string().min(1), disposition: z.string().min(1) })
    .strict(),
  z.object({ old: z.string().min(1) }).strict(),
  z.object({ renamed_from: z.string().min(1) }).strict(),
]);

/** The indexed half of a unit, exactly the contract's field table. */
export interface FrontMatter {
  readonly id: string;
  readonly title: string;
  readonly kind: Kind;
  readonly when: string;
  readonly summary: string;
  readonly language: readonly string[];
  readonly purpose: readonly string[];
  readonly technology: readonly string[];
  readonly task: readonly string[];
  readonly concern: readonly string[];
  readonly option_group: OptionGroup | null;
  readonly requires: readonly string[];
  readonly contains: readonly string[];
  readonly see_also: readonly string[];
  readonly verification: Verification;
  readonly compatibility: readonly Compatibility[];
  readonly sources: readonly Source[];
  readonly lineage: readonly Lineage[];
}

const facet = z.array(z.string().min(1));
const idList = z.array(z.string().regex(idPattern));

const optionGroupSchema = z.object({
  responsibility: z.string().min(1),
  member: z.string().min(1),
});
const watchSchema = z.object({
  condition: z.string().min(1),
  due: z.string().regex(day).optional(),
});
const verificationFields = {
  verified: z.string().regex(day),
  window_days: z.number().int().positive(),
  watch: z.array(watchSchema).optional(),
};
const compatibilitySchema = z.object({
  technology: z.string().min(1),
  value: z.string().min(1),
  grammar: z.string().min(1),
  verified: z.string().regex(dayOrMonth),
  condition: z.string().min(1),
  note: z.string().optional(),
});
const sourceSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  ref: z.string().min(1),
  note: z.string().optional(),
});

const frontMatterSchema = z
  .object({
    id: z.string().regex(idPattern),
    title: z.string().min(1),
    kind: z.enum(KINDS),
    when: z.string().min(1),
    summary: z.string().min(1),
    language: facet,
    purpose: facet,
    technology: facet,
    task: facet,
    concern: facet,
    option_group: optionGroupSchema.nullable(),
    requires: idList,
    contains: idList,
    see_also: idList,
    verification: z.object(verificationFields),
    compatibility: z.array(compatibilitySchema),
    sources: z.array(sourceSchema).min(1),
    lineage: z.array(lineageSchema),
  })
  .strict() satisfies z.ZodType<FrontMatter>;

/** One published unit: the indexed front matter, the family it came from, the body the agent reads. */
export interface Unit extends FrontMatter {
  readonly family: string;
  readonly body: string;
  readonly content: string;
  readonly revision: string;
  readonly contentHash: string;
}

/** Original unit bytes and their identities, without a duplicate parsed body. */
export type UnitEnvelope = Pick<Unit, "family" | "content" | "revision" | "contentHash">;

/** Select the wire representation of an already parsed and identified unit. */
export function unitEnvelope(unit: Unit): UnitEnvelope {
  return {
    family: unit.family,
    content: unit.content,
    revision: unit.revision,
    contentHash: unit.contentHash,
  };
}

/** The frozen vocabulary: every value a facet, kind, or responsibility may carry. */
export interface Vocabulary {
  readonly language: readonly string[];
  readonly purpose: readonly string[];
  readonly technology: readonly string[];
  readonly task: readonly string[];
  readonly concern: readonly string[];
  readonly kind: readonly string[];
  readonly responsibility: readonly string[];
}

/** One publication's public identity. */
export interface PublicationInfo {
  readonly id: string;
  readonly publishedAt: string;
}

/** Body-free metadata that binds a request across CLI invocations. */
export interface CabinetBinding {
  readonly origin: string;
  readonly protocol: typeof CABINET_PROTOCOL;
  readonly snapshot: PublicationInfo;
  readonly vocabulary: Vocabulary;
}

const vocabularySchema = z.object({
  language: z.array(z.string()),
  purpose: z.array(z.string()),
  technology: z.array(z.string()),
  task: z.array(z.string()),
  concern: z.array(z.string()),
  kind: z.array(z.string()),
  responsibility: z.array(z.string()),
}) satisfies z.ZodType<Vocabulary>;

/** An immutable publication. Every read from one guided task uses one of these. */
export interface Snapshot {
  readonly id: string;
  readonly publishedAt: string;
  readonly vocabulary: Vocabulary;
  readonly units: ReadonlyMap<string, Unit>;
  readonly anchors: ReadonlyMap<string, string>;
}

/** The refusal a publication meets: every problem, never the first one. */
export class PublishRefused extends Error {
  readonly _tag = "PublishRefused" as const;
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`publication refused: ${problems.length} problem(s)\n${problems.join("\n")}`);
    this.problems = problems;
  }
}

export type CabinetErrorKind =
  | "unknown facet"
  | "unknown value"
  | "unknown kind"
  | "unknown responsibility"
  | "unknown id"
  | "unknown anchor"
  | "empty query";

/** A typed refusal carrying the offending input. */
export class CabinetError extends Error {
  readonly _tag = "CabinetError" as const;
  readonly kind: CabinetErrorKind;
  readonly input: string;
  constructor(kind: CabinetErrorKind, input: string) {
    super(`${kind}: ${input}`);
    this.kind = kind;
    this.input = input;
  }
}

/** A refused cabinet access; diagnostic context comes from the caller, never a remote error body. */
export class CabinetAccessFailed extends Error {
  readonly _tag = "CabinetAccessFailed" as const;
  readonly kind:
    | "configuration"
    | "unauthorized"
    | "unavailable"
    | "no snapshot"
    | "invalid response"
    | "cancelled"
    | "excluded"
    | "incompatible protocol"
    | "budget exceeded";
  readonly input: string;
  constructor(kind: CabinetAccessFailed["kind"], input: string) {
    super(`${kind}: ${input}`);
    this.kind = kind;
    this.input = input;
  }
}

/** Query refusals and delivery failures remain values across the harness boundary. */
export type CabinetFailure = CabinetError | CabinetAccessFailed;

export interface UnitFile {
  readonly family: string;
  readonly path: string;
  readonly text: string;
}

export interface Publication {
  readonly id: string;
  readonly publishedAt: string;
  readonly vocabulary: unknown;
  readonly files: readonly UnitFile[];
}

const anchorsIn = (text: string): readonly string[] =>
  [...text.matchAll(/\{#([a-z0-9-]+)\}/g)].map((match) => match[1] ?? "");
const referencesIn = (text: string): readonly string[] =>
  [...text.matchAll(/\{>([a-z0-9-]+)\}/g)].map((match) => match[1] ?? "");

/** Parse one unit file: front matter as `key: <JSON>` lines, then the body. */
export function parseUnit(file: UnitFile): Result<Unit, PublishRefused> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(file.text);
  if (!match) return err(new PublishRefused([`${file.path}: no front matter`]));
  const entries: [string, unknown][] = [];
  const problems: string[] = [];
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(": ");
    if (colon < 0) {
      problems.push(`${file.path}: malformed front-matter line: ${line}`);
      continue;
    }
    try {
      entries.push([line.slice(0, colon), JSON.parse(line.slice(colon + 2))]);
    } catch {
      problems.push(`${file.path}: front-matter value is not JSON: ${line.slice(0, colon)}`);
    }
  }
  if (problems.length > 0) return err(new PublishRefused(problems));
  const parsed = frontMatterSchema.safeParse(Object.fromEntries(entries));
  if (!parsed.success)
    return err(
      new PublishRefused(
        parsed.error.issues.map(
          (issue) => `${file.path}: ${issue.path.join(".")}: ${issue.message}`,
        ),
      ),
    );
  // The blank line that separates front matter from body is layout, not body.
  const body = file.text.slice(match[0].length).replace(/^\n/, "");
  return ok({
    ...parsed.data,
    family: file.family,
    body,
    content: file.text,
    revision: sha256Hex(JSON.stringify([file.family, file.text])),
    contentHash: sha256Hex(file.text),
  });
}

function cycles(
  units: ReadonlyMap<string, Unit>,
  edge: "requires" | "contains",
): readonly string[] {
  const state = new Map<string, "open" | "done">();
  const found: string[] = [];
  const visit = (id: string, trail: readonly string[]): void => {
    const mark = state.get(id);
    if (mark === "done") return;
    if (mark === "open") {
      found.push(`${edge} cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    state.set(id, "open");
    for (const next of units.get(id)?.[edge] ?? []) visit(next, [...trail, id]);
    state.set(id, "done");
  };
  for (const id of units.keys()) visit(id, []);
  return found;
}

/**
 * Publish: run every check the contract names and refuse the snapshot
 * unless all pass. The store reruns these because it is the last thing
 * that can refuse.
 */
export function publish(input: Publication): Result<Snapshot, PublishRefused> {
  const problems: string[] = [];
  const vocabulary = vocabularySchema.safeParse(input.vocabulary);
  if (!vocabulary.success) return err(new PublishRefused(["vocabulary: not the frozen shape"]));
  const vocab = vocabulary.data;
  const units = new Map<string, Unit>();
  const whens = new Map<string, string>();
  for (const file of input.files) {
    const parsed = parseUnit(file);
    if (parsed._tag === "err") {
      problems.push(...parsed.error.problems);
      continue;
    }
    const unit = parsed.value;
    if (units.has(unit.id)) problems.push(`${unit.id}: duplicate id (${file.path})`);
    units.set(unit.id, unit);
    for (const name of FACETS)
      for (const value of unit[name])
        if (!vocab[name].includes(value))
          problems.push(`${unit.id}: ${name} value '${value}' is not in the vocabulary`);
    if (!vocab.kind.includes(unit.kind))
      problems.push(`${unit.id}: kind '${unit.kind}' is not in the vocabulary`);
    if (
      unit.option_group !== null &&
      !vocab.responsibility.includes(unit.option_group.responsibility)
    )
      problems.push(
        `${unit.id}: responsibility '${unit.option_group.responsibility}' is not in the vocabulary`,
      );
    if (unit.option_group !== null && unit.kind !== "option")
      problems.push(`${unit.id}: option_group on a ${unit.kind} unit`);
    if (FACETS.every((name) => unit[name].length === 0))
      problems.push(`${unit.id}: no restricted facet`);
    const whenKey = `${unit.family}\n${unit.when}`;
    const owner = whens.get(whenKey);
    if (owner !== undefined) problems.push(`${unit.id}: when duplicates ${owner}`);
    whens.set(whenKey, unit.id);
  }
  const anchors = new Map<string, string>();
  for (const unit of units.values()) {
    for (const edge of ["requires", "contains", "see_also"] as const)
      for (const target of unit[edge])
        if (!units.has(target)) problems.push(`${unit.id}: ${edge} names unknown unit ${target}`);
    for (const anchor of anchorsIn(unit.body)) {
      const owner = anchors.get(anchor);
      if (owner !== undefined && owner !== unit.id)
        problems.push(`anchor {#${anchor}} in both ${owner} and ${unit.id}`);
      anchors.set(anchor, unit.id);
    }
  }
  for (const unit of units.values())
    for (const reference of referencesIn(unit.body))
      if (!anchors.has(reference))
        problems.push(`${unit.id}: reference {>${reference}} resolves to no anchor`);
  problems.push(...cycles(units, "requires"), ...cycles(units, "contains"));
  if (problems.length > 0) return err(new PublishRefused(problems));
  return ok({ id: input.id, publishedAt: input.publishedAt, vocabulary: vocab, units, anchors });
}

/** A list query: any subset of the facets, kind, and responsibility, each a list of values. */
export interface Query {
  readonly language?: readonly string[];
  readonly purpose?: readonly string[];
  readonly technology?: readonly string[];
  readonly task?: readonly string[];
  readonly concern?: readonly string[];
  readonly kind?: readonly string[];
  readonly responsibility?: readonly string[];
}

/** What `list` returns per unit: enough to choose, never the body. */
export interface ListRecord {
  readonly id: string;
  readonly kind: Kind;
  readonly title: string;
  readonly when: string;
  readonly summary: string;
  readonly language: readonly string[];
  readonly purpose: readonly string[];
  readonly technology: readonly string[];
  readonly task: readonly string[];
  readonly concern: readonly string[];
  readonly option_group: FrontMatter["option_group"];
  readonly requires: readonly string[];
  readonly contains: readonly string[];
  readonly see_also: readonly string[];
  readonly verification: FrontMatter["verification"];
}

export interface ListResult {
  readonly snapshot: string;
  readonly count: number;
  readonly units: readonly ListRecord[];
}

const toRecord = (unit: Unit): ListRecord => ({
  id: unit.id,
  kind: unit.kind,
  title: unit.title,
  when: unit.when,
  summary: unit.summary,
  language: unit.language,
  purpose: unit.purpose,
  technology: unit.technology,
  task: unit.task,
  concern: unit.concern,
  option_group: unit.option_group,
  requires: unit.requires,
  contains: unit.contains,
  see_also: unit.see_also,
  verification: unit.verification,
});

const LISTED_VALUES = 10;

/**
 * Name a field's vocabulary inside a refusal: the first ten values in sorted
 * order, then how many remain and where they are. A refusal names the values
 * because every premium run of the first QA series guessed one ("api", "bug
 * fix", "correctness") and had to read the vocabulary before it could ask at
 * all; it names only ten because a facet carrying dozens buries the refusal
 * it belongs to.
 */
function refusalVocabulary(field: string, values: readonly string[]): string {
  const sorted = [...values].sort();
  const shown = sorted.slice(0, LISTED_VALUES);
  const rest = sorted.length - shown.length;
  const more = rest === 0 ? "" : ` and ${rest} more; greenline guidance vocabulary lists them all`;
  return `${field} is one of: ${shown.join(", ")}${more}`;
}

/** Check a query against one snapshot's vocabulary before a storage adapter filters it. */
export function validateQuery(vocabulary: Vocabulary, query: Query): CabinetError | undefined {
  for (const key of Object.keys(query)) {
    const known = key === "responsibility" || key === "kind" || FACETS.some((name) => name === key);
    if (!known) return new CabinetError("unknown facet", key);
  }
  for (const name of FACETS)
    for (const value of query[name] ?? [])
      if (!vocabulary[name].includes(value))
        return new CabinetError(
          "unknown value",
          `${name}=${value}; ${refusalVocabulary(name, vocabulary[name])}`,
        );
  for (const value of query.kind ?? [])
    if (!vocabulary.kind.includes(value))
      return new CabinetError(
        "unknown kind",
        `${value}; ${refusalVocabulary("kind", vocabulary.kind)}`,
      );
  for (const value of query.responsibility ?? [])
    if (!vocabulary.responsibility.includes(value))
      return new CabinetError(
        "unknown responsibility",
        `${value}; ${refusalVocabulary("responsibility", vocabulary.responsibility)}`,
      );
  return undefined;
}

/**
 * AND across facets, OR within one; an empty applicability facet matches any
 * value, an empty technology facet matches no technology query.
 * `kind` and `responsibility` are exact filters: a unit without an option
 * group never answers a responsibility query. Order is by id.
 */
export function listUnits(snapshot: Snapshot, query: Query): Result<ListResult, CabinetError> {
  const invalid = validateQuery(snapshot.vocabulary, query);
  if (invalid) return err(invalid);
  const units = [...snapshot.units.values()]
    .filter((unit) => matchesQuery(unit, query))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(toRecord);
  return ok({ snapshot: snapshot.id, count: units.length, units });
}

function matchesQuery(unit: ListRecord, query: Query): boolean {
  const wantedKind = query.kind ?? [];
  const wantedRole = query.responsibility ?? [];
  return (
    FACETS.every((name) => {
      const wanted = query[name] ?? [];
      if (wanted.length === 0) return true;
      const have = unit[name];
      // technology names what a unit is about, so an empty facet names nothing;
      // every other facet is applicability, so an empty facet applies everywhere.
      if (have.length === 0) return name !== "technology";
      return wanted.some((value) => have.includes(value));
    }) &&
    (wantedKind.length === 0 || wantedKind.includes(unit.kind)) &&
    (wantedRole.length === 0 ||
      (unit.option_group !== null && wantedRole.includes(unit.option_group.responsibility)))
  );
}

// Reuse publication field definitions, refusing undeclared wire fields rather than
// dropping them. This does not change the existing source-ingestion parser.
const deliveredMetadataSchema = frontMatterSchema.extend({
  option_group: optionGroupSchema.strict().nullable(),
  verification: z
    .object({
      ...verificationFields,
      watch: z.array(watchSchema.strict()).optional(),
    })
    .strict(),
  compatibility: z.array(compatibilitySchema.strict()),
  sources: z.array(sourceSchema.strict()).min(1),
});
const deliveredUnitSchema = z
  .object({
    family: z.string().min(1),
    content: z.string().refine((content) => content.isWellFormed()),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const deliveredListSchema = z
  .object({
    snapshot: z.string().min(1),
    count: z.number().int().nonnegative(),
    units: z.array(
      deliveredMetadataSchema.omit({ compatibility: true, sources: true, lineage: true }),
    ),
  })
  .strict();

function validMetadata(unit: ListRecord, vocabulary: Vocabulary): boolean {
  return (
    validateQuery(vocabulary, {
      language: unit.language,
      purpose: unit.purpose,
      technology: unit.technology,
      task: unit.task,
      concern: unit.concern,
      kind: [unit.kind],
      responsibility: unit.option_group === null ? [] : [unit.option_group.responsibility],
    }) === undefined &&
    (unit.option_group === null || unit.kind === "option")
  );
}

/** Parse the vocabulary delivered at the request snapshot, without consulting a local catalog. */
export function parseCabinetVocabulary(input: string): Result<Vocabulary, CabinetAccessFailed> {
  const result = vocabularySchema.strict().safeParse(parseJson(input));
  return result.success
    ? ok(result.data)
    : err(new CabinetAccessFailed("invalid response", "vocabulary"));
}

/** Validate exact record count, metadata, snapshot, ordering and facet matches before exposing a list. */
export function parseCabinetList(
  input: string,
  snapshot: string,
  vocabulary: Vocabulary,
  query: Query,
): Result<ListResult, CabinetAccessFailed> {
  const result = deliveredListSchema.safeParse(parseJson(input));
  if (
    !result.success ||
    result.data.snapshot !== snapshot ||
    result.data.units.length !== result.data.count
  )
    return err(new CabinetAccessFailed("invalid response", "list"));
  let previous: string | undefined;
  for (const unit of result.data.units) {
    if (
      (previous !== undefined && previous >= unit.id) ||
      !validMetadata(unit, vocabulary) ||
      !matchesQuery(unit, query)
    )
      return err(new CabinetAccessFailed("invalid response", "list"));
    previous = unit.id;
  }
  return ok(result.data);
}

/** Validate one exact requested unit, retaining its body and declared metadata. */
export function parseCabinetUnit(
  input: string,
  id: string,
  vocabulary: Vocabulary,
): Result<Unit, CabinetAccessFailed> {
  const result = deliveredUnitSchema.safeParse(parseJson(input));
  if (
    !result.success ||
    sha256Hex(result.data.content) !== result.data.contentHash ||
    sha256Hex(JSON.stringify([result.data.family, result.data.content])) !== result.data.revision
  )
    return err(new CabinetAccessFailed("invalid response", "show"));
  const unit = parseUnit({ family: result.data.family, text: result.data.content, path: id });
  return unit._tag === "ok" && unit.value.id === id && validMetadata(unit.value, vocabulary)
    ? unit
    : err(new CabinetAccessFailed("invalid response", "show"));
}

/** The whole unit under the same snapshot; the requires closure is the agent's to fetch. */
export function showUnit(snapshot: Snapshot, id: string): Result<Unit, CabinetError> {
  const unit = snapshot.units.get(id);
  return unit === undefined ? err(new CabinetError("unknown id", id)) : ok(unit);
}

/** Follow a `{>anchor}` reference to the unit that carries `{#anchor}`. */
export function resolveAnchor(snapshot: Snapshot, anchor: string): Result<string, CabinetError> {
  const owner = snapshot.anchors.get(anchor);
  return owner === undefined ? err(new CabinetError("unknown anchor", anchor)) : ok(owner);
}

/**
 * The reads a harness sees, transport-agnostic, so the in-process fixture
 * and the HTTP client answer with the same shapes.
 */
export interface Cabinet {
  readonly list: (query: Query) => Promise<Result<ListResult, CabinetFailure>>;
  readonly show: (id: string) => Promise<Result<Unit, CabinetFailure>>;
  readonly resolve: (anchor: string) => Promise<Result<string, CabinetFailure>>;
  readonly vocabulary: () => Promise<Vocabulary>;
}

/** A cabinet over one snapshot held in memory. */
export function snapshotCabinet(snapshot: Snapshot): Cabinet {
  return {
    list: (query) => Promise.resolve(listUnits(snapshot, query)),
    show: (id) => Promise.resolve(showUnit(snapshot, id)),
    resolve: (anchor) => Promise.resolve(resolveAnchor(snapshot, anchor)),
    vocabulary: () => Promise.resolve(snapshot.vocabulary),
  };
}
