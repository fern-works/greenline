import { parseRecordForm } from "./change.ts";

/**
 * What `greenline tidy` decides about one change's working folder,
 * `.greenline/tmp/<id>/`, before anything touches the disk
 * (`workshop/components/cli-contracts.md`, "The tidy command"): the folder is
 * removed only when the change's record parses and is done or dropped, and no
 * file of the ledger links into the folder, onto it or onto a folder above
 * it. Everything else keeps it. The links are read more widely than `status`
 * reads a citation, since a wrong removal cannot be undone: a link in a fence
 * or a code span counts, so does a reference definition wherever it stands,
 * an angle-bracketed target, an autolink and an HTML attribute that links; a
 * target's character references and percent escapes are read and it is
 * compared without regard to case or the slash's direction; and the shell
 * answers for a local target resolved on the disk, so a link through a
 * symbolic link counts too. A plain mention of the folder in prose is no link
 * and cites nothing.
 */

/** One file of the ledger: its path from the repository root, and its text. */
export interface LedgerText {
  readonly path: string;
  readonly text: string;
}

/**
 * Why tidy keeps a change's working folder: the record's reasons, which
 * `tidyVerdict` gives, and the disk's, which the shell finds: a name that is
 * no change id, a working folder that is a link or a file rather than a
 * folder inside `tmp/`, a `.greenline/` or `tmp/` that is a link or resolves
 * elsewhere, and a ledger file or the tmp folder that cannot be read.
 */
export type TidyReason =
  | { readonly kind: "no-record" }
  | { readonly kind: "unparsed"; readonly issues: string }
  | { readonly kind: "unfinished"; readonly state: "open" | "stopped" }
  | { readonly kind: "cited"; readonly by: string; readonly target: string }
  | { readonly kind: "not-a-change-id"; readonly name: string }
  | { readonly kind: "not-a-folder" }
  | { readonly kind: "redirected" }
  | { readonly kind: "unreadable"; readonly detail: string };

/** Remove the folder, or keep it and say why. */
export type TidyVerdict =
  | { readonly kind: "remove" }
  | { readonly kind: "keep"; readonly reason: TidyReason };

const WORKING = ".greenline/tmp";

/** An inline or image link's target: `](target)` or `](<target>)`, whatever the link text holds. */
const INLINE = /\]\(\s*(?:<([^>]*)>|([^)\s]+))/g;
/**
 * A reference definition's target: `[label]: target` or `[label]: <target>`,
 * behind any indent, blockquote mark or list marker, its label holding
 * escaped brackets or line breaks, its target on the same line or the next.
 */
const DEFINITION =
  /^(?:[ \t>]|[-*+](?=[ \t])|\d{1,9}[.)](?=[ \t]))*\[(?:[^\]\\]|\\.)+\]:[ \t]*\n?[ \t>]*(?:<([^>\n]*)>|(\S+))/gm;
/** An autolink: `<scheme:...>`. */
const AUTOLINK = /<([a-z][a-z0-9+.-]*:[^\s<>]*)>/gi;
/** An HTML attribute that links to one address, quoted either way or bare; its value is kept whole, spaces included. */
const ATTRIBUTE =
  /\b(?:href|src|data|poster|action|cite|background|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
/** An HTML attribute that lists addresses, each with its descriptor: `srcset` and `imagesrcset`. */
const SOURCE_SET = /\b(?:image)?srcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
/** A target with a scheme, such as `https:` or `file:`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** A Windows drive at the start of a path. */
const DRIVE = /^[a-z]:\//i;
/** The named HTML character references a link destination may hold. */
const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["sol", "/"],
  ["bsol", "\\"],
  ["period", "."],
  ["colon", ":"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["num", "#"],
  ["quest", "?"],
  ["percnt", "%"],
  ["lowbar", "_"],
  ["hyphen", "-"],
  ["dash", "-"],
]);

/**
 * Every link target a text holds, as written: inline and image links,
 * angle-bracketed targets, reference definitions, autolinks and the HTML
 * attributes that link, a `srcset` split into its addresses, inside fences
 * and code spans as well as outside.
 * @param text the text
 * @returns the targets, in the order each pattern finds them
 */
