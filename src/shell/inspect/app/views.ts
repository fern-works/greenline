import { dealAddress, dealApiPath, dealAskQuery, namesReroll } from "../../../core/deal-ask.ts";
import {
  createContext,
  h,
  type ComponentChild,
  type ComponentChildren,
  type Context,
} from "preact";
import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import type {
  HomeDocument,
  HomeReading,
  InterfaceChecksDocument,
  MarkView,
  NotesReading,
  PictureDocument,
  SettingsDocument,
  VisualView,
} from "../../../core/inspector/documents.ts";
import {
  pathOf,
  PLACE_TABS,
  tabOfPlace,
  VIEWS,
  type AtlasTab,
  type Place,
  type SettingsTab,
  type ViewName,
} from "./addresses.ts";
import {
  AtlasEmpty,
  AtlasHistory,
  DocumentList,
  DocumentPage,
  MapBands,
  MapsList,
  SubsystemPage,
  VisualCard,
  VisualPage,
  type DeleteState,
} from "./atlas.ts";
import { deleteVisual, postCapture, postClose, postMark, postPick } from "./client.ts";
import {
  BeforeAfter,
  CaptureNow,
  CapturePanel,
  capturePath,
  MarksList,
  type CaptureNowState,
  type MarkSaving,
} from "./marks.ts";
import {
  CatalogBrowser,
  DealSection,
  InterfaceSection,
  InterfacesPanel,
  type PickState,
} from "./interface.ts";
import { ChangesEmpty } from "./change.ts";
import { ChangesListView } from "./changes-list.ts";
import { ChangeFirstDraw, ChangePage, PartReadings, tabOf } from "./change-page.ts";
import { DeclaredChecks, ReceiptTable } from "./checks.ts";
import { DeskView } from "./desk.ts";
import { DiscussionPage, DiscussionRow } from "./discussion.ts";
import { HomePage } from "./home.ts";
import {
  homeCards,
  KnowledgeOverview,
  PolicyEditor,
  PolicyMoved,
  RulingsEditor,
} from "./knowledge-pages.ts";
import { captureChange, PageCardsView } from "./pages.ts";
import { PlanPage, PlanRow, PlansEmpty } from "./plan.ts";
import { PracticeHome } from "./practice.ts";
import { RosterView, SkillPage } from "./roster.ts";
import { InstallationForm, InstalledFiles, type Saved } from "./settings.ts";
import {
  Callout,
  Empty,
  ListBox,
  ListSummary,
  lookupName,
  NamesContext,
  PartFailed,
  plural,
  drawReading,
  RecordLink,
  ScoreChips,
  SectionHead,
  Tabs,
  useDocument,
  When,
  type Reading,
} from "./ui.ts";

/*
 * The five places and the record pages, each reading its document of the
 * contract and drawing it with the library's components. A view reads
 * again whenever the shell's generation moves: on Reload, on `r` and when
 * the window regains focus.
 */

/** What the shell gives a view: how to report a save's outcome. */
export const SavedContext: Context<Saved> = createContext<Saved>(() => undefined);

/** How a page lights a place other than its address's once it is read: a capture's page lights Interface. */
export const LitPlace: Context<(view: ViewName | null) => void> = createContext<
  (view: ViewName | null) => void
>(() => undefined);

/** The first element inside a scope whose anchor is the one named. */
function anchored(scope: ParentNode, name: string): HTMLElement | undefined {
  return [...scope.querySelectorAll<HTMLElement>("[data-anchor]")].find(
    (element) => element.dataset["anchor"] === name,
  );
}

/**
 * Open and show the part a place names, once its document is drawn, and
 * the heading inside it where the address names one too.
 */
function useReveal(part: string | null, anchor: string | null, ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    if (part === null) {
      window.scrollTo(0, 0);
      return;
    }
    // A part a later read draws, the frame map or the deal, is looked for again for a while (J-142 S1).
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = (): void => {
      const found = anchored(document, part);
      const inner = found === undefined || anchor === null ? undefined : anchored(found, anchor);
      const whole = found !== undefined && (anchor === null || inner !== undefined);
      if (!whole && tries < 40) {
        tries += 1;
        timer = setTimeout(reveal, 100);
        return;
      }
      if (found === undefined) return;
      if (found instanceof HTMLDetailsElement) found.open = true;
      if (inner instanceof HTMLDetailsElement) inner.open = true;
      const target = inner ?? found;
      target.scrollIntoView(true);
      target.classList.remove("flash");
      void target.offsetWidth;
      target.classList.add("flash");
    };
    reveal();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [part, anchor, ready]);
}

function Head(props: { readonly title: string; readonly lede: string }): ComponentChild {
  return h(
    "header",
    { class: "view-head" },
    h("h1", null, props.title),
    h("p", { class: "lede" }, props.lede),
  );
}

/**
 * A home's items, or its read state: failed naming the home and why, or
 * empty saying what would appear.
 */
function homeItems<T>(
  reading: HomeReading<T>,
  draw: (item: T) => ComponentChild,
  empty: string,
  reads: string,
): ComponentChild {
  if (!reading.available) return h(PartFailed, { reads, reason: reading.reason });
  return reading.items.length === 0 ? h(Empty, { title: empty }) : reading.items.map(draw);
}

/**
 * How many items stand in each state, in the order given, a state none stands in left out.
 * @param items the items
 * @param stateOf an item's state
 * @param order the states in the order to show them
 * @returns each state with its count
 */
function tally<T>(
  items: readonly T[],
  stateOf: (item: T) => string,
  order: readonly string[],
): (readonly [string, number])[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(stateOf(item), (counts.get(stateOf(item)) ?? 0) + 1);
  const named = order.map((state) => [state, counts.get(state) ?? 0] as const);
  const rest = [...counts].filter(([state]) => !order.includes(state));
  return [...named, ...rest].filter(([, count]) => count > 0);
}

