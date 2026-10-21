import { fixtureInstallation } from "../fixtures/corpus.ts";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../../src/shell/cli/commands.ts";
import type { CliEnvironment } from "../../src/shell/cli/command-environment.ts";
import type { SkillSource } from "../../src/core/skill.ts";
import type { WorkspaceRequest } from "../../src/shell/cli/args.ts";

function tempGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gl-status-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

const brokenSkill: SkillSource = {
  name: "book",
  description: "References a missing page.",
  kind: "habit",
  activation: "implicit",
  body: "# Book\n\nSee [the page](page.md).",
};

const env = (cwd: string): CliEnvironment => ({
  cwd,
  version: "test",
  installation: fixtureInstallation({ skills: [brokenSkill] }),
});

/** A request in the shape parseArgs produces. */
function initRequest(): WorkspaceRequest {
  return {
    command: "init",
    json: false,
    dryRun: false,
    yes: true,
    targets: undefined,
    forceManaged: [],
    port: undefined,
  };
}
function statusRequest(): WorkspaceRequest {
  return {
    command: "status",
    json: false,
    dryRun: false,
    yes: false,
    targets: undefined,
    forceManaged: [],
    port: undefined,
  };
}

describe("status reference-integrity", () => {
  it("warns when a skill's same-directory link does not resolve", () => {
    const repo = tempGitRepo();
    try {
      const init = runCommand(initRequest(), env(repo));
      expect(init.ok).toBe(true);
      const status = runCommand(statusRequest(), env(repo));
      expect(status.ok).toBe(true); // warnings, not errors
      const reference = status.diagnostics.find((item) => item.code === "GL0114");
      expect(reference?.path).toContain("book/SKILL.md");
      expect(reference?.message).toContain("page.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
