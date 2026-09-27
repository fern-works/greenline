import { z } from "zod";
import { providerUrl } from "./guidance-configuration.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { Result } from "../commons/result.ts";

/**
 * Request and receipt collections, schema 4 (`docs/guidance-requests.md`):
 * one body-free collection per request, written by one store. A collection
 * names its source, the garden connector; its binding is unresolved until
 * the first successful call names a publication, then one publication or a
 * comparison pair, and never moves again.
 */

/** Caller-frozen limits, reused by every call on this request. */
export interface RequestLimits {
  readonly maxUnits: number;
  readonly maxBytes: number;
  readonly timeoutMs: number;
}
/** A metadata result is never evidence of full unit delivery. */
export type ReceiptUnit =
  | {
      readonly id: string;
      readonly coverage: "metadata";
      readonly revision: null;
      readonly contentHash: null;
    }
  | {
      readonly id: string;
      readonly coverage: "full";
      readonly revision: string;
      readonly contentHash: string;
    };
/** What a finished call actually covered; a call still running has no coverage yet. */
export type ReceiptCoverage = "received" | "partial" | "failed";
/** The six read operations a request may record. */
export type GuidanceOperation = "snapshot" | "vocabulary" | "list" | "read" | "resolve" | "changes";
/** Who answered the request's calls: the garden connector, the one source a collection names. */
export type RequestSource = "garden";
/** A list query: any subset of the facets, kind and responsibility, each a list of values. */
export interface ReceiptQuery {
  readonly language?: readonly string[];
  readonly purpose?: readonly string[];
  readonly technology?: readonly string[];
  readonly task?: readonly string[];
  readonly concern?: readonly string[];
  readonly kind?: readonly string[];
  readonly responsibility?: readonly string[];
}
/** One publication's public identity. */
export interface RequestPublication {
  readonly id: string;
  readonly publishedAt: string;
}
/**
 * What the request's calls read: nothing yet, one publication, or the pair a
 * comparison names. Only a failed first call leaves a request unresolved.
 */
export type RequestBinding =
  | { readonly state: "unresolved"; readonly origin: string }
  | {
      readonly state: "publication";
      readonly origin: string;
      readonly snapshot: RequestPublication;
    }
  | {
      readonly state: "comparison";
      readonly origin: string;
      readonly from: RequestPublication;
      readonly to: RequestPublication;
    };
/** Generated service-delivery facts; output to a model remains independently unconfirmed. */
export interface GuidanceReceipt {
  readonly id: string;
  readonly sequence: number;
  readonly operation: GuidanceOperation;
  readonly query: ReceiptQuery | null;
  readonly requested: readonly string[];
  readonly closure: boolean;
  readonly excluded: readonly string[];
  readonly roots: readonly string[];
  readonly policyRevision: string;
  readonly units: readonly ReceiptUnit[];
  readonly count: number | null;
  readonly outcome: "pending" | ReceiptCoverage;
  readonly error: { readonly kind: string; readonly input: string } | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly nativeCall?: string | null | undefined;
}
/**
 * A read-only consultation dispatched from this request: another contributor
 * reading under this request's binding and keeping its receipt in the tool
 * result. It is filed apart from `receipts` because the dispatching
 * contributor did not make the call and cannot claim the delivery.
 */
export interface GuidanceAdvisory {
  readonly id: string;
  readonly sequence: number;
  readonly request: string;
  readonly role: string | null;
  readonly operation: GuidanceOperation;
  readonly units: readonly ReceiptUnit[];
  readonly count: number | null;
  readonly outcome: ReceiptCoverage;
  readonly at: string;
}
/** One body-free collection per request/contributor, or an inline read-only binding. */
export interface GuidanceRequest {
  readonly schemaVersion: 4;
  readonly id: string;
  readonly source: RequestSource;
  readonly owner: {
    readonly record: string | null;
    readonly context: string | null;
    readonly role: string | null;
    readonly work?: { readonly id: string; readonly revision: number } | null | undefined;
  };
  readonly parent: string | null;
  readonly createdAt: string;
  readonly binding: RequestBinding;
  readonly publicationUse: "current" | "historical";
  readonly limits: RequestLimits;
  readonly receipts: readonly GuidanceReceipt[];
  readonly advisories: readonly GuidanceAdvisory[];
}

const text = z.string().min(1);
/** A control, format, private-use or unassigned character (Unicode's `C` category). */
const INVISIBLE = /\p{C}/u;
/**
 * Whether text holds no control, format, private-use or unassigned character.
 * The command lines apply it to the values a receipt will keep (a call id, a
 * governed root) before anything is read; repository paths elsewhere keep
 * their own grammar.
 */
