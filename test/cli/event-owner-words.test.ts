/**
 * The owner's words the hooks journal (J-176 S1; the register's rows of
 * 2026-11-05, "The keeper over the oracle" and "The record's lines are the
 * agent's"), through `greenline event`'s entry point on a fixture
 * repository with real git: every prompt and card answer is journaled for
 * the session; no hook writes a line of the record; an accepted record's
 * `yes` line holds the work outside the homes until one of the owner's
 * journaled messages holds its words as a yes; a turn's end holds nothing,
 * since the reply carries no facts table and no offer; and a web fetch at
 * frame goes on, an inline read the fifth cut allows.
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
import { ownerJournal } from "../../src/shell/owner-words.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-10-29-overdue";
const RECORD = `.greenline/ledger/${ID}.md`;
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

/** A checkout of a repository at the root given, its own files and its own git. */
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
    now: () => new Date("2026-10-29T12:00:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

const stop = (session: string, reply: string, active = false): JsonValue => ({
  hook_event_name: "Stop",
  session_id: session,
  last_assistant_message: reply,
  stop_hook_active: active,
});

/** A write of code outside the homes, before the tool runs. */
const code = (session: string): JsonValue => ({
  hook_event_name: "PreToolUse",
  session_id: session,
  tool_use_id: "c",
  tool_name: "Write",
  tool_input: { file_path: "src/letters.ts", content: "export {};\n" },
});

/** A repository whose branch holds no record yet, or, with `main`, the default branch alone with no remote. */
function bare(branch: "change" | "main"): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-facts-"));
  cleanup.push(root);
  const space = checkoutAt(root);
  const { git, write } = space;
  git("init", "--quiet", "-b", "main");
  write(
    ".greenline/manifest.json",
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [] }),
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  if (branch === "change") git("checkout", "--quiet", "-b", `greenline/${ID}`);
  return space;
}

/** A turn's start with the owner's words. */
function ask(where: Space, harness: string, session: string, prompt: string) {
  return fire(where, harness, { hook_event_name: "UserPromptSubmit", session_id: session, prompt });
}

/** A write of the record through the harness's write tool, its before and after events around it. */
function writeRecord(where: Space, harness: string, session: string, text: string) {
  const tool =
    harness === "codex"
      ? {
          tool_name: "apply_patch",
          tool_input: { command: `*** Begin Patch\n*** Update File: ${RECORD}\n*** End Patch` },
        }
      : { tool_name: "Write", tool_input: { file_path: join(where.root, RECORD), content: text } };
  fire(where, harness, {
    hook_event_name: "PreToolUse",
    session_id: session,
    tool_use_id: "w",
    ...tool,
  });
  where.write(RECORD, text);
  return fire(where, harness, {
    hook_event_name: "PostToolUse",
    session_id: session,
    tool_use_id: "w",
    ...tool,
  });
}

/** A record of the change with the lines given in its front matter. */
function record(lines: readonly string[], body = "## frame\n\nthe letters\n"): string {
  return ["---", "mode: quick", 'why: "the overdue letters"', ...lines, "---", "", body].join("\n");
}