/**
 * The newest item by a time, the first among equals.
 * @param items the items
 * @param at an item's time, a date or an ISO time; null where it has none
 * @returns the newest, or undefined where none has a time
 */
function newestOf<T>(items: readonly T[], at: (item: T) => string | null): T | undefined {
  let newest: T | undefined;
  let time = "";
  for (const item of items) {
    const stamp = at(item);
    if (stamp !== null && stamp > time) {
      newest = item;
      time = stamp;
    }
  }
  return newest;
}

/** A place's tabs, each its own address, the page's own or the one that lists it lit. */
function PlaceTabs(props: { readonly view: ViewName; readonly place: Place }): ComponentChild {
  const lit = tabOfPlace(props.place);
  return h(Tabs, {
    label: VIEWS.find((entry) => entry.name === props.view)?.label ?? props.view,
    items: PLACE_TABS[props.view].map((tab) => ({
      label: tab.label,
      path: pathOf(tab.place),
      current: tab.label === lit,
    })),
  });
}

/** One of the five places: its head, its tabs and the page its address shows. */
function PlaceSection(props: {
  readonly view: ViewName;
  readonly place: Place;
  readonly lede: string;
  readonly children?: ComponentChildren;
}): ComponentChild {
  return h(
    "section",
    { "data-view": props.view },
    h(Head, {
      title: VIEWS.find((entry) => entry.name === props.view)?.label ?? props.view,
      lede: props.lede,
    }),
    h(PlaceTabs, { view: props.view, place: props.place }),
    props.children,
  );
}

/** Changes, with Plans and Discussions as its tabs (J-164 S1). */
function ChangesView(props: {
  readonly tab: "changes" | "plans" | "discussions";
  readonly place: Place;
}): ComponentChild {
  return h(
    PlaceSection,
    {
      view: "changes",
      place: props.place,
      lede: "Every change the practice made here, the most recently active first, the plans its plan steps split into tickets, and the ideas discussed before they became changes.",
    },
    props.tab === "changes"
      ? h(ChangesTab, null)
      : props.tab === "plans"
        ? h(PlansTab, null)
        : h(DiscussionsTab, null),
  );
}

function ChangesTab(): ComponentChild {
  const reading = useDocument("/api/changes", "changes");
  return drawReading(
    reading,
    (list) =>
      list.unavailable !== null || list.changes.length === 0
        ? h(ChangesEmpty, { unavailable: list.unavailable })
        : h(ChangesListView, { changes: list.changes }),
    "the changes from the ledger",
  );
}

function PlansTab(): ComponentChild {
  const reading = useDocument("/api/plans", "plans");
  return h(
    "div",
    null,
    h(
      "p",
      { class: "meta" },
      "Each ticket's progress and the tickets ready to start are derived as greenline status derives them, never written.",
    ),
    drawReading(
      reading,
      (list) =>
        list.unavailable !== null || list.plans.length === 0
          ? h(PlansEmpty, { unavailable: list.unavailable })
          : [
              h(ListSummary, {
                count: list.plans.length,
                noun: "plan",
                more: (() => {
                  const total = list.plans.reduce((sum, plan) => sum + plan.counts.total, 0);
                  const done = list.plans.reduce((sum, plan) => sum + plan.counts.done, 0);
                  const ready = list.plans.reduce((sum, plan) => sum + plan.ready.length, 0);
                  return `${plural(total, "ticket")}, ${done} done, ${ready} ready to start`;
                })(),
              }),
              h(
                ListBox,
                { label: "The plans" },
                h(
                  "ul",
                  { class: "rows" },
                  list.plans.map((plan) => h(PlanRow, { plan })),
                ),
              ),
            ],
      "the plans under .greenline/plans/",
    ),
  );
}

/** The parts of a change's page read once for the page, shared by the head, the outcome card and the tabs (J-166 S1). */
const SHARED_PARTS = [
  ["commits", "commits"],
  ["changed", "changed-files"],
  ["checks", "check-facts"],
  ["frame", "frame-map"],
] as const;

/** One change's page. */
function ChangeView(props: {
  readonly id: string;
  readonly part: string | null;
  readonly anchor: string | null;
  /** A file of the change's folder its address names, opened in place. */
  readonly file: string | null;
  /** A file the change's commits touched, its lines opened in the Code tab (J-155 S2). */
  readonly changed: string | null;
}): ComponentChild {
  const base = `/api/changes/${encodeURIComponent(props.id)}`;
  // The change's head; its shared parts are read once and handed to every part that draws them (J-165 S1, J-166 S1).
  const reading = useDocument(base, "change");
  const commits = useDocument(`${base}/commits`, "commits");
  const changed = useDocument(`${base}/changed`, "changed-files");
  const checks = useDocument(`${base}/checks`, "check-facts");
  const frame = useDocument(`${base}/frame`, "frame-map");
  const shared = useMemo(
    () =>
      new Map<string, Reading<unknown>>(
        SHARED_PARTS.map(([aspect]) => [
          aspect,
          aspect === "commits"
            ? commits
            : aspect === "changed"
              ? changed
              : aspect === "checks"
                ? checks
                : frame,
        ]),
      ),
    [commits, changed, checks, frame],
  );
  useReveal(props.changed ?? props.file ?? props.part, props.anchor, reading.state === "ready");
  // What the shell already holds of the change, its name, state and day, drawn while its document is read (J-155 S6).
  const names = useContext(NamesContext);
  const known =
    names.state === "ready" ? (lookupName(names.document, "change", props.id) ?? null) : null;
  const name = reading.state === "ready" ? reading.document.ref.name : (known?.name ?? null);
  useEffect(() => {
    document.title = `${name ?? "A change"} · greenline`;
  }, [name]);
  if (reading.state === "reading")
    return h("div", { "data-reading": "reading" }, h(ChangeFirstDraw, { known }));
  const steps = props.file !== null || tabOf(props.part, props.changed) === "steps";
  return drawReading(
    reading,
    (page) =>
      h(
        PartReadings.Provider,
        { value: shared },
        h(ChangePage, {
          page,
          part: props.part,
          file: props.file,
          changed: props.changed,
          // The interface, the deal and the notes belong to the steps; the other tabs answer their own question alone.
          extra: steps
            ? [
                h(ChangeInterfacePart, { id: props.id, deal: props.part === "deal" }),
                h(ChangeMarksPart, { id: props.id }),
              ]
            : null,
        }),
      ),
    "this change's record and its folder",
  );
}

