/**
 * The worktree's records read from the main checkout (J-228 S1; the
 * register's row of 2026-11-09, "Outcomes, not manners"), through
 * `greenline event`'s and `greenline status`'s entry points on fixture
 * repositories with real git, each case a run's own:
 *
 * - j217t-conduct-interface finding 2 (001/005's start, and 006, 007 and
 *   018's): Codex's session stood in the main checkout while its change was
 *   open in `.worktrees/<id>`, and each turn's mirror said no open change, the
 *   record's lacks unread. The mirror is now read from the worktree whose
 *   branch holds the change the session holds, its first line naming it.
 * - j201t-linear-visuals finding 14 (oracle 006/009): after their merges the
 *   worktrees still held open copies of records the main checkout held done,
 *   and the status named them open. Such a copy is named as left behind.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-10-year-filter";
const OTHER = "2026-11-10-overdue-letters";
const RECORD = `.greenline/ledger/${ID}.md`;
const TREE = `.worktrees/${ID}`;
const SESSION = "019a6c33-5b1e-7d40-9a10-conduct-interface";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const definition = ((): ModesDefinition => {
  const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
})();

interface Space {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly git: (...args: string[]) => string;
}

function checkoutAt(root: string): Space {
  return {
    root,
    git: (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    write: (path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    },
  };
}

/** The change's record at the frame, its later lines still owed. */
function recordText(state = "open"): string {
  return [
    "---",
    "mode: regular",
    "choice: accepted",
    'yes: "Yes, on a worktree of its own."',
    'why: "the shelf list has no year filter"',
    `state: ${state}`,
    'next: "design: write the design"',
    "---",
    "",
    "## frame",
    "",
    "- Q1 [scope] One filter or a range?\n  - proposed: one",
    "",
  ].join("\n");
}

/** A change's worktree on its own branch from main, its record committed there. */
function addTree(main: Space, id: string): Space {
  const path = `.worktrees/${id}`;
  main.git("worktree", "add", "--quiet", "-b", `greenline/${id}`, path, "main");
  const tree = checkoutAt(join(main.root, path));
  tree.write(`.greenline/ledger/${id}.md`, recordText());
  tree.git("add", "--", `.greenline/ledger/${id}.md`);
  tree.git("commit", "--quiet", "-m", "open the change");
  return tree;
}

/** The main checkout and the change's worktree. */
interface Checkouts {
  readonly main: Space;
  readonly tree: Space;
}

/** The main checkout on main, git's exclude naming the worktrees, and the change's worktree. */
function worktreeOf(): Checkouts {
  const root = mkdtempSync(join(tmpdir(), "greenline-worktree-mirror-"));
  cleanup.push(root);
  const main = checkoutAt(root);
  main.git("init", "--quiet", "-b", "main");
  main.write(
    ".greenline/manifest.json",
    JSON.stringify({
      schemaVersion: 6,
      targets: ["claude-code", "codex"],
      checks: [],
      proceed: "none",
      hooks: { adapters: true, git: false },
    }),
  );
  main.write("src/shelf.js", "export const shelf = () => [];\n");
  main.write(".gitignore", ".greenline/tmp/\n.greenline/ledger/sessions/\n");
  main.git("add", ".");
  main.git("commit", "--quiet", "-m", "start");
  writeFileSync(join(root, ".git", "info", "exclude"), "\n.worktrees/\n");
  return { main, tree: addTree(main, ID) };
}

function fire(where: Space, harness: string, payload: JsonValue): string {
  const writer = new RecordingWriter();
  runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-11-10T00:18:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
    installation: fixtureInstallation,
  });
  return writer.out;
}

const turn = (where: Space, harness = "codex", prompt = "The frame reads right; go on."): string =>
  fire(where, harness, {
    hook_event_name: "UserPromptSubmit",
    session_id: SESSION,
    cwd: where.root,
    prompt,
  });

const started = (where: Space): string =>
  fire(where, "codex", {
    hook_event_name: "SessionStart",
    session_id: SESSION,
    cwd: where.root,
    source: "resume",
  });

/** Codex's patch of the record under the worktree's path, from the session in the main checkout, which names the change for the session. */
function patchRecord(main: Space, tree: Space): void {
  const path = join(tree.root, RECORD);
  const patch = (name: string): JsonValue => ({
    hook_event_name: name,
    session_id: SESSION,
    turn_id: "t1",
    cwd: main.root,
    tool_name: "apply_patch",
    tool_use_id: "call_record",
    tool_input: { command: `*** Begin Patch\n*** Update File: ${path}\n@@\n*** End Patch` },
  });
  fire(main, "codex", patch("PreToolUse"));
  tree.write(RECORD, recordText());
  fire(main, "codex", patch("PostToolUse"));
}

function status(where: Space): string {
  const writer = new RecordingWriter();
  runCli(["status"], writer.writer, "0.0.0-test", {
    cwd: where.root,
    version: "0.0.0-test",
    installation: fixtureInstallation(),
  });
  return writer.out;
}

