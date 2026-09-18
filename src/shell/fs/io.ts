import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { err, ok, type Result } from "../../commons/result.ts";

/**
 * The filesystem adapter for managed writes (`docs/CODE-STANDARDS.md`
 * §4: real filesystem lives in the shell). Every write is atomic:
 * content goes to a temp file in the destination directory, is
 * fsynced, then renamed over the target — a failure never leaves a
 * partially written target.
 */

export class AtomicWriteFailed extends Error {
  readonly _tag = "AtomicWriteFailed" as const;
  readonly path: string;
  readonly step: string;
  constructor(path: string, step: string, message: string) {
    super(`atomic write to '${path}' failed during ${step}: ${message}`);
    this.path = path;
    this.step = step;
  }
}

/** Atomically replace (or create) a file's content. */
export function atomicWriteFile(path: string, content: string): Result<void, AtomicWriteFailed> {
  const tempPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(tempPath, "w");
    try {
      writeSync(fd, content, null, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, path);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; the temp path is uniquely named and inert.
    }
    return err(new AtomicWriteFailed(path, "write", String(error)));
  }
  return ok(undefined);
}

/** The filesystem capabilities a file plan needs, injectable for tests. */
export interface FileIo {
  readonly write: (path: string, content: string) => Result<void, AtomicWriteFailed>;
  readonly read: (path: string) => Result<string, AtomicWriteFailed>;
  readonly remove: (path: string) => Result<void, AtomicWriteFailed>;
}

/**
 * The real filesystem adapter. Reads and removals that fail are tagged
 * failures; the planner treats a missing file as an absent file, and
 * preimage capture distinguishes a missing file from an unreadable one.
 */
export function createNodeFileIo(): FileIo {
  return {
    write: (path: string, content: string): Result<void, AtomicWriteFailed> =>
      atomicWriteFile(path, content),
    read: (path: string): Result<string, AtomicWriteFailed> => {
      try {
        return ok(readFileSync(path, "utf8"));
      } catch (error) {
        const absent = z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
        return err(new AtomicWriteFailed(path, absent ? "absent" : "read", String(error)));
      }
    },
    remove: (path: string): Result<void, AtomicWriteFailed> => {
      try {
        unlinkSync(path);
        return ok(undefined);
      } catch (error) {
        return err(new AtomicWriteFailed(path, "remove", String(error)));
      }
    },
  };
}
