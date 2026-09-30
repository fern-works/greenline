import { expect, it } from "vitest";
import { auditLedgerWork } from "../../src/core/ledger-audit.ts";
import { parseArtifact } from "../../src/core/artifact.ts";
import { parseLedgerRecord, type ExecutionLedger } from "../../src/core/execution-ledger.ts";

const path = "tickets/TKT-001.md";
const parsed = parseArtifact(
  path,
  "---\nid: TKT-001\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: implemented\nrevision: 2\nresult_commit: abc1234\nacceptance:\n  - [x] repaired\n---\n",
);
if (parsed._tag === "err") throw new Error("invalid artifact fixture");
const tree = [{ path, artifact: parsed.value }];
const record = parseLedgerRecord(
  JSON.stringify({
    schemaVersion: 3,
    id: "repair",
    actor: "agent",
    context: "one",
    role: "implementation",
    work: { id: "TKT-001", revision: 1 },
    resultCommit: "abc1234",
    scopes: ["."],
    selections: [
      {
        id: "law",
        kind: "guidance",
        source: { kind: "repository", path: "RULES.md", revision: "a".repeat(64) },
        stage: "before-work",
        decision: "selected",
        reason: "The root follows these standards.",
      },
    ],
  }),
  "fixture",
);
if (record._tag === "err") throw new Error("invalid ledger fixture");
const ledger: ExecutionLedger = {
  records: [{ ...record.value, consultations: record.value.selections }],
  evidence: [],
  consultations: [],
  observedChanges: [],
};

it("locates a review subject mismatch and identifies the expected and actual accounts", () => {
  const parsedReview = parseArtifact(
    "reviews/REV-001.md",
    "---\nid: REV-001\ntype: review\nimplementation_account: review-account\nticket: TKT-001\nstatus: complete\nrevision: 1\nrange: def5678..abc1234\n---\n",
  );
  if (parsedReview._tag === "err") throw parsedReview.error;
  const reference = { path: ".greenline/ledger/records/repair.json", revision: "c".repeat(64) };
  const review = {
    ...record.value,
    id: "review-account",
    context: "independent-review",
    role: "review" as const,
    work: { id: "REV-001", revision: 1 },
    consultations: [],
    reviews: [reference],
  };
  const findings = auditLedgerWork(
    {
      ...ledger,
      records: [review],
      evidence: [{ record: review.id, reference, status: "matched", target: record.value }],
    },
    [{ path: "reviews/REV-001.md", artifact: parsedReview.value }],
  );
  const mismatch = findings.find((finding) => finding.kind === "reference");
  expect(mismatch?.path).toBe(".greenline/ledger/records/review-account.json");
  expect(mismatch?.message).toContain(".greenline/ledger/records/repair.json");
  expect(mismatch?.message).toContain("implementation_account 'review-account'");
  expect(mismatch?.message).toContain("'repair' (implementation, ticket TKT-001, result abc1234)");
});

it("refuses implementation claimed without its own matching ledger; sparse selections need no invented outcomes", () => {
  expect(auditLedgerWork({ ...ledger, records: [] }, tree)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "missing",
        severity: "error",
        path: ".greenline/work/tickets/TKT-001.md",
      }),
    ]),
  );
  expect(auditLedgerWork(ledger, tree)).toEqual([]);
  expect(
    auditLedgerWork(
      {
        ...ledger,
        records: ledger.records.map((entry) => ({ ...entry, resultCommit: "def5678" })),
      },
      tree,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "missing",
        severity: "error",
        path: ".greenline/work/tickets/TKT-001.md",
      }),
    ]),
  );
});

it("keeps an honest unverified application distinct from a supported claim and does not stale historical input revisions", () => {
  const records = ledger.records.map((entry) => ({
    ...entry,
    applications: [
      {
        consultation: "law",
        outcome: "unverified" as const,
        reason: "Historical consultation has no capture.",
        evidence: [],
      },
    ],
  }));
  const findings = auditLedgerWork({ ...ledger, records }, tree);
  expect(findings.filter((finding) => finding.severity === "error")).toEqual([]);
  expect(findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "unverified", severity: "warning" })]),
  );
});

