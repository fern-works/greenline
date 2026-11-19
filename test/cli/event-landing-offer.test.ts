/**
 * The landing line names the offer and what decides it (J-228 S1; the
 * register's row of 2026-11-05, "The keeper over the oracle"), through
 * `greenline event`'s and `greenline status`'s entry points on fixture
 * repositories with real git, each case a run's own:
 *
 * - j201c-visuals finding 6 (001/010, 001/012) and j217c-workspace-010
 *   finding 7 (002/002): a yes to a proposal or the review's words, given in
 *   the turn whose own close made the record done, read as the merge into
 *   main. Before the offer is noted, only the merge, push and land words
 *   answer it.
 * - j217c-states-stop finding 3 (002/001): a clone's `origin/HEAD` named the
 *   change's own branch, so the line said the branch held itself. A base
 *   that is the change's own branch is no base.
 * - j201t-linear-visuals finding 11 (001/015, 001/026): the close offered
 *   the merge or the branch left with no recommendation and no review rule,
 *   under `remote: none` and a `CONTRIBUTING.md`. The line names the offer
 *   in the close page's order, the act the facts decide where no guide
 *   stands, and the guide's path where one does.
 * - j217c-roster-use finding 3 (`oracles/003/stdout.txt`): the settings
 *   change's commits stood on main and the line still asked for a declined
 *   landing line. It now says nothing to land and reads no words.
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
import { landingText } from "../../src/shell/landing.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-10-find-by-year";
const RECORD = `.greenline/ledger/${ID}.md`;
const OWN = `greenline/${ID}`;
const SESSION = "35888591-4840-4968-9407-724c4b915c43";
const REQUEST = "Add a year filter to the shelf list.";
/** The owner's words at j201c-visuals' 001/010 and 001/012. */
const YES_SHELF =
  "Yes, go ahead. Take the shelf and the overdue letters; leave the formatting out.";
const YES_FIGURE = "Yes, go ahead. After that, explain the loan lifecycle with a figure.";
/** The owner's words at j217c-workspace-010's 002/002. */
const REVIEWED = "The tests look right; go on and write the code.";
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
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
}

const TRAILER = `\n\nGreenline-Agent: claude-code/claude-opus-5-5\nGreenline-Change: ${ID}`;

/** A workspace on main, its first commit made, then on the branch given, or on main where none is. */
function workspace(branch: string | null = OWN): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-landing-offer-"));
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
  space.write("src/shelf.js", "export const shelf = () => [];\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "chore: configure the workspace");
  if (branch !== null) space.git("checkout", "--quiet", "-b", branch);
  return space;
}

function recordText(): string {
  return [
    "---",
    "mode: regular",
    'choice: "owner"',
    'why: "the shelf list has no year filter"',
    "state: done",
    'next: "none"',
    'ground: "branch"',
    'agent: "claude-code/claude-opus-5-5"',
    "---",
    "",
    "## frame",
    "",
    "The owner asked for a year filter.",
    "",
  ].join("\n");
}

let tick = 0;

