import { auditLedgerWork } from "../../src/core/ledger-audit.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { sha256Hex } from "../../src/commons/hash.ts";
import { createNodeFileIo } from "../../src/shell/fs/io.ts";
import { readExecutionLedger } from "../../src/shell/execution-ledger.ts";
import { collectArtifacts } from "../../src/shell/artifacts.ts";
import { ticketMd } from "../fixtures/artifacts.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "greenline-ledger-"));
  roots.push(root);
  mkdirSync(join(root, ".greenline/ledger/records"), { recursive: true });
  writeFileSync(
    join(root, ".greenline/manifest.json"),
    JSON.stringify({
      schemaVersion: 6,
      targets: ["codex"],
      skills: { include: [], exclude: [] },
    }),
  );
  writeFileSync(join(root, "RULES.md"), "Keep the existing runner.\n");
  const proof = {
    path: "RULES.md",
    revision: sha256Hex(readFileSync(join(root, "RULES.md"), "utf8")),
  };
  const record = {
    schemaVersion: 3,
    id: "review-standing",
    actor: "agent",
    context: "one",
    role: "maintenance",
    scopes: ["."],
    checks: [proof],
    selections: [
      {
        id: "law",
        kind: "guidance",
        source: { kind: "repository", ...proof },
        stage: "before-work",
        decision: "selected",
        reason: "Existing law governs.",
      },
    ],
  };
  const path = join(root, ".greenline/ledger/records/review-standing.json");
  writeFileSync(path, JSON.stringify(record));
  return { root, record, path };
}

it("records changed evidence without discarding the authored account", () => {
  const { root } = fixture();
  const first = readExecutionLedger(root, createNodeFileIo());
  expect(first._tag).toBe("ok");
  if (first._tag !== "ok") return;
  expect(first.value.evidence[0]?.status).toBe("matched");
  writeFileSync(join(root, "RULES.md"), "A different decision.\n");
  const changed = readExecutionLedger(root, createNodeFileIo());
  expect(changed._tag).toBe("ok");
  if (changed._tag !== "ok") return;
  expect(changed.value.records).toHaveLength(1);
  expect(changed.value.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record: "review-standing", status: "changed" }),
    ]),
  );
});

it("refuses an account that still declares a guidance configuration, with no converter (D-20)", () => {
  const { root, record, path } = fixture();
  for (const declaration of [
    { state: "unconfigured" },
    { state: "configured", provider: "https://example.com/" },
  ]) {
    writeFileSync(path, JSON.stringify({ ...record, guidance: declaration }));
    const result = readExecutionLedger(root, createNodeFileIo());
    expect(result._tag).toBe("err");
    if (result._tag === "ok") throw new Error("a guidance declaration was accepted");
    expect(result.error._tag).toBe("ContractParseFailed");
    if (result.error._tag !== "ContractParseFailed") throw result.error;
    expect(result.error.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining("guidance") }),
    ]);
  }
});

it("G3 refuses consumer accounting without its manifest authority", () => {
  const { root } = fixture();
  rmSync(join(root, ".greenline/manifest.json"));
  const result = readExecutionLedger(root, createNodeFileIo());
  expect(result._tag).toBe("err");
  if (result._tag === "ok") throw new Error("missing manifest accepted");
  expect(result.error.message).toContain("manifest");
});

it("checks binary result evidence by its actual bytes", () => {
  const { root, record, path } = fixture();
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0xfe]);
  writeFileSync(join(root, "screenshot.png"), bytes);
  const evidence = [
    { path: "screenshot.png", revision: createHash("sha256").update(bytes).digest("hex") },
  ];
  writeFileSync(
    path,
    JSON.stringify({
      ...record,
      checks: evidence,
    }),
  );
  const ledger = readExecutionLedger(root, createNodeFileIo());
  expect(ledger._tag).toBe("ok");
  if (ledger._tag !== "ok") return;
  expect(
    ledger.value.evidence.find((entry) => entry.reference.path === "screenshot.png")?.status,
  ).toBe("matched");
});

