/*
 * The app's addresses (J-154 S3, on J-156's picked design): every page of
 * the shell is a path the agent can print and the owner can open, grouped
 * under the design's five places in the bar (J-164 S1), Desk at `/`,
 * Changes, Interface, Knowledge and Practice, with a picture at
 * `/pictures/<visual id>` and the component catalogue at `/catalogue`. The
 * server answers the shell for any path this module reads as a place, and
 * the app reads the same path to know what to show. A part after a
 * change's address (a step, the frame map as `frame-map`, the deal, the
 * skill loads, the pictures, the captures, the waiting part) opens in
 * place, and the frame map's node or the deal's direction after it; a file
 * of the change's folder is `/changes/<id>/files/<path>`. An address whose
 * record the repository does not hold still opens its page, which shows the
 * view's empty state; an address of the earlier design reads as no place,
 * and the server answers it with the not-found page. Nothing here reads the
 * network or the page.
 */

/** The five places of the bar, in its order (J-164 S1). */
export type ViewName = "desk" | "changes" | "interface" | "knowledge" | "practice";

/**
 * The tabs a view holds, each its own address; `homes` is Knowledge's
 * overview of its homes (J-166 S1); `map` is the atlas's tab, named Atlas,
 * and `maps` the interactive maps and figures the two skills make (J-221 S1).
 */
export type AtlasTab =
  | "map"
  | "maps"
  | "subsystems"
  | "visuals"
  | "homes"
  | "catalog"
  | "interfaces";
export type ChecksTab = "declared" | "receipts";
/** The settings: the installation as a form and the installed files as a tree; the policy is read and edited in Knowledge (J-166 S1). */
export type SettingsTab = "installation" | "files";

/** What a path shows. */
export type Place =
  | { readonly page: "now" }
  | { readonly page: "changes" }
  | { readonly page: "plans" }
  | {
      readonly page: "change";
      readonly id: string;
      readonly part: string | null;
      /** A node of the frame map or a direction of the deal, inside the part that holds it (J-142 S1). */
      readonly anchor?: string;
      /** A file of the change's folder, by its path in the folder (J-154 S3). */
      readonly file?: string;
      /** A file the change's commits touched, by its path from the root, its lines across them (J-155 S2). */
      readonly changed?: string;
    }
  | {
      readonly page: "plan";
      readonly name: string;
      readonly part: string | null;
      /** A heading inside the part, a plan document's own heading. */
      readonly anchor?: string;
    }
  | { readonly page: "discussions" }
  | { readonly page: "discussion"; readonly id: string }
  | { readonly page: "atlas"; readonly tab: AtlasTab }
  | { readonly page: "subsystem"; readonly name: string }
  /** An indexed document by its path from the root (J-147 S5). */
  | { readonly page: "document"; readonly path: string }
  /** A picture, a visual or a capture, by its visual id (J-154 S3). */
  | { readonly page: "picture"; readonly id: string }
  /** Every note by state, and one note by its id (J-142 S1). */
  | { readonly page: "marks" }
  | { readonly page: "mark"; readonly id: string }
  | {
      readonly page: "home";
      readonly home: string;
      readonly part: string | null;
      /** A heading inside the part, a decision record's own heading. */
      readonly anchor?: string;
    }
  /** The house rulings, read and edited in Knowledge (J-166 S1). */
  | { readonly page: "rulings" }
  /** Practice's home: greenline's health here and how it is set (J-166 S1). */
  | { readonly page: "practice" }
  /** The roster, or one skill of it. */
  | { readonly page: "roster"; readonly skill?: string }
  | { readonly page: "checks"; readonly tab: ChecksTab }
  | { readonly page: "settings"; readonly tab: SettingsTab }
  | { readonly page: "catalogue" };

/** One place of the bar: its name, its label, the key that reaches it after `g`, and its address. */
export interface ViewEntry {
  readonly name: ViewName;
  readonly label: string;
  readonly key: string;
  readonly path: string;
}

/**
 * The bar's places, in order: the desk, the changes with their plans and
 * discussions, the interface where the workspace has an app, the knowledge
 * the agent reads, and the practice itself. Atlas and Checks name no place
 * now; their pages stand under Knowledge, Interface and Practice.
 */
export const VIEWS: readonly ViewEntry[] = [
  { name: "desk", label: "Desk", key: "d", path: "/" },
  { name: "changes", label: "Changes", key: "c", path: "/changes" },
  { name: "interface", label: "Interface", key: "i", path: "/interface" },
  { name: "knowledge", label: "Knowledge", key: "k", path: "/knowledge" },
  { name: "practice", label: "Practice", key: "p", path: "/practice" },
];

