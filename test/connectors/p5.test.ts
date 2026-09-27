/**
 * Proof P5 of the decoupling plan, the greenline bridge: each case the
 * slice names, run end to end against the synthetic garden executable the
 * connector tests own (`fake-garden.mjs`, started through a launcher outside
 * the repository), through the real command line. Every case checks what
 * the plan's failure table asks of it: nothing delivered or bound that was
 * not validated, a receipt that keeps no body, and the owner's own text left
 * as it was. The last two cases are the search of the tree for a fallback
 * HTTP client and a hidden installation path.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { err } from "../../src/commons/result.ts";
import { AtomicWriteFailed, createNodeFileIo, type FileIo } from "../../src/shell/fs/io.ts";
import {
  ACCOUNT,
  call,
  gardenWorkspace,
  runs,
  stored,
  type GardenWorkspace,
} from "./garden-fixture.ts";
import type { PromptPort } from "../../src/shell/cli/prompt.ts";
import { GARDEN_POINTER, makeRepository, read, removeRepository, run } from "./workspace.ts";

const ENDPOINT = "https://garden.example/";
const A = { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" };
/** The text the synthetic garden's read delivers as a unit body. */
const BODY = "Synthetic text: the unit a contract fixture reads.";
/** The owner's own lines, outside every managed region. */
const OWNER_TEXT = "\n## House rulings\n\n- The owner's own ruling stays.\n";

const workspaces: GardenWorkspace[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.remove();
  for (const root of roots.splice(0)) removeRepository(root);
});

/** A workspace with garden enabled against the synthetic executable, the owner's text added to AGENTS.md. */
function enabled(prefix: string): GardenWorkspace {
  const garden = gardenWorkspace(`p5-${prefix}`);
  workspaces.push(garden);
  writeFileSync(join(garden.root, "AGENTS.md"), read(garden.root, "AGENTS.md") + OWNER_TEXT);
  return garden;
}

/** The request collections a workspace holds, each file's text. */
function receiptFiles(root: string): readonly string[] {
  const directory = join(root, ".greenline/ledger/receipts");
  return existsSync(directory)
    ? readdirSync(directory).map((name) => readFileSync(join(directory, name), "utf8"))
    : [];
}

/** The one request a workspace holds. */
function only(garden: GardenWorkspace) {
  const directory = join(garden.root, ".greenline/ledger/receipts");
  const names = existsSync(directory) ? readdirSync(directory) : [];
  const [name] = names;
  if (name === undefined || names.length !== 1) throw new Error("expected one request");
  return stored(garden, name.slice(0, -".json".length));
}

/** What every case owes after it: no receipt keeps a body, and the owner's text is where it was. */
function evidenceKept(garden: GardenWorkspace): void {
  for (const text of receiptFiles(garden.root)) {
    expect(text).not.toContain(BODY);
    expect(text).not.toContain('"content"');
  }
  expect(read(garden.root, "AGENTS.md").endsWith(OWNER_TEXT)).toBe(true);
}

/** A failed first call: its kind, nothing printed on stdout, nothing delivered, nothing bound. */
async function failsAs(
  garden: GardenWorkspace,
  args: readonly string[],
  mode: string,
  kind: string,
): Promise<string> {
  const result = await call(garden, [...args, "--record", ACCOUNT], { mode });
  expect(result.code).toBe(1);
  expect(result.out).toBe("");
  expect(result.reply.error?.kind).toBe(kind);
  expect(result.reply.result).toBeUndefined();
  const request = only(garden);
  expect(request.binding).toEqual({ state: "unresolved", origin: ENDPOINT });
  expect(request.receipts[0]).toMatchObject({
    outcome: "failed",
    units: [],
    count: null,
    error: { kind },
  });
  evidenceKept(garden);
  return result.reply.error?.input ?? "";
}

