/**
 * The git hooks on a fixture repository (J-93 S3; the research page
 * docs/research/2026-10-19-harness-hooks.md, "The design of the git hooks"):
 * real git running greenline's real scripts, which reach `greenline hook`
 * through a `greenline` on the PATH that runs the product's own code. Every
 * refusal is driven by a commit, an amend, a reset, a rebase or a push, and
 * every registration path is taken: git 2.54's config-based hooks, an older
 * git's core.hooksPath, and an older git with the owner's hooks, where
 * nothing is installed. An older git is a wrapper that answers `--version`
 * with an older number and hands every other command to the real git.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  factsFileName,
  finishedFacts,
  serializeFacts,
  startedFacts,
} from "../../src/core/facts.ts";
import { GIT_HOOK_NAMES, gitHookScript, HOOKS_DIRECTORY } from "../../src/core/git-hooks.ts";
import { HOOKS_ON, type HookSettings } from "../../src/core/manifest.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runHookCli } from "../../src/shell/cli/hook.ts";
import { gitHooksState, registerGitHooks } from "../../src/shell/hooks.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-10-19-retry";
const BRANCH = `greenline/${ID}`;
const REVISION = "c".repeat(64);
const cleanup: string[] = [];
const originalPath = process.env["PATH"] ?? "";
let shimDirectory = "";
let oldGitDirectory = "";
const realGit =
  spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim() || "git";

beforeAll(() => {
  shimDirectory = mkdtempSync(join(tmpdir(), "greenline-shim-"));
  cleanup.push(shimDirectory);
  const entry = join(import.meta.dirname, "../helpers/hooks-entry.ts");
  writeFileSync(
    join(shimDirectory, "greenline"),
    `#!/bin/sh\nexec "${process.execPath}" "${entry}" "$@"\n`,
  );
  chmodSync(join(shimDirectory, "greenline"), 0o755);
  oldGitDirectory = mkdtempSync(join(tmpdir(), "greenline-old-git-"));
  cleanup.push(oldGitDirectory);
  writeFileSync(
    join(oldGitDirectory, "git"),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 2.40.0"; exit 0; fi\nexec "${realGit}" "$@"\n`,
  );
  chmodSync(join(oldGitDirectory, "git"), 0o755);
});

afterEach(() => {
  process.env["PATH"] = originalPath;
});

afterAll(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** The PATH the hooks run under: greenline's shim first, an older git ahead when asked. */
function usePath(options: { readonly greenline?: boolean; readonly oldGit?: boolean } = {}): void {
  const parts = [
    ...(options.oldGit === true ? [oldGitDirectory] : []),
    ...(options.greenline === false ? [] : [shimDirectory]),
    originalPath,
  ];
  process.env["PATH"] = parts.join(":");
}

interface Ran {
  readonly code: number;
  readonly err: string;
  readonly out: string;
}

interface Fixture {
  readonly root: string;
  readonly git: (...args: string[]) => Ran;
  readonly write: (path: string, text: string) => void;
  readonly read: (path: string) => string;
}

function record(lines: readonly string[]): string {
  return [
    "---",
    "mode: quick",
    'why: "the retry"',
    ...lines,
    "---",
    "",
    "## frame",
    "",
    "x",
    "",
  ].join("\n");
}

const OPEN = record(["choice: accepted", "state: open"]);

function manifest(
  hooks: HookSettings = HOOKS_ON,
  checks: readonly object[] = [],
  proceed = "none",
): string {
  return `${JSON.stringify({ schemaVersion: 6, targets: ["claude-code"], proceed, checks, hooks }, null, 2)}\n`;
}

/** A record under the mode given, with the lines given. */
function recordUnder(mode: string, lines: readonly string[]): string {
  return record(lines).replace("mode: quick", `mode: ${mode}`);
}

/** What a test pipes as a harness's payload: its event's name and the fields the event reads. */
interface ToolPayload {
  readonly hook_event_name: string;
  readonly tool_name?: string;
  readonly tool_input?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

/** One event through greenline event, as the harness's adapter pipes it. */
function fire(space: Fixture, payload: ToolPayload, harness = "claude-code"): Ran {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: space.root,
    stdin: () => JSON.stringify(payload),
    modes: () => ["quick", "regular", "careful"],
  });
  return { code, out: writer.out, err: writer.err };
}

/** A write-class tool's before-tool event for one path, as Claude Code pipes it. */
function writeTo(path: string): ToolPayload {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: path, content: "x" },
  };
}

/** The line every hook gives while no change is open on the branch. */
function noChange(branch: string): string {
  return `no change is open on ${branch}; open its record under .greenline/ledger/ before the first commit`;
}

