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
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ok } from "../../src/commons/result.ts";
import {
  factsFileName,
  finishedFacts,
  parseFacts,
  serializeFacts,
  startedFacts,
} from "../../src/core/facts.ts";
import { HOOKS_NOT_INSTALLED_LINE } from "../../src/core/adapters.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { GIT_HOOK_NAMES, gitHookScript, HOOKS_DIRECTORY } from "../../src/core/git-hooks.ts";
import type { InterfaceCheckFact } from "../../src/core/interface-check.ts";
import { HOOKS_ON, type HookSettings } from "../../src/core/manifest.ts";
import { runEventCli, type EventEnvironment } from "../../src/shell/cli/event.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
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

function record(lines: readonly string[], mode = "quick"): string {
  const has = (key: string): boolean => lines.some((line) => line.startsWith(`${key}:`));
  const done = lines.includes("state: done");
  // An accepted record quotes the owner's yes, and a done one carries every line the agent writes (J-176 S1).
  const yes = lines.includes("choice: accepted") && !has("yes") ? ['yes: "Yes, go ahead."'] : [];
  // A stopped record quotes the owner's stop (J-200 S1).
  const stop =
    lines.includes("state: stopped") && !has("stopped") ? ['stopped: "Stop there for today."'] : [];
  // A stopped record names the action that resumes it, or status cannot read it (J-208 S1).
  const resume =
    lines.includes("state: stopped") && !has("next") ? ['next: "build: carry on"'] : [];
  const closing = done
    ? [
        // The floors line, owed from the open in every mode (J-226 S1).
        ...(has("floors") ? [] : ["floors: none"]),
        ...(has("ground") ? [] : ["ground: branch"]),
        ...(has("agent") ? [] : ['agent: "claude-code/opus"']),
        ...(has("skills") ? [] : ["skills: [frame, build, verify, close]"]),
        ...(mode === "quick" || has("agents") ? [] : ["agents: 2", "rounds: 1"]),
        ...(mode === "quick" || has("starts") ? [] : ['starts: ["review 1"]']),
        // A done record states what landed (J-168 S1).
        ...(has("outcome") ? [] : ['outcome: "The retry waits for the deadline."']),
      ]
    : [];
  return [
    "---",
    `mode: ${mode}`,
    'why: "the retry"',
    ...lines,
    ...yes,
    ...stop,
    ...resume,
    ...closing,
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
  return record(lines, mode);
}

/** What a test pipes as a harness's payload: its event's name and the fields the event reads. */
interface ToolPayload {
  readonly hook_event_name: string;
  readonly session_id?: string;
  readonly prompt?: string;
  readonly tool_name?: string;
  readonly tool_input?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly transcript_path?: string;
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

/** The line pre-commit gives for a finished change's record with another path beside it, on any branch (J-144 S4). */
function finished(path: string): string {
  return `change ${ID} is done, so ${path} cannot be committed beside its record; commit .greenline/ledger/${ID}.md and its folder alone, \`git commit -- .greenline/ledger/${ID}.md .greenline/ledger/${ID}/\`, and make the other work a new change; finished-record-alone, greenline's pre-commit hook`;
}

/** The line every hook gives while no change is open on the branch. */
function noChange(branch: string): string {
  return `no change is open on ${branch}, so nothing is committed there yet; open the change's record under .greenline/ledger/ first, once the owner has said yes; no-open-change`;
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
      ).toBe(
        // By the absolute path, and git goes on where the script stands nowhere, as after the repository moved.
        `test -f '${join(realpathSync(space.root), HOOKS_DIRECTORY, name)}' || exit 0; sh '${join(realpathSync(space.root), HOOKS_DIRECTORY, name)}'`,
      );
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

  it("registers the scripts by an absolute path, so a worktree whose branch lacks them adds, commits and runs the hooks (J-148 S4)", () => {
    usePath();
    const space = fixture({ register: false });
    // The scripts stand on the disk and are in no commit: a branch from before the install lacks them.
    space.git("rm", "--quiet", "-r", "--cached", HOOKS_DIRECTORY);
    expect(space.git("commit", "--quiet", "-m", "the hooks out of the tree").code).toBe(0);
    expect(registerGitHooks(space.root, HOOKS_ON)).toEqual({ state: "config" });
    const tree = mkdtempSync(join(tmpdir(), "greenline-worktree-"));
    cleanup.push(tree);
    rmSync(tree, { recursive: true });
    const added = space.git("worktree", "add", "--quiet", "-b", "feature", tree);
    expect(added.code, added.err).toBe(0);
    expect(existsSync(join(tree, HOOKS_DIRECTORY))).toBe(false);
    const inTree = (...args: string[]): Ran => {
      const ran = spawnSync(
        "git",
        ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args],
        {
          cwd: tree,
          encoding: "utf8",
        },
      );
      return { code: ran.status ?? -1, err: ran.stderr, out: ran.stdout };
    };
    // The hooks fire in the worktree: with no change open on its branch, pre-commit refuses in greenline's words.
    writeFileSync(join(tree, "b.txt"), "b\n");
    inTree("add", "b.txt");
    const refused = inTree("commit", "--quiet", "-m", "in the worktree");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(`${noChange("feature")}, greenline's pre-commit hook`);
    // Once the change opens there, the commit goes through with its trailer.
    mkdirSync(join(tree, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(tree, `.greenline/ledger/${ID}.md`), OPEN);
    inTree("add", ".");
    const ran = inTree("commit", "--quiet", "-m", "open the change in the worktree");
    expect(ran.code, ran.err).toBe(0);
    expect(
      inTree("log", "-1", "--format=%(trailers:key=Greenline-Change,valueonly)").out.trim(),
    ).toBe(ID);
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
      join(realpathSync(space.root), HOOKS_DIRECTORY),
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
      `the change waits for the owner's yes: the branch is change ${ID}'s and .greenline/ledger/${ID}.md stands neither staged nor in the working tree`,
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

  it("J-114 S3 writes the agent's trailer just above the change's where the record states the agent, and moves the change's below it", () => {
    usePath();
    const space = opened(["choice: accepted", "state: open", "agent: claude-code/opus"]);
    const ok = commitFile(space, "b.txt", "feat: add b", "-m", "Co-Authored-By: A <a@example.com>");
    expect(ok.code, ok.err).toBe(0);
    expect(space.git("log", "-1", "--format=%B").out.trim()).toBe(
      `feat: add b\n\nCo-Authored-By: A <a@example.com>\nGreenline-Agent: claude-code/opus\nGreenline-Change: ${ID}`,
    );
    const carried = commitFile(space, "c.txt", "feat: add c", "-m", `Greenline-Change: ${ID}`);
    expect(carried.code, carried.err).toBe(0);
    expect(space.git("log", "-1", "--format=%B").out.trim()).toBe(
      `feat: add c\n\nGreenline-Agent: claude-code/opus\nGreenline-Change: ${ID}`,
    );
    const stated = commitFile(
      space,
      "d.txt",
      "feat: add d",
      "-m",
      `Greenline-Agent: codex/sol\nGreenline-Change: ${ID}`,
    );
    expect(stated.code, stated.err).toBe(0);
    expect(space.git("log", "-1", "--format=%B").out.trim()).toBe(
      `feat: add d\n\nGreenline-Agent: codex/sol\nGreenline-Change: ${ID}`,
    );
    const plain = opened();
    expect(commitFile(plain, "b.txt", "feat: add b").code).toBe(0);
    expect(plain.git("log", "-1", "--format=%B").out.trim()).toBe(
      `feat: add b\n\nGreenline-Change: ${ID}`,
    );
  });

  it("J-129 S3 orders the trailer block on real git: a co-author trailer before, between or after the greenline ones ends above them, the change's last, once", () => {
    usePath();
    const space = opened(["choice: accepted", "state: open", "agent: claude-code/sonnet"]);
    const coauthor = "Co-Authored-By: A <a@example.com>";
    const agent = "Greenline-Agent: claude-code/sonnet";
    const change = `Greenline-Change: ${ID}`;
    const block = `${coauthor}\n${agent}\n${change}`;
    const cases: readonly (readonly [string, string])[] = [
      ["before.txt", coauthor],
      ["between.txt", `${agent}\n${coauthor}\n${change}`],
      ["after.txt", `${agent}\n${change}\n${coauthor}`],
      ["twice.txt", `${change}\n${coauthor}\n${change}`],
    ];
    for (const [file, trailers] of cases) {
      const ran = commitFile(space, file, `feat: add ${file}`, "-m", "The body.", "-m", trailers);
      expect(ran.code, ran.err).toBe(0);
      expect(space.git("log", "-1", "--format=%B").out.trim(), file).toBe(
        `feat: add ${file}\n\nThe body.\n\n${block}`,
      );
    }
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
      space.write(
        `.greenline/ledger/${ID}.md`,
        record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
      );
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

describe("J-123 S4 an interface change is held to the interface check under the opt-in", () => {
  /** The manifest with an interface block, its check opt-in as given. */
  const withInterface = (check: boolean): string => {
    const base: unknown = JSON.parse(manifest());
    return `${JSON.stringify(
      {
        // SAFETY: manifest() writes a JSON object, read back here to add the block.
        ...(base as object),
        interface: {
          roots: ["src"],
          extensions: ["tsx"],
          platform: "web",
          frameworks: ["react"],
          evidence: [],
          confirmed: true,
          check,
        },
      },
      null,
      2,
    )}\n`;
  };

  const close = (space: Fixture, stated: string): Ran => {
    space.write(
      `.greenline/ledger/${ID}.md`,
      record([
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        `interface: ${stated}`,
      ]),
    );
    space.git("add", ".");
    return space.git("commit", "--quiet", "-m", "close");
  };

  const opening = (check: boolean): Fixture => {
    const space = fixture({ manifest: withInterface(check) });
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    return space;
  };

  it("holds done on a planted floor's red run of the interface check, and lets a green run through", () => {
    usePath();
    const space = opening(true);
    const absent = close(space, '"yes, app"');
    expect(absent.code).not.toBe(0);
    expect(absent.err).toContain(
      "greenline check recorded no run of the declared check 'interface' (greenline check interface)",
    );
    const args = ["greenline", "check", "interface"];
    const red = writeFact(space, args, 1, "10");
    const failing = close(space, '"yes, app"');
    expect(failing.code).not.toBe(0);
    expect(failing.err).toContain(`exited 1 (.greenline/ledger/${ID}/checks/${red})`);
    writeFact(space, args, 0, "11");
    const closed = close(space, '"yes, app"');
    expect(closed.code, closed.err).toBe(0);
  });

  it("holds nothing more where the opt-in is off or the record says no", () => {
    usePath();
    expect(close(opening(false), '"yes, app"').code).toBe(0);
    expect(close(opening(true), "no").code).toBe(0);
  });
});

describe("J-133 S1 an interface change's done waits for each touched page's render", () => {
  const interfaceManifest = (check: boolean): string =>
    `${JSON.stringify(
      {
        schemaVersion: 6,
        targets: ["claude-code"],
        proceed: "none",
        checks: [],
        hooks: HOOKS_ON,
        interface: {
          roots: ["src/app", "src/components"],
          extensions: ["tsx", "css"],
          platform: "web",
          frameworks: ["react"],
          evidence: [],
          confirmed: true,
          check,
        },
      },
      null,
      2,
    )}\n`;

  /** An interface change on its branch whose commits touched a page and a shared component, an hour ago. */
  const built = (check = true): Fixture => {
    const space = fixture({ manifest: interfaceManifest(check) });
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: open", 'interface: "yes, app"']),
    );
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    const hourAgo = new Date(Date.now() - 3_600_000);
    for (const [path, text] of [
      ["src/app/members/page.tsx", "export default function Page() { return null; }\n"],
      ["src/components/table.tsx", "export function Table() { return null; }\n"],
    ] as const) {
      space.write(path, text);
      utimesSync(join(space.root, path), hourAgo, hourAgo);
    }
    space.git("add", ".");
    const work = space.git("commit", "--quiet", "-m", "build the members page");
    expect(work.code, work.err).toBe(0);
    // The declared check's green run, which alone let done through before.
    writeFact(space, ["greenline", "check", "interface"], 0, "10");
    return space;
  };

  /** An interface fact as the check writes it, made the minutes given before now, the render's fields as given. */
  const interfaceFact = (
    space: Fixture,
    minutesAgo: number,
    render: Partial<Pick<InterfaceCheckFact, "address" | "widths" | "browser" | "limit">>,
  ): void => {
    const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    space.write(
      `.greenline/ledger/${ID}/interface/${factsFileName(at, "abc123")}`,
      `${JSON.stringify(
        {
          generatedBy: "greenline check interface",
          at,
          commit: null,
          paths: ["src/app/members/page.tsx", "src/components/table.tsx"],
          counts: { floor: 0, reflex: 0, waived: 0, finish: 0 },
          findings: [],
          unmeasured: [],
          widths: [],
          pages: ["/members"],
          ...render,
        },
        null,
        2,
      )}\n`,
    );
  };

  const close = (space: Fixture, stated = '"yes, app"', interfaceSection = ""): Ran => {
    space.write(
      `.greenline/ledger/${ID}.md`,
      // The record links the interface check's runs, as a done record does (J-173 S1).
      `${record([
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        `interface: ${stated}`,
      ])}\n## verify\n\n[interface check](${ID}/interface/)\n${interfaceSection}`,
    );
    space.git("add", ".");
    return space.git("commit", "--quiet", "-m", "close");
  };

  const CAPTURED = [1440, 768, 390, 320];

  it("refuses done after the static run alone, naming the page, the shared file and the capture command", () => {
    usePath();
    const space = built();
    interfaceFact(space, 30, {});
    const refused = close(space);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      "no capture and no named browser limit since the files last changed for /members, and a page rendering src/components/table.tsx",
    );
    expect(refused.err).toContain(
      "run greenline check interface --url <address> --path <page> for each page",
    );
    expect(refused.err).toContain("names the limit in its fact's browser field");
    // A render of another page settles the shared file and not the page.
    interfaceFact(space, 20, { address: "/settings", widths: CAPTURED });
    const other = close(space);
    expect(other.code).not.toBe(0);
    expect(other.err).toContain("since the files last changed for /members;");
    interfaceFact(space, 10, { address: "/members/", widths: CAPTURED });
    const closed = close(space);
    expect(closed.code, closed.err).toBe(0);
  });

  it("J-191 S1 holds done on the browser limit the engine named until the record names it in the agent's words, then lets it through", () => {
    usePath();
    const space = built();
    const at = new Date(Date.now() - 10 * 60_000).toISOString();
    interfaceFact(space, 10, {
      address: "/members",
      browser: "the browser could not read http://127.0.0.1:3000/members: Page.navigate timed out",
      limit: {
        cause: "timeout",
        origin: "http://127.0.0.1:3000",
        address: "/members",
        at,
        detail: "Page.navigate timed out",
      },
    });
    const held = close(space);
    expect(held.code).not.toBe(0);
    expect(held.err).toContain(
      "the capture of /members met its limit, the page did not load in time at http://127.0.0.1:3000/members (Page.navigate timed out): name it in the record's ## Interface section as `- limit /members: <what was not captured, in your words>`",
    );
    const closed = close(
      space,
      '"yes, app"',
      "\n## Interface\n\n- limit /members: the members page was not captured; the capture browser timed out, and the page was read in the owner's browser instead\n",
    );
    expect(closed.code, closed.err).toBe(0);
  });

  it("J-191 S1 still holds done where neither a capture nor a limit stands, whatever the record says", () => {
    usePath();
    const space = built();
    interfaceFact(space, 10, {});
    const held = close(space, '"yes, app"', "\n## Interface\n\n- limit /members: not captured\n");
    expect(held.code).not.toBe(0);
    expect(held.err).toContain(
      "no capture and no named browser limit since the files last changed for /members",
    );
  });

  it("never lets a capture made before the page's files last changed through", () => {
    usePath();
    const space = built();
    // Made two hours ago, before the build an hour ago: a redesign's before, say.
    interfaceFact(space, 120, { address: "/members", widths: CAPTURED });
    const refused = close(space);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      "since the files last changed for /members, and a page rendering",
    );
  });

  it("holds nothing more on a change whose record says no, or where the opt-in is off", () => {
    usePath();
    const no = close(built(), "no");
    expect(no.code, no.err).toBe(0);
    const off = close(built(false));
    expect(off.code, off.err).toBe(0);
  });

  it("J-143 S3 holds done on a class no browser renders until a run names the browser limit for its screen", () => {
    usePath();
    const space = fixture({
      manifest: interfaceManifest(true).replace('"platform": "web"', '"platform": "cross"'),
    });
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: open", 'interface: "yes, app"']),
    );
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    const hourAgo = new Date(Date.now() - 3_600_000);
    space.write("src/components/table.tsx", "export function Table() { return null; }\n");
    utimesSync(join(space.root, "src/components/table.tsx"), hourAgo, hourAgo);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "build the members table").code).toBe(0);
    writeFact(space, ["greenline", "check", "interface"], 0, "10");
    interfaceFact(space, 30, {});
    const refused = close(space);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain("a page rendering src/components/table.tsx");
    expect(refused.err).toContain("greenline check interface --path <screen> for each screen");
    interfaceFact(space, 10, {
      address: "/members",
      browser: "the platform is cross, and no browser renders the screen /members",
      limit: {
        cause: "platform",
        origin: null,
        address: "/members",
        at: new Date(Date.now() - 10 * 60_000).toISOString(),
        detail: "the platform is cross, and no browser renders the screen /members",
      },
    });
    const closed = close(space);
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
    expect(amend.err).toContain(`this would rewrite change ${ID}'s history`);
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
    // J-129 S4: uncommitted, the landing line lifts no push.
    const uncommitted = space.git("push", "--quiet", "origin", BRANCH);
    expect(uncommitted.code).not.toBe(0);
    expect(uncommitted.err).toContain("holds the landing line only in the working tree");
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "the landing words").code).toBe(0);
    const pushed = space.git("push", "--quiet", "origin", BRANCH);
    expect(pushed.code, pushed.err).toBe(0);
  });

  it("refuses a force push of the change's branch with the landing words alone, and lets it through with the rebase words too (J-114 S3)", () => {
    usePath();
    const space = opened(["choice: accepted", "state: open", 'landing: "push it, the owner"']);
    remote(space);
    expect(commitFile(space, "b.txt", "add b").code).toBe(0);
    expect(space.git("push", "--quiet", "origin", BRANCH).code).toBe(0);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record([
        "choice: accepted",
        "state: open",
        'landing: "push it, the owner"',
        'rebase: "the owner: rework the branch"',
      ]),
    );
    // J-129 S4: an amend that would carry the rebase line in is refused; the line is committed first.
    const carried = space.git("commit", "--quiet", "--amend", "--all", "-m", "add b, reworded");
    expect(carried.code).not.toBe(0);
    expect(carried.err).toContain("holds the rebase line only in the working tree");
    expect(space.git("commit", "--quiet", "--all", "-m", "the owner's rebase words").code).toBe(0);
    expect(space.git("commit", "--quiet", "--amend", "-m", "the rebase words, reworded").code).toBe(
      0,
    );
    const withBoth = space.git("push", "--quiet", "--force", "origin", BRANCH);
    expect(withBoth.code, withBoth.err).toBe(0);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: open", 'landing: "push it, the owner"']),
    );
    expect(space.git("add", ".").code).toBe(0);
    expect(space.git("commit", "--quiet", "-m", "the rebase words withdrawn").code).toBe(0);
    expect(space.git("push", "--quiet", "origin", BRANCH).code).toBe(0);
    const rewritten = space.git("reset", "--quiet", "--soft", "HEAD~1");
    expect(rewritten.code).not.toBe(0);
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
      space.write(
        `.greenline/ledger/${ID}.md`,
        record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
      );
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
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: stopped", 'stopped: "Stop there for today."']),
    );
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

