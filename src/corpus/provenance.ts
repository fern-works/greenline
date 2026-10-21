import { shouldNeverHappen } from "../commons/defect.ts";
import type { Authority, ChangeEntry, Pages, RulingItem } from "./chain.ts";
import type { SourceMeasure } from "./measure.ts";
import {
  isAuthored,
  type Account,
  type CheckedRecipe,
  type Drop,
  type Edit,
  type EditKind,
} from "./recipe.ts";
import { frontMatterBlock, placeProse } from "./render.ts";

/**
 * The provenance of a skill (`workshop/components/ledger.md`, "Provenance";
 * the plan modes-records-recipes, "Provenance"): what the website's origin
 * view, its coverage view per source and its diff per edited passage are
 * rendered from, read off a checked recipe, its measure and its latest
 * change entry as a pure function. Every offset counts UTF-16 code units in
 * the shipped file's text, front matter included, as JavaScript indexes a
 * string.
 */

/** One edit inside a taken passage, placed in the shipped text. */
export interface PlacedEdit {
  readonly segment: string;
  /** The offset of the replacement text in the shipped file. */
  readonly start: number;
  /** The offset just past it. */
  readonly end: number;
  readonly find: string;
  readonly replace: string;
  readonly kind: EditKind;
  readonly reason: string;
  /** The reason shortened, when the recipe writes one. */
  readonly gist?: string | undefined;
  readonly ruling?: string | undefined;
}

/** A passage of a shipped prose file and where its text came from. */
export type PassageOrigin =
  | {
      readonly origin: "taken";
      readonly start: number;
      readonly end: number;
      readonly source: string;
      readonly file: string;
      readonly segments: readonly string[];
      readonly edits: readonly PlacedEdit[];
    }
  | {
      readonly origin: "written";
      readonly start: number;
      readonly end: number;
      readonly kind: EditKind;
      readonly reason: string;
      /** The reason shortened, when the recipe writes one. */
      readonly gist?: string | undefined;
      readonly ruling?: string | undefined;
      readonly credits: readonly string[];
    };

/** A shipped prose file: its text and its passages in order. */
export interface ProseProvenance {
  readonly path: string;
  readonly text: string;
  readonly passages: readonly PassageOrigin[];
}

/** A file of the skill that is not prose: copied whole from a source, or authored with its account. */
export type CopyProvenance =
  | {
      readonly path: string;
      readonly origin: "copied";
      readonly source: string;
      readonly file: string;
    }
  | {
      readonly path: string;
      readonly origin: "authored";
      readonly kind: EditKind;
      readonly reason: string;
    };

/** One upstream segment and what the recipe does with it. */
export type SegmentCoverage =
  | {
      readonly id: string;
      readonly text: string;
      readonly account: "taken";
      /** Whether the recipe edits it. */
      readonly edited: boolean;
    }
  | {
      readonly id: string;
      readonly text: string;
      readonly account: "dropped";
      readonly kind: EditKind;
      readonly reason: string;
      /** The reason shortened, when the recipe writes one. */
      readonly gist?: string | undefined;
      readonly ruling?: string | undefined;
      /** The shipped file and passage that replaced it, when one did. */
      readonly replacedBy?: { readonly path: string; readonly passage: number } | undefined;
    };

/** One source file the recipe names, segment by segment. */
export interface FileCoverage {
  readonly source: string;
  readonly file: string;
  readonly segments: readonly SegmentCoverage[];
}

/** A source of the skill: its pin and its measure, or the measure's absence for a stub. */
export interface SourceProvenance {
  readonly name: string;
  readonly repository: string;
  readonly commit: string;
  readonly licence: string;
  /** The recipe's measure of the source; undefined for a stub, which takes nothing. */
  readonly measure?: Omit<SourceMeasure, "source"> | undefined;
}

/** A skill's provenance: its latest change entry, its sources, its shipped files and its coverage per source file. */
export interface SkillProvenance {
  readonly name: string;
  /** The latest change entry that records the recipe: its id, its gist, its reason, the installed pages it touched, the ruling that authorised it, shown first, and its cumulative ruling list. */
  readonly entry: {
    readonly id: string;
    readonly gist: string;
    readonly reason: string;
    readonly pages: Pages;
    readonly authorisedBy: Authority;
    readonly ruling: readonly RulingItem[];
  };
  readonly stub: boolean;
  /** The credited upstream skill of a stub. */
  readonly credit?:
    | { readonly source: string; readonly file: string; readonly ruling: string }
    | undefined;
  readonly sources: readonly SourceProvenance[];
  readonly files: readonly ProseProvenance[];
  readonly copies: readonly CopyProvenance[];
  readonly coverage: readonly FileCoverage[];
}

/** A pinned source as the manifest states it. */
export interface PinnedSource {
  readonly name: string;
  readonly repo: string;
  readonly commit: string;
  readonly license: string;
}

/** What a skill's provenance is read from. */
export interface ProvenanceInput {
  readonly checked: CheckedRecipe;
  /** The recipe's measure per source; none for a stub. */
  readonly measures: readonly SourceMeasure[];
  readonly entry: ChangeEntry;
  /** The manifest's pinned sources, by name. */
  readonly pins: ReadonlyMap<string, PinnedSource>;
}

/**
 * Each edit of one segment, placed in the segment's edited text: the edits
 * apply in order, and an edit's span moves with every later edit before it
 * and widens over a later edit that overlaps it.
 */
