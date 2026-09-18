import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Repository-root detection by filesystem walk only: no `git` child
 * process, no network, works in worktrees and bare markers alike.
 * `start` must be an absolute directory path.
 */
export function findGitRoot(start: string): string | undefined {
  let current: string = start;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent: string = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
