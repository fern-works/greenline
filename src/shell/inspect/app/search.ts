import type {
  ChangesDocument,
  HomesDocument,
  PlansDocument,
  RosterDocument,
  DiscussionsDocument,
  AtlasDocument,
  PicturesDocument,
} from "../../../core/inspector/documents.ts";
import { pathOf, PLACE_TABS, VIEWS } from "./addresses.ts";

/*
 * What the palette reaches: the records the lists already hold, by title
 * and id (changes, discussions, plans, skills, homes, subsystems, visuals), every
 * view and tab as a page, and the actions. Nothing new is read to search,
 * and no text inside a record is indexed.
 */

/** An action the palette runs. */
export type PaletteAction = "copy" | "reload" | "theme" | "sync" | "keys";

/** One line of the palette: what it opens or does, the group it sits in and the words it matches. */
export interface PaletteEntry {
  readonly group: "Changes" | "Discussions" | "Plans" | "Skills" | "Pages" | "Actions";
  readonly label: string;
  readonly detail: string;
  readonly target: { readonly path: string } | { readonly action: PaletteAction };
}

/** The lists the palette reads, each as it was read; one not read yet is absent. */
export interface PaletteLists {
  readonly changes?: ChangesDocument;
  readonly discussions?: DiscussionsDocument;
  readonly plans?: PlansDocument;
  readonly roster?: RosterDocument;
  readonly homes?: HomesDocument;
  readonly atlas?: AtlasDocument;
  readonly visuals?: PicturesDocument;
}

/** Every tab of the five places but the one each place opens on, then the catalogue (J-164 S1). */
const TABS: readonly { readonly label: string; readonly path: string }[] = [
  ...VIEWS.flatMap((view) =>
    PLACE_TABS[view.name]
      .map((tab) => ({ label: `${tab.label}, a tab of ${view.label}`, path: pathOf(tab.place) }))
      .filter((tab) => tab.path !== view.path),
  ),
  { label: "Catalogue of the components", path: pathOf({ page: "catalogue" }) },
];

const ACTIONS: readonly PaletteEntry[] = [
  { group: "Actions", label: "Copy this page's address", detail: "c", target: { action: "copy" } },
  {
    group: "Actions",
    label: "Read the repository again",
    detail: "r",
    target: { action: "reload" },
  },
  {
    group: "Actions",
    label: "Switch the theme, light or dark",
    detail: "t",
    target: { action: "theme" },
  },
  {
    group: "Actions",
    label: "Sync the installation",
    detail: "settings",
    target: { action: "sync" },
  },
  { group: "Actions", label: "Show the keys", detail: "?", target: { action: "keys" } },
];

/**
 * Every line the palette may show, from the lists as read.
 * @param lists the lists read
 * @returns the lines, records first
 */
export function paletteEntries(lists: PaletteLists): readonly PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const change of lists.changes?.changes ?? [])
    entries.push({
      group: "Changes",
      label: change.why ?? change.id,
      detail: `${change.state ?? "unreadable"} · ${change.id}`,
      target: { path: pathOf({ page: "change", id: change.id, part: null }) },
    });
  for (const discussion of lists.discussions?.discussions.items ?? [])
    entries.push({
      group: "Discussions",
      label: discussion.title,
      detail: `${discussion.state} · ${discussion.id}`,
      target: { path: pathOf({ page: "discussion", id: discussion.id }) },
    });
  for (const plan of lists.plans?.plans ?? [])
    entries.push({
      group: "Plans",
      label: plan.planning[0]?.why ?? plan.name,
      detail: plan.name,
      target: { path: pathOf({ page: "plan", name: plan.name, part: null }) },
    });
  for (const skill of lists.roster?.skills ?? [])
    entries.push({
      group: "Skills",
      label: skill.name,
      detail: skill.kind,
      target: { path: pathOf({ page: "roster" }) },
    });
  for (const view of VIEWS)
    entries.push({
      group: "Pages",
      label: view.label,
      detail: `g ${view.key}`,
      target: { path: view.path },
    });
  for (const tab of TABS)
    entries.push({
      group: "Pages",
      label: tab.label,
      detail: tab.path,
      target: { path: tab.path },
    });
  for (const home of lists.homes?.homes ?? [])
    if (home.present)
      entries.push({
        group: "Pages",
        label: home.title,
        detail: home.path,
        target: { path: pathOf({ page: "home", home: home.id, part: null }) },
      });
  for (const subsystem of lists.atlas?.subsystems.items ?? [])
    entries.push({
      group: "Pages",
      label: `${subsystem.name}, a subsystem`,
      detail: subsystem.layer,
      target: { path: pathOf({ page: "subsystem", name: subsystem.name }) },
    });
  for (const visual of lists.visuals?.pictures.items ?? [])
    entries.push({
      group: "Pages",
      label: `${visual.title}, a visual`,
      detail: visual.id,
      target: { path: pathOf({ page: "picture", id: visual.id }) },
    });
  return [...entries, ...ACTIONS];
}

/**
 * The lines a query matches: every word of it inside the line's label or
 * detail, the lines whose label starts with the query first, at most fifty.
 * @param query what was typed
 * @param entries the lines
 * @returns the lines matched, in the order shown
 */
export function matchEntries(
  query: string,
  entries: readonly PaletteEntry[],
): readonly PaletteEntry[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  const text = (entry: PaletteEntry): string => `${entry.label} ${entry.detail}`.toLowerCase();
  const matched = entries.filter((entry) => words.every((word) => text(entry).includes(word)));
  const head = query.trim().toLowerCase();
  const first = matched.filter(
    (entry) => head !== "" && entry.label.toLowerCase().startsWith(head),
  );
  return [...first, ...matched.filter((entry) => !first.includes(entry))].slice(0, 50);
}
