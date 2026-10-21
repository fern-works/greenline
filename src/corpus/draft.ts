import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { err, ok, type Result } from "../commons/result.ts";
import { parseJson } from "../core/contract.ts";
import {
  changedCharacters,
  isAuthored,
  RecipeRefused,
  repeatsWords,
  FILL_MARKER,
  withinEditShare,
  type Account,
  type AuthoredCopy,
  type Copy,
  type Drop,
  type Edit,
  type Ending,
  type FrontMatterField,
  type Passage,
  type ProseFile,
  type Recipe,
  type RecipeIssue,
  type Snapshots,
  type SourceName,
} from "./recipe.ts";
import { frontMatterBlock, type SkillFile } from "./render.ts";
import { segmentProse, type Segment, type SegmentedFile } from "./segments.ts";

/**
 * The draft (`workshop/components/recipes.md`, "Drafting a recipe"): a
 * proposed recipe from a committed skill directory and the snapshot of the
 * upstream skill it was copied from. It only proposes; the gate relies on
 * the rendered bytes alone.
 *
 * The alignment, file by file. Each prose file of the copy is segmented
 * (`segments.ts`) beside the upstream file at the same path, when there is
 * one. A longest common run of equal segments anchors the two; a copy
 * segment equal to an upstream segment no anchor holds is taken out of
 * order. Between two anchors, a copy segment and an upstream segment of the
 * same kind whose difference stays within half the upstream segment's
 * characters pair as a taken segment with one edit: its find text is the
 * smallest differing span, widened one character at a time until it occurs
 * once. A copy segment with no partner is written; an upstream segment with
 * no partner is dropped. Consecutive taken segments form one passage while
 * they follow each other upstream and the copy keeps the source's
 * separator; a passage's `join` is stated only where the join rule
 * (`render.ts`) would not reproduce the copy's separator, and a taken
 * segment whose separator no join can carry is written instead. A prose
 * file that ends other than with one newline states its `ending`. Files that
 * are not prose are copies of the same path in the snapshot; one the
 * snapshot does not hold is authored, held by its digest.
 *
 * Every account is left as {@link FILL_MARKER}, its kind and its reason
 * alike, which every verb but `draft` refuses until it is filled: the
 * draft proposes the alignment, and the reasons are the recorder's. A
 * written passage that repeats a dropped segment (`repeatsWords`) credits
 * its source, and the drop names the first such passage as its
 * replacement.
 *
 * The native draft ({@link draftNative}): a skill copied from no upstream
 * becomes written passages, one per top-level section of each prose file
 * (the text before the first `##` heading first), each a `method` item
 * whose reason and ruling are left as {@link FILL_MARKER}; its front matter
 * is the file's fields, which the renderer writes in the canonical form.
 */

/** An account before it is filled: held with the reason {@link FILL_MARKER}, and written with that kind too. */
const UNKNOWN: Account = { kind: "scope", reason: FILL_MARKER };

/** What `draft` reads for one skill. */
export interface DraftInput {
  readonly skill: string;
  /** The manifest's source the skill was copied from. */
  readonly source: SourceName;
  /** The upstream skill's directory inside the source's snapshot. */
  readonly upstream: string;
  readonly snapshots: Snapshots;
  /** The committed skill directory. */
  readonly copy: readonly SkillFile[];
  /** Whether to propose a stub: every copy segment written, and the upstream skill credited with its ruling left as {@link FILL_MARKER}. */
  readonly stub: boolean;
}

/** A proposed recipe and how many of its accounts are left as {@link FILL_MARKER}. */
export interface Drafted {
  readonly recipe: Recipe;
  readonly todos: number;
}