export function isVisibleText(value: string): boolean {
  return !INVISIBLE.test(value);
}
const VISIBLE_RULE = "no control, format, private-use or unassigned character";
/**
 * Text a receipt keeps from its caller, its repository or its provider:
 * the requested values, the query's values, the governed roots, a failure's
 * kind and input, the contributor's context and work id, and the bound
 * publication ids. It holds no invisible character, so a collection written
 * or edited with one is refused as it is read.
 */
const visible = z.string().refine((value) => !INVISIBLE.test(value), VISIBLE_RULE);
const visibleText = text.refine((value) => !INVISIBLE.test(value), VISIBLE_RULE);
/**
 * The harness's own tool-call identity as a receipt keeps it: non-empty and
 * free of control, format, private-use and unassigned characters, so no
 * receipt holds invisible text. Both commands refuse any other value before
 * a receipt is written.
 */
export const nativeCallSchema: z.ZodType<string> = text.refine(
  (value) => !INVISIBLE.test(value),
  "a call id with no control, format, private-use or unassigned character",
);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const unitId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const recordId = z.string().regex(/^[a-z][a-z0-9-]*$/);
const instant = z.iso.datetime({ offset: true });
const visibleWords = z.array(visibleText);
const query = z
  .object({
    language: visibleWords.default([]),
    purpose: visibleWords.default([]),
    technology: visibleWords.default([]),
    task: visibleWords.default([]),
    concern: visibleWords.default([]),
    kind: visibleWords.default([]),
    responsibility: visibleWords.default([]),
  })
  .strict();
const origin = text.refine((value) => providerUrl(value) === value, "a canonical provider URL");
const publication = z
  .object({
    id: visibleText.refine(
      (value) => value !== "current" && value !== "." && value !== ".." && value.isWellFormed(),
    ),
    publishedAt: instant,
  })
  .strict();
const binding = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unresolved"), origin }).strict(),
  z.object({ state: z.literal("publication"), origin, snapshot: publication }).strict(),
  z.object({ state: z.literal("comparison"), origin, from: publication, to: publication }).strict(),
]);
/** Boundary grammar for frozen call budgets. */
export const requestLimitsSchema: z.ZodType<RequestLimits> = z
  .object({
    maxUnits: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
    timeoutMs: z.number().int().positive().max(2147483647),
  })
  .strict();
const unit = z.discriminatedUnion("coverage", [
  z
    .object({
      id: unitId,
      coverage: z.literal("metadata"),
      revision: z.null(),
      contentHash: z.null(),
    })
    .strict(),
  z.object({ id: unitId, coverage: z.literal("full"), revision: hash, contentHash: hash }).strict(),
]);
const operation = z.enum(["snapshot", "vocabulary", "list", "read", "resolve", "changes"]);
/** Operations whose answer is a count of candidates, never delivered units. */
const counted: ReadonlySet<GuidanceOperation> = new Set(["list", "changes"]);
const contributorRole = z.enum([
  "implementation",
  "review",
  "verification",
  "planning",
  "maintenance",
]);
const receipt: z.ZodType<GuidanceReceipt> = z
  .object({
    id: z.uuid(),
    sequence: z.number().int().positive(),
    operation,
    query: query.nullable(),
    requested: visibleWords,
    closure: z.boolean(),
    excluded: z.array(unitId),
    roots: visibleWords,
    policyRevision: hash,
    units: z.array(unit),
    count: z.number().int().nonnegative().nullable(),
    outcome: z.enum(["pending", "received", "partial", "failed"]),
    error: z.object({ kind: visibleText, input: visible }).strict().nullable(),
    startedAt: instant,
    finishedAt: instant.nullable(),
    nativeCall: nativeCallSchema.nullable().optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const problem = (path: string, message: string): void =>
      context.addIssue({ code: "custom", path: [path], message });
    if ((entry.operation === "list") !== (entry.query !== null))
      problem("query", "only list carries a query");
    if ((entry.outcome === "pending") !== (entry.finishedAt === null))
      problem("finishedAt", "pending and completed calls have distinct timestamps");
    // A list's candidates, and a comparison's changed units, are reproducible
    // from the call under its binding, so their receipts record a count and
    // no unit entries (S6: whole-corpus lists put thousands of ids into
    // consumer repositories).
    if (counted.has(entry.operation) && entry.units.length !== 0)
      problem("units", "a list or comparison receipt records its count, not its candidates");
    if (
      entry.outcome === "received" &&
      (entry.error !== null ||
        (counted.has(entry.operation) ? entry.count === null : entry.count !== entry.units.length))
    )
      problem("count", "successful coverage must equal the generated unit inventory");
    if ((entry.outcome === "failed" || entry.outcome === "partial") && entry.error === null)
      problem("error", "a failed call names its failure");
    if (new Set(entry.units.map((value) => value.id)).size !== entry.units.length)
      problem("units", "duplicate delivered unit");
    if (entry.units.some((value) => (entry.operation === "read") !== (value.coverage === "full")))
      problem("units", "metadata and full delivery must remain distinct");
  });
