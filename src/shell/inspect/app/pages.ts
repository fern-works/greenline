import { h, type ComponentChild, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { BoxedElement } from "../../../core/interface-boxes.ts";
import type {
  CaptureView,
  CaptureWidthView,
  InterfaceRouteView,
  VisualView,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import {
  FilterBar,
  Group,
  plural,
  RecordLink,
  ScoreChips,
  StateWord,
  useDocument,
  When,
} from "./ui.ts";

/*
 * Interface's pages (J-166 S1): one card per address the app's captures
 * hold, the newest capture on top, its picture where one was kept, else a
 * wireframe drawn from the element boxes the capture kept, else its facts
 * in words; its tier alone among the address's captures, the newest's, as
 * how far it stands behind the code; its three scores as chips with the
 * finish over the captures as a line; the change that last captured it;
 * and the earlier captures folded as history, quiet, with no tier of
 * their own. The cards group by page, by change or by tier.
 */

/** A capture's page in the app. */
const capturePath = (id: string): string => pathOf({ page: "picture", id });

/** The change a capture was made under, read from its visual id; null for one under no change. */
export function captureChange(visual: string): string | null {
  const head = visual.split("/")[0] ?? "";
  return /^\d{4}-\d{2}-\d{2}-/.test(head) ? head : null;
}

/** The roles drawn as a page's landmarks: filled in the wireframe. */
const LANDMARKS: ReadonlySet<string> = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "region",
  "form",
  "search",
]);

/** The roles drawn outlined in the accent: what the owner acts on. */
const CONTROLS: ReadonlySet<string> = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "menuitem",
  "tab",
  "switch",
  "searchbox",
]);

/** How a box is drawn in the wireframe: a landmark, a control, text, or an outline. */
export function boxKind(element: Pick<BoxedElement, "role" | "tag" | "text">): string {
  const role = element.role ?? "";
  if (LANDMARKS.has(role)) return "landmark";
  if (CONTROLS.has(role)) return "control";
  if (element.text !== "") return "text";
  return "box";
}

/**
 * A capture at one width drawn from its element boxes (J-166 S1), at the
 * page's coordinates: the landmarks filled, the controls outlined in the
 * accent, the text as grey bars; the first screen, or the whole page where
 * asked, with a caption that says it is drawn from the boxes.
 */
export function BoxWire(props: {
  readonly width: CaptureWidthView;
  readonly address: string;
  /** The whole page rather than its first screen. */
  readonly whole?: boolean;
  /** Drawn bare, in a card's thumbnail, without its caption. */
  readonly bare?: boolean;
}): ComponentChild {
  const { width } = props;
  const pageHeight = Math.max(width.page.height, width.height, 1);
  const tall = props.whole === true ? pageHeight : Math.min(width.height, pageHeight);
  const shown = width.elements.filter((element) => element.box.y < tall && element.box.height > 0);
  return h(
    "figure",
    { class: props.bare === true ? "box-wire bare" : "box-wire", "data-component": "BoxWire" },
    h(
      "svg",
      {
        viewBox: `0 0 ${String(width.width)} ${String(tall)}`,
        role: "img",
        "aria-label": `${props.address} at ${String(width.width)} wide, drawn from its ${plural(width.elements.length, "element box")}`,
        preserveAspectRatio: "xMidYMin meet",
      },
      h("rect", { class: "page", x: 0, y: 0, width: width.width, height: tall }),
      shown.map((element) => {
        const kind = boxKind(element);
        const box = element.box;
        // Text reads as a bar of its line's height, never taller than a line.
        const height = kind === "text" ? Math.min(box.height, 14) : box.height;
        return h("rect", {
          "data-kind": kind,
          x: box.x,
          y: kind === "text" ? box.y + Math.max(0, (box.height - height) / 2) : box.y,
          width: Math.max(1, box.width),
          height: Math.max(1, height),
          rx: kind === "text" ? 3 : 2,
        });
      }),
    ),
    props.bare === true
      ? null
      : h(
          "figcaption",
          { class: "meta" },
          `No image was kept for this capture; ${props.whole === true ? "the page" : "its first screen"} is drawn from its ${plural(width.elements.length, "element box")}.`,
        ),
  );
}

/**
 * The picture a card or a stage shows for a capture at one width: its
 * image where one was kept, else the wireframe from its boxes, else its
 * facts in words.
 */
function CaptureThumb(props: {
  readonly capture: CaptureView;
  readonly width?: number;
}): ComponentChild {
  const { capture } = props;
  const width =
    capture.widths.find((entry) => entry.width === (props.width ?? 1440)) ?? capture.widths[0];
  if (width !== undefined && width.image !== null)
    return h(
      "div",
      { class: "thumb", "data-component": "CaptureThumb" },
      h("img", {
        src: width.image,
        alt: `${capture.address} at ${String(width.width)} wide`,
        loading: "lazy",
      }),
    );
  if (width !== undefined && width.elements.length > 0)
    return h(
      "div",
      { class: "thumb", "data-component": "CaptureThumb" },
      h(BoxWire, { width, address: capture.address, bare: true }),
    );
  return h(CaptureFacts, { capture });
}

