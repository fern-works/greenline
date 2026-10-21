import { z } from "zod";
import type { Harness } from "./adapters.ts";
import { parseJson, type JsonValue } from "./contract.ts";

/**
 * `greenline event` (`docs/SPEC.md` §4; the research page
 * docs/research/2026-10-19-harness-hooks.md, "The design of `greenline
 * event`"): one entry point every harness adapter pipes into. A harness's
 * JSON payload is parsed through its dialect, a schema of the fields it
 * documents and a table of its native events and its tool names, into one
 * normalised event; a field the harness does not supply, or supplies in
 * another form, is null and never guessed. Reading the harness's own
 * structured fields is not parsing a command: the tool's name from its fixed
 * vocabulary, a path it passes as a field, the exit code it reports. The one
 * refusal the harness layer makes is a write-class tool's path outside the
 * homes while the record lacks the owner's yes; the git hooks hold the rest.
 */

/** The kinds greenline reads, each mapped from a harness's native event. */
export const EVENT_KINDS = [
  "session-start",
  "turn-start",
  "before-tool",
  "after-tool",
  "agent-start",
  "agent-stop",
  "turn-end",
  "compact",
  "session-end",
] as const;

/** One kind of event greenline reads, the one shape every harness's native event is normalised into. */
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * Whether a name is an event kind.
 * @param name the name given
 * @returns true for one of {@link EVENT_KINDS}
 */
export function isEventKind(name: string): name is EventKind {
  return EVENT_KINDS.some((kind) => kind === name);
}

/** A tool's class, by the harness's own tool name; an unknown name is other, recorded and never refused. */
export type ToolClass = "shell" | "write" | "other";

/** What the harness reported of a shell command. */
export interface CommandFacts {
  readonly text: string | null;
  /** The command's own directory as the harness gave it; null where it gives none. */
  readonly dir: string | null;
  readonly exit: number | null;
  readonly outcome: "ok" | "failed" | "unknown";
  readonly durationMs: number | null;
}

/** The one record greenline writes for every event, one JSON object per line of the change's raw log. */
export interface NormalisedEvent {
  readonly v: 1;
  readonly at: string;
  readonly harness: Harness;
  readonly kind: EventKind;
  readonly native: string | null;
  readonly session: string | null;
  readonly agent: string | null;
  /** The id pairing a before-tool with its after-tool. */
  readonly call: string | null;
  /** The session directory the harness reports. */
  readonly cwd: string | null;
  readonly tool: { readonly name: string | null; readonly class: ToolClass } | null;
  readonly command: CommandFacts | null;
  readonly write: { readonly paths: readonly string[] } | null;
  /** The declared check's name the command matched, filled in by the caller. */
  readonly check: string | null;
}

/** Where a harness takes the mirror at a session's or a turn's start. */
type ContextField = "hook-specific" | "cursor" | "hermes" | "none";

/** The harness's fields, read from its payload before the event is assembled. */
interface Fields {
  readonly native?: string | undefined;
  readonly session?: string | undefined;
  readonly agent?: string | undefined;
  readonly call?: string | undefined;
  readonly cwd?: string | undefined;
  readonly toolName?: string | undefined;
  /** A class the event itself fixes, as Cursor's shell and file-edit events do. */
  readonly toolClass?: ToolClass | undefined;
  readonly commandText?: string | undefined;
  readonly commandDir?: string | undefined;
  readonly exit?: number | undefined;
  /** Whether the event says the command ended well or not, for a harness that says so. */
  readonly ended?: "ok" | "failed" | undefined;
  readonly durationMs?: number | undefined;
  readonly paths: readonly string[];
}

/** One harness's dialect: its native events, its tool names, its context and the reading of its payload. */
interface Dialect {
  readonly kinds: Readonly<Partial<Record<string, EventKind>>>;
  readonly shell: readonly string[];
  readonly write: readonly string[];
  readonly context: ContextField;
  /** The kinds the context is printed at, of session-start and turn-start. */
  readonly contextAt: readonly EventKind[];
  readonly read: (payload: JsonValue, native: string | undefined) => Fields;
}

/** A field the harness documents as text; anything else reads as absent. */
const text = z.string().min(1).optional().catch(undefined);
/** A field the harness documents as a whole number; anything else reads as absent. */
const whole = z.number().int().optional().catch(undefined);

/**
 * The files a patch in the apply-patch envelope names, read from the
 * envelope's own headers, a format the harness defines.
 * @param patch the patch text
 * @returns the paths, in order
 */