function fixture(
  options: { readonly register?: boolean; readonly manifest?: string } = {},
): Fixture {
  const root = mkdtempSync(join(tmpdir(), "greenline-hooks-"));
  cleanup.push(root);
  const git = (...args: string[]): Ran => {
    const ran = spawnSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_EDITOR: "true" },
    });
    return { code: ran.status ?? -1, err: ran.stderr, out: ran.stdout };
  };
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("a.txt", "a\n");
  write(".greenline/manifest.json", options.manifest ?? manifest());
  // The scripts as init writes them: executable, so an older git's core.hooksPath runs them.
  for (const name of GIT_HOOK_NAMES) {
    write(`${HOOKS_DIRECTORY}/${name}`, gitHookScript(name));
    chmodSync(join(root, HOOKS_DIRECTORY, name), 0o755);
  }
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  if (options.register !== false) registerGitHooks(root, HOOKS_ON);
  return { root, git, write, read: (path) => readFileSync(join(root, path), "utf8") };
}

/** A fixture on the change's branch with its record committed, the owner's yes on it. */
function opened(lines: readonly string[] = ["choice: accepted", "state: open"]): Fixture {
  const space = fixture();
  space.git("checkout", "--quiet", "-b", BRANCH);
  space.write(`.greenline/ledger/${ID}.md`, record(lines));
  space.git("add", ".");
  const committed = space.git("commit", "--quiet", "-m", "open the change");
  expect(committed.code, committed.err).toBe(0);
  return space;
}

function commitFile(space: Fixture, path: string, message: string, ...flags: string[]): Ran {
  space.write(path, `${path}\n`);
  space.git("add", path);
  return space.git("commit", "--quiet", "-m", message, ...flags);
}

/** The change trailer of the latest commit, as git reads its trailers. */
function trailerOf(space: Fixture): string {
  return space.git("log", "-1", "--format=%(trailers:key=Greenline-Change,valueonly)").out.trim();
}

/** A bare repository added as the fixture's origin, so the repository has a remote. */
function remote(space: Fixture): void {
  const bare = mkdtempSync(join(tmpdir(), "greenline-remote-"));
  cleanup.push(bare);
  spawnSync("git", ["init", "--quiet", "--bare", bare]);
  space.git("remote", "add", "origin", bare);
}

function writeFact(
  space: Fixture,
  args: readonly string[],
  code: number,
  at: string,
  declared: { readonly check: string; readonly dir: string } | undefined = undefined,
): string {
  const startedAt = `2026-10-19T${at}:00:00.000Z`;
  const started = startedFacts({
    arguments: args,
    startedAt,
    commit: null,
    tree: null,
    installation: REVISION,
    ...declared,
  });
  const name = factsFileName(startedAt, "abc123");
  space.write(
    `.greenline/ledger/${ID}/checks/${name}`,
    serializeFacts(finishedFacts(started, { kind: "exited", code }, 5)),
  );
  return name;
}

describe("J-93 S3 registration on git 2.54 or later: config-based hooks", () => {
  it("registers each hook in the local configuration, through sh, and says so", () => {
    usePath();
    const space = fixture();
    for (const name of GIT_HOOK_NAMES) {
      expect(
        space.git("config", "--local", "--get", `hook.greenline-${name}.event`).out.trim(),
      ).toBe(name);
      expect(
        space.git("config", "--local", "--get", `hook.greenline-${name}.command`).out.trim(),
      ).toBe(`sh ${HOOKS_DIRECTORY}/${name}`);
    }
    expect(gitHooksState(space.root, HOOKS_ON)).toEqual({ state: "config" });
    expect(registerGitHooks(space.root, HOOKS_ON)).toEqual({ state: "config" });
  });

  it("lets go of a core.hooksPath greenline set before, so no hook runs twice", () => {
    usePath();
    const space = fixture({ register: false });
    space.git("config", "--local", "core.hooksPath", HOOKS_DIRECTORY);
    expect(registerGitHooks(space.root, HOOKS_ON)).toEqual({ state: "config" });
    expect(space.git("config", "--local", "--get", "core.hooksPath").code).not.toBe(0);
  });

  it("runs the owner's own hook beside greenline's, the hookdir's last", () => {
    usePath();
    const space = opened();
    space.write(".git/hooks/pre-commit", "#!/bin/sh\necho owner-hook-ran >&2\n");
    chmodSync(join(space.root, ".git/hooks/pre-commit"), 0o755);
    const ran = commitFile(space, "b.txt", "with the owner's hook");
    expect(ran.code).toBe(0);
    expect(ran.err).toContain("owner-hook-ran");
  });

  it("takes greenline's registration out when the manifest turns the git hooks off", () => {
    usePath();
    const space = fixture();
    expect(registerGitHooks(space.root, { git: false, adapters: true })).toEqual({ state: "off" });
    expect(space.git("config", "--local", "--get-regexp", "^hook\\.greenline-").out).toBe("");
    expect(gitHooksState(space.root, { git: false, adapters: true })).toEqual({ state: "off" });
  });
});

