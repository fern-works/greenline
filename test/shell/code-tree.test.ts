import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitTreeId, headCommit, workingTreeId } from "../../src/shell/code-tree.ts";

const roots: string[] = [];

interface Repository {
  readonly root: string;
  readonly git: (...args: string[]) => string;
}

function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "code-tree-"));
  roots.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  return { root, git };
}

function treeOf(root: string): string {
  const reading = workingTreeId(root);
  if (reading.kind !== "tree") throw new Error(reading.reason);
  return reading.id;
}

/** How many objects the repository's store holds, loose and packed. */
function objectCount(git: Repository["git"]): number {
  const output = git("count-objects", "-v");
  const field = (name: string): number =>
    Number(new RegExp(`^${name}: (\\d+)$`, "m").exec(output)?.[1] ?? Number.NaN);
  return field("count") + field("in-pack");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the tree id of the code", () => {
  it("S4 the working tree and the commit made of it give the same tree id, .greenline left out of both", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", "2026-10-04-a.md"), "record\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    const commit = git("rev-parse", "HEAD");
    expect(commitTreeId(root, commit)).toEqual({ kind: "tree", id: treeOf(root) });
    expect(headCommit(root)).toEqual({ kind: "commit", id: commit });
    // The commit's own tree holds .greenline, so the rule is what makes the two agree.
    expect(git("rev-parse", "HEAD^{tree}")).not.toBe(treeOf(root));
  });

  it("S4 a tracked file an ignore rule matches stays in the tree id, so working tree and commit still agree", () => {
    const { root, git } = repository();
    mkdirSync(join(root, ".vscode"));
    writeFileSync(join(root, ".vscode", "settings.json"), "{}\n");
    writeFileSync(join(root, ".gitignore"), ".vscode/\n");
    git("add", ".gitignore");
    git("add", "--force", ".vscode/settings.json");
    git("commit", "--quiet", "-m", "one");
    expect(commitTreeId(root, git("rev-parse", "HEAD"))).toEqual({
      kind: "tree",
      id: treeOf(root),
    });
    writeFileSync(join(root, ".vscode", "settings.json"), '{ "changed": true }\n');
    expect(commitTreeId(root, git("rev-parse", "HEAD"))).not.toEqual({
      kind: "tree",
      id: treeOf(root),
    });
  });

  it("S4 an older commit whose ledger changed later still has its tree id", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", "r.md"), "one\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    const first = git("rev-parse", "HEAD");
    const before = treeOf(root);
    writeFileSync(join(root, ".greenline", "ledger", "r.md"), "two\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "two");
    expect(commitTreeId(root, first)).toEqual({ kind: "tree", id: before });
  });

  it("S4 reading the tree id writes no file under .greenline into git's object store", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", "facts.json"), "unique ledger bytes 4e1c\n");
    const blob = git("hash-object", ".greenline/ledger/facts.json");
    treeOf(root);
    expect(() =>
      execFileSync("git", ["cat-file", "-e", blob], { cwd: root, stdio: "ignore" }),
    ).toThrow();
  });

  it("S4 reading the working tree's id writes nothing into the owner's object store", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", "a.txt");
    git("commit", "--quiet", "-m", "one");
    writeFileSync(join(root, "untracked.txt"), "a token only this file holds 9c2e\n");
    writeFileSync(join(root, "a.txt"), "a, modified\n");
    const blob = git("hash-object", "untracked.txt");
    const before = objectCount(git);
    expect(workingTreeId(root).kind).toBe("tree");
    expect(objectCount(git)).toBe(before);
    expect(() =>
      execFileSync("git", ["cat-file", "-e", blob], { cwd: root, stdio: "ignore" }),
    ).toThrow();
  });

  it("S4 reading a commit's id writes nothing into the owner's object store", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", "r.md"), "one\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    const before = objectCount(git);
    const reading = commitTreeId(root, git("rev-parse", "HEAD"));
    expect(reading.kind).toBe("tree");
    expect(objectCount(git)).toBe(before);
    // The tree without .greenline is a new tree, so had it been written the count would have moved.
    expect(reading).not.toEqual({ kind: "tree", id: git("rev-parse", "HEAD^{tree}") });
  });

  it("S4 a linked worktree reads its repository's store and gives the same ids, writing nothing", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", "a.txt");
    git("commit", "--quiet", "-m", "one");
    const worktree = mkdtempSync(join(tmpdir(), "code-tree-worktree-"));
    roots.push(worktree);
    rmSync(worktree, { recursive: true, force: true });
    git("worktree", "add", "--quiet", worktree, "-b", "side");
    writeFileSync(join(worktree, "b.txt"), "b\n");
    const before = objectCount(git);
    const tree = workingTreeId(worktree);
    expect(tree.kind).toBe("tree");
    expect(objectCount(git)).toBe(before);
    expect(commitTreeId(worktree, "HEAD")).not.toEqual(tree);
    rmSync(join(worktree, "b.txt"));
    expect(commitTreeId(worktree, "HEAD")).toEqual(workingTreeId(worktree));
  });

  it("S4 a ledger file git cannot read leaves the tree id readable, since .greenline is never read", () => {
    const { root } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    const before = treeOf(root);
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    const locked = join(root, ".greenline", "ledger", "being-written.tmp");
    writeFileSync(locked, "half a facts file\n");
    chmodSync(locked, 0o000);
    try {
      expect(workingTreeId(root)).toEqual({ kind: "tree", id: before });
    } finally {
      chmodSync(locked, 0o600);
    }
  });

  it("S4 a repository whose path holds the alternates separator still gives its tree ids", () => {
    const parent = mkdtempSync(join(tmpdir(), "code-tree-parent-"));
    roots.push(parent);
    const root = join(parent, `left${delimiter}right`);
    mkdirSync(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      }).trim();
    git("init", "--quiet");
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", "a.txt");
    git("commit", "--quiet", "-m", "one");
    expect(commitTreeId(root, git("rev-parse", "HEAD"))).toEqual({
      kind: "tree",
      id: treeOf(root),
    });
  });

  it("S4 a change under .greenline leaves the tree id as it was", () => {
    const { root } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    const before = treeOf(root);
    mkdirSync(join(root, ".greenline", "ledger", "x", "checks"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", "x", "checks", "f.json"), "{}\n");
    expect(treeOf(root)).toBe(before);
  });

  it("S4 an untracked file git would add moves the tree id, and an ignored one does not", () => {
    const { root } = repository();
    writeFileSync(join(root, ".gitignore"), "build/\n");
    writeFileSync(join(root, "a.txt"), "a\n");
    const before = treeOf(root);
    mkdirSync(join(root, "build"));
    writeFileSync(join(root, "build", "out.js"), "ignored\n");
    expect(treeOf(root)).toBe(before);
    writeFileSync(join(root, "new.txt"), "untracked\n");
    expect(treeOf(root)).not.toBe(before);
  });

  it("S4 reading the tree id leaves the owner's index and staged changes untouched", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", "a.txt");
    git("commit", "--quiet", "-m", "one");
    writeFileSync(join(root, "a.txt"), "staged\n");
    git("add", "a.txt");
    writeFileSync(join(root, "a.txt"), "unstaged\n");
    writeFileSync(join(root, "untracked.txt"), "u\n");
    const index = readFileSync(join(root, ".git", "index"));
    const status = git("status", "--porcelain");
    treeOf(root);
    expect(readFileSync(join(root, ".git", "index")).equals(index)).toBe(true);
    expect(git("status", "--porcelain")).toBe(status);
  });

  it("S4 a repository with no commit has a tree id and no commit", () => {
    const { root } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    expect(workingTreeId(root).kind).toBe("tree");
    expect(headCommit(root)).toEqual({ kind: "none" });
  });

  it("S4 a directory that is not a repository is reported as unknown, never thrown", () => {
    const root = mkdtempSync(join(tmpdir(), "code-tree-plain-"));
    roots.push(root);
    expect(workingTreeId(root).kind).toBe("unknown");
    expect(commitTreeId(root, "HEAD").kind).toBe("unknown");
    expect(headCommit(root).kind).toBe("unknown");
  });
});