describe("J-176 S1 the owner's journal and the yes the record quotes", () => {
  for (const harness of ["claude-code", "codex"])
    it(`journals each prompt for the session, oldest first, on ${harness}`, () => {
      const here = bare("change");
      ask(here, harness, "j1", "Add the overdue letters.");
      ask(here, harness, "j1", "Yes, go ahead.");
      expect(ownerJournal(here.root, "j1")).toEqual({
        kept: true,
        messages: ["Add the overdue letters.", "Yes, go ahead."],
      });
      expect(ownerJournal(here.root, "other")).toEqual({ kept: false });
    });

  for (const harness of ["claude-code", "codex"])
    it(`writes no line of the record, the yes and the agent left as the agent wrote them, on ${harness}`, () => {
      const here = bare("change");
      ask(here, harness, "w1", "Yes, go ahead.");
      const written = record(["choice: accepted", "state: open"]);
      writeRecord(here, harness, "w1", written);
      expect(readFileSync(join(here.root, RECORD), "utf8")).toBe(written);
    });

  it("lets the work go on once the yes line quotes the owner's journaled yes", () => {
    const here = bare("change");
    ask(here, "claude-code", "y1", "Add the overdue letters.");
    ask(here, "claude-code", "y1", "Yes, go ahead.");
    here.write(RECORD, record(["choice: accepted", 'yes: "Yes, go ahead."', "state: open"]));
    expect(fire(here, "claude-code", code("y1")).code).toBe(0);
  });

  it("holds the work while the yes line quotes words the owner never said, or a message that reads as no yes", () => {
    const here = bare("change");
    ask(here, "claude-code", "n1", "Add the overdue letters.");
    ask(here, "claude-code", "n1", "just write the code now and commit what you have");
    here.write(RECORD, record(["choice: accepted", 'yes: "Yes, go ahead."', "state: open"]));
    const unsaid = fire(here, "claude-code", code("n1"));
    expect(unsaid.code).toBe(2);
    expect(unsaid.err).toContain(
      `the yes line quotes "Yes, go ahead.", which no message of the owner's holds: quote their words as they said them, or ask for their yes; owner-yes, greenline's harness hook`,
    );
    here.write(
      RECORD,
      record([
        "choice: accepted",
        'yes: "just write the code now and commit what you have"',
        "state: open",
      ]),
    );
    const noYes = fire(here, "claude-code", code("n1"));
    expect(noYes.code).toBe(2);
    expect(noYes.err).toContain("reads as no yes");
    here.write(RECORD, record(["choice: accepted", "state: open"]));
    expect(fire(here, "claude-code", code("n1")).err).toContain(
      "the record says choice: accepted with no yes line",
    );
  });

  it("reads a yes line where no hook journaled the owner's words, since nothing can be read against it", () => {
    const here = bare("change");
    here.write(RECORD, record(["choice: accepted", 'yes: "Yes, go ahead."', "state: open"]));
    expect(fire(here, "claude-code", code("z1")).code).toBe(0);
  });

  it("holds no turn's end, whatever the reply carries, and writes nothing under the visual home", () => {
    const here = bare("change");
    ask(here, "claude-code", "h1", "Draw the loan's states.");
    here.write(RECORD, record(["choice: owner", "state: open"]));
    const drawn = ["The loan moves through three states.", "", "```", "┌─┐ ┌─┐", "└─┘ └─┘", "```"];
    const ended = fire(here, "claude-code", stop("h1", drawn.join("\n")));
    expect(ended.code).toBe(0);
    expect(ended.err).toBe("");
    expect(existsSync(join(here.root, ".greenline", "visuals"))).toBe(false);
  });
});