/** A change's interface section, read from its own address as the steps open (J-165 S1). */
function ChangeInterfacePart(props: {
  readonly id: string;
  readonly deal: boolean;
}): ComponentChild {
  const reading = useDocument(
    `/api/changes/${encodeURIComponent(props.id)}/interface`,
    "interface-checks",
  );
  return reading.state === "ready"
    ? h(InterfacePart, { id: props.id, deal: props.deal, document: reading.document })
    : null;
}

/** The notes on a change's captures, read from its own address as the steps open (J-165 S1). */
function ChangeMarksPart(props: { readonly id: string }): ComponentChild {
  const reading = useDocument(`/api/changes/${encodeURIComponent(props.id)}/notes`, "notes");
  if (reading.state !== "ready") return drawReading(reading, () => null, "your notes");
  return h(MarksPart, { change: props.id, marks: reading.document.notes });
}

/**
 * A record's name for the tab's title: its name where the names hold it,
 * else its id, the only words the address gives.
 */
function useRecordName(kind: "change" | "plan", id: string): string {
  const names = useContext(NamesContext);
  return names.state === "ready" ? (lookupName(names.document, kind, id)?.name ?? id) : id;
}

/** One plan's page. */
function PlanView(props: {
  readonly name: string;
  readonly part: string | null;
  readonly anchor: string | null;
}): ComponentChild {
  const reading = useDocument(`/api/plans/${encodeURIComponent(props.name)}`, "plan");
  useReveal(props.part, props.anchor, reading.state === "ready");
  const name = useRecordName("plan", props.name);
  useEffect(() => {
    document.title = `${name} · greenline`;
  }, [name]);
  return drawReading(
    reading,
    (page) => h(PlanPage, { plan: page.plan, part: props.part }),
    "this plan's tickets and documents",
  );
}

/** Discussions, a tab of Changes: ideas explored before they become changes. */
function DiscussionsTab(): ComponentChild {
  const reading = useDocument("/api/discussions", "discussions");
  return h(
    "div",
    { "data-tab": "discussions" },
    h(
      "p",
      { class: "meta" },
      "Ideas explored before they become changes, each set open, parked, declined, promoted or merged on the owner's word.",
    ),
    drawReading(
      reading,
      (list) => {
        const items = list.discussions.available ? list.discussions.items : [];
        const newest = newestOf(items, (item) => item.touched ?? item.opened);
        return [
          items.length === 0
            ? null
            : h(ListSummary, {
                count: items.length,
                noun: "discussion",
                states: tally(items, (item) => item.state, [
                  "open",
                  "parked",
                  "promoted",
                  "merged",
                  "declined",
                ]),
                newest:
                  newest === undefined
                    ? null
                    : {
                        name: h(RecordLink, {
                          kind: "discussion",
                          id: newest.id,
                          href: newest.ref.address,
                          named: newest.ref,
                        }),
                        at: newest.touched ?? newest.opened,
                      },
              }),
          items.length === 0
            ? homeItems(
                list.discussions,
                () => null,
                "No discussion yet. An idea you explore with the agent before it becomes work is kept here.",
                "the discussions",
              )
            : h(
                ListBox,
                { label: "The discussions" },
                h(
                  "ul",
                  { class: "rows" },
                  items.map((discussion) => h(DiscussionRow, { discussion })),
                ),
              ),
        ];
      },
      "the discussions from the ledger",
    ),
  );
}

/** One discussion's page. */
function DiscussionView(props: { readonly id: string }): ComponentChild {
  const reading = useDocument(`/api/discussions/${encodeURIComponent(props.id)}`, "discussion");
  return drawReading(
    reading,
    (page) => h(DiscussionPage, { discussion: page.discussion }),
    "this discussion's record",
  );
}

/** The words under each place's name. */
const LEDES = {
  interface:
    "How the app looks and what you asked about it: a card per page with its newest capture, your notes on them, and the installed catalog.",
  knowledge:
    "What has been settled and in which words: the homes, the decisions book and the house rulings read and edited here, the figures, the interactive maps and figures, the atlas and a page per subsystem.",
  practice:
    "Is greenline healthy here, and how is it set: what greenline status reports, the roster and its use, the settings, the installed files, the checks and the receipts.",
} as const;

/** Interface's pages and its catalog, and Knowledge's overview, pictures, maps, atlas and subsystems, each under its place (J-164 S1, J-166 S1, J-221 S1). */
function AtlasView(props: { readonly tab: AtlasTab; readonly place: Place }): ComponentChild {
  const facing = props.tab === "catalog" || props.tab === "interfaces";
  return h(
    PlaceSection,
    {
      view: facing ? "interface" : "knowledge",
      place: props.place,
      lede: facing ? LEDES.interface : LEDES.knowledge,
    },
    props.tab === "homes"
      ? h(KnowledgeTab, null)
      : props.tab === "catalog"
        ? h(CatalogTab, null)
        : props.tab === "interfaces"
          ? h(InterfacesTab, null)
          : props.tab === "visuals"
            ? h(VisualsTab, null)
            : props.tab === "maps"
              ? h(MapsTab, null)
              : h(MapTab, { tab: props.tab }),
  );
}

/** Knowledge's overview (J-166 S1): a card per home, from the homes, the atlas, the pictures and the settings. */
function KnowledgeTab(): ComponentChild {
  const homes = useDocument("/api/knowledge", "homes");
  const atlas = useDocument("/api/atlas", "atlas");
  const pictures = useDocument("/api/pictures", "pictures");
  const settings = useDocument("/api/settings", "settings");
  const ready = <T>(reading: Reading<T>): T | null =>
    reading.state === "ready" ? reading.document : null;
  return drawReading(
    homes,
    (list) =>
      h(KnowledgeOverview, {
        cards: homeCards(list.homes, ready(atlas), ready(pictures), ready(settings)),
        at: new Date(),
      }),
    "the knowledge homes",
    "cards",
  );
}

