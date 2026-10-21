/**
 * `greenline event` through its entry point on a fixture repository (J-93
 * S3): the raw log, the matching of a declared check and the hook-recorded
 * run it writes, the mirror at a session's and a turn's start, the one
 * refusal, and the fail-open cases, each driven by a recorded payload.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName, parseChecksFile, parseFacts } from "../../src/core/facts.ts";
import { ok } from "../../src/commons/result.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-10-19-retry";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Space {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, text: string) => void;
}

function space(
  options: {
    readonly manifest?: object | false;
    readonly branch?: string;
    readonly record?: readonly string[] | false;
  } = {},
): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-event-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("a.txt", "a\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  if (options.manifest !== false)
    write(
      ".greenline/manifest.json",
      JSON.stringify({
        schemaVersion: 6,
        targets: ["claude-code"],
        checks: [{ name: "unit", command: "pnpm run test", dir: "." }],
        ...(options.manifest ?? {}),
      }),
    );
  // With no remote the default branch holds an open change too; the fixture works on a branch of its own.
  git("checkout", "--quiet", "-b", options.branch ?? "feature");
  if (options.record !== false)
    write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        'why: "w"',
        ...(options.record ?? ["choice: accepted", "state: open"]),
        "---",
        "",
      ].join("\n"),
    );
  return { root, git, write };
}

/** What one event's run printed and returned. */
interface Fired {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** Fire an event with the stdin given as it stands, at the instant given. */
function fireText(
  cwd: string,
  argv: readonly string[],
  stdin: string,
  instant = "2026-10-19T12:00:00.000Z",
): Fired {
  const writer = new RecordingWriter();
  const code = runEventCli(argv, writer.writer, {
    cwd,
    stdin: () => stdin,
    now: () => new Date(instant),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
  });
  return { code, out: writer.out, err: writer.err };
}

/** Fire an event in a fixture with a payload as the harness writes it. */
function fire(where: Space, argv: readonly string[], payload: JsonValue, instant?: string): Fired {
  return fireText(where.root, argv, JSON.stringify(payload), instant);
}

/** The raw log's lines, as the tests read them. */
const LOGGED = z.object({
  kind: z.string(),
  call: z.string().nullable().optional(),
  check: z.string().nullable().optional(),
  opened: z.object({ commit: z.string().nullable(), tree: z.string().nullable() }).optional(),
});

/** The context Claude Code reads at a session's or a turn's start. */
const CONTEXT = z.object({
  hookSpecificOutput: z.object({ hookEventName: z.string(), additionalContext: z.string() }),
});

const CLAUDE = ["--harness", "claude-code"];

function rawLog(root: string): readonly z.infer<typeof LOGGED>[] {
  const path = join(root, ".greenline", "tmp", ID, "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => LOGGED.parse(JSON.parse(line)));
}

describe("J-93 S3 greenline event: the mirror at a session's and a turn's start", () => {
  it("prints the mirror in Claude Code's context shape, with the open change and each declared check's latest run", () => {
    const here = space();
    const ran = fire(here, CLAUDE, { hook_event_name: "SessionStart", session_id: "s1" });
    expect(ran.code).toBe(0);
    const context = CONTEXT.parse(JSON.parse(ran.out));
    expect(context.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(context.hookSpecificOutput.additionalContext).toContain(
      `greenline: change ${ID}, quick, open.`,
    );
    expect(context.hookSpecificOutput.additionalContext).toContain(
      "  unit (pnpm run test): no recorded run",
    );
    expect(rawLog(here.root).map((line) => line.kind)).toEqual(["session-start"]);
  });

  it("says no check is declared, with the two ways, and that no change is open, logging nothing", () => {
    const here = space({ manifest: { checks: [] }, record: false });
    const ran = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", prompt: "hello" });
    const mirror = CONTEXT.parse(JSON.parse(ran.out)).hookSpecificOutput.additionalContext;
    expect(mirror).toContain("greenline: no open change.");
    expect(mirror).toContain(
      "no checks declared: declare each in the plan with 'greenline check --declare -- <command>', or record a run with 'greenline check -- <command>'",
    );
    expect(existsSync(join(here.root, ".greenline", "tmp"))).toBe(false);
  });

  it("counts the fresh agents from the raw log, and nudges at close on a cost that differs", () => {
    const here = space();
    fire(here, CLAUDE, { hook_event_name: "SubagentStart", agent_id: "a1" });
    fire(here, CLAUDE, { hook_event_name: "SubagentStop", agent_id: "a1" });
    fire(here, CLAUDE, { hook_event_name: "SubagentStart", agent_id: "a2" });
    const open = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit" });
    expect(open.out).toContain("2 fresh agents counted in its events");
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        "choice: accepted",
        'why: "w"',
        "state: done",
        "agents: 1",
        "rounds: 0",
        "---",
        "",
      ].join("\n"),
    );
    const branch = `greenline/${ID}`;
    here.git("checkout", "--quiet", "-b", branch);
    const closed = fire(here, CLAUDE, { hook_event_name: "SessionStart" });
    expect(closed.out).toContain(
      "the events counted 2 fresh agents and the record states agents: 1",
    );
  });
});

describe("J-93 S3 greenline event: a declared check matched, never parsed", () => {
  it("writes a matched run whole at the after-tool event, its tree read at the before-tool, the outcome the harness gave", () => {
    const here = space();
    const before = fire(here, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "t1",
      cwd: here.root,
      tool_input: { command: "pnpm run test -- --coverage" },
    });
    expect(before.code).toBe(0);
    const opened = rawLog(here.root)[0];
    expect(opened).toMatchObject({ kind: "before-tool", check: "unit", call: "t1" });
    expect(opened?.opened).toMatchObject({ commit: here.git("rev-parse", "HEAD") });
    fire(here, CLAUDE, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "t1",
      cwd: here.root,
      tool_input: { command: "pnpm run test -- --coverage" },
      duration_ms: 1200,
    });
    const folder = join(here.root, ".greenline", "ledger", ID, "checks");
    expect(readdirSync(folder)).toEqual(["20261019T120000000Z-hook01.hook.json"]);
    const run = parseChecksFile(
      readFileSync(join(folder, "20261019T120000000Z-hook01.hook.json"), "utf8"),
      "run",
    );
    expect(run.kind).toBe("hook");
    expect(run.parsed._tag === "ok" ? run.parsed.value : undefined).toMatchObject({
      source: "hook",
      harness: "claude-code",
      check: "unit",
      arguments: ["pnpm run test -- --coverage"],
      dir: ".",
      startedAt: "2026-10-19T12:00:00.000Z",
      treeAt: "run-start",
      commit: here.git("rev-parse", "HEAD"),
      outcome: { kind: "ok", code: null },
      durationMs: 1200,
    });
  });

