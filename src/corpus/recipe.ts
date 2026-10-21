import { z } from "zod";
import { shouldNeverHappen } from "../commons/defect.ts";
import { err, ok, type Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
  type InvalidField,
  type JsonValue,
} from "../core/contract.ts";
import {
  segmentProse,
  wordsOf,
  type Segment,
  type SegmentId,
  type SegmentedFile,
} from "./segments.ts";

/**
 * The recipe record (`corpus/recipes/<skill>.json`, schema
 * `greenline.recipe/v1`, `workshop/components/recipes.md`): the reviewed
 * definition of one roster skill. Its prose files are made of passages in
 * order, each taken from a source's frozen snapshot as a run of segments or
 * written by greenline; every segment of a source file it names is taken or
 * dropped with a reason; a prose file ends with one newline unless it
 * states its `ending`, a carriage return and a newline or nothing. Its
 * other files are copied whole from a snapshot, or, when greenline wrote
 * them, held by the digest of their committed bytes with a kind and a
 * reason: a copy has a source and a file, or a digest, never both. Every
 * account, a written passage's, an edit's, a drop's or an authored copy's,
 * may carry a gist, its reason shortened for the edition. A recipe with
 * only written passages and no credit is a native skill, with a credit a
 * stub; a recipe that takes an upstream skill body under the stub trigger
 * names it in `notStub` with the operator's ruling that it is not a stub
 * (`measure.ts`). {@link parseRecipe} refuses what one field or the record alone shows;
 * {@link checkRecipe} refuses what only the snapshots show, naming the
 * segment.
 */

/** The seven reasons for an edit, a drop or a written passage; only `method` changes what the method does. */
export const EDIT_KINDS = [
  "name",
  "home",
  "harness",
  "pointer",
  "scope",
  "correction",
  "method",
] as const;

/** One of {@link EDIT_KINDS}. */
export type EditKind = (typeof EDIT_KINDS)[number];

/** The `name` of an entry of the corpus manifest's `sources`, checked against the loaded manifest. */
export type SourceName = string & z.$brand<"SourceName">;

/** Why an item is there: its kind, its reason, its gist when one is written, and the operator's ruling on a `method` item. */
export interface Account {
  readonly kind: EditKind;
  readonly reason: string;
  /** The reason shortened for the edition's reader, within {@link gistIssues}' rule; optional. */
  readonly gist?: string | undefined;
  /** The operator's ruling; present exactly on a `method` item. */
  readonly ruling?: string | undefined;
}

/** The most words a gist holds. */
const GIST_WORDS = 12;

/**
 * Why a gist breaks the rule (`workshop/components/recipes.md`, "The
 * gist"): it holds at least one word and at most twelve, counted between
 * runs of white space; it ends without a full stop; and it carries no
 * middle dot and no em dash.
 * @param gist a gist as a recipe states it
 * @returns each broken part of the rule, none for a gist within it
 */
export function gistIssues(gist: string): readonly string[] {
  const words = gist.split(/\s+/).filter((word) => word !== "").length;
  return [
    ...(words === 0 ? ["a gist is a clause of at least one word"] : []),
    ...(words > GIST_WORDS
      ? [`a gist holds at most twelve words, and this one holds ${words}`]
      : []),
    ...(/\.\s*$/.test(gist) ? ["a gist ends without a full stop"] : []),
    ...(gist.includes("·") ? ["a gist carries no middle dot"] : []),
    ...(gist.includes("—") ? ["a gist carries no em dash"] : []),
  ];
}

/** A gist's schema, which refuses what {@link gistIssues} names. */
export const gistText: z.ZodType<string> = z.string().superRefine((value, context) => {
  for (const message of gistIssues(value)) context.addIssue({ code: "custom", message });
});

/** One find and replace inside one taken segment; the find text occurs exactly once in it. */
export interface Edit extends Account {
  readonly segment: SegmentId;
  readonly find: string;
  readonly replace: string;
}

/** A run of segments, contiguous in upstream order, taken from one source file. */
export interface TakenPassage {
  readonly passage: "taken";
  readonly source: SourceName;
  /** The file's path inside the source's snapshot. */
  readonly file: string;
  readonly segments: readonly SegmentId[];
  readonly edits: readonly Edit[];
  /** The exact white space placed before the passage (the join rule, `render.ts`). */
  readonly join?: string | undefined;
}

/** Text greenline writes, with its kind, reason and the sources it credits. */
export interface WrittenPassage extends Account {
  readonly passage: "written";
  readonly text: string;
  readonly credits: readonly SourceName[];
  /** The exact white space placed before the passage (the join rule, `render.ts`). */
  readonly join?: string | undefined;
}

