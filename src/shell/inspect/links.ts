import { posix } from "node:path";
import { MANIFEST_SUFFIX, placeOfManifest, visualId, VISUALS_HOME } from "../../core/visuals.ts";
import { pathOf } from "./app/addresses.ts";
import type { LinkResolver, LinkTarget } from "./markdown.ts";

/*
 * Where a link in a repository document leads. A path the page renders, a
 * change record and its folder, a plan directory and its documents, a
 * knowledge home, opens in the page; a web address opens in a new tab; any
 * other target is shown and never followed, so no document can make the
 * page load a file or reach a service.
 */

const CHANGE_ID = "\\d{4}-\\d{2}-\\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*";
const CHANGE_RECORD = new RegExp(`^\\.greenline/ledger/(${CHANGE_ID})\\.md$`);
const CHANGE_FILE = new RegExp(`^\\.greenline/ledger/(${CHANGE_ID})/(.+)$`);
const PLAN = /^\.greenline\/plans\/([^/]+)\/?(?:([^/]+\.md))?$/;
const ADR = /^docs\/adr\/?(?:([^/]+\.md))?$/;
/** A visual's file, or its manifest, in the visual home: its path under the home without the extension. */
const VISUAL_FILE = /^\.greenline\/visuals\/(.+?)(?:\.visual\.json|\.svg|\.html|\.md)$/;
/** A subsystem's page in the atlas. */
const SUBSYSTEM_PAGE = /^\.greenline\/visuals\/subsystems\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
/** A heading's anchor as the document renderer writes it. */
const ANCHOR = /^[a-z0-9-]+$/;

/** The page addresses of the knowledge homes, by their repository path. */
const HOMES = new Map([
  [".greenline/WORK.md", "work"],
  [".greenline/DECISIONS.md", "decisions"],
  ["GLOSSARY.md", "glossary"],
]);

/**
 * The page address of a change, or of one file of its folder.
 * @param id the change's id
 * @param file a file of its folder, relative to it
 * @returns the address, a path of the app
 */
function changeHref(id: string, file?: string): string {
  return file === undefined
    ? pathOf({ page: "change", id, part: null })
    : pathOf({ page: "change", id, part: null, file });
}

/**
 * The page address of a visual, each segment of its id escaped.
 * @param id the visual's id, its path under the home without the extension
 * @returns the address, a path of the app
 */
function visualHref(id: string): string {
  return pathOf({ page: "picture", id });
}

/** The page address a path in the visual home opens: a subsystem's page, or a visual the home's layout holds. */
function visualAddress(path: string): string | undefined {
  const page = SUBSYSTEM_PAGE.exec(path);
  if (page?.[1] !== undefined) return pathOf({ page: "subsystem", name: page[1] });
  const stem = VISUAL_FILE.exec(path)?.[1];
  const place = stem === undefined ? undefined : placeOfManifest(`${stem}${MANIFEST_SUFFIX}`);
  return place === undefined ? undefined : visualHref(visualId(place));
}

/**
 * The page address of a plan, or of one of its documents.
 * @param name the plan directory's name
 * @param file one of its documents
 * @returns the address, a path of the app
 */
export function planHref(name: string, file?: string): string {
  return pathOf({ page: "plan", name, part: file ?? null });
}

/**
 * The page address a repository path opens, or undefined when the page does
 * not render it.
 * @param path the repository-relative path, normalised
 * @param fragment the link's fragment, kept only where it names a heading of a whole document
 * @returns the address, or undefined
 */
function pageAddress(path: string, fragment = ""): string | undefined {
  const anchor = ANCHOR.test(fragment) ? fragment : undefined;
  const record = CHANGE_RECORD.exec(path);
  if (record?.[1] !== undefined) return changeHref(record[1]);
  const inFolder = CHANGE_FILE.exec(path);
  if (inFolder?.[1] !== undefined && inFolder[2] !== undefined)
    return changeHref(inFolder[1], inFolder[2]);
  const plan = PLAN.exec(path);
  if (plan?.[1] !== undefined)
    return plan[2] === undefined || plan[2] === "tickets.md"
      ? planHref(plan[1])
      : planHref(plan[1], plan[2]);
  const adr = ADR.exec(path);
  if (adr !== null) return pathOf({ page: "home", home: "adr", part: adr[1] ?? null });
  if (path.startsWith(`${VISUALS_HOME}/`)) return visualAddress(path);
  const home = HOMES.get(path);
  if (home === undefined) return undefined;
  // A whole document's heading is its home's part.
  return pathOf({ page: "home", home, part: anchor ?? null });
}

/**
 * A resolver for the links of one repository document.
 * @param directory the repository-relative directory the document sits in
 * @returns the resolver
 */
export function repositoryResolver(directory: string): LinkResolver {
  return (target): LinkTarget => {
    if (/^https?:\/\//i.test(target)) {
      try {
        return { kind: "external", href: new URL(target).href };
      } catch {
        return { kind: "text" };
      }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/"))
      return { kind: "text" };
    const [rest = "", fragment = ""] = target.split("#", 2);
    let path: string;
    try {
      path = posix.normalize(posix.join(directory, decodeURIComponent(rest.split("?")[0] ?? "")));
    } catch {
      return { kind: "text" };
    }
    const href = pageAddress(path, fragment);
    return href === undefined ? { kind: "text" } : { kind: "page", href };
  };
}

const LEDGER = ".greenline/ledger";

/**
 * Where a link in a change's documents leads: a file of its folder or
 * another change opens in the page, and so does a plan or a knowledge home
 * the page renders; a web address opens in a new tab; anything else is
 * shown, never followed.
 * @param id the change's id
 * @param folder every file of its folder, by name
 * @param directory the repository-relative directory the document sits in
 * @returns the resolver
 */
export function changeResolver(
  id: string,
  folder: readonly string[],
  directory: string,
): LinkResolver {
  const files = new Set(folder);
  const elsewhere = repositoryResolver(directory);
  return (target): LinkTarget => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/"))
      return elsewhere(target);
    let path: string;
    try {
      path = posix.normalize(
        posix.join(directory, decodeURIComponent(target.split(/[?#]/)[0] ?? "")),
      );
    } catch {
      return { kind: "text" };
    }
    const own = `${LEDGER}/${id}/`;
    if (path.startsWith(own))
      return files.has(path.slice(own.length))
        ? { kind: "page", href: changeHref(id, path.slice(own.length)) }
        : { kind: "text" };
    // Another change's folder is left to its own page, which knows its files.
    if (path.startsWith(`${LEDGER}/`) && !CHANGE_RECORD.test(path)) return { kind: "text" };
    return elsewhere(target);
  };
}
