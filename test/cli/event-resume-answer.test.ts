/**
 * The owner's answer to a stopped change's wait (J-205 S1; the register's
 * row of 2026-11-05, "The keeper over the oracle"; the close page,
 * "Stops"), through `greenline event`'s and `greenline status`'s entry
 * points on fixture repositories with real git, the run
 * j196t-conduct-emptyb's case: the farewell change stopped on main with no
 * remote at the review's wait, its next line "review: wait for the owner to
 * resume independent review", and a fresh session told "Carry on with that
 * change.", "Go on." and "Yes, please." left it stopped while the mirror
 * printed that the work went no further than that wait (002/002's rollout,
 * lines 46 and 49). The mirror and status read the owner's message of the
 * turn from the journal both harnesses' hooks fill and say the owner's
 * words answer the wait, the first write setting the record open; a
 * message off the list leaves the wait named as the record states it.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-08-farewell";
const RECORD = `.greenline/ledger/${ID}.md`;
const FIRST = "01a1bb6f-9509-7672-b16e-63bb60321156";
const FRESH = "01a1bb85-c8c1-7c42-8dde-da1597d61d8f";
const STOP = "Stop here for today; we carry on later.";
const WAIT = "wait for the owner to resume independent review";
const WAITING = `waiting on: ${WAIT}, from the stopped change ${ID}'s next line`;
const ANSWERED = `${WAITING}; the owner's words this turn answer it: set state open as the first write and go on`;
const PLAIN = `${WAITING}; the Waiting on row says it`;
const GO_AHEADS = ["Carry on with that change.", "Go on.", "Yes, please."] as const;
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

interface Space {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly git: (...args: string[]) => string;
}

function recordText(state: string): string {
  return [
    "---",
    "mode: regular",
    "choice: owner",
    'why: "the greeting module says goodbye"',
    `state: ${state}`,
    `next: "review: ${WAIT}"`,
    ...(state === "stopped" ? [`stopped: "${STOP}"`] : []),
    "---",
    "",
    "## frame",
    "",
    "the farewell",
    "",
  ].join("\n");
}

/** The run's workspace: main with no remote, the farewell record committed stopped at the review's wait. */
function workspace(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-resume-answer-"));
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
  space.write("greeting.py", "def farewell(name):\n    return f'Goodbye, {name}.'\n");
  space.write(RECORD, recordText("stopped"));
  space.git("add", ".");
  space.git("commit", "--quiet", "--no-verify", "-m", "chore(farewell): record stopping point");
  return space;
}

/** The hooks' clock, a second on at each event, so the turn that started last is one. */
let tick = 0;

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-08T14:17:00.000Z") + tick * 1000);
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

function status(where: Space): string {
  const writer = new RecordingWriter();
  runCli(["status"], writer.writer, "0.0.0-test", {
    cwd: where.root,
    version: "0.0.0-test",
    installation: fixtureInstallation(),
  });
  return writer.out;
}

describe("J-205 S1 the owner's words answer the stopped change's wait (j196t-conduct-emptyb)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`says each go-ahead answers the wait at the fresh session's turn and in status, on ${harness}`, () => {
      const space = workspace();
      fire(space, harness, {
        hook_event_name: "SessionStart",
        session_id: FRESH,
        source: "startup",
      });
      for (const words of GO_AHEADS) {
        const turn = ask(space, harness, FRESH, words);
        expect(turn.out, words).toContain(ANSWERED);
        expect(turn.out, words).not.toContain("goes no further");
        expect(status(space), words).toContain(ANSWERED);
      }
    });

  for (const harness of ["codex", "claude-code"])
    it(`names the wait as the record states it on a message off the list, on ${harness}`, () => {
      const space = workspace();
      const turn = ask(space, harness, FRESH, "What does the farewell function return?");
      expect(turn.out).toContain(PLAIN);
      expect(turn.out).not.toContain("answer it");
      expect(turn.out).not.toContain("goes no further");
      expect(status(space)).toContain(PLAIN);
      expect(status(space)).not.toContain("goes no further");
    });

  it("names the wait at a session's start, before any words of the owner's", () => {
    const space = workspace();
    const start = fire(space, "codex", {
      hook_event_name: "SessionStart",
      session_id: FRESH,
      source: "startup",
    });
    expect(start.out).toContain(PLAIN);
    expect(start.out).not.toContain("goes no further");
  });

  /** The session that stopped the record told to carry on, the record's stopped line as given. */
  function stoppedThenResumed(harness: string, stopped: string): string {
    const space = workspace();
    space.write(RECORD, recordText("open"));
    space.git("commit", "--quiet", "--no-verify", "-am", "open again");
    ask(space, harness, FIRST, "Add a farewell function.");
    fire(
      space,
      harness,
      harness === "codex"
        ? {
            hook_event_name: "PreToolUse",
            session_id: FIRST,
            tool_use_id: "call_w",
            tool_name: "apply_patch",
            tool_input: { command: `*** Begin Patch\n*** Update File: ${RECORD}\n*** End Patch` },
          }
        : {
            hook_event_name: "PreToolUse",
            session_id: FIRST,
            tool_use_id: "w",
            tool_name: "Write",
            tool_input: { file_path: join(space.root, RECORD), content: recordText("open") },
          },
    );
    ask(space, harness, FIRST, STOP);
    space.write(
      RECORD,
      recordText("stopped").replace(`stopped: "${STOP}"`, `stopped: "${stopped}"`),
    );
    space.git("commit", "--quiet", "--no-verify", "-am", "chore(farewell): record stopping point");
    return ask(space, harness, FIRST, "Carry on with that change.").out;
  }

  // J-228 S1, the run j217c-conduct-runner F7: a stopped line that holds the owner's stop is no held stop, and the waiting line answers.
  it("says the owner's words answer the wait, and names no held stop, where the stopped line quotes the owner's stop", () => {
    const resumed = stoppedThenResumed("claude-code", STOP);
    expect(resumed).not.toContain("reads stopped while this session still holds the change");
    expect(resumed).toContain(ANSWERED);
  });

  it("says the owner's words answer the held stop where the session set it stopped on words that read as no stop", () => {
    const resumed = stoppedThenResumed("codex", "Add a farewell function.");
    expect(resumed).toContain(
      `stopped: ${RECORD} reads stopped while this session still holds the change; the owner's words this turn answer it: set state open as the first write and go on`,
    );
    expect(resumed).toContain(ANSWERED);
  });
});