/** One tab of a place: its label and the page it shows. */
export interface PlaceTab {
  readonly label: string;
  readonly place: Place;
}

/** Each place's tabs, in their order. */
export interface PlaceTabs {
  readonly desk: readonly PlaceTab[];
  readonly changes: readonly PlaceTab[];
  readonly interface: readonly PlaceTab[];
  readonly knowledge: readonly PlaceTab[];
  readonly practice: readonly PlaceTab[];
}

/**
 * Each place's tabs, each its own address: Changes holds Plans and
 * Discussions; Interface its pages, the owner's notes and the catalog;
 * Knowledge its overview of the homes, the decisions book and the house
 * rulings read and edited there, the pictures, the maps and figures, the
 * atlas and the subsystems;
 * Practice its home with the health, the roster, the settings, the
 * installed files, the checks and the receipts, and a Policy tab that
 * leads to Knowledge. The desk is one page.
 */
export const PLACE_TABS: PlaceTabs = {
  desk: [],
  changes: [
    { label: "Changes", place: { page: "changes" } },
    { label: "Plans", place: { page: "plans" } },
    { label: "Discussions", place: { page: "discussions" } },
  ],
  interface: [
    { label: "Pages", place: { page: "atlas", tab: "interfaces" } },
    { label: "Your notes", place: { page: "marks" } },
    { label: "Catalog", place: { page: "atlas", tab: "catalog" } },
  ],
  knowledge: [
    { label: "Overview", place: { page: "atlas", tab: "homes" } },
    { label: "Decisions", place: { page: "home", home: "decisions", part: null } },
    { label: "House rulings", place: { page: "rulings" } },
    { label: "Pictures", place: { page: "atlas", tab: "visuals" } },
    { label: "Maps", place: { page: "atlas", tab: "maps" } },
    { label: "Atlas", place: { page: "atlas", tab: "map" } },
    { label: "Subsystems", place: { page: "atlas", tab: "subsystems" } },
  ],
  practice: [
    { label: "Health", place: { page: "practice" } },
    { label: "Roster", place: { page: "roster" } },
    { label: "Settings", place: { page: "settings", tab: "installation" } },
    { label: "Installed files", place: { page: "settings", tab: "files" } },
    { label: "Checks", place: { page: "checks", tab: "declared" } },
    { label: "Receipts", place: { page: "checks", tab: "receipts" } },
    { label: "Policy", place: { page: "home", home: "decisions", part: null } },
  ],
};