export function patchPaths(patch: string): readonly string[] {
  return [
    ...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1].trim()]));
}

/** The paths of a write the harness gave, an absent one left out. */
function present(...paths: readonly (string | undefined)[]): readonly string[] {
  return paths.flatMap((path) => (path === undefined ? [] : [path]));
}

/** Claude Code's payload, which Codex, Droid, Gemini and dsh's bridge share. */
const claudePayload = z
  .object({
    hook_event_name: text,
    session_id: text,
    agent_id: text,
    tool_use_id: text,
    cwd: text,
    tool_name: text,
    tool_input: z
      .object({
        command: text,
        file_path: text,
        notebook_path: text,
        path: text,
        workdir: text,
        dir_path: text,
        patch: text,
        input: text,
      })
      .catch({}),
    error: text,
    duration_ms: whole,
  })
  .catch({ tool_input: {} });

/**
 * Claude Code's reading, which dsh's bridge shares under its own tool names:
 * the after event split by the command's exit only where the harness splits
 * it, and a directory only where the tool takes one.
 */
function claudeReading(splitsByExit: boolean, dirOf: "none" | "workdir") {
  return (raw: JsonValue, native: string | undefined): Fields => {
    const payload = claudePayload.parse(raw);
    const input = payload.tool_input;
    const exit =
      native === "PostToolUseFailure" ? /^Exit code (\d+)/.exec(payload.error ?? "") : null;
    // Claude Code fires PostToolUse on a command's success and PostToolUseFailure otherwise.
    const ended =
      !splitsByExit || native === undefined
        ? undefined
        : native === "PostToolUse"
          ? "ok"
          : native === "PostToolUseFailure"
            ? "failed"
            : undefined;
    return {
      native: payload.hook_event_name,
      session: payload.session_id,
      agent: payload.agent_id,
      call: payload.tool_use_id,
      cwd: payload.cwd,
      toolName: payload.tool_name,
      commandText: input.command,
      commandDir: dirOf === "workdir" ? input.workdir : undefined,
      ended,
      exit: exit?.[1] === undefined ? undefined : Number(exit[1]),
      durationMs: payload.duration_ms,
      paths: present(input.file_path ?? input.notebook_path ?? input.path),
    };
  };
}

/** Claude Code's native events, which Codex, Droid and dsh's bridge share. */
const CLAUDE_KINDS = {
  SessionStart: "session-start",
  UserPromptSubmit: "turn-start",
  PreToolUse: "before-tool",
  PostToolUse: "after-tool",
  PostToolUseFailure: "after-tool",
  SubagentStart: "agent-start",
  SubagentStop: "agent-stop",
  Stop: "turn-end",
  PreCompact: "compact",
  SessionEnd: "session-end",
} as const satisfies Readonly<Record<string, EventKind>>;

const cursorPayload = z
  .object({
    hook_event_name: text,
    conversation_id: text,
    command: text,
    cwd: text,
    duration: whole,
    file_path: text,
    tool_name: text,
    workspace_roots: z.array(z.string()).optional().catch(undefined),
  })
  .catch({});

const copilotArguments = z.object({ command: text, path: text, file_path: text, filePath: text });
/** Copilot's tool arguments, an object or that object's JSON text. */
const copilotArgs = z
  .union([
    copilotArguments,
    z.string().transform((value) => copilotArguments.safeParse(parseJson(value)).data),
  ])
  .optional()
  .catch(undefined);
const copilotPayload = z
  .object({
    sessionId: text,
    cwd: text,
    toolName: text,
    toolArgs: copilotArgs,
  })
  .catch({});

const kiroInput = z.object({ command: text, path: text, file_path: text }).catch({});
const kiroPayload = z
  .object({
    session_id: text,
    sessionId: text,
    cwd: text,
    tool_name: text,
    toolName: text,
    tool_input: kiroInput.optional(),
    toolInput: kiroInput.optional(),
  })
  .catch({});

const hermesResult = z.object({ exit_code: whole });
/** The terminal tool's result, an object or that object's JSON text. */
const hermesResultField = z
  .union([
    hermesResult,
    z.string().transform((value) => hermesResult.safeParse(parseJson(value)).data),
  ])
  .optional()
  .catch(undefined);

