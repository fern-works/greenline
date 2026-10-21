import { sha256Hex } from "../commons/hash.ts";
import type { CorpusSource } from "../core/corpus.ts";
import { commonRun, editOf, partners, recipeText } from "./draft.ts";
import { bodyWords, STUB_TRIGGER } from "./measure.ts";
import {
  changedCharacters,
  FILL_MARKER,
  isAuthored,
  removedUpstream,
  withinEditShare,
  type Account,
  type CheckedFile,
  type CheckedRecipe,
  type Copy,
  type Credit,
  type Drop,
  type Edit,
  type NotStub,
  type Passage,
  type ProseFile,
  type Recipe,
  type ResolvedTaken,
  type Snapshots,
  type SourceName,
  type TakenPassage,
} from "./recipe.ts";
import { placeProse } from "./render.ts";
import { segmentProse, type Segment, type SegmentId, type SegmentedFile } from "./segments.ts";

/**
 * The re-anchoring (`workshop/components/recipes.md`, "Refreshing a
 * source"): a recipe that takes from a source, carried from the source's
 * old snapshot to its new one, without taking new upstream text unread
 * (C4). Each source file the recipe names is aligned old against new as
 * `draft` aligns a copy with its upstream (`partners`): a segment whose
 * text the new file holds is unchanged, and keeps its place in the recipe
 * and its edits under its id there; an old segment paired with a new one
 * as an edit changed; an old segment with no partner was removed; a new
 * segment with no partner was inserted.
 *
 * What the re-anchored recipe holds, every place a reader must read
 * carrying the fill marker {@link FILL_MARKER}, which every verb but
 * `draft` refuses until it is filled:
 * - a changed segment the recipe takes is taken at its new id with one
 *   more edit first, which turns the new text back into the old, its kind
 *   and reason the marker: the rendering keeps the text that was read,
 *   and the reader keeps the edit with its reason or deletes it to take
 *   upstream's change; the old edits follow it;
 * - a changed segment the recipe drops is dropped at its new id with its
 *   old reason, its gist and the kind the marker;
 * - an inserted segment is dropped with its kind and reason the marker:
 *   unaccounted until it is taken or dropped;
 * - a removed segment leaves its passage and is dropped with the reason
 *   `removed upstream at <commit>` and the kind the marker, the gist of
 *   the reason it gives up left out;
 * - where a passage must split, because the new file moved, inserted or
 *   removed what stood inside it, each piece's join keeps the old
 *   rendering's bytes; where no join can, the join is the marker;
 * - a file copied from the source whose bytes changed or went becomes an
 *   authored copy held at its old digest, its kind and reason the marker;
 * - a stub's credit, or a `notStub` ruling, whose upstream body changed
 *   has its ruling left as the marker: the stub rubric's recheck.
 * Nothing the new snapshot inserted or changed enters a rendering until a
 * marker beside it is filled.
 */

/** A segment the report quotes: its file in the source, its id and its text. */
export interface QuotedSegment {
  readonly file: string;
  readonly segment: SegmentId;
  readonly text: string;
}

/** An edit of a changed segment, and whether its find text still occurs exactly once in the new text. */
export interface CarriedEdit {
  readonly find: string;
  readonly replace: string;
  readonly occursOnce: boolean;
}

/** A segment that changed upstream, to be read beside the new segment that stands where it stood. */
export interface ChangedSegment extends QuotedSegment {
  /** The new segment's id and text. */
  readonly now: { readonly segment: SegmentId; readonly text: string };
  /** Whether the recipe took it; otherwise it dropped it. */
  readonly taken: boolean;
  /** The recipe's edits of it, each against the new text. */
  readonly edits: readonly CarriedEdit[];
  /** For a taken one, whether keeping the edit that turns the new text back, with the recipe's edits after it, stays within the edit share; when it does not, the sentence becomes a written passage. */
  readonly keepFits: boolean;
}

/** A segment upstream removed, and whether the recipe took it. */
export interface RemovedSegment extends QuotedSegment {
  readonly taken: boolean;
}

