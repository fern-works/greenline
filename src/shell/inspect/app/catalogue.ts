import { h, type ComponentChild, type ComponentChildren } from "preact";
import {
  AtlasEmpty,
  AtlasHistory,
  DocumentList,
  DocumentPage,
  ChangeVisuals,
  DriftRow,
  JourneyList,
  MapBands,
  MapCard,
  MapsList,
  SubsystemPage,
  TierWord,
  VisualCard,
  VisualPage,
  VisualPicture,
} from "./atlas.ts";
import {
  ChangeRow,
  ChecksByCommand,
  CommitList,
  CommitRow,
  GroundFacts,
  LineageStrip,
  RecordFacts,
  RunRow,
  StepStrip,
} from "./change.ts";
import {
  ChangedTree,
  ChangeFirstDraw,
  ChangePage,
  CloseParagraphs,
  DiffBody,
  FileBody,
  FolderFileView,
  OutcomeCard,
  OwedChips,
  SkillChips,
  StepBody,
  StepFold,
  WaitingBanner,
  WhatYouDecided,
} from "./change-page.ts";
import { ChangesList } from "./changes-list.ts";
import { DeclaredChecks, DiagnosticRow, HealthGroups, ReceiptTable } from "./checks.ts";
import {
  CareList,
  ChangeCard,
  ChangedFilesList,
  CloseCard,
  DeskSummary,
  DriftLine,
  FactLine,
  NextLine,
  OpenDiscussions,
  SinceLine,
  WaitingCard,
} from "./desk.ts";
import { CLOSES, DESK_AT, DESK_SINCE, deskSpecimen, NOW_CARDS } from "./desk-fixtures.ts";
import { DiscussionPage, DiscussionRow } from "./discussion.ts";
import { FrameMapView } from "./frame.ts";
import {
  ATLAS_REFRESHES,
  DOCUMENT,
  DOCUMENT_HTML,
  DOCUMENTS,
  EMPTY_STANDING,
  CHANGE_FILE,
  CHANGE_CHECKS,
  CHANGE_PAGE,
  CHANGE_STEPS,
  changeDocumentSpecimen,
  changePartsSpecimen,
  DIFF_COMMIT,
  CHANGE_ROWS,
  DECISIONS_HOME,
  DIAGNOSTICS,
  DISCUSSION,
  DISCUSSION_ROWS,
  DRIFT,
  FRAME_MAP,
  LOADS,
  MAP,
  OWED,
  NAMES,
  PLAN_PAGE,
  PLAN_ROW,
  RECEIPTS,
  RECORDS_HOME,
  ROSTER_DOCUMENT,
  ROSTER_SKILLS,
  ROSTER_USE,
  SKILL_DOCUMENT,
  PRACTICE,
  SETTINGS,
  MAP_VISUALS,
  MARKDOWN_VISUAL,
  SUBSYSTEM,
  SUBSYSTEM_HTML,
  VISUAL_HTML,
  VISUALS,
} from "./fixtures.ts";
import { DecisionRecordView, HomePage, RootStatementCard } from "./home.ts";
import {
  HomeCard,
  homeCards,
  KnowledgeOverview,
  PolicyEditor,
  RulingsEditor,
} from "./knowledge-pages.ts";
import { BoxWire, CaptureFacts, PageCard, PageCards } from "./pages.ts";
import { PlanDocumentCard, PlanPage, PlanRow, TicketCard } from "./plan.ts";
import { PracticeHome, RosterTile, SettingsTile } from "./practice.ts";
import { LoadRow, RosterGroups, RosterRow, RosterTable, RosterView, SkillPage } from "./roster.ts";
import { FileDiff, InstallationForm, InstalledFiles } from "./settings.ts";
import {
  CatalogBrowser,
  CatalogEntryCard,
  DealSection,
  InterfaceSection,
  InterfacesPanel,
  TokenTiles,
} from "./interface.ts";
import {
  CAPTURE,
  CAPTURE_AFTER,
  CAPTURE_PHONE,
  CAPTURE_WIDE,
  CATALOG_ENTRIES,
  DEAL,
  INTERFACE_CHECKS,
  INTERFACE,
  MARKS,
} from "./interface-fixtures.ts";
import {
  BeforeAfter,
  CaptureNow,
  CapturePanel,
  CaptureStage,
  NoCaptureImage,
  MarkRow,
  MarksList,
} from "./marks.ts";
import { FootBar, LiveDot, PlaceLinks, placesShown } from "./bar.ts";
import {
  ArtefactFold,
  Callout,
  CheckBadge,
  ChoiceTiles,
  Delta,
  Empty,
  FileRow,
  FilesLine,
  FilterBar,
  Group,
  JsonView,
  LinesDelta,
  ListBox,
  ListSummary,
  liveWords,
  Meter,
  NamesContext,
  namesOf,
  NotFound,
  ReadState,
  RecordLink,
  ScoreChips,
  SectionHead,
  SourceView,
  Sparkline,
  StateWord,
  StepCells,
  Tag,
  ViewSwitch,
  When,
  type Names,
  type Reading,
} from "./ui.ts";

/*
 * The catalogue: the look first, the house colours in both looks and the
 * type scale, then every component of the library rendered from the
 * fixtures alone, grouped by the artefact kind it draws, each fixture
 * named. It reads nothing from the repository; the render check opens it
 * at three widths and counts every specimen.
 */

/** One component with its fixtures. */
interface Specimen {
  readonly component: string;
  readonly fixtures: readonly { readonly name: string; readonly drawn: ComponentChildren }[];
}

/** One artefact kind with its components. */
interface Kind {
  readonly kind: string;
  readonly specimens: readonly Specimen[];
}

const one = (name: string, drawn: ComponentChildren): Specimen["fixtures"] => [{ name, drawn }];
const list = (drawn: ComponentChildren): ComponentChild => h("ul", { class: "rows" }, drawn);
const unsaved = (): void => undefined;
const [FIRST_PLAN_TICKET] = PLAN_PAGE.tickets;
const [ADR] = RECORDS_HOME.kind === "records" ? RECORDS_HOME.records : [];
const [ROOT] = DECISIONS_HOME.kind === "decisions" ? (DECISIONS_HOME.roots ?? []) : [];
const [FIRST_TARGET, SECOND_TARGET] = CHANGE_CHECKS.checks.targets;
const [FIRST_RUN] = FIRST_TARGET?.runs ?? [];
const [FIRST_SECTION, , SKIPPED_SECTION] = CHANGE_STEPS;
const CHANGE_DOCUMENT = changeDocumentSpecimen();
const CHANGE_PARTS = changePartsSpecimen();
const [REPORT] = CHANGE_PAGE.reports;
const [BRIEF] = CHANGE_PAGE.briefs;
const [PLAN_DOCUMENT] = PLAN_PAGE.documents;
const [DIFF] = SETTINGS.changes.files;
const OPEN_ROW = CHANGE_ROWS[0]?.change;
/** A capture that kept its address, widths and scores but no image file (J-155 S6). */
const IMAGELESS = {
  ...CAPTURE.capture,
  widths: CAPTURE.capture.widths.map((entry) => ({ ...entry, image: null })),
};
const IMAGELESS_SUMMARY = `${CAPTURE.capture.address} at ${CAPTURE.capture.widths.map((entry) => String(entry.width)).join(", ")}: floor 0 red, reflex 0 red, finish 41`;

/**
 * The house colours by their role, in the order of the token table the
 * stylesheet is written from (`HOUSE_COLOURS` in `src/shell/inspect/page.ts`,
 * which a test holds this list to), grouped as the catalogue shows them.
 */