const hermesPayload = z
  .object({
    hook_event_name: text,
    session_id: text,
    cwd: text,
    tool_name: text,
    tool_input: z.object({ command: text, workdir: text, path: text, file_path: text }).catch({}),
    extra: z
      .object({
        result: hermesResultField,
        tool_call_id: text,
        duration_ms: whole,
      })
      .catch({}),
  })
  .catch({ tool_input: {}, extra: {} });

const opencodePayload = z
  .object({
    native: text,
    tool: text,
    sessionID: text,
    callID: text,
    args: z.object({ command: text, workdir: text, filePath: text, path: text }).catch({}),
    exit: whole,
    directory: text,
  })
  .catch({ args: {} });

const ampPayload = z
  .object({
    toolUseID: text,
    tool: text,
    input: z.object({ path: text, file_path: text }).catch({}),
    shell: z.object({ command: text, dir: text }).optional().catch(undefined),
    // Amp names the thread by its id, or by an object that carries it.
    thread: z
      .union([z.string().min(1), z.object({ id: z.string().min(1) }).transform(({ id }) => id)])
      .optional()
      .catch(undefined),
  })
  .catch({ input: {} });

const piPayload = z
  .object({
    toolName: text,
    input: z.object({ command: text, path: text, file_path: text }).catch({}),
  })
  .catch({ input: {} });

/** The outcome a reported exit code gives; none where the harness reports none. */
function endedBy(exit: number | undefined): "ok" | "failed" | undefined {
  return exit === undefined ? undefined : exit === 0 ? "ok" : "failed";
}