  it("records a run whose harness gives no outcome as unknown, its tree read after it when no before-tool paired it", () => {
    const here = space();
    fire(here, ["--harness", "codex"], {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      cwd: here.root,
      tool_input: { command: "pnpm run test" },
    });
    const folder = join(here.root, ".greenline", "ledger", ID, "checks");
    const run = parseChecksFile(
      readFileSync(join(folder, "20261019T120000000Z-hook01.hook.json"), "utf8"),
      "run",
    );
    expect(run.parsed._tag === "ok" ? run.parsed.value : undefined).toMatchObject({
      harness: "codex",
      treeAt: "run-end",
      outcome: { kind: "unknown", code: null },
      durationMs: null,
    });
  });

  it("records a command no declaration matches, or one run in another directory, and writes no run", () => {
    const here = space();
    for (const command of ["pnpm run tests", "cd sub && pnpm run test"])
      fire(here, CLAUDE, {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        cwd: here.root,
        tool_input: { command },
      });
    fire(here, ["--harness", "gemini"], {
      hook_event_name: "AfterTool",
      tool_name: "run_shell_command",
      cwd: here.root,
      tool_input: { command: "pnpm run test", dir_path: "sub" },
    });
    expect(rawLog(here.root).map((line) => line.check)).toEqual([null, null, null]);
    expect(existsSync(join(here.root, ".greenline", "ledger", ID, "checks"))).toBe(false);
  });
});

describe("J-93 S3 the mirror carries the nudge a turn's end owes", () => {
  it("says at the next turn's start that a written close has no done", () => {
    const here = space();
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        "choice: accepted",
        'why: "w"',
        "state: open",
        "---",
        "",
        "## close",
        "",
        "The landing was offered.",
        "",
      ].join("\n"),
    );
    fire(here, CLAUDE, { hook_event_name: "Stop" });
    const ran = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit" });
    expect(ran.out).toContain("its close section is written and its state is not done");
  });
});