describe("J-135 S1 the concluding commit is the change's, read from the index", () => {
  const UNIT = [{ name: "unit", command: "pnpm run test", dir: "." }];

  /** The record committed with the state given, on main of a repository with no remote, its open commit first. */
  function committedAs(state: string, checks: readonly object[] = []): Fixture {
    usePath();
    const space = fixture({ manifest: manifest(HOOKS_ON, checks) });
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    const open = space.git("commit", "--quiet", "-m", "open");
    expect(open.code, open.err).toBe(0);
    if (state !== "open") {
      if (state === "done") writeFact(space, ["pnpm", "run", "test"], 0, "09");
      space.write(`.greenline/ledger/${ID}.md`, record(["choice: accepted", `state: ${state}`]));
      space.git("add", ".");
      const moved = space.git("commit", "--quiet", "-m", state);
      expect(moved.code, moved.err).toBe(0);
    }
    return space;
  }

  /** The record staged with the state given and a line of its own, then committed with a file beside it. */
  function stageAndCommit(space: Fixture, state: string, message: string): Ran {
    space.write(
      `.greenline/ledger/${ID}.md`,
      // A line of the message's own, in the form status reads (J-208 S1): a stop's action, or a done record's outcome.
      record([
        "choice: accepted",
        `state: ${state}`,
        ...(state === "done"
          ? ["next: none", `outcome: "The retry: ${message}."`]
          : [`next: "build: ${message}"`]),
      ]),
    );
    space.write("b.txt", `${message}\n`);
    space.git("add", ".");
    return space.git("commit", "--quiet", "-m", message);
  }

  it("commits the close of a record committed stopped, with the change's trailer, on main with no remote", () => {
    const space = committedAs("stopped");
    expect(space.git("remote").out).toBe("");
    const closed = stageAndCommit(space, "done", "close");
    expect(closed.code, closed.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("commits the stop of a record committed open, and a record first committed done", () => {
    const space = committedAs("open");
    const stopped = stageAndCommit(space, "stopped", "stop");
    expect(stopped.code, stopped.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    usePath();
    const first = fixture();
    first.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
    );
    first.git("add", ".");
    const done = first.git("commit", "--quiet", "-m", "the change in one commit");
    expect(done.code, done.err).toBe(0);
    expect(trailerOf(first)).toBe(ID);
  });

  it("commits an edit to a stopped record alone as the change's, and refuses code beside it", () => {
    const space = committedAs("stopped");
    const plain = commitFile(space, "c.txt", "plain");
    expect(plain.code).not.toBe(0);
    expect(plain.err).toContain(noChange("main"));
    // The amendment with code beside it is no change's commit while the record stays stopped.
    const mixed = stageAndCommit(space, "stopped", "the owner's words");
    expect(mixed.code).not.toBe(0);
    expect(mixed.err).toContain(noChange("main"));
    space.git("reset", "--quiet", "--", "b.txt", "c.txt");
    const amended = space.git("commit", "--quiet", "-m", "the owner's words");
    expect(amended.code, amended.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("refuses an edit to a record HEAD holds done with code beside it, naming the commit of the record alone (J-144 S4)", () => {
    const space = committedAs("done", UNIT);
    const edit = stageAndCommit(space, "done", "an edit after the close");
    expect(edit.code).not.toBe(0);
    expect(edit.err).toContain(finished("b.txt"));
    expect(space.git("commit", "--quiet", "--no-verify", "-m", "the owner's bypass").code).toBe(0);
  });

  it("reads the record as the index carries it: a working copy set back to open changes no verdict", () => {
    // An edit to a done record, staged, with the working copy set open: still no change is open.
    const closed = committedAs("done", UNIT);
    closed.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: done", 'outcome: "The change landed."']) + "x\n",
    );
    closed.write("b.txt", "b\n");
    closed.git("add", ".");
    closed.write(`.greenline/ledger/${ID}.md`, OPEN);
    const around = closed.git("commit", "--quiet", "-m", "around the hook");
    expect(around.code).not.toBe(0);
    expect(around.err).toContain(finished("b.txt"));
    // A staged done over a red check, the working copy at open: the done is read and refused.
    const stopped = committedAs("stopped", UNIT);
    writeFact(stopped, ["pnpm", "run", "test"], 1, "10");
    stopped.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
    );
    stopped.git("add", ".");
    stopped.write(`.greenline/ledger/${ID}.md`, OPEN);
    const red = stopped.git("commit", "--quiet", "-m", "done over red");
    expect(red.code).not.toBe(0);
    expect(red.err).toContain("the latest recorded run of the declared check 'unit' exited 1");
    // Green, the same staging commits as the change's, its trailer written.
    writeFact(stopped, ["pnpm", "run", "test"], 0, "11");
    stopped.git("add", ".greenline/ledger/" + ID + "/");
    const green = stopped.git("commit", "--quiet", "-m", "done over green");
    expect(green.code, green.err).toBe(0);
    expect(trailerOf(stopped)).toBe(ID);
  });

  it("reads a record the index deletes as absent, whatever the working copy holds", () => {
    const space = committedAs("done", UNIT);
    space.git("rm", "--quiet", "--cached", `.greenline/ledger/${ID}.md`);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.write("b.txt", "b\n");
    space.git("add", "b.txt");
    const around = space.git("commit", "--quiet", "-m", "the record unstaged");
    expect(around.code).not.toBe(0);
    expect(around.err).toContain(noChange("main"));
  });

  it("gives the commit that concludes one change the trailer of that change, another open beside it", () => {
    const other = "2026-10-19-other";
    const space = committedAs("stopped");
    space.write(`.greenline/ledger/${other}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "--no-verify", "-m", "the other opens").code).toBe(0);
    const closed = stageAndCommit(space, "done", "close");
    expect(closed.code, closed.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("commits the same close on the default branch of a repository with a remote", () => {
    const space = committedAs("stopped");
    remote(space);
    const closed = stageAndCommit(space, "done", "close");
    expect(closed.code, closed.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    const after = commitFile(space, "c.txt", "after the close");
    expect(after.code).not.toBe(0);
    expect(after.err).toContain(noChange("main"));
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
      space.write(
        `.greenline/ledger/${ID}.md`,
        record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
      );
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
      `the commit stopped because git could not write 'Greenline-Change: ${ID}' into its message: fatal: could not write the message`,
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
    expect(refused.err).toContain(`${noChange("main")}, greenline's pre-commit hook\n`);
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
    expect(refused.err).toContain(`${noChange("feature")}`);
    const main = fixture();
    remote(main);
    expect(commitFile(main, "b.txt", "on main").err).toContain(noChange("main"));
    main.write(`.greenline/ledger/${ID}.md`, OPEN);
    main.git("add", ".");
    const opened = main.git("commit", "--quiet", "-m", "open on main");
    expect(opened.code).not.toBe(0);
    expect(opened.err).toContain(`${noChange("main")}`);
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
    // The owner's words name the base, which the merge commit's hook reads (J-148 S2).
    const words = ["choice: accepted", "state: open", 'landing: "merge into main: land it"'];
    const space = opened(words);
    remote(space);
    space.write("a.txt", "the change's a\n");
    space.git("add", "a.txt");
    expect(space.git("commit", "--quiet", "-m", "change a").code).toBe(0);
    space.git("checkout", "--quiet", "main");
    const merged = space.git("merge", "--quiet", "--no-ff", "-m", "land the change", BRANCH);
    expect(merged.code, merged.err).toBe(0);
    const conflicted = opened(words);
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
      record([
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        'landing: "merge it into main, the owner"',
      ]),
    );
    space.git("add", ".");
    const close = space.git("commit", "--quiet", "-m", "close the change");
    expect(close.code, close.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    const after = commitFile(space, "c.txt", "after the close");
    expect(after.code).not.toBe(0);
    expect(after.err).toContain(`${noChange("main")}`);
  });
});

/** greenline check on the merge commit, for the change, at the close step, its facts naming HEAD. */
async function checkMerged(space: Fixture, code: number): Promise<string> {
  const writer = new RecordingWriter();
  const ran = await runCheckCli(
    ["--change", ID, "--step", "close", "--", "node", "-e", `process.exit(${String(code)})`],
    writer.writer,
    {
      cwd: space.root,
      installation: () => ok(fixtureInstallation()),
      environment: process.env,
      stdio: "ignore",
    },
  );
  expect(ran, writer.err).toBe(code === 0 ? 0 : 1);
  const folder = join(space.root, ".greenline/ledger", ID, "checks");
  const newest = readdirSync(folder).sort().at(-1) ?? "";
  const facts = parseFacts(readFileSync(join(folder, newest), "utf8"), "facts");
  expect(facts._tag === "ok" ? facts.value.commit : null).toBe(
    space.git("rev-parse", "HEAD").out.trim(),
  );
  return newest;
}

describe("J-130 S1 the local merge's sequence on a remote that is no forge", () => {
  const LANDING = 'landing: "merge it into main, the owner"';
  /** The record as the close commits it on the change's branch before the merge: the landing words, the state and the close section. */
  const closed = (state: string, next: readonly string[] = []): string =>
    record(["choice: accepted", `state: ${state}`, ...next, LANDING]).concat(
      "\n## close\n\nmerged into main on the owner's word; checked on the merge commit\n",
    );

  /** A change built and closed on its branch, its build check green, merged into main with the page's message. */
  function landed(withRemote: boolean): Fixture {
    usePath();
    const space = opened();
    if (withRemote) remote(space);
    expect(commitFile(space, "b.txt", "build").code).toBe(0);
    writeFact(space, ["node", "-e", "0"], 0, "10");
    space.write(`.greenline/ledger/${ID}.md`, closed("done"));
    space.git("add", ".greenline/");
    const close = space.git("commit", "--quiet", "-m", "close the change");
    expect(close.code, close.err).toBe(0);
    // The message as close's references write it, in the change's working folder, its trailers its last paragraph.
    const message = `.greenline/tmp/${ID}/merge-message.txt`;
    space.write(message, `Merge branch '${BRANCH}' into main\n\nGreenline-Change: ${ID}\n`);
    expect(space.git("checkout", "--quiet", "main").code).toBe(0);
    const merged = space.git("merge", "--quiet", "--no-ff", "-F", message, BRANCH);
    expect(merged.code, merged.err).toBe(0);
    // The working folder goes with the close's tidy; nothing of it is committed.
    rmSync(join(space.root, ".greenline/tmp"), { recursive: true, force: true });
    expect(space.git("log", "-1", "--format=%P").out.trim().split(" ")).toHaveLength(2);
    expect(trailerOf(space)).toBe(ID);
    return space;
  }

  it("ends with the merge commit checked through greenline check and its record committed, no commit on main refused", async () => {
    const space = landed(true);
    await checkMerged(space, 0);
    space.git("add", `.greenline/ledger/${ID}/`);
    const recorded = space.git("commit", "--quiet", "-m", "record the merge's check");
    expect(recorded.code, recorded.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    // Nothing of the change stands uncommitted but its working folder, which the close's tidy removes.
    expect(space.git("status", "--porcelain", "--", ".", ":!.greenline/tmp").out).toBe("");
    // Nothing else is committed on main: the landing's commit was the last of the change there.
    const after = commitFile(space, "c.txt", "after the landing");
    expect(after.code).not.toBe(0);
    expect(after.err).toContain(`${noChange("main")}`);
  });

  it("holds a red merged result to the record: done over it is refused, the record set open with the red check goes in", async () => {
    const space = landed(true);
    await checkMerged(space, 1);
    space.git("add", `.greenline/ledger/${ID}/`);
    const over = space.git("commit", "--quiet", "-m", "record the merge's check");
    expect(over.code).not.toBe(0);
    expect(over.err).toContain(
      `the change cannot be marked done yet: .greenline/ledger/${ID}.md sets state: done`,
    );
    expect(over.err).toContain("or keep the record open");
    space.write(`.greenline/ledger/${ID}.md`, closed("open", ['next: "close: the merge is red"']));
    space.git("add", ".greenline/");
    const kept = space.git("commit", "--quiet", "-m", "record the red merge");
    expect(kept.code, kept.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("lifts nothing but the landing's own commit: the harness hook still refuses a write outside the homes on main while its facts are staged", async () => {
    const space = landed(true);
    await checkMerged(space, 0);
    space.git("add", `.greenline/ledger/${ID}/`);
    const path = join(space.root, "src/a.ts");
    const refused = fire(space, { ...writeTo(path), cwd: space.root });
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(noChange("main"));
  });

  it("takes only the change's record and folder as the landing's commit, and holds the same with no remote", async () => {
    const space = landed(true);
    await checkMerged(space, 0);
    space.write("d.txt", "code\n");
    space.git("add", ".");
    const mixed = space.git("commit", "--quiet", "-m", "code beside the record");
    expect(mixed.code).not.toBe(0);
    expect(mixed.err).toContain(noChange("main"));
    const local = landed(false);
    await checkMerged(local, 0);
    local.git("add", `.greenline/ledger/${ID}/`);
    const recorded = local.git("commit", "--quiet", "-m", "record the merge's check");
    expect(recorded.code, recorded.err).toBe(0);
    expect(trailerOf(local)).toBe(ID);
  });
});

describe("J-139 S1 a commit of the record and its folder alone is the change's in every state", () => {
  const FEATURE = "feature/find-by-author";
  const LANDING = 'landing: "merge into main: merge it anyway, the owner"';
  /** The record closed: done, the close section written, the landing's words when given. */
  const closed = (state: string, words: readonly string[] = []): string =>
    record(["choice: accepted", `state: ${state}`, ...words]).concat(
      "\n## close\n\nthe checks green; the landing offered\n",
    );

  /** A change opened, built and closed done over a green check on the branch given, the owner's words not yet in it. */
  function closedOn(branch: string, origin: "forge" | "bare" | "none"): Fixture {
    usePath();
    const space = fixture();
    if (origin === "forge")
      space.git("remote", "add", "origin", "https://github.com/example/shelf.git");
    if (origin === "bare") remote(space);
    if (branch !== "main") space.git("checkout", "--quiet", "-b", branch);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    const open = space.git("commit", "--quiet", "-m", "open the change");
    expect(open.code, open.err).toBe(0);
    expect(commitFile(space, "b.txt", "build").code).toBe(0);
    writeFact(space, ["node", "-e", "0"], 0, "10");
    space.write(`.greenline/ledger/${ID}.md`, closed("done"));
    space.git("add", ".greenline/");
    const close = space.git("commit", "--quiet", "-m", "close the change");
    expect(close.code, close.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    return space;
  }

  /** The owner's words written into the done record after the close and committed with the record alone. */
  function commitWords(space: Fixture): Ran {
    space.write(`.greenline/ledger/${ID}.md`, closed("done", [LANDING]));
    space.git("add", `.greenline/ledger/${ID}.md`);
    return space.git("commit", "--quiet", "-m", "record the owner's landing words");
  }

  it("commits the owner's landing words into a done record alone, with the change's trailer, on a ground branch the proposal named with a forge remote", () => {
    const branch = closedOn(FEATURE, "forge");
    const words = commitWords(branch);
    expect(words.code, words.err).toBe(0);
    expect(trailerOf(branch)).toBe(ID);
  });

  it("commits the same words alone on main with no remote", () => {
    const main = closedOn("main", "none");
    expect(main.git("remote").out).toBe("");
    const local = commitWords(main);
    expect(local.code, local.err).toBe(0);
    expect(trailerOf(main)).toBe(ID);
  });

  it("commits the same words alone on the change's own greenline/<id> branch, whose name names the change", () => {
    const space = closedOn(BRANCH, "forge");
    const words = commitWords(space);
    expect(words.code, words.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it.each<[string, "forge" | "none"]>([
    [FEATURE, "forge"],
    [BRANCH, "forge"],
    ["main", "none"],
  ])(
    "J-144 S4 on %s: refuses a done record staged with a code file beside it, naming the commit of the record alone, and admits the record alone",
    (branch, origin) => {
      const space = closedOn(branch, origin);
      space.write(`.greenline/ledger/${ID}.md`, closed("done", [LANDING]));
      space.write("c.txt", "code\n");
      space.git("add", ".");
      const mixed = space.git("commit", "--quiet", "-m", "the words with code beside them");
      expect(mixed.code).not.toBe(0);
      expect(mixed.err).toContain(finished("c.txt"));
      // Code alone after the close is refused too on the change's own branch: it is a new change's.
      space.git("reset", "--quiet", "--", `.greenline/ledger/${ID}.md`);
      const code = space.git("commit", "--quiet", "-m", "code after the close");
      expect(code.code).not.toBe(0);
      // Unstaged, the code leaves the record alone, and the commit is the change's.
      space.git("reset", "--quiet", "--", "c.txt");
      space.git("add", `.greenline/ledger/${ID}.md`);
      const alone = space.git("commit", "--quiet", "-m", "the words alone");
      expect(alone.code, alone.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
  );

  /** A done change's check rerun after the close, its fact staged under the change's folder alone. */
  function commitFolderFact(space: Fixture): Ran {
    writeFact(space, ["node", "-e", "1"], 0, "11");
    space.git("add", `.greenline/ledger/${ID}/`);
    return space.git("commit", "--quiet", "-m", "record the rerun check's fact");
  }

  /** The change landed on main of a repository with a remote: its ground branch fast-forwarded, no hook run. */
  function landedOnMain(): Fixture {
    const space = closedOn(FEATURE, "bare");
    expect(space.git("checkout", "--quiet", "main").code).toBe(0);
    expect(space.git("merge", "--quiet", "--ff-only", FEATURE).code).toBe(0);
    expect(space.git("remote").out.trim()).toBe("origin");
    return space;
  }

  it.each<[string, () => Fixture]>([
    ["main with a remote and no change open", landedOnMain],
    ["main with no remote and no change open", () => closedOn("main", "none")],
    ["a ground branch the proposal named", () => closedOn(FEATURE, "forge")],
    ["the change's own greenline/<id> branch", () => closedOn(BRANCH, "forge")],
  ])(
    "J-145 S2 on %s: commits a done change's check fact staged under its folder alone, with the change's trailer",
    (_where, made) => {
      const space = made();
      const fact = commitFolderFact(space);
      expect(fact.code, fact.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      expect(space.git("status", "--porcelain").out).toBe("");
    },
  );

  it("J-145 S2 refuses two changes' folders staged together on main with no change open", () => {
    const space = landedOnMain();
    writeFact(space, ["node", "-e", "1"], 0, "11");
    space.write(".greenline/ledger/2026-10-19-other/checks/fact.json", "{}\n");
    space.git("add", `.greenline/ledger/${ID}/`, ".greenline/ledger/2026-10-19-other/");
    const both = space.git("commit", "--quiet", "-m", "two changes' facts");
    expect(both.code).not.toBe(0);
    expect(both.err).toContain(noChange("main"));
  });

  /** A forge's remote, its URL read as github.com's, its pushes landing in a bare repository through git's own URL rewrite. */
  function forgeRemote(space: Fixture): void {
    const bare = mkdtempSync(join(tmpdir(), "greenline-forge-"));
    cleanup.push(bare);
    spawnSync("git", ["init", "--quiet", "--bare", bare]);
    const url = "https://github.com/example/shelf.git";
    space.git("remote", "add", "origin", url);
    space.git("config", `url.${bare}.insteadOf`, url);
  }

  const ASKED = 'landing: "Push it straight to main."';
  const PUSH = "git push origin HEAD:main";

  /** A change opened on the branch given with the ask quoted into its committed landing line, built, the record still open, its remote a forge's. */
  function askedOn(branch: string): Fixture {
    usePath();
    const space = fixture();
    forgeRemote(space);
    expect(space.git("push", "--quiet", "origin", "main").code).toBe(0);
    space.git("checkout", "--quiet", "-b", branch);
    space.write(`.greenline/ledger/${ID}.md`, record(["choice: accepted", "state: open", ASKED]));
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open the change").code).toBe(0);
    expect(commitFile(space, "b.txt", "build").code).toBe(0);
    return space;
  }

  /** The harness hook's verdict on the push to main, as Claude Code pipes the shell command. */
  function guardPush(space: Fixture): Ran {
    return fire(space, {
      hook_event_name: "PreToolUse",
      session_id: "push-1",
      tool_name: "Bash",
      tool_input: { command: PUSH },
      cwd: space.root,
    });
  }

  /** A message of the owner's in the push's session, which the hooks journal (J-176 S1). */
  function ownerSaid(space: Fixture, words: string): void {
    fire(space, { hook_event_name: "UserPromptSubmit", session_id: "push-1", prompt: words });
  }

  /** Both hooks refuse the push to main while the record stands open, naming the state and the close. */
  function refusedWhileOpen(space: Fixture): void {
    const guarded = guardPush(space);
    expect(guarded.code).toBe(2);
    expect(guarded.err).toContain(
      "since its record stands open in its last commit; finish the close first",
    );
    const pushed = space.git("push", "--quiet", "origin", "HEAD:main");
    expect(pushed.code).not.toBe(0);
    expect(pushed.err).toContain(
      `this push would put change ${ID} on the default branch before its close: the push updates refs/heads/main`,
    );
    expect(pushed.err).toContain("stands open in a commit");
  }

  it("refuses a push of the open change to main from a ground branch the proposal named, on a forge remote, whatever its landing line holds", () => {
    const space = askedOn(FEATURE);
    refusedWhileOpen(space);
    // The working copy set done while the commit holds the record open: pre-push reads the commit pushed.
    space.write(`.greenline/ledger/${ID}.md`, closed("done", [ASKED]));
    const apart = space.git("push", "--quiet", "origin", "HEAD:main");
    expect(apart.code).not.toBe(0);
    expect(apart.err).toContain(
      `the push updates refs/heads/main, and .greenline/ledger/${ID}.md stands open in a commit`,
    );
  });

  it("lets the landing push after done through from a ground branch on a forge remote with the words committed, and refuses it without them", () => {
    usePath();
    const space = fixture();
    forgeRemote(space);
    expect(space.git("push", "--quiet", "origin", "main").code).toBe(0);
    space.git("checkout", "--quiet", "-b", FEATURE);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open the change").code).toBe(0);
    expect(commitFile(space, "b.txt", "build").code).toBe(0);
    writeFact(space, ["node", "-e", "0"], 0, "10");
    space.write(`.greenline/ledger/${ID}.md`, closed("done"));
    space.git("add", ".greenline/");
    expect(space.git("commit", "--quiet", "-m", "close the change").code).toBe(0);
    // Done, no words: the branch's own push is refused by pre-push, the harness hook leaving it there.
    const branchPush = space.git("push", "--quiet", "-u", "origin", FEATURE);
    expect(branchPush.code).not.toBe(0);
    expect(branchPush.err).toContain(
      `the push updates refs/heads/${FEATURE}, change ${ID}'s branch, and .greenline/ledger/${ID}.md carries no landing line`,
    );
    // Done, no words: the harness hook names the landing line, and pre-push refuses too.
    const unasked = guardPush(space);
    expect(unasked.code).toBe(2);
    expect(unasked.err).toContain(`.greenline/ledger/${ID}.md holds no landing line`);
    const refused = space.git("push", "--quiet", "origin", "HEAD:main");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain("carries no landing line");
    // The owner's words committed alone after the close lift the push on both hooks.
    expect(commitWords(space).code).toBe(0);
    // J-176 S1: with no message of the owner's journaled, the push to the default branch is the owner's own.
    expect(guardPush(space).err).toContain(
      "the owner pushes it from their own terminal; push-from-terminal",
    );
    // A message that does not hold the landing line's words lifts nothing (the run j109t-conduct-runnerb).
    ownerSaid(space, "Push the branch.");
    const unsaid = guardPush(space);
    expect(unsaid.code).toBe(2);
    expect(unsaid.err).toContain("which no message of the owner's holds");
    expect(unsaid.err).toContain("owned-words");
    ownerSaid(space, "merge into main: merge it anyway, the owner");
    const allowed = guardPush(space);
    expect(allowed.code, allowed.err).toBe(0);
    const landed = space.git("push", "--quiet", "origin", "HEAD:main");
    expect(landed.code, landed.err).toBe(0);
    const ownPush = space.git("push", "--quiet", "-u", "origin", FEATURE);
    expect(ownPush.code, ownPush.err).toBe(0);
  });

  it("refuses the same push from the change's own branch while open, and lets it through once the close sets the record done", () => {
    const space = askedOn(BRANCH);
    refusedWhileOpen(space);
    const asked = ASKED;
    // The close sets the record done over a green check; the same push goes through.
    writeFact(space, ["node", "-e", "0"], 0, "10");
    space.write(`.greenline/ledger/${ID}.md`, closed("done", [asked]));
    space.git("add", ".greenline/");
    expect(space.git("commit", "--quiet", "-m", "close the change").code).toBe(0);
    ownerSaid(space, "Push it straight to main.");
    const allowed = guardPush(space);
    expect(allowed.code, allowed.err).toBe(0);
    const landed = space.git("push", "--quiet", "origin", "HEAD:main");
    expect(landed.code, landed.err).toBe(0);
  });

  /** The landing's order after the close: the words alone, the merge with close's message, its check and the commit of its facts. */
  async function landInOrder(origin: "bare" | "none"): Promise<Fixture> {
    const space = closedOn(FEATURE, origin);
    const words = commitWords(space);
    expect(words.code, words.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    // The merge with close's message, its trailers its last paragraph.
    const message = `.greenline/tmp/${ID}/merge-message.txt`;
    space.write(message, `Merge branch '${FEATURE}' into main\n\nGreenline-Change: ${ID}\n`);
    expect(space.git("checkout", "--quiet", "main").code).toBe(0);
    const merged = space.git("merge", "--quiet", "--no-ff", "-F", message, FEATURE);
    expect(merged.code, merged.err).toBe(0);
    rmSync(join(space.root, ".greenline/tmp"), { recursive: true, force: true });
    expect(space.git("log", "-1", "--format=%P").out.trim().split(" ")).toHaveLength(2);
    // The check on the merge commit, its facts committed with the record and folder alone.
    await checkMerged(space, 0);
    space.git("add", `.greenline/ledger/${ID}/`);
    const recorded = space.git("commit", "--quiet", "-m", "record the merge's check");
    expect(recorded.code, recorded.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    expect(space.git("status", "--porcelain").out).toBe("");
    return space;
  }

  it("runs the landing's whole order with the words written after done on a remote that is no forge, nothing else committed on main", async () => {
    const space = await landInOrder("bare");
    const after = commitFile(space, "c.txt", "after the landing");
    expect(after.code).not.toBe(0);
    expect(after.err).toContain(`${noChange("main")}`);
  });

  it("runs the same order with the words written after done where the repository has no remote", async () => {
    await landInOrder("none");
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
      `the change waits for the owner's yes, since .greenline/ledger/${ID}.md says choice: standing, which proceed none does not allow; wait for the yes and write the choice line owner or accepted; standing-choice, greenline's pre-commit hook`,
    );
  });

  it("refuses a mode slower than the one proceed names, and allows the mode it names and a faster one", () => {
    usePath();
    expect(standing("quick", "careful").err).toContain(
      "says choice: standing, which proceed quick does not allow",
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
      err: `the write to ${path} waits, lying outside .greenline/ledger/ and .greenline/tmp/: ${noChange("main")}, greenline's harness hook\n`,
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
    expect(codex.err).toContain(`the write to src/a.ts waits, lying outside`);
    expect(fire(space, patch([`.greenline/ledger/${ID}.md`]), "codex").code).toBe(0);
    expect(existsSync(join(space.root, ".greenline/tmp"))).toBe(false);
  });

  it("allows a write inside the homes, a read and a shell command that writes nothing, so a record can still be opened, and holds a redirect into the code", () => {
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
        tool_input: { command: "cat a.txt" },
      }).code,
    ).toBe(0);
    // J-176 S1: a shell command's redirect is a write like the write tool's, held while no change is open.
    expect(
      fire(space, {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo x > src/a.ts" },
        cwd: space.root,
      }).code,
    ).toBe(2);
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
      `the write to ${join(space.root, "src/a.ts")} waits too, lying outside .greenline/ledger/ and .greenline/tmp/${ID}/; the change waits for the owner's yes, since .greenline/ledger/${ID}.md says choice: standing, which proceed none does not allow; wait for the yes and write the choice line owner or accepted; standing-choice, greenline's harness hook\n`,
    );
    space.write(".greenline/manifest.json", manifest(HOOKS_ON, [], "quick"));
    expect(fire(space, writeTo(join(space.root, "src/a.ts"))).err).toContain(
      "which proceed quick does not allow",
    );
    space.write(".greenline/manifest.json", manifest(HOOKS_ON, [], "careful"));
    expect(fire(space, writeTo(join(space.root, "src/a.ts"))).code).toBe(0);
  });
});

describe("J-107 S3 the mirror prints the change's progress line at a turn's start", () => {
  /** A turn's start through greenline event, with the modes definition the installation gives. */
  function turn(space: Fixture, line: (() => ModesDefinition | undefined) | undefined): Ran {
    const writer = new RecordingWriter();
    const env: EventEnvironment = {
      cwd: space.root,
      stdin: () => JSON.stringify({ hook_event_name: "UserPromptSubmit" }),
    };
    const code = runEventCli(
      ["--harness", "claude-code"],
      writer.writer,
      line === undefined ? env : { ...env, line },
    );
    return { code, out: writer.out, err: writer.err };
  }

  const parsed = parseModes(
    readFileSync(join(import.meta.dirname, "../../corpus/runtime/modes.json"), "utf8"),
    "corpus/runtime/modes.json",
  );
  const LINE = parsed._tag === "ok" ? parsed.value : undefined;

  it("counts the steps the record's mode runs and names the next one, read from the record and the line", () => {
    const space = opened();
    space.write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: quick",
        'why: "the retry"',
        "choice: accepted",
        "state: open",
        "---",
        "",
        "## frame",
        "",
        "the intent",
        "",
        "## plan",
        "",
        "the acceptance",
        "",
        "## anticipate",
        "",
        "none at quick",
        "",
        "## build",
        "",
        "## review",
        "",
        "none at quick",
        "",
        "## verify",
        "",
        "## close",
        "",
      ].join("\n"),
    );
    const ran = turn(space, () => LINE);
    expect(ran.code).toBe(0);
    expect(ran.out).toContain(
      `progress: \`${ID.replace(/^\d{4}-\d{2}-\d{2}-/, "")} · frame ✓ plan ✓ anticipate – build ▶ review – verify · close\``,
    );
  });

  it("prints no progress line where the modes definition cannot be read", () => {
    const space = opened();
    const ran = turn(space, () => undefined);
    expect(ran.out).toContain(`greenline: change ${ID}, quick, open.`);
    expect(ran.out).not.toContain("progress:");
    expect(turn(space, undefined).out).not.toContain("progress:");
  });
});

describe("J-118 S1 a discussion's commit, admitted while no change is open", () => {
  const TALK = "2026-10-21-offline-mode";
  const TALK_PATH = `.greenline/ledger/discussions/${TALK}.md`;
  const talk = (lines: readonly string[]): string =>
    [
      "---",
      'idea: "Let the app work on a train"',
      ...lines,
      "---",
      "",
      "## frame",
      "",
      "x",
      "",
    ].join("\n");

  /** The discussion trailers of the latest commit, as git reads its trailers. */
  function discussionTrailers(space: Fixture): readonly string[] {
    return space
      .git("log", "-1", "--format=%(trailers:key=Greenline-Discussion,valueonly)")
      .out.trim()
      .split("\n")
      .filter((line) => line !== "");
  }

  it("lets a commit whose paths lie only under the discussions folder through with no change open, its trailer written and no change's", () => {
    usePath();
    const space = fixture();
    space.write(TALK_PATH, talk(["state: open"]));
    space.write(`.greenline/ledger/discussions/${TALK}/frame-research-1.md`, "a report\n");
    space.git("add", ".greenline/ledger/discussions");
    const committed = space.git("commit", "--quiet", "-m", "docs(discussion): offline mode");
    expect(committed.code, committed.err).toBe(0);
    expect(discussionTrailers(space)).toEqual([TALK]);
    expect(trailerOf(space)).toBe("");
  });

  it("refuses a commit mixing a discussion's paths with any other while no change is open", () => {
    usePath();
    const space = fixture();
    space.write(TALK_PATH, talk(["state: open"]));
    space.write("src/a.ts", "a\n");
    space.git("add", ".greenline/ledger/discussions", "src/a.ts");
    const mixed = space.git("commit", "--quiet", "-m", "both");
    expect(mixed.code).not.toBe(0);
    expect(mixed.err).toContain(`${noChange("main")}`);
    expect(space.git("log", "-1", "--format=%s").out.trim()).toBe("start");
  });

  it("admits the discussion's commit on the default branch of a repository with a remote, where no change is ever open", () => {
    usePath();
    const space = fixture();
    remote(space);
    space.write(TALK_PATH, talk(["state: open"]));
    space.git("add", ".greenline/ledger/discussions");
    const committed = space.git("commit", "--quiet", "-m", "docs(discussion): offline mode");
    expect(committed.code, committed.err).toBe(0);
    expect(discussionTrailers(space)).toEqual([TALK]);
  });

  it("commits a discussion on a change's branch as the discussion's, before the change's yes too, with no change trailer", () => {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    space.write(TALK_PATH, talk(["state: open"]));
    space.git("add", ".greenline/ledger/discussions");
    const committed = space.git("commit", "--quiet", "-m", "docs(discussion): beside the change");
    expect(committed.code, committed.err).toBe(0);
    expect(discussionTrailers(space)).toEqual([TALK]);
    expect(trailerOf(space)).toBe("");
  });

  it("refuses a discussion's commit whose message carries a change's trailer, since it is no change's commit", () => {
    usePath();
    const space = fixture();
    space.write(TALK_PATH, talk(["state: open"]));
    space.git("add", ".greenline/ledger/discussions");
    const claimed = space.git(
      "commit",
      "--quiet",
      "-m",
      `docs(discussion): offline mode\n\nGreenline-Change: ${ID}`,
    );
    expect(claimed.code).not.toBe(0);
    expect(claimed.err).toContain(
      `a discussion's commit names no change: the commit stages only discussions' paths, ${TALK}, and the message carries 'Greenline-Change: ${ID}'`,
    );
  });

  it("refuses a discussion record that does not read, and a state moved without the owner's new words (S3)", () => {
    usePath();
    const space = fixture();
    space.write(TALK_PATH, "---\nidea: x\n---\n");
    space.git("add", ".greenline/ledger/discussions");
    const unread = space.git("commit", "--quiet", "-m", "a broken discussion");
    expect(unread.code).not.toBe(0);
    expect(unread.err).toContain(
      `the discussion cannot be committed as it stands: ${TALK_PATH} does not read as a discussion record`,
    );
    space.write(TALK_PATH, talk(["state: open"]));
    space.git("add", ".greenline/ledger/discussions");
    expect(space.git("commit", "--quiet", "-m", "open it").code).toBe(0);
    space.write(
      TALK_PATH,
      talk(['revisit: "after the release"', "state: parked", 'words: "park it"']),
    );
    space.git("add", ".greenline/ledger/discussions");
    const parked = space.git("commit", "--quiet", "-m", "park it");
    expect(parked.code, parked.err).toBe(0);
    space.write(
      TALK_PATH,
      talk(['reason: "online-only by design"', "state: declined", 'words: "park it"']),
    );
    space.git("add", ".greenline/ledger/discussions");
    const declined = space.git("commit", "--quiet", "-m", "decline it");
    expect(declined.code).not.toBe(0);
    expect(declined.err).toContain(
      `the discussion's move from parked to declined needs the owner's word: ${TALK_PATH} keeps the words line it held before, "park it"`,
    );
    space.write(
      TALK_PATH,
      talk([
        'reason: "online-only by design"',
        "state: declined",
        'words: "drop it, we stay online"',
      ]),
    );
    space.git("add", ".greenline/ledger/discussions");
    const owned = space.git("commit", "--quiet", "-m", "decline it");
    expect(owned.code, owned.err).toBe(0);
  });

  it("lets the harness hook write the discussions folder before any yes, with no change open and with one awaiting its yes", () => {
    usePath();
    const none = fixture();
    expect(fire(none, { ...writeTo(join(none.root, TALK_PATH)), cwd: none.root })).toEqual({
      code: 0,
      out: "",
      err: "",
    });
    const waiting = fixture();
    waiting.git("checkout", "--quiet", "-b", BRANCH);
    waiting.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    expect(
      fire(waiting, { ...writeTo(join(waiting.root, TALK_PATH)), cwd: waiting.root }).code,
    ).toBe(0);
  });
});

describe("J-143 S1 a commit's paths and trailers are one change's", () => {
  const GROUNDWORK = "2026-10-19-groundwork";
  const SWEPT = `.greenline/ledger/${GROUNDWORK}/visuals.json`;

  /** A done change committed on main, then this change open on its own branch, as the run held them. */
  function beside(): Fixture {
    usePath();
    const space = fixture();
    space.write(
      `.greenline/ledger/${GROUNDWORK}.md`,
      record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
    );
    space.write(SWEPT, '{"visuals":["request-line"]}\n');
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "--no-verify", "-m", "the groundwork").code).toBe(0);
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    const open = space.git("commit", "--quiet", "-m", "open the change");
    expect(open.code, open.err).toBe(0);
    return space;
  }

  it("refuses a commit that stages another change's file, naming the path and the change, and admits it once unstaged", () => {
    const space = beside();
    // The inspector rewrites the finished change's visuals file while this change closes.
    space.write(SWEPT, '{"visuals":[]}\n');
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: done", 'outcome: "The change landed."']),
    );
    space.git("add", ".greenline/ledger");
    const swept = space.git("commit", "--quiet", "-m", "close the change");
    expect(swept.code).not.toBe(0);
    expect(swept.err).toContain(
      `this commit would carry change ${GROUNDWORK}'s file into change ${ID}'s work: the commit stages ${SWEPT}`,
    );
    expect(swept.err).toContain("; other-change-paths, greenline's pre-commit hook");
    space.git("restore", "--staged", "--", SWEPT);
    const own = space.git("commit", "--quiet", "-m", "close the change");
    expect(own.code, own.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  });

  it("admits another change's record and folder committed alone, with that change's trailer, and refuses them with code beside", () => {
    const space = beside();
    space.write(SWEPT, '{"visuals":[]}\n');
    space.git("add", "--", SWEPT);
    const alone = space.git("commit", "--quiet", "-m", "the groundwork's visuals, emptied");
    expect(alone.code, alone.err).toBe(0);
    expect(trailerOf(space)).toBe(GROUNDWORK);
    space.write(
      `.greenline/ledger/${GROUNDWORK}.md`,
      record([
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        'landing: "declined: leave the branch"',
      ]),
    );
    space.write("c.txt", "code\n");
    space.git("add", ".");
    const mixed = space.git("commit", "--quiet", "-m", "the words with code beside them");
    expect(mixed.code).not.toBe(0);
    // J-144 S4: a done record with code beside it is refused on any branch, naming the commit of the record alone.
    expect(mixed.err).toContain(`change ${GROUNDWORK} is done, so `);
    expect(mixed.err).toContain(
      `cannot be committed beside its record; commit .greenline/ledger/${GROUNDWORK}.md and its folder alone`,
    );
  });

  const PLANNING = "2026-10-19-renew-and-late";
  const RENEW = "2026-10-19-renew-once";
  const LATE = "2026-10-19-days-late";

  /** A planning change on its own branch, its two tickets open beside it, its record naming the plan or not, as the run wrote it. */
  function planned(planLine: readonly string[]): Fixture {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", `greenline/${PLANNING}`);
    space.write(
      `.greenline/ledger/${PLANNING}.md`,
      record(["choice: owner", "state: open", ...planLine]),
    );
    for (const [id, ticket] of [
      [RENEW, "renew-once"],
      [LATE, "days-late"],
    ] as const)
      space.write(
        `.greenline/ledger/${id}.md`,
        record(["choice: accepted", "state: open", "plan: 001-renew", `ticket: ${ticket}`]),
      );
    space.git("add", ".");
    const open = space.git("commit", "--quiet", "-m", "open the plan and its tickets");
    expect(open.code, open.err).toBe(0);
    return space;
  }

  for (const [named, planLine] of [
    ["names no plan", []],
    ["names its plan", ["plan: 001-renew"]],
  ] as const)
    it(`admits a ticket's own trailer on the planning change's branch whose record ${named}, and refuses two tickets' trailers in one commit`, () => {
      const space = planned(planLine);
      const ticket = commitFile(
        space,
        "shelf.js",
        "renew a loan once",
        "-m",
        `Greenline-Change: ${RENEW}`,
      );
      expect(ticket.code, ticket.err).toBe(0);
      expect(trailerOf(space)).toBe(RENEW);
      const lead = commitFile(
        space,
        "plan.txt",
        "the plan's own",
        "-m",
        `Greenline-Change: ${PLANNING}`,
      );
      expect(lead.code, lead.err).toBe(0);
      expect(trailerOf(space)).toBe(PLANNING);
      const mixed = commitFile(
        space,
        "both.js",
        "both tickets",
        "-m",
        `Greenline-Change: ${RENEW}\nGreenline-Change: ${LATE}`,
      );
      expect(mixed.code).not.toBe(0);
      expect(mixed.err).toContain(`'Greenline-Change: ${RENEW}' and 'Greenline-Change: ${LATE}'`);
      const foreign = commitFile(
        space,
        "z.js",
        "another's",
        "-m",
        "Greenline-Change: 2026-10-19-zz",
      );
      expect(foreign.code).not.toBe(0);
    });

  it("gives a ticket of a plan no record names to no other change's branch", () => {
    const space = planned([]);
    const other = "2026-10-19-other";
    space.git("checkout", "--quiet", "-b", `greenline/${other}`);
    space.write(`.greenline/ledger/${other}.md`, record(["choice: accepted", "state: open"]));
    space.git("add", ".");
    const open = space.git("commit", "--quiet", "-m", "open the other change");
    expect(open.code, open.err).toBe(0);
    expect(trailerOf(space)).toBe(other);
    const stray = commitFile(space, "x.js", "a ticket's", "-m", `Greenline-Change: ${RENEW}`);
    expect(stray.code).not.toBe(0);
    expect(stray.err).toContain(`'Greenline-Change: ${RENEW}'`);
  });

  it("admits the planning change's landing-words commit on a ticket's branch, its record alone, and refuses it with code beside", () => {
    const space = planned([]);
    space.git("checkout", "--quiet", "-b", `greenline/${LATE}`);
    space.write(
      `.greenline/ledger/${PLANNING}.md`,
      record(["choice: owner", "state: open", 'landing: "Fast-forward."']),
    );
    space.write("late.js", "late\n");
    space.git("add", ".");
    const words = (): Ran =>
      space.git(
        "commit",
        "--quiet",
        "-m",
        "the owner's words",
        "-m",
        `Greenline-Change: ${PLANNING}`,
      );
    const mixed = words();
    expect(mixed.code).not.toBe(0);
    space.git("restore", "--staged", "--", "late.js");
    const alone = words();
    expect(alone.code, alone.err).toBe(0);
    expect(trailerOf(space)).toBe(PLANNING);
  });

  it("reads a declined landing answer as no landing: a push of the branch is refused, naming the answer", () => {
    usePath();
    const space = opened([
      "choice: accepted",
      "state: done",
      'outcome: "The change landed."',
      'landing: "declined: Leave the branch, thanks."',
    ]);
    remote(space);
    const refused = space.git("push", "--quiet", "origin", BRANCH);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      `the owner's answer declining the landing, "Leave the branch, thanks.", which lifts no push`,
    );
  });
});

describe("J-147 S3 done waits for the atlas pages the change touched, refreshed or left in the owner's words", () => {
  /** The atlas's index of the pages given, each covering its folder under src/, read at a commit. */
  const atlas = (commit: string, names: readonly string[]): string =>
    JSON.stringify({
      schema: "greenline.atlas/v1",
      layers: ["core"],
      subsystems: names.map((name) => ({
        name,
        title: name,
        layer: "core",
        summary: `The ${name}.`,
        files: [`src/${name}/`],
        commit,
        read: "2026-10-28",
        calls: [],
      })),
      refreshes: [],
    });

  /** A change on its branch whose commit touched the pages given, the atlas read before it on main. */
  const built = (names: readonly string[], pages: readonly string[] = names): Fixture => {
    const space = fixture();
    for (const name of names) space.write(`src/${name}/a.js`, "a\n");
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "--no-verify", "-m", "code").code).toBe(0);
    const at = space.git("rev-parse", "HEAD").out.trim();
    space.write(".greenline/visuals/atlas.json", atlas(at, names));
    // Each page's own file, which the close's refresh rewrites (J-227 S1).
    for (const name of names)
      space.write(`.greenline/visuals/subsystems/${name}.md`, `# ${name}\n`);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "--no-verify", "-m", "atlas").code).toBe(0);
    space.git("checkout", "--quiet", "-b", BRANCH);
    space.write(`.greenline/ledger/${ID}.md`, OPEN);
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "open").code).toBe(0);
    for (const name of pages) space.write(`src/${name}/a.js`, "b\n");
    space.git("add", ".");
    const work = space.git("commit", "--quiet", "-m", "build");
    expect(work.code, work.err).toBe(0);
    return space;
  };

  const close = (space: Fixture, lines: readonly string[] = [], closeText = "Closed."): Ran => {
    space.write(
      `.greenline/ledger/${ID}.md`,
      record([
        "choice: accepted",
        "state: done",
        'outcome: "The change landed."',
        ...lines,
      ]).replace("## frame\n\nx\n", `## frame\n\nx\n\n## close\n\n${closeText}\n`),
    );
    space.git("add", ".");
    return space.git("commit", "--quiet", "-m", "close");
  };

  it("refuses done while a touched page drifts with no refresh, naming the page and the way forward", () => {
    usePath();
    const space = built(["loans", "members"], ["loans"]);
    const refused = close(space);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      `the change cannot be marked done yet: .greenline/ledger/${ID}.md sets state: done, and the page it touched, loans, drifted with no refresh; have one fresh agent refresh it and name the refresh in the record's refreshes, or write the owner's words "leave the pages" in its close; atlas-refresh`,
    );
  });

  it("lets done through once the record names the refresh, or the owner's words leave the pages", () => {
    usePath();
    const named = close(built(["loans"]), [
      'refreshes:\n  - { by: explain, pages: "loans", cost: "one agent, four minutes" }',
    ]);
    expect(named.code, named.err).toBe(0);
    const left = close(built(["loans"]), [], 'The owner said: "leave the pages as they are".');
    expect(left.code, left.err).toBe(0);
  });

  /** The close's fresh agent's refresh of a page: the page rewritten and the atlas's commit moved, staged with the record. */
  const refresh = (space: Fixture, name: string): void => {
    space.write(`.greenline/visuals/subsystems/${name}.md`, `# ${name}\n\nRefreshed.\n`);
    space.write(
      ".greenline/visuals/atlas.json",
      atlas(space.git("rev-parse", "HEAD").out.trim(), [name]),
    );
  };

  it("refuses done while the record's refreshes miss a page the change rewrote, whatever the owner's words (J-227 S1, j201t-linear-visuals finding 15)", () => {
    usePath();
    const space = built(["loans"]);
    refresh(space, "loans");
    const refused = close(space, [], 'The owner said: "leave the pages as they are".');
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      `the change cannot be marked done yet: .greenline/ledger/${ID}.md sets state: done, and the change rewrote loans, which the record's refreshes line does not name; name each with the agent that refreshed it and its cost`,
    );
    expect(refused.err).toContain("atlas-refresh");
  });

  it("lets done through once the refreshes line names the page the change rewrote", () => {
    usePath();
    const space = built(["loans"]);
    refresh(space, "loans");
    const named = close(space, [
      'refreshes:\n  - { by: explain, pages: "loans", cost: "one agent, four minutes" }',
    ]);
    expect(named.code, named.err).toBe(0);
  });

  it("holds nothing past three touched pages, where the close's offer stands instead, and nothing with no atlas", () => {
    usePath();
    const many = close(built(["a", "b", "c", "d"]));
    expect(many.code, many.err).toBe(0);
    const space = opened();
    space.write("src/loans/a.js", "b\n");
    space.git("add", ".");
    expect(space.git("commit", "--quiet", "-m", "build").code).toBe(0);
    const bare = close(space);
    expect(bare.code, bare.err).toBe(0);
  });
});

describe("J-186 S1 the owner's yes settled once the record that quotes it is committed", () => {
  const RECORD = `.greenline/ledger/${ID}.md`;
  const RESUME = "Carry on; the last session stopped after the first commit.";
  /** The record closed done over its close section. */
  const done = (): string =>
    record(["choice: accepted", "state: done"]).concat("\n## close\n\nthe checks green\n");

  /** A message of the owner's in a session of the checkout, which the hooks journal there. */
  function said(space: Fixture, session: string, words: string): void {
    fire(space, { hook_event_name: "UserPromptSubmit", session_id: session, prompt: words });
  }

  /** A checkout at the path given: its own files and its own git. */
  function checkoutAt(root: string): Fixture {
    return {
      root,
      git: (...args) => {
        const ran = spawnSync(
          "git",
          ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args],
          { cwd: root, encoding: "utf8", env: { ...process.env, GIT_EDITOR: "true" } },
        );
        return { code: ran.status ?? -1, err: ran.stderr, out: ran.stdout };
      },
      write: (path, text) => {
        mkdirSync(join(root, path, ".."), { recursive: true });
        writeFileSync(join(root, path), text);
      },
      read: (path) => readFileSync(join(root, path), "utf8"),
    };
  }

  /** The change opened on its branch, the yes said in an earlier session and its record committed. */
  function committedYes(): Fixture {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", BRANCH);
    said(space, "earlier", "Yes, go ahead.");
    space.write(RECORD, OPEN);
    space.git("add", "--", RECORD);
    const opening = space.git("commit", "--quiet", "-m", "open the change");
    expect(opening.code, opening.err).toBe(0);
    return space;
  }

  /** A build commit and the close's commit in the checkout given, each through git's own hooks. */
  function buildAndClose(space: Fixture): void {
    const built = commitFile(space, "b.txt", "build");
    expect(built.code, built.err).toBe(0);
    writeFact(space, ["node", "-e", "0"], 0, "10");
    space.write(RECORD, done());
    space.git("add", "--", RECORD, `.greenline/ledger/${ID}/`);
    const closing = space.git("commit", "--quiet", "-m", "close the change");
    expect(closing.code, closing.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
  }

  it("lets a clone build and close in a fresh session without a second yes (j179c-states-stop-2)", () => {
    const space = committedYes();
    const root = mkdtempSync(join(tmpdir(), "greenline-clone-"));
    cleanup.push(root);
    rmSync(root, { recursive: true });
    expect(
      spawnSync("git", ["clone", "--quiet", "--branch", BRANCH, space.root, root]).status,
    ).toBe(0);
    registerGitHooks(root, HOOKS_ON);
    const clone = checkoutAt(root);
    said(clone, "resumed", RESUME);
    buildAndClose(clone);
  });

  it("lets a linked worktree's session build and close without a second yes (j179c-conduct-interface)", () => {
    const space = committedYes();
    space.git("checkout", "--quiet", "main");
    expect(space.git("worktree", "add", "--quiet", `.worktrees/${ID}`, BRANCH).code).toBe(0);
    const tree = checkoutAt(join(space.root, ".worktrees", ID));
    said(tree, "in-tree", RESUME);
    buildAndClose(tree);
  });

  it("refuses a commit on a greenline branch whose name holds no change's id, naming the rename (j109t-conduct-runnerc)", () => {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", "greenline/find-author-case");
    const refused = commitFile(space, "b.txt", "build");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      "no change is open on greenline/find-author-case, whose name holds no change's id",
    );
    expect(refused.err).toContain(
      "`git branch -m greenline/find-author-case greenline/<YYYY-MM-DD>-find-author-case`",
    );
  });

  it("J-188 S1 refuses the first commit on a greenline branch whose name holds no id though its record stands open and the message carries its trailer, and lets it go on after the rename (j109t-conduct-runnerd)", () => {
    usePath();
    const space = fixture();
    const id = "2026-11-07-author-case";
    const opening = `.greenline/ledger/${id}.md`;
    space.git("checkout", "--quiet", "-b", "greenline/author-case");
    said(space, "author", "Yes, go ahead.");
    space.write(opening, OPEN);
    space.write("b.txt", "b\n");
    space.git("add", "--", opening, "b.txt");
    const refused = space.git("commit", "--quiet", "-m", "build", "-m", `Greenline-Change: ${id}`);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      `no change is open on greenline/author-case, whose name holds no change's id: a change's branch is greenline/<id>`,
    );
    expect(refused.err).toContain(
      `rename the branch to its change's id, \`git branch -m greenline/author-case greenline/${id}\``,
    );
    // The record's commit alone waits for the rename too.
    expect(space.git("commit", "--quiet", "-m", "open", "--", opening).code).not.toBe(0);
    expect(space.git("log", "-1", "--format=%s").out.trim()).toBe("start");
    // The rename is no commit and goes on; the commit after it is the change's.
    expect(space.git("branch", "-m", "greenline/author-case", `greenline/${id}`).code).toBe(0);
    const renamed = space.git("commit", "--quiet", "-m", "build");
    expect(renamed.code, renamed.err).toBe(0);
    expect(trailerOf(space)).toBe(id);
  });

  it("holds a yes line changed after the commit against every session's journal again", () => {
    const space = committedYes();
    rmSync(join(space.root, ".greenline", "tmp", "sessions"), { recursive: true, force: true });
    said(space, "resumed", RESUME);
    space.write(RECORD, record(["choice: accepted", 'yes: "Ship it tonight."', "state: open"]));
    space.git("add", "--", RECORD);
    const changed = space.git("commit", "--quiet", "-m", "the yes rewritten");
    expect(changed.code).not.toBe(0);
    expect(changed.err).toContain(`the yes line quotes "Ship it tonight.", which no message`);
  });
});

