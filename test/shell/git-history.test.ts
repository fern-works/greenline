import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitsOfChanges, type GitHistory } from "../../src/core/change-history.ts";
import { commitTreeId } from "../../src/shell/code-tree.ts";
import { changedFiles, codeCommitsSince, readGitHistory } from "../../src/shell/git-history.ts";

const cleanup: string[] = [];

interface Repository {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  /** Write files, stage everything and commit with this message; returns the new commit. */
  readonly commit: (message: string, files: Readonly<Record<string, string | null>>) => string;
}

function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "git-history-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  const commit = (message: string, files: Readonly<Record<string, string | null>>): string => {
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      if (content === null) rmSync(full);
      else {
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, content);
      }
    }
    git("add", "--all");
    git("commit", "--quiet", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  return { root, git, commit };
}

function read(root: string): Extract<GitHistory, { kind: "read" }> {
  const history = readGitHistory(root);
  if (history.kind !== "read") throw new Error(`history is ${history.why}: ${history.detail}`);
  return history;
}

const record = (id: string): string => `.greenline/ledger/${id}.md`;

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("the history reader", () => {
  it("S5 one pass gives each commit's hash, parents, trailers and the paths it touched, newest first", () => {
    const { root, git, commit } = repository();
    const first = commit("one", { "a.txt": "a\n", [record("2026-10-04-w")]: "w\n" });
    const second = commit("two\n\nGreenline-Change: 2026-10-04-x\nGreenline-Change: 2026-10-04-y", {
      [record("2026-10-04-x")]: "r\n",
      "b c.txt": "b\n",
    });
    const third = commit("three", { [record("2026-10-04-x")]: null, "a.txt": "a2\n" });
    expect(read(root)).toEqual({
      kind: "read",
      head: third,
      commits: [
        {
          hash: third,
          parents: [second],
          changes: [],
          paths: [
            { status: "D", path: record("2026-10-04-x") },
            { status: "M", path: "a.txt" },
          ],
        },
        {
          hash: second,
          parents: [first],
          changes: ["2026-10-04-x", "2026-10-04-y"],
          paths: [
            { status: "A", path: record("2026-10-04-x") },
            { status: "A", path: "b c.txt" },
          ],
        },
        {
          hash: first,
          parents: [],
          changes: [],
          paths: [
            { status: "A", path: record("2026-10-04-w") },
            { status: "A", path: "a.txt" },
          ],
        },
      ],
    });
    expect(git("rev-parse", "HEAD")).toBe(third);
  });

  it("S5 a rename reads as the old path deleted and the new one added", () => {
    const { root, git, commit } = repository();
    commit("one", { "old/name.txt": "the same content\n", [record("2026-10-04-w")]: "w\n" });
    mkdirSync(join(root, "new"));
    git("mv", "old/name.txt", "new/name.txt");
    git("commit", "--quiet", "-m", "move");
    expect(read(root).commits[0]?.paths).toEqual([
      { status: "A", path: "new/name.txt" },
      { status: "D", path: "old/name.txt" },
    ]);
  });

  it("S5 the root commit's paths are read whatever the owner's log.showRoot says", () => {
    const { root, git, commit } = repository();
    git("config", "log.showRoot", "false");
    commit("one", { "a.txt": "a\n", [record("2026-10-04-w")]: "w\n" });
    expect(read(root).commits[0]?.paths).toEqual([
      { status: "A", path: record("2026-10-04-w") },
      { status: "A", path: "a.txt" },
    ]);
  });

  it("S5 a merge lists its parents and no paths", () => {
    const { root, git, commit } = repository();
    commit("one", { "a.txt": "a\n", [record("2026-10-04-w")]: "w\n" });
    git("checkout", "--quiet", "-b", "side");
    const side = commit("side", { "s.txt": "s\n" });
    git("checkout", "--quiet", "-");
    const main = commit("main", { "m.txt": "m\n" });
    git("merge", "--quiet", "--no-edit", "side");
    const [merge] = read(root).commits;
    expect(merge).toMatchObject({ parents: [main, side], paths: [] });
  });

  it("S5 reading history writes nothing in the owner's repository", () => {
    const { root, git, commit } = repository();
    commit("one", { "a.txt": "a\n" });
    writeFileSync(join(root, "untracked.txt"), "u\n");
    const index = readFileSync(join(root, ".git", "index"));
    const objects = git("count-objects", "-v");
    const status = git("status", "--porcelain");
    read(root);
    expect(readFileSync(join(root, ".git", "index")).equals(index)).toBe(true);
    expect(git("count-objects", "-v")).toBe(objects);
    expect(git("status", "--porcelain")).toBe(status);
  });

  it("S6 history is read only from the commit that first touched a change record", () => {
    const { root, commit } = repository();
    commit("before", { "a.txt": "a\n" });
    commit("also before", { "b.txt": "b\n" });
    const opens = commit("opens", { [record("2026-10-04-x")]: "x\n" });
    const after = commit("after", { "a.txt": "a2\n" });
    expect(read(root).commits.map((each) => each.hash)).toEqual([after, opens]);
  });

  it("S6 a first record opened on a branch bounds the history from there, the merge included", () => {
    const { root, git, commit } = repository();
    commit("base", { "a.txt": "a\n" });
    git("checkout", "--quiet", "-b", "side");
    const opens = commit("opens", { [record("2026-10-04-x")]: "x\n" });
    git("checkout", "--quiet", "-");
    const main = commit("main", { "m.txt": "m\n" });
    git("merge", "--quiet", "--no-edit", "side");
    const merge = git("rev-parse", "HEAD");
    expect(new Set(read(root).commits.map((each) => each.hash))).toEqual(
      new Set([merge, main, opens]),
    );
  });

  it("S6 a history no change record ever entered reads no commit", () => {
    const { root, commit } = repository();
    commit("one", { "a.txt": "a\n" });
    const head = commit("two", { ".greenline/ledger/README.md": "guide\n" });
    expect(readGitHistory(root)).toEqual({ kind: "read", head, commits: [] });
  });

  it("S5 a repository with no commit has a readable, empty history", () => {
    const { root } = repository();
    expect(readGitHistory(root)).toEqual({ kind: "read", head: undefined, commits: [] });
  });
});