describe("J-93 S3 a hook-recorded run stays out of check's facts", () => {
  it("names no run a hook recorded as a check's previous fact, and raises no missing fact for it", async () => {
    const here = space({ manifest: { checks: [{ name: "truth", command: "true", dir: "." }] } });
    // The hook's clock is fixed far past the real clock the check run below reads, so the hook's run stays the newest on any day.
    fire(
      here,
      CLAUDE,
      {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        cwd: here.root,
        tool_input: { command: "true" },
      },
      "2999-01-01T00:00:00.000Z",
    );
    const folder = join(here.root, ".greenline", "ledger", ID, "checks");
    expect(readdirSync(folder)).toEqual(["29990101T000000000Z-hook01.hook.json"]);
    const writer = new RecordingWriter();
    const code = await runCheckCli(["--", "true"], writer.writer, {
      cwd: here.root,
      installation: () => ok(fixtureInstallation()),
      environment: process.env,
      stdio: "ignore",
    });
    expect(code, writer.err).toBe(0);
    const facts = readdirSync(folder).filter((name) => !name.endsWith(".hook.json"));
    expect(facts).toHaveLength(1);
    const parsed = parseFacts(readFileSync(join(folder, facts[0] ?? ""), "utf8"), "facts");
    expect(parsed._tag === "ok" ? parsed.value.previous : "a previous").toBeUndefined();
    const status = new RecordingWriter();
    runCli(["status", "--json"], status.writer, "0.1.0", {
      cwd: here.root,
      version: "0.1.0",
      installation: fixtureInstallation(),
    });
    expect(status.out).not.toContain("GL0459");
    // The run a hook recorded shows as the declared check's standing, and nowhere among the check facts.
    expect(status.out).toContain('"by": "hook"');
  });
});

describe("J-93 S3 greenline event: the one refusal, a write outside the homes before the yes", () => {
  const write = (path: string) => ({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: path, content: "x" },
  });

  it("refuses a write outside the homes on the change's branch while its record stands nowhere, with exit 2 and one line", () => {
    const here = space({ branch: `greenline/${ID}`, record: false });
    const refused = fire(here, CLAUDE, { ...write(join(here.root, "src/a.ts")), cwd: here.root });
    expect(refused.code).toBe(2);
    expect(refused.err).toBe(
      `greenline: refused: the write to ${join(here.root, "src/a.ts")} lies outside .greenline/ledger/ and .greenline/tmp/${ID}/, and .greenline/ledger/${ID}.md stands nowhere yet, so the owner has not said yes; propose the change and wait\n`,
    );
    expect(rawLog(here.root).map((line) => line.kind)).toEqual(["before-tool"]);
    const outside = fire(here, CLAUDE, write("/elsewhere/notes.md"));
    expect(outside.code).toBe(2);
  });

  it("allows a write into the homes before the yes, and any write once the record carries a choice", () => {
    const here = space({ branch: `greenline/${ID}`, record: false });
    expect(fire(here, CLAUDE, write(join(here.root, `.greenline/ledger/${ID}.md`))).code).toBe(0);
    expect(fire(here, CLAUDE, write(`.greenline/tmp/${ID}/notes.md`)).code).toBe(0);
    here.write(`.greenline/ledger/${ID}.md`, '---\nmode: quick\nwhy: "w"\nstate: open\n---\n');
    expect(fire(here, CLAUDE, write("src/a.ts")).code).toBe(2);
    here.write(
      `.greenline/ledger/${ID}.md`,
      '---\nmode: quick\nchoice: accepted\nwhy: "w"\nstate: open\n---\n',
    );
    expect(fire(here, CLAUDE, write("src/a.ts")).code).toBe(0);
  });

  it("never refuses a shell command, whatever it writes", () => {
    const here = space({ branch: `greenline/${ID}`, record: false });
    expect(
      fire(here, CLAUDE, {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo x > src/a.ts" },
      }).code,
    ).toBe(0);
  });
});