describe("J-193 S1 the harness-named worktree branch, and a rebase line of one message", () => {
  const AUTHOR = "2026-11-07-author-case";
  const OTHER = "2026-11-07-shelf-copies";
  const TREE = ".claude/worktrees/author-case";
  const NAMED = "worktree-author-case";

  /** A message of the owner's in a session of the checkout, which the hooks journal there. */
  function said(space: Fixture, session: string, words: string): void {
    fire(space, { hook_event_name: "UserPromptSubmit", session_id: session, prompt: words });
  }

  /** A checkout at the path given: its own files and its own git. */
  function checkoutAt(root: string): Fixture {
    return {
      root,
      git: (...args) => {
        const ran = spawnSync(
          "git",
          ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args],
          { cwd: root, encoding: "utf8", env: { ...process.env, GIT_EDITOR: "true" } },
        );
        return { code: ran.status ?? -1, err: ran.stderr, out: ran.stdout };
      },
      write: (path, text) => {
        mkdirSync(join(root, path, ".."), { recursive: true });
        writeFileSync(join(root, path), text);
      },
      read: (path) => readFileSync(join(root, path), "utf8"),
    };
  }

  /**
   * The main checkout on another change's branch, its record open, and the worktree the harness's
   * tool made from it on the branch it named, where the author change opens with its ground line
   * naming the worktree (j179c-conduct-runnerb, the Claude tester's handback).
   */
  function harnessTree(ground: string): Fixture {
    usePath();
    const space = fixture();
    remote(space);
    space.git("checkout", "--quiet", "-b", `greenline/${OTHER}`);
    said(space, "shelf", "Yes, go ahead.");
    space.write(`.greenline/ledger/${OTHER}.md`, OPEN);
    space.git("add", "--", `.greenline/ledger/${OTHER}.md`);
    expect(space.git("commit", "--quiet", "-m", "open the shelf change").code).toBe(0);
    expect(space.git("worktree", "add", "--quiet", "-b", NAMED, TREE).code).toBe(0);
    const tree = checkoutAt(join(space.root, TREE));
    said(tree, "author", "Yes, go ahead.");
    tree.write(
      `.greenline/ledger/${AUTHOR}.md`,
      record(["choice: accepted", "state: open", `ground: "${ground}"`]),
    );
    return tree;
  }

  it("takes a commit on the branch the harness named as the change's its ground line names, its trailer written", () => {
    const tree = harnessTree(`worktree: ${TREE}`);
    tree.write("b.txt", "b\n");
    tree.git("add", "--", `.greenline/ledger/${AUTHOR}.md`, "b.txt");
    const built = tree.git("commit", "--quiet", "-m", "build");
    expect(built.code, built.err).toBe(0);
    expect(trailerOf(tree)).toBe(AUTHOR);
  });

  it("holds the landing's push of that branch to the change's landing line, and lets it go once the words stand", () => {
    const tree = harnessTree(`worktree: ${TREE}`);
    tree.git("add", "--", `.greenline/ledger/${AUTHOR}.md`);
    expect(tree.git("commit", "--quiet", "-m", "open the author change").code).toBe(0);
    const held = tree.git("push", "--quiet", "origin", NAMED);
    expect(held.code).not.toBe(0);
    expect(held.err).toContain(
      `change ${AUTHOR}'s branch, mid-change while the record is open, and .greenline/ledger/${AUTHOR}.md carries no landing line`,
    );
    said(tree, "author", "Push the branch.");
    tree.write(
      `.greenline/ledger/${AUTHOR}.md`,
      record([
        "choice: accepted",
        "state: open",
        `ground: "worktree: ${TREE}"`,
        'landing: "Push the branch."',
      ]),
    );
    expect(
      tree.git(
        "commit",
        "--quiet",
        "-m",
        "the landing words",
        "--",
        `.greenline/ledger/${AUTHOR}.md`,
      ).code,
    ).toBe(0);
    const pushed = tree.git("push", "--quiet", "origin", NAMED);
    expect(pushed.code, pushed.err).toBe(0);
  });

  it("reads the branch as before where the ground line names no worktree of it: two changes open, no trailer", () => {
    const tree = harnessTree("branch");
    tree.write("b.txt", "b\n");
    tree.git("add", "--", `.greenline/ledger/${AUTHOR}.md`, "b.txt");
    expect(tree.git("commit", "--quiet", "-m", "build").code).toBe(0);
    expect(trailerOf(tree)).toBe("");
  });

  it("refuses a rebase on a line joined from two of the owner's messages, naming both, and lets one message's words through (j109t-conduct-runnere)", () => {
    usePath();
    const space = opened();
    expect(commitFile(space, "b.txt", "add b").code).toBe(0);
    space.git("checkout", "--quiet", "main");
    expect(commitFile(space, "m.txt", "main moves", "--no-verify").code).toBe(0);
    space.git("checkout", "--quiet", BRANCH);
    said(space, "rebase", "Reword the last commit.");
    said(space, "rebase", "Your call.");
    const words = (rebase: string): void => {
      space.write(
        `.greenline/ledger/${ID}.md`,
        record(["choice: accepted", "state: open", `rebase: "${rebase}"`]),
      );
      expect(
        space.git("commit", "--quiet", "-m", "the rebase words", "--", `.greenline/ledger/${ID}.md`)
          .code,
      ).toBe(0);
    };
    words("Reword the last commit. Your call.");
    const joined = space.git("rebase", "--quiet", "main");
    expect(joined.code).not.toBe(0);
    expect(joined.err).toContain(
      `the rebase line of .greenline/ledger/${ID}.md says "Reword the last commit. Your call.", which no one message of the owner's holds whole: it joins "Reword the last commit." and "Your call.", two of their messages`,
    );
    expect(joined.err).toContain("owned-words, greenline's pre-rebase hook");
    words("Reword the last commit.");
    const rebased = space.git("rebase", "--quiet", "main");
    expect(rebased.code, rebased.err).toBe(0);
  });
});

