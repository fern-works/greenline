import type { AuditedArtifact } from "./artifact-audit.ts";
import type { Artifact } from "./artifact.ts";
import type { ExecutionLedger, LedgerEvidence, LedgerRecord } from "./execution-ledger.ts";

/** Structural evidence findings do not adjudicate engineering applicability. */
export interface LedgerFinding {
  readonly kind: "missing" | "reference" | "incomplete" | "contradicted" | "unverified";
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

function requiredRoles(artifact: Artifact): readonly LedgerRecord["role"][] {
  if (artifact.type === "initiative") return [];
  if (artifact.type === "ticket") {
    if (artifact.status === "complete") return ["implementation"];
    return ["implementing", "implemented", "reviewing", "verifying"].includes(artifact.status)
      ? ["implementation"]
      : [];
  }
  return artifact.status === "complete" ? [artifact.type === "review" ? "review" : "planning"] : [];
}
function sameEvidence(a: LedgerEvidence, b: LedgerEvidence): boolean {
  return (
    a.path === b.path &&
    a.revision === b.revision &&
    a.commit === b.commit &&
    a.pending === b.pending
  );
}

/**
 * One contribution has one account: a contributor that reworks its own
 * ticket carries the rework in the existing implementation account (a new
 * resultCommit, added checks), not in a second one. Two implementation
 * accounts on one work item with different results are named whatever
 * their contexts say (a context is the agent's own label and a rework
 * minted a fresh one), so the ledger does not silently hold a superseded
 * account beside the current one; a second contributor's account is the
 * one case the warning leaves to the reader.
 */
function secondImplementationAccounts(ledger: ExecutionLedger): readonly LedgerFinding[] {
  const groups = new Map<string, LedgerRecord[]>();
  for (const record of ledger.records) {
    if (record.role !== "implementation" || record.work == null) continue;
    groups.set(record.work.id, [...(groups.get(record.work.id) ?? []), record]);
  }
  const findings: LedgerFinding[] = [];
  for (const records of groups.values()) {
    const results = new Set(records.map((record) => record.resultCommit ?? "unset"));
    if (records.length < 2 || results.size < 2) continue;
    const [first] = records;
    if (first === undefined) continue;
    const ids = records.map((record) => `'${record.id}' (${record.context})`).join(", ");
    findings.push({
      kind: "contradicted",
      severity: "warning",
      path: `.greenline/ledger/records/${records[records.length - 1]?.id ?? first.id}.json`,
      message: `One contribution has one account: ${first.work?.id ?? "the work"} has ${records.length} implementation accounts with different results (${ids}). A rework is carried in the existing account with its new resultCommit and checks; only another contributor's work earns a second account.`,
    });
  }
  return findings;
}

/** Check the account against actual artifact identity, range, and referenced evidence. */
export function auditLedgerWork(
  ledger: ExecutionLedger,
  tree: readonly AuditedArtifact[],
): readonly LedgerFinding[] {
  const findings: LedgerFinding[] = [];
  const byId = new Map(tree.map((entry) => [entry.artifact.id, entry]));
  findings.push(...secondImplementationAccounts(ledger));
  for (const record of ledger.records) {
    for (const application of record.applications)
      if (application.outcome === "unverified")
        findings.push({
          kind: "unverified",
          severity: "warning",
          path: `.greenline/ledger/records/${record.id}.json`,
          message: `Application ${application.consultation} remains unverified: ${application.reason}`,
        });
    if (
      ledger.guidance?.state === "configured" &&
      record.role === "implementation" &&
      record.resultCommit !== undefined
    ) {
      const requests = (ledger.receipts ?? []).filter(
        (request) => request.owner.record === record.id,
      );
      const received = requests.some(
        (request) =>
          request.publicationUse === "current" &&
          request.receipts.some(
            (receipt) =>
              receipt.operation === "read" &&
              receipt.outcome === "received" &&
              receipt.units.some((unit) => unit.coverage === "full"),
          ),
      );
      if (!received)
        findings.push({
          kind: requests.length ? "incomplete" : "missing",
          severity: "error",
          path: `.greenline/ledger/records/${record.id}.json`,
          message: requests.length
            ? "Configured implementation has no completed current-publication unit retrieval; metadata, failed or historical reads do not supply it."
            : "Configured implementation has no receipt collection. This is missing evidence, not proof of zero retrieval.",
        });
      if (
        requests.some((request) =>
          request.receipts.some((receipt) => receipt.outcome === "pending"),
        )
      )
        findings.push({
          kind: "incomplete",
          severity: "error",
          path: `.greenline/ledger/records/${record.id}.json`,
          message: "A retrieval is still pending; interrupted delivery is not a completed call.",
        });
      if (
        received &&
        !record.consultations.some(
          (entry) =>
            entry.source.kind === "cabinet" &&
            (entry.decision === "selected" || entry.decision === "exception"),
        )
      )
        findings.push({
          kind: "unverified",
          severity: "warning",
          path: `.greenline/ledger/records/${record.id}.json`,
          message:
            "Service retrieval is observed, but no guidance selection or application has been declared.",
        });
    }
    if (record.role === "maintenance") {
      const outside = [
        ...new Set(
          ledger.observedChanges
            .filter((change) => change.record === record.id)
            .flatMap((change) => change.paths)
            .filter(
              (path) =>
                !["AGENTS.md", "CLAUDE.md", "agents/openai.yaml"].includes(path) &&
                ![".greenline/", ".agents/skills/", ".claude/skills/"].some((prefix) =>
                  path.startsWith(prefix),
                ),
            ),
        ),
      ].sort();
      if (outside.length > 0)
        findings.push({
          kind: "contradicted",
          severity: "error",
          path: `.greenline/ledger/records/${record.id}.json`,
          message: `Maintenance accounting includes observed changes outside greenline's installed files: ${outside.join(", ")}. Link the contribution to its ticket and account for the actual work.`,
        });
    }
    const owner = record.work === null ? undefined : byId.get(record.work.id);
    if (
      record.work !== null &&
      (owner === undefined || record.work.revision > owner.artifact.revision)
    )
      findings.push({
        kind: "reference",
        severity: "error",
        path: `.greenline/ledger/records/${record.id}.json`,
        message:
          "Ledger owner is missing or its recorded artifact revision is ahead of repository state.",
      });
  }
  for (const { path: workPath, artifact } of tree) {
    const path = `.greenline/work/${workPath}`;
    if (
      artifact.type === "ticket" &&
      (artifact.status === "verifying" || artifact.status === "complete")
    ) {
      const reviewed = tree.some(
        ({ artifact: review }) =>
          review.type === "review" &&
          review.status === "complete" &&
          review.ticket === artifact.id &&
          review.range.split("..")[1] === artifact.resultCommit &&
          ledger.records.some(
            (record) =>
              record.role === "review" &&
              record.work?.id === review.id &&
              record.work.revision === review.revision &&
              record.resultCommit === artifact.resultCommit &&
              record.reviews.some((reference) =>
                ledger.evidence.some(
                  (entry) =>
                    entry.record === record.id &&
                    sameEvidence(entry.reference, reference) &&
                    entry.status === "matched" &&
                    entry.target?.id === review.implementationAccount &&
                    entry.target.role === "implementation" &&
                    entry.target.work?.id === artifact.id &&
                    entry.target.resultCommit === artifact.resultCommit &&
                    entry.target.context !== record.context,
                ),
              ),
          ),
      );
      if (!reviewed)
        findings.push({
          kind: "missing",
          severity: "error",
          path,
          message: `'${artifact.id}' needs an independent review of its exact implementation account and result before verification or completion. A historical review limitation cannot supply this proof.`,
        });
    }
    for (const role of requiredRoles(artifact)) {
      const completed = artifact.status !== "implementing";
      const matching = ledger.records.filter(
        (record) =>
          record.role === role &&
          record.work?.id === artifact.id &&
          (artifact.type === "ticket"
            ? !completed ||
              artifact.resultCommit === null ||
              record.resultCommit === artifact.resultCommit
            : record.work.revision === artifact.revision &&
              (artifact.type !== "review" ||
                record.resultCommit === artifact.range.split("..")[1])),
      );
      if (matching.length === 0) {
        const result =
          artifact.type === "ticket"
            ? artifact.resultCommit
            : artifact.type === "review"
              ? artifact.range.split("..")[1]
              : undefined;
        const wrongResult = ledger.records.filter(
          (record) =>
            record.role === role &&
            record.work?.id === artifact.id &&
            result !== undefined &&
            result !== null &&
            record.resultCommit !== result,
        );
        if (wrongResult.length > 0) {
          for (const record of wrongResult)
            findings.push({
              kind: "missing",
              severity: "error",
              path,
              message: `'${artifact.id}' requires resultCommit '${result}' on its ${role} account '.greenline/ledger/records/${record.id}.json'; this identifies the implementation result, including on a review account.`,
            });
          continue;
        }
        findings.push({
          kind: "missing",
          severity: "error",
          path,
          message: `'${artifact.id}' needs its own ${role} ledger record with work.id '${artifact.id}' and work.revision ${artifact.revision}${result == null ? "" : `, and resultCommit '${result}'`}; create or correct it under .greenline/ledger/records/. Read .greenline/ledger/README.md.`,
        });
        continue;
      }
      if (!completed) continue;
      for (const record of matching) {
        const location = `.greenline/ledger/records/${record.id}.json`;
        const results = [
          ...record.applications.flatMap((entry) =>
            entry.outcome === "applied" ? entry.evidence : [],
          ),
          ...record.checks,
          ...record.reviews,
        ];
        for (const reference of results) {
          const witness = ledger.evidence.find(
            (entry) => entry.record === record.id && sameEvidence(entry.reference, reference),
          );
          if (witness?.status !== "matched")
            findings.push({
              kind: "incomplete",
              severity: "error",
              path: location,
              message: `Claimed result evidence '${reference.path}' does not resolve at its recorded revision.`,
            });
        }
        if (role === "review" && artifact.type === "review") {
          if (record.reviews.length === 0)
            findings.push(
              record.reviewLimit === undefined
                ? {
                    kind: "incomplete",
                    severity: "error",
                    path: location,
                    message:
                      "Pin the execution records examined, or state reviewLimit when the prior account is unavailable.",
                  }
                : {
                    kind: "unverified",
                    severity: "warning",
                    path: location,
                    message: `Prior execution accounting remains unverified: ${record.reviewLimit}`,
                  },
            );
          for (const reference of record.reviews) {
            const target = ledger.evidence.find(
              (entry) => entry.record === record.id && sameEvidence(entry.reference, reference),
            )?.target;
            if (
              target === undefined ||
              target.role !== "implementation" ||
              target.work === null ||
              target.id !== artifact.implementationAccount ||
              target.work.id !== artifact.ticket ||
              target.resultCommit !== record.resultCommit
            )
              findings.push({
                kind: "reference",
                severity: "error",
                path: location,
                message: `Pinned input '${reference.path}' resolves to ${
                  target === undefined
                    ? "no readable account"
                    : `'${target.id}' (${target.role}, ticket ${target.work?.id ?? "unset"}, result ${target.resultCommit ?? "unset"})`
                }; '${artifact.id}' requires implementation_account '${artifact.implementationAccount}' for ticket ${artifact.ticket} at result ${record.resultCommit ?? "unset"}. The reviewer keeps its own separate review account.`,
              });
            else if (target.context === record.context)
              findings.push({
                kind: "contradicted",
                severity: "error",
                path: location,
                message:
                  "The review and implementation declare the same execution context; this is not an independent review.",
              });
          }
        }
      }
    }
  }
  for (const observation of ledger.consultations) {
    if (observation.status === "contradicted")
      findings.push({
        kind: "contradicted",
        severity: "warning",
        path: `.greenline/ledger/records/${observation.record}.json`,
        message: `Consultation '${observation.consultation}' is contradicted by its capture: ${observation.detail} Preserve this failure and record any correction honestly.`,
      });
  }
  return findings;
}

/** A compact invocation view, with record locators and no raw transcript or source bodies. */
export interface LedgerSummary {
  readonly records: readonly {
    readonly id: string;
    readonly role: LedgerRecord["role"];
    readonly work: LedgerRecord["work"];
    readonly resultCommit: string | null;
  }[];
  readonly consultations: {
    readonly declared: number;
    readonly observed: number;
    readonly contradicted: number;
    readonly unavailable: number;
  };
  readonly retrievals?: readonly {
    readonly request: string;
    readonly record: string | null;
    readonly snapshot: string;
    readonly publicationUse: "current" | "historical";
    readonly calls: number;
    readonly received: number;
    readonly incomplete: number;
    /** Read-only consultations another contributor made under this request. */
    readonly advisories: number;
  }[];
}

/** Counts describe supplied evidence coverage, never a compliance score. */
export function summarizeLedger(ledger: ExecutionLedger): LedgerSummary {
  const count = (status: ExecutionLedger["consultations"][number]["status"]): number =>
    ledger.consultations.filter((entry) => entry.status === status).length;
  const summary: LedgerSummary = {
    records: ledger.records.map((record) => ({
      id: record.id,
      role: record.role,
      work: record.work,
      resultCommit: record.resultCommit ?? null,
    })),
    consultations: {
      declared: count("declared"),
      observed: count("observed"),
      contradicted: count("contradicted"),
      unavailable: count("unavailable"),
    },
  };
  if (!ledger.receipts?.length) return summary;
  return {
    ...summary,
    retrievals: ledger.receipts.map((request) => ({
      request: request.id,
      record: request.owner.record,
      snapshot: request.binding.snapshot.id,
      publicationUse: request.publicationUse,
      calls: request.receipts.length,
      received: request.receipts.filter((receipt) => receipt.outcome === "received").length,
      incomplete: request.receipts.filter((receipt) => receipt.outcome !== "received").length,
      advisories: request.advisories.length,
    })),
  };
}