function decoded(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/** The parts of a change's page that hold anchors of their own: the frame map's nodes and the deal's directions. */
const ANCHORED_PARTS: readonly string[] = ["frame-map", "deal"];

/** The knowledge place's own pages, which no knowledge home's name takes. */
const KNOWLEDGE_PAGES: readonly string[] = [
  "map",
  "maps",
  "subsystems",
  "pictures",
  "documents",
  "rulings",
];

/** The practice place's pages, each a tab of Practice; the installation's earlier address reads as the settings. */
const PRACTICE_PAGES: ReadonlyMap<string, Place> = new Map<string, Place>([
  ["checks", { page: "checks", tab: "declared" }],
  ["receipts", { page: "checks", tab: "receipts" }],
  ["settings", { page: "settings", tab: "installation" }],
  ["installation", { page: "settings", tab: "installation" }],
  ["files", { page: "settings", tab: "files" }],
]);

/** A change's place from the segments after `/changes/<id>`. */
function changePlace(id: string, rest: readonly string[]): Place | undefined {
  const [part, anchor, ...more] = rest;
  if (part === undefined) return { page: "change", id, part: null };
  // A file of the folder at any depth, each segment one name of the folder's listing.
  if (part === "files")
    return rest.length > 1
      ? { page: "change", id, part: null, file: rest.slice(1).join("/") }
      : undefined;
  // A changed file's lines at any depth, its path from the root (J-155 S2).
  if (part === "changed" && rest.length > 1)
    return { page: "change", id, part: "changed", changed: rest.slice(1).join("/") };
  if (anchor === undefined) return { page: "change", id, part };
  return more.length === 0 && ANCHORED_PARTS.includes(part)
    ? { page: "change", id, part, anchor }
    : undefined;
}

/** A place under `/knowledge`: the homes, the atlas, a subsystem, the pictures, the maps, a document or a home. */
function knowledgePlace(rest: readonly string[]): Place | undefined {
  const [first, second, third, ...more] = rest;
  if (first === undefined) return { page: "atlas", tab: "homes" };
  if (first === "documents")
    return rest.length > 1 ? { page: "document", path: rest.slice(1).join("/") } : undefined;
  if (more.length > 0) return undefined;
  if (first === "map")
    return third !== undefined
      ? undefined
      : second === undefined
        ? { page: "atlas", tab: "map" }
        : { page: "subsystem", name: second };
  if (first === "rulings") return second === undefined ? { page: "rulings" } : undefined;
  if (KNOWLEDGE_PAGES.includes(first))
    return second !== undefined
      ? undefined
      : {
          page: "atlas",
          tab: first === "pictures" ? "visuals" : first === "maps" ? "maps" : "subsystems",
        };
  return third !== undefined && second !== undefined
    ? { page: "home", home: first, part: second, anchor: third }
    : { page: "home", home: first, part: second ?? null };
}

/** A place under `/interface`: the interface, the catalog, the notes or one note. */
function interfacePlace(rest: readonly string[]): Place | undefined {
  const [first, second, third] = rest;
  if (third !== undefined) return undefined;
  if (first === undefined) return { page: "atlas", tab: "interfaces" };
  if (first === "catalog")
    return second === undefined ? { page: "atlas", tab: "catalog" } : undefined;
  if (first === "notes")
    return second === undefined ? { page: "marks" } : { page: "mark", id: second };
  return undefined;
}

/** A picture's place: its id is its path under the home, `<change>/<slug>`, `map/<slug>`, `interface/<slug>` or `subsystems/<name>/<slug>`. */
function picturePlace(rest: readonly string[]): Place | undefined {
  const deep = rest[0] === "subsystems";
  return rest.length === (deep ? 3 : 2) ? { page: "picture", id: rest.join("/") } : undefined;
}

/** A place under `/practice`: health, a tab of the checks or the settings, the roster or one skill. */
function practicePlace(rest: readonly string[]): Place | undefined {
  const [first, second, third] = rest;
  if (third !== undefined) return undefined;
  if (first === undefined) return { page: "practice" };
  if (first === "roster")
    return second === undefined ? { page: "roster" } : { page: "roster", skill: second };
  return second === undefined ? PRACTICE_PAGES.get(first) : undefined;
}

/**
 * The place a path shows, or undefined when no page answers it.
 * @param pathname the path, as the address bar holds it
 * @returns the place, or undefined
 */
export function placeOf(pathname: string): Place | undefined {
  const raw = pathname.split("/").filter((segment) => segment !== "");
  // A document's and a folder file's addresses carry their path's folders.
  if (raw.length > 12) return undefined;
  const parts: string[] = [];
  for (const segment of raw) {
    const value = decoded(segment);
    if (value === undefined || value === "." || value === ".." || value.includes("/"))
      return undefined;
    parts.push(value);
  }
  const [head, second, ...rest] = parts;
  const deep = head === "changes" || (head === "knowledge" && second === "documents");
  if (!deep && parts.length > 5) return undefined;
  switch (head) {
    case undefined:
      return { page: "now" };
    case "changes":
      return second === undefined ? { page: "changes" } : changePlace(second, rest);
    case "plans": {
      const [part, anchor, more] = rest;
      if (more !== undefined) return undefined;
      if (second === undefined) return { page: "plans" };
      if (part !== undefined && anchor !== undefined)
        return { page: "plan", name: second, part, anchor };
      return { page: "plan", name: second, part: part ?? null };
    }
    case "discussions":
      if (rest.length > 0) return undefined;
      return second === undefined ? { page: "discussions" } : { page: "discussion", id: second };
    case "knowledge":
      return knowledgePlace(parts.slice(1));
    case "interface":
      return interfacePlace(parts.slice(1));
    case "pictures":
      return picturePlace(parts.slice(1));
    case "practice":
      return practicePlace(parts.slice(1));
    case "catalogue":
      return second === undefined ? { page: "catalogue" } : undefined;
    default:
      return undefined;
  }
}

const part = (value: string): string => `/${encodeURIComponent(value)}`;
const optional = (value: string | null): string => (value === null ? "" : part(value));
const segments = (value: string): string => value.split("/").map(part).join("");

const ATLAS_PATHS = {
  map: "/knowledge/map",
  maps: "/knowledge/maps",
  subsystems: "/knowledge/subsystems",
  visuals: "/knowledge/pictures",
  homes: "/knowledge",
  catalog: "/interface/catalog",
  interfaces: "/interface",
} satisfies Readonly<Record<AtlasTab, string>>;

const CHECKS_PATHS = {
  declared: "/practice/checks",
  receipts: "/practice/receipts",
} satisfies Readonly<Record<ChecksTab, string>>;

const SETTINGS_PATHS = {
  installation: "/practice/settings",
  files: "/practice/files",
} satisfies Readonly<Record<SettingsTab, string>>;

/**
 * The path that shows a place, the one the agent prints.
 * @param place the place
 * @returns its path
 */
export function pathOf(place: Place): string {
  switch (place.page) {
    case "now":
      return "/";
    case "changes":
      return "/changes";
    case "plans":
      return "/plans";
    case "change":
      if (place.changed !== undefined)
        return `/changes${part(place.id)}/changed${segments(place.changed)}`;
      return place.file === undefined
        ? `/changes${part(place.id)}${optional(place.part)}${optional(place.anchor ?? null)}`
        : `/changes${part(place.id)}/files${segments(place.file)}`;
    case "plan":
      return `/plans${part(place.name)}${optional(place.part)}${optional(place.anchor ?? null)}`;
    case "discussions":
      return "/discussions";
    case "discussion":
      return `/discussions${part(place.id)}`;
    case "atlas":
      return ATLAS_PATHS[place.tab];
    case "subsystem":
      return `/knowledge/map${part(place.name)}`;
    case "document":
      return `/knowledge/documents${segments(place.path)}`;
    case "picture":
      return `/pictures${segments(place.id)}`;
    case "marks":
      return "/interface/notes";
    case "mark":
      return `/interface/notes${part(place.id)}`;
    case "home":
      return `/knowledge${part(place.home)}${optional(place.part)}${optional(place.anchor ?? null)}`;
    case "rulings":
      return "/knowledge/rulings";
    case "practice":
      return "/practice";
    case "roster":
      return `/practice/roster${optional(place.skill ?? null)}`;
    case "checks":
      return CHECKS_PATHS[place.tab];
    case "settings":
      return SETTINGS_PATHS[place.tab];
    case "catalogue":
      return "/catalogue";
  }
}

/**
 * The place of the bar a page belongs to, or the catalogue, which sits
 * outside the five: the plans and the discussions under Changes; the
 * interface's pages, its catalog and the owner's notes under Interface; the
 * homes, the atlas, the maps, the subsystems, the documents and the pictures under
 * Knowledge, a capture's page lit as Interface once it is read; the health,
 * the checks, the roster and the settings under Practice.
 * @param place the place
 * @returns the place's name in the bar
 */
export function viewOf(place: Place): ViewName | "catalogue" {
  switch (place.page) {
    case "now":
      return "desk";
    case "changes":
    case "plans":
    case "change":
    case "plan":
    case "discussions":
    case "discussion":
      return "changes";
    case "atlas":
      return place.tab === "catalog" || place.tab === "interfaces" ? "interface" : "knowledge";
    case "marks":
    case "mark":
      return "interface";
    case "subsystem":
    case "document":
    case "picture":
    case "home":
    case "rulings":
      return "knowledge";
    case "practice":
    case "roster":
    case "checks":
    case "settings":
      return "practice";
    case "catalogue":
      return "catalogue";
  }
}

/** The page that lists a record's page, whose tab the record's page lights. */
function listerOf(place: Place): Place {
  switch (place.page) {
    case "change":
      return { page: "changes" };
    case "plan":
      return { page: "plans" };
    case "discussion":
      return { page: "discussions" };
    case "mark":
      return { page: "marks" };
    case "subsystem":
    case "document":
      return { page: "atlas", tab: "subsystems" };
    case "picture":
      return { page: "atlas", tab: "visuals" };
    case "home":
      // The decisions book is a tab of its own; any other home is listed by the overview.
      return place.home === "decisions"
        ? { page: "home", home: "decisions", part: null }
        : { page: "atlas", tab: "homes" };
    case "roster":
      return { page: "roster" };
    default:
      return place;
  }
}

/**
 * The tab of its place a page lights: its own, or the one that lists it.
 * @param place the place
 * @returns the tab's label, or undefined where the place has no tab for it
 */
export function tabOfPlace(place: Place): string | undefined {
  const view = viewOf(place);
  if (view === "catalogue") return undefined;
  const path = pathOf(listerOf(place));
  return PLACE_TABS[view].find((tab) => pathOf(tab.place) === path)?.label;
}

/**
 * The forms of picture the Maps tab lists (J-221 S1): the interactive
 * architecture map the `architecture-map` skill makes and the explanatory
 * figure the `anatomy` skill makes, each by the form its manifest names.
 */
const MAP_FORMS: readonly string[] = ["map", "figure"];

/**
 * Whether the Maps tab lists a picture of this form; the reply after one is
 * kept links the tab, where it links any other picture's own page.
 * @param form the manifest's form
 * @returns whether it is a map or a figure
 */
export function listedOnMaps(form: string): boolean {
  return MAP_FORMS.includes(form);
}
