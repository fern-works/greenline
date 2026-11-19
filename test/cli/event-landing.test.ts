/**
 * The landing's state named at every turn (J-202 S1; the register's row of
 * 2026-11-05, "The keeper over the oracle"), through `greenline event`'s and
 * `greenline status`'s entry points on fixture repositories with real git,
 * the case the run j196c-landing-4's: the close committed the record done on
 * `feature/find-by-author` and offered the local merge into `main`, `main`
 * moved under a red commit, and on the owner's "Merge it." the agent read
 * the base's new commit and withheld the merge. The mirror and the status
 * name a done change's landing from its record's `landing` line, the base's
 * hold of the branch's head and the change's checks on a merge commit, read
 * from git and the ledger; a session that does not hold the change reads no
 * such line. While no landing line stands, the fact also reads the owner's
 * journaled words since the offer against the merge, push and decline words
 * and says what they ask and what comes next, and the turn's end names a
 * reply that withheld the merge they asked for (J-209 S1, the run
 * j196c-landing-4b, its turns 001/001 and 001/002).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { factsFileName, hookRunFileName } from "../../src/core/facts.ts";
import { mirrorLines } from "../../src/core/mirror.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-08-find-by-author-case";
const RECORD = `.greenline/ledger/${ID}.md`;
const BRANCH = "feature/find-by-author";
const FIRST = "1059ccc3-d1ed-4e90-8d70-45149c508864";
const FRESH = "019a5b80-1b22-7d44-landing-fresh";
const REQUEST = "At quick: findByAuthor should ignore case, as the README promises.";
const MERGE = "Merge it.";
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

function gitIn(root: string) {
  return (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=F",
        "-c",
        "user.email=f@example.com",
        "-c",
        "init.defaultBranch=main",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();
}

/** The trailer every commit of the change carries. */
const TRAILER = `\n\nGreenline-Agent: claude-code/claude-sonnet-5-5\nGreenline-Change: ${ID}`;

