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
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName, parseChecksFile, parseFacts } from "../../src/core/facts.ts";
import { serializeLock } from "../../src/core/lock.ts";
import { parseChangeLoads, parseSessionFact } from "../../src/core/skill-loads.ts";
import { ok } from "../../src/commons/result.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation, fixtureSkills } from "../fixtures/corpus.ts";
import { HOOKS_ON } from "../../src/core/manifest.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { registerGitHooks } from "../../src/shell/hooks.ts";
import { writeAddressFile } from "../../src/shell/inspect/address-file.ts";
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
        // An accepted record quotes the owner's yes (J-176 S1).
        ...((options.record ?? ["choice: accepted"]).includes("choice: accepted") &&
        !(options.record ?? []).some((line) => line.startsWith("yes:"))
          ? ['yes: "Yes."']
          : []),
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
        'outcome: "The change landed."',
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
    // The nudge names where a method's agents stand, so it invites none into the record (J-208 S1, j196t-conduct-emptyc item_49).
    expect(closed.out).toContain(
      "the cost counts the builder and each fresh agent a step started, and an agent a method started, a picture's helper among them, is counted nowhere and listed nowhere, neither in the record's starts nor in its agents count",
    );
  });
});

describe("J-144 S4 a fresh agent counts once by its id, so a resumed reviewer is no second start", () => {
  it("counts a reviewer resumed for a recheck once, in the mirror and in status, and no GL0402 within the mode's limit", () => {
    const here = space({ branch: `greenline/${ID}` });
    const record = (state: string, cost: readonly string[]): void =>
      here.write(
        `.greenline/ledger/${ID}.md`,
        [
          "---",
          "mode: regular",
          'why: "w"',
          "choice: accepted",
          `state: ${state}`,
          ...cost,
          "---",
          "",
        ].join("\n"),
      );
    record("open", []);
    fire(here, CLAUDE, { hook_event_name: "SubagentStart", agent_id: "reviewer-1" });
    fire(here, CLAUDE, { hook_event_name: "SubagentStop", agent_id: "reviewer-1" });
    // The same reviewer resumed for the recheck after the fix pass.
    fire(here, CLAUDE, { hook_event_name: "SubagentStart", agent_id: "reviewer-1" });
    fire(here, CLAUDE, { hook_event_name: "SubagentStop", agent_id: "reviewer-1" });
    const open = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit" });
    expect(open.out).toContain("1 fresh agent counted in its events");
    // A second reviewer under its own id is a second start.
    const twice = space({ branch: `greenline/${ID}` });
    fire(twice, CLAUDE, { hook_event_name: "SubagentStart", agent_id: "reviewer-1" });
    fire(twice, CLAUDE, { hook_event_name: "SubagentStart", agent_id: "reviewer-2" });
    expect(fire(twice, CLAUDE, { hook_event_name: "UserPromptSubmit" }).out).toContain(
      "2 fresh agents counted in its events",
    );
    record("done", ["next: none", "agents: 2", "rounds: 1"]);
    const status = new RecordingWriter();
    runCli(["status", "--change", ID], status.writer, "0.0.0-test", {
      cwd: here.root,
      version: "0.0.0-test",
      installation: fixtureInstallation(),
    });
    expect(status.err).not.toContain("GL0402");
    expect(status.out + status.err).not.toContain("fresh agents and its record states agents");
    const closed = fire(here, CLAUDE, { hook_event_name: "SessionStart" });
    expect(closed.out).not.toContain("the events counted");
  });
});

describe("J-143 S2 a done change's events go nowhere, so the tidy's removal stands", () => {
  it("logs while the record is open and nothing once it is done and tidied, the folder left absent", () => {
    const here = space({ branch: `greenline/${ID}` });
    const tool = {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "toolu_1",
      tool_input: { command: "greenline tidy --change x" },
    };
    fire(here, CLAUDE, tool);
    expect(rawLog(here.root).map((line) => line.kind)).toEqual(["after-tool"]);
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        'why: "w"',
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        "---",
        "",
      ].join("\n"),
    );
    rmSync(join(here.root, ".greenline", "tmp", ID), { recursive: true, force: true });
    fire(here, CLAUDE, tool);
    fire(here, CLAUDE, { hook_event_name: "Stop" });
    fire(here, CLAUDE, { hook_event_name: "SessionEnd" });
    fire(here, CLAUDE, { hook_event_name: "SessionStart" });
    // A code write after the tidy writes no first-write note either.
    here.write("src/app.ts", "export {};\n");
    fire(here, CLAUDE, {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_use_id: "toolu_2",
      tool_input: { file_path: join(here.root, "src/app.ts"), content: "export {};\n" },
    });
    expect(existsSync(join(here.root, ".greenline", "tmp", ID))).toBe(false);
  });

  it("names in the mirror the model the session ran, from Codex's rollout and from a payload's model field", () => {
    const here = space({
      record: ["choice: accepted", "state: open", "ground: branch", 'agent: "codex/gpt-6"'],
    });
    here.write(
      ".rollout.jsonl",
      [
        JSON.stringify({ type: "session_meta", payload: { id: "s" } }),
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-sol" } }),
        "",
      ].join("\n"),
    );
    const codex = fire(here, ["--harness", "codex"], {
      hook_event_name: "SessionStart",
      session_id: "s",
      transcript_path: join(here.root, ".rollout.jsonl"),
    });
    expect(codex.out).toContain(
      "agent: codex/gpt-6, and the harness reports the model gpt-6.1-sol; write codex/gpt-6.1-sol in the record's agent line",
    );
    const claude = fire(here, CLAUDE, {
      hook_event_name: "UserPromptSubmit",
      model: "claude-opus-5-5",
    });
    // A change open in a worktree git lists is named from this checkout's mirror.
    const other = "2026-10-19-find-by-author";
    here.git("worktree", "add", "--quiet", "-b", `greenline/${other}`, ".claude/worktrees/x");
    here.write(
      `.claude/worktrees/x/.greenline/ledger/${other}.md`,
      ["---", "mode: quick", 'why: "w"', "choice: accepted", "state: open", "---", ""].join("\n"),
    );
    expect(fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit" }).out).toContain(
      `open in other worktrees: ${other} (in the worktree .claude/worktrees/x); each is worked on in its own checkout`,
    );
    // The record names another harness's model, which is no line this session corrects.
    expect(claude.out).toContain("agent: codex/gpt-6");
    expect(claude.out).not.toContain("write claude-code/");
  });
});

describe("J-151 S1 the surface line read from Codex's session: questions reply under exec", () => {
  /** A Codex rollout whose first line names the session's source, as `codex exec` writes it. */
  function rollout(here: Space, name: string, source: string): string {
    here.write(
      name,
      [
        JSON.stringify({
          type: "session_meta",
          payload: { id: "s", originator: `codex_${source}`, source },
        }),
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-sol" } }),
        "",
      ].join("\n"),
    );
    return join(here.root, name);
  }

  const EXEC_LINE = "surface: renders text; worktree no; questions reply";
  const CARDS_LINE = "surface: renders text; worktree no; questions cards";

  it("prints questions reply at an exec session's start and each turn's, whatever the payload's permission mode", () => {
    for (const record of [undefined, false] as const) {
      const here = space(record === false ? { record: false } : {});
      const transcript_path = rollout(here, ".rollout.jsonl", "exec");
      const started = fire(here, ["--harness", "codex"], {
        hook_event_name: "SessionStart",
        session_id: "x1",
        source: "startup",
        permission_mode: "default",
        transcript_path,
      });
      expect(started.out, String(record)).toContain(EXEC_LINE);
      for (const permission_mode of ["default", "plan", "bypassPermissions"]) {
        const turn = fire(here, ["--harness", "codex"], {
          hook_event_name: "UserPromptSubmit",
          session_id: "x1",
          turn_id: "t1",
          prompt: "p",
          permission_mode,
          transcript_path,
        });
        expect(turn.out, permission_mode).toContain(EXEC_LINE);
        expect(turn.out, permission_mode).not.toContain("questions cards");
      }
    }
  });

  it("prints an interactive session's row by its permission mode, and the first row where the payload says nothing", () => {
    const here = space();
    const transcript_path = rollout(here, ".rollout.jsonl", "cli");
    const turn = (payload: {
      readonly permission_mode?: string;
      readonly transcript_path?: string;
    }): string =>
      fire(here, ["--harness", "codex"], {
        hook_event_name: "UserPromptSubmit",
        session_id: "i1",
        ...payload,
      }).out;
    expect(turn({ permission_mode: "plan", transcript_path })).toContain(CARDS_LINE);
    expect(turn({ permission_mode: "default", transcript_path })).toContain(
      "surface: renders text; worktree no; questions reply",
    );
    // No permission mode and no transcript: the harness's first row, as before.
    expect(turn({})).toContain(CARDS_LINE);
    // A transcript the hook cannot read says nothing of the session.
    expect(
      turn({ permission_mode: "plan", transcript_path: join(here.root, "absent.jsonl") }),
    ).toContain(CARDS_LINE);
  });

  it("has status print the row the last turn's start read: the exec row, then a later plan-mode session's", () => {
    const here = space();
    const installation = fixtureInstallation();
    const status = (): string => {
      const writer = new RecordingWriter();
      runCli(["status"], writer.writer, "0.0.0-test", {
        cwd: here.root,
        version: "0.0.0-test",
        installation,
      });
      return writer.out;
    };
    fire(here, ["--harness", "codex"], {
      hook_event_name: "UserPromptSubmit",
      session_id: "x1",
      permission_mode: "default",
      transcript_path: rollout(here, ".exec.jsonl", "exec"),
    });
    expect(status()).toContain(
      "surface: codex, headless, codex exec: renders text; interactive no; delegation yes; worktree no; questions reply",
    );
    // The exec session's note is older than the plan-mode session's that follows it.
    const old = new Date("2026-10-19T11:00:00.000Z");
    utimesSync(join(here.root, ".greenline", "tmp", "sessions", "x1.surface.json"), old, old);
    fire(here, ["--harness", "codex"], {
      hook_event_name: "UserPromptSubmit",
      session_id: "i2",
      permission_mode: "plan",
      transcript_path: rollout(here, ".cli.jsonl", "cli"),
    });
    const printed = status();
    expect(printed).toContain(
      "surface: codex, CLI, plan mode: renders text; interactive yes; delegation yes; worktree no; questions cards",
    );
    expect(printed).not.toContain("headless, codex exec");
  });
});

describe("J-142 S2 and J-144 S1 the mirror carries the View row, on Claude Code and Codex alike", () => {
  it("prints the page the turn calls for in the facts block's View row while the viewer serves, and not serving otherwise", () => {
    for (const harness of ["claude-code", "codex"]) {
      const here = space();
      const quiet = fire(here, ["--harness", harness], { hook_event_name: "UserPromptSubmit" });
      expect(quiet.out, harness).toContain("| View | not serving |");
      writeAddressFile(here.root, 7433);
      const served = fire(here, ["--harness", harness], { hook_event_name: "UserPromptSubmit" });
      const context =
        harness === "claude-code"
          ? CONTEXT.parse(JSON.parse(served.out)).hookSpecificOutput.additionalContext
          : served.out;
      expect(context, harness).toContain(`| View | http://127.0.0.1:7433/changes/${ID} |`);
      expect(context, harness).not.toMatch(/^\s*view:/m);
      if (harness === "claude-code")
        expect(context.split("\n").slice(0, 5)).toEqual([
          `greenline: change ${ID}, quick, open.`,
          "facts:",
          "| Fact | Now |",
          "| --- | --- |",
          `| Change | ${ID} |`,
        ]);
    }
    // No change open: no facts block and no view of its own.
    const none = space({ record: false });
    writeAddressFile(none.root, 7433);
    const bare = fire(none, CLAUDE, { hook_event_name: "UserPromptSubmit", prompt: "hi" });
    const context = CONTEXT.parse(JSON.parse(bare.out)).hookSpecificOutput.additionalContext;
    expect(context).not.toContain("facts:");
    expect(context).not.toContain("view:");
    expect(context).not.toContain("progress:");
  });
});

describe("J-144 S3 the Codex adapter's instructions reach Codex at each turn's start", () => {
  it("prints the rule on the owner's words in Codex's context and not in Claude Code's", () => {
    const here = space();
    const codex = fire(here, ["--harness", "codex"], { hook_event_name: "UserPromptSubmit" });
    expect(codex.out).toContain(
      "reply: no skill's name, page link or quote of AGENTS.md reaches the owner",
    );
    const claude = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit" });
    expect(claude.out).not.toContain("quote of AGENTS.md");
  });
});