describe("J-93 S3 registration on an older git", () => {
  it("sets core.hooksPath to .greenline/hooks where no hook of the owner's stands, the scripts made executable, and git runs them", () => {
    usePath({ oldGit: true });
    const space = fixture();
    expect(space.git("config", "--local", "--get", "core.hooksPath").out.trim()).toBe(
      HOOKS_DIRECTORY,
    );
    expect(gitHooksState(space.root, HOOKS_ON)).toEqual({ state: "hooks-path" });
    space.git("checkout", "--quiet", "-b", BRANCH);
    const refused = commitFile(space, "b.txt", "before the yes");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(`.greenline/ledger/${ID}.md stands neither staged`);
  });

  it("installs nothing where the owner's hook stands, and names the line to add", () => {
    usePath({ oldGit: true });
    const space = fixture({ register: false });
    space.write(".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n");
    const state = registerGitHooks(space.root, HOOKS_ON);
    expect(state).toMatchObject({
      state: "absent",
      reason: expect.stringContaining("the owner's pre-commit"),
      line: expect.stringContaining(`'${HOOKS_DIRECTORY}/<hook> "$@"'`),
    });
    expect(space.git("config", "--local", "--get", "core.hooksPath").code).not.toBe(0);
    expect(gitHooksState(space.root, HOOKS_ON)).toMatchObject({ state: "absent" });
  });

  it("reads the owner's hooks from a linked worktree too, where git names the hook directory whole", () => {
    usePath({ oldGit: true });
    const space = fixture({ register: false });
    space.write(".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n");
    const tree = mkdtempSync(join(tmpdir(), "greenline-worktree-"));
    cleanup.push(tree);
    rmSync(tree, { recursive: true });
    expect(space.git("worktree", "add", "--quiet", tree).code).toBe(0);
    expect(registerGitHooks(tree, HOOKS_ON)).toMatchObject({
      state: "absent",
      reason: expect.stringContaining("the owner's pre-commit"),
    });
    expect(space.git("config", "--local", "--get", "core.hooksPath").code).not.toBe(0);
  });

  it("installs nothing where a manager holds core.hooksPath", () => {
    usePath({ oldGit: true });
    const space = fixture({ register: false });
    space.git("config", "--local", "core.hooksPath", ".husky/_");
    expect(registerGitHooks(space.root, HOOKS_ON)).toMatchObject({
      state: "absent",
      reason: expect.stringContaining("'.husky/_'"),
    });
    expect(space.git("config", "--local", "--get", "core.hooksPath").out.trim()).toBe(".husky/_");
  });
});