describe("J-93 S3 greenline event fails open", () => {
  it("exits 0 and writes nothing outside a workspace and with the adapters off, and refuses a write with no open change (J-102 S1)", () => {
    const bare = space({ manifest: false });
    expect(fire(bare, CLAUDE, { hook_event_name: "SessionStart" })).toEqual({
      code: 0,
      out: "",
      err: "",
    });
    const off = space({
      manifest: { hooks: { git: true, adapters: false } },
      branch: `greenline/${ID}`,
      record: false,
    });
    expect(
      fire(off, CLAUDE, {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "src/a.ts" },
      }).code,
    ).toBe(0);
    expect(existsSync(join(off.root, ".greenline", "tmp"))).toBe(false);
    const closed = space({ record: ["choice: accepted", "state: done"] });
    const unopened = fire(closed, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "src/a.ts" },
    });
    expect(unopened).toEqual({
      code: 2,
      out: "",
      err: "greenline: refused: the write to src/a.ts lies outside .greenline/ledger/ and .greenline/tmp/, and no change is open on feature; open its record under .greenline/ledger/ before the first commit\n",
    });
    expect(existsSync(join(closed.root, ".greenline", "tmp"))).toBe(false);
    const nowhere = mkdtempSync(join(tmpdir(), "greenline-event-none-"));
    cleanup.push(nowhere);
    expect(fireText(nowhere, CLAUDE, '{"hook_event_name":"SessionStart"}').code).toBe(0);
  });

  it("exits 0 on its own error: arguments it does not read, a payload that is no JSON, and stdin that fails", () => {
    const here = space({ branch: `greenline/${ID}`, record: false });
    const wrong = fire(here, ["--harness", "nope"], {});
    expect(wrong.code).toBe(0);
    expect(wrong.err).toContain("the tool goes on");
    expect(fire(here, ["before-tool", "extra", ...CLAUDE], {}).code).toBe(0);
    expect(fireText(here.root, CLAUDE, "{ not json").code).toBe(0);
    const writer = new RecordingWriter();
    const failed = runEventCli(CLAUDE, writer.writer, {
      cwd: here.root,
      stdin: () => {
        throw new Error("stdin closed");
      },
    });
    expect(failed).toBe(0);
    expect(writer.err).toContain("greenline's own error, so the tool goes on: stdin closed");
  });
});

/**
 * Each harness's events as its adapter fires them: the arguments its entries
 * pass and the payload's event name where it carries one, every kind it maps.
 */
const FIRED: readonly (readonly [string, readonly (readonly [readonly string[], JsonValue])[]])[] =
  [
    [
      "claude-code",
      [
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "SubagentStart",
        "SubagentStop",
        "Stop",
        "PreCompact",
        "SessionEnd",
      ].map((native) => [["--harness", "claude-code"], { hook_event_name: native }]),
    ],
    [
      "codex",
      [
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "SubagentStart",
        "SubagentStop",
        "Stop",
        "PreCompact",
        "SessionEnd",
      ].map((native) => [["--harness", "codex"], { hook_event_name: native }]),
    ],
    [
      "copilot",
      [
        ["session-start", "sessionStart"],
        ["turn-start", "userPromptSubmitted"],
        ["before-tool", "preToolUse"],
        ["after-tool", "postToolUse"],
        ["after-tool", "postToolUseFailure"],
        ["agent-start", "subagentStart"],
        ["agent-stop", "subagentStop"],
        ["turn-end", "agentStop"],
        ["compact", "preCompact"],
        ["session-end", "sessionEnd"],
      ].map(([kind, native]) => [
        [kind ?? "", "--harness", "copilot", "--native", native ?? ""],
        { sessionId: "s" },
      ]),
    ],
    [
      "opencode",
      ["before-tool", "after-tool", "session-start", "turn-end", "compact"].map((kind) => [
        [kind, "--harness", "opencode"],
        { tool: "bash", args: { command: "ls" } },
      ]),
    ],
  ];

describe("J-93 S3 greenline event takes every kind each adapter fires, through the entry point", () => {
  it.each(FIRED)("%s", (_harness, fired) => {
    const here = space();
    for (const [argv, payload] of fired) expect(fire(here, argv, payload).code).toBe(0);
    const kinds = rawLog(here.root).map((line) => line.kind);
    expect(kinds).toHaveLength(fired.length);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(5);
  });
});
