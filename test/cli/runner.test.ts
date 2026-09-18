import { describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

const EMPTY_ENV = {
  cwd: "/nonexistent",
  version: "1.2.3",
  installation: fixtureInstallation({ skills: [] }),
} as const;

describe("runCli", () => {
  it("refuses retired inspector lookup flags instead of providing another retrieval contract", () => {
    const rec = new RecordingWriter();
    expect(
      runCli(["inspect", "--json", "--unit", "method-grilling"], rec.writer, "1.2.3", EMPTY_ENV),
    ).toBe(2);
  });

  it("--help exits 0 and prints usage", () => {
    const rec = new RecordingWriter();
    const code = runCli(["--help"], rec.writer, "1.2.3", EMPTY_ENV);
    expect(code).toBe(0);
    expect(rec.out).toContain("Usage");
    expect(rec.out).toContain("init");
  });

  it("--version exits 0 and echoes the injected version", () => {
    const rec = new RecordingWriter();
    const code = runCli(["--version"], rec.writer, "9.9.9", EMPTY_ENV);
    expect(code).toBe(0);
    expect(rec.out).toContain("9.9.9");
  });

  it("unknown commands exit 2 as usage errors", () => {
    const rec = new RecordingWriter();
    const code = runCli(["bogus"], rec.writer, "1.2.3", EMPTY_ENV);
    expect(code).toBe(2);
    expect(rec.err).toContain("unknown command");
  });

  it("missing commands exit 2", () => {
    const rec = new RecordingWriter();
    expect(runCli([], rec.writer, "1.2.3", EMPTY_ENV)).toBe(2);
  });

  it("unknown options exit 2 even on a real command", () => {
    const rec = new RecordingWriter();
    expect(runCli(["init", "--json", "--bogus"], rec.writer, "1.2.3", EMPTY_ENV)).toBe(2);
  });

  it("init outside a Git repository exits 1 with GL0105", () => {
    const rec = new RecordingWriter();
    const code = runCli(["init"], rec.writer, "1.2.3", EMPTY_ENV);
    expect(code).toBe(1);
    expect(rec.err).toContain("GL0105");
  });

  it("init --json outside a repository emits the versioned envelope", () => {
    const rec = new RecordingWriter();
    const code = runCli(["init", "--json"], rec.writer, "1.2.3", EMPTY_ENV);
    expect(code).toBe(1);
    const parsed = JSON.parse(rec.out);
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      command: "init",
      ok: false,
      effects: [],
    });
    expect(parsed.diagnostics[0].code).toBe("GL0105");
  });
});
