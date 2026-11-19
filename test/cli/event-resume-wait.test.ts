/**
 * A resume is not the review's answer, and the shown work survives the stop
 * (J-214 S1; the register's row of 2026-11-05, "The keeper over the
 * oracle"; the close page, "Stops"), through `greenline event`'s and
 * `greenline status`'s entry points on fixture repositories with real git,
 * the run j196t-states-stop-2d's case: the owner stopped a careful change
 * after the tests were shown and before their review, the record's next
 * line "build: wait for the owner's review of the tests, then implement
 * findByYear", and the stop's commit a483507 carried the record and its
 * folder while the shown test file stayed uncommitted. In the owner's
 * clone, on "Carry on with that change.", the mirror said the owner's words
 * answered the wait (thread 002, turn 001, rollout line 13), and the agent
 * rewrote the tests the clone lacked and implemented without showing them.
 * The waiting line tells the resume of the stop apart from the answer to
 * the named wait, and the stop's fact names the uncommitted edits and the
 * folder's shown patch the stop's commit carries, which the clone's mirror
 * names beside the wait.
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

const ID = "2026-11-09-find-by-year";
const RECORD = `.greenline/ledger/${ID}.md`;
const PATCH = `.greenline/ledger/${ID}/shown.patch`;
const FIRST = "01a1bd8f-4c2e-7a10-b6d1-states-stop-2d";
const FRESH = "01a1bd93-3737-7fb1-bef4-e76fd5f26974";
const YES = "Yes, go ahead. Write the tests first and show them to me before you write the code.";
const STOP = "Stop there for today; I will pick this up tomorrow.";
const RESUME = "Carry on with that change.";
const ACTION = "wait for the owner's review of the tests, then implement findByYear";
const WAITING = `waiting on: ${ACTION}, from the record's next line`;
const RESUMED = `${WAITING}; the owner's words this turn resume the work: set state open as the first write, at build; the wait on the owner stands, the owner's review of the tests: do its act first, show again what it waits on where this checkout holds none, and wait for the owner's answer to it`;
const ANSWERED = `${WAITING}; the owner's words this turn answer it: set state open as the first write and go on`;
const SHOWN = `the folder's shown.patch holds the edits the owner saw: apply it before the wait's act, \`git apply ${PATCH}\``;
const KEEP = `uncommitted edits outside its folder: test/shelf.test.js; keep them as ${PATCH}, which the stop's commit carries, since a clone carries commits alone: \`git diff HEAD -- test/shelf.test.js > ${PATCH}\``;
const TEST_AT_STOP =
  "import { Shelf } from '../src/shelf.js';\ntest('findByYear keeps both bounds', () => {});\n";
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

function spaceAt(root: string): Space {
  return {
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
}

/** The run's sandbox: the shelf on main and the change's branch cut. */
function sandbox(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-resume-wait-"));
  cleanup.push(root);
  const space = spaceAt(root);
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
  space.write("test/shelf.test.js", "import { Shelf } from '../src/shelf.js';\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  space.git("checkout", "--quiet", "-b", `greenline/${ID}`);
  return space;
}

function recordText(state: string, next = `build: ${ACTION}`): string {
  return [
    "---",
    "mode: careful",
    "choice: accepted",
    `yes: "${YES}"`,
    'why: "Find shelf books published in a year range, ordered oldest first."',
    `state: ${state}`,
    ...(state === "stopped" ? [`stopped: "${STOP}"`] : []),
    `next: "${next}"`,
    "---",
    "",
    "## build",
    "",
    "Wrote the mixed-order range test before implementation; the tests remain uncommitted in test/shelf.test.js.",
    "",
  ].join("\n");
}

/** The hooks' clock, a second on at each event, so the turn that started last is one. */
let tick = 0;

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-08T23:40:00.000Z") + tick * 1000);
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
      tool_use_id: "call_adba57bb556d4b16b7a2f75f98fed9bb",
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

/** The sandbox at the stop's write and the after-tool event's output of that write. */
interface Stopped {
  readonly space: Space;
  readonly after: string;
}

/** Thread 001 to the stop's write: the yes, the record open, the tests shown uncommitted, the stop. */
function stoppedSandbox(harness: string): Stopped {
  const space = sandbox();
  ask(space, harness, FIRST, YES);
  writeRecord(space, harness, FIRST, recordText("open"));
  space.write("test/shelf.test.js", TEST_AT_STOP);
  ask(space, harness, FIRST, STOP);
  return { space, after: writeRecord(space, harness, FIRST, recordText("stopped")) };
}

/** The stop's commit, the record and its folder alone, with the folder's shown patch where the stop kept one. */
function commitStop(space: Space, keepPatch: boolean): void {
  if (keepPatch) space.write(PATCH, `${space.git("diff", "HEAD", "--", "test/shelf.test.js")}\n`);
  space.write(`.greenline/ledger/${ID}/anticipate-1.md`, "## Claims tried\n");
  space.git("add", "--", RECORD, `.greenline/ledger/${ID}/`);
  space.git("commit", "--quiet", "-m", "chore(shelf): record the stopping point");
}

/** The owner's clone of the sandbox at the stop's commit, on the change's branch. */
function cloneOf(space: Space): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-resume-wait-clone-"));
  cleanup.push(root);
  execFileSync("git", ["clone", "--quiet", "--branch", `greenline/${ID}`, space.root, root]);
  return spaceAt(root);
}

