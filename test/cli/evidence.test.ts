import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { runEvidenceCli } from "../../src/shell/cli/evidence.ts";
import { RecordingWriter } from "../helpers/writer.ts";

it("builds exact binary references, preserves historical revisions and refuses escaping inputs without partial output", () => {
  const root = mkdtempSync(join(tmpdir(), "evidence-ref-"));
  const outside = mkdtempSync(join(tmpdir(), "evidence-outside-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "--quiet");
    writeFileSync(join(root, "result.bin"), Buffer.from([0, 255]));
    git("add", "result.bin");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "--quiet",
      "-m",
      "evidence",
    );
    const commit = git("rev-parse", "HEAD");
    const current = new RecordingWriter();
    expect(runEvidenceCli(["result.bin"], current.writer, root)).toBe(0);
    const reference = JSON.parse(current.out).references[0];
    expect(reference).toEqual({
      path: "result.bin",
      revision: "06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8",
    });
    writeFileSync(join(root, "result.bin"), "changed");
    const historical = new RecordingWriter();
    expect(runEvidenceCli(["result.bin", "--commit", commit], historical.writer, root)).toBe(0);
    expect(JSON.parse(historical.out).references).toEqual([{ ...reference, commit }]);
    writeFileSync(join(outside, "private"), "private");
    symlinkSync(join(outside, "private"), join(root, "link"));
    for (const args of [
      ["result.bin", "link"],
      ["../outside"],
      ["result.bin", "--commit", "HEAD"],
      ["missing"],
    ]) {
      const refused = new RecordingWriter();
      expect(runEvidenceCli(args, refused.writer, root)).toBe(1);
      expect(refused.out).toBe("");
      expect(JSON.parse(refused.err).ok).toBe(false);
    }
    expect(readFileSync(join(root, "result.bin"), "utf8")).toBe("changed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

it("pins working-tree bytes whose commit does not exist yet, and refuses to pair that with an exact commit", () => {
  const root = mkdtempSync(join(tmpdir(), "evidence-pending-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(join(root, "gate.txt"), "16 passed\n");
    const pending = new RecordingWriter();
    expect(runEvidenceCli(["gate.txt", "--pending"], pending.writer, root)).toBe(0);
    expect(JSON.parse(pending.out).references).toEqual([
      {
        path: "gate.txt",
        revision: "a477fe24ef53892def87f8c58cd8c4bf251fa744b68fb366f032dbd9f44edc31",
        pending: true,
      },
    ]);
    const refused = new RecordingWriter();
    expect(
      runEvidenceCli(["gate.txt", "--pending", "--commit", "abc1234"], refused.writer, root),
    ).toBe(1);
    expect(refused.out).toBe("");
    expect(JSON.parse(refused.err).error.input).toContain("--pending");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("identifies the evidence command and protocol on operational and usage failures", () => {
  const root = mkdtempSync(join(tmpdir(), "evidence-envelope-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    for (const example of [
      { args: ["missing"], exit: 1, input: "missing" },
      { args: [], exit: 2, input: "evidence arguments; see --help" },
    ]) {
      const output = new RecordingWriter();
      expect(runEvidenceCli(example.args, output.writer, root)).toBe(example.exit);
      expect(output.out).toBe("");
      expect(JSON.parse(output.err)).toEqual({
        schemaVersion: 1,
        command: "evidence",
        ok: false,
        error: { kind: "configuration", input: example.input },
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