describe("J-93 S3 pre-commit, prepare-commit-msg and commit-msg", () => {
  it("refuses a commit on the change's branch before the record stands, and before it carries a choice", () => {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", BRANCH);
    const before = commitFile(space, "b.txt", "too early");
    expect(before.code).not.toBe(0);
    expect(before.err).toContain(
      `greenline: refused: the branch is change ${ID}'s and .greenline/ledger/${ID}.md stands neither staged nor in the working tree`,
    );
    space.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    space.git("add", ".");
    const unchosen = space.git("commit", "--quiet", "-m", "still too early");
    expect(unchosen.code).not.toBe(0);
    expect(unchosen.err).toContain(`.greenline/ledger/${ID}.md carries no choice line`);
  });

  it("writes the change's trailer beside the harness's line once the yes stands, and refuses another change's", () => {
    usePath();
    const space = opened();
    const ok = commitFile(space, "b.txt", "add b", "-m", "Co-Authored-By: A <a@example.com>");
    expect(ok.code, ok.err).toBe(0);
    expect(space.git("log", "-1", "--format=%B").out.trim()).toBe(
      `add b\n\nCo-Authored-By: A <a@example.com>\nGreenline-Change: ${ID}`,
    );
    const foreign = commitFile(space, "c.txt", "add c", "-m", "Greenline-Change: 2026-10-19-other");
    expect(foreign.code).not.toBe(0);
    expect(foreign.err).toContain("the message carries 'Greenline-Change: 2026-10-19-other'");
  });

  it("writes the trailer under --no-verify too, and on the one open change of a branch that is not the default", () => {
    usePath();
    const space = opened();
    expect(commitFile(space, "b.txt", "skip the checks", "--no-verify").code).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    const feature = fixture();
    feature.git("checkout", "--quiet", "-b", "feature");
    feature.write(`.greenline/ledger/${ID}.md`, OPEN);
    feature.git("add", ".");
    expect(feature.git("commit", "--quiet", "-m", "open on a feature branch").code).toBe(0);
    expect(trailerOf(feature)).toBe(ID);
  });

  it("where a remote exists, never takes the default branch for a change's: no trailer there, and the commit refused as no change's (J-102 S1)", () => {
    usePath();
    const main = fixture();
    remote(main);
    main.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    main.git("add", ".");
    const ran = main.git("commit", "--quiet", "-m", "open on main");
    expect(ran.code).not.toBe(0);
    expect(ran.err).toContain(noChange("main"));
    const bypass = main.git("commit", "--quiet", "--no-verify", "-m", "open on main");
    expect(bypass.code, bypass.err).toBe(0);
    expect(trailerOf(main)).toBe("");
  });

  it("lets a ticket's commit on its planning change's branch carry the ticket's trailer, and writes it for the open ticket", () => {
    usePath();
    const planning = "2026-10-19-login";
    const space = fixture();
    space.git("checkout", "--quiet", "-b", `greenline/${planning}`);
    space.write(
      `.greenline/ledger/${planning}.md`,
      record(["choice: accepted", "state: open", "plan: 001-login"]),
    );
    space.write(
      ".greenline/ledger/2026-10-19-t1.md",
      record(["choice: accepted", "state: open", "plan: 001-login", "ticket: T1"]),
    );
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "plan the login").code).toBe(0);
    expect(trailerOf(space)).toBe("2026-10-19-t1");
    const own = commitFile(
      space,
      "a1.txt",
      "first ticket",
      "-m",
      "Greenline-Change: 2026-10-19-t1",
    );
    expect(own.code, own.err).toBe(0);
    expect(trailerOf(space)).toBe("2026-10-19-t1");
    const lead = commitFile(
      space,
      "a2.txt",
      "the plan's own",
      "-m",
      `Greenline-Change: ${planning}`,
    );
    expect(lead.code, lead.err).toBe(0);
    expect(trailerOf(space)).toBe(planning);
    const foreign = commitFile(
      space,
      "a3.txt",
      "another's",
      "-m",
      "Greenline-Change: 2026-10-19-zz",
    );
    expect(foreign.code).not.toBe(0);
  });

  it("writes the trailer and refuses another change's in a linked worktree, whose message file git names whole", () => {
    usePath();
    const space = fixture();
    const tree = mkdtempSync(join(tmpdir(), "greenline-worktree-"));
    cleanup.push(tree);
    rmSync(tree, { recursive: true });
    expect(space.git("worktree", "add", "--quiet", "-b", BRANCH, tree).code).toBe(0);
    const linked: Fixture = {
      root: tree,
      git: (...args) => {
        const ran = spawnSync(
          "git",
          ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args],
          {
            cwd: tree,
            encoding: "utf8",
          },
        );
        return { code: ran.status ?? -1, err: ran.stderr, out: ran.stdout };
      },
      write: (path, text) => {
        mkdirSync(join(tree, path, ".."), { recursive: true });
        writeFileSync(join(tree, path), text);
      },
      read: (path) => readFileSync(join(tree, path), "utf8"),
    };
    linked.write(`.greenline/ledger/${ID}.md`, OPEN);
    linked.git("add", ".");
    const ran = linked.git("commit", "--quiet", "-m", "in the worktree");
    expect(ran.code, ran.err).toBe(0);
    expect(trailerOf(linked)).toBe(ID);
    const foreign = commitFile(
      linked,
      "b.txt",
      "another's",
      "-m",
      "Greenline-Change: 2026-10-19-zz",
    );
    expect(foreign.code).not.toBe(0);
  });

  it("refuses a done over a red check, over a declared check with no run, and allows it over green", () => {
    usePath();
    const space = fixture({
      manifest: manifest(HOOKS_ON, [{ name: "unit", command: "pnpm run test", dir: "." }]),
    });
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    const done = (): Ran => {
      space.write(`.greenline/ledger/${ID}.md`, record(["choice: accepted", "state: done"]));
      space.git("add", ".");
      return space.git("commit", "--quiet", "-m", "close");
    };
    const absent = done();
    expect(absent.code).not.toBe(0);
    expect(absent.err).toContain(
      "greenline check recorded no run of the declared check 'unit' (pnpm run test)",
    );
    const red = writeFact(space, ["pnpm", "run", "test"], 1, "10");
    const failing = done();
    expect(failing.code).not.toBe(0);
    expect(failing.err).toContain(`exited 1 (.greenline/ledger/${ID}/checks/${red})`);
    writeFact(space, ["pnpm", "run", "test"], 0, "11");
    const closed = done();
    expect(closed.code, closed.err).toBe(0);
  });
});

