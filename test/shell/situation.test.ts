import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderSituationText } from "../../src/core/situation.ts";
import { listFilesRecursive } from "../../src/shell/fs/walk.ts";
import { readRemote, readSituation } from "../../src/shell/situation.ts";

/**
 * The situation line `greenline status` prints above the changes (J-73 S4):
 * read from the tree and `.git` alone, with git read-only and no network
 * command; its goldens on an empty repository, a brownfield one and one with
 * a change stopped on a second branch.
 */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Repository {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (files: Readonly<Record<string, string>>) => void;
  readonly commit: (message: string, files: Readonly<Record<string, string>>) => void;
}

function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "situation-"));
  roots.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("-c", "init.defaultBranch=main", "init", "--quiet");
  const write = (files: Readonly<Record<string, string>>): void => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  };
  const commit = (message: string, files: Readonly<Record<string, string>>): void => {
    write(files);
    git("add", "--all");
    git("commit", "--quiet", "--allow-empty", "-m", message);
  };
  return { root, git, write, commit };
}

const record = (state: string, extra: readonly string[] = []): string =>
  [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "w"',
    `state: ${state}`,
    ...extra,
    "---",
    "",
  ].join("\n");

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

describe("J-73 S4 the situation line", () => {
  it("J-73 S4 an empty repository: no commit, no record, no home, no language, nothing stopped elsewhere", () => {
    const { root } = repository();
    expect(
      renderSituationText(
        readSituation(root, { records: 0, onDisk: new Set(), installed: new Set() }),
      ),
    ).toBe(
      [
        "situation",
        "  commits: none, on main",
        "  change records: none",
        "  knowledge homes: none",
        "  languages: none found",
        "  orientation: groundwork (empty tree)",
        "  stopped on other branches: none",
        "  branches before the practice: none",
        "  remote: none",
        "  ground: no change open; the local facts give branch main, stated before the first edit",
        "",
      ].join("\n"),
    );
  });

  it("J-73 S4 a brownfield repository: its commits, its records, its knowledge homes and the languages at its roots", () => {
    const repo = repository();
    repo.commit("the app", {
      ".gitignore": "node_modules/\ndist/\n",
      "index.ts": "export {};\n",
      "src/app.ts": "export {};\n",
      "src/view.tsx": "export {};\n",
      "src/legacy.js": "module.exports = {};\n",
      "scripts/build.py": "print('x')\n",
      "README.md": "# The app\n",
      "node_modules/dep/index.js": "ignored\n",
      "dist/out.go": "ignored\n",
    });
    repo.commit("the documents", {
      "CONTRIBUTING.md": "# Contributing\n",
      "docs/adr/2026-10-01-storage.md": "# Storage\n",
      "GLOSSARY.md": "# Glossary\n",
      ".greenline/DECISIONS.md": "# Decisions\n",
      ".claude/skills/frame/SKILL.md": "installed\n",
    });
    repo.write({ "tools/lint.rs": "fn main() {}\n" });
    const situation = readSituation(repo.root, {
      records: 2,
      onDisk: new Set(),
      installed: new Set([".claude/skills/frame/SKILL.md"]),
    });
    expect(renderSituationText(situation)).toBe(
      [
        "situation",
        "  commits: 2 on main",
        "  change records: 2",
        "  knowledge homes: .greenline/DECISIONS.md, docs/adr/, GLOSSARY.md, CONTRIBUTING.md",
        "  languages: javascript (src/), python (scripts/), rust (tools/), typescript (., src/)",
        "  orientation: none (a change record exists)",
        "  stopped on other branches: none",
        "  branches before the practice: none",
        "  remote: none",
        "  ground: no change open; the local facts give branch main, stated before the first edit",
        "",
      ].join("\n"),
    );
    expect(situation.homes).toEqual([
      { kind: "decisions", path: ".greenline/DECISIONS.md" },
      { kind: "adr", path: "docs/adr/" },
      { kind: "glossary", path: "GLOSSARY.md" },
      { kind: "contributing", path: "CONTRIBUTING.md" },
    ]);
  });

  it("J-129 S1 a tree of documents without code: the survey of the documents, whatever its commits; the installed files are no documents", () => {
    const repo = repository();
    repo.commit("the plans", {
      "README.md": "# Driftwood\n",
      "docs/brief.md": "# Brief\n",
      "docs/notes.txt": "notes\n",
      "AGENTS.md": "installed\n",
    });
    const situation = readSituation(repo.root, {
      records: 0,
      onDisk: new Set(),
      installed: new Set(["AGENTS.md"]),
    });
    expect(renderSituationText(situation)).toContain(
      "  languages: none found\n  orientation: survey (documents, no code)\n",
    );
    const installedOnly = repository();
    installedOnly.write({ "AGENTS.md": "installed\n", "CLAUDE.md": "installed\n" });
    expect(
      renderSituationText(
        readSituation(installedOnly.root, {
          records: 0,
          onDisk: new Set(),
          installed: new Set(["AGENTS.md", "CLAUDE.md"]),
        }),
      ),
    ).toContain("  orientation: groundwork (empty tree)\n");
    repo.commit("the code", { "src/app.ts": "export {};\n" });
    expect(
      renderSituationText(
        readSituation(repo.root, { records: 0, onDisk: new Set(), installed: new Set() }),
      ),
    ).toContain("  orientation: survey\n");
  });

  it("J-129 S1 a record committed on another branch, local or remote-tracking, any state, means no orientation", () => {
    const repo = repository();
    repo.commit("the plans", { "README.md": "# Driftwood\n" });
    repo.git("checkout", "--quiet", "-b", "greenline/2026-10-01-open");
    repo.commit("open", { ".greenline/ledger/2026-10-01-open.md": record("open") });
    repo.git("checkout", "--quiet", "main");
    const none = (root: string): string =>
      renderSituationText(
        readSituation(root, { records: 0, onDisk: new Set(), installed: new Set() }),
      );
    expect(none(repo.root)).toContain("  orientation: none (a change record exists)\n");
    // The same record on a remote-tracking branch alone, as a clone brings it.
    const tip = repo.git("rev-parse", "greenline/2026-10-01-open");
    repo.git("update-ref", "refs/remotes/origin/greenline/2026-10-01-open", tip);
    repo.git("branch", "--quiet", "-D", "greenline/2026-10-01-open");
    expect(none(repo.root)).toContain("  orientation: none (a change record exists)\n");
    // The ledger's own guide is no change record.
    const guide = repository();
    guide.commit("install", { ".greenline/ledger/README.md": "# Change records\n" });
    expect(none(guide.root)).toContain("  orientation: survey\n");
  });

  it("J-73 S4 a contributing guide in .github or docs and a glossary map are knowledge homes; a differently cased name is not", () => {
    const repo = repository();
    repo.write({
      ".github/CONTRIBUTING.md": "# Contributing\n",
      "docs/CONTRIBUTING.md": "# Contributing\n",
      "GLOSSARY-MAP.md": "# Contexts\n",
      "glossary.md": "lower case\n",
    });
    expect(
      readSituation(repo.root, { records: 0, onDisk: new Set(), installed: new Set() }).homes.map(
        (home) => home.path,
      ),
    ).toEqual(["GLOSSARY-MAP.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]);
  });

  it("J-73 S4 a change stopped on a second branch is named by its id; a finished one, one on a branch that is not greenline's, the current branch's and one on disk are not", () => {
    const repo = repository();
    repo.commit("start", { "a.txt": "a\n" });
    const branch = (name: string, files: Readonly<Record<string, string>>): void => {
      repo.git("checkout", "--quiet", "-b", name, "main");
      repo.commit(name, files);
      repo.git("checkout", "--quiet", "main");
    };
    branch("greenline/2026-10-14-login", {
      ".greenline/ledger/2026-10-14-login.md": record("stopped", ['next: "build: the form"']),
    });
    branch("greenline/2026-10-14-plan", {
      ".greenline/ledger/2026-10-14-plan.md": record("open", ["plan: 001-login"]),
      ".greenline/ledger/2026-10-14-t1.md": record("stopped", [
        'next: "review: rerun it"',
        "plan: 001-login",
        "ticket: T1",
      ]),
      ".greenline/ledger/2026-10-14-t1/review-1.md": "# Review\n",
    });
    branch("greenline/2026-10-14-done", {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
    });
    branch("greenline/2026-10-14-broken", {
      ".greenline/ledger/2026-10-14-broken.md": "no front matter\n",
    });
    branch("feature/elsewhere", {
      ".greenline/ledger/2026-10-14-feature.md": record("stopped", ['next: "build: x"']),
    });
    branch("greenline/2026-10-14-here", {
      ".greenline/ledger/2026-10-14-here.md": record("stopped", ['next: "build: x"']),
    });
    const before = snapshot(repo.root);
    const fromMain = readSituation(repo.root, {
      records: 0,
      onDisk: new Set(),
      installed: new Set(),
    });
    expect(fromMain.stoppedElsewhere).toEqual({
      kind: "known",
      changes: ["2026-10-14-here", "2026-10-14-login", "2026-10-14-t1"],
      worktrees: [],
    });
    expect(renderSituationText(fromMain)).toContain(
      "  stopped on other branches: 2026-10-14-here, 2026-10-14-login, 2026-10-14-t1\n",
    );
    // The reading writes nothing, in the tree or in .git.
    expect(snapshot(repo.root)).toEqual(before);

    repo.git("checkout", "--quiet", "greenline/2026-10-14-here");
    const fromHere = readSituation(repo.root, {
      records: 1,
      onDisk: new Set(["2026-10-14-login"]),
      installed: new Set(),
    });
    expect(fromHere.stoppedElsewhere).toEqual({
      kind: "known",
      changes: ["2026-10-14-t1"],
      worktrees: [],
    });
  });

  it("J-114 S1 a change stopped in a worktree is named from the main checkout with the worktree's path, through its branch", () => {
    const repo = repository();
    repo.commit("start", { "a.txt": "a\n", ".gitignore": "" });
    repo.git(
      "worktree",
      "add",
      "--quiet",
      "-b",
      "greenline/2026-10-25-wt",
      ".worktrees/2026-10-25-wt",
    );
    const worktree = join(repo.root, ".worktrees", "2026-10-25-wt");
    mkdirSync(join(worktree, ".greenline", "ledger"), { recursive: true });
    writeFileSync(
      join(worktree, ".greenline", "ledger", "2026-10-25-wt.md"),
      record("stopped", [
        'next: "build: the form"',
        'ground: "worktree: .worktrees/2026-10-25-wt"',
        "agent: codex/gpt-6.1-sol",
      ]),
    );
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", "add", "--all"], {
      cwd: worktree,
    });
    execFileSync(
      "git",
      ["-c", "user.name=F", "-c", "user.email=f@example.com", "commit", "--quiet", "-m", "stop"],
      { cwd: worktree },
    );
    const fromMain = readSituation(repo.root, {
      records: 0,
      onDisk: new Set(),
      installed: new Set(),
      groundSetting: "worktree",
    });
    expect(fromMain.stoppedElsewhere).toEqual({
      kind: "known",
      changes: ["2026-10-25-wt"],
      worktrees: [{ id: "2026-10-25-wt", path: ".worktrees/2026-10-25-wt" }],
    });
    const text = renderSituationText(fromMain);
    expect(text).toContain(
      "  stopped on other branches: 2026-10-25-wt (in the worktree .worktrees/2026-10-25-wt)\n",
    );
    // No change is open on main, so the line states the manifest's standing choice.
    expect(text).toContain(
      "  ground: no change open; the manifest's standing choice is worktree, stated at the proposal\n",
    );
    // In the worktree, the change of its branch is the one whose ground and agent it prints.
    const inside = readSituation(worktree, {
      records: 1,
      onDisk: new Set(["2026-10-25-wt"]),
      installed: new Set(),
    });
    expect(inside.ground).toEqual({
      kind: "change",
      id: "2026-10-25-wt",
      branch: "greenline/2026-10-25-wt",
      ground: "worktree: .worktrees/2026-10-25-wt",
      agent: "codex/gpt-6.1-sol",
    });
    expect(renderSituationText(inside)).toContain(
      "  ground: worktree .worktrees/2026-10-25-wt on greenline/2026-10-25-wt; agent: codex/gpt-6.1-sol\n",
    );
  });

  it("J-130 S1 the remote's kind: a file path is no forge, a github.com URL is one, origin first, read without the network", () => {
    const repo = repository();
    repo.commit("start", { "a.txt": "a\n" });
    const remoteLine = (): string | undefined =>
      renderSituationText(
        readSituation(repo.root, { records: 0, onDisk: new Set(), installed: new Set() }),
      )
        .split("\n")
        .find((line) => line.startsWith("  remote: "));
    expect(remoteLine()).toBe("  remote: none");
    const bare = mkdtempSync(join(tmpdir(), "situation-origin-"));
    roots.push(bare);
    execFileSync("git", ["init", "--quiet", "--bare", bare]);
    repo.git("remote", "add", "origin", bare);
    expect(readRemote(repo.root)).toEqual({
      kind: "not-forge",
      name: "origin",
      why: "a local path",
    });
    expect(remoteLine()).toBe("  remote: origin, not a forge (a local path)");
    // J-143 S1: on the default branch of a repository with a remote, the proposal offers the two grounds.
    repo.git("config", "init.defaultBranch", "main");
    expect(
      renderSituationText(
        readSituation(repo.root, { records: 0, onDisk: new Set(), installed: new Set() }),
      ),
    ).toContain(
      "  ground: no change open; the proposal offers a branch of its own, greenline/<id>, or a worktree\n",
    );
    repo.git("remote", "set-url", "origin", `file://${bare}`);
    expect(remoteLine()).toBe("  remote: origin, not a forge (a file URL)");
    // A forge's URL is read as the configuration holds it; the network is never reached.
    repo.git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
    const before = snapshot(repo.root);
    expect(remoteLine()).toBe("  remote: origin, a forge (github.com)");
    expect(snapshot(repo.root)).toEqual(before);
    // origin is named first; without it, the first remote git lists.
    repo.git("remote", "add", "backup", "git@gitlab.example.com:team/repo.git");
    expect(remoteLine()).toBe("  remote: origin, a forge (github.com)");
    repo.git("remote", "remove", "origin");
    expect(remoteLine()).toBe("  remote: backup, a forge (gitlab.example.com)");
  });

  it("J-73 S4 outside a readable repository the git facts are unknown, never guessed", () => {
    const root = mkdtempSync(join(tmpdir(), "situation-bare-"));
    roots.push(root);
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "CONTRIBUTING.md"), "# Contributing\n");
    const text = renderSituationText(
      readSituation(root, { records: 0, onDisk: new Set(), installed: new Set() }),
    );
    expect(text).toContain("  commits: unknown (");
    expect(text).toContain("  knowledge homes: CONTRIBUTING.md\n");
    expect(text).toContain("  languages: unknown (");
    expect(text).toContain("  orientation: unknown (");
    expect(text).toContain("  stopped on other branches: unknown (");
    expect(text).toContain("  branches before the practice: unknown (");
    expect(text).toContain("  remote: unknown (");
    // A ledger that cannot be read leaves the count unknown, never none.
    expect(
      renderSituationText(
        readSituation(root, { records: undefined, onDisk: new Set(), installed: new Set() }),
      ),
    ).toContain("  change records: unknown (the ledger cannot be read)\n");
  });
});