/** A place where a split passage's join cannot keep the old rendering's bytes. */
export interface SeparatorPlace {
  /** The skill's prose file. */
  readonly path: string;
  /** The new segment the passage opens with. */
  readonly segment: SegmentId;
  /** What the old rendering placed before it. */
  readonly was: string;
  /** What the join rule would place before it now. */
  readonly now: string;
}

/** A file copied from the source whose bytes changed or went upstream. */
export interface CopyPlace {
  readonly path: string;
  readonly file: string;
  readonly change: "changed" | "removed";
}

/** A stub's credit or a not-a-stub ruling whose upstream body changed, or a taken body that fell under the stub trigger. */
export interface StubFlag {
  readonly file: string;
  /** The body's words at the new commit; null when the file is gone. */
  readonly words: number | null;
  readonly message: string;
}

/** One recipe's re-anchoring, every listed place marked in the re-anchored recipe. */
export interface RecipeRefresh {
  readonly skill: string;
  readonly changed: readonly ChangedSegment[];
  readonly inserted: readonly QuotedSegment[];
  readonly removed: readonly RemovedSegment[];
  /** Unchanged taken segments the new file moved: they keep their place in the recipe, and the measure counts them out of order. */
  readonly moved: readonly { readonly file: string; readonly segment: SegmentId }[];
  readonly separators: readonly SeparatorPlace[];
  readonly copies: readonly CopyPlace[];
  /** Files the new snapshot adds beside the files the recipe names, which it does not take. */
  readonly added: readonly string[];
  readonly stubs: readonly StubFlag[];
  /** How many fill markers the re-anchored recipe holds. */
  readonly markers: number;
  /** Whether the re-anchored recipe differs from the one on disk. */
  readonly rewrites: boolean;
}

/** One source's snapshot as the re-anchoring reads it. */
export interface SourceSnapshot {
  readonly text: (file: string) => string | undefined;
  readonly bytes: (file: string) => Uint8Array | undefined;
  /** Every file it holds, by its path in the snapshot. */
  readonly files: readonly string[];
}

/** What re-anchoring one recipe reads. */
export interface ReanchorInput {
  /** The recipe checked against the source's old snapshot. */
  readonly checked: CheckedRecipe;
  /** The recipe file's text on disk. */
  readonly text: string;
  readonly source: SourceName;
  /** The new commit, in full. */
  readonly commit: string;
  readonly before: SourceSnapshot;
  readonly after: SourceSnapshot;
}

/** A re-anchored recipe: its report and its text, written only with `--write`. */
export interface Reanchored {
  readonly report: RecipeRefresh;
  readonly text: string;
}

/** An account a reader fills: the kind the marker, and the reason the marker too unless the refresh states it. */
const UNREAD: Account = { kind: "scope", reason: FILL_MARKER };

/** One source file's old segments aligned with its new ones. */
interface Alignment {
  readonly before: SegmentedFile;
  readonly after: SegmentedFile;
  /** Each old segment's partner in the new file, by its old index. */
  readonly next: ReadonlyMap<number, Segment>;
  /** The old indices the longest common run holds. */
  readonly anchored: ReadonlySet<number>;
  /** The new segments no old segment partners. */
  readonly inserted: readonly Segment[];
}

function align(before: SegmentedFile, after: SegmentedFile): Alignment {
  const next = partners(after.segments, before.segments);
  const anchors = commonRun(
    after.segments.map((segment) => segment.text),
    before.segments.map((segment) => segment.text),
  );
  const used = new Set([...next.values()].map((segment) => segment.index));
  return {
    before,
    after,
    next,
    anchored: new Set(anchors.map(([, old]) => old)),
    inserted: after.segments.filter((segment) => !used.has(segment.index)),
  };
}

const WHITE = /^\s+$/;

function occurrences(text: string, find: string): number {
  let count = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + 1)) count += 1;
  return count;
}

/** A kept taken segment, with the bytes the old rendering placed before it. */
interface Kept {
  readonly segment: Segment;
  /** The revert edit of a changed segment, first among its edits. */
  readonly revert: Edit | undefined;
  readonly target: string;
  /** Whether it opened its old passage, so the passage's join stood before it. */
  readonly first: boolean;
}

/** A recipe's credit and not-a-stub rulings after the stub rubric's recheck. */
interface Rulings {
  readonly credit: Credit | undefined;
  readonly notStub: readonly NotStub[] | undefined;
}

