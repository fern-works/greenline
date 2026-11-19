import { readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { recordFacts, recordPath } from "../core/git-hooks.ts";
import { parseWorktreeList } from "../core/ground.ts";
import { readGit } from "./code-tree.ts";
import { removeWorktree } from "./git.ts";

/**
 * A change's worktree at the landing's cleanup (J-114 S3; the register's
 * rows of 2026-10-22 on the ground and the commit form): `greenline tidy
 * --change <id> --worktree`, run on the owner's word, removes the worktree
 * that has the change's branch, `greenline/<id>`, checked out, once its
 * record is done or dropped and it holds no uncommitted work, with
 * `git worktree remove` and never its `--force`. The branch stays, its
 * deletion the owner's word too. Run from the main checkout or another
 * worktree, never from the one it removes. The record read is the one in
 * the checkout tidy runs in where it stands there done, dropped or open,
 * else the worktree's own: a copy the worktree still holds open of a record
 * this checkout holds done or dropped is left behind, and the worktree goes
 * (J-228 S1, the run j201t-linear-visuals, whose worktrees kept their open
 * copies after their merges).
 */

/** What the cleanup did: the worktree removed, none there to remove, or kept and why. */
export type WorktreeRemoval =
  | { readonly kind: "removed"; readonly path: string }
  | { readonly kind: "absent"; readonly reason: string }
  | { readonly kind: "kept"; readonly path: string | undefined; readonly reason: string };

/** A path as the report shows it: from the root where it stands inside it, else whole. */
function shown(root: string, path: string): string {
  const inside = relative(real(root), real(path));
  return inside === "" || inside.startsWith("..") ? path : inside.split(sep).join("/");
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** A change's state as a checkout's working tree holds its record, undefined where none reads. */
function stateAt(checkout: string, id: string): string | undefined {
  try {
    return recordFacts(readFileSync(join(checkout, recordPath(id)), "utf8")).state;
  } catch {
    return undefined;
  }
}

/**
 * Remove a done change's worktree, or say why it stays.
 * @param root the repository root tidy runs in
 * @param id the change
 * @returns what was done
 */
export function removeChangeWorktree(root: string, id: string): WorktreeRemoval {
  const listed = readGit(root, ["worktree", "list", "--porcelain"]);
  if (listed._tag === "err")
    return { kind: "kept", path: undefined, reason: "git cannot list the worktrees" };
  const entry = parseWorktreeList(listed.value).find(
    (candidate) => !candidate.main && candidate.branch === `greenline/${id}`,
  );
  if (entry === undefined)
    return {
      kind: "absent",
      reason: `no worktree has greenline/${id} checked out, so there is none to remove`,
    };
  const path = shown(root, entry.path);
  if (real(entry.path) === real(root))
    return {
      kind: "kept",
      path,
      reason: "tidy runs in that worktree; run it from the main checkout, which outlives it",
    };
  // The checkout tidy runs in decides where its record says done, dropped or open: a copy the worktree
  // still holds open after the change closed here is left behind, never the change's state (J-228 S1).
  const here = stateAt(root, id);
  const state =
    here === "done" || here === "dropped" || here === "open" ? here : stateAt(entry.path, id);
  if (state !== "done" && state !== "dropped")
    return {
      kind: "kept",
      path,
      reason:
        state === undefined
          ? `its record, ${recordPath(id)}, cannot be read there, so whether the change is done is unknown`
          : `the change is ${state}, and its worktree serves it until it is done or dropped`,
    };
  const status = readGit(entry.path, ["status", "--porcelain", "--untracked-files=normal"]);
  if (status._tag === "err")
    return { kind: "kept", path, reason: "git cannot say whether it holds uncommitted work" };
  const dirty = status.value.split("\n").filter((line) => line.trim() !== "");
  if (dirty.length > 0)
    return {
      kind: "kept",
      path,
      reason: `it holds uncommitted work (${dirty
        .slice(0, 3)
        .map((line) => line.trim())
        .join(
          ", ",
        )}${dirty.length > 3 ? ", ..." : ""}): commit it, or have the owner's words throw it away, before the worktree goes`,
    };
  const removed = removeWorktree(root, entry.path);
  return removed._tag === "ok"
    ? { kind: "removed", path }
    : { kind: "kept", path, reason: `git would not remove it: ${removed.error.message}` };
}
