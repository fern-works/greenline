import { h, type ComponentChild } from "preact";
import type {
  AtlasRefreshView,
  AtlasStandingView,
  DocumentView,
  DriftNotice,
  MapLayer,
  SubsystemView,
  Tier,
  VisualView,
} from "../../../core/inspector/documents.ts";
import { listedOnMaps, pathOf } from "./addresses.ts";
import {
  Callout,
  Empty,
  Group,
  ListSummary,
  Prose,
  RecordLink,
  SectionHead,
  StateWord,
  Tag,
} from "./ui.ts";

/*
 * The atlas's components: the map as layered bands from entry to
 * foundations, an outline below 560px; a subsystem page with its journeys
 * and the edges it holds; a visual's card with its tier, its page with
 * the picture in place and its one write, the delete; a change's visuals; a
 * drift notice; and the Maps tab's cards, each map or figure live in its
 * frame (J-221 S1). A tier is always a word: fresh, drifting or stale.
 */

const visualPath = (id: string): string => pathOf({ page: "picture", id });

/** The commits since a visual's or a page's commit that touched its files, in words. */
function since(count: number | null): string | null {
  if (count === null) return "its commit is not in the history";
  return `${String(count)} commit${count === 1 ? "" : "s"} since`;
}

/** A tier as a word with its mark. */
export function TierWord(props: { readonly tier: Tier }): ComponentChild {
  return h(StateWord, { word: props.tier });
}

const subsystemPath = (name: string): string => pathOf({ page: "subsystem", name });

/**
 * The map: one band per layer in the map's order, each subsystem a box by
 * name with its summary on hover and focus and its files and journeys
 * counted, a drifted one with a warn edge (J-166 S1); the edges are listed
 * on each subsystem's page, so nothing crosses. Below 560px the bands give
 * way to an outline.
 */
export function MapBands(props: {
  readonly layers: readonly MapLayer[];
  /** The subsystem pages, whose summaries the boxes carry. */
  readonly subsystems?: readonly SubsystemView[];
}): ComponentChild {
  const pages = new Map((props.subsystems ?? []).map((page) => [page.name, page]));
  return h(
    "div",
    { "data-component": "MapBands" },
    h(
      "div",
      { class: "bands" },
      props.layers.map((layer) =>
        h(
          "div",
          { class: "band" },
          h("span", { class: "band-name" }, layer.name),
          h(
            "div",
            { class: "band-boxes" },
            layer.subsystems.map((subsystem) => {
              const page = pages.get(subsystem.name);
              return h(
                "a",
                {
                  class: "box",
                  "data-tier": subsystem.tier,
                  href: subsystemPath(subsystem.name),
                  title: page?.summary,
                  "data-item": "",
                },
                subsystem.name,
                h(
                  "span",
                  { class: "sub" },
                  page === undefined
                    ? subsystem.tier
                    : `${subsystem.tier} · ${String(page.files.length)} files · ${String(page.journeys.length)} journeys`,
                ),
                page === undefined ? null : h("span", { class: "box-summary" }, page.summary),
              );
            }),
          ),
        ),
      ),
    ),
    h(
      "ul",
      { class: "map-outline" },
      props.layers.map((layer) =>
        h(
          "li",
          null,
          `${layer.name}: `,
          layer.subsystems.flatMap((subsystem, index) => [
            index === 0 ? null : ", ",
            h("a", { href: subsystemPath(subsystem.name) }, subsystem.name),
            subsystem.tier === "fresh" ? null : ` (${subsystem.tier})`,
          ]),
        ),
      ),
    ),
  );
}

/** A subsystem's journeys, each with its tier. */
export function JourneyList(props: { readonly subsystem: SubsystemView }): ComponentChild {
  return h(
    "ul",
    { class: "rows", "data-component": "JourneyList" },
    props.subsystem.journeys.map((journey) =>
      h(
        "li",
        null,
        h(
          "div",
          { class: "row-top" },
          h("a", { class: "title", href: visualPath(journey.id), "data-item": "" }, journey.title),
          h(TierWord, { tier: journey.tier }),
          h("span", { class: "meta mono" }, journey.path),
        ),
      ),
    ),
  );
}