describe("J-93 S3 reference-transaction and pre-rebase", () => {
  it("refuses an amend, a reset to another commit and a forced branch move of the change's branch", () => {
    usePath();
    const space = opened();
    expect(commitFile(space, "b.txt", "add b").code).toBe(0);
    const head = space.git("rev-parse", "HEAD").out.trim();
    const amend = space.git("commit", "--quiet", "--amend", "-m", "add b, reworded");
    expect(amend.code).not.toBe(0);
    expect(amend.err).toContain(`rewrites change ${ID}'s history`);
    const reset = space.git("reset", "--quiet", "--hard", "HEAD~1");
    expect(reset.code).not.toBe(0);
    space.git("checkout", "--quiet", "main");
    const moved = space.git("branch", "-f", BRANCH, "main");
    expect(moved.code).not.toBe(0);
    expect(space.git("rev-parse", BRANCH).out.trim()).toBe(head);
  });

  it("refuses a rebase of the change's branch before any work, and lets one through with the owner's rebase line", () => {
    usePath();
    const space = opened();
    expect(commitFile(space, "b.txt", "add b").code).toBe(0);
    space.git("checkout", "--quiet", "main");
    // main holds no open change, so only the owner's bypass moves it.
    expect(commitFile(space, "m.txt", "main moves", "--no-verify").code).toBe(0);
    space.git("checkout", "--quiet", BRANCH);
    const refused = space.git("rebase", "--quiet", "main");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain("carries no rebase line");
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: open", 'rebase: "the owner: rebase onto main"']),
    );
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "the owner's rebase words").code).toBe(0);
    const rebased = space.git("rebase", "--quiet", "main");
    expect(rebased.code, rebased.err).toBe(0);
    const amended = space.git("commit", "--quiet", "--amend", "-m", "reworded with the words");
    expect(amended.code, amended.err).toBe(0);
    const events = space.read(`.greenline/tmp/${ID}/events.jsonl`);
    expect(events).toContain('"kind":"rewrite"');
    expect(events).toContain('"by":"amend"');
    expect(events).toContain('"by":"rebase"');
  });
});

describe("J-93 S3 pre-push", () => {
  it("refuses a push of the change's branch while the record lacks landing, and allows it once the owner's words stand", () => {
    usePath();
    const space = opened();
    remote(space);
    const refused = space.git("push", "--quiet", "origin", BRANCH);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain("carries no landing line");
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: open", 'landing: "push it, the owner"']),
    );
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "the landing words").code).toBe(0);
    const pushed = space.git("push", "--quiet", "origin", BRANCH);
    expect(pushed.code, pushed.err).toBe(0);
  });

  it("refuses a force push of the change's branch even with the landing words", () => {
    usePath();
    const space = opened([
      "choice: accepted",
      "state: open",
      'landing: "push it, the owner"',
      'rebase: "the owner: rework the branch"',
    ]);
    remote(space);
    expect(commitFile(space, "b.txt", "add b").code).toBe(0);
    expect(space.git("push", "--quiet", "origin", BRANCH).code).toBe(0);
    expect(space.git("commit", "--quiet", "--amend", "-m", "add b, reworded").code).toBe(0);
    const forced = space.git("push", "--quiet", "--force", "origin", BRANCH);
    expect(forced.code).not.toBe(0);
    expect(forced.err).toContain("force push");
  });
});

describe("J-98 S1 the default branch of a repository with no remote holds an open change", () => {
  /** What a test pipes as Claude Code's payload: its event's name and the fields the event reads. */
  interface Payload {
    readonly hook_event_name: string;
    readonly tool_name?: string;
    readonly tool_input?: { readonly file_path: string; readonly content: string };
    readonly cwd?: string;
  }

  /** One event through greenline event, as Claude Code's adapter pipes it. */
  function event(space: Fixture, payload: Payload): Ran {
    const writer = new RecordingWriter();
    const code = runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: space.root,
      stdin: () => JSON.stringify(payload),
    });
    return { code, out: writer.out, err: writer.err };
  }

  it("refuses a commit and a write before the yes, writes the trailer on every commit of the change, its close included, and refuses a done over red", () => {
    usePath();
    const space = fixture({
      manifest: manifest(HOOKS_ON, [{ name: "unit", command: "pnpm run test", dir: "." }]),
    });
    expect(space.git("remote").out).toBe("");
    // Before the yes: the record stands with no choice line.
    space.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    space.git("add", ".");
    const early = space.git("commit", "--quiet", "-m", "too early");
    expect(early.code).not.toBe(0);
    expect(early.err).toContain(`.greenline/ledger/${ID}.md carries no choice line`);
    const write = event(space, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(space.root, "src/a.ts"), content: "x" },
      cwd: space.root,
    });
    expect(write.code).toBe(2);
    expect(write.err).toContain(`.greenline/ledger/${ID}.md carries no choice line`);
    const mirror = event(space, { hook_event_name: "SessionStart" });
    expect(mirror.out).toContain(`greenline: change ${ID}, quick, open.`);
    expect(mirror.out).not.toContain("no open change");
    // The yes: every commit of the change carries its trailer.
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    const yes = space.git("commit", "--quiet", "-m", "open the change");
    expect(yes.code, yes.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    expect(commitFile(space, "b.txt", "build").code).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    // The close: refused over a red check, let through over green, its commit carrying the trailer.
    const done = (): Ran => {
      space.write(`.greenline/ledger/${ID}.md`, record(["choice: accepted", "state: done"]));
      space.git("add", ".");
      return space.git("commit", "--quiet", "-m", "close");
    };
    writeFact(space, ["pnpm", "run", "test"], 1, "10");
    const red = done();
    expect(red.code).not.toBe(0);
    expect(red.err).toContain("the latest recorded run of the declared check 'unit' exited 1");
    writeFact(space, ["pnpm", "run", "test"], 0, "11");
    const closed = done();
    expect(closed.code, closed.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    // Once the change is done, the default branch holds no change again, so a commit there is refused (J-102 S1).
    const after = commitFile(space, "c.txt", "after the close");
    expect(after.code).not.toBe(0);
    expect(after.err).toContain(noChange("main"));
    expect(commitFile(space, "c.txt", "after the close", "--no-verify").code).toBe(0);
    expect(trailerOf(space)).toBe("");
    expect(event(space, { hook_event_name: "SessionStart" }).out).toContain("no open change");
  });

  it("writes the trailer on the commit that stops the change", () => {
    usePath();
    const space = fixture();
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    space.write(`.greenline/ledger/${ID}.md`, record(["choice: accepted", "state: stopped"]));
    space.git("add", ".");
    const stopped = space.git("commit", "--quiet", "-m", "stop");
    expect(stopped.code, stopped.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("where a remote exists, the default branch holds no open change: no trailer, no open change in the mirror, and the commit and the write refused as no change's (J-102 S1)", () => {
    usePath();
    const space = fixture();
    remote(space);
    space.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    const write = event(space, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(space.root, "src/a.ts"), content: "x" },
    });
    expect(write.code).toBe(2);
    expect(write.err).toContain(noChange("main"));
    expect(event(space, { hook_event_name: "SessionStart" }).out).toContain("no open change");
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "on main").err).toContain(noChange("main"));
    expect(space.git("commit", "--quiet", "--no-verify", "-m", "on main").code).toBe(0);
    expect(trailerOf(space)).toBe("");
  });
});

