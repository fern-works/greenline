import type { WordsSource } from "../core/corpus.ts";
import { KEEPER_COSTS, KEEPER_KINDS, type Keeper, type KeeperKind } from "./recipe.ts";
import { cell, listed, table } from "./tables.ts";

/**
 * The keepers of the roster (`workshop/components/recipes.md`, "The
 * keepers"; the register's rows of 2026-10-28 on the keeper of a prose
 * method and on the keeper test): each skill's promises as its recipe lists
 * them, tallied by kind and by cost for the budget, and rendered as the
 * ledger's keepers table, `corpus/ledger/KEEPERS.md`. Pure functions over
 * the parsed recipes.
 */

/** One skill's keepers, as its recipe lists them. */
export interface SkillKeepers {
  readonly skill: string;
  readonly keepers: readonly Keeper[];
}

/** The keepers counted across the recipes. */
export interface KeeperTally {
  /** The promises the recipes list. */
  readonly promises: number;
  /** The skills whose recipes state `promises: "none"`. */
  readonly none: readonly string[];
  /** The promises a mechanism or an oracle keeps, every kind but `gap`. */
  readonly kept: number;
  /** Each kind's count, `gap` among them. */
  readonly byKind: Readonly<Record<KeeperKind, number>>;
  /** Each cost class's count among the kept. */
  readonly byCost: Readonly<Record<(typeof KEEPER_COSTS)[number], number>>;
  /** The gaps by what the keeper test leads to. */
  readonly gaps: { readonly mechanism: number; readonly prose: number };
  /** The hook rules the holds name, each once, sorted: what can fire at a turn's end. */
  readonly holds: readonly string[];
  /** The oracles named that a later job adds. */
  readonly owed: number;
}

/**
 * Count the keepers across the recipes.
 * @param skills each skill's keepers
 * @returns the tally
 */
export function tallyKeepers(skills: readonly SkillKeepers[]): KeeperTally {
  const all = skills.flatMap((skill) => skill.keepers);
  const count = <T>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length;
  const kept = all.filter((keeper) => keeper.kind !== "gap");
  const ofKind = (kind: KeeperKind) => count(all, (keeper) => keeper.kind === kind);
  return {
    promises: all.length,
    none: skills.filter((skill) => skill.keepers.length === 0).map((skill) => skill.skill),
    kept: kept.length,
    byKind: {
      fact: ofKind("fact"),
      hold: ofKind("hold"),
      record: ofKind("record"),
      oracle: ofKind("oracle"),
      gap: ofKind("gap"),
    },
    byCost: {
      free: count(kept, (keeper) => keeper.cost === "free"),
      cheap: count(kept, (keeper) => keeper.cost === "cheap"),
      dear: count(kept, (keeper) => keeper.cost === "dear"),
    },
    gaps: {
      mechanism: count(all, (keeper) => keeper.kind === "gap" && keeper.warrants === "mechanism"),
      prose: count(all, (keeper) => keeper.kind === "gap" && keeper.warrants === "prose"),
    },
    holds: [
      ...new Set(
        kept.flatMap((keeper) =>
          keeper.kind === "hold" && keeper.where !== undefined ? [keeper.where] : [],
        ),
      ),
    ].sort(),
    owed: count(all, (keeper) => keeper.owed === true),
  };
}

/** A count of skills in words: "1 skill", "2 skills". */
const skillCount = (count: number) => `${count} skill${count === 1 ? "" : "s"}`;

/** A keeper's cell: its kind and where it stands, or a gap and what it warrants. */
function keeperCell(keeper: Keeper): string {
  if (keeper.kind !== "gap") return `${keeper.kind}: ${keeper.where ?? ""}`;
  return keeper.warrants === "mechanism"
    ? `gap, warrants a mechanism: ${keeper.need ?? ""}`
    : "gap, stays prose";
}

/** An oracle's cell: the scenario or conduct row, marked when a later job adds it. */
function oracleCell(keeper: Keeper): string {
  const named = keeper.kind === "oracle" ? keeper.where : keeper.oracle;
  if (named === undefined) return "none";
  return keeper.owed === true ? `${named} (owed)` : named;
}