/** One subsystem page: its summary, its tier, its page in the explain form, its journeys, its calls and callers, its files. */
export function SubsystemPage(props: {
  readonly subsystem: SubsystemView;
  /** The page rendered by the server's house renderer; null where it stands nowhere. */
  readonly html?: string | null;
}): ComponentChild {
  const subsystem = props.subsystem;
  const list = (names: readonly string[]): ComponentChild =>
    names.length === 0
      ? h("p", { class: "meta" }, "none")
      : h(
          "ul",
          { class: "plain" },
          names.map((name) => h("li", null, h("a", { href: subsystemPath(name) }, name))),
        );
  return h(
    "article",
    { "data-component": "SubsystemPage" },
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "atlas", tab: "subsystems" }) }, "Subsystems"),
      " / ",
      subsystem.name,
    ),
    h("h1", null, subsystem.title),
    h(
      "div",
      { class: "row-top" },
      h(TierWord, { tier: subsystem.tier }),
      h(
        "span",
        { class: "meta" },
        `${subsystem.name} · ${subsystem.layer} · read at `,
        h("span", { class: "mono" }, subsystem.commit.slice(0, 7)),
      ),
    ),
    h("p", { class: "lede" }, subsystem.summary),
    props.html === undefined
      ? null
      : props.html === null
        ? h(Callout, { quiet: true }, `The page ${subsystem.page} stands nowhere yet.`)
        : h(Prose, { html: props.html }),
    h(SectionHead, { title: "Journeys", count: subsystem.journeys.length }),
    subsystem.journeys.length === 0
      ? h("p", { class: "meta" }, "No journey drawn yet.")
      : h(
          "ol",
          { class: "journey-path", "data-component": "JourneyList" },
          subsystem.journeys.map((journey) =>
            h(
              "li",
              null,
              h(
                "a",
                { class: "title", href: visualPath(journey.id), "data-item": "" },
                journey.title,
              ),
              " ",
              h(TierWord, { tier: journey.tier }),
            ),
          ),
        ),
    h(
      "div",
      { class: "grid halves" },
      h(
        "section",
        null,
        h(SectionHead, { title: "Calls", count: subsystem.calls.length }),
        list(subsystem.calls),
      ),
      h(
        "section",
        null,
        h(SectionHead, { title: "Called by", count: subsystem.calledBy.length }),
        list(subsystem.calledBy),
      ),
    ),
    h(
      Group,
      {
        id: `files:${subsystem.name}`,
        title: "Files",
        count: subsystem.files.length,
        open: false,
        flat: false,
      },
      h(
        "ul",
        { class: "plain mono" },
        subsystem.files.map((file) => h("li", null, file)),
      ),
    ),
  );
}

/** A capture the interface check wrote, its form `capture`: the check's own output, which carries no maker (J-134 S2). */
const CAPTURE_FORM = "capture";

/** Who made a visual: a fresh agent, the session itself, the interface check for a capture, or null where no hook recorded it (J-129 S6, J-134 S2). */
function makerOf(visual: VisualView): "agent" | "session" | "check" | null {
  return visual.form === CAPTURE_FORM ? "check" : visual.madeBy;
}

/** The maker's words. */
const MAKER_WORDS = {
  agent: "by a fresh agent",
  session: "by the session itself",
  check: "by the interface check",
} as const;

/** Who made a visual, as words after its date, or nothing where no hook recorded it. */
function makerText(visual: VisualView): string {
  const maker = makerOf(visual);
  return maker === null ? "" : ` ${MAKER_WORDS[maker]}`;
}