describe("J-186 S1 the owner's yes settled once the record that quotes it is committed", () => {
  const ACCEPTED = ["choice: accepted", 'yes: "Yes, go ahead."', "state: open"];
  const RESUME = "Carry on with the letters; the last session stopped after the first commit.";

  /** The change's branch with its record committed, the yes said in an earlier session of this checkout. */
  function committedYes(): Space {
    const here = bare("change");
    ask(here, "claude-code", "earlier", "Add the overdue letters.");
    ask(here, "claude-code", "earlier", "Yes, go ahead.");
    here.write(RECORD, record(ACCEPTED));
    here.git("add", "--", RECORD);
    here.git("commit", "--quiet", "-m", "open the change");
    return here;
  }

  for (const harness of ["claude-code", "codex"])
    it(`lets a fresh session write without a second yes once HEAD's commit carries the record with it, on ${harness}`, () => {
      const here = committedYes();
      ask(here, harness, "fresh", RESUME);
      const write = harness === "codex" ? patch("fresh", "src/letters.ts") : code("fresh");
      const resumed = fire(here, harness, write);
      expect(resumed.err).toBe("");
      expect(resumed.code).toBe(0);
    });

  it("lets a clone write, its earlier journal absent and a fresh session's holding only the resume (j179c-conduct-runner)", () => {
    const here = committedYes();
    const root = mkdtempSync(join(tmpdir(), "greenline-clone-"));
    cleanup.push(root);
    execFileSync("git", ["clone", "--quiet", "--branch", `greenline/${ID}`, here.root, root]);
    const clone = checkoutAt(root);
    ask(clone, "claude-code", "cloned", RESUME);
    const resumed = fire(clone, "claude-code", code("cloned"));
    expect(resumed.err).toBe("");
    expect(resumed.code).toBe(0);
  });

  it("lets a session in a linked worktree write, the yes committed on the change's branch it checks out (j179c-conduct-interface)", () => {
    const here = committedYes();
    here.git("checkout", "--quiet", "main");
    here.git("worktree", "add", "--quiet", `.worktrees/${ID}`, `greenline/${ID}`);
    const tree = checkoutAt(join(here.root, ".worktrees", ID));
    ask(tree, "claude-code", "in-tree", RESUME);
    const resumed = fire(tree, "claude-code", code("in-tree"));
    expect(resumed.err).toBe("");
    expect(resumed.code).toBe(0);
  });

  it("holds an uncommitted yes against every session's journal of the checkout, never one session's", () => {
    const here = bare("change");
    ask(here, "claude-code", "said", "Yes, go ahead.");
    here.write(RECORD, record(ACCEPTED));
    ask(here, "claude-code", "other", RESUME);
    expect(fire(here, "claude-code", code("other")).code).toBe(0);
    // A yes no session of the checkout holds still waits.
    here.write(RECORD, record(["choice: accepted", 'yes: "Ship it tonight."', "state: open"]));
    const unsaid = fire(here, "claude-code", code("other"));
    expect(unsaid.code).toBe(2);
    expect(unsaid.err).toContain(`the yes line quotes "Ship it tonight.", which no message`);
  });

  it("holds a yes line changed after the commit against the journal again", () => {
    const here = committedYes();
    ask(here, "claude-code", "fresh", RESUME);
    here.write(RECORD, record(["choice: accepted", 'yes: "Ship it tonight."', "state: open"]));
    const changed = fire(here, "claude-code", code("fresh"));
    expect(changed.code).toBe(2);
    expect(changed.err).toContain(`the yes line quotes "Ship it tonight.", which no message`);
  });
});