describe("J-144 S1 the mirror and greenline status print the same facts block and progress line", () => {
  it("prints the block's rows and the named-steps line, the line last, in the bytes status prints", () => {
    const here = space({ branch: `greenline/${ID}` });
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: regular",
        'why: "w"',
        "choice: accepted",
        "state: open",
        "ground: branch",
        "---",
        "",
        "## frame",
        "",
        "the intent",
        "",
        "## plan",
        "",
        "the acceptance",
        "",
      ].join("\n"),
    );
    const installation = fixtureInstallation();
    const writer = new RecordingWriter();
    runEventCli(["--harness", "codex"], writer.writer, {
      cwd: here.root,
      stdin: () => JSON.stringify({ hook_event_name: "UserPromptSubmit" }),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
      factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
      line: () => installation.modes,
    });
    const mirror = CONTEXT.parse(JSON.parse(writer.out))
      .hookSpecificOutput.additionalContext.trimEnd()
      .split("\n");
    const block = [
      "facts:",
      "| Fact | Now |",
      "| --- | --- |",
      `| Change | ${ID} |`,
      "| Mode | regular, 2 agents, 1 fix round |",
      "| Step | build, written |",
      `| Where | branch greenline/${ID} |`,
      "| View | not serving |",
    ];
    const progress =
      "progress: `retry · frame ✓ plan ✓ anticipate – build ▶ review · verify · close`";
    expect(mirror.slice(1, 9)).toEqual(block);
    expect(mirror.at(-1)).toBe(progress);
    const status = new RecordingWriter();
    runCli(["status"], status.writer, "0.0.0-test", {
      cwd: here.root,
      version: "0.0.0-test",
      installation,
    });
    const printed = status.out.split("\n");
    const at = printed.indexOf("facts:");
    expect(printed.slice(at, at + 9)).toEqual([...block, progress]);
    const json = new RecordingWriter();
    runCli(["status", "--json"], json.writer, "0.0.0-test", {
      cwd: here.root,
      version: "0.0.0-test",
      installation,
    });
    expect(
      z
        .object({ facts: z.array(z.object({ fact: z.string(), now: z.string() })) })
        .parse(JSON.parse(json.out)).facts,
    ).toEqual([
      { fact: "Change", now: ID },
      { fact: "Mode", now: "regular, 2 agents, 1 fix round" },
      { fact: "Step", now: "build, written" },
      { fact: "Where", now: `branch greenline/${ID}` },
      { fact: "View", now: "not serving" },
    ]);
  });
});

describe("J-129 S1 the mirror names the orientation while no change record exists", () => {
  /** A fixture with no change record and the files given committed on main. */
  function bare(files: Readonly<Record<string, string>>, commit = true): Space {
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
    write(
      ".greenline/manifest.json",
      JSON.stringify({ schemaVersion: 6, targets: ["claude-code"], checks: [] }),
    );
    for (const [path, text] of Object.entries(files)) write(path, text);
    if (commit) {
      git("add", ".");
      git("commit", "--quiet", "-m", "start");
    }
    return { root, git, write };
  }

  const mirrorOf = (where: Space): string =>
    CONTEXT.parse(
      JSON.parse(fire(where, CLAUDE, { hook_event_name: "UserPromptSubmit", prompt: "hi" }).out),
    ).hookSpecificOutput.additionalContext;

  it("names the survey of the documents on a tree of documents without code", () => {
    const mirror = mirrorOf(bare({ "README.md": "# r\n", "docs/brief.md": "# b\n" }));
    expect(mirror).toContain("greenline: no open change.");
    expect(mirror).toContain("  orientation: survey (documents, no code)");
  });

  it("names groundwork on an empty tree and the survey on a tree with code", () => {
    expect(mirrorOf(bare({}, false))).toContain("  orientation: groundwork (empty tree)");
    expect(mirrorOf(bare({ "src/app.ts": "export {};\n" }))).toContain("  orientation: survey\n");
  });

  it("prints no orientation once a change record exists", () => {
    const here = bare({ "src/app.ts": "export {};\n" });
    here.write(
      ".greenline/ledger/2026-10-01-done.md",
      [
        "---",
        "mode: quick",
        "choice: accepted",
        'why: "w"',
        "state: done",
        'outcome: "The change landed."',
        "---",
        "",
      ].join("\n"),
    );
    expect(mirrorOf(here)).not.toContain("orientation:");
  });
});

describe("J-130 S1 the mirror names the remote's kind, the fact the landing's offer reads", () => {
  const mirrorOf = (where: Space): string =>
    CONTEXT.parse(
      JSON.parse(fire(where, CLAUDE, { hook_event_name: "UserPromptSubmit", prompt: "hi" }).out),
    ).hookSpecificOutput.additionalContext;

  it("prints a file-path remote as no forge and a github.com URL as one, with a change open and with none", () => {
    const here = space();
    expect(mirrorOf(here)).toContain("\n  remote: none\n");
    const bare = mkdtempSync(join(tmpdir(), "greenline-origin-"));
    cleanup.push(bare);
    execFileSync("git", ["init", "--quiet", "--bare", bare]);
    here.git("remote", "add", "origin", bare);
    const open = mirrorOf(here);
    expect(open).toContain(`greenline: change ${ID}`);
    expect(open).toContain("\n  remote: origin, not a forge (a local path)\n");
    here.git("remote", "set-url", "origin", "git@github.com:owner/repo.git");
    expect(mirrorOf(here)).toContain("\n  remote: origin, a forge (github.com)\n");
    const none = space({ record: false });
    none.git("remote", "add", "origin", bare);
    const quiet = mirrorOf(none);
    expect(quiet).toContain("greenline: no open change.");
    expect(quiet).toContain("\n  remote: origin, not a forge (a local path)\n");
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
      `nothing outside the proposal's homes is written before the owner's yes: the write to ${join(here.root, "src/a.ts")} lies outside .greenline/ledger/ and .greenline/tmp/${ID}/, and .greenline/ledger/${ID}.md stands nowhere yet; propose the change and wait for the yes; owner-yes, greenline's harness hook\n`,
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
    // J-176 S1: an accepted record quotes the owner's yes.
    here.write(
      `.greenline/ledger/${ID}.md`,
      '---\nmode: quick\nchoice: accepted\nyes: "Yes."\nwhy: "w"\nstate: open\n---\n',
    );
    expect(fire(here, CLAUDE, write("src/a.ts")).code).toBe(0);
  });

  it("J-176 S1 refuses a shell command's redirect outside the homes as it refuses the write tool, and lets one into the homes and a read through", () => {
    const here = space({ branch: `greenline/${ID}`, record: false });
    const shell = (command: string) =>
      fire(here, CLAUDE, {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
        cwd: here.root,
      });
    const refused = shell("echo x > src/a.ts");
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("the write to src/a.ts lies outside .greenline/ledger/");
    expect(refused.err).toContain("owner-yes");
    expect(shell(`echo x > .greenline/tmp/${ID}/notes.md`).code).toBe(0);
    expect(shell("cat src/a.ts 2>/dev/null").code).toBe(0);
  });
});

describe("J-110 S1 greenline event: the visual home under an open change", () => {
  const write = (path: string) => ({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: path, content: "x" },
  });
  const after = (path: string) => ({ ...write(path), hook_event_name: "PostToolUse" });

  it("J-176 S1 refuses the open change's own folder in the home by hand, before the yes and after it, and another change's", () => {
    const here = space({ branch: `greenline/${ID}`, record: false });
    const own = fire(here, CLAUDE, write(`.greenline/visuals/${ID}/request.svg`));
    expect(own.code).toBe(2);
    expect(own.err).toContain("which greenline picture keep alone writes");
    const other = fire(here, CLAUDE, write(".greenline/visuals/2026-10-19-other/request.svg"));
    expect(other.code).toBe(2);
    expect(fire(here, CLAUDE, write(".greenline/visuals/map/architecture.html")).code).toBe(2);
  });

  it("refuses a visual written while no change is open", () => {
    const closed = space({
      record: ["choice: accepted", "state: done", 'outcome: "The change landed."'],
    });
    const refused = fire(closed, CLAUDE, write(".greenline/visuals/map/architecture.html"));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("no change is open on feature");
  });

  it("writes the change's links file after a tool once its folder holds a visual", () => {
    const here = space();
    const head = here.git("rev-parse", "HEAD");
    here.write(
      `.greenline/visuals/${ID}/request.visual.json`,
      JSON.stringify({
        schema: "greenline.visual/v1",
        title: "The request",
        form: "sequence",
        skill: "diagram-design",
        change: ID,
        commit: head,
        files: ["a.txt"],
        made: "2026-10-19",
        summary: "A request.",
      }),
    );
    here.write(`.greenline/visuals/${ID}/request.svg`, "<svg/>");
    expect(fire(here, CLAUDE, after(`.greenline/visuals/${ID}/request.svg`)).code).toBe(0);
    const links = readFileSync(join(here.root, ".greenline", "ledger", ID, "visuals.json"), "utf8");
    expect(links).toContain('"generatedBy": "greenline event"');
    expect(links).toContain(`"id": "${ID}/request"`);
  });
});

describe("J-129 S6 the pictures: the visual's maker held, and the reply's picture counted against its caps", () => {
  const manifest = (head: string): string =>
    JSON.stringify({
      schema: "greenline.visual/v1",
      title: "The request",
      form: "sequence",
      skill: "diagram-design",
      change: ID,
      commit: head,
      files: ["a.txt"],
      made: "2026-10-19",
      summary: "A request.",
    });
  /** A write after the tool, the root session's, or a fresh agent's where its id is given. */
  const written = (path: string, agent?: string): JsonValue => {
    const payload = {
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: path, content: "x" },
    };
    return agent === undefined ? payload : { ...payload, agent_id: agent };
  };
  const manifestText = (where: Space, slug: string): string =>
    readFileSync(join(where.root, `.greenline/visuals/${ID}/${slug}.visual.json`), "utf8");
  const MAKER = z.looseObject({ madeBy: z.enum(["agent", "session"]).optional() });
  const makerOf = (where: Space, slug: string): string | undefined =>
    MAKER.parse(JSON.parse(manifestText(where, slug))).madeBy;

  it("records madeBy: session for a visual the root session writes, which status and the mirror name", () => {
    const here = space();
    here.write(
      `.greenline/visuals/${ID}/request.visual.json`,
      manifest(here.git("rev-parse", "HEAD")),
    );
    here.write(`.greenline/visuals/${ID}/request.svg`, "<svg/>");
    expect(fire(here, CLAUDE, written(`.greenline/visuals/${ID}/request.svg`)).code).toBe(0);
    expect(makerOf(here, "request")).toBe("session");
    // Beside `made`, the manifest's other fields kept.
    expect(manifestText(here, "request")).toContain(
      '"made": "2026-10-19",\n  "madeBy": "session",\n  "summary": "A request."',
    );
    const status = new RecordingWriter();
    runCli(["status"], status.writer, "0.1.0", {
      cwd: here.root,
      version: "0.1.0",
      installation: fixtureInstallation(),
    });
    expect(status.out + status.err).toContain(`GL0604`);
    expect(status.out + status.err).toContain(
      `name the visual '${ID}/request', "The request", to the owner: the session drew it itself, not a fresh agent, and a durable visual is a fresh agent's; the reply offers no remake, which is the owner's ask alone`,
    );
    const mirror = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    // J-198 S1: the mirror names the fact and offers no remake, which only the owner asks for (j196t-conduct-empty finding 1).
    expect(mirror.out).toContain(
      `visuals the session made itself: ${ID}/request; a fresh agent makes each durable visual, so name it to the owner, and the reply offers no remake, which is the owner's ask alone`,
    );
    expect(mirror.out).not.toContain("may ask for the remake");
  });

  it("records madeBy: agent for one a fresh agent writes, and keeps session once the session wrote", () => {
    const here = space();
    const head = here.git("rev-parse", "HEAD");
    here.write(`.greenline/visuals/${ID}/flow.visual.json`, manifest(head));
    expect(
      fire(here, CLAUDE, written(`.greenline/visuals/${ID}/flow.visual.json`, "a1")).code,
    ).toBe(0);
    expect(makerOf(here, "flow")).toBe("agent");
    const mirror = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(mirror.out).not.toContain("visuals the session made itself");
    fire(here, CLAUDE, written(`.greenline/visuals/${ID}/flow.svg`));
    fire(here, CLAUDE, written(`.greenline/visuals/${ID}/flow.svg`, "a2"));
    expect(makerOf(here, "flow")).toBe("session");
  });

  it("records no maker where the harness names no fresh agent, so no visual is taken for the session's", () => {
    const here = space();
    here.write(
      `.greenline/visuals/${ID}/flow.visual.json`,
      manifest(here.git("rev-parse", "HEAD")),
    );
    const ran = fire(here, ["--harness", "gemini"], {
      hook_event_name: "AfterTool",
      session_id: "s1",
      tool_name: "write_file",
      tool_input: { file_path: `.greenline/visuals/${ID}/flow.visual.json` },
    });
    expect(ran.code).toBe(0);
    // The write reached the after-tool step, and the maker stays unrecorded there.
    expect(rawLog(here.root).map((line) => line.kind)).toContain("after-tool");
    expect(makerOf(here, "flow")).toBeUndefined();
  });

  it("counts a reply's 13-node picture where the reply's text reaches the hook, and the next mirror names it", () => {
    const here = space();
    const box = "┌──┐ ┌──┐ ┌──┐";
    const picture = ["```text", ...Array.from({ length: 4 }, () => box), "┌──┐", "```"].join("\n");
    fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    fire(here, CLAUDE, {
      hook_event_name: "Stop",
      session_id: "s1",
      last_assistant_message: `The parts:\n\n${picture}\n`,
    });
    const next = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(next.out).toContain(
      "picture: one past its cap at turn 1 (13 nodes, 14 columns; the caps are 12 and 72); draw the next within them, the part that decides",
    );
    const after = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(after.out).not.toContain("picture: one past its cap");
  });

  it("reads unrun where the harness hands no reply's text, and names nothing", () => {
    const here = space();
    fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s2" });
    fire(here, CLAUDE, { hook_event_name: "Stop", session_id: "s2" });
    expect(
      JSON.parse(readFileSync(join(here.root, ".greenline/tmp/sessions/s2.picture.json"), "utf8")),
    ).toEqual({ turn: 1, state: "unrun" });
    const next = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s2" });
    expect(next.out).not.toContain("picture:");
  });
});

