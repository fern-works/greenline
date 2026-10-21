import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (the gate-outcome precedent)
import { checkCommit, parseCommits, walkPlan } from "../../scripts/lib/commit-subject.mjs";
// @ts-expect-error plain-mjs gate helper, no declaration file; one directive per import line
import { checkMessage, messageRefusal } from "../../scripts/lib/commit-subject.mjs";

/** The commit-subject row (step 6, ruling 6): the shape docs/SHIPPING.md states, and the walk. */
const trailer = "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>";
const good = {
  subject: "fix(gate): the row reads HEAD",
  body: `The mechanism and the why.\n\n${trailer}`,
};

describe("checkCommit", () => {
  it("accepts type(scope): outcome with a body and the trailer, with or without a scope", () => {
    expect(checkCommit(good)).toEqual([]);
    expect(checkCommit({ ...good, subject: "docs: a scopeless subject" })).toEqual([]);
  });
  it("accepts a subject of exactly 72 characters and refuses one of 73", () => {
    const seventyTwo = `docs(plans): ${"x".repeat(59)}`;
    expect(seventyTwo).toHaveLength(72);
    expect(checkCommit({ ...good, subject: seventyTwo })).toEqual([]);
    expect(checkCommit({ ...good, subject: `${seventyTwo}x` })).toEqual([
      "subject is 73 characters (cap 72)",
    ]);
  });
  it("refuses a type not in use", () => {
    expect(checkCommit({ ...good, subject: "style(x): tidy" })).toEqual([
      "subject is not type(scope): outcome with one of docs, feat, fix, refactor, qa, chore, export",
    ]);
  });
  it("refuses wip and a bare fixes as the outcome or the subject's first word", () => {
    expect(checkCommit({ ...good, subject: "fix: wip" })).toContain(
      "the outcome is wip or a bare fixes",
    );
    expect(checkCommit({ ...good, subject: "fixes" })).toContain(
      "the outcome is wip or a bare fixes",
    );
    expect(checkCommit({ ...good, subject: "wip: a thing" })).toContain(
      "the outcome is wip or a bare fixes",
    );
  });
  it("wants a prose body unless the subject is the accounting or the release formula", () => {
    expect(checkCommit({ subject: "feat(cli): a thing", body: trailer })).toEqual(["no body"]);
    expect(
      checkCommit({ subject: "docs(ledger): record D; the plan notes D", body: trailer }),
    ).toEqual([]);
    expect(
      checkCommit({ subject: "release: v0.0.2, what a consumer gets", body: trailer }),
    ).toEqual([]);
  });
  it("takes the release formula with its comma only, as docs/SHIPPING.md names it, and refuses the em dash form", () => {
    expect(
      checkCommit({
        subject: "release: v0.1.0, three modes and a record for every change",
        body: trailer,
      }),
    ).toEqual([]);
    expect(
      checkCommit({ subject: "release: v0.0.2 \u2014 what a consumer gets", body: trailer }),
    ).toEqual([
      "subject is not type(scope): outcome with one of docs, feat, fix, refactor, qa, chore, export",
      "no body",
    ]);
    expect(checkCommit({ subject: "release: v0.1.0,", body: trailer })).toContain("no body");
  });
  it("strips only the trailer block, so a colon-led prose line still counts as a body", () => {
    expect(
      checkCommit({
        subject: "fix(gate): a thing",
        body: `Ruling: the operator's word, 2026-09-12.\n\n${trailer}`,
      }),
    ).toEqual([]);
  });
  it("refuses a trailer that is not the body's last paragraph", () => {
    expect(
      checkCommit({
        subject: "fix(gate): a thing",
        body: `${trailer}\n\nProse after the trailer.`,
      }),
    ).toEqual(["the Co-Authored-By trailer is not the body's last paragraph"]);
  });
  it("wants the trailer on every commit, in either spelling", () => {
    expect(checkCommit({ subject: "feat(cli): a thing", body: "Why." })).toEqual([
      "no Co-Authored-By trailer",
    ]);
    expect(
      checkCommit({ ...good, body: "Why.\n\nCo-authored-by: Someone <s@example.com>" }),
    ).toEqual([]);
  });
});

describe("walkPlan", () => {
  it("asserts HEAD alone without --full", () => {
    expect(walkPlan({ full: false, shallow: true, cut: "abc" })).toEqual({
      ranges: [["-1"]],
      skipped: undefined,
    });
  });
  it("walks from the cut forward, the cut included, under --full", () => {
    expect(walkPlan({ full: true, shallow: false, cut: "abc" })).toEqual({
      ranges: [["abc^..HEAD"]],
      skipped: undefined,
    });
  });
  it("skips the walk with its reason on a shallow clone or with no cut, and still asserts HEAD", () => {
    expect(walkPlan({ full: true, shallow: true, cut: "abc" })).toEqual({
      ranges: [["-1"]],
      skipped: "shallow clone: HEAD checked, the walk from the cut needs history",
    });
    expect(walkPlan({ full: true, shallow: false, cut: undefined }).ranges).toEqual([["-1"]]);
  });
});

