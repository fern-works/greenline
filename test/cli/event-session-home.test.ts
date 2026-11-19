/**
 * The session's facts the owner's words are read by, and the reply the
 * hooks read (J-199 S1; the register's row of 2026-11-05, "The keeper over
 * the oracle"), through `greenline event`'s and `greenline picture`'s entry
 * points on fixture repositories with real git, each case a run's:
 *
 * - j196c-conduct-runner: the owner's journal and the turn's words stand in
 *   the main checkout's sessions for every worktree of the repository, so
 *   `picture keep` in a worktree of the change's own finds the ask the
 *   owner gave; and a fresh agent's completion notice, which Claude Code
 *   hands the hooks as a turn's prompt, is never journaled as the owner's.
 * - j196c-conduct-empty finding 1: a reply with no address where its turn
 *   printed one, a decline included, is named at the next turn's mirror.
 * - j196t-wait-proceed-1: the first reply of a request `proceed` allows that
 *   names no mode is named at the next turn's mirror.
 * - j196t-wait-proceed-1b (J-206 S1): the turn's start says before that
 *   first reply that `proceed` lets the request go on and that the reply
 *   states the mode taken and its ground in one line before the first edit.
 * - j196t-wait-proceed-1c (J-213 S1): a session's and a turn's start on
 *   main name the branch cut before the install, `feature/overdue`, and,
 *   under `proceed: regular`, what a request for its files owes, before the
 *   agent searches for the file the request names.
 * - j196t-ground: git's local exclude file is written before the yes, while
 *   no change is open, so the worktree's directory is ignored before the
 *   worktree is made; every other write outside the homes stays held.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runPictureCli } from "../../src/shell/cli/picture.ts";
import { writeAddressFile } from "../../src/shell/inspect/address-file.ts";
import { ownerJournal, ownerWords } from "../../src/shell/owner-words.ts";
import { mainCheckout, sessionsHome } from "../../src/shell/git.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-08-readme-author-argument";
const RECORD = `.greenline/ledger/${ID}.md`;
const TREE = `.worktrees/${ID}`;
const SESSION = "6f3f4bb5-461f-4d8a-b5e2-61cf15ac60fa";
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

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-11-08T01:20:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

const ask = (where: Space, harness: string, session: string, prompt: string) =>
  fire(where, harness, { hook_event_name: "UserPromptSubmit", session_id: session, prompt });

const stop = (where: Space, harness: string, session: string, reply: string) =>
  fire(where, harness, {
    hook_event_name: "Stop",
    session_id: session,
    last_assistant_message: reply,
    stop_hook_active: false,
  });

const shell = (session: string, command: string): JsonValue => ({
  hook_event_name: "PreToolUse",
  session_id: session,
  tool_use_id: "s",
  tool_name: "Bash",
  tool_input: { command },
});

/** A workspace on main, its manifest committed, `proceed` as given. */
function workspace(proceed = "none"): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-session-home-"));
  cleanup.push(root);
  const space = checkoutAt(root);
  space.git("init", "--quiet", "-b", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [], proceed }),
  );
  space.write("README.md", "# shelf\n");
  space.write(".gitignore", ".greenline/tmp/\n.worktrees/\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  return space;
}

function recordText(): string {
  return [
    "---",
    "mode: regular",
    "choice: accepted",
    'yes: "Yes, go ahead, and pause after the build."',
    'why: "the README names the argument"',
    "state: open",
    "---",
    "",
    "## frame",
    "",
    "the argument",
    "",
  ].join("\n");
}

/** The main checkout and the change's worktree. */
interface Checkouts {
  readonly main: Space;
  readonly tree: Space;
}

/** The main checkout on main, and the change's worktree on its branch, its record committed there. */
function worktreeOfTheChange(): Checkouts {
  const main = workspace();
  main.git("worktree", "add", "--quiet", "-b", `greenline/${ID}`, TREE, "main");
  const tree = checkoutAt(join(main.root, TREE));
  tree.write(RECORD, recordText());
  tree.git("add", "--", RECORD);
  tree.git("commit", "--quiet", "-m", "open the change");
  return { main, tree };
}

/** The fresh agent's completion notice Claude Code handed the hooks as a turn's prompt (j196c-conduct-runner, the worktree's words file). */
const NOTICE = [
  "<task-notification>",
  "<task-id>a46a2c1ab0c312f81</task-id>",
  "<status>completed</status>",
  '<summary>Agent "Draw the loan states diagram" finished</summary>',
  '<result>I reworded the side note. It still ends "Stated as open, not decided here."</result>',
  "</task-notification>",
].join("\n");

const ASK = "Keep one of the loan's states too.";