/** One part of a prose file, in order. */
export type Passage = TakenPassage | WrittenPassage;

/** The bytes a prose file may end with after its last passage: one newline, the default, a carriage return and a newline, or nothing. */
export const ENDINGS = ["\n", "\r\n", ""] as const;

/** One of {@link ENDINGS}. */
export type Ending = (typeof ENDINGS)[number];

/**
 * The two parts a skill's prose files fall into (J-93 S2, N-56 item 2): the
 * front, the upstream prose the recipe cuts and merges, `SKILL.md` always
 * and any page of method it names; and the references, greenline's
 * mechanics for the skill (where its work lands, its record section's form,
 * its commands), written by greenline and read when the record is written.
 * The words budget counts the front's `SKILL.md`; a references page is
 * listed apart.
 */
const PARTS = ["front", "references"] as const;

/** One of {@link PARTS}. */
export type Part = (typeof PARTS)[number];

/** A prose file of the skill directory and its passages. */
export interface ProseFile {
  readonly path: string;
  readonly passages: readonly Passage[];
  /** The bytes after the last passage; one newline when omitted. */
  readonly ending?: Ending | undefined;
  /** The part the file belongs to; the front when omitted. */
  readonly part?: Part | undefined;
}

/** A file that is not prose, copied whole from a source's snapshot. */
export interface SourcedCopy {
  readonly path: string;
  readonly source: SourceName;
  readonly file: string;
}

/**
 * A file that is not prose and that greenline wrote: held by the sha256 of
 * its committed bytes, with its kind and reason, never rendered, and in no
 * measure. Its kind is never `method`, so it carries no ruling.
 */
export interface AuthoredCopy {
  readonly path: string;
  readonly sha256: string;
  readonly kind: EditKind;
  readonly reason: string;
  /** The reason shortened, when one is written. */
  readonly gist?: string | undefined;
}

/** A file that is not prose: copied from a source and a file, or authored and held by its digest, never both. */
export type Copy = SourcedCopy | AuthoredCopy;

/**
 * Whether a copy is authored: held by its digest, with no source.
 * @param copy a copy entry
 * @returns true for an {@link AuthoredCopy}
 */
export function isAuthored(copy: Copy): copy is AuthoredCopy {
  return "sha256" in copy;
}

/** Where a passage sits: a prose file's path and its place there, from 0. */
export interface PassageRef {
  readonly path: string;
  readonly passage: number;
}

/** The account of one segment the recipe does not take. */
export interface Drop extends Account {
  readonly source: SourceName;
  readonly file: string;
  readonly segment: SegmentId;
  /** The passage that replaced the segment, when one did. */
  readonly replacedBy?: PassageRef | undefined;
}

/** A stub's credit: the tiny upstream skill it was written from and the operator's ruling. */
export interface Credit {
  readonly source: SourceName;
  readonly file: string;
  readonly ruling: string;
}

/**
 * The operator's ruling that a taken upstream skill body under the stub
 * trigger is not a stub, in the credit's place: the body's source and file
 * and the ruling, which names its `docs/DECISIONS.md` row.
 */
export interface NotStub {
  readonly source: SourceName;
  readonly file: string;
  readonly ruling: string;
}

/** One field of `SKILL.md`'s front matter, in order. */
export interface FrontMatterField {
  readonly field: string;
  readonly value: string;
}

/** A parsed recipe. */
export interface Recipe {
  readonly name: string;
  /** `name` and `description` first, then any further field. */
  readonly frontMatter: readonly FrontMatterField[];
  readonly sources: readonly SourceName[];
  /** `SKILL.md` first. */
  readonly files: readonly ProseFile[];
  readonly copies: readonly Copy[];
  readonly drops: readonly Drop[];
  readonly credit?: Credit | undefined;
  /** The taken bodies under the stub trigger the operator ruled are not stubs; never beside a credit. */
  readonly notStub?: readonly NotStub[] | undefined;
}

/** The recipe's schema identifier. */
const RECIPE_SCHEMA = "greenline.recipe/v1";

/** The share of a segment's characters an edit may change; past it the sentence becomes a written passage. */
const EDIT_SHARE_LIMIT = 0.5;

/** How many consecutive words a written passage may not repeat from a dropped segment it does not credit. */
const REPEAT_LIMIT = 8;

/** The fill marker `draft` leaves in every kind and reason it cannot carry over; a recipe holding one is refused until it is filled. */
export const FILL_MARKER = "<<fill>>";

