import { join } from "node:path";
import { tidyReasonSentence, type TidyReason } from "../../core/tidy.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import { redirection, tidyDiscussionFolder, tidyWorkingFolders, type TidyReport } from "../tidy.ts";
import { stopStarted, type StoppedProcess } from "../processes.ts";
import { removeChangeWorktree } from "../worktree.ts";
import { envRead, type RepositoryEnvironment } from "./command-environment.ts";
import { fail, succeed, type CommandOutcome } from "./command-outcome.ts";
import { GL, diagnostic, type Diagnostic, type TidyJson } from "./output.ts";

/**
 * `greenline tidy [--change <id> [--worktree] | --discussion <id>]`
 * (`workshop/components/cli-contracts.md`, "tidy"): remove the working
 * files of done and dropped changes, the one named or every one, or of the
 * one discussion named once it is declined, promoted or merged (J-118 S1),
 * and report what it removed and what it kept; with
 * `--worktree`, on the owner's word, the named change's own worktree too,
 * never one with uncommitted work (J-114 S3). The runner holds the writer
 * lock around it, as it does for every write; it runs no git but the
 * worktree's removal; with `--change`, it stops the processes that
 * change's sessions started and that still run, the inspector its address
 * file names first, and never a process no session started (J-148 S1); like every write, it refuses with GL0140 when the installation
 * payload is unavailable. A folder it keeps when the
 * change was named, or a finished change's folder it cannot remove safely,
 * is a GL0470 error; an open or stopped change's folder kept while sweeping
 * every change is reported in the text and the envelope and fails nothing.
 */

function json(report: TidyReport): TidyJson {
  return {
    removed: report.removed,
    kept: report.kept.map((entry) => ({
      path: entry.path,
      reason: entry.reason,
      refused: entry.refused,
      message: tidyReasonSentence(entry.reason),
    })),
  };
}

function text(report: TidyReport): string {
  const lines = [
    ...report.removed.map((path) => `  removed ${path}/`),
    ...report.kept.map((entry) => `  kept ${entry.path}/: ${tidyReasonSentence(entry.reason)}`),
  ];
  return `${(lines.length === 0 ? ["  nothing to remove"] : lines).join("\n")}\n`;
}

/** A stopped process as the close's text names it. */
function stoppedLine(one: StoppedProcess): string {
  return one.inspector
    ? `stopped the inspector the session started, pid ${String(one.pid)}`
    : `stopped pid ${String(one.pid)}, ${one.command}, which the session started`;
}

/** The manifest a workspace needs, or GL0101. */
function workspaceMissing(root: string): CommandOutcome | undefined {
  if (envRead(createNodeFileIo(), join(root, ".greenline", "manifest.json")) !== undefined)
    return undefined;
  return fail([
    diagnostic(
      GL.manifestMissing,
      "error",
      "not a greenline workspace; run 'greenline init' first",
      ".greenline/manifest.json",
    ),
  ]);
}

/**
 * What tidy refuses before the runner takes the writer lock: a directory
 * that is no greenline workspace, and a `.greenline/` or tmp folder that is
 * a link or resolves outside the repository, so the lock is never written
 * through one.
 * @param root the repository root
 * @returns the refusal, or undefined when tidy may take the lock
 */
export function tidyBeforeLock(root: string): CommandOutcome | undefined {
  const missing = workspaceMissing(root);
  if (missing !== undefined) return missing;
  const redirect = redirection(root);
  if (redirect === undefined) return undefined;
  const reason: TidyReason = { kind: "redirected" };
  const message = tidyReasonSentence(reason);
  return {
    ...fail([diagnostic(GL.tidyKept, "error", `kept ${redirect}/: ${message}`, redirect)]),
    tidy: { removed: [], kept: [{ path: redirect, reason, refused: true, message }] },
  };
}

/**
 * Remove the working files of finished changes under the writer lock the
 * runner holds.
 * @param env where it runs
 * @param change the change `--change` named, or undefined for every finished change
 * @returns what was removed, as remove effects, and each refusal as an error
 */
export function runTidy(
  env: RepositoryEnvironment,
  change: string | undefined,
  worktree = false,
  discussion: string | undefined = undefined,
): CommandOutcome {
  const root = findGitRoot(env.cwd);
  if (root === undefined)
    return fail([diagnostic(GL.notGitRepository, "error", "tidy requires a Git repository root")]);
  const missing = workspaceMissing(root);
  if (missing !== undefined) return missing;
  // A discussion's working files go on --discussion alone, once it is declined, promoted or merged (J-118 S1).
  const outcome =
    discussion === undefined
      ? tidyWorkingFolders(root, change)
      : tidyDiscussionFolder(root, discussion);
  if (outcome._tag === "err") {
    const removed = outcome.error.removed;
    return {
      ...fail(
        [diagnostic(GL.ioFailure, "error", outcome.error.message, outcome.error.path)],
        removed.map((path) => ({ kind: "remove", path })),
      ),
      tidy: { removed, kept: [] },
    };
  }
  const report = outcome.value;
  // What the change's sessions started stops with its close, never a process they did not start (J-148 S1).
  const stopped = change === undefined || discussion !== undefined ? [] : stopStarted(root, change);
  const stoppedText = stopped.map((one) => `  ${stoppedLine(one)}\n`).join("");
  // On the owner's word, the change's own worktree goes too, never one holding uncommitted work (J-114 S3).
  const removal = worktree && change !== undefined ? removeChangeWorktree(root, change) : undefined;
  const worktreeRefusals: readonly Diagnostic[] =
    removal?.kind === "kept"
      ? [
          diagnostic(
            GL.tidyKept,
            "error",
            `kept the worktree${removal.path === undefined ? "" : ` ${removal.path}`}: ${removal.reason}`,
            removal.path,
          ),
        ]
      : [];
  const refusals: readonly Diagnostic[] = report.kept
    .filter((entry) => entry.refused)
    .map((entry) =>
      diagnostic(
        GL.tidyKept,
        "error",
        `kept ${entry.path}/: ${tidyReasonSentence(entry.reason)}`,
        entry.path,
      ),
    );
  const removedWorktree: readonly string[] = removal?.kind === "removed" ? [removal.path] : [];
  const worktreeLine =
    removal === undefined
      ? ""
      : removal.kind === "removed"
        ? `  removed the worktree ${removal.path}\n`
        : removal.kind === "absent"
          ? `  ${removal.reason}\n`
          : `  kept the worktree${removal.path === undefined ? "" : ` ${removal.path}`}: ${removal.reason}\n`;
  const base = stopped.length === 0 ? json(report) : { ...json(report), stopped };
  return {
    ...succeed(
      [...report.removed, ...removedWorktree].map((path) => ({ kind: "remove", path })),
      [...refusals, ...worktreeRefusals],
    ),
    text: `${text(report)}${stoppedText}${removal === undefined ? "" : worktreeLine}`,
    tidy:
      removal === undefined
        ? base
        : {
            ...base,
            worktree:
              removal.kind === "removed"
                ? { path: removal.path, removed: true }
                : removal.kind === "absent"
                  ? { path: null, removed: false, reason: removal.reason }
                  : { path: removal.path ?? null, removed: false, reason: removal.reason },
          },
  };
}
