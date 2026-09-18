import { existsSync } from "node:fs";
import { join } from "node:path";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { readRepositoryManifest } from "../repository-state.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import { findGitRoot } from "../git.ts";
import type { RunRequest, WorkspaceRequest } from "./args.ts";
import { GL, diagnostic } from "./output.ts";
import { type CliEnvironment } from "./command-environment.ts";
import {
  type CommandOutcome,
  fail,
  contractDiagnostics,
  repositoryOutcome,
} from "./command-outcome.ts";
import { runDoctor } from "./doctor.ts";
import { runStatus } from "./status.ts";
import { runInit } from "./init.ts";
import { runSync } from "./sync.ts";
import { configureInstalledGuidance } from "./configure-guidance.ts";

/** Missing installation blocks dependent work, while repository facts remain inspectable without writes. */
export function runUnavailableInstallation(
  request: RunRequest,
  env: Omit<CliEnvironment, "installation">,
  error: ContractParseFailed,
): CommandOutcome {
  const outcome =
    request.command === "doctor"
      ? runDoctor(env)
      : request.command === "status"
        ? runStatus(env)
        : fail([]);
  const root = findGitRoot(env.cwd);
  const observed = root === undefined ? outcome : repositoryOutcome(root, outcome);
  return {
    ...observed,
    ok: false,
    diagnostics: [
      ...observed.diagnostics,
      diagnostic(
        "GL0140",
        "error",
        `${error.issues.map((issue) => `${issue.path || "installation"}: ${issue.message}`).join("; ")} Installation-dependent checks and mutations are unavailable; repository facts remain readable.`,
        error.source,
      ),
    ],
  };
}

/** Execute a parsed request and return its outcome. */
export function runCommand(request: WorkspaceRequest, env: CliEnvironment): CommandOutcome {
  const root = findGitRoot(env.cwd);
  const skillNames = env.installation.skills.map((skill) => skill.name);
  if (
    root !== undefined &&
    (request.command === "init" || request.command === "sync") &&
    existsSync(join(root, ".greenline/manifest.json"))
  ) {
    const manifest = readRepositoryManifest(root, createNodeFileIo(), skillNames);
    if (manifest._tag === "err")
      return fail(
        contractDiagnostics(GL.manifestInvalid, manifest.error.issues, manifest.error.source),
      );
  }
  const configured = configureInstalledGuidance(request, env.cwd, skillNames);
  if (configured !== undefined) return configured;
  if (
    root === undefined ||
    request.command === "status" ||
    request.command === "doctor" ||
    request.dryRun
  ) {
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
    case "doctor":
      return runDoctor(env);
    case "status":
      return runStatus(env);
  }
}