it("refuses malformed records and identity/path mismatches", () => {
  const { root, path, record } = fixture();
  for (const content of ["broken", JSON.stringify({ ...record, id: "another" })]) {
    writeFileSync(path, content);
    expect(readExecutionLedger(root, createNodeFileIo())._tag).toBe("err");
  }
});

it("refuses a record whose role the schema does not name, the retired development role among them", () => {
  const { root, path, record } = fixture();
  writeFileSync(path, JSON.stringify({ ...record, role: "development" }));
  const result = readExecutionLedger(root, createNodeFileIo());
  expect(result._tag).toBe("err");
  if (result._tag !== "err") return;
  expect(result.error._tag).toBe("ContractParseFailed");
  if (result.error._tag !== "ContractParseFailed") return;
  expect(result.error.issues.map((issue) => String(issue.path))).toContain("role");
});

it("refuses a review without the work it reviewed, with the issue on work", () => {
  const { root, path, record } = fixture();
  writeFileSync(path, JSON.stringify({ ...record, role: "review", work: null }));
  const result = readExecutionLedger(root, createNodeFileIo());
  expect(result._tag).toBe("err");
  if (result._tag !== "err") return;
  expect(result.error._tag).toBe("ContractParseFailed");
  if (result.error._tag !== "ContractParseFailed") return;
  expect(result.error.issues.map((issue) => String(issue.path))).toContain("work");
});

it("recovers a pinned historical witness after current bytes change", () => {
  const { root, record, path } = fixture();
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("add", "RULES.md");
  git(
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Original law",
  );
  writeFileSync(path, JSON.stringify({ ...record, baseCommit: git("rev-parse", "HEAD") }));
  writeFileSync(join(root, "RULES.md"), "A later ruling.\n");
  const ledger = readExecutionLedger(root, createNodeFileIo());
  expect(ledger._tag).toBe("ok");
  if (ledger._tag !== "ok") return;
  expect(ledger.value.records).toHaveLength(1);
  expect(ledger.value.evidence.every((entry) => entry.current === false)).toBe(true);
  expect(ledger.value.evidence.every((entry) => entry.status === "matched")).toBe(true);
});

it("refuses symlinked records and does not read witnesses outside the repository", () => {
  const { root, record, path } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "greenline-outside-"));
  roots.push(outside);
  writeFileSync(join(outside, "RULES.md"), readFileSync(join(root, "RULES.md")));
  rmSync(join(root, "RULES.md"));
  symlinkSync(join(outside, "RULES.md"), join(root, "RULES.md"));
  const ledger = readExecutionLedger(root, createNodeFileIo());
  expect(ledger._tag).toBe("ok");
  if (ledger._tag !== "ok") return;
  expect(ledger.value.evidence[0]?.status).toBe("unavailable");
  writeFileSync(join(outside, "record.json"), JSON.stringify(record));
  rmSync(path);
  symlinkSync(join(outside, "record.json"), path);
  expect(readExecutionLedger(root, createNodeFileIo())._tag).toBe("err");
});

it("P4 exposes code changes mislabeled as maintenance while preserving their authored record", () => {
  const { root, path, record } = fixture();
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "RULES.md");
  git(
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Baseline",
  );
  const baseCommit = git("rev-parse", "HEAD");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/app.ts"), "export const answer = 42;\n");
  git("add", "src/app.ts");
  git(
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Implement answer",
  );
  writeFileSync(
    path,
    JSON.stringify({ ...record, baseCommit, resultCommit: git("rev-parse", "HEAD") }),
  );
  const ledger = readExecutionLedger(root, createNodeFileIo());
  if (ledger._tag === "err") throw ledger.error;
  expect(ledger.value.records[0]?.role).toBe("maintenance");
  expect(auditLedgerWork(ledger.value, [])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "contradicted",
        severity: "error",
        message: expect.stringContaining("src/app.ts"),
      }),
    ]),
  );
});

