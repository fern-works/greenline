import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PromptChoice, PromptPort } from "../../src/shell/cli/prompt.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/**
 * `greenline init` on a directory that is no repository offers `git init`
 * there, one question in its flow (J-73 S4): `--yes` answers it, a refusal or
 * no answer keeps GL0105, and inside a repository nothing is asked about git.
 */

const VERSION = "0.1.0";
const installation = fixtureInstallation();
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function directory(): string {
  const root = mkdtempSync(join(tmpdir(), "init-git-"));
  roots.push(root);
  return root;
}

/** A terminal stand-in: the prompt it answers through, and each question it was asked. */
interface Terminal {
  readonly prompt: PromptPort;
  readonly asked: string[];
}

/** One run of the CLI: its exit code and both streams. */
interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** A terminal that answers each question by how it starts, and records what it was asked. */
function terminal(answers: Readonly<Record<string, string>>): Terminal {
  const asked: string[] = [];
  return {
    asked,
    prompt: {
      choose: (question: string, choices: readonly PromptChoice[]) => {
        asked.push(question);
        const key = Object.entries(answers).find(([start]) => question.startsWith(start))?.[1];
        return choices.find((choice) => choice.key === key)?.key;
      },
    },
  };
}

function init(root: string, args: readonly string[], prompt?: PromptPort): Run {
  const rec = new RecordingWriter();
  const environment = { cwd: root, version: VERSION, installation };
  const code = runCli(
    ["init", ...args],
    rec.writer,
    VERSION,
    prompt === undefined ? environment : { ...environment, prompt },
  );
  return { code, out: rec.out, err: rec.err };
}

/** Whether git itself reads a repository at the root, so the offer ran a real `git init`. */
function isRepository(root: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd: root, stdio: "ignore" });
    return existsSync(join(root, ".git"));
  } catch {
    return false;
  }
}

describe("J-73 S4 init offers git init on a directory that is no repository", () => {
  it("J-73 S4 with --yes init runs git init there and installs", () => {
    const root = directory();
    const run = init(root, ["--yes", "--json"]);
    expect(run.code).toBe(0);
    expect(isRepository(root)).toBe(true);
    expect(existsSync(join(root, ".greenline/manifest.json"))).toBe(true);
  });

  it("J-73 S4 at a terminal init asks once about git, before the harness trees, and a yes runs git init", () => {
    const root = directory();
    const asked = terminal({
      "This directory is not a Git repository": "yes",
      "Which harness trees": "both",
    });
    const run = init(root, [], asked.prompt);
    expect(run.code).toBe(0);
    expect(asked.asked).toEqual([
      "This directory is not a Git repository. Run 'git init' here?",
      "Which harness trees should greenline install?",
    ]);
    expect(isRepository(root)).toBe(true);
    expect(existsSync(join(root, ".greenline/manifest.json"))).toBe(true);
  });

  it("J-73 S4 a no keeps GL0105, and nothing is created", () => {
    const root = directory();
    const asked = terminal({ "This directory is not a Git repository": "no" });
    const run = init(root, ["--json"], asked.prompt);
    expect(run.code).toBe(1);
    expect(JSON.parse(run.out).diagnostics[0].code).toBe("GL0105");
    expect(asked.asked).toHaveLength(1);
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".greenline"))).toBe(false);
  });

  it("J-73 S4 with no terminal and no --yes, GL0105 names --yes, and nothing is created", () => {
    const root = directory();
    const run = init(root, ["--json"]);
    expect(run.code).toBe(1);
    const diagnostic = JSON.parse(run.out).diagnostics[0];
    expect(diagnostic.code).toBe("GL0105");
    expect(diagnostic.message).toContain("--yes");
    expect(existsSync(join(root, ".git"))).toBe(false);
  });

  it("J-73 S4 a dry run runs no git init, even with --yes", () => {
    const root = directory();
    const run = init(root, ["--yes", "--dry-run", "--json"]);
    expect(run.code).toBe(1);
    expect(JSON.parse(run.out).diagnostics[0].code).toBe("GL0105");
    expect(existsSync(join(root, ".git"))).toBe(false);
  });

  it("J-73 S4 inside a repository nothing is asked about git", () => {
    const root = directory();
    mkdirSync(join(root, ".git"));
    const asked = terminal({ "Which harness trees": "codex" });
    expect(init(root, [], asked.prompt).code).toBe(0);
    expect(asked.asked).toEqual(["Which harness trees should greenline install?"]);
  });
});

