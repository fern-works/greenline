/**
 * The stop's commit named where the agent can still make it (J-210 S1; the
 * register's row of 2026-11-05, "The keeper over the oracle"), through
 * `greenline event`'s and `greenline status`'s entry points on fixture
 * repositories with real git, the case the run j196t-states-stop-2c's: on
 * the owner's "Stop there for today; I will pick this up tomorrow." the
 * agent set the record stopped, its stopped line quoting the words, and
 * made no commit, the record and its folder left untracked (thread 001,
 * turn 005). The after-tool hook says after the write that sets the record
 * stopped that no commit holds it and that the record and its folder are
 * committed now, where the harness takes the after-tool's context; the
 * mirror of the next turn and `greenline status` say the same until the
 * commit stands, and nothing once it does.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-08-find-by-year";
const RECORD = `.greenline/ledger/${ID}.md`;
const SESSION = "01a1bc1c-1461-70d3-a5fb-e88ad4676236";
const FRESH = "019a5b7f-0a12-7c33-stop-commit-fresh";
const YES = "Yes, go ahead. Write the tests first and show them to me before you write the code.";
const STOP = "Stop there for today; I will pick this up tomorrow.";
const AFTER = "Commit what you have so I can pick it up from my clone tomorrow.";
const OWED = `stopped: ${RECORD} reads stopped and no commit holds it; commit the record and its folder now, the stop's commit, since a clone and a fresh session carry commits alone`;
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const definition = ((): ModesDefinition => {
  const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
})();

const CONTEXT = z.object({
  hookSpecificOutput: z.object({ additionalContext: z.string() }),
});

interface Space {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly git: (...args: string[]) => string;
}

function workspace(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-stop-commit-"));
  cleanup.push(root);
  const space: Space = {
    root,
    git: (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    write: (path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    },
  };
  space.git("init", "--quiet", "-b", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({
      schemaVersion: 6,
      targets: ["claude-code", "codex"],
      checks: [],
      proceed: "none",
      hooks: { adapters: true, git: false },
    }),
  );
  space.write(".gitignore", ".greenline/tmp/\n");
  space.write("src/shelf.js", "export class Shelf {}\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  space.git("checkout", "--quiet", "-b", `greenline/${ID}`);
  return space;
}

function recordText(state: string, extra: readonly string[] = []): string {
  return [
    "---",
    "mode: careful",
    "choice: accepted",
    `yes: "${YES}"`,
    'why: "Find shelf books in a publication-year range, ordered oldest first."',
    `state: ${state}`,
    state === "stopped"
      ? `next: "build: wait for the owner's review of the tests"`
      : 'next: "build: implement findByYear after the owner has seen the tests"',
    ...extra,
    "---",
    "",
    "## frame",
    "",
    "the range",
    "",
  ].join("\n");
}

const STOPPED = recordText("stopped", [`stopped: "${STOP}"`]);

/** The hooks' clock, a second on at each event, so the turn that started last is one. */
let tick = 0;

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-08T17:00:00.000Z") + tick * 1000);
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => at,
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

const ask = (where: Space, harness: string, session: string, prompt: string) =>
  fire(where, harness, { hook_event_name: "UserPromptSubmit", session_id: session, prompt });

/** The tool's payload for a write of a path, as each harness hands it, its result after the tool. */
function writePayload(
  where: Space,
  harness: string,
  session: string,
  hook: string,
  path: string,
  text: string,
): JsonValue {
  const after = hook === "PostToolUse";
  if (harness === "codex") {
    const before = {
      hook_event_name: hook,
      session_id: session,
      tool_use_id: "call_d65da1f3d415424e89ca75548c51216f",
      tool_name: "apply_patch",
      tool_input: { command: `*** Begin Patch\n*** Update File: ${path}\n*** End Patch` },
    };
    return after ? { ...before, tool_response: "{}" } : before;
  }
  const before = {
    hook_event_name: hook,
    session_id: session,
    tool_use_id: "toolu_w",
    tool_name: "Write",
    tool_input: { file_path: join(where.root, path), content: text },
  };
  return after ? { ...before, tool_response: { filePath: join(where.root, path) } } : before;
}

/** The agent's write of the record, before and after the tool, returning the after-tool event's output. */
function writeRecord(where: Space, harness: string, session: string, text: string): string {
  fire(where, harness, writePayload(where, harness, session, "PreToolUse", RECORD, text));
  where.write(RECORD, text);
  return fire(where, harness, writePayload(where, harness, session, "PostToolUse", RECORD, text))
    .out;
}

/** The after-tool context a harness took back, empty where it took none. */
function contextOf(out: string): string {
  return out === "" ? "" : CONTEXT.parse(JSON.parse(out)).hookSpecificOutput.additionalContext;
}

