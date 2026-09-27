import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeArtifactLedger } from "../helpers/ledger.ts";

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
  view?: { initiatives: { id: string; ticketsComplete: number; ticketsTotal: number }[] };
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
      ".agents/skills/project-router/SKILL.md",
      ".claude/skills/project-router/SKILL.md",
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
    const managed = join(repo, ".agents/skills/project-router/SKILL.md");
    const tampered = readFileSync(managed, "utf8") + "\nuser edit\n";
    writeFileSync(managed, tampered);
    const r = run(repo, "sync", "--json");
    expect(r.status).toBe(1);
    const e = envelope(r);
    expect(e.ok).toBe(false);
    expect(e.diagnostics.some((d) => d.path === ".agents/skills/project-router/SKILL.md")).toBe(
      true,
    );
    expect(readFileSync(managed, "utf8")).toBe(tampered);
    const forced = run(
      repo,
      "sync",
      "--json",
      "--force-managed",
      ".agents/skills/project-router/SKILL.md",
    );
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
    manifest.skills = { ...manifest.skills, exclude: ["prototype"] };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const r = run(repo, "sync", "--json");
    expect(r.status, r.err).toBe(0);
    const orphans = envelope(r)
      .effects.filter((e) => e.kind === "orphan")
      .map((e) => e.path);
    expect(orphans).toContain(".agents/skills/prototype/SKILL.md");
    expect(existsSync(join(repo, ".agents/skills/prototype/SKILL.md"))).toBe(true);
  });

  it("status counts an initiative's tickets from the artifacts", () => {
    const work = join(repo, ".greenline/work/001-demo");
    mkdirSync(work, { recursive: true });
    mkdirSync(join(repo, ".greenline/work/tickets"), { recursive: true });
    mkdirSync(join(repo, ".greenline/work/reviews"), { recursive: true });
    writeFileSync(
      join(work, "initiative.md"),
      "---\nid: INIT-001\ntype: initiative\nstatus: executing\nrevision: 1\ntickets: [TKT-001, TKT-002]\n---\n\n# Initiative 001: demo\n",
    );
    writeFileSync(
      join(repo, ".greenline/work/tickets/TKT-001.md"),
      "---\nid: TKT-001\ntype: ticket\nintent: fixture-one\nscope: [src]\nstatus: complete\nrevision: 1\nclaimed_by: null\nresult_commit: a1b2c3d\nacceptance:\n  - [x] green\n---\n\n## TKT-001\n",
    );
    writeFileSync(
      join(repo, ".greenline/work/tickets/TKT-002.md"),
      "---\nid: TKT-002\ntype: ticket\nintent: fixture-two\nscope: [src]\nstatus: ready\nrevision: 1\nacceptance:\n  - [ ] green\n---\n\n## TKT-002\n",
    );
    // A complete ticket carries its accounting and its review under the
    // current contract; without them status and doctor refuse.
    writeArtifactLedger(repo, "tickets/TKT-001.md", "implementation");
    writeArtifactLedger(repo, "tickets/TKT-001.md", "verification");
    writeFileSync(
      join(repo, ".greenline/work/reviews/REV-001.md"),
      "---\nid: REV-001\ntype: review\nstatus: complete\nrevision: 1\nticket: TKT-001\nimplementation_account: fixture-tkt-001-implementation\nrange: 0000000..a1b2c3d\n---\nSynthetic accounting fixture; no live agent review claimed.\n",
    );
    writeArtifactLedger(repo, "reviews/REV-001.md", "review");
    const r = run(repo, "status", "--json");
    expect(r.status, r.out).toBe(0);
    const init = envelope(r).view?.initiatives.find((v) => v.id === "INIT-001");
    expect(init?.ticketsComplete).toBe(1);
    expect(init?.ticketsTotal).toBe(2);
  });

  it("doctor passes a workspace whose completed ticket carries its accounting and review", () => {
    const r = run(repo, "doctor", "--json");
    expect(r.status, r.out).toBe(0);
    expect(envelope(r).ok).toBe(true);
  });

  it("the default roster installs the engineering methods and keeps assets opt-in", () => {
    const standalone = freshRepo(root, "standalone");
    const r = run(standalone, "init", "--yes", "--json");
    expect(r.status).toBe(0);
    expect(envelope(r).ok).toBe(true);
    expect(existsSync(join(standalone, ".claude/skills/implement/SKILL.md"))).toBe(true);
    expect(existsSync(join(standalone, ".claude/skills/model-the-domain/SKILL.md"))).toBe(true);
    expect(existsSync(join(standalone, ".claude/skills/architecture-map"))).toBe(false);
    expect(existsSync(join(standalone, ".claude/skills/stack-standards"))).toBe(false);
    expect(run(standalone, "sync", "--json").status).toBe(0);
  });
});