it("parseCommits reads the log's hash, subject and body records, a missing body as empty", () => {
  const text = `abc\0fix(x): one\0Body one.\n\n${trailer}\n\x1e\ndef\0docs(ledger): record D; the plan notes D\x1e`;
  expect(parseCommits(text)).toEqual([
    { hash: "abc", subject: "fix(x): one", body: `Body one.\n\n${trailer}` },
    { hash: "def", subject: "docs(ledger): record D; the plan notes D", body: "" },
  ]);
});

/** The same rules before the commit (procedures-on-the-line S2, R14 and R24):
 * a message file read as git reads it, checked by the helper the row uses. */
describe("checkMessage", () => {
  const scratch: string[] = [];
  afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  it("reads a message file as git stores it: comment lines and the scissors' tail dropped", () => {
    const text = [
      "fix(gate): the row reads HEAD",
      "# a comment git strips",
      "",
      "The mechanism and the why.",
      "",
      trailer,
      "# ------------------------ >8 ------------------------",
      "diff --git a/x b/x",
    ].join("\n");
    expect(checkMessage(text)).toEqual({ subject: good.subject, problems: [] });
  });
  it("keeps comment lines without strip, as git commit -F stores them, so they count", () => {
    const text = `# draft\n${good.subject}\n\n${good.body}\n`;
    expect(checkMessage(text).problems).toEqual([]);
    expect(checkMessage(text, { strip: false })).toEqual({
      subject: `# draft ${good.subject}`,
      problems: checkCommit({ subject: `# draft ${good.subject}`, body: good.body }),
    });
    expect(messageRefusal(text, { strip: false })).toContain("commit subject refused: # draft");
  });
  it("refuses exactly what the history row refuses, in the row's own words", () => {
    for (const commit of [
      good,
      { subject: "feat(cli): a thing", body: trailer },
      { subject: "style(x): tidy", body: `Why.\n\n${trailer}` },
      { subject: `docs(plans): ${"x".repeat(60)}`, body: "Why." },
    ])
      expect(checkMessage(`${commit.subject}\n\n${commit.body}\n`).problems).toEqual(
        checkCommit(commit),
      );
    expect(messageRefusal(`${good.subject}\n\n${good.body}\n`)).toBeUndefined();
    expect(messageRefusal("feat: land the fast slice\n")).toBe(
      "commit subject refused: feat: land the fast slice: no body; no Co-Authored-By trailer",
    );
    expect(messageRefusal("\n# only a comment\n")).toBe(
      "commit subject refused: (empty): subject is not type(scope): outcome with one of docs, feat, fix, refactor, qa, chore, export; no body; no Co-Authored-By trailer",
    );
  });
  // The hook is the workshop's. Only the public tree the export builds, which
  // carries no workshop/ (scripts/export/kept.json, "protected"), skips this;
  // in the workshop a missing or unexecutable hook fails.
  it.skipIf(!existsSync(resolve("workshop")))(
    "is the commit-msg hook's rule: git runs the hook, which refuses a bad message and passes a good one",
    () => {
      const hooks = resolve(".githooks");
      expect(statSync(join(hooks, "commit-msg")).mode & 0o111).not.toBe(0);
      const root = mkdtempSync(join(tmpdir(), "commit-msg-"));
      scratch.push(root);
      const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
      execFileSync("git", ["init", "-q"], { cwd: root });
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "Test");
      git("config", "core.hooksPath", hooks);
      writeFileSync(join(root, "x.txt"), "x\n");
      git("add", "x.txt");
      const bad = git("commit", "-q", "-m", "feat: land the fast slice");
      expect(bad.status).not.toBe(0);
      expect(bad.stderr).toContain(
        "commit subject refused: feat: land the fast slice: no body; no Co-Authored-By trailer",
      );
      expect(git("rev-parse", "--verify", "-q", "HEAD").stdout).toBe("");
      const message = join(root, "message.txt");
      writeFileSync(message, `${good.subject}\n\n${good.body}\n`);
      const passed = git("commit", "-q", "-F", message);
      expect(passed.status, passed.stderr).toBe(0);
      expect(git("log", "-1", "--format=%s").stdout.trim()).toBe(good.subject);
    },
  );
});
