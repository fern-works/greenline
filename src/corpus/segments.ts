import type { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";

/**
 * The segmenter and the joiner (`workshop/components/recipes.md`): a prose
 * file splits by fixed rules into its front matter, its segments and the
 * separators between them, and joining them gives the file back byte for
 * byte.
 *
 * The front matter, a leading `---` line through the next `---` line and
 * its newline, is one piece and is never segmented.
 *
 * The separator rule. The rest of the file is read line by line. A line's
 * container, its indentation and any `>` quote markers, is separator. On
 * what follows it:
 * - an empty line is separator, and so is a horizontal rule;
 * - a line opening a code fence (three or more backticks or tildes) starts
 *   one fence segment, which runs through the line that closes it with the
 *   same character at least as many times, or to the end of the file;
 * - a heading line, its `#` marks included, is one heading segment;
 * - a line starting with `|` is one table row segment;
 * - a list marker (`-`, `*`, `+`, or a number followed by `.` or `)`) and
 *   the white space after it is separator, and the item's text starts a
 *   new paragraph;
 * - any other line continues the open paragraph or starts one.
 * A paragraph or a list item ends at an empty line or at a line of another
 * kind, and is split into sentences. Whatever is not a segment's content is
 * separator: content never starts or ends with white space, and a line that
 * continues a sentence keeps its line break and its container inside the
 * sentence's content.
 *
 * The sentence rule. A sentence ends at a run of terminal punctuation
 * (`.`, `!`, `?`), with any closing quotes, brackets or emphasis marks
 * after it, that is followed by white space or the end of the paragraph or
 * item, except where the word ending in `.` is one of the abbreviations
 * {@link ABBREVIATIONS} names. Inline code between matching backtick runs
 * never ends a sentence. Text left after the last ending is a sentence too.
 *
 * A segment's id is the first twelve hex characters of the sha256 of its
 * content, so its place in the file plays no part; a later segment with the
 * same content in the same file carries `#2`, `#3`.
 */

/** A segment's id: twelve hex characters of its content's digest, and `#n` for a later duplicate in its file. */
export type SegmentId = string & z.$brand<"SegmentId">;

/** What a segment is: a heading, a table row, a whole code fence or a sentence. */
export type SegmentKind = "heading" | "row" | "fence" | "sentence";

/** One segment of a prose file. */
export interface Segment {
  readonly id: SegmentId;
  readonly kind: SegmentKind;
  /** The content, verbatim; it never starts or ends with white space. */
  readonly text: string;
  /** Its place among the file's segments, from 0. */
  readonly index: number;
  /** The separator before it: everything since the previous segment, the front matter or the file's start. */
  readonly separator: string;
  /** The part of the separator on the segment's own line before it (a list marker, indentation, a quote marker); empty when the segment starts mid-line. */
  readonly lead: string;
}

/** A prose file as its front matter, its segments in order and the separator after the last one. */
export interface SegmentedFile {
  /** The front matter with its closing line and newline; empty when the file has none. */
  readonly frontMatter: string;
  readonly segments: readonly Segment[];
  readonly trailer: string;
}

/** The words that end in `.` without ending a sentence, lower case. */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  "e.g.",
  "i.e.",
  "etc.",
  "vs.",
  "cf.",
  "al.",
  "approx.",
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
]);

const FRONT_MATTER = /^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/;
const CONTAINER = /^(?:[ \t]*>)*[ \t]*/;
const FENCE = /^(`{3,}|~{3,})/;
const HEADING = /^#{1,6}(?:[ \t]|$)/;
const RULE = /^([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/;
const TERMINAL = ".!?";
const CLOSERS = "\"')]*_”’»";
const WHITE = /\s/;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

interface Span {
  readonly start: number;
  readonly end: number;
  readonly kind: SegmentKind;
}

interface Line {
  /** Where the line's content starts, after its container. */
  readonly rest: number;
  /** Where the line ends, before its newline and trailing white space. */
  readonly end: number;
}

function linesOf(text: string, from: number): readonly Line[] {
  const lines: Line[] = [];
  let start = from;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const stop = newline === -1 ? text.length : newline;
    const raw = text.slice(start, stop);
    const container = CONTAINER.exec(raw)?.[0].length ?? 0;
    lines.push({ rest: start + container, end: start + raw.trimEnd().length });
    start = stop + 1;
  }
  return lines;
}

/** Shrink a span until it neither starts nor ends with white space; undefined when nothing is left. */
function trimmed(text: string, start: number, end: number, kind: SegmentKind): Span | undefined {
  let from = start;
  let to = end;
  while (from < to && WHITE.test(text.charAt(from))) from += 1;
  while (to > from && WHITE.test(text.charAt(to - 1))) to -= 1;
  return from < to ? { start: from, end: to, kind } : undefined;
}

function backtickRun(text: string, at: number, end: number): number {
  let run = 0;
  while (at + run < end && text.charAt(at + run) === "`") run += 1;
  return run;
}

/** The index of the next run of exactly `run` backticks at or after `from`, or -1. */
function closingRun(text: string, from: number, end: number, run: number): number {
  for (let at = from; at < end; at += 1) {
    if (text.charAt(at) !== "`") continue;
    const length = backtickRun(text, at, end);
    if (length === run) return at;
    at += length - 1;
  }
  return -1;
}

