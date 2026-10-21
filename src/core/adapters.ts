import type { DeclaredCheck } from "./checks.ts";
import { isJsonObject, parseJson, type JsonValue } from "./contract.ts";

/**
 * The harness adapters (`docs/SPEC.md` §5, `workshop/components/installation-payload.md`):
 * one lean adapter per harness that pipes the harness's events into
 * `greenline event`, so greenline does the processing and behaves the same
 * everywhere (N-56 item 1; the research page
 * docs/research/2026-10-19-harness-hooks.md, "The adapter's bytes per
 * harness"). A command-hook adapter is a configuration whose every entry
 * is the same command with a fixed matcher and timeout, as stable bytes,
 * since Codex trusts a hook by its hash and Gemini and Droid warn when one
 * changes; a plugin adapter is one small module that calls `greenline event`
 * and maps its exit 2 to the harness's own refusal. `init` and `sync` write
 * the adapter of each harness present, and the manifest's `hooks.adapters`
 * turns them all off. Hermes and dsh install hooks only at the user's level,
 * so `init` prints their lines for the owner to add.
 */

/** The harnesses `greenline event --harness` reads, by the name the adapter passes. */
export const HARNESSES = [
  "claude-code",
  "codex",
  "opencode",
  "hermes",
  "droid",
  "amp",
  "dsh",
  "gemini",
  "cursor",
  "copilot",
  "pi",
  "kiro",
] as const;

/** One of the harnesses greenline reads, by the name its adapter passes to `greenline event --harness`. */
export type Harness = (typeof HARNESSES)[number];

/**
 * Whether a name is a harness greenline reads.
 * @param name the name given
 * @returns true for one of {@link HARNESSES}
 */
export function isHarness(name: string): name is Harness {
  return HARNESSES.some((harness) => harness === name);
}

/**
 * The paths whose presence at the root shows a harness is used here, for the
 * harnesses that are no installation target. Claude Code and Codex are
 * present where the manifest's targets name them; Hermes and dsh read hooks
 * only from the user's own configuration, so no file shows them.
 */
export type PresenceMarkers = { readonly [H in Harness]: readonly string[] };

/** Each harness's marker paths at the root. */
export const PRESENCE_MARKERS: PresenceMarkers = {
  "claude-code": [],
  codex: [],
  opencode: [".opencode", "opencode.json"],
  hermes: [],
  droid: [".factory"],
  amp: [".amp"],
  dsh: [],
  gemini: [".gemini"],
  cursor: [".cursor"],
  copilot: [".github/copilot", ".github/hooks", ".github/copilot-instructions.md"],
  pi: [".pi"],
  kiro: [".kiro"],
};

/** One command-hook entry as a harness's file holds it. */
type Entry = { readonly [key: string]: JsonValue };

/** A configuration merged into a file the owner may also write: its path, the key its events sit under, the object a new file starts from, and greenline's entries per event. */
export interface JsonAdapter {
  readonly harness: Harness;
  readonly path: string;
  /** The key the events sit under; undefined when they sit at the file's top level. */
  readonly key: string | undefined;
  /** The fields a new file opens with beside the events. */
  readonly base: { readonly [key: string]: JsonValue };
  /** greenline's entries, by event, in the order the file lists them. */
  readonly entries: readonly (readonly [string, readonly Entry[]])[];
}

/** A whole file greenline owns: a configuration of its own or a plugin module. */
export interface FileAdapter {
  readonly harness: Harness;
  readonly path: string;
  readonly content: string;
}

const command = (harness: Harness): string => `greenline event --harness ${harness}`;

/** A Claude Code group: an optional matcher and one command hook with its timeout. */
function group(harness: Harness, timeout: number, matcher?: string): Entry {
  const hook = { type: "command", command: command(harness), timeout };
  return matcher === undefined ? { hooks: [hook] } : { matcher, hooks: [hook] };
}

