/**
 * A kept picture's anchor at the close (J-216 S1; the register's rows of
 * 2026-11-05, "The keeper over the oracle", and of 2026-11-09, "Outcomes,
 * not manners"), through `greenline event`'s and `greenline status`'s entry
 * points on fixture repositories with real git, the case the run
 * j196t-conduct-emptyd's (the judge's finding 2): two pictures were kept
 * during the change, each covering `greeting.py` and `test_greeting.py`,
 * the parts picture `README.md` too (thread 001, turns 008 and 009); a later
 * commit documented `say_hello`, touching `greeting.py`, and status named
 * the drift as GL0601 (thread 002, turn 001, item 6); the record was
 * committed stopped, then written done, and both manifests took the stop's
 * commit `16666eb` with no new keep, the drift gone from status.
 *
 * The write that sets the record done moves a picture's commit to HEAD's
 * only where no file it covers changed since its own; a picture whose
 * covered files changed keeps the commit of its keep, and status names its
 * drift after the close. No other write or commit of the record moves an
 * anchor, the stop's among them.
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

const ID = "2026-11-09-greeting-module";
const RECORD = `.greenline/ledger/${ID}.md`;
const HOME = `.greenline/visuals/${ID}`;
const SESSION = "01a1bda8-188b-7080-8738-b30cb6bc2670";
const YES = "Yes, go ahead at regular, and pause after the build.";
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
  readonly commit: (message: string, ...paths: string[]) => string;
}

/** The greeting module on the change's branch, its record open with the owner's yes and committed. */
function workspace(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-picture-pin-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const space: Space = {
    root,
    git,
    write: (path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    commit: (message: string, ...paths: string[]): string => {
      git("add", "--", ...(paths.length === 0 ? ["."] : paths));
      git("commit", "--quiet", "-m", message);
      return git("rev-parse", "HEAD");
    },
  };
  git("init", "--quiet", "-b", "main");
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
  space.write("greeting.py", "def say_hello(name):\n    return f'Hello, {name}.'\n");
  space.write("test_greeting.py", "import greeting\n");
  space.write("README.md", "# greeting\n");
  space.commit("feat(greeting): add a greeting function");
  git("checkout", "--quiet", "-b", `greenline/${ID}`);
  space.write(RECORD, recordText("open"));
  space.commit("chore(greeting): open the change", RECORD);
  return space;
}

function recordText(state: string): string {
  return [
    "---",
    "mode: regular",
    "choice: owner",
    `yes: "${YES}"`,
    'why: "Provide a small greeting module with a test."',
    `state: ${state}`,
    ...(state === "stopped" ? ['stopped: "Stop here for today; we carry on later."'] : []),
    ...(state === "done" ? ['outcome: "A greeting function returns a greeting."'] : []),
    "---",
    "",
    "## frame",
    "",
    "the greeting",
    "",
  ].join("\n");
}

/** A kept picture's manifest, as `greenline picture keep` writes it at the keep. */
function manifestText(title: string, commit: string, files: readonly string[]): string {
  return `${JSON.stringify(
    {
      schema: "greenline.visual/v1",
      title,
      form: "sequence",
      skill: "diagram-design",
      change: ID,
      commit,
      files,
      made: "2026-11-09",
      madeBy: "agent",
      summary: "Shows a caller passing a name to say_hello.",
    },
    null,
    2,
  )}\n`;
}

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-11-09T00:14:30.451Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

/** The tool's payload for a write of a path, as each harness hands it, its result after the tool. */
function writePayload(where: Space, harness: string, hook: string, path: string): JsonValue {
  const after = hook === "PostToolUse";
  if (harness === "codex") {
    const before = {
      hook_event_name: hook,
      session_id: SESSION,
      tool_use_id: "call_d65da1f3d415424e89ca75548c51216f",
      tool_name: "apply_patch",
      tool_input: { command: `*** Begin Patch\n*** Update File: ${path}\n*** End Patch` },
    };
    return after ? { ...before, tool_response: "{}" } : before;
  }
  const before = {
    hook_event_name: hook,
    session_id: SESSION,
    tool_use_id: "toolu_w",
    tool_name: "Write",
    tool_input: { file_path: join(where.root, path), content: "x" },
  };
  return after ? { ...before, tool_response: { filePath: join(where.root, path) } } : before;
}

/** The agent's write of the record, before and after the tool, returning the after-tool event's output. */
function writeRecord(where: Space, harness: string, state: string): string {
  fire(where, harness, writePayload(where, harness, "PreToolUse", RECORD));
  where.write(RECORD, recordText(state));
  return fire(where, harness, writePayload(where, harness, "PostToolUse", RECORD)).out;
}

/** A shell command's after-tool event, as each harness hands it. */
function shellAfter(where: Space, harness: string, command: string): string {
  return fire(where, harness, {
    hook_event_name: "PostToolUse",
    session_id: SESSION,
    tool_use_id: harness === "codex" ? "call_shell" : "toolu_s",
    tool_name: "Bash",
    tool_input: { command },
    tool_response: { stdout: "", stderr: "", interrupted: false },
  }).out;
}

/** The after-tool context a harness took back, empty where it took none. */
function contextOf(out: string): string {
  return out === "" ? "" : CONTEXT.parse(JSON.parse(out)).hookSpecificOutput.additionalContext;
}

const ENVELOPE = z.object({
  diagnostics: z.array(z.object({ code: z.string(), message: z.string() })),
});

/** Status's text, then each of its diagnostics, code first, as its JSON envelope holds them. */
function status(where: Space): string {
  const run = (flags: readonly string[]): string => {
    const writer = new RecordingWriter();
    runCli(["status", ...flags], writer.writer, "0.0.0-test", {
      cwd: where.root,
      version: "0.0.0-test",
      installation: fixtureInstallation(),
    });
    return writer.out;
  };
  const found = ENVELOPE.parse(JSON.parse(run(["--json"]))).diagnostics;
  return [run([]), ...found.map((entry) => `${entry.code} ${entry.message}`)].join("\n");
}

const commitOf = (where: Space, slug: string): string =>
  z
    .object({ commit: z.string() })
    .parse(JSON.parse(readFileSync(join(where.root, `${HOME}/${slug}.visual.json`), "utf8")))
    .commit;

/** The run's change at its stop's commit, and the commits the anchors name. */
interface AtTheStop {
  readonly space: Space;
  /** The request path's anchor, the commit of its keep (a267195 in the run). */
  readonly path: string;
  /** The parts picture's anchor, the usage picture's too (1ca91e1 in the run). */
  readonly parts: string;
  /** The stop's commit (16666eb in the run). */
  readonly stop: string;
}

/** The run's change up to the stop's commit: the pictures kept, a covered file changed after, the stop committed. */
function upToTheStop(harness: string): AtTheStop {
  const space = workspace();
  fire(space, harness, { hook_event_name: "UserPromptSubmit", session_id: SESSION, prompt: YES });
  space.write("greeting.py", "def say_hello(name):\n    return f'Hello, {name}.'\n\n");
  const path = space.commit("fix(greeting): end message with a full stop");
  // Thread 001 turn 008: the request path kept at a267195, committed with its picture at 1ca91e1.
  space.write(
    `${HOME}/request-path.visual.json`,
    manifestText("Greeting request path", path, ["greeting.py", "test_greeting.py"]),
  );
  space.write(`${HOME}/request-path.svg`, "<svg/>");
  const parts = space.commit("docs(greeting): keep request path picture");
  // Thread 001 turn 009: the parts picture kept at 1ca91e1, README.md among its files.
  space.write(
    `${HOME}/greeting-parts.visual.json`,
    manifestText("Greeting parts", parts, ["greeting.py", "test_greeting.py", "README.md"]),
  );
  space.write(`${HOME}/greeting-parts.svg`, "<svg/>");
  // A third picture, of README.md alone, which no later commit touches.
  space.write(`${HOME}/usage.visual.json`, manifestText("Greeting usage", parts, ["README.md"]));
  space.write(`${HOME}/usage.svg`, "<svg/>");
  space.commit("docs(greeting): keep parts picture");
  // b49c0f0: the docstring commit touches greeting.py, which both run pictures cover.
  space.write(
    "greeting.py",
    'def say_hello(name):\n    """Greet."""\n    return f\'Hello, {name}.\'\n',
  );
  space.commit("docs(greeting): document say_hello");
  writeRecord(space, harness, "stopped");
  const stop = space.commit("chore(greeting): record stop before review", RECORD);
  shellAfter(space, harness, "git commit -m 'chore(greeting): record stop before review'");
  return { space, path, parts, stop };
}

const PIN_KEPT = (id: string, commit: string): string =>
  `${ID}/${id} keeps its commit ${commit.slice(0, 7)}, as a file it covers changed since`;

describe("J-216 S1 a kept picture's anchor moves at the close only where nothing it covers moved (j196t-conduct-emptyd)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`leaves every anchor at the stop's commit, and at the done write moves the untouched picture's alone, on ${harness}`, () => {
      const { space, path, parts, stop } = upToTheStop(harness);
      // The stop's commit leaves the anchors as the keeps wrote them.
      expect(commitOf(space, "request-path")).toBe(path);
      expect(commitOf(space, "greeting-parts")).toBe(parts);
      expect(commitOf(space, "usage")).toBe(parts);
      const before = status(space);
      expect(before).toContain("drift: 2 visuals changed since their commits");
      expect(before).toContain(`GL0601 name the visual '${ID}/request-path'`);
      writeRecord(space, harness, "done");
      expect(commitOf(space, "request-path")).toBe(path);
      expect(commitOf(space, "greeting-parts")).toBe(parts);
      expect(commitOf(space, "usage")).toBe(stop);
      // The close's commit carries the record and the moved manifest; status still names the two drifts.
      space.commit("chore(greeting): close the reviewed change");
      const after = status(space);
      expect(after).toContain("drift: 2 visuals changed since their commits");
      expect(after).toContain(
        `GL0601 name the visual '${ID}/request-path', "Greeting request path"`,
      );
      expect(after).toContain(`GL0601 name the visual '${ID}/greeting-parts', "Greeting parts"`);
      expect(after).toContain(`1 commit since ${path.slice(0, 7)} touched the files it covers`);
      expect(after).toContain(`1 commit since ${parts.slice(0, 7)} touched the files it covers`);
      expect(after).not.toContain(`'${ID}/usage'`);
    });

  it("names the anchors the close moved and kept after the done write, on Claude Code, where the harness takes the after-tool's context", () => {
    const { space, path, parts, stop } = upToTheStop("claude-code");
    const line = contextOf(writeRecord(space, "claude-code", "done"));
    expect(line).toContain(
      `pictures at the close: ${ID}/usage takes ${stop.slice(0, 7)}, as nothing it covers changed since its commit; commit its manifest with the record`,
    );
    expect(line).toContain(PIN_KEPT("greeting-parts", parts));
    expect(line).toContain(PIN_KEPT("request-path", path));
    expect(line).toContain("status names the drift (GL0601), which the close section names");
    expect(line).toContain("the reply offers no remake, which is the owner's ask alone");
  });

  it("names them at the next turn's mirror on Codex, which takes no after-tool context", () => {
    const { space, parts } = upToTheStop("codex");
    expect(writeRecord(space, "codex", "done")).toBe("");
    const next = fire(space, "codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION,
      prompt: "Thanks.",
    });
    expect(next.out).toContain(PIN_KEPT("greeting-parts", parts));
  });

  it("moves no anchor at a later tool or commit while the record reads done, only at the write that sets it done", () => {
    const { space, stop } = upToTheStop("claude-code");
    writeRecord(space, "claude-code", "done");
    expect(commitOf(space, "usage")).toBe(stop);
    // A commit of the review's files before the close's, then a shell command after it.
    space.write(`.greenline/ledger/${ID}/review-1.md`, "## Findings\n\nnone\n");
    const review = space.commit("chore(greeting): record the review", `.greenline/ledger/${ID}/`);
    expect(contextOf(shellAfter(space, "claude-code", "git status --short"))).not.toContain(
      "pictures at the close",
    );
    expect(commitOf(space, "usage")).toBe(stop);
    expect(commitOf(space, "usage")).not.toBe(review);
  });

  it("moves a picture kept with the close and untouched since to HEAD's commit, as before", () => {
    const space = workspace();
    const at = space.git("rev-parse", "HEAD");
    space.write(
      `${HOME}/request-path.visual.json`,
      manifestText("Greeting request path", at, ["greeting.py"]),
    );
    space.write(`${HOME}/request-path.svg`, "<svg/>");
    space.write("NOTES.md", "notes\n");
    const head = space.commit("docs: notes");
    writeRecord(space, "claude-code", "done");
    expect(commitOf(space, "request-path")).toBe(head);
  });
});