export const COLOUR_ROLES: readonly {
  readonly group: string;
  readonly tokens: readonly { readonly name: string; readonly role: string }[];
}[] = [
  {
    group: "Surfaces",
    tokens: [
      { name: "canvas", role: "the page" },
      { name: "sunk", role: "the bar and wells, a step below the page" },
      { name: "raised", role: "cards and panels" },
      { name: "raised-2", role: "a hovered card, a group head" },
      { name: "raised-3", role: "the strongest surface, a mark's ground, the meter's track" },
      { name: "group", role: "the band a group's head sits on" },
      { name: "wash", role: "a row under the pointer" },
      { name: "wash-2", role: "a selected row, a count's ground" },
    ],
  },
  {
    group: "Lines",
    tokens: [
      { name: "line", role: "hairline borders" },
      { name: "line-2", role: "a stronger border, a hovered control" },
      { name: "line-3", role: "an input's edge in focus" },
    ],
  },
  {
    group: "Inks",
    tokens: [
      { name: "ink", role: "titles and names" },
      { name: "ink-2", role: "body text" },
      { name: "ink-3", role: "secondary text, labels, times" },
      { name: "ink-4", role: "decoration only, never text" },
    ],
  },
  {
    group: "The accent",
    tokens: [
      { name: "accent", role: "the one fill: a primary button, the step now" },
      { name: "accent-ink", role: "links and the step now, as text" },
      { name: "accent-wash", role: "the accent's quiet ground" },
      { name: "on-accent", role: "text on the accent" },
    ],
  },
  {
    group: "States",
    tokens: [
      { name: "need", role: "waiting on you" },
      { name: "need-wash", role: "the waiting card's ground" },
      { name: "pass", role: "done, passed, fresh" },
      { name: "fail", role: "failed, stale" },
      { name: "add", role: "lines added, +n and the added line's sign, edge and wash" },
      { name: "del", role: "lines removed, −n and the removed line's sign, edge and wash" },
      { name: "warn", role: "drifting, warnings" },
      { name: "info", role: "your notes" },
      { name: "idle", role: "stopped, dropped, not run" },
    ],
  },
  {
    group: "Depth",
    tokens: [{ name: "shade", role: "the shadow under what floats, never under a card" }],
  },
];

/**
 * Draw the same part in the light look and in the dark, side by side,
 * whatever look the page is in.
 * @param draw what to draw, once per look
 * @returns both looks
 */
function bothLooks(draw: () => ComponentChildren): ComponentChild {
  return h(
    "div",
    { class: "looks" },
    (["light", "dark"] as const).map((look) =>
      h(
        "div",
        { class: `look-${look}`, "data-look": look },
        h("p", { class: "section-label" }, look === "light" ? "Light" : "Dark"),
        draw(),
      ),
    ),
  );
}

/** The house colours in both looks, each with its name and its role. */
function ColourTokens(): ComponentChild {
  return bothLooks(() =>
    COLOUR_ROLES.map((group) => [
      h("p", { class: "section-label" }, group.group),
      h(
        "ul",
        { class: "token-list" },
        group.tokens.map((token) =>
          h(
            "li",
            { "data-token": token.name },
            h("span", { class: "token-chip", style: `background: var(--${token.name})` }),
            h(
              "span",
              null,
              h("span", { class: "mono" }, token.name),
              " ",
              h("span", { class: "meta" }, token.role),
            ),
          ),
        ),
      ),
    ]),
  );
}

/** Each role of the type scale, drawn as the app draws it, with its size, line, weight and tracking. */
const TYPE_ROLES: readonly {
  readonly role: string;
  readonly spec: string;
  readonly draw: () => ComponentChild;
}[] = [
  {
    role: "The desk's title",
    spec: "24/1.33, 590, -0.018em",
    draw: () => h("p", { class: "desk-title title" }, "Nothing waits on you."),
  },
  {
    role: "A page's title",
    spec: "20/1.33, 590, -0.012em",
    draw: () => h("h1", null, "Dense list"),
  },
  {
    role: "A section's head",
    spec: "14/1.43, 590, -0.011em, ink",
    draw: () => h(SectionHead, { title: "What changed", count: 6 }),
  },
  {
    role: "A group's head and a section's label",
    spec: "12/1.4, 510, ink-2",
    draw: () => h("p", { class: "section-label" }, "src/web/"),
  },
  {
    role: "Names and buttons",
    spec: "13/1.5, 510, -0.01em",
    draw: () =>
      h(
        "p",
        null,
        h("span", { class: "title" }, "T5 List issue"),
        " ",
        h("button", { type: "button" }, "Open"),
      ),
  },
  {
    role: "The interface's text",
    spec: "13/1.5, 400, -0.01em",
    draw: () => h("p", null, "Six files changed in two folders, the tests among them."),
  },
  {
    role: "Reading text",
    spec: "15/1.6, 400, -0.011em",
    draw: () =>
      h(
        "div",
        { class: "prose" },
        h(
          "p",
          null,
          "The list shows every issue in one dense column, newest first, so it reads at a glance.",
        ),
      ),
  },
  {
    role: "Times and facts",
    spec: "12/1.4, 400, tabular figures",
    draw: () => h("p", { class: "meta" }, "closed 15:58, took 33 minutes, 17 commits"),
  },
  {
    role: "Keys and counts",
    spec: "11, 510",
    draw: () =>
      h(
        "p",
        null,
        h("kbd", null, "g"),
        " ",
        h("kbd", null, "c"),
        " Changes",
        h("span", { class: "count" }, "15"),
      ),
  },
  {
    role: "Ids, paths, hashes and commands",
    spec: "12, Geist Mono, 400",
    draw: () => h("p", { class: "mono" }, "src/list.tsx 65f7c58 greenline check"),
  },
];

/** The type scale: every role the app sets text in, and nothing between them. */
function TypeScale(): ComponentChild {
  return h(
    "ul",
    { class: "type-scale" },
    TYPE_ROLES.map((entry) =>
      h(
        "li",
        { "data-role": entry.role },
        entry.draw(),
        h("span", { class: "meta" }, `${entry.role}: ${entry.spec}`),
      ),
    ),
  );
}

/** The fixtures' names, as the server would read them for the records the fixtures name. */
const FIXTURE_NAMES: Reading<Names> = { state: "ready", document: namesOf(NAMES) };

/**
 * Draw a part with the names in a given state.
 * @param names the names
 * @param drawn the part
 * @returns the part under those names
 */
function withNames(names: Reading<Names>, drawn: ComponentChildren): ComponentChild {
  return h(NamesContext.Provider, { value: names }, drawn);
}

/** The one vocabulary of states, in the order the design gives them. */
const STATES = [
  "waiting",
  "in-progress",
  "stopped",
  "done",
  "dropped",
  "proposed",
  "passed",
  "failed",
  "unfinished",
  "not-run",
  "fresh",
  "drifting",
  "stale",
  "open",
  "addressed",
  "declined",
];

/** A fixture drawn in the light look and the dark, side by side. */
const both = (name: string, draw: () => ComponentChildren): Specimen["fixtures"][number] => ({
  name,
  drawn: bothLooks(draw),
});

const unpicked = (): void => undefined;
const READ_AT = new Date("2026-10-28T15:58:00Z");
const ROWS = (): ComponentChild =>
  h(
    "ul",
    { class: "rows" },
    CHANGE_ROWS.slice(0, 2).map((row) => h(ChangeRow, { change: row.change, at: READ_AT })),
  );
const STEP_SOURCE =
  "## review\n\n### Round 1\n\n- **blocking**: the Save button reads as a link.\n";

/**
 * The frame and the system (J-164 S1): the bar's places and its foot bar,
 * the read age, the section system, the group and the fold with its three
 * views, and the lines added and removed, each in both looks.
 */
