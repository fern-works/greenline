import { join } from "node:path";
import { sha256Hex } from "../commons/hash.ts";
import type { LockFileMap, FileTarget } from "../core/managed-file.ts";
import { composeBlockTarget, splitManagedBlock } from "../core/managed-block.ts";
import { POLICY_BLOCK_KEY, type DesiredFile } from "../core/render.ts";
import type { FileIo } from "./fs/io.ts";

/**
 * Reads and composes the current workspace state (`docs/SPEC.md` §5).
 * All I/O sits here in the shell; every decision (block composition,
 * owned-region hashing, classification) stays in core. Paths in the
 * returned maps are repo-root-relative.
 */

export interface WorkspaceSnapshot {
  readonly manifestText: string | undefined;
  readonly lockText: string | undefined;
  /** A root AGENTS.override.md blocks setup (ADR 0004). */
  readonly overridePresent: boolean;
  /** Composed targets: bytes to write + owned region, per desired path. */
  readonly targets: ReadonlyMap<string, FileTarget>;
  /** Owned-region hash of what is on disk, per desired path present. */
  readonly diskHashes: LockFileMap;
  /** Paths whose managed block is malformed, with the layout issues. */
  readonly blockFailures: ReadonlyMap<string, readonly string[]>;
}

function readIfPresent(path: string, io: FileIo): string | undefined {
  const read = io.read(path);
  return read._tag === "ok" ? read.value : undefined;
}

export function snapshotWorkspace(
  root: string,
  desired: readonly DesiredFile[],
  io: FileIo,
  lockedPaths: ReadonlySet<string>,
): WorkspaceSnapshot {
  const manifestText = readIfPresent(join(root, ".greenline", "manifest.json"), io);
  const lockText = readIfPresent(join(root, ".greenline", "lock.json"), io);
  const overridePresent = io.read(join(root, "AGENTS.override.md"))._tag === "ok";

  const targets = new Map<string, FileTarget>();
  const diskHashes = new Map<string, string>();
  const blockFailures = new Map<string, readonly string[]>();

  for (const file of desired) {
    const disk = readIfPresent(join(root, file.path), io);
    if (file.kind === "file") {
      targets.set(file.path, { text: file.content, owned: file.content });
      if (disk !== undefined) diskHashes.set(file.path, sha256Hex(disk));
      continue;
    }
    const key: string = file.key ?? POLICY_BLOCK_KEY;
    const composed = composeBlockTarget(disk, file.content, key);
    if (composed._tag === "err") {
      blockFailures.set(file.path, composed.error.issues);
      continue;
    }
    targets.set(file.path, composed.value);
    if (disk !== undefined) {
      const split = splitManagedBlock(disk, key);
      // compose succeeded, so the split is clean; a file with no block
      // yet (or a foreign-key block) owns nothing on disk.
      if (split.block !== undefined) diskHashes.set(file.path, sha256Hex(split.block));
    }
  }
  // Orphan detection (`docs/SPEC.md` §5): the lock may own paths this
  // projection no longer generates. Hash whatever sits at those paths
  // so the classifier can see them; without this the orphan branch
  // starves and stale generated files silently lose their ownership.
  const desiredPaths = new Set(desired.map((file) => file.path));
  for (const path of lockedPaths) {
    if (desiredPaths.has(path)) continue;
    const disk = readIfPresent(join(root, path), io);
    if (disk !== undefined) diskHashes.set(path, sha256Hex(disk));
  }
  return { manifestText, lockText, overridePresent, targets, diskHashes, blockFailures };
}
