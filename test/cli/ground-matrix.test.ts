/**
 * The ground matrix (J-211 S3; the register's row of 2026-11-05, "The
 * keeper over the oracle"): the hooks that read the ground, the session's
 * start, the turn's start, the before-write and the pre-commit, each fired
 * on each ground a change is worked on, through `greenline event` and
 * `greenline hook`'s entry points on fixture repositories with real git:
 *
 * - the branch in place: the change worked on the branch the session stands on;
 * - a branch of its own, `greenline/<id>`, in the main checkout;
 * - a worktree of its own on that branch, the session standing in it;
 * - a clone without greenline's hooks, whose git configuration registers none;
 * - a branch cut before the install, which holds no manifest where the
 *   default branch holds one.
 *
 * Each cell is the line or the refusal the hook gives. The cells the replay
 * batch's runs met are among them (N-66, the blocking table): the branch cut
 * before the install (j196t-wait-proceed-1b and 1c, J-206 S1 and J-213 S1),
 * the clone without hooks (j196t-states-stop-2, J-200 S1) and the worktree of
 * its own (j196t-conduct-emptyd, J-215 S1).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { GIT_HOOK_NAMES, gitHookScript, HOOKS_DIRECTORY } from "../../src/core/git-hooks.ts";
import { HOOKS_ON } from "../../src/core/manifest.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runHookCli } from "../../src/shell/cli/hook.ts";
import { gitHooksState, registerGitHooks } from "../../src/shell/hooks.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-09-members";
const BRANCH = `greenline/${ID}`;
const RECORD = `.greenline/ledger/${ID}.md`;
const SESSION = "019a0b1c-ground-matrix";
const YES = "Yes, go ahead.";
const cleanup: string[] = [];
afterAll(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const definition = ((): ModesDefinition => {
  const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
})();

interface Checkout {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, text: string) => void;
}

function checkoutAt(root: string): Checkout {
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

const MANIFEST = `${JSON.stringify({
  schemaVersion: 6,
  targets: ["claude-code", "codex"],
  checks: [],
  proceed: "none",
  hooks: HOOKS_ON,
})}\n`;

const OPEN = [
  "---",
  "mode: quick",
  "choice: accepted",
  `yes: "${YES}"`,
  'why: "the members list exports as CSV"',
  "state: open",
  'next: "build: the export"',
  "ground: branch",
  'agent: "claude-code/claude-opus-5-5"',
  "---",
  "",
  "## frame",
  "",
  "The owner asked for the members list as CSV.",
  "",
].join("\n");

/** A repository on main, its first commit before the install, then greenline installed with its git hooks. */
function installed(): Checkout {
  const root = mkdtempSync(join(tmpdir(), "greenline-ground-"));
  cleanup.push(root);
  const space = checkoutAt(root);
  space.git("init", "--quiet", "-b", "main");
  space.write("src/members.ts", "export const members = [];\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "the members before the install");
  space.git("branch", "feature/old");
  space.write(".greenline/manifest.json", MANIFEST);
  for (const name of GIT_HOOK_NAMES) {
    space.write(`${HOOKS_DIRECTORY}/${name}`, gitHookScript(name));
    chmodSync(join(root, HOOKS_DIRECTORY, name), 0o755);
  }
  space.write(".gitignore", ".worktrees/\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "install greenline");
  registerGitHooks(root, HOOKS_ON);
  return space;
}

/** The record opened on the checkout's branch, its ground line as given, committed with its trailer. */
function openChange(space: Checkout, ground = "branch"): void {
  space.write(RECORD, OPEN.replace("ground: branch", `ground: ${ground}`));
  space.git("add", RECORD);
  space.git("commit", "--quiet", "--no-verify", "-m", `open the change\n\nGreenline-Change: ${ID}`);
}

/** Where the session stands, and the checkout its writes and its commit act in. */
interface Ground {
  readonly stand: Checkout;
  readonly work: Checkout;
}

/** The grounds, each with the change opened on it or not yet. */
const GROUNDS = {
  "the branch in place": (open) => {
    const space = installed();
    if (open) openChange(space);
    return { stand: space, work: space };
  },
  "a branch of its own": (open) => {
    const space = installed();
    space.git("checkout", "--quiet", "-b", BRANCH);
    if (open) openChange(space);
    return { stand: space, work: space };
  },
  "a worktree of its own, the session in it": (open) => {
    const space = installed();
    space.git("worktree", "add", "--quiet", "-b", BRANCH, `.worktrees/${ID}`);
    const tree = checkoutAt(join(space.root, ".worktrees", ID));
    if (open) openChange(tree, `"worktree: .worktrees/${ID}"`);
    return { stand: tree, work: tree };
  },
  "a worktree of its own, the session in the main checkout": (open) => {
    const space = installed();
    space.git("worktree", "add", "--quiet", "-b", BRANCH, `.worktrees/${ID}`);
    const tree = checkoutAt(join(space.root, ".worktrees", ID));
    if (open) openChange(tree, `"worktree: .worktrees/${ID}"`);
    return { stand: space, work: tree };
  },
  "a clone without greenline's hooks": (open) => {
    const space = installed();
    space.git("checkout", "--quiet", "-b", BRANCH);
    if (open) openChange(space);
    const clone = mkdtempSync(join(tmpdir(), "greenline-ground-clone-"));
    cleanup.push(clone);
    rmSync(clone, { recursive: true });
    execFileSync("git", ["clone", "--quiet", "-b", BRANCH, space.root, clone]);
    const there = checkoutAt(clone);
    return { stand: there, work: there };
  },
  "a branch cut before the install": () => {
    const space = installed();
    space.git("checkout", "--quiet", "feature/old");
    return { stand: space, work: space };
  },
} satisfies Readonly<Record<string, (open: boolean) => Ground>>;
type GroundName = keyof typeof GROUNDS;

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function fire(where: Checkout, payload: JsonValue): Ran {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", "claude-code"], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-11-09T12:00:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    modes: () => definition.modes.map((mode) => mode.name),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

/** What a hook prints for the harness: the context it adds, where it adds one. */
const HOOK_OUTPUT = z.object({
  hookSpecificOutput: z.object({ additionalContext: z.string().optional() }).optional(),
});

/** The context a hook hands the harness, read from its JSON; empty where it prints none. */
function contextOf(ran: Ran): string {
  if (ran.out.trim() === "") return "";
  return HOOK_OUTPUT.parse(JSON.parse(ran.out)).hookSpecificOutput?.additionalContext ?? "";
}

/** The hooks on one ground, in a session's order: its start, the owner's yes, a write of code, the commit at git's pre-commit and at the harness hook. */
function cells({ stand, work }: Ground) {
  const session = fire(stand, {
    hook_event_name: "SessionStart",
    session_id: SESSION,
    source: "startup",
  });
  const turn = fire(stand, {
    hook_event_name: "UserPromptSubmit",
    session_id: SESSION,
    prompt: YES,
  });
  const code = "export const members = [];\nexport const csv = () => '';\n";
  const write = fire(stand, {
    hook_event_name: "PreToolUse",
    session_id: SESSION,
    tool_use_id: "w1",
    tool_name: "Write",
    tool_input: { file_path: join(work.root, "src/members.ts"), content: code },
  });
  work.write("src/members.ts", code);
  work.git("add", "src/members.ts");
  const writer = new RecordingWriter();
  const gitHook = runHookCli(["pre-commit"], writer.writer, {
    cwd: work.root,
    stdin: () => "",
    modes: () => definition.modes.map((mode) => mode.name),
    line: () => definition,
  });
  const into = work.root === stand.root ? "" : `cd ${work.root} && `;
  const commit = fire(stand, {
    hook_event_name: "PreToolUse",
    session_id: SESSION,
    tool_use_id: "c1",
    tool_name: "Bash",
    tool_input: { command: `${into}git commit -m "the export" -m "Greenline-Change: ${ID}"` },
  });
  return {
    session: { code: session.code, context: contextOf(session), err: session.err },
    turn: { code: turn.code, context: contextOf(turn), err: turn.err },
    write,
    preCommit: { code: gitHook, err: writer.err },
    commit,
    hooks: gitHooksState(work.root, HOOKS_ON),
  };
}

/** What one cell expects: the context a start prints, and each door's exit with the words of its refusal, none where it lets the act through. */
interface Expected {
  readonly context: readonly string[];
  readonly write: string | undefined;
  readonly preCommit: string | undefined;
  readonly commit: string | undefined;
  readonly hooks: "config" | "absent";
}

const NO_OPEN = "no change is open on main, so nothing is committed there yet";
const OWNER_YES = `.greenline/ledger/${ID}.md stands nowhere yet; propose the change and wait for the yes; owner-yes, greenline's harness hook`;
const WAITS_YES = `the change waits for the owner's yes: the branch is change ${ID}'s and .greenline/ledger/${ID}.md stands neither staged nor in the working tree; propose the change, wait for the yes and open the record first; owner-yes, greenline's pre-commit hook`;
const UNHOOKED =
  "hooks not installed here: this checkout's git configuration registers none of greenline's hooks, so no commit, rewrite or push is held to the record; greenline sync installs them, run by the owner or, once the owner is told what it installs, on the owner's word; once it has run, commit again; hooks-installed, greenline's harness hook";
const PREDATES =
  "this branch predates the practice: feature/old holds no .greenline/manifest.json where main holds one, so greenline's instructions and hooks hold nothing here; switch to main or merge it into feature/old";
const OPENED = `greenline: change ${ID}, quick, open; next: build: the export.`;
const NONE_OPEN = "greenline: no open change.";
const ON_BRANCH = `| Where | branch ${BRANCH} |`;
const IN_TREE = `| Where | worktree .worktrees/${ID} on ${BRANCH} |`;
/** A branch named for a change whose record stands nowhere yet. */
const NO_RECORD = `greenline: change ${ID} has no record yet: no write outside .greenline/ledger/, .greenline/tmp/${ID}/ and .greenline/visuals/${ID}/, and no commit, before the owner's yes.`;

/** The matrix: each ground, opened and not yet, with the line or the refusal each hook gives. */
const MATRIX: readonly (readonly [GroundName, boolean, Expected])[] = [
  [
    "the branch in place",
    true,
    {
      context: [OPENED, "| Where | branch main |", "branches before the practice: feature/old"],
      write: undefined,
      preCommit: undefined,
      commit: undefined,
      hooks: "config",
    },
  ],
  [
    "the branch in place",
    false,
    {
      context: [NONE_OPEN],
      write: `${NO_OPEN}; open the change's record under .greenline/ledger/ first, once the owner has said yes; no-open-change, greenline's harness hook`,
      preCommit: `${NO_OPEN}; open the change's record under .greenline/ledger/ first, once the owner has said yes; no-open-change, greenline's pre-commit hook`,
      // The harness hook leaves the commit to git's hooks, which hold it here.
      commit: undefined,
      hooks: "config",
    },
  ],
  [
    "a branch of its own",
    true,
    {
      context: [OPENED, ON_BRANCH],
      write: undefined,
      preCommit: undefined,
      commit: undefined,
      hooks: "config",
    },
  ],
  [
    "a branch of its own",
    false,
    {
      context: [NO_RECORD, ON_BRANCH],
      write: OWNER_YES,
      preCommit: WAITS_YES,
      commit: undefined,
      hooks: "config",
    },
  ],
  [
    "a worktree of its own, the session in it",
    true,
    {
      context: [OPENED, IN_TREE],
      write: undefined,
      preCommit: undefined,
      commit: undefined,
      hooks: "config",
    },
  ],
  [
    "a worktree of its own, the session in it",
    false,
    {
      context: [NO_RECORD, ON_BRANCH],
      write: OWNER_YES,
      preCommit: WAITS_YES,
      commit: undefined,
      hooks: "config",
    },
  ],
  // j196t-conduct-emptyd (J-215 S1): the session in the main checkout, the work in the worktree.
  [
    "a worktree of its own, the session in the main checkout",
    true,
    {
      context: [
        NONE_OPEN,
        `open in other worktrees: ${ID} (in the worktree .worktrees/${ID}); each is worked on in its own checkout`,
      ],
      write: undefined,
      preCommit: undefined,
      commit: undefined,
      hooks: "config",
    },
  ],
  [
    "a worktree of its own, the session in the main checkout",
    false,
    {
      context: [NONE_OPEN, "orientation: survey"],
      write: OWNER_YES,
      preCommit: WAITS_YES,
      commit: undefined,
      hooks: "config",
    },
  ],
  // j196t-states-stop-2 (J-200 S1): git runs no hook of greenline's in the clone, so the harness hook holds the commit.
  [
    "a clone without greenline's hooks",
    true,
    {
      context: [
        OPENED,
        "git hooks: absent: they are not registered in this clone's local configuration; greenline sync installs them, run by the owner or, once the owner is told what it installs, on the owner's word",
      ],
      write: undefined,
      preCommit: undefined,
      commit: UNHOOKED,
      hooks: "absent",
    },
  ],
  [
    "a clone without greenline's hooks",
    false,
    {
      context: [NO_RECORD, "git hooks: absent"],
      write: OWNER_YES,
      preCommit: WAITS_YES,
      commit: UNHOOKED,
      hooks: "absent",
    },
  ],
  // j196t-wait-proceed-1b and 1c (J-206 S1, J-213 S1): the hooks hold nothing on the branch and say so.
  [
    "a branch cut before the install",
    true,
    {
      context: [PREDATES],
      write: undefined,
      preCommit: undefined,
      commit: undefined,
      hooks: "config",
    },
  ],
];

describe("J-211 S3 the ground matrix: the session start, the turn start, the before-write and the pre-commit on each ground", () => {
  it("names every ground, opened and not yet, where a change can stand there", () => {
    expect([...new Set(MATRIX.map(([ground]) => ground))]).toEqual(Object.keys(GROUNDS));
  });

  it.each(
    MATRIX.map(
      ([ground, open, expected]) =>
        [ground, open ? "opened" : "not yet opened", open, expected] as const,
    ),
  )("%s, the change %s: each hook's line or refusal", (ground, _said, open, expected) => {
    const got = cells(GROUNDS[ground](open));
    for (const start of [got.session, got.turn]) {
      expect(start.code).toBe(0);
      expect(start.err).toBe("");
      for (const line of expected.context) expect(start.context).toContain(line);
    }
    const door = (
      ran: { readonly code: number; readonly err: string },
      refused: string | undefined,
      code: number,
    ) => {
      if (refused === undefined) expect(ran, ran.err).toMatchObject({ code: 0, err: "" });
      else {
        expect(ran.code).toBe(code);
        expect(ran.err).toContain(refused);
      }
    };
    door(got.write, expected.write, 2);
    door(got.preCommit, expected.preCommit, 1);
    door(got.commit, expected.commit, 2);
    expect(got.hooks.state).toBe(expected.hooks);
  });
});
