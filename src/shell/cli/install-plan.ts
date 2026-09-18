import { sha256Hex } from "../../commons/hash.ts";
import {
  type FileTarget,
  type LockFileMap,
  type ManagedPlanEntry,
} from "../../core/managed-file.ts";
import { type LockFile } from "../../core/lock.ts";
import { type DesiredFile } from "../../core/render.ts";
import { type WorkspaceSnapshot } from "../workspace.ts";
import { GL, diagnostic, type Diagnostic, type EffectJson } from "./output.ts";

/** Record desired owned bytes and retain hashes for unresolved orphans. */
export function buildLock(
  desired: readonly DesiredFile[],
  targets: ReadonlyMap<string, FileTarget>,
  version: string,
  upstreams:
    | readonly { readonly name: string; readonly repo: string; readonly commit: string }[]
    | undefined,
  installationRevision: string,
  retained: LockFileMap = new Map<string, string>(),
): LockFile {
  // Retained entries carry still-unresolved orphans forward so ownership
  // is lost only when the orphan is force-removed or disappears from disk.
  const files = new Map<string, string>(retained);
  for (const file of desired) {
    const target = targets.get(file.path);
    if (target === undefined) continue; // broken block: nothing we own yet
    files.set(file.path, sha256Hex(target.owned));
  }
  return {
    schemaVersion: 4 as const,
    cliVersion: version,
    installationRevision,
    upstreams: upstreams ?? [],
    files,
  };
}

/** Append conflict entries for paths whose block markers broke. */
export function withBrokenBlockConflicts(
  plan: readonly ManagedPlanEntry[],
  snapshot: WorkspaceSnapshot,
): readonly ManagedPlanEntry[] {
  const entries: ManagedPlanEntry[] = [...plan];
  for (const [path, issues] of snapshot.blockFailures) {
    entries.push({
      kind: "conflict",
      path,
      reason: `broken managed block markers: ${issues.join("; ")}`,
    });
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** A plan may be applied only when every conflict is force-covered. */
export function blockedConflicts(
  plan: readonly ManagedPlanEntry[],
  forceManaged: readonly string[],
  targets: ReadonlyMap<string, FileTarget>,
): readonly ManagedPlanEntry[] {
  const forced = new Set(forceManaged);
  return plan.filter(
    (entry) => entry.kind === "conflict" && (!forced.has(entry.path) || !targets.has(entry.path)),
  );
}

/** Distinguish broken managed markers from other ownership conflicts. */
export function entryDiagnostic(entry: ManagedPlanEntry, snapshot: WorkspaceSnapshot): Diagnostic {
  const code = snapshot.blockFailures.has(entry.path) ? GL.brokenBlock : GL.managedConflict;
  return diagnostic(code, "error", entry.reason ?? "conflict", entry.path);
}

/**
 * The summary line for a blocked run. Broken markers (GL0108) have no
 * owned region to overwrite, so --force-managed can never clear them;
 * the guidance must say so instead of pointing at a flag that no-ops.
 */
export function blockedSummary(
  blocked: readonly ManagedPlanEntry[],
  snapshot: WorkspaceSnapshot,
): string {
  const base =
    "managed paths are occupied or modified; re-run with --force-managed <path> to overwrite them";
  if (blocked.some((entry) => snapshot.blockFailures.has(entry.path))) {
    return `${base}; broken block markers cannot be forced: repair the markers or delete the file, then re-run`;
  }
  return base;
}

interface PlanExecution {
  readonly writes: readonly { path: string; content: string }[];
  readonly effects: readonly EffectJson[];
  readonly removals: readonly string[];
}

/**
 * Translate a plan into writes, effects, and (forced) removals.
 * Conflicts are never written unless --force-managed names them;
 * orphans are reported and removed only when forced.
 */
export function planExecution(
  plan: readonly ManagedPlanEntry[],
  targets: ReadonlyMap<string, FileTarget>,
  forceManaged: readonly string[],
): PlanExecution {
  const writes: { path: string; content: string }[] = [];
  const effects: EffectJson[] = [];
  const removals: string[] = [];
  const forced = new Set(forceManaged);
  for (const entry of plan) {
    switch (entry.kind) {
      case "create":
      case "update": {
        const target = targets.get(entry.path);
        if (target === undefined) break; // unreachable; keep defensive
        writes.push({ path: entry.path, content: target.text });
        effects.push({ kind: entry.kind, path: entry.path });
        break;
      }
      case "unchanged":
        effects.push({ kind: "unchanged", path: entry.path });
        break;
      case "conflict": {
        effects.push({ kind: "conflict", path: entry.path, reason: entry.reason ?? "" });
        if (forced.has(entry.path)) {
          const target = targets.get(entry.path);
          if (target !== undefined) {
            writes.push({ path: entry.path, content: target.text });
          }
        }
        break;
      }
      case "orphan":
        effects.push({ kind: "orphan", path: entry.path });
        if (forced.has(entry.path)) removals.push(entry.path);
        break;
    }
  }
  return { writes, effects, removals };
}

export function unknownForceDiagnostics(
  plan: readonly ManagedPlanEntry[],
  forceManaged: readonly string[],
): readonly Diagnostic[] {
  const known = new Set(plan.map((entry) => entry.path));
  return forceManaged
    .filter((path) => !known.has(path))
    .map((path) =>
      diagnostic(
        GL.unknownForceTarget,
        "error",
        `--force-managed names a path the plan does not cover: '${path}'`,
        path,
      ),
    );
}

/** A config file's planned write, deduplicated against its current bytes. */
interface ConfigWrite {
  readonly path: string;
  readonly content: string;
  readonly effect: EffectJson;
}

export function configWrite(
  path: string,
  content: string,
  existing: string | undefined,
): ConfigWrite {
  if (existing === content) {
    return { path, content, effect: { kind: "unchanged", path } };
  }
  return {
    path,
    content,
    effect: existing === undefined ? { kind: "create", path } : { kind: "update", path },
  };
}