/** The events of a Claude Code style file, each with its matcher where a tool or an agent is matched. */
function commandEntries(
  harness: Harness,
  events: readonly (readonly [string, string | undefined])[],
  timeout: (event: string) => number,
): readonly (readonly [string, readonly Entry[]])[] {
  return events.map(([event, matcher]) => [event, [group(harness, timeout(event), matcher)]]);
}

const CLAUDE_EVENTS: readonly (readonly [string, string | undefined])[] = [
  ["SessionStart", undefined],
  ["UserPromptSubmit", undefined],
  ["PreToolUse", "*"],
  ["PostToolUse", "*"],
  ["PostToolUseFailure", "*"],
  ["SubagentStart", "*"],
  ["SubagentStop", "*"],
  ["Stop", undefined],
  ["PreCompact", undefined],
  ["SessionEnd", undefined],
];

/** Codex has no PostToolUseFailure: its PostToolUse fires after a non-zero exit too. */
const CODEX_EVENTS = CLAUDE_EVENTS.filter(([event]) => event !== "PostToolUseFailure");

/** Droid has no SubagentStart, so its agents are counted at the stop. */
const DROID_EVENTS: readonly (readonly [string, string | undefined])[] = [
  ["SessionStart", undefined],
  ["UserPromptSubmit", undefined],
  ["PreToolUse", "*"],
  ["PostToolUse", "*"],
  ["SubagentStop", undefined],
  ["Stop", undefined],
  ["PreCompact", undefined],
  ["SessionEnd", undefined],
];

const GEMINI_EVENTS: readonly (readonly [string, string | undefined])[] = [
  ["SessionStart", undefined],
  ["BeforeAgent", undefined],
  ["BeforeTool", "*"],
  ["AfterTool", "*"],
  ["AfterAgent", undefined],
  ["PreCompress", undefined],
  ["SessionEnd", undefined],
];

/** Cursor's events; the CLI fires a subset today, and the others stay for the day it fires them. */
const CURSOR_EVENTS = [
  "sessionStart",
  "beforeSubmitPrompt",
  "beforeShellExecution",
  "afterShellExecution",
  "preToolUse",
  "postToolUse",
  "afterFileEdit",
  "subagentStart",
  "subagentStop",
  "preCompact",
  "stop",
] as const;

/** Copilot's payload names no event, so each entry gives the kind and the native event on its command line. */
const COPILOT_EVENTS: readonly (readonly [string, string])[] = [
  ["sessionStart", "session-start"],
  ["userPromptSubmitted", "turn-start"],
  ["preToolUse", "before-tool"],
  ["postToolUse", "after-tool"],
  ["postToolUseFailure", "after-tool"],
  ["subagentStart", "agent-start"],
  ["subagentStop", "agent-stop"],
  ["agentStop", "turn-end"],
  ["preCompact", "compact"],
  ["sessionEnd", "session-end"],
];

/** A missing greenline must not stop every tool where a non-zero exit refuses one, Copilot's and Kiro's. */
const PATH_GUARD = "command -v greenline >/dev/null 2>&1 || exit 0";

/** The trigger names Kiro's pages confirm; its Prompt Submit and Session Start names in JSON were not confirmed. */
const KIRO_TRIGGERS: readonly (readonly [string, string])[] = [
  ["PreToolUse", "before-tool"],
  ["PostToolUse", "after-tool"],
  ["Stop", "turn-end"],
];

const json = (value: JsonValue): string => `${JSON.stringify(value, null, 2)}\n`;

