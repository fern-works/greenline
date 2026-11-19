import { h, type ComponentChild, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type {
  AtlasDocument,
  HomeSummary,
  KnowledgeHome,
  PicturesDocument,
  SettingsDocument,
} from "../../../core/inspector/documents.ts";
import { renderMarkdown } from "../markdown.ts";
import { listedOnMaps, pathOf } from "./addresses.ts";
import { RootStatementCard } from "./home.ts";
import { save, useDraft, type Saved } from "./settings.ts";
import {
  Delta,
  Group,
  lookupName,
  NamesContext,
  plural,
  Prose,
  SectionHead,
  SourceView,
  StateWord,
  When,
  type Names,
  type Reading,
} from "./ui.ts";

/*
 * Knowledge's own pages (J-166 S1): the overview, a card per home with the
 * question it answers, what it holds and when it was last written, an
 * absent home quiet with what makes it; and the decisions book and the
 * house rulings read and edited in place, rendered first with change ids
 * named, their raw text as Source, and Edit with a preview, the line that
 * says what saving does above Save, the draft's lines against the file in
 * their tones, and the file's last save through this page.
 */

/** Each home's question, the one line its card answers. */
const QUESTIONS = new Map<string, string>(
  Object.entries({
    decisions: "What did we decide, and why?",
    rulings: "Which rulings hold in this repository?",
    adr: "Which choices were reasoned at length?",
    glossary: "What do our words mean?",
    work: "How does the work run here?",
    atlas: "How does the code fit together?",
    figures: "What has been drawn to explain it?",
    maps: "Which interactive maps and figures can I explore?",
  }),
);

/** How each home comes to be, for a home the repository does not keep yet. */
const MADE_BY = new Map<string, string>(
  Object.entries({
    work: "greenline init and greenline sync install it.",
    decisions: "It is written when the first lasting choice is settled.",
    adr: "The close seeds it on first use, where the repository keeps no decisions of its own.",
    glossary: "The close writes it when the first term is settled.",
    rulings: "A ruling you give the agent for this repository is kept here.",
    atlas:
      'Ask the agent "how does this code fit together?" and it offers to draw the map, about ten minutes of a fresh agent\'s work.',
    figures: "The agent offers a figure when one would explain a change, and makes it on your yes.",
    maps: 'Ask the agent "map the architecture of this code" for the architecture map, or for a figure of a mechanism, and a fresh agent makes it.',
  }),
);

/** One home on the overview: its name, its question, what it holds and when it was last written. */
export interface HomeCardView {
  readonly key: string;
  readonly title: string;
  readonly address: string;
  readonly present: boolean;
  readonly holds: string | null;
  readonly written: string | null;
}

/** One home as a card (J-166 S1): kept, with its question, count and last write; absent, quiet with what makes it. */
export function HomeCard(props: {
  readonly home: HomeCardView;
  readonly at: Date;
}): ComponentChild {
  const { home, at } = props;
  return h(
    "article",
    {
      class: "home-card",
      "data-component": "HomeCard",
      "data-home": home.key,
      "data-present": home.present ? "yes" : "no",
    },
    home.present
      ? h("a", { class: "title", href: home.address, "data-item": "" }, home.title)
      : h("span", { class: "title" }, home.title),
    h("p", { class: "home-question" }, QUESTIONS.get(home.key) ?? ""),
    home.present
      ? h(
          "p",
          { class: "meta" },
          home.holds ?? "Kept here",
          home.written === null ? null : [" · written ", h(When, { iso: home.written, at })],
        )
      : h("p", { class: "meta" }, `None yet. ${MADE_BY.get(home.key) ?? ""}`),
  );
}

/**
 * The homes as the overview draws them: the decisions book, the house
 * rulings, the decision records, the glossary, the work guide, the atlas,
 * the figures and the maps (J-221 S1), each from the document that holds it.
 * @returns the cards, in the order the owner asks them
 */
export function homeCards(
  homes: readonly HomeSummary[],
  atlas: AtlasDocument | null,
  pictures: PicturesDocument | null,
  settings: SettingsDocument | null,
): readonly HomeCardView[] {
  const home = (id: string): HomeCardView | null => {
    const found = homes.find((entry) => entry.id === id);
    return found === undefined
      ? null
      : {
          key: found.id,
          title: found.title,
          address: pathOf({ page: "home", home: found.id, part: null }),
          present: found.present,
          holds: found.holds,
          written: found.written,
        };
  };
  const rulings = settings?.houseRulings.rulings.length ?? 0;
  const subsystems = atlas?.subsystems.available === true ? atlas.subsystems.items.length : 0;
  const kept = pictures?.pictures.available === true ? pictures.pictures.items : [];
  const figures = kept.filter((visual) => visual.form !== "capture").length;
  const maps = kept.filter((visual) => visual.form === "map").length;
  const anatomy = kept.filter(
    (visual) => listedOnMaps(visual.form) && visual.form !== "map",
  ).length;
  const companions = [
    maps === 0 ? null : plural(maps, "map"),
    anatomy === 0 ? null : plural(anatomy, "figure"),
  ].filter((part): part is string => part !== null);
  return [
    home("decisions"),
    {
      key: "rulings",
      title: "House rulings",
      address: pathOf({ page: "rulings" }),
      present: rulings > 0,
      holds: rulings === 0 ? null : plural(rulings, "ruling"),
      written: null,
    },
    home("adr"),
    home("glossary"),
    home("work"),
    {
      key: "atlas",
      title: "Atlas",
      address: pathOf({ page: "atlas", tab: "map" }),
      present: (atlas?.standing.pages ?? 0) > 0,
      holds: subsystems === 0 ? null : plural(subsystems, "subsystem page"),
      written: null,
    },
    {
      key: "figures",
      title: "Figures",
      address: pathOf({ page: "atlas", tab: "visuals" }),
      present: figures > 0,
      holds: figures === 0 ? null : plural(figures, "figure"),
      written: null,
    },
    {
      key: "maps",
      title: "Maps",
      address: pathOf({ page: "atlas", tab: "maps" }),
      present: companions.length > 0,
      holds: companions.length === 0 ? null : companions.join(", "),
      written: null,
    },
  ].filter((card): card is HomeCardView => card !== null);
}

/** Knowledge's overview (J-166 S1): a card per home, the kept ones first in the owner's order. */
export function KnowledgeOverview(props: {
  readonly cards: readonly HomeCardView[];
  readonly at: Date;
}): ComponentChild {
  const kept = props.cards.filter((card) => card.present).length;
  return h(
    "section",
    { "data-component": "KnowledgeOverview", "aria-label": "The homes" },
    h(
      "p",
      { class: "summary" },
      h(
        "span",
        { class: "title" },
        `${String(kept)} of ${plural(props.cards.length, "home")} kept`,
      ),
      h("span", { class: "meta" }, "what has been settled here, and in which words"),
    ),
    h(
      "div",
      { class: "home-cards" },
      props.cards.map((home) => h(HomeCard, { home, at: props.at })),
    ),
  );
}

/** A change's id standing whole in a page's text. */
const CHANGE_ID = /(?<![\w/.-])(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)(?![\w/-]|\.[\w/])/g;

/**
 * Rendered text with each change it quotes by id named and linked, where
 * the names hold it; an id inside a link, code or a tag stays as written.
 * @param html the rendered text, every byte escaped by the house renderer
 * @param names the names
 * @returns the text
 */
export function namedHtml(html: string, names: Names): string {
  let quiet = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<(a|code|pre)\b/i.test(part)) quiet += 1;
        else if (/^<\/(a|code|pre)>/i.test(part)) quiet = Math.max(0, quiet - 1);
        return part;
      }
      if (quiet > 0) return part;
      return part.replace(CHANGE_ID, (id: string) => {
        const entry = lookupName(names, "change", id);
        // The name is the house renderer's escaped words' kind: letters, digits and spaces.
        return entry === undefined
          ? id
          : `<a href="${entry.address}" title="${id}">${entry.name.replace(/[<>&"']/g, "")}</a>`;
      });
    })
    .join("");
}

