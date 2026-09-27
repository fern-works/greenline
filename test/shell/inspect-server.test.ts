import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/shell/cli/runner.ts";
import { startInspector, type InspectorHandle } from "../../src/shell/inspect/server.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RECEIPTS_FIXTURE, RECEIPTS_FIXTURE_ID } from "../fixtures/receipts.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/**
 * The inspector (ADR 0028) through its real seam: an HTTP server on
 * 127.0.0.1 over a temp workspace, read with fetch, written with POST.
 */

const VERSION: string = "0.1.0";
const tempDirs: string[] = [];
const handles: InspectorHandle[] = [];

function environment(root: string) {
  return {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  };
}

function makeWorkspace(release = fixtureInstallation()): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-inspect-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  const rec = new RecordingWriter();
  const code = runCli(["init", "--yes"], rec.writer, VERSION, {
    ...environment(dir),
    installation: release,
  });
  if (code !== 0) throw new Error(`init failed in fixture: ${rec.err}`);
  return dir;
}

async function serve(root: string): Promise<string> {
  const handle = await startInspector(root, environment(root), 0);
  handles.push(handle);
  return handle.url;
}

afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("greenline inspect, served", () => {
  it("reports symlinks outside the repository as unavailable while reading retained local files", async () => {
    const root = makeWorkspace();
    const outside = mkdtempSync(join(tmpdir(), "greenline-inspector-symlink-"));
    tempDirs.push(outside);
    writeFileSync(join(outside, "private.md"), "Private symlink witness.");
    const lockPath = join(root, ".greenline/lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.files["retained.md"] = "a".repeat(64);
    lock.files["local-retained.md"] = "b".repeat(64);
    writeFileSync(lockPath, JSON.stringify(lock));
    symlinkSync(join(outside, "private.md"), join(root, "retained.md"));
    writeFileSync(join(root, "local-retained.md"), "Local retained context.");
    const installed = ".agents/skills/grilling/SKILL.md";
    rmSync(join(root, installed));
    symlinkSync(join(outside, "private.md"), join(root, installed));
    const response = await fetch((await serve(root)) + "api/state");
    const body = await response.text();
    expect(body).not.toContain("Private symlink witness.");
    const state = JSON.parse(body);
    expect(state.changes.unavailable).toEqual(expect.arrayContaining(["retained.md", installed]));
    expect(
      state.files.find((file: { path: string }) => file.path === "local-retained.md").content,
    ).toBe("Local retained context.");
  });

  it("refuses an escaping lock path without returning the sibling file", async () => {
    const parent = mkdtempSync(join(tmpdir(), "greenline-inspector-outside-"));
    tempDirs.push(parent);
    const root = join(parent, "repo");
    mkdirSync(join(root, ".git"), { recursive: true });
    const writer = new RecordingWriter();
    expect(runCli(["init", "--yes"], writer.writer, VERSION, environment(root))).toBe(0);
    writeFileSync(join(parent, "outside.md"), "Private sibling witness.");
    const path = join(root, ".greenline/lock.json");
    const lock = JSON.parse(readFileSync(path, "utf8"));
    lock.files["../outside.md"] = "a".repeat(64);
    writeFileSync(path, JSON.stringify(lock));
    const response = await fetch((await serve(root)) + "api/state");
    const body = await response.text();
    expect(body).not.toContain("Private sibling witness.");
    expect(body).toContain("GL0104");
  });

  it("distinguishes an unavailable baseline, uncommitted installation, and edits in either harness", async () => {
    const root = makeWorkspace();
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init", "--quiet");
    const url = await serve(root);
    const read = async () => (await fetch(url + "api/state")).json();
    const initial = await read();
    expect(initial.changes.baseline).toBeNull();
    expect(initial.changes.files).toEqual([]);
    writeFileSync(join(root, "README.md"), "Existing application.\n");
    git("add", "README.md");
    git(
      "-c",
      "user.name=QA",
      "-c",
      "user.email=qa@invalid.local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture application baseline",
    );
    const beforeInstallCommit = await read();
    expect(beforeInstallCommit.changes.baseline).toBe(git("rev-parse", "HEAD"));
    expect(beforeInstallCommit.changes.files.map((file: { path: string }) => file.path)).toContain(
      ".agents/skills/grilling/SKILL.md",
    );
    git("add", "--all");
    git(
      "-c",
      "user.name=QA",
      "-c",
      "user.email=qa@invalid.local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture installed context",
    );
    expect((await read()).changes.files).toEqual([]);
    for (const harness of [".agents", ".claude"]) {
      const path = harness + "/skills/grilling/SKILL.md";
      const original = readFileSync(join(root, path), "utf8");
      writeFileSync(join(root, path), original + "\nA local edit.\n");
      const edited = await read();
      expect(edited.changes.files.map((file: { path: string }) => file.path)).toContain(path);
      expect(edited.files.find((file: { path: string }) => file.path === path).content).toContain(
        "A local edit.",
      );
      writeFileSync(join(root, path), original);
    }
  });

  it("reports an unreadable installed file without presenting it as an empty file or a proven deletion", async () => {
    const root = makeWorkspace();
    execFileSync("git", ["-C", root, "init", "--quiet"]);
    execFileSync("git", ["-C", root, "add", "--all"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=QA",
      "-c",
      "user.email=qa@invalid.local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture installed context",
    ]);
    const path = ".claude/skills/grilling/SKILL.md";
    rmSync(join(root, path));
    mkdirSync(join(root, path));
    const url = await serve(root);
    const state = await (await fetch(url + "api/state")).json();
    expect(state.changes.unavailable).toContain(path);
    expect(state.changes.files.some((file: { path: string }) => file.path === path)).toBe(false);
    expect(state.files.find((file: { path: string }) => file.path === path).content).toBeNull();
  });

  it("validates merged installation settings before writing a malformed manifest", async () => {
    const root = makeWorkspace();
    const url = await serve(root);
    const state = await (await fetch(`${url}api/state`)).json();
    const path = join(root, ".greenline/manifest.json");
    const before = readFileSync(path, "utf8");
    const response = await fetch(`${url}api/manifest`, {
      method: "POST",
      body: JSON.stringify({ expectedRevision: state.editRevision, targets: ["codex", "codex"] }),
    });
    expect(response.status).toBe(400);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("refuses every stale editor and foreign browser origins without changing repository state", async () => {
    const root = makeWorkspace();
    const url = await serve(root);
    const state = await (await fetch(`${url}api/state`)).json();
    const agentsPath = join(root, "AGENTS.md");
    const changed = readFileSync(agentsPath, "utf8") + "\nOperator added this rule.\n";
    writeFileSync(agentsPath, changed);
    for (const [endpoint, fields] of [
      ["manifest", { skills: { exclude: ["grilling"], include: [] } }],
      ["rulings", { body: "- Discard other edits." }],
      ["policy", { body: "# Decisions\n" }],
    ] as const) {
      const response = await fetch(`${url}api/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: state.editRevision, ...fields }),
      });
      expect(response.status).toBe(409);
    }
    expect(readFileSync(agentsPath, "utf8")).toBe(changed);
    const fresh = await (await fetch(`${url}api/state`)).json();
    const foreign = await fetch(`${url}api/rulings`, {
      method: "POST",
      headers: { origin: "https://unrelated.example" },
      body: JSON.stringify({ expectedRevision: fresh.editRevision, body: "- Foreign edit." }),
    });
    expect(foreign.status).toBe(403);
    expect(readFileSync(agentsPath, "utf8")).toBe(changed);
  });

  it("serves the page and one state read carrying the manifest, actual installed context, the decisions, receipts, and checks", async () => {
    const root = makeWorkspace();
    const url = await serve(root);
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Your workspace");
    const state = await (await fetch(`${url}api/state`)).json();
    expect(state.installation).toBe(environment(root).installation.revision);
    expect(state.editRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(state.roots).toEqual([]);
    expect(state.files.map((file: { path: string }) => file.path)).toEqual([
      ".agents/skills/delivery-review/SKILL.md",
      ".agents/skills/delivery-review/agents/openai.yaml",
      ".agents/skills/grilling/SKILL.md",
      ".agents/skills/grilling/agents/openai.yaml",
      ".claude/skills/delivery-review/SKILL.md",
      ".claude/skills/grilling/SKILL.md",
      ".greenline/THIRD_PARTY_NOTICES.md",
      ".greenline/WORK.md",
      ".greenline/ledger/README.md",
      ".greenline/tmp/.gitignore",
      "AGENTS.md",
      "CLAUDE.md",
      "agents/openai.yaml",
    ]);
    expect(state.ledger.receipts).toEqual([]);
    expect(state.receipts).toEqual([]);
    expect(state.receiptProblems).toEqual([]);
    expect(Array.isArray(state.checks)).toBe(true);
  });

  it("shows the collections it can read beside a malformed one, and names that one", async () => {
    const root = makeWorkspace();
    const receipts = join(root, ".greenline/ledger/receipts");
    mkdirSync(receipts, { recursive: true });
    writeFileSync(join(receipts, `${RECEIPTS_FIXTURE_ID}.json`), `${RECEIPTS_FIXTURE}\n`);
    writeFileSync(join(receipts, "22222222-2222-4222-8222-222222222222.json"), "{ not json\n");
    const url = await serve(root);
    const state = await (await fetch(`${url}api/state`)).json();
    expect(state.receipts.map((request: { id: string }) => request.id)).toEqual([
      RECEIPTS_FIXTURE_ID,
    ]);
    expect(state.receiptProblems).toEqual([
      {
        file: ".greenline/ledger/receipts/22222222-2222-4222-8222-222222222222.json",
        message: expect.stringContaining("request evidence"),
      },
    ]);
    const page = await (await fetch(url)).text();
    expect(page).toContain("state.receiptProblems.map");
  });

  it("shows each schema-4 request collection with its source, publication and calls, never a body", async () => {
    const root = makeWorkspace();
    mkdirSync(join(root, ".greenline/ledger/receipts"), { recursive: true });
    writeFileSync(
      join(root, ".greenline/ledger/receipts", `${RECEIPTS_FIXTURE_ID}.json`),
      `${RECEIPTS_FIXTURE}\n`,
    );
    const url = await serve(root);
    const page = await (await fetch(url)).text();
    expect(page).toContain("Consultation receipts");
    expect(page).toContain("function receiptHtml(request)");
    const state = await (await fetch(`${url}api/state`)).json();
    expect(state.receipts).toEqual([
      expect.objectContaining({
        source: "garden",
        binding:
          "publication example-publication-a (published 2026-01-01T00:00:00.000Z), at https://garden.example/",
        calls: [
          expect.objectContaining({ sequence: 1, operation: "snapshot" }),
          expect.objectContaining({
            sequence: 2,
            operation: "resolve",
            metadata: ["example-listed"],
          }),
          expect.objectContaining({
            sequence: 3,
            operation: "read",
            full: [{ id: "example-rule", revision: "b".repeat(64) }],
          }),
        ],
      }),
    ]);
  });

  it("saves choices separately and explicit sync preserves unresolved orphans", async () => {
    const root = makeWorkspace();
    const url = await serve(root);
    const response = await fetch(`${url}api/manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedRevision: (await (await fetch(`${url}api/state`)).json()).editRevision,
        skills: { exclude: ["grilling"], include: [] },
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome.ok).toBe(true);
    const manifest = JSON.parse(readFileSync(join(root, ".greenline/manifest.json"), "utf8"));
    expect(manifest.stack).toBeUndefined();
    expect(manifest.skills.exclude).toEqual(["grilling"]);
    expect(existsSync(join(root, ".agents/skills/grilling/SKILL.md"))).toBe(true);
    const marker = JSON.parse(readFileSync(join(root, ".greenline/policy-changes.json"), "utf8"));
    expect(marker.changes).toEqual([expect.objectContaining({ path: ".greenline/manifest.json" })]);
    expect(
      body.state.files
        .filter((file: { path: string }) => file.path.endsWith("/grilling/SKILL.md"))
        .map((file: { path: string }) => file.path),
    ).toEqual([".agents/skills/grilling/SKILL.md", ".claude/skills/grilling/SKILL.md"]);
    expect(body.state.checks.map((check: { code: string }) => check.code)).toContain("GL0112");
    const synced = await (await fetch(`${url}api/sync`, { method: "POST" })).json();
    expect(synced.outcome.ok).toBe(true);
    expect(existsSync(join(root, ".agents/skills/grilling/SKILL.md"))).toBe(true);
    expect(synced.state.checks.map((item: { code: string }) => item.code)).toContain("GL0112");
    const refused = await fetch(`${url}api/manifest`, {
      method: "POST",
      body: JSON.stringify({ profile: "gold" }),
    });
    expect(refused.status).toBe(400);
  });

  it("writes the House rulings stanza into the user region and leaves the managed block untouched", async () => {
    const root = makeWorkspace();
    const before = readFileSync(join(root, "AGENTS.md"), "utf8");
    const url = await serve(root);
    const response = await fetch(`${url}api/rulings`, {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: (await (await fetch(`${url}api/state`)).json()).editRevision,
        body: "- Errors are thrown, never returned.\n- No default exports.",
      }),
    });
    expect(response.status).toBe(200);
    const after = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(after).toContain(
      "## House rulings\n\n- Errors are thrown, never returned.\n- No default exports.\n",
    );
    const block =
      /<!-- greenline:managed begin policy -->[\s\S]*<!-- greenline:managed end policy -->/;
    expect(block.exec(after)?.[0]).toBe(block.exec(before)?.[0]);
    const state = (await response.json()).state;
    expect(state.houseRulings.rulings).toEqual([
      "Errors are thrown, never returned.",
      "No default exports.",
    ]);
  });
});

it("preserves a saved root decision and its edit evidence when a later sync conflicts", async () => {
  const root = makeWorkspace();
  const url = await serve(root);
  const state = await (await fetch(`${url}api/state`)).json();
  const policy =
    "# Decisions\n```greenline-roots\n" +
    JSON.stringify([
      {
        root: ".",
        purpose: null,
        languages: ["typescript"],
        technologies: ["biome"],
        decision: "#choice",
        exclusions: [],
      },
    ]) +
    "\n```\n";
  const saved = await fetch(`${url}api/policy`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: state.editRevision, body: policy }),
  });
  expect(saved.status).toBe(200);
  const marker = readFileSync(join(root, ".greenline/policy-changes.json"), "utf8");
  expect((await saved.json()).state.policyChanges).toEqual([
    expect.objectContaining({ path: ".greenline/DECISIONS.md" }),
  ]);
  const agents = join(root, "AGENTS.md");
  writeFileSync(
    agents,
    readFileSync(agents, "utf8").replace(
      "<!-- greenline:managed begin policy -->",
      "<!-- greenline:managed begin policy -->\nManual conflict.",
    ),
  );
  const sync = await (await fetch(`${url}api/sync`, { method: "POST" })).json();
  expect(sync.outcome.ok).toBe(false);
  expect(readFileSync(join(root, ".greenline/DECISIONS.md"), "utf8")).toBe(policy);
  expect(readFileSync(join(root, ".greenline/policy-changes.json"), "utf8")).toBe(marker);
});
