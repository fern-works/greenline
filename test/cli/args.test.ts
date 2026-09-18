import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/shell/cli/args.ts";

describe("parseArgs", () => {
  it("parses --version", () => {
    const invocation = parseArgs(["--version"], "9.9.9");
    expect(invocation.kind).toBe("version");
    if (invocation.kind !== "version") return;
    expect(invocation.text).toContain("9.9.9");
  });

  it("parses --help", () => {
    const invocation = parseArgs(["--help"], "1.2.3");
    expect(invocation.kind).toBe("help");
    if (invocation.kind !== "help") return;
    expect(invocation.text).toContain("Usage");
    expect(invocation.text).toContain("init");
    expect(invocation.text).toContain("sync");
    expect(invocation.text).toContain("doctor");
  });

  it("rejects unknown commands as usage errors", () => {
    const invocation = parseArgs(["bogus"], "1.2.3");
    expect(invocation.kind).toBe("usage-error");
  });

  it("treats missing commands as usage errors", () => {
    expect(parseArgs([], "1.2.3").kind).toBe("usage-error");
  });

  it("parses init flags into a typed request", () => {
    const invocation = parseArgs(
      ["init", "--yes", "--json", "--targets", "codex,claude-code"],
      "1.2.3",
    );
    expect(invocation.kind).toBe("run");
    if (invocation.kind !== "run") return;
    expect(invocation.request.command).toBe("init");
    expect(invocation.request.yes).toBe(true);
    expect(invocation.request.json).toBe(true);
    expect(invocation.request.dryRun).toBe(false);
    expect(invocation.request.targets).toEqual(["codex", "claude-code"]);
    expect(invocation.request.forceManaged).toEqual([]);
  });

  it("rejects unknown targets", () => {
    const invocation = parseArgs(["init", "--targets", "cursor"], "1.2.3");
    expect(invocation.kind).toBe("usage-error");
    if (invocation.kind !== "usage-error") return;
    expect(invocation.message).toContain("cursor");
  });

  it("rejects unknown options", () => {
    expect(parseArgs(["init", "--nope"], "1.2.3").kind).toBe("usage-error");
  });

  it("parses sync dry-run", () => {
    const invocation = parseArgs(["sync", "--dry-run", "--json"], "1.2.3");
    expect(invocation.kind).toBe("run");
    if (invocation.kind !== "run") return;
    expect(invocation.request.command).toBe("sync");
    expect(invocation.request.dryRun).toBe(true);
    expect(invocation.request.json).toBe(true);
  });

  it("parses doctor", () => {
    const invocation = parseArgs(["doctor"], "1.2.3");
    expect(invocation.kind).toBe("run");
    if (invocation.kind !== "run") return;
    expect(invocation.request.command).toBe("doctor");
    expect(invocation.request.json).toBe(false);
  });
});
