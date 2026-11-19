import type { ComponentChild } from "preact";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { RecordCard } from "../../../src/core/inspector/documents.ts";
import { GroundFacts } from "../../../src/shell/inspect/app/change.ts";
import { CHANGE_PAGE } from "../../../src/shell/inspect/app/fixtures.ts";

/**
 * The change page's ground and agent rows (J-114 S5), drawn from the
 * catalogue's fixture: the component's tree read as the browser would print
 * it, each row's term with its value and note, no DOM needed.
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

/** A node's text, function components drawn first, a term followed by a colon and a row by a line break. */
function textOf(node: ComponentChild): string {
  const leaf = LEAF.safeParse(node);
  if (leaf.success) return String(leaf.data);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const component = COMPONENT.safeParse(node);
  if (component.success) return textOf(component.data.type(component.data.props));
  const element = ELEMENT.safeParse(node);
  if (!element.success) return "";
  const inner = textOf(element.data.props.children);
  return element.data.type === "dt"
    ? `${inner}: `
    : element.data.type === "div"
      ? `${inner}\n`
      : inner;
}

/** The rows the component draws for a card, `term: value note`, one per line. */
function rowsOf(card: RecordCard): readonly string[] {
  return textOf(GroundFacts({ card }))
    .trim()
    .split("\n")
    .filter((row) => row !== "");
}

describe("J-114 S5 the change page's ground and agent rows", () => {
  it("draws a worktree's path and the agent the record states, from the catalogue's fixture", () => {
    const drawn = ELEMENT.parse(GroundFacts({ card: CHANGE_PAGE.card }));
    expect(drawn.props["data-component"]).toBe("GroundFacts");
    expect(rowsOf(CHANGE_PAGE.card)).toEqual([
      "Ground: .worktrees/2026-10-24-cache-headersa worktree of its own",
      "Harness and model: claude-code/opus",
    ]);
  });

  it("draws a branch in place and the owner's discard words, and no row where the record states nothing (J-155 S2)", () => {
    expect(
      rowsOf({ ...CHANGE_PAGE.card, ground: { kind: "branch" }, discard: "drop the spike" }),
    ).toEqual([
      "Ground: brancha branch in this checkout",
      "Harness and model: claude-code/opus",
      "Discard: drop the spike",
    ]);
    expect(rowsOf({ ...CHANGE_PAGE.card, ground: null, agent: null })).toEqual([]);
  });
});
