/**
 * The sync in a clone without hooks waits for the owner (J-224 S1, the runs
 * j217t-states-stop and j217c-states-stop): in a checkout whose git
 * configuration registers none of greenline's hooks, the harness hook
 * refuses the agent's `greenline sync` until a turn of the owner's has passed
 * since it first showed the session the hooks line or first refused it the
 * sync, or until the owner's message of the turn names the sync. A dry run,
 * a checkout whose hooks are installed, registered by hand or turned off,
 * and the owner's own terminal, which no harness hook reads, are never held.
 * Each case is fired through `greenline event` on fixture repositories with
 * real git, as the harness's adapter pipes it.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { HOOKS_NOT_INSTALLED_LINE } from "../../src/core/adapters.ts";
import { GIT_HOOK_NAMES, gitHookScript, HOOKS_DIRECTORY } from "../../src/core/git-hooks.ts";
import { HOOKS_ON } from "../../src/core/manifest.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { registerGitHooks } from "../../src/shell/hooks.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-10-find-by-year";
const BRANCH = `greenline/${ID}`;
const RULE = "sync-on-word, greenline's harness hook";
/** The Claude run's command, 002/001 (toolu_01BLMUr1FKszPLtCzYYsLWVk). */
const CLAUDE_SYNC =
  "greenline sync 2>&1 | tail -20; git config --local --get-regexp 'hook|core.hooksPath' | head";
/** The Codex run's command, 002/002 (call_b86429bddae34ab188e293944e68c04b). */
const CODEX_SYNC = "/bin/zsh -lc 'greenline sync'";
/** The owner's resume, the second thread's first request in both runs. */
const RESUME = "Carry on with that change.";
/** The Codex run's second request, 002/002. */
const REVIEWED = "The tests look right; go on and write the code.";
const cleanup: string[] = [];

afterAll(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
}, 120_000); // It removes several dozen clones, which a busy machine takes longer than the default to do.

interface Ran {
  readonly code: number;
  readonly err: string;
  readonly out: string;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function write(root: string, path: string, text: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

function manifest(hooks: { readonly git: boolean; readonly adapters: boolean } = HOOKS_ON): string {
  return `${JSON.stringify({ schemaVersion: 6, targets: ["claude-code"], proceed: "none", checks: [], hooks }, null, 2)}\n`;
}

/** The owner's repository with its hooks registered, a change's branch holding a stopped record. */
function origin(): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-sync-ask-"));
  cleanup.push(root);
  git(root, "init", "--quiet", "-b", "main");
  write(root, "a.txt", "a\n");
  write(root, ".greenline/manifest.json", manifest());
  for (const name of GIT_HOOK_NAMES) {
    write(root, `${HOOKS_DIRECTORY}/${name}`, gitHookScript(name));
    chmodSync(join(root, HOOKS_DIRECTORY, name), 0o755);
  }
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "start");
  git(root, "checkout", "--quiet", "-b", BRANCH);
  write(
    root,
    `.greenline/ledger/${ID}.md`,
    [
      "---",
      "mode: regular",
      'why: "the year search"',
      "choice: accepted",
      'yes: "Yes, go ahead."',
      "state: stopped",
      'stopped: "Stop there for today."',
      'next: "build: the owner reviews the tests"',
      "---",
      "",
      "## frame",
      "",
      "x",
      "",
    ].join("\n"),
  );
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "stop for today");
  registerGitHooks(root, HOOKS_ON);
  return root;
}

/** A fresh clone of the owner's repository on the change's branch: its git configuration registers none of the hooks. */
function clone(from = origin()): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-sync-clone-"));
  cleanup.push(root);
  rmSync(root, { recursive: true });
  execFileSync("git", ["clone", "--quiet", "-b", BRANCH, from, root]);
  return root;
}

/** What a test pipes as a harness's payload: its event's name and the fields the event reads. */
interface Payload {
  readonly hook_event_name: string;
  readonly session_id?: string;
  readonly source?: string;
  readonly prompt?: string;
  readonly tool_name?: string;
  readonly tool_input?: { readonly command: string };
}

