/**
 * The picture decision's facts the turn's end reads (J-204 S1; the
 * register's rows of 2026-11-05, "The keeper over the oracle", and of
 * 2026-11-08, "One offer per change at the caps"), through `greenline
 * event`'s entry point on fixture repositories with real git, each case a
 * run's:
 *
 * - j196t-conduct-empty F4, j196t-linear F10, j196t-conduct-interface F6: a
 *   turn that changed code and whose reply drew no shape is named at the
 *   next turn's mirror, a notice and never a refusal; a turn that drew its
 *   shape, or changed only a test or a document, is named nothing.
 * - j196t-pictures-offer F3 and j196t-conduct-empty finding 1: the reply's
 *   offer of a kept picture, in its one line, is counted per change, the
 *   first kept, a second named, and an offer of a picture its change's
 *   home lost named as a remake, the owner's ask alone.
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
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-08-greeting-module";
const RECORD = `.greenline/ledger/${ID}.md`;
const SESSION = "01a1b87d-cf02-7683-b19d-f4c2be4f6102";
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

/** A workspace on a change's branch, its record open with the owner's yes and committed. */
function changeOpen(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-event-pictures-"));
  cleanup.push(root);
  const space: Space = {
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
  space.git("init", "--quiet", "-b", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [] }),
  );
  space.write("README.md", "# greeting\n");
  space.write(".gitignore", ".greenline/tmp/\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  space.git("checkout", "--quiet", "-b", `greenline/${ID}`);
  space.write(
    RECORD,
    [
      "---",
      "mode: quick",
      "choice: accepted",
      'yes: "Yes, build the greeting module and pause after the build."',
      'why: "a greeting module"',
      "state: open",
      "---",
      "",
      "## frame",
      "",
      "the greeting",
      "",
    ].join("\n"),
  );
  space.git("add", "--", RECORD);
  space.git("commit", "--quiet", "-m", "open the change");
  return space;
}

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-11-08T00:16:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

const ask = (where: Space, harness: string, prompt: string) =>
  fire(where, harness, { hook_event_name: "UserPromptSubmit", session_id: SESSION, prompt });

const stop = (where: Space, harness: string, reply: string) =>
  fire(where, harness, {
    hook_event_name: "Stop",
    session_id: SESSION,
    last_assistant_message: reply,
    stop_hook_active: false,
  });

/** The build turn's bare reply (j196t-conduct-empty, thread 001 turn 003). */
const BARE =
  "The greeting module and its passing test are committed, and the change is paused after the build.\n\nWaiting on: your instruction to resume the review.";

/** The same turn's reply with its resulting shape drawn, as the judge's smallest fix asks. */
const DRAWN = [
  "The greeting module and its passing test are committed.",
  "",
  "```text",
  "greet(name) ──► format ──► greeting",
  "```",
  "",
  "Waiting on: your instruction to resume the review.",
].join("\n");

/** The build: the module and its test, written during the turn. */
function build(space: Space): void {
  space.write("greeting.py", "def greet(name):\n    return f'Hello, {name}'\n");
  space.write("test_greeting.py", "from greeting import greet\n");
}

describe("J-204 S1 a turn that changed code and drew no shape, named at the next turn (j196t-conduct-empty F4)", () => {
  for (const harness of ["codex", "claude-code"])
    it(`names the build turn whose reply drew nothing, a notice and never a refusal, on ${harness}`, () => {
      const space = changeOpen();
      ask(space, harness, "Build the greeting module, then pause.");
      build(space);
      expect(stop(space, harness, BARE).code).toBe(0);
      const next = ask(space, harness, "Go on.");
      expect(next.code).toBe(0);
      expect(next.out).toContain(
        "picture: the turn changed 1 file and drew no shape; draw the resulting shape where one moved, in show-me's form for it",
      );
    });

  it("names nothing where the reply drew the shape, or where the turn changed only a test and a document", () => {
    const drawn = changeOpen();
    ask(drawn, "codex", "Build the greeting module, then pause.");
    build(drawn);
    stop(drawn, "codex", DRAWN);
    expect(ask(drawn, "codex", "Go on.").out).not.toContain("drew no shape");
    const docs = changeOpen();
    ask(docs, "codex", "Add a test and say it in the README.");
    docs.write("test_greeting.py", "from greeting import greet\n");
    docs.write("README.md", "# greeting\n\nRun the tests.\n");
    stop(docs, "codex", BARE);
    expect(ask(docs, "codex", "Go on.").out).not.toContain("drew no shape");
  });

  it("counts code the turn committed, and never code changed before the turn began", () => {
    const space = changeOpen();
    space.write("before.py", "x = 1\n");
    ask(space, "claude-code", "Build the greeting module and commit it.");
    build(space);
    space.git("add", "greeting.py", "test_greeting.py");
    space.git("commit", "--quiet", "-m", "feat(greeting): the module");
    stop(space, "claude-code", BARE);
    expect(ask(space, "claude-code", "Go on.").out).toContain("the turn changed 1 file");
  });
});