/** The re-anchoring of one recipe, built up file by file. */
class Reanchoring {
  readonly changed: ChangedSegment[] = [];
  readonly inserted: QuotedSegment[] = [];
  readonly removed: RemovedSegment[] = [];
  readonly moved: { readonly file: string; readonly segment: SegmentId }[] = [];
  readonly separators: SeparatorPlace[] = [];
  readonly copyPlaces: CopyPlace[] = [];
  readonly stubs: StubFlag[] = [];
  /** Accounts whose reason is stated and whose kind the text holds as the marker. */
  readonly unread = new Set<Account>();
  /** Each prose file's old passage index to its first new one, and how many it became. */
  readonly passageMap = new Map<
    string,
    Map<number, { readonly at: number; readonly count: number }>
  >();
  private readonly alignments = new Map<string, Alignment>();

  private readonly input: ReanchorInput;

  constructor(input: ReanchorInput) {
    this.input = input;
  }

  alignment(file: string): Alignment {
    const known = this.alignments.get(file);
    if (known !== undefined) return known;
    const before = this.input.checked.sourceFiles.find(
      (entry) => entry.source === this.input.source && entry.file === file,
    )?.segmented;
    const made = align(
      before ?? segmentProse(this.input.before.text(file) ?? ""),
      segmentProse(this.input.after.text(file) ?? ""),
    );
    this.alignments.set(file, made);
    return made;
  }

  /** The join a new passage opening with `kept` needs, or the marker where none keeps the old bytes. */
  private joinFor(
    path: string,
    kept: Kept,
    out: readonly Passage[],
    file: string,
    oldJoin: string | undefined,
  ): string | undefined {
    const { lead } = kept.segment;
    const previous = out.at(-1);
    if (previous === undefined) {
      if (lead === kept.target) return undefined;
      this.separators.push({ path, segment: kept.segment.id, was: kept.target, now: lead });
      return FILL_MARKER;
    }
    if (oldJoin !== undefined && oldJoin + lead === kept.target) return oldJoin;
    const last = previous.passage === "taken" ? previous.segments.at(-1) : undefined;
    const lastIndex = this.alignment(file).after.segments.find((s) => s.id === last)?.index;
    const continues =
      previous.passage === "taken" &&
      previous.source === this.input.source &&
      previous.file === file &&
      lastIndex !== undefined &&
      lastIndex + 1 === kept.segment.index;
    const rule = continues ? kept.segment.separator : `\n\n${lead}`;
    if (rule === kept.target) return undefined;
    const rest = kept.target.slice(0, kept.target.length - lead.length);
    if (kept.target.endsWith(lead) && WHITE.test(rest)) return rest;
    this.separators.push({ path, segment: kept.segment.id, was: kept.target, now: rule });
    return FILL_MARKER;
  }

  /** The kept segments of one old taken passage, each with the bytes the old rendering placed before it. */
  private kept(item: ResolvedTaken, placed: ReturnType<typeof placeProse>, at: number): Kept[] {
    const alignment = this.alignment(item.file);
    const here = placed.passages[at];
    const previousEnd = at === 0 ? 0 : (placed.passages[at - 1]?.end ?? 0);
    const kept: Kept[] = [];
    for (const [k, taken] of item.resolved.entries()) {
      const old = taken.segment;
      const start = here?.segmentStarts[k] ?? 0;
      const before =
        k === 0
          ? previousEnd
          : (here?.segmentStarts[k - 1] ?? 0) + (item.resolved[k - 1]?.text.length ?? 0);
      const target = placed.text.slice(before, start);
      const now = alignment.next.get(old.index);
      if (now === undefined) {
        this.removed.push({ file: item.file, segment: old.id, text: old.text, taken: true });
        continue;
      }
      if (now.text === old.text) {
        if (!alignment.anchored.has(old.index))
          this.moved.push({ file: item.file, segment: now.id });
        kept.push({ segment: now, revert: undefined, target, first: k === 0 });
        continue;
      }
      const edits = item.edits.filter((edit) => edit.segment === old.id);
      const revert = editOf(now.text, old.text);
      this.changed.push({
        file: item.file,
        segment: old.id,
        text: old.text,
        now: { segment: now.id, text: now.text },
        taken: true,
        edits: edits.map((edit) => ({
          find: edit.find,
          replace: edit.replace,
          occursOnce: occurrences(now.text, edit.find) === 1,
        })),
        keepFits: withinEditShare(
          [revert, ...edits].reduce(
            (sum, edit) => sum + changedCharacters(edit.find, edit.replace),
            0,
          ),
          now.text.length,
        ),
      });
      kept.push({
        segment: now,
        revert: { segment: now.id, ...revert, ...UNREAD },
        target,
        first: k === 0,
      });
    }
    return kept;
  }

