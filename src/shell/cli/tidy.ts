import { join } from "node:path";
import { tidyReasonSentence, type TidyReason } from "../../core/tidy.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import { redirection, tidyWorkingFolders, type TidyReport } from "../tidy.ts";
import { envRead, type RepositoryEnvironment } from "./command-environment.ts";
import { fail, succeed, type CommandOutcome } from "./command-outcome.ts";
import { GL, diagnostic, type Diagnostic, type TidyJson } from "./output.ts";

/**
 * `greenline tidy [--change <id>]` (`workshop/components/cli-contracts.md`,
 * "tidy"): remove the working files of done and dropped changes, the one
 * named or every one, and report what it removed and what it kept. The
 * runner holds the writer lock around it, as it does for every write; it
 * runs no git; like every write, it refuses with GL0140 when the installation
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
export function runTidy(env: RepositoryEnvironment, change: string | undefined): CommandOutcome {
  const root = findGitRoot(env.cwd);
  if (root === undefined)
    return fail([diagnostic(GL.notGitRepository, "error", "tidy requires a Git repository root")]);
  const missing = workspaceMissing(root);
  if (missing !== undefined) return missing;
  const outcome = tidyWorkingFolders(root, change);
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
  return {
    ...succeed(
      report.removed.map((path) => ({ kind: "remove", path })),
      refusals,
    ),
    text: text(report),
    tidy: json(report),
  };
}
