import { sha256Hex } from "../commons/hash.ts";
import type {
  AuthoredFile,
  CheckedFile,
  CheckedRecipe,
  FrontMatterField,
  ResolvedTaken,
  WrittenPassage,
} from "./recipe.ts";

/**
 * Render and verify (`workshop/components/recipes.md`): a checked recipe
 * becomes the bytes of its skill directory, deterministically, and
 * {@link compareSkill} names every way a committed directory differs.
 *
 * A prose file is its passages in order. A taken passage is its segments,
 * edited, joined by the source's own separators, opening with its first
 * segment's lead (the list marker, indentation or quote marker before it on
 * its line). The join rule: before every passage but a file's first stands
 * its `join` when it states one; else, when it and the passage before it are
 * taken from the same source file and its first segment follows the other's
 * last there, the source's own separator, without the lead; else one blank
 * line. A prose file ends with its `ending`, one newline unless it states
 * a carriage return and a newline or nothing. `SKILL.md` opens with its
 * front matter in the canonical form, each field a double-quoted JSON
 * string, and one blank line. An authored file is never rendered:
 * {@link compareSkill} requires it on disk at its digest.
 */

/** One file of a skill directory and its bytes. */
export interface SkillFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** One way a committed skill directory differs from its rendering. */
export interface Difference {
  readonly path: string;
  /** missing: rendered or authored, not committed; unexpected: committed, neither rendered nor authored; changed: both, bytes or digest differ. */
  readonly difference: "missing" | "unexpected" | "changed";
  /** For a changed text file, the first line that differs, from 1. */
  readonly line?: number | undefined;
}

const BLANK_LINE = "\n\n";
const encoder = new TextEncoder();

/**
 * `SKILL.md`'s front matter in the canonical form and the blank line after it.
 * @param fields the front matter's fields, in order
 * @returns each field a double-quoted JSON string, between the two `---` lines, and one blank line
 */
export function frontMatterBlock(fields: readonly FrontMatterField[]): string {
  return `---\n${fields.map(({ field, value }) => `${field}: ${JSON.stringify(value)}\n`).join("")}---\n\n`;
}

function continues(
  previous: ResolvedTaken | WrittenPassage | undefined,
  next: ResolvedTaken,
): boolean {
  if (previous?.passage !== "taken") return false;
  const last = previous.resolved.at(-1)?.segment.index;
  const first = next.resolved[0]?.segment.index;
  return (
    previous.source === next.source &&
    previous.file === next.file &&
    last !== undefined &&
    first === last + 1
  );
}

/** Where one passage stands in its rendered prose file. */
export interface PlacedPassage {
  readonly item: ResolvedTaken | WrittenPassage;
  /** The offset of the passage's text, after its join and lead, in UTF-16 code units. */
  readonly start: number;
  /** The offset just past the passage's text. */
  readonly end: number;
  /** For a taken passage, the offset at which each resolved segment's text starts, in order; none for a written one. */
  readonly segmentStarts: readonly number[];
}

/** A prose file rendered, without its front matter, and where each of its passages stands. */
export interface PlacedProse {
  readonly text: string;
  readonly passages: readonly PlacedPassage[];
}

/**
 * Render a prose file's passages under the join rule and place each one.
 * @param file a checked recipe's prose file
 * @returns the file's text after any front matter, with each passage's offsets in it
 */
export function placeProse(file: CheckedFile): PlacedProse {
  let out = "";
  let previous: ResolvedTaken | WrittenPassage | undefined;
  const passages: PlacedPassage[] = [];
  for (const item of file.passages) {
    const lead = item.passage === "taken" ? (item.resolved[0]?.segment.lead ?? "") : "";
    if (previous === undefined) out += lead;
    else if (item.join !== undefined) out += item.join + lead;
    else if (item.passage === "taken" && continues(previous, item))
      out += item.resolved[0]?.segment.separator ?? "";
    else out += BLANK_LINE + lead;
    const start = out.length;
    const segmentStarts: number[] = [];
    if (item.passage === "taken")
      for (const [index, taken] of item.resolved.entries()) {
        if (index !== 0) out += taken.segment.separator;
        segmentStarts.push(out.length);
        out += taken.text;
      }
    else out += item.text;
    passages.push({ item, start, end: out.length, segmentStarts });
    previous = item;
  }
  return { text: out + file.ending, passages };
}

/**
 * The skill directory a checked recipe renders: its prose files, `SKILL.md`
 * first, then its copies from the snapshots; never an authored file.
 * @param checked a recipe the snapshots accepted
 * @returns every file of the directory with its bytes
 */
export function renderSkill(checked: CheckedRecipe): readonly SkillFile[] {
  return [
    ...checked.files.map((file) => ({
      path: file.path,
      bytes: encoder.encode(
        (file.path === "SKILL.md" ? frontMatterBlock(checked.recipe.frontMatter) : "") +
          placeProse(file).text,
      ),
    })),
    ...checked.copies,
  ];
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function firstChangedLine(left: Uint8Array, right: Uint8Array): number {
  const decoder = new TextDecoder();
  const a = decoder.decode(left).split("\n");
  const b = decoder.decode(right).split("\n");
  let line = 0;
  while (line < a.length && line < b.length && a[line] === b[line]) line += 1;
  return line + 1;
}

/**
 * Compare a rendering with the committed directory, file by file: each
 * rendered file by its bytes, each authored file by its digest.
 * @param rendered the files {@link renderSkill} gives
 * @param committed the files on disk
 * @param authored the recipe's authored files, which the rendering never writes
 * @returns every difference, by path; empty when the bytes agree
 */
export function compareSkill(
  rendered: readonly SkillFile[],
  committed: readonly SkillFile[],
  authored: readonly AuthoredFile[] = [],
): readonly Difference[] {
  const onDisk = new Map(committed.map((file) => [file.path, file.bytes]));
  const made = new Set([...rendered, ...authored].map((file) => file.path));
  const differences: Difference[] = [];
  for (const file of authored) {
    const bytes = onDisk.get(file.path);
    if (bytes === undefined) differences.push({ path: file.path, difference: "missing" });
    else if (sha256Hex(bytes) !== file.sha256)
      differences.push({ path: file.path, difference: "changed" });
  }
  for (const file of rendered) {
    const bytes = onDisk.get(file.path);
    if (bytes === undefined) differences.push({ path: file.path, difference: "missing" });
    else if (!sameBytes(file.bytes, bytes))
      differences.push({
        path: file.path,
        difference: "changed",
        line: firstChangedLine(file.bytes, bytes),
      });
  }
  for (const file of committed)
    if (!made.has(file.path)) differences.push({ path: file.path, difference: "unexpected" });
  return differences.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}