/** Rendered text with the changes it quotes named, as the names are read. */
function NamedProse(props: { readonly html: string }): ComponentChild {
  return h(NamesContext.Consumer, null, (names: Reading<Names> | undefined) =>
    h(Prose, {
      html: names?.state === "ready" ? namedHtml(props.html, names.document) : props.html,
    }),
  );
}

/** One line of a draft against the file: kept, added or removed. */
interface DraftLine {
  readonly kind: "same" | "add" | "del";
  readonly line: string;
}

/**
 * A draft's lines against the file's, as the longest run they share leaves
 * them: what the draft adds and what it removes.
 * @param before the file's text
 * @param after the draft
 * @returns the lines
 */
export function draftLines(before: string, after: string): readonly DraftLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 1_000_000)
    return [
      ...a.map((line) => ({ kind: "del" as const, line })),
      ...b.map((line) => ({ kind: "add" as const, line })),
    ];
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      table[i * cols + j] =
        a[i] === b[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
  const out: DraftLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length)
    if (a[i] === b[j]) {
      out.push({ kind: "same", line: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0)) {
      out.push({ kind: "del", line: a[i] ?? "" });
      i += 1;
    } else {
      out.push({ kind: "add", line: b[j] ?? "" });
      j += 1;
    }
  for (; i < a.length; i += 1) out.push({ kind: "del", line: a[i] ?? "" });
  for (; j < b.length; j += 1) out.push({ kind: "add", line: b[j] ?? "" });
  return out;
}

