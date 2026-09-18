import { readdirSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";

/**
 * Deterministic recursive directory listing for shell adapters. Paths
 * are root-relative with forward slashes on every platform; entries
 * are visited in sorted order so identical trees list identically.
 */

/** List every file under `root`, recursively, sorted, POSIX-relative. */
export function listFilesRecursive(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.push(
          full
            .slice(root.length + 1)
            .split(/[\\/]/)
            .join("/"),
        );
    }
  };
  walk(root);
  return out;
}

/**
 * Whether an entry's name matches one marker: an exact file name, a
 * `*.ext` suffix, or, with a trailing slash, a directory by either spelling.
 */
function matchesMarker(name: string, isDirectory: boolean, marker: string): boolean {
  const wantsDirectory = marker.endsWith("/");
  if (wantsDirectory !== isDirectory) return false;
  const pattern = wantsDirectory ? marker.slice(0, -1) : marker;
  return pattern.startsWith("*.") ? name.endsWith(pattern.slice(1)) : name === pattern;
}

/**
 * Every entry under `root` matching one of the markers, sorted,
 * POSIX-relative, never descending into a directory named in `skip`
 * (matched by basename at any depth). A marker is a file name, a
 * `*.ext` suffix, or a `name/` directory. Unreadable subtrees are
 * skipped, not thrown: the scan states what it could see.
 */
export function findFilesNamed(
  root: string,
  names: readonly string[],
  skip: readonly string[],
): readonly string[] {
  const skipped = new Set(skip);
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let entries: readonly Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const isDirectory = entry.isDirectory();
      if (names.some((marker) => matchesMarker(entry.name, isDirectory, marker))) {
        out.push(isDirectory ? `${relPath}/` : relPath);
      }
      if (isDirectory && !skipped.has(entry.name)) walk(join(dir, entry.name), relPath);
    }
  };
  walk(root, "");
  return out;
}
