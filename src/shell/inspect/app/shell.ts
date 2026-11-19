import { h, type ComponentChild } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  AtlasDocument,
  PicturesDocument,
  ChangesDocument,
  DiscussionsDocument,
  HomesDocument,
  PlansDocument,
  RosterDocument,
} from "../../../core/inspector/documents.ts";
import { placeOf, pathOf, viewOf, VIEWS, type Place, type ViewName } from "./addresses.ts";
import { FootBar, LiveDot, PlaceLinks, placesShown } from "./bar.ts";
import { CatalogueView } from "./catalogue.ts";
import { answering, post, readDocument } from "./client.ts";
import { commandFor, KEYS, type KeyCommand } from "./keys.ts";
import {
  matchEntries,
  paletteEntries,
  type PaletteAction,
  type PaletteEntry,
  type PaletteLists,
} from "./search.ts";
import {
  foldToTurn,
  Generation,
  Icon,
  liveWords,
  NamesProvider,
  nextView,
  NotFound,
  ReadAgain,
  useDocument,
  type FoldView,
} from "./ui.ts";
import { LitPlace, PlaceView, SavedContext } from "./views.ts";

/*
 * The shell: one bar with the five places, the search, Reload and the
 * theme, and the read age as a dot with its words; below 768 px the places
 * move to a foot bar of five, each an icon over its word. Interface stands
 * only where the workspace has an app. The page the address shows sits
 * below the bar. A link to another of the app's paths opens in place and
 * the address bar follows, so every page has an address the agent can
 * print. The open page reads the repository again on Reload, on `r` and
 * when the window regains focus.
 */

/** Today's page kept its records behind hash anchors; an address of that form now names no page. */
const OLD_ANCHOR =
  /^#(change|plan|knowledge|changes|plans|overview|evidence|policy|installation|section-)/;

const THEME_KEY = "greenline-inspect-theme";

function storedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme: string | null): void {
  if (theme === "light" || theme === "dark") document.documentElement.dataset["theme"] = theme;
}

function switchTheme(): void {
  const root = document.documentElement;
  const dark =
    root.dataset["theme"] === undefined
      ? matchMedia("(prefers-color-scheme: dark)").matches
      : root.dataset["theme"] === "dark";
  const next = dark ? "light" : "dark";
  root.dataset["theme"] = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // The choice holds for this page; a browser that keeps no storage forgets it.
  }
}

/** The record list a record page belongs to, where Escape goes back to. */
function parentOf(place: Place): Place | undefined {
  switch (place.page) {
    case "change":
      return { page: "changes" };
    case "plan":
      return { page: "plans" };
    case "discussion":
      return { page: "discussions" };
    case "subsystem":
    case "document":
      return { page: "atlas", tab: "subsystems" };
    case "picture":
      return { page: "atlas", tab: "visuals" };
    case "home":
      return { page: "atlas", tab: "homes" };
    default:
      return undefined;
  }
}

/** The head of the group or fold in focus, or null where focus is on none. */
function headInFocus(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement
    ? (active.closest<HTMLElement>("details > summary") ?? null)
    : null;
}

/**
 * Open or close the group or fold in focus; a key on a row inside a group
 * closes that group and moves to its head.
 * @param want open, close or toggle
 */
function foldInFocus(want: "open" | "close" | "toggle"): void {
  const focused = headInFocus();
  const active = document.activeElement;
  const head =
    focused ??
    (want === "close" && active instanceof HTMLElement
      ? (active.closest("details")?.querySelector<HTMLElement>(":scope > summary") ?? null)
      : null);
  const details = head?.parentElement;
  if (!(details instanceof HTMLDetailsElement)) return;
  const open = want === "toggle" ? !details.open : want === "open";
  if (details.open !== open) details.open = open;
  head?.focus();
}

/**
 * Open or close every group and fold on the page.
 * @param open open them, or close them
 */
function everyFold(open: boolean): void {
  for (const details of document.querySelectorAll<HTMLDetailsElement>(
    "main details.group, main details.fold",
  ))
    if (details.open !== open) details.open = open;
}

