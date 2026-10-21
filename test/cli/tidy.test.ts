import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contractFailure } from "../../src/core/contract.ts";
import { parseArgs } from "../../src/shell/cli/args.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/** `greenline tidy` through the CLI (J-73 S4): its flags, its envelope, its exit codes and its lock. */

const VERSION = "0.1.0";
const installation = fixtureInstallation();
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "tidy-cli-"));
  roots.push(root);
  mkdirSync(join(root, ".git"), { recursive: true });
  const rec = new RecordingWriter();
  if (
    runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation,
    }) !== 0
  )
    throw new Error(`init failed: ${rec.err}`);
  return root;
}

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

const record = (state: string, extra: readonly string[] = []): string =>
  [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "w"',
    `state: ${state}`,
    ...extra,
    "---",
    "",
  ].join("\n");

/** One run of the CLI: its exit code and both streams. */
interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function tidy(root: string, ...args: string[]): Run {
  const rec = new RecordingWriter();
  const code = runCli(["tidy", ...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation,
  });
  return { code, out: rec.out, err: rec.err };
}

describe("J-73 S4 greenline tidy through the CLI", () => {
  it("J-73 S4 tidy is a command with --change and --json, and a --change that is no change id is a usage error", () => {
    const parsed = parseArgs(["tidy", "--change", "2026-10-14-a", "--json"], VERSION);
    expect(parsed).toMatchObject({
      kind: "run",
      request: { command: "tidy", json: true, tidy: { change: "2026-10-14-a" } },
    });
    expect(parseArgs(["tidy"], VERSION)).toMatchObject({
      kind: "run",
      request: { command: "tidy", tidy: { change: undefined } },
    });
    const traversal = parseArgs(["tidy", "--change", "../.."], VERSION);
    expect(traversal.kind).toBe("usage-error");
    expect(traversal.kind === "usage-error" ? traversal.message : "").toContain(
      "'../..' is not a change id",
    );
    const help = parseArgs(["--help"], VERSION);
    expect(help.kind === "help" ? help.text : "").toContain("tidy");
    const root = repository();
    expect(tidy(root, "--change", "../..").code).toBe(2);
  });

  it("J-73 S4 tidy removes a done change's folder, reports it in the text and the envelope, and exits zero", () => {
    const root = repository();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/ledger/2026-10-14-open.md": record("open"),
      ".greenline/tmp/2026-10-14-done/brief-review-1.md": "brief\n",
      ".greenline/tmp/2026-10-14-open/brief-review-1.md": "brief\n",
    });
    const text = tidy(root);
    expect(text.code).toBe(0);
    expect(text.out).toContain("greenline tidy\n");
    expect(text.out).toContain("  removed .greenline/tmp/2026-10-14-done/\n");
    expect(text.out).toContain("  kept .greenline/tmp/2026-10-14-open/: the change is open");
    expect(text.err).toBe("");
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done"))).toBe(false);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-open/brief-review-1.md"))).toBe(true);
    // The writer lock is released and tmp's managed ignore file stays.
    expect(existsSync(join(root, ".greenline/tmp/.write.lock"))).toBe(false);
    expect(existsSync(join(root, ".greenline/tmp/.gitignore"))).toBe(true);

    write(root, { ".greenline/tmp/2026-10-14-done/again.md": "again\n" });
    const json = tidy(root, "--change", "2026-10-14-done", "--json");
    expect(json.code).toBe(0);
    expect(JSON.parse(json.out)).toEqual({
      schemaVersion: 1,
      command: "tidy",
      ok: true,
      effects: [{ kind: "remove", path: ".greenline/tmp/2026-10-14-done" }],
      diagnostics: [],
      tidy: { removed: [".greenline/tmp/2026-10-14-done"], kept: [] },
    });
  });

  it("J-73 S4 a refusal is a GL0470 error naming the folder and why, and exits one with nothing removed", () => {
    const root = repository();
    write(root, {
      ".greenline/ledger/2026-10-14-stopped.md": record("stopped", ['next: "build: carry on"']),
      ".greenline/tmp/2026-10-14-stopped/brief-review-1.md": "brief\n",
    });
    const run = tidy(root, "--change", "2026-10-14-stopped", "--json");
    expect(run.code).toBe(1);
    const envelope = JSON.parse(run.out);
    expect(envelope).toMatchObject({ ok: false, effects: [] });
    expect(envelope.diagnostics).toEqual([
      {
        code: "GL0470",
        severity: "error",
        message:
          "kept .greenline/tmp/2026-10-14-stopped/: the change is stopped, and its working files serve it until it is done or dropped",
        path: ".greenline/tmp/2026-10-14-stopped",
      },
    ]);
    expect(envelope.tidy.kept).toEqual([
      {
        path: ".greenline/tmp/2026-10-14-stopped",
        reason: { kind: "unfinished", state: "stopped" },
        refused: true,
        message:
          "the change is stopped, and its working files serve it until it is done or dropped",
      },
    ]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-stopped/brief-review-1.md"))).toBe(
      true,
    );
  });

  it("J-73 S4 tidy needs a greenline workspace and waits for no other writer", () => {
    const bare = mkdtempSync(join(tmpdir(), "tidy-cli-bare-"));
    roots.push(bare);
    mkdirSync(join(bare, ".git"));
    const outside = tidy(bare, "--json");
    expect(outside.code).toBe(1);
    expect(JSON.parse(outside.out).diagnostics[0].code).toBe("GL0101");

    const root = repository();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/tmp/2026-10-14-done/a.md": "a\n",
      ".greenline/tmp/.write.lock": "4242\n",
    });
    const locked = tidy(root, "--json");
    expect(locked.code).toBe(1);
    expect(JSON.parse(locked.out).diagnostics[0].code).toBe("GL0123");
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/a.md"))).toBe(true);
  });

  it("J-73 S4 a tmp folder that is a link out of the repository is refused before the writer lock, so nothing is written or removed through it", () => {
    const root = repository();
    const outside = mkdtempSync(join(tmpdir(), "tidy-cli-outside-"));
    roots.push(outside);
    write(outside, { "2026-10-14-done/precious.txt": "precious\n" });
    write(root, { ".greenline/ledger/2026-10-14-done.md": record("done") });
    rmSync(join(root, ".greenline/tmp"), { recursive: true, force: true });
    symlinkSync(outside, join(root, ".greenline/tmp"));
    const run = tidy(root, "--json");
    expect(run.code).toBe(1);
    expect(JSON.parse(run.out).diagnostics).toEqual([
      {
        code: "GL0470",
        severity: "error",
        message:
          "kept .greenline/tmp/: it is a link, a mount of another file system, or resolves outside the repository: tidy removes nothing through it",
        path: ".greenline/tmp",
      },
    ]);
    expect(readdirSync(outside)).toEqual(["2026-10-14-done"]);
    expect(existsSync(join(outside, "2026-10-14-done/precious.txt"))).toBe(true);
  });

  it("J-73 S4 with the installation payload unavailable, tidy refuses with GL0140 like every write and removes nothing", () => {
    const root = repository();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/tmp/2026-10-14-done/a.md": "a\n",
    });
    const failure = contractFailure("installation.json", [{ path: "skills", message: "missing" }]);
    if (failure._tag !== "err") throw new Error("a failure was expected");
    const rec = new RecordingWriter();
    const code = runCli(["tidy", "--json"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installationError: failure.error,
    });
    expect(code).toBe(1);
    expect(JSON.parse(rec.out).diagnostics.map((item: { code: string }) => item.code)).toContain(
      "GL0140",
    );
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/a.md"))).toBe(true);
  });

  it("J-73 S4 with nothing to remove, tidy says so and exits zero", () => {
    const root = repository();
    const run = tidy(root);
    expect(run.code).toBe(0);
    expect(run.out).toContain("  nothing to remove\n");
  });
});