export function linkTargets(text: string): readonly string[] {
  const targets: string[] = [];
  for (const pattern of [INLINE, DEFINITION, AUTOLINK, ATTRIBUTE, SOURCE_SET])
    for (const match of text.matchAll(pattern)) {
      const target = match.slice(1).find((group) => group !== undefined);
      if (target === undefined || target === "") continue;
      // An attribute such as srcset lists several addresses; each is a target of its own.
      const parts = pattern === SOURCE_SET ? target.split(/[\s,]+/) : [target];
      targets.push(...parts.filter((part) => part !== ""));
    }
  return targets;
}

/** A target with its HTML character references read. */
function unescapedEntities(target: string): string {
  return target.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    const code = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : lower.startsWith("#")
        ? Number.parseInt(lower.slice(1), 10)
        : undefined;
    if (code === undefined) return ENTITIES.get(lower) ?? whole;
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** One segment with its percent escapes read; an escape that does not decode alone stays as written. */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }
}

/** A path's segments, compared without regard to case or Unicode form. */
function folded(segments: readonly string[]): readonly string[] {
  return segments.map((segment) => segment.normalize("NFC").toLowerCase());
}

/** Segments with `.` and empty ones dropped and each `..` taking the one before it, from a base. */
function normalized(base: readonly string[], segments: readonly string[]): readonly string[] {
  const out = [...base];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out;
}

/** Whether one path is the other or stands inside it. */
function within(inner: readonly string[], outer: readonly string[]): boolean {
  return outer.length <= inner.length && outer.every((segment, index) => inner[index] === segment);
}

/** What a target names as a path. */
export interface TargetPath {
  /** The path's segments, character references and percent escapes read, the slash either way. */
  readonly segments: readonly string[];
  /** Whether it starts at a root: a leading slash, a drive or a `file:` address. */
  readonly absolute: boolean;
  /** Whether it names a place on this disk: no scheme, or the `file:` scheme. */
  readonly local: boolean;
}

/**
 * Read a target as a path: its character references, its `?query` and
 * `#fragment` dropped, the slash either way, each segment's percent escapes,
 * and for an address with a scheme the path after its host.
 * @param target the target as written
 * @returns what it names, or undefined when it names no path
 */
