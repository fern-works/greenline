import type { Result } from "../commons/result.ts";
import { contractFailure, contractOk, type ContractParseFailed } from "./contract.ts";
import { receiptConsultationId, type GuidanceRequest } from "./guidance-receipts.ts";
import type {
  LedgerRecord,
  LedgerAccount,
  LedgerConsultation,
  LedgerConsultationCheck,
} from "./execution-ledger.ts";

/** Generated consultations and their sparse authored meaning form one account view. */
export interface CompiledGuidanceLedger {
  readonly records: readonly LedgerAccount[];
  readonly consultations: readonly LedgerConsultationCheck[];
}

/** Include every full delivery, even in a failed batch; metadata queries stay in receipts. */
export function compileGuidanceLedger(
  records: readonly LedgerRecord[],
  requests: readonly GuidanceRequest[],
): Result<CompiledGuidanceLedger, ContractParseFailed> {
  const problems: { path: string; message: string }[] = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  const entries = new Map<string, LedgerConsultation[]>();
  const observations: LedgerConsultationCheck[] = [];
  for (const request of requests) {
    const record = request.owner.record === null ? undefined : byId.get(request.owner.record);
    if (record === undefined) {
      problems.push({ path: request.id, message: "receipt collection names no owning account" });
      continue;
    }
    if (request.owner.context !== record.context) {
      problems.push({ path: request.id, message: "receipt contributor differs from its account" });
      continue;
    }
    if (record.guidance?.state === "unconfigured") {
      problems.push({
        path: record.id,
        message: "an unconfigured account carries cabinet receipts",
      });
      continue;
    }
    if (
      request.owner.work &&
      (request.owner.work.id !== record.work?.id ||
        request.owner.work.revision > (record.work?.revision ?? 0))
    ) {
      problems.push({ path: request.id, message: "receipt work does not belong to this account" });
      continue;
    }
    const consultations = entries.get(record.id) ?? [];
    for (const receipt of request.receipts) {
      for (const unit of receipt.units) {
        if (unit.coverage !== "full") continue;
        const id = receiptConsultationId(request.id, receipt.sequence, unit.id);
        const annotation = record.guidanceAnnotations?.find((value) => value.consultation === id);
        const consultation: LedgerConsultation = {
          id,
          kind: "guidance",
          source: {
            kind: "cabinet",
            origin: request.binding.origin,
            protocol: request.binding.protocol,
            snapshot: request.binding.snapshot.id,
            unit: unit.id,
            revision: unit.revision,
            contentHash: unit.contentHash,
            request: request.id,
            receipt: receipt.id,
          },
          stage: "unknown",
          decision: annotation?.decision ?? "unassessed",
          reason:
            annotation?.reason ?? "Cabinet delivery recorded; application has not been judged.",
        };
        consultations.push(
          annotation?.authority === undefined
            ? consultation
            : { ...consultation, authority: annotation.authority },
        );
        observations.push({
          record: record.id,
          consultation: id,
          status: "observed",
          ordering: "unknown",
          detail: `Generated receipt records verified service delivery (${receipt.outcome} call). Model capture, chronology and application remain unconfirmed.`,
        });
      }
    }
    entries.set(record.id, consultations);
  }
  const compiled = records.map((record) => {
    const delivered = entries.get(record.id) ?? [];
    const ids = new Set(delivered.map((entry) => entry.id));
    for (const annotation of record.guidanceAnnotations ?? [])
      if (!ids.has(annotation.consultation))
        problems.push({
          path: `${record.id}.guidanceAnnotations`,
          message: `${annotation.consultation}: no full delivery`,
        });
    const consultations = [...record.selections, ...delivered];
    if (new Set(consultations.map((entry) => entry.id)).size !== consultations.length)
      problems.push({
        path: record.id,
        message: "declared and generated consultation identities collide",
      });
    const known = new Map(consultations.map((entry) => [entry.id, entry]));
    for (const application of record.applications) {
      const entry = known.get(application.consultation);
      if (entry === undefined)
        problems.push({
          path: `${record.id}.applications`,
          message: `${application.consultation}: consultation is missing`,
        });
      else if (
        application.outcome === "applied" &&
        entry.decision !== "selected" &&
        entry.decision !== "exception"
      )
        problems.push({
          path: `${record.id}.applications`,
          message: `${application.consultation}: application has no selection or exception`,
        });
    }
    return { ...record, consultations };
  });
  return problems.length
    ? contractFailure("guidance receipts", problems)
    : contractOk({ records: compiled, consultations: observations });
}
