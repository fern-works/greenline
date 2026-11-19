import { DESIGN_FILE } from "./design-file.ts";
import type { InterfaceCheckFact } from "./interface-check.ts";
import { inSkippedFolder, interfaceRootOf } from "./interface-detection.ts";
import { captureLimitText, type CaptureLimit } from "./interface-check.ts";
import { CAPTURE_SIZES } from "./interface-render.ts";
import type { InterfaceSetting } from "./manifest.ts";
import type { RecordedLimit } from "./record-interface.ts";

/**
 * The pages an interface change touched and the render it owes them
 * (J-133 S1; `workshop/components/interface-rules.md`, "The render held at
 * done"): each interface file's page is read from its path by the
 * file-system conventions of the frameworks (an `app` folder by its
 * folders, a `pages` folder by the file's name, a plain HTML page by its
 * path under its root), and a file whose path names no page, a shared
 * component or a stylesheet outside those folders, is kept apart. `done` on
 * an interface change waits until each page carries a capture at the three
 * widths or the browser limit the engine named, made after its files last
 * changed, and a file no page names until one render ran after it changed.
 * A limit settles a page only once the record's `## Interface` section names
 * it in the agent's words, `- limit <address>: <words>`, so the owner sees
 * what was not captured (J-191 S1); a screen no browser renders is settled
 * by the platform's limit alone (J-143 S3). A page the roots do not cover is
 * not held.
 */

/** The command that captures a page, as the hold, the status line and the brief name it. */
export const CAPTURE_COMMAND = "greenline check interface --url <address> --path <page>";

/** The command that records a screen no browser renders, its run the browser limit it names (J-143 S3). */
export const SCREEN_COMMAND = "greenline check interface --path <screen>";

/** The folders whose folders or files name a page. */
const PAGE_FOLDERS = new Set(["app", "pages"]);

/** The folders a page folder may follow, besides standing first: the source folder and an `app` folder. */
const PAGE_FOLDER_PARENTS = new Set(["src", "app"]);

/** The extensions of the files no browser renders: native views. */
const NATIVE = /\.(?:swift|kt|dart)$/;

/** The widths a capture keeps. */
const CAPTURE_WIDTHS = CAPTURE_SIZES.map((size) => size.width);

/** Whether a folder is a segment of the page's address: a group, a slot and a private folder are not. */
function addressSegment(folder: string): boolean {
  return !folder.startsWith("(") && !folder.startsWith("@") && !folder.startsWith("_");
}

/** A file's name without its last extension. */
function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

/**
 * The innermost page folder of a path: an `app` or `pages` folder
 * that stands first or follows `src` or `app`, at the root's last folder or
 * below it, so a package named `app` or a Rails `app/` holds none.
 */
function pageFolderOf(folders: readonly string[], root: string): number {
  const from = root === "." ? 0 : root.split("/").length - 1;
  for (let index = folders.length - 1; index >= from; index -= 1) {
    const folder = folders[index] ?? "";
    const parent = index === 0 ? undefined : folders[index - 1];
    if (PAGE_FOLDERS.has(folder) && (parent === undefined || PAGE_FOLDER_PARENTS.has(parent)))
      return index;
  }
  return -1;
}

/**
 * The page a file of the interface renders at, its address read from its path.
 * @param path the file's path from the repository root
 * @param root the interface root it lies under, `.` for the whole repository
 * @returns the address, starting with `/`, or undefined where its path names none
 */
export function pageOfFile(path: string, root: string): string | undefined {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  const folders = segments.slice(0, -1);
  const base = pageFolderOf(folders, root);
  if (base !== -1) {
    const parts = folders.slice(base + 1).filter(addressSegment);
    const stem = stemOf(name);
    // A pages folder names a page by each file, its index and its underscored files by their folder.
    if (folders[base] === "pages" && stem !== "index" && !stem.startsWith("_")) parts.push(stem);
    return `/${parts.join("/")}`;
  }
  if (!name.endsWith(".html")) return undefined;
  const under = root === "." ? path : path.slice(root.length + 1);
  return name === "index.html" ? `/${under.slice(0, -"index.html".length)}` : `/${under}`;
}

/** An interface file a change touched, with the page it names, undefined where it names none. */
export interface TouchedFile {
  readonly path: string;
  readonly page: string | undefined;
  /** A server's template with no served address named for it: named, never checked (J-148 S4). */
  readonly unserved?: boolean;
}

/** The folders a server's templates stand in, whose path is no address the app serves. */
const TEMPLATE_FOLDERS = new Set(["templates"]);

/** The extensions of a server's templates. */
const TEMPLATE_EXTENSION =
  /\.(?:jinja2?|j2|njk|hbs|handlebars|ejs|erb|liquid|twig|mustache|tmpl|gohtml)$/;

/**
 * Whether a file is a server's template, whose path names no address: a
 * Django, Flask or Jinja `templates` folder, or a template language's
 * extension, never a component framework's `views` or `layouts` folder,
 * whose files stay shared (J-148 S4). Its address is the one the app serves it at, which the
 * record's `## Interface` section names, never its path.
 * @param path the file's path from the repository root
 * @returns true for a template
 */