describe("J-134 S2 an agent a method starts is not counted, and the check's captures carry no maker", () => {
  /** Fire an event with the modes definition the hook reads in a workspace. */
  const fireLined = (where: Space, payload: JsonValue): Fired => {
    const writer = new RecordingWriter();
    const code = runEventCli(CLAUDE, writer.writer, {
      cwd: where.root,
      stdin: () => JSON.stringify(payload),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
      line: () => fixtureInstallation().modes,
    });
    return { code, out: writer.out, err: writer.err };
  };
  /** A regular change with diagram-design and review installed, the lock listing them. */
  const installed = (): Space => {
    const here = space({ record: ["choice: accepted", "state: open"] });
    const roster = {
      ".claude/skills/diagram-design/SKILL.md":
        "# diagram-design\n\nOn the owner's yes a fresh agent draws it.\n",
      ".claude/skills/review/SKILL.md": "# review\n\nA fresh agent reviews.\n",
      ".claude/skills/tdd/SKILL.md": "# tdd\n",
    };
    for (const [path, text] of Object.entries(roster)) here.write(path, text);
    here.write(
      ".greenline/lock.json",
      serializeLock({
        schemaVersion: 5,
        cliVersion: "0.1.0",
        installationRevision: "0".repeat(64),
        sources: [],
        files: new Map(Object.keys(roster).map((path) => [path, "1".repeat(64)])),
      }),
    );
    return here;
  };
  /** The agent tool's launch with its prompt, then the agent's start. */
  const start = (where: Space, call: string, prompt: string, agent: string): void => {
    fireLined(where, {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Agent",
      tool_use_id: call,
      cwd: where.root,
      tool_input: { description: "d", subagent_type: "general-purpose", prompt },
    });
    fireLined(where, { hook_event_name: "SubagentStart", session_id: "s1", agent_id: agent });
  };
  const STARTS = z.object({ kind: z.string(), method: z.string().nullable().optional() });
  const starts = (where: Space): readonly z.infer<typeof STARTS>[] =>
    readFileSync(join(where.root, ".greenline", "tmp", ID, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => STARTS.parse(JSON.parse(line)))
      .filter((line) => line.kind === "agent-start");

  it("records an agent a method's brief starts with its method and leaves it out of the count; a step's agent is counted", () => {
    const here = installed();
    start(
      here,
      "c1",
      `You draw one durable diagram. First read ${here.root}/.claude/skills/diagram-design/SKILL.md whole.`,
      "a1",
    );
    start(
      here,
      "c2",
      "Draw the shelf's methods. Skill: .claude/skills/diagram-design/SKILL.md",
      "a2",
    );
    here.write(`.greenline/ledger/${ID}/brief-review-1.md`, "<the brief>\n");
    start(here, "c3", `.greenline/ledger/${ID}/brief-review-1.md`, "a3");
    expect(starts(here).map((line) => line.method)).toEqual([
      "diagram-design",
      "diagram-design",
      null,
    ]);
    const mirror = fireLined(here, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(mirror.out).toContain(
      "1 fresh agent counted in its events, and 2 by diagram-design that a method started, counted nowhere and listed nowhere, neither in the record's starts nor in its agents count",
    );
  });

  it("counts an agent whose prompt names neither a step nor a method, and one whose prompt the hook cannot read", () => {
    const here = installed();
    start(here, "c0", "Fix the bug; the build followed .claude/skills/tdd/SKILL.md", "a0");
    expect(starts(here).map((line) => line.method)).toEqual([null]);
    start(here, "c1", "Review the change for mistakes.", "a1");
    fireLined(here, { hook_event_name: "SubagentStart", session_id: "s1", agent_id: "a2" });
    expect(starts(here).map((line) => line.method)).toEqual([null, null, null]);
    const mirror = fireLined(here, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(mirror.out).toContain("3 fresh agents counted in its events;");
  });

  it("reads the limit met at the close with the method's agents named apart, whether the record counted them or not", () => {
    const here = installed();
    start(here, "c1", "Read .claude/skills/diagram-design/SKILL.md and draw.", "a1");
    start(here, "c2", "Read .claude/skills/diagram-design/SKILL.md and draw.", "a2");
    here.write(`.greenline/ledger/${ID}/brief-review-1.md`, "<the brief>\n");
    start(here, "c3", `.greenline/ledger/${ID}/brief-review-1.md`, "a3");
    const status = (agents: number): string => {
      here.write(
        `.greenline/ledger/${ID}.md`,
        [
          "---",
          "mode: regular",
          "choice: accepted",
          'why: "w"',
          "state: open",
          `agents: ${String(agents)}`,
          "rounds: 1",
          "---",
          "",
        ].join("\n"),
      );
      const writer = new RecordingWriter();
      runCli(["status", "--change", ID], writer.writer, "0.1.0", {
        cwd: here.root,
        version: "0.1.0",
        installation: fixtureInstallation(),
      });
      return writer.out + writer.err;
    };
    for (const agents of [2, 4]) {
      const read = status(agents);
      expect(read, String(agents)).not.toContain("over the mode's");
      expect(read, String(agents)).toContain(
        "agents: 2 of 2, and 2 by diagram-design that a method started, counted nowhere and listed nowhere, neither in the record's starts nor in its agents count",
      );
    }
    // The mirror at the close agrees with status on a done record that counted them.
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: regular",
        "choice: accepted",
        'why: "w"',
        "state: done",
        'outcome: "The change landed."',
        "agents: 4",
        "rounds: 1",
        "---",
        "",
      ].join("\n"),
    );
    // A done record is the change of its own branch, where the mirror reads it at the close.
    here.git("checkout", "--quiet", "-b", `greenline/${ID}`);
    const closed = fireLined(here, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(closed.out).toContain("1 fresh agent counted in its events, and 2 by diagram-design");
    expect(closed.out).not.toContain("the events counted");
    // A cost past the limit with the methods counted out still stands, naming them apart.
    expect(status(5)).toContain(
      "  the open change '2026-10-19-retry' does not match what its mode asks of this record: it cost 5 agents and 1 rounds, agents: 3 of 2, and 2 by diagram-design that a method started, counted nowhere and listed nowhere, neither in the record's starts nor in its agents count; over the mode's 2 and",
    );
  });

  it("stamps no maker on a capture's manifest a shell command writes, and status raises no GL0604 for it", () => {
    const here = space();
    const capture = JSON.stringify({
      schema: "greenline.visual/v1",
      title: "Capture of /",
      form: "capture",
      skill: "verify",
      change: ID,
      commit: here.git("rev-parse", "HEAD"),
      files: ["a.txt"],
      made: "2026-10-27T03:40:23.151Z",
      summary: "/ at 1440, 768, 390: floor 0 red, reflex 0 red, finish 0",
      capture: {
        address: "/",
        widths: [1440, 768, 390],
        scores: { floor: 0, reflex: 0, finish: 0 },
      },
    });
    const path = `.greenline/visuals/${ID}/capture-home.visual.json`;
    const check = "greenline check interface --url http://127.0.0.1:4173 --path /";
    const bash = (name: string): JsonValue => ({
      hook_event_name: name,
      session_id: "s1",
      tool_name: "Bash",
      tool_use_id: "cap-1",
      cwd: here.root,
      tool_input: { command: check },
    });
    fire(here, CLAUDE, bash("PreToolUse"), new Date().toISOString());
    here.write(path, capture);
    here.write(`.greenline/visuals/${ID}/capture-home.html`, "<html></html>");
    fire(here, CLAUDE, bash("PostToolUse"), new Date().toISOString());
    // A write tool's write of the capture takes no maker either.
    fire(here, CLAUDE, {
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: `.greenline/visuals/${ID}/capture-home.html`, content: "x" },
    });
    expect(readFileSync(join(here.root, path), "utf8")).not.toContain("madeBy");
    const status = new RecordingWriter();
    runCli(["status"], status.writer, "0.1.0", {
      cwd: here.root,
      version: "0.1.0",
      installation: fixtureInstallation(),
    });
    expect(status.out + status.err).not.toContain("GL0604");
    const mirror = fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(mirror.out).not.toContain("visuals the session made itself");
  });
});

describe("J-176 S1 the owed line: the first code write names the skills a build owes by their trigger rows", () => {
  /** An installation whose trigger rows owe the fixture's habit at a regular or careful build. */
  const installation = fixtureInstallation({
    triggers: {
      schema: "greenline.triggers/v1",
      skills: [
        {
          name: "grilling",
          kind: "habit",
          rows: [{ steps: ["build"], modes: ["regular", "careful"], weight: 1, read: "part" }],
        },
      ],
    },
  });
  /** A change at the mode given, open at build. */
  const workspace = (mode: string): Space => {
    const here = space();
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        `mode: ${mode}`,
        'why: "w"',
        "choice: accepted",
        'yes: "Yes."',
        "state: open",
        'next: "build: write the cache"',
        "---",
        "",
      ].join("\n"),
    );
    return here;
  };
  const fired = (where: Space, payload: JsonValue): Fired => {
    const writer = new RecordingWriter();
    const code = runEventCli(CLAUDE, writer.writer, {
      cwd: where.root,
      stdin: () => JSON.stringify(payload),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
      factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
      installation: () => installation,
    });
    return { code, out: writer.out, err: writer.err };
  };
  const write = (where: Space, path: string): Fired =>
    fired(where, {
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: join(where.root, path), content: "x" },
    });
  const contextOf = (out: Fired): string =>
    out.out === "" ? "" : CONTEXT.parse(JSON.parse(out.out)).hookSpecificOutput.additionalContext;

  it("J-195 S3 prints the operator's rabbithole phrase once, at the third edit of the same file with no passing recorded check, and the next turn's mirror repeats it", () => {
    const here = workspace("quick");
    expect(contextOf(write(here, "src/fees.js"))).not.toContain("nudge:");
    expect(contextOf(write(here, "src/fees.js"))).not.toContain("nudge:");
    const third = contextOf(write(here, "src/fees.js"));
    expect(third).toContain(
      "nudge: are you in a rabbithole duct taping custom fixes together? is there a native way of doing this that would be cleaner? (src/fees.js each edited three times since the last passing recorded check); rabbithole, greenline's harness hook",
    );
    expect(contextOf(write(here, "src/fees.js"))).not.toContain("nudge:");
    const mirror = fired(here, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(mirror.out).toContain("nudge: are you in a rabbithole");
    const later = fired(here, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(later.out).not.toContain("nudge:");
  });

  it("names the owed skill at a regular change's first code write, and nowhere after; the mirror carries it beside the situation", () => {
    const here = workspace("regular");
    // A write inside the homes, or under greenline's own folder as the design step's rulings, is no code write.
    expect(contextOf(write(here, `.greenline/tmp/${ID}/notes.md`))).toBe("");
    expect(contextOf(write(here, ".greenline/DECISIONS.md"))).toBe("");
    expect(contextOf(write(here, "src/cache.js"))).toContain("owes: grilling (its front");
    expect(contextOf(write(here, "src/shelf.js"))).not.toContain("owes:");
    const mirror = fired(here, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    expect(mirror.out).toContain("owes: grilling (its front");
    expect(mirror.out).toContain("situation: mode ");
  });

  it("names nothing once the skill is loaded, or at quick", () => {
    const loaded = workspace("regular");
    // A load the hooks noted for the change, as the skill facts hold it.
    loaded.write(
      `.greenline/ledger/${ID}/skills/2026-10-19.jsonl`,
      `${JSON.stringify({ skill: "grilling", file: "SKILL.md", whole: true, via: "Skill", at: "2026-10-19T10:00:00.000Z", step: "build", agent: null, session: "s1", turn: 1 })}\n`,
    );
    expect(contextOf(write(loaded, "src/cache.js"))).not.toContain("owes:");
    expect(contextOf(write(workspace("quick"), "src/cache.js"))).not.toContain("owes:");
  });
});

describe("J-189 S1 the owes line: the change's own request, the whole obligation, cleared once loaded, absent with no change open", () => {
  /** Trigger rows as the corpus carries them for the walk's request: tdd by its words at build, two starts and a habit by stray words. */
  const installation = fixtureInstallation({
    skills: [
      ...fixtureSkills,
      {
        name: "verify-formally",
        description: "Check a property over every order, not just the tested ones.",
        kind: "start",
        activation: "implicit",
        body: "# Verify formally\n\nState the property, then walk every order.\n",
      },
    ],
    triggers: {
      schema: "greenline.triggers/v1",
      skills: [
        {
          name: "grilling",
          kind: "habit",
          rows: [{ words: ["with tests"], steps: ["build"], weight: 2, read: "whole" }],
        },
        {
          name: "verify-formally",
          kind: "start",
          rows: [{ words: ["not just tested", "fails"], weight: 3, read: "whole" }],
        },
      ],
    },
  });
  /** A clock a minute on at each event, so the journal and the namings read in their order. */
  const clock = (): (() => Date) => {
    let minute = 0;
    return () => new Date(Date.UTC(2026, 10, 7, 9, (minute += 1)));
  };
  const fired = (where: Space, now: () => Date, payload: JsonValue): Fired => {
    const writer = new RecordingWriter();
    const code = runEventCli(CLAUDE, writer.writer, {
      cwd: where.root,
      stdin: () => JSON.stringify(payload),
      now,
      factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
      installation: () => installation,
    });
    return { code, out: writer.out, err: writer.err };
  };
  const says = (where: Space, now: () => Date, prompt: string): Fired =>
    fired(where, now, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt });
  /** The session writes a change's record, naming it, and the record stands with the lines given. */
  const writes = (where: Space, now: () => Date, id: string, lines: readonly string[]): void => {
    fired(where, now, {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: join(where.root, `.greenline/ledger/${id}.md`), content: "x" },
    });
    where.write(
      `.greenline/ledger/${id}.md`,
      ["---", "mode: regular", 'why: "the shelf"', "choice: owner", ...lines, "---", ""].join("\n"),
    );
  };

  it("J-189 S1 states the build's obligation whole at plan, from the owner's own words, and clears it once loaded", () => {
    const here = space({ record: false });
    const now = clock();
    says(here, now, "Add a findByYear range to the shelf, with tests.");
    writes(here, now, ID, ["state: open", 'next: "plan: the range"']);
    const atPlan = says(here, now, "Yes.").out;
    expect(atPlan).toContain("owes: grilling (whole: the request says with tests, at build)");
    // Loaded, the line clears at the next mirror.
    here.write(
      `.greenline/ledger/${ID}/skills/2026-11-07.jsonl`,
      `${JSON.stringify({ skill: "grilling", file: "SKILL.md", whole: true, via: "Skill", at: "2026-11-07T09:10:00.000Z", step: "plan", agent: null, session: "s1", turn: 2 })}\n`,
    );
    expect(says(here, now, "Go on.").out).not.toContain("owes:");
  });

  it("J-189 S1 reads no keyword from a fresh agent's notification, and prints no owes line while no change is open", () => {
    const here = space({ record: false });
    const now = clock();
    // No change open: the owner's words hold a row's keyword, and no line is printed.
    expect(says(here, now, "Add a findByYear range to the shelf, with tests.").out).not.toContain(
      "owes:",
    );
    writes(here, now, ID, ["state: open", 'next: "build: the range"']);
    const notice =
      "<task-notification>\n<summary>Agent finished: the old test fails, not just tested</summary>\n</task-notification>";
    const after = says(here, now, notice).out;
    expect(after).toContain("owes: grilling");
    expect(after).not.toContain("verify-formally");
  });

  it("J-189 S1 never charges a skill an earlier change's request owed to a later change", () => {
    const here = space({ record: false });
    const now = clock();
    says(here, now, "Can a book be lent twice? I want to be sure, not just tested.");
    writes(here, now, "2026-11-07-verify", ["state: open", 'next: "build: the walk"']);
    expect(says(here, now, "Yes.").out).toContain("owes: verify-formally");
    // The verification closes and lands; the next request opens the figure in the turn after it.
    writes(here, now, "2026-11-07-verify", ["state: done", "next: none"]);
    here.git("add", "--all");
    here.git("commit", "--quiet", "-m", "verify done");
    says(here, now, "Make me a figure of a loan.");
    writes(here, now, "2026-11-07-figure", ["state: open", 'next: "build: the figure"']);
    const figure = says(here, now, "Carry on with the figure.").out;
    expect(figure).not.toContain("verify-formally");
  });
});

