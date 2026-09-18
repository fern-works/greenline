import { sha256Hex } from "../commons/hash.ts";

/**
 * The managed-file engine (`docs/SPEC.md` §5). Pure decision logic:
 * given what we want on disk, what the lock says we own, and what is
 * actually there, it produces a plan of creates, updates, unchanged,
 * conflicts, and orphans. The shell applies the plan atomically; this
 * module never touches the filesystem.
 */

export type ManagedKind = "create" | "update" | "unchanged" | "conflict" | "orphan";

export interface ManagedPlanEntry {
  readonly kind: ManagedKind;
  readonly path: string;
  /** The content to write for create/update; absent otherwise. */
  readonly content?: string;
  readonly reason?: string;
}

/**
 * What greenline wants at one path. For whole files `text` and `owned`
 * are the same bytes; for managed-block paths `owned` is only the
 * generated region whose digest the lock tracks, so user content around
 * the block never trips a conflict.
 */
export interface FileTarget {
  /** The full bytes to write on create/update. */
  readonly text: string;
  /** The bytes whose sha256 the lock records as ours. */
  readonly owned: string;
}

/** The hash map the lock carries: managed path -> sha256 of its owned region. */
export type LockFileMap = ReadonlyMap<string, string>;

/** What a sync pass wants the workspace to contain. */
export interface ManagedInput {
  readonly desired: ReadonlyMap<string, FileTarget>;
  /** The hashes the previous lock recorded as ours. */
  readonly locked: LockFileMap;
  /** The hashes of whatever is currently on disk. */
  readonly disk: LockFileMap;
}

function sortedPaths(input: ManagedInput): readonly string[] {
  const all = new Set<string>();
  for (const path of input.desired.keys()) all.add(path);
  for (const path of input.locked.keys()) all.add(path);
  for (const path of input.disk.keys()) all.add(path);
  return [...all].sort();
}

/**
 * True when a root `AGENTS.override.md` exists (ADR 0004): Codex would
 * ignore the canonical AGENTS.md, so setup must stop before any mutation.
 * Path keys are repo-root-relative.
 */
export function isAgentsOverridePresent(disk: LockFileMap): boolean {
  return disk.has("AGENTS.override.md");
}

/**
 * Classify every managed path into one action. Deterministic: identical
 * inputs produce byte-identical plans in sorted path order.
 */
export function planManagedFiles(input: ManagedInput): readonly ManagedPlanEntry[] {
  const entries: ManagedPlanEntry[] = [];
  for (const path of sortedPaths(input)) {
    const wanted = input.desired.get(path);
    const lockedHash = input.locked.get(path);
    const diskHash = input.disk.get(path);
    if (wanted === undefined) {
      // An orphan is a path the lock records as ours that we no longer
      // generate and that still exists. Unrelated user files are none
      // of our business and stay untouched.
      if (lockedHash !== undefined && diskHash !== undefined) {
        entries.push({ kind: "orphan", path });
      }
      continue;
    }
    if (diskHash === undefined) {
      entries.push({ kind: "create", path, content: wanted.text });
      continue;
    }
    const wantedHash = sha256Hex(wanted.owned);
    if (diskHash === wantedHash) {
      entries.push({ kind: "unchanged", path });
      continue;
    }
    if (lockedHash !== undefined && lockedHash === diskHash) {
      // The lock agrees disk is ours, but the desired content changed:
      // a lawful update in place.
      entries.push({ kind: "update", path, content: wanted.text });
      continue;
    }
    entries.push({
      kind: "conflict",
      path,
      reason:
        lockedHash === undefined
          ? "unmanaged file occupies a managed path"
          : "user-modified region differs from the lock",
    });
  }
  return entries;
}
