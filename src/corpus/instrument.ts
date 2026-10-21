import { join } from "node:path";
import { err, ok, type Result } from "../commons/result.ts";
import { parseCorpusManifest, type CorpusManifest, type CorpusSource } from "../core/corpus.ts";
import type { ContractParseFailed } from "../core/contract.ts";
import type { Installation } from "../core/installation.ts";
import { parseModes, type ModesDefinition } from "../core/modes.ts";
import {
  latestChanges,
  latestOfSubject,
  parseChain,
  parseEntry,
  serializeEntry,
  skillOf,
  tipOf,
  type Chain,
  type ChainIssue,
  type ChainRefused,
  type ChangeEntry,
  type Entry,
  type PreviousEntry,
  type SourceEntry,
} from "./chain.ts";
import { draftNative, draftRecipe, recipeText, type Drafted } from "./draft.ts";
import {
  compareSkills,
  projectedSources,
  sheetSegments,
  stubCount,
  wholeMeasure,
  type Comparison,
  type ProjectedSource,
  type ProseText,
  type SheetSegment,
  type StubCount,
} from "./intake.ts";
import { frontFindings, hasReferences, type FrontFinding } from "./fronts.ts";
import { kindIssues, lineOf, placementSlotIssues } from "./line.ts";
import { measureRecipe, type RecipeMeasure, type SourceMeasure } from "./measure.ts";
import {
  checkRecipe,
  parseRecipe,
  RecipeRefused,
  type CheckedRecipe,
  type RecipeIssue,
  type Snapshots,
  type SourceName,
} from "./recipe.ts";
import {
  manifestWithSources,
  reanchor,
  sourceSnapshot,
  type RecipeRefresh,
  type SourceSnapshot,
} from "./refresh.ts";
import { skillProvenance, type SkillProvenance } from "./provenance.ts";
import {
  appendIssues,
  authorityIssues,
  changeIssues,
  handoffIssues,
  placementIssues,
  retirementIssues,
  rulingListIssues,
  skillState,
  sourceIssues,
  type SkillState,
} from "./record.ts";
import { budgetReport, type BudgetOutput, type ReferencesPages } from "./budget.ts";
import {
  modesRecipeIssues,
  modesState,
  parseModesRecipe,
  type ModesRecipe,
} from "./modes-recipe.ts";
import { compareSkill, renderSkill, type Difference, type SkillFile } from "./render.ts";
import {
  hasCraftPage,
  holdsWorkshop,
  readEntryFiles,
  readFrozenRows,
  readInventoryEntries,
  readLicence,
  readManifest,
  readManifestText,
  readRecipe,
  readSkillDirectory,
  readSnapshotFiles,
  readSnapshots,
  readTextFile,
  readView,
  readModesBytes,
  recipeNames,
  MODES_RECIPE,
  rewriteRecipe,
  snapshotDirectories,
  writeEntry,
  writeManifestText,
  writeRecipe,
  writeSkillDirectory,
  writeSnapshot,
  extendSnapshot,
  extensionIssues,
  writeViews,
  fetchUpstream,
  type Fetched,
  type ResolvedLink,
  type SnapshotEntry,
} from "./tree.ts";
import { renderViews, usesBySource, type View } from "./views.ts";
import {
  blocksOf,
  editionSkill,
  exampleRecord,
  lineFacts,
  linePlaces,
  type Block,
  type EditionSkill,
  type LineFacts,
  type LinePlace,
} from "./edition.ts";

/**
 * The verbs of the recipe instrument (`scripts/corpus.mjs`,
 * `workshop/components/recipes.md`, `workshop/components/ledger.md`):
 * `draft <skill>`, `render <skill>`, `verify [skill...]`,
 * `measure [skill...]`, `budget [mode...]`, `record <entry.json>` and
 * `views [--write]`;
 * `record` reads the modes definition only to check a placement, `verify`
 * to check the manifest's kinds and slots, and `views` to render the line. Each
 * returns the one JSON
 * object the script prints and whether it failed: a refusal, a difference
 * or a finding fails, and the script exits 1. `verify` and `measure` with
 * no skill read every recipe on disk; `verify` also checks the fresh chain
 * and that each recipe's latest change entry records it.
 */

/** A recipe a verb refused, with every reason. */
export interface Refusal {
  readonly skill: string;
  readonly issues: readonly RecipeIssue[];
}

/** What a verb prints, and whether the script exits 1. */
export interface VerbOutcome<Output> {
  readonly output: Output;
  readonly failed: boolean;
}

/** `render`'s report: the files written, or the refusal. */
export interface RenderOutput {
  readonly verb: "render";
  readonly skill: string;
  readonly wrote: readonly string[];
  readonly refused: readonly Refusal[];
}

/** One difference of one skill. */
export interface SkillDifference extends Difference {
  readonly skill: string;
}

/** A recipe whose latest change entry does not record it, or that has none. */
export interface LedgerFinding {
  readonly skill: string;
  /** The latest change entry of the skill, when there is one. */
  readonly entry?: string | undefined;
  readonly message: string;
}

/** A committed view that is not its rendering, or why the views cannot be rendered. */
export interface ViewFinding {
  /** The view's repository-relative path; `*` when no view can be rendered. */
  readonly path: string;
  readonly message: string;
}

/**
 * `verify`'s report: the skills whose committed bytes match, every
 * difference and refusal, the chain's size, tip and refusals, every
 * recipe the chain does not record, and every committed view that is not
 * its rendering.
 */
export interface VerifyOutput {
  readonly verb: "verify";
  readonly recipes: number;
  readonly verified: readonly string[];
  readonly differences: readonly SkillDifference[];
  readonly refused: readonly Refusal[];
  readonly entries: number;
  /** The entry a new one names as its predecessor; null for an empty or broken chain. */
  readonly tip: PreviousEntry | null;
  readonly chain: readonly ChainIssue[];
  readonly ledger: readonly LedgerFinding[];
  /** Checked when no skill is named and the corpus holds a recipe or an entry, since the views cover the whole corpus; empty otherwise. */
  readonly views: readonly ViewFinding[];
  /** Every snapshot the manifest no longer pins, when no skill is named; empty otherwise. A report, never a failure. */
  readonly snapshots: readonly UnpinnedSnapshot[];
}

/** A snapshot on disk the manifest no longer pins: removable once no recipe is anchored there. */
export interface UnpinnedSnapshot {
  readonly source: string;
  readonly commit: string;
  readonly snapshot: string;
  /** The recipes whose segments it holds and the pinned snapshot does not: refused until `refresh` re-anchors them. */
  readonly recipes: readonly string[];
  readonly removable: boolean;
}

/** `measure`'s report: one measure per recipe, and every refusal. */
export interface MeasureOutput {
  readonly verb: "measure";
  readonly measures: readonly RecipeMeasure[];
  readonly refused: readonly Refusal[];
}

/** One mechanic a skill's front holds ({@link frontFindings}). */
export interface SkillFrontFinding extends FrontFinding {
  readonly skill: string;
}

/**
 * `fronts`'s report (`workshop/components/recipes.md`, "The front and the
 * references"): the recipes read, every mechanic a front holds, every skill
 * on the line whose recipe names no references page, and every refusal.
 */
export interface FrontsOutput {
  readonly verb: "fronts";
  readonly recipes: number;
  readonly findings: readonly SkillFrontFinding[];
  /** The skills of a kind on the line whose recipe names no references page. */
  readonly unreferenced: readonly string[];
  readonly refused: readonly Refusal[];
}

/** `record`'s report: the entry written, or every reason it was refused. */
export interface RecordOutput {
  readonly verb: "record";
  readonly entry: string | null;
  readonly wrote: string | null;
  readonly refused: readonly ChainIssue[];
}

/** `views`'s report: each view's path and text, the paths written, and every refusal. */
export interface ViewsOutput {
  readonly verb: "views";
  readonly views: readonly View[];
  readonly wrote: readonly string[];
  readonly refused: readonly string[];
}

const SKILL_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function refusalOf(error: RecipeRefused): Refusal {
  return { skill: error.skill, issues: error.issues };
}

/** A recipe the snapshots accepted, with its file's bytes. */
interface Prepared {
  readonly checked: CheckedRecipe;
  readonly bytes: Uint8Array;
}

/** Read, parse and check one recipe. */
function prepare(
  corpus: string,
  snapshots: Snapshots,
  skill: string,
): Result<Prepared, RecipeRefused> {
  if (!SKILL_NAME.test(skill))
    return err(new RecipeRefused(skill, [{ message: `'${skill}' is not a skill name` }]));
  const path = `corpus/recipes/${skill}.json`;
  const file = readRecipe(corpus, skill);
  if (file === undefined)
    return err(new RecipeRefused(skill, [{ message: `no recipe '${path}' for '${skill}'` }]));
  if (file.text === undefined)
    return err(new RecipeRefused(skill, [{ message: `'${path}' is not UTF-8 text` }]));
  const parsed = parseRecipe(file.text, path);
  if (parsed._tag === "err")
    return err(
      new RecipeRefused(
        skill,
        parsed.error.issues.map((issue) => ({
          message: `${path} ${issue.path}: ${issue.message}`,
        })),
      ),
    );
  if (parsed.value.name !== skill)
    return err(
      new RecipeRefused(skill, [{ message: `'${path}' names the skill '${parsed.value.name}'` }]),
    );
  const checked = checkRecipe(parsed.value, snapshots);
  return checked._tag === "err" ? checked : ok({ checked: checked.value, bytes: file.bytes });
}

