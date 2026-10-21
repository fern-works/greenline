/**
 * `greenline event`'s normalisation (J-93 S3), on payloads shaped as each
 * harness's documentation or source gives them (the research page
 * docs/research/2026-10-19-harness-hooks.md, "What the payload carries for
 * the matching"): every kind each harness fires, the tool's class from its
 * own name, the command and the write paths it passes as fields, and null
 * wherever it supplies nothing.
 */
import { describe, expect, it } from "vitest";
import type { Harness } from "../../src/core/adapters.ts";
import type { JsonValue } from "../../src/core/contract.ts";
import {
  contextOutput,
  EVENT_KINDS,
  inHomes,
  normaliseEvent,
  patchPaths,
  type EventKind,
  type NormalisedEvent,
} from "../../src/core/event.ts";

const AT = "2026-10-19T12:00:00.000Z";

function event(
  harness: Harness,
  payload: JsonValue,
  given: { readonly kind?: EventKind; readonly native?: string } = {},
): NormalisedEvent {
  const normalised = normaliseEvent({
    harness,
    kind: given.kind,
    native: given.native,
    payload,
    at: AT,
  });
  if (normalised === undefined) throw new Error("no kind read");
  return normalised;
}

/** The kind each native event of a payload-naming harness maps to. */
const NATIVE_KINDS: readonly (readonly [Harness, string, EventKind])[] = [
  ["claude-code", "SessionStart", "session-start"],
  ["claude-code", "UserPromptSubmit", "turn-start"],
  ["claude-code", "PreToolUse", "before-tool"],
  ["claude-code", "PostToolUse", "after-tool"],
  ["claude-code", "PostToolUseFailure", "after-tool"],
  ["claude-code", "SubagentStart", "agent-start"],
  ["claude-code", "SubagentStop", "agent-stop"],
  ["claude-code", "Stop", "turn-end"],
  ["claude-code", "PreCompact", "compact"],
  ["claude-code", "SessionEnd", "session-end"],
  ["codex", "SessionStart", "session-start"],
  ["codex", "UserPromptSubmit", "turn-start"],
  ["codex", "PreToolUse", "before-tool"],
  ["codex", "PostToolUse", "after-tool"],
  ["codex", "SubagentStart", "agent-start"],
  ["codex", "SubagentStop", "agent-stop"],
  ["codex", "Stop", "turn-end"],
  ["codex", "PreCompact", "compact"],
  ["codex", "SessionEnd", "session-end"],
  ["droid", "SessionStart", "session-start"],
  ["droid", "UserPromptSubmit", "turn-start"],
  ["droid", "PreToolUse", "before-tool"],
  ["droid", "PostToolUse", "after-tool"],
  ["droid", "SubagentStop", "agent-stop"],
  ["droid", "Stop", "turn-end"],
  ["droid", "PreCompact", "compact"],
  ["droid", "SessionEnd", "session-end"],
  ["dsh", "SessionStart", "session-start"],
  ["dsh", "UserPromptSubmit", "turn-start"],
  ["dsh", "PreToolUse", "before-tool"],
  ["dsh", "PostToolUse", "after-tool"],
  ["dsh", "SubagentStart", "agent-start"],
  ["dsh", "SubagentStop", "agent-stop"],
  ["dsh", "Stop", "turn-end"],
  ["gemini", "SessionStart", "session-start"],
  ["gemini", "BeforeAgent", "turn-start"],
  ["gemini", "BeforeTool", "before-tool"],
  ["gemini", "AfterTool", "after-tool"],
  ["gemini", "AfterAgent", "turn-end"],
  ["gemini", "PreCompress", "compact"],
  ["gemini", "SessionEnd", "session-end"],
  ["cursor", "sessionStart", "session-start"],
  ["cursor", "beforeSubmitPrompt", "turn-start"],
  ["cursor", "beforeShellExecution", "before-tool"],
  ["cursor", "afterShellExecution", "after-tool"],
  ["cursor", "preToolUse", "before-tool"],
  ["cursor", "postToolUse", "after-tool"],
  ["cursor", "afterFileEdit", "after-tool"],
  ["cursor", "subagentStart", "agent-start"],
  ["cursor", "subagentStop", "agent-stop"],
  ["cursor", "preCompact", "compact"],
  ["cursor", "stop", "turn-end"],
  ["cursor", "sessionEnd", "session-end"],
  ["hermes", "on_session_start", "session-start"],
  ["hermes", "pre_llm_call", "turn-start"],
  ["hermes", "pre_tool_call", "before-tool"],
  ["hermes", "post_tool_call", "after-tool"],
  ["hermes", "subagent_start", "agent-start"],
  ["hermes", "subagent_stop", "agent-stop"],
  ["hermes", "post_llm_call", "turn-end"],
  ["hermes", "post_compaction", "compact"],
  ["hermes", "on_session_end", "session-end"],
];

