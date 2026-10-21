import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ok } from "../../src/commons/result.ts";
import { ContractParseFailed } from "../../src/core/contract.ts";
import { parseFacts, type CheckFacts } from "../../src/core/facts.ts";
import { runCheckCli, type CheckEnvironment } from "../../src/shell/cli/check.ts";
import { workingTreeId } from "../../src/shell/code-tree.ts";
import { listFilesRecursive } from "../../src/shell/fs/walk.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const installation = fixtureInstallation();
const node = process.execPath;
const cleanup: string[] = [];

interface Workspace {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  /** Where the command's output went: the terminal, in the CLI. */
  readonly terminal: string;
}

function record(state: string, extra: readonly string[] = []): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "w"',
    `state: ${state}`,
    ...extra,
    "---",
    "",
  ].join("\n");
}

function workspace(
  records: Readonly<Record<string, string>> = { "2026-10-04-fix": record("open") },
): Workspace {
  const root = mkdtempSync(join(tmpdir(), "check-"));
  const outside = mkdtempSync(join(tmpdir(), "check-terminal-"));
  cleanup.push(root, outside);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  writeFileSync(join(root, "a.txt"), "a\n");
  git("add", "a.txt");
  git("commit", "--quiet", "-m", "one");
  mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
  writeFileSync(join(root, ".greenline", "ledger", "README.md"), "# The ledger\n");
  for (const [id, text] of Object.entries(records))
    writeFileSync(join(root, ".greenline", "ledger", `${id}.md`), text);
  return { root, git, terminal: join(outside, "terminal.log") };
}

async function check(
  space: Workspace,
  argv: readonly string[],
  overrides: Partial<CheckEnvironment> = {},
): Promise<{ readonly code: number; readonly err: string; readonly out: string }> {
  const writer = new RecordingWriter();
  const terminal = openSync(space.terminal, "a");
  try {
    const code = await runCheckCli(argv, writer.writer, {
      cwd: space.root,
      installation: () => ok(installation),
      environment: process.env,
      stdio: ["ignore", terminal, terminal],
      ...overrides,
    });
    return { code, err: writer.err, out: writer.out };
  } finally {
    closeSync(terminal);
  }
}

function factsOf(root: string, change: string): readonly CheckFacts[] {
  const folder = join(root, ".greenline", "ledger", change, "checks");
  return readdirSync(folder)
    .sort()
    .map((name) => {
      const parsed = parseFacts(readFileSync(join(folder, name), "utf8"), name);
      if (parsed._tag === "err") throw parsed.error;
      return parsed.value;
    });
}