describe("J-203 S1 the owes line from the request's words at a turn's start with no change open (j196c-merged-skills thread two, j196t-state-machines)", () => {
  /** The corpus's rows for the runs' requests: a habit by a simplify request, a start by the owner's phrase, a habit only at build. */
  const installation = fixtureInstallation({
    skills: [
      ...fixtureSkills,
      {
        name: "verify-formally",
        description: "Check a property over every order, not just the tested ones.",
        kind: "start",
        activation: "implicit",
        body: "# Verify formally\n\nState the property, then walk every order.\n",
      },
    ],
    triggers: {
      schema: "greenline.triggers/v1",
      skills: [
        {
          name: "grilling",
          kind: "habit",
          rows: [
            { words: ["simplify", "tidy"], weight: 1, read: "part" },
            { words: ["with tests"], steps: ["build"], weight: 2, read: "whole" },
          ],
        },
        {
          name: "verify-formally",
          kind: "start",
          rows: [
            {
              words: ["find all of the implicit state machines in my app", "state machines"],
              weight: 3,
              read: "whole",
            },
          ],
        },
      ],
    },
  });
  const clock = (): (() => Date) => {
    let minute = 0;
    return () => new Date(Date.UTC(2026, 10, 8, 6, (minute += 1)));
  };
  const fired = (where: Space, now: () => Date, payload: JsonValue): Fired => {
    const writer = new RecordingWriter();
    const code = runEventCli(CLAUDE, writer.writer, {
      cwd: where.root,
      stdin: () => JSON.stringify(payload),
      now,
      factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
      installation: () => installation,
    });
    return { code, out: writer.out, err: writer.err };
  };
  const says = (where: Space, now: () => Date, prompt: string): Fired =>
    fired(where, now, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt });

  it("names the habit a simplify request owes at the turn's start where the answer opens no change, and clears it once the turn loads it", () => {
    const here = space({ record: false });
    const now = clock();
    const asked = says(here, now, "In regular mode: simplify the shelf module in src/shelf.js.");
    expect(asked.out).toContain(
      "owes: grilling (its front: the request says simplify); read what the line names before the step that uses it",
    );
    // The turn reads the page: the session's fact holds the load, and the next mirror the words reach owes nothing.
    here.write(
      ".greenline/ledger/sessions/2026-11-08-s1.jsonl",
      `${JSON.stringify({ skill: "grilling", file: "SKILL.md", whole: true, via: "Skill", at: "2026-11-08T06:01:30.000Z", step: null, agent: null, turn: 1, noted: null })}\n`,
    );
    const resumed = fired(here, now, { hook_event_name: "SessionStart", session_id: "s1" });
    expect(resumed.out).toContain("situation: mode regular");
    expect(resumed.out).not.toContain("owes:");
    // A load from before the request meets nothing: the next request owes the habit again.
    expect(says(here, now, "Your call, tidy whatever in it is worth it.").out).toContain(
      "owes: grilling (its front: the request says tidy)",
    );
  });

  it("names the start the owner's phrase owes whole, and no row a step holds while no change is open", () => {
    const here = space({ record: false });
    const now = clock();
    expect(says(here, now, "find all of the implicit state machines in my app").out).toContain(
      "owes: verify-formally (whole: the request says find all of the implicit state machines in my app)",
    );
    expect(says(here, now, "Add a findByYear range to the shelf, with tests.").out).not.toContain(
      "owes:",
    );
  });

  it("J-207 S1 names the habit with the earlier change done on the branch, as j196c-merged-skillsb 002/001 asked with no change open, and status prints it too", () => {
    // The run's branch was the done change's own, so the branch still held that change.
    const here = space({ branch: `greenline/${ID}`, record: ["choice: owner", "state: done"] });
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "done");
    const now = clock();
    const asked = says(
      here,
      now,
      "In regular mode: simplify the shelf module in src/shelf.js, it has grown three ways of doing the same thing.",
    );
    expect(asked.out).toContain(
      "owes: grilling (its front: the request says simplify); read what the line names before the step that uses it",
    );
    const status = new RecordingWriter();
    runCli(["status"], status.writer, "0.0.0-test", {
      cwd: here.root,
      version: "0.0.0-test",
      installation,
    });
    expect(status.out).toContain("owes: grilling (its front: the request says simplify)");
    // A row that holds on the words alone owes its skill whatever its read: a start's whole read beside a habit's front.
    const stopped = space({
      branch: `greenline/${ID}`,
      record: ["choice: owner", "state: stopped"],
    });
    expect(
      says(stopped, now, "simplify it, then find all of the implicit state machines in my app").out,
    ).toContain(
      "owes: verify-formally (whole: the request says find all of the implicit state machines in my app); grilling (its front: the request says simplify)",
    );
  });
});

describe("J-176 S1 the turn's end holds nothing: no picture owed, no offer and no hold", () => {
  const box = "┌──┐ ┌──┐ ┌──┐";
  const past = ["```text", ...Array.from({ length: 4 }, () => box), "┌──┐", "```"].join("\n");

  for (const [harness, argv] of [
    ["claude-code", CLAUDE],
    ["codex", ["--harness", "codex"]],
  ] as const)
    it(`lets a reply with a picture past its cap and no offer end its turn on ${harness}, and writes nothing under the visual home`, () => {
      const here = space();
      fire(here, argv, { hook_event_name: "UserPromptSubmit", session_id: "t1", prompt: "go" });
      const ended = fire(here, argv, {
        hook_event_name: "Stop",
        session_id: "t1",
        last_assistant_message: `The parts:\n\n${past}\n\nWaiting on: your yes.`,
      });
      expect(ended.code).toBe(0);
      expect(ended.err).toBe("");
      expect(existsSync(join(here.root, ".greenline", "visuals", ID))).toBe(false);
    });
});

describe("J-147 S1 and S3 the home after a write: the reach, the refused manifest, the documents and the pin", () => {
  const head = (where: Space): string => where.git("rev-parse", "HEAD");
  const manifestText = (commit: string, files: readonly string[]): string =>
    JSON.stringify({
      schema: "greenline.visual/v1",
      title: "The loan's path",
      form: "sequence",
      skill: "diagram-design",
      change: ID,
      commit,
      files,
      made: "2026-10-28",
      summary: "How a loan becomes the overdue letter.",
    });
  const wrote = (where: Space, path: string, agent = "agent-1"): Fired =>
    fire(where, CLAUDE, {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(where.root, path), content: "x" },
      agent_id: agent,
    });

  it("records the address a written HTML visual loads, and the mirror names it", () => {
    const here = space();
    const folder = `.greenline/visuals/${ID}`;
    here.write(`${folder}/flow.visual.json`, manifestText(head(here), ["a.txt"]));
    here.write(`${folder}/flow.html`, '<script src="https://cdn.example.com/d3.js"></script>');
    wrote(here, `${folder}/flow.html`);
    const kept = JSON.parse(readFileSync(join(here.root, `${folder}/flow.visual.json`), "utf8"));
    expect(kept.reaches).toEqual(["https://cdn.example.com/d3.js"]);
    expect(
      fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "r1" }).out,
    ).toContain(
      `visuals reaching outside the repository: ${ID}/flow loads https://cdn.example.com/d3.js; a durable visual keeps its bytes in the home, so name it to the owner, and the reply offers no remake, which is the owner's ask alone`,
    );
  });

  it("refuses a map's manifest naming a file its commit does not hold, before the write", () => {
    const here = space();
    // A change's own folder is greenline picture keep's alone (J-176 S1); the map's manifest is read here.
    const path = join(here.root, ".greenline/visuals/map/map.visual.json");
    const refused = fire(here, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: path, content: manifestText(head(here), ["a.txt", "src/loans.js"]) },
    });
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(
      `the manifest .greenline/visuals/map/map.visual.json is not written: it names src/loans.js, which its commit ${head(here).slice(0, 7)} does not hold`,
    );
    expect(refused.err).toContain("; manifest-files, greenline's harness hook");
    const allowed = fire(here, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: path, content: manifestText(head(here), ["a.txt"]) },
    });
    expect(allowed.code).toBe(0);
  });

  it("keeps a listed document the change wrote at HEAD, and pins the change's visuals once the record reads done", () => {
    const here = space();
    here.write("README.md", "# shelf\n");
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "readme");
    const before = head(here);
    here.write(
      ".greenline/visuals/documents.json",
      JSON.stringify({
        schema: "greenline.documents/v1",
        documents: [
          {
            path: "README.md",
            author: "practice",
            files: ["a.txt"],
            commit: "0".repeat(7),
            change: null,
          },
        ],
      }),
    );
    wrote(here, "README.md");
    const index = JSON.parse(
      readFileSync(join(here.root, ".greenline/visuals/documents.json"), "utf8"),
    );
    expect(index.documents[0]).toEqual(expect.objectContaining({ commit: before, change: ID }));
    here.write(`.greenline/visuals/${ID}/flow.visual.json`, manifestText(before, ["a.txt"]));
    // A later commit touches no file the picture covers, so the close moves its commit (J-216 S1).
    here.write("b.txt", "b\n");
    here.git("add", "b.txt");
    here.git("commit", "--quiet", "-m", "a");
    const closing = head(here);
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        'why: "w"',
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        "---",
        "",
      ].join("\n"),
    );
    wrote(here, `.greenline/ledger/${ID}.md`);
    const pinned = JSON.parse(
      readFileSync(join(here.root, `.greenline/visuals/${ID}/flow.visual.json`), "utf8"),
    );
    expect(pinned.commit).toBe(closing);
  });
});

