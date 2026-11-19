import type { CloseChecks } from "../../core/inspector/documents.ts";
import type { ChangeView } from "../../core/status.ts";
import { readGit } from "../code-tree.ts";

/*
 * The desk's facts beyond the contract's desk reading (J-155 S1): a closed
 * change's check and commit lines, each declared command's latest run and
 * whether it saw the final code, and its last commit by its subject.
 */

/** A commit id as git prints it; nothing else reaches git's arguments. */
const COMMIT = /^[0-9a-f]{7,64}$/;

/**
 * A closed change's checks: each command's latest run, its outcome and whether it saw the final code.
 * @param view the change's view from the status derivations
 * @returns the counts and the failing commands
 */
export function closeChecks(view: ChangeView | undefined): CloseChecks {
  const checks = view?.checks ?? [];
  const failing = checks.filter((check) => check.outcome === "failed");
  return {
    total: checks.length,
    passed: checks.filter((check) => check.outcome === "passed").length,
    failed: failing.length,
    onFinal: checks.filter((check) => check.code.kind === "final").length,
    failing: failing.map((check) => check.arguments.join(" ")),
  };
}

/**
 * A commit with its subject, as git prints it.
 * @param root the repository root
 * @param hash the commit's id
 * @returns the commit and its subject, or null where git does not read it
 */
export function commitWithSubject(
  root: string,
  hash: string,
): { readonly hash: string; readonly subject: string } | null {
  if (!COMMIT.test(hash)) return null;
  const read = readGit(root, ["log", "-1", "--no-walk", "--format=%s", hash]);
  return read._tag === "ok" ? { hash, subject: read.value.trim() } : null;
}