/** A capture that kept neither an image nor its boxes, in words: its address, widths, scores, change and time. */
export function CaptureFacts(props: { readonly capture: CaptureView }): ComponentChild {
  const { capture } = props;
  return h(
    "div",
    { class: "thumb facts-card", "data-component": "CaptureFacts" },
    h("p", { class: "mono" }, capture.address),
    h(
      "p",
      { class: "meta" },
      `${capture.widths.length === 0 ? "No width was kept" : `At ${capture.widths.map((entry) => String(entry.width)).join(", ")} wide`}; floor ${String(capture.scores.floor)} red, reflex ${String(capture.scores.reflex)} red, finish ${String(capture.scores.finish)}.`,
    ),
    h(
      "p",
      { class: "meta" },
      capture.boxes ??
        "No image and no element box were kept; capture the address again to see it.",
    ),
  );
}

/** A card's picture, read from the newest capture's document when the card draws. */
function PageThumb(props: { readonly visual: string; readonly address: string }): ComponentChild {
  const reading = useDocument(
    `/api/pictures/${props.visual.split("/").map(encodeURIComponent).join("/")}`,
    "picture",
  );
  if (reading.state === "ready" && reading.document.capture !== null)
    return h(CaptureThumb, { capture: reading.document.capture });
  return pendingThumb(props.address, reading.state === "failed");
}

/** The card's picture before its capture is read: a quiet frame, or a line where it failed. */
function pendingThumb(address: string, failed: boolean): ComponentChild {
  return h(
    "div",
    { class: "thumb pending", "aria-busy": failed ? undefined : "true" },
    failed ? h("p", { class: "meta" }, `The capture of ${address} could not be read.`) : null,
  );
}

PageThumb.firstPaint = (props: {
  readonly visual: string;
  readonly address: string;
}): ComponentChildren => pendingThumb(props.address, false);

/** How far the newest capture stands behind the code, in words, its tier beside them. */
function behindWords(
  tier: InterfaceRouteView["tier"],
  visual: VisualView | undefined,
): ComponentChild {
  if (tier === null) return null;
  const since = visual?.commitsSince ?? null;
  return h(
    "span",
    { class: "behind" },
    h(StateWord, { word: tier }),
    tier === "fresh" || since === null || since === 0
      ? null
      : h("span", { class: "meta" }, ` behind the code by ${plural(since, "commit")}`),
  );
}

/**
 * One page of the app as a card (J-166 S1): its address, the newest
 * capture's picture, the newest's tier alone, the three scores with the
 * finish over the captures, the change that last captured it and when,
 * and the earlier captures folded as quiet history.
 */
export function PageCard(props: {
  readonly page: InterfaceRouteView;
  /** The pictures by their id, which say how far a capture stands behind the code. */
  readonly visuals: ReadonlyMap<string, VisualView>;
  readonly at: Date;
  /** The newest capture, where the page already holds it; else it is read when the card draws. */
  readonly capture?: CaptureView;
}): ComponentChild {
  const { page, at } = props;
  const newest = page.capture;
  const change = newest === null ? null : captureChange(newest.visual);
  const earlier = page.history.filter((entry) => entry.visual !== newest?.visual).reverse();
  return h(
    "article",
    {
      class: "page-card",
      "data-component": "PageCard",
      "data-address": newest === null ? undefined : capturePath(newest.visual),
    },
    h(
      "header",
      { class: "page-card-head" },
      newest === null
        ? h("span", { class: "mono title" }, page.address)
        : h(
            "a",
            { class: "mono title", href: capturePath(newest.visual), "data-item": "" },
            page.address,
          ),
      behindWords(page.tier, newest === null ? undefined : props.visuals.get(newest.visual)),
    ),
    // The limit the latest capture met, beside the captures, in the check's words (J-191 S1).
    page.limit === null
      ? null
      : h(
          "p",
          { class: "meta page-card-limit", "data-component": "CaptureLimit" },
          "Not captured ",
          h(When, { iso: page.limit.at, at }),
          `: ${page.limit.words}.`,
        ),
    newest === null
      ? h("div", { class: "thumb facts-card" }, h("p", { class: "meta" }, "Not captured yet."))
      : props.capture !== undefined
        ? h(CaptureThumb, { capture: props.capture })
        : h(PageThumb, { visual: newest.visual, address: page.address }),
    page.scores === null
      ? h("p", { class: "meta" }, "Not checked yet.")
      : h(ScoreChips, {
          ...page.scores,
          history: page.history.map((entry) => entry.finish),
        }),
    newest === null
      ? null
      : h(
          "p",
          { class: "meta page-card-made" },
          change === null
            ? "Captured with no change open"
            : h(RecordLink, {
                kind: "change",
                id: change,
                href: pathOf({ page: "change", id: change, part: null }),
              }),
          " · ",
          h(When, { iso: newest.at, at }),
        ),
    earlier.length === 0
      ? null
      : h(
          Group,
          {
            id: `history:${page.address}`,
            title: plural(earlier.length, "earlier capture"),
            count: earlier.length,
            open: false,
            flat: false,
            component: "CaptureHistory",
          },
          h(
            "ul",
            { class: "rows history-rows" },
            earlier.map((entry) => {
              const made = captureChange(entry.visual);
              return h(
                "li",
                null,
                h("a", { href: capturePath(entry.visual) }, h(When, { iso: entry.made, at })),
                made === null
                  ? null
                  : h(RecordLink, {
                      kind: "change",
                      id: made,
                      href: pathOf({ page: "change", id: made, part: null }),
                      plain: true,
                    }),
                h(
                  "span",
                  { class: "meta" },
                  `floor ${String(entry.floor)} · reflex ${String(entry.reflex)} · finish ${String(entry.finish)}`,
                ),
              );
            }),
          ),
        ),
  );
}

