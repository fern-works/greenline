import { join } from "node:path";
import { planManagedFiles } from "../../core/managed-file.ts";
import { parseLock, type LockFile } from "../../core/lock.ts";
import type { Manifest } from "../../core/manifest.ts";
import type { Installation } from "../../core/installation.ts";
import { findBrokenReferences } from "../../core/links.ts";
import { renderProjection } from "../../core/render.ts";
import { readRepositoryManifest, readRepositoryDecisions, rosterOf } from "../repository-state.ts";
import type { FileIo } from "../fs/io.ts";
import { snapshotWorkspace } from "../workspace.ts";
import { presentHarnesses } from "../hooks.ts";
import { GL, diagnostic, type Diagnostic } from "./output.ts";
import { type RepositoryEnvironment, envRead } from "./command-environment.ts";
import { contractDiagnostics } from "./command-outcome.ts";
import { withBrokenBlockConflicts, entryDiagnostic } from "./install-plan.ts";
import type { ConnectorStatus, ConnectorsConfiguration } from "../../core/connectors/registry.ts";
import { connectorReadiness, type ConnectorReadiness } from "../connectors/readiness.ts";

/** What status reports of the installation: its diagnostics and, when the manifest reads, the connectors. */
export interface InstallationDiagnosis {
  readonly diagnostics: readonly Diagnostic[];
  readonly connectors: ConnectorReport | undefined;
}

/** The connectors' registered and installed state, the lines that say it and the findings an enabled one raises. */
export interface ConnectorReport {
  readonly statuses: readonly ConnectorStatus[];
  readonly diagnostics: readonly Diagnostic[];
  readonly text: string;
}

const MANIFEST = ".greenline/manifest.json";
const LOCK = ".greenline/lock.json";

/**
 * Diagnose the installation read-only (`docs/SPEC.md` section 4): the
 * manifest, the decision book, the lock, an override file, the drift of the
 * installed files from what the settings generate, the skill references of
 * the projection and the connectors. Nothing is written, started or
 * contacted.
 * @param env where it runs; the installation may be unavailable
 * @param root the repository root
 * @param io the file reads
 * @returns the diagnostics, and the connectors when the manifest reads
 */
export function diagnoseInstallation(
  env: RepositoryEnvironment,
  root: string,
  io: FileIo,
): InstallationDiagnosis {
  const diagnostics: Diagnostic[] = [];
  const roster = rosterOf(env.installation);
  let connectors: ConnectorReport | undefined;

  const manifest = readRepositoryManifest(root, io, roster);
  if (manifest._tag === "err")
    diagnostics.push(
      ...contractDiagnostics(GL.manifestInvalid, manifest.error.issues, manifest.error.source),
    );
  else {
    connectors = reportConnectors(manifest.value.connectors, env.environment ?? {});
    diagnostics.push(...connectors.diagnostics);
  }
  const decisions = readRepositoryDecisions(root, io);
  if (decisions._tag === "err")
    diagnostics.push(
      ...contractDiagnostics(
        GL.repositoryStateInvalid,
        decisions.error.issues,
        decisions.error.source,
      ),
    );

  const lockText = envRead(io, join(root, LOCK));
  const lock = lockText === undefined ? undefined : parseLock(lockText, LOCK);
  if (lock === undefined)
    diagnostics.push(
      diagnostic(GL.lockMissing, "error", "missing lock; run 'greenline sync'", LOCK),
    );
  else if (lock._tag === "err")
    diagnostics.push(...contractDiagnostics(GL.lockInvalid, lock.error.issues, lock.error.source));
  else if (lock.value.cliVersion !== env.version)
    diagnostics.push(
      diagnostic(
        GL.lockStale,
        "warning",
        `lock records CLI ${lock.value.cliVersion}; this is ${env.version}: run 'greenline sync'`,
        LOCK,
      ),
    );

  if (envRead(io, join(root, "AGENTS.override.md")) !== undefined)
    diagnostics.push(
      diagnostic(
        GL.overridePresent,
        "error",
        "AGENTS.override.md would shadow the managed policy",
        "AGENTS.override.md",
      ),
    );

  if (manifest._tag === "ok" && lock?._tag === "ok" && env.installation !== undefined)
    diagnostics.push(...driftDiagnostics(root, io, manifest.value, lock.value, env.installation));
  return { diagnostics, connectors };
}

