import { describe, expect, it } from "vitest";
import {
  groundLine,
  groundSettingLine,
  groundText,
  parseAgent,
  parseGround,
  parseWorktreeList,
  payloadModel,
  transcriptModel,
} from "../../src/core/ground.ts";

/**
 * The ground (J-114 S1): the record's `ground` and `agent` lines, the line
 * the mirror and status print from them, and git's list of checkouts that
 * finds a change's worktree through its branch.
 */

describe("J-114 S1 the ground and the agent lines", () => {
  it("reads branch, and worktree with its path, and nothing else", () => {
    expect(parseGround("branch")).toEqual({ kind: "branch" });
    expect(parseGround("worktree: .worktrees/2026-10-25-login")).toEqual({
      kind: "worktree",
      path: ".worktrees/2026-10-25-login",
    });
    for (const refused of ["worktree", "worktree:", "worktree:  x", "current", "branch main", ""])
      expect([refused, parseGround(refused)]).toEqual([refused, undefined]);
    expect(groundText({ kind: "worktree", path: "/tmp/w" })).toBe("worktree: /tmp/w");
    expect(groundText({ kind: "branch" })).toBe("branch");
  });

  it("reads the agent as <harness>/<model>, the model as the harness states it", () => {
    expect(parseAgent("claude-code/opus")).toEqual({ harness: "claude-code", model: "opus" });
    expect(parseAgent("codex/gpt-6.1-sol")).toEqual({ harness: "codex", model: "gpt-6.1-sol" });
    expect(parseAgent("claude-code/Opus 5.5")).toEqual({
      harness: "claude-code",
      model: "Opus 5.5",
    });
    for (const refused of ["opus", "/opus", "claude-code/", "Claude/opus", "claude-code/ opus"])
      expect([refused, parseAgent(refused)]).toEqual([refused, undefined]);
  });

  it("prints the open change's ground and agent, and the nudge where the record states none", () => {
    expect(
      groundLine({
        branch: "greenline/2026-10-25-a",
        ground: "branch",
        agent: "claude-code/opus",
      }),
    ).toBe("ground: branch greenline/2026-10-25-a; agent: claude-code/opus");
    expect(
      groundLine({
        branch: "greenline/2026-10-25-a",
        ground: "worktree: .worktrees/2026-10-25-a",
        agent: "codex/gpt-6.1-sol",
      }),
    ).toBe(
      "ground: worktree .worktrees/2026-10-25-a on greenline/2026-10-25-a; agent: codex/gpt-6.1-sol",
    );
    expect(
      groundLine({ branch: "main", ground: undefined, agent: undefined, harness: "codex" }),
    ).toBe(
      "ground: not stated, on main; agent: not stated; write codex/<the model, as the harness states it>",
    );
    expect(groundLine({ branch: undefined, ground: "elsewhere", agent: "opus" })).toBe(
      "ground: 'elsewhere' is neither branch nor worktree: <path>, on a detached HEAD; agent: 'opus' is not <harness>/<model>",
    );
  });

  it("prints the manifest's standing choice while no change is open, or the offer", () => {
    expect(groundSettingLine("branch")).toBe(
      "ground: no change open; the manifest's standing choice is branch, stated at the proposal",
    );
    expect(groundSettingLine(undefined)).toBe("ground: no change open; the proposal offers it");
  });

  it("J-143 S1 names the ground the local facts give while no change is open, so a named mode states it before the first edit", () => {
    expect(groundSettingLine(undefined, { branch: "main", offered: false })).toBe(
      "ground: no change open; the local facts give branch main, stated before the first edit",
    );
    expect(groundSettingLine(undefined, { branch: "main", offered: true })).toBe(
      "ground: no change open; the proposal offers a branch of its own, greenline/<id>, or a worktree",
    );
    expect(groundSettingLine(undefined, { branch: undefined, offered: false })).toBe(
      "ground: no change open; the proposal offers it",
    );
    expect(groundSettingLine("worktree", { branch: "main", offered: true })).toBe(
      "ground: no change open; the manifest's standing choice is worktree, stated at the proposal",
    );
  });
});

describe("J-143 S2 the model as the harness reports it", () => {
  it("names the reported model where the record states none, and where it states another or a family name", () => {
    const facts = { branch: "main", ground: "branch", harness: "codex", model: "gpt-6.1-sol" };
    expect(groundLine({ ...facts, agent: undefined })).toBe(
      "ground: branch main; agent: not stated; write codex/gpt-6.1-sol, the model the harness reports",
    );
    expect(groundLine({ ...facts, agent: "codex/gpt-6" })).toBe(
      "ground: branch main; agent: codex/gpt-6, and the harness reports the model gpt-6.1-sol; write codex/gpt-6.1-sol in the record's agent line",
    );
    expect(groundLine({ ...facts, agent: "codex/gpt-6.1-sol" })).toBe(
      "ground: branch main; agent: codex/gpt-6.1-sol",
    );
    // Another harness's line is not this session's to correct.
    expect(groundLine({ ...facts, agent: "claude-code/opus" })).toBe(
      "ground: branch main; agent: claude-code/opus",
    );
  });

  it("reads the model from a payload's model field, a name or an object's id", () => {
    expect(payloadModel({ model: "gpt-6.1-sol" })).toBe("gpt-6.1-sol");
    expect(payloadModel({ model: { id: "claude-opus-5-5", display_name: "Opus" } })).toBe(
      "claude-opus-5-5",
    );
    expect(payloadModel({ model: "" })).toBeUndefined();
    expect(payloadModel({ session_id: "s" })).toBeUndefined();
    expect(payloadModel(null)).toBeUndefined();
  });

  it("reads the model a transcript last names: a Codex rollout's turn context, a Claude Code assistant message", () => {
    const rollout = [
      JSON.stringify({ type: "session_meta", payload: { provenance: { model: "gpt-6" } } }),
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-sol", cwd: "/x" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "token_count" } }),
      "",
    ];
    expect(transcriptModel(rollout)).toBe("gpt-6.1-sol");
    const claude = [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      JSON.stringify({
        type: "assistant",
        message: { model: "claude-opus-5-5", role: "assistant" },
      }),
      JSON.stringify({ type: "assistant", message: { model: "<synthetic>" } }),
      "not json, a cut line",
    ];
    expect(transcriptModel(claude)).toBe("claude-opus-5-5");
    expect(transcriptModel([JSON.stringify({ type: "user", message: {} })])).toBeUndefined();
  });
});

describe("J-114 S1 git's list of checkouts", () => {
  it("names each checkout's path and branch, the main one first, a bare entry and a detached HEAD read as they are", () => {
    const output = [
      "worktree /repo",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo/.worktrees/2026-10-25-a",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/greenline/2026-10-25-a",
      "",
      "worktree /elsewhere/b",
      "HEAD 3333333333333333333333333333333333333333",
      "detached",
      "",
    ].join("\n");
    expect(parseWorktreeList(output)).toEqual([
      { path: "/repo", branch: "main", main: true },
      { path: "/repo/.worktrees/2026-10-25-a", branch: "greenline/2026-10-25-a", main: false },
      { path: "/elsewhere/b", branch: undefined, main: false },
    ]);
    expect(parseWorktreeList("worktree /bare.git\nbare\n")).toEqual([]);
    expect(parseWorktreeList("")).toEqual([]);
  });
});