  /** One old taken passage of the source as the new passages it becomes. */
  private passagesOf(
    path: string,
    item: ResolvedTaken,
    placed: ReturnType<typeof placeProse>,
    at: number,
    out: Passage[],
  ): void {
    const kept = this.kept(item, placed, at);
    const rename = new Map<string, SegmentId>(
      item.resolved.flatMap((taken) => {
        const now = this.alignment(item.file).next.get(taken.segment.index);
        return now === undefined ? [] : [[taken.segment.id, now.id] as const];
      }),
    );
    let open: { segments: Kept[]; join: string | undefined } | undefined;
    const close = (): void => {
      if (open === undefined) return;
      const ids = new Set(open.segments.map((k) => k.segment.id));
      const reverts = open.segments.flatMap((k) => (k.revert === undefined ? [] : [k.revert]));
      const carried = item.edits.flatMap((edit) => {
        const id = rename.get(edit.segment);
        return id !== undefined && ids.has(id) ? [{ ...edit, segment: id }] : [];
      });
      const passage: TakenPassage = {
        passage: "taken",
        source: item.source,
        file: item.file,
        segments: open.segments.map((k) => k.segment.id),
        edits: [...reverts, ...carried],
        join: open.join,
      };
      out.push(passage);
      open = undefined;
    };
    for (const next of kept) {
      const last = open?.segments.at(-1)?.segment;
      if (
        open !== undefined &&
        last !== undefined &&
        next.segment.index === last.index + 1 &&
        next.segment.separator === next.target
      ) {
        open.segments.push(next);
        continue;
      }
      close();
      open = {
        segments: [next],
        join: this.joinFor(path, next, out, item.file, next.first ? item.join : undefined),
      };
    }
    close();
  }

  file(checked: CheckedFile): ProseFile {
    const placed = placeProse(checked);
    const out: Passage[] = [];
    const map = new Map<number, { readonly at: number; readonly count: number }>();
    for (const [at, item] of checked.passages.entries()) {
      const from = out.length;
      if (item.passage === "taken" && item.source === this.input.source)
        this.passagesOf(checked.path, item, placed, at, out);
      else {
        const plain: Passage =
          item.passage === "written"
            ? item
            : {
                passage: "taken",
                source: item.source,
                file: item.file,
                segments: item.segments,
                edits: item.edits,
                join: item.join,
              };
        out.push(
          out.length === 0 && plain.join !== undefined ? { ...plain, join: undefined } : plain,
        );
      }
      map.set(at, { at: from, count: out.length - from });
    }
    this.passageMap.set(checked.path, map);
    if (out.length === 0)
      out.push({ passage: "written", text: FILL_MARKER, ...UNREAD, credits: [], join: undefined });
    return {
      path: checked.path,
      passages: out,
      ending: checked.ending === "\n" ? undefined : checked.ending,
      part: checked.part === "front" ? undefined : checked.part,
    };
  }

  /** A drop's replacing passage at its new place; none when that passage left. */
  private replaced(drop: Drop): Drop["replacedBy"] {
    const by = drop.replacedBy;
    if (by === undefined) return undefined;
    const moved = this.passageMap.get(by.path)?.get(by.passage);
    if (moved === undefined) return by;
    return moved.count === 0 ? undefined : { path: by.path, passage: moved.at };
  }