describe("J-186 S1 a write in a linked worktree held against the worktree's own branch and record", () => {
  const TREE = `.worktrees/${ID}`;
  const APPEND = "cat >> src/letters.ts <<'EOF'\nexport const late = true;\nEOF";

  /** The main checkout on main, no change open there, and the change's worktree on its branch, its yes committed. */
  function worktreeOfTheChange(): Space {
    const here = bare("main");
    here.git("checkout", "--quiet", "-b", `greenline/${ID}`);
    here.write(RECORD, record(["choice: accepted", 'yes: "Yes, go ahead."', "state: open"]));
    here.git("add", "--", RECORD);
    here.git("commit", "--quiet", "-m", "open the change");
    here.git("checkout", "--quiet", "main");
    here.git("worktree", "add", "--quiet", TREE, `greenline/${ID}`);
    return here;
  }

  it("judges a write tool's path and a command that names the worktree in its words there, from the main checkout's session", () => {
    const here = worktreeOfTheChange();
    const written = fire(here, "claude-code", {
      hook_event_name: "PreToolUse",
      session_id: "m1",
      tool_use_id: "w",
      tool_name: "Write",
      tool_input: { file_path: join(here.root, TREE, "src", "letters.ts"), content: "x" },
    });
    expect(written.err).toBe("");
    expect(written.code).toBe(0);
    for (const command of [`cd ${TREE} && ${APPEND}`, `echo x > ${TREE}/src/letters.ts`])
      expect(fire(here, "codex", shell("m1", command))).toMatchObject({ code: 0, err: "" });
    // A session whose directory is the worktree is judged there too.
    const inTree = fire(here, "codex", {
      hook_event_name: "PreToolUse",
      session_id: "m1",
      tool_use_id: "s",
      tool_name: "Bash",
      tool_input: { command: APPEND },
      cwd: join(here.root, TREE),
    });
    expect(inTree).toMatchObject({ code: 0, err: "" });
  });

  it("names the worktree and the words that judge it there when the harness gives the hook no directory for a command (j109t-conduct-interfaced)", () => {
    const here = worktreeOfTheChange();
    const refused = fire(here, "codex", shell("m1", APPEND));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("the write to src/letters.ts waits");
    expect(refused.err).toContain(
      `the hook was given no directory for the command, so its paths are read from the session's; change ${ID} is open in the worktree ${TREE}: name it in the command's own words, \`cd ${TREE} && <command>\`, and the write is judged there`,
    );
    expect(refused.err).toContain("no-open-change, greenline's harness hook");
  });

  it("names no worktree for a copy left there of a record the main checkout holds done (J-228 S1, j201t-linear-visuals F14)", () => {
    const here = worktreeOfTheChange();
    here.write(RECORD, record(["choice: accepted", 'yes: "Yes, go ahead."', "state: done"]));
    here.git("add", "--", RECORD);
    here.git("commit", "--quiet", "-m", "close the change on main");
    const refused = fire(here, "codex", shell("m1", APPEND));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("the write to src/letters.ts waits");
    expect(refused.err).not.toContain("the hook was given no directory");
    expect(refused.err).not.toContain(`cd ${TREE}`);
  });
});

