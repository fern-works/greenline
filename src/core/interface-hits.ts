import type { Box, BoxedElement } from "./interface-boxes.ts";

/**
 * The hit tests over a capture's boxes (J-124 S1 and S3), with no
 * dependency so the viewer's bundle takes them as they are: a click picks
 * the smallest box under it, a stroke names the elements it lies over, and
 * a later capture finds a marked element again.
 */

/** Whether a box holds a point. */
function holds(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/** A box's area. */
function area(box: Box): number {
  return box.width * box.height;
}

/**
 * The element a click at a point picks: the smallest box that holds it,
 * the later one in the page's order on a tie, since it paints above.
 * @param elements the width's elements
 * @param x the point's x in the page's coordinates
 * @param y the point's y
 * @returns the element, or undefined where no box holds the point
 */
export function elementAt(
  elements: readonly BoxedElement[],
  x: number,
  y: number,
): BoxedElement | undefined {
  let best: BoxedElement | undefined;
  for (const element of elements)
    if (holds(element.box, x, y) && (best === undefined || area(element.box) <= area(best.box)))
      best = element;
  return best;
}

/** The rectangle around a stroke's points. */
export function boundsOf(path: readonly (readonly [number, number])[]): Box | undefined {
  if (path.length === 0) return undefined;
  const xs = path.map((point) => point[0]);
  const ys = path.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The elements a stroke lies over: each element that one of the stroke's
 * points falls in, or whose box lies inside the rectangle around the
 * stroke, the smallest first and none that holds another of them whole, so
 * a stroke round a button names the button and not the page around it.
 * @param elements the width's elements
 * @param path the stroke's points in the page's coordinates
 * @param most how many to name at most
 * @returns the elements, the smallest first
 */
export function elementsUnder(
  elements: readonly BoxedElement[],
  path: readonly (readonly [number, number])[],
  most = 5,
): readonly BoxedElement[] {
  const bounds = boundsOf(path);
  if (bounds === undefined) return [];
  const inside = (box: Box): boolean =>
    box.x >= bounds.x &&
    box.y >= bounds.y &&
    box.x + box.width <= bounds.x + bounds.width &&
    box.y + box.height <= bounds.y + bounds.height;
  const touched = elements.filter(
    (element) =>
      area(element.box) > 0 &&
      (inside(element.box) || path.some(([x, y]) => holds(element.box, x, y))),
  );
  // An element holds another whole when its box holds the other's; of two identical boxes the later in the page, the inner, is kept.
  const contains = (outer: BoxedElement, inner: BoxedElement): boolean => {
    if (outer === inner) return false;
    const a = outer.box;
    const b = inner.box;
    const holdsWhole =
      b.x >= a.x &&
      b.y >= a.y &&
      b.x + b.width <= a.x + a.width &&
      b.y + b.height <= a.y + a.height;
    const same = a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    return holdsWhole && (!same || elements.indexOf(inner) > elements.indexOf(outer));
  };
  return touched
    .filter((element) => !touched.some((other) => contains(element, other)))
    .sort((a, b) => area(a.box) - area(b.box))
    .slice(0, most);
}

/**
 * The element of a width that a mark's element names again: the same
 * selector first, else the same source location and text, else undefined.
 * @param elements the width's elements in a later capture
 * @param named the element the mark names
 * @returns the element, or undefined
 */
export function sameElement(
  elements: readonly BoxedElement[],
  named: Pick<BoxedElement, "selector" | "text" | "source">,
): BoxedElement | undefined {
  const bySelector = elements.find((element) => element.selector === named.selector);
  if (bySelector !== undefined) return bySelector;
  const source = named.source;
  if (source === null) return undefined;
  return elements.find(
    (element) =>
      element.source !== null &&
      element.source.file === source.file &&
      element.source.line === source.line &&
      element.text === named.text,
  );
}