/** The reason of a drop whose segment its source removed upstream, which `refresh` writes; the commit is the one that removed it. */
const REMOVED_UPSTREAM = /^removed upstream at [0-9a-f]{40}$/;

/**
 * The reason `refresh` gives the drop of a segment upstream removed.
 * @param commit the full commit whose file no longer holds the segment
 * @returns `removed upstream at <commit>`
 */
export function removedUpstream(commit: string): string {
  return `removed upstream at ${commit}`;
}

/**
 * Whether a drop records a segment upstream removed: the one drop whose
 * segment, and whose file, the snapshot may no longer hold.
 * @param drop a drop
 * @returns true when its reason is {@link removedUpstream}'s
 */
function isRemovedUpstream(drop: Drop): boolean {
  return REMOVED_UPSTREAM.test(drop.reason);
}

const SKILL_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RELATIVE_PATH = /^(?!\/)(?!.*\/$)[\w.][\w./-]*$/;
const text = z.string().min(1);
const relativePath = z
  .string()
  .regex(RELATIVE_PATH)
  .refine(
    (path) => path.split("/").every((part) => part !== ".." && part !== "."),
    "a path stays inside its directory",
  );
const sourceName = z.string().regex(SKILL_NAME).brand<"SourceName">();
const segmentId = z
  .string()
  .regex(
    /^[0-9a-f]{12}(?:#[1-9][0-9]*)?$/,
    "a segment id is twelve hex characters and an optional #n",
  )
  .brand<"SegmentId">();
const join = z.string().regex(/^\s+$/, "a join is white space").optional();
/** A copy: a source and a file, or a digest with its kind and reason, never both. */
const copyEntry = z
  .object({
    path: relativePath.refine(
      (path) => !path.endsWith(".md"),
      "a Markdown file is prose: give it passages, not a copy",
    ),
    source: sourceName.optional(),
    file: relativePath.optional(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "a digest is 64 lowercase hex characters")
      .optional(),
    kind: z.enum(EDIT_KINDS).optional(),
    reason: text.optional(),
    gist: gistText.optional(),
  })
  .strict()
  .transform((value, context): Copy => {
    const { path, source, file, sha256, kind, reason, gist } = value;
    const accounted = kind !== undefined || reason !== undefined || gist !== undefined;
    if (sha256 === undefined && source !== undefined && file !== undefined && !accounted)
      return { path, source, file };
    if (kind === "method") {
      context.addIssue({
        code: "custom",
        message: "an authored file carries no method, so its kind is one of the other six",
      });
      return z.NEVER;
    }
    if (
      sha256 !== undefined &&
      source === undefined &&
      file === undefined &&
      kind !== undefined &&
      reason !== undefined
    )
      return gist === undefined
        ? { path, sha256, kind, reason }
        : { path, sha256, kind, reason, gist };
    context.addIssue({
      code: "custom",
      message:
        "a copy has a source and a file, or an authored file's sha256 with its kind and reason, never both",
    });
    return z.NEVER;
  });
const account = {
  kind: z.enum(EDIT_KINDS),
  reason: text,
  gist: gistText.optional(),
  ruling: text.optional(),
};
const passage = z.discriminatedUnion("passage", [
  z
    .object({
      passage: z.literal("taken"),
      source: sourceName,
      file: relativePath,
      segments: z.array(segmentId).min(1),
      edits: z
        .array(
          z.object({ ...account, segment: segmentId, find: text, replace: z.string() }).strict(),
        )
        .default([]),
      join,
    })
    .strict(),
  z
    .object({
      passage: z.literal("written"),
      ...account,
      text: text.refine(
        (value) => value.trim() === value,
        "written text neither starts nor ends with white space",
      ),
      credits: z.array(sourceName).default([]),
      join,
    })
    .strict(),
]);
const declared = z
  .object({
    schema: z.literal(RECIPE_SCHEMA),
    name: z.string().regex(SKILL_NAME),
    frontMatter: z
      .array(z.object({ field: z.string().regex(/^[a-z][\w-]*$/), value: text }).strict())
      .min(2),
    sources: z.array(sourceName),
    files: z
      .array(
        z
          .object({
            path: relativePath.refine((path) => path.endsWith(".md"), "a prose file is Markdown"),
            passages: z.array(passage).min(1),
            ending: z.enum(ENDINGS).optional(),
            part: z.enum(PARTS).optional(),
          })
          .strict(),
      )
      .min(1),
    copies: z.array(copyEntry),
    drops: z.array(
      z
        .object({
          ...account,
          source: sourceName,
          file: relativePath,
          segment: segmentId,
          replacedBy: z
            .object({ path: relativePath, passage: z.number().int().min(0) })
            .strict()
            .optional(),
        })
        .strict(),
    ),
    credit: z.object({ source: sourceName, file: relativePath, ruling: text }).strict().optional(),
    notStub: z
      .array(z.object({ source: sourceName, file: relativePath, ruling: text }).strict())
      .min(1)
      .optional(),
  })
  .strict();

type Declared = z.infer<typeof declared>;

interface Issue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

function* accounts(value: Declared): Generator<readonly [Account, readonly (string | number)[]]> {
  for (const [f, file] of value.files.entries())
    for (const [p, item] of file.passages.entries()) {
      if (item.passage === "written") yield [item, ["files", f, "passages", p]];
      else
        for (const [e, edit] of item.edits.entries())
          yield [edit, ["files", f, "passages", p, "edits", e]];
    }
  for (const [c, copy] of value.copies.entries()) if (isAuthored(copy)) yield [copy, ["copies", c]];
  for (const [d, drop] of value.drops.entries()) yield [drop, ["drops", d]];
}

/** The refusals the record alone shows: the front matter, the paths, the joins, the rulings and the sources. */
function recordIssues(value: Declared): readonly Issue[] {
  const issues: Issue[] = [];
  const fields = value.frontMatter.map((entry) => entry.field);
  if (fields[0] !== "name" || fields[1] !== "description")
    issues.push({
      path: ["frontMatter"],
      message: "the front matter opens with name, then description",
    });
  if (value.frontMatter[0]?.value !== value.name)
    issues.push({
      path: ["frontMatter", 0],
      message: `the front matter's name is not '${value.name}'`,
    });
  for (const [index, field] of fields.entries())
    if (fields.indexOf(field) < index)
      issues.push({ path: ["frontMatter", index], message: `duplicate field '${field}'` });
  if (value.files[0]?.path !== "SKILL.md")
    issues.push({ path: ["files", 0, "path"], message: "the first prose file is SKILL.md" });
  const paths = [...value.files.map((file) => file.path), ...value.copies.map((copy) => copy.path)];
  for (const [index, path] of paths.entries())
    if (paths.indexOf(path) < index)
      issues.push({ path: ["files"], message: `the skill directory names '${path}' twice` });
  for (const [f, file] of value.files.entries()) {
    if (file.part !== "references") continue;
    // The split's rule: the references hold greenline's mechanics alone, so
    // upstream prose, taken or credited, stands in the front.
    if (file.path === "SKILL.md")
      issues.push({ path: ["files", f, "part"], message: "SKILL.md is the skill's front" });
    for (const [p, item] of file.passages.entries())
      if (item.passage === "taken")
        issues.push({
          path: ["files", f, "passages", p],
          message: "a references page holds greenline's mechanics alone: it takes no upstream text",
        });
      else if (item.credits.length > 0)
        issues.push({
          path: ["files", f, "passages", p, "credits"],
          message: "a references page credits no source: upstream prose stands in the front",
        });
  }
  for (const [f, file] of value.files.entries())
    if (file.passages[0]?.join !== undefined)
      issues.push({
        path: ["files", f, "passages", 0, "join"],
        message: "a file's first passage has nothing to join to",
      });
  for (const [item, path] of accounts(value))
    if ((item.kind === "method") !== (item.ruling !== undefined))
      issues.push({
        path,
        message: "a method item carries the operator's ruling, and only a method item does",
      });
  const listed = new Set<string>(value.sources);
  for (const [index, name] of value.sources.entries())
    if (value.sources.indexOf(name) < index)
      issues.push({ path: ["sources", index], message: `duplicate source '${name}'` });
  const taken = value.files.flatMap((file) =>
    file.passages.flatMap((item) => (item.passage === "taken" ? [item.source] : [])),
  );
  const named: Issue[] = [];
  const requireListed = (source: string, path: readonly (string | number)[]): void => {
    if (!listed.has(source))
      named.push({ path, message: `'${source}' is not among the recipe's sources` });
  };
  for (const [f, file] of value.files.entries())
    for (const [p, item] of file.passages.entries())
      if (item.passage === "taken")
        requireListed(item.source, ["files", f, "passages", p, "source"]);
      else
        for (const [c, credit] of item.credits.entries())
          requireListed(credit, ["files", f, "passages", p, "credits", c]);
  for (const [c, copy] of value.copies.entries())
    if (!isAuthored(copy)) requireListed(copy.source, ["copies", c, "source"]);
  for (const [d, drop] of value.drops.entries()) requireListed(drop.source, ["drops", d, "source"]);
  if (value.credit !== undefined) requireListed(value.credit.source, ["credit", "source"]);
  const ruled = value.notStub ?? [];
  for (const [n, entry] of ruled.entries()) {
    const key = fileKey(entry.source, entry.file);
    if (ruled.findIndex((other) => fileKey(other.source, other.file) === key) < n)
      issues.push({ path: ["notStub", n], message: `'${key}' is ruled twice` });
    requireListed(entry.source, ["notStub", n, "source"]);
  }
  issues.push(...named);
  const used = new Set<string>([
    ...taken,
    ...value.files.flatMap((file) =>
      file.passages.flatMap((item) => (item.passage === "written" ? item.credits : [])),
    ),
    ...value.copies.flatMap((copy) => (isAuthored(copy) ? [] : [copy.source])),
    ...(value.credit === undefined ? [] : [value.credit.source]),
  ]);
  for (const [index, name] of value.sources.entries())
    if (!used.has(name))
      issues.push({
        path: ["sources", index],
        message: `the recipe takes, copies and credits nothing of '${name}'`,
      });
  if (value.credit !== undefined && taken.length > 0)
    issues.push({ path: ["credit"], message: "a stub holds only written passages and its credit" });
  if (value.credit !== undefined && value.notStub !== undefined)
    issues.push({
      path: ["notStub"],
      message:
        "a stub carries its credit, and a recipe ruled not a stub takes its source: never both",
    });
  return issues;
}

const recipeSchema = declared.superRefine((value, context) => {
  for (const issue of recordIssues(value))
    context.addIssue({ code: "custom", path: [...issue.path], message: issue.message });
});

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return (
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/** Every place a recipe's JSON holds the string {@link FILL_MARKER}, which `draft` leaves to be filled. */
function todoIssues(value: JsonValue, path: readonly (string | number)[]): readonly InvalidField[] {
  if (value === FILL_MARKER)
    return issuesFrom([
      {
        path,
        message: `the fill marker ${FILL_MARKER} is left: draft proposes, and every marker is filled before render, verify or record`,
      },
    ]);
  if (Array.isArray(value))
    return value.flatMap((item: JsonValue, index) => todoIssues(item, [...path, index]));
  if (isJsonObject(value))
    return Object.entries(value).flatMap(([key, item]) => todoIssues(item, [...path, key]));
  return [];
}

/**
 * Parse a recipe's text: refuse invalid JSON, a {@link FILL_MARKER} left by
 * `draft`, another schema, an unknown or
 * missing field, a kind outside the seven, a `method` item without its
 * ruling or another item with one, a front matter that does not open with
 * the recipe's name and a description, prose files that do not start with
 * `SKILL.md`, a path named twice, a copy of a Markdown file, a copy with
 * both a source and a digest or neither, an authored copy without its kind
 * and reason or of the kind `method`, an ending outside the three, a join
 * before a file's first passage, a source that is not listed or listed
 * and not used, a references part on `SKILL.md`, taken text or a credit on
 * a references page, a `notStub` ruling beside a credit, a body ruled twice, and
 * a gist outside its rule ({@link gistIssues}).
 * @param input the recipe file's text
 * @param source where the text came from, for the refusal
 * @returns the recipe, or every issue found
 */
export function parseRecipe(input: string, source: string): Result<Recipe, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [{ path: "", message: "the recipe is not valid JSON" }]);
  const todos = todoIssues(raw, []);
  if (todos.length > 0) return contractFailure(source, todos);
  const parsed = recipeSchema.safeParse(raw);
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/** The frozen snapshots a recipe reads, by the manifest's source names. */
export interface Snapshots {
  /** The names the manifest pins. */
  readonly sources: ReadonlySet<string>;
  /** A file's text inside a source's snapshot; undefined when there is none. */
  readonly text: (source: SourceName, file: string) => string | undefined;
  /** A file's bytes inside a source's snapshot; undefined when there is none. */
  readonly bytes: (source: SourceName, file: string) => Uint8Array | undefined;
}

/** One refusal of a recipe, naming the segment where there is one. */
export interface RecipeIssue {
  readonly message: string;
  readonly segment?: SegmentId | undefined;
}

/** A recipe the snapshots refuse, or one that cannot be read or parsed. */
export class RecipeRefused extends Error {
  /** The tag the Result law switches on. */
  readonly _tag = "RecipeRefused" as const;
  /** The skill whose recipe is refused. */
  readonly skill: string;
  /** Every reason, each naming its segment where there is one. */
  readonly issues: readonly RecipeIssue[];
  /**
   * @param skill the skill whose recipe is refused
   * @param issues every reason
   */
  constructor(skill: string, issues: readonly RecipeIssue[]) {
    super(`recipe '${skill}' refused: ${issues.map((issue) => issue.message).join("; ")}`);
    this.skill = skill;
    this.issues = issues;
  }
}

/** A source file a recipe names, segmented. */
export interface SourceFile {
  readonly source: SourceName;
  readonly file: string;
  readonly segmented: SegmentedFile;
}

/** A taken segment and its text after the recipe's edits. */
export interface TakenSegment {
  readonly segment: Segment;
  readonly text: string;
  readonly edited: boolean;
}

/** A taken passage with its segments resolved, in its order. */
export interface ResolvedTaken extends TakenPassage {
  readonly resolved: readonly TakenSegment[];
}

/** A prose file of a checked recipe: its passages, each taken one resolved. */
export interface CheckedFile {
  readonly path: string;
  readonly passages: readonly (ResolvedTaken | WrittenPassage)[];
  /** The bytes after the last passage. */
  readonly ending: Ending;
  /** The part the file belongs to, the front or the references. */
  readonly part: Part;
}

/** A file copied whole, with its bytes. */
export interface CopiedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A file greenline wrote that is not prose, by the sha256 of the bytes it must have. */
export interface AuthoredFile {
  readonly path: string;
  readonly sha256: string;
}

/** A recipe the snapshots accept, with what the check resolved. */
export interface CheckedRecipe {
  readonly recipe: Recipe;
  readonly files: readonly CheckedFile[];
  /** Every source file the recipe takes from or drops from, in the order first named. */
  readonly sourceFiles: readonly SourceFile[];
  /** The files copied from a snapshot, which the rendering writes. */
  readonly copies: readonly CopiedFile[];
  /** The authored files, which the rendering never writes and `verify` requires at their digests. */
  readonly authored: readonly AuthoredFile[];
}

function fileKey(source: string, file: string): string {
  return `${source}/${file}`;
}

/**
 * The characters an edit changes: what differs between find and replace
 * after their common start and end.
 * @param find the text an edit finds
 * @param replace the text it puts in its place
 * @returns the length of the longer of the two differing middles
 */
export function changedCharacters(find: string, replace: string): number {
  let start = 0;
  while (start < find.length && start < replace.length && find[start] === replace[start])
    start += 1;
  let end = 0;
  while (
    end < find.length - start &&
    end < replace.length - start &&
    find[find.length - 1 - end] === replace[replace.length - 1 - end]
  )
    end += 1;
  return Math.max(find.length, replace.length) - start - end;
}

/**
 * Whether edits stay within the share of a segment's characters an edit may change.
 * @param changed the characters the edits change, each by {@link changedCharacters}
 * @param length the segment's length
 * @returns false past half: the sentence becomes a written passage that credits its source
 */
export function withinEditShare(changed: number, length: number): boolean {
  return changed <= length * EDIT_SHARE_LIMIT;
}

/** A segment's edits applied in order, each to the text the earlier ones left, or the refusal. */
function edited(
  segment: Segment,
  edits: readonly Edit[],
): { readonly text: string } | { readonly issue: RecipeIssue } {
  let current = segment.text;
  let changed = 0;
  for (const edit of edits) {
    const at = current.indexOf(edit.find);
    if (at === -1 || current.indexOf(edit.find, at + 1) !== -1)
      return {
        issue: {
          segment: segment.id,
          message: `the find text '${edit.find}' does not occur exactly once in segment ${segment.id}`,
        },
      };
    current = current.slice(0, at) + edit.replace + current.slice(at + edit.find.length);
    changed += changedCharacters(edit.find, edit.replace);
  }
  return !withinEditShare(changed, segment.text.length)
    ? {
        issue: {
          segment: segment.id,
          message: `the edits change ${changed} of the ${segment.text.length} characters of segment ${segment.id}, more than half: write it as a passage that credits its source`,
        },
      }
    : { text: current };
}

function windows(words: readonly string[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (let at = 0; at + REPEAT_LIMIT <= words.length; at += 1)
    out.add(words.slice(at, at + REPEAT_LIMIT).join(" "));
  return out;
}

function lowerWords(value: string): readonly string[] {
  return wordsOf(value).map((word) => word.toLowerCase());
}

/**
 * Whether a written text repeats {@link REPEAT_LIMIT} consecutive words of a segment.
 * @param written a written passage's text
 * @param segment a segment's text
 * @returns true when a run of that many words, compared in lower case, occurs in both
 */
export function repeatsWords(written: string, segment: string): boolean {
  const runs = windows(lowerWords(segment));
  return [...windows(lowerWords(written))].some((run) => runs.has(run));
}

/** Resolve one taken passage against its file: unknown ids, order, repeats and edits. */
function resolveTaken(
  item: TakenPassage,
  file: SegmentedFile,
  taken: Set<string>,
  issues: RecipeIssue[],
): ResolvedTaken {
  const byId = new Map(file.segments.map((segment) => [segment.id, segment]));
  const segments: TakenSegment[] = [];
  let previous: number | undefined;
  for (const id of item.segments) {
    const segment = byId.get(id);
    if (segment === undefined) {
      issues.push({ segment: id, message: `'${item.source}/${item.file}' has no segment ${id}` });
      previous = undefined;
      continue;
    }
    if (previous !== undefined && segment.index !== previous + 1)
      issues.push({
        segment: id,
        message: `segment ${id} does not follow the segment before it in upstream order`,
      });
    previous = segment.index;
    const key = `${fileKey(item.source, item.file)}#${id}`;
    if (taken.has(key)) issues.push({ segment: id, message: `segment ${id} is taken twice` });
    taken.add(key);
    const edits = item.edits.filter((edit) => edit.segment === id);
    const result = edited(segment, edits);
    if ("issue" in result) issues.push(result.issue);
    segments.push({
      segment,
      text: "text" in result ? result.text : segment.text,
      edited: edits.length > 0,
    });
  }
  for (const edit of item.edits)
    if (!item.segments.includes(edit.segment))
      issues.push({
        segment: edit.segment,
        message: `an edit names segment ${edit.segment}, which its passage does not take`,
      });
  return { ...item, resolved: segments };
}

/** The segments the drops account for, and their refusals. */
interface DropAccount {
  readonly dropped: ReadonlySet<string>;
  readonly issues: readonly RecipeIssue[];
}

/** The drops' refusals: unknown (unless removed upstream), taken, twice, and a replacing passage that does not exist. */
function dropIssues(
  recipe: Recipe,
  sourceFiles: ReadonlyMap<string, SourceFile>,
  taken: ReadonlySet<string>,
): DropAccount {
  const issues: RecipeIssue[] = [];
  const dropped = new Set<string>();
  for (const drop of recipe.drops) {
    const key = `${fileKey(drop.source, drop.file)}#${drop.segment}`;
    const known = sourceFiles
      .get(fileKey(drop.source, drop.file))
      ?.segmented.segments.some((segment) => segment.id === drop.segment);
    if (known !== true && !isRemovedUpstream(drop))
      issues.push({
        segment: drop.segment,
        message: `'${drop.source}/${drop.file}' has no segment ${drop.segment} to drop`,
      });
    else if (taken.has(key))
      issues.push({
        segment: drop.segment,
        message: `segment ${drop.segment} is taken and dropped`,
      });
    else if (dropped.has(key))
      issues.push({ segment: drop.segment, message: `segment ${drop.segment} is dropped twice` });
    dropped.add(key);
    const replacement = drop.replacedBy;
    if (
      replacement !== undefined &&
      recipe.files.find((file) => file.path === replacement.path)?.passages[replacement.passage] ===
        undefined
    )
      issues.push({
        segment: drop.segment,
        message: `segment ${drop.segment} is replaced by passage ${replacement.passage} of '${replacement.path}', which does not exist`,
      });
  }
  return { dropped, issues };
}

/** A written passage that repeats a run of words of a dropped segment whose source it does not credit. */
function repeatIssues(
  recipe: Recipe,
  sourceFiles: ReadonlyMap<string, SourceFile>,
): readonly RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  const dropped = recipe.drops.flatMap((drop) => {
    const segment = sourceFiles
      .get(fileKey(drop.source, drop.file))
      ?.segmented.segments.find((candidate) => candidate.id === drop.segment);
    return segment === undefined ? [] : [{ drop, words: segment.text }];
  });
  for (const file of recipe.files)
    for (const item of file.passages) {
      if (item.passage !== "written") continue;
      for (const { drop, words } of dropped)
        if (!item.credits.includes(drop.source) && repeatsWords(item.text, words))
          issues.push({
            segment: drop.segment,
            message: `a written passage of '${file.path}' repeats ${REPEAT_LIMIT} consecutive words of dropped segment ${drop.segment} and does not credit '${drop.source}'`,
          });
    }
  return issues;
}

/** The files a recipe names, read, and the ones the snapshots lack. */
interface NamedFiles {
  readonly sourceFiles: ReadonlyMap<string, SourceFile>;
  readonly copies: readonly CopiedFile[];
  readonly issues: readonly RecipeIssue[];
}

/** Read every file the recipe names from the snapshots, or say which are missing. */
function readNamed(recipe: Recipe, snapshots: Snapshots): NamedFiles {
  const issues: RecipeIssue[] = [];
  const sourceFiles = new Map<string, SourceFile>();
  const named = [
    ...recipe.files.flatMap((file) =>
      file.passages.flatMap((item) => (item.passage === "taken" ? [item] : [])),
    ),
    ...recipe.drops.filter((drop) => !isRemovedUpstream(drop)),
  ];
  for (const { source, file } of named) {
    const key = fileKey(source, file);
    if (sourceFiles.has(key)) continue;
    const content = snapshots.text(source, file);
    if (content === undefined)
      issues.push({ message: `the snapshot of '${source}' has no file '${file}'` });
    else sourceFiles.set(key, { source, file, segmented: segmentProse(content) });
  }
  const copies: CopiedFile[] = [];
  for (const copy of recipe.copies) {
    if (isAuthored(copy)) continue;
    const bytes = snapshots.bytes(copy.source, copy.file);
    if (bytes === undefined)
      issues.push({
        message: `the snapshot of '${copy.source}' has no file '${copy.file}' to copy`,
      });
    else copies.push({ path: copy.path, bytes });
  }
  const credit = recipe.credit;
  if (credit !== undefined && snapshots.text(credit.source, credit.file) === undefined)
    issues.push({
      message: `the snapshot of '${credit.source}' has no credited file '${credit.file}'`,
    });
  return { sourceFiles, copies, issues };
}

/**
 * Check a recipe against the snapshots of the files it names: refuse a
 * source the manifest does not pin, a file a snapshot lacks, an unknown
 * segment id, a run out of order, a segment taken twice, an edit outside
 * its passage, a find text that does not occur exactly once, edits that
 * change more than half of a segment's characters, a drop of an unknown
 * segment (unless its reason records that upstream removed it, the one
 * drop whose file may be gone too) or of a taken segment, a segment dropped twice, a drop replaced by a passage
 * that does not exist, a segment neither taken nor dropped, and a written
 * passage that repeats {@link REPEAT_LIMIT} consecutive words of a dropped
 * segment it does not credit.
 * @param recipe a parsed recipe
 * @param snapshots the frozen snapshots
 * @returns the checked recipe, or every refusal, each naming its segment where there is one
 */
export function checkRecipe(
  recipe: Recipe,
  snapshots: Snapshots,
): Result<CheckedRecipe, RecipeRefused> {
  const unpinned = recipe.sources.filter((name) => !snapshots.sources.has(name));
  if (unpinned.length > 0)
    return err(
      new RecipeRefused(
        recipe.name,
        unpinned.map((name) => ({ message: `the manifest pins no source '${name}'` })),
      ),
    );
  const { sourceFiles, copies, issues: missing } = readNamed(recipe, snapshots);
  if (missing.length > 0) return err(new RecipeRefused(recipe.name, missing));

  const issues: RecipeIssue[] = [];
  const taken = new Set<string>();
  const files: CheckedFile[] = recipe.files.map((file) => ({
    path: file.path,
    ending: file.ending ?? "\n",
    part: file.part ?? "front",
    passages: file.passages.map((item) => {
      if (item.passage === "written") return item;
      const source = sourceFiles.get(fileKey(item.source, item.file));
      return source === undefined
        ? shouldNeverHappen(`'${item.source}/${item.file}' was read above`)
        : resolveTaken(item, source.segmented, taken, issues);
    }),
  }));
  const drops = dropIssues(recipe, sourceFiles, taken);
  issues.push(...drops.issues);
  for (const { source, file, segmented } of sourceFiles.values())
    for (const segment of segmented.segments) {
      const key = `${fileKey(source, file)}#${segment.id}`;
      if (!taken.has(key) && !drops.dropped.has(key))
        issues.push({
          segment: segment.id,
          message: `segment ${segment.id} of '${source}/${file}' is neither taken nor dropped`,
        });
    }
  issues.push(...repeatIssues(recipe, sourceFiles));
  return issues.length > 0
    ? err(new RecipeRefused(recipe.name, issues))
    : ok({
        recipe,
        files,
        sourceFiles: [...sourceFiles.values()],
        copies,
        authored: recipe.copies.flatMap((copy) =>
          isAuthored(copy) ? [{ path: copy.path, sha256: copy.sha256 }] : [],
        ),
      });
}
