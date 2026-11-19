import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LOCK_SCHEMA_VERSION, serializeLock } from "../../src/core/lock.ts";
import {
  commitTreeByIndex,
  commitTreeId,
  commitTreeIds,
  headCommit,
  OncePerState,
  pinnedHead,
  readGit,
  withPinnedHead,
  workingTreeChanges,
  workingTreeId,
} from "../../src/shell/code-tree.ts";

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

describe("J-154 S2 a commit's code tree from one read, and a pinned reading", () => {
  it("hashes a commit's top tree without .greenline to the id the temporary index writes", () => {
    const { root, git } = repository();
    // Nested folders, an executable, a link, a name with a tab and a space, and the ledger beside them.
    mkdirSync(join(root, "src", "deep"), { recursive: true });
    writeFileSync(join(root, "src", "deep", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "run.sh"), "#!/bin/sh\n");
    chmodSync(join(root, "run.sh"), 0o755);
    symlinkSync("run.sh", join(root, "link"));
    writeFileSync(join(root, "odd name here"), "odd\n");
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", "2026-10-04-a.md"), "record\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    // A commit of the ledger alone: its code tree is the empty tree.
    const ledgerOnly = repository();
    mkdirSync(join(ledgerOnly.root, ".greenline"), { recursive: true });
    writeFileSync(join(ledgerOnly.root, ".greenline", "manifest.json"), "{}\n");
    ledgerOnly.git("add", "--all");
    ledgerOnly.git("commit", "--quiet", "-m", "ledger");
    for (const [where, commit] of [
      [root, git("rev-parse", "HEAD")],
      [ledgerOnly.root, ledgerOnly.git("rev-parse", "HEAD")],
    ] as const) {
      const byIndex = commitTreeByIndex(where, commit);
      expect(byIndex.kind).toBe("tree");
      expect(commitTreeId(where, commit)).toEqual(byIndex);
    }
    // The batch, every commit in one read, gives the same ids; a name git does not hold is answered unknown.
    git("commit", "--quiet", "--allow-empty", "-m", "two");
    const both = [git("rev-parse", "HEAD~1"), git("rev-parse", "HEAD")];
    const missing = "0".repeat(40);
    const batch = commitTreeIds(root, [...both, missing]);
    for (const commit of both) expect(batch.get(commit)).toEqual(commitTreeByIndex(root, commit));
    expect(batch.get(missing)?.kind).toBe("unknown");
    expect(commitTreeId(ledgerOnly.root, ledgerOnly.git("rev-parse", "HEAD"))).toEqual({
      kind: "tree",
      id: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    });
  });

  it("asks each read-only question once within a pinned reading, and again outside it", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    const first = git("rev-parse", "HEAD");
    const ask = (): string => {
      const read = readGit(root, ["rev-parse", "HEAD"]);
      return read._tag === "ok" ? read.value.trim() : "";
    };
    const pinned = withPinnedHead(root, () => {
      const one = ask();
      git("commit", "--quiet", "--allow-empty", "-m", "two");
      return { one, two: ask(), head: pinnedHead(root) };
    });
    expect(pinned).toEqual({ one: first, two: first, head: first });
    expect(pinnedHead(root)).toBeUndefined();
    expect(ask()).not.toBe(first);
  });

  it("makes a reading once for the state the pinned readings name, again for another state, and each time outside one", () => {
    const { root, git } = repository();
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    const once = new OncePerState<number>();
    let made = 0;
    const make = (): number => {
      made += 1;
      return made;
    };
    const inState = (state: string): number =>
      withPinnedHead(root, () => once.answer(root, make), state);
    expect([inState("one"), inState("one")]).toEqual([1, 1]);
    expect(inState("two")).toBe(2);
    expect(withPinnedHead(root, () => once.answer(root, make))).toBe(3);
    expect(once.answer(root, make)).toBe(4);
  });
});

/** A lock naming these paths as greenline's, as sync writes it. */
function lockNaming(paths: readonly string[]): string {
  return serializeLock({
    schemaVersion: LOCK_SCHEMA_VERSION,
    cliVersion: "0.2.0",
    installationRevision: "c".repeat(64),
    sources: [],
    files: new Map(paths.map((path) => [path, "d".repeat(64)])),
  });
}

/** The practice's files a sync writes, as the run's workspace held them (j217c-workspace-010). */
const INSTALLED = [
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/settings.json",
  ".agents/skills/build/SKILL.md",
  ".agents/skills/build/references/greenline.md",
  ".claude/skills/build/SKILL.md",
  "agents/openai.yaml",
  ".greenline/WORK.md",
];

/** A repository with the practice installed and committed, the owner's code beside it. */
function installed(): Repository & { readonly write: (path: string, text: string) => void } {
  const space = repository();
  const write = (path: string, text: string): void => {
    mkdirSync(join(space.root, path, ".."), { recursive: true });
    writeFileSync(join(space.root, path), text);
  };
  write("src/a.ts", "export const a = 1;\n");
  // The owner's own file in a folder the lock also writes into stays code.
  write(".claude/agents/mine.md", "the owner's agent\n");
  for (const path of INSTALLED) write(path, `${path}, as 0.1.0 wrote it\n`);
  write(".greenline/lock.json", lockNaming(INSTALLED));
  space.git("add", "--all");
  space.git("commit", "--quiet", "-m", "install");
  return { ...space, write };
}