/** A native skill's proposed recipe, and its committed directory as the recipe renders it: the front matter canonical, every other byte unchanged. */
export interface NativeDrafted extends Drafted {
  readonly normalized: readonly SkillFile[];
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const FIELD_LINE = /^([a-z][\w-]*): (.*)$/;
const LEADING_WHITE = /^\s*/;
const WHITE_ONLY = /^\s+$/;
const quoted = z.string().min(1);
/** A plain YAML scalar the native front matter may hold unquoted: no indicator first, no comment, no `: `, no white space at either end. */
const PLAIN_SCALAR = /^(?![-?:,[\]{}#&*!|>'"%@`\s])(?!.*(?:: | #))(?!.*\s$).+$/;
/** A plain scalar YAML reads as a boolean, a null or a number rather than a string, which the canonical form would turn into a string. */
const NOT_A_STRING =
  /^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d+)(?:e[-+]?\d+)?|0x[\da-f]+|0o[0-7]+|[-+]?\.inf|\.nan)$/i;
/** A top-level section's heading: two `#` marks and a space. */
const SECTION_HEADING = /^## /;

/**
 * Index pairs of a longest common run of equal texts, in order.
 * @param before the texts on one side
 * @param after the texts on the other
 * @returns each anchored pair as its two indices, in order
 */
export function commonRun(
  before: readonly string[],
  after: readonly string[],
): readonly (readonly [number, number])[] {
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  const at = (i: number, j: number): number => table[i * width + j] ?? 0;
  for (let i = before.length - 1; i >= 0; i -= 1)
    for (let j = after.length - 1; j >= 0; j -= 1)
      table[i * width + j] =
        before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const pairs: (readonly [number, number])[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j] && at(i, j) === at(i + 1, j + 1) + 1) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) i += 1;
    else j += 1;
  }
  return pairs;
}

/** The characters an edit of `before` into `after` changes, or undefined when they may not pair. */
function editCost(before: Segment, after: Segment): number | undefined {
  if (before.kind !== after.kind || before.text === after.text) return undefined;
  const changed = changedCharacters(before.text, after.text);
  return withinEditShare(changed, before.text.length) ? changed : undefined;
}

/** The pairs of a gap that become edits: the most pairs in order, then the fewest characters changed. */
function editPairs(
  before: readonly Segment[],
  after: readonly Segment[],
): readonly (readonly [Segment, Segment])[] {
  const width = after.length + 1;
  const pairValue = 1_000_000;
  const table = new Float64Array((before.length + 1) * width);
  const at = (i: number, j: number): number => table[i * width + j] ?? 0;
  const cost = (i: number, j: number): number | undefined => {
    const left = before[i];
    const right = after[j];
    return left === undefined || right === undefined ? undefined : editCost(left, right);
  };
  for (let i = before.length - 1; i >= 0; i -= 1)
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const changed = cost(i, j);
      const paired = changed === undefined ? -1 : pairValue - changed + at(i + 1, j + 1);
      table[i * width + j] = Math.max(at(i + 1, j), at(i, j + 1), paired);
    }
  const pairs: (readonly [Segment, Segment])[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const changed = cost(i, j);
    const left = before[i];
    const right = after[j];
    if (
      changed !== undefined &&
      left !== undefined &&
      right !== undefined &&
      at(i, j) === pairValue - changed + at(i + 1, j + 1)
    ) {
      pairs.push([left, right]);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) i += 1;
    else j += 1;
  }
  return pairs;
}

/**
 * Each copy segment's upstream partner, by copy index: equal in order,
 * equal out of order, or paired as an edit. `refresh` aligns a source
 * file's old segments with its new ones this way, and `intake` a
 * candidate's with a roster skill's.
 * @param upstream the segments a partner is taken from, each `index` its place among them
 * @param copy the segments that look for a partner, each `index` its place among them
 * @returns each copy segment's partner, by its index
 */
export function partners(
  upstream: readonly Segment[],
  copy: readonly Segment[],
): ReadonlyMap<number, Segment> {
  const partner = new Map<number, Segment>();
  const used = new Set<number>();
  const anchors = commonRun(
    upstream.map((segment) => segment.text),
    copy.map((segment) => segment.text),
  );
  for (const [i, j] of anchors) {
    const segment = upstream[i];
    if (segment === undefined) continue;
    partner.set(j, segment);
    used.add(i);
  }
  for (const segment of copy) {
    if (partner.has(segment.index)) continue;
    const equal = upstream.find(
      (candidate) => !used.has(candidate.index) && candidate.text === segment.text,
    );
    if (equal === undefined) continue;
    partner.set(segment.index, equal);
    used.add(equal.index);
  }
  const bounds: readonly (readonly [number, number])[] = [
    [-1, -1],
    ...anchors,
    [upstream.length, copy.length],
  ];
  for (let gap = 1; gap < bounds.length; gap += 1) {
    const [fromU, fromC] = bounds[gap - 1] ?? [-1, -1];
    const [toU, toC] = bounds[gap] ?? [upstream.length, copy.length];
    const left = upstream.filter((s) => s.index > fromU && s.index < toU && !used.has(s.index));
    const right = copy.filter((s) => s.index > fromC && s.index < toC && !partner.has(s.index));
    for (const [u, c] of editPairs(left, right)) {
      partner.set(c.index, u);
      used.add(u.index);
    }
  }
  return partner;
}