/** The configurations merged into a harness's own file, every byte stable between releases. */
export const JSON_ADAPTERS: readonly JsonAdapter[] = [
  {
    harness: "claude-code",
    path: ".claude/settings.json",
    key: "hooks",
    base: {},
    entries: commandEntries("claude-code", CLAUDE_EVENTS, () => 10),
  },
  {
    harness: "codex",
    path: ".codex/hooks.json",
    key: "hooks",
    base: {},
    // Codex clamps SessionEnd to at most 3 seconds and warns when it must.
    entries: commandEntries("codex", CODEX_EVENTS, (event) => (event === "SessionEnd" ? 3 : 10)),
  },
  {
    harness: "droid",
    path: ".factory/hooks.json",
    key: undefined,
    base: {},
    entries: commandEntries("droid", DROID_EVENTS, () => 10),
  },
  {
    harness: "gemini",
    path: ".gemini/settings.json",
    key: "hooks",
    base: {},
    // Gemini's timeouts are in milliseconds.
    entries: commandEntries("gemini", GEMINI_EVENTS, () => 10000),
  },
  {
    harness: "cursor",
    path: ".cursor/hooks.json",
    key: "hooks",
    base: { version: 1 },
    entries: CURSOR_EVENTS.map((event) => [event, [{ command: command("cursor") }]]),
  },
];

const OPENCODE_PLUGIN = `// greenline's OpenCode adapter, written by greenline init and refreshed by sync.
// It pipes each event into greenline event, which does the processing, and turns
// greenline's refusal, exit 2, into OpenCode's, a thrown error.
import { spawnSync } from "node:child_process";
const run = (kind, payload) =>
  spawnSync("greenline", ["event", kind, "--harness", "opencode"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
export const Greenline = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    const r = run("before-tool", { ...input, args: output.args, directory });
    if (r.status === 2) throw new Error((r.stderr || "refused by greenline").trim());
  },
  "tool.execute.after": async (input, output) => {
    run("after-tool", { ...input, exit: output.metadata?.exit ?? null, directory });
  },
  event: async ({ event }) => {
    const kind = {
      "session.created": "session-start",
      "session.idle": "turn-end",
      "session.compacted": "compact",
    }[event.type];
    if (kind) run(kind, { native: event.type, directory });
  },
});
`;

const AMP_PLUGIN = `// greenline's Amp adapter, written by greenline init and refreshed by sync.
// It pipes each event into greenline event, which does the processing, and turns
// greenline's refusal, exit 2, into Amp's reject-and-continue.
import { spawnSync } from "node:child_process";
export default function (amp) {
  const run = (kind, payload) =>
    spawnSync("greenline", ["event", kind, "--harness", "amp"], {
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
  // A tool's result carries no command, so the call's shell command is kept for its after event.
  const shells = new Map();
  amp.on("session.start", (e) => {
    run("session-start", { thread: e.thread });
  });
  amp.on("agent.start", (e) => {
    run("turn-start", { id: e.id, thread: e.thread });
  });
  amp.on("tool.call", (e) => {
    const shell = amp.helpers.shellCommandFromToolCall(e);
    if (shell) shells.set(e.toolUseID, shell);
    const r = run("before-tool", { toolUseID: e.toolUseID, tool: e.tool, input: e.input, shell, thread: e.thread });
    return r.status === 2
      ? { action: "reject-and-continue", message: (r.stderr || "refused by greenline").trim() }
      : { action: "allow" };
  });
  amp.on("tool.result", (e) => {
    const shell = shells.get(e.toolUseID);
    shells.delete(e.toolUseID);
    run("after-tool", { toolUseID: e.toolUseID, tool: e.tool, status: e.status, shell, thread: e.thread });
  });
  amp.on("agent.end", (e) => {
    run("turn-end", { id: e.id, status: e.status, thread: e.thread });
  });
}
`;

const PI_EXTENSION = `// greenline's Pi adapter, written by greenline init and refreshed by sync.
// It pipes each event into greenline event, which does the processing, and turns
// greenline's refusal, exit 2, into Pi's block.
import { spawnSync } from "node:child_process";
export default function (pi) {
  const run = (kind, payload) =>
    spawnSync("greenline", ["event", kind, "--harness", "pi"], {
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
  pi.on("agent_start", async () => {
    run("turn-start", {});
  });
  pi.on("tool_call", async (event) => {
    const r = run("before-tool", { toolName: event.toolName, input: event.input });
    if (r.status === 2) return { block: true, reason: (r.stderr || "refused by greenline").trim() };
  });
  pi.on("tool_result", async (event) => {
    run("after-tool", { toolName: event.toolName, input: event.input, isError: event.isError });
  });
  pi.on("agent_end", async () => {
    run("turn-end", {});
  });
}
`;

