import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../src/shell/cli/runner.ts";
import { contractFailure } from "../../src/core/contract.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

it("P3 keeps repository diagnosis and work status available when the installation payload cannot load", () => {
  const root = mkdtempSync(join(tmpdir(), "greenline-unavailable-"));
  try {
    mkdirSync(join(root, ".git"));
    const release = fixtureInstallation();
    expect(
      runCli(["init", "--yes"], new RecordingWriter().writer, "test", {
        cwd: root,
        version: "test",
        installation: release,
      }),
    ).toBe(0);
    mkdirSync(join(root, ".greenline/work/tickets"), { recursive: true });
    writeFileSync(
      join(root, ".greenline/work/tickets/TKT-001.md"),
      "---\nid: TKT-001\ntype: ticket\nintent: repair-count\nscope: [src]\nrevision: 1\nstatus: ready\nacceptance:\n  - [ ] Empty input returns zero\n---\n",
    );
    writeFileSync(join(root, ".greenline/tmp/.write.lock"), "another writer\n");
    const before = readFileSync(join(root, ".greenline/manifest.json"), "utf8");
    const failure = contractFailure("missing bundle", [
      { path: "release", message: "Restore the exact bundle." },
    ]);
    if (failure._tag !== "err") throw new Error("expected fixture failure");
    const env = { cwd: root, version: "test", installationError: failure.error };
    const status = new RecordingWriter();
    expect(runCli(["status", "--json"], status.writer, "test", env)).toBe(1);
    expect(JSON.parse(status.out)).toMatchObject({
      view: { tickets: [expect.objectContaining({ id: "TKT-001" })] },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "GL0140" })]),
    });
    writeFileSync(join(root, ".greenline/lock.json"), "invalid");
    const doctor = new RecordingWriter();
    expect(runCli(["doctor", "--json"], doctor.writer, "test", env)).toBe(1);
    expect(JSON.parse(doctor.out).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GL0104" }),
        expect.objectContaining({ code: "GL0140" }),
      ]),
    );
    expect(readFileSync(join(root, ".greenline/manifest.json"), "utf8")).toBe(before);
    expect(readFileSync(join(root, ".greenline/tmp/.write.lock"), "utf8")).toBe("another writer\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