describe("J-188 S1 a git act naming a branch a linked worktree holds, judged in that worktree whatever directory the hook was given", () => {
  const PICTURE = "2026-11-07-author-search-picture";
  const AUTHOR = "2026-11-07-author-case";
  const TREE = `.worktrees/${AUTHOR}`;
  const AUTHOR_RECORD = `.greenline/ledger/${AUTHOR}.md`;
  const PICTURE_RECORD = `.greenline/ledger/${PICTURE}.md`;
  const opened = (more: readonly string[]): string =>
    record(["choice: accepted", 'yes: "Yes, go ahead."', "state: open", ...more]);

  /**
   * The run's ground (j109t-conduct-runnerd 002/005): the main checkout on the picture change's
   * branch, its landing words spent on a forced push, and the author change's worktree on its own
   * branch, its record committed with the lines given; every owner's word said in the session m1.
   */
  function twoChanges(author: readonly string[]): Space {
    const here = bare("main");
    const origin = mkdtempSync(join(tmpdir(), "greenline-origin-"));
    cleanup.push(origin);
    execFileSync("git", ["init", "--quiet", "--bare", origin]);
    here.git("remote", "add", "origin", origin);
    for (const said of ["Yes, go ahead.", "Force-push the branch.", "Push the branch."])
      ask(here, "codex", "m1", said);
    here.git("worktree", "add", "--quiet", "-b", `greenline/${AUTHOR}`, TREE, "main");
    const tree = checkoutAt(join(here.root, TREE));
    tree.write(AUTHOR_RECORD, opened(author));
    tree.git("add", "--", AUTHOR_RECORD);
    tree.git("commit", "--quiet", "-m", "open the author change");
    here.git("checkout", "--quiet", "-b", `greenline/${PICTURE}`);
    here.write(PICTURE_RECORD, opened(['landing: "Force-push the branch."']));
    here.git("add", "--", PICTURE_RECORD);
    here.git("commit", "--quiet", "-m", "open the picture change");
    const spent = fire(
      here,
      "codex",
      shell("m1", `git push --force-with-lease origin greenline/${PICTURE}`),
    );
    expect(spent).toMatchObject({ code: 0, err: "" });
    return here;
  }

  /** The lifts the guardrails noted, each by its change and what it lifted. */
  const lifts = (here: Space): readonly string[] =>
    readFileSync(join(here.root, ".git", "greenline", "lifts.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const lift: { change: string; act: string; words: string } = JSON.parse(line);
        return `${lift.change} ${lift.act} "${lift.words}"`;
      });

  it("lets the push of the worktree's branch go on under that worktree's committed landing line, never citing the main checkout's change (j109t-conduct-runnerd)", () => {
    const here = twoChanges(['landing: "Push the branch."']);
    const pushed = fire(here, "codex", shell("m1", `git push -u origin greenline/${AUTHOR}`));
    expect(pushed.err).toBe("");
    expect(pushed.code).toBe(0);
    expect(lifts(here)).toEqual([
      `${PICTURE} force-push "Force-push the branch."`,
      `${AUTHOR} landing "Push the branch."`,
    ]);
  });

  it("refuses a forced push and a forced delete of the worktree's branch by that worktree's record, and lifts them by its words", () => {
    const here = twoChanges([]);
    const forced = fire(
      here,
      "codex",
      shell("m1", `git push --force-with-lease origin greenline/${AUTHOR}`),
    );
    expect(forced.code).toBe(2);
    expect(forced.err).toContain(`${AUTHOR_RECORD} holds no landing line`);
    expect(forced.err).toContain("force-push-words, greenline's harness hook");
    const deleted = fire(here, "codex", shell("m1", `git branch -D greenline/${AUTHOR}`));
    expect(deleted.code).toBe(2);
    expect(deleted.err).toContain(`${AUTHOR_RECORD} holds no discard or landing lines`);
    // The change's own plain push needs no line here; git's pre-push hook in the worktree holds it.
    const plain = fire(here, "codex", shell("m1", `git push -u origin greenline/${AUTHOR}`));
    expect(plain).toMatchObject({ code: 0, err: "" });
    for (const refused of [forced.err, deleted.err]) expect(refused).not.toContain(PICTURE);
    // The owner's words committed in the worktree's record lift the forced push there.
    const tree = checkoutAt(join(here.root, TREE));
    tree.write(AUTHOR_RECORD, opened(['landing: "Force-push the branch."']));
    tree.git("commit", "--quiet", "-m", "record the owner's words", "--", AUTHOR_RECORD);
    expect(
      fire(here, "codex", shell("m1", `git push --force-with-lease origin greenline/${AUTHOR}`)),
    ).toMatchObject({ code: 0, err: "" });
    expect(lifts(here)).toContain(`${AUTHOR} force-push "Force-push the branch."`);
  });

  it("holds a write on a greenline branch whose name holds no id though its record stands open, naming the rename", () => {
    const here = bare("main");
    here.git("checkout", "--quiet", "-b", "greenline/author-case");
    here.write(AUTHOR_RECORD, opened([]));
    const held = fire(here, "claude-code", code("w1"));
    expect(held.code).toBe(2);
    expect(held.err).toContain(
      `no change is open on greenline/author-case, whose name holds no change's id: a change's branch is greenline/<id>`,
    );
    expect(held.err).toContain(`\`git branch -m greenline/author-case greenline/${AUTHOR}\``);
    here.git("branch", "-m", "greenline/author-case", `greenline/${AUTHOR}`);
    expect(fire(here, "claude-code", code("w1"))).toMatchObject({ code: 0, err: "" });
  });

  it("places a command naming no branch a worktree holds as before, its own branch's push and another branch's alike", () => {
    const here = twoChanges(['landing: "Push the branch."']);
    // The main checkout's own branch, and a source other than the worktree's branch pushed to it, stay the session's.
    const own = fire(here, "codex", shell("m1", `git push --force origin greenline/${PICTURE}`));
    expect(own.code).toBe(2);
    expect(own.err).toContain(`"Force-push the branch.", were spent on`);
    const onto = fire(here, "codex", shell("m1", `git push origin HEAD:greenline/${AUTHOR}`));
    expect(onto.code).toBe(2);
    expect(onto.err).toContain(`the landing line of ${PICTURE_RECORD}`);
    expect(onto.err).toContain("push-elsewhere-words");
  });
});