/** The installed files that differ from what the settings generate, and the projection's unresolved references. */
function driftDiagnostics(
  root: string,
  io: FileIo,
  manifest: Manifest,
  lock: LockFile,
  installation: Installation,
): readonly Diagnostic[] {
  const found: Diagnostic[] = [];
  const desired = renderProjection(manifest, installation, presentHarnesses(root));
  const snapshot = snapshotWorkspace(root, desired, io, new Set<string>(lock.files.keys()));
  const plan = withBrokenBlockConflicts(
    planManagedFiles({ desired: snapshot.targets, locked: lock.files, disk: snapshot.diskHashes }),
    snapshot,
  );
  for (const entry of plan) {
    if (entry.kind === "create" || entry.kind === "update")
      found.push(
        diagnostic(
          GL.lockStale,
          "error",
          "installed skills or runtime do not match current settings; run greenline sync",
          entry.path,
        ),
      );
    if (entry.kind === "conflict") found.push(entryDiagnostic(entry, snapshot));
    if (entry.kind === "orphan")
      found.push(
        diagnostic(GL.managedOrphan, "warning", "managed file no longer generated", entry.path),
      );
  }
  for (const reference of findBrokenReferences(desired))
    found.push(
      diagnostic(
        GL.skillReference,
        "warning",
        `skill reference '${reference.target}' does not resolve in the projection`,
        reference.file,
      ),
    );
  return found;
}

/**
 * Read each registered connector against this machine, offline: nothing is
 * started or consulted, and a key variable is checked for presence, never
 * read. A disabled connector raises nothing; an enabled one whose
 * executable would not run here, or whose key variable is unset, raises a
 * GL0125 warning that says what to do.
 */
function reportConnectors(
  connectors: ConnectorsConfiguration,
  environment: NodeJS.ProcessEnv,
): ConnectorReport {
  const readiness = connectorReadiness(
    connectors,
    environment,
    process.platform === "win32" ? "win32" : "posix",
  );
  return {
    statuses: readiness.map((item) => item.status),
    diagnostics: readiness.flatMap(readinessDiagnostics),
    text: `connectors\n${readiness.map(readinessLines).join("")}`,
  };
}

function readinessDiagnostics(item: ConnectorReadiness): readonly Diagnostic[] {
  if (item.status.state === "disabled" || !("executable" in item)) return [];
  const { id, executable } = item.status;
  const found: Diagnostic[] = [];
  if (item.executable.state === "not-absolute")
    found.push(
      diagnostic(
        GL.connectorConfiguration,
        "warning",
        `${id} is enabled, but ${item.executable.message}`,
        MANIFEST,
      ),
    );
  if (item.executable.state === "missing")
    found.push(
      diagnostic(
        GL.connectorConfiguration,
        "warning",
        `${id} is enabled, but its executable '${executable}' ${
          executable === id ? "is not on the PATH" : "does not exist or cannot run"
        }; greenline does not install it: install the ${id} command, or name its absolute path with 'greenline connectors enable ${id} --url URL --executable PATH'`,
        MANIFEST,
      ),
    );
  if (!item.key.present)
    found.push(
      diagnostic(
        GL.connectorConfiguration,
        "warning",
        `${id} is enabled, but ${item.key.variable} is not set in this environment; ${id} reads its key from it, and greenline stores no credential`,
      ),
    );
  return found;
}

function readinessLines(item: ConnectorReadiness): string {
  const { id } = item.status;
  if (item.status.state === "disabled" || !("executable" in item))
    return `  ${id}: disabled; nothing is consulted and no process starts ('greenline connectors enable ${id} --url URL' enables it)\n`;
  const executable =
    item.executable.state === "found"
      ? `${item.status.executable} (runs ${item.executable.file})`
      : item.executable.state === "missing"
        ? `${item.status.executable} (not found)`
        : `${item.status.executable} (not an absolute path on this platform)`;
  return (
    `  ${id}: enabled\n` +
    `    endpoint: ${item.status.endpoint}\n` +
    `    executable: ${executable}\n` +
    `    key: ${item.key.variable} ${item.key.present ? "set" : "not set"}\n`
  );
}
