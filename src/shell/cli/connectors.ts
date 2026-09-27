import { lstatSync } from "node:fs";
import { join } from "node:path";
import { parseGardenConfiguration } from "../../core/connectors/garden.ts";
import {
  connectorStatus,
  connectorStatuses,
  disableConnector,
  enableConnector,
  type ConnectorStatus,
} from "../../core/connectors/registry.ts";
import { serializeManifest, type Manifest } from "../../core/manifest.ts";
import { renderProjection } from "../../core/render.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { findGitRoot } from "../git.ts";
import { readRepositoryManifest } from "../repository-state.ts";
import type { ConnectorsRequest } from "./args.ts";
import { envRead, type CliEnvironment, type RepositoryEnvironment } from "./command-environment.ts";
import {
  contractDiagnostics,
  fail,
  repositoryOutcome,
  succeed,
  type CommandOutcome,
} from "./command-outcome.ts";
import { GL, diagnostic, effectSummary } from "./output.ts";
import { reconcileWorkspace } from "./sync.ts";

/**
 * The `greenline connectors` operations (contract T2's greenline side).
 * List and status read the manifest and the static registry, offline, with
 * no guidance lookup and no process started. Enable and disable change the
 * manifest's `connectors` map through the write planner, so the manifest,
 * the connector's skill and its conditional pointer move together. Nothing
 * here installs, runs or contacts a connector's external client.
 */

type ReportRequest = Extract<ConnectorsRequest, { readonly operation: "list" | "status" }>;
type ChangeRequest = Extract<ConnectorsRequest, { readonly operation: "enable" | "disable" }>;

const MANIFEST = ".greenline/manifest.json";

/** The workspace an operation acts on: its root, or the refusal that stops it before any read. */
function workspaceRoot(cwd: string, io: FileIo): { root: string } | { refused: CommandOutcome } {
  const root = findGitRoot(cwd);
  if (root === undefined)
    return {
      refused: fail([
        diagnostic(
          GL.notGitRepository,
          "error",
          "connectors requires a Git repository root; run 'git init' first",
        ),
      ]),
    };
  if (envRead(io, join(root, MANIFEST)) === undefined)
    return {
      refused: fail([
        diagnostic(
          GL.manifestMissing,
          "error",
          "not a greenline workspace; run 'greenline init' first",
          MANIFEST,
        ),
      ]),
    };
  return { root };
}

/** Report the registered connectors and this repository's installed configuration. */
export function runConnectorsReport(
  request: ReportRequest,
  env: RepositoryEnvironment,
): CommandOutcome {
  const io = createNodeFileIo();
  const workspace = workspaceRoot(env.cwd, io);
  if ("refused" in workspace) return workspace.refused;
  const manifest = readRepositoryManifest(
    workspace.root,
    io,
    env.installation?.skills.map((skill) => skill.name),
  );
  if (manifest._tag === "err")
    return repositoryOutcome(
      workspace.root,
      fail(contractDiagnostics(GL.manifestInvalid, manifest.error.issues, manifest.error.source)),
    );
  const connectors =
    request.operation === "status" && request.id !== undefined
      ? [connectorStatus(request.id, manifest.value.connectors)]
      : connectorStatuses(manifest.value.connectors);
  const text = connectors
    .map((status) => (request.operation === "list" ? listingLine(status) : statusLines(status)))
    .join("");
  return { ...succeed([]), connectors, text };
}

/** Enable or disable a connector through the write planner, under the workspace's writer lock. */
export function runConnectorsChange(request: ChangeRequest, env: CliEnvironment): CommandOutcome {
  const io = createNodeFileIo();
  const workspace = workspaceRoot(env.cwd, io);
  if ("refused" in workspace) return workspace.refused;
  const root = workspace.root;
  // The writer lock and every write stay inside the repository.
  if ([".greenline", ".greenline/tmp"].some((path) => isLink(join(root, path))))
    return fail([
      diagnostic(
        GL.repositoryStateInvalid,
        "error",
        ".greenline and its tmp directory must remain inside the repository without redirection",
        MANIFEST,
      ),
    ]);
  const configuration =
    request.operation === "enable"
      ? parseGardenConfiguration({ url: request.url, executable: request.executable })
      : undefined;
  if (configuration?._tag === "err")
    return fail([diagnostic(GL.connectorConfiguration, "error", configuration.error.message)]);
  const change = (): CommandOutcome => {
    const current = readRepositoryManifest(
      root,
      io,
      env.installation.skills.map((skill) => skill.name),
    );
    const bytes = io.read(join(root, MANIFEST));
    if (current._tag === "err")
      return fail(
        contractDiagnostics(GL.manifestInvalid, current.error.issues, current.error.source),
      );
    if (bytes._tag === "err")
      return fail([diagnostic(GL.ioFailure, "error", bytes.error.message, MANIFEST)]);
    const unchanged = connectorStatus(request.id, current.value.connectors);
    let next: Manifest;
    if (configuration === undefined) {
      next = {
        ...current.value,
        connectors: disableConnector(request.id, current.value.connectors),
      };
    } else {
      const enabled = enableConnector(
        request.id,
        configuration.value,
        current.value.skills,
        current.value.connectors,
      );
      if (enabled._tag === "err")
        return {
          ...fail([
            diagnostic(GL.connectorConfiguration, "error", enabled.error.message, MANIFEST),
          ]),
          connectors: [unchanged],
        };
      next = { ...current.value, connectors: enabled.value };
    }
    // Disabling retires what only the enabled projection generated: the connector's skill files.
    const after = new Set(renderProjection(next, env.installation).map((file) => file.path));
    const retired = new Set(
      renderProjection(current.value, env.installation)
        .map((file) => file.path)
        .filter((path) => !after.has(path)),
    );
    const outcome = reconcileWorkspace(root, io, env, request, {
      manifest: next,
      manifestChange: { next: serializeManifest(next), current: bytes.value },
      retired,
    });
    const reported =
      outcome.ok && !request.dryRun ? connectorStatus(request.id, next.connectors) : unchanged;
    return {
      ...outcome,
      connectors: [reported],
      text: effectSummary(outcome.effects) + statusLines(reported),
    };
  };
  if (request.dryRun) return repositoryOutcome(root, change());
  const written = withWorkspaceWrite(root, change);
  return repositoryOutcome(
    root,
    written._tag === "ok"
      ? written.value
      : fail([diagnostic(GL.repositoryStateInvalid, "error", written.error.message)]),
  );
}

/** Whether a path is a symbolic link; an absent path redirects nothing. */
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** One connector as a listing names it. */
function listingLine(status: ConnectorStatus): string {
  return `  ${status.id}: ${status.state}; ${status.summary}\n`;
}

/** One connector's installed configuration and what enabling it leaves to the person. */
function statusLines(status: ConnectorStatus): string {
  const configured =
    status.state === "enabled"
      ? `    endpoint: ${status.endpoint}\n    executable: ${status.executable}\n`
      : "";
  return (
    `  ${status.id}: ${status.state}\n` +
    configured +
    `    skill: ${status.skill}, installed only while ${status.id} is enabled\n` +
    `    prerequisite: ${status.prerequisite}\n`
  );
}
