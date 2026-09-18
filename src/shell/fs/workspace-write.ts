import { closeSync, mkdirSync, openSync, rmdirSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { err, ok, type Result } from "../../commons/result.ts";
import { AtomicWriteFailed } from "./io.ts";

/** Synchronous nesting is safe; independent processes must acquire the exclusive file. */
const held = new Set<string>();

/** Serialize cooperating writers, including an inspector save followed by sync. */
export function withWorkspaceWrite<T>(root: string, action: () => T): Result<T, AtomicWriteFailed> {
  if (held.has(root)) return ok(action());
  const directory = join(root, ".greenline", "tmp");
  const path = join(directory, ".write.lock");
  let created: string | undefined;
  const cleanEmptyParents = (): void => {
    if (created === undefined) return;
    for (const dir of [directory, dirname(directory)]) {
      if (dir.length < created.length) break;
      try {
        rmdirSync(dir);
      } catch {
        break;
      } // Only empty directories we created; another writer's files remain.
    }
  };
  let fd: number;
  try {
    created = mkdirSync(directory, { recursive: true });
    fd = openSync(path, "wx");
  } catch (error) {
    cleanEmptyParents();
    return err(
      new AtomicWriteFailed(
        path,
        "lock",
        `another greenline writer may be active; retry when it finishes. If interrupted, confirm no writer is running before removing this lock. ${String(error)}`,
      ),
    );
  }
  held.add(root);
  let outcome: Result<T, AtomicWriteFailed>;
  try {
    writeSync(fd, `${process.pid}\n`);
    outcome = ok(action());
  } catch (error) {
    outcome = err(new AtomicWriteFailed(path, "locked operation", String(error)));
  }
  held.delete(root);
  const releaseFailures: string[] = [];
  try {
    closeSync(fd);
  } catch (error) {
    releaseFailures.push(String(error));
  }
  try {
    unlinkSync(path);
  } catch (error) {
    releaseFailures.push(String(error));
  }
  cleanEmptyParents();
  return releaseFailures.length === 0
    ? outcome
    : err(new AtomicWriteFailed(path, "release lock", releaseFailures.join("; ")));
}
