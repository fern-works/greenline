/**
 * The hooks' load facts and the start mirror's delivery (J-225 S1, part
 * B), through `greenline event` on a fixture repository: a skill read is
 * one fact per call, skill and file, a brace list a fact of each file; a
 * read the before-tool event did not note is noted after the tool, keyed
 * by the call, so no read becomes two facts and two reads of one page stay
 * two; an error while a load is noted leaves one line in the session's raw
 * log; a turn whose start hook was cut before its mirror reached the
 * harness is named at its next event that carries context, or by the next
 * turn's mirror; and a noted line is repeated by one turn-start's mirror
 * alone.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { performance } from "node:perf_hooks";
import { JSON_ADAPTERS } from "../../src/core/adapters.ts";
import type { JsonValue } from "../../src/core/contract.ts";
import { normaliseEvent } from "../../src/core/event.ts";
import { serializeLock } from "../../src/core/lock.ts";
import { parseChangeLoads, parseSessionFact } from "../../src/core/skill-loads.ts";
import { noteCards } from "../../src/shell/cards-note.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { compileInstallation } from "../../src/shell/installation.ts";
import { startTurn } from "../../src/shell/skill-loads.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-10-theme-settings";
const DAY = new Date().toISOString().slice(0, 10);
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const ROSTER = {
  ".claude/skills/tdd/SKILL.md": "# tdd\n",
  ".claude/skills/frame/SKILL.md": "# frame\n",
  ".claude/skills/review/references/brief.md": "# brief\n",
  ".agents/skills/review/references/brief.md": "# brief\n",
  ".agents/skills/review/references/greenline.md": "# greenline\n",
  ".agents/skills/review/references/lens.md": "# lens\n",
};

/** A repository on a branch of its own with the manifest, the installed roster and its lock, and an open change. */
function space(): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-event-loads-"));
  cleanup.push(root);
  const git = (...args: string[]): void => {
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
    });
  };
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("a.txt", "a\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  write(
    ".greenline/manifest.json",
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [] }),
  );
  for (const [path, text] of Object.entries(ROSTER)) write(path, text);
  write(
    ".greenline/lock.json",
    serializeLock({
      schemaVersion: 5,
      cliVersion: "0.1.0",
      installationRevision: "0".repeat(64),
      sources: [],
      files: new Map(Object.keys(ROSTER).map((path) => [path, "1".repeat(64)])),
    }),
  );
  git("checkout", "--quiet", "-b", "feature");
  write(
    `.greenline/ledger/${ID}.md`,
    [
      "---",
      "mode: quick",
      'why: "w"',
      "choice: accepted",
      'yes: "Yes."',
      "state: open",
      "---",
      "",
    ].join("\n"),
  );
  return root;
}

const CLAUDE = ["--harness", "claude-code"];
const CODEX = ["--harness", "codex"];

/** Fire one event as the harness pipes it. */
function fire(root: string, argv: readonly string[], payload: JsonValue): string {
  const writer = new RecordingWriter();
  runEventCli(argv, writer.writer, {
    cwd: root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date(),
  });
  return writer.out;
}

/** A shell call's event, before or after the tool. */
const bash = (root: string, name: string, call: string, command: string): JsonValue => ({
  hook_event_name: name,
  session_id: "s1",
  tool_name: "Bash",
  tool_use_id: call,
  cwd: root,
  tool_input: { command },
});

/** The loads the session's fact holds, as `skill/file`. */
function sessionLoads(root: string): readonly string[] {
  const path = join(root, ".greenline", "ledger", "sessions", `${DAY}-s1.jsonl`);
  if (!existsSync(path)) return [];
  return parseSessionFact(readFileSync(path, "utf8")).flatMap((line) =>
    "skill" in line ? [`${line.skill}/${line.file}`] : [],
  );
}

/** The loads the change's folder holds, as `skill/file`. */
function changeLoads(root: string): readonly string[] {
  const path = join(root, ".greenline", "ledger", ID, "skills", `${DAY}.jsonl`);
  if (!existsSync(path)) return [];
  return parseChangeLoads(readFileSync(path, "utf8")).map((load) => `${load.skill}/${load.file}`);
}

