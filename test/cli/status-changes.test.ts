import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ok } from "../../src/commons/result.ts";
import { runBriefCli } from "../../src/shell/cli/brief.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import type { SinceCheckView } from "../../src/core/status.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { listFilesRecursive } from "../../src/shell/fs/walk.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/**
 * `greenline status` reads changes (S6): the changes view on real
 * repositories, its exit code, its JSON and its resume view, with the check
 * facts `greenline check` writes.
 */

const VERSION = "0.1.0";
const installation = fixtureInstallation();
const cleanup: string[] = [];

interface Repository {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  /** Write files, stage everything and commit with this message. */
  readonly commit: (message: string, files: Readonly<Record<string, string>>) => void;
  readonly write: (path: string, text: string) => void;
}

/** A real repository with greenline installed and committed, before any change record. */
function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "status-changes-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const commit = (message: string, files: Readonly<Record<string, string>>): void => {
    for (const [path, text] of Object.entries(files)) write(path, text);
    git("add", "--all");
    git("commit", "--quiet", "-m", message);
  };
  write("a.txt", "a\n");
  const rec = new RecordingWriter();
  if (
    runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation,
    }) !== 0
  )
    throw new Error(`init failed: ${rec.err}`);
  commit("install greenline", {});
  return { root, git, commit, write };
}

function record(
  state: string,
  extra: readonly string[] = [],
  body: readonly string[] = [],
): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "a typo"',
    `state: ${state}`,
    // A done record states what landed (J-168 S1), and carries the lines the agent writes (J-176 S1).
    ...(state === "done"
      ? [
          'yes: "Yes, fix it."',
          "floors: none",
          "ground: branch",
          'agent: "claude-code/opus"',
          "skills: [frame, build, verify, close]",
          'outcome: "The typo is fixed."',
        ]
      : []),
    ...extra,
    "---",
    "",
    ...body,
  ].join("\n");
}

const QUICK_BODY = [
  "## frame",
  "x",
  "## plan",
  "x",
  "## anticipate",
  "none at quick",
  "## build",
  "x",
  "## review",
  "none at quick",
  "## verify",
  "x",
  "## close",
  "x",
];
const ledger = (id: string): string => `.greenline/ledger/${id}.md`;

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function status(root: string, ...args: string[]): Run {
  const rec = new RecordingWriter();
  const code = runCli(["status", ...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation,
    environment: {},
  });
  return { code, out: rec.out, err: rec.err };
}

async function check(root: string, ...argv: string[]): Promise<number> {
  const rec = new RecordingWriter();
  return runCheckCli(argv, rec.writer, {
    cwd: root,
    installation: () => ok(installation),
    environment: process.env,
    stdio: "ignore",
  });
}

/** Every file under the root, `.git` included, with the hash of its bytes. */
function snapshot(root: string): ReadonlyMap<string, string> {
  return new Map(
    listFilesRecursive(root).map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(root, file)))
        .digest("hex"),
    ]),
  );
}