/** The ways a policy file is shown: rendered, its raw text, or its editor. */
export type PolicyMode = "read" | "source" | "edit";

/** What a policy file's page needs: its file, its two readings and its save. */
export interface PolicyProps {
  readonly component: string;
  readonly title: string;
  /** The file it is kept in, as the consequence line names it. */
  readonly path: string;
  /** Its text as the file holds it. */
  readonly text: string;
  /** Its rendered reading. */
  readonly read: () => ComponentChildren;
  readonly label: string;
  readonly address: string;
  readonly revision: string;
  readonly button: string;
  readonly saved: Saved;
  readonly settings: SettingsDocument;
  /** A specimen in the catalogue: it shows the editor and saves nothing. */
  readonly specimen?: boolean | undefined;
  /** The mode it opens in, Read where none is named. */
  readonly mode?: PolicyMode | undefined;
}

/** The time the file was last saved through this page, from the saves the settings record. */
function lastSaved(settings: SettingsDocument, path: string): string | null {
  const own = settings.policyChanges.filter((change) => change.path === path);
  return own.reduce<string | null>(
    (latest, change) => (latest === null || change.at > latest ? change.at : latest),
    null,
  );
}

/** The PolicyDoc drawn with what it holds: its first paint without a browser, its state in one. */
function PolicyDoc(props: PolicyProps): ComponentChild {
  return h(PolicyDocHeld, props);
}

/**
 * A policy file read and edited in place (J-166 S1): Read rendered by
 * default, Source its raw text with line numbers, and Edit its text beside
 * its preview, the consequence of saving above Save, the draft's lines
 * against the file in their tones, the file's last save through this page,
 * and a stale draft kept with the way to discard it.
 */
function PolicyDocHeld(props: PolicyProps): ComponentChild {
  const [mode, setMode] = useState<PolicyMode>(props.mode ?? "read");
  const draft = useDraft(props.text, props.revision, props.settings);
  const [busy, setBusy] = useState(false);
  return policyDoc(props, mode, setMode, draft, busy, setBusy);
}

PolicyDocHeld.firstPaint = (props: PolicyProps): ComponentChildren =>
  policyDoc(
    props,
    props.mode ?? "read",
    () => undefined,
    {
      draft: props.text,
      edit: () => undefined,
      base: props.revision,
      discard: () => undefined,
      saved: () => undefined,
    },
    false,
    () => undefined,
  );

