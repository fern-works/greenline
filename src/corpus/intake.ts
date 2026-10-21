import { ok, type Result } from "../commons/result.ts";
import { partners } from "./draft.ts";
import { bodyWords, measureRecipe, STUB_TRIGGER, type SourceMeasure } from "./measure.ts";
import type { CheckedRecipe, RecipeRefused } from "./recipe.ts";
import { segmentProse, type Segment, type SegmentId } from "./segments.ts";

/**
 * The comparison sheet (`workshop/components/recipes.md`, "The intake";
 * the ingest procedure's "Combining sources"): a candidate skill directory
 * in a source's snapshot beside each roster skill named with it. Each
 * side is its prose files' segments in order, `SKILL.md` first, front
 * matter apart; they are aligned as `draft` aligns a copy with its
 * upstream (`partners`): a candidate segment whose text the other side
 * holds is in both and agrees; one paired as an edit is in both and
 * conflicts, quoted on both sides; the rest are only in the candidate or
 * only in the other. The sheet counts the candidate's body against the
 * stub trigger and projects the retention per source if the candidate
 * were taken whole. It writes nothing: the agent finishes the sheet, and
 * the verdict is the operator's.
 */

/** A prose file of one side, by its path in the skill directory. */
export interface ProseText {
  readonly path: string;
  readonly text: string;
}

/** A segment the sheet quotes: its file, its id and its text. */
export interface SheetSegment {
  readonly file: string;
  readonly segment: SegmentId;
  readonly text: string;
}

/** A candidate segment the other side holds as it stands, and where. */
export interface Agreement {
  readonly file: string;
  readonly segment: SegmentId;
  readonly there: { readonly file: string; readonly segment: SegmentId };
}

/** A sentence pair the alignment pairs as an edit: both sides quoted. */
export interface Conflict {
  readonly here: SheetSegment;
  readonly there: SheetSegment;
}

/** The candidate beside one roster skill. */
export interface Comparison {
  readonly against: string;
  readonly onlyHere: readonly SheetSegment[];
  readonly onlyThere: readonly SheetSegment[];
  readonly agree: readonly Agreement[];
  readonly conflict: readonly Conflict[];
}

/** The candidate's body against the stub trigger. */
export interface StubCount {
  /** The words of `SKILL.md` without its front matter. */
  readonly words: number;
  readonly trigger: number;
  readonly underTrigger: boolean;
}

/** One side's segments in order, each indexed by its place among them, with its file. */
interface Side {
  readonly segments: readonly Segment[];
  readonly files: readonly string[];
}

function sideOf(files: readonly ProseText[]): Side {
  const ordered = [...files].sort((left, right) =>
    left.path === "SKILL.md" ? -1 : right.path === "SKILL.md" ? 1 : left.path < right.path ? -1 : 1,
  );
  const segments: Segment[] = [];
  const paths: string[] = [];
  for (const file of ordered)
    for (const segment of segmentProse(file.text).segments) {
      segments.push({ ...segment, index: segments.length });
      paths.push(file.path);
    }
  return { segments, files: paths };
}

function quoted(side: Side, segment: Segment): SheetSegment {
  return { file: side.files[segment.index] ?? "", segment: segment.id, text: segment.text };
}

/**
 * The candidate's segments, quoted, for a sheet with no roster skill beside it.
 * @param candidate the candidate's prose files
 * @returns every segment in order with its file
 */
export function sheetSegments(candidate: readonly ProseText[]): readonly SheetSegment[] {
  const side = sideOf(candidate);
  return side.segments.map((segment) => quoted(side, segment));
}

/**
 * The candidate's body against the stub trigger.
 * @param skill the candidate's `SKILL.md` text
 * @returns its words and whether they fall under the trigger
 */
export function stubCount(skill: string): StubCount {
  const words = bodyWords(segmentProse(skill));
  return { words, trigger: STUB_TRIGGER, underTrigger: words < STUB_TRIGGER };
}

/**
 * Sort every segment of the candidate and of one roster skill into the four sorts.
 * @param against the roster skill's name
 * @param candidate the candidate's prose files
 * @param other the roster skill's prose files
 * @returns only in the candidate, only in the other, both agree and both conflict
 */
export function compareSkills(
  against: string,
  candidate: readonly ProseText[],
  other: readonly ProseText[],
): Comparison {
  const here = sideOf(candidate);
  const there = sideOf(other);
  const partner = partners(there.segments, here.segments);
  const used = new Set([...partner.values()].map((segment) => segment.index));
  const onlyHere: SheetSegment[] = [];
  const agree: Agreement[] = [];
  const conflict: Conflict[] = [];
  for (const segment of here.segments) {
    const match = partner.get(segment.index);
    if (match === undefined) onlyHere.push(quoted(here, segment));
    else if (match.text === segment.text)
      agree.push({
        file: here.files[segment.index] ?? "",
        segment: segment.id,
        there: { file: there.files[match.index] ?? "", segment: match.id },
      });
    else conflict.push({ here: quoted(here, segment), there: quoted(there, match) });
  }
  return {
    against,
    onlyHere,
    onlyThere: there.segments
      .filter((segment) => !used.has(segment.index))
      .map((segment) => quoted(there, segment)),
    agree,
    conflict,
  };
}

/** One source of a roster skill: its measure now, and if the candidate were taken whole as the spine. */
export interface ProjectedSource {
  readonly source: string;
  /** The taken segments whose text the candidate holds: the duplicates a combine with the candidate as the spine drops. */
  readonly duplicates: number;
  readonly measured: SourceMeasure;
  readonly projected: SourceMeasure;
}

/**
 * The candidate taken whole: every segment taken unedited and in order.
 * @param source the candidate's source
 * @param candidate the candidate's prose files
 * @returns its source's measure: retention and coverage whole, null with nothing to take
 */
export function wholeMeasure(source: string, candidate: readonly ProseText[]): SourceMeasure {
  const segments = sideOf(candidate).segments.length;
  const whole = segments === 0 ? null : 1;
  return {
    source,
    segments,
    taken: segments,
    exact: segments,
    retention: whole,
    coverage: whole,
    meetsMinimum: segments === 0 ? null : true,
    creditLine: segments === 0,
  };
}

/**
 * A roster skill's sources, measured now and with the segments the
 * candidate duplicates dropped, as a combine with the candidate taken whole
 * as the spine would record them.
 * @param checked the roster skill's checked recipe
 * @param candidate the candidate's prose files
 * @returns each source's duplicates and both measures, or the stub trigger's refusal
 */
export function projectedSources(
  checked: CheckedRecipe,
  candidate: readonly ProseText[],
): Result<readonly ProjectedSource[], RecipeRefused> {
  const texts = new Set(sideOf(candidate).segments.map((segment) => segment.text));
  const measured = measureRecipe(checked);
  if (measured._tag === "err") return measured;
  const reduced: CheckedRecipe = {
    ...checked,
    files: checked.files.map((file) => ({
      ...file,
      passages: file.passages.map((item) =>
        item.passage === "taken"
          ? { ...item, resolved: item.resolved.filter((taken) => !texts.has(taken.text)) }
          : item,
      ),
    })),
  };
  const projected = measureRecipe(reduced);
  if (projected._tag === "err") return projected;
  return ok(
    measured.value.sources.map((now, index) => {
      const then = projected.value.sources[index] ?? now;
      return {
        source: now.source,
        duplicates: now.taken - then.taken,
        measured: now,
        projected: then,
      };
    }),
  );
}