describe("J-176 S1 an inline web read at frame, the fifth cut", () => {
  const AT_FRAME = [
    "choice: accepted",
    'yes: "Yes."',
    "state: open",
    'next: "frame: the owner\'s answers"',
  ];

  /** A before-tool event: Claude Code's WebFetch, or a shell command. */
  const tool = (command: string | null): JsonValue => ({
    hook_event_name: "PreToolUse",
    session_id: "r1",
    tool_use_id: "f",
    ...(command === null
      ? { tool_name: "WebFetch", tool_input: { url: "https://example.com/rates" } }
      : { tool_name: "Bash", tool_input: { command } }),
  });

  it("lets a web fetch go at frame with no research topic, on both harnesses, and with no change open", () => {
    const here = bare("change");
    here.write(RECORD, record(AT_FRAME));
    const fetched = fire(here, "claude-code", tool(null));
    expect(fetched.code).toBe(0);
    expect(fetched.err).not.toContain("research topic");
    expect(
      fire(here, "codex", tool(`/bin/zsh -lc 'curl -s https://api.example.com/rates'`)).code,
    ).toBe(0);
    expect(fire(bare("main"), "claude-code", tool(null)).code).toBe(0);
  });
});

/** A shell command on Codex, before the tool runs. */
const shell = (session: string, command: string): JsonValue => ({
  hook_event_name: "PreToolUse",
  session_id: session,
  tool_use_id: "s",
  tool_name: "Bash",
  tool_input: { command },
});