function policyDoc(
  props: PolicyProps,
  mode: PolicyMode,
  setMode: (mode: PolicyMode) => void,
  draft: ReturnType<typeof useDraft<string>>,
  busy: boolean,
  setBusy: (busy: boolean) => void,
): ComponentChild {
  const saved = lastSaved(props.settings, props.path);
  const lines = mode === "edit" ? draftLines(props.text, draft.draft) : [];
  const added = lines.filter((line) => line.kind === "add").length;
  const removed = lines.filter((line) => line.kind === "del").length;
  const stale = draft.base !== props.revision;
  const chip = (key: PolicyMode, label: string): ComponentChild =>
    h(
      "button",
      {
        type: "button",
        class: "chip",
        "data-view": key,
        "aria-pressed": String(mode === key),
        onClick: () => setMode(key),
      },
      label,
    );
  return h(
    "section",
    { class: "policy-doc", "data-component": props.component, "data-mode": mode },
    h(
      "div",
      { class: "policy-head" },
      h(SectionHead, {
        title: props.title,
        aside: [
          h("span", { class: "mono" }, props.path),
          " · ",
          saved === null
            ? "never saved through this page"
            : ["last saved ", h(When, { iso: saved, at: new Date() })],
        ],
      }),
      h(
        "div",
        { class: "fold-views", role: "group", "aria-label": "The view" },
        chip("read", "Read"),
        chip("source", "Source"),
        chip("edit", "Edit"),
      ),
    ),
    mode === "read"
      ? h("div", { class: "policy-read" }, props.read())
      : mode === "source"
        ? props.text === ""
          ? h("p", { class: "meta" }, "The file holds no text yet.")
          : h(SourceView, { text: props.text })
        : h(
            "div",
            { class: "policy-edit" },
            h(
              "div",
              { class: "policy-panes" },
              h("textarea", {
                "aria-label": props.label,
                value: draft.draft,
                onInput: (event: Event) => {
                  if (event.currentTarget instanceof HTMLTextAreaElement)
                    draft.edit(event.currentTarget.value);
                },
              }),
              h(
                "div",
                { class: "policy-preview", "aria-label": "The preview" },
                h(Prose, { html: renderMarkdown(draft.draft, () => ({ kind: "text" })) }),
              ),
            ),
            added + removed === 0
              ? null
              : h(
                  Group,
                  {
                    id: `draft:${props.path}`,
                    title: "What changes",
                    count: added + removed,
                    quantity: h(Delta, { added, removed }),
                    open: false,
                    flat: false,
                  },
                  h(
                    "pre",
                    { class: "diff-lines" },
                    lines
                      .filter((line) => line.kind !== "same")
                      .map((line) =>
                        h(
                          "span",
                          { class: `diff-line ${line.kind}` },
                          h("span", { class: "sign" }, line.kind === "add" ? "+ " : "− "),
                          line.line,
                          "\n",
                        ),
                      ),
                  ),
                ),
            h(
              "p",
              { class: "consequence" },
              `Saving writes ${props.path}; the agent reads it at its next turn. Installation sync is a separate action.`,
            ),
            h(
              "div",
              { class: "actions" },
              h(
                "button",
                {
                  class: "primary",
                  type: "button",
                  disabled: busy || props.specimen === true,
                  title: props.specimen === true ? "A specimen: it saves nothing" : undefined,
                  onClick: () => {
                    setBusy(true);
                    void save(
                      props.address,
                      { expectedRevision: draft.base, body: draft.draft },
                      props.saved,
                      `Saved ${props.path}. Installation sync is a separate action.`,
                    )
                      .then((wrote) => {
                        if (wrote) draft.saved(draft.draft);
                      })
                      .finally(() => setBusy(false));
                  },
                },
                props.button,
              ),
              h(
                "button",
                {
                  type: "button",
                  class: "ghost",
                  onClick: () => {
                    draft.discard();
                    setMode("read");
                  },
                },
                "Cancel",
              ),
              h(
                "span",
                { class: "meta", title: `revision ${draft.base}` },
                `read ${props.settings.read.at.slice(11, 16)}`,
              ),
              stale
                ? [
                    h(
                      "span",
                      { class: "meta" },
                      "The file changed since this draft began, so its save is refused; your draft is kept.",
                    ),
                    h("button", { type: "button", onClick: draft.discard }, "Discard the draft"),
                  ]
                : null,
            ),
          ),
  );
}

