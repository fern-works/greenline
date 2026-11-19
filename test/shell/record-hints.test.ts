/**
 * The hooks' hints beside the record's lines (J-176 S1; the register's row
 * of 2026-11-05, "The record's lines are the agent's"): the skills line
 * against the loads the hooks noted, and each report against its brief's
 * nonce, a notice the agent reconciles and never a refusal.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { recordHintsLine, reportNonceNotice } from "../../src/shell/record-hints.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-06-letters";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function workspace(skills: string): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-hints-"));
  cleanup.push(root);
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(
    `.greenline/ledger/${ID}.md`,
    ["---", "mode: regular", "choice: owner", 'why: "w"', "state: open", skills, "---", ""].join(
      "\n",
    ),
  );
  write(
    `.greenline/ledger/${ID}/skills/2026-11-06.jsonl`,
    `${JSON.stringify({ skill: "frame", file: "SKILL.md", whole: true, via: "Skill", at: "2026-11-06T10:00:00.000Z", step: "frame", agent: null, session: "s1", turn: 1 })}\n`,
  );
  return root;
}

describe("J-176 S1 the hints the status line sets beside the record's lines", () => {
  it("names a skills line that disagrees with the loads, and nothing where it agrees", () => {
    const off = recordHintsLine(workspace("skills: [frame, tdd]"), ID);
    expect(off).toContain("hints: the skills line names tdd, which the hooks saw no load of");
    expect(recordHintsLine(workspace("skills: [frame]"), ID)).toBeUndefined();
  });

  it("names a report that does not cite its brief's nonce, and nothing once it does", () => {
    const root = workspace("skills: [frame]");
    const folder = join(root, ".greenline", "ledger", ID);
    writeFileSync(join(folder, "brief-review-1.md"), "<!-- brief nonce 0a1b2c3d -->\n# Brief\n");
    writeFileSync(join(folder, "review-1.md"), "# Review\n\nNo findings.\n");
    expect(recordHintsLine(root, ID)).toBe(
      "hints: review-1.md cites no nonce of its brief, so nothing shows the agent read it; say in the section how the agent was started",
    );
    writeFileSync(join(folder, "review-1.md"), "<!-- brief nonce 0a1b2c3d -->\n# Review\n");
    expect(recordHintsLine(root, ID)).toBeUndefined();
  });
});

describe("J-192 S1 a helper's report against its brief's nonce, anticipate's as review's", () => {
  it("names anticipate's report that cites no nonce of its brief, and one written with no brief the command wrote (j179c-mode-choice-careful finding 4)", () => {
    const root = workspace("skills: [frame]");
    const folder = join(root, ".greenline", "ledger", ID);
    writeFileSync(join(folder, "anticipate-1.md"), "## Claims tried\n\nThe export.\n");
    expect(recordHintsLine(root, ID)).toBe(
      "hints: anticipate-1.md stands with no brief greenline brief wrote, so nothing shows the agent read one; start each fresh agent from the path greenline brief prints",
    );
    writeFileSync(
      join(folder, "brief-anticipate-1.md"),
      "<!-- brief nonce 5e6f7a8b -->\n# Brief\n",
    );
    expect(recordHintsLine(root, ID)).toBe(
      "hints: anticipate-1.md cites no nonce of its brief, so nothing shows the agent read it; say in the section how the agent was started",
    );
    expect(reportNonceNotice(root, ID, "anticipate-1.md")).toBe(
      "anticipate-1.md cites no nonce of its brief, so nothing shows the agent read it; say in the section how the agent was started",
    );
    writeFileSync(
      join(folder, "anticipate-1.md"),
      "<!-- brief nonce 5e6f7a8b -->\n## Claims tried\n",
    );
    expect(recordHintsLine(root, ID)).toBeUndefined();
    expect(reportNonceNotice(root, ID, "anticipate-1.md")).toBeUndefined();
  });

  it("names the uncited report after the tool that wrote it, on the harness's after-tool event", () => {
    const root = workspace("skills: [frame]");
    writeFileSync(
      join(root, ".greenline", "manifest.json"),
      JSON.stringify({ schemaVersion: 6, targets: ["claude-code"], checks: [] }),
    );
    execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    const folder = join(root, ".greenline", "ledger", ID);
    writeFileSync(
      join(folder, "brief-anticipate-1.md"),
      "<!-- brief nonce 5e6f7a8b -->\n# Brief\n",
    );
    const report = join(folder, "anticipate-1.md");
    const tool = {
      session_id: "s1",
      agent_id: "anticipator",
      tool_use_id: "w1",
      tool_name: "Write",
      tool_input: { file_path: report, content: "## Claims tried\n" },
    };
    const fire = (payload: { readonly [key: string]: JsonValue }): string => {
      const writer = new RecordingWriter();
      runEventCli(["--harness", "claude-code"], writer.writer, {
        cwd: root,
        stdin: () => JSON.stringify(payload),
      });
      return writer.out;
    };
    fire({ hook_event_name: "PreToolUse", ...tool });
    writeFileSync(report, "## Claims tried\n");
    expect(fire({ hook_event_name: "PostToolUse", ...tool })).toContain(
      "anticipate-1.md cites no nonce of its brief, so nothing shows the agent read it",
    );
  });
});