const FRAME_AND_SYSTEM: readonly Kind[] = [
  {
    kind: "the frame",
    specimens: [
      {
        component: "PlaceLinks",
        fixtures: [
          both("the five places, Desk lit", () =>
            h(PlaceLinks, { places: placesShown(true, "desk"), current: "desk" }),
          ),
          both("four places where the workspace has no app", () =>
            h(PlaceLinks, { places: placesShown(false, "changes"), current: "changes" }),
          ),
        ],
      },
      {
        component: "FootBar",
        fixtures: [
          both("five cells below 768 px, Changes lit", () =>
            h(FootBar, { places: placesShown(true, "changes"), current: "changes", inPlace: true }),
          ),
          both("four cells without an app", () =>
            h(FootBar, {
              places: placesShown(false, "practice"),
              current: "practice",
              inPlace: true,
            }),
          ),
        ],
      },
      {
        component: "LiveDot",
        fixtures: [
          both("live", () =>
            h(LiveDot, { live: liveWords(READ_AT, READ_AT, true), readAt: READ_AT }),
          ),
          both("read 3 min ago", () =>
            h(LiveDot, {
              live: liveWords(READ_AT, new Date(READ_AT.getTime() + 190_000), true),
              readAt: READ_AT,
            }),
          ),
          both("stopped", () =>
            h(LiveDot, { live: liveWords(READ_AT, READ_AT, false), readAt: READ_AT }),
          ),
        ],
      },
    ],
  },
  {
    kind: "the section system",
    specimens: [
      {
        component: "SectionHead",
        fixtures: [
          both("a title, its count and an aside", () =>
            h(SectionHead, { title: "Changes", count: 15, aside: "15 done, newest 2 days ago" }),
          ),
          both("a title alone", () => h(SectionHead, { title: "Drift and discussions" })),
        ],
      },
      {
        component: "ListBox",
        fixtures: [
          both("rows in one box", () => h(ListBox, { label: "Changes" }, ROWS())),
          both("two groups banded in one box", () =>
            h(
              ListBox,
              { label: "Changes" },
              h(
                Group,
                {
                  id: "catalogue-open",
                  title: "In progress",
                  count: 2,
                  tally: [["in-progress", 2]],
                  open: true,
                  flat: false,
                },
                ROWS(),
              ),
              h(
                Group,
                {
                  id: "catalogue-closed",
                  title: "Finished",
                  count: 15,
                  tally: [
                    ["done", 14],
                    ["dropped", 1],
                  ],
                  open: false,
                },
                ROWS(),
              ),
            ),
          ),
        ],
      },
      {
        component: "Group",
        fixtures: [
          both("closed: the worst state's mark, its count, its tally and its quantity", () =>
            h(
              Group,
              {
                id: "catalogue-folder",
                title: h("span", { class: "mono" }, "src/web/"),
                count: 10,
                tally: [
                  ["passed", 9],
                  ["failed", 1],
                ],
                quantity: h(LinesDelta, { added: 329, removed: 68 }),
                open: false,
              },
              ROWS(),
            ),
          ),
          both("open by the rule: three items or fewer", () =>
            h(Group, { id: "catalogue-few", title: "Waiting on you", count: 2, now: true }, ROWS()),
          ),
          both("a group of one, drawn flat", () =>
            h(Group, { id: "catalogue-one", title: "the root", count: 1 }, ROWS()),
          ),
        ],
      },
    ],
  },
  {
    kind: "the fold of one artefact",
    specimens: [
      {
        component: "ArtefactFold",
        fixtures: [
          both("closed: its facts in the head", () =>
            h(ArtefactFold, {
              id: "catalogue-step",
              kind: "catalogue step",
              component: "ArtefactFold",
              head: [h("span", { class: "title" }, "review"), h(StateWord, { word: "written" })],
              open: false,
              address: null,
              closed: null,
              held: {
                read: () => h("p", null, "The reviewers' verdict."),
                source: null,
                json: null,
              },
            }),
          ),
          both("open on Read, with Source and JSON a chip away", () =>
            h(ArtefactFold, {
              id: "catalogue-open-step",
              kind: "catalogue step",
              component: "ArtefactFold",
              head: [h("span", { class: "title" }, "review"), h(StateWord, { word: "written" })],
              open: true,
              address: null,
              closed: null,
              held: {
                read: () =>
                  h(
                    "p",
                    null,
                    "Round 1 held one blocking finding: the Save button reads as a link.",
                  ),
                source: STEP_SOURCE,
                json: {
                  text: JSON.stringify({ heading: "review", rounds: 1 }, null, 2),
                  address: null,
                },
              },
            }),
          ),
        ],
      },
      {
        component: "ViewSwitch",
        fixtures: (["read", "source", "json"] as const).map((view) =>
          both(`${view === "json" ? "JSON" : view === "read" ? "Read" : "Source"} shown`, () =>
            h(ViewSwitch, { views: ["read", "source", "json"], current: view, pick: unpicked }),
          ),
        ),
      },
      {
        component: "SourceView",
        fixtures: [
          both("a step's Markdown, numbered, with Copy", () =>
            h(SourceView, { text: STEP_SOURCE }),
          ),
        ],
      },
      {
        component: "JsonView",
        fixtures: [
          both("a document as JSON with its address", () =>
            h(JsonView, {
              text: JSON.stringify({ kind: "step", section: { heading: "review" } }, null, 2),
              address: "/api/changes/2026-10-24-cache-headers/steps/review",
            }),
          ),
        ],
      },
    ],
  },
  {
    kind: "lines added and removed",
    specimens: [
      {
        component: "Delta",
        fixtures: [
          both("added and removed", () => h(Delta, { added: 148, removed: 57 })),
          both("a binary file", () => h(Delta, { added: null, removed: null })),
        ],
      },
      {
        component: "LinesDelta",
        fixtures: [
          both("with its bar of five blocks", () => h(LinesDelta, { added: 148, removed: 57 })),
          both("added alone", () => h(LinesDelta, { added: 34, removed: 0 })),
        ],
      },
      {
        component: "FilesLine",
        fixtures: [
          both("the files, their lines, their folders and greenline's own", () =>
            h(FilesLine, { files: CHANGE_PARTS.changed.changedFiles }),
          ),
        ],
      },
      {
        component: "FileRow",
        fixtures: [
          both("a file's name, +n, −n and its bar", () =>
            h(FileRow, { path: "src/web/comments.ts", added: 130, removed: 17 }),
          ),
          both("a binary file", () =>
            h(FileRow, { path: "assets/logo.png", added: null, removed: null }),
          ),
        ],
      },
    ],
  },
];