/** One event through greenline event, as the harness's adapter pipes it. */
function fire(root: string, payload: Payload, harness = "claude-code"): Ran {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: root,
    stdin: () => JSON.stringify(payload),
    modes: () => ["quick", "regular", "careful"],
  });
  return { code, out: writer.out, err: writer.err };
}

/** A session on one harness in one checkout: its start, the owner's turns and its shell commands. */
function session(root: string, id: string, harness = "claude-code") {
  return {
    start: (): Ran =>
      fire(root, { hook_event_name: "SessionStart", session_id: id, source: "startup" }, harness),
    said: (prompt: string): Ran =>
      fire(root, { hook_event_name: "UserPromptSubmit", session_id: id, prompt }, harness),
    runs: (command: string): Ran =>
      fire(
        root,
        {
          hook_event_name: "PreToolUse",
          session_id: id,
          tool_name: "Bash",
          tool_input: { command },
        },
        harness,
      ),
  };
}

describe("J-224 S1 the agent's sync in a clone without hooks waits for a turn of the owner's", () => {
  it("refuses the Claude run's sync in the turn the hooks line first showed, then admits it in the owner's next turn (j217c-states-stop 002/001)", () => {
    const there = clone();
    const agent = session(there, "c-states-stop-002");
    const started = agent.start();
    expect(started.out).toContain("git hooks: absent");
    expect(agent.said(RESUME).code).toBe(0);
    const refused = agent.runs(CLAUDE_SYNC);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
    expect(refused.err).toContain("tell the owner");
    // Every other command goes on in that turn.
    for (const command of ["git status", "greenline status", `cat .greenline/ledger/${ID}.md`])
      expect(agent.runs(command).code, command).toBe(0);
    expect(agent.runs(CLAUDE_SYNC).code).toBe(2);
    agent.said("Yes, install them.");
    expect(agent.runs(CLAUDE_SYNC).code).toBe(0);
  });

  it("refuses the Codex run's sync in the resume's turn and admits it in the turn after, the door's whole promise (j217t-states-stop 002/001, 002/002)", () => {
    const there = clone();
    const agent = session(there, "t-states-stop-002", "codex");
    agent.start();
    agent.said(RESUME);
    const refused = agent.runs(CODEX_SYNC);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
    agent.said(REVIEWED);
    expect(agent.runs(CODEX_SYNC).code).toBe(0);
  });

  it("holds the turn the hooks line first showed at a turn's start where the session's start printed nothing", () => {
    const there = clone();
    const agent = session(there, "no-start");
    expect(agent.said(RESUME).out).toContain("git hooks: absent");
    expect(agent.runs("greenline sync").code).toBe(2);
    agent.said("Go on.");
    expect(agent.runs("greenline sync").code).toBe(0);
  });

  it("admits in the owner's next turn after a refusal where the session never showed the line, a sync in another checkout", () => {
    const home = origin();
    const there = clone(home);
    const agent = session(home, "elsewhere");
    agent.start();
    expect(agent.said("Install the hooks in the clone too.").out).not.toContain(
      "git hooks: absent",
    );
    const sync = `cd ${there} && greenline sync`;
    const refused = agent.runs(sync);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
    agent.said("Yes.");
    expect(agent.runs(sync).code).toBe(0);
  });

  it("admits it in the same turn where the owner's message names the sync, and the second thread keeps nothing of the first", () => {
    const there = clone();
    const agent = session(there, "named");
    agent.start();
    agent.said("Run greenline sync, then carry on with that change.");
    expect(agent.runs("npx greenline sync").code).toBe(0);
    // A new session in the same clone is held once again.
    const next = session(there, "named-next");
    next.start();
    next.said(RESUME);
    expect(next.runs("greenline sync").code).toBe(2);
  });

  it("reads each form an agent runs the CLI in", () => {
    for (const command of [
      "greenline sync",
      "npx greenline sync",
      "pnpm exec greenline sync",
      "node node_modules/greenline/dist/bin/greenline.mjs sync",
      "bash -c 'greenline sync'",
      'eval "greenline sync"',
    ]) {
      const agent = session(clone(), `form-${String(command.length)}`);
      agent.start();
      agent.said(RESUME);
      const refused = agent.runs(command);
      expect(refused.code, command).toBe(2);
      expect(refused.err, command).toContain(RULE);
    }
  });

  it("says the owner runs it from their own terminal where no turn of the owner's reached the hooks", () => {
    const there = clone();
    const nameless = fire(there, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "greenline sync" },
    });
    expect(nameless.code).toBe(2);
    expect(nameless.err).toContain("from their own terminal");
    expect(nameless.err).toContain(RULE);
    // A session whose turn never started, a harness that hands no prompt, is the same.
    const unturned = session(there, "unturned").runs("greenline sync");
    expect(unturned.code).toBe(2);
    expect(unturned.err).toContain("from their own terminal");
  });

  it("never holds a dry run or the usage", () => {
    const agent = session(clone(), "dry");
    agent.start();
    agent.said(RESUME);
    for (const command of ["greenline sync --dry-run", "greenline sync --help"])
      expect(agent.runs(command).code, command).toBe(0);
  });

  it("never holds the sync where the hooks are installed, in the owner's checkout and in a worktree of the change's own", () => {
    const home = origin();
    const agent = session(home, "hooked");
    agent.start();
    agent.said(RESUME);
    expect(agent.runs("greenline sync").code).toBe(0);
    const tree = join(home, ".worktrees", ID);
    git(home, "worktree", "add", "--quiet", "-b", `${BRANCH}-tree`, tree);
    expect(agent.runs(`cd ${tree} && greenline sync`).code).toBe(0);
    const installed = clone(home);
    registerGitHooks(installed, HOOKS_ON);
    const there = session(installed, "installed");
    there.start();
    there.said(RESUME);
    expect(there.runs("greenline sync").code).toBe(0);
  });

  it("never holds it where the owner registered the hooks by hand or turned the git hooks off", () => {
    const byHand = clone();
    git(byHand, "config", "core.hooksPath", join(realpathSync(byHand), HOOKS_DIRECTORY));
    const off = clone();
    write(off, ".greenline/manifest.json", manifest({ git: false, adapters: true }));
    for (const root of [byHand, off]) {
      const agent = session(root, "unheld");
      agent.start();
      agent.said(RESUME);
      expect(agent.runs("greenline sync").code, root).toBe(0);
    }
  });

  it("says in the hooks line and the commit's refusal who runs the sync, never telling its reader to run it", () => {
    expect(HOOKS_NOT_INSTALLED_LINE).toContain("greenline sync installs them");
    expect(HOOKS_NOT_INSTALLED_LINE).toContain("the owner's word");
    expect(HOOKS_NOT_INSTALLED_LINE).not.toContain("run greenline sync");
    const there = clone();
    const agent = session(there, "commit");
    const started = agent.start();
    expect(started.out).not.toContain("run greenline sync");
    agent.said(RESUME);
    const commit = agent.runs('git commit -am "resume the change"');
    expect(commit.code).toBe(2);
    expect(commit.err).toContain(HOOKS_NOT_INSTALLED_LINE);
    expect(commit.err).not.toContain("run greenline sync");
    expect(commit.err).toContain("hooks-installed, greenline's harness hook");
  });
});

