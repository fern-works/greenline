import { usedValues, type DriftKind } from "./design-drift.ts";
import type { InterfaceSetting } from "./manifest.ts";
import type { SurveyRow } from "./interface-home.ts";
import type { SourceFile } from "./interface-static.ts";

/**
 * The survey's measured rows (J-123 S4; the design-survey start's page,
 * "Where its work lands"): what `greenline check interface --survey`
 * measures of the interface at a commit, one row per fact, each with the
 * command and the commit as its source. The agent's read rows and the
 * owner's confirmed rows are the sheet's too, and a measure run again keeps
 * them (`withMeasuredRows`).
 */

/** The command the measured rows name as their source. */
export const SURVEY_COMMAND = "greenline check interface --survey";

/** How many of a kind's values a row names, the most used first. */
const SHOWN = 8;

/** Each kind of value the sheet counts, with its fact's name. */
const KINDS: readonly (readonly [DriftKind, string])[] = [
  ["colour", "colours in use"],
  ["font", "font faces in use"],
  ["size", "font sizes in use"],
  ["spacing", "spacing values in use"],
  ["radius", "radii in use"],
];

/** A kind's row value: how many distinct values, and the most used with their counts. */
function tally(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return "none";
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = ranked
    .slice(0, SHOWN)
    .map(([value, count]) => `${value} (${String(count)})`)
    .join(", ");
  return `${String(counts.size)} distinct; most used: ${shown}`;
}

/** What a survey measures from. */
export interface SurveyInput {
  readonly setting: InterfaceSetting;
  /** The interface files under the roots, each with its text. */
  readonly files: readonly SourceFile[];
  /** The DESIGN.md homes' paths from the root. */
  readonly homes: readonly string[];
  /** The drift line status prints, or undefined where none. */
  readonly drift: string | undefined;
  readonly commit: string;
}

/**
 * The rows a survey measures.
 * @param input the setting, the files, the homes, the drift and the commit
 * @returns the rows, each measured by the survey's command at the commit
 */
export function surveyRows(input: SurveyInput): readonly SurveyRow[] {
  const source = { kind: "measured", command: SURVEY_COMMAND, commit: input.commit } as const;
  const row = (fact: string, value: string): SurveyRow => ({ fact, value, source });
  const used = input.files.flatMap((file) => usedValues(file.path, file.text));
  return [
    row(
      "interface files",
      `${String(input.files.length)} under ${input.setting.roots.join(", ")} (${input.setting.extensions.join(", ")})`,
    ),
    row("platform", input.setting.platform),
    row(
      "frameworks",
      input.setting.frameworks.length === 0 ? "none" : input.setting.frameworks.join(", "),
    ),
    ...KINDS.map(([kind, fact]) =>
      row(fact, tally(used.filter((value) => value.kind === kind).map((value) => value.value))),
    ),
    row("design homes", input.homes.length === 0 ? "none" : input.homes.join(", ")),
    row("drift", input.drift ?? "none"),
  ];
}
