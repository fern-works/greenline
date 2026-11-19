/**
 * The worktree a closed record's copy was left in (J-228 S1, part B item 2's
 * amendment; the run j201t-linear-visuals finding 14, whose worktrees kept
 * their open copies after their merges): `removeChangeWorktree`, which
 * `greenline tidy --change <id> --worktree` runs, reads the change's record
 * in the checkout tidy runs in where it stands there done, dropped or open,
 * and the worktree's own copy otherwise. A clean worktree left with an open
 * copy of a record done here goes, its branch kept; one that holds
 * uncommitted work stays, and so does a change open in both checkouts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeChangeWorktree } from "../../src/shell/worktree.ts";

const ID = "2026-11-10-projects";
const RECORD = `.greenline/ledger/${ID}.md`;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function write(root: string, path: string, text: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

const record = (state: string): string =>
  ["---", "mode: regular", "choice: accepted", 'why: "w"', `state: ${state}`, "---", ""].join("\n");

/** The main checkout and the change's worktree. */
interface Checkouts {
  readonly root: string;
  readonly tree: string;
}

/** The main checkout on main and the change's worktree on its branch, the worktree's copy committed open. */
function left(): Checkouts {
  const root = mkdtempSync(join(tmpdir(), "worktree-left-"));
  roots.push(root);
  git(root, "init", "--quiet", "-b", "main");
  write(root, ".gitignore", ".worktrees/\n");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "start");
  git(root, "worktree", "add", "--quiet", "-b", `greenline/${ID}`, `.worktrees/${ID}`);
  const tree = join(root, ".worktrees", ID);
  write(tree, RECORD, record("open"));
  git(tree, "add", ".");
  git(tree, "commit", "--quiet", "-m", "open the change");
  return { root, tree };
}

describe("J-228 S1 a worktree left with an open copy of a record closed here (j201t-linear-visuals F14)", () => {
  it("removes the clean worktree where the checkout tidy runs in holds the record done, and keeps the branch", () => {
    const { root, tree } = left();
    write(root, RECORD, record("done"));
    expect(removeChangeWorktree(root, ID)).toEqual({ kind: "removed", path: `.worktrees/${ID}` });
    expect(existsSync(tree)).toBe(false);
    expect(git(root, "branch", "--list", `greenline/${ID}`)).toContain(`greenline/${ID}`);
  });

  it("keeps the worktree that holds uncommitted work, and a change open in both checkouts", () => {
    const dirty = left();
    write(dirty.root, RECORD, record("dropped"));
    write(dirty.tree, "src/new.ts", "export {};\n");
    const kept = removeChangeWorktree(dirty.root, ID);
    expect(kept.kind).toBe("kept");
    expect(JSON.stringify(kept)).toContain("it holds uncommitted work");
    expect(existsSync(dirty.tree)).toBe(true);
    const both = left();
    write(both.root, RECORD, record("open"));
    const open = removeChangeWorktree(both.root, ID);
    expect(JSON.stringify(open)).toContain(
      "the change is open, and its worktree serves it until it is done or dropped",
    );
    expect(existsSync(both.tree)).toBe(true);
  });
});
