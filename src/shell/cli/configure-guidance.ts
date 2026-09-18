import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { z } from "zod";
import { configureManifestGuidance, serializeManifest } from "../../core/manifest.ts";
import { providerUrl } from "../../core/guidance-configuration.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { findGitRoot } from "../git.ts";
import { configWrite } from "./install-plan.ts";
import type { RunRequest } from "./args.ts";
import {
  fail,
  succeed,
  contractDiagnostics,
  repositoryOutcome,
  type CommandOutcome,
} from "./command-outcome.ts";
import { diagnostic, GL } from "./output.ts";

/** Explicit installed-manifest update checked against the roster, without an authored account. */
export function configureInstalledGuidance(
  request: RunRequest,
  cwd: string,
  skillNames: readonly string[],
): CommandOutcome | undefined {
  if (request.command !== "init") return undefined;
  const root = findGitRoot(cwd);
  if (root === undefined) return undefined;
  const io = createNodeFileIo();
  const path = join(root, ".greenline/manifest.json");
  const invalid = (message: string): CommandOutcome =>
    fail([diagnostic(GL.guidanceConfiguration, "error", message, ".greenline/manifest.json")]);
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
  if (request.forceManaged.length > 0)
    return invalid(
      "--force-managed does not apply to a guidance-only update; use greenline sync for managed files.",
    );
  if (request.guidance === undefined)
    return invalid(
      "Workspace already initialized; use 'greenline init --guidance none' or 'greenline init --guidance URL' to change guidance, or 'greenline sync' to reconcile installed files.",
    );
  const provider = providerUrl(request.guidance);
  if (request.guidance !== "none" && provider === undefined)
    return invalid(
      "guidance must be none or an HTTPS (or loopback HTTP) URL without credentials, query or fragment",
    );
  const guidance =
    provider === undefined
      ? { state: "unconfigured" as const }
      : { state: "configured" as const, provider };
  const update = (): CommandOutcome => {
    try {
      if (
        lstatSync(path).isSymbolicLink() ||
        !realpathSync(path).startsWith(realpathSync(root) + sep)
      )
        return invalid("The manifest must be an ordinary file inside the repository.");
    } catch {
      return invalid("The installed manifest is unavailable.");
    }
    const text = io.read(path);
    if (text._tag === "err") return invalid("The installed manifest is unavailable.");
    const manifest = configureManifestGuidance(text.value, guidance, path, skillNames);
    if (manifest._tag === "err")
      return fail(
        contractDiagnostics(GL.manifestInvalid, manifest.error.issues, manifest.error.source),
      );
    const write = configWrite(path, serializeManifest(manifest.value), text.value);
    if (!request.dryRun && write.effect.kind !== "unchanged") {
      const written = io.write(path, write.content);
      if (written._tag === "err")
        return fail([diagnostic(GL.ioFailure, "error", written.error.message, path)]);
    }
    return succeed([write.effect], []);
  };
  if (request.dryRun) return repositoryOutcome(root, update());
  const result = withWorkspaceWrite(root, update);
  return result._tag === "err"
    ? invalid(result.error.message)
    : repositoryOutcome(root, result.value);
}
