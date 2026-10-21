import { posix } from "node:path";
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
/** A heading's anchor as the document renderer writes it. */
const ANCHOR = /^[a-z0-9-]+$/;

/** The page addresses of the knowledge homes, by their repository path. */
const HOMES = new Map([
  [".greenline/WORK.md", "#knowledge/work"],
  [".greenline/DECISIONS.md", "#knowledge/decisions"],
  ["GLOSSARY.md", "#knowledge/glossary"],
]);

/**
 * The page address of a change, or of one file of its folder.
 * @param id the change's id
 * @param file a file of its folder, relative to it
 * @returns the address, hash mark included
 */
export function changeHref(id: string, file?: string): string {
  return `#change/${encodeURIComponent(id)}${file === undefined ? "" : `/${encodeURIComponent(file)}`}`;
}

/**
 * The page address of a plan, or of one of its documents.
 * @param name the plan directory's name
 * @param file one of its documents
 * @returns the address, hash mark included
 */
export function planHref(name: string, file?: string): string {
  return `#plan/${encodeURIComponent(name)}${file === undefined ? "" : `/${encodeURIComponent(file)}`}`;
}

/**
 * The page address a repository path opens, or undefined when the page does
 * not render it.
 * @param path the repository-relative path, normalised
 * @param fragment the link's fragment, kept only where it names a heading of a whole document
 * @returns the address, or undefined
 */
export function pageAddress(path: string, fragment = ""): string | undefined {
  const anchor = ANCHOR.test(fragment) ? `/${fragment}` : "";
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
  if (adr !== null)
    return adr[1] === undefined ? "#knowledge/adr" : `#knowledge/adr/${encodeURIComponent(adr[1])}`;
  const home = HOMES.get(path);
  return home === undefined ? undefined : home + anchor;
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