describe("J-98 S1 a check declared in a directory satisfies the close by its runs there", () => {
  it("refuses a done over a run at the root, and lets it through over a green run recorded in the check's directory", () => {
    usePath();
    const space = fixture({
      manifest: manifest(HOOKS_ON, [{ name: "web", command: "npm test", dir: "apps/web" }]),
    });
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    const done = (): Ran => {
      space.write(`.greenline/ledger/${ID}.md`, record(["choice: accepted", "state: done"]));
      space.git("add", ".");
      return space.git("commit", "--quiet", "-m", "close");
    };
    writeFact(space, ["npm", "test"], 0, "10");
    const atRoot = done();
    expect(atRoot.code).not.toBe(0);
    expect(atRoot.err).toContain("no run of the declared check 'web' (npm test in apps/web)");
    writeFact(space, ["npm", "test"], 0, "11", { check: "web", dir: "apps/web" });
    const closed = done();
    expect(closed.code, closed.err).toBe(0);
  });
});

describe("J-98 S1 a trailer git cannot write stops the commit", () => {
  it("prints git's failure on stderr and exits non-zero, so no commit of the change goes without its trailer", () => {
    usePath();
    const space = opened();
    const broken = mkdtempSync(join(tmpdir(), "greenline-broken-git-"));
    cleanup.push(broken);
    // A git that refuses to rewrite a message file, and runs every other command as the real one.
    writeFileSync(
      join(broken, "git"),
      [
        "#!/bin/sh",
        'if [ "$1" = "interpret-trailers" ] && [ "$2" = "--in-place" ]; then',
        '  echo "fatal: could not write the message" 1>&2',
        "  exit 128",
        "fi",
        `exec "${realGit}" "$@"`,
        "",
      ].join("\n"),
    );
    chmodSync(join(broken, "git"), 0o755);
    const message = join(space.root, ".git", "COMMIT_EDITMSG");
    writeFileSync(message, "add b\n");
    process.env["PATH"] = [broken, originalPath].join(":");
    const writer = new RecordingWriter();
    const code = runHookCli(["prepare-commit-msg", message], writer.writer, {
      cwd: space.root,
      stdin: () => "",
    });
    expect(code).toBe(1);
    expect(writer.err).toContain(
      `greenline: refused: git could not write 'Greenline-Change: ${ID}' into the commit message: fatal: could not write the message`,
    );
    expect(readFileSync(message, "utf8")).toBe("add b\n");
  });
});

describe("J-93 S3 the hooks fail open on greenline's side", () => {
  it("lets git go on when greenline is not on the PATH", () => {
    usePath({ greenline: false });
    const space = fixture();
    space.git("checkout", "--quiet", "-b", BRANCH);
    expect(commitFile(space, "b.txt", "no greenline here").code).toBe(0);
  });

  it("refuses nothing when the manifest turns the git hooks off, or no manifest stands", () => {
    usePath();
    const off = fixture({ manifest: manifest({ git: false, adapters: true }) });
    off.git("checkout", "--quiet", "-b", BRANCH);
    expect(commitFile(off, "b.txt", "hooks off").code).toBe(0);
    const none = fixture();
    rmSync(join(none.root, ".greenline/manifest.json"));
    none.git("checkout", "--quiet", "-b", BRANCH);
    expect(commitFile(none, "b.txt", "no workspace").code).toBe(0);
    expect(existsSync(join(none.root, ".greenline/tmp"))).toBe(false);
  });
});