describe("the files that changed after a commit", () => {
  it("S6 between two commits: every path that differs, .greenline left out", () => {
    const { root, commit } = repository();
    const from = commit("one", { "a.txt": "a\n", "gone.txt": "g\n" });
    const to = commit("two", {
      "a.txt": "a2\n",
      "b c.txt": "b\n",
      "gone.txt": null,
      [record("2026-10-04-x")]: "x\n",
    });
    expect(changedFiles(root, from, { kind: "commit", hash: to })).toEqual({
      kind: "files",
      files: ["a.txt", "b c.txt", "gone.txt"],
    });
  });

  it("S6 against the working tree: changed and untracked files, never an ignored one, and the index is not written", () => {
    const { root, git, commit } = repository();
    const from = commit("one", { "a.txt": "a\n", "same.txt": "s\n", ".gitignore": "*.log\n" });
    writeFileSync(join(root, "a.txt"), "a2\n");
    // Same bytes, older time: git would refresh this entry in the index if it took its optional lock.
    utimesSync(join(root, "same.txt"), new Date(2020, 0, 1), new Date(2020, 0, 1));
    writeFileSync(join(root, "new.txt"), "n\n");
    writeFileSync(join(root, "noise.log"), "l\n");
    mkdirSync(join(root, ".greenline", "tmp"), { recursive: true });
    writeFileSync(join(root, ".greenline", "tmp", "note.md"), "t\n");
    const index = readFileSync(join(root, ".git", "index"));
    expect(changedFiles(root, from, { kind: "working-tree" })).toEqual({
      kind: "files",
      files: ["a.txt", "new.txt"],
    });
    expect(readFileSync(join(root, ".git", "index")).equals(index)).toBe(true);
    expect(git("status", "--porcelain")).toContain("new.txt");
  });

  it("S6 a commit git does not hold answers unknown", () => {
    const { root, commit } = repository();
    commit("one", { "a.txt": "a\n" });
    expect(changedFiles(root, "0".repeat(40), { kind: "working-tree" })).toMatchObject({
      kind: "unknown",
    });
  });
});

describe("history that cannot say", () => {
  it("S5 a shallow clone answers unknown", () => {
    const { root, commit } = repository();
    commit("one", { "a.txt": "a\n" });
    commit("two", { "a.txt": "b\n" });
    const clone = mkdtempSync(join(tmpdir(), "git-history-shallow-"));
    cleanup.push(clone);
    execFileSync("git", ["clone", "--quiet", "--depth", "1", `file://${root}`, clone]);
    expect(readGitHistory(clone)).toEqual({
      kind: "unknown",
      why: "shallow",
      detail: "the clone is shallow",
    });
  });

  it("S5 a directory that is not a repository answers unknown", () => {
    const plain = mkdtempSync(join(tmpdir(), "git-history-plain-"));
    cleanup.push(plain);
    expect(readGitHistory(plain)).toMatchObject({ kind: "unknown", why: "not-a-repository" });
  });

  it("S5 a log git cannot finish answers unknown", () => {
    const { root, git, commit } = repository();
    commit("one", { "a.txt": "a\n", [record("2026-10-04-w")]: "w\n" });
    commit("two", { "b.txt": "b\n" });
    // A tree the log needs goes missing, as in a broken clone; the commits themselves remain.
    const tree = git("rev-parse", "HEAD~1^{tree}");
    rmSync(join(root, ".git", "objects", tree.slice(0, 2), tree.slice(2)));
    expect(readGitHistory(root)).toMatchObject({ kind: "unknown", why: "unreadable" });
  });

  it("S5 a git that cannot run answers unknown", () => {
    const { root } = repository();
    const path = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      expect(readGitHistory(root)).toMatchObject({ kind: "unknown", why: "no-git" });
    } finally {
      process.env["PATH"] = path;
    }
  });
});