/** The files greenline owns whole, one per harness that takes its adapter as a file of its own. */
export const FILE_ADAPTERS: readonly FileAdapter[] = [
  {
    harness: "copilot",
    path: ".github/hooks/greenline.json",
    content: json({
      version: 1,
      hooks: Object.fromEntries(
        COPILOT_EVENTS.map(([event, kind]) => [
          event,
          [
            {
              type: "command",
              bash: `${PATH_GUARD}; greenline event ${kind} --harness copilot --native ${event}`,
              timeoutSec: 10,
            },
          ],
        ]),
      ),
    }),
  },
  {
    harness: "kiro",
    path: ".kiro/hooks/greenline.json",
    content: json({
      version: "v1",
      hooks: KIRO_TRIGGERS.map(([trigger, kind]) => ({
        name: `greenline ${kind}`,
        trigger,
        action: {
          type: "command",
          command: `${PATH_GUARD}; greenline event ${kind} --harness kiro`,
        },
      })),
    }),
  },
  { harness: "opencode", path: ".opencode/plugins/greenline.js", content: OPENCODE_PLUGIN },
  { harness: "amp", path: ".amp/plugins/greenline.ts", content: AMP_PLUGIN },
  { harness: "pi", path: ".pi/extensions/greenline.ts", content: PI_EXTENSION },
  {
    // dsh's bridge reads a Claude Code shaped file; this one names dsh, so its tools are read by dsh's names.
    harness: "dsh",
    path: ".greenline/hooks/dsh.json",
    content: json({
      hooks: Object.fromEntries(
        commandEntries(
          "dsh",
          CLAUDE_EVENTS.filter(
            ([event]) => !["PostToolUseFailure", "PreCompact", "SessionEnd"].includes(event),
          ),
          () => 10,
        ),
      ),
    }),
  },
];

/**
 * The lines `init` prints for the harnesses whose hooks live in the user's
 * own configuration, which greenline never writes: Hermes's `config.yaml` and
 * a dsh profile's plugin entry.
 * @returns the lines, each harness's opening with its name
 */
export function optInLines(): readonly string[] {
  const hermes = [
    "on_session_start",
    "pre_llm_call",
    "pre_tool_call",
    "post_tool_call",
    "subagent_start",
    "subagent_stop",
    "post_llm_call",
    "post_compaction",
    "on_session_end",
  ];
  return [
    "Hermes Agent reads hooks from ~/.hermes/config.yaml alone; to pipe its events here, add:",
    "  hooks:",
    ...hermes.map((event) => `    ${event}: [{ command: "${command("hermes")}" }]`),
    "dsh reads hooks through its Claude Code bridge in a profile; to pipe its events here, add:",
    '  - name: "@deepseek-ai/dsh-hooks-claude-code"',
    "    config:",
    "      configPath: .greenline/hooks/dsh.json",
    "      projectDir: .",
  ];
}

/** A JSON object as the harness's file holds it. */
type JsonObject = { readonly [key: string]: JsonValue };

/** Whether an entry is greenline's own: its command pipes into `greenline event`. */
function isGreenlineEntry(entry: JsonValue): boolean {
  return JSON.stringify(entry).includes("greenline event");
}