describe("J-147 the review's fix cycle: the close's pin is made once, before the concluding commit", () => {
  it("pins the change's visuals and documents when the record goes done, and touches nothing after the commit that holds it done", () => {
    const here = space();
    here.write("README.md", "# shelf\n");
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "readme");
    const before = here.git("rev-parse", "HEAD");
    const manifestPath = `.greenline/visuals/${ID}/flow.visual.json`;
    here.write(
      manifestPath,
      JSON.stringify({
        schema: "greenline.visual/v1",
        title: "The loan's path",
        form: "sequence",
        skill: "diagram-design",
        change: ID,
        commit: before,
        files: ["a.txt"],
        made: "2026-10-28",
        summary: "How a loan travels.",
      }),
    );
    here.write(
      ".greenline/visuals/documents.json",
      JSON.stringify({
        schema: "greenline.documents/v1",
        documents: [
          { path: "README.md", author: "practice", files: ["a.txt"], commit: before, change: ID },
        ],
      }),
    );
    // A later commit touches no file the picture covers, so the close moves its commit (J-216 S1).
    here.write("b.txt", "b\n");
    here.git("add", "b.txt");
    here.git("commit", "--quiet", "-m", "a");
    const closing = here.git("rev-parse", "HEAD");
    here.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        'why: "w"',
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        "---",
        "",
      ].join("\n"),
    );
    const wrote = (): Fired =>
      fire(here, CLAUDE, {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: join(here.root, `.greenline/ledger/${ID}.md`), content: "x" },
      });
    wrote();
    const read = (path: string): { commit?: string; documents?: { commit: string }[] } =>
      JSON.parse(readFileSync(join(here.root, path), "utf8"));
    expect(read(manifestPath).commit).toBe(closing);
    expect(read(".greenline/visuals/documents.json").documents?.[0]?.commit).toBe(closing);
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "close");
    wrote();
    expect(read(manifestPath).commit).toBe(closing);
  });
});

describe("J-117 S1 greenline event: the frame map beside the record", () => {
  const after = {
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: `.greenline/ledger/${ID}.md`, content: "x" },
  };
  const record = (frame: string): string =>
    [
      "---",
      "mode: careful",
      'why: "w"',
      "choice: accepted",
      "state: open",
      "---",
      "",
      "## frame",
      "",
      frame,
      "",
    ].join("\n");
  const mapPath = (root: string): string =>
    join(root, ".greenline", "ledger", ID, "frame-map.json");

  it("derives the map from the frame section after a tool, and rewrites it when the section changes", () => {
    const here = space({ record: false });
    here.write(
      `.greenline/ledger/${ID}.md`,
      record("- Q1 [scope] In or out?\n  - proposed: in\n  - answer: in\n  - decided: owner"),
    );
    expect(fire(here, CLAUDE, after).code).toBe(0);
    const first = readFileSync(mapPath(here.root), "utf8");
    expect(first.startsWith('{\n  "generatedBy": "greenline event",')).toBe(true);
    expect(first).toContain('"question": "In or out?"');
    here.write(
      `.greenline/ledger/${ID}.md`,
      record("- Q1 [scope] In or out?\n  - proposed: in\n- closed [data]: nothing stored"),
    );
    expect(fire(here, CLAUDE, after).code).toBe(0);
    expect(readFileSync(mapPath(here.root), "utf8")).toContain('"reason": "nothing stored"');
  });

  it("writes no map while the frame section holds no frame yet", () => {
    const here = space({ record: false });
    here.write(`.greenline/ledger/${ID}.md`, record("<the builder's section>"));
    expect(fire(here, CLAUDE, after).code).toBe(0);
    expect(existsSync(mapPath(here.root))).toBe(false);
  });
});

describe("J-133 S1 greenline event: an interface file a shell command wrote", () => {
  const FLOOR = "export const Open = () => <div onClick={open}>Open</div>;\n";
  const INTERFACE = {
    interface: {
      roots: ["src/components"],
      extensions: ["tsx"],
      platform: "web",
      frameworks: ["react"],
      evidence: [],
      confirmed: true,
      check: true,
    },
  };
  const shell = (where: Space, name: string, call: string, command: string): JsonValue => ({
    hook_event_name: name,
    tool_name: "Bash",
    tool_use_id: call,
    cwd: where.root,
    tool_input: { command },
  });

  it("returns the static engines' findings on the files the command wrote under an interface root, naming each path", () => {
    const here = space({
      manifest: INTERFACE,
      record: ["choice: accepted", "state: open", 'interface: "yes, app"'],
    });
    // A file written long before the command is never read as its write.
    here.write("src/components/Old.tsx", FLOOR);
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(join(here.root, "src/components/Old.tsx"), hourAgo, hourAgo);
    const command = "python3 - <<'EOF'\nopen('src/components/Open.tsx', 'w').write(source)\nEOF";
    const start = new Date().toISOString();
    expect(fire(here, CLAUDE, shell(here, "PreToolUse", "s1", command), start).code).toBe(0);
    here.write("src/components/Open.tsx", FLOOR);
    // The home the command wrote is read too, and greenline's own files never are.
    here.write(
      "DESIGN.md",
      '---\nname: App\ncolors:\n  accent: "#dc2626"\n---\n\n## Overview\n\nApp.\n',
    );
    here.write(`.greenline/visuals/${ID}/capture-home.html`, "<div onClick={open}>x</div>\n");
    const after = fire(
      here,
      CLAUDE,
      shell(here, "PostToolUse", "s1", command),
      new Date().toISOString(),
    );
    expect(after.code).toBe(0);
    const context = CONTEXT.parse(JSON.parse(after.out)).hookSpecificOutput.additionalContext;
    expect(context).toContain(
      "greenline interface rules on DESIGN.md, src/components/Open.tsx, written by a shell command:\n",
    );
    expect(context).toContain("keyboard-operable");
    expect(context).not.toContain("Old.tsx");
    // The interface rules never read greenline's own files; the write into the change's folder its words hid is named apart (J-227 S1).
    const rules = context.split("\n").filter((line) => !line.startsWith("the command wrote "));
    expect(rules.join("\n")).not.toContain("capture-home");
    expect(context).toContain(
      `the command wrote .greenline/visuals/${ID}/capture-home.html in a change's folder of the visual home, which its words did not show`,
    );
  });

  it("reads a broad command's first twenty files and names how many more it wrote", () => {
    const here = space({
      manifest: INTERFACE,
      record: ["choice: accepted", "state: open", 'interface: "yes, app"'],
    });
    const start = new Date().toISOString();
    fire(here, CLAUDE, shell(here, "PreToolUse", "s3", "npx prettier --write src"), start);
    for (let index = 10; index < 35; index += 1)
      here.write(`src/components/Open${String(index)}.tsx`, FLOOR);
    const after = fire(
      here,
      CLAUDE,
      shell(here, "PostToolUse", "s3", "npx prettier --write src"),
      new Date().toISOString(),
    );
    const context = CONTEXT.parse(JSON.parse(after.out)).hookSpecificOutput.additionalContext;
    expect(context).toContain(
      "written by a shell command (and 5 more, which greenline check interface reads):\n",
    );
    expect(context).toContain("src/components/Open29.tsx");
    expect(context).not.toContain("src/components/Open30.tsx");
  });

  it("returns nothing after a command that wrote no interface file", () => {
    const here = space({
      manifest: INTERFACE,
      record: ["choice: accepted", "state: open", 'interface: "yes, app"'],
    });
    here.write("src/components/Old.tsx", FLOOR);
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(join(here.root, "src/components/Old.tsx"), hourAgo, hourAgo);
    const start = new Date().toISOString();
    fire(here, CLAUDE, shell(here, "PreToolUse", "s2", "ls src"), start);
    here.write("notes.txt", "n\n");
    const after = fire(
      here,
      CLAUDE,
      shell(here, "PostToolUse", "s2", "ls src"),
      new Date().toISOString(),
    );
    expect(after.code).toBe(0);
    expect(after.out).toBe("");
  });
});

