/**
 * The facts follow the work into the worktree (J-215 S1; the register's row
 * of 2026-11-05, "The keeper over the oracle", and of 2026-11-09, "Outcomes,
 * not manners"), through `greenline event`'s entry point on fixture
 * repositories with real git, each case the run's:
 *
 * - j196t-conduct-emptyd, the judge's finding 1 (thread 002, turns 003 and
 *   004): the session stood in the main checkout, the agent made a worktree
 *   of the change's own, `.worktrees/<id>` on `greenline/<id>`, and worked
 *   there, its checks through Codex's exec call with the worktree as its
 *   `workdir`, which Codex hands its hooks as no field, and its writes as
 *   patches under the worktree's path. The hooks took the root from their
 *   own directory, the main checkout, found no change on main and wrote
 *   nothing: the change's event log never appeared, its skill loads were
 *   joined to no change and its frame map was absent.
 *
 * The hooks now resolve the checkout each call acts in, from the command's
 * directory and its `cd` steps, the paths a write or a read names, or the
 * change a greenline command names, and write the change's facts in that
 * checkout's folders, the session's own facts staying in the main
 * checkout's.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson, type JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { serializeLock } from "../../src/core/lock.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-09-greeting-test";
const DAY = "2026-11-09";
const RECORD = `.greenline/ledger/${ID}.md`;
const TREE = `.worktrees/${ID}`;
const SESSION = "01a1bda8-188b-7080-8738-b30cb6bc2670";
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

/** The installed roster the fixture places, read by the run's `cat` of tdd's page. */
const ROSTER = {
  ".agents/skills/tdd/SKILL.md": "# tdd\n\nRed, green, refactor.\n",
  ".claude/skills/tdd/SKILL.md": "# tdd\n\nRed, green, refactor.\n",
} satisfies Readonly<Record<string, string>>;

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

/** A workspace on main with the installed roster, its manifest declaring the run's check. */
function workspace(prefix = "greenline-worktree-facts-"): Space {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(root);
  const space = checkoutAt(root);
  space.git("init", "--quiet", "-b", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({
      schemaVersion: 6,
      targets: ["claude-code", "codex"],
      checks: [{ name: "unit", command: "python3 -m unittest discover -v", dir: "." }],
      proceed: "none",
    }),
  );
  for (const [path, text] of Object.entries(ROSTER)) space.write(path, text);
  space.write(
    ".greenline/lock.json",
    serializeLock({
      schemaVersion: 5,
      cliVersion: "0.1.0",
      installationRevision: "0".repeat(64),
      sources: [],
      files: new Map(Object.keys(ROSTER).map((path) => [path, "1".repeat(64)])),
    }),
  );
  space.write("greeting.py", "def say_hello(name):\n    return f'Hello, {name}.'\n");
  space.write("test_greeting.py", "import unittest\n");
  space.write(".gitignore", ".greenline/tmp/\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  return space;
}

/** The change's record, its frame written, the owner's yes committed with it. */
function recordText(frame = "- Q1 [scope] In or out?\n  - proposed: in"): string {
  return [
    "---",
    "mode: regular",
    "choice: accepted",
    'yes: "Yes, in a worktree."',
    'why: "the greeting has its test"',
    "state: open",
    "---",
    "",
    "## frame",
    "",
    frame,
    "",
  ].join("\n");
}

/** The main checkout and the change's worktree. */
interface Checkouts {
  readonly main: Space;
  readonly tree: Space;
}

/** The main checkout on main, git's exclude naming the worktrees, and the change's worktree on its branch, its record committed there (002/003 items 8 to 12). */
function worktreeOfTheChange(): Checkouts {
  const main = workspace();
  writeFileSync(join(main.root, ".git", "info", "exclude"), "\n.worktrees/\n");
  main.git("worktree", "add", "--quiet", "-b", `greenline/${ID}`, TREE, "main");
  const tree = checkoutAt(join(main.root, TREE));
  tree.write(RECORD, recordText());
  tree.git("add", "--", RECORD);
  tree.git("commit", "--quiet", "-m", "open the change");
  return { main, tree };
}

/** Fire one event at a checkout's hook, as the harness runs it there. */
function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date(`${DAY}T00:18:00.000Z`),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

/** Codex's payload for an exec call: the command alone, the call's `workdir` dropped (docs/research/2026-10-19-harness-hooks.md, CX2). */
function codexShell(where: Space, name: string, call: string, command: string): JsonValue {
  return {
    hook_event_name: name,
    session_id: SESSION,
    turn_id: "t3",
    cwd: where.root,
    model: "gpt-6.1-terra",
    tool_name: "Bash",
    tool_use_id: call,
    tool_input: { command },
  };
}

/** Codex's payload for a patch: the envelope in `command`, its file named whole. */
function codexPatch(where: Space, name: string, call: string, path: string): JsonValue {
  return {
    hook_event_name: name,
    session_id: SESSION,
    turn_id: "t3",
    cwd: where.root,
    model: "gpt-6.1-terra",
    tool_name: "apply_patch",
    tool_use_id: call,
    tool_input: { command: `*** Begin Patch\n*** Update File: ${path}\n@@\n*** End Patch` },
  };
}

/** Claude Code's payload: its session's directory as `cwd`, the tool's input as given. */
function claude(
  cwd: string,
  name: string,
  call: string,
  tool: string,
  input: { readonly [key: string]: JsonValue },
): JsonValue {
  return {
    hook_event_name: name,
    session_id: SESSION,
    transcript_path: "/tmp/t.jsonl",
    cwd,
    permission_mode: "default",
    tool_name: tool,
    tool_use_id: call,
    tool_input: input,
  };
}

/** What a line of the raw log or of the loads is read for here. */
const FACT_LINE = z.object({
  kind: z.string().nullable().optional(),
  call: z.string().nullable().optional(),
  skill: z.string().nullable().optional(),
  via: z.string().nullable().optional(),
});
type FactLine = z.infer<typeof FACT_LINE>;

/** A JSON Lines file's lines, each read; none where the file stands nowhere. */
function jsonLines(path: string): readonly FactLine[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => FACT_LINE.parse(parseJson(line)));
}