/** Whether the word ending at the `.` at `dot` is an abbreviation. */
function abbreviationAt(text: string, from: number, dot: number): boolean {
  let start = dot;
  while (start > from && !WHITE.test(text.charAt(start - 1))) start -= 1;
  const word = text
    .slice(start, dot + 1)
    .replace(/^[("'“‘[*_]+/, "")
    .toLowerCase();
  return ABBREVIATIONS.has(word);
}

/** Past the separator after a sentence: white space, and quote markers that open a line. */
function nextStart(text: string, from: number, end: number): number {
  let at = from;
  let lineOpen = false;
  while (at < end) {
    const char = text.charAt(at);
    if (char === "\n") lineOpen = true;
    else if (!(WHITE.test(char) || (lineOpen && char === ">"))) break;
    at += 1;
  }
  return at;
}

function sentences(text: string, start: number, end: number): readonly Span[] {
  const spans: Span[] = [];
  let from = start;
  let at = start;
  while (at < end) {
    const char = text.charAt(at);
    if (char === "`") {
      const run = backtickRun(text, at, end);
      const close = closingRun(text, at + run, end, run);
      at = close === -1 ? at + run : close + run;
      continue;
    }
    if (!TERMINAL.includes(char)) {
      at += 1;
      continue;
    }
    let after = at + 1;
    while (after < end && TERMINAL.includes(text.charAt(after))) after += 1;
    while (after < end && CLOSERS.includes(text.charAt(after))) after += 1;
    const ends = after === end || WHITE.test(text.charAt(after));
    if (ends && !(char === "." && abbreviationAt(text, from, at))) {
      const span = trimmed(text, from, after, "sentence");
      if (span !== undefined) spans.push(span);
      from = nextStart(text, after, end);
      at = from;
    } else at = after;
  }
  const rest = trimmed(text, from, end, "sentence");
  if (rest !== undefined) spans.push(rest);
  return spans;
}

/** The end of the fence opened on line `open`: the line that closes it, or the last line. */
function fenceEnd(text: string, lines: readonly Line[], open: number, marker: string): number {
  const char = marker.charAt(0);
  for (let index = open + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) break;
    const rest = text.slice(line.rest, line.end);
    if (rest.length >= marker.length && [...rest].every((c) => c === char)) return index;
  }
  return lines.length - 1;
}

function spansOf(text: string, from: number): readonly Span[] {
  const lines = linesOf(text, from);
  const spans: Span[] = [];
  let paragraph: { start: number; end: number } | undefined;
  const closeParagraph = (): void => {
    if (paragraph !== undefined) spans.push(...sentences(text, paragraph.start, paragraph.end));
    paragraph = undefined;
  };
  const whole = (line: Line, kind: SegmentKind): void => {
    closeParagraph();
    const span = trimmed(text, line.rest, line.end, kind);
    if (span !== undefined) spans.push(span);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) break;
    const rest = text.slice(line.rest, line.end);
    const fence = FENCE.exec(rest)?.[0];
    if (rest === "" || RULE.test(rest)) closeParagraph();
    else if (fence !== undefined) {
      const close = fenceEnd(text, lines, index, fence);
      closeParagraph();
      const span = trimmed(text, line.rest, lines[close]?.end ?? line.end, "fence");
      if (span !== undefined) spans.push(span);
      index = close;
    } else if (HEADING.test(rest)) whole(line, "heading");
    else if (rest.startsWith("|")) whole(line, "row");
    else {
      const marker = ITEM.exec(rest)?.[0];
      if (marker !== undefined) {
        closeParagraph();
        paragraph = { start: line.rest + marker.length, end: line.end };
      } else if (paragraph === undefined) paragraph = { start: line.rest, end: line.end };
      else paragraph.end = line.end;
    }
  }
  closeParagraph();
  return spans;
}

/**
 * Split a prose file into its front matter, segments and separators.
 * @param text the file's text
 * @returns the segmented file; {@link joinSegments} gives `text` back exactly
 */
export function segmentProse(text: string): SegmentedFile {
  const frontMatter = FRONT_MATTER.exec(text)?.[0] ?? "";
  const seen = new Map<string, number>();
  const segments: Segment[] = [];
  let previous = frontMatter.length;
  for (const [index, span] of spansOf(text, frontMatter.length).entries()) {
    const content = text.slice(span.start, span.end);
    const digest = sha256Hex(content).slice(0, 12);
    const count = (seen.get(digest) ?? 0) + 1;
    seen.set(digest, count);
    const lineStart = text.lastIndexOf("\n", span.start - 1) + 1;
    segments.push({
      // SAFETY: SegmentId is twelve hex characters of a sha256 digest with an
      // optional `#n` for the n-th duplicate, which is exactly what is built here.
      id: (count === 1 ? digest : `${digest}#${count}`) as SegmentId,
      kind: span.kind,
      text: content,
      index,
      separator: text.slice(previous, span.start),
      lead: lineStart >= previous ? text.slice(lineStart, span.start) : "",
    });
    previous = span.end;
  }
  return { frontMatter, segments, trailer: text.slice(previous) };
}

/**
 * Join a segmented file back into its text.
 * @param file a file from {@link segmentProse}
 * @returns the bytes it was split from
 */
export function joinSegments(file: SegmentedFile): string {
  return (
    file.frontMatter +
    file.segments.map((segment) => segment.separator + segment.text).join("") +
    file.trailer
  );
}

/**
 * The words of a text: runs of letters and digits, an inner apostrophe
 * kept. Growth, the stub trigger and the repeat check count these.
 * @param text any text
 * @returns its words in order
 */
export function wordsOf(text: string): readonly string[] {
  return text.match(WORD) ?? [];
}
