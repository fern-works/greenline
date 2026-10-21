import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, parse, sep } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import { isChangeId } from "../core/change.ts";
import {
  tidyVerdict,
  type LedgerText,
  type TargetPath,
  type TidyDisk,
  type TidyReason,
} from "../core/tidy.ts";

/**
 * `greenline tidy` on the disk (`workshop/components/cli-contracts.md`,
 * "The tidy command"): it removes `.greenline/tmp/<id>/` of a done or dropped
 * change, by `tidyVerdict` in `src/core/tidy.ts`, and nothing else. It runs
 * under the writer lock the CLI takes for every write and runs no git. Before
 * it removes a folder it checks the disk: `.greenline/` and its tmp folder
 * are folders, no links and on one file system, the working folder is a
 * folder inside tmp and no link, every file of the ledger could be read, no
 * link in the ledger resolves into the folder, and no local link target,
 * resolved on the disk through any symbolic link, reaches it. The removal
 * never follows a link and never crosses onto another file system: a link
 * inside the folder is removed as a link, and each folder it descends into
 * must still resolve to the place it was reached from. A removal that fails
 * part way leaves the rest of that folder in place for a later run, and
 * `status` keeps reporting it.
 */

/** One working folder tidy kept: where, why, and whether keeping it refuses the request. */
export interface TidyKept {
  readonly path: string;
  readonly reason: TidyReason;
  /** True when keeping it is an error: the change was named, or a finished change's folder could not be removed safely. */
  readonly refused: boolean;
}

/** What one run removed and what it kept, each path from the repository root. */
export interface TidyReport {
  readonly removed: readonly string[];
  readonly kept: readonly TidyKept[];
}

/** A removal that failed part way: the folder, the error, and what the run had removed before it. */
class TidyRemovalFailed extends Error {
  readonly _tag = "TidyRemovalFailed" as const;
  readonly path: string;
  readonly removed: readonly string[];
  constructor(path: string, message: string, removed: readonly string[]) {
    super(`could not remove '${path}' whole: ${message}; what remains stays for a later run`);
    this.path = path;
    this.removed = removed;
  }
}

const GREENLINE = ".greenline";
const WORKING = ".greenline/tmp";
const LEDGER = ".greenline/ledger";
/** The ledger's managed guide, which is no record. */
const GUIDE = `${LEDGER}/README.md`;

/** Whether a path is a folder and no link; false when it is absent. */
function isFolder(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Whether anything, a dangling link included, stands at a path. */
function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Whether a folder resolves to exactly the place it was reached from. */
function resolvesTo(path: string, expected: string): boolean {
  try {
    return realpathSync(path) === expected;
  } catch {
    return false;
  }
}

/** An absolute path's segments, compared without regard to case or Unicode form. */
function foldedPath(path: string): readonly string[] {
  return path
    .split(/[\\/]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.normalize("NFC").toLowerCase());
}

/** Whether one absolute path is the other, stands inside it, or holds it. */
function touches(path: string, folder: string): boolean {
  const a = foldedPath(path);
  const b = foldedPath(folder);
  const inside = (inner: readonly string[], outer: readonly string[]): boolean =>
    outer.length <= inner.length && outer.every((segment, index) => inner[index] === segment);
  return inside(a, b) || inside(b, a);
}

/** Text in the encoding its byte-order mark names, UTF-8 otherwise. */
function decodedText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return bytes.toString("utf8");
}

/** The ledger read whole: its files' text, and each symbolic link in it with where it resolves. */
type LedgerRead =
  | {
      readonly kind: "read";
      readonly texts: readonly LedgerText[];
      readonly links: readonly { readonly path: string; readonly real: string }[];
    }
  | { readonly kind: "unreadable"; readonly detail: string };

/**
 * Every file under the ledger, whatever its name, its path from the root and
 * its text; the managed guide left out; a linked folder followed once; and
 * each symbolic link with the place it resolves to. A folder or a file that
 * cannot be read refuses the whole read, since a citation could hide in it;
 * a FIFO, a socket or a device is never opened. No ledger folder holds no
 * file.
 */
