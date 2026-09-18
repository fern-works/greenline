import { z } from "zod";
import { CABINET_PROTOCOL, type CabinetBinding, type Query } from "./cabinet.ts";
import { providerUrl } from "./guidance-configuration.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { Result } from "../commons/result.ts";

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
/** Generated service-delivery facts; output to a model remains independently unconfirmed. */
export interface GuidanceReceipt {
  readonly id: string;
  readonly sequence: number;
  readonly operation: "list" | "read" | "resolve" | "vocabulary";
  readonly query: Query | null;
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
  readonly operation: "list" | "read" | "resolve" | "vocabulary";
  readonly units: readonly ReceiptUnit[];
  readonly count: number | null;
  readonly outcome: ReceiptCoverage;
  readonly at: string;
}
/** One body-free collection per request/contributor, or an inline read-only binding. */
export interface GuidanceRequest {
  readonly schemaVersion: 3;
  readonly id: string;
  readonly owner: {
    readonly record: string | null;
    readonly context: string | null;
    readonly role: string | null;
    readonly work?: { readonly id: string; readonly revision: number } | null | undefined;
  };
  readonly parent: string | null;
  readonly createdAt: string;
  readonly binding: CabinetBinding;
  readonly publicationUse: "current" | "historical";
  readonly limits: RequestLimits;
  readonly receipts: readonly GuidanceReceipt[];
  readonly advisories: readonly GuidanceAdvisory[];
}

const text = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const unitId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const recordId = z.string().regex(/^[a-z][a-z0-9-]*$/);
const instant = z.iso.datetime({ offset: true });
const words = z.array(text);
const query = z
  .object({
    language: words.default([]),
    purpose: words.default([]),
    technology: words.default([]),
    task: words.default([]),
    concern: words.default([]),
    kind: words.default([]),
    responsibility: words.default([]),
  })
  .strict();
const vocabulary = z
  .object({
    language: words,
    purpose: words,
    technology: words,
    task: words,
    concern: words,
    kind: words,
    responsibility: words,
  })
  .strict();
const binding = z
  .object({
    origin: text.refine((value) => providerUrl(value) === value, "a canonical provider URL"),
    protocol: z.literal(CABINET_PROTOCOL),
    snapshot: z
      .object({
        id: text.refine(
          (value) => value !== "current" && value !== "." && value !== ".." && value.isWellFormed(),
        ),
        publishedAt: instant,
      })
      .strict(),
    vocabulary,
  })
  .strict();
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
const operation = z.enum(["list", "read", "resolve", "vocabulary"]);
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
    requested: words,
    closure: z.boolean(),
    excluded: z.array(unitId),
    roots: z.array(text),
    policyRevision: hash,
    units: z.array(unit),
    count: z.number().int().nonnegative().nullable(),
    outcome: z.enum(["pending", "received", "partial", "failed"]),
    error: z.object({ kind: text, input: z.string() }).strict().nullable(),
    startedAt: instant,
    finishedAt: instant.nullable(),
    nativeCall: text.nullable().optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const problem = (path: string, message: string): void =>
      context.addIssue({ code: "custom", path: [path], message });
    if ((entry.operation === "list") !== (entry.query !== null))
      problem("query", "only list carries a query");
    if ((entry.outcome === "pending") !== (entry.finishedAt === null))
      problem("finishedAt", "pending and completed calls have distinct timestamps");
    // A list's candidates are reproducible from its query under the bound
    // snapshot, so a list receipt records the count and no unit entries
    // (S6: whole-corpus lists put thousands of ids into consumer repositories).
    if (entry.operation === "list" && entry.units.length !== 0)
      problem("units", "a list receipt records its count, not its candidates");
    if (
      entry.outcome === "received" &&
      (entry.error !== null ||
        (entry.operation === "list" ? entry.count === null : entry.count !== entry.units.length))
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
    if (entry.operation === "list" && entry.units.length !== 0)
      problem("units", "a list stub records its count, not its candidates");
    if (new Set(entry.units.map((value) => value.id)).size !== entry.units.length)
      problem("units", "duplicate delivered unit");
    if (entry.units.some((value) => (entry.operation === "read") !== (value.coverage === "full")))
      problem("units", "metadata and full delivery must remain distinct");
  });
const request: z.ZodType<GuidanceRequest> = z
  .object({
    schemaVersion: z.literal(3),
    id: z.uuid(),
    owner: z
      .object({
        record: recordId.nullable(),
        context: text.nullable(),
        role: contributorRole.nullable(),
        work: z
          .object({ id: text, revision: z.number().int().positive() })
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
    if (value.owner.record !== null && (value.owner.context === null || value.owner.role === null))
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "a durable request names its contributor",
      });
    // Only a durable collection dispatches: a read-only binding is never
    // written down, so nothing can be filed under it.
    if (value.owner.record === null && value.advisories.length !== 0)
      context.addIssue({
        code: "custom",
        path: ["advisories"],
        message: "a read-only binding dispatches no recorded consultation",
      });
    if (new Set(value.receipts.map((entry) => entry.id)).size !== value.receipts.length)
      context.addIssue({ code: "custom", path: ["receipts"], message: "duplicate call identity" });
    value.receipts.forEach((entry, index) => {
      if (entry.sequence !== index + 1)
        context.addIssue({
          code: "custom",
          path: ["receipts", index, "sequence"],
          message: "receipt sequence is discontinuous",
        });
    });
    if (new Set(value.advisories.map((entry) => entry.id)).size !== value.advisories.length)
      context.addIssue({
        code: "custom",
        path: ["advisories"],
        message: "duplicate read-only call identity",
      });
    value.advisories.forEach((entry, index) => {
      if (entry.sequence !== index + 1)
        context.addIssue({
          code: "custom",
          path: ["advisories", index, "sequence"],
          message: "advisory sequence is discontinuous",
        });
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