export function isTemplate(path: string): boolean {
  const segments = path.split("/");
  return (
    TEMPLATE_EXTENSION.test(path) ||
    segments.slice(0, -1).some((folder) => TEMPLATE_FOLDERS.has(folder))
  );
}

/**
 * The interface files the paths touch, each with its page: under an
 * interface root, outside the skipped and dot folders, never a DESIGN.md.
 * On the web a native view is none and each file's page is read from its
 * path; on a platform no browser renders, every file under a root is held
 * as a screen no page names (J-143 S3), so the hold engages on every class
 * and its run is the browser limit the check names for the screen.
 * A server's template takes the address its declared page line names, and
 * one with no page line is named as unserved, never read from its path
 * (J-148 S4).
 * @param paths the paths a change touched, from the root
 * @param setting the manifest's interface block
 * @param served the served addresses the record declares, by template path
 * @returns the files, in the paths' order, each once
 */
export function touchedFiles(
  paths: readonly string[],
  setting: InterfaceSetting,
  served: ReadonlyMap<string, string> = new Map(),
): readonly TouchedFile[] {
  const web = setting.platform === "web";
  const files: TouchedFile[] = [];
  for (const path of new Set(paths)) {
    if (path === DESIGN_FILE || path.endsWith(`/${DESIGN_FILE}`)) continue;
    if ((web && NATIVE.test(path)) || inSkippedFolder(path)) continue;
    const root = interfaceRootOf(path, setting.roots, setting.extensions);
    if (root === undefined) continue;
    const address = served.get(path);
    if (!web) files.push({ path, page: undefined });
    else if (address !== undefined) files.push({ path, page: address });
    // A framework's page folder names its page by its folders, whatever folder lies within it.
    else if (isTemplate(path) && pageFolderOf(path.split("/").slice(0, -1), root) === -1)
      files.push({ path, page: undefined, unserved: true });
    else files.push({ path, page: pageOfFile(path, root) });
  }
  return files;
}

/** The pages a change touched, and the interface files it touched that no page names. */
export interface TouchedPages {
  readonly pages: readonly string[];
  readonly shared: readonly string[];
  /** The templates no page line names, named and never checked (J-148 S4). */
  readonly unserved?: readonly string[];
  /** The limits standing for owed pages that the record does not name yet, the latest per address (J-191 S1). */
  readonly limits?: readonly CaptureLimit[];
}

/**
 * The pages the files name and the files no page names.
 * @param files the touched files
 * @returns the pages and the shared files, each sorted and once
 */
export function pagesOf(files: readonly TouchedFile[]): TouchedPages {
  const unserved = files.filter((file) => file.unserved === true).map((file) => file.path);
  const touched: TouchedPages = {
    pages: [
      ...new Set(files.flatMap((file) => (file.page === undefined ? [] : [file.page]))),
    ].sort(),
    shared: files
      .flatMap((file) => (file.page === undefined && file.unserved !== true ? [file.path] : []))
      .sort(),
  };
  if (unserved.length === 0) return touched;
  return { pages: touched.pages, shared: touched.shared, unserved: unserved.sort() };
}

/**
 * The line that names the templates no page line names (J-148 S4).
 * @param unserved their paths
 * @returns the line, or undefined where there are none
 */
export function unservedLine(unserved: readonly string[]): string | undefined {
  return unserved.length === 0
    ? undefined
    : `not checked: ${listed(unserved)}, ${unserved.length === 1 ? "a template" : "templates"} no page line names; name each in the record's ## Interface section as \`- page <address>: <path>\`, the address the app serves it at`;
}

/** An address's segments, its query and fragment and its trailing slash left off. */
function segmentsOf(address: string): readonly string[] {
  return address
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((segment) => segment !== "");
}

/** Whether the pattern's segments from one place match the address's from another. */
function matchesFrom(
  pattern: readonly string[],
  given: readonly string[],
  at: number,
  from: number,
): boolean {
  const segment = pattern[at];
  if (segment === undefined) return from === given.length;
  // A rest parameter takes any number of segments, none included.
  if (segment.startsWith("[...") || segment.startsWith("[[..."))
    for (let end = from; end <= given.length; end += 1) {
      if (matchesFrom(pattern, given, at + 1, end)) return true;
    }
  else if (segment.startsWith("[["))
    // An optional parameter takes one segment or none.
    return (
      matchesFrom(pattern, given, at + 1, from) ||
      (from < given.length && matchesFrom(pattern, given, at + 1, from + 1))
    );
  else if (from < given.length && (segment.startsWith("[") || segment === given[from]))
    return matchesFrom(pattern, given, at + 1, from + 1);
  return false;
}

/**
 * Whether an address rendered is a page of the pattern a file names: equal
 * segments, a `[name]` matching one, a `[[name]]` one or none, and a
 * `[...name]` or `[[...name]]` any number.
 * @param page the page a file names
 * @param address the address `--path` rendered
 * @returns whether the address is that page
 */
export function pageMatches(page: string, address: string): boolean {
  return matchesFrom(segmentsOf(page), segmentsOf(address), 0, 0);
}