/** The decisions book, read and edited in Knowledge (J-166 S1): its root statements counted, its text rendered with change ids named. */
export function PolicyEditor(props: {
  readonly settings: SettingsDocument;
  readonly home: KnowledgeHome | null;
  readonly saved: Saved;
  readonly specimen?: boolean;
  readonly mode?: PolicyMode;
}): ComponentChild {
  const home = props.home?.kind === "decisions" ? props.home : null;
  return h(PolicyDoc, {
    component: "PolicyEditor",
    title: "Decisions book",
    path: ".greenline/DECISIONS.md",
    text: props.settings.decisions,
    read: () => [
      home === null || home.roots === null
        ? null
        : h(
            Group,
            {
              id: "roots",
              title: "Root statements",
              count: home.roots.length,
              flat: false,
            },
            home.roots.length === 0
              ? h("p", { class: "meta" }, "The block names no root.")
              : home.roots.map((statement) => h(RootStatementCard, { statement })),
          ),
      home === null || home.rendered === null
        ? props.settings.decisions === ""
          ? h(
              "p",
              { class: "meta" },
              "No decision is settled yet. A lasting choice the agent settles with you is written here.",
            )
          : h(NamedProse, {
              html: renderMarkdown(props.settings.decisions, () => ({ kind: "text" })),
            })
        : h(NamedProse, { html: home.rendered.html }),
    ],
    label: "Decisions",
    address: "/api/policy",
    revision: props.settings.revisions.decisions,
    button: "Save decisions",
    saved: props.saved,
    settings: props.settings,
    specimen: props.specimen,
    mode: props.mode,
  });
}

/** The house rulings, read and edited in Knowledge (J-166 S1): a list, or the sentence that says what is kept here. */
export function RulingsEditor(props: {
  readonly settings: SettingsDocument;
  readonly saved: Saved;
  readonly specimen?: boolean;
  readonly mode?: PolicyMode;
}): ComponentChild {
  const rulings = props.settings.houseRulings.rulings;
  return h(PolicyDoc, {
    component: "RulingsEditor",
    title: "House rulings",
    path: "AGENTS.md, under ## House rulings",
    text: props.settings.houseRulings.stanza,
    read: () =>
      rulings.length === 0
        ? h(
            "div",
            { class: "empty" },
            h(
              "p",
              null,
              "No house ruling yet. A ruling you give the agent for this repository is kept here.",
            ),
            h(
              "p",
              null,
              "It stays outside greenline's managed markers, so a sync never rewrites it.",
            ),
          )
        : h(
            "ol",
            { class: "rows rulings", "data-component": "RulingsList" },
            rulings.map((ruling) => h("li", null, h(StateWord, { word: "written" }), " ", ruling)),
          ),
    label: "House rulings",
    address: "/api/rulings",
    revision: props.settings.revisions.agents,
    button: "Save House rulings",
    saved: props.saved,
    settings: props.settings,
    specimen: props.specimen,
    mode: props.mode,
  });
}

/** A line naming the policy's place, where Settings once held it. */
export function PolicyMoved(): ComponentChild {
  return h(
    "p",
    { class: "meta" },
    "The decisions book and the house rulings are read and edited in Knowledge: ",
    h("a", { href: pathOf({ page: "home", home: "decisions", part: null }) }, "the decisions book"),
    " and ",
    h("a", { href: pathOf({ page: "rulings" }) }, "the house rulings"),
    ".",
  );
}