describe("J-192 S1 the agent line names the model the harness reports, at the first commit and at done", () => {
  /** A Codex session's rollout, its turn context naming the model, as j109t-landing-4c's did. */
  function rollout(space: Fixture): string {
    const path = join(space.root, ".greenline", "tmp", "rollout.jsonl");
    space.write(
      ".greenline/tmp/rollout.jsonl",
      [
        JSON.stringify({ type: "session_meta", payload: { source: "exec" } }),
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-terra" } }),
      ].join("\n"),
    );
    return path;
  }

  /** The turn's start as Codex hands it, with its rollout's path and no model in the payload. */
  function turnStart(space: Fixture): void {
    fire(
      space,
      {
        hook_event_name: "UserPromptSubmit",
        session_id: "s-terra",
        prompt: "findByAuthor should ignore case, as the README says.",
        transcript_path: rollout(space),
      },
      "codex",
    );
  }

  it("refuses the first commit carrying codex/GPT-6 where the rollout names gpt-6.1-terra, naming it, then takes the model (j109t-landing-4c F2)", () => {
    usePath();
    const space = fixture();
    space.git("checkout", "--quiet", "-b", BRANCH);
    turnStart(space);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: owner", "state: open", 'agent: "codex/GPT-6"']),
    );
    space.git("add", "--", `.greenline/ledger/${ID}.md`);
    const family = space.git("commit", "--quiet", "-m", "open the change");
    expect(family.code).not.toBe(0);
    expect(family.err).toContain(
      `change ${ID}'s first commit carries its record, and the agent line names codex/GPT-6, a model family alone, where the harness reports the model gpt-6.1-terra: write agent: codex/gpt-6.1-terra`,
    );
    expect(family.err).toContain("record-form");
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: owner", "state: open", 'agent: "codex/gpt-6.1-terra"']),
    );
    space.git("add", "--", `.greenline/ledger/${ID}.md`);
    const named = space.git("commit", "--quiet", "-m", "open the change");
    expect(named.code, named.err).toBe(0);
    expect(
      space.git("log", "-1", "--format=%(trailers:key=Greenline-Agent,valueonly)").out.trim(),
    ).toBe("codex/gpt-6.1-terra");
  });

  it("refuses done over a family the record took after its first commit, and admits a harness that reports no model", () => {
    usePath();
    const space = opened(["choice: accepted", "state: open", 'agent: "codex/GPT-6"']);
    // No session note stands: the harness reported no model, so the first commit took the line.
    expect(space.git("log", "-1", "--format=%s").out.trim()).toBe("open the change");
    turnStart(space);
    space.write(
      `.greenline/ledger/${ID}.md`,
      record(["choice: accepted", "state: done", "next: none", 'agent: "codex/GPT-6"']),
    );
    space.git("add", "--", `.greenline/ledger/${ID}.md`);
    const done = space.git("commit", "--quiet", "-m", "close");
    expect(done.code).not.toBe(0);
    expect(done.err).toContain(
      `change ${ID} is not done while its record breaks its form: the agent line names codex/GPT-6, a model family alone`,
    );
  });
});