/**
 * Outside a repository GL0105 speaks to the owner's decision (J-82 S1): an
 * agent that meets the refusal reads that it offers `git init` and waits, and
 * that `--yes` runs it only as the owner's answer, never an instruction to run it.
 */
const OWNER_DECIDES =
  "running 'git init' is the owner's decision: an agent offers it and waits, and 'greenline init --yes' runs it only as the owner's answer";

/** The one GL0105 diagnostic a refused init run reports. */
function refusal(run: Run): { code: string; message: string } {
  const diagnostics = JSON.parse(run.out).diagnostics;
  expect(diagnostics).toHaveLength(1);
  return diagnostics[0];
}

describe("J-82 S1 outside a repository GL0105 says the owner decides", () => {
  it("J-82 S1 with no terminal and no --yes, GL0105 says the owner decides and runs no git init", () => {
    const root = directory();
    const run = init(root, ["--json"]);
    expect(run.code).toBe(1);
    expect(refusal(run)).toEqual({
      code: "GL0105",
      severity: "error",
      message: `init requires a Git repository root, and none stands here; ${OWNER_DECIDES}`,
    });
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".greenline"))).toBe(false);
  });

  it("J-82 S1 a dry run with --yes refuses with the owner's decision, and runs no git init", () => {
    const root = directory();
    const run = init(root, ["--yes", "--dry-run", "--json"]);
    expect(run.code).toBe(1);
    expect(refusal(run)).toEqual({
      code: "GL0105",
      severity: "error",
      message: `init requires a Git repository root, and none stands here; a dry run runs no 'git init', and ${OWNER_DECIDES}`,
    });
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".greenline"))).toBe(false);
  });

  it("J-82 S1 a no at a terminal refuses with the owner's decision, and runs no git init", () => {
    const root = directory();
    const asked = terminal({ "This directory is not a Git repository": "no" });
    const run = init(root, ["--json"], asked.prompt);
    expect(run.code).toBe(1);
    expect(refusal(run).message).toBe(
      `init requires a Git repository root, and none stands here; ${OWNER_DECIDES}`,
    );
    expect(existsSync(join(root, ".git"))).toBe(false);
  });

  it("J-82 S1 the human refusal names no bare instruction to run git init", () => {
    const root = directory();
    const run = init(root, ["--dry-run"]);
    expect(run.code).toBe(1);
    expect(run.err).toContain("GL0105");
    expect(run.err).toContain("the owner's decision");
    expect(run.err).not.toContain("run 'git init' first");
  });
});

describe("sync and connectors outside a repository leave git init to the owner", () => {
  function outside(args: readonly string[]): Run {
    const rec = new RecordingWriter();
    const code = runCli([...args], rec.writer, VERSION, {
      cwd: directory(),
      version: VERSION,
      installation,
    });
    return { code, out: rec.out, err: rec.err };
  }

  it("J-84 S2 sync and the connectors group's list, status, enable and disable refuse with GL0105 in the owner's words, as init does", () => {
    for (const [verb, args] of [
      ["sync", ["sync", "--json"]],
      ["connectors", ["connectors", "list", "--json"]],
      ["connectors", ["connectors", "status", "--json"]],
      [
        "connectors",
        ["connectors", "enable", "garden", "--url", "https://garden.example", "--json"],
      ],
      ["connectors", ["connectors", "disable", "garden", "--json"]],
    ] as const) {
      const run = outside(args);
      expect(run.code).toBe(1);
      expect(JSON.parse(run.out).diagnostics).toEqual([
        {
          code: "GL0105",
          severity: "error",
          message: `${verb} requires a Git repository root, and none stands here; ${OWNER_DECIDES}`,
        },
      ]);
    }
  });

  it("J-84 S2 the human refusal of sync names no bare instruction to run git init", () => {
    const run = outside(["sync"]);
    expect(run.err).toContain("GL0105");
    expect(run.err).toContain("the owner's decision");
    expect(run.err).not.toContain("run 'git init' first");
  });
});