const DIALECTS = {
  "claude-code": {
    kinds: CLAUDE_KINDS,
    context: "hook-specific",
    contextAt: ["session-start", "turn-start"],
    shell: ["Bash"],
    write: ["Write", "Edit", "MultiEdit", "NotebookEdit"],
    read: claudeReading(true, "none"),
  },
  codex: {
    kinds: CLAUDE_KINDS,
    context: "hook-specific",
    contextAt: ["session-start", "turn-start"],
    shell: ["Bash"],
    write: ["apply_patch"],
    read: (raw) => {
      const payload = claudePayload.parse(raw);
      const command = payload.tool_input.command;
      const patch = payload.tool_name === "apply_patch";
      // Codex drops the exec call's own directory and its exit code from the hook payload.
      return {
        native: payload.hook_event_name,
        session: payload.session_id,
        agent: payload.agent_id,
        call: payload.tool_use_id,
        cwd: payload.cwd,
        toolName: payload.tool_name,
        commandText: patch ? undefined : command,
        paths: patch && command !== undefined ? patchPaths(command) : [],
      };
    },
  },
  droid: {
    kinds: CLAUDE_KINDS,
    context: "hook-specific",
    contextAt: ["session-start", "turn-start"],
    shell: ["Execute"],
    write: ["Create", "Edit", "ApplyPatch"],
    read: (raw) => {
      const payload = claudePayload.parse(raw);
      const input = payload.tool_input;
      const patch = input.patch ?? input.input;
      return {
        native: payload.hook_event_name,
        session: payload.session_id,
        cwd: payload.cwd,
        toolName: payload.tool_name,
        commandText: input.command,
        paths: [
          ...present(input.file_path ?? input.path),
          ...(patch === undefined ? [] : patchPaths(patch)),
        ],
      };
    },
  },
  dsh: {
    kinds: CLAUDE_KINDS,
    context: "hook-specific",
    contextAt: ["session-start", "turn-start"],
    shell: ["bash"],
    write: ["write", "edit", "str_replace_editor"],
    read: claudeReading(false, "workdir"),
  },
  gemini: {
    kinds: {
      SessionStart: "session-start",
      BeforeAgent: "turn-start",
      BeforeTool: "before-tool",
      AfterTool: "after-tool",
      AfterAgent: "turn-end",
      PreCompress: "compact",
      SessionEnd: "session-end",
    },
    context: "hook-specific",
    contextAt: ["session-start", "turn-start"],
    shell: ["run_shell_command"],
    write: ["write_file", "replace"],
    read: (raw) => {
      const payload = claudePayload.parse(raw);
      const input = payload.tool_input;
      return {
        native: payload.hook_event_name,
        session: payload.session_id,
        cwd: payload.cwd,
        toolName: payload.tool_name,
        commandText: input.command,
        commandDir: input.dir_path,
        paths: present(input.file_path),
      };
    },
  },
  cursor: {
    kinds: {
      sessionStart: "session-start",
      beforeSubmitPrompt: "turn-start",
      beforeShellExecution: "before-tool",
      afterShellExecution: "after-tool",
      preToolUse: "before-tool",
      postToolUse: "after-tool",
      afterFileEdit: "after-tool",
      subagentStart: "agent-start",
      subagentStop: "agent-stop",
      preCompact: "compact",
      stop: "turn-end",
      sessionEnd: "session-end",
    },
    context: "cursor",
    contextAt: ["session-start"],
    shell: [],
    write: [],
    read: (raw, native) => {
      const payload = cursorPayload.parse(raw);
      const shellEvent = native === "beforeShellExecution" || native === "afterShellExecution";
      // Cursor's shell and file-edit events are of their class by the event itself.
      const fixed: ToolClass | undefined = shellEvent
        ? "shell"
        : native === "afterFileEdit"
          ? "write"
          : undefined;
      return {
        native: payload.hook_event_name,
        session: payload.conversation_id,
        cwd: payload.workspace_roots?.[0],
        toolName: payload.tool_name,
        toolClass: fixed,
        commandText: shellEvent ? payload.command : undefined,
        commandDir: native === "beforeShellExecution" ? payload.cwd : undefined,
        durationMs: payload.duration,
        paths: present(payload.file_path),
      };
    },
  },
  copilot: {
    kinds: {},
    context: "none",
    contextAt: [],
    shell: ["bash", "shell"],
    write: ["edit", "create", "write"],
    read: (raw) => {
      const payload = copilotPayload.parse(raw);
      const args = payload.toolArgs;
      return {
        session: payload.sessionId,
        cwd: payload.cwd,
        toolName: payload.toolName,
        commandText: args?.command,
        paths: present(args?.path ?? args?.file_path ?? args?.filePath),
      };
    },
  },
  kiro: {
    kinds: {},
    context: "none",
    contextAt: [],
    shell: ["shell", "execute_bash"],
    write: ["write", "fs_write"],
    read: (raw) => {
      const payload = kiroPayload.parse(raw);
      const input = payload.tool_input ?? payload.toolInput;
      return {
        session: payload.session_id ?? payload.sessionId,
        cwd: payload.cwd,
        toolName: payload.tool_name ?? payload.toolName,
        commandText: input?.command,
        paths: present(input?.path ?? input?.file_path),
      };
    },
  },
  hermes: {
    kinds: {
      on_session_start: "session-start",
      pre_llm_call: "turn-start",
      pre_tool_call: "before-tool",
      post_tool_call: "after-tool",
      subagent_start: "agent-start",
      subagent_stop: "agent-stop",
      post_llm_call: "turn-end",
      post_compaction: "compact",
      on_session_end: "session-end",
    },
    context: "hermes",
    contextAt: ["turn-start"],
    shell: ["terminal"],
    write: ["write_file", "patch"],
    read: (raw) => {
      const payload = hermesPayload.parse(raw);
      const input = payload.tool_input;
      const exit = payload.extra.result?.exit_code;
      return {
        native: payload.hook_event_name,
        session: payload.session_id,
        call: payload.extra.tool_call_id,
        cwd: payload.cwd,
        toolName: payload.tool_name,
        commandText: input.command,
        commandDir: input.workdir,
        exit,
        ended: endedBy(exit),
        durationMs: payload.extra.duration_ms,
        paths: present(input.path ?? input.file_path),
      };
    },
  },
  opencode: {
    kinds: {},
    context: "none",
    contextAt: [],
    shell: ["bash"],
    write: ["write", "edit", "patch", "multiedit"],
    read: (raw) => {
      const payload = opencodePayload.parse(raw);
      return {
        native: payload.native,
        session: payload.sessionID,
        call: payload.callID,
        cwd: payload.directory,
        toolName: payload.tool,
        commandText: payload.args.command,
        commandDir: payload.args.workdir,
        exit: payload.exit,
        ended: endedBy(payload.exit),
        paths: present(payload.args.filePath ?? payload.args.path),
      };
    },
  },
  amp: {
    kinds: {},
    context: "none",
    contextAt: [],
    shell: [],
    write: ["edit_file", "create_file"],
    read: (raw) => {
      const payload = ampPayload.parse(raw);
      // Amp's own helper names a shell call's command and directory; its result carries no exit code.
      return {
        session: payload.thread,
        call: payload.toolUseID,
        toolName: payload.tool,
        toolClass: payload.shell?.command === undefined ? undefined : "shell",
        commandText: payload.shell?.command,
        commandDir: payload.shell?.dir,
        paths: present(payload.input.path ?? payload.input.file_path),
      };
    },
  },
  pi: {
    kinds: {},
    context: "none",
    contextAt: [],
    shell: ["bash"],
    write: ["write", "edit"],
    read: (raw) => {
      const payload = piPayload.parse(raw);
      return {
        toolName: payload.toolName,
        commandText: payload.input.command,
        paths: present(payload.input.path ?? payload.input.file_path),
      };
    },
  },
} as const satisfies Readonly<Record<Harness, Dialect>>;

