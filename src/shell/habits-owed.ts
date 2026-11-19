import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { recordPath } from "../core/git-hooks.ts";
import {
  changeMessages,
  FILE_CLASSES,
  fileClassesOf,
  invariantFloors,
  namedMode,
  owedLine,
  owedSkills,
  owedUnmetBy,
  ownersOwnWords,
  plannedClasses,
  situationLine,
  type FileClass,
  type InvariantFloor,
  type OwedRead,
  type OwedSkill,
  type ReadingBudget,
} from "../core/habits-owed.ts";
import type { Installation } from "../core/installation.ts";
import type { Manifest } from "../core/manifest.ts";
import { metSkills, waivedSkills, type OwedAtDone } from "../core/record-lint.ts";
import { installedSkills, renderProjection, renderSkillFile } from "../core/render.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionsHome } from "./git.ts";
import { workingRecord } from "./hooks.ts";
import { journaledMessages, lastJournaled, ownerJournal } from "./owner-words.ts";
import {
  changeLoads,
  planCounts,
  sessionFileName,
  sessionLoadsSince,
  sessionsOf,
  type SessionNamings,
} from "./skill-loads.ts";
import { changeTouched } from "./visuals.ts";

/**
 * The skills a change owes and the situation its proposal answers, read in
 * a workspace (J-134 S3, J-176 S1; `../core/habits-owed.ts`): the request's
 * words from the owner's journaled messages before a change opens, and
 * from the record's why line and the messages of the sessions that loaded
 * for it once it opens; the classes of the files the change touched
 * and the hooks saw read or written; the step and the mode; the trigger
 * rows and the costs from the installation. A change's first code write is
 * noted once, `.greenline/tmp/<id>/first-code-write.json`, a working file
 * no commit carries, so the after-tool line comes at that write alone.
 */

/** A record's text, empty where it stands nowhere. */
function recordText(root: string, id: string): string {
  try {
    return readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    return "";
  }
}

/** A record's why line, which restates the request in one line. */
function restated(text: string): string {
  return /^why:\s*"?(.*?)"?\s*$/m.exec(text)?.[1] ?? "";
}

/**
 * The words a change's request said (J-189 S1): its record's why line, and
 * the owner's own messages the hooks journaled that belong to the change,
 * from each session that named it or noted a load in it, a harness's
 * notice taken out and another change's request left to that change. A
 * session that named no change at all gives the change its loads went to
 * every message it journaled.
 * @param root the repository root
 * @param id the change
 * @returns the words, one text
 */
function changeWords(root: string, id: string): string {
  const sessions = new Map<string, SessionNamings>();
  for (const each of sessionsOf(root, id)) sessions.set(each.session, each);
  for (const load of changeLoads(root, id)) {
    const safe = load.session === null ? undefined : sessionFileName(load.session);
    if (safe !== undefined && !sessions.has(safe))
      sessions.set(safe, { session: safe, namings: [], noted: new Set([id]) });
  }
  const heard = changeMessages(
    id,
    [...sessions.values()].map((each) => {
      const messages = journaledMessages(root, each.session);
      return {
        messages,
        // A session that named no change gives its messages to the change its loads went to.
        namings:
          each.namings.length === 0
            ? [{ change: id, turn: null, at: messages[0]?.at ?? "" }]
            : each.namings,
      };
    }),
  );
  return [restated(recordText(root, id)), ...heard].join("\n");
}

/** The words of a SKILL.md or a page, as the corpus counts them: runs of letters and digits. */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

