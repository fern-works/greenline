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
    expect(invocation.text).toContain("status");
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

  it.each(["doctor", "evidence"])(
    "S20 the removed %s command is an unknown command whose refusal names status",
    (name) => {
      const invocation = parseArgs([name, "--json"], "1.2.3");
      expect(invocation.kind).toBe("usage-error");
      if (invocation.kind !== "usage-error") return;
      expect(invocation.message).toContain(`unknown command '${name}'`);
      expect(invocation.message).toContain("status");
    },
  );

  it("S20 help for a removed command is the same unknown-command refusal naming status", () => {
    const invocation = parseArgs(["help", "doctor"], "1.2.3");
    expect(invocation.kind).toBe("usage-error");
    if (invocation.kind !== "usage-error") return;
    expect(invocation.message).toContain("unknown command 'doctor'");
    expect(invocation.message).toContain("status");
  });

  it("S20 an unknown connectors operation is refused by its own name", () => {
    const invocation = parseArgs(["connectors", "frob"], "1.2.3");
    expect(invocation.kind).toBe("usage-error");
    if (invocation.kind !== "usage-error") return;
    expect(invocation.message).toContain("'frob'");
    expect(invocation.message).not.toContain("unknown command 'connectors'");
  });

  it("J-73 S4, J-89 S1 and J-93 S3 the root help lists the ten command groups, tidy, brief, event and hook among them, and neither removed command", () => {
    const invocation = parseArgs(["--help"], "1.2.3");
    if (invocation.kind !== "help") throw new Error("help expected");
    const commands = [...invocation.text.matchAll(/^  ([a-z]+)\b/gm)].map((match) => match[1]);
    expect(commands).toEqual([
      "init",
      "sync",
      "status",
      "tidy",
      "inspect",
      "connectors",
      "check",
      "brief",
      "event",
      "hook",
      "help",
    ]);
  });

  it("J-89 S2 the root help gives check's short form for the open change", () => {
    const invocation = parseArgs(["--help"], "1.2.3");
    if (invocation.kind !== "help") throw new Error("help expected");
    expect(invocation.text.replace(/\s+/g, " ")).toContain(
      "check -- <command> for the open change at its step",
    );
  });

  it("J-82 S1 init's --yes help runs git init only on the owner's yes", () => {
    const invocation = parseArgs(["init", "--help"], "1.2.3");
    if (invocation.kind !== "help") throw new Error("help expected");
    const help = invocation.text.replace(/\s+/g, " ");
    expect(help).toContain(
      "--yes on the owner's yes, run 'git init' outside a repository and install both harness trees",
    );
    expect(help).not.toContain("accept defaults");
  });

  it("J-84 S2 tidy's help says it runs at every change's close, whatever its mode", () => {
    const invocation = parseArgs(["tidy", "--help"], "1.2.3");
    if (invocation.kind !== "help") throw new Error("help expected");
    expect(invocation.text.replace(/\s+/g, " ")).toContain(
      "Remove the working files of done and dropped changes from .greenline/tmp/; run it at every change's close, whatever its mode",
    );
  });
});