/** Every specimen, by artefact kind, in the catalogue's order. */
export const CATALOGUE: readonly Kind[] = [
  {
    kind: "the look",
    specimens: [
      {
        component: "ColourTokens",
        fixtures: one("every colour in both looks, by its role", h(ColourTokens, null)),
      },
      {
        component: "TypeScale",
        fixtures: one("every role of the type scale", h(TypeScale, null)),
      },
    ],
  },
  ...FRAME_AND_SYSTEM,
  {
    kind: "reference",
    specimens: [
      {
        component: "RecordLink",
        fixtures: [
          {
            name: "a change, a plan, a discussion and a note by their names",
            drawn: h(
              "ul",
              { class: "plain" },
              (
                [
                  ["change", "2026-10-23-login-rate-limit"],
                  ["plan", "007-auth"],
                  ["discussion", "2026-10-21-offline-mode"],
                  ["note", "m3f9a2c1"],
                ] as const
              ).map(([kind, id]) => h("li", null, h(RecordLink, { kind, id, href: "/" }))),
            ),
          },
          {
            name: "a record the repository no longer holds",
            drawn: h(RecordLink, { kind: "change", id: "2026-09-30-gone", href: "/changes" }),
          },
          {
            name: "while the names are read",
            drawn: withNames(
              { state: "reading" },
              h(RecordLink, { kind: "change", id: "2026-10-24-cache-headers", href: "/" }),
            ),
          },
        ],
      },
      {
        component: "NotFound",
        fixtures: [
          {
            name: "an address of an earlier inspector, its words naming a change",
            drawn: h(NotFound, { path: "/atlas/visuals/2026-10-23-login-rate-limit/states" }),
          },
          {
            name: "an address whose words name nothing",
            drawn: h(NotFound, { path: "/nowhere/at/all" }),
          },
        ],
      },
    ],
  },
  {
    kind: "change",
    specimens: [
      {
        component: "ChangeRow",
        fixtures: CHANGE_ROWS.map((row) =>
          both(row.name, () => list(h(ChangeRow, { change: row.change, at: READ_AT }))),
        ),
      },
      {
        component: "ChangesList",
        fixtures: [
          both("newest first, open by state, finished by day", () =>
            h(ChangesList, {
              changes: CHANGE_ROWS.map((row) => row.change),
              filter: "all",
              group: "day",
              at: READ_AT,
              pick: unpicked,
              regroup: unpicked,
            }),
          ),
          both("the finished by plan, filtered to done", () =>
            h(ChangesList, {
              changes: CHANGE_ROWS.map((row) => row.change),
              filter: "done",
              group: "plan",
              at: READ_AT,
              pick: unpicked,
              regroup: unpicked,
            }),
          ),
        ],
      },
      {
        component: "DeskSummary",
        fixtures: [
          {
            name: "a change waits on you",
            drawn: h(DeskSummary, { now: deskSpecimen(DISCUSSION_ROWS, DRIFT), at: DESK_AT }),
          },
          {
            name: "nothing in progress",
            drawn: h(DeskSummary, {
              now: { ...deskSpecimen(DISCUSSION_ROWS, DRIFT), inProgress: [] },
              at: DESK_AT,
            }),
          },
        ],
      },
      {
        component: "ChangeCard",
        fixtures: NOW_CARDS.map((card) =>
          both(card.name, () =>
            h(ChangeCard, { change: card.change, since: DESK_SINCE, at: DESK_AT }),
          ),
        ),
      },
      {
        component: "FactLine",
        fixtures: NOW_CARDS.slice(0, 2).map((card) =>
          both(card.name, () => h(FactLine, { change: card.change, at: DESK_AT })),
        ),
      },
      {
        component: "WaitingCard",
        fixtures: NOW_CARDS.flatMap((card) =>
          card.change.waitingOn === null
            ? []
            : [
                both(`${card.name}, its options as tiles with Copy`, () =>
                  card.change.waitingOn === null
                    ? null
                    : h(WaitingCard, {
                        change: card.change.id,
                        waiting: card.change.waitingOn,
                        at: DESK_AT,
                      }),
                ),
              ],
        ),
      },
      {
        component: "ChoiceTiles",
        fixtures: [
          both("each option copied, nothing written", () =>
            h(ChoiceTiles, {
              question: "how should the Move buttons show?",
              options: ["always shown, quiet", "shown on hover and focus"],
            }),
          ),
          both("one picked, the answer copied", () =>
            h(ChoiceTiles, {
              question: "how should the Move buttons show?",
              options: ["always shown, quiet", "shown on hover and focus"],
              pick: true,
            }),
          ),
        ],
      },
      {
        component: "SinceLine",
        fixtures: [
          both("commits, a change closed and the files since the last look", () =>
            h(SinceLine, {
              since: {
                ...(deskSpecimen(DISCUSSION_ROWS, DRIFT).since ?? {
                  at: DESK_SINCE,
                  commits: 0,
                  changes: [],
                  pictures: 0,
                  changedFiles: CHANGE_PARTS.changed.changedFiles,
                }),
              },
              at: DESK_AT,
            }),
          ),
          both("a first look", () => h(SinceLine, { since: null, at: DESK_AT })),
        ],
      },
      {
        component: "CareList",
        fixtures: [
          both("drift, a failing check, the health and a note", () =>
            h(CareList, { now: deskSpecimen(DISCUSSION_ROWS, DRIFT) }),
          ),
          both("nothing needs care", () =>
            h(CareList, {
              now: {
                ...deskSpecimen(DISCUSSION_ROWS, []),
                closes: [],
                inProgress: [],
                care: [],
                diagnostics: { errors: 0, warnings: 0 },
              },
            }),
          ),
        ],
      },
      {
        component: "ChangedFiles",
        fixtures: NOW_CARDS.flatMap((card) =>
          card.change.changedFiles === null
            ? []
            : [
                {
                  name: card.name,
                  drawn: h(ChangedFilesList, {
                    change: card.change.id,
                    files: card.change.changedFiles,
                    since: DESK_SINCE,
                    at: DESK_AT,
                  }),
                },
              ],
        ),
      },
      {
        component: "NextLine",
        fixtures: NOW_CARDS.flatMap((card) =>
          card.change.waitingOn !== null || card.change.next === null
            ? []
            : [
                {
                  name: card.name,
                  drawn: h(NextLine, {
                    next: card.change.next,
                    stopped: card.change.state === "stopped",
                  }),
                },
              ],
        ),
      },
      {
        component: "CloseCard",
        fixtures: CLOSES.map((close, index) =>
          both(`${close.name}${index === 0 ? ", the newest, open" : ", folded"}`, () =>
            h(CloseCard, { close: close.close, at: DESK_AT, open: index === 0 }),
          ),
        ),
      },
      {
        component: "DriftLine",
        fixtures: [
          {
            name: "pictures drifted",
            drawn: h(DriftLine, { drift: { available: true, items: DRIFT } }),
          },
          {
            name: "nothing drifted",
            drawn: h(DriftLine, { drift: { available: true, items: [] } }),
          },
        ],
      },
      {
        component: "OpenDiscussions",
        fixtures: [
          {
            name: "open by their idea",
            drawn: h(OpenDiscussions, { discussions: { available: true, items: DISCUSSION_ROWS } }),
          },
          {
            name: "none open",
            drawn: h(OpenDiscussions, { discussions: { available: true, items: [] } }),
          },
        ],
      },
      {
        component: "RecordFacts",
        fixtures: one("an open regular change", h(RecordFacts, { card: CHANGE_PAGE.card })),
      },
      {
        component: "GroundFacts",
        fixtures: [
          {
            name: "a change in a worktree of its own, its agent stated",
            drawn: h(GroundFacts, { card: CHANGE_PAGE.card }),
          },
          {
            name: "a change on a branch in place, the owner's discard words held",
            drawn: h(GroundFacts, {
              card: {
                ...CHANGE_PAGE.card,
                ground: { kind: "branch" },
                agent: "codex/gpt-6.1-sol",
                discard: "drop the spike, the owner",
              },
            }),
          },
          {
            name: "a record that states neither",
            drawn: h(GroundFacts, {
              card: { ...CHANGE_PAGE.card, ground: null, agent: null },
            }),
          },
        ],
      },
      {
        component: "LineageStrip",
        fixtures: [
          {
            name: "a change under a plan",
            drawn: h(LineageStrip, {
              hops: [
                { kind: "plan", label: "007-auth", path: "/plans/007-auth", here: false },
                { kind: "change", label: "rate limit", path: null, here: true },
              ],
            }),
          },
          {
            name: "a discussion to its changes, a visual and a subsystem",
            drawn: h(LineageStrip, {
              hops: [
                { kind: "discussion", label: "Offline mode", path: null, here: true },
                {
                  kind: "change",
                  label: "cache headers",
                  path: "/changes/2026-10-24-cache-headers",
                  here: false,
                },
                {
                  kind: "visual",
                  label: "Request flow",
                  path: "/atlas/visuals/2026-10-24-cache-headers/request-flow",
                  here: false,
                },
                { kind: "subsystem", label: "http", path: "/atlas/subsystems/http", here: false },
              ],
            }),
          },
        ],
      },
      {
        component: "ChangePage",
        fixtures: (["overview", "steps", "code", "record"] as const).map((part) =>
          both(`the ${part} tab`, () =>
            h(ChangePage, {
              page: CHANGE_DOCUMENT,
              parts: CHANGE_PARTS,
              part: part === "overview" ? null : part,
              file: null,
              changed: null,
            }),
          ),
        ),
      },
      {
        component: "OutcomeCard",
        fixtures: [
          both("what changed, what was checked, what was decided, what was kept", () =>
            h(OutcomeCard, { page: CHANGE_DOCUMENT, parts: CHANGE_PARTS }),
          ),
        ],
      },
      {
        component: "WaitingBanner",
        fixtures: NOW_CARDS.flatMap((card) =>
          card.change.waitingOn === null
            ? []
            : [
                both("a question with its options as radio tiles", () =>
                  h(WaitingBanner, {
                    page: { ...CHANGE_DOCUMENT, waitingOn: card.change.waitingOn },
                  }),
                ),
              ],
        ),
      },
      {
        component: "WhatYouDecided",
        fixtures: [
          both("your answers, the agent's settlements folded, the restatement", () =>
            h(WhatYouDecided, { change: CHANGE_PAGE.id, document: CHANGE_PARTS.frame }),
          ),
        ],
      },
      {
        component: "CloseParagraphs",
        fixtures: [
          both("the close's labelled paragraphs as rows", () =>
            h(CloseParagraphs, {
              text: "Decisions. The year's header goes to hashed files only. The rest revalidate.\n\nTerms. None settled.\n\nAudit. Every check passed on the final code.",
            }),
          ),
        ],
      },
      {
        component: "SkillChips",
        fixtures: [both("a change's loads by skill", () => h(SkillChips, { loads: LOADS }))],
      },
      {
        component: "OwedChips",
        fixtures: [
          both("the skills a change owes, loaded or owed", () => h(OwedChips, { owed: OWED })),
        ],
      },
      {
        component: "ChangeFirstDraw",
        fixtures: [
          {
            name: "the head from the names, the rest still read",
            drawn: h(ChangeFirstDraw, {
              known: NAMES.entries.find((entry) => entry.kind === "change") ?? null,
            }),
          },
          {
            name: "a change the names do not hold yet",
            drawn: h(ChangeFirstDraw, { known: null }),
          },
        ],
      },
      {
        component: "ChangedTree",
        fixtures: one(
          "the files by folder, each opening its lines",
          h(ChangedTree, {
            change: CHANGE_PAGE.id,
            files: CHANGE_PARTS.changed.changedFiles,
            open: null,
          }),
        ),
      },
      {
        component: "DiffBody",
        fixtures: [
          both("one file's lines in one commit, numbered", () =>
            h(DiffBody, { path: "src/http/cache.ts", commits: [DIFF_COMMIT], unknown: null }),
          ),
          both("the net change across the change", () =>
            h(DiffBody, {
              path: "src/http/cache.ts",
              commits: [DIFF_COMMIT],
              net: {
                from: "0000000000000000000000000000000000000000",
                to: DIFF_COMMIT.hash,
                lines: DIFF_COMMIT.lines,
              },
              unknown: null,
            }),
          ),
        ],
      },
    ],
  },
  {
    kind: "frame map",
    specimens: [
      {
        component: "FrameMap",
        fixtures: [
          {
            name: "a careful frame: nodes open and closed, research off a question",
            drawn: h(FrameMapView, { change: CHANGE_PAGE.id, map: FRAME_MAP }),
          },
        ],
      },
    ],
  },
  {
    kind: "step",
    specimens: [
      {
        component: "StepStrip",
        fixtures:
          OPEN_ROW === undefined
            ? []
            : [
                {
                  name: "rail, on the change page",
                  drawn: h(StepStrip, { strip: OPEN_ROW.strip, form: "rail", change: OPEN_ROW.id }),
                },
                {
                  name: "segments, on a Now card",
                  drawn: h(StepStrip, { strip: OPEN_ROW.strip, form: "segments" }),
                },
                {
                  name: "dots, in a list row, the step now named",
                  drawn: h(StepStrip, { strip: OPEN_ROW.strip, form: "dots" }),
                },
                ...CHANGE_ROWS.filter((row) => row.change.strip.every((step) => !step.current))
                  .slice(0, 1)
                  .map((row) => ({
                    name: "dots, a closed change's, its written steps counted",
                    drawn: h(StepStrip, { strip: row.change.strip, form: "dots" }),
                  })),
              ],
      },
      {
        component: "StepFold",
        fixtures: CHANGE_PAGE.sections.slice(0, 4).map((step) => ({
          name: `${step.heading}, ${step.state}${step.current ? ", now" : ""}`,
          drawn: h(StepFold, { change: CHANGE_PAGE.id, step, open: false, frame: FRAME_MAP }),
        })),
      },
      {
        component: "StepBody",
        fixtures: [FIRST_SECTION, SKIPPED_SECTION].flatMap((section) =>
          section === undefined
            ? []
            : [{ name: `${section.heading}, ${section.state}`, drawn: h(StepBody, { section }) }],
        ),
      },
    ],
  },
  {
    kind: "check fact",
    specimens: [
      {
        component: "RunRow",
        fixtures:
          FIRST_RUN === undefined
            ? []
            : one(
                "the latest run, passed",
                h("ul", { class: "runs" }, h(RunRow, { run: FIRST_RUN })),
              ),
      },
      {
        component: "ChecksByCommand",
        fixtures: [
          both("each command once, its latest run, the runs behind it", () =>
            h(ChecksByCommand, {
              checks: CHANGE_CHECKS.checks,
              sinceCheck: CHANGE_CHECKS.sinceCheck,
            }),
          ),
        ],
      },
      {
        component: "CheckBadge",
        fixtures: [
          both("every check passed", () => h(CheckBadge, { passed: 5, failed: 0, total: 5 })),
          both("one failed", () => h(CheckBadge, { passed: 2, failed: 1, total: 3 })),
        ],
      },
      {
        component: "DeclaredChecks",
        fixtures: one(
          "one check, the git hooks registered",
          h(DeclaredChecks, { hooks: PRACTICE.hooks }),
        ),
      },
    ],
  },
  {
    kind: "commit",
    specimens: [
      {
        component: "CommitRow",
        fixtures: [FIRST_TARGET, SECOND_TARGET].flatMap((target) =>
          target === undefined
            ? []
            : [
                both(
                  target.kind === "commit" ? "a commit with its trailer" : "the working tree",
                  () => list(h(CommitRow, { target })),
                ),
              ],
        ),
      },
      {
        component: "CommitList",
        fixtures: [
          both("the newest first, the record's own folded under its code", () =>
            h(CommitList, { checks: CHANGE_CHECKS.checks }),
          ),
        ],
      },
    ],
  },
  {
    kind: "discussion",
    specimens: [
      {
        component: "DiscussionRow",
        fixtures: DISCUSSION_ROWS.map((discussion) => ({
          name: discussion.state,
          drawn: list(h(DiscussionRow, { discussion })),
        })),
      },
      {
        component: "DiscussionPage",
        fixtures: one(
          "a discussion that promoted a change, its frame map drawn",
          h(DiscussionPage, { discussion: DISCUSSION }),
        ),
      },
    ],
  },
  {
    kind: "visual and manifest",
    specimens: [
      {
        component: "VisualCard",
        fixtures: VISUALS.map((visual) => ({
          name: visual.tier,
          drawn: h(VisualCard, { visual }),
        })),
      },
      {
        component: "TierWord",
        fixtures: one(
          "each tier",
          h(
            "p",
            null,
            h(TierWord, { tier: "fresh" }),
            " ",
            h(TierWord, { tier: "drifting" }),
            " ",
            h(TierWord, { tier: "stale" }),
          ),
        ),
      },
      {
        component: "VisualPicture",
        fixtures: [
          {
            name: "a Markdown page, rendered",
            drawn: h(VisualPicture, { visual: MARKDOWN_VISUAL, html: VISUAL_HTML }),
          },
          {
            name: "a manifest with no picture beside it",
            drawn: h(VisualPicture, { visual: { ...MARKDOWN_VISUAL, file: null }, html: null }),
          },
        ],
      },
      {
        component: "VisualPage",
        fixtures: [
          {
            name: "a stale visual with its delete",
            drawn: h(VisualPage, {
              visual: MARKDOWN_VISUAL,
              html: VISUAL_HTML,
              deletion: { kind: "idle" },
              onDelete: () => undefined,
            }),
          },
          {
            name: "the delete refused as stale",
            drawn: h(VisualPage, {
              visual: MARKDOWN_VISUAL,
              html: VISUAL_HTML,
              deletion: {
                kind: "refused",
                message:
                  "The visual changed since this page read it, so the delete is refused; read it again first.",
              },
              onDelete: () => undefined,
            }),
          },
        ],
      },
      {
        component: "MapCard",
        fixtures: MAP_VISUALS.map((visual) => ({
          name: visual.form,
          drawn: h(MapCard, { visual }),
        })),
      },
      {
        component: "MapsList",
        fixtures: [
          {
            name: "a map and a figure, the map first",
            drawn: h(MapsList, { visuals: [...MAP_VISUALS, ...VISUALS.slice(1)] }),
          },
          { name: "none kept", drawn: h(MapsList, { visuals: [] }) },
        ],
      },
      {
        component: "ChangeVisuals",
        fixtures: one("a change's two visuals", h(ChangeVisuals, { visuals: VISUALS.slice(1) })),
      },
      {
        component: "DriftRow",
        fixtures: DRIFT.map((notice) => ({
          name: notice.kind,
          drawn: list(h(DriftRow, { notice })),
        })),
      },
    ],
  },
  {
    kind: "subsystem page and journey",
    specimens: [
      {
        component: "MapBands",
        fixtures: one("three bands, one subsystem drifting", h(MapBands, { layers: MAP })),
      },
      {
        component: "JourneyList",
        fixtures: one("two journeys", h(JourneyList, { subsystem: SUBSYSTEM })),
      },
      {
        component: "SubsystemPage",
        fixtures: [
          { name: "a drifting subsystem", drawn: h(SubsystemPage, { subsystem: SUBSYSTEM }) },
          {
            name: "with its page in the explain form",
            drawn: h(SubsystemPage, { subsystem: SUBSYSTEM, html: SUBSYSTEM_HTML }),
          },
        ],
      },
      {
        component: "AtlasEmpty",
        fixtures: [
          {
            name: "the first pages not yet offered",
            drawn: h(AtlasEmpty, { standing: EMPTY_STANDING }),
          },
          {
            name: "declined, the offer opened again",
            drawn: h(AtlasEmpty, {
              standing: {
                ...EMPTY_STANDING,
                first: "no",
                reopen: "a new top-level module, billing/, holds code",
              },
            }),
          },
        ],
      },
      {
        component: "DocumentList",
        fixtures: one(
          "the owner's README drifting, a page the practice keeps",
          h(DocumentList, { documents: DOCUMENTS }),
        ),
      },
      {
        component: "DocumentPage",
        fixtures: one(
          "the owner's README",
          h(DocumentPage, { document: DOCUMENT, html: DOCUMENT_HTML }),
        ),
      },
      {
        component: "AtlasHistory",
        fixtures: one(
          "a refresh of the touched pages",
          h(AtlasHistory, { refreshes: ATLAS_REFRESHES }),
        ),
      },
    ],
  },
  {
    kind: "skill load",
    specimens: [
      {
        component: "LoadRow",
        fixtures: LOADS.map((load) => ({
          name: `${load.whole ? "whole" : "part"}, ${load.agent === null ? "the builder" : "a fresh agent"}${load.step === null ? ", before the record" : ""}`,
          drawn: list(h(LoadRow, { load })),
        })),
      },
      {
        component: "RosterRow",
        fixtures: ROSTER_USE.slice(0, 2).flatMap((use) => {
          const skill = ROSTER_SKILLS.find((entry) => entry.name === use.skill);
          return skill === undefined
            ? []
            : [
                both(`${skill.name}, its loads, its cells and its last load`, () =>
                  h(ListBox, null, h(RosterRow, { skill, use, most: 14, at: READ_AT })),
                ),
              ];
        }),
      },
      {
        component: "StepCells",
        fixtures: ROSTER_USE.slice(0, 1).map((use) =>
          both("loads over the line, its own step in the accent", () =>
            h(StepCells, { byStep: use.byStep, own: "frame" }),
          ),
        ),
      },
      {
        component: "Meter",
        fixtures: [
          both("a quantity on the neutral meter", () =>
            h(Meter, { value: 9, most: 14, label: "loads" }),
          ),
        ],
      },
      {
        component: "RosterGroups",
        fixtures: [
          both("by kind, ranked by loads, the never-loaded folded", () =>
            h(RosterGroups, { roster: ROSTER_DOCUMENT, at: READ_AT }),
          ),
        ],
      },
      {
        component: "RosterView",
        fixtures: [
          both("the roster by kind", () => h(RosterView, { roster: ROSTER_DOCUMENT, at: READ_AT })),
          both("the table, the raw view", () =>
            h(RosterView, { roster: ROSTER_DOCUMENT, at: READ_AT, form: "table" }),
          ),
        ],
      },
      {
        component: "SkillPage",
        fixtures: [
          both("a step skill's page", () =>
            h(SkillPage, { document: SKILL_DOCUMENT, at: READ_AT }),
          ),
        ],
      },
      {
        component: "RosterTable",
        fixtures: [
          {
            name: "with the loads recorded",
            drawn: h(RosterTable, { skills: ROSTER_SKILLS, use: ROSTER_USE }),
          },
          {
            name: "with no loads recorded",
            drawn: h(RosterTable, { skills: ROSTER_SKILLS, use: null }),
          },
        ],
      },
    ],
  },
  {
    kind: "diagnostic",
    specimens: [
      {
        component: "DiagnosticRow",
        fixtures: DIAGNOSTICS.map((diagnostic) => ({
          name: diagnostic.severity,
          drawn: list(h(DiagnosticRow, { diagnostic })),
        })),
      },
      {
        component: "HealthGroups",
        fixtures: [
          both("each kind of finding one line, its act and its files folded", () =>
            h(HealthGroups, { groups: PRACTICE.health.groups }),
          ),
        ],
      },
      {
        component: "PracticeHome",
        fixtures: [
          both("the health, the roster's tile and the settings' tile", () =>
            h(PracticeHome, {
              practice: PRACTICE,
              roster: ROSTER_DOCUMENT,
              settings: SETTINGS,
              at: READ_AT,
            }),
          ),
        ],
      },
      {
        component: "RosterTile",
        fixtures: [
          both("kinds loaded and the most loaded", () =>
            h(RosterTile, { roster: ROSTER_DOCUMENT }),
          ),
        ],
      },
      {
        component: "SettingsTile",
        fixtures: [
          both("the harnesses and the policy's last save", () =>
            h(SettingsTile, { settings: SETTINGS, at: READ_AT }),
          ),
        ],
      },
    ],
  },
  {
    kind: "plan and ticket",
    specimens: [
      {
        component: "PlanRow",
        fixtures: one("one done, one ready", list(h(PlanRow, { plan: PLAN_ROW }))),
      },
      {
        component: "TicketCard",
        fixtures:
          FIRST_PLAN_TICKET === undefined
            ? []
            : one("a done ticket", h(TicketCard, { plan: PLAN_PAGE, ticket: FIRST_PLAN_TICKET })),
      },
      {
        component: "PlanDocumentCard",
        fixtures:
          PLAN_DOCUMENT === undefined
            ? []
            : one("a settled spec", h(PlanDocumentCard, { document: PLAN_DOCUMENT, open: true })),
      },
      {
        component: "PlanPage",
        fixtures: one("an approved list", h(PlanPage, { plan: PLAN_PAGE, part: null })),
      },
    ],
  },
  {
    kind: "knowledge home",
    specimens: [
      {
        component: "HomeCard",
        fixtures: homeCards([DECISIONS_HOME, RECORDS_HOME], null, null, SETTINGS)
          .slice(0, 3)
          .map((home) =>
            both(`${home.title}, ${home.present ? "kept" : "not kept"}`, () =>
              h(HomeCard, { home, at: READ_AT }),
            ),
          ),
      },
      {
        component: "KnowledgeOverview",
        fixtures: [
          both("a card per home", () =>
            h(KnowledgeOverview, {
              cards: homeCards([DECISIONS_HOME, RECORDS_HOME], null, null, SETTINGS),
              at: READ_AT,
            }),
          ),
        ],
      },
      {
        component: "RootStatementCard",
        fixtures:
          ROOT === undefined ? [] : one("one root", h(RootStatementCard, { statement: ROOT })),
      },
      {
        component: "DecisionRecordView",
        fixtures:
          ADR === undefined
            ? []
            : one("an accepted record", h(DecisionRecordView, { record: ADR, open: true })),
      },
      {
        component: "HomePage",
        fixtures: [
          { name: "the decisions book", drawn: h(HomePage, { home: DECISIONS_HOME, part: null }) },
          { name: "the decision records", drawn: h(HomePage, { home: RECORDS_HOME, part: null }) },
        ],
      },
    ],
  },
  {
    kind: "settings",
    specimens: [
      {
        component: "PolicyEditor",
        fixtures: (["read", "source", "edit"] as const).map((mode) =>
          both(`the decisions book, ${mode}`, () =>
            h(PolicyEditor, {
              settings: SETTINGS,
              home: DECISIONS_HOME,
              saved: unsaved,
              specimen: true,
              mode,
            }),
          ),
        ),
      },
      {
        component: "RulingsEditor",
        fixtures: [
          both("one ruling, read", () =>
            h(RulingsEditor, { settings: SETTINGS, saved: unsaved, specimen: true }),
          ),
          both("none yet, the sentence that says what is kept here", () =>
            h(RulingsEditor, {
              settings: { ...SETTINGS, houseRulings: { stanza: "", rulings: [] } },
              saved: unsaved,
              specimen: true,
            }),
          ),
        ],
      },
      {
        component: "InstallationForm",
        fixtures: [
          both("one harness, the skills by kind", () =>
            h(InstallationForm, {
              settings: SETTINGS,
              saved: unsaved,
              roster: ROSTER_DOCUMENT,
              outOfSync: null,
              specimen: true,
            }),
          ),
          both("out of step with its installed files", () =>
            h(InstallationForm, {
              settings: SETTINGS,
              saved: unsaved,
              roster: ROSTER_DOCUMENT,
              outOfSync: 51,
              specimen: true,
            }),
          ),
        ],
      },
      {
        component: "InstalledFiles",
        fixtures: [
          both("the installed files by folder", () => h(InstalledFiles, { settings: SETTINGS })),
        ],
      },
      {
        component: "FileDiff",
        fixtures:
          DIFF === undefined
            ? []
            : one("one line added", h(FileDiff, { path: DIFF.path, diff: DIFF.diff })),
      },
    ],
  },
  {
    kind: "receipt",
    specimens: [
      {
        component: "ReceiptTable",
        fixtures: [
          {
            name: "one call received",
            drawn: h(ReceiptTable, { receipts: RECEIPTS, problems: [], connector: true }),
          },
          {
            name: "no connector",
            drawn: h(ReceiptTable, { receipts: [], problems: [], connector: false }),
          },
        ],
      },
    ],
  },
  {
    kind: "catalog entry",
    specimens: [
      {
        component: "CatalogEntryCard",
        fixtures: CATALOG_ENTRIES.map((entry) => ({
          name: `a ${entry.kind}, ${entry.seen === null ? "from a source at its commit" : "from a studied site"}`,
          drawn: h(CatalogEntryCard, { entry }),
        })),
      },
      {
        component: "CatalogBrowser",
        fixtures: one(
          "two entries with the filters",
          h(CatalogBrowser, { entries: CATALOG_ENTRIES }),
        ),
      },
      {
        component: "DealSection",
        fixtures: [
          {
            name: "three directions dealt, the second picked",
            drawn: h(DealSection, {
              deal: DEAL,
              pickState: { kind: "idle" },
              onPick: unsaved,
              onReroll: unsaved,
            }),
          },
          {
            name: "the reroll's three, the first three linked as history",
            drawn: h(DealSection, {
              deal: { ...DEAL, reroll: true, pick: null },
              pickState: { kind: "idle" },
              onPick: unsaved,
              onReroll: unsaved,
              first: `/changes/${DEAL.change}/deal?register=site&seed=7`,
            }),
          },
          {
            name: "no catalog installed",
            drawn: h(DealSection, {
              deal: {
                ...DEAL,
                pick: null,
                directions: {
                  available: false,
                  reason:
                    "The interface catalog is not installed: it is an extra skill, interface-catalog, installed on the owner's request.",
                  items: [],
                },
              },
              pickState: { kind: "idle" },
              onPick: null,
              onReroll: null,
            }),
          },
        ],
      },
    ],
  },
  {
    kind: "path index",
    specimens: [
      {
        component: "PageCard",
        fixtures: INTERFACE.pages.items.map((page) =>
          both(`${page.address}, its newest capture's wireframe and an earlier one folded`, () =>
            h(PageCard, {
              page,
              visuals: new Map(),
              at: READ_AT,
              capture: {
                ...CAPTURE.capture,
                widths: CAPTURE.capture.widths.map((entry) => ({ ...entry, image: null })),
              },
            }),
          ),
        ),
      },
      {
        component: "CaptureLimit",
        fixtures: [
          both("a page whose latest capture met its limit, with why, where and when", () =>
            h(PageCard, {
              page: {
                address: "/plans",
                register: "site",
                capture: null,
                scores: null,
                fidelity: null,
                history: [],
                tier: null,
                limit: {
                  cause: "timeout",
                  origin: "http://127.0.0.1:3000",
                  at: "2026-10-25T12:10:00.000Z",
                  words:
                    "the page did not load in time at http://127.0.0.1:3000/plans (http://127.0.0.1:3000/plans did not load in 30 s: the server sent no answer to the page's request)",
                },
              },
              visuals: new Map(),
              at: READ_AT,
            }),
          ),
        ],
      },
      {
        component: "PageCards",
        fixtures: [
          both("by tier, the newest capture first", () =>
            h(PageCards, {
              pages: INTERFACE.pages.items,
              visuals: new Map(),
              at: READ_AT,
              grouping: "tier",
              regroup: unpicked,
              held: new Map(
                INTERFACE.pages.items.flatMap((page) =>
                  page.capture === null ? [] : [[page.capture.visual, CAPTURE.capture] as const],
                ),
              ),
            }),
          ),
        ],
      },
      {
        component: "BoxWire",
        fixtures: [
          both("the first screen drawn from the boxes", () =>
            h(BoxWire, { width: CAPTURE_PHONE, address: CAPTURE.capture.address }),
          ),
          both("the whole page", () =>
            h(BoxWire, { width: CAPTURE_WIDE, address: CAPTURE.capture.address, whole: true }),
          ),
        ],
      },
      {
        component: "CaptureFacts",
        fixtures: [
          both("no image and no box kept", () =>
            h(CaptureFacts, {
              capture: {
                ...IMAGELESS,
                widths: IMAGELESS.widths.map((entry) => ({ ...entry, elements: [] })),
              },
            }),
          ),
        ],
      },
      {
        component: "ScoreChips",
        fixtures: [
          both("a reflex red, the finish over the captures", () =>
            h(ScoreChips, { floor: 0, reflex: 1, finish: 3, history: [4, 6, 3] }),
          ),
          both("a floor red", () => h(ScoreChips, { floor: 2, reflex: 0, finish: 12 })),
        ],
      },
      {
        component: "Sparkline",
        fixtures: [
          both("the finish over nine captures", () =>
            h(Sparkline, { values: [1, 3, 1, 8, 4, 3, 4, 3, 1], label: "finish" }),
          ),
        ],
      },
      {
        component: "When",
        fixtures: [
          both("a time today, its whole time on hover", () =>
            h(When, { iso: "2026-10-28T15:20:00Z", at: READ_AT }),
          ),
        ],
      },
      {
        component: "TokenTiles",
        fixtures: one("a home of five tokens", h(TokenTiles, { tokens: INTERFACE.tokens })),
      },
      {
        component: "InterfacesPanel",
        fixtures: one(
          "a web app with one address and a drift",
          h(InterfacesPanel, { document: INTERFACE }),
        ),
      },
    ],
  },
  {
    kind: "capture and mark",
    specimens: [
      {
        component: "CapturePanel",
        fixtures: [
          {
            name: "a capture at three widths with its boxes and three marks",
            drawn: h(CapturePanel, {
              capture: CAPTURE.capture,
              marks: MARKS.notes,
              saving: { kind: "idle" },
              onMark: unsaved,
              initialWidth: 390,
            }),
          },
          {
            name: "a capture taken before the boxes, a mark refused",
            drawn: h(CapturePanel, {
              capture: {
                ...CAPTURE.capture,
                tier: "drifting",
                boxes:
                  "This capture was taken before the captures kept their boxes; capture the address again to mark it.",
              },
              marks: [],
              saving: { kind: "refused", message: "The marks changed since this page read them." },
              onMark: null,
            }),
          },
          both("a capture that kept no image, drawn from its boxes", () =>
            h(CapturePanel, {
              capture: IMAGELESS,
              marks: MARKS.notes,
              saving: { kind: "idle" },
              onMark: unsaved,
            }),
          ),
        ],
      },
      {
        component: "NoCaptureImage",
        fixtures: [
          {
            name: "the address, its widths and its scores",
            drawn: h(NoCaptureImage, { capture: IMAGELESS, summary: IMAGELESS_SUMMARY }),
          },
          {
            name: "with no scores given",
            drawn: h(NoCaptureImage, { capture: IMAGELESS, summary: null }),
          },
        ],
      },
      {
        component: "CaptureStage",
        fixtures: [
          {
            name: "the picker with the button picked",
            drawn: h(CaptureStage, {
              width: CAPTURE_PHONE,
              mode: "pick",
              selected: CAPTURE_PHONE.elements[2] ?? null,
              stroke: [],
              marks: [],
              onPick: unsaved,
              onStroke: unsaved,
            }),
          },
          {
            name: "the pencil round the heading",
            drawn: h(CaptureStage, {
              width: CAPTURE_WIDE,
              mode: "pencil",
              selected: null,
              stroke: [
                [16, 16],
                [600, 16],
                [600, 120],
                [16, 120],
                [16, 16],
              ],
              marks: MARKS.notes.map((view) => view.mark).filter((mark) => mark.width === 1440),
              onPick: unsaved,
              onStroke: unsaved,
            }),
          },
        ],
      },
      {
        component: "MarkRow",
        fixtures: MARKS.notes.map((view) => ({
          name: `${view.mark.state}, ${view.mark.intent}`,
          drawn: list(h(MarkRow, { view, onClose: unsaved })),
        })),
      },
      {
        component: "MarksList",
        fixtures: [
          {
            name: "three marks by state",
            drawn: h(MarksList, { marks: MARKS.notes, onClose: unsaved, empty: "No mark yet." }),
          },
          {
            name: "no mark",
            drawn: h(MarksList, { marks: [], onClose: null, empty: "No mark yet." }),
          },
        ],
      },
      {
        component: "BeforeAfter",
        fixtures: MARKS.notes.slice(0, 1).map((view) => ({
          name: "the button moved above the fold at 390",
          drawn: h(BeforeAfter, {
            view,
            before: CAPTURE.capture,
            after: CAPTURE_AFTER.capture,
          }),
        })),
      },
      {
        component: "CaptureNow",
        fixtures: [
          { name: "ready", drawn: h(CaptureNow, { state: { kind: "idle" }, onCapture: unsaved }) },
          {
            name: "no browser on the machine",
            drawn: h(CaptureNow, {
              state: {
                kind: "limit",
                message:
                  "no browser found: no GREENLINE_CHROME, no Playwright Chromium and no Chrome, Chromium, Edge or Brave in the usual places",
              },
              onCapture: unsaved,
            }),
          },
        ],
      },
    ],
  },
  {
    kind: "design section and tiered check fact",
    specimens: [
      {
        component: "InterfaceSection",
        fixtures: [
          {
            name: "a floor red, a reflex waived, a pick waiting",
            drawn: h(InterfaceSection, {
              document: INTERFACE_CHECKS,
              dealPath: "/changes/2026-10-25-pricing-table/deal",
            }),
          },
          {
            name: "no check run yet",
            drawn: h(InterfaceSection, {
              document: { ...INTERFACE_CHECKS, fact: null, pick: null, design: null },
              dealPath: "/changes/2026-10-25-pricing-table/deal",
            }),
          },
        ],
      },
    ],
  },
  {
    kind: "shared",
    specimens: [
      {
        component: "StateWord",
        fixtures: one(
          "every state of the one vocabulary, in both looks",
          bothLooks(() =>
            h(
              "p",
              null,
              STATES.map((word) => [h(StateWord, { word }), " "]),
            ),
          ),
        ),
      },
      { component: "Tag", fixtures: one("a skill", h(Tag, null, "diagram-design")) },
      {
        component: "Button",
        fixtures: one(
          "every form, in both looks: at rest, the one primary, quiet, small, pressed and unavailable",
          bothLooks(() =>
            h(
              "p",
              { class: "actions" },
              h("button", { type: "button" }, "Reload"),
              h("button", { type: "button", class: "primary" }, "Pick this direction"),
              h("button", { type: "button", class: "ghost" }, "Discard the draft"),
              h("button", { type: "button", class: "small" }, "Copy"),
              h("button", { type: "button", "aria-pressed": "true" }, "Dark"),
              h("button", { type: "button", disabled: true }, "Saving"),
            ),
          ),
        ),
      },
      {
        component: "FilterBar",
        fixtures: [
          {
            name: "the changes' states, one pressed, a state none stands in reading 0",
            drawn: h(FilterBar<string>, {
              label: "Show changes by state",
              chips: [
                { key: "all", label: "All", count: 6 },
                { key: "waiting", label: "Waiting on you", count: 1 },
                { key: "in-progress", label: "In progress", count: 2 },
                { key: "proposed", label: "Proposed", count: 0 },
                { key: "done", label: "Done", count: 3 },
              ],
              current: "in-progress",
              pick: unsaved,
            }),
          },
        ],
      },
      {
        component: "Kbd",
        fixtures: one(
          "a key, a chord and a count",
          h(
            "p",
            null,
            h("kbd", null, "/"),
            " search, ",
            h("kbd", null, "g"),
            " ",
            h("kbd", null, "c"),
            " Changes",
            h("span", { class: "count" }, "15"),
          ),
        ),
      },
      {
        component: "Callout",
        fixtures: [
          { name: "attention", drawn: h(Callout, null, "The ledger cannot be read.") },
          {
            name: "quiet",
            drawn: h(Callout, { quiet: true }, "The atlas holds no subsystem page yet."),
          },
        ],
      },
      {
        component: "Empty",
        fixtures: one("no change yet", h(Empty, { title: "No change recorded yet." })),
      },
      {
        component: "ReadState",
        fixtures: [
          {
            name: "loading, saying what it reads",
            drawn: h(ReadState, { face: "loading", reads: "the changes from the ledger" }),
          },
          {
            name: "loading a section of cards, its skeleton of cards",
            drawn: h(ReadState, { face: "loading", reads: "the durable pictures", form: "cards" }),
          },
          {
            name: "loading a section of prose, its skeleton of lines",
            drawn: h(ReadState, { face: "loading", reads: "this step's words", form: "text" }),
          },
          {
            name: "empty, saying what would appear and why none does",
            drawn: h(
              ReadState,
              { face: "empty", title: "No discussion yet." },
              h(
                "p",
                null,
                "An idea you explore with the agent before it becomes work is kept here.",
              ),
            ),
          },
          {
            name: "failed, naming what failed, why, and what to do",
            drawn: h(ReadState, {
              face: "failed",
              reads: "the visual home",
              message: "visuals/map/manifest.json does not parse: an unexpected token at line 4.",
            }),
          },
        ],
      },
      {
        component: "ListSummary",
        fixtures: [
          {
            name: "the changes: the count, the states and the newest",
            drawn: h(ListSummary, {
              count: 4,
              noun: "change",
              states: [
                ["open", 1],
                ["stopped", 1],
                ["done", 1],
                ["dropped", 1],
              ],
              newest: {
                name: h(RecordLink, {
                  kind: "change",
                  id: "2026-10-24-cache-headers",
                  href: "/changes/2026-10-24-cache-headers",
                }),
                at: "2026-10-24",
              },
            }),
          },
          {
            name: "the roster: its loads and the never-loaded count",
            drawn: h(ListSummary, {
              count: 45,
              noun: "skill",
              more: "312 loads across the changes, 9 never loaded",
            }),
          },
        ],
      },
      {
        component: "FolderFileView",
        fixtures: [REPORT, BRIEF].flatMap((file) =>
          file === undefined
            ? []
            : [
                {
                  name: file.file,
                  drawn: h(FolderFileView, { change: CHANGE_PAGE.id, file, open: false }),
                },
              ],
        ),
      },
      {
        component: "FileBody",
        fixtures: one("a report, its Markdown rendered", h(FileBody, { file: CHANGE_FILE })),
      },
    ],
  },
];