describe("a change's commits in a real repository", () => {
  it("S5 a commit that only carries the trailer and one that only touches the record are both found", () => {
    const { root, commit } = repository();
    const id = "2026-10-04-fix";
    commit("start", { "a.txt": "a\n" });
    const touches = commit("open the record", { [record(id)]: "r\n" });
    const carries = commit(`the fix\n\nGreenline-Change: ${id}`, { "src/fix.ts": "f\n" });
    expect(commitsOfChanges(readGitHistory(root), [id]).get(id)).toEqual({
      kind: "known",
      commits: [
        { hash: carries, shared: false },
        { hash: touches, shared: false },
      ],
      files: ["src/fix.ts"],
    });
  });

  it("S5 a planning change and its tickets interleaved on one branch each get their own commits and files", () => {
    const { root, commit } = repository();
    const plan = "2026-10-04-plan-login";
    const form = "2026-10-04-ticket-form";
    const api = "2026-10-04-ticket-api";
    const p1 = commit("plan", {
      [record(plan)]: "p\n",
      ".greenline/plans/003-login/tickets.md": "t\n",
    });
    const f1 = commit("form opens", { [record(form)]: "f\n" });
    const a1 = commit(`api\n\nGreenline-Change: ${api}`, { "src/api.ts": "a\n" });
    const f2 = commit(`form\n\nGreenline-Change: ${form}`, { "src/form.ts": "f\n" });
    const p2 = commit("plan closes", { [record(plan)]: "p2\n" });
    const answers = commitsOfChanges(readGitHistory(root), [plan, form, api]);
    expect(answers.get(plan)).toEqual({
      kind: "known",
      commits: [
        { hash: p2, shared: false },
        { hash: p1, shared: false },
      ],
      files: [],
    });
    expect(answers.get(form)).toEqual({
      kind: "known",
      commits: [
        { hash: f2, shared: false },
        { hash: f1, shared: false },
      ],
      files: ["src/form.ts"],
    });
    expect(answers.get(api)).toEqual({
      kind: "known",
      commits: [{ hash: a1, shared: false }],
      files: ["src/api.ts"],
    });
  });

  it("S5 a squash that holds two records is shared, and both changes keep it", () => {
    const { root, commit } = repository();
    const squash = commit("squash", {
      [record("2026-10-04-a")]: "a\n",
      [record("2026-10-04-b")]: "b\n",
      "src/both.ts": "x\n",
    });
    const answers = commitsOfChanges(readGitHistory(root), ["2026-10-04-a", "2026-10-04-b"]);
    for (const id of ["2026-10-04-a", "2026-10-04-b"])
      expect(answers.get(id)).toEqual({
        kind: "known",
        commits: [{ hash: squash, shared: true }],
        files: ["src/both.ts"],
      });
  });
});

describe("J-89 S2 the commits of code since a check's commit", () => {
  it("lists the commits HEAD reaches after the commit that change code, newest first, a record's commit left out, with the oldest's code tree", () => {
    const { root, commit } = repository();
    const checked = commit("one", { "a.txt": "a\n", [record("2026-10-18-x")]: "x\n" });
    const letter = commit("the letter", { "src/letter.ts": "l\n" });
    commit("the record", { [record("2026-10-18-x")]: "x, built\n" });
    const fine = commit("the fine", { "src/fine.ts": "f\n" });
    const since = codeCommitsSince(root, checked);
    expect(since).toEqual({
      kind: "commits",
      hashes: [fine, letter],
      oldestTree: commitTreeId(root, letter),
    });
    expect(codeCommitsSince(root, fine)).toEqual({
      kind: "commits",
      hashes: [],
      oldestTree: undefined,
    });
  });

  it("reads every commit of code for a run that recorded no commit, and none in a repository with no commit", () => {
    const empty = repository();
    expect(codeCommitsSince(empty.root, null)).toEqual({
      kind: "commits",
      hashes: [],
      oldestTree: undefined,
    });
    const { root, commit } = repository();
    const first = commit("one", { "a.txt": "a\n" });
    commit("the record", { [record("2026-10-18-x")]: "x\n" });
    expect(codeCommitsSince(root, null)).toMatchObject({ kind: "commits", hashes: [first] });
  });

  it("answers unknown for a commit HEAD no longer reaches", () => {
    const { root, git, commit } = repository();
    commit("one", { "a.txt": "a\n" });
    const replaced = commit("two", { "b.txt": "b\n" });
    git("reset", "--quiet", "--hard", "HEAD~1");
    commit("two again", { "b.txt": "b, again\n" });
    expect(codeCommitsSince(root, replaced)).toMatchObject({ kind: "unknown" });
  });
});