describe("J-226 S1 the agent line judged in a linked worktree as in the main checkout (j217t-ground findings 1 and 2)", () => {
  /** The session's rollout under the main checkout, its turn context naming gpt-6.1-terra, as j217t-ground's did. */
  function turnStart(space: Fixture): void {
    space.write(
      ".greenline/tmp/rollout.jsonl",
      [
        JSON.stringify({ type: "session_meta", payload: { source: "exec" } }),
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-terra" } }),
      ].join("\n"),
    );
    // The harness runs its hooks in the main checkout, where the session began, as the run's did.
    fire(
      space,
      {
        hook_event_name: "UserPromptSubmit",
        session_id: "s-ground",
        prompt: "Add a year filter to the shelf list, on a worktree of its own.",
        transcript_path: join(space.root, ".greenline", "tmp", "rollout.jsonl"),
      },
      "codex",
    );
  }

  /** The change's linked worktree beside the main checkout, on its own branch. */
  function linkedTree(space: Fixture): Fixture {
    const root = mkdtempSync(join(tmpdir(), "greenline-worktree-"));
    cleanup.push(root);
    rmSync(root, { recursive: true });
    expect(space.git("worktree", "add", "--quiet", "-b", BRANCH, root).code).toBe(0);
    return {
      root,
      git: (...args) => {
        const ran = spawnSync(
          "git",
          ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args],
          { cwd: root, encoding: "utf8", env: { ...process.env, GIT_EDITOR: "true" } },
        );
        return { code: ran.status ?? -1, err: ran.stderr, out: ran.stdout };
      },
      write: (path, text) => {
        mkdirSync(join(root, path, ".."), { recursive: true });
        writeFileSync(join(root, path), text);
      },
      read: (path) => readFileSync(join(root, path), "utf8"),
    };
  }

  it("refuses the first commit and the done commit carrying codex/GPT-6 in the worktree, the reported model read from the sessions home", () => {
    usePath();
    const space = fixture();
    turnStart(space);
    const tree = linkedTree(space);
    const RECORD = `.greenline/ledger/${ID}.md`;
    tree.write(RECORD, record(["choice: owner", "state: open", 'agent: "codex/GPT-6"']));
    tree.git("add", "--", RECORD);
    const first = tree.git("commit", "--quiet", "-m", "open the change");
    expect(first.code).not.toBe(0);
    expect(first.err).toContain(
      `the agent line names codex/GPT-6, a model family alone, where the harness reports the model gpt-6.1-terra: write agent: codex/gpt-6.1-terra`,
    );
    tree.write(RECORD, record(["choice: owner", "state: open", 'agent: "codex/gpt-6.1-terra"']));
    tree.git("add", "--", RECORD);
    const named = tree.git("commit", "--quiet", "-m", "open the change");
    expect(named.code, named.err).toBe(0);
    // The family written back at the close is refused at done there too.
    tree.write(
      RECORD,
      record(["choice: owner", "state: done", "next: none", 'agent: "codex/GPT-6"']),
    );
    tree.git("add", "--", RECORD);
    const done = tree.git("commit", "--quiet", "-m", "close");
    expect(done.code).not.toBe(0);
    expect(done.err).toContain(
      `change ${ID} is not done while its record breaks its form: the agent line names codex/GPT-6, a model family alone`,
    );
  });
});

