/**
 * The record's lines are the agent's (J-176 S1; the register's row of
 * 2026-11-05, "The record's lines are the agent's"; the ledger guide, "The
 * front matter" and "Stops and resumes"), through `greenline event`'s entry
 * point on a fixture repository with real git, on both harnesses' payloads:
 * no hook writes the skills line at the close's write of `done` or the
 * agent line from the model the harness reports; a resume's write while the
 * record still reads `stopped` is told so, the record left as it stands,
 * and the stop's own turn is told nothing; and the waiting line the mirror
 * prints from a stopped record's next line.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-10-29-overdue";
const RECORD = `.greenline/ledger/${ID}.md`;
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Space {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, text: string) => void;
  readonly record: () => string;
}

/** A record's text, its front matter's lines given after its mode and why. */
function recordText(lines: readonly string[]): string {
  return [
    "---",
    "mode: quick",
    'why: "the overdue letters"',
    ...lines,
    "---",
    "",
    "## frame",
    "",
    "the letters",
    "",
  ].join("\n");
}

/** A workspace on the change's own branch, its record committed with the lines given. */
function space(lines: readonly string[], branch = `greenline/${ID}`): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-records-"));
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
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [] }),
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  // With no remote a change's commits may stay on main, which names no change of its own.
  if (branch !== "main") git("checkout", "--quiet", "-b", branch);
  write(RECORD, recordText(lines));
  git("add", ".");
  git("commit", "--quiet", "--no-verify", "-m", "the record");
  return { root, git, write, record: () => readFileSync(join(root, RECORD), "utf8") };
}

/** Fire one event with the payload as the harness writes it. */
function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-10-29T12:00:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
  });
  return { code, out: writer.out, err: writer.err };
}

/** Claude Code's after-tool payload for a write. */
const written = (path: string, extra: Record<string, JsonValue> = {}): JsonValue => ({
  hook_event_name: "PostToolUse",
  session_id: "s1",
  tool_name: "Write",
  tool_use_id: `toolu_${path.replaceAll(/\W/g, "")}`,
  tool_input: { file_path: path },
  ...extra,
});

/** One skill load as the hooks write it into the change's facts. */
const load = (skill: string, turn: number): string =>
  JSON.stringify({
    skill,
    file: "SKILL.md",
    whole: true,
    via: "Skill",
    at: `2026-10-29T10:0${String(turn)}:00.000Z`,
    step: null,
    agent: null,
    turn,
    session: "s1",
  });

describe("J-176 S1 no hook writes a line of the record", () => {
  it("leaves the skills line the agent wrote at the close, whatever the facts loaded", () => {
    const here = space(["choice: accepted", "state: open"]);
    here.write(
      `.greenline/ledger/${ID}/skills/2026-10-29.jsonl`,
      [load("frame", 1), load("tdd", 2), load("close", 4), ""].join("\n"),
    );
    const closing = recordText([
      "choice: accepted",
      "state: done",
      "next: none",
      "skills: [frame, review, verify]",
    ]);
    here.write(RECORD, closing);
    const closed = fire(here, "claude-code", written(RECORD));
    expect(closed.code).toBe(0);
    expect(here.record()).toBe(closing);
    expect(closed.out).not.toContain("record: greenline wrote");
  });

  it("leaves the agent line the agent wrote, whatever model the harness reports", () => {
    const here = space(["choice: accepted", "state: open", 'agent: "codex/gpt-6"']);
    const before = here.record();
    const first = fire(here, "claude-code", written(RECORD, { model: "claude-opus-5-5" }));
    expect(here.record()).toBe(before);
    expect(first.out).not.toContain("record: greenline wrote");
    fire(here, "codex", { hook_event_name: "UserPromptSubmit", session_id: "s2", prompt: "go" });
    fire(here, "codex", {
      hook_event_name: "PostToolUse",
      session_id: "s2",
      tool_name: "apply_patch",
      tool_use_id: "call_1",
      model: "gpt-6.1-sol",
      tool_input: { command: `*** Begin Patch\n*** Update File: ${RECORD}\n*** End Patch` },
    });
    expect(here.record()).toBe(before);
  });
});

