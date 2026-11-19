import { parseGround } from "./ground.ts";
import type { Cost } from "./change.ts";
import {
  depthOf,
  freshAgents,
  roundsAtMost,
  stepApplies,
  type Mode,
  type ModesDefinition,
} from "./modes.ts";

/*
 * The facts table the status mirror and `greenline status` print while a
 * change is open (J-144 S1; the block's reply section, "The facts"): the
 * rows `Change`, `Mode` with its cost, `Step` with its depth, `Where` and
 * `View`, in that order, each cell one clause. The reply copies the block
 * as its table, never composing it, and adds only what the owner's next
 * word decides and a floor it found.
 */

/** A row of the facts table, in the order printed. */
export type FactName = "Change" | "Mode" | "Step" | "Where" | "View";

/** One row: the fact and its cell. */
export interface FactRow {
  readonly fact: FactName;
  readonly now: string;
}

/** What the table reads of the open change. */
export interface FactsInput {
  /** The change's id. */
  readonly id: string;
  /** The mode its record states and that the definition holds, with whether the change touches an interface; undefined where it states none. */
  readonly mode?:
    | {
        readonly mode: Mode;
        readonly definition: ModesDefinition;
        readonly touches: boolean;
        /** The cost the record states, read for the owner's accepted overrun (J-174); undefined where it states none. */
        readonly cost?: Cost | undefined;
      }
    | undefined;
  /** The record's state, undefined where no record reads. */
  readonly state?: string | undefined;
  /** The step the record is in, undefined where none is. */
  readonly step?: string | undefined;
  /** The branch HEAD names, undefined at a detached HEAD. */
  readonly branch: string | undefined;
  /** The repository's default branch, undefined where git cannot say. */
  readonly base: string | undefined;
  /** The record's `ground` line as written, undefined where it states none. */
  readonly ground?: string | undefined;
  /** The address of the page the turn calls for, or undefined where no viewer serves. */
  readonly view: string | undefined;
}

/** A count and its noun, singular for one, `no` for none. */
function counted(amount: number, noun: string): string {
  if (amount === 0) return `no ${noun}`;
  return `${String(amount)} ${noun}${amount === 1 ? "" : "s"}`;
}

/**
 * The most agents a change of the mode may start, the builder and each
 * fresh agent of a step that applies to it (`./modes.ts`, `agentsAtMost`,
 * with the design step counted only where the change touches an interface).
 * @param definition the modes definition
 * @param mode the change's mode
 * @param touches whether the change touches an interface
 * @returns the number, at least 1
 */
function changeAgents(definition: ModesDefinition, mode: Mode, touches: boolean): number {
  return definition.steps
    .filter((step) => stepApplies(step, { interface: touches }))
    .reduce((total, step) => total + freshAgents(depthOf(mode, step.name)), 1);
}

/**
 * The `Mode` cell: the mode and its cost in one phrase, `regular, 2 agents,
 * 1 fix round`.
 * @param definition the modes definition
 * @param mode the change's mode
 * @param touches whether the change touches an interface
 * @returns the cell
 */
export function modeCell(definition: ModesDefinition, mode: Mode, touches: boolean): string {
  return `${mode.name}, ${counted(changeAgents(definition, mode, touches), "agent")}, ${counted(mode.fixRounds, "fix round")}`;
}

/**
 * The owner's accepted overrun after the `Mode` cell (J-174): where the
 * record's `overrun` line quotes the owner accepting a cost past the count,
 * the agents and the rounds past it, `; 7 agents accepted by the owner`;
 * nothing otherwise.
 * @param definition the modes definition
 * @param mode the change's mode
 * @param touches whether the change touches an interface
 * @param cost the cost the record states
 * @returns the clause, or the empty string
 */
function overrunClause(
  definition: ModesDefinition,
  mode: Mode,
  touches: boolean,
  cost: Cost | undefined,
): string {
  if (cost?.overrun === undefined) return "";
  const past = [
    ...(cost.agents > changeAgents(definition, mode, touches)
      ? [counted(cost.agents, "agent")]
      : []),
    ...(cost.rounds > roundsAtMost(definition, mode) ? [counted(cost.rounds, "round")] : []),
  ];
  return past.length === 0 ? "" : `; ${past.join(", ")} accepted by the owner`;
}

/**
 * The `Where` cell: `branch greenline/<id> from main`, the branch alone
 * where it is the default branch or none is known, or `worktree <path> on
 * <branch>` where the record's ground is a worktree.
 * @param input the branch, the default branch and the record's ground line
 * @returns the cell
 */
export function whereCell(input: Pick<FactsInput, "branch" | "base" | "ground">): string {
  const on = input.branch ?? "a detached HEAD";
  const stated = input.ground === undefined ? undefined : parseGround(input.ground);
  if (stated?.kind === "worktree") return `worktree ${stated.path} on ${on}`;
  if (input.branch === undefined) return on;
  return input.base === undefined || input.base === input.branch
    ? `branch ${input.branch}`
    : `branch ${input.branch} from ${input.base}`;
}

/** The view cell's words where no viewer serves. */
const NOT_SERVING = "not serving";

/**
 * The table's rows for the open change, in the order printed: `Change`,
 * `Mode` where the record states a mode the definition holds, `Step` with
 * its depth where the record is in one, `done` once it is, `Where` and
 * `View`.
 * @param input what the table reads
 * @returns the rows
 */
export function factsRows(input: FactsInput): readonly FactRow[] {
  const rows: FactRow[] = [{ fact: "Change", now: input.id }];
  const chosen = input.mode;
  if (chosen !== undefined)
    rows.push({
      fact: "Mode",
      now: `${modeCell(chosen.definition, chosen.mode, chosen.touches)}${overrunClause(chosen.definition, chosen.mode, chosen.touches, chosen.cost)}`,
    });
  if (input.state === "done" || input.state === "dropped")
    rows.push({ fact: "Step", now: input.state });
  else if (input.step !== undefined) {
    // A step the mode holds no depth for, as a record naming another definition's step, is printed alone.
    const step = input.step;
    const depth = Object.entries(chosen?.mode.steps ?? {}).find(([name]) => name === step)?.[1]
      .depth;
    rows.push({ fact: "Step", now: depth === undefined ? input.step : `${input.step}, ${depth}` });
  }
  rows.push({ fact: "Where", now: whereCell(input) });
  rows.push({ fact: "View", now: input.view ?? NOT_SERVING });
  return rows;
}

/** The heading line of the facts block, which the mirror and status print above the table. */
const FACTS_HEADING = "facts:";

/** The table's header line, the reply's own form of the block. */
const FACTS_HEADER = "| Fact | Now |";

/**
 * The facts block as printed: its heading, then the table in the reply's
 * own form, `| Fact | Now |`, one line per row; nothing where no row is.
 * @param rows the rows
 * @returns the lines, unindented
 */
export function factsBlock(rows: readonly FactRow[]): readonly string[] {
  if (rows.length === 0) return [];
  return [
    FACTS_HEADING,
    FACTS_HEADER,
    "| --- | --- |",
    ...rows.map((row) => `| ${row.fact} | ${row.now.replaceAll("|", "\\|")} |`),
  ];
}
