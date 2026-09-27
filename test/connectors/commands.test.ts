import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { once } from "node:events";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { GARDEN_PREREQUISITE, GARDEN_SUMMARY } from "../../src/core/connectors/garden.ts";
import { contractFailure } from "../../src/core/contract.ts";
import { splitManagedBlock } from "../../src/core/managed-block.ts";
import { parseLock } from "../../src/core/lock.ts";
import { POLICY_BLOCK_KEY } from "../../src/core/render.ts";
import {
  GARDEN_POINTER,
  GARDEN_SKILL_FILES,
  makeRepository,
  read,
  removeRepository,
  run,
  tree,
} from "./workspace.ts";

const URL = "https://garden.example/";
/** garden's status while this workspace has no entry for it. */
const DISABLED = {
  id: "garden",
  state: "disabled",
  summary: GARDEN_SUMMARY,
  skill: "use-garden",
  prerequisite: GARDEN_PREREQUISITE,
};
/** garden's status while its entry names this endpoint and executable. */
const enabled = (endpoint: string, executable: string) => ({
  ...DISABLED,
  state: "enabled",
  endpoint,
  executable,
});
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) removeRepository(root);
});

/** An initialized workspace with both harness trees and garden disabled. */
function workspace(prefix: string): string {
  const root = makeRepository(prefix);
  roots.push(root);
  expect(run(root, ["init", "--yes"]).code).toBe(0);
  return root;
}

/** The managed block of AGENTS.md. */
function block(root: string): string {
  return splitManagedBlock(read(root, "AGENTS.md"), POLICY_BLOCK_KEY).block ?? "";
}

/** The paths the lock records as owned. */
function owned(root: string): readonly string[] {
  const lock = parseLock(read(root, ".greenline/lock.json"), ".greenline/lock.json");
  if (lock._tag === "err") throw lock.error;
  return [...lock.value.files.keys()];
}

/** A stand-in executable and the marker it leaves when run. */
interface RecordingExecutable {
  readonly path: string;
  readonly marker: string;
}

/** A stand-in garden executable that leaves a marker whenever anything runs it. */
function recordingExecutable(root: string): RecordingExecutable {
  const directory = join(root, ".tools");
  mkdirSync(directory);
  const marker = join(directory, "ran");
  const path = join(directory, "garden");
  writeFileSync(path, `#!/bin/sh\necho ran >> "${marker}"\n`);
  chmodSync(path, 0o755);
  return { path, marker };
}

