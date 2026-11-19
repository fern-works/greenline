/**
 * The wait named at the next turn's start (J-200 S1; the register's row of
 * 2026-11-05, "The keeper over the oracle"), through `greenline event`'s
 * and `greenline status`'s entry points on fixture repositories with real
 * git, the case the run j196t-states-stop-2's: the agent set the record
 * stopped while it waited for the owner's review inside the session, and
 * the next turn of the same session opened with the record stopped. The
 * mirror and status name a record that reads stopped while the session that
 * wrote it goes on, saying a wait leaves the record open; a fresh session's
 * resume, and the stop's own turn, read no such line.
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

const ID = "2026-11-08-find-by-year";
const RECORD = `.greenline/ledger/${ID}.md`;
const FIRST = "019a5b7e-c3f2-7e41-states-stop-first";
const FRESH = "019a5b7f-0a12-7c33-states-stop-fresh";
const WAIT = "Yes, go ahead. Write the tests first and show them to me before you write the code.";
const STOP = "Stop there for today; I will pick this up tomorrow.";
const HELD = `${RECORD} reads stopped while this session still holds the change`;
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

function workspace(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-stop-wait-"));
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
    "mode: regular",
    "choice: accepted",
    `yes: "${WAIT}"`,
    'why: "the shelf finds the books of a year range"',
    `state: ${state}`,
    'next: "build: the owner reviews the tests"',
    ...extra,
    "---",
    "",
    "## frame",
    "",
    "the range",
    "",
  ].join("\n");
}

/** The hooks' clock, a second on at each event, so the turn that started last is one. */
let tick = 0;

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-08T02:20:00.000Z") + tick * 1000);
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

/** The agent's write of the record, as the harness hands it before the tool. */
function writeRecord(where: Space, harness: string, session: string, text: string): void {
  where.write(RECORD, text);
  fire(
    where,
    harness,
    harness === "codex"
      ? {
          hook_event_name: "PreToolUse",
          session_id: session,
          tool_use_id: "call_w",
          tool_name: "apply_patch",
          tool_input: { command: `*** Begin Patch\n*** Update File: ${RECORD}\n*** End Patch` },
        }
      : {
          hook_event_name: "PreToolUse",
          session_id: session,
          tool_use_id: "w",
          tool_name: "Write",
          tool_input: { file_path: join(where.root, RECORD), content: text },
        },
  );
}

function status(where: Space): string {
  const writer = new RecordingWriter();
  runCli(["status"], writer.writer, "0.0.0-test", {
    cwd: where.root,
    version: "0.0.0-test",
    installation: fixtureInstallation(),
  });
  return writer.out;
}

describe("J-200 S1 a record stopped while the session that wrote it goes on is named a wait (j196t-states-stop-2)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`names it at the next turn's start of the same session, and status names it, on ${harness}`, () => {
      const space = workspace();
      ask(space, harness, FIRST, WAIT);
      writeRecord(space, harness, FIRST, recordText("open"));
      // The agent shows the tests and sets the record stopped while it waits for the review (001/002).
      writeRecord(space, harness, FIRST, recordText("stopped"));
      // The stop's own turn reads no such line.
      expect(status(space)).not.toContain(HELD);
      const next = ask(space, harness, FIRST, STOP);
      expect(next.out).toContain(HELD);
      expect(next.out).toContain(
        "a wait for the owner inside a session, for a review, an answer or a yes, is no stop and leaves the record open",
      );
      expect(next.out).toContain("and its stopped line stands nowhere");
      expect(status(space)).toContain(HELD);
    });

  it("reads no such line at a fresh session's resume of a record stopped on the owner's words", () => {
    const space = workspace();
    ask(space, "codex", FIRST, WAIT);
    writeRecord(space, "codex", FIRST, recordText("open"));
    ask(space, "codex", FIRST, STOP);
    writeRecord(space, "codex", FIRST, recordText("stopped", [`stopped: "${STOP}"`]));
    const resumed = ask(space, "codex", FRESH, "Carry on with that change.");
    expect(resumed.out).not.toContain(HELD);
    expect(status(space)).not.toContain(HELD);
  });
});

describe("J-228 S1 a record stopped on the owner's own stop words is no held stop (j217c-conduct-runner F7)", () => {
  /** The owner's words the run's export record quoted, `oracles/001/stdout.txt`. */
  const OWN = "Stop there; we build it another day.";

  for (const harness of ["codex", "claude-code"])
    it(`prints no held line over the owner's stop at the next turn and in the status, on ${harness}`, () => {
      const space = workspace();
      ask(space, harness, FIRST, WAIT);
      writeRecord(space, harness, FIRST, recordText("open"));
      ask(space, harness, FIRST, OWN);
      writeRecord(space, harness, FIRST, recordText("stopped", [`stopped: "${OWN}"`]));
      const next = ask(space, harness, FIRST, "What did we get done?");
      expect(next.out).not.toContain(HELD);
      expect(status(space)).not.toContain(HELD);
    });

  it("names a record set stopped in the same session on words that read as no stop, as before", () => {
    const space = workspace();
    ask(space, "codex", FIRST, WAIT);
    writeRecord(space, "codex", FIRST, recordText("open"));
    writeRecord(space, "codex", FIRST, recordText("stopped", [`stopped: "${WAIT}"`]));
    const next = ask(space, "codex", FIRST, "Are the tests shown?");
    expect(next.out).toContain(HELD);
    expect(status(space)).toContain(HELD);
  });
});