function status(where: Space, ...flags: string[]): string {
  const writer = new RecordingWriter();
  runCli(["status", ...flags], writer.writer, "0.0.0-test", {
    cwd: where.root,
    version: "0.0.0-test",
    installation: fixtureInstallation(),
  });
  return writer.out;
}

/** The stop's commit, the record and its folder alone. */
function commitStop(where: Space): void {
  where.write(`.greenline/ledger/${ID}/anticipate-1.md`, "## Claims tried\n");
  where.git("add", "--", RECORD, `.greenline/ledger/${ID}/`);
  where.git("commit", "--quiet", "-m", "chore(ledger): stop find-by-year");
}

const count = (text: string, part: string): number => text.split(part).length - 1;

describe("J-210 S1 the stop's commit named in the turn that writes the stop (j196t-states-stop-2c)", () => {
  it("names it after the write that sets the record stopped, on Claude Code, where the harness takes the after-tool's context", () => {
    const space = workspace();
    ask(space, "claude-code", SESSION, YES);
    writeRecord(space, "claude-code", SESSION, recordText("open"));
    ask(space, "claude-code", SESSION, STOP);
    const after = contextOf(writeRecord(space, "claude-code", SESSION, STOPPED));
    expect(count(after, OWED)).toBe(1);
  });

  it("names it in status --change after the write and at the next turn's mirror on Codex, which takes no after-tool context, once", () => {
    const space = workspace();
    ask(space, "codex", SESSION, YES);
    writeRecord(space, "codex", SESSION, recordText("open"));
    ask(space, "codex", SESSION, STOP);
    expect(writeRecord(space, "codex", SESSION, STOPPED)).toBe("");
    // The status the agent ran after the write at 001/005, in the stop's own turn.
    expect(status(space, "--change", ID)).toContain(OWED);
    const next = ask(space, "codex", SESSION, AFTER);
    expect(count(next.out, OWED)).toBe(1);
  });

  for (const harness of ["codex", "claude-code"])
    it(`says it at the next turn's mirror and in status until the commit stands, then nothing, on ${harness}`, () => {
      const space = workspace();
      ask(space, harness, SESSION, YES);
      writeRecord(space, harness, SESSION, recordText("open"));
      ask(space, harness, SESSION, STOP);
      writeRecord(space, harness, SESSION, STOPPED);
      // The record and its folder untracked, as 001/005 left them.
      expect(space.git("status", "--short")).toContain(`?? .greenline/ledger/`);
      expect(status(space)).toContain(OWED);
      expect(ask(space, harness, SESSION, AFTER).out).toContain(OWED);
      commitStop(space);
      expect(status(space)).not.toContain(OWED);
      expect(status(space, "--change", ID)).not.toContain(OWED);
      expect(ask(space, harness, SESSION, "Thanks.").out).not.toContain(OWED);
    });

  it("names it where the record's committed state is open, the stop written over it", () => {
    const space = workspace();
    ask(space, "claude-code", SESSION, YES);
    writeRecord(space, "claude-code", SESSION, recordText("open"));
    space.git("add", "--", RECORD);
    space.git("commit", "--quiet", "-m", "chore(ledger): open find-by-year");
    ask(space, "claude-code", SESSION, STOP);
    expect(contextOf(writeRecord(space, "claude-code", SESSION, STOPPED))).toContain(OWED);
    expect(status(space)).toContain(OWED);
  });

  it("says nothing of a stopped record whose commit holds the stop, at a later write of it or at a tool that writes it not", () => {
    const space = workspace();
    ask(space, "claude-code", SESSION, YES);
    writeRecord(space, "claude-code", SESSION, recordText("open"));
    ask(space, "claude-code", SESSION, STOP);
    writeRecord(space, "claude-code", SESSION, STOPPED);
    commitStop(space);
    const again = contextOf(
      writeRecord(
        space,
        "claude-code",
        SESSION,
        recordText("stopped", [`stopped: "${STOP}"`, 'agent: "claude-code/opus"']),
      ),
    );
    expect(again).not.toContain(OWED);
    const shell = fire(space, "claude-code", {
      hook_event_name: "PostToolUse",
      session_id: SESSION,
      tool_use_id: "toolu_s",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
      tool_response: { stdout: "", stderr: "", interrupted: false },
    });
    expect(contextOf(shell.out)).not.toContain(OWED);
    expect(status(space)).not.toContain(OWED);
  });

  it("says nothing at a fresh session's resume whose owner's words answer the stopped record, which the first write sets open", () => {
    const space = workspace();
    ask(space, "codex", SESSION, YES);
    writeRecord(space, "codex", SESSION, recordText("open"));
    ask(space, "codex", SESSION, STOP);
    writeRecord(space, "codex", SESSION, STOPPED);
    const resumed = ask(space, "codex", FRESH, "Carry on with that change.");
    expect(resumed.out).not.toContain(OWED);
  });
});