describe("J-93 S3 each native event maps to one kind, by the harness's own table", () => {
  it.each(NATIVE_KINDS)("%s %s is %s", (harness, native, kind) => {
    const read = event(harness, { hook_event_name: native, session_id: "s1" });
    expect(read).toMatchObject({ v: 1, at: AT, harness, kind, native });
  });

  it("covers every kind across the harnesses", () => {
    expect(new Set(NATIVE_KINDS.map(([, , kind]) => kind))).toEqual(new Set(EVENT_KINDS));
  });

  it("reads no kind from a native event the table does not hold, and takes the kind given on the command line", () => {
    expect(
      normaliseEvent({
        harness: "claude-code",
        kind: undefined,
        native: undefined,
        payload: { hook_event_name: "Notification" },
        at: AT,
      }),
    ).toBeUndefined();
    expect(
      event("copilot", { sessionId: "s" }, { kind: "turn-start", native: "userPromptSubmitted" }),
    ).toMatchObject({ kind: "turn-start", native: "userPromptSubmitted", session: "s" });
    expect(event("pi", {}, { kind: "turn-end" })).toMatchObject({ kind: "turn-end", native: null });
  });
});

describe("J-93 S3 Claude Code: the outcome by event, the duration and the absolute write path", () => {
  const base = { session_id: "s1", cwd: "/repo", tool_use_id: "toolu_1" };
  it("records a shell command and its success, with the duration, and no directory, which Bash takes none of", () => {
    expect(
      event("claude-code", {
        ...base,
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "pnpm run test" },
        duration_ms: 812,
      }),
    ).toEqual({
      v: 1,
      at: AT,
      harness: "claude-code",
      kind: "after-tool",
      native: "PostToolUse",
      session: "s1",
      agent: null,
      call: "toolu_1",
      cwd: "/repo",
      tool: { name: "Bash", class: "shell" },
      command: { text: "pnpm run test", dir: null, exit: null, outcome: "ok", durationMs: 812 },
      write: null,
      check: null,
    });
  });

  it("reads a failure's exit code from the harness's own error, and a write's file path", () => {
    expect(
      event("claude-code", {
        ...base,
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
        tool_input: { command: "pnpm run test" },
        error: "Exit code 1\nfailing test",
      }).command,
    ).toMatchObject({ outcome: "failed", exit: 1 });
    expect(
      event("claude-code", {
        ...base,
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/repo/src/a.ts", content: "x" },
      }),
    ).toMatchObject({
      tool: { name: "Write", class: "write" },
      write: { paths: ["/repo/src/a.ts"] },
    });
    expect(
      event("claude-code", { ...base, hook_event_name: "PreToolUse", tool_name: "Grep" }).tool,
    ).toEqual({ name: "Grep", class: "other" });
    expect(
      event("claude-code", { hook_event_name: "SubagentStart", agent_id: "a1", session_id: "s1" }),
    ).toMatchObject({ kind: "agent-start", agent: "a1", tool: null, command: null });
  });
});