describe("J-199 S1 the owner's journal in the main checkout's sessions, read from every worktree (j196c-conduct-runner)", () => {
  it("resolves a worktree's sessions home to the main checkout's", () => {
    const { main, tree } = worktreeOfTheChange();
    expect(mainCheckout(tree.root)).toBe(mainCheckout(main.root));
    expect(sessionsHome(tree.root)).toBe(sessionsHome(main.root));
    expect(sessionsHome(main.root)).toBe(
      join(mainCheckout(main.root), ".greenline", "tmp", "sessions"),
    );
  });

  for (const harness of ["claude-code", "codex"])
    it(`journals a prompt the session gave in a worktree into the main checkout's sessions, read alike from both, on ${harness}`, () => {
      const { main, tree } = worktreeOfTheChange();
      ask(main, harness, SESSION, "Keep a picture of that request path for me, please.");
      ask(tree, harness, SESSION, ASK);
      const file = `.greenline/tmp/sessions/${SESSION}.owner.jsonl`;
      expect(existsSync(join(main.root, file))).toBe(true);
      expect(existsSync(join(tree.root, file))).toBe(false);
      const both = {
        kept: true,
        messages: ["Keep a picture of that request path for me, please.", ASK],
      };
      expect(ownerJournal(tree.root, SESSION)).toEqual(both);
      expect(ownerJournal(main.root)).toEqual(both);
      // The turn's words are one session's too: the second turn's, read where either command runs.
      expect(ownerWords(tree.root, SESSION)).toEqual([ASK]);
      expect(ownerWords(main.root, SESSION)).toEqual([ASK]);
    });

  it("keeps the picture from the worktree on the ask the owner gave in the main checkout's session, where the keep refused twice", () => {
    const { main, tree } = worktreeOfTheChange();
    ask(main, "claude-code", SESSION, "How does a request go through this now, end to end?");
    ask(main, "claude-code", SESSION, ASK);
    // The fresh agent's notice reaches the hooks from the worktree, as in the run.
    ask(tree, "claude-code", SESSION, NOTICE);
    tree.write(`.greenline/tmp/${ID}/loan-states.svg`, "<svg></svg>\n");
    const writer = new RecordingWriter();
    const code = runPictureCli(
      [
        "keep",
        `.greenline/tmp/${ID}/loan-states.svg`,
        "--change",
        ID,
        "--ask",
        ASK,
        "--title",
        "The loan's states",
        "--form",
        "states",
        "--skill",
        "show-me",
        "--summary",
        "A loan's states from lent to returned, for the reader of the README.",
        "--files",
        "README.md",
      ],
      writer.writer,
      { cwd: tree.root, now: () => new Date("2026-11-08T01:29:00.000Z") },
    );
    expect(writer.err).not.toContain("a picture is kept only on the owner's ask");
    expect(code).toBe(0);
    expect(existsSync(join(tree.root, ".greenline", "visuals", ID, "loan-states.svg"))).toBe(true);
  });
});

describe("J-199 S1 a fresh agent's notice is never the owner's words (j196c-conduct-runner)", () => {
  it("journals nothing and notes no words for a turn whose prompt is the harness's notice, the turn still counted", () => {
    const space = workspace();
    ask(space, "claude-code", SESSION, "Keep a picture of that request path for me, please.");
    ask(space, "claude-code", SESSION, NOTICE);
    expect(ownerJournal(space.root, SESSION)).toEqual({
      kept: true,
      messages: ["Keep a picture of that request path for me, please."],
    });
    // The notice's turn holds no word of the owner's, the previous turn's words not carried into it.
    expect(ownerWords(space.root, SESSION)).toEqual([]);
    expect(
      readFileSync(join(sessionsHome(space.root), `${SESSION}.words.json`), "utf8"),
    ).not.toContain("task-notification");
  });

  it("journals the owner's own words a prompt holds beside a notice, the notice taken out", () => {
    const space = workspace();
    ask(space, "claude-code", SESSION, `${NOTICE}\n${ASK}`);
    expect(ownerJournal(space.root, SESSION)).toEqual({ kept: true, messages: [ASK] });
    expect(ownerWords(space.root, SESSION)).toEqual([ASK]);
  });
});

/** The decline the run's turn 018 ended on, its turn's View row printing the waiting page (j196c-conduct-empty). */
const DECLINE =
  "I didn't push, because this repository has no remote to push to. `git remote` lists nothing.\n\nWaiting on: a remote address, or your word to start review.";