describe("J-135 S2 a shell command's writes under the homes are the hooks' facts", () => {
  const DAY = new Date().toISOString().slice(0, 10);
  /** The installed roster a load reads, placed with the lock that lists it. */
  const withRoster = (where: Space): void => {
    const roster = {
      ".claude/skills/frame/SKILL.md": "# frame\n",
      ".claude/skills/tdd/SKILL.md": "# tdd\n",
    };
    for (const [path, text] of Object.entries(roster)) where.write(path, text);
    where.write(
      ".greenline/lock.json",
      serializeLock({
        schemaVersion: 5,
        cliVersion: "0.1.0",
        installationRevision: "0".repeat(64),
        sources: [],
        files: new Map(Object.keys(roster).map((path) => [path, "1".repeat(64)])),
      }),
    );
  };
  const recordText = (state: string, frame = "<the builder's section>"): string =>
    [
      "---",
      "mode: careful",
      'why: "w"',
      "choice: accepted",
      `state: ${state}`,
      ...(state === "stopped" ? ['next: "frame: ask the owner"'] : []),
      "---",
      "",
      "## frame",
      "",
      frame,
      "",
    ].join("\n");
  /** A Bash call's event as Claude Code pipes it, its duration given after it. */
  const bash = (
    where: Space,
    name: string,
    call: string,
    command: string,
    extra: Record<string, JsonValue> = {},
  ): JsonValue => ({
    hook_event_name: name,
    session_id: "s1",
    tool_name: "Bash",
    tool_use_id: call,
    cwd: where.root,
    tool_input: { command },
    ...extra,
  });
  const skill = (where: Space, name: string): JsonValue => ({
    hook_event_name: "PreToolUse",
    session_id: "s1",
    tool_name: "Skill",
    tool_use_id: `skill-${name}`,
    cwd: where.root,
    tool_input: { skill: name },
  });
  const changeLoads = (where: Space, id = ID) => {
    const path = join(where.root, ".greenline", "ledger", id, "skills", `${DAY}.jsonl`);
    return existsSync(path) ? parseChangeLoads(readFileSync(path, "utf8")) : [];
  };
  const sessionLines = (where: Space) => {
    const path = join(where.root, ".greenline", "ledger", "sessions", `${DAY}-s1.jsonl`);
    return existsSync(path) ? parseSessionFact(readFileSync(path, "utf8")) : [];
  };
  const HEREDOC = `cat > .greenline/ledger/${ID}.md <<'EOF'\n---\nstate: open\nEOF`;

  it("names the change whose record a shell heredoc writes, joining the loads before it, and the next load lands in the change", () => {
    const here = space({ record: false });
    withRoster(here);
    fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    fire(here, CLAUDE, skill(here, "frame"), new Date().toISOString());
    expect(changeLoads(here)).toEqual([]);
    // No change is open before the command, so its start is its end less the duration the harness gave.
    fire(here, CLAUDE, bash(here, "PreToolUse", "h1", HEREDOC), new Date().toISOString());
    here.write(`.greenline/ledger/${ID}.md`, recordText("open"));
    const after = fire(
      here,
      CLAUDE,
      bash(here, "PostToolUse", "h1", HEREDOC, { duration_ms: 5000 }),
      new Date().toISOString(),
    );
    expect(after.code).toBe(0);
    expect(sessionLines(here)).toContainEqual(expect.objectContaining({ change: ID }));
    expect(changeLoads(here).map((load) => load.skill)).toEqual(["frame"]);
    fire(here, CLAUDE, skill(here, "tdd"), new Date().toISOString());
    expect(changeLoads(here).map((load) => load.skill)).toEqual(["frame", "tdd"]);
  });

  it("stamps the maker of a visual's manifest a shell command writes in the map's folder, a fresh agent's or the session's, and none in a change's folder (J-227 S1)", () => {
    const here = space();
    const manifest = (slug: string): string =>
      JSON.stringify({
        schema: "greenline.visual/v1",
        title: "The request",
        form: "sequence",
        skill: "diagram-design",
        change: ID,
        commit: here.git("rev-parse", "HEAD"),
        files: ["a.txt"],
        made: "2026-10-19",
        summary: `The ${slug}.`,
      });
    const makerOf = (path: string): string | undefined =>
      z
        .looseObject({ madeBy: z.string().optional() })
        .parse(JSON.parse(readFileSync(join(here.root, path), "utf8"))).madeBy;
    const command = (path: string): string => `cat > ${path} <<'EOF'\n{}\nEOF`;
    const MAP = ".greenline/visuals/map";
    const CHANGE = `.greenline/visuals/${ID}`;
    for (const [path, agent] of [
      [`${MAP}/flow.visual.json`, "a1"],
      [`${MAP}/architecture.visual.json`, undefined],
      [`${CHANGE}/flow.visual.json`, "a1"],
      [`${CHANGE}/map.visual.json`, undefined],
    ] as const) {
      const extra = agent === undefined ? {} : { agent_id: agent };
      fire(
        here,
        CLAUDE,
        bash(here, "PreToolUse", `v-${path}`, command(path), extra),
        new Date().toISOString(),
      );
      here.write(path, manifest(path));
      fire(
        here,
        CLAUDE,
        bash(here, "PostToolUse", `v-${path}`, command(path), extra),
        new Date().toISOString(),
      );
    }
    expect(makerOf(`${MAP}/flow.visual.json`)).toBe("agent");
    expect(makerOf(`${MAP}/architecture.visual.json`)).toBe("session");
    // A change's folder is the keep's, whose maker the keep derives: no shell write fills one there.
    expect(makerOf(`${CHANGE}/flow.visual.json`)).toBeUndefined();
    expect(makerOf(`${CHANGE}/map.visual.json`)).toBeUndefined();
    // A command that rewrites the map's folder, a checkout or a merge, replaces no maker it finds.
    const merge = "git merge --no-edit greenline/other";
    fire(here, CLAUDE, bash(here, "PreToolUse", "v-mg", merge), new Date().toISOString());
    here.write(
      `${MAP}/flow.visual.json`,
      readFileSync(join(here.root, `${MAP}/flow.visual.json`), "utf8"),
    );
    fire(here, CLAUDE, bash(here, "PostToolUse", "v-mg", merge), new Date().toISOString());
    expect(makerOf(`${MAP}/flow.visual.json`)).toBe("agent");
    // A restore into the home is a write, refused before the tool (J-227 S1).
    const checkout = "git checkout -- .greenline/visuals";
    const refused = fire(
      here,
      CLAUDE,
      bash(here, "PreToolUse", "v-co", checkout),
      new Date().toISOString(),
    );
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("nor restored by git");
    expect(refused.err).toContain("visuals-by-hand, greenline's harness hook");
  });

  it("regenerates the frame map after a shell write that rewrites the frame section and stops the record", () => {
    const here = space({ record: false });
    here.write(
      `.greenline/ledger/${ID}.md`,
      recordText("open", "- Q1 [scope] In or out?\n  - proposed: in"),
    );
    const mapPath = join(here.root, ".greenline", "ledger", ID, "frame-map.json");
    const command = `python3 - <<'EOF'\nopen('.greenline/ledger/${ID}.md','w').write(text)\nEOF`;
    fire(here, CLAUDE, bash(here, "PreToolUse", "f1", command), new Date().toISOString());
    here.write(
      `.greenline/ledger/${ID}.md`,
      recordText(
        "stopped",
        "- Q1 [scope] In or out?\n  - proposed: in\n- closed [data]: nothing stored",
      ),
    );
    // The record no longer open, the command's start is its end less the duration the harness gave.
    fire(
      here,
      CLAUDE,
      bash(here, "PostToolUse", "f1", command, { duration_ms: 5000 }),
      new Date().toISOString(),
    );
    const stopped = readFileSync(mapPath, "utf8");
    expect(stopped).toContain('"reason": "nothing stored"');
    // The write that closes the record derives the map once more, as HEAD holds no closed record yet (J-226 S1).
    here.write(
      `.greenline/ledger/${ID}.md`,
      recordText("done", "- Q1 [scope] In or out?\n  - proposed: out"),
    );
    fire(here, CLAUDE, bash(here, "PreToolUse", "f2", command), new Date().toISOString());
    fire(
      here,
      CLAUDE,
      bash(here, "PostToolUse", "f2", command, { duration_ms: 5000 }),
      new Date().toISOString(),
    );
    const closed = readFileSync(mapPath, "utf8");
    expect(closed).toContain('"proposed": "out"');
    // Once HEAD carries the closed record, its map stays as that commit left it, whatever the next tool does.
    here.git("add", "--", `.greenline/ledger/${ID}.md`, `.greenline/ledger/${ID}/frame-map.json`);
    here.git("commit", "--quiet", "-m", "close");
    here.write(
      `.greenline/ledger/${ID}.md`,
      recordText("done", "- Q1 [scope] In or out?\n  - proposed: later"),
    );
    fire(here, CLAUDE, bash(here, "PreToolUse", "f3", command), new Date().toISOString());
    fire(
      here,
      CLAUDE,
      bash(here, "PostToolUse", "f3", command, { duration_ms: 5000 }),
      new Date().toISOString(),
    );
    expect(readFileSync(mapPath, "utf8")).toBe(closed);
  });

  it("J-226 S1 derives the map at the write that sets done, the frame's answer rewritten in it (j217c-roster-use finding 8)", () => {
    const here = space({ record: false });
    const open = [
      "- Q4 [look] Which palette for the dark theme?",
      "  - proposed: open until design",
      "  - answer: open until design",
      "  - decided: agent",
    ].join("\n");
    here.write(`.greenline/ledger/${ID}.md`, recordText("open", open));
    const mapPath = join(here.root, ".greenline", "ledger", ID, "frame-map.json");
    const write = {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: `.greenline/ledger/${ID}.md`, content: "x" },
    };
    fire(here, CLAUDE, write);
    expect(readFileSync(mapPath, "utf8")).toContain('"answer": "open until design"');
    // The closing write rewrites Q4 to the owner's pick in the write that sets done, as bd7bf03 did.
    here.write(
      `.greenline/ledger/${ID}.md`,
      recordText(
        "done",
        open
          .replace(
            "answer: open until design",
            "answer: warm charcoal (palette B), picked by the owner at design from three dealt",
          )
          .replace("decided: agent", "decided: owner"),
      ),
    );
    fire(here, CLAUDE, write);
    const map = readFileSync(mapPath, "utf8");
    expect(map).toContain(
      '"answer": "warm charcoal (palette B), picked by the owner at design from three dealt"',
    );
    expect(map).toContain('"decided": "owner"');
  });

  it("reads a Codex shell command's writes with no duration, the record opened or stopped by it", () => {
    const here = space({ record: false });
    const codex = (name: string, call: string, command: string): JsonValue => ({
      hook_event_name: name,
      session_id: "c1",
      turn_id: "t1",
      cwd: here.root,
      model: "gpt-6.1-sol",
      tool_name: "Bash",
      tool_input: { command },
      tool_use_id: call,
    });
    const run = (call: string, command: string, write: () => void): void => {
      fire(
        here,
        ["--harness", "codex"],
        codex("PreToolUse", call, command),
        new Date().toISOString(),
      );
      write();
      fire(
        here,
        ["--harness", "codex"],
        codex("PostToolUse", call, command),
        new Date().toISOString(),
      );
    };
    // No change open before: the command opens the record, and the session names it.
    run("o1", HEREDOC, () =>
      here.write(`.greenline/ledger/${ID}.md`, recordText("open", "- Q1 [scope] In or out?")),
    );
    const named = join(here.root, ".greenline", "ledger", "sessions");
    expect(readdirSync(named).some((name) => name.endsWith("-c1.jsonl"))).toBe(true);
    // The change open before, none after: the command stops it, and its map follows.
    run("o2", HEREDOC, () =>
      here.write(
        `.greenline/ledger/${ID}.md`,
        recordText("stopped", "- Q1 [scope] In or out?\n- closed [data]: nothing stored"),
      ),
    );
    expect(
      readFileSync(join(here.root, ".greenline", "ledger", ID, "frame-map.json"), "utf8"),
    ).toContain('"reason": "nothing stored"');
    expect(existsSync(join(here.root, ".greenline", "tmp", "calls", "o2.json"))).toBe(false);
  });

  it("refreshes the frame map after a write tool stops the record off the change's branch", () => {
    const here = space({ record: false });
    const write = {
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: `.greenline/ledger/${ID}.md`, content: "x" },
    };
    here.write(`.greenline/ledger/${ID}.md`, recordText("open", "- Q1 [scope] In or out?"));
    fire(here, CLAUDE, write);
    here.write(
      `.greenline/ledger/${ID}.md`,
      recordText("stopped", "- Q1 [scope] In or out?\n- closed [data]: nothing stored"),
    );
    fire(here, CLAUDE, write);
    expect(
      readFileSync(join(here.root, ".greenline", "ledger", ID, "frame-map.json"), "utf8"),
    ).toContain('"reason": "nothing stored"');
  });

  it("sends a load to the change open on the branch while the session's last-named change is done", () => {
    const other = "2026-10-19-other";
    const here = space();
    withRoster(here);
    fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    // The session writes the other change's record, naming it, and the other change closes.
    fire(
      here,
      CLAUDE,
      {
        hook_event_name: "PreToolUse",
        session_id: "s1",
        tool_name: "Write",
        tool_input: { file_path: `.greenline/ledger/${other}.md`, content: "x" },
      },
      new Date().toISOString(),
    );
    here.write(`.greenline/ledger/${other}.md`, recordText("done"));
    expect(sessionLines(here)).toContainEqual(expect.objectContaining({ change: other }));
    fire(here, CLAUDE, skill(here, "tdd"), new Date().toISOString());
    expect(changeLoads(here).map((load) => load.skill)).toEqual(["tdd"]);
    expect(changeLoads(here, other)).toEqual([]);
  });

  it("makes the sessions folder with its own .gitignore, so git status lists no session fact and a clean keeps it", () => {
    const here = space();
    withRoster(here);
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "the change");
    fire(here, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1" });
    fire(here, CLAUDE, skill(here, "frame"), new Date().toISOString());
    const sessions = join(here.root, ".greenline", "ledger", "sessions");
    expect(readdirSync(sessions).sort()).toEqual([".gitignore", `${DAY}-s1.jsonl`]);
    // The change's own loads stay a fact of the change, committed with it.
    expect(
      here.git("status", "--porcelain", "--untracked-files=all", "--", ".greenline/ledger"),
    ).toBe(`?? .greenline/ledger/${ID}/skills/${DAY}.jsonl`);
    here.git("clean", "-f", "-d", "--", ".greenline/ledger/sessions");
    expect(existsSync(join(sessions, `${DAY}-s1.jsonl`))).toBe(true);
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
    const closed = space({
      record: ["choice: accepted", "state: done", 'outcome: "The change landed."'],
    });
    const unopened = fire(closed, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "src/a.ts" },
    });
    expect(unopened).toEqual({
      code: 2,
      out: "",
      err: "the write to src/a.ts waits, lying outside .greenline/ledger/ and .greenline/tmp/: no change is open on feature, so nothing is committed there yet; open the change's record under .greenline/ledger/ first, once the owner has said yes; no-open-change, greenline's harness hook\n",
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

/** A before-tool shell event for each adapter, as its harness writes it: the arguments and the payload. */
const SHELL_PAYLOADS: readonly (readonly [
  string,
  (command: string) => readonly [readonly string[], JsonValue],
])[] = [
  [
    "claude-code",
    (command) => [
      ["--harness", "claude-code"],
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } },
    ],
  ],
  [
    "codex",
    (command) => [
      ["--harness", "codex"],
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } },
    ],
  ],
  [
    "dsh",
    (command) => [
      ["--harness", "dsh"],
      { hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command } },
    ],
  ],
  [
    "hermes",
    (command) => [
      ["--harness", "hermes"],
      { hook_event_name: "pre_tool_call", tool_name: "terminal", tool_input: { command } },
    ],
  ],
  [
    "droid",
    (command) => [
      ["--harness", "droid"],
      { hook_event_name: "PreToolUse", tool_name: "Execute", tool_input: { command } },
    ],
  ],
  [
    "gemini",
    (command) => [
      ["--harness", "gemini"],
      { hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command } },
    ],
  ],
  [
    "cursor",
    (command) => [["--harness", "cursor"], { hook_event_name: "beforeShellExecution", command }],
  ],
  [
    "opencode",
    (command) => [["before-tool", "--harness", "opencode"], { tool: "bash", args: { command } }],
  ],
  [
    "copilot",
    (command) => [
      ["before-tool", "--harness", "copilot"],
      { toolName: "bash", toolArgs: { command } },
    ],
  ],
  [
    "kiro",
    (command) => [
      ["before-tool", "--harness", "kiro"],
      { tool_name: "execute_bash", tool_input: { command } },
    ],
  ],
  ["amp", (command) => [["before-tool", "--harness", "amp"], { tool: "Bash", shell: { command } }]],
  [
    "pi",
    (command) => [["before-tool", "--harness", "pi"], { toolName: "bash", input: { command } }],
  ],
];

