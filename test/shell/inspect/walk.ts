import type { ComponentChildren } from "preact";
import { z } from "zod";
import { NAMES } from "../../../src/shell/inspect/app/fixtures.ts";
import {
  NamesContext,
  namesOf,
  ReadAgain,
  type Names,
  type Reading,
} from "../../../src/shell/inspect/app/ui.ts";

/*
 * Drawing the inspector's components without a browser (J-158): each
 * function component called with its props, a context's consumer handed
 * the value a page gives it, the elements walked for their text, their
 * links, the components they name and their readings. The render check
 * draws the same components in a browser.
 */

/** The elements that end a line of text. */
const BLOCKS = new Set([
  "article",
  "dd",
  "div",
  "dl",
  "dt",
  "h1",
  "h2",
  "h3",
  "header",
  "li",
  "nav",
  "ol",
  "p",
  "section",
  "ul",
]);

/** What a drawing shows: its text, its links, and the components it names. */
export interface Drawn {
  readonly text: string;
  readonly links: readonly string[];
  readonly components: readonly string[];
  readonly reading: readonly string[];
}

/** A child in a tree, which the walk reads for what it is. */
const CHILD = z.custom<ComponentChildren>(() => true);
/** Text, as a string or a number. */
const LEAF = z.union([z.string(), z.number()]);
/** An element the browser draws: its tag and the attributes the walk reads. */
const ELEMENT = z.object({
  type: z.string(),
  props: z.looseObject({
    children: CHILD.optional(),
    "data-component": z.string().optional(),
    "data-reading": z.string().optional(),
    href: z.string().optional(),
  }),
});
/** A context's consumer: its children a function of the context's value. */
const CONSUMER = z.object({
  type: z.unknown(),
  props: z.looseObject({
    children: z.custom<(value: Reading<Names> | (() => void) | undefined) => ComponentChildren>(
      (value) => value instanceof Function,
    ),
  }),
});
/** A component's props, each read as a child would be. */
interface Props {
  readonly [key: string]: ComponentChildren;
}
/** A function component, called with its props. */
const COMPONENT = z.object({
  type: z.custom<(props: Props) => ComponentChildren>((value) => value instanceof Function),
  props: z.record(z.string(), CHILD),
});

/** The values the page's contexts hold while a part is drawn. */
export interface Given {
  readonly names: Reading<Names> | undefined;
}

/**
 * Draw a tree to its text, its links and its components, the names
 * consumer given the names and the read-again consumer a quiet function.
 * @param node the tree
 * @param given the names the page holds; none where no page gives them
 * @returns what it shows
 */
export function draw(node: ComponentChildren, given: Given = { names: undefined }): Drawn {
  const text: string[] = [];
  const links: string[] = [];
  const components: string[] = [];
  const reading: string[] = [];
  const visit = (child: ComponentChildren): void => {
    if (Array.isArray(child)) {
      for (const each of child) visit(each);
      return;
    }
    const leaf = LEAF.safeParse(child);
    if (leaf.success) {
      text.push(String(leaf.data));
      return;
    }
    const element = ELEMENT.safeParse(child);
    if (element.success) {
      const { type, props } = element.data;
      if (props["data-component"] !== undefined) components.push(props["data-component"]);
      if (props["data-reading"] !== undefined) reading.push(props["data-reading"]);
      if (type === "a" && props.href !== undefined) links.push(props.href);
      visit(props.children);
      // A block ends its line; an inline element runs on into the text after it.
      if (BLOCKS.has(type)) text.push(" ");
      return;
    }
    const consumer = CONSUMER.safeParse(child);
    if (consumer.success && consumer.data.type === NamesContext.Consumer) {
      visit(consumer.data.props.children(given.names));
      return;
    }
    if (consumer.success && consumer.data.type === ReadAgain.Consumer) {
      visit(consumer.data.props.children(() => undefined));
      return;
    }
    const component = COMPONENT.safeParse(child);
    if (!component.success) return;
    // A component that holds state, a fold's open part, gives what it paints first (J-164 S1).
    const type: unknown = component.data.type;
    if (type instanceof Function && "firstPaint" in type && type.firstPaint instanceof Function) {
      visit(type.firstPaint(component.data.props));
      return;
    }
    visit(component.data.type(component.data.props));
  };
  visit(node);
  return { text: text.join("").replace(/\s+/g, " ").trim(), links, components, reading };
}

export const READY: Reading<Names> = { state: "ready", document: namesOf(NAMES) };
export const withNames = (names: Reading<Names>): Given => ({ names });