describe("J-224 S1 after the falsifier's reading: a turn of the owner's holds their message, and the hold is one checkout's", () => {
  /** A turn the harness starts with a finished helper's notice alone, as Claude Code hands it. */
  const NOTICE =
    "<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Agent finished</summary>\n</task-notification>";

  it("admits nothing in a turn that holds a notice alone, and admits in the turn that holds the owner's message", () => {
    const there = clone();
    const agent = session(there, "notice");
    agent.start();
    agent.said(RESUME);
    expect(agent.runs("greenline sync").code).toBe(2);
    agent.said(NOTICE);
    const still = agent.runs("greenline sync");
    expect(still.code).toBe(2);
    expect(still.err).toContain(RULE);
    agent.said(NOTICE);
    expect(agent.runs("greenline sync").code).toBe(2);
    agent.said("Yes, install them.");
    expect(agent.runs("greenline sync").code).toBe(0);
  });

  it("holds a second clone the owner was never asked about after a turn that answered the first checkout's line", () => {
    const home = origin();
    const first = clone(home);
    const second = clone(home);
    const agent = session(first, "two-clones");
    agent.start();
    agent.said(RESUME);
    agent.said("Yes, install them.");
    // The first checkout's sync goes on in turn 2, as before.
    expect(agent.runs("greenline sync").code).toBe(0);
    const other = `cd ${second} && greenline sync`;
    const refused = agent.runs(other);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
    agent.said("Go on.");
    expect(agent.runs(other).code).toBe(0);
  });

  it("admits a second clone in the same turn where the owner's message names the sync", () => {
    const home = origin();
    const first = clone(home);
    const second = clone(home);
    const agent = session(first, "two-named");
    agent.start();
    agent.said(RESUME);
    agent.said("Run greenline sync in the other clone too.");
    expect(agent.runs(`cd ${second} && greenline sync`).code).toBe(0);
  });
});