function workspace(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-landing-"));
  cleanup.push(root);
  const space: Space = {
    root,
    git: gitIn(root),
    write: (path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    },
  };
  space.git("init", "--quiet", "-b", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({
      schemaVersion: 6,
      targets: ["claude-code", "codex"],
      checks: [],
      proceed: "none",
      hooks: { adapters: true, git: false },
    }),
  );
  space.write(".gitignore", ".greenline/tmp/\n.greenline/ledger/sessions/\n");
  space.write("src/shelf.js", "export const findByAuthor = (name) => name;\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "chore: configure the workspace");
  space.git("checkout", "--quiet", "-b", BRANCH);
  return space;
}

function recordText(extra: readonly string[] = []): string {
  return [
    "---",
    "mode: quick",
    'choice: "owner"',
    'why: "findByAuthor compares names exactly, but the README promises a match whatever the case."',
    "state: done",
    'next: "none"',
    'ground: "branch"',
    'agent: "claude-code/claude-sonnet-5-5"',
    ...extra,
    "---",
    "",
    "## frame",
    "",
    "The owner asked, naming quick, that `findByAuthor` ignore case.",
    "",
  ].join("\n");
}

/** The hooks' clock, a second on at each event, so the turn that started last is one. */
let tick = 0;

function fire(where: Space, payload: JsonValue, harness = "claude-code") {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-08T05:31:00.000Z") + tick * 1000);
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => at,
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

const ask = (where: Space, session: string, prompt: string, harness = "claude-code") =>
  fire(where, { hook_event_name: "UserPromptSubmit", session_id: session, prompt }, harness);

/** A turn's end, the reply's text as both harnesses hand it to the Stop hook. */
const end = (where: Space, session: string, reply: string, harness = "claude-code") =>
  fire(
    where,
    {
      hook_event_name: "Stop",
      session_id: session,
      last_assistant_message: reply,
      stop_hook_active: false,
    },
    harness,
  );

/** The agent's write of the record, as the harness hands it before the tool. */
function writeRecord(where: Space, session: string, text: string, harness = "claude-code"): void {
  where.write(RECORD, text);
  fire(
    where,
    harness === "codex"
      ? {
          hook_event_name: "PreToolUse",
          session_id: session,
          tool_use_id: "call_w",
          tool_name: "apply_patch",
          tool_input: { command: `*** Begin Patch\n*** Update File: ${RECORD}\n*** End Patch` },
        }
      : {
          hook_event_name: "PreToolUse",
          session_id: session,
          tool_use_id: "w",
          tool_name: "Write",
          tool_input: { file_path: join(where.root, RECORD), content: text },
        },
    harness,
  );
}

function status(where: Space, ...args: string[]): string {
  const writer = new RecordingWriter();
  runCli(["status", ...args], writer.writer, "0.0.0-test", {
    cwd: where.root,
    version: "0.0.0-test",
    installation: fixtureInstallation(),
  });
  return writer.out;
}

/** The run's turn 001: the change built and closed done on its branch, the merge offered, and `main` moved under it. */
function closedOnItsBranch(harness = "claude-code"): Space {
  const space = workspace();
  ask(space, FIRST, REQUEST, harness);
  writeRecord(space, FIRST, recordText(), harness);
  space.write("src/shelf.js", "export const findByAuthor = (name) => name.toLowerCase();\n");
  space.git("add", "src/shelf.js", RECORD);
  space.git(
    "commit",
    "--quiet",
    "-m",
    `fix(shelf): match author names whatever their case${TRAILER}`,
  );
  // The planted commit the scenario moves the base under, red against the change.
  space.git("checkout", "--quiet", "main");
  space.write("src/import.js", "export const exact = true;\n");
  space.git("add", "src/import.js");
  space.git(
    "commit",
    "--quiet",
    "-m",
    "feat: the catalogue import knows an author by the exact name",
  );
  space.git("checkout", "--quiet", BRANCH);
  return space;
}

const short = (space: Space, ref: string): string => space.git("rev-parse", ref).slice(0, 7);

/** A check of the change as `greenline check` records it, on the commit given. */
function checkFact(space: Space, commit: string, code: number, second: number): void {
  const at = `2026-11-08T05:40:${String(second).padStart(2, "0")}.000Z`;
  space.write(
    `.greenline/ledger/${ID}/checks/${factsFileName(at, "abc123")}`,
    JSON.stringify({
      schemaVersion: 1,
      arguments: ["npm", "test"],
      step: "close",
      startedAt: at,
      commit,
      tree: null,
      installation: "0".repeat(64),
      state: "finished",
      outcome: { kind: "exited", code },
      durationMs: 80,
    }),
  );
}

describe("J-202 S1 a done change's landing is named from the record and git (j196c-landing-4)", () => {
  it("names no landing recorded and the base that lacks the branch at the owner's merge words, in the mirror and the status", () => {
    const space = closedOnItsBranch();
    const none = `landing: none recorded; main at ${short(space, "main")} does not hold ${BRANCH}`;
    // The owner's words arrive; the state is read from the record and git.
    const turn = ask(space, FIRST, MERGE);
    expect(turn.out).toContain(none);
    expect(status(space)).toContain(none);
    expect(status(space, "--change", ID)).toContain(none);
  });

  it("names the merge owed on the owner's words, then the check on the merge commit owed, then the merge checked", () => {
    const space = closedOnItsBranch();
    ask(space, FIRST, MERGE);
    // The turn that receives the words writes them after the base and commits the record alone.
    writeRecord(space, FIRST, recordText([`landing: "merge into main: ${MERGE}"`]));
    space.git("add", RECORD);
    space.git("commit", "--quiet", "-m", `docs(ledger): the owner's landing words${TRAILER}`);
    expect(ask(space, FIRST, "Go on.").out).toContain(
      "landing: merge into main on the owner's words; main does not hold the branch; the check on the merge commit owed",
    );
    space.git("checkout", "--quiet", "main");
    space.git("merge", "--quiet", "--no-ff", "-m", `Merge ${ID} into main${TRAILER}`, BRANCH);
    const merge = space.git("rev-parse", "HEAD");
    expect(ask(space, FIRST, "Go on.").out).toContain(
      "landing: merge into main on the owner's words; main holds the branch; the check on the merge commit owed",
    );
    // A check of the change on the branch's own commit is no check on the merge commit.
    checkFact(space, space.git("rev-parse", BRANCH), 0, 1);
    expect(status(space)).toContain("the check on the merge commit owed");
    // The red is told from the check's facts, the status naming the check (GL0404).
    checkFact(space, merge, 1, 2);
    const red = `landing: merged into main, checked at ${merge.slice(0, 7)}, red; 'greenline status --change ${ID}' names the red check (GL0404)`;
    expect(ask(space, FIRST, "Go on.").out).toContain(red);
    expect(status(space)).toContain(red);
    checkFact(space, merge, 0, 3);
    const green = `landing: merged into main, checked at ${merge.slice(0, 7)}`;
    const after = ask(space, FIRST, "Go on.").out;
    expect(after).toContain(green);
    expect(after).not.toContain(`${green}, red`);
  });

  it("names a declined landing as the owner's answer, and a push's state as git knows it", () => {
    const space = closedOnItsBranch();
    writeRecord(space, FIRST, recordText(['landing: "declined: leave it for the review"']));
    expect(ask(space, FIRST, "Leave it.").out).toContain("landing: declined on the owner's words");
    const remote = mkdtempSync(join(tmpdir(), "greenline-landing-remote-"));
    cleanup.push(remote);
    gitIn(remote)("init", "--quiet", "--bare");
    space.git("remote", "add", "origin", remote);
    writeRecord(space, FIRST, recordText(['landing: "push and open the pull request: Push it."']));
    expect(ask(space, FIRST, "Push it.").out).toContain(
      `landing: push on the owner's words; no origin/${BRANCH} here, so git knows no push of ${BRANCH}`,
    );
    space.git("push", "--quiet", "origin", BRANCH);
    expect(ask(space, FIRST, "Go on.").out).toContain(
      `landing: push on the owner's words; origin/${BRANCH} holds ${BRANCH} at ${short(space, BRANCH)}`,
    );
  });

  it("reads no landing line in a session that does not hold the change", () => {
    const space = closedOnItsBranch();
    expect(ask(space, FRESH, MERGE).out).not.toContain("landing:");
  });

  it("prints the fact as the mirror's landing line, with or without a change open", () => {
    const base = {
      checks: [],
      declared: 0,
      agents: 0,
      git: { state: "off" as const },
      landing: "landing: declined on the owner's words",
    };
    for (const lines of [
      mirrorLines({ ...base, change: undefined }),
      mirrorLines({ ...base, change: { id: ID, record: { readable: true, state: "done" } } }),
    ])
      expect(lines.filter((line) => line.fact === "landing")).toEqual([
        { fact: "landing", text: "  landing: declined on the owner's words" },
      ]);
  });
});

/** The run's offer at 001/001's end. */
const OFFER =
  "`findByAuthor` now matches an author's name in any case.\n\nWaiting on: your choice to merge into `main` here or leave the branch.";

/** The run's reply at 001/002, which withheld the merge on a red foreseen from reading. */
const WITHHELD =
  "I haven't merged. `main` has a commit this branch doesn't have, and it relies on the exact-case behavior this fix removes.\n\nWaiting on: which of the three you want.";

describe("J-209 S1 the landing fact reads the owner's words since the offer (j196c-landing-4b)", () => {
  /** The run's turn 001 closed with its offer, on the harness given. */
  function offered(harness: string): Space {
    const space = closedOnItsBranch(harness);
    end(space, FIRST, OFFER, harness);
    return space;
  }
  const asking = (space: Space, turn: number) =>
    `landing: none recorded; main at ${short(space, "main")} does not hold ${BRANCH}; the owner's words at turn ${String(turn)} ask for the merge into main: write the landing line in those words, merge, run the check on the merge commit, tell the red from its facts`;
  const withheld = (turn: number) =>
    `landing: the reply at turn ${String(turn)} withheld the merge the owner asked for; no reading of the merge stands for the check on the merge commit`;

  for (const harness of ["codex", "claude-code"])
    it(`says the owner's "Merge it." asks for the merge and what comes next, in the mirror and the status, on ${harness}`, () => {
      const space = offered(harness);
      const turn = ask(space, FIRST, MERGE, harness);
      expect(turn.out).toContain(asking(space, 2));
      expect(status(space)).toContain(asking(space, 2));
      expect(status(space, "--change", ID)).toContain(asking(space, 2));
    });

  for (const harness of ["codex", "claude-code"])
    it(`names the reply that withheld the merge at the next mirror and keeps the ask until the landing line holds the words, on ${harness}`, () => {
      const space = offered(harness);
      ask(space, FIRST, MERGE, harness);
      end(space, FIRST, WITHHELD, harness);
      const next = ask(space, FIRST, "Why not?", harness);
      expect(next.out).toContain(withheld(2));
      // The words of turn 2 still ask at turn 3, a message off the lists answering nothing.
      expect(next.out).toContain(asking(space, 2));
      expect(status(space)).toContain(asking(space, 2));
      // The landing line holds the words: the ask and the notice are gone.
      writeRecord(space, FIRST, recordText([`landing: "merge into main: ${MERGE}"`]), harness);
      end(space, FIRST, "The landing line is written; the merge comes next.", harness);
      const after = ask(space, FIRST, "Go on.", harness);
      expect(after.out).not.toContain("ask for the merge");
      expect(after.out).not.toContain("withheld");
      expect(after.out).toContain("landing: merge into main on the owner's words");
    });

  it("says a decline leaves the branch and what comes next, and names no withheld merge", () => {
    const space = offered("claude-code");
    const turn = ask(space, FIRST, "Leave the branch.");
    expect(turn.out).toContain("the owner's words at turn 2 decline the landing");
    // The status prints the line as text, its quotes unescaped.
    expect(status(space)).toContain(
      `landing: none recorded; main at ${short(space, "main")} does not hold ${BRANCH}; the owner's words at turn 2 decline the landing: write the landing line in those words after "declined: ", name it in the close section and commit the record alone`,
    );
    end(space, FIRST, "The branch stays.");
    expect(ask(space, FIRST, "Thanks.").out).not.toContain("withheld");
  });

  it("says a push asks for the push and what comes next", () => {
    const space = offered("claude-code");
    expect(ask(space, FIRST, "Push the branch.").out).toContain(
      "the owner's words at turn 2 ask for the push: write the landing line in those words, commit the record alone, then push the branch and open the pull request",
    );
  });

  it("reads no answer in the request that opened the change, nor in words off the lists", () => {
    const space = offered("claude-code");
    const none = `landing: none recorded; main at ${short(space, "main")} does not hold ${BRANCH}`;
    const turn = ask(space, FIRST, "What does the catalogue import do?");
    expect(turn.out).toContain(none);
    expect(turn.out).not.toContain("the owner's words at turn");
    end(space, FIRST, "It knows an author by the exact name.");
    expect(ask(space, FIRST, "I see.").out).not.toContain("withheld");
  });
});

describe("J-222 S1 a resume's words answer no landing's offer (j217c-states-stop F3)", () => {
  /** The owner's words at the Claude run's 002/001, which the landing fact read as the merge. */
  const RESUME = "Carry on with that change.";

  it("reads the turn's carry-on as no answer where no offer was noted, in the mirror and the status", () => {
    const space = closedOnItsBranch();
    const none = `landing: none recorded; main at ${short(space, "main")} does not hold ${BRANCH}`;
    const turn = ask(space, FIRST, RESUME);
    expect(turn.out).toContain(none);
    expect(turn.out).not.toContain("the owner's words at turn");
    expect(status(space)).toContain(none);
    expect(status(space)).not.toContain("ask for the merge");
  });

  for (const harness of ["codex", "claude-code"])
    it(`reads the carry-on after a noted offer as no answer, and a yes after it as the merge, on ${harness}`, () => {
      const space = closedOnItsBranch(harness);
      end(space, FIRST, OFFER, harness);
      const resumed = ask(space, FIRST, RESUME, harness);
      expect(resumed.out).not.toContain("the owner's words at turn");
      expect(status(space)).not.toContain("ask for the merge");
      end(
        space,
        FIRST,
        "Waiting on: your choice to merge into `main` here or leave the branch.",
        harness,
      );
      expect(ask(space, FIRST, "Yes, go ahead.", harness).out).toContain(
        `the owner's words at turn 3 ask for the merge into main`,
      );
    });
});