/** One find and its replacement. */
export interface FindReplace {
  readonly find: string;
  readonly replace: string;
}

/**
 * One find and replace turning a segment's text into the copy's: the
 * smallest differing span, widened until the find text occurs exactly once.
 * @param before the segment's text
 * @param after the text the edit gives
 * @returns the find text and its replacement
 */
export function editOf(before: string, after: string): FindReplace {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start])
    start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end += 1;
  let from = start;
  let to = before.length - end;
  const once = (find: string): boolean => {
    const first = before.indexOf(find);
    return find.length > 0 && first !== -1 && before.indexOf(find, first + 1) === -1;
  };
  while (!once(before.slice(from, to))) {
    if (from > 0) from -= 1;
    if (to < before.length) to += 1;
  }
  return {
    find: before.slice(from, to),
    replace: after.slice(from, after.length - (before.length - to)),
  };
}

/** A passage being built: a taken run, or written text with its account. */
type Open =
  | {
      readonly passage: "taken";
      readonly segments: Segment[];
      readonly edits: Edit[];
      readonly join: string | undefined;
    }
  | {
      readonly passage: "written";
      text: string;
      readonly account: Account;
      readonly join: string | undefined;
    };

/** What drafting one prose file needs beside its segments. */
interface FileContext {
  readonly source: SourceName;
  readonly path: string;
  /** The file's path inside the source's snapshot. */
  readonly file: string;
  /** The separator the first passage stands after: the blank line under `SKILL.md`'s front matter, else nothing. */
  readonly base: string;
}

/** The join a new taken passage needs before it, or undefined when no join can carry the copy's separator. */
function takenJoin(
  separator: string,
  lead: string,
  previous: Open | undefined,
  continues: boolean,
  base: string,
): { readonly join: string | undefined } | undefined {
  if (previous === undefined) return separator === base + lead ? { join: undefined } : undefined;
  if (!continues && separator === `\n\n${lead}`) return { join: undefined };
  const rest = separator.slice(0, separator.length - lead.length);
  return separator.endsWith(lead) && WHITE_ONLY.test(rest) ? { join: rest } : undefined;
}

function finish(open: Open, context: FileContext): Passage {
  if (open.passage === "written")
    return { passage: "written", text: open.text, ...open.account, credits: [], join: open.join };
  return {
    passage: "taken",
    source: context.source,
    file: context.file,
    segments: open.segments.map((segment) => segment.id),
    edits: open.edits,
    join: open.join,
  };
}

/** One prose file's passages, the upstream segments they take, and its ending when it is not one newline. */
interface DraftedFile {
  readonly passages: readonly Passage[];
  readonly taken: ReadonlySet<number>;
  readonly ending: Ending | undefined;
}

/**
 * The ending a file states, when its trailer is one of the endings other than one newline.
 * @param trailer the white space after the file's last segment
 * @returns the ending to state, or undefined when the trailer is one newline or none of the endings
 */
function statedEnding(trailer: string): Ending | undefined {
  return trailer === "\r\n" || trailer === "" ? trailer : undefined;
}