function words(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** The rendered block's words, by the installation and the workspace's settings, read once a process. */
const BLOCK_WORDS = new Map<string, number>();

/**
 * The words of the block a workspace's settings render, rendered once for
 * each installation and settings, since the projection renders every file.
 * @param installation the installation
 * @param manifest the workspace's settings
 * @returns the block's words
 */
function blockWordsOf(installation: Installation, manifest: Manifest): number {
  const key = `${installation.revision}\u0000${JSON.stringify(manifest)}`;
  const known = BLOCK_WORDS.get(key);
  if (known !== undefined) return known;
  const block = renderProjection(manifest, installation).find((file) => file.path === "AGENTS.md");
  const counted = words(block?.content ?? "");
  BLOCK_WORDS.set(key, counted);
  return counted;
}

/**
 * The reading budget a mode leaves for owed reads (J-176 S1): its words
 * budget less the block and the `SKILL.md` of each step it runs, and each
 * skill's cost, its front or its front with its pages.
 * @param installation the installation
 * @param manifest the workspace's manifest
 * @param mode the mode, undefined before one is known, which reads the largest budget
 * @returns the budget
 */
export function readingBudget(
  installation: Installation,
  manifest: Manifest,
  mode: string | undefined,
): ReadingBudget {
  const blockWords = blockWordsOf(installation, manifest);
  const front = (name: string): number => {
    const skill = installation.skills.find((each) => each.name === name);
    return skill === undefined ? 0 : words(renderSkillFile(skill));
  };
  const whole = (name: string): number => {
    const skill = installation.skills.find((each) => each.name === name);
    // The pages the recipe's whole read includes where it names them (J-203 S1), else every page.
    const named = installation.triggers?.skills.find((each) => each.name === name)?.wholeRead;
    const pages = (skill?.supportFiles ?? [])
      .filter((file) =>
        named === undefined ? file.path.endsWith(".md") : named.includes(file.path),
      )
      .reduce((total, file) => total + words(file.content), 0);
    return front(name) + pages;
  };
  const modes = installation.modes.modes.filter((each) => mode === undefined || each.name === mode);
  const headrooms = modes.map((each) => {
    const steps = installation.modes.steps
      .filter((step) => (each.steps[step.name]?.depth ?? "none") !== "none")
      .reduce((total, step) => total + front(step.name), 0);
    return each.budget.words - blockWords - steps;
  });
  return {
    headroom: headrooms.length === 0 ? undefined : Math.max(0, ...headrooms),
    cost: (skill: string, read: OwedRead) => (read === "whole" ? whole(skill) : front(skill)),
  };
}

/**
 * The classes the hooks saw a session read or write, beside its counter,
 * and the changes whose invariants list it read or wrote (J-195 S1).
 */
const SEEN = z.object({
  classes: z.array(z.enum(FILE_CLASSES)),
  lists: z.array(z.string()).optional(),
});

/** The invariants start's list of a change, `.greenline/ledger/<id>/invariants.md` (J-195 S1). */
const INVARIANTS_LIST = /^\.greenline\/ledger\/([^/]+)\/invariants\.md$/;

/** The path of a change's invariants list, from the root. */
function invariantsListPath(id: string): string {
  return join(".greenline", "ledger", id, "invariants.md");
}

function seenFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}.seen.json`);
}

/**
 * The classes of the files the hooks saw a session read or write.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the classes
 */
function seenClasses(root: string, session: string): ReadonlySet<FileClass> {
  return new Set(seenOf(root, session).classes);
}

/** What the hooks noted for a session: the classes of the files it read or wrote, and the changes whose invariants list it did. */
interface Seen {
  readonly classes: readonly FileClass[];
  readonly lists: readonly string[];
}

/** What the hooks noted for a session, empty where nothing was. */
function seenOf(root: string, session: string): Seen {
  const path = seenFile(root, session);
  if (path === undefined) return { classes: [], lists: [] };
  try {
    const read = SEEN.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success
      ? { classes: read.data.classes, lists: read.data.lists ?? [] }
      : { classes: [], lists: [] };
  } catch {
    return { classes: [], lists: [] };
  }
}

/**
 * The floors the invariants lists raise (J-195 S1): the open change's list,
 * and each list the session read or wrote before a change opened, since the
 * start writes it ahead of the proposal.
 * @param root the repository root
 * @param ids the changes whose lists to read
 * @returns the floors, each entry once
 */
function invariantsFloorsOf(root: string, ids: readonly string[]): readonly InvariantFloor[] {
  const floors: InvariantFloor[] = [];
  const named = new Set<string>();
  for (const id of new Set(ids)) {
    let text: string;
    try {
      text = readFileSync(join(root, invariantsListPath(id)), "utf8");
    } catch {
      continue;
    }
    for (const floor of invariantFloors(text)) {
      const key = `${floor.floor}\u0000${floor.entry}`;
      if (named.has(key)) continue;
      named.add(key);
      floors.push(floor);
    }
  }
  return floors;
}

/**
 * Note the classes of the paths a tool read or wrote, for the situation's
 * floors (J-176 S1); a path of no class notes nothing, and no path's name
 * is kept, save the id of a change whose invariants list it is (J-195 S1).
 * @param root the repository root
 * @param session the harness's session id
 * @param paths the paths, from the root
 */
export function noteSeen(root: string, session: string, paths: readonly string[]): void {
  const path = seenFile(root, session);
  const fresh = paths.flatMap(fileClassesOf);
  // The change whose invariants list a path is, by its id alone (J-195 S1).
  const lists = paths.flatMap((each) => {
    const id = INVARIANTS_LIST.exec(each.split("\\").join("/"))?.[1];
    return id === undefined ? [] : [id];
  });
  if (path === undefined || (fresh.length === 0 && lists.length === 0)) return;
  const known = seenOf(root, session);
  const all = new Set([...known.classes, ...fresh]);
  const listed = new Set([...known.lists, ...lists]);
  if (all.size === known.classes.length && listed.size === known.lists.length) return;
  mkdirSync(dirname(path), { recursive: true });
  const noted =
    listed.size === 0
      ? { classes: [...all].sort() }
      : { classes: [...all].sort(), lists: [...listed].sort() };
  atomicWriteFile(path, `${JSON.stringify(noted)}\n`);
}

/** What the situation and the owed lines read in a workspace. */
export interface OwedInput {
  readonly root: string;
  readonly installation: Installation;
  readonly manifest: Manifest;
  /** The branch's change, undefined while it holds none; one not open owes by the words alone (J-207 S1). */
  readonly change: string | undefined;
  /** The harness's session id, null outside a session. */
  readonly session: string | null;
}

/** The owner's last message the hooks journaled for the session, or for any session outside one, undefined where none. */
function lastMessage(root: string, session: string | null): string | undefined {
  const journal = ownerJournal(root, session ?? undefined);
  // A harness's notice is no message of the owner's (J-189 S1).
  return journal.kept
    ? journal.messages.map(ownersOwnWords).findLast((said) => said !== "")
    : undefined;
}

/**
 * The skills a change owes now: by its words, the classes it touched, its
 * step and its mode; before a change opens, by the request's words alone.
 * The classes its plan names count until the build ends (J-225 S1): while
 * the record's step is frame, design, plan, anticipate or build, or the
 * record names none, as a fresh skeleton's; from review on, and at the
 * done door, the touched files alone hold.
 * @param input the workspace and the change
 * @param steps the steps to read rows at: the step now, or the steps the change ran
 * @param door `done` at the done door, which reads the touched files alone
 * @returns the owed skills, in order
 */
export function owedNow(
  input: OwedInput,
  steps: ReadonlySet<string>,
  door: "now" | "done" = "now",
): readonly OwedSkill[] {
  const triggers = input.installation.triggers;
  const { root, change } = input;
  // No change open, nothing is owed: an obligation is a change's, raised by its own request (J-189 S1).
  if (triggers === undefined || change === undefined) return [];
  // A skill the workspace did not install, a trial not enabled or an extra not included, is owed nothing (J-178 S1).
  const installed = new Set(
    installedSkills(input.manifest, input.installation).map((skill) => skill.name),
  );
  // The files the change touched, and until the build ends the files and the test its plan names, read before any is written (J-200 S1, J-225 S1).
  const planned =
    door === "now" && planCounts(root, change, () => input.installation.modes)
      ? plannedClasses(recordText(root, change))
      : undefined;
  return owedSkills(triggers, {
    words: changeWords(root, change),
    classes: new Set(changeTouched(root, change).flatMap(fileClassesOf)),
    planned,
    steps,
    mode: workingRecord(root, change)?.mode,
    installed,
  });
}

/** The two lines a proposal answers: the situation, and the skills owed where any are. */
export interface ProposalLines {
  readonly situation: string;
  readonly owed: string | undefined;
}

/**
 * The situation and the owed lines the mirror and status print (J-176 S1).
 * @param input the workspace and the change
 * @returns the two lines, the owed one undefined where nothing is owed
 */
export function proposalLines(input: OwedInput): ProposalLines {
  const { root, change, session, manifest, installation } = input;
  const record = change === undefined ? undefined : workingRecord(root, change);
  const message = lastMessage(root, session);
  const modes = installation.modes.modes.map((mode) => mode.name);
  const seen = new Set([
    ...(session === null ? [] : seenClasses(root, session)),
    ...(change === undefined ? [] : changeTouched(root, change).flatMap(fileClassesOf)),
  ]);
  const situation = situationLine({
    named: message === undefined ? undefined : namedMode(message, modes),
    proceed: manifest.proceed,
    seen,
    interface: { roots: manifest.interface !== undefined, stated: record?.interface },
    heard: message !== undefined,
    invariants: invariantsFloorsOf(root, [
      ...(change === undefined ? [] : [change]),
      ...(session === null ? [] : seenOf(root, session).lists),
    ]),
    // The acting change's floors line, an unanswered one read as none, against the floors the hooks saw (J-226 S1).
    recorded:
      record?.state === "open" || record?.state === "stopped" ? (record.floors ?? []) : undefined,
  });
  // With no change open the request's words owe what their rows hold, so an answer that opens no change still sees the line (J-203 S1),
  // a done, dropped or stopped change on the branch among those (J-207 S1; j196c-merged-skillsb 002/001, on the done change's own branch).
  if (change === undefined || record?.state !== "open")
    return { situation, owed: owedFromWords(input) };
  // The line stands while the change is open, and states the whole obligation over every step its mode runs (J-189 S1).
  const unread = owedUnmet(input);
  // The budget renders the block, so it is read only where a skill is owed and not met.
  return {
    situation,
    owed:
      unread.length === 0
        ? undefined
        : owedLine(unread, new Set(), readingBudget(installation, manifest, record.mode)),
  };
}

/**
 * The steps a change's mode runs, at a depth other than none; none where
 * the record names no mode the definition holds.
 * @param input the workspace and the change
 * @returns the steps
 */
function modeSteps(input: OwedInput): ReadonlySet<string> {
  const name =
    input.change === undefined ? undefined : workingRecord(input.root, input.change)?.mode;
  const mode = input.installation.modes.modes.find((each) => each.name === name);
  return new Set(
    input.installation.modes.steps
      .filter((step) => (mode?.steps[step.name]?.depth ?? "none") !== "none")
      .map((step) => step.name),
  );
}

/**
 * The skills a change owes and has not met (J-189 S1): owed by its own
 * words, the files it touched, its mode and every step its mode runs,
 * neither loaded in its facts, named in its skills line nor waived by the
 * owner in its record; the reading the owes line prints and the done door
 * holds alike.
 * @param input the workspace and the change
 * @returns the unmet skills, in the order the line prints them
 */
function owedUnmet(input: OwedInput): readonly OwedSkill[] {
  const triggers = input.installation.triggers;
  if (input.change === undefined || triggers === undefined) return [];
  const owed = owedNow(input, modeSteps(input));
  if (owed.length === 0) return [];
  const text = recordText(input.root, input.change);
  const met = new Set(
    metSkills(
      input.change,
      text,
      owed.map((entry) => entry.skill),
    ),
  );
  const waived = waivedSkills(text);
  // A whole read the loads began is held to its pages, the skills line naming it or not (J-203 S1).
  return owedUnmetBy(owed, changeLoads(input.root, input.change), triggers).filter(
    (entry) => !waived.has(entry.skill) && (entry.held !== undefined || !met.has(entry.skill)),
  );
}

/**
 * The skills a done change owed by its words, the files it touched, its
 * mode and every step its mode runs, which the record lint holds to a load
 * (J-176 S1), each whole read the loads began with the pages they have not
 * shown whole (J-203 S1).
 * @param input the workspace and the change
 * @returns the owed skills, each with what owed it and the pages still held
 */
export function owedAtDone(input: OwedInput): readonly OwedAtDone[] {
  // The door reads the files the change touched alone, whatever its step (J-225 S1).
  const owed = owedNow(input, modeSteps(input), "done");
  const triggers = input.installation.triggers;
  const unmet =
    triggers === undefined || input.change === undefined
      ? []
      : owedUnmetBy(owed, changeLoads(input.root, input.change), triggers);
  return owed.map((entry) => {
    const held = unmet.find((each) => each.skill === entry.skill)?.held;
    return held === undefined
      ? { skill: entry.skill, why: entry.why }
      : { skill: entry.skill, why: entry.why, held };
  });
}

/**
 * The owes line from the request's words while no change is open (J-203
 * S1; j196c-merged-skills's simplify request, j196t-state-machines and
 * j196t-invariants, whose answers opened no change), whatever change the
 * branch still holds done, dropped or stopped (J-207 S1;
 * j196c-merged-skillsb 002/001): the owner's last message read against
 * every trigger row a request's words alone hold, whatever its weight or
 * its read, no step and no file class, the mode it names where it names
 * one, and met by the loads the session noted since that message, its
 * turn's loads.
 * @param input the workspace, no change open
 * @returns the line, undefined where the words owe nothing or the turn met it
 */
function owedFromWords(input: OwedInput): string | undefined {
  const triggers = input.installation.triggers;
  const message = lastJournaled(input.root, input.session);
  if (triggers === undefined || message === undefined) return undefined;
  const modes = input.installation.modes.modes.map((mode) => mode.name);
  const mode = namedMode(message.words, modes);
  const owed = owedSkills(triggers, {
    words: message.words,
    classes: new Set(),
    steps: new Set(),
    mode,
    installed: new Set(
      installedSkills(input.manifest, input.installation).map((skill) => skill.name),
    ),
  });
  if (owed.length === 0) return undefined;
  const unmet = owedUnmetBy(
    owed,
    sessionLoadsSince(input.root, message.session, message.at),
    triggers,
  );
  return unmet.length === 0
    ? undefined
    : owedLine(unmet, new Set(), readingBudget(input.installation, input.manifest, mode));
}

/**
 * Note a change's first code write: true at the first, after which the
 * marker stands and every later write reads false.
 * @param root the repository root
 * @param id the change
 * @param at the write's time
 * @returns whether this write is the change's first outside the homes
 */
export function firstCodeWrite(root: string, id: string, at: string): boolean {
  const path = join(root, ".greenline", "tmp", id, "first-code-write.json");
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify({ at })}\n`);
  return true;
}