/** What the entry point was given: the harness, the kind and the native event when named, the payload and the time. */
export interface EventInput {
  readonly harness: Harness;
  readonly kind: EventKind | undefined;
  readonly native: string | undefined;
  readonly payload: JsonValue;
  readonly at: string;
}

/** The class of a tool by the dialect's tables, or the class its event fixes. */
function classOf(dialect: Dialect, fields: Fields): ToolClass {
  if (fields.toolClass !== undefined) return fields.toolClass;
  const name = fields.toolName;
  if (name === undefined) return "other";
  if (dialect.shell.includes(name)) return "shell";
  return dialect.write.includes(name) ? "write" : "other";
}

/**
 * The normalised event, or undefined when no kind can be read: no kind given
 * and a native event the harness's table does not hold, which is recorded
 * nowhere and refused never.
 * @param input what the entry point was given
 * @returns the event, its `check` null for the caller to fill
 */
export function normaliseEvent(input: EventInput): NormalisedEvent | undefined {
  const dialect: Dialect = DIALECTS[input.harness];
  const named = input.native ?? dialect.read(input.payload, undefined).native;
  const kind = input.kind ?? (named === undefined ? undefined : dialect.kinds[named]);
  if (kind === undefined) return undefined;
  const fields = dialect.read(input.payload, named);
  const tooled = kind === "before-tool" || kind === "after-tool";
  const toolClass = classOf(dialect, fields);
  return {
    v: 1,
    at: input.at,
    harness: input.harness,
    kind,
    native: named ?? null,
    session: fields.session ?? null,
    agent: fields.agent ?? null,
    call: fields.call ?? null,
    cwd: fields.cwd ?? null,
    tool: tooled ? { name: fields.toolName ?? null, class: toolClass } : null,
    command:
      tooled && toolClass === "shell"
        ? {
            text: fields.commandText ?? null,
            dir: fields.commandDir ?? null,
            exit: fields.exit ?? null,
            outcome: kind === "after-tool" ? (fields.ended ?? "unknown") : "unknown",
            durationMs: fields.durationMs ?? null,
          }
        : null,
    write: tooled && toolClass === "write" ? { paths: fields.paths } : null,
    check: null,
  };
}

/**
 * What the entry point prints to the harness at a session's or a turn's
 * start: the mirror where the harness takes context, or nothing where it
 * takes none at this kind.
 * @param harness the harness
 * @param event the event
 * @param mirror the status mirror's text
 * @returns the bytes for stdout, empty for none
 */
export function contextOutput(harness: Harness, event: NormalisedEvent, mirror: string): string {
  const dialect: Dialect = DIALECTS[harness];
  if (!dialect.contextAt.includes(event.kind) || mirror === "") return "";
  switch (dialect.context) {
    case "hook-specific":
      return `${JSON.stringify({
        hookSpecificOutput: { hookEventName: event.native, additionalContext: mirror },
      })}\n`;
    case "cursor":
      return `${JSON.stringify({ additional_context: mirror })}\n`;
    case "hermes":
      return `${JSON.stringify({ context: mirror })}\n`;
    case "none":
      return "";
  }
}

/**
 * Whether a path lies in one of the homes a change may write before the
 * owner's yes: the ledger, `.greenline/ledger/`, and the change's own working
 * folder, `.greenline/tmp/<id>/`; while no change is open, the working
 * folders' home `.greenline/tmp/` whole, so a record can still be opened.
 * @param fromRoot the path relative to the repository root, `/`-separated
 * @param change the change's id, or undefined while no change is open
 * @returns true inside a home
 */
export function inHomes(fromRoot: string, change: string | undefined): boolean {
  return (
    fromRoot.startsWith(".greenline/ledger/") ||
    fromRoot.startsWith(change === undefined ? ".greenline/tmp/" : `.greenline/tmp/${change}/`)
  );
}