const advisory: z.ZodType<GuidanceAdvisory> = z
  .object({
    id: z.uuid(),
    sequence: z.number().int().positive(),
    request: z.uuid(),
    role: contributorRole.nullable(),
    operation,
    units: z.array(unit),
    count: z.number().int().nonnegative().nullable(),
    outcome: z.enum(["received", "partial", "failed"]),
    at: instant,
  })
  .strict()
  .superRefine((entry, context) => {
    const problem = (path: string, message: string): void =>
      context.addIssue({ code: "custom", path: [path], message });
    if (counted.has(entry.operation) && entry.units.length !== 0)
      problem("units", "a list or comparison stub records its count, not its candidates");
    if (new Set(entry.units.map((value) => value.id)).size !== entry.units.length)
      problem("units", "duplicate delivered unit");
    if (entry.units.some((value) => (entry.operation === "read") !== (value.coverage === "full")))
      problem("units", "metadata and full delivery must remain distinct");
  });
const request: z.ZodType<GuidanceRequest> = z
  .object({
    schemaVersion: z.literal(4),
    id: z.uuid(),
    source: z.literal("garden"),
    owner: z
      .object({
        record: recordId.nullable(),
        context: visibleText.nullable(),
        role: contributorRole.nullable(),
        work: z
          .object({ id: visibleText, revision: z.number().int().positive() })
          .strict()
          .nullable()
          .optional(),
      })
      .strict(),
    parent: z.uuid().nullable(),
    createdAt: instant,
    binding,
    publicationUse: z.enum(["current", "historical"]),
    limits: requestLimitsSchema,
    receipts: z.array(receipt),
    advisories: z.array(advisory),
  })
  .strict()
  .superRefine((value, context) => {
    const problem = (path: (string | number)[], message: string): void =>
      context.addIssue({ code: "custom", path, message });
    if (value.owner.record !== null && (value.owner.context === null || value.owner.role === null))
      problem(["owner"], "a durable request names its contributor");
    // Only a durable collection dispatches: a read-only binding is never
    // written down, so nothing can be filed under it.
    if (value.owner.record === null && value.advisories.length !== 0)
      problem(["advisories"], "a read-only binding dispatches no recorded consultation");
    // Only a failed first call leaves a request unresolved.
    if (
      value.binding.state === "unresolved" &&
      value.receipts.some((entry) => entry.outcome === "received" || entry.outcome === "partial")
    )
      problem(["binding"], "a successful call fixes the request's publication");
    // A comparison has its own collection and never continues a read request.
    const compares = value.receipts.filter((entry) => entry.operation === "changes").length;
    if (
      (value.binding.state === "comparison" && compares !== value.receipts.length) ||
      (value.binding.state === "publication" && compares !== 0) ||
      (compares !== 0 && compares !== value.receipts.length)
    )
      problem(["receipts"], "a comparison collection holds comparisons only");
    if (
      value.binding.state !== "publication" &&
      value.receipts.some((entry) => entry.units.some((unit) => unit.coverage === "full"))
    )
      problem(["binding"], "a full delivery names its publication");
    if (new Set(value.receipts.map((entry) => entry.id)).size !== value.receipts.length)
      problem(["receipts"], "duplicate call identity");
    value.receipts.forEach((entry, index) => {
      if (entry.sequence !== index + 1)
        problem(["receipts", index, "sequence"], "receipt sequence is discontinuous");
    });
    if (new Set(value.advisories.map((entry) => entry.id)).size !== value.advisories.length)
      problem(["advisories"], "duplicate read-only call identity");
    value.advisories.forEach((entry, index) => {
      if (entry.sequence !== index + 1)
        problem(["advisories", index, "sequence"], "advisory sequence is discontinuous");
    });
  });

/** Validate a complete collection; missing or damaged evidence is never an empty inventory. */
export function parseGuidanceRequest(
  input: string,
  source: string,
): Result<GuidanceRequest, ContractParseFailed> {
  const parsed = request.safeParse(parseJson(input));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}
/** Stable generated reference for a full-delivery annotation. */
export function receiptConsultationId(requestId: string, sequence: number, id: string): string {
  return `guidance-${requestId}-${sequence}-${id}`;
}

/** The one rule that seals a finished call: what failed, against what arrived first. */
export function receiptCoverage(
  error: GuidanceReceipt["error"],
  units: readonly ReceiptUnit[],
): ReceiptCoverage {
  return error === null ? "received" : units.length ? "partial" : "failed";
}
