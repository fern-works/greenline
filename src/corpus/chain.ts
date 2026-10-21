import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { err, ok, type Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "../core/contract.ts";
import { STEP_KIND, type Depth } from "../core/modes.ts";
import type { RecipeMeasure, SourceMeasure } from "./measure.ts";
import { gistIssues } from "./recipe.ts";
import type { SkillFile } from "./render.ts";

/**
 * The fresh chain (`corpus/ledger/entries/<id>.json`, schema
 * `greenline.entry/v2`, `workshop/components/ledger.md`, "The entry"). An
 * entry is a change entry, which records one change to a roster
 * skill, the block or the modes with the digests of its recipe and its
 * result, its reason, its measure and its rulings; or a source entry, which
 * records one source read with its identity, its licence class, its verdict,
 * its reason, its rulings, the parts it hands off and, for a method that
 * enters, its placement: its kind and its
 * slot on the line, and where it runs in the modes; or a retirement entry,
 * which records a roster skill leaving: the skill, the slice that retires
 * it, the skill that takes its place or none, the digest of the recipe it
 * leaves and the reason (the decisions row of 2026-09-16).
 * Every entry names its predecessor by id and by the sha256
 * of that entry's bytes; the first cites the old chain's tip and the commit
 * that last wrote the tip's file. The tip is the entry no other entry names.
 *
 * An entry's bytes are its canonical form, `JSON.stringify(entry, null, 2)`
 * and a newline, with its fields in the order {@link serializeEntry} gives:
 * the shape holds no array of plain values, so the formatter leaves the
 * bytes as written and a successor's digest stays true.
 *
 * Every kind carries a gist of at most twelve words, a reason of at most
 * two sentences and 40 words, the one ruling that authorised it
 * (`authorisedBy`), and a ruling list, one item per ruling with its date
 * and the operator's words; a change entry names the installed pages it
 * touched (`pages`); a source entry that hands parts off
 * carries its handoff, and a placement may carry its loads fact. The
 * entries recorded before this form were rewritten into it in place, their
 * ids kept (R52 of the plan procedures-on-the-line); the old form no longer
 * parses. The authorising ruling and the pages were added to every entry
 * in place by J-66 of the workshop, `unknown` where the record did not show
 * them; a new entry states both.
 */

/** The entry's schema identifier. */
const ENTRY_SCHEMA = "greenline.entry/v2";

/** The four licence classes of a source (C10: only a plain MIT source is copied). */
const LICENCE_CLASSES = ["mit", "permissive-other", "ideas-only", "refused"] as const;

/** The six verdicts on a source read (`workshop/skills/procedure-ingest/SKILL.md`, "The six verdicts"). */
const VERDICTS = ["copy", "combine", "lift", "hand-off", "hold", "decline"] as const;

/** The verdicts under which a method enters greenline, each carrying its placement. */
const ENTERING: ReadonlySet<string> = new Set(["copy", "combine", "lift"]);

/** The verdicts that take a source's text, which only a plain MIT source admits (C10). */
const TAKING: ReadonlySet<string> = new Set(["copy", "combine"]);

/** The verdicts a refused licence admits. */
const UNDER_REFUSAL: ReadonlySet<string> = new Set(["decline", "hold"]);

/** The four grades of a placement's evidence, weakest first (`workshop/components/roster-skill.md`, "The placement rubric"). */
const EVIDENCE = ["claimed", "witnessed", "observed", "measured"] as const;

/** The four moves of a placement, least bold first: fill an empty step, strengthen the skill in a step, add a step, reshape a mode's steps. */
const MOVES = ["fill", "strengthen", "add", "reshape"] as const;

/** The moves that place a method of the kind the steps list names: a fill gives a step its method, and a reshape changes a step's depth at a mode. */
const STEP_MOVES: ReadonlySet<string> = new Set(["fill", "reshape"]);

/** How a placement ships: as a trial, which a workspace enables, or as a default. */
const SHIPS = ["trial", "default"] as const;

/**
 * The five depth names, which are code in the modes module; the mapped
 * type makes the compiler refuse a name it lacks or one it does not hold.
 * Kind, mode and step names are data, checked against the definition by
 * `record`.
 */
const DEPTH_NAMES = {
  none: "none",
  inline: "inline",
  written: "written",
  independent: "independent",
  looped: "looped",
} as const satisfies { readonly [Name in Depth["depth"]]: Name };

/** One of {@link LICENCE_CLASSES}. */
export type LicenceClass = (typeof LICENCE_CLASSES)[number];

/** One of {@link VERDICTS}. */
export type Verdict = (typeof VERDICTS)[number];

/** One of {@link MOVES}. */
export type Move = (typeof MOVES)[number];

/** One mode's placement: the step where the method runs or loads, its depth there, and the words it adds there. */
export interface PlacementRow {
  readonly mode: string;
  readonly step: string;
  readonly depth: Depth["depth"];
  /** The words an agent must read at the mode that the placement adds; below zero for the words a swap removes. */
  readonly cost: number;
}

/** One reference file a placed method loads, and the depth whose bullet reads it. */
export interface LoadsRow {
  /** The file's path inside the skill's directory, such as `references/check.md`. */
  readonly file: string;
  readonly depth: Depth["depth"];
}

/** One ruling of an entry's list: its date and the operator's words. */
export interface RulingItem {
  /** The ruling's calendar date, as 2026-10-11. */
  readonly date: string;
  readonly words: string;
}

/**
 * The one ruling that authorised an entry, shown before its list (R49
 * revisited: the list stays cumulative, and the entry's own ruling shows
 * first): a copy of one item of its ruling list; null when the entry adds
 * no ruling of its own; or `unknown` on an entry recorded before the field
 * whose record shows several rulings of its own and not which one
 * authorised it. `record` refuses `unknown` on a new entry.
 */
export type Authority = RulingItem | null | "unknown";

/** One installed page a change touched: its path inside the skill's directory, or in the workspace for the modes or the block. */
export interface Page {
  readonly path: string;
}

/**
 * The installed pages a change touched, in path order, none for a change
 * that touched no page; or `unknown` on an entry recorded before the field
 * whose record does not show them. `record` refuses `unknown` on a new entry.
 */
export type Pages = readonly Page[] | "unknown";

/** One part a source entry hands off, and where in the source it stands. */
export interface HandedPart {
  readonly part: string;
  readonly locator: string;
}

/** The parts a source entry hands off and their recipient: `garden`, or a workshop craft by its page name, `craft-<name>`. */
export interface Handoff {
  readonly recipient: string;
  readonly parts: readonly HandedPart[];
}

/** Where a method that enters belongs in the modes, as the operator ruled its placement proposal. */
export interface Placement {
  /** The candidate's kind on the line, a kind of the modes definition, which `record` checks (`src/corpus/line.ts`). */
  readonly kind: string;
  /**
   * The slot the move names: for `fill`, the step; for `strengthen`, the
   * roster skill; for `add`, the name of the new step, start or habit; for
   * `reshape`, the mode. `record` checks it against the manifest and the
   * modes definition (`src/corpus/line.ts`).
   */
  readonly slot: string;
  /** The failure the method catches. */
  readonly catches: string;
  readonly evidence: (typeof EVIDENCE)[number];
  readonly move: Move;
  /** The boldest of the four moves considered, and the evidence that would make it right. */
  readonly boldest: { readonly move: Move; readonly needs: string };
  /** One row for each mode of the definition. */
  readonly modes: readonly PlacementRow[];
  readonly ships: (typeof SHIPS)[number];
  /** The reference files the placement's depths read, when it names any. */
  readonly loads?: readonly LoadsRow[] | undefined;
}

/** What every entry states in prose: its gist, its reason and its rulings. */
interface EntryProse {
  /** The reason shortened for the edition, in at most twelve words. */
  readonly gist: string;
  /** What entered or left and why, in at most two sentences and 40 words. */
  readonly reason: string;
  /** The one ruling that authorised the entry, shown before the list. */
  readonly authorisedBy: Authority;
  /** The operator's rulings, one item each; a change entry's list restates its subject's previous list and appends its own items. */
  readonly ruling: readonly RulingItem[];
}

/** The predecessor of an entry after the first: its id and the sha256 of its bytes. */
export interface PreviousEntry {
  readonly id: string;
  readonly sha256: string;
}

/** The first entry's citation of the old chain: its tip's id and revision, and the commit that last wrote the tip's file. */
export interface OldChainTip {
  readonly oldChain: {
    readonly id: string;
    readonly revision: string;
    readonly commit: string;
  };
}

/** What an entry continues. */
export type Previous = PreviousEntry | OldChainTip;

/** A change entry's measure: S9's measure of the recipe, without the skill its subject names. */
export interface EntryMeasure {
  readonly stub: boolean;
  readonly sources: readonly SourceMeasure[];
  readonly growth: number;
}

/** One change to a roster skill (`skill:<name>`), the block or the modes. */
export interface ChangeEntry extends EntryProse {
  readonly kind: "change";
  readonly id: string;
  readonly previous: Previous;
  readonly subject: string;
  /** The sha256 of the recipe file's bytes. */
  readonly recipe: string;
  /** The sha256 of the result: for a skill, {@link resultDigest} of its directory. */
  readonly result: string;
  /** The installed pages the change touched. */
  readonly pages: Pages;
  readonly measure: EntryMeasure;
}

/** A source's identity: its repository, the commit read and the path read there. */
export interface SourceIdentity {
  readonly repository: string;
  readonly commit: string;
  readonly path: string;
}

/** One source read (the board question Q-16). */
export interface SourceEntry extends EntryProse {
  readonly kind: "source";
  readonly id: string;
  readonly previous: Previous;
  readonly source: SourceIdentity;
  /** The name of the source's pin in the corpus manifest, when it has one. */
  readonly pin?: string | undefined;
  readonly licence: LicenceClass;
  readonly verdict: Verdict;
  /** The parts handed off: required on a hand-off and allowed on a copy, a combine and a lift. */
  readonly handoff?: Handoff | undefined;
  /** Required on a copy, a combine and a lift, and refused on the other verdicts. */
  readonly placement?: Placement | undefined;
}

/** A roster skill leaving the roster (the decisions row of 2026-09-16: a retirement is a ledger entry with its reason and replacement). */
export interface RetirementEntry extends EntryProse {
  readonly kind: "retirement";
  readonly id: string;
  readonly previous: Previous;
  /** The skill that leaves. */
  readonly skill: string;
  /** The slice that retires it, in words a public reader can follow. */
  readonly slice: string;
  /** The roster skill that takes its place, or null when none does. */
  readonly replacedBy: string | null;
  /** The sha256 of the recipe it leaves: the one its latest change entry records. */
  readonly recipe: string;
}

/** An entry of the fresh chain. */
export type Entry = ChangeEntry | SourceEntry | RetirementEntry;

/** An entry and the sha256 of its bytes, which its successor names. */
export interface ChainedEntry {
  readonly entry: Entry;
  readonly sha256: string;
}

/** A whole chain, oldest first; its last entry is the tip. */
export interface Chain {
  readonly entries: readonly ChainedEntry[];
}

/** One reason a chain or an entry is refused, naming the entry. */
export interface ChainIssue {
  readonly entry: string;
  readonly message: string;
}

/** A chain that is not whole: every reason, each naming its entry. */
export class ChainRefused extends Error {
  /** The tag the Result law switches on. */
  readonly _tag = "ChainRefused" as const;
  /** Every reason, each naming its entry. */
  readonly issues: readonly ChainIssue[];
  /** @param issues every reason */
  constructor(issues: readonly ChainIssue[]) {
    super(`the chain is refused: ${issues.map((i) => `${i.entry}: ${i.message}`).join("; ")}`);
    this.issues = issues;
  }
}

/** One entry file as the tree reads it: its name under `corpus/ledger/entries/` and its bytes. */
export interface EntryFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const ENTRY_ID = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SUBJECT = /^(?:skill:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|block|modes)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SOURCE_PATH = /^(?:\.|(?!\/)(?!.*\/$)[\w.][\w./-]*)$/;
const PRIVATE_PATH = /docs\/(?:work|research)\//;

const RULING_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether a pattern's first three groups, year, month and day, name a calendar date. */
function calendarDate(pattern: RegExp, text: string): boolean {
  const match = pattern.exec(text);
  if (match === null) return false;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Whether an id's leading date is a calendar date. */
function datedId(id: string): boolean {
  return calendarDate(ENTRY_ID, id);
}

const line = z
  .string()
  .min(1)
  .regex(/^\S(?:[^\n]*\S)?$/, "one line, with no white space at either end")
  .refine(
    (text) => !PRIVATE_PATH.test(text),
    "a public entry names no path under docs/work/ or docs/research/",
  );
const entryId = z
  .string()
  .refine(datedId, "an entry's id is a calendar date and a slug, as 2026-10-05-a-slug");
const previous = z.union([
  z.object({ id: entryId, sha256: z.string().regex(SHA256) }).strict(),
  z
    .object({
      oldChain: z
        .object({
          id: z.string().regex(NAME),
          revision: z.string().regex(SHA256),
          commit: z.string().regex(COMMIT, "the full 40-hex commit"),
        })
        .strict(),
    })
    .strict(),
]);
const ratio = z.number().min(0).max(1).nullable();
const count = z.number().int().min(0);
const measure = z
  .object({
    stub: z.boolean(),
    sources: z.array(
      z
        .object({
          source: z.string().regex(NAME),
          segments: count,
          taken: count,
          exact: count,
          retention: ratio,
          coverage: ratio,
          meetsMinimum: z.boolean().nullable(),
          creditLine: z.boolean(),
        })
        .strict(),
    ),
    growth: count,
  })
  .strict();
/** A reason's most sentences and words (R52). */
const REASON_SENTENCES = 2;
const REASON_WORDS = 40;

/** A sentence's end: a full stop, a question mark or an exclamation mark, any closing quote or bracket after it, then white space or the end. */
const SENTENCE_END = /[.!?]["'\u201d\u2019)\]]*(?=\s|$)/g;

/**
 * How a reason breaks its form (R52): more than two sentences, a
 * sentence ending at a full stop, a question mark or an exclamation mark
 * before white space or the end, and a closing run without one counting as
 * one more; or more than 40 words, counted between runs of white space.
 * @param reason the reason as the entry states it
 * @returns each broken part of the form, none for a reason within it
 */
function reasonIssues(reason: string): readonly string[] {
  const ends = [...reason.matchAll(SENTENCE_END)];
  const tail = reason.slice((ends.at(-1)?.index ?? -1) + (ends.at(-1)?.[0].length ?? 1)).trim();
  const sentences = ends.length + (tail === "" ? 0 : 1);
  const words = reason.split(/\s+/).filter((word) => word !== "").length;
  return [
    ...(sentences > REASON_SENTENCES
      ? [`a reason holds at most two sentences, and this one holds ${sentences}`]
      : []),
    ...(words > REASON_WORDS
      ? [`a reason holds at most ${REASON_WORDS} words, and this one holds ${words}`]
      : []),
  ];
}

/** The two recipients of a handoff: garden, for knowledge consulted to make an engineering choice, and a workshop craft by its page name, for a method of the workshop itself. */
const RECIPIENT = /^(?:garden|craft-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
const RECIPIENT_NAMED =
  "a handoff names its recipient: garden, or a workshop craft by its page name, craft-<name>";

/** A path inside a skill's directory: relative, with no `.` or `..` part and no closing slash. */
function insideSkill(path: string): boolean {
  return (
    /^(?!\/)(?!.*\/$)[\w.][\w./-]*$/.test(path) &&
    path.split("/").every((part) => part !== ".." && part !== ".")
  );
}

const depth = z.enum(DEPTH_NAMES, {
  error: "a depth is none, inline, written, independent or looped",
});
const loadsRows = z
  .array(
    z
      .object({
        file: z.string().refine(insideSkill, "a file inside the skill's directory"),
        depth,
      })
      .strict(),
  )
  .min(1, "a loads fact names at least one file and its depth");
const placementFields = {
  kind: z.string().regex(NAME, "a kind is a kebab-case name"),
  slot: z.string().regex(NAME, "a slot is a kebab-case name"),
  catches: line,
  evidence: z.enum(EVIDENCE),
  move: z.enum(MOVES),
  boldest: z.object({ move: z.enum(MOVES), needs: line }).strict(),
  modes: z
    .array(
      z
        .object({
          mode: z.string().regex(NAME),
          step: z.string().regex(NAME),
          depth,
          cost: z.number().int(),
        })
        .strict(),
    )
    .min(1, "a placement gives one row for each mode"),
  ships: z.enum(SHIPS),
};

/** A placement's checks across its fields. */
function placementChecks(value: Placement, context: z.RefinementCtx): void {
  if (MOVES.indexOf(value.boldest.move) < MOVES.indexOf(value.move))
    context.addIssue({
      code: "custom",
      path: ["boldest", "move"],
      message:
        "the boldest option is at least as bold as the move chosen, in the order fill, strengthen, add, reshape",
    });
  if (STEP_MOVES.has(value.move) && value.kind !== STEP_KIND)
    context.addIssue({
      code: "custom",
      path: ["kind"],
      message: `a ${value.move} places a step method, so its kind is ${STEP_KIND}, not '${value.kind}'`,
    });
  const reached = new Set(value.modes.map((row) => row.depth));
  (value.loads ?? []).forEach((row, index) => {
    const message =
      row.depth === "none"
        ? "a file is read at a depth where the step runs, never at none"
        : reached.has(row.depth)
          ? undefined
          : `the placement reaches the depth '${row.depth}' at no mode`;
    if (message !== undefined)
      context.addIssue({ code: "custom", path: ["loads", index, "depth"], message });
  });
}

const placement = z
  .object({ ...placementFields, loads: loadsRows.optional() })
  .strict()
  .superRefine(placementChecks);

/** One ruling item: its calendar date and the operator's words. */
const rulingItem = z
  .object({
    date: z
      .string()
      .refine(
        (text) => calendarDate(RULING_DATE, text),
        "a ruling's date is a calendar date, as 2026-10-11",
      ),
    words: line,
  })
  .strict();

const UNKNOWN = "unknown";

/** The fields every entry states in prose: the gist, the reason in its form, the authorising ruling and the ruling list. */
const proseFields = {
  gist: line.superRefine((value, context) => {
    for (const message of gistIssues(value)) context.addIssue({ code: "custom", message });
  }),
  reason: line.superRefine((value, context) => {
    for (const message of reasonIssues(value)) context.addIssue({ code: "custom", message });
  }),
  authorisedBy: z.union([rulingItem, z.null(), z.literal(UNKNOWN)], {
    error: "the authorising ruling is one item of the ruling list, null or unknown",
  }),
  ruling: z.array(rulingItem),
};

/** The installed pages a change touched: unknown, or each page once by its path. */
const pages = z.union(
  [
    z.literal(UNKNOWN),
    z.array(
      z
        .object({
          path: z.string().refine(insideSkill, "a page's path is relative, with no . or .. part"),
        })
        .strict(),
    ),
  ],
  { error: "the pages are a list of {path}, or unknown" },
);

/**
 * The checks every entry's prose makes across its fields: the authorising
 * ruling is an item of the entry's own list, so the list stays whole and the
 * one item shows first.
 * @param entry the entry's prose fields
 * @param context the refinement's context
 */
function authorityChecks(
  entry: { readonly authorisedBy: Authority; readonly ruling: readonly RulingItem[] },
  context: z.RefinementCtx,
): void {
  const named = entry.authorisedBy;
  if (named === null || named === UNKNOWN) return;
  if (!entry.ruling.some((item) => item.date === named.date && item.words === named.words))
    context.addIssue({
      code: "custom",
      path: ["authorisedBy"],
      message: "the authorising ruling is an item of the entry's ruling list, by date and words",
    });
}

/** A change's pages name each path once. */
function pagesChecks(entry: { readonly pages: Pages }, context: z.RefinementCtx): void {
  if (entry.pages === UNKNOWN) return;
  const seen = new Set<string>();
  for (const page of entry.pages) {
    if (seen.has(page.path))
      context.addIssue({
        code: "custom",
        path: ["pages"],
        message: `the page '${page.path}' is named twice`,
      });
    seen.add(page.path);
  }
}

const handoff = z
  .object({
    recipient: z.string({ error: RECIPIENT_NAMED }).regex(RECIPIENT, RECIPIENT_NAMED),
    parts: z
      .array(z.object({ part: line, locator: line }).strict())
      .min(1, "a handoff names at least one part it hands off"),
  })
  .strict();

const envelope = { schema: z.literal(ENTRY_SCHEMA), id: entryId, previous };
const changeFields = {
  kind: z.literal("change"),
  subject: z.string().regex(SUBJECT, "a subject is skill:<name>, block or modes"),
  recipe: z.string().regex(SHA256),
  result: z.string().regex(SHA256),
  pages,
};
const sourceFields = {
  kind: z.literal("source"),
  source: z
    .object({
      repository: z.string().url(),
      commit: z.string().regex(COMMIT, "the full 40-hex commit"),
      path: z
        .string()
        .regex(SOURCE_PATH, "a path inside the repository, or . for all of it")
        .refine(
          (path) => path.split("/").every((part) => part !== "..") && !PRIVATE_PATH.test(path),
          "a path inside the repository that names no private path",
        ),
    })
    .strict(),
  pin: z.string().regex(NAME).optional(),
  licence: z.enum(LICENCE_CLASSES),
  verdict: z.enum(VERDICTS),
};
const retirementFields = {
  kind: z.literal("retirement"),
  skill: z.string().regex(NAME, "a skill is a kebab-case name"),
  slice: line,
  replacedBy: z.string().regex(NAME, "a replacement is a kebab-case name, or null").nullable(),
  recipe: z.string().regex(SHA256),
};

/** A change entry's measure under the retention minimum needs the operator's ruling. */
function minimumChecks(
  entry: { readonly ruling: readonly RulingItem[]; readonly measure: EntryMeasure },
  context: z.RefinementCtx,
): void {
  if (
    entry.ruling.length === 0 &&
    entry.measure.sources.some((source) => source.meetsMinimum === false)
  )
    context.addIssue({
      code: "custom",
      path: ["ruling"],
      message: "a measure under the retention minimum needs the operator's ruling",
    });
}

/** A retirement never names the skill that leaves as its replacement. */
function retirementChecks(entry: RetirementEntry, context: z.RefinementCtx): void {
  if (entry.replacedBy === entry.skill)
    context.addIssue({
      code: "custom",
      path: ["replacedBy"],
      message: "a skill is never replaced by itself",
    });
}

/**
 * A source entry's checks across its fields: the licence pairs with the
 * verdict (C10); a copy, a combine and a lift carry a placement and no
 * other verdict does; a hand-off carries its handoff, and a hold or a
 * decline carries none.
 * @param entry a source entry
 * @param context the refinement's context
 */
function sourceChecks(entry: SourceEntry, context: z.RefinementCtx): void {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: "custom", path: [path], message });
  if (entry.licence !== "mit" && TAKING.has(entry.verdict))
    issue(
      "verdict",
      "only a plain MIT source is copied or combined; the method of any other enters only by lift (C10)",
    );
  if (entry.licence === "refused" && !UNDER_REFUSAL.has(entry.verdict))
    issue("verdict", "a refused licence admits only decline or hold");
  if (entry.verdict === "hand-off" && entry.handoff === undefined)
    issue("handoff", `a hand-off carries its handoff; ${RECIPIENT_NAMED}`);
  if (entry.handoff !== undefined && UNDER_REFUSAL.has(entry.verdict))
    issue(
      "handoff",
      "only a hand-off, or a copy, combine or lift that hands parts off, carries a handoff",
    );
  if (ENTERING.has(entry.verdict) && entry.placement === undefined)
    issue("placement", "a copy, combine or lift entry carries its placement");
  if (!ENTERING.has(entry.verdict) && entry.placement !== undefined)
    issue("placement", "only a copy, combine or lift entry carries a placement");
}

/** The entry, `greenline.entry/v2`: {@link proseFields} on every kind, a handoff on a source entry and the loads fact on a placement. */
const entrySchema = z.discriminatedUnion("kind", [
  z
    .object({ ...envelope, ...changeFields, ...proseFields, measure })
    .strict()
    .superRefine((entry, context) => {
      minimumChecks(entry, context);
      authorityChecks(entry, context);
      pagesChecks(entry, context);
    }),
  z
    .object({
      ...envelope,
      ...sourceFields,
      ...proseFields,
      handoff: handoff.optional(),
      placement: placement.optional(),
    })
    .strict()
    .superRefine((entry, context) => {
      sourceChecks(entry, context);
      authorityChecks(entry, context);
    }),
  z
    .object({ ...envelope, ...retirementFields, ...proseFields })
    .strict()
    .superRefine((entry, context) => {
      retirementChecks(entry, context);
      authorityChecks(entry, context);
    }),
]);

function previousForm(value: Previous): Previous {
  return "oldChain" in value
    ? {
        oldChain: {
          id: value.oldChain.id,
          revision: value.oldChain.revision,
          commit: value.oldChain.commit,
        },
      }
    : { id: value.id, sha256: value.sha256 };
}

/**
 * A placement in the entry's field order.
 * @param value a parsed placement
 * @returns the placement as an entry carries it
 */
function placementForm(value: Placement): Placement {
  return {
    kind: value.kind,
    slot: value.slot,
    catches: value.catches,
    evidence: value.evidence,
    move: value.move,
    boldest: { move: value.boldest.move, needs: value.boldest.needs },
    modes: value.modes.map((row) => ({
      mode: row.mode,
      step: row.step,
      depth: row.depth,
      cost: row.cost,
    })),
    ships: value.ships,
    loads: value.loads?.map((row) => ({ file: row.file, depth: row.depth })),
  };
}

/**
 * A ruling list in the entry's field order.
 * @param ruling the list as parsed
 * @returns each item's date and words
 */
function rulingForm(ruling: readonly RulingItem[]): readonly RulingItem[] {
  return ruling.map((item) => ({ date: item.date, words: item.words }));
}

/**
 * The authorising ruling in the entry's field order.
 * @param value the field as parsed
 * @returns the item's date and words, or null or unknown as they stand
 */
function authorityForm(value: Authority): Authority {
  return value === null || value === UNKNOWN ? value : { date: value.date, words: value.words };
}

/**
 * Pages in path order, so the canonical bytes do not depend on the order a recorder wrote them in.
 * @param value the field as parsed
 * @returns each page's path, sorted, or unknown
 */
function pagesForm(value: Pages): Pages {
  return value === UNKNOWN
    ? value
    : [...value]
        .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
        .map((page) => ({ path: page.path }));
}

/**
 * A handoff in the entry's field order.
 * @param value a parsed handoff
 * @returns the handoff as an entry carries it
 */
function handoffForm(value: Handoff): Handoff {
  return {
    recipient: value.recipient,
    parts: value.parts.map((part) => ({ part: part.part, locator: part.locator })),
  };
}

/**
 * A measure in the entry's field order.
 * @param value a recipe's measure, or an entry's
 * @returns the measure as an entry carries it, without the skill
 */
export function entryMeasure(value: RecipeMeasure | EntryMeasure): EntryMeasure {
  return {
    stub: value.stub,
    sources: value.sources.map((source) => ({
      source: source.source,
      segments: source.segments,
      taken: source.taken,
      exact: source.exact,
      retention: source.retention,
      coverage: source.coverage,
      meetsMinimum: source.meetsMinimum,
      creditLine: source.creditLine,
    })),
    growth: value.growth,
  };
}

/**
 * An entry's canonical bytes, the only form `record` writes and the chain accepts.
 * @param entry a parsed entry
 * @returns its JSON, two-space indented, fields in the schema's order, and a newline
 */
export function serializeEntry(entry: Entry): string {
  const head = {
    schema: ENTRY_SCHEMA,
    id: entry.id,
    kind: entry.kind,
    previous: previousForm(entry.previous),
  };
  // The gist, the reason, the authorising ruling and the ruling list stand
  // together, after the kind's other fields; the authorising ruling stands
  // before the cumulative list so a reader meets it first (R49 revisited).
  const prose = {
    gist: entry.gist,
    reason: entry.reason,
    authorisedBy: authorityForm(entry.authorisedBy),
    ruling: rulingForm(entry.ruling),
  };
  const body =
    entry.kind === "retirement"
      ? {
          ...head,
          skill: entry.skill,
          slice: entry.slice,
          replacedBy: entry.replacedBy,
          recipe: entry.recipe,
          ...prose,
        }
      : entry.kind === "change"
        ? {
            ...head,
            subject: entry.subject,
            recipe: entry.recipe,
            result: entry.result,
            pages: pagesForm(entry.pages),
            ...prose,
            measure: entryMeasure(entry.measure),
          }
        : {
            ...head,
            source: {
              repository: entry.source.repository,
              commit: entry.source.commit,
              path: entry.source.path,
            },
            pin: entry.pin,
            licence: entry.licence,
            verdict: entry.verdict,
            ...prose,
            handoff: entry.handoff === undefined ? undefined : handoffForm(entry.handoff),
            placement: entry.placement === undefined ? undefined : placementForm(entry.placement),
          };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/**
 * Parse one entry's text: refuse invalid JSON, another schema, the old
 * form `greenline.entry/v1` among them, an unknown or missing field, an id
 * that is not a date and a slug, a malformed digest or commit, a line of
 * prose that names a private path, a gist outside its rule, a reason of
 * more than two sentences or 40 words, a ruling item without its calendar
 * date, an authorising ruling that is no item of the list, a page named
 * twice or outside its directory, a measure under the minimum without a ruling, a verdict its
 * licence class forbids, a placement missing where the verdict enters a
 * method or present where it does not, a hand-off without its handoff, a
 * handoff on a hold or a decline, a recipient that is neither `garden` nor
 * `craft-<name>`, a handoff with no part, and a loads row at a depth the
 * placement does not reach. A placement's mode and step names, a craft
 * recipient's page and a ruling list against its subject's previous one
 * are checked by `record`.
 * @param input the entry's text
 * @param source where the text came from, for the refusal
 * @returns the entry, or every issue found
 */
export function parseEntry(input: string, source: string): Result<Entry, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [{ path: "", message: "the entry is not valid JSON" }]);
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const { schema: _schema, ...entry } = parsed.data;
  return contractOk(entry);
}

/**
 * The digest of a skill directory: the sha256 of one line per file,
 * `<sha256 of its bytes>  <path>`, in path order.
 * @param files the directory's files
 * @returns the digest a change entry names as its result
 */
export function resultDigest(files: readonly SkillFile[]): string {
  return sha256Hex(
    [...files]
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
      .map((file) => `${sha256Hex(file.bytes)}  ${file.path}\n`)
      .join(""),
  );
}

/** The key under which an entry's predecessor is indexed: the old chain shares one. */
function predecessorKey(value: Previous): string {
  return "oldChain" in value ? "the old chain's tip" : value.id;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The entries a chain's files hold, by id, and the files refused. */
interface ReadEntries {
  readonly parsed: ReadonlyMap<string, ChainedEntry>;
  readonly issues: readonly ChainIssue[];
}

/** Parse every entry file; a file that cannot be one is refused by name. */
function readEntries(files: readonly EntryFile[]): ReadEntries {
  const parsed = new Map<string, ChainedEntry>();
  const issues: ChainIssue[] = [];
  for (const file of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const id = file.name.replace(/\.json$/, "");
    let text: string;
    try {
      text = utf8.decode(file.bytes);
    } catch {
      issues.push({ entry: id, message: "the entry is not UTF-8 text" });
      continue;
    }
    const entry = parseEntry(text, `corpus/ledger/entries/${file.name}`);
    if (entry._tag === "err") {
      for (const issue of entry.error.issues)
        issues.push({ entry: id, message: `${issue.path || "the entry"}: ${issue.message}` });
      continue;
    }
    if (entry.value.id !== id) {
      issues.push({ entry: id, message: `the file holds the entry '${entry.value.id}'` });
      continue;
    }
    if (serializeEntry(entry.value) !== text) {
      issues.push({
        entry: id,
        message: "the bytes are not the entry's canonical form, as record writes it",
      });
      continue;
    }
    parsed.set(id, { entry: entry.value, sha256: sha256Hex(file.bytes) });
  }
  return { parsed, issues };
}

/** The issues of each entry's predecessor: missing, at another digest, or named twice. */
function predecessorIssues(parsed: ReadonlyMap<string, ChainedEntry>): readonly ChainIssue[] {
  const issues: ChainIssue[] = [];
  const named = new Map<string, string[]>();
  for (const [id, { entry }] of parsed) {
    const key = predecessorKey(entry.previous);
    named.set(key, [...(named.get(key) ?? []), id]);
    if ("oldChain" in entry.previous) continue;
    const before = parsed.get(entry.previous.id);
    if (before === undefined)
      issues.push({ entry: id, message: `its predecessor '${entry.previous.id}' is missing` });
    else if (before.sha256 !== entry.previous.sha256)
      issues.push({
        entry: id,
        message: `its predecessor '${entry.previous.id}' has the digest ${before.sha256}, not ${entry.previous.sha256}`,
      });
  }
  for (const [key, ids] of named)
    if (ids.length > 1)
      for (const id of ids)
        issues.push({
          entry: id,
          message: `${ids.join(" and ")} name the same predecessor, ${key}`,
        });
  return issues;
}

/** The entries on a cycle: each one's predecessors lead back to it. */
function cycleIssues(
  parsed: ReadonlyMap<string, ChainedEntry>,
  reached: ReadonlySet<string>,
): readonly ChainIssue[] {
  const issues: ChainIssue[] = [];
  const reported = new Set<string>();
  for (const start of parsed.keys()) {
    if (reached.has(start) || reported.has(start)) continue;
    const walk: string[] = [];
    let at: string | undefined = start;
    while (at !== undefined && !walk.includes(at)) {
      walk.push(at);
      const value: Previous | undefined = parsed.get(at)?.entry.previous;
      at = value === undefined || "oldChain" in value ? undefined : value.id;
    }
    if (at === undefined) continue;
    const loop = walk.slice(walk.indexOf(at));
    for (const id of loop)
      if (!reported.has(id)) {
        reported.add(id);
        issues.push({ entry: id, message: `it is on a cycle: ${[...loop, at].join(" → ")}` });
      }
  }
  return issues;
}

/**
 * Read a chain from its entry files: refuse an entry that does not parse,
 * that is not in its file or not in its canonical form, a missing
 * predecessor, a predecessor digest that does not match, two entries naming
 * the same predecessor, and a cycle; each refusal names the entry.
 * @param files every file under `corpus/ledger/entries/` named `*.json`
 * @returns the chain, oldest first, or every refusal
 */
export function parseChain(files: readonly EntryFile[]): Result<Chain, ChainRefused> {
  const { parsed, issues } = readEntries(files);
  const found = [...issues, ...predecessorIssues(parsed)];
  const next = new Map<string, string>();
  let first: string | undefined;
  for (const [id, { entry }] of parsed)
    if ("oldChain" in entry.previous) first ??= id;
    else next.set(entry.previous.id, id);
  const order: ChainedEntry[] = [];
  const reached = new Set<string>();
  for (let at = first; at !== undefined && !reached.has(at); at = next.get(at)) {
    reached.add(at);
    const chained = parsed.get(at);
    if (chained !== undefined) order.push(chained);
  }
  // With every predecessor present and none named twice, an entry the walk
  // from the first does not reach lies on a cycle.
  found.push(...cycleIssues(parsed, reached));
  return found.length > 0 ? err(new ChainRefused(found)) : ok({ entries: order });
}

/**
 * The tip: the entry no other entry names.
 * @param chain a whole chain
 * @returns its last entry's id and digest, or undefined for an empty chain
 */
export function tipOf(chain: Chain): PreviousEntry | undefined {
  const last = chain.entries.at(-1);
  return last === undefined ? undefined : { id: last.entry.id, sha256: last.sha256 };
}

/**
 * The skill a change entry's subject names.
 * @param entry an entry
 * @returns the skill's name, or undefined for the block, the modes or a source entry
 */
export function skillOf(entry: Entry): string | undefined {
  return entry.kind === "change" && entry.subject.startsWith("skill:")
    ? entry.subject.slice("skill:".length)
    : undefined;
}

/**
 * The latest change entry of each skill on the roster: a skill whose
 * latest entry is its retirement has none, until a later change brings it
 * back.
 * @param chain a whole chain
 * @returns each skill's last change entry in the chain's order, by skill
 */
export function latestChanges(chain: Chain): ReadonlyMap<string, ChangeEntry> {
  const latest = new Map<string, ChangeEntry>();
  for (const { entry } of chain.entries) {
    if (entry.kind === "retirement") latest.delete(entry.skill);
    const skill = skillOf(entry);
    if (skill !== undefined && entry.kind === "change") latest.set(skill, entry);
  }
  return latest;
}

/**
 * The latest change entry of one subject that names no skill, such as `modes`.
 * @param chain a whole chain
 * @param subject the subject, as an entry states it
 * @returns its latest change entry, or undefined when none records it
 */
export function latestOfSubject(chain: Chain, subject: string): ChangeEntry | undefined {
  let latest: ChangeEntry | undefined;
  for (const { entry } of chain.entries)
    if (entry.kind === "change" && entry.subject === subject) latest = entry;
  return latest;
}

/**
 * The skills the chain holds retired: each skill whose latest entry is its
 * retirement, with that retirement.
 * @param chain a whole chain
 * @returns each retired skill's retirement, in the chain's order, by skill
 */
export function retiredSkills(chain: Chain): ReadonlyMap<string, RetirementEntry> {
  const retired = new Map<string, RetirementEntry>();
  for (const { entry } of chain.entries) {
    if (entry.kind === "retirement") retired.set(entry.skill, entry);
    const skill = skillOf(entry);
    if (skill !== undefined) retired.delete(skill);
  }
  return retired;
}
