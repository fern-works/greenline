/**
 * The hooks as init, sync, check and status meet them (J-93 S3), on real
 * temporary repositories: init proposes the declared checks from the
 * project's files and prints them, writes the git hooks' scripts and
 * registers them, and writes the adapter of each harness present, merged
 * into the owner's own configuration; sync follows a harness that appears
 * and a manifest that turns the adapters off; `check --declare` adds a
 * check; status shows the hooks and the declared checks.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "../../src/commons/result.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation, fixtureSkills } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function repository(files: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-install-"));
  cleanup.push(root);
  execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root: string, args: readonly string[]): Ran {
  const writer = new RecordingWriter();
  const code = runCli([...args], writer.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation({ skills: fixtureSkills }),
  });
  return { code, out: writer.out, err: writer.err };
}

async function check(root: string, args: readonly string[]): Promise<Ran> {
  const writer = new RecordingWriter();
  const code = await runCheckCli(args, writer.writer, {
    cwd: root,
    installation: () => ok(fixtureInstallation()),
    environment: process.env,
    stdio: "ignore",
  });
  return { code, out: writer.out, err: writer.err };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf8");
const gitConfig = (root: string, key: string): string =>
  execFileSync("git", ["config", "--local", "--get", key], { cwd: root, encoding: "utf8" }).trim();

describe("J-93 S3 init installs the hooks and proposes the checks", () => {
  it("proposes the checks from a package.json and prints them, registers the git hooks and writes the adapters of the targets", () => {
    const root = repository({
      "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "oxlint" } }),
      "pnpm-lock.yaml": "lockfileVersion: 9\n",
    });
    const ran = run(root, ["init", "--yes"]);
    expect(ran.code, ran.err).toBe(0);
    expect(JSON.parse(read(root, ".greenline/manifest.json"))).toMatchObject({
      checks: [
        { name: "test", command: "pnpm test", dir: "." },
        { name: "lint", command: "pnpm run lint", dir: "." },
      ],
      hooks: { git: true, adapters: true },
    });
    expect(ran.out).toContain("checks declared: test (pnpm test), lint (pnpm run lint)");
    expect(ran.out).toContain(
      "These checks were read from the project's files, a proposal your agent confirms or corrects in its first change.",
    );
    expect(ran.out).toContain("git hooks: registered as config-based hooks");
    expect(ran.out).toContain("harness adapters: claude-code, codex, dsh");
    expect(ran.out).toContain("Hermes Agent reads hooks from ~/.hermes/config.yaml alone");
    // The scripts are written executable, so an older git runs them and no registration changes a mode.
    expect(statSync(join(root, ".greenline/hooks/pre-commit")).mode & 0o111).not.toBe(0);
    expect(gitConfig(root, "hook.greenline-pre-commit.command")).toBe(
      "sh .greenline/hooks/pre-commit",
    );
    for (const path of [
      ".greenline/hooks/pre-commit",
      ".greenline/hooks/reference-transaction",
      ".claude/settings.json",
      ".codex/hooks.json",
      ".greenline/hooks/dsh.json",
    ])
      expect(existsSync(join(root, path)), path).toBe(true);
    const json = z
      .object({ hooks: z.unknown() })
      .parse(JSON.parse(run(root, ["status", "--json"]).out));
    expect(json.hooks).toMatchObject({
      git: { state: "config" },
      adapters: ["claude-code", "codex", "dsh"],
    });
  });

  it("merges its entries into the owner's own .claude/settings.json and writes the adapter of each harness the repository shows", () => {
    const owner = {
      permissions: { allow: ["Bash(ls)"] },
      hooks: { Stop: [{ hooks: [{ type: "command", command: "./mine.sh" }] }] },
    };
    const root = repository({
      ".claude/settings.json": `${JSON.stringify(owner, null, 2)}\n`,
      ".cursor/rules.md": "rules\n",
      ".opencode/README.md": "x\n",
      ".github/copilot-instructions.md": "x\n",
    });
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const settings = z
      .object({
        permissions: z.unknown(),
        hooks: z.record(
          z.string(),
          z.array(z.object({ hooks: z.array(z.object({ command: z.string() })) })),
        ),
      })
      .parse(JSON.parse(read(root, ".claude/settings.json")));
    expect(settings.permissions).toEqual(owner.permissions);
    expect(settings.hooks["Stop"]?.map((entry) => entry.hooks[0]?.command)).toEqual([
      "./mine.sh",
      "greenline event --harness claude-code",
    ]);
    for (const path of [
      ".cursor/hooks.json",
      ".opencode/plugins/greenline.js",
      ".github/hooks/greenline.json",
    ])
      expect(existsSync(join(root, path)), path).toBe(true);
    expect(existsSync(join(root, ".gemini/settings.json"))).toBe(false);
    const status = run(root, ["status"]);
    expect(status.err).not.toContain("GL0110");
    expect(status.err).not.toContain("GL0111");
  });

  it("proposes nothing in an empty repository, and status says no check is declared, with the two ways", () => {
    const root = repository();
    const ran = run(root, ["init", "--yes"]);
    expect(ran.out).toContain(
      "no checks declared: declare each in the plan with 'greenline check --declare -- <command>', or record a run with 'greenline check -- <command>'",
    );
    expect(ran.out).not.toContain("These checks were read");
    expect(run(root, ["status"]).out).toContain("no checks declared:");
  });
});

describe("J-93 S3 sync follows the harnesses and the manifest's hooks settings", () => {
  it("writes a harness's adapter once its files appear, and registers the hooks again in a clone that lost them", () => {
    const root = repository();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    mkdirSync(join(root, ".gemini"));
    execFileSync("git", ["config", "--local", "--unset", "hook.greenline-pre-push.command"], {
      cwd: root,
    });
    expect(run(root, ["status"]).out).toContain("git hooks: absent:");
    const synced = run(root, ["sync"]);
    expect(synced.code, synced.err).toBe(0);
    expect(synced.out).toContain("harness adapters: claude-code, codex, dsh, gemini");
    expect(synced.out).toContain("git hooks: registered as config-based hooks");
    expect(JSON.parse(read(root, ".gemini/settings.json"))).toHaveProperty("hooks.BeforeTool");
  });

  it("with the adapters and the git hooks off, reports the files as orphans and on --force-managed keeps only the owner's entries", () => {
    const root = repository({
      ".claude/settings.json": `${JSON.stringify({ model: "opus" }, null, 2)}\n`,
    });
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    writeFileSync(
      join(root, ".greenline/manifest.json"),
      read(root, ".greenline/manifest.json").replace(
        '"git": true,\n    "adapters": true',
        '"git": false,\n    "adapters": false',
      ),
    );
    const orphaned = run(root, ["sync", "--json"]);
    const effects = z
      .object({ effects: z.array(z.object({ kind: z.string(), path: z.string() })) })
      .parse(JSON.parse(orphaned.out)).effects;
    expect(effects).toContainEqual({ kind: "orphan", path: ".claude/settings.json" });
    expect(effects).toContainEqual({ kind: "orphan", path: ".greenline/hooks/pre-commit" });
    const registered = spawnSync("git", ["config", "--local", "--get-regexp", "^hook\\."], {
      cwd: root,
      encoding: "utf8",
    });
    expect(registered.stdout).toBe("");
    const forced = run(root, [
      "sync",
      "--force-managed",
      ".claude/settings.json",
      "--force-managed",
      ".codex/hooks.json",
    ]);
    expect(forced.code, forced.err).toBe(0);
    expect(JSON.parse(read(root, ".claude/settings.json"))).toEqual({ model: "opus" });
    expect(existsSync(join(root, ".codex/hooks.json"))).toBe(false);
  });
});

describe("J-93 S3 greenline check --declare", () => {
  it("adds a check to the manifest once, with its name and directory, and status shows it", async () => {
    const root = repository();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const added = await check(root, ["--declare", "--", "cargo", "test"]);
    expect(added.code).toBe(0);
    expect(added.err).toContain("declared 'cargo-test': cargo test");
    const again = await check(root, ["--declare", "--", "cargo", "test"]);
    expect(again.err).toContain("is declared already, as 'cargo-test'");
    const named = await check(root, [
      "--declare",
      "--name",
      "web",
      "--dir",
      "apps/web",
      "--",
      "npm",
      "test",
    ]);
    expect(named.code).toBe(0);
    expect(named.err).toContain(
      "declared 'web': npm test in apps/web; a run of it is recorded with greenline check -- npm test, which runs it in apps/web",
    );
    expect(JSON.parse(read(root, ".greenline/manifest.json")).checks).toEqual([
      { name: "cargo-test", command: "cargo test", dir: "." },
      { name: "web", command: "npm test", dir: "apps/web" },
    ]);
    expect(run(root, ["status"]).out).toContain(
      "checks declared: cargo-test (cargo test), web (npm test in apps/web)",
    );
  });

  it("refuses a declaration with no command, beside a run's options, or with a directory outside, writing nothing", async () => {
    const root = repository();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const before = read(root, ".greenline/manifest.json");
    expect((await check(root, ["--declare"])).code).toBe(2);
    expect((await check(root, ["--declare", "--step", "build", "--", "make"])).code).toBe(2);
    expect((await check(root, ["--declare", "--dir", "../x", "--", "make"])).code).toBe(2);
    expect((await check(root, ["--name", "x", "--", "make"])).code).toBe(2);
    expect(read(root, ".greenline/manifest.json")).toBe(before);
    const bare = repository();
    const missing = await check(bare, ["--declare", "--", "make"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("the manifest cannot be read");
  });
});

describe("J-98 S1 status says when greenline is not on the PATH the hooks run it from", () => {
  /** status with the process environment given, as the CLI passes it. */
  function status(root: string, environment: NodeJS.ProcessEnv): Ran {
    const writer = new RecordingWriter();
    const code = runCli(["status"], writer.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation({ skills: fixtureSkills }),
      environment,
    });
    return { code, out: writer.out, err: writer.err };
  }

  /** A directory holding an executable named greenline, as an install puts one on the PATH. */
  function holding(...parts: string[]): string {
    const directory = join(mkdtempSync(join(tmpdir(), "greenline-path-")), ...parts);
    cleanup.push(directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "greenline"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    return directory;
  }

  const missing =
    "git hooks: registered as config-based hooks, but unable to run: greenline is not on the PATH, so each hook lets git go on without reading a fact, as each harness adapter lets its tool go on; put greenline on the PATH, as npm install --global does";

  it("reports the hooks registered but unable to run, as a nudge with no finding, while greenline is not on the PATH", () => {
    const root = repository();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const bare = status(root, { PATH: "/nowhere" });
    expect(bare.out).toContain(missing);
    expect(bare.code).toBe(0);
    expect(bare.out).not.toMatch(/GL0\d{3}/);
  });

  it("reads the PATH greenline runs under, leaving out a package runner's own bin folders, which git's hooks do not run under", () => {
    const root = repository();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    expect(status(root, { PATH: holding("node_modules", ".bin") }).out).toContain(missing);
    const installed = status(root, { PATH: ["/nowhere", holding("bin")].join(":") });
    expect(installed.out).toContain("git hooks: registered as config-based hooks\n");
    expect(installed.out).not.toContain("unable to run");
  });

  it("says nothing of the PATH where the hooks are off, absent, or the environment is not given", () => {
    const root = repository();
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    expect(run(root, ["status"]).out).not.toContain("unable to run");
    const manifest = JSON.parse(read(root, ".greenline/manifest.json"));
    writeFileSync(
      join(root, ".greenline/manifest.json"),
      JSON.stringify({ ...manifest, hooks: { git: false, adapters: true } }),
    );
    const off = status(root, { PATH: "/nowhere" });
    expect(off.out).toContain("git hooks: off");
    expect(off.out).not.toContain("unable to run");
  });
});