function MapTab(props: { readonly tab: "map" | "subsystems" }): ComponentChild {
  const reading = useDocument("/api/atlas", "atlas");
  return drawReading(
    reading,
    (atlas) =>
      props.tab === "map"
        ? atlas.map.available
          ? atlas.standing.pages === 0
            ? h(
                "div",
                null,
                h(AtlasEmpty, { standing: atlas.standing }),
                h(AtlasHistory, { refreshes: atlas.refreshes }),
              )
            : h(
                "div",
                null,
                h(MapBands, {
                  layers: atlas.map.items,
                  subsystems: atlas.subsystems.available ? atlas.subsystems.items : [],
                }),
                atlas.standing.major === null
                  ? null
                  : h(
                      "p",
                      { class: "meta" },
                      `A major change since the map: ${atlas.standing.major}.`,
                    ),
                h(AtlasHistory, { refreshes: atlas.refreshes }),
              )
          : h(PartFailed, { reads: "the map", reason: atlas.map.reason })
        : h(
            "div",
            null,
            atlas.subsystems.available && atlas.subsystems.items.length > 0
              ? h(ListSummary, { count: atlas.subsystems.items.length, noun: "subsystem page" })
              : null,
            !atlas.subsystems.available || atlas.subsystems.items.length === 0
              ? homeItems(
                  atlas.subsystems,
                  () => null,
                  "No subsystem page yet. The agent writes one when you ask how a part of the code works.",
                  "the subsystem pages",
                )
              : h(
                  ListBox,
                  { label: "The subsystem pages" },
                  h(
                    "ul",
                    { class: "rows" },
                    atlas.subsystems.items.map((subsystem) =>
                      h(
                        "li",
                        { "data-tier": subsystem.tier },
                        h(
                          "div",
                          { class: "row-top" },
                          h(
                            "a",
                            {
                              class: "title",
                              href: pathOf({ page: "subsystem", name: subsystem.name }),
                              "data-item": "",
                            },
                            subsystem.title,
                          ),
                          h("span", { class: "meta" }, subsystem.summary),
                        ),
                      ),
                    ),
                  ),
                ),
            h(SectionHead, {
              title: "Documents",
              count: atlas.documents.available ? atlas.documents.items.length : null,
            }),
            !atlas.documents.available
              ? h(PartFailed, { reads: "the documents index", reason: atlas.documents.reason })
              : atlas.documents.items.length === 0
                ? h(Empty, {
                    title:
                      "No document is indexed yet: the explain start lists the README and the pages under docs/ with the files each covers.",
                  })
                : [
                    h(ListSummary, {
                      count: atlas.documents.items.length,
                      noun: "indexed document",
                      states: tally(atlas.documents.items, (item) => item.tier, [
                        "fresh",
                        "drifting",
                        "stale",
                      ]),
                    }),
                    h(DocumentList, { documents: atlas.documents.items }),
                  ],
          ),
    "the map and the subsystem pages",
  );
}

/** One indexed document's page (J-147 S5). */
function DocumentPageView(props: { readonly path: string }): ComponentChild {
  const reading = useDocument(
    `/api/atlas/documents/${props.path.split("/").map(encodeURIComponent).join("/")}`,
    "document",
  );
  return drawReading(
    reading,
    (page) => h(DocumentPage, { document: page.document, html: page.html }),
    "this document and its index entry",
  );
}

/** Knowledge's pictures (J-166 S1): the figures, the map's and the journeys first; the captures are Interface's, named in one line. */
function VisualsTab(): ComponentChild {
  const reading = useDocument("/api/pictures", "pictures");
  return drawReading(
    reading,
    (list) => {
      if (!list.pictures.available)
        return h(PartFailed, { reads: "the picture home", reason: list.pictures.reason });
      const items = list.pictures.items;
      const figures = items.filter((visual) => visual.form !== "capture");
      const captures = items.filter((visual) => visual.form === "capture");
      const pages = new Set(captures.map((visual) => visual.title)).size;
      const newest = newestOf(figures, (visual) => visual.made);
      return [
        figures.length === 0
          ? h(
              Empty,
              { title: "No figure yet." },
              h(
                "p",
                null,
                "The agent offers a figure when one would explain a change, and makes it under the change on your yes.",
              ),
            )
          : [
              h(ListSummary, {
                count: figures.length,
                noun: "figure",
                states: tally(figures, (visual) => visual.tier, ["fresh", "drifting", "stale"]),
                newest:
                  newest === undefined
                    ? null
                    : { name: h("a", { href: newest.ref.address }, newest.title), at: newest.made },
              }),
              h(
                "div",
                { class: "gallery" },
                figures.map((visual) => h(VisualCard, { visual })),
              ),
            ],
        captures.length === 0
          ? null
          : h(
              "p",
              { class: "meta captures-pointer" },
              `${plural(captures.length, "capture")} of ${plural(pages, "page")} of the app are in `,
              h("a", { href: pathOf({ page: "atlas", tab: "interfaces" }) }, "Interface"),
              ", one card per page.",
            ),
      ];
    },
    "the durable pictures from the picture home",
    "cards",
  );
}

/**
 * Knowledge's Maps tab (J-221 S1): the interactive maps and figures the two
 * skills make, from the pictures document the Pictures tab reads, each live
 * in its frame.
 */
function MapsTab(): ComponentChild {
  const reading = useDocument("/api/pictures", "pictures");
  return drawReading(
    reading,
    (list) =>
      list.pictures.available
        ? h(MapsList, { visuals: list.pictures.items })
        : h(PartFailed, { reads: "the picture home", reason: list.pictures.reason }),
    "the maps and figures from the picture home",
    "cards",
  );
}

