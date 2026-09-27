import {
  mkdirSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation, fixtureSkills } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

function tree(root: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  function visit(directory: string): void {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name);
      entries.set(path, entry.isDirectory() ? "directory" : readFileSync(join(root, path), "utf8"));
      if (entry.isDirectory()) visit(path);
    }
  }
  visit("");
  return entries;
}

it.each([
  ["sync", "include"],
  ["sync", "exclude"],
  ["init", "include"],
  ["init", "exclude"],
] as const)(
  "D11 %s refuses every unknown skills.%s name without changing the workspace",
  (command, field) => {
    const root = mkdtempSync(join(tmpdir(), "gl-manifest-skills-"));
    mkdirSync(join(root, ".git"));
    const env = { cwd: root, version: "test", installation: fixtureInstallation() };
    try {
      expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
      writeFileSync(
        join(root, ".greenline/manifest.json"),
        JSON.stringify({
          schemaVersion: 6,
          targets: ["codex", "claude-code"],
          skills: { [field]: ["grilling", "griling", "GRILLING"] },
        }),
      );
      const before = tree(root);
      const writer = new RecordingWriter();
      const code = runCli([command, "--json"], writer.writer, "next", env);
      expect({ code, envelope: JSON.parse(writer.out), stderr: writer.err }).toEqual({
        code: 1,
        envelope: {
          schemaVersion: 1,
          command,
          ok: false,
          effects: [],
          diagnostics: [
            {
              code: "GL0102",
              severity: "error",
              path: ".greenline/manifest.json",
              message: `skills.${field}[1]: Unknown skill 'griling'; see the installed skill list in AGENTS.md.`,
            },
            {
              code: "GL0102",
              severity: "error",
              path: ".greenline/manifest.json",
              message: `skills.${field}[2]: Unknown skill 'GRILLING'; see the installed skill list in AGENTS.md.`,
            },
          ],
        },
        stderr: "",
      });
      expect(tree(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it.each(["init", "sync"])(
  "D11 %s reports unknown names in both lists before attempting to acquire the write lock",
  (command) => {
    const root = mkdtempSync(join(tmpdir(), "gl-skill-preflight-"));
    mkdirSync(join(root, ".git"));
    const env = { cwd: root, version: "test", installation: fixtureInstallation() };
    try {
      expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
      writeFileSync(
        join(root, ".greenline/manifest.json"),
        JSON.stringify({
          schemaVersion: 6,
          targets: ["codex"],
          skills: { include: ["no-such-include"], exclude: ["no-such-exclude"] },
        }),
      );
      writeFileSync(join(root, ".greenline/tmp/.write.lock"), "another writer owns this lock\n");
      const before = tree(root);
      const writer = new RecordingWriter();
      expect(runCli([command, "--json"], writer.writer, "test", env)).toBe(1);
      expect(JSON.parse(writer.out)).toEqual({
        schemaVersion: 1,
        command,
        ok: false,
        effects: [],
        diagnostics: [
          {
            code: "GL0102",
            severity: "error",
            path: ".greenline/manifest.json",
            message:
              "skills.include[0]: Unknown skill 'no-such-include'; see the installed skill list in AGENTS.md.",
          },
          {
            code: "GL0102",
            severity: "error",
            path: ".greenline/manifest.json",
            message:
              "skills.exclude[0]: Unknown skill 'no-such-exclude'; see the installed skill list in AGENTS.md.",
          },
        ],
      });
      expect(tree(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("D11 sync accepts an available optional skill before it is installed and preserves exact exclusions", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-known-skills-"));
  mkdirSync(join(root, ".git"));
  const env = {
    cwd: root,
    version: "test",
    installation: fixtureInstallation({
      skills: [
        ...fixtureSkills,
        {
          name: "architecture-map",
          description: "Map the architecture.",
          class: "stage",
          activation: "explicit",
          optIn: true,
          body: "# Architecture Map\n",
        },
      ],
    }),
  };
  try {
    expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
    expect(existsSync(join(root, ".agents/skills/architecture-map/SKILL.md"))).toBe(false);
    writeFileSync(
      join(root, ".greenline/manifest.json"),
      JSON.stringify({
        schemaVersion: 6,
        targets: ["codex"],
        skills: { include: ["architecture-map"], exclude: ["grilling"] },
      }),
    );
    const writer = new RecordingWriter();
    expect(runCli(["sync", "--json"], writer.writer, "test", env)).toBe(0);
    expect(JSON.parse(writer.out).diagnostics).toEqual([]);
    expect(existsSync(join(root, ".agents/skills/architecture-map/SKILL.md"))).toBe(true);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).not.toContain("| grilling |");
    expect(JSON.parse(readFileSync(join(root, ".greenline/manifest.json"), "utf8")).skills).toEqual(
      { include: ["architecture-map"], exclude: ["grilling"] },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