describe("J-225 S1 B1 a skill read through the hooks is one fact per call, skill and file", () => {
  it("notes the run's alternative once in the session's fact and once in the change's (j217c-roster-use)", () => {
    const root = space();
    const command =
      "cat .claude/skills/review/references/brief.md 2>/dev/null || cat .agents/skills/review/references/brief.md";
    fire(root, CLAUDE, bash(root, "PreToolUse", "c1", command));
    fire(root, CLAUDE, bash(root, "PostToolUse", "c1", command));
    expect(sessionLoads(root)).toEqual(["review/references/brief.md"]);
    expect(changeLoads(root)).toEqual(["review/references/brief.md"]);
  });

  it("notes each file of a brace list (j217t-conduct-runner finding 5)", () => {
    const root = space();
    const command = "cat .agents/skills/review/references/{greenline.md,lens.md}";
    fire(root, CODEX, bash(root, "PreToolUse", "c1", command));
    expect(changeLoads(root)).toEqual([
      "review/references/greenline.md",
      "review/references/lens.md",
    ]);
  });
});

describe("J-225 S1 B2 a load the before-tool event missed is noted after the tool, keyed by the call", () => {
  it("reads the call's id in each harness's after-tool payload", () => {
    for (const harness of ["claude-code", "codex"] as const) {
      const event = normaliseEvent({
        harness,
        kind: undefined,
        native: undefined,
        payload: bash("/w", "PostToolUse", "call_1", "cat a.md"),
        at: "2026-11-10T00:00:00.000Z",
      });
      expect(event?.kind, harness).toBe("after-tool");
      expect(event?.call, harness).toBe("call_1");
    }
  });

  it("loses no read of a parallel batch whose before-tool events came together (j217t-conduct-interface finding 3)", () => {
    const root = space();
    const tdd = "cd . && cat .claude/skills/tdd/SKILL.md";
    const frame = "cd . && cat .claude/skills/frame/SKILL.md";
    fire(root, CODEX, bash(root, "PreToolUse", "b1", tdd));
    fire(root, CODEX, bash(root, "PreToolUse", "b2", frame));
    fire(root, CODEX, bash(root, "PostToolUse", "b2", frame));
    fire(root, CODEX, bash(root, "PostToolUse", "b1", tdd));
    expect(changeLoads(root)).toEqual(["tdd/SKILL.md", "frame/SKILL.md"]);
  });

  it("notes a read whose before-tool event never came, once, on both harnesses", () => {
    for (const argv of [CLAUDE, CODEX]) {
      const root = space();
      const command = "cat .claude/skills/tdd/SKILL.md";
      fire(root, argv, bash(root, "PostToolUse", "m1", command));
      expect(changeLoads(root), argv[1]).toEqual(["tdd/SKILL.md"]);
      expect(sessionLoads(root), argv[1]).toEqual(["tdd/SKILL.md"]);
    }
  });

  it("keeps two reads of one page in two calls of one turn as two facts", () => {
    const root = space();
    const command = "cat .claude/skills/tdd/SKILL.md";
    fire(root, CODEX, { hook_event_name: "UserPromptSubmit", session_id: "s1", cwd: root });
    for (const call of ["r1", "r2"]) {
      fire(root, CODEX, bash(root, "PreToolUse", call, command));
      fire(root, CODEX, bash(root, "PostToolUse", call, command));
    }
    expect(changeLoads(root)).toEqual(["tdd/SKILL.md", "tdd/SKILL.md"]);
  });

  it("writes one line to the session's raw log where a load cannot be noted, in place of silence", () => {
    const root = space();
    // The sessions' facts home is a file, so the load's line cannot be appended.
    writeFileSync(join(root, ".greenline", "ledger", "sessions"), "not a folder\n");
    fire(root, CLAUDE, bash(root, "PreToolUse", "e1", "cat .claude/skills/tdd/SKILL.md"));
    const log = join(root, ".greenline", "tmp", "sessions", "s1.log.jsonl");
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ kind: "load-error", call: "e1" });
  });
});

/** The context Claude Code and Codex read from a hook. */
const CONTEXT = z.object({
  hookSpecificOutput: z.object({ additionalContext: z.string() }),
});

/** The mirror's text one start or after-tool event printed, empty where it printed none. */
function contextOf(out: string): string {
  if (out.trim() === "") return "";
  return CONTEXT.parse(JSON.parse(out)).hookSpecificOutput.additionalContext;
}