/** Who made a visual, as a tag the card and the change page show; the session's own drawing is GL0604's finding. */
function MakerWord(props: { readonly visual: VisualView }): ComponentChild {
  const maker = makerOf(props.visual);
  if (maker === null) return null;
  return h(
    "span",
    {
      class: "meta",
      "data-component": "MakerWord",
      "data-maker": maker,
    },
    MAKER_WORDS[maker],
  );
}

/**
 * The question a picture's brief says it answers (J-204 S1), or nothing
 * where it was kept with no brief, which status names as GL0606.
 */
function BriefLine(props: { readonly visual: VisualView }): ComponentChild {
  const question = props.visual.question;
  if (question === null) return null;
  return h(
    "p",
    { class: "meta", "data-component": "BriefLine", "data-field": "question" },
    `Answers: ${question}`,
  );
}

/** One durable visual: its title, its tier, its brief's question, its form, its finish and skill, its change and the commit it was made at. */
export function VisualCard(props: { readonly visual: VisualView }): ComponentChild {
  const visual = props.visual;
  return h(
    "article",
    { class: "panel", "data-component": "VisualCard" },
    h(
      "div",
      { class: "row-top" },
      h(
        "a",
        { class: "title", href: pathOf({ page: "picture", id: visual.id }), "data-item": "" },
        visual.title,
      ),
      h(TierWord, { tier: visual.tier }),
    ),
    h("p", { class: "next-line" }, visual.summary),
    h(BriefLine, { visual }),
    h(
      "div",
      { class: "row-meta" },
      h("span", null, visual.form),
      visual.finish === null ? null : h("span", { "data-field": "finish" }, visual.finish),
      h("span", null, visual.skill),
      h(MakerWord, { visual }),
      visual.change === null
        ? null
        : h(RecordLink, {
            kind: "change",
            id: visual.change,
            href: pathOf({ page: "change", id: visual.change, part: null }),
          }),
      h("span", { class: "mono" }, visual.commit.slice(0, 7)),
      h("span", null, since(visual.commitsSince)),
    ),
  );
}

/**
 * A visual's picture in place: an SVG drawing as an image, an HTML page in
 * a frame of its raw address, whose own policy sandboxes it with no origin of
 * the inspector's, a Markdown page as the server rendered it; none where no
 * file stands beside the manifest. The frame carries no sandbox attribute of
 * its own: an embedding browser's client refused to load a sandboxed frame,
 * leaving a blank one where the raw address rendered (J-144 S7), and that address's
 * policy holds the sandbox whatever frames it.
 */
export function VisualPicture(props: {
  readonly visual: VisualView;
  readonly html: string | null;
}): ComponentChild {
  const { visual } = props;
  const file = visual.file;
  const source = `/raw/visuals/${visual.id.split("/").map(encodeURIComponent).join("/")}`;
  const body =
    file === null
      ? h(Callout, { quiet: true }, "No picture stands beside this manifest.")
      : file.kind === "svg"
        ? h("img", { class: "visual-image", src: source, alt: visual.title })
        : file.kind === "html"
          ? h("iframe", {
              class: "visual-frame",
              src: source,
              title: visual.title,
              loading: "lazy",
            })
          : props.html === null
            ? h(Callout, { quiet: true }, "This page is too large to show here.")
            : h(Prose, { html: props.html });
  return h("figure", { class: "visual", "data-component": "VisualPicture" }, body);
}

/** What the delete reports: nothing yet, the question asked, or the server's words. */
export type DeleteState =
  | { readonly kind: "idle" }
  | { readonly kind: "asking" }
  | { readonly kind: "refused"; readonly message: string };

