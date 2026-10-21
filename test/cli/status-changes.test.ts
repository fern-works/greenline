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
    expect(broken.err).toContain(
      "ERROR GL0401: the change record '2026-10-04-broken' does not parse",
    );
    const { root: quiet, commit: commitQuiet } = repository();
    commitQuiet("done", { [ledger("2026-10-04-done")]: record("done", [], QUICK_BODY) });
    const notice = status(quiet);
    expect(notice.err).toContain("WARNING GL0456");
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
      "WARNING GL0451: the code of '2026-10-04-typo' moved after the check",
    );
    expect(moved.err).toContain("a.txt, new.txt changed");
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
    expect(result.err).toContain(
      "ERROR GL0404: the done change '2026-10-04-typo' ended with the check",
    );
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
      expect(result.err).toContain("ERROR GL0401");
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
    expect(unknown.err).toContain("GL0001: no change record '2026-10-04-nothing'");
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
      "ERROR GL0406: the ticket 'T1' of the plan '001-login' opened under 'quick', the mode the owner named as it opened (choice: owner)",
    );
    expect(owned.err).toContain("the owner's override stands");
    expect(owned.err).toContain(
      "ERROR GL0407: the planning change '2026-10-14-plan' runs under 'regular', the mode the owner named (choice: owner)",
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
    expect(failing.err).toContain("ERROR GL0406: the ticket 'T1' of the plan '001-login'");
    expect(failing.err).toContain("ERROR GL0407: the planning change '2026-10-14-plan'");

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
    expect(red.err).toContain("ERROR GL0404");
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
      `WARNING GL0459: the check facts '${listFilesRecursive(folder)[0] ?? ""}' of '${id}' follow '${first ?? ""}', which is not in its folder`,
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
    expect(status(root).err).toContain("ERROR GL0404");
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
      `ERROR GL0408: the brief 'brief-review-2.md' of '${id}' carries no mark of greenline brief on its first line`,
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
