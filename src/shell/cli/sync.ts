import { rmdirSync } from "node:fs";
import { join } from "node:path";
import { ok, type Result } from "../../commons/result.ts";
import { planManagedFiles } from "../../core/managed-file.ts";
import { splitManagedBlock } from "../../core/managed-block.ts";
import { parseLock, serializeLock, type LockFile } from "../../core/lock.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import type { Manifest } from "../../core/manifest.ts";
import { renderProjection, POLICY_BLOCK_KEY } from "../../core/render.ts";
import { readRepositoryManifest } from "../repository-state.ts";
import { findGitRoot } from "../git.ts";
import { applyFilePlan, type FileMutation } from "../fs/apply.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { snapshotWorkspace } from "../workspace.ts";
import type { RunRequest } from "./args.ts";
import { GL, diagnostic, type EffectJson } from "./output.ts";
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
  return reconcileWorkspace(root, io, env, request, { manifest: manifestResult.value });
}

/** What one reconciliation changes beyond rendering the installed choices. */
export interface Reconciliation {
  /** The installed choices the projection renders. */
  readonly manifest: Manifest;
  /** New manifest bytes, written with the managed output, and the bytes they replace. */
  readonly manifestChange?: { readonly next: string; readonly current: string };
  /**
   * Generated paths the change stops installing: each is removed when its
   * bytes are still the lock's, and refused when edited unless
   * `--force-managed` names it. Other orphans keep sync's rule.
   */
  readonly retired?: ReadonlySet<string>;
}

/**
 * The write planner every managed change goes through: render the
 * manifest, classify each path against the lock and the disk, refuse
 * unforced conflicts, and apply the writes, removals, lock and any
 * manifest change as one transactional plan.
 */
export function reconcileWorkspace(
  root: string,
  io: FileIo,
  env: CliEnvironment,
  request: { readonly dryRun: boolean; readonly forceManaged: readonly string[] },
  change: Reconciliation,
): CommandOutcome {
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
  const desired = renderProjection(change.manifest, env.installation);
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

  const forced = new Set(request.forceManaged);
  const retiring = plan
    .filter((entry) => entry.kind === "orphan" && change.retired?.has(entry.path) === true)
    .map((entry) => entry.path);
  const unedited = new Set(
    retiring.filter((path) => lockResult.value.files.get(path) === snapshot.diskHashes.get(path)),
  );
  const edited = retiring.filter((path) => !unedited.has(path) && !forced.has(path));
  const editedReason =
    "user-modified file differs from the lock; this change no longer installs it";
  if (!request.dryRun && edited.length > 0) {
    return fail([
      diagnostic(
        GL.syncBlockedByConflicts,
        "error",
        "installed files were edited after greenline wrote them; move the edits, or re-run with --force-managed <path> to remove them",
      ),
      ...edited.map((path) => diagnostic(GL.managedConflict, "error", editedReason, path)),
    ]);
  }
  const removing = new Set([...forced, ...unedited]);
  const execution = planExecution(plan, snapshot.targets, [...removing]);
  const retainedOrphans = new Map<string, string>();
  for (const entry of plan) {
    if (entry.kind !== "orphan" || removing.has(entry.path)) continue;
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
  const manifestWrite =
    change.manifestChange === undefined
      ? undefined
      : configWrite(
          join(root, ".greenline", "manifest.json"),
          change.manifestChange.next,
          change.manifestChange.current,
        );
  const removals: FileMutation[] = [];
  const removedFiles: string[] = [];
  for (const path of execution.removals) {
    const fullPath = join(root, path);
    const read = io.read(fullPath);
    if (read._tag === "err") {
      if (read.error.step === "absent") continue;
      return fail([diagnostic(GL.ioFailure, "error", read.error.message, path)]);
    }
    const split = splitManagedBlock(read.value, POLICY_BLOCK_KEY);
    const userBytes = `${split.head}${split.tail}`;
    const removed = split.block === undefined || userBytes.trim() === "";
    if (removed) removedFiles.push(path);
    removals.push(
      removed ? { path: fullPath, remove: true } : { path: fullPath, content: userBytes },
    );
  }
  const writes: FileMutation[] = [
    ...(manifestWrite === undefined
      ? []
      : [{ path: manifestWrite.path, content: manifestWrite.content }]),
    ...execution.writes.map((entry) => ({ path: join(root, entry.path), content: entry.content })),
    ...removals,
    { path: lockWrite.path, content: lockWrite.content },
  ];
  // A retired path reads as its removal, or as the conflict an edit makes of it.
  const retiredEffect = (effect: EffectJson): EffectJson =>
    effect.kind !== "orphan" || !retiring.includes(effect.path)
      ? effect
      : removing.has(effect.path)
        ? { kind: "remove", path: effect.path }
        : { kind: "conflict", path: effect.path, reason: editedReason };
  const effects = [
    ...(manifestWrite === undefined || manifestWrite.effect.kind === "unchanged"
      ? []
      : [manifestWrite.effect]),
    ...execution.effects.filter((entry) => entry.kind !== "unchanged").map(retiredEffect),
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
  removeEmptiedSkillDirectories(root, removedFiles);
  return succeed(effects, diagnostics);
}

/** The harness directories whose per-skill directories greenline creates. */
const SKILL_ROOTS: readonly string[] = [".agents/skills", ".claude/skills"];

/**
 * The directories a removal emptied inside an installed skill, removed with
 * it: each removed skill file's directory and its parents, up to and
 * including the skill's own directory under a harness's skills root. A
 * directory still holding anything, a file the owner added among them, stays,
 * and so does the skills root itself.
 */
function removeEmptiedSkillDirectories(root: string, removed: readonly string[]): void {
  for (const path of removed) {
    const parts = path.split("/");
    if (parts.length < 4 || !SKILL_ROOTS.includes(parts.slice(0, 2).join("/"))) continue;
    for (let depth = parts.length - 1; depth >= 3; depth -= 1) {
      try {
        rmdirSync(join(root, ...parts.slice(0, depth)));
      } catch {
        // Not empty, or already gone: every directory above it stays too.
        break;
      }
    }
  }
}
