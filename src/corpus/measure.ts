import { err, ok, type Result } from "../commons/result.ts";
import { RecipeRefused, type CheckedRecipe, type RecipeIssue } from "./recipe.ts";
import { joinSegments, wordsOf, type SegmentedFile } from "./segments.ts";

/**
 * The measure and the stub trigger (`workshop/components/recipes.md`).
 * Per source of a recipe: `segments`, every segment of the files the recipe
 * names in it; `taken`, the segments it takes; `exact`, the taken segments
 * that are unedited and in upstream order, which is per source file the
 * longest run of unedited taken segments, in recipe order, whose upstream
 * places rise; `retention`, exact over taken; `coverage`, taken over
 * segments. `growth` is the recipe's written text in words, reported apart.
 * A ratio with nothing under it is null. Retention under the minimum is
 * reported, not refused: the existing roster is inventoried under
 * retention (`docs/DECISIONS.md`, the rows of 2026-10-01). A source the
 * recipe takes no segment of exactly is a credit line, not a tracked
 * source (the ruling of 2026-10-04, C14), and its measure says so.
 *
 * The stub trigger reads every upstream skill body a recipe takes from: a
 * taken source file named `SKILL.md`, without its front matter. Under
 * {@link STUB_TRIGGER} words, a body the recipe does not name in `notStub`
 * with the operator's ruling that it is not a stub is refused with the
 * rubric's question; a `notStub` ruling on any other file is refused too,
 * since it answers nothing. A body ruled not a stub is measured like any
 * taken source. A stub, which takes nothing and carries the credit, leaves
 * the measure: its sources are measured as none.
 */

/** The retention minimum, 90% of the segments a skill takes from a source (C2; the rows of 2026-10-03, R1, and 2026-10-04, C2). */
export const RETENTION_MINIMUM = 0.9;

/** The stub trigger: an upstream skill body under about 100 words (C15). */
export const STUB_TRIGGER = 100;

/**
 * The words of a skill body: its file without the front matter, as the stub
 * trigger counts them.
 * @param segmented the segmented file
 * @returns its body's word count
 */
export function bodyWords(segmented: SegmentedFile): number {
  return wordsOf(joinSegments(segmented).slice(segmented.frontMatter.length)).length;
}

/** The rubric's question, which the trigger puts to the operator. */
const STUB_QUESTION =
  "does it state a method of its own, with steps, an order or criteria, or does it only delegate to other skills or tools?";

/** One source's measure. */
export interface SourceMeasure {
  readonly source: string;
  readonly segments: number;
  readonly taken: number;
  readonly exact: number;
  readonly retention: number | null;
  readonly coverage: number | null;
  /** Whether retention reaches {@link RETENTION_MINIMUM}; null when nothing is taken. */
  readonly meetsMinimum: boolean | null;
  /** Whether the source is a credit line: the recipe takes no segment of it exactly (C14). */
  readonly creditLine: boolean;
}

/** A recipe's measure. */
export interface RecipeMeasure {
  readonly skill: string;
  readonly stub: boolean;
  readonly sources: readonly SourceMeasure[];
  /** The words of the written passages. */
  readonly growth: number;
}

/** The length of the longest strictly rising run, in order, of a list of places. */
function longestRise(places: readonly number[]): number {
  const tails: number[] = [];
  for (const place of places) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((tails[middle] ?? place) < place) low = middle + 1;
      else high = middle;
    }
    tails[low] = place;
  }
  return tails.length;
}

function ratio(over: number, under: number): number | null {
  return under === 0 ? null : over / under;
}

/**
 * Measure a checked recipe, after the stub trigger.
 * @param checked a recipe the snapshots accepted
 * @returns the measure, or the trigger's refusal naming each body under it
 */
export function measureRecipe(checked: CheckedRecipe): Result<RecipeMeasure, RecipeRefused> {
  const { recipe } = checked;
  const growth = checked.files
    .flatMap((file) => file.passages)
    .reduce((sum, item) => sum + (item.passage === "written" ? wordsOf(item.text).length : 0), 0);
  if (recipe.credit !== undefined)
    return ok({ skill: recipe.name, stub: true, sources: [], growth });

  const taken = checked.files.flatMap((file) =>
    file.passages.flatMap((item) => (item.passage === "taken" ? [item] : [])),
  );
  const ruled = recipe.notStub ?? [];
  const triggered: RecipeIssue[] = [];
  const answered = new Set<string>();
  for (const { source, file, segmented } of checked.sourceFiles) {
    if (!(file === "SKILL.md" || file.endsWith("/SKILL.md"))) continue;
    if (!taken.some((item) => item.source === source && item.file === file)) continue;
    const words = bodyWords(segmented);
    if (words >= STUB_TRIGGER) continue;
    if (ruled.some((entry) => entry.source === source && entry.file === file))
      answered.add(`${source}/${file}`);
    else
      triggered.push({
        message: `'${source}/${file}' has ${words} words of body, under the stub trigger of ${STUB_TRIGGER}: ${STUB_QUESTION} The operator rules it: a stub's recipe carries the credit, and a recipe whose source the operator rules is not a stub names the body in notStub with that ruling.`,
      });
  }
  for (const { source, file } of ruled)
    if (!answered.has(`${source}/${file}`))
      triggered.push({
        message: `'${source}/${file}' is ruled not a stub, but the recipe takes no skill body of it under the stub trigger of ${STUB_TRIGGER} words: the ruling answers only a body the trigger reads`,
      });
  if (triggered.length > 0) return err(new RecipeRefused(recipe.name, triggered));

  const sources = recipe.sources.map((source) => {
    const files = checked.sourceFiles.filter((entry) => entry.source === source);
    const segments = files.reduce((sum, entry) => sum + entry.segmented.segments.length, 0);
    const mine = taken.filter((item) => item.source === source);
    const count = mine.reduce((sum, item) => sum + item.resolved.length, 0);
    const exact = files.reduce(
      (sum, entry) =>
        sum +
        longestRise(
          mine
            .filter((item) => item.file === entry.file)
            .flatMap((item) => item.resolved)
            .filter((segment) => !segment.edited)
            .map((segment) => segment.segment.index),
        ),
      0,
    );
    const retention = ratio(exact, count);
    return {
      source,
      segments,
      taken: count,
      exact,
      retention,
      coverage: ratio(count, segments),
      meetsMinimum: retention === null ? null : retention >= RETENTION_MINIMUM,
      creditLine: exact === 0,
    };
  });
  return ok({ skill: recipe.name, stub: false, sources, growth });
}
