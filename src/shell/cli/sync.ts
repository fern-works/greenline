import { join } from "node:path";
import { ok, type Result } from "../../commons/result.ts";
import { planManagedFiles } from "../../core/managed-file.ts";
import { splitManagedBlock } from "../../core/managed-block.ts";
import { parseLock, serializeLock, type LockFile } from "../../core/lock.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import { renderProjection, POLICY_BLOCK_KEY } from "../../core/render.ts";
import { readRepositoryManifest } from "../repository-state.ts";
import { findGitRoot } from "../git.ts";
import { applyFilePlan, type FileMutation } from "../fs/apply.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { snapshotWorkspace } from "../workspace.ts";
import type { RunRequest } from "./args.ts";
import { GL, diagnostic } from "./output.ts";
import { type CliEnvironment, envRead } from "./command-environment.ts";
import { type CommandOutcome, fail, contractDiagnostics, succeed } from "./command-outcome.ts";
import {
  withBrokenBlockConflicts,
  blockedConflicts,
  blockedSummary,
  entryDiagnostic,
  planExecution,
  buildLock,
  configWrite,
  unknownForceDiagnostics,
} from "./install-plan.ts";

/** Reconcile installed output under its ownership and force-write rules. */
export function runSync(request: RunRequest, env: CliEnvironment): CommandOutcome {
  const io: FileIo = createNodeFileIo();
  const root = findGitRoot(env.cwd);
  if (root === undefined) {
    return fail([
      diagnostic(
        GL.notGitRepository,
        "error",
        "sync requires a Git repository root; run 'git init' first",
      ),
    ]);
  }
  const manifestText = envRead(io, join(root, ".greenline", "manifest.json"));
  if (manifestText === undefined) {
    return fail([
      diagnostic(
        GL.manifestMissing,
        "error",
        "not a greenline workspace; run 'greenline init' first",
        ".greenline/manifest.json",
      ),
    ]);
  }
  const manifestResult = readRepositoryManifest(
    root,
    io,
    env.installation.skills.map((skill) => skill.name),
  );
  if (manifestResult._tag === "err") {
    return fail(
      contractDiagnostics(
        GL.manifestInvalid,
        manifestResult.error.issues,
        manifestResult.error.source,
      ),
    );
  }
  const lockText = envRead(io, join(root, ".greenline", "lock.json"));
  // Sync is the recovery verb for a MISSING lock only: ownership is
  // unknown, so classification runs with an empty locked map and
  // disk-conflict detection keeps guarding user files, then a fresh
  // lock is written. Any lock that exists but does not parse — an old
  // schemaVersion included — fails closed (pre-v1 carries no upgrade
  // paths, ADR 0018): delete the lock and sync.
  const recoveryWarning =
    lockText === undefined
      ? [
          diagnostic(
            GL.lockMissing,
            "warning",
            "the workspace has no lock; ownership is unknown, so managed output is being rebuilt and the lock rewritten",
            ".greenline/lock.json",
          ),
        ]
      : [];
  const emptyLock: LockFile = {
    schemaVersion: 4,
    cliVersion: env.version,
    installationRevision: env.installation.revision,
    upstreams: env.installation.upstreams,
    files: new Map<string, string>(),
  };
  const lockResult: Result<LockFile, ContractParseFailed> =
    lockText === undefined ? ok(emptyLock) : parseLock(lockText, ".greenline/lock.json");
  if (lockResult._tag === "err") {
    return fail(
      contractDiagnostics(GL.lockInvalid, lockResult.error.issues, lockResult.error.source),
    );
  }
  const desired = renderProjection(manifestResult.value, env.installation);
  const snapshot = snapshotWorkspace(
    root,
    desired,
    io,
    new Set<string>(lockResult.value.files.keys()),
  );
  if (snapshot.overridePresent) {
    return fail([
      diagnostic(
        GL.overridePresent,
        "error",
        "AGENTS.override.md would shadow the managed policy; remove it and re-run",
        "AGENTS.override.md",
      ),
    ]);
  }

  const plan = withBrokenBlockConflicts(
    planManagedFiles({
      desired: snapshot.targets,
      locked: lockResult.value.files,
      disk: snapshot.diskHashes,
    }),
    snapshot,
  );
  const unknownForce = unknownForceDiagnostics(plan, request.forceManaged);
  if (unknownForce.length > 0) return fail(unknownForce);
  const blocked = blockedConflicts(plan, request.forceManaged, snapshot.targets);
  // A dry run previews the plan (conflicts included) instead of failing.
  if (!request.dryRun && blocked.length > 0) {
    return fail([
      diagnostic(GL.syncBlockedByConflicts, "error", blockedSummary(blocked, snapshot)),
      ...blocked.map((entry) => entryDiagnostic(entry, snapshot)),
    ]);
  }

  const execution = planExecution(plan, snapshot.targets, request.forceManaged);
  const forced = new Set(request.forceManaged);
  const retainedOrphans = new Map<string, string>();
  for (const entry of plan) {
    if (entry.kind !== "orphan" || forced.has(entry.path)) continue;
    const hash = lockResult.value.files.get(entry.path);
    if (hash !== undefined) retainedOrphans.set(entry.path, hash);
  }
  const newLock: LockFile = buildLock(
    desired,
    snapshot.targets,
    env.version,
    env.installation.upstreams,
    env.installation.revision,
    retainedOrphans,
  );
  const lockWrite = configWrite(
    join(root, ".greenline", "lock.json"),
    serializeLock(newLock),
    snapshot.lockText,
  );
  const removals: FileMutation[] = [];
  for (const path of execution.removals) {
    const fullPath = join(root, path);
    const read = io.read(fullPath);
    if (read._tag === "err") {
      if (read.error.step === "absent") continue;
      return fail([diagnostic(GL.ioFailure, "error", read.error.message, path)]);
    }
    const split = splitManagedBlock(read.value, POLICY_BLOCK_KEY);
    const userBytes = `${split.head}${split.tail}`;
    removals.push(
      split.block === undefined || userBytes.trim() === ""
        ? { path: fullPath, remove: true }
        : { path: fullPath, content: userBytes },
    );
  }
  const writes: FileMutation[] = [
    ...execution.writes.map((entry) => ({ path: join(root, entry.path), content: entry.content })),
    ...removals,
    { path: lockWrite.path, content: lockWrite.content },
  ];
  const effects = [
    ...execution.effects.filter((entry) => entry.kind !== "unchanged"),
    ...(lockWrite.effect.kind === "unchanged" ? [] : [lockWrite.effect]),
  ];
  const diagnostics = recoveryWarning;

  if (request.dryRun) {
    return succeed(effects, diagnostics);
  }
  const applied = applyFilePlan(writes, io);
  if (applied._tag === "err") {
    return fail([diagnostic(GL.ioFailure, "error", applied.error.message, applied.error.path)]);
  }
  return succeed(effects, diagnostics);
}
