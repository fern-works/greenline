import { describe, expect, it } from "vitest";
import { parseLedgerRecord, serializeLedgerRecord } from "../../src/core/execution-ledger.ts";
const selection = {
  id: "method",
  kind: "skill",
  source: { kind: "repository", path: "method.md", revision: "a".repeat(64) },
  stage: "before-work",
  decision: "selected",
  reason: "The method fits this contribution.",
};
const input = {
  schemaVersion: 3,
  id: "change",
  context: "one",
  actor: "agent",
  role: "maintenance",
  scopes: ["."],
  selections: [selection],
};
describe("G3 contribution accounts", () => {
  it("G3 retains concise method selections without requiring a complete manual inventory", () => {
    const parsed = parseLedgerRecord(JSON.stringify(input), "record");
    if (parsed._tag === "err") throw parsed.error;
    expect(parsed.value.selections).toEqual([selection]);
    expect(parseLedgerRecord(serializeLedgerRecord(parsed.value), "record")).toEqual(parsed);
    expect(parseLedgerRecord(JSON.stringify({ ...input, selections: [] }), "record")._tag).toBe(
      "ok",
    );
  });
  it("G3 refuses authored delivery inventories and unearned observed grades", () => {
    for (const extra of [
      { consultations: [selection] },
      { selections: [{ ...selection, observed: true }] },
      { selections: [{ ...selection, source: { kind: "garden", path: "unit" } }] },
    ])
      expect(parseLedgerRecord(JSON.stringify({ ...input, ...extra }), "record")._tag).toBe("err");
  });
  it("keeps a pin that awaits its commit apart from one that already names a commit", () => {
    const gate = { path: "gate.txt", revision: "b".repeat(64) };
    const parsed = parseLedgerRecord(
      JSON.stringify({ ...input, checks: [{ ...gate, pending: true }] }),
      "record",
    );
    if (parsed._tag === "err") throw parsed.error;
    expect(parsed.value.checks).toEqual([{ ...gate, pending: true }]);
    for (const check of [
      { ...gate, pending: true, commit: "abc1234" },
      { ...gate, pending: false },
    ])
      expect(parseLedgerRecord(JSON.stringify({ ...input, checks: [check] }), "record")._tag).toBe(
        "err",
      );
  });
  it("G3 refuses escaping evidence, unsupported exceptions and applied outcomes without evidence", () => {
    for (const extra of [
      { checks: [{ path: "../outside", revision: "a".repeat(64) }] },
      { selections: [{ ...selection, decision: "exception" }] },
      { applications: [{ consultation: "method", outcome: "applied", reason: "done" }] },
    ])
      expect(parseLedgerRecord(JSON.stringify({ ...input, ...extra }), "record")._tag).toBe("err");
  });
});

it("accepts maintenance without an owning artifact and refuses a review or an implementation without one", () => {
  expect(parseLedgerRecord(JSON.stringify({ ...input, role: "maintenance" }), "record")._tag).toBe(
    "ok",
  );
  for (const role of ["review", "implementation"]) {
    const result = parseLedgerRecord(JSON.stringify({ ...input, role }), "record");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") continue;
    expect(result.error._tag).toBe("ContractParseFailed");
    expect(result.error.issues.map((issue) => String(issue.path))).toContain("work");
  }
});