/** One visual's page: its facts, its picture in place, the files it covers and the delete. */
export function VisualPage(props: {
  readonly visual: VisualView;
  readonly html: string | null;
  readonly deletion: DeleteState;
  /** Ask, confirm or cancel the delete; absent where the page takes no write, as in the catalogue. */
  readonly onDelete?: (step: "ask" | "confirm" | "cancel") => void;
}): ComponentChild {
  const { visual, deletion, onDelete } = props;
  return h(
    "article",
    { "data-component": "VisualPage" },
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "atlas", tab: "visuals" }) }, "Visuals"),
      " / ",
      visual.title,
    ),
    h("h1", null, visual.title),
    h(
      "div",
      { class: "row-top" },
      h(TierWord, { tier: visual.tier }),
      h(
        "span",
        { class: "meta" },
        `${visual.form}${visual.finish === null ? "" : ` · ${visual.finish}`} · ${visual.skill} · made ${visual.made.slice(0, 10)}${makerText(visual)} at `,
        h("span", { class: "mono" }, visual.commit.slice(0, 7)),
        ` · ${since(visual.commitsSince) ?? ""}`,
      ),
    ),
    h("p", { class: "lede" }, visual.summary),
    h(BriefLine, { visual }),
    visual.change === null
      ? null
      : h(
          "p",
          { class: "meta" },
          "Made under ",
          h(RecordLink, {
            kind: "change",
            id: visual.change,
            href: pathOf({ page: "change", id: visual.change, part: null }),
          }),
        ),
    h(VisualPicture, { visual, html: props.html }),
    h("h2", null, "Covers"),
    visual.files.length === 0
      ? h("p", { class: "meta" }, "No file: it cannot drift.")
      : h(
          "p",
          null,
          visual.files.map((file) => h(Tag, null, file)),
        ),
    onDelete === undefined
      ? null
      : h(
          "div",
          { class: "actions" },
          deletion.kind === "asking"
            ? [
                h(
                  "span",
                  { class: "meta" },
                  `Delete ${visual.path} and its manifest? Git keeps them in history.`,
                ),
                h("button", { type: "button", onClick: () => onDelete("confirm") }, "Delete"),
                h("button", { type: "button", onClick: () => onDelete("cancel") }, "Keep it"),
              ]
            : h("button", { type: "button", onClick: () => onDelete("ask") }, "Delete this visual"),
          deletion.kind === "refused" ? h(Callout, null, deletion.message) : null,
        ),
  );
}

/** The visuals a change made, on its page. */
export function ChangeVisuals(props: { readonly visuals: readonly VisualView[] }): ComponentChild {
  return h(
    "ul",
    { class: "rows", "data-component": "ChangeVisuals" },
    props.visuals.map((visual) =>
      h(
        "li",
        null,
        h(
          "div",
          { class: "row-top" },
          h(
            "a",
            {
              class: "title",
              // A capture opens at its own address too, in the capture view with its boxes and its notes (J-154 S3).
              href: visualPath(visual.id),
            },
            visual.title,
          ),
          h(TierWord, { tier: visual.tier }),
          h("span", { class: "meta" }, visual.form),
          h(MakerWord, { visual }),
        ),
      ),
    ),
  );
}

/** One picture, atlas page or indexed document that drifted from its code. */
export function DriftRow(props: { readonly notice: DriftNotice }): ComponentChild {
  const notice = props.notice;
  const path =
    notice.kind === "visual"
      ? pathOf({ page: "picture", id: notice.id })
      : notice.kind === "document"
        ? pathOf({ page: "document", path: notice.id })
        : subsystemPath(notice.id);
  return h(
    "li",
    { "data-component": "DriftRow" },
    h(
      "div",
      { class: "row-top" },
      h(TierWord, { tier: notice.tier }),
      h("a", { href: path }, notice.title),
    ),
    h(
      "div",
      { class: "row-meta" },
      h(
        "span",
        null,
        notice.kind === "visual"
          ? "visual"
          : notice.kind === "document"
            ? "document"
            : "subsystem page",
      ),
      h("span", null, notice.detail),
    ),
  );
}

/** The minutes the map's first pages take, an estimate until a run measures them (J-147). */
const FIRST_PAGES_MINUTES = "about ten minutes";

/**
 * The atlas with no page yet (J-147 S5): "No atlas yet", the minutes the
 * first pages take on the owner's ask, and the major change since the map
 * where one stands. Nothing is offered (J-176 S1).
 */