describe("P5: the greenline bridge against the synthetic garden executable", () => {
  it("disabled: a fresh install asks nothing about garden at a terminal and installs nothing for it, and status and doctor report it disabled", () => {
    const root = makeRepository("p5-disabled");
    roots.push(root);
    const asked: string[] = [];
    const terminal: PromptPort = {
      choose: (question) => {
        asked.push(question);
        return "both";
      },
      input: (question) => {
        asked.push(question);
        return undefined;
      },
    };
    expect(run(root, ["init"], { prompt: terminal }).code).toBe(0);
    // Init's one question is the harness choice; none names garden or a connector.
    expect(asked).toHaveLength(1);
    expect(asked.join(" ")).not.toMatch(/garden|connector/i);
    expect(existsSync(join(root, ".agents/skills/use-garden"))).toBe(false);
    expect(read(root, "AGENTS.md")).not.toMatch(/garden/i);
    const manifest = JSON.parse(read(root, ".greenline/manifest.json"));
    expect(manifest.connectors).toBeUndefined();
    for (const command of ["status", "doctor"]) {
      const reply = JSON.parse(run(root, [command, "--json"], { environment: {} }).out);
      expect(reply.connectors.map((c: { state: string }) => c.state)).toEqual(["disabled"]);
      expect(reply.diagnostics.filter((d: { code: string }) => d.code === "GL0125")).toEqual([]);
    }
    expect(receiptFiles(root)).toEqual([]);
  });

  it("disabled: a call while garden is disabled is refused before any process starts", async () => {
    const garden = enabled("disabled-call");
    expect(run(garden.root, ["connectors", "disable", "garden"]).code).toBe(0);
    const refused = await call(garden, ["snapshot", "--record", ACCOUNT]);
    expect(refused.code).not.toBe(0);
    expect(refused.reply.error?.input ?? refused.err).toMatch(/not enabled|enable garden/);
    expect(runs(garden)).toEqual([]);
    expect(receiptFiles(garden.root)).toEqual([]);
    evidenceKept(garden);
  });

  it("enabled: enabling installs use-garden and its pointer, a read delivers its body to the caller alone, and its receipt keeps identities and hashes", async () => {
    const garden = enabled("enabled");
    expect(existsSync(join(garden.root, ".agents/skills/use-garden/SKILL.md"))).toBe(true);
    expect(existsSync(join(garden.root, ".claude/skills/use-garden/SKILL.md"))).toBe(true);
    expect(read(garden.root, "AGENTS.md")).toContain(GARDEN_POINTER);
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"], {
      key: "synthetic-key",
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain(BODY);
    const request = only(garden);
    expect(request.source).toBe("garden");
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts[0]).toMatchObject({
      operation: "read",
      outcome: "received",
      units: [
        {
          id: "example-rule",
          coverage: "full",
          revision: "aeac74735d30cbaf048380f01d0166412d106a2c367a6262a50f3fd5ec29c4b2",
          contentHash: "ebfa459986c396971ad885f7964ac08410d12d6fada2a9472f6b2cfc46fb5927",
        },
      ],
    });
    evidenceKept(garden);
    const status = JSON.parse(
      run(garden.root, ["status", "--json"], {
        environment: { GARDEN_API_KEY: "synthetic-key" },
      }).out,
    );
    expect(status.connectors).toEqual([
      expect.objectContaining({ id: "garden", state: "enabled", executable: garden.launcher }),
    ]);
    expect(status.diagnostics.filter((d: { code: string }) => d.code === "GL0125")).toEqual([]);
  });

  it("a missing client: an absent executable is recorded as missing-executable, nothing is installed, and doctor warns without starting anything", async () => {
    const garden = enabled("missing");
    const absent = join(garden.bin, "no-such-garden");
    expect(
      run(garden.root, [
        "connectors",
        "enable",
        "garden",
        "--url",
        ENDPOINT,
        "--executable",
        absent,
      ]).code,
    ).toBe(0);
    expect(await failsAs(garden, ["snapshot"], "fixture", "missing-executable")).toContain(
      "greenline does not install garden",
    );
    expect(existsSync(absent)).toBe(false);
    const doctor = JSON.parse(run(garden.root, ["doctor", "--json"], { environment: {} }).out);
    expect(
      doctor.diagnostics
        .filter((d: { code: string }) => d.code === "GL0125")
        .map((d: { message: string }) => d.message),
    ).toEqual([
      expect.stringContaining("does not exist or cannot run"),
      expect.stringContaining("GARDEN_API_KEY is not set"),
    ]);
    expect(runs(garden)).toEqual([]);
  });

  it("an old client: an older garden that refuses the command line is recorded as its refusal, never a success", async () => {
    const garden = enabled("old-client");
    await failsAs(garden, ["snapshot"], "old-client", "invalid-request");
  });

  it("denied access: garden's unauthorized refusal is recorded as such with nothing delivered, and local work still stands", async () => {
    const garden = enabled("denied");
    await failsAs(garden, ["read", "--id", "example-rule"], "refusal:unauthorized", "unauthorized");
    expect(run(garden.root, ["doctor", "--json"], { environment: {} }).code).toBe(0);
  });

  it("an unavailable service: garden's unavailable refusal, and a call past its one deadline, are recorded as such", async () => {
    const unavailable = enabled("unavailable");
    await failsAs(unavailable, ["snapshot"], "refusal:unavailable", "unavailable");
    const late = enabled("deadline");
    expect(await failsAs(late, ["snapshot", "--timeout-ms", "50"], "hang", "deadline")).toBe(
      "garden did not answer within 50 ms",
    );
  });

  it("policy drift: a request is refused after the repository's policy changed, and a change during a call fails that call", async () => {
    const garden = enabled("policy");
    const opened = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const handle = opened.reply.request ?? "";
    writeFileSync(join(garden.root, ".greenline/DECISIONS.md"), "# Decisions\n\nA new ruling.\n");
    const refused = await call(garden, ["vocabulary", "--request", handle]);
    expect(refused.code).toBe(1);
    expect(refused.reply.error?.input).toContain("policy changed since this request began");
    expect(runs(garden)).toHaveLength(1);
    const during = enabled("policy-during");
    const changed = await call(during, ["snapshot", "--record", ACCOUNT], {
      started: () =>
        writeFileSync(join(during.root, ".greenline/DECISIONS.md"), "# Decisions\n\nChanged.\n"),
    });
    expect(changed.reply.error).toEqual({
      kind: "configuration",
      input: "the repository's policy changed during the call",
    });
    expect(only(during).binding).toEqual({ state: "unresolved", origin: ENDPOINT });
    evidenceKept(garden);
    evidenceKept(during);
  });

  it("snapshot drift: garden answering a later call from another publication fails it, and the request's binding holds", async () => {
    const garden = enabled("drift");
    const opened = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const handle = opened.reply.request ?? "";
    const drifted = await call(garden, ["read", "--request", handle, "--id", "example-rule"], {
      mode: "drift",
    });
    expect(drifted.code).toBe(1);
    expect(drifted.out).toBe("");
    expect(drifted.reply.error).toEqual({
      kind: "protocol",
      input: "publication: the reply reads another publication",
    });
    const request = stored(garden, handle);
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts[1]).toMatchObject({ outcome: "failed", units: [] });
    evidenceKept(garden);
  });

  it("partial output: half a reply is a protocol failure, with nothing delivered or bound", async () => {
    const garden = enabled("partial");
    await failsAs(garden, ["read", "--id", "example-rule"], "partial", "protocol");
  });

  it("partial delivery: a well-formed read that delivers fewer units than it asked for is refused, with nothing delivered or bound", async () => {
    const garden = enabled("partial-delivery");
    const args = ["read", "--id", "example-rule", "--id", "example-prerequisite"];
    // The same two-unit read succeeds in full, so the refusal is the missing unit's alone.
    const whole = enabled("whole-delivery");
    expect((await call(whole, [...args, "--record", ACCOUNT])).code).toBe(0);
    evidenceKept(whole);
    expect(await failsAs(garden, args, "partial-delivery", "protocol")).toBe(
      "call: the read did not deliver a unit it was asked for",
    );
  });

  it("a cancelled process: a call cancelled while garden runs is recorded as cancelled from the bridge's own observation", async () => {
    const garden = enabled("cancelled");
    let during: unknown;
    const result = await call(garden, ["snapshot", "--record", ACCOUNT], {
      mode: "hang",
      started: () => {
        during = only(garden).receipts[0]?.outcome;
      },
      cancel: new AbortController(),
    });
    expect(during).toBe("pending");
    expect(result.code).toBe(1);
    expect(result.reply.error).toEqual({
      kind: "cancelled",
      input: "the call was cancelled before garden answered",
    });
    expect(only(garden).receipts[0]).toMatchObject({
      outcome: "failed",
      units: [],
      error: { kind: "cancelled" },
    });
    evidenceKept(garden);
  });

  it("a cancelled process through the real command line: an interrupt to greenline while garden runs is recorded as cancelled", async () => {
    const garden = enabled("cancelled-cli");
    const entry = join(import.meta.dirname, "../../src/shell/cli/entry.ts");
    // The source entry under Node's type stripping; the bundle's version constant is defined first.
    const version = 'data:text/javascript,globalThis.__GREEN_LINE_VERSION__="0.0.0-test"';
    const child = spawn(
      process.execPath,
      ["--import", version, entry, "connectors", "call", "garden", "snapshot", "--record", ACCOUNT],
      {
        cwd: garden.root,
        env: { PATH: process.env["PATH"] ?? "", GARDEN_FAKE_MODE: "hang" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    // Wait until the pending receipt is on disk: the interrupt handler is set before it is written,
    // and whether garden has started or not, an interrupt from here on cancels the call.
    const receipts = join(garden.root, ".greenline/ledger/receipts");
    const pending = (): boolean =>
      existsSync(receipts) &&
      readdirSync(receipts).some((name) =>
        readFileSync(join(receipts, name), "utf8").includes('"outcome": "pending"'),
      );
    for (let tries = 0; tries < 800 && !pending(); tries += 1)
      await new Promise((resolve) => setTimeout(resolve, 25));
    expect(pending()).toBe(true);
    child.kill("SIGINT");
    const [code] = await once(child, "exit");
    expect(code).toBe(1);
    expect(JSON.parse(stderr.trim().split("\n").at(-1) ?? "").error).toEqual({
      kind: "cancelled",
      input: "the call was cancelled before garden answered",
    });
    expect(only(garden).receipts[0]).toMatchObject({
      outcome: "failed",
      units: [],
      error: { kind: "cancelled" },
    });
    evidenceKept(garden);
  }, 30_000);

  it("a local evidence-write failure: a receipt that cannot be sealed is an evidence failure, prints no result, and leaves the pending intent as it was", async () => {
    const garden = enabled("evidence");
    const real = createNodeFileIo();
    let receiptWrites = 0;
    const failing: FileIo = {
      ...real,
      write: (path, content) => {
        if (path.includes(".greenline/ledger/receipts/")) receiptWrites += 1;
        // The third receipt write is the seal: create, then pending, then settle.
        return receiptWrites === 3
          ? err(new AtomicWriteFailed(path, "write", "disk full"))
          : real.write(path, content);
      },
    };
    const before = read(garden.root, "AGENTS.md");
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"], {
      io: failing,
    });
    expect(result.code).toBe(1);
    expect(result.out).toBe("");
    expect(result.reply.error?.kind).toBe("evidence");
    expect(result.err).not.toContain(BODY);
    expect(only(garden).receipts.map((entry) => entry.outcome)).toEqual(["pending"]);
    expect(read(garden.root, "AGENTS.md")).toBe(before);
    evidenceKept(garden);
  });

  it("malicious arguments: shell text and a flag-shaped value reach garden as one literal argument each, and nothing runs them", async () => {
    const garden = enabled("literal");
    // garden runs from the filesystem root, so a shell would write the marker by its absolute path.
    const marker = join(garden.root, "pwned");
    const anchor = `$(touch ${marker}); --url=https://evil.example/`;
    const result = await call(garden, ["resolve", "--record", ACCOUNT, "--anchor", anchor]);
    expect(result.code).toBe(0);
    const [logged] = runs(garden);
    expect(logged?.argv).toContain(`--anchor=${anchor}`);
    expect((logged?.argv ?? []).filter((arg) => arg.startsWith("--url="))).toEqual([
      `--url=${ENDPOINT}`,
    ]);
    expect(existsSync(marker)).toBe(false);
    evidenceKept(garden);
  });

  it.each([
    ["malicious output, text that is no reply", "garbage", "protocol"],
    ["malicious output, two replies", "two-documents", "protocol"],
    ["malicious output, past the stdout cap", "overflow", "output-cap"],
    ["a schema mismatch, another format version", "format", "protocol"],
    ["a schema mismatch, a field the contract does not hold", "schema", "protocol"],
    ["a process crash", "crash", "process"],
    ["a process ended by a signal", "signal", "process"],
    ["a false zero exit, a refusal with exit 0", "false-zero", "protocol"],
  ])("%s (%s) fails as %s with nothing delivered or bound", async (_case, mode, kind) => {
    const garden = enabled(mode);
    const input = await failsAs(garden, ["snapshot"], mode, kind);
    if (mode === "signal") expect(input).toContain("SIGTERM");
    if (mode === "crash") expect(input).toContain("exited 1");
  });

  it("disabling keeps every receipt and the owner's text, and removes only use-garden and its pointer", async () => {
    const garden = enabled("disable");
    expect((await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"])).code).toBe(
      0,
    );
    const receipts = receiptFiles(garden.root);
    expect(receipts).toHaveLength(1);
    expect(run(garden.root, ["connectors", "disable", "garden"]).code).toBe(0);
    expect(receiptFiles(garden.root)).toEqual(receipts);
    expect(existsSync(join(garden.root, ".agents/skills/use-garden"))).toBe(false);
    expect(existsSync(join(garden.root, ".claude/skills/use-garden"))).toBe(false);
    expect(read(garden.root, "AGENTS.md")).not.toMatch(/use-garden/);
    expect(read(garden.root, "AGENTS.md")).not.toContain(GARDEN_POINTER);
    evidenceKept(garden);
  });
});