/** The installed catalog's entries with their specimens (J-123 S7). */
function CatalogTab(): ComponentChild {
  const reading = useDocument("/api/catalog", "catalog");
  return drawReading(
    reading,
    (page) =>
      page.catalog.available
        ? [
            h(ListSummary, {
              count: page.catalog.items.length,
              noun: "catalog entry",
              nouns: "catalog entries",
            }),
            h(CatalogBrowser, { entries: page.catalog.items }),
          ]
        : h(
            Empty,
            { title: "No interface catalog is installed here." },
            h("p", null, page.catalog.reason),
          ),
    "the installed interface catalog",
  );
}

/** Capture now: a page of the owner's running app at three widths, with its consequence written. */
function CaptureNowPart(props: { readonly url?: string }): ComponentChild {
  const [capturing, setCapturing] = useState<CaptureNowState>({ kind: "idle" });
  return h(CaptureNow, {
    state: capturing,
    url: props.url,
    onCapture: (url) => {
      setCapturing({ kind: "capturing" });
      void postCapture(url).then(
        (answer) => {
          if (answer.captured === null)
            setCapturing({ kind: "limit", message: answer.limit ?? "Nothing was captured." });
          else {
            history.pushState(null, "", capturePath(answer.captured));
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
        },
        (error: Error) => setCapturing({ kind: "limit", message: error.message }),
      );
    },
  });
}

/** Interface's pages (J-166 S1): a card per page, capture now, and the home's tokens and facets. */
function InterfacesTab(): ComponentChild {
  const reading = useDocument("/api/interface", "interface");
  const pictures = useDocument("/api/pictures", "pictures");
  const visuals = useMemo(
    () =>
      new Map<string, VisualView>(
        pictures.state === "ready" && pictures.document.pictures.available
          ? pictures.document.pictures.items.map((visual) => [visual.id, visual])
          : [],
      ),
    [pictures],
  );
  return h(
    "div",
    null,
    drawReading(
      reading,
      (document) => [
        !document.pages.available
          ? h(Callout, { quiet: true }, document.pages.reason)
          : document.pages.items.length === 0
            ? h(
                Empty,
                { title: "No page captured yet." },
                h(
                  "p",
                  null,
                  "Verify captures each address the change touched and keeps it here; capture now does it for a page you name.",
                ),
              )
            : h(PageCardsView, { pages: document.pages.items, visuals }),
        h(
          "section",
          { class: "section" },
          h(SectionHead, { title: "Capture now" }),
          h(
            "p",
            { class: "meta" },
            "Give the address of your running page: it is captured at 1440, 768 and 390 wide, with every element's box, so you can mark it. A capture is added; none is replaced.",
          ),
          h(CaptureNowPart, null),
        ),
        h(InterfacesPanel, { document }),
      ],
      "the interface's pages, captures and notes",
      "cards",
    ),
  );
}

/** The marks a view holds: the document, why it could not be read, and how a write's answer replaces it. */
interface MarksHeld {
  readonly marks: NotesReading | null;
  readonly failed: string | null;
  readonly set: (next: NotesReading) => void;
}

/**
 * The notes as the page holds them: the ones a write answered with, else the
 * ones the page's own document carried, else the interface's, read here.
 */
function useMarks(given?: NotesReading): MarksHeld {
  const reading = useDocument("/api/interface", "interface", given === undefined);
  const [written, setWritten] = useState<NotesReading | null>(null);
  return {
    marks: written ?? given ?? (reading.state === "ready" ? reading.document.notes : null),
    failed: given === undefined && reading.state === "failed" ? reading.message : null,
    set: setWritten,
  };
}

/** Before and after for one answered mark, its two captures read (J-124 S3). */
function BeforeAfterPart(props: { readonly view: MarkView }): ComponentChild {
  const at = (id: string): string =>
    `/api/pictures/${id.split("/").map(encodeURIComponent).join("/")}`;
  const before = useDocument(at(props.view.mark.capture.id), "picture");
  const after = useDocument(at(props.view.after?.capture ?? props.view.mark.capture.id), "picture");
  return h(BeforeAfter, {
    view: props.view,
    before: before.state === "ready" ? before.document.capture : null,
    after: props.view.after !== null && after.state === "ready" ? after.document.capture : null,
  });
}

/** The marks of a change, or every mark, by state, with the owner's close and before and after (J-124 S3). */
function MarksPart(props: {
  readonly change: string | null;
  /** One mark by its id, its own page (J-142 S1). */
  readonly mark?: string | null;
  /** The notes the page's own document carried, so the part reads none of its own (J-154 S2). */
  readonly marks?: NotesReading;
}): ComponentChild {
  const { marks, failed, set } = useMarks(props.marks);
  const [refused, setRefused] = useState<string | null>(null);
  const saved = useContext(SavedContext);
  if (failed !== null) return h(PartFailed, { reads: "your notes", reason: failed });
  // While the marks are read the part says so, as every reading does, rather than drawing nothing.
  if (marks === null) return drawReading({ state: "reading" }, () => null, "your notes");
  const one = props.mark ?? null;
  const shown = marks.notes.filter(
    (view) =>
      (props.change === null || view.change === props.change) &&
      (one === null || view.mark.id === one),
  );
  if (one !== null && shown.length === 0)
    return h(
      "section",
      { class: "section", "data-anchor": "marks" },
      h(
        Empty,
        { title: "No mark by this address in this repository." },
        h("p", null, "Every mark is listed under Your notes."),
      ),
    );
  if (props.change !== null && shown.length === 0) return null;
  const answered = shown.filter(
    (view) =>
      view.after !== null && (view.mark.state === "addressed" || view.mark.proposed !== null),
  );
  return h(
    "section",
    { class: "section", id: "marks", "data-anchor": "marks", "data-component": "MarksSection" },
    h(SectionHead, { title: "Your notes", count: shown.length }),
    one !== null || shown.length === 0
      ? null
      : h(ListSummary, {
          count: shown.length,
          noun: "note",
          states: tally(shown, (view) => view.mark.state, ["open", "addressed", "declined"]),
          newest: (() => {
            const newest = newestOf(shown, (view) => view.mark.at);
            return newest === undefined
              ? null
              : {
                  name: h(RecordLink, {
                    kind: "note",
                    id: newest.mark.id,
                    href: newest.ref.address,
                    named: newest.ref,
                  }),
                  at: newest.mark.at,
                };
          })(),
        }),
    marks.unreadable.map((line) => h(Callout, null, `A marks line does not read: ${line}`)),
    refused === null ? null : h(Callout, null, refused),
    h(MarksList, {
      marks: shown,
      empty:
        "No note yet. Open a capture, click an element or draw on it, and say what is wrong or wanted.",
      onClose: (id, as) => {
        void postClose(id, as, marks.revision).then(
          (next) => {
            set(next);
            setRefused(null);
            saved(`Your note is closed as ${as}.`, true);
          },
          (error: Error) => setRefused(error.message),
        );
      },
    }),
    answered.length === 0
      ? null
      : h(
          "div",
          null,
          h("h3", null, "Before and after"),
          answered.map((view) => h(BeforeAfterPart, { key: view.mark.id, view })),
        ),
  );
}

/** Your notes by state, or one note by its id, at their own address, a tab of Interface (J-142 S1, J-164 S1). */
function MarksPage(props: { readonly mark: string | null; readonly place: Place }): ComponentChild {
  return h(
    PlaceSection,
    { view: "interface", place: props.place, lede: LEDES.interface },
    h(
      "p",
      { class: "meta" },
      "What you marked on a capture, by state, each with your close; an answered note shows its before and after. ",
      h("a", { href: pathOf({ page: "atlas", tab: "interfaces" }) }, "Pages"),
      " holds the captures and capture now.",
    ),
    h(MarksPart, { change: null, mark: props.mark }),
  );
}

/**
 * One capture's page (J-166 S1): a crumb, the address as its title, when
 * and under which change at which commit it was taken, its scores, a
 * newer capture of the address linked or Capture again with what it does,
 * then the capture's work: its views, its stage with the notes as pins,
 * and the note to write.
 */
function CapturePart(props: {
  readonly page: PictureDocument;
  readonly capture: NonNullable<PictureDocument["capture"]>;
}): ComponentChild {
  const capture = props.capture;
  const { marks, set } = useMarks(props.page.notes);
  const [saving, setSaving] = useState<MarkSaving>({ kind: "idle" });
  const saved = useContext(SavedContext);
  const notes = marks ?? props.page.notes;
  const change = capture.change ?? captureChange(capture.id);
  const later = capture.history.filter((entry) => entry.when === "later");
  const newest = later.at(-1);
  const at = new Date();
  return h(
    "section",
    { "data-view": "capture" },
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "atlas", tab: "interfaces" }) }, "Interface"),
      " / Pages / ",
      h("span", { class: "mono" }, capture.address),
    ),
    h("h1", { class: "mono" }, capture.address),
    h(
      "p",
      { class: "change-meta" },
      h(When, { iso: capture.made, at }),
      change === null
        ? h("span", null, "with no change open")
        : h(RecordLink, {
            kind: "change",
            id: change,
            href: pathOf({ page: "change", id: change, part: null }),
          }),
      h("span", { class: "mono", title: capture.commit }, capture.commit.slice(0, 7)),
      capture.tier === "fresh" || capture.commitsSince === null || capture.commitsSince === 0
        ? null
        : h("span", null, `behind the code by ${plural(capture.commitsSince, "commit")}`),
    ),
    h(ScoreChips, capture.scores),
    newest !== undefined
      ? h(
          Callout,
          { quiet: true },
          "A newer capture of this address stands: ",
          h("a", { href: capturePath(newest.id) }, h(When, { iso: newest.made, at })),
          ". Mark that one; this one is history.",
        )
      : capture.tier === "fresh"
        ? null
        : h(
            "div",
            { class: "capture-again", "data-component": "CaptureAgain" },
            h(
              "p",
              { class: "meta" },
              "A file this capture shows changed since it was taken. Capture again takes three new captures of the address from your running page; this one stays.",
            ),
            h(CaptureNowPart, { url: `http://localhost:3000${capture.address}` }),
          ),
    h(CapturePanel, {
      capture,
      marks: notes.notes,
      saving,
      // A mark's link opens its capture at the mark's width, the mark drawn.
      initialWidth: Number(new URLSearchParams(location.search).get("width")) || undefined,
      onMark: (draft) => {
        setSaving({ kind: "saving" });
        void postMark({ capture: capture.id, revision: notes.revision, ...draft }).then(
          (answer) => {
            set(answer.notes);
            setSaving({ kind: "saved", id: answer.mark.id });
            saved("Your note is kept; the agent reads it at its next turn.", true);
          },
          (error: Error) => setSaving({ kind: "refused", message: error.message }),
        );
      },
    }),
  );
}