describe("J-200 S1 a stop on the owner's words alone, and a commit held where the git hooks are not installed (j196t-states-stop-2)", () => {
  const SESSION = "019a0b1c-states-stop-2";
  /** The owner's turn 2 request: a wait for their review, inside the session. */
  const WAIT =
    "Yes, go ahead. Write the tests first and show them to me before you write the code.";
  /** The owner's turn 3 request: the stop. */
  const STOP = "Stop there for today; I will pick this up tomorrow.";
  const PATH_OF = `.greenline/ledger/${ID}.md`;

  function said(space: Fixture, words: string): void {
    fire(space, { hook_event_name: "UserPromptSubmit", session_id: SESSION, prompt: words });
  }

  /** The record set stopped at the review's wait, with the lines given; with none, no stopped line at all. */
  function stoppedRecord(extra: readonly string[] = []): string {
    const text = record([
      "choice: accepted",
      "state: stopped",
      'next: "build: the owner reviews the tests"',
      ...extra,
    ]);
    return extra.length === 0 ? text.replace(/^stopped: .*\n/m, "") : text;
  }

  function commitRecord(space: Fixture, message: string): Ran {
    return space.git("commit", "--quiet", "-m", message, "--", PATH_OF);
  }

  it("refuses the commit that sets the record stopped at a wait, with no stopped line, naming what a real stop is", () => {
    usePath();
    const space = opened();
    said(space, WAIT);
    space.write(PATH_OF, stoppedRecord());
    const waited = commitRecord(space, "the tests, for review");
    expect(waited.code).not.toBe(0);
    expect(waited.err).toContain(`${PATH_OF} carries no stopped line`);
    expect(waited.err).toContain(
      "a wait for the owner inside a session, for a review, an answer or a yes, is no stop and leaves the record open",
    );
    expect(waited.err).toContain("owned-words, greenline's pre-commit hook");
  });

  it("refuses a stopped line that quotes the owner's wait, and one no message of theirs holds", () => {
    usePath();
    const space = opened();
    said(space, WAIT);
    space.write(PATH_OF, stoppedRecord([`stopped: "${WAIT}"`]));
    const quoted = commitRecord(space, "the tests, for review");
    expect(quoted.code).not.toBe(0);
    expect(quoted.err).toContain("and the owner's message that holds it reads as no stop");
    space.write(PATH_OF, stoppedRecord(['stopped: "Stop here for now."']));
    const invented = commitRecord(space, "the tests, for review");
    expect(invented.code).not.toBe(0);
    expect(invented.err).toContain(
      `has the stopped line "Stop here for now.", which no message of the owner's holds`,
    );
  });

  it("commits the stop on the owner's words, resumes it open, and refuses those words spent on a second stop", () => {
    usePath();
    const space = opened();
    said(space, WAIT);
    said(space, STOP);
    space.write(PATH_OF, stoppedRecord([`stopped: "${STOP}"`]));
    const stopped = commitRecord(space, "stop for today");
    expect(stopped.code, stopped.err).toBe(0);
    expect(trailerOf(space)).toBe(ID);
    // The resume reads the stopped record as before: its first write sets it open.
    space.write(PATH_OF, record(["choice: accepted", "state: open", `stopped: "${STOP}"`]));
    const resumed = commitRecord(space, "resume");
    expect(resumed.code, resumed.err).toBe(0);
    // A wait in the resumed session set stopped again on the first stop's words (002/001 item_16).
    space.write(PATH_OF, stoppedRecord([`stopped: "${STOP}"`]));
    const again = commitRecord(space, "the rebuilt tests, for review");
    expect(again.code).not.toBe(0);
    expect(again.err).toContain(`stopped the change once already`);
    expect(again.err).toContain("owned-words, greenline's pre-commit hook");
  });

  it("admits the stop's commit carrying the folder's shown patch, a file of the folder (J-214 S1, j196t-states-stop-2d F2)", () => {
    usePath();
    const space = opened();
    said(space, WAIT);
    said(space, STOP);
    space.write(PATH_OF, stoppedRecord([`stopped: "${STOP}"`]));
    const patch = `.greenline/ledger/${ID}/shown.patch`;
    space.write(patch, "diff --git a/test/shelf.test.js b/test/shelf.test.js\n");
    space.git("add", "--", PATH_OF, patch);
    const stopped = space.git("commit", "--quiet", "-m", "stop for today");
    expect(stopped.code, stopped.err).toBe(0);
    expect(space.git("show", "--name-only", "--format=", "HEAD").out.trim().split("\n")).toEqual([
      PATH_OF,
      patch,
    ]);
  });

  it("holds the same stop at the harness hook, where git's hooks never run", () => {
    usePath();
    const space = opened();
    said(space, WAIT);
    space.write(PATH_OF, stoppedRecord());
    const commit = {
      hook_event_name: "PreToolUse",
      session_id: SESSION,
      tool_name: "Bash",
      tool_input: { command: `git add ${PATH_OF} && git commit -m "the tests, for review"` },
    };
    const refused = fire(space, commit);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(`${PATH_OF} carries no stopped line`);
    expect(refused.err).toContain("owned-words, greenline's harness hook");
    said(space, STOP);
    space.write(PATH_OF, stoppedRecord([`stopped: "${STOP}"`]));
    expect(fire(space, commit).code).toBe(0);
  });

  it("refuses a commit in a clone whose git configuration registers none of greenline's hooks, naming the sync, and admits it after the sync (002/001)", () => {
    usePath();
    const space = opened();
    remote(space);
    const clone = mkdtempSync(join(tmpdir(), "greenline-clone-"));
    cleanup.push(clone);
    rmSync(clone, { recursive: true });
    expect(spawnSync("git", ["clone", "--quiet", "-b", BRANCH, space.root, clone]).status).toBe(0);
    const there: Fixture = { ...space, root: clone };
    const commit = {
      hook_event_name: "PreToolUse",
      session_id: SESSION,
      tool_name: "Bash",
      tool_input: { command: 'git commit -am "resume the change"' },
    };
    const refused = fire(there, commit);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(HOOKS_NOT_INSTALLED_LINE);
    expect(refused.err).toContain("hooks-installed, greenline's harness hook");
    // A read and a write in the homes go on; the agent's sync waits for a turn of the owner's (J-224 S1).
    for (const command of ["git status", `cat ${PATH_OF}`])
      expect(fire(there, { ...commit, tool_input: { command } }).code, command).toBe(0);
    const sync = fire(there, { ...commit, tool_input: { command: "greenline sync" } });
    expect(sync.code).toBe(2);
    expect(sync.err).toContain("sync-on-word, greenline's harness hook");
    registerGitHooks(clone, HOOKS_ON);
    expect(fire(there, commit).code).toBe(0);
  });
});