function placeEdits(
  text: string,
  edits: readonly Edit[],
): readonly { readonly start: number; readonly end: number }[] {
  let current = text;
  const spans: { start: number; end: number }[] = [];
  for (const edit of edits) {
    const at = current.indexOf(edit.find);
    const findEnd = at + edit.find.length;
    const shift = edit.replace.length - edit.find.length;
    for (const span of spans) {
      if (span.start >= findEnd) {
        span.start += shift;
        span.end += shift;
      } else if (span.end > at) {
        span.start = Math.min(span.start, at);
        span.end = Math.max(span.end + shift, at + edit.replace.length);
      }
    }
    spans.push({ start: at, end: at + edit.replace.length });
    current = current.slice(0, at) + edit.replace + current.slice(findEnd);
  }
  return spans;
}

/** An item's account alone, without the rest of the item; its gist only where the recipe writes one. */
function accountOf(item: Account): Account {
  const account = { kind: item.kind, reason: item.reason, ruling: item.ruling };
  return item.gist === undefined ? account : { ...account, gist: item.gist };
}

function proseOf(checked: CheckedRecipe): readonly ProseProvenance[] {
  return checked.files.map((file) => {
    const base = file.path === "SKILL.md" ? frontMatterBlock(checked.recipe.frontMatter) : "";
    const placed = placeProse(file);
    const passages = placed.passages.map((place): PassageOrigin => {
      const { item } = place;
      if (item.passage === "written")
        return {
          origin: "written",
          start: base.length + place.start,
          end: base.length + place.end,
          ...accountOf(item),
          credits: item.credits,
        };
      const edits = item.resolved.flatMap((taken, index): PlacedEdit[] => {
        const mine = item.edits.filter((edit) => edit.segment === taken.segment.id);
        const offset = base.length + (place.segmentStarts[index] ?? 0);
        const spans = placeEdits(taken.segment.text, mine);
        return mine.map((edit, at) => ({
          segment: edit.segment,
          start: offset + (spans[at]?.start ?? 0),
          end: offset + (spans[at]?.end ?? 0),
          find: edit.find,
          replace: edit.replace,
          ...accountOf(edit),
        }));
      });
      return {
        origin: "taken",
        start: base.length + place.start,
        end: base.length + place.end,
        source: item.source,
        file: item.file,
        segments: item.segments,
        edits,
      };
    });
    return { path: file.path, text: base + placed.text, passages };
  });
}

function coverageOf(checked: CheckedRecipe): readonly FileCoverage[] {
  const taken = new Map<string, boolean>();
  for (const file of checked.files)
    for (const item of file.passages)
      if (item.passage === "taken")
        for (const segment of item.resolved)
          taken.set(`${item.source}\0${item.file}\0${segment.segment.id}`, segment.edited);
  const drops = new Map<string, Drop>(
    checked.recipe.drops.map((drop) => [`${drop.source}\0${drop.file}\0${drop.segment}`, drop]),
  );
  return checked.sourceFiles.map(({ source, file, segmented }) => ({
    source,
    file,
    segments: segmented.segments.flatMap((segment): SegmentCoverage[] => {
      const key = `${source}\0${file}\0${segment.id}`;
      const edited = taken.get(key);
      if (edited !== undefined)
        return [{ id: segment.id, text: segment.text, account: "taken", edited }];
      const drop = drops.get(key);
      return drop === undefined
        ? []
        : [
            {
              id: segment.id,
              text: segment.text,
              account: "dropped",
              ...accountOf(drop),
              replacedBy: drop.replacedBy,
            },
          ];
    }),
  }));
}

/**
 * A skill's provenance, read off its checked recipe, its measure and its latest change entry.
 * @param input the checked recipe, its measure per source, its latest change entry and the manifest's pins
 * @returns the skill's provenance
 */
export function skillProvenance(input: ProvenanceInput): SkillProvenance {
  const { checked, entry } = input;
  const { recipe } = checked;
  const named = [...recipe.sources, ...(recipe.credit === undefined ? [] : [recipe.credit.source])];
  const sources = [...new Set<string>(named)].map((name): SourceProvenance => {
    const pin =
      input.pins.get(name) ??
      shouldNeverHappen(`the recipe check pins every source a recipe names, and '${name}' is not`);
    const measured = input.measures.find((measure) => measure.source === name);
    return {
      name,
      repository: pin.repo,
      commit: pin.commit,
      licence: pin.license,
      measure:
        measured === undefined
          ? undefined
          : {
              segments: measured.segments,
              taken: measured.taken,
              exact: measured.exact,
              retention: measured.retention,
              coverage: measured.coverage,
              meetsMinimum: measured.meetsMinimum,
              creditLine: measured.creditLine,
            },
    };
  });
  return {
    name: recipe.name,
    entry: {
      id: entry.id,
      gist: entry.gist,
      reason: entry.reason,
      pages: entry.pages,
      authorisedBy: entry.authorisedBy,
      ruling: entry.ruling,
    },
    stub: recipe.credit !== undefined,
    credit: recipe.credit,
    sources,
    files: proseOf(checked),
    copies: recipe.copies.map((copy): CopyProvenance =>
      isAuthored(copy)
        ? { path: copy.path, origin: "authored", kind: copy.kind, reason: copy.reason }
        : { path: copy.path, origin: "copied", source: copy.source, file: copy.file },
    ),
    coverage: coverageOf(checked),
  };
}