const slug = (text: string): string => `kind-${text.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

/**
 * The catalogue's page: every component rendered from its fixtures, by
 * artefact kind, every reference named from the fixtures' names and never
 * from this repository's.
 */
export function CatalogueView(): ComponentChild {
  return withNames(FIXTURE_NAMES, catalogueSection());
}

function catalogueSection(): ComponentChild {
  return h(
    "section",
    { "data-view": "catalogue" },
    h(
      "header",
      { class: "view-head" },
      h("h1", null, "Catalogue"),
      h(
        "p",
        { class: "lede" },
        "The look every component shares, its colours in both looks and its type, then every component of the inspector, rendered from fixtures, by the artefact kind it draws. It reads nothing from this repository.",
      ),
    ),
    h(
      "div",
      { class: "catalogue" },
      h(
        "nav",
        { "aria-label": "Components by artefact kind" },
        CATALOGUE.map((entry) => h("a", { href: `#${slug(entry.kind)}` }, entry.kind)),
      ),
      h(
        "div",
        null,
        CATALOGUE.map((entry) =>
          h(
            "section",
            { id: slug(entry.kind), "data-kind": entry.kind },
            h("h2", null, entry.kind),
            entry.specimens.map((specimen) =>
              h(
                "section",
                { class: "specimen", "data-specimen": specimen.component },
                h(
                  "div",
                  { class: "specimen-head" },
                  h("h2", null, specimen.component),
                  h(
                    "span",
                    { class: "meta" },
                    `${entry.kind} · ${specimen.fixtures.length} fixture${specimen.fixtures.length === 1 ? "" : "s"}`,
                  ),
                ),
                specimen.fixtures.map((fixture) =>
                  h(
                    "div",
                    { class: "fixture", "data-fixture": fixture.name },
                    h("span", { class: "meta" }, fixture.name),
                    fixture.drawn,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