export function AtlasEmpty(props: { readonly standing: AtlasStandingView }): ComponentChild {
  const standing = props.standing;
  return h(
    "div",
    { "data-component": "AtlasEmpty" },
    // The one empty state, a quiet line with no box (J-164 S1).
    h(
      Empty,
      { title: "No atlas yet." },
      h(
        "p",
        null,
        `The map is made on the owner's ask: a fresh agent reads the repository and writes a page per subsystem with the map over them, in ${FIRST_PAGES_MINUTES}.`,
      ),
      h(
        "p",
        null,
        "To ask for it, say to the agent: ",
        h("q", null, "how does this code fit together?"),
      ),
    ),
    standing.major === null
      ? null
      : h("p", { class: "meta" }, `A major change since the map: ${standing.major}.`),
  );
}

/**
 * One map or figure on the Maps tab (J-221 S1): its title and tier, the
 * question its brief answers, what made it and under which change and
 * commit, the commits since, the picture live in a frame of its raw address
 * at the picture page's height with its own controls working, the files it
 * covers, and a link that opens it full page. A Markdown one is read on its
 * page, since the frame shows a page's own bytes.
 */
export function MapCard(props: { readonly visual: VisualView }): ComponentChild {
  const visual = props.visual;
  const full = visualPath(visual.id);
  return h(
    "article",
    { class: "panel", "data-component": "MapCard" },
    h(
      "div",
      { class: "row-top" },
      h("a", { class: "title", href: full, "data-item": "" }, visual.title),
      h(TierWord, { tier: visual.tier }),
      h("span", { class: "meta" }, since(visual.commitsSince)),
    ),
    h(BriefLine, { visual }),
    h(
      "div",
      { class: "row-meta" },
      h("span", null, visual.skill),
      h(MakerWord, { visual }),
      h("span", null, `made ${visual.made.slice(0, 10)}`),
      visual.change === null
        ? null
        : h(
            "span",
            null,
            "kept by ",
            h(RecordLink, {
              kind: "change",
              id: visual.change,
              href: pathOf({ page: "change", id: visual.change, part: null }),
            }),
          ),
      h("span", null, "at ", h("span", { class: "mono" }, visual.commit.slice(0, 7))),
    ),
    visual.file?.kind === "md"
      ? h(Callout, { quiet: true }, "A text page: open it full page to read it.")
      : h(VisualPicture, { visual, html: null }),
    h(
      "p",
      { class: "meta", "data-field": "files" },
      visual.files.length === 0
        ? "Covers no file: it cannot drift."
        : ["Covers ", visual.files.map((file) => [h(Tag, null, file), " "])],
    ),
    h("p", null, h("a", { href: full }, "Open full page")),
  );
}

/** The newest first by when each was made, the id breaking a tie. */
function newestFirst(visuals: readonly VisualView[]): readonly VisualView[] {
  return [...visuals].sort((a, b) =>
    a.made === b.made ? b.id.localeCompare(a.id) : b.made.localeCompare(a.made),
  );
}

/**
 * Knowledge's Maps tab (J-221 S1): every kept map and figure the two
 * skills make, the architecture maps first, then the anatomy figures, the
 * newest first in each, each a `MapCard`; where none is kept, "No map yet"
 * with the sentence to say and the skill it loads.
 */