  drops(recipe: Recipe): Drop[] {
    const { source, commit } = this.input;
    const out: Drop[] = [];
    const named = new Set<string>();
    for (const drop of recipe.drops) {
      if (drop.source !== source) {
        out.push({ ...drop, replacedBy: this.replaced(drop) });
        continue;
      }
      const alignment = this.alignment(drop.file);
      named.add(drop.file);
      const old = alignment.before.segments.find((segment) => segment.id === drop.segment);
      if (old === undefined) {
        // A drop of a segment an earlier refresh found removed: kept until upstream brings it back.
        if (!alignment.after.segments.some((segment) => segment.id === drop.segment))
          out.push({ ...drop, replacedBy: this.replaced(drop) });
        continue;
      }
      const now = alignment.next.get(old.index);
      const replacedBy = this.replaced(drop);
      if (now === undefined) {
        this.removed.push({ file: drop.file, segment: old.id, text: old.text, taken: false });
        // The gist shortened the reason this drop gives up, so it goes with that reason.
        const removed: Drop = {
          ...drop,
          reason: removedUpstream(commit),
          gist: undefined,
          replacedBy,
        };
        this.unread.add(removed);
        out.push(removed);
        continue;
      }
      if (now.text !== old.text) {
        this.changed.push({
          file: drop.file,
          segment: old.id,
          text: old.text,
          now: { segment: now.id, text: now.text },
          taken: false,
          edits: [],
          keepFits: true,
        });
        const changed: Drop = { ...drop, segment: now.id, replacedBy };
        this.unread.add(changed);
        out.push(changed);
        continue;
      }
      out.push({ ...drop, segment: now.id, replacedBy });
    }
    for (const file of recipe.files)
      for (const item of file.passages)
        if (item.passage === "taken" && item.source === source) named.add(item.file);
    for (const file of [...named].sort())
      for (const segment of this.alignment(file).inserted) {
        this.inserted.push({ file, segment: segment.id, text: segment.text });
        out.push({ source, file, segment: segment.id, ...UNREAD });
      }
    for (const removed of this.removed.filter((item) => item.taken))
      out.push(this.removedDrop(removed));
    return out;
  }

  private removedDrop(removed: RemovedSegment): Drop {
    const drop: Drop = {
      source: this.input.source,
      file: removed.file,
      segment: removed.segment,
      kind: "scope",
      reason: removedUpstream(this.input.commit),
    };
    this.unread.add(drop);
    return drop;
  }

  copies(recipe: Recipe): Copy[] {
    const { checked, source, after } = this.input;
    return recipe.copies.map((copy) => {
      if (isAuthored(copy) || copy.source !== source) return copy;
      const old = checked.copies.find((file) => file.path === copy.path)?.bytes ?? new Uint8Array();
      const now = after.bytes(copy.file);
      if (now !== undefined && sha256Hex(now) === sha256Hex(old)) return copy;
      this.copyPlaces.push({
        path: copy.path,
        file: copy.file,
        change: now === undefined ? "removed" : "changed",
      });
      return { path: copy.path, sha256: sha256Hex(old), ...UNREAD };
    });
  }

  /** The stub rubric's recheck: a credited or ruled body that changed has its ruling left to the operator. */
  rulings(recipe: Recipe): Rulings {
    const { source, before, after } = this.input;
    const recheck = <Ruled extends Credit | NotStub>(entry: Ruled, what: string): Ruled => {
      if (entry.source !== source) return entry;
      const was = before.text(entry.file);
      const now = after.text(entry.file);
      if (was === now) return entry;
      const words = now === undefined ? null : bodyWords(segmentProse(now));
      this.stubs.push({
        file: entry.file,
        words,
        message:
          now === undefined
            ? `the ${what} '${entry.file}' is gone upstream: the operator rules the skill again`
            : `the ${what} '${entry.file}' changed upstream, now ${words} words of body: does it state a method of its own, with steps, an order or criteria? The operator rules it again`,
      });
      return { ...entry, ruling: FILL_MARKER };
    };
    const notStub = recipe.notStub?.map((entry) => recheck(entry, "body ruled not a stub"));
    for (const item of recipe.files.flatMap((file) => file.passages)) {
      if (item.passage !== "taken" || item.source !== source || !item.file.endsWith("SKILL.md"))
        continue;
      if (notStub?.some((entry) => entry.file === item.file) === true) continue;
      const now = after.text(item.file);
      const words = now === undefined ? null : bodyWords(segmentProse(now));
      if (
        words !== null &&
        words < STUB_TRIGGER &&
        !this.stubs.some((flag) => flag.file === item.file)
      )
        this.stubs.push({
          file: item.file,
          words,
          message: `the taken body '${item.file}' is now ${words} words, under the stub trigger of ${STUB_TRIGGER}: measure puts the stub question to the operator`,
        });
    }
    return {
      credit: recipe.credit === undefined ? undefined : recheck(recipe.credit, "credited skill"),
      notStub,
    };
  }