/**
 * The ledger's keepers table: its head counts the promises, the kept by kind
 * and by cost and the gaps by what they warrant; one row per skill and
 * promise follows, named by its recipe entry, then each gap with the keeper
 * test's reading.
 * @param skills each skill's keepers, in skill order
 * @returns the text of `corpus/ledger/KEEPERS.md`
 */
export function renderKeepers(
  skills: readonly SkillKeepers[],
  words: readonly WordsSource[] = [],
): string {
  const tally = tallyKeepers(skills);
  const sorted = [...skills].sort((a, b) => a.skill.localeCompare(b.skill));
  const entries = sorted.flatMap((skill) =>
    skill.keepers.map((keeper, index) => ({ skill: skill.skill, keeper, index })),
  );
  const ref = (skill: string, index: number) => `\`${skill}#${index + 1}\``;
  const kinds = KEEPER_KINDS.filter((kind) => kind !== "gap")
    .map((kind) => `${kind} ${tally.byKind[kind]}`)
    .join(", ");
  const costs = KEEPER_COSTS.map((cost) => `${cost} ${tally.byCost[cost]}`).join(", ");
  const gaps = entries.filter(({ keeper }) => keeper.kind === "gap");
  const lines = [
    "# The keepers",
    "",
    "Generated by `node scripts/corpus.mjs views` from each recipe's `keepers` under `corpus/recipes/`, and never edited by hand. A feature of greenline is prose plus its keeper: each promise a roster skill's pages state is listed with the keeper that holds it, a fact the CLI reads and prints, a hold, a record the owner can see afterwards or an oracle that tests what stays judgment, or with its gap. An entry is named by its skill and its place in the recipe's list, counted from one, as a walk's Held by lane names it.",
    "",
    "## The counts",
    "",
    `- Promises: ${tally.promises}, across ${skillCount(skills.length - tally.none.length)}; ${skillCount(tally.none.length)} ${tally.none.length === 1 ? "promises" : "promise"} nothing${tally.none.length === 0 ? "" : ` (${listed(tally.none.map((name) => `\`${name}\``))})`}.`,
    `- Kept: ${tally.kept}, by kind ${kinds}; by cost ${costs}.`,
    `- Gaps: ${tally.byKind.gap}, of which ${tally.gaps.mechanism} warrant a mechanism and ${tally.gaps.prose} stay prose, each tested by its oracle where one exists.`,
    `- Hook rules the holds name: ${tally.holds.length}${tally.holds.length === 0 ? "" : `, ${listed(tally.holds.map((rule) => `\`${rule}\``))}`}.`,
    `- Oracles owed, named and not yet a scenario: ${tally.owed}.`,
    "",
    "## The promises",
    "",
    entries.length === 0
      ? "No recipe lists a promise yet."
      : table(
          ["Entry", "Promise", "Keeper", "Cost", "Oracle"],
          entries.map(({ skill, keeper, index }) => [
            ref(skill, index),
            cell(keeper.promise),
            cell(keeperCell(keeper)),
            keeper.cost ?? "",
            cell(oracleCell(keeper)),
          ]),
        ),
    "",
    "## The gaps",
    "",
    gaps.length === 0
      ? "No promise is a gap."
      : table(
          ["Entry", "Warrants", "The keeper test's reading"],
          gaps.map(({ skill, keeper, index }) => [
            ref(skill, index),
            keeper.warrants ?? "",
            cell(keeper.reason ?? ""),
          ]),
        ),
    ...phraseKeepers(words),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * The keeper each placed phrase's home names (J-194 S1), its homes beside
 * it; nothing where no phrase names one, so the table is as before.
 * @param words the manifest's words sources
 * @returns the section's lines
 */
function phraseKeepers(words: readonly WordsSource[]): readonly string[] {
  const rows = words.flatMap((source) =>
    source.phrases.flatMap((phrase) =>
      phrase.keeper === undefined || phrase.where === undefined
        ? []
        : [
            [
              cell(phrase.text),
              phrase.where.map((home) => `\`${home}\``).join(", "),
              cell(`${phrase.keeper.kind}: ${phrase.keeper.where}`),
            ],
          ],
    ),
  );
  return rows.length === 0
    ? []
    : ["", "## The phrases' keepers", "", table(["Phrase", "Home", "Keeper"], rows)];
}