function targetPath(target: string): TargetPath | undefined {
  let path = (unescapedEntities(target).replace(/\\/g, "/").split(/[?#]/)[0] ?? "").trim();
  let absolute = path.startsWith("/") || DRIVE.test(path);
  let local = true;
  if (SCHEME.test(path) && !DRIVE.test(path)) {
    local = /^file:/i.test(path);
    // The path after the scheme and its host: file:///a/b, file://host/a/b, https://host/a/b.
    path = path.replace(/^[a-z][a-z0-9+.-]*:(?:\/\/[^/]*)?/i, "");
    absolute = true;
  }
  if (path === "") return undefined;
  return { segments: path.split("/").map(decodedSegment), absolute, local };
}

/** Where a working folder stands: from the repository root, and, when known, the root's absolute path. */
export interface FolderPlace {
  /** `.greenline/tmp/<id>`, from the repository root. */
  readonly folder: string;
  /** The repository root's absolute path with forward slashes, to compare an absolute target with. */
  readonly root?: string;
}

/**
 * Whether a target, read as text, reaches a working folder: its path names
 * `tmp/<id>` as two whole segments once its dot segments are read; or,
 * resolved from the directory of the file that holds it, from the
 * repository root, or as an absolute path, it lies in the folder, is the
 * folder, or holds it. Case and Unicode form are not compared.
 * @param place where the folder stands
 * @param from the path of the file that holds the target, from the root
 * @param target the target as written
 * @returns true when it reaches the folder
 */
function reachesFolder(place: FolderPlace, from: string, target: string): boolean {
  const path = targetPath(target);
  if (path === undefined) return false;
  const wanted = folded(place.folder.split("/"));
  const id = wanted.at(-1);
  const read = folded(normalized([], path.segments));
  if (read.some((segment, index) => segment === "tmp" && read[index + 1] === id)) return true;
  if (!path.local) return false;
  const touches = (resolved: readonly string[], folder: readonly string[]): boolean =>
    within(resolved, folder) || within(folder, resolved);
  // A relative target from its own file; any target, a leading slash's included, from the repository root.
  if (
    !path.absolute &&
    touches(folded(normalized(from.split("/").slice(0, -1), path.segments)), wanted)
  )
    return true;
  if (touches(read, wanted)) return true;
  if (!path.absolute || place.root === undefined) return false;
  // An absolute target, read from the disk's root, against the folder's absolute path.
  const absolute = folded(normalized([], [...place.root.split("/"), ...place.folder.split("/")]));
  return touches(read, absolute);
}

/**
 * The links among the ledger's files that reach a working folder: by text,
 * as `reachesFolder` reads them, or on the disk, as `onDisk` answers for a
 * local target, so a link through a symbolic link counts too.
 * @param place where the folder stands
 * @param files the ledger's files
 * @param onDisk whether a local target, resolved on the disk from its file, reaches the folder
 * @returns each file and target that reaches it, in the files' order
 */
export function citationsInto(
  place: FolderPlace,
  files: readonly LedgerText[],
  onDisk: (from: string, path: TargetPath) => boolean = () => false,
): readonly { readonly path: string; readonly target: string }[] {
  const found: { path: string; target: string }[] = [];
  for (const file of files)
    for (const target of linkTargets(file.text)) {
      const path = targetPath(target);
      if (
        reachesFolder(place, file.path, target) ||
        (path !== undefined && path.local && onDisk(file.path, path))
      )
        found.push({ path: file.path, target });
    }
  return found;
}

/** What the shell knows of the disk: the root's absolute path, and whether a local target resolved there reaches the folder. */
export interface TidyDisk {
  readonly root: string;
  readonly reaches: (from: string, path: TargetPath) => boolean;
}

/**
 * Decide one change's working folder from its record and the ledger: remove
 * it only when the record parses, its state is done or dropped, and no
 * ledger file cites a path in the folder.
 * @param id the change's id, already checked to be one
 * @param record the record's text, or undefined when there is none
 * @param ledger every file of the ledger, the record among them
 * @param disk the shell's view of the disk, when it has one
 * @returns the verdict, with the reason when the folder is kept
 */
export function tidyVerdict(
  id: string,
  record: string | undefined,
  ledger: readonly LedgerText[],
  disk?: TidyDisk,
): TidyVerdict {
  if (record === undefined) return { kind: "keep", reason: { kind: "no-record" } };
  const form = parseRecordForm(`${id}.md`, record);
  if (form._tag === "err")
    return {
      kind: "keep",
      reason: {
        kind: "unparsed",
        issues: form.error.issues
          .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
          .join("; "),
      },
    };
  const state = form.value.position.state;
  if (state === "open" || state === "stopped")
    return { kind: "keep", reason: { kind: "unfinished", state } };
  const folder = `${WORKING}/${id}`;
  const place: FolderPlace = disk === undefined ? { folder } : { folder, root: disk.root };
  const cited = citationsInto(place, ledger, disk?.reaches)[0];
  if (cited !== undefined)
    return { kind: "keep", reason: { kind: "cited", by: cited.path, target: cited.target } };
  return { kind: "remove" };
}

/**
 * Why a folder was kept, as one sentence with what to do.
 * @param reason the reason
 * @returns the sentence
 */
export function tidyReasonSentence(reason: TidyReason): string {
  switch (reason.kind) {
    case "no-record":
      return "no change record has this id, so the change may not have opened yet: keep the folder, or remove it by hand once you know it serves nothing";
    case "unparsed":
      return `the change record does not parse (${reason.issues}): correct it, then run tidy again`;
    case "unfinished":
      return `the change is ${reason.state}, and its working files serve it until it is done or dropped`;
    case "cited":
      return `${reason.by} links to '${reason.target}', which reaches it: copy what the link relies on into the change's folder and link that copy, or correct a link that does not mean this folder, then run tidy again`;
    case "not-a-change-id":
      return `'${reason.name}' is not a change id, a real date and a slug`;
    case "not-a-folder":
      return "it is a link or a file, not a folder inside .greenline/tmp/: tidy follows no link; check where it points and remove it by hand";
    case "redirected":
      return "it is a link, a mount of another file system, or resolves outside the repository: tidy removes nothing through it";
    case "unreadable":
      return `${reason.detail}: it cannot be read, so whether a record cites a working file, or which folders stand, is unknown: make it readable, then run tidy again`;
  }
}