describe("J-229 S1 the practice's files leave the code's tree", () => {
  it("a check run before a sync rewrites the installed files still reads on the final code", () => {
    const { root, write } = installed();
    const before = treeOf(root);
    // What a sync does: the installed files change, a skill is added, and the lock names it.
    for (const path of INSTALLED) write(path, `${path}, as 0.2.0 writes it\n`);
    write(".agents/skills/anatomy/SKILL.md", "a new skill\n");
    write(".greenline/lock.json", lockNaming([...INSTALLED, ".agents/skills/anatomy/SKILL.md"]));
    expect(treeOf(root)).toBe(before);
    expect(workingTreeChanges(root, "HEAD")).toEqual({ kind: "files", files: [] });
  });

  it("a check run while the installation stands uncommitted reads on the commit of the change's code alone", () => {
    const { root, git, write } = installed();
    for (const path of INSTALLED) write(path, `${path}, as 0.2.0 writes it\n`);
    write("src/a.ts", "export const a = 2;\n");
    const ran = treeOf(root);
    git("add", "src/a.ts");
    git("commit", "--quiet", "-m", "the change's code");
    expect(commitTreeId(root, git("rev-parse", "HEAD"))).toEqual({ kind: "tree", id: ran });
    expect(commitTreeByIndex(root, git("rev-parse", "HEAD"))).toEqual({ kind: "tree", id: ran });
  });

  it("a code file edited after the check still moves the tree and is named, and no installed file ever is", () => {
    const { root, write } = installed();
    const before = treeOf(root);
    write("src/a.ts", "export const a = 3;\n");
    write(".claude/agents/mine.md", "the owner's agent, edited\n");
    for (const path of INSTALLED) write(path, `${path}, edited\n`);
    expect(treeOf(root)).not.toBe(before);
    expect(workingTreeChanges(root, "HEAD")).toEqual({
      kind: "files",
      files: [".claude/agents/mine.md", "src/a.ts"],
    });
  });

  it("a working tree and the commit made of it still give one id, by the batch and by the index alike", () => {
    const { root, git } = installed();
    const head = git("rev-parse", "HEAD");
    const byIndex = commitTreeByIndex(root, head);
    expect(byIndex).toEqual({ kind: "tree", id: treeOf(root) });
    expect(commitTreeId(root, head)).toEqual(byIndex);
    git("commit", "--quiet", "--allow-empty", "-m", "two");
    const both = commitTreeIds(root, [head, git("rev-parse", "HEAD")]);
    expect([...both.values()]).toEqual([byIndex, byIndex]);
    // The commit's own tree holds the installed files, so the rule is what makes the two agree.
    expect(git("rev-parse", "HEAD^{tree}")).not.toBe(treeOf(root));
  });

  it("a lock that cannot be read leaves .greenline/ alone out of the tree", () => {
    const { root, write } = installed();
    write(".greenline/lock.json", "not a lock\n");
    const before = treeOf(root);
    write("AGENTS.md", "the block, rewritten\n");
    expect(treeOf(root)).not.toBe(before);
    write(".greenline/WORK.md", "the work guide, rewritten\n");
    const after = treeOf(root);
    write(".greenline/ledger/r.md", "a record\n");
    expect(treeOf(root)).toBe(after);
  });

  it("one process asks a commit's code tree, the lock's list changes, and asking again gives the new tree", () => {
    const { root, git, write } = installed();
    const head = git("rev-parse", "HEAD");
    const first = commitTreeId(root, head);
    write(".greenline/lock.json", lockNaming(INSTALLED.filter((path) => path !== "AGENTS.md")));
    const second = commitTreeId(root, head);
    expect(second.kind).toBe("tree");
    expect(second).not.toEqual(first);
    expect(second).toEqual(commitTreeByIndex(root, head));
    expect(commitTreeIds(root, [head, head])).toEqual(new Map([[head, second]]));
  });
});

describe("J-232 S1 an edit in the second the owner's index was written", () => {
  // Git trusts a file's stat only when the file is older than the index that
  // recorded it; an entry written in the index's own second is read again. The
  // times are set here, not waited for: the file, its entry and the owner's
  // index all in one past second, then an edit of the same size in that second.
  // The ctime cannot be set, so the repository leaves it out of the stat, as
  // an edit in the same second leaves it equal.
  it("names a file edited at the same size in the second its entry and the index were written", () => {
    const { root, git } = repository();
    git("config", "core.trustctime", "false");
    const path = join(root, "src/a.ts");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(path, "export const a = 1;\n");
    const second = Math.floor(Date.now() / 1000) - 60;
    utimesSync(path, second, second);
    git("add", "--all");
    git("commit", "--quiet", "-m", "one");
    const commitTree = treeOf(root);
    writeFileSync(path, "export const a = 3;\n");
    utimesSync(path, second, second);
    utimesSync(join(root, ".git/index"), second, second);
    expect(workingTreeChanges(root, "HEAD")).toEqual({ kind: "files", files: ["src/a.ts"] });
    expect(treeOf(root)).not.toBe(commitTree);
    // Git itself, on the owner's index, sees the edit.
    expect(git("diff-files", "--name-only")).toBe("src/a.ts");
  });
});
