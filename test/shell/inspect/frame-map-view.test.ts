import type { ComponentChild } from "preact";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { frameMapOf } from "../../../src/core/frame-map.ts";
import { FrameMapView } from "../../../src/shell/inspect/app/frame.ts";
import { CHANGE_PAGE, FRAME_MAP } from "../../../src/shell/inspect/app/fixtures.ts";

/**
 * The change page's frame map (J-117 S4), drawn from the catalogue's
 * fixture: the component's tree walked as the browser would print it, each
 * region read by its data attributes, no DOM needed.
 */

/** A child in a tree, which the walk reads for what it is. */
const CHILD = z.custom<ComponentChild>(() => true);
/** A component's props, each a child or an attribute. */
interface Props {
  readonly [key: string]: ComponentChild;
}
/** A function component in a tree, called with its props to draw it. */
const COMPONENT = z.object({
  type: z.custom<(props: Props) => ComponentChild>((value) => value instanceof Function),
  props: z.record(z.string(), CHILD),
});
/** An element in a tree: its tag, its attributes and its children. */
const ELEMENT = z.object({
  type: z.string(),
  props: z.looseObject({ children: CHILD.optional() }),
});
const LEAF = z.union([z.string(), z.number()]);
/** An attribute whose value is text. */
const TEXT = z.string();

/** An element drawn, function components called first. */
interface Drawn {
  readonly tag: string;
  /** Its attributes whose value is text, by name. */
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly Drawn[];
  readonly text: string;
}

/** The tree drawn into plain elements, each with its whole text. */
function draw(node: ComponentChild): readonly Drawn[] {
  const leaf = LEAF.safeParse(node);
  if (leaf.success)
    return [{ tag: "#text", attributes: new Map(), children: [], text: String(leaf.data) }];
  if (Array.isArray(node)) return node.flatMap(draw);
  const component = COMPONENT.safeParse(node);
  if (component.success) return draw(component.data.type(component.data.props));
  const element = ELEMENT.safeParse(node);
  if (!element.success) return [];
  const children = draw(element.data.props.children);
  return [
    {
      tag: element.data.type,
      attributes: new Map(
        Object.entries(element.data.props).flatMap(([name, value]): [string, string][] => {
          const text = TEXT.safeParse(value);
          return text.success ? [[name, text.data]] : [];
        }),
      ),
      children,
      text: children.map((child) => child.text).join(""),
    },
  ];
}

/** Every element under a drawn one, itself first. */
function all(drawn: Drawn): readonly Drawn[] {
  return [drawn, ...drawn.children.flatMap(all)];
}

function only(drawn: readonly Drawn[]): Drawn {
  const [first] = drawn;
  if (first === undefined || drawn.length !== 1) throw new Error("expected one element");
  return first;
}

/** The restatement as the house renderer gives it (J-165 S1), drawn in place of its raw words. */
const RESTATEMENT = "<p>Repeat visits load <strong>fast</strong>.</p>";
const map = only(
  draw(FrameMapView({ change: CHANGE_PAGE.id, map: FRAME_MAP, restatementHtml: RESTATEMENT })),
);
const regions = all(map).filter((element) => element.attributes.get("data-node") !== undefined);

describe("J-117 S4 the frame map on the change page", () => {
  it("draws the open and closed nodes as regions in the nodes' order, the untouched ones named in a line", () => {
    expect(map.attributes.get("data-component")).toBe("FrameMap");
    expect(
      regions.map((region) => [
        region.attributes.get("data-node"),
        region.attributes.get("data-state"),
      ]),
    ).toEqual([
      ["purpose", "open"],
      ["scope", "open"],
      ["behaviour", "open"],
      ["security", "closed"],
      ["operations", "closed"],
    ]);
    expect(map.text).toContain(
      "Not touched: adjacent, journey, surface, data, performance, verification, constraints, generic",
    );
  });

  it("opens an open node on a click to its questions, each with the answer proposed, the answer taken and who decided", () => {
    const scope = regions.find((region) => region.attributes.get("data-node") === "scope");
    expect(scope?.tag).toBe("details");
    const summary = scope?.children.find((child) => child.tag === "summary");
    expect(summary?.text).toBe("scope1 question, decided by the owner");
    const question =
      scope === undefined
        ? undefined
        : all(scope).find((element) => element.attributes.get("data-question") === "Q2");
    // The question leads, its round after it; its id is the hover's words, never its text (J-158 S2).
    expect(question?.text).toContain("Which responses take the headers?round 1");
    expect(question?.text).not.toContain("Q2");
    expect(question?.text).toContain("Proposed: static assets only");
    expect(question?.text).toContain("Answer: static assets only");
    expect(question?.text).toContain("Decided by the owner");
  });

  it("hangs the research off the questions it informed, each a link to the report on the change's page", () => {
    const behaviour = regions.find((region) => region.attributes.get("data-node") === "behaviour");
    const links =
      behaviour === undefined ? [] : all(behaviour).filter((element) => element.tag === "a");
    expect(links.map((link) => [link.text, link.attributes.get("href")])).toEqual([
      ["frame-research-1.md", `/changes/${CHANGE_PAGE.id}/frame-research-1.md`],
    ]);
    const question =
      behaviour === undefined
        ? undefined
        : all(behaviour).find((element) => element.attributes.get("data-question") === "Q3");
    expect(question?.text).toContain("Decided by the agent");
  });

  it("draws a closed node faint with its reason, and the restatement last, rendered", () => {
    const security = regions.find((region) => region.attributes.get("data-node") === "security");
    expect(security?.attributes.get("class")).toBe("box node faint");
    expect(security?.text).toBe("securityclosed: no secret is served");
    const last = map.children.at(-1);
    expect(last?.attributes.get("data-part")).toBe("restatement");
    // Rendered, never its raw Markdown (J-166 S1): the house renderer's text, placed as it is.
    expect(last?.children[0]?.attributes.get("class")).toBe("prose");
    expect(map.text).not.toContain("**");
    // With no rendering given, no restatement is drawn at all.
    const bare = only(draw(FrameMapView({ change: CHANGE_PAGE.id, map: FRAME_MAP })));
    expect(bare.children.at(-1)?.attributes.get("data-part")).not.toBe("restatement");
  });

  it("names a line of the form the map could not read, and draws nothing for a frame with no question, no closed node and no issue", () => {
    const flawed = only(
      draw(FrameMapView({ change: "c", map: frameMapOf("- Q1 [interfaces] Which screen?") })),
    );
    expect(flawed.text).toContain("Q1 names 'interfaces', no node of the thirteen");
    // An inline frame's one line stands on the line already; the map draws nothing for it.
    expect(draw(FrameMapView({ change: "c", map: frameMapOf("Intent: one line.") }))).toEqual([]);
  });
});