function ledgerFiles(root: string): LedgerRead {
  const texts: LedgerText[] = [];
  const links: { path: string; real: string }[] = [];
  const seen = new Set<string>();
  const visit = (relative: string): string | undefined => {
    let real: string;
    let names: readonly string[];
    try {
      real = realpathSync(join(root, relative));
      if (seen.has(real)) return undefined;
      seen.add(real);
      names = readdirSync(join(root, relative)).sort();
    } catch (error) {
      return `${relative}: ${String(error)}`;
    }
    for (const name of names) {
      const path = `${relative}/${name}`;
      const full = join(root, path);
      let isLink: boolean;
      try {
        isLink = lstatSync(full).isSymbolicLink();
      } catch (error) {
        // A folder that lists its names but cannot be entered hides its files: refuse.
        return `${path}: ${String(error)}`;
      }
      if (isLink) {
        try {
          links.push({ path, real: realpathSync(full) });
        } catch (error) {
          // Only a link to nothing, or a loop of links, points at no file a removal could take.
          if (!z.object({ code: z.enum(["ENOENT", "ELOOP"]) }).safeParse(error).success)
            return `${path}: ${String(error)}`;
          continue;
        }
      }
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(full);
      } catch (error) {
        return `${path}: ${String(error)}`;
      }
      if (stat.isDirectory()) {
        const failed = visit(path);
        if (failed !== undefined) return failed;
        continue;
      }
      if (!stat.isFile() || path === GUIDE) continue;
      try {
        texts.push({ path, text: decodedText(readFileSync(full)) });
      } catch (error) {
        return `${path}: ${String(error)}`;
      }
    }
    return undefined;
  };
  if (!exists(join(root, LEDGER))) return { kind: "read", texts: [], links: [] };
  if (!isFolder(join(root, LEDGER)))
    return { kind: "unreadable", detail: `${LEDGER}: a link or a file, not the ledger folder` };
  const failed = visit(LEDGER);
  return failed === undefined
    ? { kind: "read", texts, links }
    : { kind: "unreadable", detail: failed };
}

/**
 * Where a path resolves on the disk, read segment by segment from a base the
 * way the system reads it: each segment that exists is resolved through its
 * links before the next is read, so a `..` after a link climbs from where the
 * link led; the segments past the first that does not exist are read as text.
 */
function resolvedOnDisk(base: string, segments: readonly string[]): string {
  let current = base;
  let present = true;
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    current = segment === ".." ? dirname(current) : join(current, segment);
    if (!present) continue;
    try {
      current = realpathSync(current);
    } catch {
      present = false;
    }
  }
  return current;
}

/**
 * The disk's answer for one working folder: whether a local target, read from
 * the directory of the file that holds it, from the repository root, or as an
 * absolute path, resolves on the disk into the folder, onto it or onto a
 * folder above it.
 */
function diskFor(rootReal: string, folderReal: string): TidyDisk {
  const reaches = (from: string, path: TargetPath): boolean => {
    // A drive-letter path, `C:/...` or `file:///C:/...`, starts at that drive's root.
    const first = path.segments.findIndex((segment) => segment !== "");
    const drive = first === -1 ? undefined : /^[a-z]:$/i.exec(path.segments[first] ?? "")?.[0];
    if (path.absolute && drive !== undefined)
      return touches(resolvedOnDisk(`${drive}${sep}`, path.segments.slice(first + 1)), folderReal);
    const bases = path.absolute
      ? [rootReal, parse(rootReal).root]
      : [resolvedOnDisk(rootReal, from.split("/").slice(0, -1)), rootReal];
    return bases.some((base) => touches(resolvedOnDisk(base, path.segments), folderReal));
  };
  return { root: rootReal.split(sep).join("/"), reaches };
}

/**
 * Remove a folder and everything under it without following a link or
 * leaving its file system: each entry is read with lstat, a link or a file is
 * unlinked, and a folder is emptied only while it still resolves to the place
 * it was reached from and stands on the tmp folder's file system.
 */
function removeTree(path: string, real: string, device: number): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    try {
      unlinkSync(path);
    } catch (error) {
      // A link to a folder on Windows is removed as a folder entry, never through it.
      if (!stat.isSymbolicLink()) throw error;
      rmdirSync(path);
    }
    return;
  }
  if (stat.dev !== device)
    throw new Error(`'${path}' is a mount of another file system; nothing under it was removed`);
  if (realpathSync(path) !== real)
    throw new Error(`'${path}' no longer resolves to '${real}'; nothing under it was removed`);
  for (const name of readdirSync(path)) removeTree(join(path, name), join(real, name), device);
  rmdirSync(path);
}

/**
 * Where `.greenline/` or its tmp folder is a link, is no folder, resolves
 * outside the repository, or stands on another file system than the folder
 * above it: the path tidy refuses to remove anything through, and that the
 * runner checks before it takes the writer lock, so not even the lock is
 * written there.
 * @param root the repository root
 * @returns `.greenline` or `.greenline/tmp`, or undefined when neither is redirected
 */
