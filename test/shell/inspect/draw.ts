import type { ComponentChildren, FunctionComponent } from "preact";
import { isValidElement } from "preact";

/*
 * A drawing of the inspector's components without a browser (J-155 S1):
 * each function component called with its props, the elements walked for
 * their text, the components they name and the links they hold. It draws
 * components that are functions of their props alone, with no hook.
 */

/** What a drawing shows: its text, its components by name and its links. */
export interface Drawn {
  readonly text: string;
  readonly components: readonly string[];
  readonly links: readonly string[];
  /** The addresses its frames load, a picture's raw bytes (J-221 S1). */
  readonly frames: readonly string[];
}

/** The attributes the drawing reads of an element. */
interface DrawnProps {
  readonly "data-component"?: string;
  readonly href?: string;
  /** A fold's own address, which the page's address follows when it opens. */
  readonly "data-address"?: string;
  /** A frame's address. */
  readonly src?: string;
  readonly children?: ComponentChildren;
  /** Text the server rendered, which the page places as it is: read here for its words, its tags left out. */
  readonly dangerouslySetInnerHTML?: { readonly __html: string };
}

/**
 * Draw a tree of components to its text, its components and its links.
 * @param node the tree
 * @returns what it shows
 */
export function draw(node: ComponentChildren): Drawn {
  const text: string[] = [];
  const components: string[] = [];
  const links: string[] = [];
  const frames: string[] = [];
  const visit = (child: ComponentChildren): void => {
    if (child === null || child === undefined || child === true || child === false) return;
    if (Array.isArray(child)) {
      for (const each of child) visit(each);
      return;
    }
    if (!isValidElement(child)) {
      text.push(String(child));
      return;
    }
    const props: DrawnProps = child.props;
    if (child.type instanceof Function) {
      // A component that holds state, a fold's open part, gives what it paints first (J-164 S1).
      if ("firstPaint" in child.type && child.type.firstPaint instanceof Function) {
        visit(child.type.firstPaint(child.props));
        return;
      }
      // SAFETY: the desk's components are function components of their props alone, with no hook.
      visit((child.type as FunctionComponent)(child.props));
      return;
    }
    if (props["data-component"] !== undefined) components.push(props["data-component"]);
    if (child.type === "a" && props.href !== undefined) links.push(props.href);
    if (props["data-address"] !== undefined) links.push(props["data-address"]);
    if (child.type === "iframe" && props.src !== undefined) frames.push(props.src);
    visit(props.children);
    const html = props.dangerouslySetInnerHTML?.__html;
    // Read as the browser reads it: the tags left out, the escapes the house renderer wrote turned back.
    if (html !== undefined)
      text.push(
        html
          .replace(/<[^>]*>/g, " ")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&"),
      );
    text.push(" ");
  };
  visit(node);
  return { text: text.join("").replace(/\s+/g, " ").trim(), components, links, frames };
}

export const count = (drawn: Drawn, name: string): number =>
  drawn.components.filter((component) => component === name).length;
