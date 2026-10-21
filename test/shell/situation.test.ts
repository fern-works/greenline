import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderSituationText } from "../../src/core/situation.ts";
import { listFilesRecursive } from "../../src/shell/fs/walk.ts";
import { readSituation } from "../../src/shell/situation.ts";

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
        "  stopped on other branches: none",
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
        "  stopped on other branches: none",
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
    expect(fromHere.stoppedElsewhere).toEqual({ kind: "known", changes: ["2026-10-14-t1"] });
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
    expect(text).toContain("  stopped on other branches: unknown (");
    // A ledger that cannot be read leaves the count unknown, never none.
    expect(
      renderSituationText(
        readSituation(root, { records: undefined, onDisk: new Set(), installed: new Set() }),
      ),
    ).toContain("  change records: unknown (the ledger cannot be read)\n");
  });
});