it("distinguishes a review limitation from a missing account and refuses unrelated or same-context review inputs", () => {
  const artifact = parseArtifact(
    "reviews/REV-001.md",
    "---\nid: REV-001\ntype: review\nimplementation_account: repair\nticket: TKT-001\nstatus: complete\nrevision: 1\nrange: def5678..abc1234\n---\n",
  );
  const base = ledger.records[0];
  if (artifact._tag === "err" || base === undefined) throw new Error("invalid review fixture");
  const tree = [{ path: "reviews/REV-001.md", artifact: artifact.value }];
  const review = {
    ...base,
    id: "review",
    context: "reviewer",
    role: "review" as const,
    work: { id: "REV-001", revision: 1 },
    consultations: base.consultations.map((entry) => ({
      ...entry,
      decision: "not-applicable" as const,
    })),
    reviewLimit: "This standalone historical review has no prior execution account.",
  };
  const limited = auditLedgerWork({ ...ledger, records: [review] }, tree);
  expect(limited.filter((finding) => finding.severity === "error")).toEqual([]);
  expect(limited).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "unverified" })]),
  );
  const reference = { path: ".greenline/ledger/records/repair.json", revision: "c".repeat(64) };
  const referenced = { ...review, reviews: [reference] };
  const target = {
    id: "repair",
    role: "implementation" as const,
    context: "builder",
    work: { id: "TKT-002", revision: 1 },
    resultCommit: "abc1234",
  };
  const evidence = [{ record: "review", reference, status: "matched" as const, target }];
  expect(auditLedgerWork({ ...ledger, records: [referenced], evidence }, tree)).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "reference", severity: "error" })]),
  );
  expect(
    auditLedgerWork(
      {
        ...ledger,
        records: [referenced],
        evidence: [
          {
            ...evidence[0],
            record: "review",
            reference,
            status: "matched",
            target: {
              ...target,
              context: "reviewer",
              work: { id: "TKT-001", revision: 1 },
            },
          },
        ],
      },
      tree,
    ),
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "contradicted", severity: "error" })]),
  );
});

it("does not use an honestly limited historical review to authorize current ticket completion", () => {
  const reviewed = parseArtifact(
    "reviews/REV-001.md",
    "---\nid: REV-001\ntype: review\nimplementation_account: repair\nticket: TKT-001\nstatus: complete\nrevision: 1\nrange: def5678..abc1234\n---\n",
  );
  const base = ledger.records[0];
  if (reviewed._tag === "err" || base === undefined) throw new Error("invalid fixture");
  const review = {
    ...base,
    id: "review",
    context: "reviewer",
    role: "review" as const,
    work: { id: "REV-001", revision: 1 },
    reviewLimit: "Prior execution account unavailable.",
    consultations: [],
  };
  const completed = tree.map((entry) => ({
    ...entry,
    artifact: { ...entry.artifact, status: "complete" as const },
  }));
  const findings = auditLedgerWork(
    { ...ledger, records: [base, { ...base, id: "verify", role: "verification" }, review] },
    [...completed, { path: "reviews/REV-001.md", artifact: reviewed.value }],
  );
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: ".greenline/work/tickets/TKT-001.md",
        kind: "missing",
        severity: "error",
        message: expect.stringContaining("independent review"),
      }),
    ]),
  );
});

it("refuses a ticket-specific review supported by an earlier implementation result", () => {
  const parsed = parseArtifact(
    "reviews/REV-001.md",
    "---\nid: REV-001\ntype: review\nimplementation_account: repair\nstatus: complete\nrevision: 1\nrange: def5678..abc1234\nticket: TKT-001\n---\n",
  );
  const base = ledger.records[0];
  if (parsed._tag === "err" || base === undefined) throw new Error("invalid fixture");
  const reference = { path: ".greenline/ledger/records/old.json", revision: "c".repeat(64) };
  const review = {
    ...base,
    id: "review",
    context: "reviewer",
    role: "review" as const,
    work: { id: "REV-001", revision: 1 },
    reviews: [reference],
    consultations: base.consultations.map((entry) => ({
      ...entry,
      decision: "not-applicable" as const,
    })),
  };
  const findings = auditLedgerWork(
    {
      ...ledger,
      records: [review],
      evidence: [
        {
          record: "review",
          reference,
          status: "matched",
          target: { ...base, resultCommit: "bad1234" },
        },
      ],
    },
    [{ path: "reviews/REV-001.md", artifact: parsed.value }],
  );
  expect(findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "reference", severity: "error" })]),
  );
});

