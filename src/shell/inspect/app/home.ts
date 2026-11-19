import { h, type ComponentChild } from "preact";
import type { DecisionRecord, KnowledgeHome } from "../../../core/inspector/documents.ts";
import type { RootStatement } from "../../../core/root-statements.ts";
import { pathOf } from "./addresses.ts";
import { ArtefactFold, Callout, Prose, StateWord, Tag } from "./ui.ts";

/*
 * The knowledge homes' components: a home in the list, a whole document
 * with its outline beside it, the decisions book's root statements as a
 * card per root, and the ADR home as one entry per record with its status
 * and date. The homes are a tab of the Atlas.
 */

const homePath = (home: string, part: string | null = null): string =>
  pathOf({ page: "home", home, part });

/** One root statement of the decisions book: its root, purpose, languages, technologies, decision and exclusions. */
export function RootStatementCard(props: { readonly statement: RootStatement }): ComponentChild {
  const statement = props.statement;
  const tags = (values: readonly string[]): ComponentChild =>
    values.length === 0
      ? h("span", { class: "unset" }, "none settled")
      : values.map((value) => h(Tag, null, value));
  return h(
    "div",
    { class: "root-card", "data-root": statement.root, "data-component": "RootStatementCard" },
    h(
      "div",
      { class: "row-top" },
      h("span", { class: "mono title" }, statement.root),
      statement.purpose === null ? null : h("span", null, statement.purpose),
    ),
    h(
      "dl",
      { class: "facts" },
      h("div", null, h("dt", null, "Languages"), h("dd", null, tags(statement.languages))),
      h("div", null, h("dt", null, "Technologies"), h("dd", null, tags(statement.technologies))),
      h("div", null, h("dt", null, "Decision"), h("dd", null, statement.decision)),
      h(
        "div",
        null,
        h("dt", null, "Exclusions"),
        h(
          "dd",
          null,
          statement.exclusions.length === 0
            ? h("span", { class: "unset" }, "none")
            : statement.exclusions.map((exclusion) =>
                h(
                  Tag,
                  null,
                  exclusion.kind === "unit"
                    ? `unit ${exclusion.id}`
                    : `responsibility ${exclusion.responsibility}`,
                ),
              ),
        ),
      ),
    ),
  );
}

/** One decision record: its title, status and date, opened in place. */
export function DecisionRecordView(props: {
  readonly record: DecisionRecord;
  readonly open: boolean;
  /** The home that holds it, whose page's address follows the record once it opens. */
  readonly home?: string;
}): ComponentChild {
  const record = props.record;
  return h(ArtefactFold, {
    id: record.file,
    kind: "decision record",
    component: "DecisionRecordView",
    open: props.open,
    address:
      props.home === undefined
        ? null
        : pathOf({ page: "home", home: props.home, part: record.file }),
    closed:
      props.home === undefined ? null : pathOf({ page: "home", home: props.home, part: null }),
    head: [
      h("span", { class: "title" }, record.title),
      record.status === null ? null : h(StateWord, { word: record.status.toLowerCase() }),
      h(
        "span",
        { class: "meta" },
        record.date === null ? "" : `${record.date} · `,
        h("span", { class: "mono" }, record.file),
      ),
    ],
    held: {
      read: () => [
        record.problem === null ? null : h(Callout, null, record.problem),
        record.html === null ? null : h(Prose, { html: record.html }),
      ],
      source: null,
      json: { text: JSON.stringify(record, null, 2), address: null },
    },
  });
}

/** One home's page: its document with the outline beside it, the book's roots as cards, or the records. */
export function HomePage(props: {
  readonly home: KnowledgeHome;
  readonly part: string | null;
}): ComponentChild {
  const home = props.home;
  const head = (title: string): ComponentChild[] => [
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "atlas", tab: "homes" }) }, "Knowledge"),
      " / ",
      home.title,
    ),
    h("h1", null, title),
    h(
      "p",
      { class: "meta" },
      h("span", { class: "mono" }, home.path),
      home.holds === null ? null : ` · ${home.holds}`,
    ),
    h("p", { class: "lede" }, home.role),
  ];
  const problem = home.problem === null ? null : h(Callout, null, home.problem);
  if (home.kind === "records")
    return h(
      "article",
      { "data-component": "HomePage", "data-home": "adr" },
      head(home.title),
      problem,
      home.records.map((record) =>
        h(DecisionRecordView, { record, open: props.part === record.file, home: home.id }),
      ),
    );
  const rendered = home.rendered;
  const outline = rendered === null || rendered.outline.length < 2 ? null : rendered.outline;
  return h(
    "article",
    { "data-component": "HomePage", "data-home": home.id },
    head(rendered?.heading ?? home.title),
    problem,
    home.kind === "decisions" && home.roots !== null
      ? h(
          "section",
          { "aria-label": "Root statements" },
          h(
            "h2",
            null,
            "Root statements",
            h("span", { class: "count" }, String(home.roots.length)),
          ),
          home.roots.length === 0
            ? h("p", { class: "meta" }, "The block names no root.")
            : home.roots.map((statement) => h(RootStatementCard, { statement })),
        )
      : null,
    rendered === null
      ? null
      : h(
          "div",
          { class: outline === null ? "document" : "document with-outline" },
          h(Prose, { html: rendered.html }),
          outline === null
            ? null
            : h(
                "nav",
                { class: "outline", "aria-label": "On this page" },
                h("p", { class: "meta" }, "On this page"),
                h(
                  "ol",
                  null,
                  outline.map((entry) =>
                    h(
                      "li",
                      { "data-level": String(entry.level) },
                      h("a", { href: homePath(home.id, entry.anchor) }, entry.text),
                    ),
                  ),
                ),
              ),
        ),
  );
}