/** The snapshots, or the refusal every skill of the verb shares. */
function snapshotsFor(
  corpus: string,
  skills: readonly string[],
): { readonly snapshots: Snapshots } | { readonly refused: readonly Refusal[] } {
  const snapshots = readSnapshots(corpus);
  if (snapshots._tag === "ok") return { snapshots: snapshots.value };
  const issues = [{ message: snapshots.error.message }];
  return { refused: (skills.length > 0 ? skills : ["*"]).map((skill) => ({ skill, issues })) };
}

/**
 * Render one skill's directory from its recipe and write it.
 * @param corpus the corpus directory
 * @param skill the skill's name
 * @returns the paths written, or the refusal
 */
export function renderVerb(corpus: string, skill: string): VerbOutcome<RenderOutput> {
  const refused = (refusals: readonly Refusal[]): VerbOutcome<RenderOutput> => ({
    output: { verb: "render", skill, wrote: [], refused: refusals },
    failed: true,
  });
  const read = snapshotsFor(corpus, [skill]);
  if ("refused" in read) return refused(read.refused);
  const prepared = prepare(corpus, read.snapshots, skill);
  if (prepared._tag === "err") return refused([refusalOf(prepared.error)]);
  const wrote = writeSkillDirectory(corpus, skill, renderSkill(prepared.value.checked));
  if (wrote._tag === "err") return refused([{ skill, issues: [{ message: wrote.error.message }] }]);
  return { output: { verb: "render", skill, wrote: wrote.value, refused: [] }, failed: false };
}

/** The recipes a verb read and the ones it refused. */
interface Visited {
  readonly names: readonly string[];
  readonly refused: readonly Refusal[];
}

/**
 * Check every named recipe, or every recipe on disk when none is named,
 * and hand each accepted one to `visit`; collect the refusals.
 */
function eachRecipe(
  corpus: string,
  skills: readonly string[],
  visit: (skill: string, prepared: Prepared) => RecipeRefused | undefined,
): Visited {
  const names = skills.length > 0 ? skills : recipeNames(corpus);
  if (names.length === 0) return { names, refused: [] };
  const read = snapshotsFor(corpus, names);
  if ("refused" in read) return { names, refused: read.refused };
  const refused: Refusal[] = [];
  for (const skill of names) {
    const prepared = prepare(corpus, read.snapshots, skill);
    const refusal = prepared._tag === "err" ? prepared.error : visit(skill, prepared.value);
    if (refusal !== undefined) refused.push(refusalOf(refusal));
  }
  return { names, refused };
}

/** The chain on disk, or its refusals. */
function readChain(corpus: string): Result<Chain, ChainRefused> {
  return parseChain(readEntryFiles(corpus));
}

/** The modes definition's path, as a refusal names it. */
const MODES = "corpus/runtime/modes.json";

/**
 * The modes definition on disk.
 * @param corpus the corpus directory
 * @param purpose what cannot be checked without it, for the refusal
 * @returns the definition, or every reason it cannot be read
 */
function readDefinition(
  corpus: string,
  purpose: string,
): { readonly definition: ModesDefinition } | { readonly refused: readonly string[] } {
  const text = readTextFile(join(corpus, "runtime", "modes.json"));
  if (text === undefined)
    return { refused: [`the modes definition '${MODES}' is missing, so ${purpose}`] };
  const definition = parseModes(text, MODES);
  return definition._tag === "err"
    ? {
        refused: definition.error.issues.map((issue) => `${MODES} ${issue.path}: ${issue.message}`),
      }
    : { definition: definition.value };
}

/** The modes recipe's path, as a refusal names it. */
const MODES_RECIPE_PATH = `corpus/recipes/${MODES_RECIPE}.json`;

/** The modes recipe on disk: absent, refused with every reason, or the state a `modes` change entry records. */
type ModesRecipeState =
  | { readonly kind: "absent" }
  | { readonly kind: "refused"; readonly issues: readonly string[] }
  | { readonly kind: "state"; readonly state: SkillState };

/** What `verify` found of the modes recipe: whether one was read and verified, its refusal and its ledger findings. */
interface ModesVerified {
  readonly read: boolean;
  readonly verified: boolean;
  readonly refused: readonly Refusal[];
  readonly ledger: readonly LedgerFinding[];
}

/** Nothing of the modes recipe was read. */
const MODES_UNREAD: ModesVerified = { read: false, verified: false, refused: [], ledger: [] };

/**
 * The modes recipe against the definition on disk: absent, refused, or the
 * state a `modes` change entry records.
 * @param corpus the corpus directory
 * @returns whether the recipe exists, and its state or every reason it is refused
 */
