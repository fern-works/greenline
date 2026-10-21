import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The built bundle in throwaway repositories: the consumer path this
 * repository never exercises on itself (ADR 0007). These were the QA
 * end-to-end battery's CLI scenarios; they test the CLI, not an agent, so
 * they live here (the qa-system plan, "What leaves this repository", in git).
 */
const repoRoot = join(import.meta.dirname, "..", "..");
const cli = join(repoRoot, "dist", "bin", "greenline.mjs");

interface Envelope {
  ok: boolean;
  effects: { kind: string; path: string }[];
  diagnostics: { code: string; path?: string }[];
}

function run(cwd: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
// SAFETY: the --json envelope is the product's own output contract (docs/SPEC.md);
// every field read below is asserted against what the CLI actually wrote.
const envelope = (r: { out: string }): Envelope => JSON.parse(r.out) as Envelope;
function freshRepo(root: string, name = "repo"): string {
  const dir = join(root, name);
  mkdirSync(join(dir, ".git"), { recursive: true });
  return dir;
}

describe("the built bundle in a throwaway repository", () => {
  let root = "";
  let repo = "";
  beforeAll(() => {
    if (!existsSync(cli))
      execFileSync("npx", ["--no-install", "tsdown"], { cwd: repoRoot, stdio: "ignore" });
    root = mkdtempSync(join(tmpdir(), "greenline-bundle-"));
    repo = freshRepo(root);
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("init installs both harness trees, the manifest, the lock and the managed block", () => {
    const r = run(repo, "init", "--yes", "--json");
    expect(r.status, r.err).toBe(0);
    expect(envelope(r).ok).toBe(true);
    for (const p of [
      ".greenline/manifest.json",
      ".greenline/lock.json",
      ".agents/skills/router/SKILL.md",
      ".claude/skills/router/SKILL.md",
    ])
      expect(existsSync(join(repo, p)), p).toBe(true);
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain("<!-- greenline:managed begin");
  });

  it("a second sync plans no effects", () => {
    const r = run(repo, "sync", "--dry-run", "--json");
    expect(r.status).toBe(0);
    const e = envelope(r);
    expect(e.ok).toBe(true);
    expect(e.effects).toHaveLength(0);
  });

  it("a user edit to a managed file is refused, preserved, and regenerated only under --force-managed", () => {
    const managed = join(repo, ".agents/skills/router/SKILL.md");
    const tampered = readFileSync(managed, "utf8") + "\nuser edit\n";
    writeFileSync(managed, tampered);
    const r = run(repo, "sync", "--json");
    expect(r.status).toBe(1);
    const e = envelope(r);
    expect(e.ok).toBe(false);
    expect(e.diagnostics.some((d) => d.path === ".agents/skills/router/SKILL.md")).toBe(true);
    expect(readFileSync(managed, "utf8")).toBe(tampered);
    const forced = run(repo, "sync", "--json", "--force-managed", ".agents/skills/router/SKILL.md");
    expect(forced.status).toBe(0);
    expect(envelope(forced).ok).toBe(true);
    expect(readFileSync(managed, "utf8")).not.toContain("user edit");
  });

  it("an excluded skill is reported orphan and left on disk", () => {
    const manifestPath = join(repo, ".greenline/manifest.json");
    // SAFETY: init wrote this manifest one scenario earlier; only skills.exclude is added.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      skills?: { exclude?: string[]; include?: string[] };
    };
    manifest.skills = { ...manifest.skills, exclude: ["boundaries"] };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const r = run(repo, "sync", "--json");
    expect(r.status, r.err).toBe(0);
    const orphans = envelope(r)
      .effects.filter((e) => e.kind === "orphan")
      .map((e) => e.path);
    expect(orphans).toContain(".agents/skills/boundaries/SKILL.md");
    expect(existsSync(join(repo, ".agents/skills/boundaries/SKILL.md"))).toBe(true);
  });

  it("S20 status passes the workspace, and the removed doctor and evidence are unknown commands naming status", () => {
    const r = run(repo, "status", "--json");
    expect(r.status, r.out).toBe(0);
    expect(envelope(r).ok).toBe(true);
    for (const removed of ["doctor", "evidence"]) {
      const refused = run(repo, removed);
      expect(refused.status).toBe(2);
      expect(refused.err).toContain(`unknown command '${removed}'`);
      expect(refused.err).toContain("status");
    }
  });

  it("the default roster installs the engineering methods and keeps assets opt-in", () => {
    const standalone = freshRepo(root, "standalone");
    const r = run(standalone, "init", "--yes", "--json");
    expect(r.status).toBe(0);
    expect(envelope(r).ok).toBe(true);
    expect(existsSync(join(standalone, ".claude/skills/build/SKILL.md"))).toBe(true);
    expect(existsSync(join(standalone, ".claude/skills/domain-and-types/SKILL.md"))).toBe(true);
    expect(existsSync(join(standalone, ".claude/skills/architecture-map"))).toBe(false);
    expect(existsSync(join(standalone, ".claude/skills/stack-standards"))).toBe(false);
    expect(run(standalone, "sync", "--json").status).toBe(0);
  });
});
