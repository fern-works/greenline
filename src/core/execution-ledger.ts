import { isRepositoryPath } from "../commons/repository-path.ts";
import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { GuidanceRequest } from "./guidance-receipts.ts";

const text = z.string().trim().min(1);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const commit = z.string().regex(/^[0-9a-f]{7,40}$/);
const relative = text.refine(
  isRepositoryPath,
  "a portable repository-relative path without traversal",
);
const root = z.union([z.literal("."), relative]);
const evidenceSchema = z
  .object({
    path: relative,
    revision: hash,
    commit: commit.optional(),
    pending: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (entry) => entry.commit === undefined || entry.pending === undefined,
    "a pin awaiting its commit cannot already name one",
  )
  .readonly();
const evidence = z.array(evidenceSchema).readonly().default([]);
const observationSchema = z
  .object({
    trace: evidenceSchema,
    format: z.enum(["claude-stream-json", "codex-jsonl"]),
    call: text,
  })
  .strict()
  .readonly();
const selectionSchema = z
  .object({
    id,
    kind: z.enum(["skill", "guidance", "document"]),
    source: z
      .object({
        kind: z.literal("repository"),
        path: relative,
        revision: hash,
        commit: commit.optional(),
      })
      .strict(),
    lines: z
      .object({ start: z.number().int().positive(), end: z.number().int().positive() })
      .strict()
      .refine((range) => range.end >= range.start, "end precedes start")
      .readonly()
      .optional(),
    stage: z.enum(["before-work", "during-work", "after-work"]),
    decision: z.enum(["selected", "not-applicable", "deferred", "exception"]),
    reason: text,
    authority: text.optional(),
    observation: observationSchema.optional(),
  })
  .strict()
  .refine(
    (entry) => entry.decision !== "exception" || entry.authority !== undefined,
    "an exception needs its authority",
  )
  .readonly();
const applicationSchema = z
  .object({
    consultation: id,
    outcome: z.enum(["applied", "not-applied", "unverified"]),
    reason: text,
    evidence,
  })
  .strict()
  .refine(
    (entry) => entry.outcome !== "applied" || entry.evidence.length > 0,
    "applied guidance needs result evidence",
  )
  .readonly();
const guidanceAnnotationSchema = z
  .object({
    consultation: id,
    decision: z.enum(["selected", "not-applicable", "deferred", "exception"]),
    reason: text,
    authority: text.optional(),
  })
  .strict()
  .refine(
    (entry) => entry.decision !== "exception" || entry.authority !== undefined,
    "an exception needs its authority",
  );
/**
 * The roles a record may carry with no owning artifact: upkeep of the
 * installed files, and an answer's planning account, the minimal recorded
 * request an answer consults under; the ledger audit refuses an observed
 * change outside what each allows.
 */
const WORKLESS_ROLES: readonly LedgerRecord["role"][] = ["maintenance", "planning"];
const recordSchema: z.ZodType<LedgerRecord> = z
  .object({
    schemaVersion: z.literal(3),
    id,
    context: text,
    actor: text,
    role: z.enum(["implementation", "review", "verification", "planning", "maintenance"]),
    work: z
      .object({ id: text, revision: z.number().int().positive() })
      .strict()
      .readonly()
      .nullable()
      .default(null),
    scopes: z
      .array(root)
      .min(1)
      .refine((values) => new Set(values).size === values.length, "duplicate scope")
      .readonly(),
    baseCommit: commit.optional(),
    resultCommit: commit.optional(),
    guidanceAnnotations: z.array(guidanceAnnotationSchema).optional(),
    selections: z.array(selectionSchema).readonly().default([]),
    applications: z.array(applicationSchema).readonly().default([]),
    checks: evidence,
    reviews: evidence,
    reviewLimit: text.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    const problem = (path: string, message: string): void =>
      context.addIssue({ code: "custom", path: [path], message });
    // Upkeep and an answer have no owning artifact; every other role names its work.
    if (record.work === null && !WORKLESS_ROLES.includes(record.role))
      problem("work", "this contribution needs its owning artifact");
    if (new Set(record.selections.map((entry) => entry.id)).size !== record.selections.length)
      problem("selections", "duplicate selection id");
    const consulted = new Map(record.selections.map((entry) => [entry.id, entry]));
    if (
      new Set((record.guidanceAnnotations ?? []).map((entry) => entry.consultation)).size !==
      (record.guidanceAnnotations ?? []).length
    )
      problem("guidanceAnnotations", "duplicate annotation");
    for (const application of record.applications) {
      const entry = consulted.get(application.consultation);
      if (entry === undefined) {
        if (!application.consultation.startsWith("guidance-"))
          problem("applications", "application names no consultation");
      } else if (
        application.outcome === "applied" &&
        entry.decision !== "selected" &&
        entry.decision !== "exception"
      )
        problem(
          "applications",
          "applied guidance was neither selected nor an authorized exception",
        );
    }
    if (
      new Set(record.applications.map((entry) => entry.consultation)).size !==
      record.applications.length
    )
      problem("applications", "duplicate application outcome");
  })
  .readonly();

/** One content-pinned witness; existence alone never establishes its claim. */
export interface LedgerEvidence {
  readonly path: string;
  readonly revision: string;
  readonly commit?: string | undefined;
  /**
   * The commit that carries these bytes did not exist when the pin was taken,
   * so the witnessing commit is resolved when the account is read. The
   * recorded revision is checked either way; only the commit is late.
   */
  readonly pending?: true | undefined;
}
/** Repository bytes and external corpus deliveries have distinct verifiable identities. */
export type ConsultationSource =
  | (LedgerEvidence & { readonly kind: "repository" })
  | {
      /** A delivery the garden connector recorded: an optional attachment, never an obligation. */
      readonly kind: "garden";
      readonly origin: string;
      readonly snapshot: string;
      readonly unit: string;
      readonly revision: string;
      readonly contentHash: string;
      readonly request: string;
      readonly receipt: string;
    };

interface ObservationReference {
  readonly trace: LedgerEvidence;
  readonly format: "claude-stream-json" | "codex-jsonl";
  readonly call: string;
}
/** A consultation declaration, separate from observed delivery and review. */
export interface LedgerConsultation {
  readonly id: string;
  readonly kind: "skill" | "guidance" | "document";
  readonly source: ConsultationSource;
  readonly lines?: { readonly start: number; readonly end: number } | undefined;
  readonly stage: "before-work" | "during-work" | "after-work" | "unknown";
  readonly decision: "selected" | "not-applicable" | "deferred" | "exception" | "unassessed";
  readonly reason: string;
  readonly authority?: string | undefined;
  readonly observation?: ObservationReference | undefined;
}
interface LedgerApplication {
  readonly consultation: string;
  readonly outcome: "applied" | "not-applied" | "unverified";
  readonly reason: string;
  readonly evidence: readonly LedgerEvidence[];
}
/** One bounded contribution; no self-awarded verification flags are accepted. */
export interface LedgerRecord {
  readonly schemaVersion: 3;
  readonly id: string;
  readonly context: string;
  readonly actor: string;
  readonly role: "implementation" | "review" | "verification" | "planning" | "maintenance";
  readonly work: { readonly id: string; readonly revision: number } | null;
  readonly scopes: readonly string[];
  readonly baseCommit?: string | undefined;
  readonly resultCommit?: string | undefined;
  readonly guidanceAnnotations?:
    | readonly {
        readonly consultation: string;
        readonly decision: "selected" | "not-applicable" | "deferred" | "exception";
        readonly reason: string;
        readonly authority?: string | undefined;
      }[]
    | undefined;
  readonly selections: readonly LedgerConsultation[];
  readonly applications: readonly LedgerApplication[];
  readonly checks: readonly LedgerEvidence[];
  readonly reviews: readonly LedgerEvidence[];
  readonly reviewLimit?: string | undefined;
}

/** Parse the sole execution-accounting contract before any state is derived from it. */
export function parseLedgerRecord(
  input: string,
  source: string,
): Result<LedgerRecord, ContractParseFailed> {
  const parsed = recordSchema.safeParse(parseJson(input));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/** Preserve declared order; it is an account, never independent proof of chronology. */
export function serializeLedgerRecord(record: LedgerRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Delivery inventory is a read model, never an authored record field. */
export interface LedgerAccount extends LedgerRecord {
  readonly consultations: readonly LedgerConsultation[];
}

/** A witness can match bytes without proving the semantic claim it accompanies. */
export interface LedgerEvidenceCheck {
  readonly record: string;
  readonly reference: LedgerEvidence;
  readonly status: "matched" | "missing" | "changed" | "unavailable";
  /** Historical matches retain their evidence without certifying present effects. */
  readonly current?: boolean;
  readonly target?: Pick<LedgerRecord, "id" | "role" | "context" | "work" | "resultCommit">;
}
/** Captured content delivery and declared ordering, never comprehension or authenticity. */
export interface ConsultationObservation {
  readonly status: "declared" | "observed" | "contradicted" | "unavailable";
  readonly ordering: "before-observed-change" | "after-observed-change" | "unknown";
  readonly detail: string;
}
/** A consultation's observed support, linked back to its authored entry. */
export interface LedgerConsultationCheck extends ConsultationObservation {
  readonly record: string;
  readonly consultation: string;
}
/** One read model shared by standards facts, artifact checks, and inspection. */
export interface LedgerObservedChange {
  readonly record: string;
  readonly paths: readonly string[];
  readonly witness:
    | { readonly kind: "git"; readonly base: string; readonly result: string }
    | {
        readonly kind: "capture";
        readonly trace: LedgerEvidence;
        readonly call: string;
        readonly line: number;
      };
}

/** Authored accounts and independently measured observations remain separate. */
export interface ExecutionLedger {
  readonly records: readonly LedgerAccount[];
  readonly evidence: readonly LedgerEvidenceCheck[];
  readonly consultations: readonly LedgerConsultationCheck[];
  readonly observedChanges: readonly LedgerObservedChange[];
  readonly receipts?: readonly GuidanceRequest[];
}