describe("J-228 S1 the mirror reads the change the session holds in its worktree (j217t-conduct-interface F2)", () => {
  it("prints the change, its place and its record's lacks at a turn's and a session's start in the main checkout", () => {
    const { main, tree } = worktreeOf();
    turn(main, "codex", "Yes, on a worktree of its own.");
    patchRecord(main, tree);
    for (const out of [turn(main), started(main)]) {
      expect(out).toContain(
        `greenline: change ${ID}, regular, open; next: design: write the design. It is open in the worktree ${TREE}, which this session holds while it stands in another checkout: run each of its commands there, \`cd ${TREE} && <command>\`.`,
      );
      expect(out).not.toContain("greenline: no open change");
      expect(out).toContain("record lacks:");
      expect(out).not.toContain("open in other worktrees");
    }
  });

  it("prints the helpers the session's rollout shows it spawned for the change it holds in the worktree", () => {
    const { main, tree } = worktreeOf();
    turn(main, "codex", "Yes, on a worktree of its own.");
    patchRecord(main, tree);
    const rollout = join(main.root, ".greenline", "tmp", "rollout.jsonl");
    mkdirSync(join(rollout, ".."), { recursive: true });
    writeFileSync(
      rollout,
      `${JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call",
          name: "spawn_agent",
          arguments: JSON.stringify({ message: "review", fork_turns: "none" }),
          call_id: "call_review",
        },
      })}\n`,
    );
    fire(main, "codex", {
      hook_event_name: "Stop",
      session_id: SESSION,
      cwd: main.root,
      transcript_path: rollout,
    });
    expect(turn(main)).toContain("helpers: 1 started, 1 fresh");
  });

  it("leaves a change the session never named under open in other worktrees", () => {
    const { main } = worktreeOf();
    const out = turn(main);
    expect(out).toContain("greenline: no open change");
    expect(out).toContain(
      `open in other worktrees: ${ID} (in the worktree ${TREE}); each is worked on in its own checkout`,
    );
  });

  it("reads a session that stands in the worktree as before", () => {
    const { tree } = worktreeOf();
    const out = turn(tree, "claude-code");
    expect(out).toContain(
      `greenline: change ${ID}, regular, open; next: design: write the design.`,
    );
    expect(out).not.toContain("which this session holds while it stands in another checkout");
  });
});

describe("J-228 S1 the landing's offer noted for the change the session holds in its worktree (the verdict review's F1)", () => {
  it("notes the offer at the turn's end in the main checkout, so a yes after it asks for the merge and a decline declines", () => {
    for (const [words, asked] of [
      ["Yes, go ahead.", "ask for the merge into main"],
      ["Leave the branch.", "decline the landing"],
    ] as const) {
      const { main, tree } = worktreeOf();
      turn(main, "codex", "Yes, on a worktree of its own.");
      patchRecord(main, tree);
      // The close in the worktree: the record done there and committed with the change's trailer.
      tree.write(RECORD, recordText("done"));
      tree.git("add", "--", RECORD);
      tree.git("commit", "--quiet", "-m", `docs(ledger): close\n\nGreenline-Change: ${ID}`);
      fire(main, "codex", {
        hook_event_name: "Stop",
        session_id: SESSION,
        cwd: main.root,
        last_assistant_message:
          "The year filter landed.\n\nWaiting on: your choice to merge into `main` here or leave the branch.",
        stop_hook_active: false,
      });
      const next = turn(main, "codex", words);
      expect(next, words).toContain(asked);
    }
  });
});

describe("J-228 S1 a copy left in a worktree of a record closed here (j201t-linear-visuals F14)", () => {
  it("names the copy as left behind and never as open, in the status and the mirror", () => {
    const { main, tree } = worktreeOf();
    turn(main, "codex", "Yes, on a worktree of its own.");
    patchRecord(main, tree);
    // The merge brought the record to main, where the close set it done; the worktree keeps its open copy.
    main.git("merge", "--quiet", "--no-ff", "-m", "merge", `greenline/${ID}`);
    main.write(RECORD, recordText("done"));
    main.git("add", "--", RECORD);
    main.git("commit", "--quiet", "-m", "close");
    addTree(main, OTHER);
    const left = `left in other worktrees: ${ID} (in the worktree ${TREE}, its record done here); each is a copy of a closed record and no open change, and \`greenline tidy --change ${ID} --worktree\` removes its worktree on the owner's word`;
    const open = `open in other worktrees: ${OTHER} (in the worktree .worktrees/${OTHER}); each is worked on in its own checkout`;
    expect(status(main)).toContain(`${open}; ${left}`);
    const out = turn(main);
    expect(out).toContain("greenline: no open change");
    expect(out).toContain(`${open}; ${left}`);
    expect(out).not.toContain(`open in other worktrees: ${ID}`);
  });
});
