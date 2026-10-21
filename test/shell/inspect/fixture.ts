import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../src/shell/cli/runner.ts";
import { commitTreeId } from "../../../src/shell/code-tree.ts";
import { fixtureInstallation } from "../../fixtures/corpus.ts";
import { RecordingWriter } from "../../helpers/writer.ts";

/**
 * A workspace for the changes view: a quick, a regular and a careful
 * record, each with all seven step sections, a stopped change, a change
 * with reports, a brief and check facts against its commits, and a record
 * that does not parse, committed in a real git repository.
 */

export const VERSION = "0.1.0";
export const QUICK = "2026-10-02-typo";
export const REGULAR = "2026-10-05-retry";
export const CAREFUL = "2026-10-08-sessions";
export const BROKEN = "2026-10-09-broken";
/** A ticket's record: the plan's steps are the planning record's, so it holds none of them. */
export const TICKET = "2026-10-06-deadline";
/** An open record whose form parses but whose floor the modes do not hold. */
export const MISFIT = "2026-10-07-misfit";

const records = {
  [QUICK]: [
    "---",
    "mode: quick",
    "choice: standing",
    'why: "a typo in the README"',
    "state: done",
    "next: none",
    "reviewed: none",
    "agents: 1",
    "rounds: 0",
    'landing: "push it to main"',
    "---",
    "",
    "## frame",
    "",
    "The README misspells the command.",
    "",
    "## plan",
    "",
    "Fix the one word.",
    "",
    "## anticipate",
    "",
    "none at quick",
    "",
    "## build",
    "",
    "Fixed the word.",
    "",
    "## review",
    "",
    "none at quick",
    "",
    "## verify",
    "",
    "The README reads right.",
    "",
    "## close",
    "",
    "Done.",
    "",
  ].join("\n"),
  [REGULAR]: [
    "---",
    "mode: regular",
    "choice: accepted",
    'why: "retry the upload with a deadline"',
    "state: stopped",
    'next: "review: rerun the reviewer on the fixed commits"',
    "plan: 003-uploads",
    "---",
    "",
    "## frame",
    "",
    "Uploads hang **forever** when the server stalls.",
    "",
    "## plan",
    "",
    "- add a deadline",
    "- retry twice",
    "",
    "## anticipate",
    "",
    "none at regular",
    "",
    "## build",
    "",
    "Added the deadline in `src/upload.ts`.",
    "",
    "## review",
    "",
    `The [review](${REGULAR}/review-1.md) found one defect.`,
    "",
    "## verify",
    "",
    "## close",
    "",
  ].join("\n"),
  [CAREFUL]: [
    "---",
    "mode: careful",
    "choice: owner",
    "proposed: regular",
    'why: "move the session store to the new schema"',
    "state: open",
    'next: "verify: start the verifier on the final commit"',
    "floors: [data-migration]",
    "raises:",
    '  - { from: regular, reason: "the change migrates stored sessions" }',
    "reviewed: independent",
    "---",
    "",
    "## frame",
    "",
    "Sessions move to schema 2. Links: [a](javascript:alert(1)), [b](data:text/html,x),",
    "[c](//elsewhere.example/x), [d](https://example.com/doc), [e](../../src/sessions.ts).",
    "",
    "## plan",
    "",
    "| Step | Owner |",
    "| --- | --- |",
    "| migrate | builder |",
    "",
    "## anticipate",
    "",
    `See [anticipate](${CAREFUL}/anticipate-1.md).`,
    "",
    "## build",
    "",
    "Wrote the migration.",
    "",
    "## review",
    "",
    `[review 1](${CAREFUL}/review-1.md) and [review 2](${CAREFUL}/review-2.md).`,
    "",
    "## verify",
    "",
    "## close",
    "",
  ].join("\n"),
  [BROKEN]: "no front matter here\n",
  [TICKET]: [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "reset the deadline on each retry"',
    "state: open",
    'next: "build: reset the deadline in the retry loop"',
    "plan: 003-uploads",
    "ticket: T2",
    "---",
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
  [MISFIT]: [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "a floor the modes do not hold"',
    "state: open",
    "floors: [weather]",
    "---",
    "",
    "## frame",
    "",
    "A misnamed floor.",
    "",
    "## plan",
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
} satisfies Readonly<Record<string, string>>;

/** The workspace built, with the commit the careful change's passing check ran on. */
export interface ChangesWorkspace {
  readonly root: string;
  readonly env: {
    readonly cwd: string;
    readonly version: string;
    readonly installation: ReturnType<typeof fixtureInstallation>;
  };
  readonly finalCommit: string;
}

function facts(startedAt: string, tree: string, commit: string, code: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    state: "finished",
    arguments: ["pnpm", "test"],
    step: "build",
    startedAt,
    commit,
    tree,
    installation: "c".repeat(64),
    outcome: { kind: "exited", code },
    durationMs: 1500,
  });
}