function draftProse(
  copy: SegmentedFile,
  partner: ReadonlyMap<number, Segment>,
  context: FileContext,
): DraftedFile | RecipeIssue {
  const passages: Passage[] = [];
  const taken = new Set<number>();
  let open: Open | undefined;
  const start = (next: Open): void => {
    if (open !== undefined) passages.push(finish(open, context));
    open = next;
  };
  for (const segment of copy.segments) {
    const upstream = partner.get(segment.index);
    if (upstream !== undefined) {
      const edits: Edit[] =
        upstream.text === segment.text
          ? []
          : [
              {
                segment: upstream.id,
                ...editOf(upstream.text, segment.text),
                ...UNKNOWN,
              },
            ];
      const last = open?.passage === "taken" ? open.segments.at(-1) : undefined;
      const continues = last !== undefined && upstream.index === last.index + 1;
      if (open?.passage === "taken" && continues && segment.separator === upstream.separator) {
        open.segments.push(upstream);
        open.edits.push(...edits);
        taken.add(upstream.index);
        continue;
      }
      const join = takenJoin(segment.separator, upstream.lead, open, continues, context.base);
      if (join !== undefined) {
        start({ passage: "taken", segments: [upstream], edits, join: join.join });
        taken.add(upstream.index);
        continue;
      }
    }
    const white = LEADING_WHITE.exec(segment.separator)?.[0] ?? "";
    const rest = segment.separator.slice(white.length);
    // Every account is the fill marker, so consecutive written segments make one passage.
    if (open?.passage === "written") {
      open.text += segment.separator + segment.text;
      continue;
    }
    if (open === undefined ? white !== context.base : white === "")
      return {
        segment: segment.id,
        message: `'${context.path}' places segment ${segment.id} after '${JSON.stringify(segment.separator)}', which no join can carry`,
      };
    start({
      passage: "written",
      text: rest + segment.text,
      account: UNKNOWN,
      join: open === undefined || white === "\n\n" ? undefined : white,
    });
  }
  if (open === undefined) return { message: `'${context.path}' holds no segment` };
  const closing: Open = open;
  const ending = statedEnding(copy.trailer);
  if (copy.trailer !== "\n" && ending === undefined) {
    const tail = copy.trailer.slice(0, -1);
    if (closing.passage !== "written" || !copy.trailer.endsWith("\n") || tail.trimEnd() !== tail)
      return {
        message: `'${context.path}' ends with '${JSON.stringify(copy.trailer)}', not one newline`,
      };
    closing.text += tail;
  }
  passages.push(finish(closing, context));
  return { passages, taken, ending };
}

/** `SKILL.md`'s front matter as the recipe's fields, or undefined when the renderer would not write it so. */
function frontMatterOf(text: string): readonly FrontMatterField[] | undefined {
  if (!text.startsWith("---\n") || !text.endsWith("\n---\n")) return undefined;
  const fields: FrontMatterField[] = [];
  for (const line of text.slice("---\n".length, -"\n---\n".length).split("\n")) {
    const match = FIELD_LINE.exec(line);
    const value = quoted.safeParse(parseJson(match?.[2] ?? ""));
    if (
      match?.[1] === undefined ||
      !value.success ||
      `${match[1]}: ${JSON.stringify(value.data)}` !== line
    )
      return undefined;
    fields.push({ field: match[1], value: value.data });
  }
  return fields;
}