it("does not ask for a duplicate implementation account when the ticket lacks its result_commit", () => {
  const missingResult = parseArtifact(
    path,
    "---\nid: TKT-001\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: implemented\nrevision: 2\nacceptance:\n  - [x] repaired\n---\n",
  );
  if (missingResult._tag === "err") throw missingResult.error;
  const unfinishedIdentity = [{ path, artifact: missingResult.value }];
  expect(auditLedgerWork(ledger, unfinishedIdentity)).toEqual([]);
  expect(auditLedgerWork({ ...ledger, records: [] }, unfinishedIdentity)).toEqual([
    {
      kind: "missing",
      severity: "error",
      path: ".greenline/work/tickets/TKT-001.md",
      message:
        "'TKT-001' needs its own implementation ledger record with work.id 'TKT-001' and work.revision 2; create or correct it under .greenline/ledger/records/. Read .greenline/ledger/README.md.",
    },
  ]);
});

it("names a second implementation account for the same contributor on the same work with a different result", () => {
  const rework = {
    ...record.value,
    id: "repair-rework",
    resultCommit: "def5678",
    consultations: record.value.selections,
  };
  const findings = auditLedgerWork({ ...ledger, records: [...ledger.records, rework] }, tree);
  const second = findings.find((finding) =>
    finding.message.startsWith("One contribution has one account"),
  );
  expect(second?.severity).toBe("warning");
  expect(second?.kind).toBe("contradicted");
  expect(second?.path).toBe(".greenline/ledger/records/repair-rework.json");
  expect(second?.message).toContain("'repair' (one), 'repair-rework' (one)");
  const relabelled = { ...rework, id: "repair-rework-2", context: "one-rework" };
  expect(
    auditLedgerWork({ ...ledger, records: [...ledger.records, relabelled] }, tree).some((finding) =>
      finding.message.includes("'repair-rework-2' (one-rework)"),
    ),
  ).toBe(true);
  const sameResult = { ...rework, id: "repair-again", resultCommit: "abc1234" };
  expect(
    auditLedgerWork({ ...ledger, records: [...ledger.records, sameResult] }, tree).some((finding) =>
      finding.message.startsWith("One contribution has one account"),
    ),
  ).toBe(false);
});

it("J-39 S1 refuses an observed change beyond its own account and its receipts under an answer's planning account with no work, where maintenance keeps its installed files", () => {
  const answer = {
    ...record.value,
    id: "sanitizer-advice",
    role: "planning" as const,
    work: null,
    resultCommit: undefined,
    selections: [],
    consultations: [],
  };
  const upkeep = { ...answer, id: "upkeep", role: "maintenance" as const };
  const witness = { kind: "git" as const, base: "def5678", result: "abc1234" };
  // The answer's own files: its account and the receipts its consultation writes.
  const own = [
    ".greenline/ledger/records/sanitizer-advice.json",
    ".greenline/ledger/receipts/0b4c9a52-1d7e-4f3a-9c61-2f8e5d7a4b10.json",
  ];
  const audit = (paths: readonly string[]) =>
    auditLedgerWork(
      {
        ...ledger,
        records: [answer, upkeep],
        observedChanges: [
          { record: "sanitizer-advice", paths, witness },
          { record: "upkeep", paths: [".greenline/DECISIONS.md"], witness },
        ],
      },
      [],
    );
  // An answer that changed nothing, or only its own files, stands without an owning artifact.
  expect(auditLedgerWork({ ...ledger, records: [answer] }, [])).toEqual([]);
  expect(audit(own)).toEqual([]);
  // Every other observed path is refused under the answer, a greenline file and another account among them.
  for (const path of [
    "src/app.ts",
    ".greenline/DECISIONS.md",
    ".greenline/ledger/records/upkeep.json",
  ]) {
    const findings = audit([...own, path].sort());
    expect(findings).toEqual([
      expect.objectContaining({
        kind: "contradicted",
        severity: "error",
        path: ".greenline/ledger/records/sanitizer-advice.json",
        message: expect.stringContaining(`observed changes include: ${path}.`),
      }),
    ]);
  }
});