describe("J-176 S1 the resume told its record still reads stopped", () => {
  const stopped = [
    "choice: accepted",
    "state: stopped",
    'next: "build: wait for the owner\'s review of the tests"',
  ];
  const notice = `record: ${RECORD} still reads stopped while this turn resumes the change; write state: open in it as the resume's first line, before its next edit; resume-open`;

  it("names the stopped state at the resume's first write and leaves the record as it stands, the waiting line printed before", () => {
    const here = space(stopped);
    const start = fire(here, "claude-code", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "carry on",
    });
    expect(start.out).toContain(
      "waiting on: wait for the owner's review of the tests, from the record's next line",
    );
    const code = fire(here, "claude-code", written("src/shelf.ts"));
    expect(here.record()).toContain("state: stopped");
    expect(code.out).toContain(notice);
    // Once the agent writes the state open itself, the notice ends and the wait survives the resume.
    here.write(RECORD, recordText([...stopped.slice(0, 1), "state: open", stopped[2] ?? ""]));
    expect(fire(here, "claude-code", written("src/shelf.ts")).out).not.toContain(notice);
    const next = fire(here, "claude-code", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "go on",
    });
    expect(next.out).toContain("waiting on: wait for the owner's review of the tests");
  });

  it("tells the stop's own turn nothing, the record stopped through its writes", () => {
    const here = space(["choice: accepted", "state: open"]);
    fire(here, "claude-code", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "stop",
    });
    here.write(RECORD, recordText(stopped));
    expect(fire(here, "claude-code", written(RECORD)).out).not.toContain(notice);
    fire(here, "claude-code", written(`.greenline/ledger/${ID}/notes.md`));
    expect(here.record()).toContain("state: stopped");
  });

  it("prints the wait and names the stopped record on main with no remote, where the branch names no change of its own", () => {
    const here = space(stopped, "main");
    const start = fire(here, "claude-code", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s4",
      prompt: "carry on",
    });
    expect(start.out).toContain(
      `waiting on: wait for the owner's review of the tests, from the stopped change ${ID}'s next line`,
    );
    expect(fire(here, "claude-code", written("src/shelf.ts", { session_id: "s4" })).out).toContain(
      notice,
    );
    expect(here.record()).toContain("state: stopped");
  });

  it("says nothing when the turn writes no file of the change's, a discussion's record among them", () => {
    const here = space(stopped);
    fire(here, "claude-code", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s5",
      prompt: "an idea",
    });
    const discussed = fire(
      here,
      "claude-code",
      written(".greenline/ledger/discussions/2026-10-29-an-idea.md", { session_id: "s5" }),
    );
    const other = fire(
      here,
      "claude-code",
      written(".greenline/tmp/2026-10-29-other/notes.md", { session_id: "s5" }),
    );
    expect(discussed.out).not.toContain(notice);
    expect(other.out).not.toContain(notice);
    expect(here.record()).toContain("state: stopped");
  });

  it("names the record a session switched to from another branch at Codex's next turn, the switch itself no resume", () => {
    const here = space(stopped);
    here.git("checkout", "--quiet", "main");
    fire(here, "codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s3",
      prompt: "resume",
    });
    // The switch writes the record's file, which is git's write and no resume of the agent's.
    const switching = {
      session_id: "s3",
      tool_name: "Bash",
      tool_use_id: "call_switch",
      tool_input: { command: `git switch greenline/${ID}` },
    };
    fire(here, "codex", { hook_event_name: "PreToolUse", ...switching });
    here.git("checkout", "--quiet", `greenline/${ID}`);
    fire(here, "codex", { hook_event_name: "PostToolUse", ...switching });
    const patched = fire(here, "codex", {
      hook_event_name: "PostToolUse",
      session_id: "s3",
      tool_name: "apply_patch",
      tool_use_id: "call_2",
      tool_input: { command: "*** Begin Patch\n*** Add File: src/shelf.js\n*** End Patch" },
    });
    expect(patched.code).toBe(0);
    expect(here.record()).toContain("state: stopped");
    // Codex takes no after-tool context, so the notice comes at its next turn's mirror.
    const next = fire(here, "codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s3",
      prompt: "go on",
    });
    expect(next.out).toContain(notice);
  });
});
