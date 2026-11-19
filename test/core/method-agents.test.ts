import { describe, expect, it } from "vitest";
import {
  agentPromptOf,
  agentStarter,
  helpersLine,
  launchProvenance,
  methodAgents,
  methodAgentsWords,
  methodOfStart,
  rolloutSpawns,
} from "../../src/core/method-agents.ts";
import { agentsCounted } from "../../src/core/mirror.ts";

/**
 * The agents a method starts (J-134 S2): the agent tool's prompt read for
 * the step or the method that starts it, a start paired with its launch,
 * and the count that leaves a method's agents out.
 */

const installed = new Set(["diagram-design", "review", "research", "tdd"]);
const steps = new Set(["frame", "plan", "build", "review", "verify", "close"]);
/** The installed skills whose own pages name a fresh agent they start. */
const methods = new Set(["diagram-design", "review", "research"]);

describe("J-134 S2 an agent a method starts", () => {
  it("reads the agent tool's prompt on Claude Code, and none for another tool or harness", () => {
    const payload = { tool_name: "Agent", tool_input: { prompt: "p", subagent_type: "x" } };
    expect(agentPromptOf("claude-code", payload)).toBe("p");
    expect(agentPromptOf("claude-code", { ...payload, tool_name: "Task" })).toBe("p");
    expect(agentPromptOf("claude-code", { tool_name: "Bash", tool_input: {} })).toBeUndefined();
    expect(agentPromptOf("gemini", payload)).toBeUndefined();
  });

  it("tells a step's agent from a method's by the brief or the page the prompt names", () => {
    const starter = (prompt: string) => agentStarter(prompt, installed, steps, methods);
    expect(starter("/r/.greenline/ledger/2026-10-27-a/brief-review-1.md")).toEqual({ by: "step" });
    expect(starter("read .claude/skills/review/SKILL.md")).toEqual({ by: "step" });
    expect(starter("First read /r/.claude/skills/diagram-design/SKILL.md whole.")).toEqual({
      by: "method",
      method: "diagram-design",
    });
    expect(starter("read .agents/skills/research/SKILL.md")).toEqual({
      by: "method",
      method: "research",
    });
    // A page of a skill whose pages start no agent, or one the workspace does not install, names nothing.
    expect(starter("Fix it; the build used .claude/skills/tdd/SKILL.md")).toEqual({
      by: "unknown",
    });
    expect(starter("read .claude/skills/other/SKILL.md")).toEqual({ by: "unknown" });
    expect(starter("Review the change.")).toEqual({ by: "unknown" });
  });

  it("pairs each start with the next launch, and counts the method's starts nowhere", () => {
    const lines = [
      { kind: "before-tool", launch: "diagram-design" },
      { kind: "before-tool" },
      { kind: "before-tool", launch: null },
    ];
    expect(methodOfStart(lines)).toBe("diagram-design");
    const started = [...lines, { kind: "agent-start", method: "diagram-design" }];
    expect(methodOfStart(started)).toBeNull();
    const all = [
      ...started,
      { kind: "agent-start", method: null },
      { kind: "agent-stop" },
      { kind: "agent-stop" },
    ];
    expect(agentsCounted(all)).toBe(1);
    expect(methodAgents(all)).toEqual([{ method: "diagram-design", count: 1 }]);
    // A harness that reports only stops, as Droid does, counts its stops.
    expect(agentsCounted([{ kind: "agent-stop" }, { kind: "agent-stop" }])).toBe(2);
    // J-144 S4: an agent resumed under its own id starts again and counts once, its method kept.
    const resumed = [
      { kind: "before-tool", launch: null },
      { kind: "agent-start", method: null, agent: "r1" },
      { kind: "agent-stop", agent: "r1" },
      { kind: "agent-start", method: null, agent: "r1" },
      { kind: "agent-stop", agent: "r1" },
    ];
    expect(agentsCounted(resumed)).toBe(1);
    expect(agentsCounted([...resumed, { kind: "agent-start", method: null, agent: "r2" }])).toBe(2);
    const drawn = [
      { kind: "before-tool", launch: "diagram-design" },
      { kind: "agent-start", method: "diagram-design", agent: "d1" },
      { kind: "before-tool", launch: null },
    ];
    expect(methodOfStart(drawn, "d1")).toBe("diagram-design");
    expect(methodOfStart(drawn, "r9")).toBeNull();
    expect(
      methodAgents([...drawn, { kind: "agent-start", method: "diagram-design", agent: "d1" }]),
    ).toEqual([{ method: "diagram-design", count: 1 }]);
    expect(
      methodAgentsWords([
        { method: "diagram-design", count: 2 },
        { method: "research", count: 1 },
      ]),
    ).toBe("2 by diagram-design and 1 by research");
  });
});

describe("J-176 S1 each helper's start read as fresh or forked from the builder", () => {
  it("reads Claude Code's agent tool as forked where its subagent_type is fork, and fresh otherwise", () => {
    const launch = (input: Record<string, string>) => ({
      tool_name: "Agent",
      tool_input: { prompt: "Review the change.", ...input },
    });
    expect(launchProvenance("claude-code", launch({ subagent_type: "fork" }))).toBe("forked");
    expect(launchProvenance("claude-code", launch({ subagent_type: "verdict-reviewer" }))).toBe(
      "fresh",
    );
    expect(launchProvenance("claude-code", launch({}))).toBe("fresh");
    // A tool that starts no agent has no provenance.
    expect(launchProvenance("claude-code", { tool_name: "Bash", tool_input: {} })).toBeUndefined();
  });

  it("reads Codex's rollout spawns, fresh where fork_turns is none and forked where it is omitted or names turns", () => {
    const spawn = (
      id: string,
      args: { readonly message: string; readonly fork_turns?: string | number },
    ) =>
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call",
          name: "spawn_agent",
          arguments: JSON.stringify(args),
          call_id: id,
        },
      });
    const lines = [
      spawn("call_a", { message: "review", fork_turns: "none" }),
      spawn("call_b", { message: "verify" }),
      spawn("call_c", { message: "plan", fork_turns: 3 }),
      JSON.stringify({ type: "response_item", payload: { type: "message" } }),
      "not json",
    ];
    expect(rolloutSpawns(lines)).toEqual([
      { agent: "call_a", provenance: "fresh", via: "rollout" },
      { agent: "call_b", provenance: "forked", via: "rollout" },
      { agent: "call_c", provenance: "forked", via: "rollout" },
    ]);
  });

  it("says the helpers in one line as the hooks saw them, the agents line left to the agent, and nothing with none", () => {
    expect(helpersLine([])).toBeUndefined();
    expect(
      helpersLine([
        { agent: "a", provenance: "fresh", via: "rollout" },
        { agent: "b", provenance: "forked", via: "rollout" },
        { agent: "c", provenance: "fresh", via: "rollout" },
      ]),
    ).toBe(
      "helpers: 3 started, 2 fresh and 1 forked from the builder, as the hooks saw them; the agents line is yours to write",
    );
  });
});
