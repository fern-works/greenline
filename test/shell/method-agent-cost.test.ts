import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readChangesOnDisk } from "../../src/shell/changes.ts";
import {
  assessChanges,
  changesReport,
  codeQuestions,
  type ChangesInput,
  type CodeAnswers,
  type CodeQuestions,
} from "../../src/core/status.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

// The ruling P5.4 of the-whole-change: the record's cost and the derived cap
// count the builder and the fresh agents the line's depths start; an agent a
// step's method starts, such as frame's research agent, is named in that
// step's section and counted nowhere (the installed ledger guide, "Fix passes
// and the cost").

const definition = fixtureInstallation().modes;
const REVISION = "a".repeat(64);
const ID = "2026-10-14-retry-deadline";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A careful change that used a research agent at frame, its record on disk with every report it cites. */
function workspace(state: "open" | "done", agents: number): string {
  const root = mkdtempSync(join(tmpdir(), "method-agent-"));
  roots.push(root);
  const ledger = join(root, ".greenline", "ledger");
  mkdirSync(join(ledger, ID, "checks"), { recursive: true });
  const record = [
    "---",
    "mode: careful",
    "choice: accepted",
    'why: "Keep the caller\'s deadline across retries."',
    `state: ${state}`,
    ...(state === "done" ? ["next: none"] : ['next: "verify: run the verifier"']),
    "reviewed: independent",
    `agents: ${agents}`,
    "rounds: 2",
    "---",
    "",
    "## frame",
    "",
    "Retries reset the deadline. A research agent, started by frame's research method, read the",
    `client library's retry contract: [frame](${ID}/frame-1.md).`,
    "",
    "## plan",
    "",
    "Carry the deadline in the retry context.",
    "",
    "## anticipate",
    "",
    `[anticipate](${ID}/anticipate-1.md)`,
    "",
    "## build",
    "",
    "The context holds the deadline; a test covers three retries.",
    "",
    "## review",
    "",
    `[review](${ID}/review-1.md) and [review](${ID}/review-2.md); one fix pass.`,
    "",
    "## verify",
    "",
    `[verify](${ID}/verify-1.md); one fix pass.`,
    "",
    "## close",
    "",
    "No ADR needed; nothing to land: the commits are on main.",
    "",
  ].join("\n");
  writeFileSync(join(ledger, `${ID}.md`), record);
  for (const report of [
    "frame-1.md",
    "anticipate-1.md",
    "review-1.md",
    "review-2.md",
    "verify-1.md",
  ])
    writeFileSync(join(ledger, ID, report), `# ${report}\n`);
  writeFileSync(
    join(ledger, ID, "checks", "20261014T120000000Z-a1b2c3.json"),
    JSON.stringify({
      schemaVersion: 1,
      state: "finished",
      arguments: ["npm", "test"],
      startedAt: "2026-10-14T12:00:00.000Z",
      commit: "c".repeat(40),
      tree: "e".repeat(40),
      installation: REVISION,
      outcome: { kind: "exited", code: 0 },
      durationMs: 5,
    }),
  );
  return root;
}

/** git's answers: nothing is known, so no check is compared and none fails. */
function unknown(questions: CodeQuestions): CodeAnswers {
  return {
    commitTrees: new Map(
      questions.commitTrees.map((commit) => [commit, { kind: "unknown", reason: "no git here" }]),
    ),
    workingTree: questions.workingTree ? { kind: "unknown", reason: "no git here" } : undefined,
    diffs: new Map(),
    since: new Map(),
  };
}

function findings(root: string): readonly string[] {
  const disk = readChangesOnDisk(root, definition);
  if (disk._tag === "err") throw disk.error;
  const input: ChangesInput = {
    definition,
    revision: REVISION,
    proceed: "none",
    disk: disk.value,
    history: { kind: "read", head: undefined, commits: [] },
    installed: new Set(),
    decisions: undefined,
    consultations: [],
    unreadableReceipts: [],
    checks: [],
    agentsCounted: new Map(),
  };
  const assessment = assessChanges(input, { view: "list", all: false });
  return changesReport(assessment, unknown(codeQuestions(assessment))).findings.map(
    (note) => note.message,
  );
}

describe("a method's agent and the cost", () => {
  it("J-73 S6 a record whose frame section names a research agent is judged at its mode's cap, the method's agent counted nowhere", () => {
    // Careful derives five agents, the builder and its four fresh agents, and four rounds.
    expect(findings(workspace("open", 5))).toEqual([]);
    expect(findings(workspace("done", 5))).toEqual([]);
  });

  it("J-73 S6 counting the research agent puts the same record over the mode's cap", () => {
    expect(findings(workspace("open", 6))).toEqual([
      `the open change '${ID}' does not match what its mode asks of this record: it cost 6 agents and 2 rounds, over the mode's 5 and 4: raise the mode, or correct the cost`,
    ]);
  });
});