describe("connectors enable and disable through the write planner", () => {
  it("enable garden writes the entry, installs use-garden and adds its pointer, all through the planner", () => {
    const root = workspace("enable");
    expect(block(root)).not.toContain(GARDEN_POINTER);
    const result = run(root, ["connectors", "enable", "garden", "--url", URL, "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(envelope.command).toBe("connectors enable");
    expect(envelope.ok).toBe(true);
    expect(envelope.connectors).toEqual([enabled(URL, "garden")]);
    const kinds = new Map(
      envelope.effects.map((effect: { kind: string; path: string }) => [effect.path, effect.kind]),
    );
    expect(kinds.get(".greenline/manifest.json")).toBe("update");
    expect(kinds.get("AGENTS.md")).toBe("update");
    for (const path of GARDEN_SKILL_FILES) expect(kinds.get(path)).toBe("create");
    expect(JSON.parse(read(root, ".greenline/manifest.json")).connectors).toEqual({
      garden: { endpoint: URL, executable: "garden" },
    });
    expect(block(root)).toContain(`| ${GARDEN_POINTER} | use-garden |`);
    expect(read(root, "agents/openai.yaml")).toContain(".agents/skills/use-garden");
    for (const path of GARDEN_SKILL_FILES) {
      expect(existsSync(join(root, path))).toBe(true);
      expect(owned(root)).toContain(path);
    }
    // The installed state converges: a sync and a doctor after enabling find nothing to do.
    expect(JSON.parse(run(root, ["sync", "--json"]).out).effects).toEqual([]);
    expect(run(root, ["doctor", "--json"]).code).toBe(0);
  });

  it("disable garden removes the entry, the skill and the pointer, and keeps receipts and user text", () => {
    const root = workspace("disable");
    const agents = `# House notes\n\n${read(root, "AGENTS.md")}\nKeep this line.\n`;
    writeFileSync(join(root, "AGENTS.md"), agents);
    const receipt = ".greenline/ledger/receipts/request-1.json";
    mkdirSync(join(root, ".greenline/ledger/receipts"), { recursive: true });
    writeFileSync(join(root, receipt), '{"a":"completed receipt"}\n');
    const before = tree(root);
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const result = run(root, ["connectors", "disable", "garden", "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(envelope.connectors).toEqual([DISABLED]);
    for (const path of GARDEN_SKILL_FILES)
      expect(envelope.effects).toContainEqual({ kind: "remove", path });
    for (const path of GARDEN_SKILL_FILES) {
      expect(existsSync(join(root, path))).toBe(false);
      expect(owned(root)).not.toContain(path);
    }
    expect(JSON.parse(read(root, ".greenline/manifest.json")).connectors).toBeUndefined();
    expect(block(root)).not.toContain(GARDEN_POINTER);
    expect(read(root, receipt)).toBe('{"a":"completed receipt"}\n');
    // Every file the workspace held before enabling holds the same bytes again.
    const after = tree(root);
    for (const [path, content] of before)
      if (content !== "directory") expect(after.get(path), path).toBe(content);
  });

  it("enable and disable converge: repeating either changes nothing", () => {
    const root = workspace("converge");
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const enabled = tree(root);
    const again = run(root, ["connectors", "enable", "garden", "--url", URL, "--json"]);
    expect(again.code).toBe(0);
    expect(JSON.parse(again.out).effects).toEqual([]);
    expect(tree(root)).toEqual(enabled);
    expect(run(root, ["connectors", "disable", "garden"]).code).toBe(0);
    const disabled = tree(root);
    const twice = run(root, ["connectors", "disable", "garden", "--json"]);
    expect(twice.code).toBe(0);
    expect(JSON.parse(twice.out).effects).toEqual([]);
    expect(tree(root)).toEqual(disabled);
  });

  it("re-enabling with another endpoint and executable replaces the entry", () => {
    const root = workspace("reconfigure");
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const moved = run(root, [
      "connectors",
      "enable",
      "garden",
      "--url",
      "http://127.0.0.1:4100",
      "--executable",
      "/opt/garden/bin/garden",
    ]);
    expect(moved.code).toBe(0);
    expect(JSON.parse(read(root, ".greenline/manifest.json")).connectors).toEqual({
      garden: { endpoint: "http://127.0.0.1:4100/", executable: "/opt/garden/bin/garden" },
    });
  });

  it("a dry run plans enabling and writes nothing", () => {
    const root = workspace("dry-run");
    const before = tree(root);
    const planned = run(root, [
      "connectors",
      "enable",
      "garden",
      "--url",
      URL,
      "--dry-run",
      "--json",
    ]);
    expect(planned.code).toBe(0);
    const envelope = JSON.parse(planned.out);
    for (const path of GARDEN_SKILL_FILES)
      expect(envelope.effects).toContainEqual({ kind: "create", path });
    expect(envelope.connectors).toEqual([DISABLED]);
    expect(tree(root)).toEqual(before);
  });

  it("disable refuses an edited skill file unless --force-managed names it", () => {
    const root = workspace("edited");
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const edited = ".claude/skills/use-garden/SKILL.md";
    writeFileSync(join(root, edited), `${read(root, edited)}My own note.\n`);
    const before = tree(root);
    const refused = run(root, ["connectors", "disable", "garden", "--json"]);
    expect(refused.code).toBe(1);
    const envelope = JSON.parse(refused.out);
    expect(envelope.diagnostics).toContainEqual({
      code: "GL0111",
      severity: "error",
      message: "user-modified file differs from the lock; this change no longer installs it",
      path: edited,
    });
    expect(tree(root)).toEqual(before);
    const forced = run(root, ["connectors", "disable", "garden", "--force-managed", edited]);
    expect(forced.code).toBe(0);
    for (const path of GARDEN_SKILL_FILES) expect(existsSync(join(root, path))).toBe(false);
  });
});

describe("connectors enable refusals", () => {
  it("refuses while skills.exclude names use-garden, writing nothing", () => {
    const root = workspace("exclusion");
    const path = join(root, ".greenline/manifest.json");
    const manifest = JSON.parse(read(root, ".greenline/manifest.json"));
    writeFileSync(
      path,
      `${JSON.stringify({ ...manifest, skills: { exclude: ["use-garden"], include: [] } }, null, 2)}\n`,
    );
    const before = tree(root);
    const refused = run(root, ["connectors", "enable", "garden", "--url", URL, "--json"]);
    expect(refused.code).toBe(1);
    const envelope = JSON.parse(refused.out);
    expect(envelope.diagnostics).toEqual([
      {
        code: "GL0125",
        severity: "error",
        message:
          "garden installs the skill 'use-garden', which skills.exclude names; remove the exclusion to enable garden, or keep it disabled.",
        path: ".greenline/manifest.json",
      },
    ]);
    expect(envelope.connectors).toEqual([DISABLED]);
    expect(tree(root)).toEqual(before);
  });

  it("refuses a URL carrying a credential and an executable that is neither garden nor absolute", () => {
    const root = workspace("configuration");
    const before = tree(root);
    const url =
      "--url must be an HTTPS URL, or HTTP on a loopback address (127.0.0.0/8 or [::1]) for fixtures, without credentials, query parameters or a fragment";
    const executable = "--executable must be garden, or an absolute path to the garden executable";
    for (const [args, message] of [
      [["--url", "https://reader:secret@garden.example/"], url],
      [["--url", "https://garden.example/?key=secret"], url],
      [["--url", URL, "--executable", "bin/garden"], executable],
    ] as const) {
      const refused = run(root, ["connectors", "enable", "garden", ...args, "--json"]);
      expect(refused.code).toBe(1);
      expect(JSON.parse(refused.out).diagnostics).toEqual([
        { code: "GL0125", severity: "error", message },
      ]);
      expect(refused.out).not.toContain("secret");
    }
    expect(tree(root)).toEqual(before);
  });

  it("refuses an unknown connector as a usage error before reading anything", () => {
    const root = workspace("unknown");
    const before = tree(root);
    for (const args of [
      ["connectors", "enable", "gardn", "--url", URL],
      ["connectors", "enable", "./plugin.mjs", "--url", URL],
      ["connectors", "disable", "npm:connector"],
      ["connectors", "status", "plugin"],
    ]) {
      const refused = run(root, args);
      expect(refused.code).toBe(2);
      expect(refused.err).toContain("no plugin is discovered or loaded");
    }
    expect(tree(root)).toEqual(before);
  });

  it("needs a workspace, and a Git repository, before it reads or writes", () => {
    const outside = mkdtempSync(join(tmpdir(), "gl-connectors-outside-"));
    roots.push(outside);
    const notGit = JSON.parse(
      run(outside, ["connectors", "enable", "garden", "--url", URL, "--json"]).out,
    );
    expect(notGit.diagnostics[0].code).toBe("GL0105");
    const bare = makeRepository("uninitialized");
    roots.push(bare);
    const uninitialized = run(bare, ["connectors", "enable", "garden", "--url", URL, "--json"]);
    expect(uninitialized.code).toBe(1);
    expect(JSON.parse(uninitialized.out).diagnostics[0].code).toBe("GL0101");
    expect(existsSync(join(bare, ".greenline"))).toBe(false);
  });

  it("refuses a redirected .greenline/tmp before taking the writer lock", () => {
    const root = workspace("redirected");
    const elsewhere = makeRepository("elsewhere");
    roots.push(elsewhere);
    rmSync(join(root, ".greenline/tmp"), { recursive: true });
    symlinkSync(elsewhere, join(root, ".greenline/tmp"));
    const refused = run(root, ["connectors", "enable", "garden", "--url", URL, "--json"]);
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.out).diagnostics[0].code).toBe("GL0123");
    expect(tree(elsewhere).has(".write.lock")).toBe(false);
    expect(JSON.parse(read(root, ".greenline/manifest.json")).connectors).toBeUndefined();
  });

  it("enable and disable need the installation payload (GL0140) and write nothing without it", () => {
    const root = workspace("payload");
    const before = tree(root);
    const installationError = contractFailure("installation.json", [
      { path: "installation", message: "missing" },
    ]);
    if (installationError._tag !== "err") throw new Error("expected a failure");
    for (const args of [
      ["connectors", "enable", "garden", "--url", URL, "--json"],
      ["connectors", "disable", "garden", "--json"],
    ]) {
      const refused = run(root, args, { installationError: installationError.error });
      expect(refused.code).toBe(1);
      expect(JSON.parse(refused.out).diagnostics[0].code).toBe("GL0140");
    }
    expect(tree(root)).toEqual(before);
  });
});

describe("connectors list and status, offline", () => {
  it("enabling finishes without a key or a live service, states the prerequisite and runs nothing", () => {
    const root = workspace("offline");
    const garden = recordingExecutable(root);
    const human = run(root, [
      "connectors",
      "enable",
      "garden",
      "--url",
      "https://garden.invalid/",
      "--executable",
      garden.path,
    ]);
    expect(human.code).toBe(0);
    expect(human.out).toContain("greenline neither installs nor runs garden");
    expect(human.out).toContain("GARDEN_API_KEY");
    expect(human.out).toContain(`executable: ${garden.path}`);
    for (const args of [
      ["connectors", "list"],
      ["connectors", "status"],
      ["connectors", "status", "garden", "--json"],
    ])
      expect(run(root, args).code).toBe(0);
    expect(existsSync(garden.marker)).toBe(false);
  });

  it("list and status report registered and installed configuration from the manifest alone", () => {
    const root = workspace("report");
    const disabled = JSON.parse(run(root, ["connectors", "list", "--json"]).out);
    expect(disabled.command).toBe("connectors list");
    expect(disabled.effects).toEqual([]);
    expect(disabled.connectors).toEqual([DISABLED]);
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const before = tree(root);
    // Without the installation payload the report still reads the manifest and the registry.
    const installationError = contractFailure("installation.json", [
      { path: "installation", message: "missing" },
    ]);
    if (installationError._tag !== "err") throw new Error("expected a failure");
    const status = run(root, ["connectors", "status", "garden", "--json"], {
      installationError: installationError.error,
    });
    expect(status.code).toBe(0);
    expect(JSON.parse(status.out).connectors).toEqual([enabled(URL, "garden")]);
    const listing = run(root, ["connectors", "list"]);
    expect(listing.out).toContain("garden: enabled");
    expect(tree(root)).toEqual(before);
  });

  it("no connectors operation, and neither status nor doctor, contacts garden's endpoint", async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(`${request.method ?? ""} ${request.url ?? ""}`);
      response.writeHead(503).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = z.object({ port: z.number() }).parse(server.address());
    const endpoint = `http://127.0.0.1:${port}/`;
    try {
      const root = makeRepository("provider");
      roots.push(root);
      expect(run(root, ["init", "--yes"]).code).toBe(0);
      for (const args of [
        ["connectors", "list"],
        ["connectors", "status"],
        ["connectors", "enable", "garden", "--url", endpoint],
        ["connectors", "status", "garden", "--json"],
        ["status"],
        ["doctor", "--json"],
        ["connectors", "disable", "garden"],
      ])
        expect(run(root, args, { environment: { PATH: process.env["PATH"] } }).code).toBe(0);
      // A request of the test's own, made last and awaited, queues behind any the commands started.
      await fetch(`${endpoint}after-the-commands`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(requests).toEqual(["GET /after-the-commands"]);
  });

  it("the connectors group without an operation names the four operations", () => {
    const root = workspace("operation");
    const bare = run(root, ["connectors"]);
    expect(bare.code).toBe(2);
    expect(bare.err).toContain("list, status, enable or disable");
  });

  it("a manifest the registry refuses is reported, never listed as disabled", () => {
    const root = workspace("invalid");
    const path = join(root, ".greenline/manifest.json");
    const manifest = JSON.parse(read(root, ".greenline/manifest.json"));
    writeFileSync(path, JSON.stringify({ ...manifest, connectors: { plugin: {} } }));
    const refused = run(root, ["connectors", "list", "--json"]);
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.out).diagnostics[0]).toEqual(
      expect.objectContaining({ code: "GL0102", path: ".greenline/manifest.json" }),
    );
    expect(JSON.parse(refused.out).connectors).toBeUndefined();
  });
});

describe("status and doctor report the connectors offline", () => {
  /** The GL0125 findings of a doctor or status envelope. */
  const findings = (out: string): readonly { severity: string; message: string }[] =>
    z
      .object({
        diagnostics: z.array(
          z.object({ code: z.string(), severity: z.string(), message: z.string() }),
        ),
      })
      .parse(JSON.parse(out))
      .diagnostics.filter((item) => item.code === "GL0125");

  it("a disabled connector is reported as disabled, raises nothing and explains how it is enabled", () => {
    const root = workspace("readiness-disabled");
    const doctor = run(root, ["doctor", "--json"], { environment: {} });
    expect(doctor.code).toBe(0);
    expect(JSON.parse(doctor.out).connectors).toEqual([DISABLED]);
    expect(findings(doctor.out)).toEqual([]);
    const status = run(root, ["status"], { environment: {} });
    expect(status.code).toBe(0);
    expect(status.out).toContain(
      "garden: disabled; nothing is consulted and no process starts ('greenline connectors enable garden --url URL' enables it)",
    );
    expect(JSON.parse(run(root, ["status", "--json"]).out).connectors).toEqual([DISABLED]);
  });

  it("an enabled connector whose executable runs here and whose key is set raises nothing, and nothing is started", () => {
    const root = workspace("readiness-ready");
    const garden = recordingExecutable(root);
    expect(
      run(root, ["connectors", "enable", "garden", "--url", URL, "--executable", garden.path]).code,
    ).toBe(0);
    const environment = { GARDEN_API_KEY: "a-key-value-that-is-never-printed" };
    for (const command of ["doctor", "status"]) {
      const json = run(root, [command, "--json"], { environment });
      expect(json.code).toBe(0);
      expect(JSON.parse(json.out).connectors).toEqual([enabled(URL, garden.path)]);
      expect(findings(json.out)).toEqual([]);
      const human = run(root, [command], { environment });
      expect(human.out).toContain(`    executable: ${garden.path} (runs ${garden.path})\n`);
      expect(human.out).toContain("    key: GARDEN_API_KEY set\n");
      expect(human.out + human.err + json.out).not.toContain("a-key-value-that-is-never-printed");
    }
    expect(existsSync(garden.marker)).toBe(false);
  });

  it("an enabled connector with no executable on the PATH and no key raises two warnings that say what to do", () => {
    const root = workspace("readiness-missing");
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const empty = mkdtempSync(join(tmpdir(), "gl-empty-path-"));
    roots.push(empty);
    const doctor = run(root, ["doctor", "--json"], { environment: { PATH: empty } });
    // Warnings: the workspace stays valid, and the verdict is not an error.
    expect(doctor.code).toBe(0);
    expect(findings(doctor.out)).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("its executable 'garden' is not on the PATH"),
      }),
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("GARDEN_API_KEY is not set in this environment"),
      }),
    ]);
    const human = run(root, ["doctor"], { environment: { PATH: empty } });
    expect(human.out).toContain("    executable: garden (not found)\n");
    expect(human.out).toContain("    key: GARDEN_API_KEY not set\n");
    expect(human.err).toContain("WARNING GL0125");
  });

  it("a refused execution ledger does not hide the connectors from doctor or status", () => {
    const root = workspace("readiness-ledger");
    mkdirSync(join(root, ".greenline/ledger/receipts"), { recursive: true });
    writeFileSync(join(root, ".greenline/ledger/receipts/not-a-request.json"), "{ not json\n");
    for (const command of ["doctor", "status"]) {
      const json = run(root, [command, "--json"], { environment: {} });
      expect(json.code).toBe(1);
      expect(JSON.parse(json.out).connectors).toEqual([DISABLED]);
      expect(run(root, [command], { environment: {} }).out).toContain("  garden: disabled;");
    }
  });

  it("the bare command resolves on an absolute PATH entry, as a call would run it", () => {
    const root = workspace("readiness-path");
    const garden = recordingExecutable(root);
    expect(run(root, ["connectors", "enable", "garden", "--url", URL]).code).toBe(0);
    const environment = { PATH: join(root, ".tools"), GARDEN_API_KEY: "set" };
    const human = run(root, ["status"], { environment });
    expect(human.out).toContain(`    executable: garden (runs ${garden.path})\n`);
    expect(findings(run(root, ["doctor", "--json"], { environment }).out)).toEqual([]);
    // A relative PATH entry is never searched, so a repository cannot plant the command.
    const relative = run(root, ["doctor", "--json"], {
      environment: { PATH: ".tools", GARDEN_API_KEY: "set" },
    });
    expect(findings(relative.out)).toEqual([
      expect.objectContaining({ message: expect.stringContaining("is not on the PATH") }),
    ]);
    expect(existsSync(garden.marker)).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "an executable absolute only on another platform is reported as one this platform will not run",
    () => {
      const root = workspace("readiness-platform");
      expect(
        run(root, ["connectors", "enable", "garden", "--url", URL, "--executable", "D:/garden"])
          .code,
      ).toBe(0);
      const doctor = run(root, ["doctor", "--json"], { environment: { GARDEN_API_KEY: "set" } });
      expect(doctor.code).toBe(0);
      expect(findings(doctor.out)).toEqual([
        expect.objectContaining({
          severity: "warning",
          message: expect.stringContaining("not an absolute path on this platform"),
        }),
      ]);
      expect(run(root, ["status"], { environment: {} }).out).toContain(
        "    executable: D:/garden (not an absolute path on this platform)\n",
      );
    },
  );
});
