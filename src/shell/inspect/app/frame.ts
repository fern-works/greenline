import { h, type ComponentChild } from "preact";
import type { FrameMap, FrameNodeView, FrameQuestion } from "../../../core/frame-map.ts";
import { pathOf } from "./addresses.ts";
import { Callout, Group, Prose } from "./ui.ts";

/*
 * The frame map (J-117 S4): the frame step's session drawn on the change
 * page from `frame-map.json`, the nodes as regions in their order, each open
 * node a box that opens on a click to its questions with the answer
 * proposed, the answer taken and who decided, the research hanging off the
 * questions it informed, the closed nodes faint with their reason, the
 * untouched ones named in a line and the restatement last.
 */

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

/** Who settled a question, in words. */
function deciderWord(question: FrameQuestion): string {
  return question.decided === "owner"
    ? "Decided by the owner"
    : question.decided === "agent"
      ? "Decided by the agent, inside the scope the owner accepted"
      : "Still open";
}

/** An open node's line under its name: its questions, who settled them and the research they drew on. */
function nodeSummary(questions: readonly FrameQuestion[]): string {
  const owner = questions.filter((question) => question.decided === "owner").length;
  const agent = questions.filter((question) => question.decided === "agent").length;
  const open = questions.length - owner - agent;
  const settled =
    owner === questions.length
      ? ["decided by the owner"]
      : agent === questions.length
        ? ["decided by the agent"]
        : [
            ...(owner > 0 ? [`${String(owner)} by the owner`] : []),
            ...(agent > 0 ? [`${String(agent)} by the agent`] : []),
            ...(open > 0 ? [`${String(open)} open`] : []),
          ];
  const reports = new Set(questions.flatMap((question) => question.research)).size;
  return [
    plural(questions.length, "question"),
    ...settled,
    ...(reports > 0 ? [plural(reports, "research report")] : []),
  ].join(", ");
}

/** One question of an open node: its round, the answer proposed, the answer taken, who decided and the research it drew on. */
function QuestionItem(props: {
  readonly change: string;
  readonly of: FrameOwner;
  readonly question: FrameQuestion;
}): ComponentChild {
  const question = props.question;
  return h(
    "li",
    { "data-question": question.id },
    h(
      "div",
      { class: "row-top" },
      h("span", { class: "title" }, question.question),
      h("span", { class: "meta", title: question.id }, `round ${String(question.round)}`),
    ),
    h(
      "dl",
      { class: "answers" },
      question.proposed === null
        ? null
        : [h("dt", null, "Proposed: "), h("dd", null, question.proposed)],
      question.answer === null ? null : [h("dt", null, "Answer: "), h("dd", null, question.answer)],
    ),
    h("p", { class: "meta" }, deciderWord(question)),
    question.research.length === 0
      ? null
      : h(
          "ul",
          { class: "research", "aria-label": "Research it drew on" },
          question.research.map((file) =>
            h(
              "li",
              null,
              // A discussion's report has no page of its own; its page lists it by name.
              props.of === "discussion"
                ? h("span", { class: "mono" }, file)
                : h(
                    "a",
                    {
                      class: "mono",
                      href: pathOf({ page: "change", id: props.change, part: file }),
                    },
                    file,
                  ),
            ),
          ),
        ),
  );
}

/** One node as a region: an open node opens on a click to its questions, a closed node stands faint with why. */
function NodeRegion(props: {
  readonly change: string;
  readonly of: FrameOwner;
  readonly node: FrameNodeView;
  readonly questions: readonly FrameQuestion[];
}): ComponentChild {
  const node = props.node;
  if (node.state === "closed")
    return h(
      "div",
      {
        class: "box node faint",
        "data-node": node.node,
        "data-anchor": node.node,
        "data-state": "closed",
      },
      h("b", null, node.node),
      h("span", { class: "sub" }, `closed: ${node.reason ?? "no reason given"}`),
    );
  const asked = props.questions.filter((question) => node.questions.includes(question.id));
  // A region is a group of its questions drawn as its box (J-164 S1); it opens on a click or by its address.
  return h(
    Group,
    {
      id: `node:${node.node}`,
      box: true,
      title: [h("b", null, node.node), h("span", { class: "sub" }, nodeSummary(asked))],
      count: asked.length,
      open: false,
      flat: false,
      anchor: node.node,
      component: "FrameNode",
      attributes: { "data-node": node.node, "data-state": "open" },
    },
    h(
      "ol",
      { class: "questions" },
      asked.map((question) => h(QuestionItem, { change: props.change, of: props.of, question })),
    ),
  );
}

/** The record a frame map belongs to: a change, or a discussion (J-118 S4). */
type FrameOwner = "change" | "discussion";

/**
 * A change's frame map on its page, or a discussion's on its (J-118 S4).
 * @param props the record's id, its frame map, and whose it is, a change unless named
 * @returns the section
 */
export function FrameMapView(props: {
  readonly change: string;
  readonly map: FrameMap;
  readonly of?: FrameOwner;
  /** The restatement rendered by the house renderer (J-165 S1); none draws it, its raw words never. */
  readonly restatementHtml?: string | null;
}): ComponentChild {
  const map = props.map;
  const of: FrameOwner = props.of ?? "change";
  const drawn = map.nodes.filter((node) => node.state !== "untouched");
  const untouched = map.nodes.filter((node) => node.state === "untouched").map((node) => node.node);
  // An inline frame's one line is the section itself, drawn on the line; the map adds nothing to it.
  if (drawn.length === 0 && map.issues.length === 0) return null;
  return h(
    "section",
    { "data-component": "FrameMap", "data-anchor": "frame-map", "aria-label": "The frame map" },
    h(
      "h2",
      null,
      "The frame map",
      h("span", { class: "count" }, plural(map.questions.length, "question")),
    ),
    h(
      "p",
      { class: "meta" },
      of === "discussion"
        ? "The discussion's nodes: open a node for its questions and what was decided; a closed node stands faint with why."
        : "The frame's nodes: open a node for its questions and what was decided; a closed node stands faint with why.",
    ),
    map.issues.length === 0
      ? null
      : h(
          Callout,
          null,
          `The frame section's list form has lines the map could not read: ${map.issues.join("; ")}.`,
        ),
    drawn.length === 0
      ? null
      : h(
          "div",
          { class: "frame-map" },
          drawn.map((node) =>
            h(NodeRegion, { change: props.change, of, node, questions: map.questions }),
          ),
        ),
    drawn.length === 0 || untouched.length === 0
      ? null
      : h("p", { class: "meta" }, `Not touched: ${untouched.join(", ")}`),
    props.restatementHtml === undefined || props.restatementHtml === null
      ? null
      : h(
          "div",
          { class: "restatement", "data-part": "restatement" },
          h(Prose, { html: props.restatementHtml }),
        ),
  );
}
