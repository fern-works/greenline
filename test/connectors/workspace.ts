import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContractParseFailed } from "../../src/core/contract.ts";
import type { Installation } from "../../src/core/installation.ts";
import type { SkillSource } from "../../src/core/skill.ts";
import type { PromptPort } from "../../src/shell/cli/prompt.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation, fixtureSkills } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/**
 * A throwaway Git workspace and an installation that carries a stand-in
 * for garden's opt-in skill with its conditional pointer row, so the
 * connector commands can be driven through the real runner and planner.
 */

/**
 * The stand-in for the skill garden's connector mounts: its name is the
 * registry's and its class the corpus skill's; `skill.test.ts` drives the
 * corpus skill itself.
 */
export const useGarden: SkillSource = {
  name: "use-garden",
  description: "Consult garden when an applicable knowledge question arises.",
  class: "discipline",
  activation: "implicit",
  body: "# Use Garden\n\nA fixture stand-in for the connector's skill.\n",
};

/** The conditional pointer row the block renders only while the skill is mounted. */
export const GARDEN_POINTER = "An applicable knowledge question garden can answer";

/** Every file the stand-in skill installs across both harness trees. */
export const GARDEN_SKILL_FILES: readonly string[] = [
  ".agents/skills/use-garden/SKILL.md",
  ".agents/skills/use-garden/agents/openai.yaml",
  ".claude/skills/use-garden/SKILL.md",
];

/** The fixture installation plus the connector's stand-in skill and its pointer row. */
export function connectorInstallation(): Installation {
  return fixtureInstallation({
    skills: [...fixtureSkills, useGarden],
    intents: [{ intent: GARDEN_POINTER, skills: ["use-garden"] }],
  });
}

/** The recorded result of one CLI run. */
export interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** A new temporary Git root; the caller removes it with `removeRepository`. */
export function makeRepository(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `gl-connectors-${prefix}-`));
  mkdirSync(join(root, ".git"));
  return root;
}

/** Remove a repository `makeRepository` created. */
export function removeRepository(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** Run the CLI in a workspace with an installation, a missing one, or a prompt. */
export function run(
  root: string,
  args: readonly string[],
  options: {
    readonly installation?: Installation;
    readonly installationError?: ContractParseFailed;
    readonly prompt?: PromptPort;
    /** The process environment status and doctor read a connector's PATH and key variable from; none by default. */
    readonly environment?: NodeJS.ProcessEnv;
  } = {},
): Run {
  const rec = new RecordingWriter();
  const plain = { cwd: root, version: "0.1.0" };
  const base =
    options.environment === undefined ? plain : { ...plain, environment: options.environment };
  const installed = { ...base, installation: options.installation ?? connectorInstallation() };
  const code =
    options.installationError !== undefined
      ? runCli([...args], rec.writer, "0.1.0", {
          ...base,
          installationError: options.installationError,
        })
      : runCli(
          [...args],
          rec.writer,
          "0.1.0",
          options.prompt === undefined ? installed : { ...installed, prompt: options.prompt },
        );
  return { code, out: rec.out, err: rec.err };
}

/** A repository-relative file's text. */
export function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/** Every file and directory under the root except `.git`, with each file's text. */
export function tree(root: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (directory === "" && entry.name === ".git") continue;
      const path = join(directory, entry.name);
      entries.set(path, entry.isDirectory() ? "directory" : read(root, path));
      if (entry.isDirectory()) visit(path);
    }
  };
  visit("");
  return entries;
}