afterEach(() => {
  for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("greenline status reads changes", () => {
  it("S6 a repository with no change records reports none and no finding, and exits zero", () => {
    const { root } = repository();
    const result = status(root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("changes: none recorded");
    expect(result.err).not.toMatch(/GL04/);
    const json = JSON.parse(status(root, "--json").out);
    expect(json.changes).toMatchObject({
      view: "list",
      findings: 0,
      notices: 0,
      unclaimed: { kind: "not-read" },
    });
  });

  it("S6 and J-93 S3 a repository whose owner commits by hand shows it on the history line, a nudge with no code, and exits zero", () => {
    const { root, commit } = repository();
    commit("open the change", { [ledger("2026-10-04-typo")]: record("open") });
    commit("a fix\n\nGreenline-Change: 2026-10-04-typo", { "src/fix.ts": "f\n" });
    commit("by hand", { "src/hand.ts": "h\n" });
    const result = status(root);
    expect(result.code).toBe(0);
    expect(result.err).not.toContain("GL0453");
    expect(result.out).toContain(
      "history: 1 commit since the first change record, on the first parent and not merges, touches code and belongs to no change",
    );
    const json = JSON.parse(status(root, "--json").out);
    expect(json.ok).toBe(true);
    expect(json.changes.unclaimed).toMatchObject({ kind: "known", count: 1 });
    expect(json.changes.current[0]).toMatchObject({
      id: "2026-10-04-typo",
      reading: "judged",
      step: "frame",
    });
    expect(json.changes.current[0].commits.files).toEqual(["src/fix.ts"]);
  });

  it("S6 a finding fails status with its code, and a notice alone does not", () => {
    const { root, commit } = repository();
    commit("broken", { [ledger("2026-10-04-broken")]: "no front matter\n" });
    const broken = status(root);
    expect(broken.code).toBe(1);
    expect(broken.err).toContain("  the change record '2026-10-04-broken' does not parse");
    const { root: quiet, commit: commitQuiet } = repository();
    commitQuiet("done", { [ledger("2026-10-04-done")]: record("done", [], QUICK_BODY) });
    const notice = status(quiet);
    expect(notice.err).toContain("; warning GL0456");
    expect(notice.code).toBe(0);
  });

  it("S6 a check run before the code moved is a notice naming the files, and one on the final code is not", async () => {
    const { root, commit, write } = repository();
    commit("open", { [ledger("2026-10-04-typo")]: record("open") });
    expect(await check(root, "--", process.execPath, "-e", "")).toBe(0);
    const final = status(root, "--json");
    expect(JSON.parse(final.out).changes.current[0].checks[0]).toMatchObject({
      outcome: "passed",
      code: { kind: "final" },
    });
    expect(final.out).not.toContain("GL0451");
    write("a.txt", "changed after the check\n");
    write("new.txt", "n\n");
    const moved = status(root);
    expect(moved.code).toBe(0);
    expect(moved.err).toContain(
      "of '2026-10-04-typo' again on the final code: the code moved after it last ran",
    );
    expect(moved.err).toContain("a.txt, new.txt changed");
    // J-144 S3: the notice says what to do first, and its code follows the words, never leading them.
    expect(moved.err).toMatch(
      /^ {2}run the check '[^\n]*' of '2026-10-04-typo' again on the final code: [^\n]*; warning GL0451 \(\.greenline\/ledger\/2026-10-04-typo\.md\)$/m,
    );
    expect(moved.err).not.toMatch(/^\s*(?:WARNING|ERROR|warning|error) GL\d+/m);
  });

  it("S6 a done change whose latest check failed fails status", async () => {
    const { root, commit } = repository();
    commit("done", { [ledger("2026-10-04-typo")]: record("done", [], QUICK_BODY) });
    expect(
      await check(
        root,
        "--change",
        "2026-10-04-typo",
        "--",
        process.execPath,
        "-e",
        "process.exit(3)",
      ),
    ).toBe(3);
    const result = status(root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("  the done change '2026-10-04-typo' ended with the check");
  });

  it("S6 status writes nothing in the repository, its index and object store included", async () => {
    const { root, commit, write } = repository();
    commit("open", { [ledger("2026-10-04-typo")]: record("open") });
    commit("done", { [ledger("2026-10-03-old")]: record("done", [], QUICK_BODY) });
    expect(await check(root, "--", process.execPath, "-e", "")).toBe(0);
    write("a.txt", "moved\n");
    // Same bytes, older time: a read that refreshed the index would rewrite it.
    utimesSync(join(root, "AGENTS.md"), new Date(2020, 0, 1), new Date(2020, 0, 1));
    const before = snapshot(root);
    status(root);
    status(root, "--all", "--json");
    status(root, "--change", "2026-10-04-typo");
    expect(snapshot(root)).toEqual(before);
  });

  it("S6 a ledger folder that cannot be read is a finding, and the view says it is unavailable", () => {
    const { root, commit } = repository();
    commit("open", { [ledger("2026-10-04-typo")]: record("open") });
    const folder = join(root, ".greenline", "ledger");
    chmodSync(folder, 0o000);
    try {
      const result = status(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("; error GL0401");
      expect(result.err).toContain("make the folder readable");
      expect(result.out).toContain(
        "changes: unavailable (the ledger or the plans folder cannot be read)",
      );
    } finally {
      chmodSync(folder, 0o755);
    }
  });

  it("S6 --change shows one change's resume view, and an unknown change is refused", () => {
    const { root, commit } = repository();
    commit("stopped", {
      [ledger("2026-10-04-typo")]: record(
        "stopped",
        ['next: "build: finish the fix"'],
        ["## frame", "a typo"],
      ),
    });
    const resume = status(root, "--change", "2026-10-04-typo");
    expect(resume.code).toBe(0);
    expect(resume.out).toContain("change 2026-10-04-typo (.greenline/ledger/2026-10-04-typo.md)");
    expect(resume.out).toContain("  next: build: finish the fix");
    expect(resume.out).toContain("  step reached: build");
    expect(resume.out).not.toContain("house rulings");
    const json = JSON.parse(status(root, "--change", "2026-10-04-typo", "--json").out);
    expect(json.changes).toMatchObject({
      view: "resume",
      change: { id: "2026-10-04-typo", step: "build" },
    });
    const unknown = status(root, "--change", "2026-10-04-nothing");
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain(
      "  no change record '2026-10-04-nothing' in .greenline/ledger/; error GL0001 (.greenline/ledger)",
    );
    expect(status(root, "--change", "README").code).toBe(1);
    expect(status(root, "--all", "--change", "2026-10-04-typo").code).toBe(2);
  });

  it("J-73 S4 status prints the situation above the changes and carries it in its JSON; the resume view prints none", () => {
    const { root, commit } = repository();
    commit("open", {
      [ledger("2026-10-14-typo")]: record("stopped", ['next: "build: finish the fix"']),
      "CONTRIBUTING.md": "# Contributing\n",
      "src/app.ts": "export {};\n",
    });
    const text = status(root).out;
    expect(text.indexOf("situation\n")).toBeGreaterThan(-1);
    expect(text.indexOf("situation\n")).toBeLessThan(text.indexOf("changes\n"));
    expect(text).toContain("  change records: 1\n");
    expect(text).toContain("  knowledge homes: CONTRIBUTING.md\n");
    expect(text).toContain("  languages: typescript (src/)\n");
    expect(text).toContain("    2026-10-14-typo  stopped, next build: finish the fix  quick (");
    const json = JSON.parse(status(root, "--json").out);
    expect(json.situation).toMatchObject({
      commits: { kind: "known", count: 2 },
      records: { kind: "known", count: 1 },
      homes: [{ kind: "contributing", path: "CONTRIBUTING.md" }],
      languages: { kind: "known", languages: [{ language: "typescript", roots: ["src/"] }] },
      stoppedElsewhere: { kind: "known", changes: [] },
    });
    expect(json.changes.current[0].next).toBe("build: finish the fix");
    const resume = status(root, "--change", "2026-10-14-typo", "--json");
    expect(JSON.parse(resume.out).situation).toBeUndefined();
  });

  it("J-84 S3 the owner's override at a ticket's open and the owner's planning mode below careful keep their codes, each remedy keeping the owner's choice", () => {
    const { root, commit } = repository();
    commit("the plan", {
      ".greenline/plans/001-login/tickets.md": [
        "---",
        "status: complete",
        "---",
        "",
        "## T1",
        "",
        'intent: "the form"',
        "scope:",
        "  - src/form.ts",
        "acceptance:",
        '  - "it renders"',
        "mode: careful",
        "",
      ].join("\n"),
      [ledger("2026-10-14-plan")]: [
        "---",
        "mode: regular",
        "choice: owner",
        "proposed: careful",
        'why: "the login"',
        "state: open",
        "plan: 001-login",
        "---",
        "",
      ].join("\n"),
      [ledger("2026-10-14-t1")]: [
        "---",
        "mode: quick",
        "choice: owner",
        "proposed: careful",
        'why: "the form"',
        "state: open",
        "plan: 001-login",
        "ticket: T1",
        "---",
        "",
      ].join("\n"),
    });
    const owned = status(root);
    expect(owned.code).toBe(1);
    expect(owned.err).toContain(
      "  the ticket 'T1' of the plan '001-login' opened under 'quick', the mode the owner named as it opened (choice: owner)",
    );
    expect(owned.err).toContain("the owner's override stands");
    expect(owned.err).toContain(
      "  the planning change '2026-10-14-plan' runs under 'regular', the mode the owner named (choice: owner)",
    );
    expect(owned.err).toContain("the owner's choice stands");
    expect(owned.err).not.toContain("correct the record's mode");
  });

  it("J-73 S4 and J-93 S3 the four prose rules: two findings fail status with their codes, two nudges carry none", () => {
    const { root, commit } = repository();
    commit("the plan", {
      ".greenline/plans/001-login/tickets.md": [
        "---",
        "status: complete",
        "---",
        "",
        "## T1",
        "",
        'intent: "the form"',
        "scope:",
        "  - src/form.ts",
        "acceptance:",
        '  - "it renders"',
        "mode: quick",
        "",
      ].join("\n"),
      [ledger("2026-10-14-plan")]: record("open", ["plan: 001-login"]),
      [ledger("2026-10-14-t1")]: [
        "---",
        "mode: regular",
        "choice: accepted",
        'why: "the form"',
        "state: open",
        "plan: 001-login",
        "ticket: T1",
        "---",
        "",
      ].join("\n"),
    });
    const failing = status(root);
    expect(failing.code).toBe(1);
    expect(failing.err).toContain("  the ticket 'T1' of the plan '001-login'");
    expect(failing.err).toContain("  the planning change '2026-10-14-plan'");

    const { root: quiet, commit: commitQuiet, write: writeQuiet } = repository();
    commitQuiet("done", {
      [ledger("2026-10-14-done")]: record("done", [], QUICK_BODY),
      [ledger("2026-10-14-took")]: [
        "---",
        "mode: quick",
        "choice: standing",
        'why: "a typo"',
        "state: open",
        "---",
        "",
      ].join("\n"),
    });
    writeQuiet(".greenline/tmp/2026-10-14-done/brief-review-1.md", "brief\n");
    const notices = status(quiet);
    expect(notices.code).toBe(0);
    expect(notices.err).not.toMatch(/GL0457|GL0458/);
    expect(notices.out).toContain("its working files remain in .greenline/tmp/2026-10-14-done/");
    expect(notices.out).toContain(
      "it took the mode 'quick' without waiting (choice: standing), and the proceed setting 'none' does not allow it",
    );
    expect(notices.out).toContain(
      "a standing choice applies only where the proceed setting admits the mode, so have the owner choose the mode",
    );
  });
});

describe("J-218 S1 a record's link to a folder of its change cites the files under it", () => {
  const id = "2026-11-09-members";
  const runs = [
    "interface/20261109T120000000Z-a1b2c3.json",
    "interface/20261109T121500000Z-d4e5f6.json",
  ];
  /** A done change whose folder keeps the interface check's runs, its verify section linking what is given, and a green check on the final code. */
  async function done(links: string): Promise<Run> {
    const { root, commit } = repository();
    const body = QUICK_BODY.map((line, at) => (at === 11 ? links : line));
    commit("done", {
      [ledger(id)]: record("done", [], body),
      ...Object.fromEntries(runs.map((run) => [`.greenline/ledger/${id}/${run}`, "{}\n"])),
    });
    expect(await check(root, "--change", id, "--", process.execPath, "-e", "process.exit(0)")).toBe(
      0,
    );
    return status(root);
  }

  it("J-218 S1 a done record linking the interface check's runs all at once as the folder's link, as the lint advises, passes status with no GL0405", async () => {
    const result = await done(`The [interface check](${id}/interface/) ran twice.`);
    expect(result.err).not.toContain("GL0405");
    expect(result.code, result.err).toBe(0);
  });

  it("J-218 S1 a link to a file, or to a directory, that is not in the folder still fails status with GL0405", async () => {
    const result = await done(
      `The [interface check](${id}/interface/) ran twice; [the review](${id}/review-1.md) and [its notes](${id}/notes/) are not kept; [a prefix](${id}/interf) is no directory.`,
    );
    expect(result.code).toBe(1);
    for (const file of ["interf", "notes", "review-1.md"])
      expect(result.err).toContain(
        `the record of '${id}' links to '${id}/${file}', which is not in its folder: restore the file, or correct the link; error GL0405`,
      );
    expect(result.err.match(/GL0405/g)).toHaveLength(3);
  });
});

describe("J-84 S1 the close's commits and checks", () => {
  it("J-84 S1 and J-93 S3 a trailer beside the harness's line in the message's last paragraph claims the commit, and one in a paragraph of its own above it is named on the history line", () => {
    const { root, commit, git } = repository();
    commit("open the change", { [ledger("2026-10-16-letters")]: record("open") });
    commit(
      "add the letter\n\nGreenline-Change: 2026-10-16-letters\nCo-Authored-By: Agent <agent@example.com>",
      { "src/letter.ts": "l\n" },
    );
    expect(status(root).out).toContain(
      "history: every commit since the first change record belongs to a change",
    );
    expect(JSON.parse(status(root, "--json").out).changes.current[0].commits.files).toEqual([
      "src/letter.ts",
    ]);
    commit(
      "add the fine\n\nGreenline-Change: 2026-10-16-letters\n\nCo-Authored-By: Agent <agent@example.com>",
      { "src/fine.ts": "f\n" },
    );
    const apart = status(root);
    expect(apart.code).toBe(0);
    expect(apart.out).toContain(
      `history: 1 commit since the first change record, on the first parent and not merges, touches code and belongs to no change: ${git("rev-parse", "--short=7", "HEAD")}. A change's commits carry the trailer 'Greenline-Change: <id>' in the message's last paragraph, beside any other trailer there such as 'Co-Authored-By'; write it so in the next commit`,
    );
  });

  it("J-84 S1 a done change whose red check ran again green on the final code passes status, and one left red fails it", async () => {
    const { root, commit } = repository();
    commit("done", { [ledger("2026-10-16-letters")]: record("done", [], QUICK_BODY) });
    const run = (): Promise<number> =>
      check(
        root,
        "--change",
        "2026-10-16-letters",
        "--",
        process.execPath,
        "-e",
        "process.exit(require('fs').existsSync('fixed.txt') ? 0 : 1)",
      );
    expect(await run()).toBe(1);
    const red = status(root);
    expect(red.code).toBe(1);
    expect(red.err).toContain("; error GL0404");
    commit("the fix\n\nGreenline-Change: 2026-10-16-letters", { "fixed.txt": "f\n" });
    expect(await run()).toBe(0);
    const green = status(root);
    expect(green.err).not.toMatch(/GL0404|GL0451/);
    expect(green.code).toBe(0);
  });

  it("J-84 S2 a fact removed from between two runs is GL0459's notice, and the removal turns no red green", async () => {
    const { root, commit } = repository();
    commit("done", { [ledger("2026-10-16-letters")]: record("done", [], QUICK_BODY) });
    const id = "2026-10-16-letters";
    const node = process.execPath;
    expect(await check(root, "--change", id, "--", node, "-e", "process.exit(1)")).toBe(1);
    expect(await check(root, "--change", id, "--", node, "-e", "")).toBe(0);
    const folder = join(root, ".greenline", "ledger", id, "checks");
    const [first] = [...listFilesRecursive(folder)].sort();
    rmSync(join(folder, first ?? ""));
    const after = status(root);
    expect(after.err).toContain(
      `  restore the check facts '${first ?? ""}' of '${id}' from history where they were committed, and say in the record what they held: '${listFilesRecursive(folder)[0] ?? ""}' follows them and they are not in the folder`,
    );
    expect(after.code).toBe(0);
  });

  it("J-84 S2 a probe recorded by mistake fails a done change until check --probe marks it, and then status passes", async () => {
    const { root, commit } = repository();
    const id = "2026-10-16-letters";
    commit("done", { [ledger(id)]: record("done", [], QUICK_BODY) });
    const node = process.execPath;
    expect(await check(root, "--change", id, "--", node, "-e", "process.exit(1)")).toBe(1);
    expect(await check(root, "--change", id, "--", node, "-e", "")).toBe(0);
    expect(status(root).err).toContain("; error GL0404");
    const folder = join(root, ".greenline", "ledger", id, "checks");
    const [probe] = [...listFilesRecursive(folder)].sort();
    expect(await check(root, "--change", id, "--probe", probe ?? "")).toBe(0);
    const marked = status(root);
    expect(marked.err).not.toMatch(/GL0404|GL0451|GL0459/);
    expect(marked.code).toBe(0);
  });
});

describe("J-89 S1 the briefs on a real repository", () => {
  it("J-89 S1 status lists the brief greenline brief wrote, and a brief written by hand fails it with GL0408", () => {
    const { root, commit, write } = repository();
    const id = "2026-10-18-retry";
    commit("open the change", {
      [ledger(id)]: [
        "---",
        "mode: careful",
        "choice: accepted",
        'why: "retry the deadline"',
        "state: open",
        "---",
        "",
        "## frame",
        "x",
        "## plan",
        "- The retry stops at the deadline.",
        "",
      ].join("\n"),
    });
    const rec = new RecordingWriter();
    expect(
      runBriefCli(
        ["--change", id, "--step", "review", "--round", "1", "--intent", "Stop at the deadline."],
        rec.writer,
        { cwd: root, installation: () => ok(installation) },
      ),
    ).toBe(0);
    expect(rec.out).toBe(`.greenline/ledger/${id}/brief-review-1.md\n`);
    expect(rec.err).toContain("start the agent with this path and nothing else");
    const listed = status(root, "--change", id);
    expect(listed.code).toBe(0);
    expect(listed.out).toContain(
      "briefs greenline brief wrote: brief-review-1.md; the close cites each",
    );
    expect(JSON.parse(status(root, "--json", "--change", id).out).changes.change.briefs).toEqual([
      { file: "brief-review-1.md", step: "review", round: 1 },
    ]);
    write(`.greenline/ledger/${id}/brief-review-2.md`, "# The second reviewer's brief\n");
    const refused = status(root);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain(
      `  the brief 'brief-review-2.md' of '${id}' carries no mark of greenline brief on its first line`,
    );
  });
});

describe("J-89 S2 the commits since the last recorded check on a real repository", () => {
  const node = process.execPath;
  const since = (root: string, id: string): SinceCheckView | null =>
    JSON.parse(status(root, "--json", "--change", id).out).changes.change.sinceCheck;

  it("J-89 S2 the short form records the open change's step, and the resume view counts the commits of code after it, the tested code's own commit and a record's left out", async () => {
    const { root, commit, write, git } = repository();
    const id = "2026-10-18-letters";
    commit("open the change\n\nGreenline-Change: 2026-10-18-letters", {
      [ledger(id)]: record("open", [], ["## frame", "x", "## plan", "x", ""]),
    });
    write("src/letter.ts", "l\n");
    expect(await check(root, "--", node, "-e", "")).toBe(0);
    const [facts] = listFilesRecursive(join(root, ".greenline", "ledger", id, "checks"));
    expect(
      JSON.parse(
        readFileSync(join(root, ".greenline", "ledger", id, "checks", facts ?? ""), "utf8"),
      ).step,
    ).toBe("build");
    commit("add the letter\n\nGreenline-Change: 2026-10-18-letters", {});
    commit("the record\n\nGreenline-Change: 2026-10-18-letters", {
      [ledger(id)]: record(
        "open",
        [],
        ["## frame", "x", "## plan", "x", "## build", "the letter", ""],
      ),
    });
    expect(since(root, id)).toMatchObject({ kind: "counted", commits: 0 });
    expect(status(root, "--change", id).out).not.toContain("since the last recorded check");
    commit("add the fine\n\nGreenline-Change: 2026-10-18-letters", { "src/fine.ts": "f\n" });
    commit("add the stamp\n\nGreenline-Change: 2026-10-18-letters", { "src/stamp.ts": "s\n" });
    const resumed = status(root, "--change", id);
    expect(resumed.code).toBe(0);
    expect(resumed.out).toContain("  2 commits since the last recorded check, started ");
    expect(resumed.err).not.toContain("since the last recorded check");
    expect(since(root, id)).toMatchObject({ kind: "counted", commits: 2 });
    expect(await check(root, "--", node, "-e", "")).toBe(0);
    expect(since(root, id)).toMatchObject({ kind: "counted", commits: 0 });
    git("checkout", "--quiet", "--detach", "HEAD~3");
    expect(since(root, id)).toMatchObject({ kind: "unknown" });
  });
});

describe("J-229 S1 the practice's files are not the code a check ran on", () => {
  const node = process.execPath;
  const id = "2026-11-10-find-by-year";

  /** The tree id the check facts of 0.1.0 recorded: the working tree with `.greenline/` alone left out. */
  function treeBefore(root: string): string {
    const index = join(mkdtempSync(join(tmpdir(), "status-index-")), "index");
    cleanup.push(join(index, ".."));
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", env }).trim();
    git("add", "--all");
    git("rm", "-r", "--cached", "--quiet", "--ignore-unmatch", ".greenline");
    return git("write-tree");
  }

  /** The one fact of the change's checks, its tree replaced by the tree given. */
  function rewriteTree(root: string, tree: string): void {
    const folder = join(root, ".greenline", "ledger", id, "checks");
    const [file] = listFilesRecursive(folder);
    const path = join(folder, file ?? "");
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.replace(/"tree": "[0-9a-f]+"/, `"tree": "${tree}"`));
  }

  it("a check run while a sync's files stand uncommitted reads on the final code once the change's code alone is committed, the run's close", async () => {
    const { root, commit, write, git } = repository();
    commit("open the change", { [ledger(id)]: record("open") });
    // What the sync left: the block and a skill rewritten, nothing of it committed.
    write("AGENTS.md", `${readFileSync(join(root, "AGENTS.md"), "utf8")}\nthe 0.2.0 block\n`);
    const skill = listFilesRecursive(join(root, ".agents", "skills"))[0] ?? "";
    write(join(".agents", "skills", skill), "the skill as 0.2.0 writes it\n");
    write("src/shelf.js", "export const findByYear = () => [];\n");
    expect(await check(root, "--", node, "-e", "")).toBe(0);
    git("add", "src/shelf.js");
    git(
      "commit",
      "--quiet",
      "-m",
      "feat: find by year\n\nGreenline-Change: 2026-11-10-find-by-year",
    );
    const read = status(root);
    expect(read.err).not.toContain("GL0451");
    expect(read.out).not.toContain("the code moved after");
    // A commit of the installed files alone is no commit of code since the check; one of code is.
    const since = (): SinceCheckView | null =>
      JSON.parse(status(root, "--json", "--change", id).out).changes.change.sinceCheck;
    expect(since()).toMatchObject({ kind: "counted", commits: 0 });
    git("add", "AGENTS.md", ".agents");
    git("commit", "--quiet", "-m", "the installation, by hand");
    expect(since()).toMatchObject({ kind: "counted", commits: 0 });
    expect(JSON.parse(status(root, "--json").out).changes.current[0].checks[0]).toMatchObject({
      code: { kind: "final" },
    });
    // A file of the code edited after the check still moves it, named alone.
    write("src/shelf.js", "export const findByYear = () => [1];\n");
    const line = status(root)
      .err.split("\n")
      .find((entry) => entry.includes("GL0451"));
    expect(line).toContain("the code moved after it last ran, src/shelf.js changed");
    expect(line).not.toContain(".agents/");
    expect(line).not.toContain("AGENTS.md");
  });

  it("a fact recorded before this version, its tree holding the practice's files, reads as moved once with the sentence that says why, and a rerun settles it", async () => {
    const { root, commit } = repository();
    commit("open the change", { [ledger(id)]: record("open") });
    commit("feat: find by year\n\nGreenline-Change: 2026-11-10-find-by-year", {
      "src/shelf.js": "export const findByYear = () => [];\n",
    });
    expect(await check(root, "--", node, "-e", "")).toBe(0);
    rewriteTree(root, treeBefore(root));
    const moved = status(root);
    expect(moved.err).toMatch(
      /the code moved after it last ran, no file of the code differs \(counted from [0-9a-f]{12}\): the run's tree held files no commit of the code holds, as a check recorded before this version or a run on uncommitted work leaves it; warning GL0451/,
    );
    expect(status(root, "--change", id).out).toMatch(
      /^ {6}the code moved after it: no file of the code differs \(counted from [0-9a-f]{12}\): the run's tree held files no commit of the code holds/m,
    );
    // The words name no practice file; the path after the code is the record's.
    expect(moved.err.split("; warning GL0451")[0]).not.toContain(".greenline/");
    expect(await check(root, "--", node, "-e", "")).toBe(0);
    const settled = status(root);
    expect(settled.err).not.toContain("GL0451");
    expect(settled.out).not.toContain("the code moved after");
  });
});

describe("J-229 S1 the resume view prints the lacking line", () => {
  const id = "2026-11-10-find-by-year";
  // The record of j217c-workspace-010 as 0.1.0 left it at its build: no yes, ground, agent or floors line.
  const older = (state: string): string =>
    [
      "---",
      "mode: regular",
      "choice: accepted",
      'why: "The desk needs the books published in a range of years, oldest first."',
      `state: ${state}`,
      'next: "build: the owner reads the red tests, then write findByYear and run npm test through greenline check"',
      "---",
      "",
      "## frame",
      "",
      "The ask.",
      "",
    ].join("\n");

  it("prints the line for the run's 0.1.0 record, the yes apart and the older form named, and none for a done record", () => {
    const { root, commit } = repository();
    commit("open the change", { [ledger(id)]: older("open") });
    const resumed = status(root, "--change", id);
    expect(resumed.code).toBe(0);
    expect(resumed.out).toMatch(
      /^record lacks: floors, ground and agent now; .*; the yes now, the owner's words that answered your proposal, never yours: .*; the record has no line at all for yes, floors, ground and agent, the form of a record written before this version: the owner's two ways are to complete it as ordinary work, or to close the change and open it again$/m,
    );
    // The plain status prints the same line, from the same reader.
    const plain = status(root)
      .out.split("\n")
      .find((line) => line.startsWith("record lacks:"));
    expect(resumed.out.split("\n")).toContain(plain);
    commit("close it", { [ledger(id)]: older("done") });
    expect(status(root, "--change", id).out).not.toContain("record lacks:");
  });
});