/**
 * A change's deal, its reroll and its pick, at /changes/<id>/deal (J-123 S7):
 * the address names the three the page shows, the reroll's where its query
 * carries it, so the view line, `greenline view deal` and this page agree,
 * and a pick writes the direction shown (J-144 S7). The reroll is the
 * address's too: the button opens the reroll's address, and the page of a
 * reroll links the first three as its history.
 */
function DealPart(props: { readonly id: string }): ComponentChild {
  const [pickState, setPickState] = useState<PickState>({ kind: "idle" });
  // The ask `greenline deal` printed in the address, so the view deals the three it dealt.
  const ask = dealAskQuery(location.search);
  const reading = useDocument(dealApiPath(props.id, ask, false), "deal");
  const saved = useContext(SavedContext);
  return drawReading(
    reading,
    (deal) =>
      h(DealSection, {
        deal,
        pickState,
        first: namesReroll(ask) ? dealAddress(props.id, ask, false) : null,
        onReroll: () => location.assign(dealAddress(props.id, ask, true)),
        onPick: (direction) => {
          setPickState({ kind: "picking" });
          void postPick(props.id, {
            direction,
            ask,
            seed: deal.seed,
            reroll: deal.reroll,
            revision: deal.revision,
          }).then(
            () => {
              setPickState({ kind: "picked", direction });
              saved(
                `Picked direction ${String(direction)}; the agent reads it at the next turn.`,
                true,
              );
            },
            (error: Error) => setPickState({ kind: "refused", message: error.message }),
          );
        },
      }),
    "the three directions dealt from the catalog",
  );
}