function fire(where: Space, payload: JsonValue) {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-10T05:31:00.000Z") + tick * 1000);
  runEventCli(["--harness", "claude-code"], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => at,
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return writer.out;
}

const ask = (where: Space, prompt: string) =>
  fire(where, { hook_event_name: "UserPromptSubmit", session_id: SESSION, prompt });

/** The close's write of the record done, and its commit with the code on the branch HEAD names. */
function close(where: Space): void {
  where.write(RECORD, recordText());
  fire(where, {
    hook_event_name: "PreToolUse",
    session_id: SESSION,
    tool_use_id: "w",
    tool_name: "Write",
    tool_input: { file_path: join(where.root, RECORD), content: recordText() },
  });
  where.write("src/shelf.js", "export const shelf = (year) => [year];\n");
  where.git("add", "src/shelf.js", RECORD);
  where.git("commit", "--quiet", "-m", `feat(shelf): filter the list by year${TRAILER}`);
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

const short = (space: Space, ref: string): string => space.git("rev-parse", ref).slice(0, 7);

/** A remote at a local path, not a forge, the clone's own way of naming its default branch. */
function localRemote(space: Space, head: string): void {
  const remote = mkdtempSync(join(tmpdir(), "greenline-landing-offer-remote-"));
  cleanup.push(remote);
  gitIn(remote)("init", "--quiet", "--bare");
  space.git("remote", "add", "origin", remote);
  space.git("push", "--quiet", "origin", OWN, "main");
  space.git("fetch", "--quiet", "origin");
  space.git("symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${head}`);
}

describe("J-228 S1 before the offer, only the act's words answer the landing (j201c-visuals F6)", () => {
  for (const words of [YES_SHELF, YES_FIGURE, REVIEWED, "Yes, write the code."])
    it(`reads "${words}" in the turn whose close made the record done as no answer`, () => {
      const space = workspace();
      ask(space, REQUEST);
      ask(space, words);
      close(space);
      const out = status(space);
      expect(out).toContain(
        `landing: none recorded; main at ${short(space, "main")} does not hold ${OWN}`,
      );
      expect(out).not.toContain("the owner's words at turn");
      expect(ask(space, "What next?")).not.toContain("the owner's words at turn");
    });

  it("reads the merge words in that turn as the merge into main", () => {
    const space = workspace();
    ask(space, REQUEST);
    ask(space, "Close it and merge it into main.");
    close(space);
    expect(status(space)).toContain("the owner's words at turn 2 ask for the merge into main");
  });
});

describe("J-228 S1 a base that is the change's own branch is no base (j217c-states-stop F3)", () => {
  it("falls to main where origin's head names the change's branch, and to no base where none stands", () => {
    const space = workspace();
    close(space);
    localRemote(space, OWN);
    const main = `main at ${short(space, "main")} does not hold ${OWN}`;
    expect(status(space)).toContain(main);
    expect(status(space)).not.toContain(`${OWN} at`);
    space.git("branch", "-D", "main");
    expect(status(space)).toContain(
      "landing: none recorded; no base branch stands here, nor a default branch git names",
    );
  });

  it("reads origin's head naming main as before", () => {
    const space = workspace();
    close(space);
    localRemote(space, "main");
    expect(status(space)).toContain(`main at ${short(space, "main")} does not hold ${OWN}`);
  });
});

describe("J-228 S1 the landing line names the offer and what decides it (j201t-linear-visuals F11)", () => {
  const merge = `offer: the local merge of ${OWN} into main, or leave the branch`;

  it("names the merge, the branch left and the contributing guide, with no act decided, where a guide stands", () => {
    const space = workspace();
    space.write(
      "CONTRIBUTING.md",
      "# Contributing\n\nEvery branch is reviewed before it merges.\n",
    );
    close(space);
    const out = status(space, "--change", ID);
    expect(out).toContain(
      `landing: none recorded; main at ${short(space, "main")} does not hold ${OWN}; ${merge}; CONTRIBUTING.md stands: read it as the close page's section "The landing" says before the offer is answered`,
    );
    expect(out).not.toContain("the facts decide:");
    expect(ask(space, "What next?")).toContain(`${merge}; CONTRIBUTING.md stands`);
  });

  it("names the merge the facts decide where no guide stands, and the push and the pull request where the remote is a forge", () => {
    const space = workspace();
    close(space);
    expect(status(space)).toContain(
      `${merge}; the facts decide: the local merge of ${OWN} into main`,
    );
    space.git("remote", "add", "origin", "https://github.com/owner/shelf.git");
    expect(status(space)).toContain(
      `offer: the push of ${OWN} and its pull request, or leave the branch; the facts decide: the push of ${OWN} and its pull request`,
    );
  });

  it("prints the state alone where no session is read, as the inspector's Change page reads it", () => {
    const space = workspace();
    close(space);
    expect(landingText(space.root, ID)).toBe(
      `landing: none recorded; main at ${short(space, "main")} does not hold ${OWN}`,
    );
  });
});

describe("J-228 S1 nothing to land where the base holds the change's commits (j217c-roster-use F3)", () => {
  it("says nothing to land and reads no words, in the mirror, the status and the inspector", () => {
    const space = workspace(null);
    ask(space, REQUEST);
    close(space);
    const line = "landing: nothing to land: the commits are on main";
    expect(status(space)).toContain(line);
    expect(landingText(space.root, ID)).toBe(line);
    // The run's turn 6, whose words the line read as a decline owed.
    const turn = ask(space, "Leave the export change out of it; we are done here.");
    expect(turn).toContain(line);
    expect(turn).not.toContain("the owner's words at turn");
    expect(status(space)).not.toContain("decline the landing");
  });

  it("offers the push where the remote is a forge, the commits on main", () => {
    const space = workspace(null);
    ask(space, REQUEST);
    close(space);
    space.git("remote", "add", "origin", "https://github.com/owner/shelf.git");
    expect(status(space)).not.toContain("nothing to land");
    expect(status(space)).toContain("offer: the push of");
  });
});
