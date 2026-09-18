import { expect, it } from "vitest";
import { parseArtifact } from "../../src/core/artifact.ts";
import { parseLedgerRecord } from "../../src/core/execution-ledger.ts";
import { auditLedgerWork } from "../../src/core/ledger-audit.ts";

it.each([
  {
    role: "implementation",
    owner: "TKT-001",
    path: "tickets/TKT-001.md",
    fields:
      "type: ticket\nintent: save-preferences\nscope: [src]\nstatus: implemented\nresult_commit: abc1234\nacceptance:\n  - [x] saved\n",
  },
  {
    role: "review",
    owner: "REV-001",
    path: "reviews/REV-001.md",
    fields:
      "type: review\nstatus: complete\nticket: TKT-001\nimplementation_account: builder\nrange: def5678..abc1234\n",
  },
])(
  "G3 names resultCommit on the existing $role account at completion",
  ({ role, owner, path, fields }) => {
    const artifact = parseArtifact(path, `---\nid: ${owner}\nrevision: 1\n${fields}---\n`);
    const account = parseLedgerRecord(
      JSON.stringify({
        schemaVersion: 3,
        id: "contributor",
        actor: "agent",
        context: "fresh",
        role,
        work: { id: owner, revision: 1 },
        scopes: ["."],
      }),
      "fixture",
    );
    if (artifact._tag === "err") throw artifact.error;
    if (account._tag === "err") throw account.error;
    const findings = auditLedgerWork(
      {
        records: [{ ...account.value, consultations: [] }],
        evidence: [],
        consultations: [],
        observedChanges: [],
      },
      [{ path, artifact: artifact.value }],
    );
    expect(findings).toEqual([
      {
        kind: "missing",
        severity: "error",
        path: `.greenline/work/${path}`,
        message: `'${owner}' requires resultCommit 'abc1234' on its ${role} account '.greenline/ledger/records/contributor.json'; this identifies the implementation result, including on a review account.`,
      },
    ]);
  },
);