/**
 * Build the workspace in a new temporary directory, which the caller removes.
 * @returns the workspace
 */
export function changesWorkspace(): ChangesWorkspace {
  const root = mkdtempSync(join(tmpdir(), "greenline-changes-view-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=QA",
        "-c",
        "user.email=qa@invalid.local",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, ".git"));
  const writer = new RecordingWriter();
  const env = { cwd: root, version: VERSION, installation: fixtureInstallation() };
  if (runCli(["init", "--yes"], writer.writer, VERSION, env) !== 0) throw new Error(writer.err);
  rmSync(join(root, ".git"), { recursive: true });
  git("init", "--quiet");
  git("add", "--all");
  git("commit", "--quiet", "-m", "the installation");
  const base = git("rev-parse", "HEAD");
  for (const id of [QUICK, REGULAR, BROKEN, TICKET, MISFIT] as const)
    write(`.greenline/ledger/${id}.md`, records[id]);
  write(
    `.greenline/ledger/${REGULAR}/review-1.md`,
    "# Review 1\n\nOne defect: the deadline is never reset.\n",
  );
  git("add", "--all");
  git("commit", "--quiet", "-m", "earlier changes");
  write("src/sessions.ts", "export const schema = 2;\n");
  write(`.greenline/ledger/${CAREFUL}.md`, records[CAREFUL]);
  write(
    `.greenline/ledger/${CAREFUL}/anticipate-1.md`,
    "# Anticipate\n\nThe claim: no session is lost.\n",
  );
  write(
    `.greenline/ledger/${CAREFUL}/review-1.md`,
    "# Review 1\n\nClean. See [the other](review-2.md).\n",
  );
  write(`.greenline/ledger/${CAREFUL}/review-2.md`, "# Review 2\n\n<script>alert(1)</script>\n");
  write(`.greenline/ledger/${CAREFUL}/brief-review-1.md`, "A brief written by hand.\n");
  git("add", "--all");
  git("commit", "--quiet", "-m", `the migration\n\nGreenline-Change: ${CAREFUL}`);
  const finalCommit = git("rev-parse", "HEAD");
  const tree = commitTreeId(root, finalCommit);
  if (tree.kind !== "tree") throw new Error(tree.reason);
  // A failed run on code no commit holds, then a passed run on the final commit's code.
  write(
    `.greenline/ledger/${CAREFUL}/checks/20261008T100000000Z-a1.json`,
    facts("2026-10-08T10:00:00.000Z", "d".repeat(40), base, 1),
  );
  write(
    `.greenline/ledger/${CAREFUL}/checks/20261008T110000000Z-b2.json`,
    facts("2026-10-08T11:00:00.000Z", tree.id, finalCommit, 0),
  );
  write(`.greenline/ledger/${CAREFUL}/checks/20261008T120000000Z-c3.json`, "{ half");
  return { root, env, finalCommit };
}