describe("J-93 S3 the other command-hook harnesses", () => {
  it("Codex: the command with no directory and no exit code, and apply_patch's paths from its envelope", () => {
    const bash = event("codex", {
      hook_event_name: "PostToolUse",
      session_id: "s",
      turn_id: "t",
      tool_use_id: "c1",
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "cargo test" },
      tool_response: "ok",
    });
    expect(bash.command).toEqual({
      text: "cargo test",
      dir: null,
      exit: null,
      outcome: "unknown",
      durationMs: null,
    });
    const patch = event("codex", {
      hook_event_name: "PreToolUse",
      tool_name: "apply_patch",
      tool_input: {
        command:
          "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** Add File: docs/b.md\n+b\n*** End Patch\n",
      },
    });
    expect(patch).toMatchObject({
      tool: { name: "apply_patch", class: "write" },
      command: null,
      write: { paths: ["src/a.ts", "docs/b.md"] },
    });
  });

  it("Droid: Execute's command and a Create's path, the outcome unknown", () => {
    expect(
      event("droid", {
        hook_event_name: "PostToolUse",
        tool_name: "Execute",
        tool_input: { command: "make test" },
      }).command,
    ).toMatchObject({ text: "make test", outcome: "unknown" });
    expect(
      event("droid", {
        hook_event_name: "PreToolUse",
        tool_name: "Create",
        tool_input: { file_path: "notes.md" },
      }).write,
    ).toEqual({ paths: ["notes.md"] });
  });

  it("Gemini: run_shell_command with its directory, and write_file's path", () => {
    expect(
      event("gemini", {
        hook_event_name: "AfterTool",
        tool_name: "run_shell_command",
        tool_input: { command: "go test ./...", dir_path: "svc" },
      }).command,
    ).toMatchObject({ text: "go test ./...", dir: "svc", outcome: "unknown" });
    expect(
      event("gemini", {
        hook_event_name: "BeforeTool",
        tool_name: "write_file",
        tool_input: { file_path: "a.txt" },
      }).write,
    ).toEqual({ paths: ["a.txt"] });
  });

  it("Cursor: its shell events are shell by the event, with the command, the directory before and the duration after", () => {
    expect(
      event("cursor", {
        hook_event_name: "beforeShellExecution",
        conversation_id: "c",
        command: "npm test",
        cwd: "/repo/app",
        workspace_roots: ["/repo"],
      }),
    ).toMatchObject({
      session: "c",
      cwd: "/repo",
      tool: { name: null, class: "shell" },
      command: { text: "npm test", dir: "/repo/app" },
    });
    expect(
      event("cursor", { hook_event_name: "afterShellExecution", command: "npm test", duration: 40 })
        .command,
    ).toMatchObject({ durationMs: 40, dir: null, outcome: "unknown" });
    expect(
      event("cursor", { hook_event_name: "afterFileEdit", file_path: "/repo/a.ts" }),
    ).toMatchObject({ tool: { class: "write" }, write: { paths: ["/repo/a.ts"] } });
  });

  it("Copilot: the kind and native event from the command line, and toolArgs as its JSON text", () => {
    expect(
      event(
        "copilot",
        { sessionId: "s", cwd: "/repo", toolName: "bash", toolArgs: '{"command":"pytest"}' },
        { kind: "after-tool", native: "postToolUse" },
      ),
    ).toMatchObject({
      native: "postToolUse",
      tool: { name: "bash", class: "shell" },
      command: { text: "pytest", outcome: "unknown" },
    });
  });

  it("Hermes: terminal's command and its workdir, and the exit code inside its result", () => {
    const after = event("hermes", {
      hook_event_name: "post_tool_call",
      session_id: "s",
      cwd: "/home/u",
      tool_name: "terminal",
      tool_input: { command: "pytest -q", workdir: "/repo" },
      extra: { result: '{"output":"x","exit_code":2}', tool_call_id: "c9", duration_ms: 90 },
    });
    expect(after).toMatchObject({
      call: "c9",
      command: { text: "pytest -q", dir: "/repo", exit: 2, outcome: "failed", durationMs: 90 },
    });
  });

  it("dsh: the bridge's Claude Code shape under dsh's own tool names, the outcome unknown", () => {
    expect(
      event("dsh", {
        hook_event_name: "PostToolUse",
        tool_name: "bash",
        tool_input: { command: "npm test", workdir: "/repo" },
      }).command,
    ).toMatchObject({ text: "npm test", dir: "/repo", outcome: "unknown" });
  });

  it("Kiro: the kind from the command line and what the payload holds, none guessed", () => {
    expect(
      event(
        "kiro",
        { tool_name: "execute_bash", tool_input: { command: "make" } },
        { kind: "before-tool" },
      ),
    ).toMatchObject({ native: null, command: { text: "make" } });
  });
});