function utf8(bytes: Uint8Array): string | undefined {
  try {
    return decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/**
 * Draft a recipe from a committed copy and its upstream snapshot, every
 * account left as {@link FILL_MARKER}.
 * @param input the skill, its source and upstream directory, the snapshots and the committed files
 * @returns the proposed recipe with its count of {@link FILL_MARKER} accounts, or every place the recipe cannot express
 */
export function draftRecipe(input: DraftInput): Result<Drafted, RecipeRefused> {
  const { skill, source, snapshots } = input;
  const issues: RecipeIssue[] = [];
  const files: ProseFile[] = [];
  const copies: Copy[] = [];
  const drops: Drop[] = [];
  let frontMatter: readonly FrontMatterField[] = [];
  const ordered = [...input.copy].sort((left, right) =>
    left.path === "SKILL.md" ? -1 : right.path === "SKILL.md" ? 1 : 0,
  );
  for (const { path, bytes } of ordered) {
    const file = `${input.upstream}/${path}`;
    if (!path.endsWith(".md")) {
      const upstream = snapshots.bytes(source, file);
      if (upstream === undefined) {
        copies.push(authoredCopy(path, bytes));
        continue;
      }
      if (!sameBytes(upstream, bytes))
        issues.push({ message: `'${path}' is not prose and not a copy of '${source}/${file}'` });
      else copies.push({ path, source, file });
      continue;
    }
    const text = utf8(bytes);
    if (text === undefined) {
      issues.push({ message: `'${path}' is not UTF-8 text` });
      continue;
    }
    const copy = segmentProse(text);
    if (path === "SKILL.md") {
      const fields = frontMatterOf(copy.frontMatter);
      if (fields === undefined)
        issues.push({ message: `'SKILL.md' has no front matter the renderer writes` });
      else frontMatter = fields;
    } else if (copy.frontMatter !== "")
      issues.push({ message: `'${path}' has front matter, which only SKILL.md carries` });
    const before = snapshots.text(source, file);
    const upstream = before === undefined ? undefined : segmentProse(before);
    const partner = input.stub
      ? new Map<number, Segment>()
      : partners(upstream?.segments ?? [], copy.segments);
    const drafted = draftProse(copy, partner, {
      source,
      path,
      file,
      base: path === "SKILL.md" ? "\n" : "",
    });
    if ("message" in drafted) {
      issues.push(drafted);
      continue;
    }
    files.push({ path, passages: drafted.passages, ending: drafted.ending });
    for (const segment of upstream?.segments ?? [])
      if (!drafted.taken.has(segment.index))
        drops.push({
          source,
          file,
          segment: segment.id,
          ...UNKNOWN,
        });
  }
  if (issues.length > 0) return err(new RecipeRefused(skill, issues));
  const credited = creditRepeats(files, drops, source, snapshots);
  const named =
    input.stub ||
    copies.some((copy) => !isAuthored(copy)) ||
    drops.length > 0 ||
    credited.files.some((file) =>
      file.passages.some((item) => item.passage === "taken" || item.credits.length > 0),
    );
  const recipe: Recipe = {
    name: skill,
    frontMatter,
    sources: named ? [source] : [],
    files: credited.files,
    copies,
    drops: credited.drops,
    credit: input.stub
      ? { source, file: `${input.upstream}/SKILL.md`, ruling: FILL_MARKER }
      : undefined,
  };
  return ok({ recipe, todos: todoCount(recipe) });
}

/**
 * A file the snapshot does not hold and that is not prose: authored, held by
 * the digest of its committed bytes, its account left as {@link FILL_MARKER}.
 * @param path the file's path in the skill directory
 * @param bytes its committed bytes
 * @returns the authored copy
 */
function authoredCopy(path: string, bytes: Uint8Array): AuthoredCopy {
  const { kind, reason } = UNKNOWN;
  return { path, sha256: sha256Hex(bytes), kind, reason };
}

/** A native passage's account before it is filled: a `method` item, its reason and ruling the fill marker. */
const NATIVE: Account = { kind: "method", reason: FILL_MARKER, ruling: FILL_MARKER };

/**
 * A native `SKILL.md`'s front matter as the recipe's fields: each line a
 * field and a value, double-quoted or plain, a plain value YAML reads as a
 * boolean, a null or a number refused.
 * @param text the front matter, both `---` lines included
 * @returns the fields in order, or undefined when a line is neither form
 */
function nativeFrontMatter(text: string): readonly FrontMatterField[] | undefined {
  if (!text.startsWith("---\n") || !text.endsWith("\n---\n")) return undefined;
  const fields: FrontMatterField[] = [];
  for (const line of text.slice("---\n".length, -"\n---\n".length).split("\n")) {
    const match = FIELD_LINE.exec(line);
    const field = match?.[1];
    const raw = match?.[2] ?? "";
    const value = raw.startsWith('"')
      ? quoted.safeParse(parseJson(raw)).data
      : PLAIN_SCALAR.test(raw) && !NOT_A_STRING.test(raw)
        ? raw
        : undefined;
    if (field === undefined || value === undefined) return undefined;
    fields.push({ field, value });
  }
  return fields;
}

/**
 * One native prose file as written passages, one per top-level section:
 * the text before the first `##` heading, then each `##` heading through
 * the white space before the next; the white space between two passages is
 * the later one's join when it is not one blank line, and the file's last
 * is its ending.
 * @param path the file's path in the skill directory
 * @param text the file's text
 * @param start where the first passage starts: after the front matter and its blank line in `SKILL.md`
 * @returns the prose file, or the place no passage can carry
 */
function nativeProse(path: string, text: string, start: number): ProseFile | RecipeIssue {
  const segmented = segmentProse(text);
  const starts = [start];
  let at = segmented.frontMatter.length;
  for (const segment of segmented.segments) {
    at += segment.separator.length;
    if (
      segment.kind === "heading" &&
      SECTION_HEADING.test(segment.text) &&
      segment.lead === "" &&
      at > start &&
      text[at - 1] === "\n"
    )
      starts.push(at);
    at += segment.text.length;
  }
  if (WHITE_ONLY.test(text.slice(start, start + 1)) || start >= text.length)
    return { message: `'${path}' opens its body with white space, which no passage carries` };
  const passages: Passage[] = [];
  let gap: string | undefined;
  for (const [index, from] of starts.entries()) {
    const piece = text.slice(from, starts[index + 1] ?? text.length);
    const body = piece.trimEnd();
    passages.push({
      passage: "written",
      text: body,
      ...NATIVE,
      credits: [],
      join: gap === undefined || gap === "\n\n" ? undefined : gap,
    });
    gap = piece.slice(body.length);
  }
  const ending = gap ?? "\n";
  if (ending !== "\n" && ending !== "\r\n" && ending !== "")
    return { message: `'${path}' ends with '${JSON.stringify(ending)}', which no ending states` };
  return { path, passages, ending: ending === "\n" ? undefined : ending };
}

/** What `draft --native` reads for one skill. */
export interface NativeInput {
  readonly skill: string;
  /** The committed skill directory. */
  readonly copy: readonly SkillFile[];
}

/**
 * Draft a native skill's recipe: no source; its front matter the fields of
 * the committed `SKILL.md`; each prose file written passages, one per
 * top-level section, each a `method` item with its reason and ruling left
 * as {@link FILL_MARKER}; a file that is not prose authored, held by its
 * digest, its kind and reason left as {@link FILL_MARKER}.
 * @param input the skill and its committed files
 * @returns the proposed recipe, its count of fill markers and the directory it renders, or every place the recipe cannot express
 */
export function draftNative(input: NativeInput): Result<NativeDrafted, RecipeRefused> {
  const issues: RecipeIssue[] = [];
  const files: ProseFile[] = [];
  const copies: Copy[] = [];
  const normalized: SkillFile[] = [];
  let frontMatter: readonly FrontMatterField[] = [];
  const ordered = [...input.copy].sort((left, right) =>
    left.path === "SKILL.md" ? -1 : right.path === "SKILL.md" ? 1 : 0,
  );
  for (const { path, bytes } of ordered) {
    const text = path.endsWith(".md") ? utf8(bytes) : undefined;
    if (!path.endsWith(".md")) {
      copies.push({ path, sha256: sha256Hex(bytes), ...UNKNOWN });
      normalized.push({ path, bytes });
      continue;
    }
    if (text === undefined) {
      issues.push({ message: `'${path}' is not UTF-8 text` });
      continue;
    }
    const head = segmentProse(text).frontMatter;
    let start = 0;
    let rendered = text;
    if (path === "SKILL.md") {
      const fields = nativeFrontMatter(head);
      if (fields === undefined || text.slice(head.length, head.length + 1) !== "\n") {
        issues.push({
          message:
            "'SKILL.md' has no front matter of plain or double-quoted fields and a blank line after it",
        });
        continue;
      }
      frontMatter = fields;
      start = head.length + 1;
      rendered = frontMatterBlock(fields) + text.slice(start);
    } else if (head !== "") {
      issues.push({ message: `'${path}' has front matter, which only SKILL.md carries` });
      continue;
    }
    const prose = nativeProse(path, text, start);
    if ("message" in prose) issues.push(prose);
    else files.push(prose);
    normalized.push({ path, bytes: encoder.encode(rendered) });
  }
  if (issues.length > 0) return err(new RecipeRefused(input.skill, issues));
  const recipe: Recipe = {
    name: input.skill,
    frontMatter,
    sources: [],
    files,
    copies,
    drops: [],
    credit: undefined,
  };
  return ok({ recipe, todos: todoCount(recipe), normalized });
}

/** The files and drops after the credits. */
interface Credited {
  readonly files: readonly ProseFile[];
  readonly drops: readonly Drop[];
}

/** Credit the source in every written passage that repeats a dropped segment, and name the first as the drop's replacement. */
function creditRepeats(
  files: readonly ProseFile[],
  drops: readonly Drop[],
  source: SourceName,
  snapshots: Snapshots,
): Credited {
  const texts = new Map<string, string>();
  for (const drop of drops) {
    const file = snapshots.text(drop.source, drop.file);
    const segment =
      file === undefined
        ? undefined
        : segmentProse(file).segments.find((s) => s.id === drop.segment);
    if (segment !== undefined) texts.set(`${drop.file}#${drop.segment}`, segment.text);
  }
  const replaced = new Map<Drop, { readonly path: string; readonly passage: number }>();
  const credited = files.map((file) => ({
    ...file,
    passages: file.passages.map((item, index): Passage => {
      if (item.passage === "taken") return item;
      const repeated = drops.filter((drop) =>
        repeatsWords(item.text, texts.get(`${drop.file}#${drop.segment}`) ?? ""),
      );
      for (const drop of repeated)
        if (!replaced.has(drop)) replaced.set(drop, { path: file.path, passage: index });
      return repeated.length === 0 ? item : { ...item, credits: [source] };
    }),
  }));
  return {
    files: credited,
    drops: drops.map((drop) => {
      const replacement = replaced.get(drop);
      return replacement === undefined ? drop : { ...drop, replacedBy: replacement };
    }),
  };
}

function* accountsOf(recipe: Recipe): Generator<Account> {
  for (const file of recipe.files)
    for (const item of file.passages)
      if (item.passage === "written") yield item;
      else yield* item.edits;
  yield* recipe.copies.filter(isAuthored);
  yield* recipe.drops;
}

function todoCount(recipe: Recipe): number {
  let count = recipe.credit?.ruling === FILL_MARKER ? 1 : 0;
  for (const entry of recipe.notStub ?? []) count += entry.ruling === FILL_MARKER ? 1 : 0;
  for (const account of accountsOf(recipe))
    count += (account.reason === FILL_MARKER ? 1 : 0) + (account.ruling === FILL_MARKER ? 1 : 0);
  return count;
}

/** Print width the formatter keeps an array of strings on one line within. */
const PRINT_WIDTH = 100;

/** A value as the recipe file prints it: a scalar, a list of strings, an object or a list of objects. */
type Printed =
  | { readonly scalar: string }
  | { readonly strings: readonly string[] }
  | { readonly fields: readonly (readonly [string, Printed | undefined])[] }
  | { readonly objects: readonly Printed[] };

const scalar = (value: string | number): Printed => ({ scalar: JSON.stringify(value) });

function printed(value: Printed, indent: string, head: number, tail: number): string {
  if ("scalar" in value) return value.scalar;
  const inner = `${indent}  `;
  if ("strings" in value) {
    const items = value.strings.map((item) => JSON.stringify(item));
    const line = `[${items.join(", ")}]`;
    return items.length === 0 || head + line.length + tail <= PRINT_WIDTH
      ? line
      : `[\n${items.map((item) => inner + item).join(",\n")}\n${indent}]`;
  }
  if ("objects" in value)
    return value.objects.length === 0
      ? "[]"
      : `[\n${value.objects.map((item) => inner + printed(item, inner, inner.length, 0)).join(",\n")}\n${indent}]`;
  const fields = value.fields.flatMap(([key, field]): (readonly [string, Printed])[] =>
    field === undefined ? [] : [[key, field]],
  );
  if (fields.length === 0) return "{}";
  return `{\n${fields
    .map(([key, field], index) => {
      const lead = `${inner}${JSON.stringify(key)}: `;
      return lead + printed(field, inner, lead.length, index < fields.length - 1 ? 1 : 0);
    })
    .join(",\n")}\n${indent}}`;
}

/** The accounts whose kind a recipe's text holds as the fill marker though their reason is stated. */
type Unread = ReadonlySet<Account>;

function accountFields(
  account: Account,
  unread: Unread,
): readonly (readonly [string, Printed | undefined])[] {
  return [
    [
      "kind",
      scalar(
        (account.reason === FILL_MARKER && account.ruling === undefined) || unread.has(account)
          ? FILL_MARKER
          : account.kind,
      ),
    ],
    ["reason", scalar(account.reason)],
    ["gist", account.gist === undefined ? undefined : scalar(account.gist)],
    ["ruling", account.ruling === undefined ? undefined : scalar(account.ruling)],
  ];
}

function passageValue(item: Passage, unread: Unread): Printed {
  const join: readonly [string, Printed | undefined] = [
    "join",
    item.join === undefined ? undefined : scalar(item.join),
  ];
  if (item.passage === "written")
    return {
      fields: [
        ["passage", scalar("written")],
        ["text", scalar(item.text)],
        ...accountFields(item, unread),
        ["credits", item.credits.length === 0 ? undefined : { strings: item.credits }],
        join,
      ],
    };
  return {
    fields: [
      ["passage", scalar("taken")],
      ["source", scalar(item.source)],
      ["file", scalar(item.file)],
      ["segments", { strings: item.segments }],
      [
        "edits",
        item.edits.length === 0
          ? undefined
          : {
              objects: item.edits.map((edit) => ({
                fields: [
                  ["segment", scalar(edit.segment)],
                  ["find", scalar(edit.find)],
                  ["replace", scalar(edit.replace)],
                  ...accountFields(edit, unread),
                ],
              })),
            },
      ],
      join,
    ],
  };
}

/**
 * A recipe's file text, in the form the formatter leaves as it is: two
 * spaces, every object open, a list of strings on one line when it fits
 * in {@link PRINT_WIDTH} characters; an account held as {@link FILL_MARKER} is
 * written with the kind {@link FILL_MARKER}, and so is every account in
 * `unread`, whose reason `refresh` states and whose kind a reader chooses.
 * @param recipe a recipe, drafted, re-anchored or filled
 * @param unread the accounts whose kind is written as {@link FILL_MARKER}
 * @returns its JSON text with a closing newline
 */
export function recipeText(recipe: Recipe, unread: Unread = new Set()): string {
  const value: Printed = {
    fields: [
      ["schema", scalar("greenline.recipe/v1")],
      ["name", scalar(recipe.name)],
      [
        "frontMatter",
        {
          objects: recipe.frontMatter.map((entry) => ({
            fields: [
              ["field", scalar(entry.field)],
              ["value", scalar(entry.value)],
            ],
          })),
        },
      ],
      ["sources", { strings: recipe.sources }],
      [
        "files",
        {
          objects: recipe.files.map((file) => ({
            fields: [
              ["path", scalar(file.path)],
              ["passages", { objects: file.passages.map((item) => passageValue(item, unread)) }],
              [
                "ending",
                file.ending === undefined || file.ending === "\n" ? undefined : scalar(file.ending),
              ],
              [
                "part",
                file.part === undefined || file.part === "front" ? undefined : scalar(file.part),
              ],
            ],
          })),
        },
      ],
      [
        "copies",
        {
          objects: recipe.copies.map((copy) => ({
            fields: isAuthored(copy)
              ? [
                  ["path", scalar(copy.path)],
                  ["sha256", scalar(copy.sha256)],
                  ...accountFields(copy, unread),
                ]
              : [
                  ["path", scalar(copy.path)],
                  ["source", scalar(copy.source)],
                  ["file", scalar(copy.file)],
                ],
          })),
        },
      ],
      [
        "drops",
        {
          objects: recipe.drops.map((drop) => ({
            fields: [
              ["source", scalar(drop.source)],
              ["file", scalar(drop.file)],
              ["segment", scalar(drop.segment)],
              ...accountFields(drop, unread),
              [
                "replacedBy",
                drop.replacedBy === undefined
                  ? undefined
                  : {
                      fields: [
                        ["path", scalar(drop.replacedBy.path)],
                        ["passage", scalar(drop.replacedBy.passage)],
                      ],
                    },
              ],
            ],
          })),
        },
      ],
      [
        "credit",
        recipe.credit === undefined
          ? undefined
          : {
              fields: [
                ["source", scalar(recipe.credit.source)],
                ["file", scalar(recipe.credit.file)],
                ["ruling", scalar(recipe.credit.ruling)],
              ],
            },
      ],
      [
        "notStub",
        recipe.notStub === undefined
          ? undefined
          : {
              objects: recipe.notStub.map((entry) => ({
                fields: [
                  ["source", scalar(entry.source)],
                  ["file", scalar(entry.file)],
                  ["ruling", scalar(entry.ruling)],
                ],
              })),
            },
      ],
    ],
  };
  return `${printed(value, "", 0, 0)}\n`;
}
