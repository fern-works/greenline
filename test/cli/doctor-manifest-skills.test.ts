import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation, fixtureSkills } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import { contractFailure } from "../../src/core/contract.ts";

function tree(root: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const path of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const full = join(path.parentPath, path.name);
    result.set(full, path.isDirectory() ? "directory" : readFileSync(full, "utf8"));
  }
  return result;
}

it.each(["include", "exclude"])(
  "D11 doctor fails on every unknown skills.%s name without diagnosing a guessed projection or writing",
  (field) => {
    const root = mkdtempSync(join(tmpdir(), "gl-doctor-skill-"));
    mkdirSync(join(root, ".git"));
    const env = { cwd: root, version: "test", installation: fixtureInstallation() };
    try {
      expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
      writeFileSync(
        join(root, ".greenline/manifest.json"),
        JSON.stringify({
          schemaVersion: 5,
          targets: ["codex", "claude-code"],
          skills: { [field]: ["grilling", "griling", "GRILLING"] },
          guidance: { state: "unconfigured" },
        }),
      );
      const before = tree(root);
      const writer = new RecordingWriter();
      expect(runCli(["doctor", "--json"], writer.writer, "test", env)).toBe(1);
      expect(JSON.parse(writer.out)).toEqual({
        schemaVersion: 1,
        command: "doctor",
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
        ledger: {
          records: [],
          consultations: { declared: 0, observed: 0, contradicted: 0, unavailable: 0 },
        },
      });
      expect(tree(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("D11 doctor accepts optIn names in both lists even when those methods are not installed", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-doctor-optional-"));
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
        schemaVersion: 5,
        targets: ["codex", "claude-code"],
        skills: { include: ["architecture-map"], exclude: ["architecture-map"] },
        guidance: { state: "unconfigured" },
      }),
    );
    const before = tree(root);
    const writer = new RecordingWriter();
    expect(runCli(["doctor", "--json"], writer.writer, "test", env)).toBe(0);
    expect(JSON.parse(writer.out).diagnostics).toEqual([]);
    expect(tree(root)).toEqual(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("D11 roster-less doctor reports unavailable installation without guessing skill membership", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-doctor-no-roster-"));
  mkdirSync(join(root, ".git"));
  const env = { cwd: root, version: "test", installation: fixtureInstallation() };
  try {
    expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
    writeFileSync(
      join(root, ".greenline/manifest.json"),
      JSON.stringify({
        schemaVersion: 5,
        targets: ["codex", "claude-code"],
        skills: { include: ["griling"] },
        guidance: { state: "unconfigured" },
      }),
    );
    const unavailable = contractFailure("installation", [
      { path: "installation", message: "Restore the package." },
    ]);
    if (unavailable._tag !== "err") throw new Error("Invalid fixture must fail parsing.");
    const before = tree(root);
    const writer = new RecordingWriter();
    expect(
      runCli(["doctor", "--json"], writer.writer, "test", {
        cwd: root,
        version: "test",
        installationError: unavailable.error,
      }),
    ).toBe(1);
    expect(JSON.parse(writer.out).diagnostics).toEqual([
      {
        code: "GL0140",
        severity: "error",
        path: "installation",
        message:
          "installation: Restore the package. Installation-dependent checks and mutations are unavailable; repository facts remain readable.",
      },
    ]);
    expect(tree(root)).toEqual(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
