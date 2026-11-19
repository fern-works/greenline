import type { Position, RecordForm } from "./change.ts";
import { depthOf, stepApplies, type ModesDefinition } from "./modes.ts";
import { ownerWait } from "./record-lines.ts";

/**
 * How a section stands in the record: written, the skipped step's one line,
 * present but empty, absent, or absent because the other record of a split
 * holds it. The inspector's contract words it in its own vocabulary
 * (`StepState`).
 */
export type SectionState = "written" | "skipped" | "empty" | "missing" | "elsewhere";

/**
 * The step stations of a change record and its progress line (the block's
 * reply section, "The progress line"; J-107 S3, J-144 S1). One reader serves
 * both consumers: the inspector's step strip takes each station's state, and
 * the status mirror and `greenline status` print the progress line, which
 * names every step of the change's line with its state: written, in
 * progress, to come, or not run by its mode. The record is read for its form
 * (`parseRecordForm`, fenced headings left out), never judged.
 */

/** Which part of a split a record is: a ticket's, the planning record of a plan with tickets, or the whole work. */
export type RecordPart = "ticket" | "plan" | "whole";

/** One step of the line: how its section stands, and whether the record's mode runs it. */
export interface Station {
  readonly step: string;
  readonly state: SectionState;
  /** True where the record's mode gives the step a depth other than none, or, with the mode unknown, where its section is no `none at` line. */
  readonly runs: boolean;
  /** False where another record of a split holds the step, or where it applies by a fact the record does not state, so the change's line leaves it out (J-144 S1). */
  readonly applies: boolean;
}

/** A section that holds only the line the skeleton writes for a step the mode does not run, or one that does not apply to the change. */
const NONE_LINE = /^none(?: at [a-z][a-z0-9-]*|, no [a-z]+)$/;

/** A line the skeleton left in a section: its placeholder in angle brackets. */
const PLACEHOLDER = /^<[\s\S]*>$/;

/**
 * A section's state from its text: absent, empty or holding only the
 * skeleton's placeholder (J-176 S1), the `none at` line, or written.
 * @param text the section's text, undefined where the record holds none
 * @returns its state
 */
export function sectionStateOf(text: string | undefined): SectionState {
  if (text === undefined) return "missing";
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0 || lines.every((line) => PLACEHOLDER.test(line))) return "empty";
  return NONE_LINE.test(text.trim()) ? "skipped" : "written";
}

/**
 * Which part of a split a record is.
 * @param form the record's form
 * @param planHasTickets whether the plan the record belongs to lists tickets
 * @returns the part
 */
export function recordPart(form: RecordForm, planHasTickets: boolean): RecordPart {
  if (form.belongs?.ticket !== undefined) return "ticket";
  return form.belongs !== undefined && planHasTickets ? "plan" : "whole";
}

/**
 * The record's stations, one per step of the line in its order: a step
 * another record of the split holds is `elsewhere`; a stale `none at` line
 * on a step the mode now runs, as a raise leaves it, is a step still to come.
 * @param definition the modes definition
 * @param form the record's form
 * @param part which part of a split it is
 * @returns one station per step of the line
 */
export function lineStations(
  definition: ModesDefinition,
  form: RecordForm,
  part: RecordPart,
): readonly Station[] {
  const mode = definition.modes.find((entry) => entry.name === form.mode);
  // A ticket's record leaves the plan's steps to the planning record, which leaves the ticket's steps to its tickets'.
  const holder = part === "ticket" ? "plan" : part === "plan" ? "ticket" : null;
  return definition.steps.map((entry): Station => {
    const found = form.sections.find((section) => section.heading === entry.name);
    const elsewhere = found === undefined && holder !== null && entry.whenSplit === holder;
    const state = elsewhere ? "elsewhere" : sectionStateOf(found?.text);
    // A step that applies by a fact the record does not state runs nowhere in it (J-123 S2).
    const applies = stepApplies(entry, { interface: form.interface?.touches === true });
    const runs =
      !elsewhere &&
      applies &&
      (mode === undefined ? state !== "skipped" : depthOf(mode, entry.name).depth !== "none");
    return { step: entry.name, state, runs, applies: !elsewhere && applies };
  });
}

/** The glyphs of a step's state on the progress line: written, in progress, to come, and not run by the mode. */
const PROGRESS_GLYPHS = { written: "✓", current: "▶", pending: "·", skipped: "–" } as const;

/** The separator between the id, the steps and the tail. */
const SEPARATOR = ` ${PROGRESS_GLYPHS.pending} `;

/** The words that may follow the steps, a fixed set chosen from the record's state and its "next" line, never composed. */
export type ProgressTail = "waiting on you" | "stopped" | "red";

