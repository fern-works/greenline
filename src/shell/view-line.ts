import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { DESIGN_PICK_FILE } from "../core/design-pick.ts";
import { pageAddress } from "../core/inspect-address.ts";
import { parseInterfaceFact } from "../core/interface-fact.ts";
import type { ModesDefinition } from "../core/modes.ts";
import { turnPage, type TurnFacts, type TurnPage } from "../core/view-page.ts";
import { readFrameMap } from "./frame-map.ts";
import { workingRecord } from "./hooks.ts";
import { listedOnMaps, pathOf } from "./inspect/app/addresses.ts";
import { readServing } from "./inspect/address-file.ts";
import { dealPath } from "./deal-view.ts";
import { openMarks, readMarksFiles } from "./marks.ts";
import { recordStep } from "./skill-loads.ts";
import { readVisualsHome } from "./visuals.ts";
import { waitingOn } from "./inspect/waiting.ts";

/*
 * The facts table's `View` row the mirror and `greenline status` print
 * (J-142 S2, J-144 S1): the address of the page the turn's situation calls
 * for, read from the inspector's address file, or `not serving` where no
 * viewer serves. The facts are read here and the choice is `turnPage`'s
 * (`../core/view-page.ts`), so both readers print the same row; a kept
 * picture's address is chosen here, where its form is read: a map or a
 * figure the Maps tab, any other its own page (J-221 S1).
 */

/** A raw log line's kind and time, the fields the turn's start is read from. */
const LOGGED = z.object({ kind: z.string(), at: z.string() });

/**
 * When the previous turn started: the turn start before the latest in the
 * change's raw log, the latest where it holds one alone.
 */
function previousTurnStart(root: string, id: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(join(root, ".greenline", "tmp", id, "events.jsonl"), "utf8");
  } catch {
    return undefined;
  }
  const starts = text.split("\n").flatMap((line) => {
    const read = LOGGED.safeParse(parseJson(line));
    return read.success && read.data.kind === "turn-start" ? [read.data.at] : [];
  });
  return starts.length > 1 ? starts.at(-2) : starts[0];
}

/** When a visual was made: its manifest's instant, or the manifest's last write where it states a date alone. */
function madeAt(root: string, made: string, manifestPath: string): string | undefined {
  if (made.length > 10) return made;
  try {
    return statSync(join(root, manifestPath)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

/** A visual the turn made: its id and the form its manifest names. */
interface MadeVisual {
  readonly id: string;
  readonly form: string;
}

/** The newest visual of the change made since the previous turn started, a capture aside: the captures have their own page. */
function madeVisual(root: string, id: string): MadeVisual | undefined {
  const since = previousTurnStart(root, id);
  if (since === undefined) return undefined;
  const made = readVisualsHome(root).flatMap((entry) => {
    if (entry.manifest._tag === "err") return [];
    const manifest = entry.manifest.value;
    if (manifest.change !== id || manifest.form === "capture") return [];
    const at = madeAt(root, manifest.made, entry.manifestPath);
    return at === undefined || Date.parse(at) < Date.parse(since)
      ? []
      : [{ id: entry.id, form: manifest.form, at }];
  });
  const newest = made.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return newest === undefined ? undefined : { id: newest.id, form: newest.form };
}

/** Whether a question of the change's frame map waits for its answer and its decider. */
function frameOpen(root: string, id: string): boolean {
  const reading = readFrameMap(root, id);
  return (
    reading.map !== null &&
    reading.map.questions.some((question) => question.answer === null && question.decided === null)
  );
}

/**
 * What the choice of the turn's page reads of the open change.
 * @param root the repository root
 * @param change the open change's id, undefined where none is open
 * @param line the modes definition, read for the record's step
 * @param made the visual the turn made, read once by the caller
 * @returns the facts
 */
function turnFactsOf(
  root: string,
  change: string | undefined,
  line: (() => ModesDefinition | undefined) | undefined,
  made: MadeVisual | undefined,
): TurnFacts {
  const marksOpen = openMarks(root, readMarksFiles(root)).length > 0;
  if (change === undefined)
    return {
      change,
      proposal: false,
      state: undefined,
      step: null,
      touchesInterface: false,
      picked: false,
      frameOpen: false,
      waiting: false,
      madeVisual: undefined,
      marksOpen,
    };
  const record = workingRecord(root, change);
  const stated = record?.interface;
  const touchesInterface = stated !== undefined && parseInterfaceFact(stated)?.touches === true;
  const step = recordStep(root, change, line);
  return {
    change,
    proposal: record === undefined || record.choice === undefined,
    state: record?.state,
    step,
    touchesInterface,
    picked: existsSync(join(root, ".greenline", "ledger", change, DESIGN_PICK_FILE)),
    frameOpen: frameOpen(root, change),
    // The inspector's own reader, so the View row and the waiting part never disagree.
    waiting:
      waitingOn(root, {
        id: change,
        state: record?.state,
        next: record?.next,
        step,
        touchesInterface,
      }) !== null,
    madeVisual: made?.id,
    marksOpen,
  };
}

/**
 * A turn's page as the viewer's path.
 * @param root the repository root, read for the deal it last dealt
 * @param page the page
 * @param made the visual the turn made, whose form names a kept map's or figure's tab
 * @returns its path
 */
function turnPath(root: string, page: TurnPage, made: MadeVisual | undefined): string {
  switch (page.page) {
    case "now":
      return pathOf({ page: "now" });
    case "change":
      return pathOf({ page: "change", id: page.change, part: null });
    case "deal":
      return dealPath(root, page.change);
    case "frame":
      return pathOf({ page: "change", id: page.change, part: "frame-map" });
    case "waiting":
      return pathOf({ page: "change", id: page.change, part: "waiting" });
    case "captures":
      return pathOf({ page: "change", id: page.change, part: "captures" });
    case "marks":
      return pathOf({ page: "marks" });
    case "visual":
      // A map or a figure is shown live on the Maps tab with its facts; any other picture on its own page.
      return made !== undefined && made.id === page.visual && listedOnMaps(made.form)
        ? pathOf({ page: "atlas", tab: "maps" })
        : pathOf({ page: "picture", id: page.visual });
  }
}

/**
 * The address of the page the turn calls for, for the workspace as it stands.
 * @param root the repository root
 * @param change the open change's id, undefined where none is open
 * @param line the modes definition, read for the record's step
 * @returns the address, or undefined where no viewer serves
 */
export function viewAddress(
  root: string,
  change: string | undefined,
  line: (() => ModesDefinition | undefined) | undefined,
): string | undefined {
  const serving = readServing(root);
  if (serving === undefined) return undefined;
  const made = change === undefined ? undefined : madeVisual(root, change);
  return pageAddress(
    serving.address,
    turnPath(root, turnPage(turnFactsOf(root, change, line, made)), made),
  );
}
