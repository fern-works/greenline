import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import { initiativeMd, specMd, ticketMd, reviewMd } from "../fixtures/artifacts.ts";
import { writeArtifactLedger } from "../helpers/ledger.ts";

/**
 * doctor's artifact scope (`docs.SPEC.md` §7): every injected-fixture
 * failure is diagnosed with its stable code. One defect per test; the
 * workspace itself is otherwise clean.
 */

const VERSION: string = "0.1.0";
const tempDirs: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-doctor-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  const rec = new RecordingWriter();
  const code = runCli(["init", "--yes"], rec.writer, VERSION, {
    cwd: dir,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  if (code !== 0) throw new Error(`init failed in fixture: ${rec.err}`);
  return dir;
}

function work(root: string, rel: string, text: string): void {
  const full = join(root, ".greenline/work", rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

/** The doctor facts a test asserts on. */
interface DoctorRun {
  readonly code: number;
  readonly diagnostics: readonly { readonly code: string; readonly path?: string }[];
}

function doctor(root: string): DoctorRun {
  const rec = new RecordingWriter();
  const code = runCli(["doctor", "--json"], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  return { code, diagnostics: JSON.parse(rec.out).diagnostics };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("doctor artifact scope", () => {
  it("passes a clean work tree with zero artifact diagnostics", () => {
    const root = makeWorkspace();
    work(root, "001-clean/initiative.md", initiativeMd("001", "clean", "executing"));
    work(root, "001-clean/spec.md", specMd("001", "complete", 2));
    work(
      root,
      "tickets/TKT-001.md",
      ticketMd("001", {
        status: "complete",
        resultCommit: "a1b2c3d",
        acceptance: [{ text: "green", done: true }],
      }),
    );
    writeArtifactLedger(root, "001-clean/spec.md");
    writeArtifactLedger(root, "tickets/TKT-001.md");
    writeArtifactLedger(root, "tickets/TKT-001.md", "verification");
    work(root, "reviews/REV-001.md", reviewMd("001", "001", "complete", "def5678..a1b2c3d"));
    writeArtifactLedger(root, "reviews/REV-001.md");
    const result = doctor(root);
    expect(result.code).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("diagnoses unparseable frontmatter as GL0201 with the file path", () => {
    const root = makeWorkspace();
    work(
      root,
      "001-x/initiative.md",
      "---\nid: INIT-001\ntype: initiative\nstatus: executing\n---\n",
    );
    const result = doctor(root);
    expect(result.code).toBe(1);
    expect(result.diagnostics).toEqual([
      {
        code: "GL0201",
        severity: "error",
        message: "revision is required and starts at 1 (a positive integer) (field 'revision')",
        path: ".greenline/work/001-x/initiative.md",
      },
    ]);
  });

  it("diagnoses a duplicate initiative id as GL0202", () => {
    const root = makeWorkspace();
    work(root, "002-one/initiative.md", initiativeMd("002", "one", "executing"));
    work(root, "002-two/initiative.md", initiativeMd("002", "two", "executing"));
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0202")).toBe(true);
  });

  it("diagnoses an unresolved consumes reference as GL0203", () => {
    const root = makeWorkspace();
    work(root, "003-x/initiative.md", initiativeMd("003", "x", "executing"));
    work(
      root,
      "tickets/TKT-001.md",
      `---\nid: TKT-001\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: ready\nrevision: 1\nconsumes:\n  - { id: INIT-009/SPEC, revision: 1 }\n---\n`,
    );
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0203")).toBe(true);
  });

  it("diagnoses a stale consumption as GL0204 and an impossible one as GL0205", () => {
    const root = makeWorkspace();
    work(root, "004-x/initiative.md", initiativeMd("004", "x", "executing"));
    work(root, "004-x/spec.md", specMd("004", "complete", 3));
    work(
      root,
      "tickets/TKT-001.md",
      `---\nid: TKT-001\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: ready\nrevision: 1\nconsumes:\n  - { id: INIT-004/SPEC, revision: 2 }\n---\n`,
    );
    work(
      root,
      "tickets/TKT-002.md",
      `---\nid: TKT-002\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: ready\nrevision: 1\nconsumes:\n  - { id: INIT-004/SPEC, revision: 9 }\n---\n`,
    );
    const result = doctor(root);
    const codes = result.diagnostics.map((item) => item.code);
    expect(codes).toContain("GL0204");
    expect(codes).toContain("GL0205");
  });

  it("diagnoses a double worktree claim as GL0206", () => {
    const root = makeWorkspace();
    work(root, "005-x/initiative.md", initiativeMd("005", "x", "executing"));
    work(
      root,
      "tickets/TKT-001.md",
      ticketMd("001", { status: "claimed", claimedBy: "worktrees/gl-x" }),
    );
    work(
      root,
      "tickets/TKT-002.md",
      ticketMd("002", { status: "claimed", claimedBy: "worktrees/gl-x" }),
    );
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0206")).toBe(true);
  });

  it("diagnoses a dependency cycle as GL0207", () => {
    const root = makeWorkspace();
    work(root, "006-x/initiative.md", initiativeMd("006", "x", "executing"));
    work(root, "tickets/TKT-001.md", ticketMd("001", { dependsOn: ["TKT-002"] }));
    work(root, "tickets/TKT-002.md", ticketMd("002", { dependsOn: ["TKT-001"] }));
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0207")).toBe(true);
  });

  it("diagnoses missing evidence as GL0208", () => {
    const root = makeWorkspace();
    work(root, "007-x/initiative.md", initiativeMd("007", "x", "decided"));
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0208")).toBe(true);
  });

  // ADR 0016 + QA run 042: the harvest clause on an unconsulted skill
  // body never fired — this warning is the surface every close meets.
  it("warns GL0210 when a complete initiative has no decisions-book entry", () => {
    const root = makeWorkspace();
    work(root, "009-x/initiative.md", initiativeMd("009", "x", "complete"));
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0210")).toBe(true);
  });

  it("stays quiet on GL0210 when the book carries the initiative", () => {
    const root = makeWorkspace();
    work(root, "010-x/initiative.md", initiativeMd("010", "x", "complete"));
    writeFileSync(
      join(root, ".greenline/DECISIONS.md"),
      "# Product decisions\n\n- PD-1 something (INIT-010 D1)\n",
    );
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0210")).toBe(false);
  });

  it("stays quiet on GL0210 for initiatives still in flight", () => {
    const root = makeWorkspace();
    work(root, "011-x/initiative.md", initiativeMd("011", "x", "executing"));
    const result = doctor(root);
    expect(result.diagnostics.some((item) => item.code === "GL0210")).toBe(false);
  });

  it("diagnoses an unproven complete ticket as GL0209", () => {
    const root = makeWorkspace();
    work(root, "008-x/initiative.md", initiativeMd("008", "x", "executing"));
    work(
      root,
      "tickets/TKT-001.md",
      ticketMd("001", {
        status: "complete",
        resultCommit: null,
        acceptance: [{ text: "green", done: false }],
      }),
    );
    const result = doctor(root);
    const findings = result.diagnostics.filter((item) => item.code === "GL0209");
    expect(findings.length).toBe(2);
  });
});