/** Turn the open fold's view to the next it offers: Read, Source, JSON. */
function turnView(): void {
  const fold = foldToTurn(document.activeElement);
  if (fold === null) return;
  const chips = [
    ...fold.querySelectorAll<HTMLButtonElement>(":scope > .fold-open .fold-views [data-view]"),
  ];
  const views = chips.map((chip) => chip.dataset["view"]).filter(isView);
  const current = chips.find((chip) => chip.getAttribute("aria-pressed") === "true")?.dataset[
    "view"
  ];
  if (views.length < 2 || current === undefined || !isView(current)) return;
  const next = nextView(views, current);
  chips.find((chip) => chip.dataset["view"] === next)?.click();
}

function isView(value: string | undefined): value is FoldView {
  return value === "read" || value === "source" || value === "json";
}

function isField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** The palette: the lists the repository already holds, the pages and the actions, matched as typed. */
function Palette(props: {
  readonly close: () => void;
  readonly open: (entry: PaletteEntry) => void;
}): ComponentChild {
  const [query, setQuery] = useState("");
  const [lists, setLists] = useState<PaletteLists>({});
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    // Each list is read as it stands; one that cannot be read leaves its records out.
    const read = async (): Promise<PaletteLists> => {
      const settle = async <T>(promise: Promise<T>): Promise<T | undefined> => {
        try {
          return await promise;
        } catch {
          return undefined;
        }
      };
      const [changes, discussions, plans, roster, homes, atlas, visuals] = await Promise.all([
        settle<ChangesDocument>(readDocument("/api/changes", "changes")),
        settle<DiscussionsDocument>(readDocument("/api/discussions", "discussions")),
        settle<PlansDocument>(readDocument("/api/plans", "plans")),
        settle<RosterDocument>(readDocument("/api/roster", "roster")),
        settle<HomesDocument>(readDocument("/api/knowledge", "homes")),
        settle<AtlasDocument>(readDocument("/api/atlas", "atlas")),
        settle<PicturesDocument>(readDocument("/api/pictures", "pictures")),
      ]);
      const found: { -readonly [K in keyof PaletteLists]: PaletteLists[K] } = {};
      if (changes !== undefined) found.changes = changes;
      if (discussions !== undefined) found.discussions = discussions;
      if (plans !== undefined) found.plans = plans;
      if (roster !== undefined) found.roster = roster;
      if (homes !== undefined) found.homes = homes;
      if (atlas !== undefined) found.atlas = atlas;
      if (visuals !== undefined) found.visuals = visuals;
      return found;
    };
    void read().then(setLists);
  }, []);
  const matched = useMemo(() => matchEntries(query, paletteEntries(lists)), [query, lists]);
  const choose = (entry: PaletteEntry | undefined): void => {
    if (entry !== undefined) props.open(entry);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((selected + 1) % Math.max(1, matched.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((selected - 1 + matched.length) % Math.max(1, matched.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matched[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.close();
    }
  };
  let group = "";
  return h(
    "div",
    {
      class: "overlay",
      onClick: (event: MouseEvent) => {
        if (event.target === event.currentTarget) props.close();
      },
    },
    h(
      "div",
      {
        class: "palette",
        role: "dialog",
        "aria-label": "Palette",
        "aria-modal": "true",
        "data-component": "Palette",
      },
      h("input", {
        ref: input,
        type: "search",
        "aria-label": "Search the changes, discussions, plans, skills, pages and actions",
        placeholder: "Search changes, discussions, plans, skills, pages and actions",
        value: query,
        onInput: (event: Event) => {
          if (event.currentTarget instanceof HTMLInputElement) {
            setQuery(event.currentTarget.value);
            setSelected(0);
          }
        },
        onKeyDown: onKey,
      }),
      h(
        "ul",
        { role: "listbox", "aria-label": "Matches" },
        matched.length === 0 ? h("li", { class: "group" }, "Nothing matches.") : null,
        matched.flatMap((entry, index) => {
          const head =
            entry.group === group
              ? null
              : h("li", { class: "group", role: "presentation" }, entry.group);
          group = entry.group;
          return [
            head,
            h(
              "li",
              {
                role: "option",
                "aria-selected": String(index === selected),
                onClick: () => choose(entry),
                onMouseMove: () => setSelected(index),
              },
              h("span", null, entry.label),
              h("span", { class: "kind" }, entry.detail),
            ),
          ];
        }),
      ),
    ),
  );
}

/** The keys, every one and what it does. */
function Keys(props: { readonly close: () => void }): ComponentChild {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return h(
    "div",
    {
      class: "overlay",
      onClick: (event: MouseEvent) => {
        if (event.target === event.currentTarget) props.close();
      },
    },
    h(
      "div",
      { class: "keys", role: "dialog", "aria-label": "The keys", "aria-modal": "true" },
      h("h2", { style: "margin-top:0" }, "The keys"),
      h(
        "table",
        null,
        h(
          "tbody",
          null,
          KEYS.map((entry) =>
            h("tr", null, h("td", null, h("kbd", null, entry.keys)), h("td", null, entry.does)),
          ),
        ),
      ),
      h(
        "div",
        { class: "actions" },
        h("button", { ref: button, type: "button", onClick: props.close }, "Close"),
      ),
    ),
  );
}

/** The app: the bar, the page the address shows, the palette and the keys. */
export function App(): ComponentChild {
  const [place, setPlace] = useState<Place | undefined>(placeOf(location.pathname));
  const [generation, setGeneration] = useState(0);
  const [readAt, setReadAt] = useState(new Date());
  const [notice, setNotice] = useState(
    OLD_ANCHOR.test(location.hash)
      ? `The address ${location.hash} names no page: the inspector's addresses are paths now, such as /changes/<id>.`
      : "",
  );
  const [overlay, setOverlay] = useState<"palette" | "keys" | null>(null);
  // The place a page lights once it is read, a capture's page Interface; null lights the address's own.
  const [lit, setLit] = useState<ViewName | null>(null);
  // Whether the inspector answered its last ask, and the clock the read age is told against.
  const [serving, setServing] = useState(true);
  const [now, setNow] = useState(new Date());
  const afterG = useRef(false);
  // Interface stands where the manifest names the workspace's interface roots; a read that fails keeps it.
  const facing = useDocument("/api/interface", "interface");
  const hasApp =
    facing.state === "ready"
      ? facing.document.pages.available
      : facing.state === "failed"
        ? true
        : undefined;

  const go = (path: string): void => {
    if (path !== `${location.pathname}${location.search}`) history.pushState(null, "", path);
    setPlace(placeOf(new URL(path, location.origin).pathname));
    setNotice("");
    setLit(null);
  };
  const reload = (): void => {
    setGeneration((value) => value + 1);
    setReadAt(new Date());
    setNow(new Date());
    void answering().then(setServing);
  };
  const copy = (): void => {
    void navigator.clipboard.writeText(location.href).then(
      () => setNotice(`Copied ${location.href}`),
      () => setNotice(`The address is ${location.href}`),
    );
  };
  const sync = (): void => {
    const run = async (): Promise<string> => {
      try {
        const answer = await post("/api/sync", { sync: true });
        return answer.outcome.ok
          ? "Installation synchronized."
          : answer.outcome.diagnostics.map((note) => note.message).join("\n");
      } catch (error) {
        return error instanceof Error ? error.message : "The sync failed.";
      }
    };
    void run().then((message) => {
      setNotice(message);
      reload();
    });
  };
  const act = (action: PaletteAction): void => {
    if (action === "copy") copy();
    else if (action === "reload") reload();
    else if (action === "theme") switchTheme();
    else if (action === "sync") sync();
    else setOverlay("keys");
  };
  const move = (step: 1 | -1): void => {
    const items = [...document.querySelectorAll<HTMLElement>("main [data-item]")];
    if (items.length === 0) return;
    const at = items.findIndex((item) => item === document.activeElement);
    const next =
      items[
        at === -1 ? (step === 1 ? 0 : items.length - 1) : (at + step + items.length) % items.length
      ];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };
  const run = (command: KeyCommand): void => {
    switch (command.kind) {
      case "palette":
        setOverlay("palette");
        return;
      case "await-view":
        afterG.current = true;
        return;
      case "go":
        go(command.path);
        return;
      case "next":
        move(1);
        return;
      case "previous":
        move(-1);
        return;
      case "toggle":
        foldInFocus("toggle");
        return;
      case "open":
        foldInFocus("open");
        return;
      case "close":
        foldInFocus("close");
        return;
      case "open-all":
        everyFold(true);
        return;
      case "close-all":
        everyFold(false);
        return;
      case "view":
        turnView();
        return;
      case "back": {
        if (overlay !== null) {
          setOverlay(null);
          return;
        }
        const parent = place === undefined ? undefined : parentOf(place);
        if (parent !== undefined) go(pathOf(parent));
        return;
      }
      case "reload":
        reload();
        return;
      case "theme":
        switchTheme();
        return;
      case "copy":
        copy();
        return;
      case "keys":
        setOverlay("keys");
        return;
    }
  };

  useEffect(() => {
    applyTheme(storedTheme());
    const onPop = (): void => {
      setPlace(placeOf(location.pathname));
      setLit(null);
    };
    const onClick = (event: MouseEvent): void => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      const href = link?.getAttribute("href");
      if (
        link === null ||
        href === null ||
        href === undefined ||
        link.target !== "" ||
        !href.startsWith("/")
      )
        return;
      const url = new URL(href, location.origin);
      if (placeOf(url.pathname) === undefined) return;
      event.preventDefault();
      go(url.pathname);
    };
    const onFocus = (): void => reload();
    // The read age moves on while the page stands open.
    const tick = setInterval(() => setNow(new Date()), 30_000);
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(tick);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const pending = afterG.current;
      afterG.current = false;
      if (overlay === "palette" && event.key !== "Escape") return;
      const command = commandFor(
        event.key,
        { meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey },
        isField(event.target),
        pending,
      );
      if (command === undefined) return;
      event.preventDefault();
      run(command);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const view = place === undefined ? undefined : viewOf(place);
    const label =
      view === "catalogue" ? "Catalogue" : VIEWS.find((entry) => entry.name === view)?.label;
    if (place === undefined || (place.page !== "change" && place.page !== "plan"))
      document.title = `${label ?? "No page"} · greenline`;
  }, [place]);

  const current = lit ?? (place === undefined ? undefined : viewOf(place));
  const places = placesShown(hasApp, current);
  const live = liveWords(readAt, now, serving);
  const saved = (message: string, reread: boolean): void => {
    setNotice(message);
    if (reread) reload();
  };
  return h(
    Generation.Provider,
    { value: generation },
    h(
      ReadAgain.Provider,
      { value: reload },
      h(
        NamesProvider,
        null,
        h(
          SavedContext.Provider,
          { value: saved },
          h(
            "header",
            { class: "bar", "data-component": "Bar" },
            h(
              "div",
              { class: "bar-inner" },
              h("a", { class: "brand", href: "/" }, "greenline"),
              h(PlaceLinks, { places, current }),
              h(
                "div",
                { class: "tools" },
                h(
                  "button",
                  {
                    type: "button",
                    class: "ghost",
                    onClick: () => setOverlay("palette"),
                    "aria-label": "Search",
                    title: "Search (/)",
                  },
                  h(Icon, { name: "search" }),
                  h("span", { class: "label" }, "Search"),
                  h("kbd", { class: "label" }, "/"),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "ghost icon-button",
                    onClick: reload,
                    "aria-label": "Reload",
                    title: "Read the repository again (r)",
                  },
                  h(Icon, { name: "reload" }),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "ghost icon-button",
                    onClick: switchTheme,
                    "aria-label": "Theme",
                    title: "Switch light and dark (t)",
                  },
                  h(Icon, { name: "theme" }),
                ),
                h(LiveDot, { live, readAt }),
              ),
            ),
          ),
          h(
            "main",
            { class: "page" },
            h("p", { class: "notice", role: "status" }, notice),
            h(
              LitPlace.Provider,
              { value: setLit },
              place === undefined
                ? h(NotFound, { path: location.pathname })
                : place.page === "catalogue"
                  ? h(CatalogueView, null)
                  : h(PlaceView, { place }),
            ),
          ),
          h(FootBar, { places, current }),
          h(
            "footer",
            { class: "foot" },
            "A local page: it reads this repository and contacts no service. It writes only the saves you make here.",
          ),
          overlay === "palette"
            ? h(Palette, {
                close: () => setOverlay(null),
                open: (entry) => {
                  setOverlay(null);
                  if ("path" in entry.target) go(entry.target.path);
                  else act(entry.target.action);
                },
              })
            : overlay === "keys"
              ? h(Keys, { close: () => setOverlay(null) })
              : null,
        ),
      ),
    ),
  );
}
