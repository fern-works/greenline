/**
 * The harness adapters' bytes (J-93 S3; the research page
 * docs/research/2026-10-19-harness-hooks.md, "The adapter's bytes per
 * harness"): every command-hook entry is the same command with a fixed
 * matcher and timeout, so a harness that trusts a hook by its hash trusts it
 * once; a merged configuration keeps the owner's own entries; a plugin
 * module maps greenline's exit 2 to its harness's refusal.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  composeJsonAdapter,
  FILE_ADAPTERS,
  freshJson,
  HARNESSES,
  JSON_ADAPTERS,
  jsonAdapterAt,
  NO_ENTRIES,
  optInLines,
  ownedBytes,
  ownedOnDisk,
  renderHooksText,
  withoutGreenline,
  type JsonAdapter,
} from "../../src/core/adapters.ts";

/** A hook entry as the command-hook files hold one. */
const GROUP = z.object({
  matcher: z.string().optional(),
  hooks: z.array(z.object({ command: z.string(), timeout: z.number().optional() })),
});
/** A file's events, each to its entries. */
const EVENTS = z.record(z.string(), z.array(z.unknown()));
/** A configuration whose events sit under `hooks`. */
const SETTINGS = z.object({ hooks: z.record(z.string(), z.array(GROUP)) });

/** The merged text, or the test fails with the refusal's issues. */
function mergedText(composed: ReturnType<typeof composeJsonAdapter>): string {
  if ("issues" in composed) throw new Error(composed.issues.join("; "));
  return composed.text;
}

function adapter(path: string): JsonAdapter {
  const found = jsonAdapterAt(path);
  if (found === undefined) throw new Error(`no adapter at ${path}`);
  return found;
}

