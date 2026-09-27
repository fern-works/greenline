import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/commons/hash.ts";
import { splitManagedBlock } from "../../src/core/managed-block.ts";
import {
  POLICY_BLOCK_KEY,
  renderAgentsPolicyBlock,
  renderClaudePolicyBlock,
  renderTmpGitignore,
  renderCodexCatalog,
  renderCodexSkillMetadata,
  renderProjection,
  renderSkillFile,
} from "../../src/core/render.ts";
import { parseLock, serializeLock } from "../../src/core/lock.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureConfiguration, fixtureSkills, fixtureInstallation } from "../fixtures/corpus.ts";
import type { SkillSource } from "../../src/core/skill.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import type { PromptPort } from "../../src/shell/cli/prompt.ts";

function skillAt(index: number): SkillSource {
  const skill = fixtureSkills[index];
  if (skill === undefined) throw new Error(`fixture skill at index ${index} is missing`);
  return skill;
}

/**
 * End-to-end workspace tests against real temp Git repositories:
 * init, sync, doctor, dry-run, force-managed, override blocking, and
 * fail-closed behavior (`docs/SPEC.md` §12 integration shape).
 */

const VERSION: string = "0.1.0";
const tempDirs: string[] = [];

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-repo-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function run(root: string, args: readonly string[], prompt?: PromptPort): Run {
  const rec = new RecordingWriter();
  const environment = {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation({ skills: fixtureSkills }),
  };
  const code = runCli(
    [...args],
    rec.writer,
    VERSION,
    prompt === undefined ? environment : { ...environment, prompt },
  );
  return { code, out: rec.out, err: rec.err };
}

/** A terminal stand-in for the one interactive question: records it, answers once. */
interface Terminal {
  readonly prompt: PromptPort;
  readonly asked: string[];
}

function answering(answer: string): Terminal {
  const asked: string[] = [];
  return {
    asked,
    prompt: {
      choose: (question) => {
        asked.push(question);
        return answer;
      },
    },
  };
}

function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function generatedTree(root: string): Record<string, string> {
  return Object.fromEntries(
    renderProjection(fixtureConfiguration, fixtureInstallation()).map((file): [string, string] => [
      file.path,
      read(root, file.path),
    ]),
  );
}

const expectedLock: string =
  JSON.stringify(
    {
      schemaVersion: 4,
      cliVersion: VERSION,
      installationRevision: fixtureInstallation().revision,
      upstreams: [],
      files: {
        ".agents/skills/delivery-review/SKILL.md": sha256Hex(renderSkillFile(skillAt(0))),
        ".agents/skills/delivery-review/agents/openai.yaml": sha256Hex(
          renderCodexSkillMetadata(skillAt(0)),
        ),
        ".agents/skills/grilling/SKILL.md": sha256Hex(renderSkillFile(skillAt(1))),
        ".agents/skills/grilling/agents/openai.yaml": sha256Hex(
          renderCodexSkillMetadata(skillAt(1)),
        ),
        ".claude/skills/delivery-review/SKILL.md": sha256Hex(renderSkillFile(skillAt(0))),
        ".claude/skills/grilling/SKILL.md": sha256Hex(renderSkillFile(skillAt(1))),
        ".greenline/THIRD_PARTY_NOTICES.md": sha256Hex(fixtureInstallation().notices),
        ".greenline/WORK.md": sha256Hex(fixtureInstallation().workGuide),
        ".greenline/ledger/README.md": sha256Hex(fixtureInstallation().ledgerGuide),
        ".greenline/tmp/.gitignore": sha256Hex(renderTmpGitignore()),
        "AGENTS.md": sha256Hex(
          renderAgentsPolicyBlock(fixtureSkills, [], fixtureInstallation().agentGuide),
        ),
        "CLAUDE.md": sha256Hex(renderClaudePolicyBlock()),
        "agents/openai.yaml": sha256Hex(renderCodexCatalog(fixtureSkills)),
      },
    },
    null,
    2,
  ) + "\n";