describe("J-199 S1 the reply's address named at the next turn where its turn printed one (j196c-conduct-empty finding 1)", () => {
  /** A change open on its branch with the viewer serving, so the mirror's View row prints an address. */
  function serving(): Space {
    const space = workspace();
    space.git("checkout", "--quiet", "-b", `greenline/${ID}`);
    space.write(RECORD, recordText());
    space.git("add", "--", RECORD);
    space.git("commit", "--quiet", "-m", "open the change");
    writeAddressFile(space.root, 51270);
    return space;
  }

  for (const harness of ["claude-code", "codex"])
    it(`names a decline that carries no address its turn printed, at the next turn's mirror, on ${harness}`, () => {
      const space = serving();
      const first = ask(space, harness, SESSION, "Push it.");
      expect(first.out).toMatch(/\| View \| http:\/\/127\.0\.0\.1:51270\//);
      stop(space, harness, SESSION, DECLINE);
      const next = ask(space, harness, SESSION, "Force-push it then.");
      expect(next.out).toContain(
        "address: the reply at turn 1 named no address, where its turn printed http://127.0.0.1:51270/",
      );
      expect(next.out).toContain(
        "every reply carries the address its turn printed, a decline and a stop included",
      );
    });

  it("names nothing where the reply carries the viewer's address, or where its turn printed none", () => {
    const space = serving();
    ask(space, "claude-code", SESSION, "Push it.");
    stop(
      space,
      "claude-code",
      SESSION,
      `${DECLINE}\n\nhttp://127.0.0.1:51270/changes/${ID}/waiting`,
    );
    expect(ask(space, "claude-code", SESSION, "Go on.").out).not.toContain(" named no ");
    // No viewer serving: the turn's View row reads not serving, and no address is owed.
    const quiet = workspace();
    quiet.git("checkout", "--quiet", "-b", `greenline/${ID}`);
    quiet.write(RECORD, recordText());
    ask(quiet, "claude-code", SESSION, "Push it.");
    stop(quiet, "claude-code", SESSION, DECLINE);
    expect(ask(quiet, "claude-code", SESSION, "Go on.").out).not.toContain(" named no ");
  });
});

/** The first reply under proceed: regular, a branch question and no mode named (j196t-wait-proceed-1, thread 001 turn 001). */
const BRANCH_QUESTION =
  "The file is on `feature/overdue`, but the current branch is `main`. The existing function includes a loan exactly 14 days old, so the test would preserve that result.\n\nWaiting on: Should I make the change on `feature/overdue`?\n\nhttp://127.0.0.1:52177/";

const REQUEST =
  "In src/overdue.js, pull the date parsing into a small helper inside that file, keeping what overdue returns exactly the same, and add a test for a loan exactly 14 days old.";

describe("J-199 S1 the first reply's mode line under proceed named at the next turn (j196t-wait-proceed-1)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`names a first reply that states no mode where proceed lets the request go on, on ${harness}`, () => {
      const space = workspace("regular");
      ask(space, harness, SESSION, REQUEST);
      stop(space, harness, SESSION, BRANCH_QUESTION);
      const next = ask(space, harness, SESSION, "Yes, on feature/overdue.");
      expect(next.out).toContain(
        "mode line: the first reply at turn 1 named no mode, where proceed regular lets a request for a change go on",
      );
    });

  it("names nothing where the reply states the mode taken, where proceed is none, or after a notice's turn", () => {
    const stated = workspace("regular");
    ask(stated, "codex", SESSION, REQUEST);
    stop(
      stated,
      "codex",
      SESSION,
      `Regular, on a branch of its own from main.\n\n${BRANCH_QUESTION}`,
    );
    expect(ask(stated, "codex", SESSION, "Go on.").out).not.toContain(" named no ");
    const waits = workspace("none");
    ask(waits, "codex", SESSION, REQUEST);
    stop(waits, "codex", SESSION, BRANCH_QUESTION);
    expect(ask(waits, "codex", SESSION, "Go on.").out).not.toContain(" named no ");
    const notice = workspace("regular");
    ask(notice, "claude-code", SESSION, NOTICE);
    stop(notice, "claude-code", SESSION, "The drawing is done.");
    expect(ask(notice, "claude-code", SESSION, "Go on.").out).not.toContain(" named no ");
  });
});

/** The proceed line the turn's start prints before the reply, under `proceed: regular` (j196t-wait-proceed-1b, thread 001 turn 001). */
const PROCEED_LINE =
  "proceed: regular lets a request for a change go on; the first reply states the mode taken and its ground in one line before the first edit";

