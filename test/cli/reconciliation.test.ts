import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseArgs } from "../../src/shell/cli/args.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

it("refuses the removed doctor dry-run flag while preserving sync dry-run", () => {
  expect(parseArgs(["doctor", "--dry-run"], "test").kind).toBe("usage-error");
  const sync = parseArgs(["sync", "--dry-run"], "test");
  expect(sync.kind).toBe("run");
  if (sync.kind === "run") expect(sync.request.dryRun).toBe(true);
});
it("doctor and status locate every invalid ledger field instead of reporting only an issue count", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-ledger-error-"));
  mkdirSync(join(root, ".git"));
  const env = { cwd: root, version: "test", installation: fixtureInstallation() };
  try {
    expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
    mkdirSync(join(root, ".greenline/ledger/records"), { recursive: true });
    writeFileSync(
      join(root, ".greenline/ledger/records/repair.json"),
      JSON.stringify({
        id: "repair",
        actor: "fixture",
        role: "implementation",
        scopes: ["."],
        work: { id: "TKT-001", revision: 1 },
      }),
    );
    for (const command of ["doctor", "status"]) {
      const writer = new RecordingWriter();
      expect(runCli([command, "--json"], writer.writer, "test", env)).toBe(1);
      const rows = JSON.parse(writer.out).diagnostics.filter(
        (row: { code: string }) => row.code === "GL0123",
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((row: { message: string }) => row.message)).toEqual([
        expect.stringContaining("schemaVersion"),
        expect.stringContaining("context"),
      ]);
      expect(rows.every((row: { path: string }) => row.path.endsWith("repair.json"))).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("the minimal account printed in the installed ledger contract validates through doctor", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-ledger-example-"));
  mkdirSync(join(root, ".git"));
  const installation = fixtureInstallation();
  const env = { cwd: root, version: "test", installation };
  try {
    expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
    const prose = readFileSync("corpus/runtime/ledger.md", "utf8");
    const account = /```json\n([\s\S]*?)\n```/.exec(prose)?.[1];
    if (account === undefined) throw new Error("Documented account example missing");
    mkdirSync(join(root, ".greenline/ledger/records"), { recursive: true });
    mkdirSync(join(root, ".greenline/work/tickets"), { recursive: true });
    writeFileSync(join(root, ".greenline/ledger/records/repair.json"), account);
    writeFileSync(
      join(root, ".greenline/work/tickets/TKT-001.md"),
      "---\nid: TKT-001\ntype: ticket\nstatus: ready\nrevision: 1\nintent: repair-count\nscope: [src]\nacceptance:\n  - [ ] Repair the count\n---\n",
    );
    const writer = new RecordingWriter();
    expect(runCli(["doctor", "--json"], writer.writer, "test", env)).toBe(0);
    expect(JSON.parse(writer.out).diagnostics).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