/** Every command string a configuration holds. */
function commands(text: string): readonly string[] {
  return [...text.matchAll(/"(?:command|bash)": "([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("J-93 S3 the command-hook adapters are stable bytes", () => {
  it("every entry of one harness's file is the same command, with --harness naming it", () => {
    for (const json of JSON_ADAPTERS) {
      const all = commands(freshJson(json));
      expect(all.length).toBeGreaterThan(5);
      expect(new Set(all)).toEqual(new Set([`greenline event --harness ${json.harness}`]));
    }
  });

  it("fixes each matcher and timeout: Claude Code's ten seconds and Codex's three on SessionEnd, Gemini's in milliseconds", () => {
    const claude = SETTINGS.parse(JSON.parse(freshJson(adapter(".claude/settings.json"))));
    expect(Object.keys(claude.hooks)).toEqual([
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "SubagentStart",
      "SubagentStop",
      "Stop",
      "PreCompact",
      "SessionEnd",
    ]);
    expect(claude.hooks["PreToolUse"]?.[0]?.matcher).toBe("*");
    expect(claude.hooks["SessionStart"]?.[0]?.matcher).toBeUndefined();
    const codex = SETTINGS.parse(JSON.parse(freshJson(adapter(".codex/hooks.json"))));
    expect(codex.hooks["SessionEnd"]?.[0]?.hooks[0]?.timeout).toBe(3);
    expect(codex.hooks["PostToolUseFailure"]).toBeUndefined();
    const gemini = SETTINGS.parse(JSON.parse(freshJson(adapter(".gemini/settings.json"))));
    expect(gemini.hooks["BeforeTool"]?.[0]?.hooks[0]?.timeout).toBe(10000);
    const droid = EVENTS.parse(JSON.parse(freshJson(adapter(".factory/hooks.json"))));
    expect(Object.keys(droid)).toContain("PreToolUse");
    expect(droid["SubagentStart"]).toBeUndefined();
    const cursor = z
      .object({ version: z.number(), hooks: EVENTS })
      .parse(JSON.parse(freshJson(adapter(".cursor/hooks.json"))));
    expect(cursor.version).toBe(1);
    expect(Object.keys(cursor.hooks)).toContain("beforeShellExecution");
  });

  it("Copilot's and Kiro's entries name the kind on the command line and let a missing greenline through, since a non-zero exit refuses there", () => {
    const copilot = FILE_ADAPTERS.find((file) => file.harness === "copilot")?.content ?? "";
    for (const line of commands(copilot)) {
      expect(
        line.startsWith("command -v greenline >/dev/null 2>&1 || exit 0; greenline event "),
      ).toBe(true);
      expect(line).toMatch(/ --harness copilot --native [A-Za-z]+$/);
    }
    expect(commands(copilot)).toContain(
      "command -v greenline >/dev/null 2>&1 || exit 0; greenline event before-tool --harness copilot --native preToolUse",
    );
    const kiro = FILE_ADAPTERS.find((file) => file.harness === "kiro")?.content ?? "";
    expect(commands(kiro)).toEqual([
      "command -v greenline >/dev/null 2>&1 || exit 0; greenline event before-tool --harness kiro",
      "command -v greenline >/dev/null 2>&1 || exit 0; greenline event after-tool --harness kiro",
      "command -v greenline >/dev/null 2>&1 || exit 0; greenline event turn-end --harness kiro",
    ]);
  });

  it("each plugin module calls greenline event and maps its exit 2 to the harness's own refusal", () => {
    const module = (harness: string) =>
      FILE_ADAPTERS.find((file) => file.harness === harness)?.content ?? "";
    expect(module("opencode")).toContain('"--harness", "opencode"');
    expect(module("opencode")).toContain("if (r.status === 2) throw new Error(");
    expect(module("amp")).toContain('{ action: "reject-and-continue", message:');
    expect(module("pi")).toContain("if (r.status === 2) return { block: true, reason:");
    for (const harness of ["opencode", "amp", "pi"]) expect(module(harness)).not.toContain("—");
  });

  it("names every harness greenline reads in an adapter or an opt-in line", () => {
    const covered = new Set([
      ...JSON_ADAPTERS.map((json) => json.harness),
      ...FILE_ADAPTERS.map((file) => file.harness),
      "hermes",
    ]);
    expect(covered).toEqual(new Set(HARNESSES));
    const lines = optInLines().join("\n");
    expect(lines).toContain('pre_tool_call: [{ command: "greenline event --harness hermes" }]');
    expect(lines).toContain("configPath: .greenline/hooks/dsh.json");
  });
});

describe("J-93 S3 a configuration merged into the owner's file", () => {
  const claude = adapter(".claude/settings.json");
  const owners = `${JSON.stringify(
    {
      permissions: { allow: ["Bash(npm test)"] },
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./guard.sh" }] }],
        Notification: [{ hooks: [{ type: "command", command: "notify" }] }],
      },
    },
    null,
    2,
  )}\n`;

  it("keeps the owner's fields and entries, adds greenline's after them, and owns its entries alone", () => {
    const merged = mergedText(composeJsonAdapter(claude, owners));
    const read = SETTINGS.extend({ permissions: z.object({ allow: z.array(z.string()) }) }).parse(
      JSON.parse(merged),
    );
    expect(read.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(read.hooks["PreToolUse"]?.map((entry) => entry.hooks[0]?.command)).toEqual([
      "./guard.sh",
      "greenline event --harness claude-code",
    ]);
    expect(read.hooks["Notification"]?.[0]?.hooks[0]?.command).toBe("notify");
    expect(ownedOnDisk(claude, merged)).toBe(ownedBytes(claude));
    expect(ownedOnDisk(claude, owners)).toBe(NO_ENTRIES);
  });

  it("is idempotent, and replaces an earlier greenline entry rather than adding a second", () => {
    const once = mergedText(composeJsonAdapter(claude, owners));
    expect(composeJsonAdapter(claude, once)).toEqual({ text: once });
    const stale = once.replace(/"timeout": 10/g, '"timeout": 99');
    expect(composeJsonAdapter(claude, stale)).toEqual({ text: once });
  });

  it("refuses a file that is not a JSON object, or whose hooks are not one, and reads a new file as its base", () => {
    expect(composeJsonAdapter(claude, "{ broken")).toMatchObject({ issues: [expect.any(String)] });
    expect(composeJsonAdapter(claude, "[1]")).toMatchObject({
      issues: ["the file is not a JSON object"],
    });
    expect(composeJsonAdapter(claude, '{"hooks": []}')).toMatchObject({
      issues: ["its 'hooks' field is not a JSON object"],
    });
    expect(composeJsonAdapter(claude, undefined)).toEqual({ text: freshJson(claude) });
    expect(freshJson(adapter(".cursor/hooks.json")).startsWith('{\n  "version": 1,')).toBe(true);
  });

  it("takes greenline's entries out and keeps the owner's, removing a file greenline alone filled", () => {
    const merged = mergedText(composeJsonAdapter(claude, owners));
    expect(JSON.parse(withoutGreenline(claude, merged) ?? "")).toEqual(JSON.parse(owners));
    expect(withoutGreenline(claude, freshJson(claude))).toBeUndefined();
    const cursor = adapter(".cursor/hooks.json");
    expect(withoutGreenline(cursor, freshJson(cursor))).toBeUndefined();
    expect(withoutGreenline(claude, "{ broken")).toBe("{ broken");
  });
});

describe("J-93 S3 the hooks' lines init, sync and status print", () => {
  it("states the registration, the declared checks or their absence with the two ways, and the adapters", () => {
    expect(
      renderHooksText({
        git: { state: "config" },
        checks: [{ name: "unit", command: "pnpm run test", dir: "." }],
        adapters: ["claude-code", "codex"],
      }),
    ).toBe(
      "git hooks: registered as config-based hooks\nchecks declared: unit (pnpm run test)\nharness adapters: claude-code, codex\n",
    );
    expect(
      renderHooksText({
        git: { state: "absent", reason: "the owner's hooks stand", line: "add the line" },
        checks: [],
        adapters: [],
      }),
    ).toBe(
      "git hooks: absent: the owner's hooks stand; add the line\nno checks declared: declare each in the plan with 'greenline check --declare -- <command>', or record a run with 'greenline check -- <command>'\nharness adapters: none\n",
    );
  });
});
