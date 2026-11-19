/**
 * The cards' mark read at the question tool's after-tool event (J-149 S2;
 * frame's interview page): a card whose first option's label does not end
 * with "(Recommended)" is named once in the hook's context, in a refusal's
 * form with its rule, on Claude Code's question tool and on Codex's; a call
 * whose every card is marked is passed with nothing said. The calls are the
 * Linear replay's, from the capture corpus, and one planted for Codex.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { refusalsIn } from "../../src/core/reply-forms.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-cards-"));
  cleanup.push(root);
  execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  mkdirSync(join(root, ".greenline"), { recursive: true });
  writeFileSync(
    join(root, ".greenline", "manifest.json"),
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [] }),
  );
  return root;
}

function fire(root: string, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-10-29T12:00:00.000Z"),
  });
  return { code, out: writer.out, err: writer.err };
}

/** The question call a capture keeps, its input as the harness handed it. */
function capturedCall(capture: string): JsonValue {
  const calls = readFileSync(
    join(import.meta.dirname, "..", "fixtures", "captures", capture, "calls.jsonl"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => z.object({ tool: z.string(), input: z.string() }).parse(JSON.parse(line)));
  const call = calls.find((one) => one.tool === "AskUserQuestion");
  if (call === undefined) throw new Error(`${capture} keeps no question call`);
  return z.json().parse(JSON.parse(call.input));
}

/** Whether the series captures stand here: the workshop keeps them out of the public tree. */
const CAPTURED_HERE = existsSync(
  join(import.meta.dirname, "..", "fixtures", "captures", "manifest.json"),
);

const CONTEXT = z.object({
  hookSpecificOutput: z.object({ additionalContext: z.string() }),
});

describe("J-149 S2 the cards' mark at the question tool's after-tool event", () => {
  it.skipIf(!CAPTURED_HERE)(
    "names each card of the Linear replay's 002/002 round that put no marked option first, once, on Claude Code",
    () => {
      const root = workspace();
      const named = fire(root, "claude-code", {
        hook_event_name: "PostToolUse",
        session_id: "s1",
        tool_name: "AskUserQuestion",
        tool_use_id: "toolu_cards",
        tool_input: capturedCall("j109c-linearb/002-002"),
      });
      expect(named.code).toBe(0);
      const context = CONTEXT.parse(JSON.parse(named.out)).hookSpecificOutput.additionalContext;
      expect(context).toContain('puts "Issue page" first');
      expect(context).toContain('puts "Made order" first');
      expect(context).toContain('puts "Like labels" first');
      expect(context.match(/puts "Issue page" first/g)).toHaveLength(1);
      expect(refusalsIn(context).map((line) => `${line.rule} ${line.hook}`)).toEqual([
        "card-label harness",
      ]);
    },
  );

  it("passes a deal's card, which carries the reroll and puts no direction forward", () => {
    const root = workspace();
    const dealt = fire(root, "claude-code", {
      hook_event_name: "PostToolUse",
      session_id: "s3",
      tool_name: "AskUserQuestion",
      tool_use_id: "toolu_deal",
      tool_input: {
        questions: [
          {
            header: "direction",
            question: "Which direction?",
            options: [
              { label: "Paper" },
              { label: "Ledger" },
              { label: "Lanes" },
              { label: "Reroll" },
            ],
          },
        ],
      },
    });
    expect(dealt.out).toBe("");
  });

  it.skipIf(!CAPTURED_HERE)(
    "passes a round whose every card is marked, as the 001/004 round was",
    () => {
      const root = workspace();
      const marked = fire(root, "claude-code", {
        hook_event_name: "PostToolUse",
        session_id: "s1",
        tool_name: "AskUserQuestion",
        tool_use_id: "toolu_marked",
        tool_input: capturedCall("j109c-linearb/001-004"),
      });
      expect(marked.code).toBe(0);
      expect(marked.out).toBe("");
    },
  );

  it("names an unmarked card of Codex's question tool at the next turn's mirror, Codex taking no after-tool context", () => {
    const root = workspace();
    fire(root, "codex", { hook_event_name: "UserPromptSubmit", session_id: "s2", prompt: "go" });
    const codex = fire(root, "codex", {
      hook_event_name: "PostToolUse",
      session_id: "s2",
      tool_name: "request_user_input",
      tool_use_id: "call_q",
      tool_input: {
        questions: [
          {
            header: "scope",
            id: "scope",
            question: "Archived rows too?",
            options: [
              { label: "Live rows", description: "Only the rows in use." },
              { label: "All rows", description: "Archived ones as well." },
            ],
          },
        ],
      },
    });
    expect(codex.code).toBe(0);
    expect(codex.out).toBe("");
    const next = fire(root, "codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s2",
      prompt: "live rows",
    });
    expect(CONTEXT.parse(JSON.parse(next.out)).hookSpecificOutput.additionalContext).toContain(
      '"scope" puts "Live rows" first',
    );
    // Once: the turn after does not print it again.
    const after = fire(root, "codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: "s2",
      prompt: "go on",
    });
    expect(after.out).not.toContain("Live rows");
  });
});