it.each(["changed installation", "missing projection"])(
  "G3 doctor refuses stale installation without a maintenance queue: %s",
  (change) => {
    const root = makeRepo();
    expect(run(root, ["init", "--yes", "--targets", "codex"]).code).toBe(0);
    if (change === "changed installation") {
      const path = join(root, ".greenline/manifest.json");
      writeFileSync(
        path,
        JSON.stringify({
          ...JSON.parse(read(root, ".greenline/manifest.json")),
          targets: ["codex", "claude-code"],
        }),
      );
    } else rmSync(join(root, ".agents/skills/grilling/SKILL.md"));
    expect(run(root, ["doctor"]).code).toBe(1);
    expect(run(root, ["sync"]).code).toBe(0);
    expect(run(root, ["doctor"]).code).toBe(0);
  },
);

it("refuses another greenline writer before touching an initialized workspace", () => {
  const root = makeRepo();
  expect(run(root, ["init", "--yes"]).code).toBe(0);
  const before = readFileSync(join(root, ".greenline/manifest.json"), "utf8");
  writeFileSync(join(root, ".greenline/tmp/.write.lock"), "another writer\n");
  const refused = run(root, ["sync"]);
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("another greenline writer");
  expect(readFileSync(join(root, ".greenline/manifest.json"), "utf8")).toBe(before);
  rmSync(join(root, ".greenline/tmp/.write.lock"));
  expect(run(root, ["sync"]).code).toBe(0);
  expect(existsSync(join(root, ".greenline/tmp/.write.lock"))).toBe(false);
});

it("installs the common ledger guide and protects local edits through the normal managed-file contract", () => {
  const root = makeRepo();
  const env = {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation({
      skills: fixtureSkills,
      ledgerGuide: "# Execution ledger\n\nRecord the actual contribution.\n",
    }),
  };
  const rec = new RecordingWriter();
  expect(runCli(["init", "--yes"], rec.writer, VERSION, env)).toBe(0);
  expect(read(root, ".greenline/ledger/README.md")).toBe(env.installation.ledgerGuide);
  writeFileSync(join(root, ".greenline/ledger/README.md"), "A local edit.\n");
  expect(runCli(["sync"], rec.writer, VERSION, env)).toBe(1);
  expect(read(root, ".greenline/ledger/README.md")).toBe("A local edit.\n");
});

