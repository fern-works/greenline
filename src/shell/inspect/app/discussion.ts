import { h, type ComponentChild } from "preact";
import type { FrameQuestion } from "../../../core/frame-map.ts";
import type {
  DiscussionSummary,
  DiscussionView,
  SearchKind,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import { FrameMapView } from "./frame.ts";
import {
  ArtefactFold,
  Group,
  ListBox,
  plural,
  Prose,
  RecordLink,
  SectionHead,
  StateWord,
} from "./ui.ts";

/*
 * The discussion's components (J-118 S4, on J-120's shell): its row in a
 * list and its page, the change page's spine without the work: no steps, no
 * checks, no commits of code. The lineage strip heads the page with the
 * changes it promoted; its frame map is J-117's component, read from its
 * frame section.
 */

/** When it was last touched, in words: the date of the last commit, or not yet committed. */
function touchedWords(touched: string | null): string {
  return touched === null ? "not committed yet" : `touched ${touched}`;
}

/** One discussion in a list: its state, its idea, when it was last touched, its decisions and what it promoted. */
export function DiscussionRow(props: { readonly discussion: DiscussionSummary }): ComponentChild {
  const discussion = props.discussion;
  return h(
    "li",
    { "data-component": "DiscussionRow", "data-state": discussion.state },
    h(
      "div",
      { class: "row-top" },
      h(StateWord, { word: discussion.state }),
      h(
        "a",
        {
          class: "title",
          href: pathOf({ page: "discussion", id: discussion.id }),
          "data-item": "",
        },
        discussion.title,
      ),
    ),
    h(
      "div",
      { class: "row-meta" },
      h("span", { title: discussion.id }, `opened ${discussion.opened}`),
      h("span", null, touchedWords(discussion.touched)),
      h("span", null, plural(discussion.decisions, "decision")),
      discussion.promoted.length === 0
        ? null
        : h("span", null, `promoted ${plural(discussion.promoted.length, "change")}`),
    ),
  );
}

/** A list of records by their names, or a quiet line when it is empty. */
function links(
  kind: SearchKind,
  items: readonly { readonly id: string; readonly path: string }[],
  none: string,
) {
  return items.length === 0
    ? h("p", { class: "meta" }, none)
    : h(
        "ul",
        { class: "plain" },
        items.map((item) => h("li", null, h(RecordLink, { kind, id: item.id, href: item.path }))),
      );
}

/** One question of the discussion's frame: the question, the owner's words quoted, or the answer proposed while it waits. */
function QuestionLine(props: { readonly question: FrameQuestion }): ComponentChild {
  const question = props.question;
  return h(
    "li",
    { "data-question": question.id },
    h("p", { class: "title" }, question.question),
    question.answer === null
      ? question.proposed === null
        ? null
        : h("p", { class: "meta" }, `Proposed: ${question.proposed}`)
      : h(
          "p",
          { class: "owner-words" },
          h("q", null, question.answer),
          h(
            "span",
            { class: "meta" },
            question.decided === "agent" ? " · settled by the agent" : " · your words",
          ),
        ),
  );
}

/**
 * One discussion's page (J-166 S1): the idea as its title, its state with
 * the owner's words that set it quoted, the changes it promoted as a
 * strip, its frame map, the open questions then the settled ones folded,
 * its sections rendered, and its research reports, each opened in place.
 */
export function DiscussionPage(props: { readonly discussion: DiscussionView }): ComponentChild {
  const discussion = props.discussion;
  const questions = discussion.map?.questions ?? [];
  const open = questions.filter((question) => question.decided === null);
  const settled = questions.filter((question) => question.decided !== null);
  return h(
    "article",
    { "data-component": "DiscussionPage", "data-discussion": discussion.id },
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "discussions" }) }, "Discussions"),
      " / ",
      h("span", { title: discussion.id }, discussion.title),
    ),
    h("h1", null, discussion.title),
    h(
      "p",
      { class: "change-meta" },
      h(StateWord, { word: discussion.state }),
      h("span", null, `opened ${discussion.opened}`),
      h("span", null, touchedWords(discussion.touched)),
      h("span", null, plural(discussion.decisions, "decision")),
    ),
    discussion.words === null
      ? null
      : h("p", { class: "owner-words" }, "Your words: ", h("q", null, discussion.words)),
    discussion.revisit === null
      ? null
      : h("p", { class: "meta" }, `Come back to it ${discussion.revisit}.`),
    discussion.reason === null
      ? null
      : h("p", { class: "meta" }, `Declined: ${discussion.reason}.`),
    discussion.into === null
      ? null
      : h(
          "p",
          { class: "meta" },
          "Merged into ",
          h(RecordLink, {
            kind: "discussion",
            id: discussion.into,
            href: pathOf({ page: "discussion", id: discussion.into }),
          }),
          ".",
        ),
    discussion.promoted.length === 0
      ? null
      : h(
          "p",
          { class: "promoted-strip", "data-component": "PromotedStrip" },
          h(StateWord, { word: "promoted" }),
          " to ",
          discussion.promoted.map((id, index) => [
            index === 0 ? "" : ", ",
            h(RecordLink, { kind: "change", id, href: pathOf({ page: "change", id, part: null }) }),
          ]),
        ),
    discussion.map === null
      ? h("p", { class: "meta" }, "Its frame section holds no frame yet.")
      : h(FrameMapView, {
          change: discussion.id,
          map: discussion.map,
          of: "discussion",
          restatementHtml: discussion.restatementHtml,
        }),
    questions.length === 0
      ? null
      : h(
          ListBox,
          { label: "The questions" },
          h(
            Group,
            {
              id: "discussion:open",
              title: "Open questions",
              count: open.length,
              tally: [["waiting", open.length]],
              open: true,
              flat: false,
            },
            open.length === 0
              ? h("p", { class: "meta" }, "Every question is settled.")
              : h(
                  "ul",
                  { class: "rows" },
                  open.map((question) => h(QuestionLine, { question })),
                ),
          ),
          h(
            Group,
            {
              id: "discussion:settled",
              title: "Settled",
              count: settled.length,
              open: false,
              flat: false,
            },
            h(
              "ul",
              { class: "rows" },
              settled.map((question) => h(QuestionLine, { question })),
            ),
          ),
        ),
    discussion.decisionLines.length === 0
      ? null
      : [
          h(SectionHead, { title: "Decisions", count: discussion.decisionLines.length }),
          h(
            "ul",
            { class: "rows" },
            discussion.decisionLines.map((decision) => h("li", null, decision)),
          ),
        ],
    discussion.sections.map((section) =>
      h(
        "section",
        { class: "discussion-section", "data-anchor": section.heading },
        h(SectionHead, { title: section.heading }),
        h(Prose, { html: section.html }),
      ),
    ),
    discussion.research.length === 0
      ? null
      : [
          h(SectionHead, { title: "Research", count: discussion.research.length }),
          discussion.research.map((file) =>
            h(ArtefactFold<"file">, {
              id: `research:${file}`,
              kind: "research report",
              component: "ResearchReport",
              open: false,
              address: null,
              closed: null,
              head: h("span", { class: "mono title" }, file),
              document: {
                address: `/api/discussions/${encodeURIComponent(discussion.id)}/research/${encodeURIComponent(file)}`,
                kind: "file",
                reads: "this research report",
                read: (document) =>
                  document.file.html === null
                    ? h("pre", null, document.file.text ?? document.file.problem ?? "")
                    : h(Prose, { html: document.file.html }),
                source: (document) => document.file.text,
              },
            }),
          ),
        ],
    discussion.related.length === 0
      ? null
      : [
          h(SectionHead, { title: "Related" }),
          links(
            "discussion",
            discussion.related.map((id) => ({ id, path: pathOf({ page: "discussion", id }) })),
            "No related discussion.",
          ),
        ],
  );
}
