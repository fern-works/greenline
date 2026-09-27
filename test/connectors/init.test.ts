import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PromptPort } from "../../src/shell/cli/prompt.ts";
import {
  GARDEN_POINTER,
  GARDEN_SKILL_FILES,
  makeRepository,
  read,
  removeRepository,
  run,
} from "./workspace.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) removeRepository(root);
});

/** A terminal stand-in and every question it was asked. */
interface Terminal {
  readonly prompt: PromptPort;
  readonly asked: string[];
}

/** A terminal that answers init's one question and records every question it is asked. */
function terminal(): Terminal {
  const asked: string[] = [];
  return {
    asked,
    prompt: {
      choose: (question, choices) => {
        asked.push([question, ...choices.map((choice) => choice.label)].join(" | "));
        return "both";
      },
      input: (question) => {
        asked.push(question);
        return undefined;
      },
    },
  };
}

describe("init is silent about garden", () => {
  it("asks nothing about garden or a connector at a terminal", () => {
    const root = makeRepository("init-terminal");
    roots.push(root);
    const answers = terminal();
    expect(run(root, ["init"], { prompt: answers.prompt }).code).toBe(0);
    expect(answers.asked).toHaveLength(1);
    expect(answers.asked[0]).toMatch(/^Which harness trees/);
    for (const question of answers.asked) expect(question).not.toMatch(/garden|connector/i);
  });

  it.each([[["init", "--yes"]], [["init", "--targets", "codex"]]])(
    "%j enables no connector and installs nothing for garden, even when the installation carries its skill",
    (args) => {
      const root = makeRepository("init-headless");
      roots.push(root);
      const result = run(root, args);
      expect(result.code).toBe(0);
      expect(result.out).not.toMatch(/garden|connector/i);
      expect(JSON.parse(read(root, ".greenline/manifest.json"))).not.toHaveProperty("connectors");
      for (const path of GARDEN_SKILL_FILES) expect(existsSync(join(root, path))).toBe(false);
      expect(read(root, "AGENTS.md")).not.toContain("use-garden");
      expect(read(root, "AGENTS.md")).not.toContain(GARDEN_POINTER);
      expect(read(root, ".greenline/lock.json")).not.toContain("use-garden");
    },
  );
});