describe("J-93 S3 the plugin adapters' payloads", () => {
  it("OpenCode: the exit code its result's metadata carries, the workdir and the edit tool's path", () => {
    expect(
      event(
        "opencode",
        {
          tool: "bash",
          sessionID: "s",
          callID: "c",
          args: { command: "bun test", workdir: "/repo" },
          exit: 0,
          directory: "/repo",
        },
        { kind: "after-tool" },
      ),
    ).toMatchObject({
      call: "c",
      cwd: "/repo",
      command: { text: "bun test", dir: "/repo", exit: 0, outcome: "ok" },
    });
    expect(
      event("opencode", { tool: "edit", args: { filePath: "/repo/a.ts" } }, { kind: "before-tool" })
        .write,
    ).toEqual({ paths: ["/repo/a.ts"] });
    expect(
      event(
        "opencode",
        { native: "session.created", directory: "/repo" },
        { kind: "session-start" },
      ),
    ).toMatchObject({ native: "session.created" });
  });

  it("Amp: the shell command and directory its own helper names, kept for the result", () => {
    expect(
      event(
        "amp",
        {
          toolUseID: "t",
          tool: "Bash",
          shell: { command: "npm test", dir: "/repo" },
          status: "done",
        },
        { kind: "after-tool" },
      ),
    ).toMatchObject({
      call: "t",
      tool: { class: "shell" },
      command: { text: "npm test", dir: "/repo", outcome: "unknown" },
    });
  });

  it("Pi: bash's command and the write tool's path", () => {
    expect(
      event("pi", { toolName: "bash", input: { command: "make check" } }, { kind: "before-tool" })
        .command,
    ).toMatchObject({ text: "make check" });
    expect(
      event("pi", { toolName: "write", input: { path: "a.md" } }, { kind: "before-tool" }).write,
    ).toEqual({ paths: ["a.md"] });
  });

  it("reads a payload that is no object as fields of null, never a guess", () => {
    expect(event("pi", "not an object", { kind: "after-tool" })).toMatchObject({
      session: null,
      tool: { name: null, class: "other" },
      command: null,
      write: null,
    });
  });
});

describe("J-93 S3 the context, the homes and the patch envelope", () => {
  const start = event("claude-code", { hook_event_name: "SessionStart" });
  it("prints the mirror in each harness's own context shape, and nothing where it takes none", () => {
    expect(JSON.parse(contextOutput("claude-code", start, "mirror"))).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "mirror" },
    });
    const cursor = event("cursor", { hook_event_name: "sessionStart" });
    expect(JSON.parse(contextOutput("cursor", cursor, "m"))).toEqual({ additional_context: "m" });
    const hermes = event("hermes", { hook_event_name: "pre_llm_call" });
    expect(JSON.parse(contextOutput("hermes", hermes, "m"))).toEqual({ context: "m" });
    expect(contextOutput("copilot", event("copilot", {}, { kind: "session-start" }), "m")).toBe("");
    expect(
      contextOutput("cursor", event("cursor", { hook_event_name: "beforeSubmitPrompt" }), "m"),
    ).toBe("");
    expect(contextOutput("claude-code", start, "")).toBe("");
  });

  it("holds the ledger and the change's own working folder as the homes, and nothing else", () => {
    expect(inHomes(".greenline/ledger/2026-10-19-a.md", "2026-10-19-a")).toBe(true);
    expect(inHomes(".greenline/tmp/2026-10-19-a/notes.md", "2026-10-19-a")).toBe(true);
    expect(inHomes(".greenline/tmp/2026-10-19-b/notes.md", "2026-10-19-a")).toBe(false);
    expect(inHomes("src/a.ts", "2026-10-19-a")).toBe(false);
    expect(inHomes(".greenline/manifest.json", "2026-10-19-a")).toBe(false);
  });

  it("J-102 S1 while no change is open, holds the ledger and the working folders' home whole", () => {
    expect(inHomes(".greenline/ledger/2026-10-19-a.md", undefined)).toBe(true);
    expect(inHomes(".greenline/tmp/notes.md", undefined)).toBe(true);
    expect(inHomes(".greenline/tmp/2026-10-19-b/notes.md", undefined)).toBe(true);
    expect(inHomes("src/a.ts", undefined)).toBe(false);
    expect(inHomes(".greenline/manifest.json", undefined)).toBe(false);
    expect(inHomes(".greenline/tmpfile", undefined)).toBe(false);
  });

  it("reads every file header of the patch envelope", () => {
    expect(
      patchPaths(
        "*** Begin Patch\n*** Delete File: a\n*** Update File: b\n*** Move to: c\n*** End Patch",
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