function modesRecipeState(corpus: string): ModesRecipeState {
  const file = readRecipe(corpus, MODES_RECIPE);
  if (file === undefined) return { kind: "absent" };
  if (file.text === undefined)
    return { kind: "refused", issues: [`${MODES_RECIPE_PATH}: the recipe is not UTF-8 text`] };
  const recipe = parseModesRecipe(file.text, MODES_RECIPE_PATH);
  if (recipe._tag === "err")
    return {
      kind: "refused",
      issues: recipe.error.issues.map((issue) =>
        issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`,
      ),
    };
  const read = readDefinition(corpus, "the modes recipe cannot be checked");
  const bytes = readModesBytes(corpus);
  if ("refused" in read || bytes === undefined)
    return { kind: "refused", issues: "refused" in read ? read.refused : [`${MODES} is missing`] };
  const issues = modesRecipeIssues(recipe.value, bytes, read.definition);
  return issues.length > 0
    ? { kind: "refused", issues }
    : { kind: "state", state: modesState(file.bytes, recipe.value, bytes) };
}

/**
 * Verify the modes recipe and its latest change entry, as `verify` does a skill's.
 * @param corpus the corpus directory
 * @param chain the chain, when it parses
 * @returns the refusal, the ledger findings, and whether a recipe was read and verified
 */
function verifyModes(corpus: string, chain: Chain | undefined): ModesVerified {
  const found = modesRecipeState(corpus);
  if (found.kind === "absent") {
    // A recipe the chain records cannot leave the tree unnoticed.
    const recorded = chain === undefined ? undefined : latestOfSubject(chain, MODES_RECIPE);
    if (recorded === undefined) return MODES_UNREAD;
    // No recipe was read, so `verify` counts none; the refusal names the entry.
    const missing: ModesVerified = {
      read: false,
      verified: false,
      refused: [
        {
          skill: MODES_RECIPE,
          issues: [
            {
              message: `the entry '${recorded.id}' records the modes recipe, and there is no ${MODES_RECIPE_PATH}`,
            },
          ],
        },
      ],
      ledger: [],
    };
    return missing;
  }
  if (found.kind === "refused") {
    const refusal: ModesVerified = {
      read: true,
      verified: false,
      refused: [{ skill: MODES_RECIPE, issues: found.issues.map((message) => ({ message })) }],
      ledger: [],
    };
    return refusal;
  }
  const clean: ModesVerified = { read: true, verified: true, refused: [], ledger: [] };
  if (chain === undefined) return clean;
  const entry = latestOfSubject(chain, MODES_RECIPE);
  const ledger: LedgerFinding[] =
    entry === undefined
      ? [
          {
            skill: MODES_RECIPE,
            message: "no change entry records the recipe; no changes happen unledgered",
          },
        ]
      : changeIssues(entry, found.state).map((message) => ({
          skill: MODES_RECIPE,
          entry: entry.id,
          message,
        }));
  return { ...clean, ledger };
}

/**
 * The manifest's skills whose kind or slot the modes definition refuses,
 * each refused by name (`kindIssues`); none when the corpus holds no
 * manifest or the manifest names none of the skills.
 * @param corpus the corpus directory
 * @param skills the skills named; every skill when empty
 * @returns one refusal per such skill, or one for a definition that cannot be read
 */
function kindRefusals(corpus: string, skills: readonly string[]): readonly Refusal[] {
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return [];
  const named = manifest.value.skills.filter(
    (skill) => skills.length === 0 || skills.includes(skill.name),
  );
  if (named.length === 0) return [];
  const read = readDefinition(corpus, "the manifest's kinds and slots cannot be checked");
  if ("refused" in read)
    return [{ skill: "*", issues: read.refused.map((message) => ({ message })) }];
  return kindIssues(named, read.definition).map((issue) => ({
    skill: issue.skill,
    issues: [{ message: issue.message }],
  }));
}

/**
 * Compare each skill's committed directory with its recipe's rendering,
 * check the chain, and check that each recipe's latest change entry
 * records it; with no skill named, also compare each committed view with
 * its rendering, unless the corpus holds no recipe and no entry. Never
 * writes.
 * @param corpus the corpus directory
 * @param skills the skills to verify; every recipe on disk, and the views, when empty
 * @returns the verified skills, every difference, refusal and finding, and the chain's tip
 */
export function verifyVerb(corpus: string, skills: readonly string[]): VerbOutcome<VerifyOutput> {
  const chain = readChain(corpus);
  const latest = chain._tag === "ok" ? latestChanges(chain.value) : undefined;
  const verified: string[] = [];
  const differences: SkillDifference[] = [];
  const ledger: LedgerFinding[] = [];
  // The modes recipe is verified with every recipe, or when it is named.
  const modes =
    skills.length === 0 || skills.includes(MODES_RECIPE)
      ? verifyModes(corpus, chain._tag === "ok" ? chain.value : undefined)
      : MODES_UNREAD;
  if (modes.verified) verified.push(MODES_RECIPE);
  ledger.push(...modes.ledger);
  const skillNames = skills.filter((skill) => skill !== MODES_RECIPE);
  if (skills.length > 0 && skillNames.length === 0)
    return {
      output: {
        verb: "verify",
        recipes: modes.read ? 1 : 0,
        verified,
        differences,
        refused:
          modes.read || modes.refused.length > 0
            ? modes.refused
            : [{ skill: MODES_RECIPE, issues: [{ message: `there is no ${MODES_RECIPE_PATH}` }] }],
        entries: readEntryFiles(corpus).length,
        tip: chain._tag === "ok" ? (tipOf(chain.value) ?? null) : null,
        chain: chain._tag === "err" ? chain.error.issues : [],
        ledger,
        views: [],
        snapshots: [],
      },
      failed: modes.refused.length > 0 || ledger.length > 0 || !modes.read || chain._tag === "err",
    };
  const { names, refused } = eachRecipe(corpus, skillNames, (skill, prepared) => {
    const rendered = renderSkill(prepared.checked);
    const found = compareSkill(
      rendered,
      readSkillDirectory(corpus, skill),
      prepared.checked.authored,
    );
    if (found.length === 0) verified.push(skill);
    differences.push(...found.map((difference) => ({ skill, ...difference })));
    if (latest === undefined) return undefined;
    const entry = latest.get(skill);
    if (entry === undefined) {
      ledger.push({
        skill,
        message: `no change entry records the recipe; no changes happen unledgered`,
      });
      return undefined;
    }
    const state = skillState(prepared.bytes, prepared.checked);
    if (state._tag === "err") return state.error;
    for (const message of changeIssues(entry, state.value))
      ledger.push({ skill, entry: entry.id, message });
    return undefined;
  });
  const entries = readEntryFiles(corpus).length;
  const chainIssues = chain._tag === "err" ? chain.error.issues : [];
  // The views cover the whole corpus, so a named skill leaves them unchecked,
  // and a corpus with no recipe and no entry has nothing to render them from.
  const views =
    skills.length > 0 || (names.length === 0 && entries === 0) ? [] : viewFindings(corpus);
  const anchored = unpinnedSnapshots(corpus, refused);
  const slots = kindRefusals(corpus, skills);
  return {
    output: {
      verb: "verify",
      recipes: names.length + (modes.read ? 1 : 0),
      verified,
      differences,
      refused: [...anchored.refused, ...modes.refused, ...slots],
      entries,
      tip: chain._tag === "ok" ? (tipOf(chain.value) ?? null) : null,
      chain: chainIssues,
      ledger,
      views,
      snapshots: skills.length > 0 ? [] : anchored.snapshots,
    },
    failed:
      differences.length > 0 ||
      refused.length > 0 ||
      modes.refused.length > 0 ||
      slots.length > 0 ||
      chainIssues.length > 0 ||
      ledger.length > 0 ||
      views.length > 0,
  };
}

/** The refusals with each left-behind recipe naming its snapshot, and every unpinned snapshot. */
interface Anchored {
  readonly refused: readonly Refusal[];
  readonly snapshots: readonly UnpinnedSnapshot[];
}

/**
 * The snapshots on disk the manifest no longer pins, and the refusals with
 * each recipe named that one of them still anchors: a recipe the pinned
 * snapshot refuses and the unpinned one accepts was left behind by a
 * refresh.
 * @param corpus the corpus directory
 * @param refused the recipes `verify` refused
 * @returns the refusals, each left-behind recipe naming its snapshot, and every unpinned snapshot with the recipes it anchors
 */
function unpinnedSnapshots(corpus: string, refused: readonly Refusal[]): Anchored {
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return { refused, snapshots: [] };
  const pinned = new Set(manifest.value.sources.map((source) => source.snapshot));
  const unpinned = snapshotDirectories(corpus).filter((found) => !pinned.has(found.snapshot));
  const anchors = new Map<string, string[]>(unpinned.map((found) => [found.snapshot, []]));
  const current = readSnapshots(corpus);
  const marked = refused.map((refusal): Refusal => {
    const text = readRecipe(corpus, refusal.skill)?.text;
    const parsed = text === undefined ? undefined : parseRecipe(text, refusal.skill);
    if (parsed?._tag !== "ok") return refusal;
    // Refused for another reason than its segments: the pinned snapshot accepts it.
    if (current._tag === "err" || checkRecipe(parsed.value, current.value)._tag === "ok")
      return refusal;
    const left: RecipeIssue[] = [];
    for (const found of unpinned) {
      if (!parsed.value.sources.some((name) => name === found.source)) continue;
      const snapshots = readSnapshots(corpus, new Map([[found.source, found.snapshot]]));
      if (snapshots._tag === "err" || checkRecipe(parsed.value, snapshots.value)._tag === "err")
        continue;
      anchors.get(found.snapshot)?.push(refusal.skill);
      left.push({
        message: `the recipe is anchored at '${found.source}' ${found.commit}, a snapshot the manifest no longer pins: refresh re-anchors it`,
      });
    }
    return left.length === 0
      ? refusal
      : { skill: refusal.skill, issues: [...left, ...refusal.issues] };
  });
  return {
    refused: marked,
    snapshots: unpinned.map((found) => {
      const recipes = anchors.get(found.snapshot) ?? [];
      return { ...found, recipes, removable: recipes.length === 0 };
    }),
  };
}

/** What `refresh` is asked: a source, a commit, and for a source the manifest does not hold, its repository, licence and paths. */
export interface RefreshRequest {
  readonly source: string;
  /** A commit, full or abbreviated to at least seven hex characters. */
  readonly commit: string;
  /** A new source's repository. */
  readonly repo?: string | undefined;
  /** A new source's licence class. */
  readonly licence?: string | undefined;
  /** Upstream paths the snapshot takes beside the ones its old snapshot holds; a new source's every path. */
  readonly paths: readonly string[];
  /** Whether a commit the default branch does not hold may be read. */
  readonly anyBranch: boolean;
  /** Whether to write the snapshot, the re-anchored recipes and the manifest. */
  readonly write: boolean;
  /** The environment the fetch runs git with: the caller's, the variables that locate a repository removed. */
  readonly environment: Readonly<Record<string, string | undefined>>;
}

/** `refresh`'s report: the pins, the snapshot and its entries, one re-anchoring per recipe, the paths written, and every refusal. */
export interface RefreshOutput {
  readonly verb: "refresh";
  readonly source: string;
  /** The commit the manifest pinned; null for a new source. */
  readonly from: string | null;
  /** The commit read, in full; null when nothing was read. */
  readonly to: string | null;
  /** The new snapshot's path under the corpus. */
  readonly snapshot: string | null;
  readonly entries: readonly SnapshotEntry[];
  /** The entries whose upstream path the new commit no longer holds. */
  readonly gone: readonly string[];
  /** Where the snapshot's `LICENSE` came from upstream: the root's licence file, or each entry's nearest when the root holds none; empty when nothing was read, the commit holds none, or an entry finds none above it. */
  readonly licenceFrom: readonly string[];
  /** Each symbolic link the snapshot holds as its target's bytes. */
  readonly links: readonly ResolvedLink[];
  readonly recipes: readonly RecipeRefresh[];
  readonly wrote: readonly string[];
  readonly refused: readonly Refusal[];
}

/** The only licence class the manifest takes. */
const LICENCE = "MIT";
const UPSTREAM_PATH = /^(?!\/)(?!.*\/$)[\w.][\w./-]*$/;

function upstreamPathIssue(path: string): string | undefined {
  return UPSTREAM_PATH.test(path) && path.split("/").every((part) => part !== ".." && part !== ".")
    ? undefined
    : `'${path}' is not a path inside the repository`;
}

/** The entry a path is held as: its last part, a Markdown file's without the extension. */
function entryName(path: string): string {
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.endsWith(".md") ? last.slice(0, -".md".length) : last;
}

/** The entries a refresh takes for a pinned source: its old snapshot's, each with its path upstream, and the paths named. */
function entriesFor(
  corpus: string,
  manifest: CorpusManifest,
  pinned: CorpusSource,
  paths: readonly string[],
): Result<readonly SnapshotEntry[], RecipeRefused> {
  const known = new Map<string, string>();
  for (const entry of readInventoryEntries(corpus, pinned.snapshot))
    known.set(entry.name, entry.path);
  for (const skill of manifest.skills)
    if (skill.upstream?.family === pinned.name) known.set(skill.upstream.name, skill.upstream.path);
  const held = [
    ...new Set(
      [...readSnapshotFiles(corpus, pinned.snapshot).keys()].flatMap((path) =>
        path.includes("/") ? [path.slice(0, path.indexOf("/"))] : [],
      ),
    ),
  ];
  const issues: RecipeIssue[] = held
    .filter((name) => !known.has(name))
    .map((name) => ({
      message: `the snapshot's entry '${name}' names no path upstream: its inventory records none and no roster skill copies it`,
    }));
  const entries = held.flatMap((name) => {
    const path = known.get(name);
    return path === undefined ? [] : [{ name, path }];
  });
  const added = withPaths(entries, paths);
  return issues.length > 0 || added._tag === "err"
    ? err(new RecipeRefused("*", [...issues, ...(added._tag === "err" ? added.error.issues : [])]))
    : added;
}

/**
 * Entries with the named paths added, each held under its entry's name; a
 * path named again is one entry, and two paths one name would hold are
 * refused.
 * @param entries the entries so far
 * @param paths the paths to add
 * @returns the entries, or each collision
 */