/** A change's interface on its page: the direction card and the check's tiers, shown where the record says it touches an interface. */
function InterfacePart(props: {
  readonly id: string;
  readonly deal: boolean;
  /** The change's interface section from its page's document; none where the change has none. */
  readonly document: InterfaceChecksDocument | null;
}): ComponentChild {
  const { document } = props;
  if (document === null) return null;
  if (!document.touches && document.fact === null && document.pick === null && !props.deal)
    return null;
  return h(
    "div",
    null,
    h(InterfaceSection, {
      document,
      dealPath: pathOf({ page: "change", id: props.id, part: "deal" }),
    }),
    props.deal ? h(DealPart, { id: props.id }) : null,
  );
}

/** One subsystem page. */
function SubsystemView(props: { readonly name: string }): ComponentChild {
  const reading = useDocument(
    `/api/atlas/subsystems/${encodeURIComponent(props.name)}`,
    "subsystem",
  );
  return drawReading(
    reading,
    (page) => h(SubsystemPage, { subsystem: page.subsystem, html: page.html }),
    "this subsystem's page and its journeys",
  );
}

/**
 * One picture's page at its one address (J-154 S3): a capture opens in the
 * capture view with its boxes and its notes; any other picture with its one
 * write, the delete, naming the revision the page read.
 */
function PictureView(props: { readonly id: string }): ComponentChild {
  const reading = useDocument(
    `/api/pictures/${props.id.split("/").map(encodeURIComponent).join("/")}`,
    "picture",
  );
  const saved = useContext(SavedContext);
  const light = useContext(LitPlace);
  const [deletion, setDeletion] = useState<DeleteState>({ kind: "idle" });
  useEffect(() => {
    if (reading.state === "ready") {
      document.title = `${reading.document.picture.title || "A picture"} · greenline`;
      // A capture's page lights Interface, a figure's Knowledge (the design's structure).
      light(reading.document.capture !== null ? "interface" : null);
    }
  }, [reading]);
  return drawReading(
    reading,
    (page) =>
      page.capture !== null
        ? h(CapturePart, { page, capture: page.capture })
        : h(VisualPage, {
            visual: page.picture,
            html: page.html,
            deletion,
            onDelete: (step) => {
              if (step === "ask") setDeletion({ kind: "asking" });
              else if (step === "cancel") setDeletion({ kind: "idle" });
              else
                void deleteVisual(page.picture.id, page.picture.revision).then(
                  () => {
                    const gallery = pathOf({ page: "atlas", tab: "visuals" });
                    history.pushState(null, "", gallery);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                    saved(`Deleted ${page.picture.title}.`, true);
                  },
                  (error: Error) => setDeletion({ kind: "refused", message: error.message }),
                );
            },
          }),
    "this picture and its manifest",
  );
}

/** One knowledge home's page; the decisions book read and edited in place (J-166 S1). */
function HomeView(props: {
  readonly home: string;
  readonly part: string | null;
  readonly anchor: string | null;
  readonly place: Place;
}): ComponentChild {
  const reading = useDocument(`/api/knowledge/${encodeURIComponent(props.home)}`, "home");
  useReveal(props.part, props.anchor, reading.state === "ready");
  if (props.home === "decisions") return h(DecisionsView, { place: props.place, home: reading });
  return drawReading(
    reading,
    (page) => h(HomePage, { home: page.home, part: props.part }),
    "this knowledge home",
  );
}

/** The decisions book in Knowledge (J-166 S1): read, its source, and edited in place. */
function DecisionsView(props: {
  readonly place: Place;
  readonly home: Reading<HomeDocument>;
}): ComponentChild {
  const settings = useDocument("/api/settings", "settings");
  const saved = useContext(SavedContext);
  return h(
    PlaceSection,
    { view: "knowledge", place: props.place, lede: LEDES.knowledge },
    decisionsBook(settings, props.home, saved),
  );
}

/**
 * The decisions book from its two reads (J-237 S1): it reads as reading
 * until the settings and the knowledge home have both landed, so the editor
 * and its root statements are drawn together; a failed read of the home
 * draws the editor with no home.
 * @param settings the settings document's reading
 * @param home the knowledge home's reading
 * @param saved what a save reports to
 * @returns the book, or its reading state
 */
export function decisionsBook(
  settings: Reading<SettingsDocument>,
  home: Reading<HomeDocument>,
  saved: Saved,
): ComponentChild {
  const both: Reading<SettingsDocument> =
    settings.state === "ready" && home.state === "reading" ? { state: "reading" } : settings;
  return drawReading(
    both,
    (document) =>
      h(PolicyEditor, {
        settings: document,
        home: home.state === "ready" ? home.document.home : null,
        saved,
      }),
    "the decisions book",
    "text",
  );
}

/** The house rulings in Knowledge (J-166 S1): read, their source, and edited in place. */
function RulingsView(props: { readonly place: Place }): ComponentChild {
  const settings = useDocument("/api/settings", "settings");
  const saved = useContext(SavedContext);
  return h(
    PlaceSection,
    { view: "knowledge", place: props.place, lede: LEDES.knowledge },
    drawReading(
      settings,
      (document) => h(RulingsEditor, { settings: document, saved }),
      "the house rulings",
      "text",
    ),
  );
}

