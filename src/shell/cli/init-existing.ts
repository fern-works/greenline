import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { z } from "zod";
import { findGitRoot } from "../git.ts";
import type { RunRequest } from "./args.ts";
import { fail, type CommandOutcome } from "./command-outcome.ts";
import { diagnostic, GL } from "./output.ts";

/**
 * `greenline init` on a workspace that already has its manifest: the
 * manifest and the writer's lock directory must stay inside the repository
 * without redirection, and a repeated init is refused rather than
 * pretending to initialize again. Undefined when the command is not init,
 * there is no Git root, or no manifest exists yet.
 */
export function initializedWorkspace(request: RunRequest, cwd: string): CommandOutcome | undefined {
  if (request.command !== "init") return undefined;
  const root = findGitRoot(cwd);
  if (root === undefined) return undefined;
  const path = join(root, ".greenline/manifest.json");
  const invalid = (message: string): CommandOutcome =>
    fail([diagnostic(GL.workspaceInitialized, "error", message, ".greenline/manifest.json")]);
  try {
    if (!lstatSync(path).isFile())
      return invalid("The manifest must be an ordinary file inside the repository.");
  } catch (error) {
    if (z.object({ code: z.literal("ENOENT") }).safeParse(error).success) return undefined;
    return invalid("The installed manifest is unavailable.");
  }
  try {
    const temporary = join(root, ".greenline/tmp");
    if (
      !realpathSync(path).startsWith(realpathSync(root) + sep) ||
      (existsSync(temporary) && lstatSync(temporary).isSymbolicLink())
    )
      return invalid(
        "Manifest and write-lock paths must remain inside the repository without redirection.",
      );
  } catch {
    return invalid("The installed manifest or its write-lock path is unavailable.");
  }
  return invalid(
    "Workspace already initialized; run 'greenline sync' to reconcile installed files.",
  );
}