describe("J-213 S1 the branches cut before the install, named from the default branch (j196t-wait-proceed-1c)", () => {
  const MANIFEST = { ".greenline/manifest.json": '{"schemaVersion":6}\n' };

  /** The run's case: `feature/overdue` cut from main before the install, the manifest committed on main after it. */
  function cutBeforeTheInstall(): Repository {
    const repo = repository();
    repo.commit("the shelf", { "src/shelf.js": "export {};\n" });
    repo.git("branch", "feature/overdue");
    repo.git("checkout", "--quiet", "feature/overdue");
    repo.commit("the overdue list", { "src/overdue.js": "export {};\n" });
    repo.git("checkout", "--quiet", "main");
    repo.commit("install greenline", MANIFEST);
    return repo;
  }

  const read = (root: string, proceed?: string) =>
    readSituation(root, { records: 0, onDisk: new Set(), installed: new Set(), proceed });

  it("names a local branch whose tree holds no manifest where main holds one, with what a request for its files owes under proceed regular, from main", () => {
    const repo = cutBeforeTheInstall();
    const before = snapshot(repo.root);
    const situation = read(repo.root, "regular");
    expect(situation.predating).toEqual({
      kind: "known",
      base: "main",
      branches: ["feature/overdue"],
      proceed: "regular",
    });
    expect(renderSituationText(situation)).toContain(
      "  stopped on other branches: none\n  branches before the practice: feature/overdue; a request for their files under proceed regular proposes the merge of main into the branch as the one yes, asks no direction first, and once it is done the owner starts a new session there\n  remote: none\n",
    );
    // Under proceed none the branch is named and no words follow.
    expect(renderSituationText(read(repo.root, "none"))).toContain(
      "  branches before the practice: feature/overdue\n",
    );
    // The reading writes nothing, in the tree or in .git.
    expect(snapshot(repo.root)).toEqual(before);
  });

  it("gives none where every branch holds the manifest, and where main holds none", () => {
    const repo = cutBeforeTheInstall();
    repo.git("checkout", "--quiet", "feature/overdue");
    repo.git("merge", "--quiet", "--no-edit", "main");
    repo.git("checkout", "--quiet", "main");
    repo.git("branch", "greenline/2026-11-09-overdue");
    expect(renderSituationText(read(repo.root, "regular"))).toContain(
      "  branches before the practice: none\n",
    );
    const plain = repository();
    plain.commit("the shelf", { "src/shelf.js": "export {};\n" });
    plain.git("branch", "feature/overdue");
    expect(renderSituationText(read(plain.root, "regular"))).toContain(
      "  branches before the practice: none\n",
    );
  });

  it("names a remote-tracking branch without the manifest, and leaves out the default branch's own and a local branch's namesake", () => {
    const repo = cutBeforeTheInstall();
    const old = repo.git("rev-parse", "feature/overdue");
    const installed = repo.git("rev-parse", "main");
    repo.git("update-ref", "refs/remotes/origin/spike", old);
    repo.git("update-ref", "refs/remotes/origin/feature/overdue", old);
    repo.git("update-ref", "refs/remotes/origin/main", installed);
    repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    expect(read(repo.root, "regular").predating).toEqual({
      kind: "known",
      base: "main",
      branches: ["feature/overdue", "origin/spike"],
      proceed: "regular",
    });
  });
});
