import { sha256Hex } from "../commons/hash.ts";
import { err, ok, type Result } from "../commons/result.ts";
import type { CorpusManifest } from "../core/corpus.ts";
import { depthOf, type ModesDefinition } from "../core/modes.ts";
import {
  entryMeasure,
  latestChanges,
  latestOfSubject,
  resultDigest,
  retiredSkills,
  tipOf,
  type Chain,
  type ChangeEntry,
  type Entry,
  type EntryMeasure,
  type RetirementEntry,
  type RulingItem,
  type SourceEntry,
} from "./chain.ts";
import { measureRecipe } from "./measure.ts";
import type { CheckedRecipe, RecipeRefused } from "./recipe.ts";
import { renderSkill } from "./render.ts";

/**
 * The checks of an entry against the tree, which `record` runs before it
 * appends and `verify` runs on each recipe's latest change entry
 * (`workshop/components/ledger.md`, "The fresh chain"). A change entry
 * states its recipe's digest, its result's digest and its measure as the
 * tree gives them, and carries the operator's ruling when a source's
 * retention is under the minimum or the recipe holds a method item. A
 * source entry's pin names a source the manifest pins at the same
 * repository and commit, under MIT, and its placement gives one row for
 * each mode of the modes definition on disk, each naming a step the
 * definition holds at the depth it gives that step there, and adding no
 * words where the step does not run. A retirement entry follows the
 * skill's removal from the manifest and the tree, names the recipe its
 * latest change entry records, and names a replacement the manifest lists.
 */

/** What the tree gives for one skill's recipe. */
export interface SkillState {
  /** The sha256 of the recipe file's bytes. */
  readonly recipe: string;
  /** {@link resultDigest} of the directory the recipe renders. */
  readonly result: string;
  readonly measure: EntryMeasure;
  /** Whether an edit, a drop or a written passage of the recipe is of the kind `method`. */
  readonly method: boolean;
}

/**
 * The digests and the measure of a checked recipe.
 * @param bytes the recipe file's bytes
 * @param checked the recipe the snapshots accepted
 * @returns the skill's state, or the stub trigger's refusal
 */
export function skillState(
  bytes: Uint8Array,
  checked: CheckedRecipe,
): Result<SkillState, RecipeRefused> {
  const measured = measureRecipe(checked);
  if (measured._tag === "err") return err(measured.error);
  const { recipe } = checked;
  const method =
    recipe.drops.some((drop) => drop.kind === "method") ||
    recipe.files.some((file) =>
      file.passages.some((item) =>
        item.passage === "written"
          ? item.kind === "method"
          : item.edits.some((edit) => edit.kind === "method"),
      ),
    );
  return ok({
    recipe: sha256Hex(bytes),
    result: resultDigest(renderSkill(checked)),
    measure: entryMeasure(measured.value),
    method,
  });
}

/**
 * How a change entry differs from what the tree gives for its skill.
 * @param entry a change entry of the skill
 * @param state the skill's state on disk
 * @returns every difference; none when the entry records the tree
 */
export function changeIssues(entry: ChangeEntry, state: SkillState): readonly string[] {
  const issues: string[] = [];
  if (entry.recipe !== state.recipe)
    issues.push(`it records the recipe ${entry.recipe}; the recipe on disk is ${state.recipe}`);
  if (entry.result !== state.result)
    issues.push(`it records the result ${entry.result}; the recipe renders ${state.result}`);
  const stated = JSON.stringify(entryMeasure(entry.measure));
  const measured = JSON.stringify(state.measure);
  if (stated !== measured)
    issues.push(`it records the measure ${stated}; the recipe measures ${measured}`);
  if (entry.ruling.length === 0) {
    if (state.measure.sources.some((source) => source.meetsMinimum === false))
      issues.push("a retention under the minimum needs the operator's ruling");
    if (state.method) issues.push("a recipe with a method item needs the operator's ruling");
  }
  return issues;
}

/**
 * How a source entry's pin differs from the manifest.
 * @param entry a source entry
 * @param manifest the corpus manifest
 * @returns every difference; none for an entry without a pin
 */
export function sourceIssues(entry: SourceEntry, manifest: CorpusManifest): readonly string[] {
  if (entry.pin === undefined) return [];
  const pinned = manifest.sources.find((source) => source.name === entry.pin);
  if (pinned === undefined) return [`the manifest pins no source '${entry.pin}'`];
  const issues: string[] = [];
  if (pinned.repo !== entry.source.repository || pinned.commit !== entry.source.commit)
    issues.push(
      `the manifest pins '${entry.pin}' at ${pinned.repo} ${pinned.commit}, not ${entry.source.repository} ${entry.source.commit}`,
    );
  if (entry.licence !== "mit")
    issues.push(`the manifest pins '${entry.pin}' under MIT, not '${entry.licence}'`);
  return issues;
}