/** The events greenline owns in a parsed file, with its entries alone, in a canonical order. */
function ownedOf(events: JsonObject): string {
  const owned = Object.entries(events)
    .flatMap(([event, value]): [string, JsonValue[]][] => {
      if (!Array.isArray(value)) return [];
      const ours = value.filter(isGreenlineEntry);
      return ours.length > 0 ? [[event, ours]] : [];
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(owned);
}

/** The owned bytes of a file that holds no entry of greenline's, so greenline owns nothing there yet. */
export const NO_ENTRIES = "[]";

/** greenline's entries of an adapter, by event. */
function entriesOf(adapter: JsonAdapter): JsonObject {
  return Object.fromEntries(adapter.entries.map(([event, list]) => [event, [...list]]));
}

/** The bytes the lock records as greenline's for a merged configuration: its entries alone, canonical. */
export function ownedBytes(adapter: JsonAdapter): string {
  return ownedOf(entriesOf(adapter));
}

/** A merged configuration that cannot be composed: the file is not a JSON object, or its events' place is not one. */
export interface JsonComposeFailure {
  readonly issues: readonly string[];
}

/** The object a file holds and the object its events sit in. */
interface Container {
  readonly root: JsonObject;
  readonly events: JsonObject;
}

/**
 * The object a file holds, and the object its events sit in.
 * @returns both, or why the file cannot be read as the harness's configuration
 */
function containerOf(text: string, key: string | undefined): Container | JsonComposeFailure {
  const raw = parseJson(text);
  if (raw === undefined) return { issues: ["the file is not JSON"] };
  if (!isJsonObject(raw)) return { issues: ["the file is not a JSON object"] };
  if (key === undefined) return { root: raw, events: raw };
  const inner = raw[key] ?? {};
  if (!isJsonObject(inner)) return { issues: [`its '${key}' field is not a JSON object`] };
  return { root: raw, events: inner };
}

/** The events with greenline's entries taken out, an event left with none dropped. */
function withoutOurs(events: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(events).flatMap(([event, value]): [string, JsonValue][] => {
      if (!Array.isArray(value)) return [[event, value]];
      const kept = value.filter((entry) => !isGreenlineEntry(entry));
      return kept.length > 0 ? [[event, kept]] : [];
    }),
  );
}

/** The file's object with its events replaced. */
function withEvents(root: JsonObject, key: string | undefined, events: JsonObject): JsonObject {
  return key === undefined ? events : { ...root, [key]: events };
}

/**
 * The entries greenline owns in a file as it stands on disk, for the lock's hash.
 * @param adapter the configuration
 * @param text the file's text
 * @returns the canonical owned bytes, or undefined when the file does not read
 */
export function ownedOnDisk(adapter: JsonAdapter, text: string): string | undefined {
  const read = containerOf(text, adapter.key);
  return "issues" in read ? undefined : ownedOf(read.events);
}

/**
 * A merged configuration's bytes: the owner's file with greenline's entries
 * replaced by the current ones, every other entry and field kept as it was
 * and where it was; a new file opens with the adapter's base fields.
 * @param adapter the configuration
 * @param disk the file's text, undefined when absent
 * @returns the text to write, or why the file cannot be merged
 */
export function composeJsonAdapter(
  adapter: JsonAdapter,
  disk: string | undefined,
): { readonly text: string } | JsonComposeFailure {
  const read = containerOf(disk ?? JSON.stringify(adapter.base), adapter.key);
  if ("issues" in read) return read;
  const kept = withoutOurs(read.events);
  const added = Object.fromEntries(
    adapter.entries.map(([event, list]): [string, JsonValue] => {
      const standing = kept[event];
      return [event, [...(Array.isArray(standing) ? standing : []), ...list]];
    }),
  );
  return { text: json(withEvents(read.root, adapter.key, { ...kept, ...added })) };
}

/**
 * The file a workspace with none gets: the adapter's base fields and its entries.
 * @param adapter the configuration
 * @returns the file's text
 */
export function freshJson(adapter: JsonAdapter): string {
  const events = entriesOf(adapter);
  return json(
    adapter.key === undefined
      ? { ...adapter.base, ...events }
      : { ...adapter.base, [adapter.key]: events },
  );
}

/**
 * The owner's file with greenline's entries taken out, for an adapter that
 * is no longer installed; undefined when nothing of the owner's remains, so
 * the file is removed.
 * @param adapter the configuration
 * @param disk the file's text
 * @returns the text to keep, or undefined to remove the file
 */
export function withoutGreenline(adapter: JsonAdapter, disk: string): string | undefined {
  const read = containerOf(disk, adapter.key);
  if ("issues" in read) return disk;
  const kept = withoutOurs(read.events);
  const key = adapter.key;
  const root =
    key === undefined
      ? kept
      : Object.keys(kept).length > 0
        ? { ...read.root, [key]: kept }
        : Object.fromEntries(Object.entries(read.root).filter(([field]) => field !== key));
  const rest = Object.entries(root).filter(
    ([field, value]) => !(field in adapter.base && adapter.base[field] === value),
  );
  return rest.length === 0 ? undefined : json(root);
}

/**
 * The merged configuration greenline writes at a path, if any.
 * @param path a path from the root
 * @returns the configuration, or undefined
 */
export function jsonAdapterAt(path: string): JsonAdapter | undefined {
  return JSON_ADAPTERS.find((adapter) => adapter.path === path);
}

/** What init, sync and status report of the hooks: the git hooks' registration, the declared checks, the adapters written and the opt-in lines. */
export interface HooksReport {
  readonly git:
    | {
        readonly state: "config" | "hooks-path";
        /** Set when greenline is not on the PATH the hooks run under, so every hook lets git go on unread (J-98 S1). */
        readonly greenline?: "missing" | undefined;
      }
    | { readonly state: "absent"; readonly reason: string; readonly line: string }
    | { readonly state: "off" };
  readonly checks: readonly DeclaredCheck[];
  /** The harnesses whose adapter this workspace holds. */
  readonly adapters: readonly Harness[];
}

/** The one line status and init print when no check is declared, with the two ways to declare one. */
export const NO_CHECKS_LINE =
  "no checks declared: declare each in the plan with 'greenline check --declare -- <command>', or record a run with 'greenline check -- <command>'";

/**
 * What a registration line adds when greenline is not on the PATH: each hook
 * script and the Copilot and Kiro adapters exit 0 without it, and every other
 * adapter's command fails to start, so nothing holds the promises.
 * @param greenline whether greenline is missing from the PATH
 * @returns the words to add, or nothing
 */
function unreachable(greenline: "missing" | undefined): string {
  return greenline === "missing"
    ? ", but unable to run: greenline is not on the PATH, so each hook lets git go on without reading a fact, as each harness adapter lets its tool go on; put greenline on the PATH, as npm install --global does"
    : "";
}

/**
 * The git hooks' state as one line.
 * @param git the state
 * @returns the line, without a newline
 */
export function gitHooksLine(git: HooksReport["git"]): string {
  switch (git.state) {
    case "config":
      return `git hooks: registered as config-based hooks${unreachable(git.greenline)}`;
    case "hooks-path":
      return `git hooks: registered through core.hooksPath${unreachable(git.greenline)}`;
    case "off":
      return "git hooks: off (hooks.git is false in the manifest)";
    case "absent":
      return `git hooks: absent: ${git.reason}; ${git.line}`;
  }
}

/**
 * The hooks as lines of text, for init, sync and status.
 * @param report the hooks' state
 * @returns the lines, each ending with a newline
 */
export function renderHooksText(report: HooksReport): string {
  const git = gitHooksLine(report.git);
  const checks =
    report.checks.length === 0
      ? NO_CHECKS_LINE
      : `checks declared: ${report.checks
          .map(
            (check) =>
              `${check.name} (${check.command}${check.dir === "." ? "" : ` in ${check.dir}`})`,
          )
          .join(", ")}`;
  const adapters = `harness adapters: ${report.adapters.length === 0 ? "none" : report.adapters.join(", ")}`;
  return `${git}\n${checks}\n${adapters}\n`;
}