function withPaths(
  entries: readonly SnapshotEntry[],
  paths: readonly string[],
): Result<readonly SnapshotEntry[], RecipeRefused> {
  const out = [...entries];
  const issues: RecipeIssue[] = [];
  for (const path of paths) {
    const name = entryName(path);
    const same = out.find((entry) => entry.name === name);
    if (same === undefined) out.push({ name, path });
    else if (same.path !== path)
      issues.push({ message: `'${path}' would be held as '${name}', which holds '${same.path}'` });
  }
  return issues.length > 0 ? err(new RecipeRefused("*", issues)) : ok(out);
}

/** The new snapshot's files from the fetch, the entries the commit no longer holds, and why it cannot be made. */
interface Assembled {
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly gone: readonly string[];
}

function assemble(
  entries: readonly SnapshotEntry[],
  fetched: Fetched,
  licenced: boolean,
): Result<Assembled, RecipeRefused> {
  const files = new Map<string, Uint8Array>();
  const gone: string[] = [];
  if (fetched.licence !== undefined) files.set("LICENSE", fetched.licence.bytes);
  else if (licenced)
    return err(
      new RecipeRefused(
        "*",
        fetched.licenceMissing.length > 0
          ? fetched.licenceMissing.map((path) => ({
              message: `the repository's root holds no licence file, and none stands in '${path}' or a directory above it`,
            }))
          : [
              {
                message:
                  "the repository carries no licence file at its root or above its entries at this commit",
              },
            ],
      ),
    );
  for (const entry of entries) {
    const found = fetched.paths.get(entry.path);
    if (found === undefined) gone.push(entry.name);
    else if (found.kind === "file") files.set(`${entry.name}/SKILL.md`, found.bytes);
    else for (const [path, bytes] of found.files) files.set(`${entry.name}/${path}`, bytes);
  }
  return ok({ files, gone });
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** A source's snapshot held in memory, as the fetch gave it. */
function heldSnapshot(files: ReadonlyMap<string, Uint8Array>): SourceSnapshot {
  return {
    bytes: (file) => files.get(file),
    text: (file) => {
      const bytes = files.get(file);
      if (bytes === undefined) return undefined;
      try {
        return utf8.decode(bytes);
      } catch {
        return undefined;
      }
    },
    files: [...files.keys()].sort(),
  };
}

/** One recipe's re-anchoring report with the text `--write` would write. */
interface ReanchoredReport extends RecipeRefresh {
  readonly text: string;
}

/** The re-anchorings of every recipe that names a source, and the recipes that cannot be re-anchored. */
interface Reanchorings {
  readonly reports: readonly ReanchoredReport[];
  readonly refused: readonly Refusal[];
}

/** Every recipe that names the source, re-anchored from its old snapshot to the new one, or the recipes that cannot be. */
function reanchorAll(
  corpus: string,
  snapshots: Snapshots,
  source: SourceName,
  commit: string,
  before: SourceSnapshot,
  after: SourceSnapshot,
): Reanchorings {
  const reports: ReanchoredReport[] = [];
  const refused: Refusal[] = [];
  for (const skill of recipeNames(corpus)) {
    const text = readRecipe(corpus, skill)?.text;
    const parsed =
      text === undefined ? undefined : parseRecipe(text, `corpus/recipes/${skill}.json`);
    if (text !== undefined && parsed?._tag === "ok" && !parsed.value.sources.includes(source))
      continue;
    const prepared = prepare(corpus, snapshots, skill);
    if (prepared._tag === "err" || text === undefined) {
      const why =
        parsed?._tag === "ok"
          ? []
          : [
              {
                message: `the recipe does not parse, so refresh cannot tell whether it names '${source}': read it first, its fill markers filled`,
              },
            ];
      refused.push(
        prepared._tag === "err"
          ? { skill, issues: [...why, ...refusalOf(prepared.error).issues] }
          : { skill, issues: [{ message: `'corpus/recipes/${skill}.json' is not UTF-8 text` }] },
      );
      continue;
    }
    const { report, text: next } = reanchor({
      checked: prepared.value.checked,
      text,
      source,
      commit,
      before,
      after,
    });
    reports.push({ ...report, text: next });
  }
  return { reports, refused };
}

/**
 * Add the paths named to a pinned source's snapshot at its own commit
 * (`workshop/components/recipes.md`, "Refreshing a source"): the commit's
 * bytes of every entry the snapshot holds and of each path named are
 * fetched, its licence found as for a new commit, and the snapshot gains
 * the new entries only, every held byte, the manifest and every recipe
 * kept. Every refusal comes before any write, so a report without `write`
 * refuses what `write` would; it writes only with `write`, and a write
 * that then fails is refused with the files already written in `wrote`.
 * @param corpus the corpus directory
 * @param request the refresh asked, its commit the pinned one and its paths the ones to add
 * @param manifest the manifest as it stands
 * @param pinned the manifest's source
 * @param snapshots every pinned snapshot
 * @param before the pinned snapshot as it stands
 * @param base the empty report
 * @returns the report, the paths written and every refusal
 */
function addAtPin(
  corpus: string,
  request: RefreshRequest,
  manifest: CorpusManifest,
  pinned: CorpusSource,
  snapshots: Snapshots,
  before: SourceSnapshot,
  base: RefreshOutput,
): VerbOutcome<RefreshOutput> {
  const from = pinned.commit;
  const snapshot = pinned.snapshot;
  const refuse = (messages: readonly string[], partial: Partial<RefreshOutput> = {}) => ({
    output: {
      ...base,
      from,
      ...partial,
      refused: [{ skill: "*", issues: messages.map((message) => ({ message })) }],
    },
    failed: true,
  });
  const found = entriesFor(corpus, manifest, pinned, request.paths);
  if (found._tag === "err") return refuse(found.error.issues.map((issue) => issue.message));
  const entries = found.value;
  const heldNames = new Set(
    [...readSnapshotFiles(corpus, snapshot).keys()].flatMap((path) =>
      path.includes("/") ? [path.slice(0, path.indexOf("/"))] : [],
    ),
  );
  const added = entries.filter((entry) => !heldNames.has(entry.name)).map((entry) => entry.name);
  const fetched = fetchUpstream({
    repo: pinned.repo,
    commit: from,
    paths: [...new Set(entries.map((entry) => entry.path))],
    anyBranch: request.anyBranch,
    environment: request.environment,
  });
  if (fetched._tag === "err") return refuse([fetched.error.message]);
  const assembled = assemble(entries, fetched.value, before.files.includes("LICENSE"));
  if (assembled._tag === "err")
    return refuse(
      assembled.error.issues.map((issue) => issue.message),
      { to: from },
    );
  const { files, gone } = assembled.value;
  const reported = {
    from,
    to: from,
    snapshot,
    entries,
    gone,
    licenceFrom: fetched.value.licence?.from ?? [],
    links: fetched.value.links,
  };
  if (gone.length > 0)
    return refuse(
      gone.map((entry) => `the commit holds no '${entries.find((e) => e.name === entry)?.path}'`),
      reported,
    );
  // SAFETY: the pinned source's name passed the source-name pattern before this was called.
  const name = pinned.name as SourceName;
  const issues = extensionIssues(readSnapshotFiles(corpus, snapshot), files, added);
  if (issues.length > 0) return refuse(issues, reported);
  // Every held byte is the commit's, so each recipe re-anchors to its own bytes; the report shows it.
  const all = reanchorAll(corpus, snapshots, name, from, before, heldSnapshot(files));
  const recipes = all.reports.map(({ text: _text, ...report }) => report);
  if (all.refused.length > 0)
    return { output: { ...base, ...reported, recipes, refused: all.refused }, failed: true };
  if (!request.write) return { output: { ...base, ...reported, recipes }, failed: false };
  const written = extendSnapshot(corpus, snapshot, from, files, entries, added);
  if (written._tag === "err")
    return refuse([written.error.message], { ...reported, recipes, wrote: written.error.wrote });
  return { output: { ...base, ...reported, recipes, wrote: written.value }, failed: false };
}

/**
 * Refresh a source: snapshot it at a commit beside its old snapshot and
 * re-anchor every recipe that names it, never taking new upstream text
 * unread (C4); or add a source the manifest does not hold, its snapshot
 * holding the paths named and no recipe touched. At the pinned commit with
 * no path named it fetches nothing and reports the re-anchoring of every
 * recipe against the snapshot it already reads, which changes nothing;
 * with paths named it adds them to the pinned snapshot (`addAtPin`). It writes the
 * snapshot, the re-anchored recipes and the manifest's pin only with
 * `write`, in that order, and only once every check has passed; a write
 * that then fails is refused with the paths already written in `wrote`.
 * @param corpus the corpus directory
 * @param request the source, the commit, a new source's repository, licence and paths, and the flags
 * @returns the report, the paths written and every refusal
 */
export function refreshVerb(corpus: string, request: RefreshRequest): VerbOutcome<RefreshOutput> {
  const { source } = request;
  const base: RefreshOutput = {
    verb: "refresh",
    source,
    from: null,
    to: null,
    snapshot: null,
    entries: [],
    gone: [],
    licenceFrom: [],
    links: [],
    recipes: [],
    wrote: [],
    refused: [],
  };
  const refuse = (messages: readonly string[], partial: Partial<RefreshOutput> = {}) => ({
    output: {
      ...base,
      ...partial,
      refused: [{ skill: "*", issues: messages.map((message) => ({ message })) }],
    },
    failed: true,
  });
  if (!SKILL_NAME.test(source)) return refuse([`'${source}' is not a source name`]);
  const pathIssues = request.paths.flatMap((path) => upstreamPathIssue(path) ?? []);
  if (pathIssues.length > 0) return refuse(pathIssues);
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return refuse([manifest.error.message]);
  const snapshots = readSnapshots(corpus);
  if (snapshots._tag === "err") return refuse([snapshots.error.message]);
  const pinned = manifest.value.sources.find((entry) => entry.name === source);
  // SAFETY: the name passed the source-name pattern above, which is the pattern a recipe's source holds.
  const name = source as SourceName;
  if (pinned !== undefined && (request.repo !== undefined || request.licence !== undefined))
    return refuse([`'${source}' is pinned: its repository and licence are the manifest's`]);
  if (
    pinned === undefined &&
    (request.repo === undefined || request.licence === undefined || request.paths.length === 0)
  )
    return refuse([
      `the manifest pins no source '${source}': a new source names its --repo, its --licence and at least one --path`,
    ]);
  if (pinned === undefined && request.licence !== LICENCE)
    return refuse([
      `the manifest takes the licence class ${LICENCE} alone, not '${request.licence}'`,
    ]);
  const from = pinned?.commit ?? null;
  const oldFiles =
    pinned === undefined ? [] : [...readSnapshotFiles(corpus, pinned.snapshot).keys()];
  const before = sourceSnapshot(snapshots.value, name, oldFiles);
  const atPin = (commit: string) =>
    pinned !== undefined && commit.length >= 7 && pinned.commit.startsWith(commit);
  if (atPin(request.commit) && pinned !== undefined && request.paths.length > 0)
    return addAtPin(corpus, request, manifest.value, pinned, snapshots.value, before, base);
  if (atPin(request.commit)) {
    const all = reanchorAll(corpus, snapshots.value, name, from ?? "", before, before);
    return {
      output: {
        ...base,
        from,
        to: from,
        snapshot: pinned?.snapshot ?? null,
        recipes: all.reports.map(({ text: _text, ...report }) => report),
        refused: all.refused,
      },
      failed: all.refused.length > 0,
    };
  }
  const found =
    pinned === undefined
      ? withPaths([], request.paths)
      : entriesFor(corpus, manifest.value, pinned, request.paths);
  if (found._tag === "err")
    return refuse(
      found.error.issues.map((issue) => issue.message),
      { from },
    );
  const entries = found.value;
  const repo = pinned?.repo ?? request.repo ?? "";
  const fetched = fetchUpstream({
    repo,
    commit: request.commit,
    paths: [...new Set(entries.map((entry) => entry.path))],
    anyBranch: request.anyBranch,
    environment: request.environment,
  });
  if (fetched._tag === "err") return refuse([fetched.error.message], { from });
  const to = fetched.value.commit;
  const snapshot = `upstream/${source}/${to}`;
  const assembled = assemble(
    entries,
    fetched.value,
    pinned === undefined || oldFiles.includes("LICENSE"),
  );
  if (assembled._tag === "err")
    return refuse(
      assembled.error.issues.map((issue) => issue.message),
      { from, to },
    );
  const { files, gone } = assembled.value;
  const reported = {
    from,
    to,
    snapshot,
    entries,
    gone,
    licenceFrom: fetched.value.licence?.from ?? [],
    links: fetched.value.links,
  };
  if (pinned === undefined && gone.length > 0)
    return refuse(
      gone.map((entry) => `the commit holds no '${entries.find((e) => e.name === entry)?.path}'`),
      reported,
    );
  const all =
    pinned === undefined
      ? { reports: [], refused: [] }
      : reanchorAll(corpus, snapshots.value, name, to, before, heldSnapshot(files));
  const recipes = all.reports.map(({ text: _text, ...report }) => report);
  if (all.refused.length > 0)
    return { output: { ...base, ...reported, recipes, refused: all.refused }, failed: true };
  if (!request.write) return { output: { ...base, ...reported, recipes }, failed: false };
  const sources: readonly CorpusSource[] =
    pinned === undefined
      ? [...manifest.value.sources, { name: source, repo, commit: to, snapshot, license: LICENCE }]
      : manifest.value.sources.map((entry) =>
          entry.name === source ? { ...entry, commit: to, snapshot } : entry,
        );
  const manifestText = readManifestText(corpus);
  const nextManifest =
    manifestText === undefined ? undefined : manifestWithSources(manifestText, sources);
  if (nextManifest === undefined)
    return refuse(["the manifest holds no sources list refresh can rewrite"], {
      ...reported,
      recipes,
    });
  const parsed = parseCorpusManifest(nextManifest, "corpus/manifest.json");
  if (parsed._tag === "err")
    return refuse(
      parsed.error.issues.map((issue) => `corpus/manifest.json ${issue.path}: ${issue.message}`),
      { ...reported, recipes },
    );
  const wrote: string[] = [];
  const held = entries.filter((entry) => !gone.includes(entry.name));
  const written = writeSnapshot(corpus, snapshot, to, files, held);
  if (written._tag === "err") return refuse([written.error.message], { ...reported, recipes });
  wrote.push(...written.value);
  for (const report of all.reports) {
    if (!report.rewrites) continue;
    const rewritten = rewriteRecipe(corpus, report.skill, report.text);
    if (rewritten._tag === "err")
      return refuse([rewritten.error.message], { ...reported, recipes, wrote });
    wrote.push(rewritten.value);
  }
  const moved = writeManifestText(corpus, nextManifest);
  if (moved._tag === "err") return refuse([moved.error.message], { ...reported, recipes, wrote });
  wrote.push(moved.value);
  return { output: { ...base, ...reported, recipes, wrote }, failed: false };
}

/** `intake`'s report: the slot and its stack when one is named, the candidate's body against the stub trigger, its segments or its comparisons, the projected retention, and every refusal. */
export interface IntakeOutput {
  readonly verb: "intake";
  readonly source: string;
  readonly path: string;
  /** The slot `--slot` named, and its stack: the roster skills on its row of the line. */
  readonly slot: { readonly name: string; readonly stack: readonly string[] } | null;
  readonly stub: StubCount | null;
  /** The candidate's segments, quoted, when no roster skill is named beside it. */
  readonly segments: readonly SheetSegment[];
  readonly comparisons: readonly Comparison[];
  /** The candidate taken whole, and each roster skill's sources measured now and with the candidate's duplicates dropped. */
  readonly retention: {
    readonly candidate: SourceMeasure;
    readonly against: readonly {
      readonly skill: string;
      readonly sources: readonly ProjectedSource[];
    }[];
  } | null;
  readonly refused: readonly Refusal[];
}

/** A directory's prose files as text, and the paths that are not UTF-8. */
interface Prose {
  readonly prose: readonly ProseText[];
  readonly invalid: readonly string[];
}

/** A directory's prose files as text, or the paths that are not UTF-8. */
function proseOf(files: Iterable<readonly [string, Uint8Array]>): Prose {
  const prose: ProseText[] = [];
  const invalid: string[] = [];
  for (const [path, bytes] of files) {
    if (!path.endsWith(".md")) continue;
    try {
      prose.push({ path, text: utf8.decode(bytes) });
    } catch {
      invalid.push(path);
    }
  }
  return { prose, invalid };
}

/**
 * Print the comparison sheet of a candidate skill directory in a source's
 * snapshot, beside each roster skill named; it writes nothing. With a
 * slot named and no roster skill, the skills are the slot's stack: the
 * roster skills on that row of the line, so the sheet compares the
 * candidate with what it would join.
 * @param corpus the corpus directory
 * @param source the pinned source whose snapshot holds the candidate
 * @param path the candidate's directory in the snapshot
 * @param named the roster skills to compare it with; none prints the candidate's segments, or compares it with the slot's stack
 * @param slot the slot on the line the candidate would join, when named
 * @returns the sheet, or every refusal
 */
export function intakeVerb(
  corpus: string,
  source: string,
  path: string,
  named: readonly string[],
  slot?: string,
): VerbOutcome<IntakeOutput> {
  const base: IntakeOutput = {
    verb: "intake",
    source,
    path,
    slot: null,
    stub: null,
    segments: [],
    comparisons: [],
    retention: null,
    refused: [],
  };
  const refuse = (skill: string, messages: readonly string[]): VerbOutcome<IntakeOutput> => ({
    output: { ...base, refused: [{ skill, issues: messages.map((message) => ({ message })) }] },
    failed: true,
  });
  const issue = upstreamPathIssue(path);
  if (!SKILL_NAME.test(source) || issue !== undefined)
    return refuse("*", [issue ?? `'${source}' is not a source name`]);
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return refuse("*", [manifest.error.message]);
  const pinned = manifest.value.sources.find((entry) => entry.name === source);
  if (pinned === undefined) return refuse("*", [`the manifest pins no source '${source}'`]);
  const candidate = proseOf(readSnapshotFiles(corpus, pinned.snapshot, path));
  if (candidate.invalid.length > 0)
    return refuse(
      "*",
      candidate.invalid.map((file) => `'${path}/${file}' is not UTF-8 text`),
    );
  const skill = candidate.prose.find((file) => file.path === "SKILL.md");
  if (skill === undefined)
    return refuse("*", [
      `the snapshot of '${source}' holds no skill directory '${path}' with a SKILL.md`,
    ]);
  let stack: { readonly name: string; readonly stack: readonly string[] } | null = null;
  if (slot !== undefined) {
    const read = readDefinition(corpus, "the slot cannot be read");
    if ("refused" in read) return refuse("*", read.refused);
    const found = slotStack(manifest.value, read.definition, slot);
    if ("refused" in found) return refuse("*", [found.refused]);
    stack = { name: slot, stack: found.stack };
  }
  const against = named.length > 0 || stack === null ? named : stack.stack;
  const snapshots = readSnapshots(corpus);
  if (snapshots._tag === "err") return refuse("*", [snapshots.error.message]);
  const comparisons: Comparison[] = [];
  const projected: { skill: string; sources: readonly ProjectedSource[] }[] = [];
  const refused: Refusal[] = [];
  for (const other of against) {
    const prepared = prepare(corpus, snapshots.value, other);
    if (prepared._tag === "err") {
      refused.push(refusalOf(prepared.error));
      continue;
    }
    const committed = proseOf(
      readSkillDirectory(corpus, other).map((file) => [file.path, file.bytes] as const),
    );
    comparisons.push(compareSkills(other, candidate.prose, committed.prose));
    const sources = projectedSources(prepared.value.checked, candidate.prose);
    if (sources._tag === "err") refused.push(refusalOf(sources.error));
    else projected.push({ skill: other, sources: sources.value });
  }
  return {
    output: {
      ...base,
      slot: stack,
      stub: stubCount(skill.text),
      segments: against.length === 0 ? sheetSegments(candidate.prose) : [],
      comparisons,
      retention: { candidate: wholeMeasure(source, candidate.prose), against: projected },
      refused,
    },
    failed: refused.length > 0,
  };
}

/**
 * The stack of a slot on the line: the roster skills on its rows, one row
 * for each kind with a row of that name, in the definition's order, so
 * every kind placed at a step adds its skills on that step.
 * @param manifest the corpus manifest
 * @param definition the modes definition
 * @param slot a step of the definition, or a skill of a kind placed beside the line
 * @returns the skills' names, or why the name is no slot on the line
 */
function slotStack(
  manifest: CorpusManifest,
  definition: ModesDefinition,
  slot: string,
): { readonly stack: readonly string[] } | { readonly refused: string } {
  const line = lineOf({ definition, skills: manifest.skills, chain: { entries: [] } });
  const rows = line.sections.flatMap((section) =>
    section.rows.filter((candidate) => candidate.name === slot),
  );
  if (rows.length > 0)
    return {
      stack: rows.flatMap((row) => [...row.defaults, ...row.trials].map((skill) => skill.name)),
    };
  const skill = manifest.skills.find((candidate) => candidate.name === slot);
  return {
    refused:
      skill?.slot === undefined
        ? `the slot '${slot}' is not on the line`
        : `'${slot}' is a ${skill.kind} skill on the slot '${skill.slot}'; --slot names the slot, '${skill.slot}'`,
  };
}

/**
 * Measure each recipe, after the stub trigger.
 * @param corpus the corpus directory
 * @param skills the skills to measure; every recipe on disk when empty
 * @returns the measures and every refusal
 */
export function measureVerb(corpus: string, skills: readonly string[]): VerbOutcome<MeasureOutput> {
  const measures: RecipeMeasure[] = [];
  const { refused } = eachRecipe(corpus, skills, (_skill, prepared) => {
    const measured = measureRecipe(prepared.checked);
    if (measured._tag === "err") return measured.error;
    measures.push(measured.value);
    return undefined;
  });
  return { output: { verb: "measure", measures, refused }, failed: refused.length > 0 };
}

/**
 * Read every front for greenline's mechanics, and every skill on the line
 * for its references page (J-93 S2): a front holds the upstream prose
 * alone, outside `SKILL.md`'s Handoff section, and a step's skill keeps
 * its mechanics on a references page. Never writes.
 * @param corpus the corpus directory
 * @param skills the skills to read; every recipe on disk when empty
 * @returns every finding, every skill on the line with no references page, and every refusal
 */
export function frontsVerb(corpus: string, skills: readonly string[]): VerbOutcome<FrontsOutput> {
  const findings: SkillFrontFinding[] = [];
  const referenced = new Map<string, boolean>();
  const { names, refused } = eachRecipe(corpus, skills, (skill, prepared) => {
    findings.push(...frontFindings(prepared.checked).map((finding) => ({ skill, ...finding })));
    referenced.set(skill, hasReferences(prepared.checked));
    return undefined;
  });
  const unreferenced: string[] = [];
  const slots: Refusal[] = [];
  const manifest = readManifest(corpus);
  if (manifest._tag === "ok") {
    const read = readDefinition(corpus, "the skills on the line cannot be named");
    if ("refused" in read)
      slots.push({ skill: "*", issues: read.refused.map((message) => ({ message })) });
    else {
      const onTheLine = new Set<string>(
        read.definition.kinds.filter((kind) => kind.place === "ordered").map((kind) => kind.name),
      );
      for (const skill of manifest.value.skills)
        if (onTheLine.has(skill.kind) && referenced.get(skill.name) === false)
          unreferenced.push(skill.name);
    }
  }
  return {
    output: {
      verb: "fronts",
      recipes: names.length,
      findings,
      unreferenced,
      refused: [...refused, ...slots],
    },
    failed:
      findings.length > 0 || unreferenced.length > 0 || refused.length > 0 || slots.length > 0,
  };
}

/**
 * Each skill's references pages, read from its recipe's parts, so `budget`
 * lists them apart from the front's reference files. A recipe that does not
 * parse names none here; `verify` refuses it.
 * @param corpus the corpus directory
 * @returns the references pages of every recipe that names one, by skill
 */
function referencesPages(corpus: string): ReferencesPages {
  const pages = new Map<string, ReadonlySet<string>>();
  for (const skill of recipeNames(corpus)) {
    const text = readRecipe(corpus, skill)?.text;
    if (text === undefined) continue;
    const parsed = parseRecipe(text, `corpus/recipes/${skill}.json`);
    if (parsed._tag === "err") continue;
    const named = parsed.value.files.filter((file) => file.part === "references");
    if (named.length > 0) pages.set(skill, new Set(named.map((file) => file.path)));
  }
  return pages;
}

/**
 * Total, per mode, the agents, the rounds, the steps it runs and the words
 * an agent reads there, against the mode's words budget, and every skill's
 * words apart (`src/corpus/budget.ts`). The entry script compiles the
 * installation as the payload's build does and hands it here, so the block
 * is the one a workspace receives; the modes recipe is read for the
 * operator's rulings on an excess. Never writes.
 * @param corpus the corpus directory, whose modes recipe holds the rulings
 * @param installation the compiled installation, or why it could not be compiled
 * @param modes the modes to measure; every mode when empty
 * @returns the report; it fails on a mode over its budget without a ruling, an unknown mode, or an installation or recipe that cannot be read
 */
export function budgetVerb(
  corpus: string,
  installation: Result<Installation, ContractParseFailed>,
  modes: readonly string[],
): VerbOutcome<BudgetOutput> {
  const refused = (messages: readonly string[]): VerbOutcome<BudgetOutput> => ({
    output: {
      verb: "budget",
      block: null,
      line: [],
      modes: [],
      skills: [],
      refused: messages.map((message) => ({ mode: "*", message })),
    },
    failed: true,
  });
  if (installation._tag === "err")
    return refused(
      installation.error.issues.map(
        (issue) => `${installation.error.source} ${issue.path}: ${issue.message}`,
      ),
    );
  const file = readRecipe(corpus, MODES_RECIPE);
  let recipe: ModesRecipe | undefined;
  if (file !== undefined) {
    if (file.text === undefined)
      return refused([`${MODES_RECIPE_PATH}: the recipe is not UTF-8 text`]);
    const parsed = parseModesRecipe(file.text, MODES_RECIPE_PATH);
    if (parsed._tag === "err")
      return refused(
        parsed.error.issues.map((issue) => `${MODES_RECIPE_PATH} ${issue.path}: ${issue.message}`),
      );
    recipe = parsed.value;
  }
  const report = budgetReport(installation.value, recipe, modes, referencesPages(corpus));
  return { output: report, failed: report.refused.length > 0 };
}

/** Why a change entry's subject cannot be recorded against the tree, or its checks' reasons. */
function changeRecordIssues(corpus: string, entry: ChangeEntry): readonly string[] {
  if (entry.subject === MODES_RECIPE) {
    const found = modesRecipeState(corpus);
    if (found.kind === "absent")
      return [
        `the tree holds no recipe for the modes, ${MODES_RECIPE_PATH}, so its entry cannot be checked`,
      ];
    return found.kind === "refused" ? found.issues : changeIssues(entry, found.state);
  }
  const skill = skillOf(entry);
  if (skill === undefined)
    return [
      `the tree holds no recipe for the ${entry.subject} yet, so its entry cannot be checked; it is recorded once its recipe exists`,
    ];
  const read = snapshotsFor(corpus, [skill]);
  if ("refused" in read) return read.refused.flatMap((r) => r.issues.map((i) => i.message));
  const prepared = prepare(corpus, read.snapshots, skill);
  if (prepared._tag === "err") return prepared.error.issues.map((issue) => issue.message);
  const state = skillState(prepared.value.bytes, prepared.value.checked);
  if (state._tag === "err") return state.error.issues.map((issue) => issue.message);
  return changeIssues(entry, state.value);
}

/** Whether a roster skill's recipe on disk lists a source: the skill an add built from that source. */
function recipeLists(corpus: string, skill: string, source: string | undefined): boolean {
  if (source === undefined) return false;
  const text = readRecipe(corpus, skill)?.text;
  if (text === undefined) return false;
  const parsed = parseRecipe(text, `corpus/recipes/${skill}.json`);
  return parsed._tag === "ok" && parsed.value.sources.some((name) => name === source);
}

/** Why a source entry's placement cannot be recorded against the modes definition and the manifest on disk. */
function placementRecordIssues(
  corpus: string,
  entry: SourceEntry,
  manifest: CorpusManifest,
): readonly string[] {
  if (entry.placement === undefined) return [];
  const read = readDefinition(corpus, "the placement cannot be checked");
  if ("refused" in read) return read.refused;
  return [
    ...placementSlotIssues(entry, manifest.skills, read.definition, (skill) =>
      recipeLists(corpus, skill, entry.pin),
    ),
    ...placementIssues(entry, read.definition),
  ];
}

/**
 * Check an entry against the chain and the tree, and append it last.
 * @param corpus the corpus directory
 * @param path the entry file's path
 * @returns the entry written, or every reason it was refused; a refusal writes nothing
 */
export function recordVerb(corpus: string, path: string): VerbOutcome<RecordOutput> {
  const refused = (entry: string, messages: readonly string[]): VerbOutcome<RecordOutput> => ({
    output: {
      verb: "record",
      entry: null,
      wrote: null,
      refused: messages.map((message) => ({ entry, message })),
    },
    failed: true,
  });
  const text = readTextFile(path);
  if (text === undefined) return refused(path, [`no entry file '${path}'`]);
  const parsed = parseEntry(text, path);
  if (parsed._tag === "err")
    return refused(
      path,
      parsed.error.issues.map((issue) => `${issue.path || "the entry"}: ${issue.message}`),
    );
  const entry = parsed.value;
  const chain = readChain(corpus);
  if (chain._tag === "err")
    return {
      output: { verb: "record", entry: null, wrote: null, refused: chain.error.issues },
      failed: true,
    };
  const issues = [...appendIssues(entry, chain.value)];
  const appendable = issues.length === 0;
  if (issues.length === 0 && entry.kind === "change")
    issues.push(...rulingListIssues(entry, chain.value), ...changeRecordIssues(corpus, entry));
  if (issues.length === 0 && entry.kind === "source") {
    const manifest = readManifest(corpus);
    if (manifest._tag === "err") issues.push(manifest.error.message);
    else
      issues.push(
        ...sourceIssues(entry, manifest.value),
        ...handoffIssues(entry, (name) => hasCraftPage(corpus, name)),
        ...placementRecordIssues(corpus, entry, manifest.value),
      );
  }
  if (issues.length === 0 && entry.kind === "retirement") {
    const manifest = readManifest(corpus);
    if (manifest._tag === "err") issues.push(manifest.error.message);
    else
      issues.push(
        ...retirementIssues(entry, chain.value, {
          listed: new Set(manifest.value.skills.map((skill) => skill.name)),
          recipe: readRecipe(corpus, entry.skill) !== undefined,
          directory: readSkillDirectory(corpus, entry.skill).length > 0,
        }),
      );
  }
  // The authorising ruling and the pages are checked beside the kind's checks, so a refusal names every issue.
  if (appendable) issues.push(...authorityIssues(entry, chain.value));
  if (issues.length > 0) return refused(entry.id, issues);
  const wrote = writeEntry(corpus, entry.id, serializeEntry(entry));
  if (wrote._tag === "err") return refused(entry.id, [wrote.error.message]);
  return {
    output: { verb: "record", entry: entry.id, wrote: wrote.value, refused: [] },
    failed: false,
  };
}

/** `draft`'s report: the recipe written, its accounts left with the fill marker, and any difference or refusal. */
export interface DraftOutput {
  readonly verb: "draft";
  readonly skill: string;
  readonly wrote: string | null;
  readonly todos: number;
  readonly differences: readonly Difference[];
  readonly refused: readonly Refusal[];
}

/** What `draft` proposes: a copy's recipe, a stub's (the ruling of 2026-10-04, C15), or a native skill's. */
export type DraftMode = "copy" | "stub" | "native";

/**
 * Propose a recipe from a committed copy and its upstream snapshot, and
 * write it with every account left with the fill marker; with `native`, a
 * native skill's recipe from its committed directory alone. It writes only
 * a proposal that renders the committed directory byte for byte (a native
 * `SKILL.md`'s front matter in the canonical form), never over a recipe
 * that exists, and never under `corpus/skills/`.
 * @param corpus the corpus directory
 * @param skill the skill's name
 * @param mode a copy's recipe; a stub, written passages only and the credit; or a native skill's, written passages only and no source
 * @returns the recipe written and its count of fill markers, or why none was written
 */
export function draftVerb(
  corpus: string,
  skill: string,
  mode: DraftMode,
): VerbOutcome<DraftOutput> {
  const refused = (
    messages: readonly string[],
    differences: readonly Difference[] = [],
  ): VerbOutcome<DraftOutput> => ({
    output: {
      verb: "draft",
      skill,
      wrote: null,
      todos: 0,
      differences,
      refused:
        messages.length === 0 ? [] : [{ skill, issues: messages.map((message) => ({ message })) }],
    },
    failed: true,
  });
  if (!SKILL_NAME.test(skill)) return refused([`'${skill}' is not a skill name`]);
  if (readRecipe(corpus, skill) !== undefined)
    return refused([
      `the recipe 'corpus/recipes/${skill}.json' exists, and draft never rewrites one`,
    ]);
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return refused([manifest.error.message]);
  const entry = manifest.value.skills.find((candidate) => candidate.name === skill);
  if (entry === undefined) return refused([`the manifest's roster has no skill '${skill}'`]);
  if (entry.upstream === undefined && mode !== "native")
    return refused([
      `'${skill}' was copied from no upstream; draft --native proposes a native skill's recipe`,
    ]);
  if (entry.upstream !== undefined && mode === "native")
    return refused([
      `'${skill}' was copied from '${entry.upstream.family}'; draft --native proposes the recipe of a skill copied from no upstream`,
    ]);
  const snapshots = readSnapshots(corpus);
  if (snapshots._tag === "err") return refused([snapshots.error.message]);
  const copy = readSkillDirectory(corpus, skill);
  let drafted: Result<Drafted & { readonly normalized?: readonly SkillFile[] }, RecipeRefused>;
  if (entry.upstream === undefined) drafted = draftNative({ skill, copy });
  else
    drafted = draftRecipe({
      skill,
      // SAFETY: the manifest's parse checks that every skill's upstream family is
      // one of its pinned sources, which are exactly the names a recipe's source holds.
      source: entry.upstream.family as SourceName,
      upstream: entry.upstream.name,
      snapshots: snapshots.value,
      copy,
      stub: mode === "stub",
    });
  if (drafted._tag === "err") return refused(drafted.error.issues.map((issue) => issue.message));
  const checked = checkRecipe(drafted.value.recipe, snapshots.value);
  if (checked._tag === "err") return refused(checked.error.issues.map((issue) => issue.message));
  const differences = compareSkill(
    renderSkill(checked.value),
    drafted.value.normalized ?? copy,
    checked.value.authored,
  );
  if (differences.length > 0) return refused([], differences);
  const wrote = writeRecipe(corpus, skill, recipeText(drafted.value.recipe));
  if (wrote._tag === "err") return refused([wrote.error.message]);
  return {
    output: {
      verb: "draft",
      skill,
      wrote: wrote.value,
      todos: drafted.value.todos,
      differences: [],
      refused: [],
    },
    failed: false,
  };
}

/** The sources each recipe on disk lists, by skill, and why a recipe cannot be read. */
interface RecipeSources {
  readonly recipeSources: ReadonlyMap<string, readonly string[]>;
  readonly issues: readonly string[];
}

/** The sources each recipe on disk lists, by skill, and why a recipe cannot be read. */
function recipeSourcesOf(corpus: string): RecipeSources {
  const recipeSources = new Map<string, readonly string[]>();
  const issues: string[] = [];
  for (const skill of recipeNames(corpus)) {
    const path = `corpus/recipes/${skill}.json`;
    const text = readRecipe(corpus, skill)?.text;
    if (text === undefined) {
      issues.push(`${path}: the recipe is not UTF-8 text`);
      continue;
    }
    const parsed = parseRecipe(text, path);
    if (parsed._tag === "err")
      issues.push(...parsed.error.issues.map((issue) => `${path} ${issue.path}: ${issue.message}`));
    else recipeSources.set(skill, parsed.value.sources);
  }
  return { recipeSources, issues };
}

/** The views' input from the corpus on disk, or every reason it cannot be read. */
function viewsFrom(corpus: string): Result<readonly View[], RecipeRefused> {
  const fail = (messages: readonly string[]) =>
    err(
      new RecipeRefused(
        "*",
        messages.map((message) => ({ message })),
      ),
    );
  const chain = readChain(corpus);
  if (chain._tag === "err")
    return fail(chain.error.issues.map((issue) => `${issue.entry}: ${issue.message}`));
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return fail([manifest.error.message]);
  const read = readDefinition(corpus, "the line cannot be rendered");
  if ("refused" in read) return fail(read.refused);
  const { recipeSources, issues } = recipeSourcesOf(corpus);
  if (issues.length > 0) return fail(issues);
  const rendered = renderViews({
    chain: chain.value,
    definition: read.definition,
    recipeSources,
    sources: manifest.value.sources.map((source) => ({
      name: source.name,
      repo: source.repo,
      commit: source.commit,
      snapshot: source.snapshot,
      licence: readLicence(corpus, source.snapshot),
      holder: source.holder,
    })),
    skills: manifest.value.skills.map((skill) => ({
      name: skill.name,
      kind: skill.kind,
      slot: skill.slot,
      extra: skill.extra,
      trial: skill.trial,
      credits: skill.credits,
    })),
    frozenRows: readFrozenRows(corpus),
    outbox: holdsWorkshop(corpus),
  });
  return rendered._tag === "err" ? fail(rendered.error.issues) : rendered;
}

/**
 * Each committed view that differs from its rendering, or why none can be rendered.
 * @param corpus the corpus directory
 * @returns one finding per view that is missing or differs; one per refusal when the views cannot be rendered
 */
function viewFindings(corpus: string): readonly ViewFinding[] {
  const views = viewsFrom(corpus);
  if (views._tag === "err")
    return views.error.issues.map((issue) => ({ path: "*", message: issue.message }));
  const findings: ViewFinding[] = [];
  for (const view of views.value) {
    const committed = readView(corpus, view.path);
    if (committed === undefined)
      findings.push({ path: view.path, message: "the view is not committed; run views --write" });
    else if (committed !== view.text)
      findings.push({
        path: view.path,
        message: "the committed view differs from its rendering; run views --write",
      });
  }
  return findings;
}

/**
 * Render the views from the chain, the recipes and the manifest, and write them when asked.
 * @param corpus the corpus directory
 * @param write whether to write each view at its path in the repository
 * @returns every view's path and text and the paths written, or every refusal; without `write` nothing is written
 */
export function viewsVerb(corpus: string, write: boolean): VerbOutcome<ViewsOutput> {
  const refused = (messages: readonly string[]): VerbOutcome<ViewsOutput> => ({
    output: { verb: "views", views: [], wrote: [], refused: messages },
    failed: true,
  });
  const views = viewsFrom(corpus);
  if (views._tag === "err") return refused(views.error.issues.map((issue) => issue.message));
  if (!write)
    return { output: { verb: "views", views: views.value, wrote: [], refused: [] }, failed: false };
  const wrote = writeViews(corpus, views.value);
  if (wrote._tag === "err") return refused([wrote.error.message]);
  return {
    output: { verb: "views", views: views.value, wrote: wrote.value, refused: [] },
    failed: false,
  };
}

/** The provenance index: the chain's tip, every entry oldest first, and one row per skill. */
export interface ProvenanceIndex {
  readonly tip: PreviousEntry | null;
  readonly entries: readonly Entry[];
  readonly skills: readonly {
    readonly name: string;
    readonly entry: string;
    readonly stub: boolean;
    readonly sources: readonly {
      readonly name: string;
      readonly retention: number | null;
      readonly coverage: number | null;
      readonly creditLine: boolean;
    }[];
  }[];
}

/** The provenance the website's input bundle carries: the index and one record per skill. */
export interface ProvenanceData {
  readonly index: ProvenanceIndex;
  readonly skills: readonly SkillProvenance[];
}

/**
 * The provenance of every recipe on disk (`workshop/components/ledger.md`,
 * "Provenance"), read from the recipes, the snapshots, the manifest and the
 * fresh chain; a recipe its latest change entry does not record is refused,
 * so no provenance names an entry for an earlier recipe. Never writes.
 * @param corpus the corpus directory
 * @returns the index and each skill's provenance, or every reason it cannot be read
 */
export function provenanceData(corpus: string): Result<ProvenanceData, RecipeRefused> {
  const fail = (messages: readonly string[]) =>
    err(
      new RecipeRefused(
        "*",
        messages.map((message) => ({ message })),
      ),
    );
  const chain = readChain(corpus);
  if (chain._tag === "err")
    return fail(chain.error.issues.map((issue) => `${issue.entry}: ${issue.message}`));
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return fail([manifest.error.message]);
  const pins = new Map(
    manifest.value.sources.map((source) => [
      source.name,
      {
        name: source.name,
        repo: source.repo,
        commit: source.commit,
        license: source.license,
      },
    ]),
  );
  const latest = latestChanges(chain.value);
  const skills: SkillProvenance[] = [];
  const issues: string[] = [];
  const { refused } = eachRecipe(corpus, [], (skill, prepared) => {
    const measured = measureRecipe(prepared.checked);
    if (measured._tag === "err") return measured.error;
    const entry = latest.get(skill);
    if (entry === undefined) {
      issues.push(`${skill}: no change entry records the recipe`);
      return undefined;
    }
    const state = skillState(prepared.bytes, prepared.checked);
    if (state._tag === "err") return state.error;
    const unrecorded = changeIssues(entry, state.value);
    if (unrecorded.length > 0) {
      issues.push(...unrecorded.map((message) => `${skill}: ${message}`));
      return undefined;
    }
    skills.push(
      skillProvenance({
        checked: prepared.checked,
        measures: measured.value.sources,
        entry,
        pins,
      }),
    );
    return undefined;
  });
  issues.push(...refused.flatMap((r) => r.issues.map((issue) => `${r.skill}: ${issue.message}`)));
  if (issues.length > 0) return fail(issues);
  return ok({
    index: {
      tip: tipOf(chain.value) ?? null,
      entries: chain.value.entries.map(({ entry }) => entry),
      skills: skills.map((skill) => ({
        name: skill.name,
        entry: skill.entry.id,
        stub: skill.stub,
        sources: skill.sources.map((source) => ({
          name: source.name,
          retention: source.measure?.retention ?? null,
          coverage: source.measure?.coverage ?? null,
          creditLine: source.measure?.creditLine ?? true,
        })),
      })),
    },
    skills,
  });
}

/** A source as the sources register lists it: its pin and each skill it feeds, with that skill's retention and coverage. */
export interface RegisterSource {
  readonly name: string;
  readonly repository: string;
  readonly commit: string;
  readonly licence: string;
  readonly skills: readonly {
    readonly name: string;
    readonly retention: number | null;
    readonly coverage: number | null;
    /** Whether the retention reaches the minimum; null where nothing is taken. */
    readonly meetsMinimum: boolean | null;
    readonly creditLine: boolean;
  }[];
}

/** The provenance index with each skill's place on the line. */
export interface EditionIndex extends Omit<ProvenanceIndex, "skills"> {
  readonly skills: readonly (ProvenanceIndex["skills"][number] & LinePlace)[];
}

/** What the website's edition renders: the index, one record per skill, the line's facts, the sources register and the example record. */
export interface EditionData {
  readonly index: EditionIndex;
  readonly skills: readonly EditionSkill[];
  readonly line: LineFacts;
  readonly sources: readonly RegisterSource[];
  readonly record: { readonly text: string; readonly blocks: readonly Block[] };
}

/**
 * The edition's data (the plan site-for-the-practice, "The data contract
 * (S2)"), read from the recipes, the snapshots, the manifest, the fresh
 * chain and the modes definition: the provenance of every recipe on disk
 * ({@link provenanceData}) with each skill's place on the line, its
 * numbered rulings and each shipped file's blocks; the line's facts; every
 * source the manifest pins with the skills it feeds, as the sources
 * register lists them; and the example change record with its blocks. A recipe with no
 * manifest skill is refused. Never writes.
 * @param corpus the corpus directory
 * @returns the edition's data, or every reason it cannot be read
 */
export function editionData(corpus: string): Result<EditionData, RecipeRefused> {
  const fail = (messages: readonly string[]) =>
    err(
      new RecipeRefused(
        "*",
        messages.map((message) => ({ message })),
      ),
    );
  const provenance = provenanceData(corpus);
  if (provenance._tag === "err") return provenance;
  const read = readDefinition(corpus, "the edition cannot be read");
  if ("refused" in read) return fail(read.refused);
  const manifest = readManifest(corpus);
  if (manifest._tag === "err") return fail([manifest.error.message]);
  const chain = readChain(corpus);
  if (chain._tag === "err")
    return fail(chain.error.issues.map((issue) => `${issue.entry}: ${issue.message}`));
  const { recipeSources, issues: unread } = recipeSourcesOf(corpus);
  const issues = [...unread];
  const places = linePlaces(read.definition, manifest.value.skills);
  const placeOf = (name: string): LinePlace | undefined => {
    const place = places.get(name);
    if (place === undefined) issues.push(`${name}: the manifest holds no such skill`);
    return place;
  };
  const skills = provenance.value.skills.flatMap((skill) => {
    const place = placeOf(skill.name);
    return place === undefined ? [] : [editionSkill(skill, place)];
  });
  const rows = provenance.value.index.skills.flatMap((row) => {
    const place = placeOf(row.name);
    return place === undefined ? [] : [{ ...row, ...place }];
  });
  const record = exampleRecord(read.definition);
  if (record._tag === "err") issues.push(...record.error.issues);
  if (issues.length > 0 || record._tag === "err") return fail(issues);
  const uses = usesBySource({ chain: chain.value, recipeSources });
  return ok({
    index: { ...provenance.value.index, skills: rows },
    skills,
    line: lineFacts(read.definition),
    sources: manifest.value.sources.map((source) => ({
      name: source.name,
      repository: source.repo,
      commit: source.commit,
      licence: source.license,
      skills: (uses.get(source.name) ?? []).map((use) => ({
        name: use.skill,
        retention: use.retention,
        coverage: use.coverage,
        meetsMinimum: use.meetsMinimum,
        creditLine: use.credit,
      })),
    })),
    record: { text: record.value, blocks: blocksOf(record.value) },
  });
}