describe("J-102 S1 pre-commit holds a workspace while no change is open on the branch HEAD names", () => {
  it("refuses a commit on the default branch with no record, naming the fact and the remedy, and lets the commit that opens the record through", () => {
    usePath();
    const space = fixture();
    const refused = commitFile(space, "b.txt", "before any record");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(`greenline: refused: ${noChange("main")}\n`);
    expect(space.git("log", "-1", "--format=%s").out.trim()).toBe("start");
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    const opening = space.git("commit", "--quiet", "-m", "open the change");
    expect(opening.code, opening.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("refuses a commit on another branch with no record, and on the default branch of a repository with a remote, a record open there or not", () => {
    usePath();
    const feature = fixture();
    feature.git("checkout", "--quiet", "-b", "feature");
    const refused = commitFile(feature, "b.txt", "on a feature branch");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(`greenline: refused: ${noChange("feature")}`);
    const main = fixture();
    remote(main);
    expect(commitFile(main, "b.txt", "on main").err).toContain(noChange("main"));
    main.write(`.greenline/ledger/${ID}.md`, OPEN);
    main.git("add", ".");
    const opened = main.git("commit", "--quiet", "-m", "open on main");
    expect(opened.code).not.toBe(0);
    expect(opened.err).toContain(`greenline: refused: ${noChange("main")}`);
  });

  it("lets the owner's --no-verify through, and a commit with no workspace or with the git hooks off", () => {
    usePath();
    const space = fixture();
    const bypass = commitFile(space, "b.txt", "the owner's bypass", "--no-verify");
    expect(bypass.code, bypass.err).toBe(0);
    expect(trailerOf(space)).toBe("");
    const off = fixture({ manifest: manifest({ git: false, adapters: true }) });
    expect(commitFile(off, "b.txt", "hooks off").code).toBe(0);
    const none = fixture();
    rmSync(join(none.root, ".greenline/manifest.json"));
    expect(commitFile(none, "b.txt", "no workspace").code).toBe(0);
  });

  it("leaves the landing's merge alone: a merge commit, and a conflicted one concluded with git commit", () => {
    usePath();
    const space = opened();
    remote(space);
    space.write("a.txt", "the change's a\n");
    space.git("add", "a.txt");
    expect(space.git("commit", "--quiet", "-m", "change a").code).toBe(0);
    space.git("checkout", "--quiet", "main");
    const merged = space.git("merge", "--quiet", "--no-ff", "-m", "land the change", BRANCH);
    expect(merged.code, merged.err).toBe(0);
    const conflicted = opened();
    remote(conflicted);
    conflicted.write("a.txt", "the change's a\n");
    conflicted.git("add", "a.txt");
    expect(conflicted.git("commit", "--quiet", "-m", "change a").code).toBe(0);
    conflicted.git("checkout", "--quiet", "main");
    conflicted.write("a.txt", "main's a\n");
    conflicted.git("add", "a.txt");
    expect(conflicted.git("commit", "--quiet", "--no-verify", "-m", "main moves").code).toBe(0);
    expect(conflicted.git("merge", "--quiet", "-m", "land the change", BRANCH).code).not.toBe(0);
    conflicted.write("a.txt", "both\n");
    conflicted.git("add", "a.txt");
    const concluded = conflicted.git("commit", "--quiet", "--no-edit");
    expect(concluded.code, concluded.err).toBe(0);
    expect(conflicted.git("log", "-1", "--format=%P").out.trim().split(" ")).toHaveLength(2);
  });
});

describe("J-102 S1 the local landing's close on the default branch of a repository with a remote", () => {
  it("allows the commit that finishes the change merged into main, with its trailer, and refuses a plain commit after it", () => {
    usePath();
    const space = opened([
      "choice: accepted",
      "state: open",
      'landing: "merge it into main, the owner"',
    ]);
    // A remote that is no forge: a bare repository, so the landing merges locally.
    remote(space);
    expect(commitFile(space, "b.txt", "build").code).toBe(0);
    space.git("checkout", "--quiet", "main");
    const merged = space.git("merge", "--quiet", "--no-ff", "-m", "land the change", BRANCH);
    expect(merged.code, merged.err).toBe(0);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: done", 'landing: "merge it into main, the owner"']),
    );
    space.git("add", ".");
    const close = space.git("commit", "--quiet", "-m", "close the change");
    expect(close.code, close.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    const after = commitFile(space, "c.txt", "after the close");
    expect(after.code).not.toBe(0);
    expect(after.err).toContain(`greenline: refused: ${noChange("main")}`);
  });
});

describe("J-102 S1 a standing choice is the owner's yes only where proceed admits the record's mode", () => {
  /** A fixture on the change's branch under the proceed setting given, its record written and staged. */
  function standing(proceed: string, mode: string): Ran {
    const space = fixture({ manifest: manifest(HOOKS_ON, [], proceed) });
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(
      `.greenline/ledger/${ID}.md`,
      recordUnder(mode, ["choice: standing", "state: open"]),
    );
    space.git("add", ".");
    return space.git("commit", "--quiet", "-m", "open under a standing choice");
  }

  it("refuses the commit under proceed none, naming the setting", () => {
    usePath();
    const refused = standing("none", "quick");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      `greenline: refused: .greenline/ledger/${ID}.md: choice is standing, which proceed none does not allow; wait for the owner's yes, the choice line owner or accepted`,
    );
  });

  it("refuses a mode slower than the one proceed names, and allows the mode it names and a faster one", () => {
    usePath();
    expect(standing("quick", "careful").err).toContain(
      "choice is standing, which proceed quick does not allow",
    );
    const named = standing("quick", "quick");
    expect(named.code, named.err).toBe(0);
    const faster = standing("careful", "regular");
    expect(faster.code, faster.err).toBe(0);
  });
});

describe("J-102 S1 the harness hook holds a workspace while no change is open", () => {
  it("refuses a write outside the homes with exit 2 and the same words, a Codex patch's paths included", () => {
    usePath();
    const space = fixture();
    const path = join(space.root, "src/a.ts");
    const refused = fire(space, { ...writeTo(path), cwd: space.root });
    expect(refused).toEqual({
      code: 2,
      out: "",
      err: `greenline: refused: the write to ${path} lies outside .greenline/ledger/ and .greenline/tmp/, and ${noChange("main")}\n`,
    });
    const patch = (paths: readonly string[]): ToolPayload => ({
      hook_event_name: "PreToolUse",
      tool_name: "apply_patch",
      tool_input: {
        command: `*** Begin Patch\n${paths.map((file) => `*** Add File: ${file}\n+x\n`).join("")}*** End Patch\n`,
      },
      cwd: space.root,
    });
    const codex = fire(space, patch([`.greenline/ledger/${ID}.md`, "src/a.ts"]), "codex");
    expect(codex.code).toBe(2);
    expect(codex.err).toContain(`the write to src/a.ts lies outside`);
    expect(fire(space, patch([`.greenline/ledger/${ID}.md`]), "codex").code).toBe(0);
    expect(existsSync(join(space.root, ".greenline/tmp"))).toBe(false);
  });

  it("allows a write inside the homes, a read and a shell command, so a record can still be opened", () => {
    usePath();
    const space = fixture();
    expect(fire(space, writeTo(join(space.root, `.greenline/ledger/${ID}.md`))).code).toBe(0);
    expect(fire(space, { ...writeTo(".greenline/tmp/notes.md"), cwd: space.root }).code).toBe(0);
    expect(
      fire(space, {
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: join(space.root, "a.txt") },
      }).code,
    ).toBe(0);
    expect(
      fire(space, {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo x > src/a.ts" },
      }).code,
    ).toBe(0);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    expect(fire(space, writeTo(join(space.root, "src/a.ts"))).code).toBe(0);
  });

  it("refuses on the default branch of a repository with a remote while a record is open there, and nothing with no workspace", () => {
    usePath();
    const space = fixture();
    remote(space);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    const refused = fire(space, writeTo(join(space.root, "src/a.ts")));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(noChange("main"));
    rmSync(join(space.root, ".greenline/manifest.json"));
    expect(fire(space, writeTo(join(space.root, "src/a.ts"))).code).toBe(0);
  });

  it("refuses a write under a standing choice proceed does not admit, and allows it where proceed admits the mode", () => {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(
      `.greenline/ledger/${ID}.md`,
      recordUnder("regular", ["choice: standing", "state: open"]),
    );
    const refused = fire(space, writeTo(join(space.root, "src/a.ts")));
    expect(refused.code).toBe(2);
    expect(refused.err).toBe(
      `greenline: refused: the write to ${join(space.root, "src/a.ts")} lies outside .greenline/ledger/ and .greenline/tmp/${ID}/; .greenline/ledger/${ID}.md: choice is standing, which proceed none does not allow; wait for the owner's yes, the choice line owner or accepted\n`,
    );
    space.write(".greenline/manifest.json", manifest(HOOKS_ON, [], "quick"));
    expect(fire(space, writeTo(join(space.root, "src/a.ts"))).err).toContain(
      "which proceed quick does not allow",
    );
    space.write(".greenline/manifest.json", manifest(HOOKS_ON, [], "careful"));
    expect(fire(space, writeTo(join(space.root, "src/a.ts"))).code).toBe(0);
  });
});