/** A command that leaves a mark at the repository root when it runs. */
const marking = ["--", node, "-e", "require('fs').writeFileSync('ran', '')"];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("greenline check runs the command", () => {
  it("S4 check runs the command, exits with its code and writes its facts, started and finished", async () => {
    const space = workspace();
    const argv = ["--step", "verify", "--", node, "-e", "process.exit(3)"];
    const result = await check(space, argv);
    expect(result.code).toBe(3);
    const [facts, ...more] = factsOf(space.root, "2026-10-04-fix");
    expect(more).toEqual([]);
    const tree = workingTreeId(space.root);
    expect(facts).toEqual({
      schemaVersion: 1,
      state: "finished",
      arguments: [node, "-e", "process.exit(3)"],
      step: "verify",
      startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      commit: space.git("rev-parse", "HEAD"),
      tree: tree.kind === "tree" ? tree.id : "unknown",
      installation: installation.revision,
      outcome: { kind: "exited", code: 3 },
      durationMs: expect.any(Number),
    });
    expect(result.err).toMatch(
      /^greenline check: exit 3; facts in \.greenline\/ledger\/2026-10-04-fix\/checks\/\d{8}T\d{9}Z-[0-9a-f]{6}\.json\n$/,
    );
  });

  it("S4 a secret the command prints reaches the terminal and no file under .greenline", async () => {
    const space = workspace();
    const script =
      "const t = ['sec', 'ret-', '7f3a91'].join(''); console.log(t); console.error(t);";
    expect((await check(space, ["--", node, "-e", script])).code).toBe(0);
    expect(readFileSync(space.terminal, "utf8")).toBe("secret-7f3a91\nsecret-7f3a91\n");
    const greenline = join(space.root, ".greenline");
    const files = listFilesRecursive(greenline);
    expect(files.some((file) => file.includes("checks/"))).toBe(true);
    for (const file of files)
      expect([file, readFileSync(join(greenline, file), "utf8").includes("secret-7f3a91")]).toEqual(
        [file, false],
      );
  });

  it("S4 two runs never share a facts file", async () => {
    const space = workspace();
    await check(space, ["--", node, "-e", ""]);
    await check(space, ["--", node, "-e", ""]);
    expect(factsOf(space.root, "2026-10-04-fix")).toHaveLength(2);
  });

  it("S4 --change defaults to the only open change, whatever the others' states", async () => {
    const space = workspace({
      "2026-10-01-old": record("done"),
      "2026-10-02-paused": record("stopped", ['next: "build: resume"']),
      "2026-10-04-fix": record("open"),
    });
    expect((await check(space, ["--", node, "-e", ""])).code).toBe(0);
    expect(factsOf(space.root, "2026-10-04-fix")).toHaveLength(1);
    expect(existsSync(join(space.root, ".greenline", "ledger", "2026-10-01-old"))).toBe(false);
  });

  it("S4 --change names any change, a finished one included", async () => {
    const space = workspace({ "2026-10-01-old": record("done"), "2026-10-04-fix": record("open") });
    expect((await check(space, ["--change", "2026-10-01-old", "--", node, "-e", ""])).code).toBe(0);
    expect(factsOf(space.root, "2026-10-01-old")).toHaveLength(1);
  });

  it("S4 a command given with a path runs from the repository root, wherever check is called", async () => {
    const space = workspace();
    mkdirSync(join(space.root, "scripts"));
    mkdirSync(join(space.root, "deep", "inside"), { recursive: true });
    writeFileSync(join(space.root, "scripts", "where.sh"), "#!/bin/sh\npwd > where.txt\n");
    chmodSync(join(space.root, "scripts", "where.sh"), 0o755);
    const result = await check(space, ["--", "scripts/where.sh"], {
      cwd: join(space.root, "deep", "inside"),
    });
    expect(result.code).toBe(0);
    expect(readFileSync(join(space.root, "where.txt"), "utf8").trim()).toBe(
      execFileSync("pwd", { cwd: space.root, encoding: "utf8" }).trim(),
    );
    expect(factsOf(space.root, "2026-10-04-fix")[0]?.arguments).toEqual(["scripts/where.sh"]);
  });

  it("S4 a command ended by a signal exits as a shell would, and its facts name the signal", async () => {
    const space = workspace();
    const result = await check(space, ["--", node, "-e", "process.kill(process.pid, 'SIGTERM')"]);
    expect(result.code).toBe(143);
    expect(factsOf(space.root, "2026-10-04-fix")[0]).toMatchObject({
      state: "finished",
      outcome: { kind: "signalled", signal: "SIGTERM" },
    });
  });

  it("S4 a termination sent to greenline is passed on to the command, and the facts are still completed", async () => {
    const space = workspace();
    const terminated = new AbortController();
    terminated.abort();
    const result = await check(space, ["--", node, "-e", "setInterval(() => {}, 1000)"], {
      terminate: terminated.signal,
    });
    expect(result.code).toBe(143);
    expect(factsOf(space.root, "2026-10-04-fix")[0]).toMatchObject({
      state: "finished",
      outcome: { kind: "signalled", signal: "SIGTERM" },
    });
  });

  it("S4 a Ctrl-C that reaches greenline before the command starts stops the run, nothing run and no facts", async () => {
    const space = workspace();
    const interrupted = new AbortController();
    interrupted.abort();
    const result = await check(space, marking, { interrupted: interrupted.signal });
    expect(result).toEqual({
      code: 130,
      err: "greenline check: interrupted before the command started; nothing ran\n",
      out: "",
    });
    expect(existsSync(join(space.root, "ran"))).toBe(false);
    expect(existsSync(join(space.root, ".greenline", "ledger", "2026-10-04-fix"))).toBe(false);
  });

  it("S4 help needs no installation and runs nothing", async () => {
    const space = workspace();
    const result = await check(space, ["--help", ...marking], {
      installation: () => {
        throw new Error("help read the installation");
      },
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "Usage: greenline check [--change <id>] [--step <step> [--round <n>]] -- <command>",
    );
    expect(existsSync(join(space.root, "ran"))).toBe(false);
  });

  it("J-84 S1 a merged-result check run after the merge's commit names the merge, and one run on the staged merge names the commit before it", async () => {
    const space = workspace();
    const base = space.git("rev-parse", "--abbrev-ref", "HEAD");
    space.git("checkout", "--quiet", "-b", "feature");
    writeFileSync(join(space.root, "b.txt"), "b\n");
    space.git("add", "b.txt");
    space.git("commit", "--quiet", "-m", "the change");
    space.git("checkout", "--quiet", base);
    writeFileSync(join(space.root, "c.txt"), "c\n");
    space.git("add", "c.txt");
    space.git("commit", "--quiet", "-m", "the base moved");
    const before = space.git("rev-parse", "HEAD");
    const merged = ["--step", "close", "--", node, "-e", ""];

    space.git("merge", "--quiet", "--no-ff", "--no-commit", "feature");
    expect((await check(space, merged)).code).toBe(0);
    space.git("commit", "--quiet", "--no-edit");
    const merge = space.git("rev-parse", "HEAD");
    expect((await check(space, merged)).code).toBe(0);

    const [staged, committed] = factsOf(space.root, "2026-10-04-fix");
    expect(staged).toMatchObject({ commit: before });
    expect(committed).toMatchObject({ commit: merge, tree: staged?.tree });
    expect(space.git("rev-list", "--parents", "-n", "1", merge).split(" ")).toHaveLength(3);
  });
});

describe("greenline check runs a declared check in the directory it is declared in", () => {
  /** A workspace whose manifest declares the checks given, with a probe script in each directory that marks where it ran. */
  function declaring(
    checks: readonly { readonly name: string; readonly dir: string }[],
  ): Workspace {
    const space = workspace();
    writeFileSync(
      join(space.root, ".greenline", "manifest.json"),
      JSON.stringify({
        schemaVersion: 6,
        targets: ["claude-code"],
        checks: checks.map((entry) => ({ ...entry, command: `${node} probe.js` })),
      }),
    );
    for (const dir of [".", ...checks.map((entry) => entry.dir)]) {
      mkdirSync(join(space.root, dir), { recursive: true });
      writeFileSync(join(space.root, dir, "probe.js"), "require('fs').writeFileSync('ran', '')\n");
    }
    return space;
  }

  it("J-98 S1 runs a command a check declared in a directory matches there, and its facts name the check and the directory", async () => {
    const space = declaring([{ name: "web", dir: "apps/web" }]);
    const result = await check(space, ["--", node, "probe.js"]);
    expect(result.code).toBe(0);
    expect(existsSync(join(space.root, "apps", "web", "ran"))).toBe(true);
    expect(existsSync(join(space.root, "ran"))).toBe(false);
    const [facts] = factsOf(space.root, "2026-10-04-fix");
    expect(facts).toMatchObject({ arguments: [node, "probe.js"], check: "web", dir: "apps/web" });
    expect(result.err).toContain("greenline check: exit 0; facts in");
    expect(result.err).toContain("the declared check 'web', run in apps/web");
  });

  it("J-98 S1 runs a command no declaration matches at the root, its facts naming no check", async () => {
    const space = declaring([{ name: "web", dir: "apps/web" }]);
    const result = await check(space, ["--", node, "-e", "require('fs').writeFileSync('ran', '')"]);
    expect(result.code).toBe(0);
    expect(existsSync(join(space.root, "ran"))).toBe(true);
    const [facts] = factsOf(space.root, "2026-10-04-fix");
    expect(facts).not.toHaveProperty("check");
    expect(facts).not.toHaveProperty("dir");
  });

  it("J-98 S1 takes the check declared where check is started when several directories declare the command, and refuses to guess from elsewhere", async () => {
    const space = declaring([
      { name: "web", dir: "apps/web" },
      { name: "api", dir: "apps/api" },
    ]);
    const refused = await check(space, ["--", node, "probe.js"]);
    expect(refused.code).toBe(2);
    expect(refused.err).toBe(
      `greenline check: '${node} probe.js' is declared as 'web' in apps/web and 'api' in apps/api; run greenline check from the directory of the one this run is, which runs it there\n`,
    );
    expect(existsSync(join(space.root, ".greenline", "ledger", "2026-10-04-fix", "checks"))).toBe(
      false,
    );
    const api = await check(space, ["--", node, "probe.js"], {
      cwd: join(space.root, "apps", "api"),
    });
    expect(api.code).toBe(0);
    expect(existsSync(join(space.root, "apps", "api", "ran"))).toBe(true);
    expect(existsSync(join(space.root, "apps", "web", "ran"))).toBe(false);
    expect(factsOf(space.root, "2026-10-04-fix")[0]).toMatchObject({
      check: "api",
      dir: "apps/api",
    });
  });

  it("J-98 S1 refuses a declared check whose directory does not stand, running nothing", async () => {
    const space = workspace();
    writeFileSync(
      join(space.root, ".greenline", "manifest.json"),
      JSON.stringify({
        schemaVersion: 6,
        targets: ["claude-code"],
        checks: [{ name: "web", command: `${node} probe.js`, dir: "apps/web" }],
      }),
    );
    const result = await check(space, ["--", node, "probe.js"]);
    expect(result.code).toBe(2);
    expect(result.err).toBe(
      "greenline check: the declared check 'web' runs in apps/web, which is no directory of the repository; correct the declaration in .greenline/manifest.json\n",
    );
  });
});

describe("greenline check refuses, runs nothing and writes no facts", () => {
  async function refusedWith(
    space: Workspace,
    argv: readonly string[],
    message: string,
    overrides: Partial<CheckEnvironment> = {},
  ): Promise<void> {
    const result = await check(space, argv, overrides);
    expect(result).toEqual({ code: 2, err: `greenline check: ${message}\n`, out: "" });
    expect(existsSync(join(space.root, "ran"))).toBe(false);
    expect(
      readdirSync(join(space.root, ".greenline", "ledger")).filter((name) => !name.endsWith(".md")),
    ).toEqual([]);
  }

  it("S4 refuses several open changes and no --change", async () => {
    const space = workspace({ "2026-10-03-a": record("open"), "2026-10-04-b": record("open") });
    await refusedWith(
      space,
      marking,
      "several changes are open (2026-10-03-a, 2026-10-04-b); name one with --change",
    );
  });

  it("S4 refuses a change with no record", async () => {
    await refusedWith(
      workspace(),
      ["--change", "2026-10-04-other", ...marking],
      "no change record '2026-10-04-other' in .greenline/ledger/",
    );
  });

  it("S4 refuses when no change is open and none is named", async () => {
    await refusedWith(
      workspace({ "2026-10-01-old": record("done") }),
      marking,
      "no change is open; name one with --change",
    );
  });

  it("S4 refuses to guess the open change while a record does not parse", async () => {
    await refusedWith(
      workspace({ "2026-10-04-fix": record("open"), "2026-10-04-broken": "no front matter\n" }),
      marking,
      "the change records '2026-10-04-broken' do not parse, so the open change is unknown; name it with --change",
    );
  });

  it("S16b a finished record a later definition no longer parses does not hide the open change", async () => {
    // A done record with a section of a kind the current modes do not declare: history, read for its form.
    const finished = `${record("done")}## sketch\n\nAn old step.\n`;
    const space = workspace({ "2026-10-04-fix": record("open"), "2026-10-01-old": finished });
    const result = await check(space, marking);
    expect(result.code).toBe(0);
    expect(factsOf(space.root, "2026-10-04-fix")).toHaveLength(1);
    // An open one that does not parse still does.
    const openBroken = `${record("open")}## sketch\n\nAn old step.\n`;
    await refusedWith(
      workspace({ "2026-10-04-fix": record("open"), "2026-10-02-other": openBroken }),
      marking,
      "the change records '2026-10-02-other' do not parse, so the open change is unknown; name it with --change",
    );
  });

  it("S4 refuses a named change whose record does not parse", async () => {
    await refusedWith(
      workspace({ "2026-10-04-broken": "no front matter\n" }),
      ["--change", "2026-10-04-broken", ...marking],
      "the change record '2026-10-04-broken' does not parse: a change record must start with a '---' frontmatter block",
    );
  });

  it("S4 refuses an unknown step", async () => {
    await refusedWith(
      workspace(),
      ["--step", "deploy", ...marking],
      "unknown step 'deploy'; the steps are frame, plan, anticipate, build, review, verify, close",
    );
  });

  it("S4 refuses an empty command", async () => {
    await refusedWith(workspace(), [], "no command given; write it after '--'");
    await refusedWith(workspace(), ["--"], "no command given; write it after '--'");
    await refusedWith(workspace(), ["--", ""], "no command given; write it after '--'");
  });

  it("S4 refuses a command written without '--', and an option with no value", async () => {
    await refusedWith(
      workspace(),
      [node, "-e", ""],
      `unknown argument '${node}'; put the command after '--'`,
    );
    await refusedWith(workspace(), ["--step"], "--step needs a value");
    await refusedWith(workspace(), ["--change", "--", node], "--change needs a value");
  });

  it("S4 refuses a missing executable", async () => {
    await refusedWith(
      workspace(),
      ["--", "scripts/absent.sh"],
      "'scripts/absent.sh' is not an executable from the repository root or the PATH",
    );
    await refusedWith(
      workspace(),
      ["--", "greenline-no-such-command"],
      "'greenline-no-such-command' is not an executable from the repository root or the PATH",
    );
  });

  it("S4 refuses outside a Git repository", async () => {
    const plain = mkdtempSync(join(tmpdir(), "check-plain-"));
    cleanup.push(plain);
    const result = await check(
      { root: plain, git: () => "", terminal: join(plain, "t.log") },
      marking,
    );
    expect(result).toEqual({
      code: 2,
      err: "greenline check: check runs inside a Git repository\n",
      out: "",
    });
    expect(existsSync(join(plain, "ran"))).toBe(false);
  });
});

describe("greenline check fails without running", () => {
  it("S4 facts that cannot be written stop the run before the command starts", async () => {
    const space = workspace();
    writeFileSync(
      join(space.root, ".greenline", "ledger", "2026-10-04-fix"),
      "a file, not a folder\n",
    );
    const result = await check(space, marking);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(
      /^greenline check: the check's facts cannot be written, so nothing ran: /,
    );
    expect(existsSync(join(space.root, "ran"))).toBe(false);
  });

  it("S4 an unavailable installation stops the run before anything is read or run", async () => {
    const space = workspace();
    const result = await check(space, marking, {
      installation: () => ({
        _tag: "err",
        error: new ContractParseFailed("installation.json", [{ path: "", message: "missing" }]),
      }),
    });
    expect(result.code).toBe(1);
    expect(result.err).toBe(
      "greenline check: the installation is unavailable, so the modes cannot be read (GL0140): missing\n",
    );
    expect(existsSync(join(space.root, "ran"))).toBe(false);
  });

  it("J-84 S2 a facts file already standing is never written over: nothing runs, and the fact is kept", async () => {
    const space = workspace();
    await check(space, ["--", node, "-e", ""]);
    const folder = join(space.root, ".greenline", "ledger", "2026-10-04-fix", "checks");
    const [standing] = readdirSync(folder);
    const before = readFileSync(join(folder, standing ?? ""), "utf8");
    const result = await check(space, marking, { factsFile: () => standing ?? "" });
    expect(result.code).toBe(1);
    expect(result.err).toBe(
      `greenline check: the facts file .greenline/ledger/2026-10-04-fix/checks/${standing ?? ""} already stands, and a recorded fact is never written over, so nothing ran; run the check again\n`,
    );
    expect(readFileSync(join(folder, standing ?? ""), "utf8")).toBe(before);
    expect(existsSync(join(space.root, "ran"))).toBe(false);
  });
});

describe("greenline check -- <command> reads the step from the record", () => {
  const recorded = (space: Workspace, id = "2026-10-04-fix"): readonly (string | undefined)[] =>
    factsOf(space.root, id).map((facts) => facts.step);

  it("J-89 S2 the short form records the open change's first required section not yet written, and says so", async () => {
    const space = workspace({
      "2026-10-04-fix": `${record("open")}## frame\n\nA typo.\n`,
    });
    const result = await check(space, ["--", node, "-e", ""]);
    expect(result.code).toBe(0);
    // Quick runs plan inline, so the first run step not yet written after frame is plan.
    expect(recorded(space)).toEqual(["plan"]);
    expect(result.err).toMatch(
      /^greenline check: exit 0; facts in \.greenline\/ledger\/2026-10-04-fix\/checks\/\S+\.json; step plan, read from the record\n$/,
    );
  });

  it("J-89 S2 the step the record's next line names is the step recorded", async () => {
    const space = workspace({
      "2026-10-04-fix": `${record("open", ['next: "verify: rerun the suite"'])}## frame\n\nA typo.\n`,
    });
    await check(space, ["--", node, "-e", ""]);
    expect(recorded(space)).toEqual(["verify"]);
  });

  it("J-89 S2 a step given with --step is recorded as given, and the line names no inference", async () => {
    const space = workspace({
      "2026-10-04-fix": `${record("open")}## frame\n\nA typo.\n`,
    });
    const result = await check(space, ["--step", "review", "--", node, "-e", ""]);
    expect(recorded(space)).toEqual(["review"]);
    expect(result.err).not.toContain("read from the record");
  });

  it("J-89 S2 a named stopped change records the step its next line names", async () => {
    const space = workspace({
      "2026-10-02-paused": record("stopped", ['next: "review: rerun the reviewer"']),
      "2026-10-04-fix": record("open"),
    });
    await check(space, ["--change", "2026-10-02-paused", "--", node, "-e", ""]);
    expect(recorded(space, "2026-10-02-paused")).toEqual(["review"]);
  });

  it("J-89 S2 a named finished change records no step without --step, as status reports none", async () => {
    const space = workspace({
      "2026-10-01-old": `${record("done")}## frame\n\nA typo.\n`,
      "2026-10-04-fix": record("open"),
    });
    const result = await check(space, ["--change", "2026-10-01-old", "--", node, "-e", ""]);
    expect(recorded(space, "2026-10-01-old")).toEqual([undefined]);
    expect(result.err).not.toContain("read from the record");
  });

  it("J-89 S2 a record whose required sections are all written records no step, as before", async () => {
    // Quick skips anticipate and review, so the sections of the steps it runs are all its record needs written.
    const body = ["frame", "plan", "build", "verify", "close"]
      .map((step) => `## ${step}\n\nDone.\n`)
      .join("\n");
    const space = workspace({ "2026-10-04-fix": `${record("open")}${body}` });
    const result = await check(space, ["--", node, "-e", ""]);
    expect(recorded(space)).toEqual([undefined]);
    expect(result.err).not.toContain("read from the record");
  });
});

describe("greenline check keeps the facts it recorded", () => {
  it("J-84 S2 each run names the newest facts file already in the folder; the first names none", async () => {
    const space = workspace();
    await check(space, ["--", node, "-e", ""]);
    await check(space, ["--", node, "-e", "process.exit(1)"]);
    await check(space, ["--", node, "-e", ""]);
    const folder = join(space.root, ".greenline", "ledger", "2026-10-04-fix", "checks");
    const names = readdirSync(folder).sort();
    const facts = factsOf(space.root, "2026-10-04-fix");
    expect(facts.map((each) => each.previous)).toEqual([undefined, names[0], names[1]]);
  });

  it("J-84 S2 a rerun of the same command gets a new facts file, the earlier one kept as it was", async () => {
    const space = workspace();
    await check(space, ["--", node, "-e", "process.exit(1)"]);
    const folder = join(space.root, ".greenline", "ledger", "2026-10-04-fix", "checks");
    const [first] = readdirSync(folder);
    const before = readFileSync(join(folder, first ?? ""), "utf8");
    expect((await check(space, ["--", node, "-e", "process.exit(1)"])).code).toBe(1);
    expect(readdirSync(folder)).toHaveLength(2);
    expect(readFileSync(join(folder, first ?? ""), "utf8")).toBe(before);
  });
});

describe("greenline check --probe marks a probe recorded by mistake", () => {
  async function recorded(space: Workspace): Promise<string> {
    await check(space, ["--", node, "-e", "process.exit(1)"]);
    const [name] = readdirSync(
      join(space.root, ".greenline", "ledger", "2026-10-04-fix", "checks"),
    );
    return name ?? "";
  }

  it("J-84 S2 marks the named fact a probe, by its name or its path, every other fact kept, and runs nothing", async () => {
    const space = workspace();
    const name = await recorded(space);
    const path = `.greenline/ledger/2026-10-04-fix/checks/${name}`;
    const [before] = factsOf(space.root, "2026-10-04-fix");
    const result = await check(space, ["--change", "2026-10-04-fix", "--probe", path]);
    expect(result).toEqual({
      code: 0,
      err: `greenline check: ${path} marked a probe; status leaves it out of the change's checks\n`,
      out: "",
    });
    expect(factsOf(space.root, "2026-10-04-fix")).toEqual([{ ...before, probe: true }]);
    const again = await check(space, ["--probe", name]);
    expect(again).toEqual({
      code: 0,
      err: `greenline check: ${path} is already marked a probe\n`,
      out: "",
    });
    expect(existsSync(join(space.root, "ran"))).toBe(false);
  });

  it("J-84 S2 a fact's path is read from the repository root, as check prints it, wherever check is called", async () => {
    const space = workspace();
    const name = await recorded(space);
    mkdirSync(join(space.root, "deep", "inside"), { recursive: true });
    const path = `.greenline/ledger/2026-10-04-fix/checks/${name}`;
    const result = await check(space, ["--probe", path], {
      cwd: join(space.root, "deep", "inside"),
    });
    expect(result.code).toBe(0);
    expect(factsOf(space.root, "2026-10-04-fix")[0]?.probe).toBe(true);
  });

  it("J-84 S2 a mark made while the run is still going is kept when its facts are completed", async () => {
    const space = workspace();
    const marker = [
      "const fs = require('fs');",
      "const dir = '.greenline/ledger/2026-10-04-fix/checks';",
      "const file = dir + '/' + fs.readdirSync(dir)[0];",
      "const facts = JSON.parse(fs.readFileSync(file, 'utf8'));",
      "fs.writeFileSync(file, JSON.stringify({ ...facts, probe: true }));",
      "process.exit(1);",
    ].join(" ");
    expect((await check(space, ["--", node, "-e", marker])).code).toBe(1);
    expect(factsOf(space.root, "2026-10-04-fix")[0]).toMatchObject({
      state: "finished",
      outcome: { kind: "exited", code: 1 },
      probe: true,
    });
  });

  it("J-84 S2 refuses a fact that is not in the change's checks folder, and a command or a step beside --probe", async () => {
    const space = workspace({
      "2026-10-04-fix": record("open"),
      "2026-10-03-other": record("done"),
    });
    const name = await recorded(space);
    const elsewhere = await check(space, [
      "--change",
      "2026-10-03-other",
      "--probe",
      `.greenline/ledger/2026-10-04-fix/checks/${name}`,
    ]);
    expect(elsewhere).toEqual({
      code: 2,
      err: `greenline check: no facts file '.greenline/ledger/2026-10-04-fix/checks/${name}' among the checks of '2026-10-03-other'\n`,
      out: "",
    });
    expect((await check(space, ["--probe", "20261004T120000000Z-ffffff.json"])).code).toBe(2);
    expect(await check(space, ["--probe", name, ...marking])).toEqual({
      code: 2,
      err: "greenline check: --probe marks a recorded fact and runs nothing; give it no command and no --step\n",
      out: "",
    });
    expect((await check(space, ["--probe", name, "--step", "verify"])).code).toBe(2);
    expect((await check(space, ["--probe"])).err).toBe("greenline check: --probe needs a value\n");
    expect(factsOf(space.root, "2026-10-04-fix")[0]?.probe).toBeUndefined();
    expect(existsSync(join(space.root, "ran"))).toBe(false);
  });

  it("J-84 S2 the help names the probe mark and the facts never written over", async () => {
    const result = await check(workspace(), ["--help"]);
    expect(result.out).toContain("--probe <fact>");
    expect(result.out.replace(/\s+/g, " ")).toContain(
      "by its file name or its path from the repository root",
    );
    expect(result.out).toContain("never written over");
  });

  it("J-89 S2 the help gives the short form first and names the step it reads and the plain run a probe", async () => {
    const result = await check(workspace(), ["--help"]);
    const text = result.out.replace(/\s+/g, " ");
    expect(text).toContain("'greenline check -- npm test' records it for the open change");
    expect(text).toContain("default: the step the record is in");
    expect(text).toContain("A run whose green the change never claims, a probe, runs plainly");
  });
});

describe("greenline check --round runs a fresh agent's check in its scratch folder", () => {
  const careful = record("open", []).replace("mode: quick", "mode: careful");
  /** A command that writes the temporary directory it was given at the repository root. */
  const telling = [
    "--",
    node,
    "-e",
    "require('fs').writeFileSync('told', JSON.stringify([process.env.TMPDIR, process.env.TMP, process.env.TEMP, require('os').tmpdir()]))",
  ];

  it("J-89 S3 sets TMPDIR, TMP and TEMP to the agent's scratch folder for the command it records, making the folder", async () => {
    const space = workspace({ "2026-10-04-fix": careful });
    const result = await check(space, ["--step", "review", "--round", "2", ...telling], {
      environment: { ...process.env, TMPDIR: "/host/tmp", TMP: "/host/tmp", TEMP: "/host/tmp" },
    });
    expect(result.code).toBe(0);
    const scratch = join(space.root, ".greenline", "tmp", "2026-10-04-fix", "review-2");
    const told: unknown = JSON.parse(readFileSync(join(space.root, "told"), "utf8"));
    // TMPDIR, TMP, TEMP, and the temporary directory node reads from them.
    expect(told).toEqual([scratch, scratch, scratch, scratch]);
    expect(existsSync(scratch)).toBe(true);
    expect(factsOf(space.root, "2026-10-04-fix")[0]?.step).toBe("review");
  });

  it("J-89 S3 leaves the environment as it is without --round", async () => {
    const space = workspace({ "2026-10-04-fix": careful });
    await check(space, ["--step", "review", ...telling], {
      environment: { ...process.env, TMPDIR: "/host/tmp" },
    });
    const told: unknown = JSON.parse(readFileSync(join(space.root, "told"), "utf8"));
    expect(Array.isArray(told) ? told[0] : told).toBe("/host/tmp");
    expect(existsSync(join(space.root, ".greenline", "tmp"))).toBe(false);
  });

  it("J-89 S3 refuses a --round without its --step, one that is no number, and one no fresh agent of the record's mode takes, running nothing", async () => {
    const space = workspace({ "2026-10-04-fix": careful });
    expect(await check(space, ["--round", "1", ...marking])).toEqual({
      code: 2,
      err: "greenline check: --round names a fresh agent by its number and is given with the --step its brief names\n",
      out: "",
    });
    expect((await check(space, ["--step", "review", "--round", "0", ...marking])).err).toBe(
      "greenline check: --round is a number from 1, the one the agent's brief names\n",
    );
    expect((await check(space, ["--step", "review", "--round", "x", ...marking])).code).toBe(2);
    expect(await check(space, ["--step", "build", "--round", "1", ...marking])).toEqual({
      code: 2,
      err: "greenline check: --round names a fresh agent, and the build step runs at the written depth under careful, where none is started\n",
      out: "",
    });
    expect((await check(space, ["--step", "review", "--round", "3", ...marking])).err).toBe(
      "greenline check: review under careful gives 2 agents, so --round is 1 to 2\n",
    );
    expect(existsSync(join(space.root, "ran"))).toBe(false);
    expect(existsSync(join(space.root, ".greenline", "ledger", "2026-10-04-fix", "checks"))).toBe(
      false,
    );
    expect(existsSync(join(space.root, ".greenline", "tmp"))).toBe(false);
  });

  it("J-89 S3 the help names --round and the scratch folder it sets TMPDIR to", async () => {
    const text = (await check(workspace(), ["--help"])).out.replace(/\s+/g, " ");
    expect(text).toContain("--round <n>");
    expect(text).toContain("TMPDIR");
    expect(text).toContain(".greenline/tmp/<id>/<step>-<n>/");
  });
});
