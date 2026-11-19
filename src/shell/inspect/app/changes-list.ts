import { h, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import type { ChangeListEntry } from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import { ChangeRow, finished } from "./change.ts";
import {
  dayName,
  dayTime,
  Empty,
  FilterBar,
  Group,
  ListBox,
  ListSummary,
  plural,
  RecordLink,
} from "./ui.ts";

/*
 * The changes list (J-166 S1): every change, the most recently active
 * first, the open ones grouped by state, waiting on you, in progress,
 * stopped, proposed, and the finished ones by the day they closed, or by
 * plan where the owner groups so; each row with its size and when it
 * closed. The filter and the grouping live in the address, `?state=` and
 * `?group=`, so a reload, the back button and a shared link keep them.
 */

/** The states a list filters by, the whole set first. */
const FILTERS = [
  "all",
  "waiting",
  "in-progress",
  "stopped",
  "proposed",
  "done",
  "dropped",
] as const;
export type Filter = (typeof FILTERS)[number];

/** Each filter in the practice's own words. */
const FILTER_WORDS = {
  all: "All",
  waiting: "Waiting on you",
  "in-progress": "In progress",
  stopped: "Stopped",
  proposed: "Proposed",
  done: "Done",
  dropped: "Dropped",
} as const satisfies Readonly<Record<Filter, string>>;

/** How the finished changes are grouped: by the day they closed, or by their plan. */
export type Grouping = "day" | "plan";

/** The open states in the order the list shows their groups, each with its group's title. */
const OPEN_GROUPS: readonly (readonly [string, string])[] = [
  ["waiting", "Waiting on you"],
  ["in-progress", "In progress"],
  ["stopped", "Stopped"],
  ["proposed", "Proposed"],
];

/** The list's view as the address holds it: its filter and its grouping. */
export interface ListView {
  readonly filter: Filter;
  readonly group: Grouping;
}

/**
 * The list's view an address asks for: its filter and its grouping, each
 * where it names one the list offers.
 * @param search the address's query
 * @returns the filter and the grouping
 */
export function listView(search: string): ListView {
  const query = new URLSearchParams(search);
  const state = query.get("state");
  return {
    filter: FILTERS.find((filter) => filter === state) ?? "all",
    group: query.get("group") === "plan" ? "plan" : "day",
  };
}

/**
 * The address of the list in a view: `/changes`, with `?state=` and
 * `?group=` where they differ from the whole set by day.
 * @param filter the filter
 * @param group the grouping
 * @returns the address
 */
export function listAddress(filter: Filter, group: Grouping): string {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("state", filter);
  if (group !== "day") query.set("group", group);
  const text = query.toString();
  return `${pathOf({ page: "changes" })}${text === "" ? "" : `?${text}`}`;
}

/** A change's last activity as a number, the newest highest; a change with none sorts by the day it opened. */
function activity(change: ChangeListEntry): number {
  const at = change.lastAt ?? change.closedAt;
  const time = at === null ? Number.NaN : Date.parse(at);
  return Number.isNaN(time) ? Date.parse(`${change.opened}T00:00:00Z`) || 0 : time;
}

/**
 * The changes, the most recently active first.
 * @param changes the changes
 * @returns them sorted
 */
export function newestFirst(changes: readonly ChangeListEntry[]): readonly ChangeListEntry[] {
  return [...changes].sort((a, b) => activity(b) - activity(a) || b.id.localeCompare(a.id));
}

/** One group of the list: its key on the page, its title and its changes. */
export interface ListGroup {
  readonly id: string;
  readonly title: ComponentChild;
  readonly changes: readonly ChangeListEntry[];
}

/**
 * The list's groups (J-166 S1): the open changes by state, in the order
 * waiting, in progress, stopped, proposed; then the finished ones by the
 * day they closed, the newest day first, or by plan.
 * @param changes the changes, the newest first
 * @param group how the finished are grouped
 * @param at the time the page is read at
 * @returns the groups, none empty
 */
export function listGroups(
  changes: readonly ChangeListEntry[],
  group: Grouping,
  at: Date,
): readonly ListGroup[] {
  const open = changes.filter((change) => !finished(change));
  const done = changes.filter(finished);
  const groups: ListGroup[] = OPEN_GROUPS.map(([state, title]) => ({
    id: `state:${state}`,
    title,
    changes: open.filter((change) => (change.state ?? "unreadable") === state),
  }));
  const unreadable = open.filter(
    (change) => !OPEN_GROUPS.some(([state]) => state === change.state),
  );
  groups.push({ id: "state:unreadable", title: "Unreadable", changes: unreadable });
  const keyed = new Map<string, { title: ComponentChild; changes: ChangeListEntry[] }>();
  for (const change of done) {
    const key =
      group === "plan"
        ? (change.plan ?? "")
        : (() => {
            const time = change.closedAt ?? change.lastAt;
            return time === null ? "" : dayName(time, at);
          })();
    const title =
      group === "plan"
        ? change.plan === null
          ? "No plan"
          : h(RecordLink, {
              kind: "plan",
              id: change.plan,
              href: pathOf({ page: "plan", name: change.plan, part: null }),
              plain: true,
            })
        : key === ""
          ? "Undated"
          : key;
    const held = keyed.get(key) ?? { title, changes: [] };
    held.changes.push(change);
    keyed.set(key, held);
  }
  for (const [key, held] of keyed)
    groups.push({ id: `${group}:${key}`, title: held.title, changes: held.changes });
  return groups.filter((entry) => entry.changes.length > 0);
}

/**
 * The changes list drawn from the changes, the filter and the grouping the
 * address holds: its summary line, the chips with each state's count, a
 * state none stands in dimmed in place, the grouping's switch, and the
 * groups of rows.
 */
export function ChangesList(props: {
  readonly changes: readonly ChangeListEntry[];
  readonly filter: Filter;
  readonly group: Grouping;
  readonly at: Date;
  readonly pick: (filter: Filter) => void;
  readonly regroup: (group: Grouping) => void;
}): ComponentChild {
  const all = newestFirst(props.changes);
  const count = (state: Filter): number =>
    state === "all" ? all.length : all.filter((entry) => entry.state === state).length;
  const shown = all.filter((entry) => props.filter === "all" || entry.state === props.filter);
  const lastClosed = all.find((entry) => finished(entry) && entry.closedAt !== null);
  const groups = listGroups(shown, props.group, props.at);
  return h(
    "div",
    { "data-component": "ChangesList" },
    h(ListSummary, {
      count: all.length,
      noun: "change",
      more:
        lastClosed === undefined || lastClosed.closedAt === null
          ? undefined
          : [
              "last closed ",
              h(RecordLink, {
                kind: "change",
                id: lastClosed.id,
                href: lastClosed.ref.address,
                named: lastClosed.ref,
              }),
              `, ${dayTime(lastClosed.closedAt, props.at)}`,
            ],
    }),
    h(
      "div",
      { class: "list-tools" },
      h(FilterBar<Filter>, {
        label: "Show changes by state",
        chips: FILTERS.map((state) => ({
          key: state,
          label: FILTER_WORDS[state],
          count: count(state),
        })),
        current: props.filter,
        pick: props.pick,
      }),
      h(FilterBar<Grouping>, {
        label: "Group the finished changes",
        chips: [
          { key: "day", label: "By day", count: all.filter(finished).length },
          {
            key: "plan",
            label: "By plan",
            count: new Set(all.filter(finished).map((entry) => entry.plan ?? "")).size,
          },
        ],
        current: props.group,
        pick: props.regroup,
      }),
    ),
    shown.length === 0
      ? h(
          Empty,
          { title: `No change is ${FILTER_WORDS[props.filter].toLowerCase()} now.` },
          h(
            "p",
            null,
            "The chips above show how many stand in each state; All shows every change.",
          ),
        )
      : h(
          ListBox,
          { label: "The changes" },
          groups.map((entry) =>
            h(
              Group,
              {
                id: entry.id,
                title: entry.title,
                count: entry.changes.length,
                now: entry.changes.some((change) => change.waitingOn !== null),
                open: true,
                flat: false,
              },
              h(
                "ul",
                { class: "rows" },
                entry.changes.map((change) => h(ChangeRow, { change, at: props.at })),
              ),
            ),
          ),
        ),
    shown.length === 0
      ? null
      : h(
          "p",
          { class: "meta" },
          `${plural(shown.length, "change")} shown, the most recently active first.`,
        ),
  );
}

/** The changes list as the page holds it: the filter and the grouping from the address, each pick written back to it. */
export function ChangesListView(props: {
  readonly changes: readonly ChangeListEntry[];
}): ComponentChild {
  const [view, setView] = useState(() => listView(location.search));
  const move = (filter: Filter, group: Grouping): void => {
    setView({ filter, group });
    history.replaceState(null, "", listAddress(filter, group));
  };
  return h(ChangesList, {
    changes: props.changes,
    filter: view.filter,
    group: view.group,
    at: new Date(),
    pick: (filter) => move(filter, view.group),
    regroup: (group) => move(view.filter, group),
  });
}