/** The change's raw log in a checkout, one line each. */
const logged = (where: Space, id = ID) =>
  jsonLines(join(where.root, ".greenline", "tmp", id, "events.jsonl"));

/** The change's skill loads in a checkout's folder. */
const loads = (where: Space, id = ID) =>
  jsonLines(join(where.root, ".greenline", "ledger", id, "skills", `${DAY}.jsonl`));

/** A raw log's line as the kind and the call it pairs by. */
const kindAndCall = (line: FactLine): string => `${line.kind ?? ""} ${line.call ?? ""}`;

const frameMap = (where: Space, id = ID): string =>
  join(where.root, ".greenline", "ledger", id, "frame-map.json");

const sessionFact = (where: Space): string =>
  join(where.root, ".greenline", "ledger", "sessions", `${DAY}-${SESSION}.jsonl`);

describe("J-215 S1 the facts of a change worked in a worktree of its own land in that worktree (j196t-conduct-emptyd)", () => {
  it("logs Codex's patches under the worktree's path and its checks naming the change, joins the loads and writes the frame map in the worktree, from a session in the main checkout", () => {
    const { main, tree } = worktreeOfTheChange();
    fire(main, "codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION,
      cwd: main.root,
      prompt: "Add a test asserting say_hello('a') returns 'hello a!'.",
    });
    // 002/003 item_12: the record's lines written by a patch under the worktree's path.
    const record = join(tree.root, RECORD);
    expect(fire(main, "codex", codexPatch(main, "PreToolUse", "call_cffe", record)).code).toBe(0);
    tree.write(RECORD, recordText("- Q1 [scope] One test or two?\n  - proposed: one"));
    expect(fire(main, "codex", codexPatch(main, "PostToolUse", "call_cffe", record)).code).toBe(0);
    // 002/003 item_13: a read of tdd's page, the session's directory the main checkout.
    fire(
      main,
      "codex",
      codexShell(main, "PreToolUse", "call_8f00", "/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md'"),
    );
    // 002/003 item_19, call_345a1901922e442c941be532359b35e2: the test written by a patch under the worktree's path.
    const test = join(tree.root, "test_greeting.py");
    expect(fire(main, "codex", codexPatch(main, "PreToolUse", "call_345a", test)).code).toBe(0);
    tree.write("test_greeting.py", "import unittest\n# a\n");
    fire(main, "codex", codexPatch(main, "PostToolUse", "call_345a", test));
    // 002/003 item_20: the check run through the exec call whose workdir Codex dropped, naming its change.
    const check = `/bin/zsh -lc 'greenline check --change ${ID} --step build -- python3 -m unittest discover -v'`;
    fire(main, "codex", codexShell(main, "PreToolUse", "call_cd24", check));
    fire(main, "codex", codexShell(main, "PostToolUse", "call_cd24", check));

    const calls = logged(tree).map(kindAndCall);
    expect(calls).toEqual(
      expect.arrayContaining([
        "before-tool call_cffe",
        "after-tool call_cffe",
        "before-tool call_345a",
        "after-tool call_345a",
        "before-tool call_cd24",
        "after-tool call_cd24",
      ]),
    );
    // The session named the change by writing its record in the worktree, so its loads are the change's there.
    expect(loads(tree)).toEqual([expect.objectContaining({ skill: "tdd", via: "cat" })]);
    expect(JSON.parse(readFileSync(frameMap(tree), "utf8"))).toMatchObject({ change: ID });
    // Nothing of the change stands in the main checkout's folders; the session's own fact does.
    expect(existsSync(join(main.root, ".greenline", "tmp", ID))).toBe(false);
    expect(existsSync(join(main.root, ".greenline", "ledger", ID))).toBe(false);
    expect(existsSync(sessionFact(main))).toBe(true);
    expect(existsSync(sessionFact(tree))).toBe(false);
  });

  it("logs a Codex shell call that cds into the worktree, and the read it makes there is the change's load", () => {
    const { main, tree } = worktreeOfTheChange();
    const command = `/bin/zsh -lc 'cd ${TREE} && cat .agents/skills/tdd/SKILL.md'`;
    fire(main, "codex", codexShell(main, "PreToolUse", "call_cd01", command));
    fire(main, "codex", codexShell(main, "PostToolUse", "call_cd01", command));
    expect(logged(tree).map((line) => line.kind)).toEqual(["before-tool", "after-tool"]);
    expect(loads(tree)).toEqual([expect.objectContaining({ skill: "tdd", via: "cat" })]);
    expect(existsSync(join(main.root, ".greenline", "tmp", ID))).toBe(false);
  });

  it("logs Claude Code's write tool under the worktree's path and its shell in the worktree it stands in, the frame map following", () => {
    const { main, tree } = worktreeOfTheChange();
    const record = join(tree.root, RECORD);
    fire(
      main,
      "claude-code",
      claude(main.root, "PreToolUse", "toolu_w", "Edit", { file_path: record }),
    );
    tree.write(RECORD, recordText("- Q1 [scope] One test or two?\n  - proposed: one"));
    fire(
      main,
      "claude-code",
      claude(main.root, "PostToolUse", "toolu_w", "Edit", { file_path: record }),
    );
    // The session's directory moved into the worktree, as Claude Code's `cwd` gives it after a `cd`.
    const read = "cat .claude/skills/tdd/SKILL.md";
    fire(
      main,
      "claude-code",
      claude(tree.root, "PreToolUse", "toolu_b", "Bash", { command: read }),
    );
    fire(
      main,
      "claude-code",
      claude(tree.root, "PostToolUse", "toolu_b", "Bash", { command: read }),
    );
    const calls = logged(tree).map(kindAndCall);
    expect(calls).toEqual([
      "before-tool toolu_w",
      "after-tool toolu_w",
      "before-tool toolu_b",
      "after-tool toolu_b",
    ]);
    expect(loads(tree)).toEqual([expect.objectContaining({ skill: "tdd", via: "cat" })]);
    expect(existsSync(frameMap(tree))).toBe(true);
    expect(existsSync(join(main.root, ".greenline", "tmp", ID))).toBe(false);
    expect(existsSync(join(main.root, ".greenline", "ledger", ID))).toBe(false);
  });

  it("writes a call in the main checkout as before, its change the main checkout's branch's", () => {
    const main = workspace();
    const own = "2026-11-09-greeting-module";
    main.git("checkout", "--quiet", "-b", `greenline/${own}`);
    main.write(`.greenline/ledger/${own}.md`, recordText());
    const command = "/bin/zsh -lc 'python3 -m unittest discover -v'";
    fire(main, "codex", codexShell(main, "PreToolUse", "call_m1", command));
    fire(main, "codex", codexShell(main, "PostToolUse", "call_m1", command));
    expect(logged(main, own).map((line) => line.kind)).toEqual(["before-tool", "after-tool"]);
  });

  it("leaves a path in another repository, a plain second clone, to the hook's own checkout", () => {
    const main = workspace();
    const own = "2026-11-09-greeting-module";
    main.git("checkout", "--quiet", "-b", `greenline/${own}`);
    main.write(`.greenline/ledger/${own}.md`, recordText());
    const other = workspace("greenline-worktree-facts-other-");
    other.git("checkout", "--quiet", "-b", `greenline/${ID}`);
    other.write(RECORD, recordText());
    const command = `/bin/zsh -lc 'cd ${other.root} && cat .agents/skills/tdd/SKILL.md'`;
    fire(main, "codex", codexShell(main, "PreToolUse", "call_o1", command));
    fire(main, "codex", codexShell(main, "PostToolUse", "call_o1", command));
    expect(logged(main, own).map((line) => line.kind)).toEqual(["before-tool", "after-tool"]);
    expect(existsSync(join(other.root, ".greenline", "tmp", ID))).toBe(false);
  });
});
