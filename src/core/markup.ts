/**
 * A scanner for the tags of an interface file (J-123 S4): the opening tags of
 * HTML, JSX, Vue and Svelte markup, each with its name, its attributes and
 * the line it stands on, and the text between tags. It is no parser: it reads
 * the source as written, attribute values in quotes or in braces, so the
 * interface rules can ask what an element carries without a DOM. A tag inside
 * a string or a comment of script may be read as markup; the rules it feeds
 * are reflexes and floors whose fixtures hold the shapes they read.
 */

/** One attribute as written: its name, and its value, undefined for a bare attribute. */
export interface Attribute {
  readonly name: string;
  readonly value: string | undefined;
}

/** One opening or self-closing tag. */
export interface Tag {
  readonly name: string;
  readonly attributes: readonly Attribute[];
  /** The 1-based line of the tag's `<`. */
  readonly line: number;
  /** The offset of the tag's `<` in the text. */
  readonly offset: number;
  /** The offset just past the tag's `>`. */
  readonly end: number;
  readonly selfClosing: boolean;
}

const NAME_START = /[A-Za-z]/;

/** The offsets where each line of the text read last starts, so a file's many lookups cost one pass. */
interface LineStarts {
  readonly text: string;
  readonly starts: readonly number[];
}
let lastLines: LineStarts | undefined;

function lineStarts(text: string): readonly number[] {
  if (lastLines?.text === text) return lastLines.starts;
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1))
    starts.push(index + 1);
  lastLines = { text, starts };
  return starts;
}

/** The 1-based line of an offset. */
export function lineOf(text: string, offset: number): number {
  const starts = lineStarts(text);
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** A match of a sticky pattern at an offset, read in place with no copy of the rest of the text. */
function matchAt(pattern: RegExp, text: string, index: number): string | undefined {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0];
}

const TAG_NAME = /[A-Za-z][\w.:-]*/y;
const ATTRIBUTE_NAME = /[^\s=>/{}"']+/y;
const BARE_VALUE = /[^\s>]+/y;

/** The value of a braced attribute, `{...}`, matched with its nesting. */
function bracedEnd(text: string, from: number): number {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    } else if (char === '"' || char === "'" || char === "`") {
      const close = text.indexOf(char, index + 1);
      if (close === -1) return text.length;
      index = close;
    }
  }
  return text.length;
}

/** Read one tag at `<`, or undefined where the `<` opens no tag. */
function tagAt(text: string, start: number): Tag | undefined {
  let index = start + 1;
  if (!NAME_START.test(text[index] ?? "")) return undefined;
  const name = matchAt(TAG_NAME, text, index);
  if (name === undefined) return undefined;
  index += name.length;
  const attributes: Attribute[] = [];
  for (;;) {
    while (/\s/.test(text[index] ?? "")) index += 1;
    const char = text[index];
    if (char === undefined) return undefined;
    if (char === ">")
      return {
        name,
        attributes,
        line: lineOf(text, start),
        offset: start,
        end: index + 1,
        selfClosing: false,
      };
    if (char === "/" && text[index + 1] === ">")
      return {
        name,
        attributes,
        line: lineOf(text, start),
        offset: start,
        end: index + 2,
        selfClosing: true,
      };
    if (char === "{") {
      // A spread such as {...props}.
      index = bracedEnd(text, index);
      continue;
    }
    const attributeName = matchAt(ATTRIBUTE_NAME, text, index);
    if (attributeName === undefined) return undefined;
    index += attributeName.length;
    while (/\s/.test(text[index] ?? "")) index += 1;
    if (text[index] !== "=") {
      attributes.push({ name: attributeName, value: undefined });
      continue;
    }
    index += 1;
    while (/\s/.test(text[index] ?? "")) index += 1;
    const open = text[index];
    if (open === '"' || open === "'") {
      const close = text.indexOf(open, index + 1);
      if (close === -1) return undefined;
      attributes.push({ name: attributeName, value: text.slice(index + 1, close) });
      index = close + 1;
    } else if (open === "{") {
      const close = bracedEnd(text, index);
      attributes.push({ name: attributeName, value: text.slice(index, close) });
      index = close;
    } else {
      const bare = matchAt(BARE_VALUE, text, index) ?? "";
      attributes.push({ name: attributeName, value: bare });
      index += bare.length;
    }
  }
}

/**
 * Every opening and self-closing tag of a file, in order.
 * @param text the file's text
 * @returns the tags
 */
export function tagsOf(text: string): readonly Tag[] {
  const tags: Tag[] = [];
  let index = text.indexOf("<");
  while (index !== -1) {
    const tag = tagAt(text, index);
    if (tag !== undefined) tags.push(tag);
    index = text.indexOf("<", tag === undefined ? index + 1 : tag.end);
  }
  return tags;
}

/**
 * An attribute's value by its name, case-insensitive, the JSX spelling
 * (`className`, `htmlFor`, `onClick`) and the HTML one alike.
 * @param tag the tag
 * @param names the names to look for
 * @returns the first value found; `""` for a bare attribute; undefined when none stands
 */
export function attribute(tag: Tag, ...names: readonly string[]): string | undefined {
  const wanted = names.map((name) => name.toLowerCase());
  const found = tag.attributes.find((entry) => wanted.includes(entry.name.toLowerCase()));
  if (found === undefined) return undefined;
  return found.value ?? "";
}

/**
 * Whether a tag carries an attribute, by any of its names.
 * @param tag the tag
 * @param names the names
 * @returns true where one stands
 */
export function hasAttribute(tag: Tag, ...names: readonly string[]): boolean {
  return attribute(tag, ...names) !== undefined;
}

/**
 * The text between a tag and its closing tag, where it closes within the
 * file; nested tags are kept as written.
 * @param text the file's text
 * @param tag the opening tag
 * @returns the inner text, or undefined for a self-closing or unclosed tag
 */
export function innerOf(text: string, tag: Tag): string | undefined {
  if (tag.selfClosing) return undefined;
  const close = text.indexOf(`</${tag.name}`, tag.end);
  return close === -1 ? undefined : text.slice(tag.end, close);
}

/**
 * A text with its tags and braced expressions removed, the words a reader sees.
 * @param text markup
 * @returns the visible words, white space collapsed
 */
export function visibleText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