/** Whether a run captured the page at the three widths. */
function captured(fact: InterfaceCheckFact): boolean {
  return fact.address !== undefined && CAPTURE_WIDTHS.every((width) => fact.widths.includes(width));
}

/**
 * Whether a run rendered: a capture at the three widths, the platform's
 * limit for a screen no browser renders, or a capture's limit the record
 * names in the agent's words (J-191 S1).
 */
function rendered(fact: InterfaceCheckFact, recorded: readonly RecordedLimit[]): boolean {
  if (captured(fact)) return true;
  const limit = fact.limit;
  if (fact.address === undefined || limit === undefined) return false;
  return (
    limit.cause === "platform" ||
    recorded.some((line) => pageMatches(line.address, fact.address ?? ""))
  );
}

/** The latest write among files, in milliseconds since the epoch; 0 where none is known. */
function lastWrite(
  files: readonly TouchedFile[],
  modifiedAt: (path: string) => number | undefined,
): number {
  return Math.max(0, ...files.map((file) => modifiedAt(file.path) ?? 0));
}

/**
 * What the render still owes: each page no run rendered after its files
 * last changed, and the files no page names while no render ran after they
 * changed.
 * @param files the interface files the change touched, each with its page
 * @param facts the change's interface facts
 * @param modifiedAt a file's last write, in milliseconds since the epoch
 * @returns what is owed, or undefined where nothing is
 */
export function renderOwed(
  files: readonly TouchedFile[],
  facts: readonly InterfaceCheckFact[],
  modifiedAt: (path: string) => number | undefined,
  recorded: readonly RecordedLimit[] = [],
): TouchedPages | undefined {
  const served = files.filter((file) => file.unserved !== true);
  const renders = facts.filter((fact) => rendered(fact, recorded));
  const since = (written: number): readonly InterfaceCheckFact[] =>
    renders.filter((fact) => Date.parse(fact.at) >= written);
  const touched = pagesOf(served);
  const pages = touched.pages.filter((page) => {
    const written = lastWrite(
      served.filter((file) => file.page === page),
      modifiedAt,
    );
    return !since(written).some((fact) => pageMatches(page, fact.address ?? ""));
  });
  const shared =
    since(
      lastWrite(
        served.filter((file) => file.page === undefined),
        modifiedAt,
      ),
    ).length === 0
      ? touched.shared
      : [];
  if (pages.length === 0 && shared.length === 0) return undefined;
  const limits = unnamedLimits(facts, pages, served, modifiedAt);
  return limits.length === 0 ? { pages, shared } : { pages, shared, limits };
}

/**
 * The limits standing for the owed pages since their files last changed,
 * the latest per address: the ones the record has yet to name.
 */
function unnamedLimits(
  facts: readonly InterfaceCheckFact[],
  pages: readonly string[],
  served: readonly TouchedFile[],
  modifiedAt: (path: string) => number | undefined,
): readonly CaptureLimit[] {
  const latest = new Map<string, CaptureLimit>();
  for (const page of pages) {
    const written = lastWrite(
      served.filter((file) => file.page === page),
      modifiedAt,
    );
    for (const fact of facts)
      if (
        fact.limit !== undefined &&
        fact.limit.cause !== "platform" &&
        Date.parse(fact.at) >= written &&
        pageMatches(page, fact.address ?? "")
      )
        latest.set(fact.limit.address, fact.limit);
  }
  return [...latest.values()];
}

/** Words joined as a list: `a`, `a and b`, `a, b and c`. */
function listed(words: readonly string[]): string {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

/**
 * What is owed in words: the pages, then a page rendering the files no
 * page names.
 * @param owed what the render owes
 * @returns `/ and /members, and a page rendering src/components/table.tsx`
 */
export function renderOwedText(owed: TouchedPages): string {
  const parts = [
    ...(owed.pages.length === 0 ? [] : [listed(owed.pages)]),
    ...(owed.shared.length === 0 ? [] : [`a page rendering ${listed(owed.shared)}`]),
  ];
  return parts.join(", and ");
}

/**
 * The mirror's line while a render is owed.
 * @param owed what the render owes
 * @returns `interface render: owed for /members; run greenline check interface --url <address> --path <page>, or ... before done`
 */
export function renderOwedLine(owed: TouchedPages): string {
  const limits = owed.limits ?? [];
  if (limits.length === 0)
    return `interface render: owed for ${renderOwedText(owed)}; run ${CAPTURE_COMMAND}, or ${SCREEN_COMMAND} on a platform no browser renders, before done`;
  return `interface render: owed for ${renderOwedText(owed)}; ${limitsOwedText(limits)}, or capture it, before done`;
}

/**
 * The limits the record owes in words, each with the line that names it (J-191 S1).
 * @param limits the limits the record does not name
 * @returns the clause
 */
export function limitsOwedText(limits: readonly CaptureLimit[]): string {
  return limits
    .map(
      (limit) =>
        `the capture of ${limit.address} met its limit, ${captureLimitText(limit)}: name it in the record's ## Interface section as \`- limit ${limit.address}: <what was not captured, in your words>\``,
    )
    .join("; ");
}
