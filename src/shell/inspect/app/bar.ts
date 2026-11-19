import { h, type ComponentChild } from "preact";
import { VIEWS, type ViewEntry, type ViewName } from "./addresses.ts";
import { Icon, type LiveReading } from "./ui.ts";

/*
 * The bar's parts (J-164 S1): the five places as words above 768 px and as
 * a foot bar of five below it, each an icon over its word with the place lit
 * in ink on the accent's top edge, Interface only where the workspace has an
 * app, and the read age as a dot with its words. The shell draws them; the
 * catalogue draws them from fixtures.
 */

/**
 * The places the bar shows: every one, Interface only where the workspace
 * has an app or the page is one of its own.
 * @param hasApp whether the workspace has an app, undefined while it is read
 * @param current the place lit
 * @returns the places
 */
export function placesShown(
  hasApp: boolean | undefined,
  current: ViewName | "catalogue" | undefined,
): readonly ViewEntry[] {
  return VIEWS.filter(
    (view) => view.name !== "interface" || hasApp !== false || current === "interface",
  );
}

/** One place as a link: its word, with its icon over it in the foot bar. */
function PlaceLink(props: {
  readonly view: ViewEntry;
  readonly current: ViewName | "catalogue" | undefined;
  readonly icon: boolean;
}): ComponentChild {
  const { view } = props;
  return h(
    "a",
    {
      href: view.path,
      "aria-current": props.current === view.name ? "page" : undefined,
      title: `g ${view.key}`,
      "data-place": view.name,
    },
    props.icon ? h(Icon, { name: view.name }) : null,
    h("span", null, view.label),
  );
}

/** The places as words in the bar, above 768 px. */
export function PlaceLinks(props: {
  readonly places: readonly ViewEntry[];
  readonly current: ViewName | "catalogue" | undefined;
}): ComponentChild {
  return h(
    "nav",
    { class: "views", "aria-label": "Places", "data-component": "PlaceLinks" },
    props.places.map((view) => h(PlaceLink, { view, current: props.current, icon: false })),
  );
}

/**
 * The foot bar below 768 px: a cell per place, 56 px over the safe area, an
 * icon over an 11 px word, the place lit in ink with the accent's top edge.
 * The catalogue draws it in place, where the page's own stays fixed.
 */
export function FootBar(props: {
  readonly places: readonly ViewEntry[];
  readonly current: ViewName | "catalogue" | undefined;
  readonly inPlace?: boolean;
}): ComponentChild {
  return h(
    "nav",
    {
      class: props.inPlace === true ? "foot-bar in-place" : "foot-bar",
      "aria-label": "Places",
      "data-component": "FootBar",
      style: `--places: ${String(props.places.length)}`,
    },
    props.places.map((view) => h(PlaceLink, { view, current: props.current, icon: true })),
  );
}

/** The read age: a dot in the state's tone with its words, Live, Read 3 min ago or Stopped. */
export function LiveDot(props: {
  readonly live: LiveReading;
  readonly readAt: Date;
}): ComponentChild {
  return h(
    "span",
    {
      class: "live",
      "data-live": props.live.state,
      "data-component": "LiveDot",
      "aria-live": "polite",
      title: `Read at ${props.readAt.toTimeString().slice(0, 8)}; the page reads again on Reload, on r and when its window regains focus.`,
    },
    h("span", { class: "live-words" }, props.live.words),
  );
}