/** A patch on Codex that adds a file, before the tool runs. */
const patch = (session: string, path: string): JsonValue => ({
  hook_event_name: "PreToolUse",
  session_id: session,
  tool_use_id: "p",
  tool_name: "apply_patch",
  tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+hello\n*** End Patch` },
});

describe("J-176 S1 every door reads one table: a shell command's written file is a write", () => {
  it("refuses a redirect into the code with no change open in the same words as the patch (the upgrade trial j109t-upgrade)", () => {
    const here = bare("main");
    const patched = fire(here, "codex", patch("u1", "src/note.txt"));
    expect(patched.code).toBe(2);
    const redirected = fire(here, "codex", shell("u1", "echo hello > src/note.txt"));
    expect(redirected.code).toBe(2);
    expect(redirected.err).toBe(patched.err);
    // A copy, a tee and a write nested under sh -c are writes too; a redirect out of the workspace is not the door's.
    expect(fire(here, "codex", shell("u1", "cp README.md src/copy.md")).err).toContain(
      "the write to src/copy.md waits",
    );
    expect(fire(here, "codex", shell("u1", "sh -c 'echo x | tee src/t.txt'")).code).toBe(2);
    expect(fire(here, "codex", shell("u1", "ls src 2>/dev/null > /tmp/listing.txt")).code).toBe(0);
    expect(fire(here, "codex", shell("u1", "echo x > .greenline/tmp/scratch.txt")).code).toBe(0);
  });

  it("holds a redirect before the owner's yes as it holds the write tool", () => {
    const here = bare("change");
    here.write(RECORD, record(["state: open"]));
    const written = fire(here, "codex", patch("u2", "src/letters.ts"));
    expect(written.code).toBe(2);
    const redirected = fire(here, "codex", shell("u2", "echo 'export {};' > src/letters.ts"));
    expect(redirected.code).toBe(2);
    expect(redirected.err).toBe(written.err);
  });

  it("refuses a write into the visual home, by the write tool or by a copy, naming the one door", () => {
    const here = bare("change");
    here.write(RECORD, record(["state: open"]));
    const target = `.greenline/visuals/${ID}/states.svg`;
    const byTool = fire(here, "claude-code", {
      hook_event_name: "PreToolUse",
      session_id: "v1",
      tool_use_id: "v",
      tool_name: "Write",
      tool_input: { file_path: join(here.root, target), content: "<svg/>" },
    });
    expect(byTool.code).toBe(2);
    expect(byTool.err).toContain("which greenline picture keep alone writes");
    expect(byTool.err).toContain("visuals-by-hand");
    const byCopy = fire(here, "codex", shell("v1", `cp .greenline/tmp/${ID}/states.svg ${target}`));
    expect(byCopy.code).toBe(2);
    expect(byCopy.err).toContain("visuals-by-hand");
  });
});

describe("J-176 S1 each helper's start as fresh or forked, a hint beside the agents line", () => {
  const spawn = (id: string, args: { readonly message: string; readonly fork_turns?: string }) =>
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "spawn_agent",
        arguments: JSON.stringify(args),
        call_id: id,
      },
    });

  it("reads Codex's rollout at the turn's end and prints the helpers line at the next turn, once each", () => {
    const here = bare("change");
    here.write(RECORD, record(["choice: owner", "state: open"]));
    here.write(
      ".greenline/tmp/rollout.jsonl",
      [
        spawn("call_a", { message: "review", fork_turns: "none" }),
        spawn("call_b", { message: "verify" }),
        "",
      ].join("\n"),
    );
    ask(here, "codex", "r1", "Review it.");
    const end = {
      hook_event_name: "Stop",
      session_id: "r1",
      transcript_path: join(here.root, ".greenline/tmp/rollout.jsonl"),
    };
    expect(fire(here, "codex", end).code).toBe(0);
    // A second turn's end over the same rollout logs no start twice.
    fire(here, "codex", end);
    const next = ask(here, "codex", "r1", "Go on.");
    expect(next.out).toContain(
      "helpers: 2 started, 1 fresh and 1 forked from the builder, as the hooks saw them; the agents line is yours to write",
    );
  });

  it("logs Claude Code's agent tool as forked where it forks the builder", () => {
    const here = bare("change");
    here.write(RECORD, record(["choice: owner", "state: open"]));
    ask(here, "claude-code", "c1", "Review it.");
    fire(here, "claude-code", {
      hook_event_name: "PreToolUse",
      session_id: "c1",
      tool_use_id: "agent-1",
      tool_name: "Agent",
      tool_input: { prompt: "Review the change.", subagent_type: "fork" },
    });
    expect(ask(here, "claude-code", "c1", "Go on.").out).toContain(
      "helpers: 1 started, 1 forked from the builder",
    );
  });
});

describe("J-193 S1 a worktree the harness's own tool made, on the branch it named, is the change's ground once the record's ground line names it", () => {
  const CASE = "2026-11-07-find-by-author-ignore-case";
  const PIN = "2026-11-07-pin-exact-author-match";
  const TREE = ".claude/worktrees/find-by-author-ignore-case";
  const BRANCH = "worktree-find-by-author-ignore-case";
  const LANDING = "Yes, land it: push the branch and open the pull request.";
  const closed = (ground: string, more: readonly string[]): string =>
    record([
      "choice: accepted",
      'yes: "Yes, go ahead."',
      "state: done",
      `ground: "${ground}"`,
      ...more,
    ]);

  /** The main checkout and the harness's worktree of it. */
  interface Landed {
    readonly here: Space;
    readonly tree: Space;
  }

  /**
   * The run's ground (j179c-conduct-runnerb 002/005): the main checkout on main with a remote, and
   * the worktree the harness's tool made under .claude/worktrees on the branch it named, where two
   * changes closed done, the second with the owner's landing words committed last; every owner's
   * word said in the session l1.
   */
  function landed(ground: string): Landed {
    const here = bare("main");
    const origin = mkdtempSync(join(tmpdir(), "greenline-origin-"));
    cleanup.push(origin);
    execFileSync("git", ["init", "--quiet", "--bare", origin]);
    here.git("remote", "add", "origin", origin);
    here.git("push", "--quiet", "origin", "main");
    here.git("remote", "set-head", "origin", "main");
    for (const said of ["Yes, go ahead.", "Leave the branch as it is for now.", LANDING])
      ask(here, "claude-code", "l1", said);
    here.git("worktree", "add", "--quiet", "-b", BRANCH, TREE, "main");
    const tree = checkoutAt(join(here.root, TREE));
    for (const [id, more] of [
      [CASE, ['landing: "declined: Leave the branch as it is for now."']],
      [PIN, [`landing: "${LANDING}"`]],
    ] as const) {
      tree.write(`.greenline/ledger/${id}.md`, closed(ground, more));
      tree.git("add", "--", `.greenline/ledger/${id}.md`);
      tree.git("commit", "--quiet", "-m", `close ${id}`, "-m", `Greenline-Change: ${id}`);
    }
    return { here, tree };
  }

  /** A shell command on Claude Code, before the tool runs, in the directory given. */
  const bash = (where: Space, command: string): JsonValue => ({
    hook_event_name: "PreToolUse",
    session_id: "l1",
    tool_use_id: "b",
    tool_name: "Bash",
    tool_input: { command },
    cwd: where.root,
  });

  it("lets the landing's push of the harness-named branch go on under the change's committed landing line, from the worktree and from the main checkout", () => {
    const { here, tree } = landed(`worktree: ${TREE}`);
    const push = `git push -u origin ${BRANCH}`;
    for (const where of [tree, here]) {
      const pushed = fire(where, "claude-code", bash(where, push));
      expect(pushed.err).toBe("");
      expect(pushed.code).toBe(0);
    }
    const lifts = readFileSync(join(here.root, ".git", "greenline", "lifts.jsonl"), "utf8");
    expect(lifts).toContain(`"change":"${PIN}"`);
    expect(lifts).not.toContain(`"change":"${CASE}"`);
  });

  it("reads a branch no record's ground names as before: a push elsewhere with no change open there", () => {
    const { tree } = landed("branch");
    const refused = fire(tree, "claude-code", bash(tree, `git push -u origin ${BRANCH}`));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(`no change is open on ${BRANCH}`);
    expect(refused.err).toContain("push-elsewhere-words");
  });
});

describe("J-193 S1 the hooks on a branch that predates the practice hold nothing and say so", () => {
  it("prints the branch's line at the turn's start where the default branch holds the manifest, and nothing in a repository that never held one (j109t-wait-proceed-1d)", () => {
    const here = bare("main");
    here.git("checkout", "--quiet", "--orphan", "feature/overdue");
    here.git("rm", "-r", "--quiet", "--cached", ".");
    rmSync(join(here.root, ".greenline"), { recursive: true, force: true });
    here.write("src/overdue.js", "export {};\n");
    here.git("add", "src/overdue.js");
    here.git("commit", "--quiet", "-m", "the feature before the install");
    for (const harness of ["claude-code", "codex"]) {
      const started = ask(here, harness, "p1", "Refactor the overdue helper.");
      expect(started.code).toBe(0);
      expect(started.out).toContain(
        "this branch predates the practice: feature/overdue holds no .greenline/manifest.json where main holds one, so greenline's instructions and hooks hold nothing here",
      );
      expect(started.out).toContain("switch to main or merge it into feature/overdue");
      // A hook that prints the line runs in the session, so the merge needs no new one there (J-206 S1).
      expect(started.out).not.toContain("starts a new session");
    }
    // A write there is let through: the hooks hold nothing on the branch.
    expect(fire(here, "claude-code", code("p1"))).toMatchObject({ code: 0, err: "" });
    const plain = mkdtempSync(join(tmpdir(), "greenline-plain-"));
    cleanup.push(plain);
    execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: plain });
    expect(ask(checkoutAt(plain), "claude-code", "p2", "Hello.")).toMatchObject({
      code: 0,
      out: "",
    });
  });
});