/**
 * How a source entry's placement differs from the modes definition: a mode
 * or a step the definition does not hold, named; a row whose depth is not
 * the one the definition gives its step at its mode; words added where the
 * step does not run; and a mode of the definition with no row or with more
 * than one. The names are the
 * definition's, never literals, so a mode or a step the definition gains
 * later is placed the same way.
 * @param entry a source entry
 * @param definition the modes definition on disk
 * @returns every difference; none for an entry without a placement
 */
export function placementIssues(
  entry: SourceEntry,
  definition: ModesDefinition,
): readonly string[] {
  if (entry.placement === undefined) return [];
  const issues: string[] = [];
  const rows = new Map<string, number>();
  for (const row of entry.placement.modes) {
    const mode = definition.modes.find((candidate) => candidate.name === row.mode);
    const step = definition.steps.find((candidate) => candidate.name === row.step);
    if (mode === undefined)
      issues.push(
        `the placement names the mode '${row.mode}', which the modes definition does not hold`,
      );
    if (step === undefined)
      issues.push(
        `the placement names the step '${row.step}', which the modes definition does not hold`,
      );
    rows.set(row.mode, (rows.get(row.mode) ?? 0) + 1);
    if (mode === undefined || step === undefined) continue;
    const given = depthOf(mode, step.name).depth;
    if (row.depth !== given)
      issues.push(
        `the placement gives the step '${row.step}' at the mode '${row.mode}' the depth '${row.depth}'; the modes definition gives '${given}'`,
      );
    else if (given === "none" && row.cost !== 0)
      issues.push(
        `the placement adds ${row.cost} words at the mode '${row.mode}', where its step '${row.step}' does not run`,
      );
  }
  for (const mode of definition.modes) {
    const count = rows.get(mode.name) ?? 0;
    if (count === 0) issues.push(`the placement gives no row for the mode '${mode.name}'`);
    else if (count > 1) issues.push(`the placement gives the mode '${mode.name}' ${count} rows`);
  }
  return issues;
}

/**
 * How a change entry's ruling list drops a ruling its subject's previous
 * change entry carries (the cumulative rule): every item of the previous
 * list, compared by its date and its words, must stand in the entry's list.
 * @param entry a change entry
 * @param chain the whole chain on disk, which the entry follows
 * @returns one issue per ruling dropped; none for a subject's first change entry
 */
export function rulingListIssues(entry: ChangeEntry, chain: Chain): readonly string[] {
  const previous = latestOfSubject(chain, entry.subject);
  if (previous === undefined) return [];
  const items = entry.ruling;
  const after = `${previous.id}, its subject's previous change entry`;
  const rule = "a change entry restates that list and appends its own item";
  return previous.ruling
    .filter((kept) => !items.some((item) => item.date === kept.date && item.words === kept.words))
    .map(
      (kept) =>
        `its ruling list drops the item of ${kept.date}, '${kept.words}', which ${after}, carries; ${rule}`,
    );
}

/**
 * The items a new entry adds of its own: for a change, those its subject's
 * previous change entry does not carry; for a source or a retirement, its
 * whole list.
 */
function ownItems(entry: Entry, chain: Chain): readonly RulingItem[] {
  if (entry.kind !== "change") return entry.ruling;
  const previous = latestOfSubject(chain, entry.subject);
  return entry.ruling.filter(
    (item) =>
      !(previous?.ruling ?? []).some(
        (kept) => kept.date === item.date && kept.words === item.words,
      ),
  );
}

/**
 * How a new entry's authorising ruling and pages fall short (R49 revisited,
 * J-66): `unknown` stands only on the entries recorded before the two
 * fields, so a new entry states both; the authorising ruling is one of
 * the items the entry adds of its own, never one inherited from its
 * subject's previous change entry, and null exactly when it adds none, so
 * the index's "no ruling of its own" holds. A page's path is not checked
 * against the tree: a page a change removes is gone from the rendering, so
 * the pages are the recorder's statement, read in review against the diff
 * as the reason is.
 * @param entry the entry to record
 * @param chain the whole chain on disk, which the entry follows
 * @returns every issue; none when both fields are stated
 */