describe("J-214 S1 the stop's fact names the uncommitted edits and the folder's shown patch (j196t-states-stop-2d F2)", () => {
  it("names them after the write that sets the record stopped, on Claude Code, where the harness takes the after-tool's context", () => {
    const { after } = stoppedSandbox("claude-code");
    expect(contextOf(after)).toContain(KEEP);
  });

  it("names them in status --change and at the next turn's mirror on Codex, which takes no after-tool context", () => {
    const { space, after } = stoppedSandbox("codex");
    expect(after).toBe("");
    expect(status(space, "--change", ID)).toContain(KEEP);
    expect(ask(space, "codex", FIRST, "Commit what you have.").out).toContain(KEEP);
  });

  it("names an untracked file only where the record names it, and leaves the keep out once the folder holds the patch", () => {
    const { space } = stoppedSandbox("claude-code");
    space.write("test/find.test.js", "test('named', () => {});\n");
    space.write("notes.txt", "scratch\n");
    space.write(
      RECORD,
      recordText("stopped").replace(
        "in test/shelf.test.js.",
        "in test/shelf.test.js and test/find.test.js.",
      ),
    );
    const named = status(space);
    expect(named).toContain(
      `uncommitted edits outside its folder: test/shelf.test.js and test/find.test.js; keep them as ${PATCH}`,
    );
    expect(named).toContain(`git diff --no-index /dev/null test/find.test.js >> ${PATCH}`);
    expect(named).not.toContain("notes.txt");
    space.write(PATCH, "diff --git a/test/shelf.test.js b/test/shelf.test.js\n");
    const kept = status(space);
    expect(kept).toContain(`stopped: ${RECORD} reads stopped and no commit holds it`);
    expect(kept).not.toContain("keep them as");
  });
});