describe("init", () => {
  it("installs the full skeleton with a byte-exact lock", () => {
    const root = makeRepo();
    const result = run(root, ["init", "--yes"]);
    expect(result.code).toBe(0);
    expect(read(root, ".greenline/manifest.json")).toBe(
      JSON.stringify(
        {
          schemaVersion: 6,
          targets: ["codex", "claude-code"],
          skills: { exclude: [], include: [] },
        },
        null,
        2,
      ) + "\n",
    );
    expect(read(root, ".greenline/lock.json")).toBe(expectedLock);
    for (const path of [
      ".agents/skills/grilling/SKILL.md",
      ".agents/skills/grilling/agents/openai.yaml",
      ".claude/skills/delivery-review/SKILL.md",
      "agents/openai.yaml",
    ]) {
      expect(existsSync(join(root, path))).toBe(true);
    }
    const agents = read(root, "AGENTS.md");
    expect(agents).toContain("<!-- greenline:managed begin policy -->");
    expect(agents).toContain("<!-- greenline:managed end policy -->");
  });

  it("preserves user files and prepends the policy block to AGENTS.md", () => {
    const root = makeRepo();
    writeFileSync(join(root, "notes.md"), "# user notes\n");
    writeFileSync(join(root, "AGENTS.md"), "# My project policy\n\nhand-written rules\n");
    const result = run(root, ["init", "--yes"]);
    expect(result.code).toBe(0);
    expect(read(root, "notes.md")).toBe("# user notes\n");
    const agents = read(root, "AGENTS.md");
    expect(agents.startsWith("<!-- greenline:managed begin policy -->")).toBe(true);
    expect(agents.endsWith("# My project policy\n\nhand-written rules\n")).toBe(true);
  });

  it("G3 refuses an unspecified second init while preserving the installed tree", () => {
    const root = makeRepo();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const before = generatedTree(root);
    const manifestBefore = read(root, ".greenline/manifest.json");
    const second = run(root, ["init", "--yes"]);
    expect(second.code).toBe(1);
    expect(second.err).toContain("GL0124");
    expect(read(root, ".greenline/manifest.json")).toBe(manifestBefore);
    expect(generatedTree(root)).toEqual(before);
  });

  it("fails closed when AGENTS.override.md exists", () => {
    const root = makeRepo();
    writeFileSync(join(root, "AGENTS.override.md"), "shadow\n");
    const result = run(root, ["init", "--yes", "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).diagnostics[0].code).toBe("GL0106");
    expect(existsSync(join(root, ".greenline"))).toBe(false);
  });
});

describe("init targets (ADR 0029)", () => {
  it("asks which harness trees to install when no flag chose, and writes only the chosen tree", () => {
    const root = makeRepo();
    const terminal = answering("claude-code");
    const result = run(root, ["init"], terminal.prompt);
    expect(result.code).toBe(0);
    expect(terminal.asked).toHaveLength(1);
    expect(JSON.parse(read(root, ".greenline/manifest.json")).targets).toEqual(["claude-code"]);
    expect(existsSync(join(root, ".claude/skills/grilling/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".agents"))).toBe(false);
    expect(existsSync(join(root, "agents/openai.yaml"))).toBe(false);
  });

  it("fails closed with GL0116 and writes nothing when no one can answer and no flag chose", () => {
    const root = makeRepo();
    const result = run(root, ["init", "--json"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("GL0116");
    expect(result.out).toContain("--targets");
    expect(existsSync(join(root, ".greenline"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("never asks when the targets flag is explicit, or --yes accepts its default", () => {
    const flagged = makeRepo();
    const terminal = answering("both");
    expect(run(flagged, ["init", "--targets", "codex"], terminal.prompt).code).toBe(0);
    expect(terminal.asked).toHaveLength(0);
    expect(JSON.parse(read(flagged, ".greenline/manifest.json")).targets).toEqual(["codex"]);
    const accepted = makeRepo();
    expect(run(accepted, ["init", "--yes"], terminal.prompt).code).toBe(0);
    expect(terminal.asked).toHaveLength(0);
    expect(JSON.parse(read(accepted, ".greenline/manifest.json")).targets).toEqual([
      "codex",
      "claude-code",
    ]);
  });

  it("names greenline sync instead of re-asking on an initialized workspace", () => {
    const root = makeRepo();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const again = run(root, ["init", "--json"]);
    expect(again.code).toBe(1);
    expect(again.out).toContain("run 'greenline sync' to reconcile installed files");
    expect(again.out).not.toContain("--guidance");
  });
});

describe("sync", () => {
  it("reports zero diffs on a second run", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    const before = generatedTree(root);
    const result = run(root, ["sync", "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(envelope.ok).toBe(true);
    expect(
      envelope.effects.filter((effect: { kind: string }) => effect.kind !== "unchanged"),
    ).toEqual([]);
    expect(generatedTree(root)).toEqual(before);
  });

  it("recovers a missing lock: warns once, regenerates, and converges", () => {
    const root = makeRepo();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    rmSync(join(root, ".greenline", "lock.json"));

    const recovered = run(root, ["sync", "--json"]);
    expect(recovered.code).toBe(0);
    const envelope = JSON.parse(recovered.out);
    expect(envelope.ok).toBe(true);
    const lockWarnings = envelope.diagnostics.filter(
      (item: { readonly code: string; readonly severity: string }) =>
        item.code === "GL0103" && item.severity === "warning",
    );
    expect(lockWarnings.length).toBe(1);
    expect(lockWarnings[0].message).toContain("rebuilt");
    expect(existsSync(join(root, ".greenline", "lock.json"))).toBe(true);

    const again = run(root, ["sync", "--json"]);
    expect(again.code).toBe(0);
    const second = JSON.parse(again.out);
    expect(second.diagnostics).toEqual([]);
    expect(
      second.effects.filter((effect: { kind: string }) => effect.kind !== "unchanged"),
    ).toEqual([]);
  });

  it("preserves user changes outside the managed block", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeFileSync(join(root, "AGENTS.md"), read(root, "AGENTS.md") + "\n# my note\n");
    const result = run(root, ["sync"]);
    expect(result.code).toBe(0);
    expect(read(root, "AGENTS.md")).toContain("# my note\n");
  });

  it("blocks on a user-modified block with GL0107 and never mutates", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    const tampered = read(root, "AGENTS.md").replace("Installed skills", "HACKED skills");
    writeFileSync(join(root, "AGENTS.md"), tampered);
    const treeBefore = generatedTree(root);
    const result = run(root, ["sync", "--json"]);
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.out);
    expect(envelope.diagnostics.some((d: { code: string }) => d.code === "GL0107")).toBe(true);
    expect(generatedTree(root)).toEqual(treeBefore);
  });

  it("applies --force-managed <path> to a conflict, keeping user bytes", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeFileSync(
      join(root, "AGENTS.md"),
      read(root, "AGENTS.md").replace("Installed skills", "HACKED skills"),
    );
    const result = run(root, ["sync", "--force-managed", "AGENTS.md"]);
    expect(result.code).toBe(0);
    expect(read(root, "AGENTS.md")).toContain("Installed skills");
  });

  it("fails closed on a malformed block (GL0108, broken markers)", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeFileSync(join(root, "AGENTS.md"), "<!-- greenline:managed begin policy -->\nnever ends\n");
    const result = run(root, ["sync", "--json"]);
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.out);
    expect(envelope.diagnostics.some((d: { code: string }) => d.code === "GL0108")).toBe(true);
  });

  it("tells the user to repair broken markers instead of pointing at --force-managed", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeFileSync(join(root, "AGENTS.md"), "<!-- greenline:managed begin policy -->\nnever ends\n");
    const result = run(root, ["sync", "--json"]);
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.out);
    const summary = envelope.diagnostics.find((d: { code: string }) => d.code === "GL0107");
    expect(summary?.message).toContain("cannot be forced");
    expect(summary?.message).toContain("repair the markers or delete the file");
  });

  it("refuses when init gets a --force-managed path the plan does not cover", () => {
    const root = makeRepo();
    const result = run(root, ["init", "--yes", "--json", "--force-managed", "bogus.md"]);
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.out);
    expect(
      envelope.diagnostics.some(
        (d: { code: string; path?: string }) => d.code === "GL0113" && d.path === "bogus.md",
      ),
    ).toBe(true);
  });

  it("refuses to overwrite an unrelated user-owned skill path", () => {
    const root = makeRepo();
    const userSkill = join(root, ".agents", "skills", "grilling", "SKILL.md");
    mkdirSync(join(root, ".agents", "skills", "grilling"), { recursive: true });
    writeFileSync(userSkill, "user skill\n");
    const init = run(root, ["init", "--yes"]);
    expect(init.code).toBe(1);
    expect(init.err).toContain("GL0107");
    expect(read(root, ".agents/skills/grilling/SKILL.md")).toBe("user skill\n");
  });

  it("honors --dry-run: previews the plan without writing", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeFileSync(
      join(root, "AGENTS.md"),
      read(root, "AGENTS.md").replace("Installed skills", "HACKED skills"),
    );
    const result = run(root, ["sync", "--dry-run", "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(envelope.effects.some((effect: { kind: string }) => effect.kind === "conflict")).toBe(
      true,
    );
    expect(read(root, "AGENTS.md")).toContain("HACKED skills");
  });

  it("requires an initialized workspace (GL0101)", () => {
    const root = makeRepo();
    const result = run(root, ["sync"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0101");
  });

  it("requires a valid manifest (GL0102)", () => {
    const root = makeRepo();
    mkdirSync(join(root, ".greenline"), { recursive: true });
    writeFileSync(join(root, ".greenline", "manifest.json"), "not json");
    const result = run(root, ["sync"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0102");
  });
});

describe("orphans", () => {
  const GRILLING_PATHS: readonly string[] = [
    ".agents/skills/grilling/SKILL.md",
    ".agents/skills/grilling/agents/openai.yaml",
    ".claude/skills/grilling/SKILL.md",
  ];

  function writeManifest(root: string, exclude: readonly string[], targets?: readonly string[]) {
    writeFileSync(
      join(root, ".greenline", "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: 6,
          targets: targets ?? ["codex", "claude-code"],
          skills: { exclude },
        },
        null,
        2,
      ) + "\n",
    );
  }

  function orphanPaths(envelope: { effects: readonly { kind: string; path: string }[] }) {
    return envelope.effects
      .filter((effect) => effect.kind === "orphan")
      .map((effect) => effect.path)
      .sort();
  }

  it("reports excluded-skill files as orphans, keeping them on disk and in the lock", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeManifest(root, ["grilling"]);
    const result = run(root, ["sync", "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(orphanPaths(envelope)).toEqual([...GRILLING_PATHS].sort());
    for (const path of GRILLING_PATHS) {
      expect(existsSync(join(root, path))).toBe(true);
    }
    const lock = parseLock(read(root, ".greenline/lock.json"), ".greenline/lock.json");
    expect(lock._tag).toBe("ok");
    if (lock._tag !== "ok") return;
    for (const path of GRILLING_PATHS) {
      expect(lock.value.files.has(path)).toBe(true);
    }
  });

  it("names the flag that removes an orphan in the human summary (QA run 047: the block promised it)", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeManifest(root, ["grilling"]);
    const result = run(root, ["sync"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("orphan");
    expect(result.out).toContain("--force-managed <path>");
  });

  it("keeps reporting the same orphans on a re-run until they are resolved", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeManifest(root, ["grilling"]);
    run(root, ["sync"]);
    const second = run(root, ["sync", "--json"]);
    expect(second.code).toBe(0);
    expect(orphanPaths(JSON.parse(second.out))).toEqual([...GRILLING_PATHS].sort());
  });

  it("doctor warns about orphans with GL0112 without failing the run", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeManifest(root, ["grilling"]);
    run(root, ["sync"]);
    const result = run(root, ["doctor", "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(envelope.ok).toBe(true);
    const warnings = envelope.diagnostics.filter(
      (item: { code: string }) => item.code === "GL0112",
    );
    expect(warnings.map((item: { path: string }) => item.path).sort()).toEqual(
      [...GRILLING_PATHS].sort(),
    );
  });

  it("removes an orphan only when --force-managed names it, and drops it from the lock", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeManifest(root, ["grilling"]);
    run(root, ["sync"]);
    const forced = run(root, [
      "sync",
      ...GRILLING_PATHS.flatMap((path) => ["--force-managed", path]),
    ]);
    expect(forced.code).toBe(0);
    for (const path of GRILLING_PATHS) {
      expect(existsSync(join(root, path))).toBe(false);
    }
    const lock = parseLock(read(root, ".greenline/lock.json"), ".greenline/lock.json");
    expect(lock._tag).toBe("ok");
    if (lock._tag !== "ok") return;
    for (const path of GRILLING_PATHS) {
      expect(lock.value.files.has(path)).toBe(false);
    }
    const clean = run(root, ["sync", "--json"]);
    expect(orphanPaths(JSON.parse(clean.out))).toEqual([]);
  });

  it("updates a re-included skill in place when the corpus moved while excluded", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeManifest(root, ["grilling"]);
    run(root, ["sync"]);
    writeManifest(root, []);
    const movedSkills: readonly SkillSource[] = fixtureSkills.map((skill) =>
      skill.name === "grilling"
        ? { ...skill, body: `${skill.body}The corpus moved while you looked away.\n` }
        : skill,
    );

    const rec = new RecordingWriter();
    const code = runCli(["sync", "--json"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation({ skills: movedSkills }),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(rec.out);
    expect(envelope.effects.some((effect: { kind: string }) => effect.kind === "conflict")).toBe(
      false,
    );
    const moved = movedSkills[1];
    if (moved === undefined) throw new Error("fixture skill missing");
    expect(read(root, ".agents/skills/grilling/SKILL.md")).toBe(renderSkillFile(moved));
  });

  it("strips only the managed block when a block orphan is force-removed", () => {
    // The renderer always emits both policy blocks, so a block-path orphan
    // only arises from version drift: an older lock owns a block path the
    // current projection no longer generates. Simulate that by hand.
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    const legacy = `<!-- greenline:managed begin policy -->\n> legacy policy\n<!-- greenline:managed end policy -->\n# my notes\n`;
    writeFileSync(join(root, "LEGACY.md"), legacy);
    const split = splitManagedBlock(legacy, POLICY_BLOCK_KEY);
    if (split.block === undefined) throw new Error("legacy block did not split");
    const existing = parseLock(read(root, ".greenline/lock.json"), ".greenline/lock.json");
    if (existing._tag !== "ok") throw new Error("lock did not parse");
    const files = new Map(existing.value.files);
    files.set("LEGACY.md", sha256Hex(split.block));
    writeFileSync(
      join(root, ".greenline", "lock.json"),
      serializeLock({ ...existing.value, files }),
    );
    const plain = run(root, ["sync", "--json"]);
    expect(plain.code).toBe(0);
    expect(orphanPaths(JSON.parse(plain.out))).toEqual(["LEGACY.md"]);
    expect(read(root, "LEGACY.md")).toBe(legacy);
    const forced = run(root, ["sync", "--force-managed", "LEGACY.md"]);
    expect(forced.code).toBe(0);
    expect(read(root, "LEGACY.md")).toBe("# my notes\n");
  });
});

describe("doctor", () => {
  it("passes a fresh initialized workspace", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    const result = run(root, ["doctor", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ ok: true, effects: [] });
  });

  it("reports a tampered block as a managed conflict (GL0111)", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    writeFileSync(
      join(root, "AGENTS.md"),
      read(root, "AGENTS.md").replace("Installed skills", "HACKED skills"),
    );
    const result = run(root, ["doctor", "--json"]);
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.out);
    expect(envelope.diagnostics.some((d: { code: string }) => d.code === "GL0111")).toBe(true);
    expect(envelope.ok).toBe(false);
  });

  it("warns when the lock records a different CLI version (GL0110)", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    const lockText = read(root, ".greenline/lock.json").replace(
      `"cliVersion": "${VERSION}"`,
      `"cliVersion": "0.0.9"`,
    );
    writeFileSync(join(root, ".greenline", "lock.json"), lockText);
    const result = run(root, ["doctor", "--json"]);
    expect(result.code).toBe(0);
    expect(
      JSON.parse(result.out).diagnostics.some((d: { code: string }) => d.code === "GL0110"),
    ).toBe(true);
  });
});

describe("lock contract", () => {
  it("writes a lock that parses back with the owned-region hashes", () => {
    const root = makeRepo();
    run(root, ["init", "--yes"]);
    const parsed = parseLock(read(root, ".greenline/lock.json"), ".greenline/lock.json");
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.cliVersion).toBe(VERSION);
    expect(parsed.value.upstreams).toEqual([]);
    expect(parsed.value.files.get("AGENTS.md")).toBe(
      sha256Hex(renderAgentsPolicyBlock(fixtureSkills, [], fixtureInstallation().agentGuide)),
    );
  });
});

describe("init epilogue and the default roster", () => {
  it("prints the getting-started epilogue on fresh init, human mode only", () => {
    const root = makeRepo();
    const rec = new RecordingWriter();
    runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation({ skills: fixtureSkills }),
    });
    expect(rec.out).toContain("Getting started:");
    expect(rec.out).toContain("set this repo up properly");
    const jsonRoot = makeRepo();
    const jsonRec = new RecordingWriter();
    runCli(["init", "--yes", "--json"], jsonRec.writer, VERSION, {
      cwd: jsonRoot,
      version: VERSION,
      installation: fixtureInstallation({ skills: fixtureSkills }),
    });
    expect(jsonRec.out).not.toContain("Getting started:");
  });

  it("installs the whole default roster on an empty repository", () => {
    const root = makeRepo();
    const rec = new RecordingWriter();
    const release = fixtureInstallation({
      skills: [
        ...fixtureSkills,
        {
          name: "ponytail-review",
          description: "Review minimalism.",
          class: "stage",
          activation: "explicit",
          body: "Review.",
        },
      ],
    });
    expect(
      runCli(["init", "--yes"], rec.writer, VERSION, {
        cwd: root,
        version: VERSION,
        installation: release,
      }),
    ).toBe(0);
    expect(existsSync(join(root, ".claude/skills/grilling/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/ponytail-review/SKILL.md"))).toBe(true);
  });

  it("init --profile bogus is a usage error", () => {
    const root = makeRepo();
    const rec = new RecordingWriter();
    const code = runCli(["init", "--yes", "--profile", "bogus"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation({ skills: fixtureSkills }),
    });
    expect(code).toBe(2);
    expect(rec.err).toContain("unknown option");
  });
});

// Refactored from doctor-record: this diagnostic survives deletion of guidance decisions.
it("reports a workflow without a remote and stops reporting it when a remote exists", () => {
  const root = makeRepo();
  execFileSync("git", ["init", "-q"], { cwd: root });
  expect(run(root, ["init", "--yes"]).code).toBe(0);
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(join(root, ".github/workflows/check.yml"), "on: push\n");
  const codes = () =>
    JSON.parse(run(root, ["doctor", "--json"]).out).diagnostics.map(
      (item: { code: string }) => item.code,
    );
  expect(codes().filter((code: string) => code === "GL0121")).toHaveLength(1);
  execFileSync("git", ["remote", "add", "origin", "https://example.com/demo.git"], { cwd: root });
  expect(codes().filter((code: string) => code === "GL0121")).toHaveLength(0);
});
