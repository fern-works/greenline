import { err, ok, type Result } from "../../commons/result.ts";
import type { FileIo } from "./io.ts";

/**
 * A transactional file plan (`docs/SPEC.md` §4: a failed sync must not
 * leave a half-generated workspace). Preimages are captured before any
 * write; a mid-plan failure rolls every already-applied write back.
 */

/** One planned destination. */
export interface FileWrite {
  readonly path: string;
  readonly content: string;
}

export type FileMutation = FileWrite | { readonly path: string; readonly remove: true };

export class FilePlanFailed extends Error {
  readonly _tag = "FilePlanFailed" as const;
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.path = path;
  }
}

/**
 * Apply every entry in order; on the first failure restore the files
 * already written and delete files this plan created. Rejections are
 * tagged values, never throws.
 */
export function applyFilePlan(
  entries: readonly FileMutation[],
  io: FileIo,
): Result<void, FilePlanFailed> {
  const preimages = new Map<string, string | undefined>();
  for (const entry of entries) {
    const read = io.read(entry.path);
    if (read._tag === "err" && read.error.step !== "absent")
      return err(new FilePlanFailed(entry.path, read.error.message));
    preimages.set(entry.path, read._tag === "ok" ? read.value : undefined);
  }
  const applied: FileMutation[] = [];
  for (const entry of entries) {
    if ("remove" in entry && preimages.get(entry.path) === undefined) continue;
    const write = "remove" in entry ? io.remove(entry.path) : io.write(entry.path, entry.content);
    if (write._tag === "err") {
      const recoveryFailures: string[] = [];
      for (const done of [...applied].reverse()) {
        const preimage = preimages.get(done.path);
        const restored =
          preimage === undefined ? io.remove(done.path) : io.write(done.path, preimage);
        if (restored._tag === "err") recoveryFailures.push(restored.error.message);
      }
      return err(
        new FilePlanFailed(
          entry.path,
          [
            write.error.message,
            ...recoveryFailures.map((message) => `rollback failed: ${message}`),
          ].join("; "),
        ),
      );
    }
    applied.push(entry);
  }
  return ok(undefined);
}
