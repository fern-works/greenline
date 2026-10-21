import { readdirSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { z } from "zod";
import { err } from "../../commons/result.ts";
import { AtomicWriteFailed, createNodeFileIo, type FileIo } from "../fs/io.ts";

/** A document larger than this is named and not shown: the page stays quick to open. */
const SHOWN_LIMIT = 512 * 1024;

/** A repository file as the page shows it: its text, or why it is not shown. */
export interface ShownText {
  readonly text: string | null;
  readonly problem: string | null;
}

/**
 * Read one repository file to show in the page: refused outside the
 * repository as `readInstalledFile` refuses it, and named rather than shown
 * when it is too large.
 * @param root the repository root
 * @param path the repository-relative path
 * @returns the text, or why it is not shown
 */
export function readShownFile(root: string, path: string): ShownText {
  try {
    // The containment check comes first, so not even the size of a file outside reaches the page.
    const resolved = realpathSync(join(root, path));
    if (!resolved.startsWith(realpathSync(root) + sep))
      return { text: null, problem: "it resolves outside the repository" };
    const size = statSync(resolved).size;
    if (size > SHOWN_LIMIT)
      return { text: null, problem: `${Math.round(size / 1024)} KB, too large to show here` };
  } catch {
    return { text: null, problem: "cannot be read" };
  }
  const read = readInstalledFile(root, createNodeFileIo(), path);
  return read._tag === "ok"
    ? { text: read.value, problem: null }
    : { text: null, problem: read.error.message };
}

/**
 * Whether a repository path resolves outside the repository, through a link
 * anywhere along it; a path that does not resolve at all is not outside.
 * @param root the repository root
 * @param path the repository-relative path
 * @returns true when it resolves outside
 */
export function resolvesOutside(root: string, path: string): boolean {
  try {
    return !realpathSync(join(root, path)).startsWith(realpathSync(root) + sep);
  } catch {
    return false;
  }
}

/** A directory's Markdown files, or why it cannot be listed. */
export interface MarkdownListing {
  readonly files: readonly string[];
  /** Why the directory cannot be listed; null when it can or is absent. */
  readonly problem: string | null;
}

/**
 * The Markdown files of one repository directory, sorted; none when it is
 * absent, and a refusal when it resolves outside the repository, so a link
 * in a cloned repository never lists another directory.
 * @param root the repository root
 * @param path the repository-relative directory
 * @returns the file names, or why the directory cannot be listed
 */
export function listMarkdownFiles(root: string, path: string): MarkdownListing {
  try {
    const resolved = realpathSync(join(root, path));
    if (!resolved.startsWith(realpathSync(root) + sep))
      return { files: [], problem: "it resolves outside the repository" };
    const files = readdirSync(resolved, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
    return { files, problem: null };
  } catch (error) {
    const absent = z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
    return { files: [], problem: absent ? null : String(error) };
  }
}

/**
 * Read one repository file for the inspector, refusing a path that resolves
 * outside the repository before any byte is read: a link in a cloned
 * repository must never carry another file's content into the page. A
 * missing file is the step `absent`, which callers may treat as empty.
 * @param root the repository root
 * @param io the file reader
 * @param path the repository-relative path
 * @returns the text, or why it could not be read
 */
export function readInstalledFile(
  root: string,
  io: FileIo,
  path: string,
): ReturnType<FileIo["read"]> {
  const location = join(root, path);
  try {
    const resolved = realpathSync(location);
    if (!resolved.startsWith(realpathSync(root) + sep))
      return err(
        new AtomicWriteFailed(path, "read", "installed context resolves outside the repository"),
      );
    return io.read(resolved);
  } catch (error) {
    const absent = z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
    return err(new AtomicWriteFailed(path, absent ? "absent" : "read", String(error)));
  }
}
