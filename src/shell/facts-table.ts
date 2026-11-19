import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRecordForm, type Cost } from "../core/change.ts";
import { recordPath, type RecordFacts } from "../core/git-hooks.ts";
import { factsBlock, factsRows, type FactRow } from "../core/facts-table.ts";
import { parseInterfaceFact } from "../core/interface-fact.ts";
import type { ModesDefinition } from "../core/modes.ts";
import { waitingLine } from "../core/mirror.ts";
import { lineStations, progressLine, recordPart } from "../core/progress.ts";
import { planHasTickets } from "./changes.ts";
import { defaultBranch, shownPatchOwed, workingRecord } from "./hooks.ts";
import { recordStep } from "./skill-loads.ts";
import { viewAddress } from "./view-line.ts";

/*
 * The facts table and the progress line for the open change, read once
 * for the status mirror and `greenline status` (J-144 S1), so the two print
 * the same bytes: the rows from the record, the modes definition, the
 * branch and the viewer's address file; the line from the record's
 * stations and its state.
 */

/**
 * The change's progress line, from its record's form and the modes
 * definition, through the stations the inspector's step strip reads too;
 * undefined when either cannot be read or the record's mode runs no step.
 * @param root the repository root
 * @param id the change
 * @param line the modes definition, read only here
 * @returns the line, or undefined
 */
export function progressOf(
  root: string,
  id: string,
  line: (() => ModesDefinition | undefined) | undefined,
): string | undefined {
  let text: string;
  try {
    text = readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    return undefined;
  }
  const form = parseRecordForm(`${id}.md`, text);
  if (form._tag === "err") return undefined;
  const definition = line?.();
  if (definition === undefined) return undefined;
  const plan = form.value.belongs?.plan;
  const tickets = plan !== undefined && planHasTickets(root, plan, definition);
  return progressLine(
    id,
    lineStations(definition, form.value, recordPart(form.value, tickets)),
    form.value.position,
  );
}

/**
 * The cost the record states, read for the owner's accepted overrun the
 * `Mode` cell names (J-174).
 * @param record the record's lines, undefined where none reads
 * @returns the agents and the rounds with the owner's words, undefined where the record states no cost
 */
function statedCost(record: RecordFacts | undefined): Cost | undefined {
  if (record?.agents === undefined || record.rounds === undefined) return undefined;
  const cost = { agents: record.agents, rounds: record.rounds };
  return record.overrun === undefined ? cost : { ...cost, overrun: record.overrun };
}

/**
 * The facts table's rows for the open change.
 * @param root the repository root
 * @param id the open change
 * @param branch the branch HEAD names, undefined at a detached HEAD
 * @param line the modes definition, read for the mode's cost and the step's depth
 * @returns the rows, `Change` to `View`
 */
export function factsOf(
  root: string,
  id: string,
  branch: string | undefined,
  line: (() => ModesDefinition | undefined) | undefined,
): readonly FactRow[] {
  const record = workingRecord(root, id);
  const definition = record?.mode === undefined ? undefined : line?.();
  const mode = definition?.modes.find((entry) => entry.name === record?.mode);
  const stated = record?.interface;
  return factsRows({
    id,
    mode:
      definition === undefined || mode === undefined
        ? undefined
        : {
            definition,
            mode,
            touches: stated !== undefined && parseInterfaceFact(stated)?.touches === true,
            cost: statedCost(record),
          },
    state: record?.state,
    step: record === undefined ? undefined : (recordStep(root, id, line) ?? undefined),
    branch,
    base: defaultBranch(root),
    ground: record?.ground,
    view: viewAddress(root, id, line),
  });
}

/**
 * The facts block and the progress line as `greenline status` prints them,
 * the mirror's own lines: nothing while no change is open.
 * @param root the repository root
 * @param id the open change, undefined where none is
 * @param branch the branch HEAD names
 * @param line the modes definition
 * @param words the owner's message of the turn, which the waiting line reads (J-205 S1)
 * @returns the text, each line ending in a newline
 */
export function factsText(
  root: string,
  id: string | undefined,
  branch: string | undefined,
  line: (() => ModesDefinition | undefined) | undefined,
  words?: string,
): string {
  if (id === undefined) return "";
  const progress = progressOf(root, id, line);
  const record = workingRecord(root, id);
  const waiting =
    record === undefined
      ? undefined
      : waitingLine(record, undefined, words, shownPatchOwed(root, id));
  return [
    ...factsBlock(factsOf(root, id, branch, line)),
    // What the owner's word decides, from the record's next line, as the mirror prints it (J-149 S3).
    ...(waiting === undefined ? [] : [waiting]),
    ...(progress === undefined ? [] : [`progress: \`${progress}\``]),
  ]
    .map((text) => `${text}\n`)
    .join("");
}
