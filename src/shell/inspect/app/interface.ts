import { h, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import type {
  CatalogEntryView,
  DealDirectionView,
  DealDocument,
  InterfaceChecksDocument,
  InterfaceDocument,
  InterfaceTokenView,
} from "../../../core/inspector/documents.ts";
import { safeColour } from "../../../core/style-values.ts";
import { Callout, Empty, SectionHead, Tag, when } from "./ui.ts";

/*
 * The interface practice's components (J-123 S7): a catalog entry with its
 * specimen, the catalog browser with its filters, a dealt direction with its
 * composite at three widths in light and dark and its pick, the address
 * index with each address's captures, scores and history, the home's tokens
 * as tiles and its own page, and on the change page the direction card and
 * the check's tiers. Every specimen and composite is rendered on the server
 * from the data alone; here they are placed as they are, a composite in a
 * frame of its own so its widths are its own.
 */

/** The widths a composite is shown at, each scaled to fit its column. */
const WIDTHS: readonly { readonly width: number; readonly height: number }[] = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

/** A specimen rendered on the server, placed as it is. */
function Specimen(props: { readonly html: string }): ComponentChild {
  return h("div", { class: "entry-specimen", dangerouslySetInnerHTML: { __html: props.html } });
}

/** One catalog entry: its specimen, its kind and facets, its words and its source. */
export function CatalogEntryCard(props: { readonly entry: CatalogEntryView }): ComponentChild {
  const { entry } = props;
  return h(
    "article",
    { class: "card catalog-entry", "data-component": "CatalogEntryCard", id: `entry-${entry.id}` },
    entry.specimen === null
      ? h(Callout, { quiet: true }, "No tokens and no sketch to show.")
      : h(Specimen, { html: entry.specimen }),
    h("h3", null, entry.id),
    h(
      "div",
      { class: "row-meta" },
      h(Tag, null, entry.kind),
      h(Tag, null, entry.register),
      entry.platform.length === 0 ? null : h(Tag, null, entry.platform.join(" · ")),
      [...entry.concerns, ...entry.components].map((facet) => h(Tag, null, facet)),
    ),
    h("p", null, entry.words),
    h(
      "p",
      { class: "meta" },
      entry.seen === null
        ? `From ${entry.source}.`
        : `Studied on ${entry.source}, seen ${entry.seen}.`,
    ),
  );
}

/** The catalog browser: every entry, filtered by register, kind and the words of a sector, a tone or a material. */
export function CatalogBrowser(props: {
  readonly entries: readonly CatalogEntryView[];
}): ComponentChild {
  const [register, setRegister] = useState("any");
  const [kind, setKind] = useState("any");
  const [words, setWords] = useState("");
  const kinds = [...new Set(props.entries.map((entry) => entry.kind))].sort();
  const asked = words
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const shown = props.entries.filter(
    (entry) =>
      (register === "any" || entry.register === register || entry.register === "both") &&
      (kind === "any" || entry.kind === kind) &&
      asked.every((word) =>
        `${entry.id} ${entry.words} ${entry.source}`.toLowerCase().includes(word),
      ),
  );
  const select = (
    label: string,
    value: string,
    options: readonly string[],
    set: (next: string) => void,
  ): ComponentChild =>
    h(
      "label",
      { class: "filter" },
      label,
      h(
        "select",
        {
          value,
          onChange: (event: Event) =>
            set(
              event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : value,
            ),
        },
        ["any", ...options].map((option) => h("option", { value: option }, option)),
      ),
    );
  return h(
    "div",
    { "data-component": "CatalogBrowser" },
    h(
      "div",
      { class: "filters" },
      select("Register", register, ["site", "app"], setRegister),
      select("Kind", kind, kinds, setKind),
      h(
        "label",
        { class: "filter" },
        "Sector, tone or material",
        h("input", {
          type: "search",
          value: words,
          placeholder: "calm, finance, photos",
          onInput: (event: Event) =>
            setWords(
              event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : words,
            ),
        }),
      ),
    ),
    h(
      "p",
      { class: "meta" },
      `${String(shown.length)} of ${String(props.entries.length)} entries.`,
    ),
    shown.length === 0
      ? h(Empty, { title: "No entry matches." })
      : h(
          "div",
          { class: "gallery" },
          shown.map((entry) => h(CatalogEntryCard, { entry })),
        ),
  );
}

/** A composite at one width, in a frame of its own, scaled to its column. */
function CompositeFrame(props: {
  readonly html: string;
  readonly width: number;
  readonly height: number;
  readonly title: string;
}): ComponentChild {
  const scale = Math.min(1, 320 / props.width);
  return h(
    "figure",
    {
      class: "composite",
      style: `width:${String(Math.round(props.width * scale))}px;height:${String(Math.round(props.height * scale))}px`,
    },
    h("iframe", {
      srcdoc: props.html,
      title: props.title,
      sandbox: "",
      loading: "lazy",
      width: props.width,
      height: props.height,
      style: `width:${String(props.width)}px;height:${String(props.height)}px;transform:scale(${String(scale)});transform-origin:0 0`,
    }),
    h("figcaption", null, `${String(props.width)} wide`),
  );
}

/** What a pick reports: nothing yet, under way, written, or the server's words. */
export type PickState =
  | { readonly kind: "idle" }
  | { readonly kind: "picking" }
  | { readonly kind: "picked"; readonly direction: number }
  | { readonly kind: "refused"; readonly message: string };

/** One direction dealt: its parts with their reasons, its composite at three widths, light or dark, and its pick. */
function DealDirection(props: {
  readonly direction: DealDirectionView;
  readonly picked: boolean;
  readonly onPick: (() => void) | null;
}): ComponentChild {
  const { direction } = props;
  const [dark, setDark] = useState(false);
  const html = dark && direction.dark !== null ? direction.dark : direction.light;
  return h(
    "article",
    {
      class: props.picked ? "card direction picked" : "card direction",
      "data-component": "DealDirection",
      // A direction's specimen has an address of its own, the deal's part with its name after it (J-142 S1).
      "data-anchor": direction.name,
    },
    h("h3", null, `Direction ${String(direction.index)}: ${direction.name}`),
    h(
      "div",
      { class: "composites" },
      WIDTHS.map((size) =>
        h(CompositeFrame, {
          html,
          width: size.width,
          height: size.height,
          title: `Direction ${String(direction.index)} at ${String(size.width)}`,
        }),
      ),
    ),
    h(
      "div",
      { class: "row-meta" },
      direction.dark === null
        ? h("span", { class: "meta" }, "Its palette names no dark scheme.")
        : h(
            "button",
            { type: "button", class: "quiet", onClick: () => setDark(!dark) },
            dark ? "Show light" : "Show dark",
          ),
      props.onPick === null
        ? null
        : h(
            "button",
            { type: "button", onClick: props.onPick },
            props.picked ? "Picked" : "Pick this direction",
          ),
    ),
    h(
      "ul",
      { class: "rows" },
      direction.parts.map((part) =>
        h(
          "li",
          null,
          h(
            "div",
            { class: "row-top" },
            h(Tag, null, part.role),
            h("span", { class: "mono" }, part.id),
            h("span", { class: "meta" }, part.kind),
          ),
          h("p", { class: "meta" }, part.words),
        ),
      ),
    ),
  );
}

/** The deal for a change: its ask, the three directions side by side, and the pick. */
export function DealSection(props: {
  readonly deal: DealDocument;
  readonly pickState: PickState;
  readonly onPick: ((direction: number) => void) | null;
  readonly onReroll: (() => void) | null;
  /** The first three's address, the deal's history, where the page shows the reroll (J-144 S7). */
  readonly first?: string | null;
}): ComponentChild {
  const { deal } = props;
  const picked =
    props.pickState.kind === "picked" ? props.pickState.direction : (deal.pick?.direction ?? null);
  // A change with no deal says so and offers nothing: no seed, no reroll, no catalog's own three (J-149 S4).
  if (!deal.dealt)
    return h(
      "section",
      { class: "section", id: "deal", "data-anchor": "deal", "data-component": "DealSection" },
      h("h2", null, "The deal"),
      h(
        Callout,
        { quiet: true },
        deal.directions.available ? "No deal for this change." : deal.directions.reason,
      ),
    );
  return h(
    "section",
    { class: "section", id: "deal", "data-anchor": "deal", "data-component": "DealSection" },
    h("h2", null, "The deal"),
    h(
      "p",
      { class: "meta" },
      `${deal.register ?? "No register"}${deal.job === null ? "" : `, the job ${deal.job}`}; dealt under seed ${String(deal.seed)}${deal.reroll ? ", rerolled" : ""}.`,
      props.onReroll === null || deal.reroll
        ? null
        : h("button", { type: "button", class: "quiet", onClick: props.onReroll }, "Reroll once"),
    ),
    // The reroll's page keeps the first three as its history, a full load of their own address.
    deal.reroll && props.first !== undefined && props.first !== null
      ? h(
          "p",
          { class: "meta", "data-anchor": "deal-history" },
          "These are the rerolled three. The first three stay at ",
          h("a", { href: props.first, target: "_self" }, "the first deal"),
          ".",
        )
      : null,
    deal.pick === null
      ? null
      : h(
          Callout,
          { quiet: true },
          `Picked: direction ${String(deal.pick.direction)}, ${deal.pick.name}, ${when(deal.pick.at)}${deal.pick.words === undefined ? "" : `, in the owner's words: "${deal.pick.words}"`}. The agent writes it into the design section and the lock.`,
        ),
    props.pickState.kind === "refused" ? h(Callout, null, props.pickState.message) : null,
    !deal.directions.available
      ? h(Callout, { quiet: true }, deal.directions.reason)
      : h(
          "div",
          { class: "deal" },
          deal.directions.items.map((direction) =>
            h(DealDirection, {
              direction,
              picked: picked === direction.index,
              onPick:
                props.onPick === null || props.pickState.kind === "picking"
                  ? null
                  : () => props.onPick?.(direction.index),
            }),
          ),
        ),
  );
}

/** DESIGN.md's tokens as tiles: a colour as its swatch, any other as its value. */
export function TokenTiles(props: {
  readonly tokens: readonly InterfaceTokenView[];
}): ComponentChild {
  if (props.tokens.length === 0) return h(Empty, { title: "No token in DESIGN.md yet." });
  return h(
    "ul",
    { class: "tiles", "data-component": "TokenTiles" },
    props.tokens.map((token) =>
      h(
        "li",
        { class: "tile" },
        token.group === "colors"
          ? h("span", {
              class: "swatch",
              style: `background:${safeColour(token.value) ?? "transparent"}`,
            })
          : null,
        h("span", { class: "mono" }, `${token.group}.${token.name}`),
        h("span", { class: "meta" }, token.value),
      ),
    ),
  );
}

/** The interface's home under its pages (J-166 S1): the facets in play, the notices, the drift, and the home's tokens and own page. */
export function InterfacesPanel(props: { readonly document: InterfaceDocument }): ComponentChild {
  const { document } = props;
  return h(
    "div",
    { "data-component": "InterfacesPanel" },
    h(SectionHead, { title: "The home" }),
    document.facets === null
      ? null
      : h(
          "p",
          { class: "meta" },
          `${document.facets.platform}${document.facets.frameworks.length === 0 ? "" : ` · ${document.facets.frameworks.join(" · ")}`}${document.facets.registers.length === 0 ? "; the register is not ruled" : `; ${document.facets.registers.join(" and ")}`}.`,
        ),
    document.notices.map((notice) => h(Callout, { quiet: true }, notice)),
    document.drift === null ? null : h(Callout, null, document.drift),
    h(TokenTiles, { tokens: document.tokens }),
    document.specimen === null ? null : h(Specimen, { html: document.specimen }),
    document.page === null
      ? null
      : h(
          "div",
          { class: "composites" },
          WIDTHS.map((size) =>
            h(CompositeFrame, {
              html: document.page?.light ?? "",
              width: size.width,
              height: size.height,
              title: `The home's page at ${String(size.width)}`,
            }),
          ),
        ),
  );
}

/** The change page's interface: the direction card and the latest check by tier. */
export function InterfaceSection(props: {
  readonly document: InterfaceChecksDocument;
  readonly dealPath: string;
}): ComponentChild {
  const { document } = props;
  const fact = document.fact;
  return h(
    "section",
    { class: "section", id: "interface", "data-component": "InterfaceSection" },
    h("h2", null, "Interface"),
    h(
      "article",
      { class: "card direction-card" },
      h("h3", null, "Direction"),
      document.pick === null
        ? null
        : h(
            "p",
            null,
            `Picked in the viewer: direction ${String(document.pick.direction)}, ${document.pick.name} (${document.pick.entries.join(", ")}).`,
          ),
      document.design === null
        ? h("p", { class: "meta" }, "The design section is not written yet.")
        : h("pre", { class: "excerpt" }, document.design.slice(0, 900)),
      h("a", { href: props.dealPath }, "Open the deal"),
    ),
    fact === null
      ? h(Callout, { quiet: true }, "No interface check has run for this change yet.")
      : h(
          "article",
          { class: "card tiers", "data-component": "CheckTiers" },
          h("h3", null, "The interface check"),
          h(
            "p",
            null,
            `floor ${String(fact.counts.floor)} red, reflex ${String(fact.counts.reflex)} red (${String(fact.counts.waived)} waived), finish ${String(fact.counts.finish)}; ${when(fact.at)}.`,
          ),
          fact.browser === undefined
            ? null
            : h(Callout, { quiet: true }, `No browser ran: ${fact.browser}`),
          (["floor", "reflex", "finish"] as const).map((tier) => {
            const own = fact.findings.filter((finding) => finding.tier === tier);
            return own.length === 0
              ? null
              : h(
                  "div",
                  null,
                  h("h4", null, tier),
                  h(
                    "ul",
                    { class: "rows" },
                    own.map((finding) =>
                      h(
                        "li",
                        null,
                        h(
                          "span",
                          { class: "mono" },
                          `${finding.path}${finding.line > 0 ? `:${String(finding.line)}` : ""}${finding.width === undefined ? "" : ` at ${String(finding.width)}`}`,
                        ),
                        " ",
                        h(Tag, null, finding.rule),
                        finding.waived === undefined
                          ? null
                          : h("span", { class: "meta" }, ` waived, ${finding.waived}`),
                        finding.detail === undefined
                          ? null
                          : h("span", { class: "meta" }, ` ${finding.detail}`),
                      ),
                    ),
                  ),
                );
          }),
          fact.unmeasured.length === 0
            ? null
            : h(
                "p",
                { class: "meta" },
                `Unmeasured: ${fact.unmeasured.map((entry) => entry.rule).join(", ")}.`,
              ),
        ),
  );
}