/** The roster, a tab of Practice: the skills grouped by kind and ranked by loads, or one skill's page (J-166 S1). */
function RosterTab(props: { readonly skill: string | null }): ComponentChild {
  const reading = useDocument("/api/roster", "roster", props.skill === null);
  const skill = useDocument(
    `/api/roster/${encodeURIComponent(props.skill ?? "")}`,
    "skill",
    props.skill !== null,
  );
  if (props.skill !== null)
    return drawReading(
      skill,
      (document) => h(SkillPage, { document, at: new Date() }),
      "this skill and its loads",
    );
  return drawReading(
    reading,
    (roster) => h(RosterView, { roster, at: new Date() }),
    "the roster and its loads",
  );
}

/**
 * Practice (J-164 S1, J-166 S1): its home with the health and two tiles,
 * the roster and a skill's page, the settings as a form, the installed
 * files as a tree, the checks with the hooks and the receipts, each a tab
 * at its own address.
 */
function PracticeView(props: { readonly place: Place }): ComponentChild {
  const place = props.place;
  return h(
    PlaceSection,
    { view: "practice", place, lede: LEDES.practice },
    place.page === "roster"
      ? h(RosterTab, { skill: place.skill ?? null })
      : place.page === "settings"
        ? h(SettingsTab, { tab: place.tab })
        : place.page === "checks"
          ? place.tab === "declared"
            ? h(DeclaredTab, null)
            : h(ReceiptsTab, null)
          : h(PracticeTab, null),
  );
}

/** Practice's home (J-166 S1): the health groups, the roster's tile and the settings' tile. */
function PracticeTab(): ComponentChild {
  const practice = useDocument("/api/practice", "practice");
  const roster = useDocument("/api/roster", "roster");
  const settings = useDocument("/api/settings", "settings");
  return drawReading(
    practice,
    (document) =>
      h(PracticeHome, {
        practice: document,
        roster: roster.state === "ready" ? roster.document : null,
        settings: settings.state === "ready" ? settings.document : null,
        at: new Date(),
      }),
    "the findings greenline status reports",
  );
}

function DeclaredTab(): ComponentChild {
  const reading = useDocument("/api/practice", "practice");
  return drawReading(
    reading,
    (practice) => h(DeclaredChecks, { hooks: practice.hooks }),
    "the declared checks and the hooks",
  );
}

function ReceiptsTab(): ComponentChild {
  const reading = useDocument("/api/practice", "practice");
  return h(
    "div",
    null,
    h(
      "p",
      { class: "meta" },
      "Each request under .greenline/ledger/receipts/ records what garden returned to a consultation. A receipt shows what a request received; it does not prove that a model read, understood or applied it.",
    ),
    drawReading(
      reading,
      (document) => [
        h(ListSummary, { count: document.receipts.length, noun: "request" }),
        h(ReceiptTable, {
          receipts: document.receipts,
          problems: document.problems,
          connector: document.connector,
        }),
      ],
      "the receipts under .greenline/ledger/receipts/",
    ),
  );
}

/** The settings, two tabs of Practice (J-166 S1): the installation as a form, and the installed files as a tree. */
function SettingsTab(props: { readonly tab: SettingsTab }): ComponentChild {
  const reading = useDocument("/api/settings", "settings");
  const roster = useDocument("/api/roster", "roster", props.tab === "installation");
  const practice = useDocument("/api/practice", "practice", props.tab === "installation");
  const saved = useContext(SavedContext);
  const outOfSync =
    practice.state === "ready"
      ? practice.document.health.groups
          .filter((group) => group.code === "GL0110")
          .reduce((sum, group) => sum + group.count, 0)
      : null;
  return h(
    "div",
    { "data-view": "settings" },
    h(
      "p",
      { class: "meta" },
      props.tab === "installation"
        ? "What greenline installs here: saving writes the manifest, and the sync rewrites the installed files from it, a separate act."
        : "What greenline put here, by folder, against Git HEAD: read only.",
    ),
    props.tab === "installation" ? h(PolicyMoved, null) : null,
    drawReading(
      reading,
      (settings) =>
        props.tab === "installation"
          ? h(InstallationForm, {
              settings,
              saved,
              roster: roster.state === "ready" ? roster.document : null,
              outOfSync,
            })
          : h(InstalledFiles, { settings }),
      "the installation",
    ),
  );
}

/** The page a place shows. */
export function PlaceView(props: { readonly place: Place }): ComponentChild {
  const place = props.place;
  switch (place.page) {
    case "now":
      return h(DeskView, null);
    case "changes":
      return h(ChangesView, { tab: "changes", place });
    case "plans":
      return h(ChangesView, { tab: "plans", place });
    case "change":
      return h(ChangeView, {
        key: place.id,
        id: place.id,
        part: place.part,
        anchor: place.anchor ?? null,
        file: place.file ?? null,
        changed: place.changed ?? null,
      });
    case "plan":
      return h(PlanView, {
        key: place.name,
        name: place.name,
        part: place.part,
        anchor: place.anchor ?? null,
      });
    case "discussions":
      return h(ChangesView, { tab: "discussions", place });
    case "discussion":
      return h(DiscussionView, { key: place.id, id: place.id });
    case "atlas":
      return h(AtlasView, { tab: place.tab, place });
    case "subsystem":
      return h(SubsystemView, { key: place.name, name: place.name });
    case "document":
      return h(DocumentPageView, { key: place.path, path: place.path });
    case "picture":
      return h(PictureView, { key: place.id, id: place.id });
    case "marks":
      return h(MarksPage, { mark: null, place });
    case "mark":
      return h(MarksPage, { key: place.id, mark: place.id, place });
    case "home":
      return h(HomeView, {
        key: place.home,
        home: place.home,
        part: place.part,
        anchor: place.anchor ?? null,
        place,
      });
    case "rulings":
      return h(RulingsView, { place });
    case "practice":
    case "roster":
    case "checks":
    case "settings":
      return h(PracticeView, { place });
    case "catalogue":
      return null;
  }
}