describe("J-225 S1 B3 a turn that began without its mirror is named (j217t-conduct-runner finding 1)", () => {
  const START = (root: string): JsonValue => ({
    hook_event_name: "UserPromptSubmit",
    session_id: "s1",
    cwd: root,
    prompt: "Go on.",
  });

  it("prints the mirror at the turn's first after-tool event on a harness that takes its context, naming the gap once", () => {
    const root = space();
    expect(contextOf(fire(root, CLAUDE, START(root)))).toContain(`greenline: change ${ID}`);
    // The next turn's start hook counted the turn, its first act, and was cut before its mirror reached the harness.
    startTurn(root, "s1", new Date().toISOString());
    const after = contextOf(fire(root, CLAUDE, bash(root, "PostToolUse", "t1", "ls")));
    expect(after).toContain("this turn began without its status mirror");
    expect(after).toContain(`greenline: change ${ID}`);
    expect(contextOf(fire(root, CLAUDE, bash(root, "PostToolUse", "t2", "ls")))).toBe("");
    // The next turn's mirror says nothing of a gap the after-tool event closed.
    expect(contextOf(fire(root, CLAUDE, START(root)))).not.toContain("without its status mirror");
  });

  it("names the gap in the next turn's mirror where no later event of the turn carries context", () => {
    const root = space();
    fire(root, CODEX, START(root));
    startTurn(root, "s1", new Date().toISOString());
    expect(fire(root, CODEX, bash(root, "PostToolUse", "t1", "ls"))).toBe("");
    const next = contextOf(fire(root, CODEX, START(root)));
    expect(next).toContain("the previous turn began without its status mirror");
    expect(contextOf(fire(root, CODEX, START(root)))).not.toContain("without its status mirror");
  });

  it("names no gap on a turn whose mirror was delivered", () => {
    const root = space();
    fire(root, CODEX, START(root));
    fire(root, CODEX, bash(root, "PostToolUse", "t1", "ls"));
    expect(contextOf(fire(root, CODEX, START(root)))).not.toContain("without its status mirror");
  });
});

/** A hook group as the adapter writes it, read for its timeout. */
const HOOK_GROUP = z.object({ hooks: z.array(z.object({ timeout: z.number() })) });

describe("J-225 S1 B3 the turn-start's mirror against the adapter's hook timeout (j217t-conduct-runner)", () => {
  it("prints the mirror on a ledger of the run's size well inside Codex's ten seconds", () => {
    const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
    if (compiled._tag !== "ok") throw new Error("the corpus does not compile");
    const installation = compiled.value;
    const root = space();
    // The run's ledger: two changes, each with its record, its folder and some seventy load facts.
    for (const id of [ID, "2026-11-10-members-csv"]) {
      const folder = join(root, ".greenline", "ledger", id, "skills");
      mkdirSync(folder, { recursive: true });
      const loads = Array.from({ length: 70 }, (_, at) =>
        JSON.stringify({
          skill: at % 2 === 0 ? "tdd" : "frame",
          file: "SKILL.md",
          whole: true,
          via: "cat",
          at: new Date(Date.UTC(2026, 10, 10, 0, at)).toISOString(),
          step: "build",
          agent: null,
          session: "s1",
          turn: 1 + Math.floor(at / 10),
        }),
      );
      writeFileSync(join(folder, `${DAY}.jsonl`), `${loads.join("\n")}\n`);
    }
    const codex = JSON_ADAPTERS.find((adapter) => adapter.harness === "codex");
    const group = codex?.entries.find(([event]) => event === "UserPromptSubmit")?.[1][0];
    const timeoutSeconds = HOOK_GROUP.parse(group).hooks[0]?.timeout ?? 0;
    expect(timeoutSeconds).toBe(10);
    const at = performance.now();
    runEventCli(CODEX, new RecordingWriter().writer, {
      cwd: root,
      stdin: () =>
        JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s1", cwd: root }),
      line: () => installation.modes,
      installation: () => installation,
    });
    const event = performance.now() - at;
    // Half the timeout leaves room for the process's start and a loaded machine. Measured on a copy of
    // the run's own sandbox on 2026-11-10, the turn-start took about 0.55 s, the mirror's reading about 0.34 s of it,
    // its slowest part, so the run's two cut starts are not the mirror's size and the timeout stays.
    expect(event).toBeLessThan((timeoutSeconds * 1000) / 2);
  });
});

describe("J-225 S1 B4 a noted line is repeated by one turn-start's mirror alone (j217c-conduct-interface finding 5)", () => {
  it("prints the nudge noted in a turn at the next turn's start and at no session start after it", () => {
    const root = space();
    const NUDGE = "nudge: are you in a rabbithole duct taping custom fixes together?";
    const turnStart = (): string =>
      contextOf(
        fire(root, CLAUDE, { hook_event_name: "UserPromptSubmit", session_id: "s1", cwd: root }),
      );
    const resume = (): string =>
      contextOf(
        fire(root, CLAUDE, {
          hook_event_name: "SessionStart",
          session_id: "s1",
          cwd: root,
          source: "resume",
        }),
      );
    turnStart();
    noteCards(root, "s1", NUDGE);
    expect(resume()).not.toContain(NUDGE);
    expect(turnStart()).toContain(NUDGE);
    expect(resume()).not.toContain(NUDGE);
    expect(turnStart()).not.toContain(NUDGE);
  });
});