export function authorityIssues(entry: Entry, chain: Chain): readonly string[] {
  const issues: string[] = [];
  const recorded = "is kept for the entries recorded before the field; a new entry states";
  if (entry.authorisedBy === "unknown")
    issues.push(`its authorising ruling is unknown, which ${recorded} the ruling or null`);
  if (entry.kind === "change" && entry.pages === "unknown")
    issues.push(`its pages are unknown, which ${recorded} the pages it touched`);
  const own = ownItems(entry, chain);
  const named = entry.authorisedBy;
  if (own.length > 0 && named === null)
    issues.push(
      "it adds a ruling of its own, so it names the one that authorised it in authorisedBy",
    );
  if (
    named !== null &&
    named !== "unknown" &&
    !own.some((item) => item.date === named.date && item.words === named.words)
  )
    issues.push(
      own.length === 0
        ? `its authorising ruling of ${named.date} is inherited from its subject's previous change entry, and it adds none of its own, so it names null`
        : `its authorising ruling of ${named.date} is inherited from its subject's previous change entry; it names one of the items it adds`,
    );
  return issues;
}

/**
 * How a source entry's handoff names a recipient the workshop does
 * not hold: a craft recipient names a page of the workshop's skills.
 * @param entry a source entry
 * @param hasCraftPage whether the workshop holds the craft page of a name
 * @returns the issue, or none for garden, a page the workshop holds or an entry with no handoff
 */
export function handoffIssues(
  entry: SourceEntry,
  hasCraftPage: (name: string) => boolean,
): readonly string[] {
  const recipient = entry.handoff?.recipient;
  if (recipient === undefined || !recipient.startsWith("craft-") || hasCraftPage(recipient))
    return [];
  return [
    `the handoff's recipient '${recipient}' is no craft page of the workshop, workshop/skills/${recipient}/SKILL.md`,
  ];
}

/**
 * Whether an entry may follow the chain: it is new, and its predecessor is the tip.
 * @param entry the entry to record
 * @param chain the whole chain on disk
 * @returns why it may not; none when it may
 */
export function appendIssues(entry: Entry, chain: Chain): readonly string[] {
  if (chain.entries.some((chained) => chained.entry.id === entry.id))
    return ["it is recorded already, and an entry is never rewritten"];
  const tip = tipOf(chain);
  if (tip === undefined)
    return "oldChain" in entry.previous
      ? []
      : ["the chain is empty, so the first entry cites the old chain's tip"];
  if ("oldChain" in entry.previous)
    return [`only the first entry cites the old chain; the tip is ${tip.id} at ${tip.sha256}`];
  return entry.previous.id === tip.id && entry.previous.sha256 === tip.sha256
    ? []
    : [
        `its predecessor is ${entry.previous.id} at ${entry.previous.sha256}; the tip is ${tip.id} at ${tip.sha256}`,
      ];
}

/** What the tree on disk holds of a retiring skill, which a retirement's checks read. */
export interface RetiringTree {
  /** The names of the manifest's skills. */
  readonly listed: ReadonlySet<string>;
  /** Whether the skill's recipe file exists. */
  readonly recipe: boolean;
  /** Whether the skill's directory holds any file. */
  readonly directory: boolean;
}

/**
 * How a retirement differs from what the chain and the tree allow: the
 * skill has left the manifest, its recipe and its directory; the chain
 * recorded a change of it and holds it on the roster, not retired already;
 * the recipe it names is the one its latest change entry records; and its
 * replacement, when it names one, is a skill the manifest lists.
 * @param entry a retirement entry
 * @param chain the whole chain on disk
 * @param tree what the tree holds of the skill
 * @returns every difference; none when the retirement may be recorded
 */
export function retirementIssues(
  entry: RetirementEntry,
  chain: Chain,
  tree: RetiringTree,
): readonly string[] {
  const issues: string[] = [];
  const after = "a retirement follows its removal";
  if (tree.listed.has(entry.skill))
    issues.push(`the manifest still lists the skill '${entry.skill}'; ${after}`);
  if (tree.recipe)
    issues.push(`the recipe corpus/recipes/${entry.skill}.json still exists; ${after}`);
  if (tree.directory)
    issues.push(`the skill directory corpus/skills/${entry.skill}/ still exists; ${after}`);
  const retired = retiredSkills(chain).get(entry.skill);
  const latest = latestChanges(chain).get(entry.skill);
  if (retired !== undefined)
    issues.push(`the skill '${entry.skill}' is retired already, by ${retired.id}`);
  else if (latest === undefined)
    issues.push(
      `the chain records no change of the skill '${entry.skill}', so there is nothing to retire`,
    );
  else if (latest.recipe !== entry.recipe)
    issues.push(
      `it names the recipe ${entry.recipe}; the latest change entry of '${entry.skill}' records ${latest.recipe}`,
    );
  if (entry.replacedBy !== null && !tree.listed.has(entry.replacedBy))
    issues.push(`its replacement '${entry.replacedBy}' is no skill the manifest lists`);
  return issues;
}