/** Every source file of the product, with its text. */
function sources(): readonly (readonly [string, string])[] {
  const root = join(import.meta.dirname, "../../src");
  const found: [string, string][] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|mts|mjs|js)$/.test(entry.name))
        found.push([`src/${path}`, readFileSync(join(root, path), "utf8")]);
    }
  };
  walk("");
  return found;
}

/** The module specifiers a source imports, statically or dynamically. */
function importsOf(text: string): readonly string[] {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map(
    (match) => match[1] ?? "",
  );
}

describe("the search of the tree", () => {
  it("no fallback direct HTTP client: the only network module is the inspector's local server, and the only fetch is its page's own", () => {
    const all = sources();
    expect(all.length).toBeGreaterThan(50);
    const network = z.enum([
      "node:http",
      "node:https",
      "node:http2",
      "node:net",
      "node:tls",
      "node:dns",
      "node:dgram",
      "http",
      "https",
      "http2",
      "net",
      "tls",
      "dns",
      "dgram",
      "undici",
      "node-fetch",
      "axios",
      "ws",
    ]);
    const networkImports = all.flatMap(([path, text]) =>
      importsOf(text)
        .filter((specifier) => network.safeParse(specifier).success)
        .map((specifier) => `${path}: ${specifier}`),
    );
    expect(networkImports).toEqual(["src/shell/inspect/server.ts: node:http"]);
    // The inspector serves on 127.0.0.1 and never requests anything.
    const server = all.find(([path]) => path === "src/shell/inspect/server.ts")?.[1] ?? "";
    expect(server).toContain("createServer");
    expect(server).not.toMatch(/\b(?:request|get)\s*\(\s*["'`]https?:/);
    // Any mention of fetch, aliased or not, and every way to reach a module without a static import.
    const fetching = all
      .filter(([, text]) => /\bfetch\b|XMLHttpRequest|WebSocket|EventSource/.test(text))
      .map(([path]) => path);
    expect(
      all
        .filter(([, text]) =>
          /getBuiltinModule|createRequire|\brequire\s*\(|\bimport\s*\(/.test(text),
        )
        .map(([path]) => path),
    ).toEqual([]);
    // The page's script runs in the owner's browser and asks its own local server for /api/*.
    expect(fetching).toEqual(["src/shell/inspect/page.ts"]);
    const page = all.find(([path]) => path === "src/shell/inspect/page.ts")?.[1] ?? "";
    expect(page.match(/https?:\/\/[^\s"'`]+/g) ?? []).toEqual([]);
  });

  it("no hidden installation path: the only processes the product starts are git, ps and the connector's own planned invocation", () => {
    const all = sources();
    // The module reached by any specifier, and imported only by name, never whole or by default.
    expect(
      all.filter(([, text]) => importsOf(text).includes("child_process")).map(([path]) => path),
    ).toEqual([]);
    expect(
      all
        .filter(([, text]) =>
          /import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*["'](?:node:)?child_process["']/.test(
            text,
          ),
        )
        .map(([path]) => path),
    ).toEqual([]);
    // A re-export would hand the module on under another name; none stands.
    expect(
      all
        .filter(([, text]) => /export\s[^;]*from\s*["'](?:node:)?child_process["']/.test(text))
        .map(([path]) => path),
    ).toEqual([]);
    const spawning = all.filter(([, text]) => importsOf(text).includes("node:child_process"));
    // What each module takes from node:child_process, by name, with no alias to hide a call behind.
    const imported = spawning.flatMap(([path, text]) =>
      [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']node:child_process["']/g)].map(
        (match) => `${path}: ${(match[1] ?? "").replace(/\s+/g, " ").trim()}`,
      ),
    );
    expect(imported).toEqual([
      "src/shell/cli/evidence.ts: execFileSync",
      "src/shell/connectors/process.ts: spawn",
      "src/shell/digests.ts: execFileSync",
      "src/shell/execution-ledger.ts: execFileSync",
      "src/shell/inspect/server.ts: execFileSync, type ExecFileSyncOptionsWithStringEncoding",
      "src/shell/ledger-lock.ts: execFileSync",
    ]);
    const commands = spawning.flatMap(([path, text]) =>
      [
        ...text.matchAll(
          /(?<![.\w$])(execFileSync|execFile|spawnSync|spawn|execSync|exec|fork)\s*\(\s*([^,)]*)/g,
        ),
      ].map((match) => `${path}: ${match[1]}(${(match[2] ?? "").trim()}`),
    );
    // Every call names its program literally: git and ps, or the connector's resolved file.
    for (const line of commands)
      expect(line).toMatch(
        /: execFileSync\("(?:git|ps)"$|^src\/shell\/connectors\/process\.ts: spawn\(file$/,
      );
    expect(commands.filter((line) => line.includes("process.ts"))).toEqual([
      "src/shell/connectors/process.ts: spawn(file",
    ]);
    // The connector runs only the file the manifest names, found on the absolute PATH entries; nothing is fetched, written to a PATH directory or installed.
    for (const [path, text] of all)
      expect([path, /\b(?:npm|npx|pnpm|yarn|curl|wget|brew)\b\s*["'`,]/.test(text)]).toEqual([
        path,
        false,
      ]);
  });
});