describe("J-227 S1 the turn's end reads every worktree (j201t-linear-visuals finding 4)", () => {
  /** The session in the main checkout, and the linked worktree its change's code is written in. */
  interface InWorktree {
    readonly space: Space;
    readonly tree: string;
  }

  /** The session in the main checkout, the change's code in a linked worktree under .worktrees/<id>, as the run kept it. */
  function inWorktree(): InWorktree {
    const space = changeOpen();
    space.write(".gitignore", ".greenline/tmp/\n.worktrees/\n");
    space.git("add", ".gitignore");
    space.git("commit", "--quiet", "-m", "ignore the worktrees");
    space.git("checkout", "--quiet", "main");
    space.git("worktree", "add", "--quiet", `.worktrees/${ID}`, `greenline/${ID}`);
    return { space, tree: join(space.root, ".worktrees", ID) };
  }

  const inTree = (tree: string, ...args: string[]): void => {
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: tree,
      stdio: "ignore",
    });
  };

  for (const harness of ["codex", "claude-code"])
    it(`names a turn that committed code in the worktree and drew nothing, at the next mirror, on ${harness}`, () => {
      const { space, tree } = inWorktree();
      ask(space, harness, "Add the overdue filter, on a worktree of its own.");
      writeFileSync(join(tree, "greeting.py"), "def greet(name):\n    return name\n");
      writeFileSync(join(tree, "filter.py"), "def overdue(loans):\n    return loans\n");
      inTree(tree, "add", "greeting.py", "filter.py");
      inTree(tree, "commit", "--quiet", "-m", "feat(loans): the overdue filter");
      expect(stop(space, harness, BARE).code).toBe(0);
      expect(ask(space, harness, "Go on.").out).toContain(
        "picture: the turn changed 2 files and drew no shape",
      );
    });

  it("names code a worktree changed and left uncommitted, and nothing for a worktree whose head did not move and whose tree is clean", () => {
    const { space, tree } = inWorktree();
    ask(space, "codex", "Add the overdue filter.");
    writeFileSync(join(tree, "filter.py"), "def overdue(loans):\n    return loans\n");
    stop(space, "codex", BARE);
    expect(ask(space, "codex", "Go on.").out).toContain(
      "the turn changed 1 file and drew no shape",
    );
    const clean = inWorktree();
    ask(clean.space, "codex", "What does the filter do?");
    stop(clean.space, "codex", BARE);
    expect(ask(clean.space, "codex", "Go on.").out).not.toContain("drew no shape");
  });
});

/** The one offer line, as the block states its form. */
const OFFER = [
  "The request path passes eighteen nodes, so the reply draws the part that decides.",
  "",
  "```text",
  "lend ──► store ──► loans",
  "```",
  "",
  "Picture offered: the whole request path, a sequence of eighteen nodes, branded SVG; say keep",
  "",
  "Waiting on: your review.",
].join("\n");

describe("J-204 S1 one offer of a kept picture per change, counted by the turn's end (the register's row of 2026-11-08)", () => {
  it("keeps the change's first offer, and names a second one at the next turn", () => {
    const space = changeOpen();
    ask(space, "claude-code", "Build it.");
    stop(space, "claude-code", OFFER);
    const second = ask(space, "claude-code", "Go on.");
    expect(second.out).not.toContain("offer:");
    stop(space, "claude-code", OFFER);
    expect(ask(space, "claude-code", "Go on.").out).toContain(
      "offer: a second picture offer in this change at turn 2; a change offers a kept picture once, where the shape passes twelve nodes or 72 columns",
    );
  });

  it("names an offer that remakes a picture the change's home lost, the owner's ask alone (j196t-pictures-offer F3)", () => {
    const space = changeOpen();
    space.write(
      `.greenline/ledger/${ID}/visuals.json`,
      `${JSON.stringify(
        {
          generatedBy: "greenline event",
          change: ID,
          visuals: [
            {
              id: `${ID}/shelf-methods`,
              title: "Shelf methods",
              file: `.greenline/visuals/${ID}/shelf-methods.html`,
              manifest: `.greenline/visuals/${ID}/shelf-methods.visual.json`,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    space.git("add", ".");
    space.git("commit", "--quiet", "-m", "the change's links");
    ask(space, "codex", "Add findByYear.");
    stop(
      space,
      "codex",
      "findByYear is added.\n\nPicture offered: the shelf methods again, a call tree, branded SVG; say keep\n\nWaiting on: your review.",
    );
    expect(ask(space, "codex", "Go on.").out).toContain(
      `offer: the offer at turn 1 remakes ${ID}/shelf-methods, which status names deleted; a lost picture's remake is the owner's ask alone, never offered`,
    );
  });
});