describe("J-114 S3 greenline event: the guardrails, before the shell runs, on every adapter", () => {
  const record = `.greenline/ledger/${ID}.md`;
  const run = (where: Space, harness: string, command: string): Fired => {
    const payload = SHELL_PAYLOADS.find(([name]) => name === harness)?.[1];
    if (payload === undefined) throw new Error(`no payload for ${harness}`);
    const [argv, body] = payload(command);
    return fire(where, argv, body);
  };
  /** The lifts the lines spent forgotten, so each adapter's payload is judged on unspent words (J-173 S1). */
  const forget = (where: Space): void => {
    rmSync(join(where.root, ".git", "greenline"), { recursive: true, force: true });
  };

  /** The record with the owner's words for each line the guardrails read. */
  const lifted = [
    "---",
    "mode: quick",
    'why: "w"',
    "choice: accepted",
    "state: open",
    'discard: "drop the spike, the owner"',
    'rebase: "regroup, the owner"',
    'landing: "push it, the owner"',
    "---",
    "",
  ].join("\n");

  it("refuses a hard reset on every adapter's payload without the record's discard line, naming it, and lets it through with the owner's words", () => {
    const here = space();
    for (const [harness] of SHELL_PAYLOADS) {
      const refused = run(here, harness, "git reset --hard");
      expect([harness, refused.code]).toEqual([harness, 2]);
      expect(refused.err).toBe(
        `\`git reset --hard\` would throw uncommitted work away, and ${record} holds no discard line with the owner's words for it in a commit; ask the owner, write their words there and commit the record alone first, then run it again; discard-words, greenline's harness hook\n`,
      );
    }
    // J-129 S4: the line in the working tree alone lifts nothing; the refusal names the commit to make.
    here.write(record, lifted);
    for (const [harness] of SHELL_PAYLOADS) {
      const uncommitted = run(here, harness, "git reset --hard");
      expect([harness, uncommitted.code]).toEqual([harness, 2]);
      expect(uncommitted.err).toBe(
        `\`git reset --hard\` would throw uncommitted work away, and the owner's words in the discard line of ${record} stand only in the working tree, where the act could throw them away; commit the record first, \`git commit -m "record the owner's words" -- ${record}\`, then run it again; discard-words, greenline's harness hook\n`,
      );
    }
    here.git("add", record);
    here.git("commit", "--quiet", "-m", "record the owner's words", "--", record);
    for (const [harness] of SHELL_PAYLOADS) {
      forget(here);
      expect([harness, run(here, harness, "git reset --hard").code]).toEqual([harness, 0]);
    }
    // J-173 S1: the reset spent the words; a second discard on them waits for the owner.
    expect(run(here, "codex", "git reset --hard").err).toContain(
      `the owner's words in the discard line of ${record}, "drop the spike, the owner", were spent on \`git reset --hard\``,
    );
    // Committed, the line survives the reset it lifted.
    here.write("a.txt", "work to throw away\n");
    here.git("reset", "--quiet", "--hard");
    expect(readFileSync(join(here.root, record), "utf8")).toContain(
      'discard: "drop the spike, the owner"',
    );
    expect(readFileSync(join(here.root, "a.txt"), "utf8")).toBe("a\n");
  }, 120_000);

  it("J-144 S4 reads the change and its state from the record HEAD's commit holds: a stopped record set open in the working tree lifts nothing", () => {
    const here = space();
    const lines = (state: readonly string[], more: readonly string[] = []): string =>
      ["---", "mode: quick", 'why: "w"', "choice: accepted", ...state, ...more, "---", ""].join(
        "\n",
      );
    // The change stopped in a commit, its discard words among the committed lines.
    here.write(
      record,
      lines(["state: stopped", 'next: "build: the index"'], ['discard: "drop it, the owner"']),
    );
    here.git("add", record);
    here.git("commit", "--quiet", "-m", "stop the change", "--", record);
    // The agent sets it open in the working tree alone, uncommitted and unasked.
    here.write(record, lines(["state: open"], ['discard: "drop it, the owner"']));
    for (const [harness] of SHELL_PAYLOADS) {
      const refused = run(here, harness, "git reset --hard");
      expect([harness, refused.code]).toEqual([harness, 2]);
      expect(refused.err).toBe(
        `\`git reset --hard\` would throw uncommitted work away, and change ${ID} stands stopped in its last commit, so no line of ${record} lifts it, whatever the working tree says; resume the change and commit its record open with the owner's words in its discard line first, \`git commit -m "record the owner's words" -- ${record}\`, then run it again; discard-words, greenline's harness hook\n`,
      );
    }
    // Committed open but with no discard line: still refused, naming the committed line.
    here.write(record, lines(["state: open"]));
    here.git("commit", "--quiet", "-m", "resume the change", "--", record);
    here.write(record, lines(["state: open"], ['discard: "drop it, the owner"']));
    expect(run(here, "claude-code", "git reset --hard").err).toContain(
      `the owner's words in the discard line of ${record} stand only in the working tree`,
    );
    // Committed open with the line: the line lifts the reset.
    here.git("commit", "--quiet", "-m", "record the owner's words", "--", record);
    for (const [harness] of SHELL_PAYLOADS) {
      forget(here);
      expect([harness, run(here, harness, "git reset --hard").code]).toEqual([harness, 0]);
    }
  }, 120_000);

  it("refuses each destructive command without its record line, naming it, and lets each through with the owner's words", () => {
    const here = space();
    for (const [harness, command] of [
      ["codex", "git clean -fd"],
      ["dsh", "git checkout ."],
      ["hermes", "git restore ."],
      ["claude-code", "git -C . clean -df"],
    ] as const)
      expect([harness, command, run(here, harness, command).code]).toEqual([harness, command, 2]);
    expect(run(here, "claude-code", "git branch -D old").err).toContain(
      "holds no discard or landing lines",
    );
    expect(run(here, "hermes", "git push --force").err).toContain("holds no landing line");
    expect(run(here, "codex", "git push origin main").err).toContain("holds no landing line");
    here.write(record, lifted);
    expect(run(here, "codex", "git push origin main").err).toContain(
      `the owner's words in the landing line of ${record} stand only in the working tree`,
    );
    here.git("add", record);
    here.git("commit", "--quiet", "-m", "record the owner's words", "--", record);
    for (const command of [
      "git clean -fd",
      "git checkout .",
      "git restore .",
      "git branch -D old",
      "git push --force",
      "git push origin main",
    ]) {
      forget(here);
      expect([command, run(here, "claude-code", command).code]).toEqual([command, 0]);
    }
  }, 120_000);

  it("J-173 S1 spends a line on the act it lifted and reads the spend on a resume: the runner run's forced push on the push's words", () => {
    const here = space();
    const branch = here.git("branch", "--show-current");
    const lines = (more: readonly string[]): string =>
      [
        "---",
        "mode: quick",
        'why: "w"',
        "choice: accepted",
        "state: open",
        ...more,
        "---",
        "",
      ].join("\n");
    // The owner's words for the amend and for the branch's push, committed (j109t-conduct-runner 001/009 and 001/010).
    here.write(record, lines(['rebase: "Reword the last commit."', 'landing: "Push the branch."']));
    here.git("add", record);
    here.git("commit", "--quiet", "-m", "record the owner's words", "--", record);
    expect(run(here, "codex", `git push -u origin ${branch}`).code).toBe(0);
    // A resume: a new hook call reads the push's spend from the git directory, and the forced push waits.
    const forced = run(here, "codex", `git push --force-with-lease origin ${branch}`);
    expect(forced.code).toBe(2);
    expect(forced.err).toBe(
      `\`git push --force-with-lease origin ${branch}\` would push over a branch's history, and the owner's words in the landing line of ${record}, "Push the branch.", were spent on \`git push -u origin ${branch}\`; a line lifts only the act it was given for, so ask the owner for this one, write their words there and commit the record alone first, then run it again; force-push-words, greenline's harness hook\n`,
    );
    // The owner's words for the forced push, in the working tree alone: the refusal names the commit.
    here.write(
      record,
      lines(['rebase: "Reword the last commit."', 'landing: "Force-push the branch."']),
    );
    expect(run(here, "codex", `git push --force-with-lease origin ${branch}`).err).toContain(
      `the owner's words in the landing line of ${record} stand only in the working tree`,
    );
    here.git("commit", "--quiet", "-m", "record the owner's words", "--", record);
    expect(run(here, "codex", `git push --force-with-lease origin ${branch}`).code).toBe(0);
    // Spent on that forced push, the words lift no second one.
    expect(run(here, "claude-code", `git push --force origin ${branch}`).err).toContain(
      `"Force-push the branch.", were spent on \`git push --force-with-lease origin ${branch}\``,
    );
    // A refused command spends nothing.
    expect(
      readFileSync(join(here.root, ".git", "greenline", "lifts.jsonl"), "utf8")
        .trim()
        .split("\n"),
    ).toHaveLength(2);
  }, 120_000);

  it("reads the command's words: a quoted mention, a message or a here-document is let through, and the change's own push needs no line here", () => {
    const here = space();
    // The git hooks installed, so a commit is held by them and not refused here (J-200 S1).
    registerGitHooks(here.root, HOOKS_ON);
    for (const command of [
      'git commit -m "docs: never run git reset --hard"',
      "echo 'git clean -fd'",
      [
        "git commit -F - <<'EOF'",
        "fix: the guard",
        "",
        "git push --force stays refused",
        "EOF",
      ].join("\n"),
      "git push",
      "git push -u origin feature",
      "git reset --soft HEAD~1",
      "git clean -n",
    ])
      for (const harness of ["claude-code", "codex", "hermes"])
        expect([harness, command, run(here, harness, command).code]).toEqual([harness, command, 0]);
    // A command after a separator or in a substitution is read as the shell runs it.
    expect(run(here, "claude-code", "git add a.txt && git reset --hard").code).toBe(2);
    expect(run(here, "claude-code", 'echo "$(git clean -f)"').code).toBe(2);
    expect(run(here, "claude-code", "bash -c 'git checkout .'").code).toBe(2);
  }, 120_000);

  it("refuses with no change open, naming the branch, and leaves a repository that is no workspace alone", () => {
    const closed = space({
      record: ["choice: accepted", "state: done", 'outcome: "The change landed."'],
    });
    expect(run(closed, "claude-code", "git clean -fd")).toEqual({
      code: 2,
      out: "",
      err: "`git clean -fd` would throw uncommitted work away, and no change is open on feature to hold the owner's word for it; the owner runs it, or a change opens whose committed record holds their words in its discard line; discard-words, greenline's harness hook\n",
    });
    const bare = space({ manifest: false });
    expect(run(bare, "claude-code", "git reset --hard").code).toBe(0);
    const off = space({ manifest: { hooks: { git: true, adapters: false } } });
    expect(run(off, "claude-code", "git reset --hard").code).toBe(0);
  });

  it("judges a command run into a worktree by that worktree's change and record, through cd or -C, from the main checkout", () => {
    const here = space({
      record: ["choice: accepted", "state: done", 'outcome: "The change landed."'],
    });
    here.git("checkout", "--quiet", "main");
    const id = "2026-10-25-wt";
    here.git("worktree", "add", "--quiet", "-b", `greenline/${id}`, `.worktrees/${id}`);
    const tree = join(here.root, ".worktrees", id);
    mkdirSync(join(tree, ".greenline", "ledger"), { recursive: true });
    writeFileSync(
      join(tree, ".greenline", "manifest.json"),
      readFileSync(join(here.root, ".greenline", "manifest.json")),
    );
    const lines = (extra: readonly string[]): string =>
      [
        "---",
        "mode: quick",
        'why: "w"',
        "choice: accepted",
        'yes: "Yes."',
        "state: open",
        ...extra,
        "---",
        "",
      ].join("\n");
    writeFileSync(join(tree, ".greenline", "ledger", `${id}.md`), lines([]));
    const worktreeRecord = `.greenline/ledger/${id}.md`;
    for (const command of [
      `git -C .worktrees/${id} reset --hard`,
      `cd .worktrees/${id} && git clean -fd`,
    ])
      expect(run(here, "claude-code", command).err).toContain(
        `${worktreeRecord} holds no discard line`,
      );
    writeFileSync(
      join(tree, ".greenline", "ledger", `${id}.md`),
      lines(['discard: "drop it, the owner"']),
    );
    expect(run(here, "claude-code", `git -C .worktrees/${id} reset --hard`).err).toContain(
      `the owner's words in the discard line of ${worktreeRecord} stand only in the working tree`,
    );
    here.git("-C", tree, "add", worktreeRecord);
    here.git(
      "-C",
      tree,
      "commit",
      "--quiet",
      "-m",
      "record the owner's words",
      "--",
      worktreeRecord,
    );
    expect(run(here, "claude-code", `git -C .worktrees/${id} reset --hard`).code).toBe(0);
    // A write into the worktree from the main checkout is judged there: its record holds the yes.
    expect(
      fire(here, CLAUDE, {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: join(tree, "src", "a.ts") },
      }).code,
    ).toBe(0);
    writeFileSync(
      join(tree, ".greenline", "ledger", `${id}.md`),
      ["---", "mode: quick", 'why: "w"', "state: open", "---", ""].join("\n"),
    );
    const unsaid = fire(here, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(tree, "src", "a.ts") },
    });
    expect(unsaid.code).toBe(2);
    expect(unsaid.err).toContain(`${worktreeRecord} carries no choice line`);
  });

  it("judges a nested repository inside the workspace as the workspace, a write and a git command alike", () => {
    const here = space({ record: ["state: open"] });
    here.git("init", "--quiet", "vendor/sub");
    const written = fire(here, CLAUDE, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(here.root, "vendor", "sub", "a.ts") },
    });
    expect(written.code).toBe(2);
    expect(written.err).toContain(`${record} carries no choice line`);
    const reset = run(here, "claude-code", "git -C vendor/sub reset --hard");
    expect(reset.code).toBe(2);
    expect(reset.err).toContain(`${record} holds no discard line`);
  });

  it("lifts a forced delete of a change's branch by that change's own record, as the landing's cleanup asks", () => {
    const here = space({
      record: ["choice: accepted", "state: done", 'outcome: "The change landed."'],
    });
    const id = "2026-10-25-landed";
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "the workspace");
    here.git("checkout", "--quiet", "-b", `greenline/${id}`);
    here.write(
      `.greenline/ledger/${id}.md`,
      [
        "---",
        "mode: quick",
        'why: "w"',
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        'landing: "push and delete the branch, the owner"',
        "---",
        "",
      ].join("\n"),
    );
    here.git("add", ".");
    here.git("commit", "--quiet", "-m", "close");
    here.git("checkout", "--quiet", "feature");
    expect(run(here, "claude-code", `git branch -D greenline/${id}`).code).toBe(0);
    expect(run(here, "claude-code", "git branch -D feature-old").code).toBe(2);
  });
});

