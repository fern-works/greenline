import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../src/shell/cli/runner.ts";
import { contractFailure } from "../../src/core/contract.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

it("P3 keeps the repository diagnosis available when the installation payload cannot load", () => {
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
      changes: { view: "unavailable" },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "GL0140" })]),
    });
    writeFileSync(join(root, ".greenline/lock.json"), "invalid");
    const broken = new RecordingWriter();
    expect(runCli(["status", "--json"], broken.writer, "test", env)).toBe(1);
    expect(JSON.parse(broken.out).diagnostics).toEqual(
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