it("P4 uses completed changes in the account's captured context without treating failed or interrupted edits as implementation", () => {
  const { root, path, record } = fixture();
  const tracePath = "trace.jsonl";
  for (const [context, outcome, expected] of [
    ["one", "success", true],
    ["one", "failed", false],
    ["one", "interrupted", false],
    ["other", "success", false],
  ] as const) {
    const rows: unknown[] = [
      {
        type: "assistant",
        session_id: context,
        message: {
          content: [
            {
              type: "tool_use",
              id: "edit-one",
              name: "Edit",
              input: { file_path: join(root, "src/app.ts") },
            },
          ],
        },
      },
    ];
    if (outcome !== "interrupted")
      rows.push({
        type: "user",
        session_id: context,
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "edit-one",
              content: outcome,
              is_error: outcome === "failed",
            },
          ],
        },
      });
    const trace = rows.map((row) => JSON.stringify(row)).join("\n");
    writeFileSync(join(root, tracePath), trace);
    writeFileSync(
      path,
      JSON.stringify({
        ...record,
        selections: record.selections.map((entry) => ({
          ...entry,
          observation: {
            trace: { path: tracePath, revision: sha256Hex(trace) },
            format: "claude-stream-json",
            call: "unobserved-read",
          },
        })),
      }),
    );
    const ledger = readExecutionLedger(root, createNodeFileIo());
    if (ledger._tag === "err") throw ledger.error;
    expect(
      auditLedgerWork(ledger.value, []).some(
        (finding) => finding.severity === "error" && finding.message.includes("src/app.ts"),
      ),
    ).toBe(expected);
  }
});

it("resolves a pin taken before its commit existed against HEAD and its first parent, and refuses bytes that resolve nowhere", () => {
  const { root, record, path } = fixture();
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message: string) =>
    git(
      "-c",
      "user.name=fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      message,
    );
  git("init", "-q");
  git("add", "RULES.md");
  commit("Baseline");
  const baseCommit = git("rev-parse", "HEAD");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/app.ts"), "export const answer = 42;\n");
  git("add", "src/app.ts");
  commit("Implement answer");
  const resultCommit = git("rev-parse", "HEAD");
  // The gate output is produced after the code commit and lands with the
  // account, so the account's own range never carries it: this is the pin
  // the premium run had to take twice.
  mkdirSync(join(root, ".greenline/work/evidence/TKT-001"), { recursive: true });
  mkdirSync(join(root, ".greenline/work/tickets"), { recursive: true });
  const gate = ".greenline/work/evidence/TKT-001/gate.txt";
  writeFileSync(join(root, gate), "16 passed\n");
  const pinned = { path: gate, revision: sha256Hex("16 passed\n"), pending: true } as const;
  writeFileSync(
    join(root, ".greenline/work/tickets/TKT-001.md"),
    ticketMd("001", { status: "implemented", resultCommit }),
  );
  writeFileSync(
    path,
    JSON.stringify({
      ...record,
      role: "implementation",
      work: { id: "TKT-001", revision: 1 },
      baseCommit,
      resultCommit,
      checks: [pinned],
      selections: [],
    }),
  );
  git("add", "-A");
  commit("Account for TKT-001");
  // The next slice re-runs the gate, so the working tree no longer holds the
  // pinned bytes; only the accounting commit does.
  writeFileSync(join(root, gate), "17 passed\n");
  const claims = () => {
    const ledger = readExecutionLedger(root, createNodeFileIo());
    if (ledger._tag === "err") throw ledger.error;
    const tree = collectArtifacts(join(root, ".greenline", "work"));
    if (tree._tag === "err") throw tree.error;
    return auditLedgerWork(ledger.value, tree.value.parsed).filter((finding) =>
      finding.message.includes("does not resolve at its recorded revision"),
    );
  };
  expect(claims()).toEqual([]);
  writeFileSync(
    path,
    JSON.stringify({
      ...record,
      role: "implementation",
      work: { id: "TKT-001", revision: 1 },
      baseCommit,
      resultCommit,
      checks: [{ ...pinned, revision: sha256Hex("never written\n") }],
      selections: [],
    }),
  );
  expect(claims()).toEqual([
    expect.objectContaining({
      kind: "incomplete",
      severity: "error",
      message: expect.stringContaining(gate),
    }),
  ]);
});