  /** Files the new snapshot adds under the directories the recipe names, which it does not name. */
  added(recipe: Recipe): string[] {
    const { source, before, after } = this.input;
    const named = new Set<string>([
      ...recipe.files.flatMap((file) =>
        file.passages.flatMap((item) =>
          item.passage === "taken" && item.source === source ? [item.file] : [],
        ),
      ),
      ...recipe.drops.flatMap((drop) => (drop.source === source ? [drop.file] : [])),
      ...recipe.copies.flatMap((copy) =>
        !isAuthored(copy) && copy.source === source ? [copy.file] : [],
      ),
      ...(recipe.credit?.source === source ? [recipe.credit.file] : []),
    ]);
    const directories = new Set([...named].map((file) => file.slice(0, file.indexOf("/") + 1)));
    const old = new Set(before.files);
    return after.files.filter(
      (file) =>
        !old.has(file) &&
        !named.has(file) &&
        [...directories].some((dir) => dir !== "" && file.startsWith(dir)),
    );
  }
}

function markers(text: string): number {
  return text.split(JSON.stringify(FILL_MARKER)).length - 1;
}

/**
 * Re-anchor one recipe from a source's old snapshot to its new one.
 * @param input the recipe checked against the old snapshot, its text, the source, the new commit and both snapshots
 * @returns the report of every listed place and the re-anchored recipe's text, each listed place holding the fill marker
 */
export function reanchor(input: ReanchorInput): Reanchored {
  const recipe = input.checked.recipe;
  const work = new Reanchoring(input);
  const files = input.checked.files.map((file) => work.file(file));
  const drops = work.drops(recipe);
  const copies = work.copies(recipe);
  const { credit, notStub } = work.rulings(recipe);
  const next: Recipe = { ...recipe, files, copies, drops, credit, notStub };
  const text = recipeText(next, work.unread);
  return {
    report: {
      skill: recipe.name,
      changed: work.changed,
      inserted: work.inserted,
      removed: work.removed,
      moved: work.moved,
      separators: work.separators,
      copies: work.copyPlaces,
      added: work.added(recipe),
      stubs: work.stubs,
      markers: markers(text),
      rewrites: text !== input.text,
    },
    text,
  };
}

/** The opening of the manifest's sources list, and its closing at the same indentation. */
const SOURCES_OPEN = '\n  "sources": [';
const SOURCES_CLOSE = "\n  ]";

/**
 * The manifest's text with its sources list replaced, every other byte as
 * it stands: each source an open object at the list's indentation, in the
 * form the formatter leaves as it is.
 * @param text the manifest's text
 * @param sources the sources, in order
 * @returns the new text, or undefined when the text holds no sources list at the top level
 */
export function manifestWithSources(
  text: string,
  sources: readonly CorpusSource[],
): string | undefined {
  const open = text.indexOf(SOURCES_OPEN);
  if (open === -1) return undefined;
  const from = open + SOURCES_OPEN.length;
  const close = text.indexOf(SOURCES_CLOSE, from);
  if (close === -1) return undefined;
  const body = sources
    .map((source) =>
      JSON.stringify(source, null, 2)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    )
    .join(",\n");
  return `${text.slice(0, from)}\n${body}${text.slice(close)}`;
}

/**
 * A source's snapshot as the re-anchoring reads it, from the snapshots that
 * read it by the manifest's name.
 * @param snapshots the snapshots
 * @param source the source
 * @param files every file the snapshot holds
 * @returns the source's snapshot
 */
export function sourceSnapshot(
  snapshots: Snapshots,
  source: SourceName,
  files: readonly string[],
): SourceSnapshot {
  return {
    text: (file) => snapshots.text(source, file),
    bytes: (file) => snapshots.bytes(source, file),
    files,
  };
}