/** A "next" line's action that waits on the owner's word. */
const WAITS_ON_OWNER =
  /\b(?:wait(?:s|ing)? (?:on|for) (?:the owner|you)|ask(?:s|ing)? the owner|the owner's (?:yes|answer|word|words|pick|verdict|choice|call))\b/i;

/**
 * Whether a "next" line's action waits on the owner's word (J-149 S3,
 * J-222 S1): its own words above, or a wait on the owner under any form
 * `ownerWait` reads, a review of shown tests among them while the record
 * is stopped, so a wait the mirror names is one here too. A wait that asks
 * the owner to resume reads as the words above read it.
 * @param action the "next" line's action, its step aside
 * @param stopped whether the record reads stopped
 * @returns true where it waits on the owner
 */
function waitsOnOwner(action: string, stopped: boolean): boolean {
  return WAITS_ON_OWNER.test(action) || ownerWait(action, stopped) !== undefined;
}

/** A "next" line's action that names a red check or test. */
const NAMES_RED =
  /\b(?:red|(?:failing|failed) (?:check|test)s?|(?:check|test)s? (?:fails?|failed))\b/i;

/** The step a "next" line names, and the action after it. */
const NEXT_LINE = /^([a-z][a-z0-9-]*): (.*)$/;

/**
 * The tail of the progress line: `stopped` for a stopped record, `red`
 * where its "next" line's action names a red or failing check, `waiting on
 * you` where it waits on the owner's word, and nothing otherwise.
 * @param position the record's state and "next" line
 * @returns the tail, or undefined
 */
export function progressTail(position: Position | undefined): ProgressTail | undefined {
  if (position === undefined) return undefined;
  if (position.state === "stopped") return "stopped";
  if (position.state !== "open" || position.next === undefined) return undefined;
  const action = NEXT_LINE.exec(position.next)?.[2] ?? position.next;
  if (NAMES_RED.test(action)) return "red";
  return waitsOnOwner(action, false) ? "waiting on you" : undefined;
}

/**
 * What an open or stopped record waits on the owner for (J-149 S3; the
 * ledger guide, "Stops and resumes"): its "next" line's action where that
 * action waits on the owner's word (`waitsOnOwner`), read from the
 * record, so the wait survives a stop and its resume.
 * @param position the record's state and "next" line
 * @returns the action, or undefined where it waits on no word of the owner's
 */
export function waitingOn(position: Position | undefined): string | undefined {
  if (position === undefined || (position.state !== "open" && position.state !== "stopped"))
    return undefined;
  if (position.next === undefined) return undefined;
  const action = NEXT_LINE.exec(position.next)?.[2] ?? position.next;
  return waitsOnOwner(action, position.state === "stopped") ? action : undefined;
}

/**
 * A change's id without its date, as the progress line prints it.
 * @param id the change's id
 * @returns the id after its `YYYY-MM-DD-` prefix, or the id where it has none
 */
export function shortId(id: string): string {
  const short = id.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return short === "" ? id : short;
}

/** The step a "next" line names, for an open or stopped record. */
function namedStep(position: Position | undefined): string | undefined {
  if (position === undefined || (position.state !== "open" && position.state !== "stopped"))
    return undefined;
  return position.next === undefined ? undefined : NEXT_LINE.exec(position.next)?.[1];
}

/**
 * The progress line for a change (J-144 S1): the id without its date, then
 * every step of the change's line with its state's glyph, `✓` written, `▶`
 * in progress, `·` to come and `–` a step its mode does not run, then a
 * tail from a fixed set, `waiting on you`, `stopped` or `red`:
 * `find-by-year · frame ✓ plan ✓ anticipate – build ▶ review · verify · close`.
 * A done record's line is `✓ find-by-year done · 6 steps`. The step in
 * progress is the one the record's "next" line names, else the first step
 * the mode runs whose section is not written. No count and no sentence on
 * the way.
 * @param id the change's id
 * @param stations the record's stations, in the line's order
 * @param position the record's state and "next" line, undefined where unread
 * @returns the line, or undefined when the record's mode runs no step it holds
 */
export function progressLine(
  id: string,
  stations: readonly Station[],
  position?: Position,
): string | undefined {
  const line = stations.filter((station) => station.applies);
  const cells = line.filter((station) => station.runs);
  if (cells.length === 0) return undefined;
  const label = shortId(id);
  if (position?.state === "done")
    return `${PROGRESS_GLYPHS.written} ${label} done${SEPARATOR}${String(cells.length)} steps`;
  const named = namedStep(position);
  const current =
    named !== undefined && cells.some((station) => station.step === named)
      ? named
      : cells.find((station) => station.state !== "written")?.step;
  // A step to come carries no mark of its own: the `·` that follows it is its mark and the separator at once.
  const steps = line.map((station) => {
    if (!station.runs) return `${station.step} ${PROGRESS_GLYPHS.skipped}`;
    if (station.step === current) return `${station.step} ${PROGRESS_GLYPHS.current}`;
    return station.state === "written"
      ? `${station.step} ${PROGRESS_GLYPHS.written}`
      : station.step;
  });
  const tail = progressTail(position);
  const marked = new Set<string>([
    PROGRESS_GLYPHS.written,
    PROGRESS_GLYPHS.current,
    PROGRESS_GLYPHS.skipped,
  ]);
  // The steps run as words; the tail always stands after the separator, whatever mark the last step carries.
  const words = [label, ...steps].reduce((text, token) =>
    marked.has(text.at(-1) ?? "") ? `${text} ${token}` : `${text}${SEPARATOR}${token}`,
  );
  return tail === undefined ? words : `${words}${SEPARATOR}${tail}`;
}