describe("J-208 S1 the hooks read a committed record with the parser status reads it with (j196t-conduct-emptyc finding 1)", () => {
  const PATH_OF = `.greenline/ledger/${ID}.md`;
  /** The run's done record at cf51e27: the two picture helpers listed in its starts. */
  const HELPERS = 'starts: ["diagram-design 1", "diagram-design 2"]';
  const DONE = ["choice: accepted", "state: done", "next: none"];
  const NOT_A_STEP = `the change record '${ID}' does not parse: starts[0]: the start 'diagram-design 1' names 'diagram-design', which is not a step (.greenline/ledger/README.md); starts[1]: the start 'diagram-design 2' names 'diagram-design', which is not a step (.greenline/ledger/README.md)`;
  const definition = parseModes(
    readFileSync(join(import.meta.dirname, "../../corpus/runtime/modes.json"), "utf8"),
    "corpus/runtime/modes.json",
  );
  const LINE = definition._tag === "ok" ? definition.value : undefined;

  /** One event through greenline event with the modes definition the installation gives, as the shipped entry reads it. */
  function fireWithLine(space: Fixture, payload: ToolPayload): Ran {
    const writer = new RecordingWriter();
    const code = runEventCli(["--harness", "codex"], writer.writer, {
      cwd: space.root,
      stdin: () => JSON.stringify(payload),
      modes: () => ["quick", "regular", "careful"],
      line: () => LINE,
    });
    return { code, out: writer.out, err: writer.err };
  }

  function commitRecord(space: Fixture, text: string, message: string): Ran {
    space.write(PATH_OF, text);
    space.git("add", "--", PATH_OF);
    return space.git("commit", "--quiet", "-m", message);
  }

  it("refuses the done commit whose starts name the run's two helpers, in the parser's words, and takes it once the starts name none", () => {
    usePath();
    const space = opened();
    const refused = commitRecord(space, record([...DONE, HELPERS]), "close reviewed change");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(NOT_A_STEP);
    expect(refused.err).toContain(
      `correct ${PATH_OF} and commit again; record-form, greenline's pre-commit hook`,
    );
    // HEAD still holds the record open: status reads every committed record.
    expect(space.git("show", `HEAD:${PATH_OF}`).out).toContain("state: open");
    const taken = commitRecord(space, record([...DONE, "starts: []"]), "close reviewed change");
    expect(taken.code, taken.err).toBe(0);
  });

  it("refuses an open record status cannot read at any commit that stages it, and leaves a record the parser reads to the lint's doors", () => {
    usePath();
    const space = opened();
    const open = commitRecord(
      space,
      record(["choice: accepted", "state: open", HELPERS]),
      "the pictures",
    );
    expect(open.code).not.toBe(0);
    expect(open.err).toContain(NOT_A_STEP);
    // A record the parser reads and the lint faults is refused as before, by the lint's own line.
    const unanswered = record(DONE).replace(
      "## frame\n\nx\n",
      "## frame\n\n- Q1 [scope] Does it retry forever?\n  - proposed: no\n  - decided: owner\n",
    );
    const linted = commitRecord(space, unanswered, "close over an open question");
    expect(linted.code).not.toBe(0);
    expect(linted.err).toContain(
      `change ${ID} is not done while its record breaks its form: frame question Q1 holds no answer`,
    );
    expect(linted.err).not.toContain("does not parse");
  });

  it("holds the same record at the harness hook before a git commit, where git's hooks may never run", () => {
    usePath();
    const space = opened();
    space.write(PATH_OF, record([...DONE, HELPERS]));
    const commit: ToolPayload = {
      hook_event_name: "PreToolUse",
      session_id: "01a1bbfa-31ff-7520-8faf-c5f955df88aa",
      tool_name: "Bash",
      tool_input: {
        command: `/bin/zsh -lc "git add ${PATH_OF} && git commit -m 'close reviewed change'"`,
      },
    };
    const refused = fireWithLine(space, commit);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(NOT_A_STEP);
    expect(refused.err).toContain("record-form, greenline's harness hook");
    space.write(PATH_OF, record([...DONE, "starts: []"]));
    expect(fireWithLine(space, commit).code).toBe(0);
  });
});