export function MapsList(props: { readonly visuals: readonly VisualView[] }): ComponentChild {
  const listed = props.visuals.filter((visual) => listedOnMaps(visual.form));
  const maps = newestFirst(listed.filter((visual) => visual.form === "map"));
  const figures = newestFirst(listed.filter((visual) => visual.form !== "map"));
  if (listed.length === 0)
    return h(
      "div",
      { "data-component": "MapsList" },
      h(
        Empty,
        { title: "No map yet." },
        h(
          "p",
          null,
          "A map or a figure is made on your ask by a fresh agent, and kept here live, its controls working. For the architecture map, say to the agent: ",
          h("q", null, "map the architecture of this code"),
          "; it loads architecture-map. For a figure of a mechanism: ",
          h("q", null, "explain how a request is retried with a figure"),
          "; it loads anatomy.",
        ),
      ),
    );
  const group = (title: string, items: readonly VisualView[]): ComponentChild =>
    items.length === 0
      ? null
      : [
          h(SectionHead, { title, count: items.length }),
          items.map((visual) => h(MapCard, { visual })),
        ];
  return h(
    "div",
    { "data-component": "MapsList" },
    h(ListSummary, {
      count: listed.length,
      noun: "map or figure",
      nouns: "maps and figures",
      states: (["fresh", "drifting", "stale"] as const).map(
        (tier) => [tier, listed.filter((visual) => visual.tier === tier).length] as const,
      ),
    }),
    group("Architecture maps", maps),
    group("Anatomy figures", figures),
  );
}

/** Who wrote a document, as its row says it. */
function authorWords(author: DocumentView["author"]): string {
  return author === "owner" ? "the owner's, offered and never rewritten unasked" : "the practice's";
}

/** The indexed documents, each with its tier, its author and the files it covers (J-147 S5). */
export function DocumentList(props: {
  readonly documents: readonly DocumentView[];
}): ComponentChild {
  return h(
    "ul",
    { class: "rows", "data-component": "DocumentList" },
    props.documents.map((document) =>
      h(
        "li",
        null,
        h(
          "div",
          { class: "row-top" },
          h(
            "a",
            {
              class: "title",
              href: pathOf({ page: "document", path: document.path }),
              "data-item": "",
            },
            document.path,
          ),
          h(TierWord, { tier: document.tier }),
          h(Tag, null, authorWords(document.author)),
        ),
        h("div", { class: "row-meta" }, h("span", { class: "mono" }, document.files.join(", "))),
      ),
    ),
  );
}

/** One indexed document's page: its tier, its author, the files it covers and its text (J-147 S5). */
export function DocumentPage(props: {
  readonly document: DocumentView;
  readonly html?: string | null;
}): ComponentChild {
  const document = props.document;
  return h(
    "article",
    { "data-component": "DocumentPage" },
    h("h1", null, document.path),
    h(
      "p",
      { class: "meta" },
      h(TierWord, { tier: document.tier }),
      ` ${since(document.commitsSince) ?? ""} ${document.commit.slice(0, 7)}; ${authorWords(document.author)}`,
      document.change === null
        ? null
        : [
            "; kept by ",
            h(RecordLink, {
              kind: "change",
              id: document.change,
              href: pathOf({ page: "change", id: document.change, part: null }),
            }),
          ],
    ),
    h("p", { class: "meta mono" }, `Covers ${document.files.join(", ")}`),
    props.html === undefined || props.html === null
      ? h(Callout, { quiet: true }, "The document stands nowhere on disk.")
      : h(Prose, { html: props.html }),
  );
}

/** The atlas's refreshes, from its index (J-147 S5). */
export function AtlasHistory(props: {
  readonly refreshes: readonly AtlasRefreshView[];
}): ComponentChild {
  if (props.refreshes.length === 0) return null;
  return h(
    "div",
    { "data-component": "AtlasHistory" },
    props.refreshes.length === 0
      ? null
      : h(
          "ul",
          { class: "rows" },
          props.refreshes.map((refresh) =>
            h(
              "li",
              null,
              h(
                "div",
                { class: "row-top" },
                h(
                  "span",
                  { class: "title" },
                  `${refresh.whole ? "A whole refresh" : "A refresh"} of ${refresh.pages.join(", ")}`,
                ),
              ),
              h(
                "div",
                { class: "row-meta" },
                h(RecordLink, {
                  kind: "change",
                  id: refresh.change,
                  href: pathOf({ page: "change", id: refresh.change, part: null }),
                }),
                refresh.cost === null ? null : h("span", null, refresh.cost),
              ),
            ),
          ),
        ),
  );
}