describe("J-214 S1 the clone's resume tells the stop's resume apart from the review's answer (j196t-states-stop-2d F1)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`says "${RESUME}" resumes the work while the review's wait stands, and names the folder's patch, on ${harness}`, () => {
      const { space } = stoppedSandbox(harness);
      commitStop(space, true);
      const clone = cloneOf(space);
      // The clone holds the stop's commit, and no shown test.
      expect(clone.git("status", "--short")).toBe("");
      fire(clone, harness, {
        hook_event_name: "SessionStart",
        session_id: FRESH,
        source: "startup",
      });
      const turn = ask(clone, harness, FRESH, RESUME);
      expect(turn.out).toContain(`${RESUMED}; ${SHOWN}`);
      expect(turn.out).not.toContain(ANSWERED);
      expect(status(clone)).toContain(`${RESUMED}; ${SHOWN}`);
    });

  for (const harness of ["codex", "claude-code"])
    it(`says the review's words and 2b's explicit approval answer the wait, on ${harness}`, () => {
      const { space } = stoppedSandbox(harness);
      commitStop(space, true);
      const clone = cloneOf(space);
      for (const words of [
        "Looks good, go ahead",
        "The tests look right; go on and write the code.",
      ]) {
        const turn = ask(clone, harness, FRESH, words);
        expect(turn.out, words).toContain(ANSWERED);
        expect(turn.out, words).not.toContain("the wait on the owner stands");
        expect(status(clone), words).toContain(ANSWERED);
      }
    });

  it("names the patch no longer once the tree holds the shown edits again", () => {
    const { space } = stoppedSandbox("codex");
    commitStop(space, true);
    const clone = cloneOf(space);
    clone.git("apply", PATCH);
    const turn = ask(clone, "codex", FRESH, RESUME);
    expect(turn.out).toContain(RESUMED);
    expect(turn.out).not.toContain("shown.patch holds");
  });

  it("names no patch in the checkout that stopped, whose tree still holds the edits", () => {
    const { space } = stoppedSandbox("codex");
    commitStop(space, true);
    const turn = ask(space, "codex", FRESH, RESUME);
    expect(turn.out).toContain(RESUMED);
    expect(turn.out).not.toContain("shown.patch holds");
  });

  it("reads a next line with no wait on the owner as J-205 left it", () => {
    const { space } = stoppedSandbox("codex");
    space.write(
      RECORD,
      recordText("stopped", "review: wait for the owner to resume independent review"),
    );
    commitStop(space, false);
    const turn = ask(cloneOf(space), "codex", FRESH, RESUME);
    expect(turn.out).toContain(
      "waiting on: wait for the owner to resume independent review, from the record's next line; the owner's words this turn answer it: set state open as the first write and go on",
    );
    expect(turn.out).not.toContain("the wait on the owner stands");
  });
});

describe("J-222 S1 the clone's resume keeps the wait under the Claude run's form of the next line (j217c-states-stop F1)", () => {
  /** The Claude run's next line at the stop commit 83caaba, its wait written `wait on`. */
  const CLAUDE_ACTION =
    "wait on the owner's review of the five red tests (test/shelf.test.js, kept as 2026-11-10-find-by-year/shown.patch), then write findByYear in src/shelf.js";
  const CLAUDE_WAITING = `waiting on: ${CLAUDE_ACTION}, from the record's next line`;

  /** The stop's commit with the Claude run's next line, and the owner's clone of it. */
  function clonedAtTheStop(harness: string): Space {
    const { space } = stoppedSandbox(harness);
    space.write(RECORD, recordText("stopped", `build: ${CLAUDE_ACTION}`));
    commitStop(space, true);
    return cloneOf(space);
  }

  for (const harness of ["codex", "claude-code"])
    it(`says "${RESUME}" resumes the work while the wait stands, never that the words answer it, on ${harness}`, () => {
      const clone = clonedAtTheStop(harness);
      fire(clone, harness, {
        hook_event_name: "SessionStart",
        session_id: FRESH,
        source: "startup",
      });
      const turn = ask(clone, harness, FRESH, RESUME);
      const resumed = `${CLAUDE_WAITING}; the owner's words this turn resume the work: set state open as the first write, at build; the wait on the owner stands, the owner's review of the five red tests: do its act first, show again what it waits on where this checkout holds none, and wait for the owner's answer to it; ${SHOWN}`;
      expect(turn.out).toContain(resumed);
      expect(turn.out).not.toContain("the owner's words this turn answer it");
      expect(status(clone)).toContain(resumed);
    });

  for (const harness of ["codex", "claude-code"])
    it(`says the review's words answer the wait, on ${harness}`, () => {
      const clone = clonedAtTheStop(harness);
      const turn = ask(clone, harness, FRESH, "The tests look right; go on and write the code.");
      expect(turn.out).toContain(
        `${CLAUDE_WAITING}; the owner's words this turn answer it: set state open as the first write and go on`,
      );
      expect(turn.out).not.toContain("the wait on the owner stands");
    });
});