/** How the cards are grouped: by page, the one card each, or by the change that last captured each, or by tier. */
export type PageGrouping = "page" | "change" | "tier";

/** The cards in their groups, the newest capture first in each. */
export function pageGroups(
  pages: readonly InterfaceRouteView[],
  grouping: PageGrouping,
): readonly { readonly key: string; readonly pages: readonly InterfaceRouteView[] }[] {
  const time = (page: InterfaceRouteView): number =>
    page.capture === null ? 0 : Date.parse(page.capture.at) || 0;
  const sorted = [...pages].sort((a, b) => time(b) - time(a));
  if (grouping === "page") return [{ key: "", pages: sorted }];
  const groups = new Map<string, InterfaceRouteView[]>();
  for (const page of sorted) {
    const key =
      grouping === "tier"
        ? (page.tier ?? "not captured")
        : ((page.capture === null ? null : captureChange(page.capture.visual)) ?? "");
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  return [...groups].map(([key, own]) => ({ key, pages: own }));
}

/**
 * Interface's pages (J-166 S1): the count, the grouping's chips, and the
 * page cards, newest first, grouped by page, by change or by tier.
 */
export function PageCards(props: {
  readonly pages: readonly InterfaceRouteView[];
  readonly visuals: ReadonlyMap<string, VisualView>;
  readonly at: Date;
  readonly grouping: PageGrouping;
  readonly regroup: (grouping: PageGrouping) => void;
  /** The newest captures the page already holds, by their id; any other is read as its card draws. */
  readonly held?: ReadonlyMap<string, CaptureView>;
}): ComponentChild {
  const captures = props.pages.reduce((total, page) => total + page.history.length, 0);
  const behind = props.pages.filter((page) => page.tier !== null && page.tier !== "fresh").length;
  const groups = pageGroups(props.pages, props.grouping);
  const cards = (pages: readonly InterfaceRouteView[]): ComponentChild =>
    h(
      "div",
      { class: "page-cards" },
      pages.map((page) => {
        const capture = page.capture === null ? undefined : props.held?.get(page.capture.visual);
        return capture === undefined
          ? h(PageCard, { page, visuals: props.visuals, at: props.at })
          : h(PageCard, { page, visuals: props.visuals, at: props.at, capture });
      }),
    );
  return h(
    "section",
    { "data-component": "PageCards", "aria-label": "The app's pages" },
    h(
      "p",
      { class: "summary" },
      h("span", { class: "title" }, plural(props.pages.length, "page")),
      h(
        "span",
        { class: "meta" },
        `${plural(captures, "capture")}, ${String(behind)} behind the code`,
      ),
    ),
    h(FilterBar<PageGrouping>, {
      label: "Group the pages",
      chips: [
        { key: "page", label: "By page", count: props.pages.length },
        {
          key: "change",
          label: "By change",
          count: new Set(
            props.pages.map((page) =>
              page.capture === null ? "" : (captureChange(page.capture.visual) ?? ""),
            ),
          ).size,
        },
        {
          key: "tier",
          label: "By tier",
          count: new Set(props.pages.map((page) => page.tier ?? "")).size,
        },
      ],
      current: props.grouping,
      pick: props.regroup,
    }),
    props.grouping === "page"
      ? cards(groups[0]?.pages ?? [])
      : groups.map((group) =>
          h(
            Group,
            {
              id: `pages:${props.grouping}:${group.key}`,
              title:
                props.grouping === "tier"
                  ? h(StateWord, { word: group.key })
                  : group.key === ""
                    ? "Under no change"
                    : h(RecordLink, {
                        kind: "change",
                        id: group.key,
                        href: pathOf({ page: "change", id: group.key, part: null }),
                        plain: true,
                      }),
              count: group.pages.length,
              open: true,
              flat: false,
            },
            cards(group.pages),
          ),
        ),
  );
}

/** Interface's pages as the page holds them: the grouping the owner picks, kept for the visit. */
export function PageCardsView(props: {
  readonly pages: readonly InterfaceRouteView[];
  readonly visuals: ReadonlyMap<string, VisualView>;
}): ComponentChild {
  const [grouping, setGrouping] = useState<PageGrouping>("page");
  return h(PageCards, {
    pages: props.pages,
    visuals: props.visuals,
    at: new Date(),
    grouping,
    regroup: setGrouping,
  });
}