describe("J-224 S1 after the falsifier's reading: the home and a runner's or env's directory option place the sync", () => {
  const originalHome = process.env["HOME"];
  afterEach(() => {
    if (originalHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = originalHome;
  });

  /** The home a test sets, and the hooked repository its clones come from. */
  interface Home {
    readonly home: string;
    readonly hooked: string;
  }

  /** A home directory holding a clone without hooks at work/clone and a hooked repository at hooked-repo. */
  function homeWithClones(): Home {
    const hooked = origin();
    const home = mkdtempSync(join(tmpdir(), "greenline-sync-home-"));
    cleanup.push(home);
    mkdirSync(join(home, "work"));
    execFileSync("git", ["clone", "--quiet", "-b", BRANCH, hooked, join(home, "work", "clone")]);
    execFileSync("git", ["clone", "--quiet", "-b", BRANCH, hooked, join(home, "hooked-repo")]);
    registerGitHooks(join(home, "hooked-repo"), HOOKS_ON);
    process.env["HOME"] = home;
    return { home, hooked };
  }

  it("holds a sync the home's steps lead into a clone without hooks, from a hooked checkout", () => {
    const { hooked } = homeWithClones();
    for (const command of [
      "cd ~/work/clone && greenline sync",
      "cd $HOME/work/clone && greenline sync",
      'cd "${HOME}/work/clone" && greenline sync',
    ]) {
      const agent = session(hooked, `home-${String(command.length)}`);
      agent.start();
      agent.said(RESUME);
      const refused = agent.runs(command);
      expect(refused.code, command).toBe(2);
      expect(refused.err, command).toContain(RULE);
    }
  });

  it("never holds a sync the home's steps lead into a hooked checkout, from a clone without hooks", () => {
    const { home } = homeWithClones();
    const agent = session(join(home, "work", "clone"), "home-hooked");
    agent.start();
    agent.said(RESUME);
    expect(agent.runs("cd ~/hooked-repo && greenline sync").code).toBe(0);
  });

  it("holds a cd with no directory where the home is a clone without hooks, from a hooked checkout (E5)", () => {
    const hooked = origin();
    process.env["HOME"] = clone(hooked);
    const agent = session(hooked, "bare-cd-held");
    agent.start();
    agent.said(RESUME);
    const refused = agent.runs("cd && greenline sync");
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
  });

  it("never holds a cd with no directory where the home is a hooked checkout, from a clone without hooks (E5)", () => {
    const hooked = origin();
    process.env["HOME"] = hooked;
    const agent = session(clone(hooked), "bare-cd-free");
    agent.start();
    agent.said(RESUME);
    expect(agent.runs("cd && greenline sync").code).toBe(0);
  });

  it("holds the sync a runner's or env's directory option places in a clone without hooks, and not the mirror case", () => {
    const hooked = origin();
    const there = clone(hooked);
    for (const command of [
      `pnpm -C ${there} exec greenline sync`,
      `bun --cwd ${there} run greenline sync`,
      `yarn --cwd=${there} greenline sync`,
      `env --chdir ${there} greenline sync`,
    ]) {
      const agent = session(hooked, `option-${String(command.length)}`);
      agent.start();
      agent.said(RESUME);
      const refused = agent.runs(command);
      expect(refused.code, command).toBe(2);
      expect(refused.err, command).toContain(RULE);
    }
    // npm runs its command in the caller's directory: its prefix places nothing (E3).
    const free = session(hooked, "option-npm-free");
    free.start();
    free.said(RESUME);
    expect(free.runs(`npm --prefix=${there} exec greenline sync`).code).toBe(0);
    const agent = session(there, "option-mirror");
    agent.start();
    agent.said(RESUME);
    expect(agent.runs(`env -C ${hooked} greenline sync`).code).toBe(0);
    expect(agent.runs(`yarn --cwd ${hooked} greenline sync`).code).toBe(0);
    const held = agent.runs(`npm --prefix ${hooked} exec greenline sync`);
    expect(held.code).toBe(2);
    expect(held.err).toContain(RULE);
  });

  it("reads a checkout named greenline in an option's value as the place, both ways (E1)", () => {
    const hooked = origin();
    const parent = mkdtempSync(join(tmpdir(), "greenline-sync-named-"));
    cleanup.push(parent);
    const named = join(parent, "greenline");
    execFileSync("git", ["clone", "--quiet", "-b", BRANCH, hooked, named]);
    const agent = session(hooked, "named-held");
    agent.start();
    agent.said(RESUME);
    for (const command of [
      `pnpm -C ${named} exec greenline sync`,
      `env -C ${named} greenline sync`,
    ]) {
      const refused = agent.runs(command);
      expect(refused.code, command).toBe(2);
      expect(refused.err, command).toContain(RULE);
    }
    registerGitHooks(named, HOOKS_ON);
    const other = session(clone(hooked), "named-free");
    other.start();
    other.said(RESUME);
    expect(other.runs(`pnpm -C ${named} exec greenline sync`).code).toBe(0);
    expect(other.runs(`env -C ${named} greenline sync`).code).toBe(0);
  });

  it("holds a sync behind an option the reader's list does not name until a turn of the owner's, and never where the hooks are installed (F1)", () => {
    const hooked = origin();
    const command = "npm --loglevel error exec greenline sync";
    const agent = session(clone(hooked), "unlisted-option");
    agent.start();
    agent.said(RESUME);
    const refused = agent.runs(command);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
    agent.said("Yes, install them.");
    expect(agent.runs(command).code).toBe(0);
    const free = session(hooked, "unlisted-option-hooked");
    free.start();
    free.said(RESUME);
    expect(free.runs(command).code).toBe(0);
  });

  it("holds a sync past a bound of the reader until a turn of the owner's, and never where the hooks are installed (R1)", () => {
    const hooked = origin();
    const command = `npm ${"--loglevel error ".repeat(63)}exec greenline sync`;
    const agent = session(clone(hooked), "past-bound");
    agent.start();
    agent.said(RESUME);
    const refused = agent.runs(command);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
    agent.said("Yes, install them.");
    expect(agent.runs(command).code).toBe(0);
    const free = session(hooked, "past-bound-hooked");
    free.start();
    free.said(RESUME);
    expect(free.runs(command).code).toBe(0);
  });

  it("holds the sync in the script npx's -c takes, in a clone without hooks (E4)", () => {
    const agent = session(clone(), "npx-call");
    agent.start();
    agent.said(RESUME);
    const refused = agent.runs("npx -c 'greenline sync'");
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(RULE);
  });

  it("holds the sync a shell's -c beside an uppercase flag runs", () => {
    const there = clone();
    const agent = session(there, "flags");
    agent.start();
    agent.said(RESUME);
    expect(agent.runs("bash -Ec 'greenline sync'").code).toBe(2);
    expect(agent.runs(`bash -eEc 'cd ${there} && greenline sync'`).code).toBe(2);
  });
});