export function redirection(root: string): string | undefined {
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return GREENLINE;
  }
  const greenline = join(root, GREENLINE);
  if (!exists(greenline)) return undefined;
  if (!isFolder(greenline) || !resolvesTo(greenline, join(rootReal, GREENLINE))) return GREENLINE;
  const working = join(root, WORKING);
  if (!exists(working)) return undefined;
  if (!isFolder(working) || !resolvesTo(working, join(rootReal, GREENLINE, "tmp"))) return WORKING;
  if (lstatSync(working).dev !== lstatSync(greenline).dev) return WORKING;
  return undefined;
}

/** The device id of the file system a path stands on, read without following a link. */
export type DeviceOf = (path: string) => number;

const lstatDevice: DeviceOf = (path) => lstatSync(path).dev;

/**
 * Remove the working folders of finished changes: the one change named, or
 * every change with a working folder when none is named. A named change
 * whose folder is kept is refused; with none named, an open or stopped
 * change's folder and one with no record or an unparsable record are kept
 * quietly, while a finished change's folder that cannot be removed safely,
 * one that is a mount of another file system included, is refused.
 * @param root the repository root
 * @param change the change id named with `--change`, or undefined for every change
 * @param deviceOf the device id a path stands on; the disk's, unless a test names another
 * @returns what was removed and kept, or the removal that failed part way
 */
export function tidyWorkingFolders(
  root: string,
  change: string | undefined,
  deviceOf: DeviceOf = lstatDevice,
): Result<TidyReport, TidyRemovalFailed> {
  const named = change !== undefined;
  const refuse = (path: string, reason: TidyReason): Result<TidyReport, never> =>
    ok({ removed: [], kept: [{ path, reason, refused: true }] });
  if (change !== undefined && !isChangeId(change))
    return refuse(WORKING, { kind: "not-a-change-id", name: change });
  const redirect = redirection(root);
  if (redirect !== undefined) return refuse(redirect, { kind: "redirected" });
  const working = join(root, WORKING);
  if (!exists(working)) return ok({ removed: [], kept: [] });
  const rootReal = realpathSync(root);
  const workingReal = join(rootReal, GREENLINE, "tmp");
  const device = deviceOf(working);

  let candidates: readonly string[];
  if (change !== undefined) candidates = exists(join(working, change)) ? [change] : [];
  else {
    try {
      candidates = readdirSync(working)
        .filter((name) => isChangeId(name))
        .sort();
    } catch (error) {
      return refuse(WORKING, { kind: "unreadable", detail: `${WORKING}: ${String(error)}` });
    }
  }
  if (candidates.length === 0) return ok({ removed: [], kept: [] });

  const ledger = ledgerFiles(root);
  if (ledger.kind === "unreadable")
    return refuse(LEDGER, { kind: "unreadable", detail: ledger.detail });
  const removed: string[] = [];
  const kept: TidyKept[] = [];
  for (const id of candidates) {
    const path = `${WORKING}/${id}`;
    const real = join(workingReal, id);
    const record = ledger.texts.find((file) => file.path === `${LEDGER}/${id}.md`)?.text;
    // A link in the ledger that resolves into the folder makes it a place the ledger holds.
    const linked = ledger.links.find((link) => touches(link.real, real));
    const verdict =
      linked === undefined
        ? tidyVerdict(id, record, ledger.texts, diskFor(rootReal, real))
        : tidyVerdict(id, record, []);
    const reason: TidyReason | undefined =
      verdict.kind === "keep"
        ? verdict.reason
        : linked === undefined
          ? undefined
          : { kind: "cited", by: linked.path, target: linked.real };
    if (reason !== undefined) {
      const quiet =
        !named &&
        (reason.kind === "unfinished" || reason.kind === "no-record" || reason.kind === "unparsed");
      kept.push({ path, reason, refused: !quiet });
      continue;
    }
    const folder = join(working, id);
    if (!isFolder(folder) || !resolvesTo(folder, real)) {
      kept.push({ path, reason: { kind: "not-a-folder" }, refused: true });
      continue;
    }
    // The working folder itself a mount of another file system is kept; a mount deeper inside stops the removal.
    if (deviceOf(folder) !== device) {
      kept.push({ path, reason: { kind: "redirected" }, refused: true });
      continue;
    }
    try {
      removeTree(folder, real, device);
    } catch (error) {
      return err(new TidyRemovalFailed(path, String(error), removed));
    }
    removed.push(path);
  }
  return ok({ removed, kept });
}