describe("J-148 S1 the kill guard and the processes the session started", () => {
  const started: number[] = [];
  afterEach(() => {
    for (const pid of started.splice(0))
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already stopped.
      }
  });

  /** A server the test starts as the shell would for the command, after its before-tool event. */
  /** The started server: its pid. */
  interface Started {
    readonly pid: number;
  }

  function server(here: Space, name: string): Started {
    const script = join(here.root, ".greenline", "tmp", `${name}.cjs`);
    mkdirSync(join(script, ".."), { recursive: true });
    writeFileSync(script, "setInterval(() => {}, 1000);\n");
    // Started through a shell that exits, so the server is no child of the test's and nothing waits on it.
    const pid = Number(
      execFileSync(
        "/bin/sh",
        ["-c", `"$0" "$1" >/dev/null 2>&1 & echo $!`, process.execPath, script],
        {
          encoding: "utf8",
        },
      ).trim(),
    );
    started.push(pid);
    return { pid };
  }

  /** Whether a process still runs. */
  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  /** Wait, the test's own process busy, until the condition holds or the time runs out. */
  const until = (condition: () => boolean, ms: number): void => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) {
      // Busy: the hooks under test run synchronously too.
    }
  };

  const shell = (event: string, command: string, call: string): JsonValue => ({
    hook_event_name: event,
    session_id: "s1",
    tool_name: "Bash",
    tool_use_id: call,
    tool_input: { command },
  });

  const CODEX = ["--harness", "codex"];

  for (const harness of [CLAUDE, CODEX])
    it(`refuses a kill by pattern with the pid form named, on ${harness[1] ?? ""}'s payload`, () => {
      const here = space();
      const command =
        harness === CLAUDE ? "pkill -f 'src/main.ts'" : `/bin/zsh -lc "pkill -f 'src/main.ts'"`;
      const ran = fire(here, harness, shell("PreToolUse", command, "k1"));
      expect(ran.code).toBe(2);
      expect(ran.err).toBe(
        "`pkill -f src/main.ts` would stop every process its name, pattern or port matches, the owner's own among them; stop a process by its pid, one the session started; kill-by-name, greenline's harness hook\n",
      );
      // With no change open the guard holds too.
      const none = space({ record: false });
      expect(fire(none, harness, shell("PreToolUse", "killall node", "k2")).code).toBe(2);
    });

  for (const harness of [CLAUDE, CODEX])
    it(`records a background start, admits its kill by pid, names it in status and stops it at tidy, on ${harness[1] ?? ""}'s payload`, () => {
      const here = space({ branch: `greenline/${ID}` });
      // The owner's own server, started before the command, which nothing may stop.
      const owner = server(here, "agent-server-owner");
      const before = Date.now();
      until(() => false, 2100 - (Date.now() - before));
      const line = "nohup node .greenline/tmp/agent-server.cjs > /dev/null 2>&1 &";
      const command = harness === CLAUDE ? line : `/bin/zsh -lc '${line}'`;
      fire(here, harness, shell("PreToolUse", command, "b1"), new Date().toISOString());
      const agent = server(here, "agent-server");
      fire(here, harness, shell("PostToolUse", command, "b1"), new Date().toISOString());
      const file = join(here.root, ".greenline", "tmp", "sessions", "s1.processes.json");
      const recorded = z
        .object({
          processes: z.array(z.object({ pid: z.number(), change: z.string().nullable() })),
        })
        .parse(JSON.parse(readFileSync(file, "utf8")));
      expect(recorded.processes.map((one) => one.pid)).toEqual([agent.pid]);
      expect(recorded.processes[0]?.change).toBe(ID);
      // A kill of its pid goes on; a kill of the owner's refuses, until the owner's words name it.
      expect(fire(here, harness, shell("PreToolUse", `kill ${String(agent.pid)}`, "b2")).code).toBe(
        0,
      );
      const foreign = fire(here, harness, shell("PreToolUse", `kill ${String(owner.pid)}`, "b3"));
      expect(foreign.code).toBe(2);
      expect(foreign.err).toContain("which this session did not start; stop a process by its pid");
      fire(here, harness, {
        hook_event_name: "UserPromptSubmit",
        session_id: "s1",
        prompt: `stop ${String(owner.pid)} as well, it is my old server`,
      });
      expect(fire(here, harness, shell("PreToolUse", `kill ${String(owner.pid)}`, "b4")).code).toBe(
        0,
      );
      // The status names what the session started.
      const installation = fixtureInstallation();
      const status = new RecordingWriter();
      runCli(["status"], status.writer, "0.0.0-test", {
        cwd: here.root,
        version: "0.0.0-test",
        installation,
      });
      expect(status.out).toContain(`running: 1 the session started, pid ${String(agent.pid)};`);
      // The close's tidy stops it, and never the owner's.
      const tidy = new RecordingWriter();
      runCli(["tidy", "--change", ID], tidy.writer, "0.0.0-test", {
        cwd: here.root,
        version: "0.0.0-test",
        installation,
      });
      expect(tidy.out).toContain(`stopped pid ${String(agent.pid)}, `);
      until(() => !alive(agent.pid), 3000);
      expect(alive(agent.pid)).toBe(false);
      expect(alive(owner.pid)).toBe(true);
    });

  it("records the inspector greenline view starts detached, through its address file, and stops it at tidy", () => {
    const here = space({ branch: `greenline/${ID}` });
    fire(here, CLAUDE, shell("PreToolUse", "greenline view", "v1"), new Date().toISOString());
    // view starts the inspector detached and returns; the inspector writes its address file once it serves.
    const inspector = server(here, "viewed-inspector");
    writeAddressFile(here.root, 4748, inspector.pid);
    fire(here, CLAUDE, shell("PostToolUse", "greenline view", "v1"), new Date().toISOString());
    const tidy = new RecordingWriter();
    runCli(["tidy", "--change", ID], tidy.writer, "0.0.0-test", {
      cwd: here.root,
      version: "0.0.0-test",
      installation: fixtureInstallation(),
    });
    expect(tidy.out).toContain(
      `stopped the inspector the session started, pid ${String(inspector.pid)}`,
    );
  });

  for (const when of ["the turn's end", "the close's tidy"] as const)
    it(`J-151 S2 names on Codex the inspector a server run started in the turn, at ${when}, and tidy stops it`, () => {
      const here = space({ branch: `greenline/${ID}` });
      fire(here, CODEX, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "go" });
      // `greenline inspect` serves past the call's yield, so Codex hands no after-tool while it runs.
      const inspector = server(here, "codex-inspector");
      writeAddressFile(here.root, 4749, inspector.pid);
      if (when === "the turn's end")
        fire(here, CODEX, {
          hook_event_name: "Stop",
          session_id: "s1",
          last_assistant_message: "The change is closed.",
        });
      else fire(here, CODEX, shell("PreToolUse", `greenline tidy --change ${ID}`, "t1"));
      const recorded = z
        .object({
          processes: z.array(z.object({ pid: z.number(), change: z.string().nullable() })),
        })
        .parse(
          JSON.parse(
            readFileSync(
              join(here.root, ".greenline", "tmp", "sessions", "s1.processes.json"),
              "utf8",
            ),
          ),
        ).processes;
      expect(recorded).toEqual([{ pid: inspector.pid, change: ID }]);
      const tidy = new RecordingWriter();
      runCli(["tidy", "--change", ID], tidy.writer, "0.0.0-test", {
        cwd: here.root,
        version: "0.0.0-test",
        installation: fixtureInstallation(),
      });
      expect(tidy.out).toContain(
        `stopped the inspector the session started, pid ${String(inspector.pid)}`,
      );
    });

  it("J-151 S2 leaves an inspector that served before the turn began, which no session started", () => {
    const here = space({ branch: `greenline/${ID}` });
    const owner = server(here, "owner-inspector");
    writeAddressFile(here.root, 4750, owner.pid);
    const before = Date.now();
    until(() => false, 2100 - (Date.now() - before));
    fire(here, CODEX, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "go" });
    fire(here, CODEX, {
      hook_event_name: "Stop",
      session_id: "s1",
      last_assistant_message: "Done.",
    });
    expect(existsSync(join(here.root, ".greenline", "tmp", "sessions", "s1.processes.json"))).toBe(
      false,
    );
  });

  it("stops the inspector the session started through its address file, first", () => {
    const here = space({ branch: `greenline/${ID}` });
    const line = "node .greenline/tmp/inspector.cjs &";
    fire(here, CLAUDE, shell("PreToolUse", line, "i1"), new Date().toISOString());
    const inspector = server(here, "inspector");
    fire(here, CLAUDE, shell("PostToolUse", line, "i1"), new Date().toISOString());
    writeAddressFile(here.root, 4747, inspector.pid);
    const tidy = new RecordingWriter();
    runCli(["tidy", "--change", ID, "--json"], tidy.writer, "0.0.0-test", {
      cwd: here.root,
      version: "0.0.0-test",
      installation: fixtureInstallation(),
    });
    const stopped = z
      .object({
        tidy: z.object({
          stopped: z.array(z.object({ pid: z.number(), inspector: z.boolean() })),
        }),
      })
      .parse(JSON.parse(tidy.out)).tidy.stopped;
    expect(stopped).toEqual([{ pid: inspector.pid, inspector: true }]);
  });
});

describe("J-148 S3 a locked section of DESIGN.md waits for the owner's words", () => {
  const DESIGN =
    "---\nname: Shelf\ncolors:\n  ink: '#1a1a1a'\n---\n\n## Overview\n\nA shelf.\n\n## Colors\n\nInk on paper.\n";

  /** A change open on its branch, DESIGN.md standing, its Colors section locked by the rulings. */
  function locked(record: readonly string[] = []): Space {
    const here = space({ branch: `greenline/${ID}` });
    here.write("DESIGN.md", DESIGN);
    here.write(
      ".greenline/DECISIONS.md",
      "# Decisions\n\n## Interface\n\n- platform: web\n- locked: Colors\n",
    );
    if (record.length > 0)
      here.write(
        `.greenline/ledger/${ID}.md`,
        [
          "---",
          "mode: quick",
          'why: "w"',
          "choice: accepted",
          "state: open",
          "---",
          "",
          ...record,
        ].join("\n"),
      );
    return here;
  }

  const edit = (root: string, find: string, put: string): JsonValue => ({
    hook_event_name: "PreToolUse",
    session_id: "s1",
    tool_name: "Edit",
    tool_use_id: "e1",
    tool_input: { file_path: join(root, "DESIGN.md"), old_string: find, new_string: put },
  });

  it("refuses Claude Code's edit of the locked Colors, and lets an unlocked section's edit through", () => {
    const here = locked();
    const refused = fire(here, CLAUDE, edit(here.root, "Ink on paper.", "Ink on slate."));
    expect(refused.code).toBe(2);
    expect(refused.err).toBe(
      `this write would change DESIGN.md's Colors section, which the interface rulings hold locked as the owner's pick; ask the owner, write their words in the change record's ## Interface section as \`- unlock Colors: "<their words>"\`, and write again; design-lock, greenline's harness hook\n`,
    );
    expect(fire(here, CLAUDE, edit(here.root, "A shelf.", "A shelf of books.")).code).toBe(0);
  });

  it("refuses Codex's patch of the locked tokens, and takes it once the record quotes the owner's unlock", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: DESIGN.md",
      "@@",
      " colors:",
      "-  ink: '#1a1a1a'",
      "+  ink: '#2b2b2b'",
      "*** End Patch",
    ].join("\n");
    const payload: JsonValue = {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "apply_patch",
      tool_use_id: "p1",
      tool_input: { command: patch },
    };
    const here = locked();
    expect(fire(here, ["--harness", "codex"], payload).code).toBe(2);
    const unlocked = locked(["## Interface", "", '- unlock Colors: "yes, a softer ink"', ""]);
    expect(fire(unlocked, ["--harness", "codex"], payload).code).toBe(0);
  });
});

describe("J-226 S1 a declared check run plainly with no change acting (j217t-roster-use finding 6)", () => {
  const TEST = { checks: [{ name: "test", command: "npm test", dir: "." }] };
  const LINE =
    "the declared check test (npm test) ran with no change acting, so no change records the run; no-change-run, greenline's harness hook";
  const shell = (
    where: Space,
    name: string,
    command: string,
    more: Readonly<Record<string, string>> = {},
  ): JsonValue => ({
    hook_event_name: name,
    tool_name: "Bash",
    tool_use_id: "n1",
    cwd: where.root,
    tool_input: { command },
    ...more,
  });

  it("names the run after the tool on Claude Code, and nothing before it, never refusing", () => {
    const here = space({ manifest: TEST, record: false });
    const before = fire(here, CLAUDE, shell(here, "PreToolUse", "npm test"));
    expect(before).toEqual({ code: 0, out: "", err: "" });
    const after = fire(here, CLAUDE, shell(here, "PostToolUse", "npm test"));
    expect(after.code).toBe(0);
    expect(CONTEXT.parse(JSON.parse(after.out)).hookSpecificOutput.additionalContext).toBe(LINE);
    // A command that matches no declared check adds nothing.
    expect(fire(here, CLAUDE, shell(here, "PostToolUse", "npm run lint")).out).toBe("");
  });

  it("names it at the next turn's mirror on Codex, which takes no after-tool context, once", () => {
    const here = space({ manifest: TEST, record: false });
    const codex = ["--harness", "codex"];
    const turn = {
      hook_event_name: "UserPromptSubmit",
      session_id: "c1",
      turn_id: "t1",
      cwd: here.root,
    };
    fire(here, codex, { ...turn, prompt: "Run the tests once more." });
    const after = fire(
      here,
      codex,
      shell(here, "PostToolUse", "npm test", { session_id: "c1", turn_id: "t1" }),
    );
    expect(after).toEqual({ code: 0, out: "", err: "" });
    const next = fire(here, codex, { ...turn, turn_id: "t2", prompt: "Thanks." });
    expect(next.out).toContain(LINE);
    expect(fire(here, codex, { ...turn, turn_id: "t3", prompt: "And now?" }).out).not.toContain(
      LINE,
    );
  });

  it("records the run for the change acting as before, with no such line", () => {
    const here = space({ manifest: TEST });
    const after = fire(
      here,
      CLAUDE,
      shell(here, "PostToolUse", "npm test"),
      "2999-01-01T00:00:00.000Z",
    );
    expect(after.out).not.toContain("no-change-run");
    expect(readdirSync(join(here.root, ".greenline", "ledger", ID, "checks"))).toEqual([
      "29990101T000000000Z-hook01.hook.json",
    ]);
  });
});
