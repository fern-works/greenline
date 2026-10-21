import { existsSync } from "node:fs";
import { join } from "node:path";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { readRepositoryManifest, rosterOf } from "../repository-state.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import { findGitRoot } from "../git.ts";
import type { RunRequest, WorkspaceRequest } from "./args.ts";
import { GL, diagnostic, type Diagnostic } from "./output.ts";
import { type CliEnvironment } from "./command-environment.ts";
import {
  type CommandOutcome,
  fail,
  contractDiagnostics,
  repositoryOutcome,
} from "./command-outcome.ts";
import { runStatus } from "./status.ts";
import { offerGitInit, runInit } from "./init.ts";
import { runSync } from "./sync.ts";
import { runTidy, tidyBeforeLock } from "./tidy.ts";
import { initializedWorkspace } from "./init-existing.ts";

/** Missing installation blocks dependent work, while repository facts remain inspectable without writes. */
export function runUnavailableInstallation(
  request: RunRequest,
  env: Omit<CliEnvironment, "installation">,
  error: ContractParseFailed,
): CommandOutcome {
  const outcome =
    request.command === "status"
      ? runStatus(env, request.status ?? { view: "list", all: false })
      : fail([]);
  const root = findGitRoot(env.cwd);
  const observed = root === undefined ? outcome : repositoryOutcome(root, outcome);
  return {
    ...observed,
    ok: false,
    diagnostics: [...observed.diagnostics, installationUnavailable(error)],
  };
}

/** GL0140: the CLI's installation payload is missing or invalid, so nothing that needs it runs. */
export function installationUnavailable(error: ContractParseFailed): Diagnostic {
  return diagnostic(
    GL.installationUnavailable,
    "error",
    `${error.issues.map((issue) => `${issue.path || "installation"}: ${issue.message}`).join("; ")} Installation-dependent checks and mutations are unavailable; repository facts remain readable.`,
    error.source,
  );
}

/** Execute a parsed request and return its outcome. */
export function runCommand(request: WorkspaceRequest, env: CliEnvironment): CommandOutcome {
  let root = findGitRoot(env.cwd);
  // Init on a directory that is no repository offers `git init` there first.
  if (root === undefined && request.command === "init") {
    const offer = offerGitInit(request, env);
    if (offer.kind === "refused") return offer.outcome;
    root = offer.root;
  }
  if (
    root !== undefined &&
    (request.command === "init" || request.command === "sync") &&
    existsSync(join(root, ".greenline/manifest.json"))
  ) {
    const manifest = readRepositoryManifest(root, createNodeFileIo(), rosterOf(env.installation));
    if (manifest._tag === "err")
      return fail(
        contractDiagnostics(GL.manifestInvalid, manifest.error.issues, manifest.error.source),
      );
  }
  const configured = initializedWorkspace(request, env.cwd);
  if (configured !== undefined) return configured;
  // tidy refuses a redirected .greenline/ or tmp folder before the lock could be written through it.
  if (request.command === "tidy" && root !== undefined) {
    const early = tidyBeforeLock(root);
    if (early !== undefined) return repositoryOutcome(root, early);
  }
  if (root === undefined || request.command === "status" || request.dryRun) {
    const outcome = executeCommand(request, env);
    return root === undefined ? outcome : repositoryOutcome(root, outcome);
  }
  const written = withWorkspaceWrite(root, () => executeCommand(request, env));
  return repositoryOutcome(
    root,
    written._tag === "ok"
      ? written.value
      : fail([diagnostic(GL.repositoryStateInvalid, "error", written.error.message)]),
  );
}

function executeCommand(request: WorkspaceRequest, env: CliEnvironment): CommandOutcome {
  switch (request.command) {
    case "init":
      return runInit(request, env);
    case "sync":
      return runSync(request, env);
    case "status":
      return runStatus(env, request.status ?? { view: "list", all: false });
    case "tidy":
      return runTidy(env, request.tidy?.change);
  }
}
