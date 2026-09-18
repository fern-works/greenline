import { expect, it } from "vitest";
import { parseArtifact } from "../../src/core/artifact.ts";
import { parseLedgerRecord, type LedgerEvidenceCheck } from "../../src/core/execution-ledger.ts";
import { auditLedgerWork } from "../../src/core/ledger-audit.ts";

it("P4 accepts only the named ticket and execution account even when another ticket shares the same result commit", () => {
  const result = "b".repeat(40);
  const parsed = parseArtifact(
    "reviews/REV-001.md",
    `---\nid: REV-001\ntype: review\nstatus: complete\nrevision: 1\nrange: ${"a".repeat(40)}..${result}\nticket: TKT-001\nimplementation_account: build-one\n---\nReviewed deadline propagation.\n`,
  );
  if (parsed._tag === "err") throw parsed.error;
  const reference = { path: ".greenline/ledger/records/build-one.json", revision: "c".repeat(64) };
  const record = parseLedgerRecord(
    JSON.stringify({
      schemaVersion: 3,
      id: "review-one",
      context: "review-context",
      actor: "Reviewer",
      role: "review",
      work: { id: "REV-001", revision: 1 },
      scopes: ["src"],
      resultCommit: result,
      selections: [
        {
          id: "review-method",
          kind: "skill",
          source: { kind: "repository", path: "review.md", revision: "d".repeat(64) },
          stage: "before-work",
          decision: "not-applicable",
          reason: "Fixture tests ownership independently of method application.",
        },
      ],
      reviews: [reference],
    }),
    "fixture",
  );
  if (record._tag === "err") throw record.error;
  const witness: LedgerEvidenceCheck = {
    record: "review-one",
    reference,
    status: "matched",
    target: {
      id: "build-one",
      role: "implementation",
      context: "build-context",
      work: { id: "TKT-001", revision: 1 },
      resultCommit: result,
    },
  };
  const ledger = {
    records: [{ ...record.value, consultations: record.value.selections }],
    consultations: [],
    observedChanges: [],
    evidence: [witness],
  };
  const tree = [{ path: "reviews/REV-001.md", artifact: parsed.value }];
  expect(auditLedgerWork(ledger, tree)).toEqual([]);
  for (const target of [
    {
      ...witness.target,
      id: "build-two",
      role: "implementation" as const,
      context: "build-context",
      work: { id: "TKT-001", revision: 1 },
      resultCommit: result,
    },
    {
      ...witness.target,
      id: "build-one",
      role: "implementation" as const,
      context: "build-context",
      work: { id: "TKT-002", revision: 1 },
      resultCommit: result,
    },
  ])
    expect(
      auditLedgerWork({ ...ledger, evidence: [{ ...witness, target }] }, tree).some(
        (finding) => finding.kind === "reference",
      ),
    ).toBe(true);
});