describe("J-206 S1 the proceed line at the turn's start, before the first reply (j196t-wait-proceed-1b)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`prints the line at the turn that opens on the owner's words with no change open, on ${harness}`, () => {
      const space = workspace("regular");
      const first = ask(space, harness, SESSION, REQUEST);
      expect(first.code).toBe(0);
      expect(first.out).toContain(PROCEED_LINE);
      // The lack the next turn names after a first reply with no mode holds beside it (J-199 S1).
      stop(space, harness, SESSION, BRANCH_QUESTION);
      const next = ask(space, harness, SESSION, "Your call.");
      expect(next.out).toContain(PROCEED_LINE);
      expect(next.out).toContain(
        "mode line: the first reply at turn 1 named no mode, where proceed regular lets a request for a change go on",
      );
    });

  it("prints none where proceed is none, where a change is open, or at a turn a notice opened", () => {
    const waits = workspace("none");
    expect(ask(waits, "codex", SESSION, REQUEST).out).not.toContain("proceed: ");
    const open = workspace("regular");
    open.git("checkout", "--quiet", "-b", `greenline/${ID}`);
    open.write(RECORD, recordText());
    expect(ask(open, "codex", SESSION, "Go on.").out).not.toContain("proceed: ");
    const notice = workspace("regular");
    expect(ask(notice, "claude-code", SESSION, NOTICE).out).not.toContain("proceed: ");
  });
});

describe("J-199 S1 git's local exclude file before the yes (j196t-ground)", () => {
  it("lets the exclude file name the worktree's directory while no change is open, by the shell and by the write tool, on Codex and Claude Code", () => {
    const space = workspace();
    const printf = fire(
      space,
      "codex",
      shell("g1", "printf '\\n/.worktrees/\\n' >> .git/info/exclude"),
    );
    expect(printf.err).toBe("");
    expect(printf.code).toBe(0);
    const written = fire(space, "claude-code", {
      hook_event_name: "PreToolUse",
      session_id: "g1",
      tool_use_id: "w",
      tool_name: "Write",
      tool_input: {
        file_path: join(space.root, ".git", "info", "exclude"),
        content: "/.worktrees/\n",
      },
    });
    expect(written.code).toBe(0);
  });

  it("holds every other write outside the homes, git's own configuration and the code alike", () => {
    const space = workspace();
    const config = fire(space, "codex", shell("g2", "echo '[core]' >> .git/config"));
    expect(config.code).toBe(2);
    expect(config.err).toContain("the write to .git/config waits");
    expect(fire(space, "codex", shell("g2", "echo x > src/a.js")).err).toContain(
      "the write to src/a.js waits",
    );
  });
});

/** The situation's line on the branch cut before the install, under `proceed: regular` (j196t-wait-proceed-1c, thread 001 turn 001, finding F1). */
const BEFORE_THE_PRACTICE =
  "branches before the practice: feature/overdue; a request for their files under proceed regular proposes the merge of main into the branch as the one yes, asks no direction first, and once it is done the owner starts a new session there";

/** The run's repository: `feature/overdue` and its `src/overdue.js` cut before the install, the manifest committed on main after it, `proceed` as given. */
function cutBeforeTheInstall(proceed: string): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-session-home-"));
  cleanup.push(root);
  const space = checkoutAt(root);
  space.git("init", "--quiet", "-b", "main");
  space.write("src/shelf.js", "export {};\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "the shelf");
  space.git("checkout", "--quiet", "-b", "feature/overdue");
  space.write("src/overdue.js", "export {};\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "the overdue list");
  space.git("checkout", "--quiet", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [], proceed }),
  );
  space.write(".gitignore", ".greenline/tmp/\n.worktrees/\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "configure the workspace");
  return space;
}

describe("J-213 S1 the branches before the practice at a session's and a turn's start (j196t-wait-proceed-1c)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`names feature/overdue and what a request for its files owes under proceed regular, at the session's and the turn's start, on ${harness}`, () => {
      const space = cutBeforeTheInstall("regular");
      const opened = fire(space, harness, {
        hook_event_name: "SessionStart",
        session_id: SESSION,
        source: "startup",
      });
      expect(opened.code).toBe(0);
      expect(opened.out).toContain(BEFORE_THE_PRACTICE);
      const turn = ask(space, harness, SESSION, REQUEST);
      expect(turn.code).toBe(0);
      expect(turn.out).toContain(BEFORE_THE_PRACTICE);
      // The proceed line of J-206 S1 holds beside it.
      expect(turn.out).toContain(PROCEED_LINE);
    });

  it("names the branch with no words under proceed none, and prints no line where every branch holds the manifest", () => {
    const waits = cutBeforeTheInstall("none");
    const turn = ask(waits, "codex", SESSION, REQUEST);
    expect(turn.out).toContain("branches before the practice: feature/overdue");
    expect(turn.out).not.toContain("a request for their files");
    const merged = cutBeforeTheInstall("regular");
    merged.git("checkout", "--quiet", "feature/overdue");
    merged.git("merge", "--quiet", "--no-edit", "main");
    merged.git("checkout", "--quiet", "main");
    expect(ask(merged, "claude-code", SESSION, REQUEST).out).not.toContain(
      "branches before the practice",
    );
  });
});
