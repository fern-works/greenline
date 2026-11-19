import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { CHANGE_ID, nextStep, parseRecordForm } from "../core/change.ts";
import {
  codexSessionSource,
  isHarness,
  runningSurface,
  surfaceRow,
  type Harness,
  type SurfaceFacts,
} from "../core/adapters.ts";
import { parseJson, type JsonValue } from "../core/contract.ts";
import type { NormalisedEvent } from "../core/event.ts";
import { recordPath } from "../core/git-hooks.ts";
import { parseLock } from "../core/lock.ts";
import {
  answersRecord,
  recordAnswer,
  stopCommitLine,
  stoppedHeldLine,
  waitingLine,
} from "../core/mirror.ts";
import { transcriptModel } from "../core/ground.ts";
import type { ModesDefinition } from "../core/modes.ts";
import { lineStations, recordPart } from "../core/progress.ts";
import { stopNotHeld, type OwnerJournal, type ReportedModel } from "../core/record-lines.ts";
import {
  lineCount,
  loadsMissing,
  onePerLoad,
  loadsOf,
  sessionLoadsOf,
  SESSIONS_GITIGNORE,
  oldestFirst,
  parseChangeLoads,
  parseSessionFact,
  settledLoads,
  sightingsOf,
  type LoadSeen,
  type SessionLine,
  type SessionLoad,
  type ShellReading,
  type SkillLoadFact,
} from "../core/skill-loads.ts";
import { planHasTickets } from "./changes.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { mainCheckout, sessionsHome } from "./git.ts";
import { worktreesOf } from "./situation.ts";
import {
  committedRecord,
  editsToKeep,
  shownPatchOwed,
  stoppedHere,
  stopsUncommitted,
  workingRecord,
} from "./hooks.ts";

/**
 * Where the skill loads land (J-116 S2; `../core/skill-loads.ts` reads them
 * from the event). A load happens before any record exists, at the
 * orientation, in frame's reading before the proposal, in a question turn,
 * on a resume, so every load is written first to the session's fact,
 * `.greenline/ledger/sessions/<date>-<session>.jsonl`, the main checkout's
 * for every worktree (J-215 S1), with the turn the
 * hooks number from each turn's start (the counter a working file under
 * `.greenline/tmp/sessions/` holds). When the session writes a change's
 * record, opening it or resuming it, the session names that change at that
 * turn, and the change's loads are the session's from that turn while its
 * record stays open, each appended to `.greenline/ledger/<id>/skills/<date>.jsonl`
 * with the step its record was in; a session that opens no change keeps its
 * loads as its own. A load goes to the change the branch holds open, the
 * session's naming deciding only where no one change stands open there
 * (J-135 S2). Both files are generated, append-only and output-free, and
 * `greenline tidy` removes neither; the sessions' folder carries its own
 * `.gitignore`, so a session's fact stays local to the clone, while the
 * change's file is committed with the change.
 */

const LEDGER = ".greenline/ledger";
/** The session facts' home, from the root. */
const SESSIONS_HOME: string = `${LEDGER}/sessions`;

/**
 * The sessions' facts' folder: the main checkout's for every worktree of
 * the repository (J-215 S1), as the sessions' working files stand in one
 * home (J-199 S1), so a session in the main checkout that works in a
 * worktree of the change's own keeps one fact, read alike from both.
 */
function sessionFactsHome(root: string): string {
  return join(mainCheckout(root), SESSIONS_HOME);
}

/** A session id as a file name takes it: letters, digits and dashes, at most 80 of them. */
function fileSafe(session: string): string | undefined {
  const safe = session.replaceAll(/[^A-Za-z0-9-]/g, "-").slice(0, 80);
  return /[A-Za-z0-9]/.test(safe) ? safe : undefined;
}

/** The turn counter's file: the turns counted and the last start's time. */
const TURN = z.object({ turn: z.number().int().min(0) });

/** The working file that counts a session's turns, one per session in the main checkout's sessions for every worktree (J-199 S1). */
function turnFile(root: string, safe: string): string {
  return join(sessionsHome(root), `${safe}.json`);
}

/**
 * The turn a session is in: the turns its starts counted, 0 before the first.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the turn, or null where the session cannot name a file
 */
function turnOf(root: string, session: string): number | null {
  const safe = fileSafe(session);
  if (safe === undefined) return null;
  try {
    const read = TURN.safeParse(parseJson(readFileSync(turnFile(root, safe), "utf8")));
    return read.success ? read.data.turn : 0;
  } catch {
    return 0;
  }
}

/**
 * A session id as a working file's name takes it.
 * @param session the harness's session id
 * @returns the name, or undefined where the id names no file
 */
export function sessionFileName(session: string): string | undefined {
  return fileSafe(session);
}

/**
 * The turn a session is in, as its starts counted it (J-129 S6 reads it for the picture note).
 * @param root the repository root
 * @param session the harness's session id
 * @returns the turn, 0 before the first, or null where the session names no file
 */
export function sessionTurn(root: string, session: string): number | null {
  return turnOf(root, session);
}

/**
 * Count a turn's start: the session's next turn.
 * @param root the repository root
 * @param session the harness's session id
 * @param at the event's time
 */
export function startTurn(root: string, session: string, at: string): void {
  const safe = fileSafe(session);
  const turn = turnOf(root, session);
  if (safe === undefined || turn === null) return;
  const path = turnFile(root, safe);
  mkdirSync(join(path, ".."), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify({ turn: turn + 1, at })}\n`);
}

/** The session's fact, the file it already has or one named by the day it starts. */
function sessionFactPath(root: string, safe: string, at: string): string {
  const home = sessionFactsHome(root);
  let names: readonly string[] = [];
  try {
    names = readdirSync(home);
  } catch {
    names = [];
  }
  const found = names.find(
    (entry) => /^\d{4}-\d{2}-\d{2}-/.test(entry) && entry.slice(11) === `${safe}.jsonl`,
  );
  return join(home, found ?? `${at.slice(0, 10)}-${safe}.jsonl`);
}

/**
 * A session's fact as it stands.
 * @param root the repository root
 * @param session the harness's session id
 * @returns its lines; none where it stands nowhere
 */
function sessionLines(root: string, session: string): readonly SessionLine[] {
  const safe = fileSafe(session);
  if (safe === undefined) return [];
  try {
    return parseSessionFact(readFileSync(sessionFactPath(root, safe, "0000-00-00"), "utf8"));
  } catch {
    return [];
  }
}

/**
 * The sessions' folder's own `.gitignore`, written where it is absent as a
 * session's fact is appended (J-135 S2): the folder's files, the ignore
 * file itself among them, are local, never committed and never swept by
 * `git clean -f`.
 */
function ignoreSessions(root: string): void {
  const path = join(sessionFactsHome(root), ".gitignore");
  if (existsSync(path)) return;
  mkdirSync(join(path, ".."), { recursive: true });
  atomicWriteFile(path, SESSIONS_GITIGNORE);
}

/** Append one line to a JSON Lines file, making its folder. */
function appendLine(path: string, value: SessionLine | SkillLoadFact): void {
  mkdirSync(join(path, ".."), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

/** A change's skills folder, from the root. */
function skillsFolder(id: string): string {
  return `${LEDGER}/${id}/skills`;
}

/**
 * Append loads to a change's folder, each in the file of its day, each load
 * once: a load its files already hold, as a rejoin from another hook wrote
 * it a moment before, is not appended again (J-205 S1), nor one another
 * hook appends at the same moment, the files read under its hold (J-208 S1).
 */
function appendToChange(root: string, id: string, loads: readonly SkillLoadFact[]): void {
  if (loads.length === 0) return;
  // The files read and appended to under one hold, so two hooks at once never append one load twice (J-208 S1).
  holdingLoads(root, id, () => {
    for (const load of loadsMissing(keptLoads(root, id), loads))
      appendLine(join(root, skillsFolder(id), `${load.at.slice(0, 10)}.jsonl`), load);
  });
}

/**
 * The file that holds a change's loads while one hook reads its files and
 * appends what they lack (J-208 S1, the run j196t-conduct-emptyc, whose two
 * reads 9 ms apart after the authorized reset each rejoined the same three
 * loads): a working file in the main checkout's sessions, local and never
 * committed, there only while a hook holds it.
 * @param root the repository root
 * @param id the change
 * @returns the lock file's path
 */
export function loadsLockPath(root: string, id: string): string {
  return join(sessionsHome(root), `loads-${id}.lock`);
}

/** How long a hook waits for another's hold on a change's loads before it appends unheld. */
const LOCK_WAIT_MS = 2000;
/** How old a hold is that a hook which died left behind, taken over. */
const LOCK_STALE_MS = 10_000;
const PAUSE = new Int32Array(new SharedArrayBuffer(4));

/**
 * Run an append to a change's loads while no other hook appends to them
 * (J-208 S1): the lock file made exclusively, waited for while another
 * hook holds it, taken over once a hold is stale, and removed after. Where
 * it cannot be made or the wait runs out, the append runs unheld, since a
 * load is never lost to a lock, and every reader keeps one fact per load.
 * Every pass of the wait, a lock whose stat fails among them, pauses and
 * meets the deadline (J-209 S1). The hold is best effort: two hooks that
 * find one hold stale may both take it over and both append, a duplicate
 * the readers' one fact per load covers.
 */
function holdingLoads(root: string, id: string, append: () => void): void {
  const path = loadsLockPath(root, id);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    for (;;) {
      try {
        closeSync(openSync(path, "wx"));
        held = true;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") break;
      }
      let age: number | undefined;
      try {
        age = Date.now() - statSync(path).mtimeMs;
      } catch {
        // Released between the two reads, or a path stat cannot follow, a dangling link among them (J-209 S1): the deadline bounds the wait.
        age = undefined;
      }
      if (age !== undefined && age > LOCK_STALE_MS) rmSync(path, { force: true });
      else if (Date.now() >= deadline) break;
      else Atomics.wait(PAUSE, 0, 0, 10);
    }
  } catch {
    // A sessions home greenline cannot write leaves the append unheld.
  }
  try {
    append();
  } finally {
    if (held) rmSync(path, { force: true });
  }
}

/** A change's loads as its folder's `skills/<date>.jsonl` files hold them, oldest first. */
function keptLoads(root: string, id: string): readonly SkillLoadFact[] {
  const folder = join(root, skillsFolder(id));
  let names: readonly string[];
  try {
    names = readdirSync(folder)
      .filter((name) => name.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
  return oldestFirst(
    names.flatMap((name) => {
      try {
        return parseChangeLoads(readFileSync(join(folder, name), "utf8"));
      } catch {
        return [];
      }
    }),
  );
}

/**
 * The loads the sessions' facts gave a change that its files lack (J-198
 * S1): a reset of the tree the owner authorized takes the loads noted since
 * the last commit from the change's committed files, while the sessions'
 * facts, local to the clone and ignored by git, keep them.
 */
function missingLoads(
  root: string,
  id: string,
  kept: readonly SkillLoadFact[],
): readonly SkillLoadFact[] {
  const home = sessionFactsHome(root);
  let names: readonly string[];
  try {
    names = readdirSync(home)
      .filter((name) => /^\d{4}-\d{2}-\d{2}-.+\.jsonl$/.test(name))
      .sort();
  } catch {
    return [];
  }
  const noted = names.flatMap((name) =>
    sessionLoadsOf(id, name.slice(11, -".jsonl".length), readSessionFact(join(home, name))),
  );
  return noted.length === 0 ? [] : loadsMissing(kept, noted);
}

/** The sessions' facts as last read, by path, with the size and time they were read at: the viewer reads every change's loads at once. */
const sessionFactCache = new Map<
  string,
  { readonly size: number; readonly mtimeMs: number; readonly lines: readonly SessionLine[] }
>();

/** A session's fact by its path, read again only once its file changed; none where it does not read. */
function readSessionFact(path: string): readonly SessionLine[] {
  try {
    const { size, mtimeMs } = statSync(path);
    const cached = sessionFactCache.get(path);
    if (cached !== undefined && cached.size === size && cached.mtimeMs === mtimeMs)
      return cached.lines;
    const lines = parseSessionFact(readFileSync(path, "utf8"));
    sessionFactCache.set(path, { size, mtimeMs, lines });
    return lines;
  } catch {
    return [];
  }
}

/**
 * A change's loads, oldest first: every `skills/<date>.jsonl` its folder
 * holds, and each load the sessions' facts gave it that those files lack,
 * as a reset of the tree leaves them (J-198 S1), each read the harness cut
 * settled into the load it cut (J-203 S1).
 * @param root the repository root
 * @param id the change
 * @returns the loads; none where neither holds any
 */
export function changeLoads(root: string, id: string): readonly SkillLoadFact[] {
  const kept = keptLoads(root, id);
  // One fact per load, where two hooks wrote the same load into the files (J-205 S1).
  return settledLoads(oldestFirst(onePerLoad([...kept, ...missingLoads(root, id, kept)])));
}

/**
 * A session's loads since a time, settled against the harness's cuts
 * (J-203 S1): the loads of the turn a request began, which the owes line
 * reads while no change is open.
 * @param root the repository root
 * @param session the harness's session id
 * @param since the request's time; a load at or after it counts
 * @returns the loads, oldest first
 */
export function sessionLoadsSince(
  root: string,
  session: string,
  since: string,
): readonly LoadSeen[] {
  const loads = sessionLines(root, session).flatMap((line) =>
    "change" in line || line.at < since ? [] : [line],
  );
  return settledLoads(oldestFirst(loads));
}

/**
 * Write back into a change's files the loads the sessions' facts gave it
 * that they lack (J-198 S1), so its facts at the close hold every load
 * noted for it across a reset of the tree the owner authorized. The hooks
 * call it as a load is noted in the change and as a session writes its
 * record. Never fails.
 * @param root the repository root
 * @param id the change
 */
function rejoinLoads(root: string, id: string): void {
  try {
    appendToChange(root, id, missingLoads(root, id, keptLoads(root, id)));
  } catch {
    // A fact greenline cannot write leaves the change's files as they stand; the read still joins them.
  }
}

/**
 * Whether a change's record stands held in the working tree, so a read made
 * now is the change's (J-189 S1): open; stopped, which a resume reopens;
 * a record whose front matter does not read, which the agent is correcting;
 * or done or dropped while HEAD's record says otherwise, its close or its
 * drop written and not yet committed. A record whose close HEAD holds holds
 * nothing, so a later question's reads stay the session's own.
 */
function heldRecord(root: string, id: string): boolean {
  const record = workingRecord(root, id);
  if (record === undefined) return false;
  if (!record.readable || record.state === "open" || record.state === "stopped") return true;
  if (record.state !== "done" && record.state !== "dropped") return false;
  return committedRecord(root, "HEAD", id)?.state !== record.state;
}

/**
 * The step a change's record is in, its current section: the step its "next"
 * line names, else the first step its mode runs whose section is not
 * written, as `greenline check` takes it; null where the record does not
 * read.
 */
function stepOf(
  root: string,
  id: string,
  line: (() => ModesDefinition | undefined) | undefined,
): string | null {
  const read = stepRead(root, id, line);
  return read.kind === "step" ? read.step : null;
}

/** How a record's step reads: a step, no record that reads, or every run step's section written. */
type StepRead =
  | { readonly kind: "step"; readonly step: string }
  | { readonly kind: "unread" }
  | { readonly kind: "written" };

/** The step a change's record is in, as {@link stepOf} reads it, telling a record that does not read from one written whole. */
function stepRead(
  root: string,
  id: string,
  line: (() => ModesDefinition | undefined) | undefined,
): StepRead {
  let text: string;
  try {
    text = readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    return { kind: "unread" };
  }
  const form = parseRecordForm(`${id}.md`, text);
  if (form._tag === "err") return { kind: "unread" };
  const named = nextStep(form.value.position);
  const definition = line?.();
  if (definition === undefined)
    return named === undefined ? { kind: "unread" } : { kind: "step", step: named };
  if (named !== undefined && definition.steps.some((step) => step.name === named))
    return { kind: "step", step: named };
  const plan = form.value.belongs?.plan;
  const tickets = plan !== undefined && planHasTickets(root, plan, definition);
  const station = lineStations(definition, form.value, recordPart(form.value, tickets)).find(
    (entry) => entry.runs && entry.state !== "written",
  );
  return station === undefined ? { kind: "written" } : { kind: "step", step: station.step };
}

/** The steps the classes a plan names count at (J-225 S1): until the build ends. */
const PLAN_STEPS: ReadonlySet<string> = new Set(["frame", "design", "plan", "anticipate", "build"]);

/**
 * Whether the classes a change's plan names still count toward what it
 * owes (J-225 S1): while its record's step is frame, design, plan,
 * anticipate or build, and on a record with no step, a fresh skeleton's
 * that does not yet read, as at frame; from review on, and once every run
 * step's section is written, the touched files alone hold.
 * @param root the repository root
 * @param id the change
 * @param line the modes definition, read where the record names no step
 * @returns true until the build ends
 */
export function planCounts(
  root: string,
  id: string,
  line: (() => ModesDefinition | undefined) | undefined,
): boolean {
  const read = stepRead(root, id, line);
  if (read.kind === "unread") return true;
  return read.kind === "step" && PLAN_STEPS.has(read.step);
}

/**
 * The step a change's record is in, as the loads note it (J-134 S3 reads it
 * for the habits a build owes).
 * @param root the repository root
 * @param id the change
 * @param line the modes definition, read only where the record names no step
 * @returns the step, or null where the record does not read
 */
export function recordStep(
  root: string,
  id: string,
  line: (() => ModesDefinition | undefined) | undefined,
): string | null {
  return stepOf(root, id, line);
}

/** A path from the root, `/`-separated; undefined outside the repository. */
function fromRootOf(root: string, path: string): string | undefined {
  const relation = relative(root, path);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) return undefined;
  return relation.split(sep).join("/");
}

/** The paths the installation placed, from the lock; none when it cannot be read. */
export function installedPaths(root: string): ReadonlySet<string> {
  try {
    const lock = parseLock(
      readFileSync(join(root, ".greenline", "lock.json"), "utf8"),
      ".greenline/lock.json",
    );
    return lock._tag === "ok" ? new Set(lock.value.files.keys()) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * The loads a tool call makes in a workspace: its sightings read against the
 * lock's paths and the files' lines.
 * @param root the repository root
 * @param event the normalised event
 * @param base the directory the session stands in
 * @param reading the shell that runs a shell line, or the words it refused (J-207 S1)
 * @returns the loads; none where the call reads no roster file
 */
export function loadsOfEvent(
  root: string,
  event: NormalisedEvent,
  base: string,
  reading: ShellReading = {},
): readonly LoadSeen[] {
  // A call that names no skill and no path under a skills folder reads no lock.
  const sightings = sightingsOf(event, base, reading).filter(
    (sighting) => sighting.kind === "skill" || sighting.path.includes(`${sep}skills${sep}`),
  );
  if (sightings.length === 0) return [];
  const installed = installedPaths(root);
  return loadsOf(sightings, {
    fromRoot: (path) => fromRootOf(root, path),
    installed: (path) => installed.has(path),
    lines: (path) => {
      try {
        return lineCount(readFileSync(join(root, path), "utf8"));
      } catch {
        return undefined;
      }
    },
  });
}

/**
 * The checkout a change's record stands held in (J-215 S1): the root's own,
 * else a linked worktree of the repository whose working tree holds it, the
 * change's own worktree, so a session in the main checkout that works there
 * notes its loads where the change's folder is; undefined where none does.
 * @param root the repository root the hook reads
 * @param id the change
 * @returns the checkout's root, or undefined
 */
function heldCheckout(root: string, id: string): string | undefined {
  if (heldRecord(root, id)) return root;
  const here = resolve(root);
  for (const entry of worktreesOf(root)) {
    if (resolve(entry.path) === here || !existsSync(join(entry.path, ".git"))) continue;
    if (heldRecord(entry.path, id)) return entry.path;
  }
  return undefined;
}

/** The change a session's naming gives its loads, and the checkout its record stands held in: the latest it named. */
function boundChange(
  root: string,
  lines: readonly SessionLine[],
): { readonly id: string; readonly home: string } | undefined {
  for (const line of [...lines].reverse())
    if ("change" in line) {
      const home = heldCheckout(root, line.change);
      return home === undefined ? undefined : { id: line.change, home };
    }
  return undefined;
}

/** What a tool call's loads are noted with. */
export interface LoadNote {
  readonly root: string;
  readonly event: NormalisedEvent;
  readonly loads: readonly LoadSeen[];
  /** The change the branch belongs to, which takes the loads while its record stands open (J-135 S2). */
  readonly branchChange: string | undefined;
  /** The modes definition, read only when a load meets a change's record, for the step. */
  readonly line: (() => ModesDefinition | undefined) | undefined;
  /**
   * The step a fresh agent serves in a change, from the brief it was
   * started with (J-207 S1); undefined where none is known, and the
   * record's step is taken.
   */
  readonly agentStep?: ((change: string, agent: string) => string | undefined) | undefined;
}

/**
 * Note a tool call's loads: in the session's fact, and in the change the
 * branch holds open (J-135 S2), or, where no one change stands open there,
 * in the change the session named while its record stands open.
 * @param note the call, its loads and where they may go
 */
export function noteLoads(note: LoadNote): void {
  const { root, event, loads } = note;
  if (loads.length === 0) return;
  const session = event.session === null ? undefined : event.session;
  const safe = session === undefined ? undefined : fileSafe(session);
  const turn = session === undefined ? null : turnOf(root, session);
  const branch =
    note.branchChange !== undefined && heldRecord(root, note.branchChange)
      ? { id: note.branchChange, home: root }
      : undefined;
  // The change's folder is where its record stands held, a worktree of its own among them (J-215 S1).
  const bound =
    branch ??
    (session === undefined || safe === undefined
      ? undefined
      : boundChange(root, sessionLines(root, session)));
  const change = bound?.id;
  const home = bound?.home ?? root;
  // A fresh agent's load is at the step its brief names, the reviewer's at review while the record still reads build (J-207 S1).
  const served =
    change === undefined || event.agent === null
      ? undefined
      : note.agentStep?.(change, event.agent);
  const step = change === undefined ? null : (served ?? stepOf(home, change, note.line));
  const facts = loads.map((load) => ({
    ...load,
    at: event.at,
    step,
    agent: event.agent,
    turn,
  }));
  // What a reset took from the change's files comes back before this call's loads join both (J-198 S1).
  if (change !== undefined) rejoinLoads(home, change);
  if (safe !== undefined) {
    ignoreSessions(root);
    for (const fact of facts)
      appendLine(sessionFactPath(root, safe, event.at), { ...fact, noted: change ?? null });
  }
  if (change !== undefined) {
    appendToChange(
      home,
      change,
      facts.map((fact) => ({ ...fact, session: session ?? null })),
    );
  }
}

/** The marker a call's before-tool event leaves once it noted the call's loads, named by the call's id; undefined where the id names no file. */
function loadsNotedPath(root: string, call: string | null): string | undefined {
  if (call === null) return undefined;
  const safe = call.replaceAll(/[^A-Za-z0-9_-]/g, "-").slice(0, 120);
  return /[A-Za-z0-9]/.test(safe)
    ? join(sessionsHome(root), "calls", `${safe}.loads.json`)
    : undefined;
}

/**
 * Mark a call's loads noted at its before-tool event, before they are
 * noted (J-225 S1), so its after-tool event notes them only where this
 * event never reached them, and a noting cut part way is not noted twice: a working
 * file in the main checkout's sessions, named by the call, taken away by
 * the after-tool event. Never fails.
 * @param root the repository root
 * @param call the call's id, null where the harness names none
 */
export function markLoadsNoted(root: string, call: string | null): void {
  const path = loadsNotedPath(root, call);
  if (path === undefined) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    atomicWriteFile(path, "{}\n");
  } catch {
    // A mark greenline cannot write leaves the after-tool event to note the read again, a second fact the error line beside it explains.
  }
}

/**
 * Whether a call's before-tool event noted its loads (J-225 S1), the mark
 * taken away as it is read; undefined where the harness names no call, so
 * no read is noted twice for want of a key.
 * @param root the repository root
 * @param call the call's id, null where the harness names none
 * @returns true where the before-tool event noted them, false where it did not, undefined with no call
 */
export function takeLoadsNoted(root: string, call: string | null): boolean | undefined {
  const path = loadsNotedPath(root, call);
  if (path === undefined) return undefined;
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

/**
 * Write one line to the session's raw log, `.greenline/tmp/sessions/<session>.log.jsonl`
 * in the main checkout, a working file no commit carries (J-225 S1): an
 * error caught while a load is noted, in place of silence. Never fails.
 * @param root the repository root
 * @param session the harness's session id, null outside a session
 * @param line the line's kind, its time, the call and the message
 */
export function logSessionError(
  root: string,
  session: string | null,
  line: {
    readonly kind: string;
    readonly at: string;
    readonly call: string | null;
    readonly message: string;
  },
): void {
  const safe = session === null ? undefined : fileSafe(session);
  if (safe === undefined) return;
  try {
    const path = join(sessionsHome(root), `${safe}.log.jsonl`);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ v: 1, ...line })}\n`);
  } catch {
    // A log greenline cannot write leaves the error unsaid, as before.
  }
}

/** A record's path from the root, `.greenline/ledger/<id>.md`, read for its id. */
const RECORD = /^\.greenline\/ledger\/([^/]+)\.md$/;

/**
 * The changes whose records a write-class tool writes, by their paths.
 * @param root the repository root
 * @param paths the tool's paths as the harness gave them
 * @param base the directory the session stands in
 * @returns the change ids, each once
 */
export function recordsWritten(
  root: string,
  paths: readonly string[],
  base: string,
): readonly string[] {
  const ids = paths.flatMap((path) => {
    const where = fromRootOf(root, isAbsolute(path) ? path : join(base, path));
    const id = where === undefined ? undefined : RECORD.exec(where)?.[1];
    return id !== undefined && CHANGE_ID.test(id) ? [id] : [];
  });
  return [...new Set(ids)];
}

/**
 * The session names a change whose record it writes, opening it or resuming
 * it, unless the change it named last is this one: from then on the
 * session's loads are the change's, and the loads it noted for no change
 * since it last named one join it, so the orientation, frame's reading
 * before the proposal and the turns before the owner's yes belong to the
 * change the request opened.
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change whose record the session writes
 * @param at the event's time
 */
export function nameChange(root: string, session: string, change: string, at: string): void {
  const safe = fileSafe(session);
  if (safe === undefined) return;
  const lines = sessionLines(root, session);
  const named = lines.findLastIndex((line) => "change" in line);
  const last = lines[named];
  if (last !== undefined && "change" in last && last.change === change) {
    // The record written again, at a close after a reset among others: its files take back what the sessions noted (J-198 S1).
    rejoinLoads(root, change);
    return;
  }
  ignoreSessions(root);
  appendLine(sessionFactPath(root, safe, at), { change, turn: turnOf(root, session), at });
  const joining = lines
    .slice(named + 1)
    .flatMap((line): readonly SkillLoadFact[] =>
      "change" in line || line.noted !== null ? [] : [{ ...withoutNoted(line), session }],
    );
  appendToChange(root, change, joining);
  rejoinLoads(root, change);
}

/**
 * The changes a session named during its current turn by writing their
 * records (J-151 S2), so a change the turn opened and closed is read as the
 * turn's close.
 * @param root the repository root
 * @param session the harness's session id
 * @returns the changes, each once, in the order named
 */
export function changesNamedThisTurn(root: string, session: string): readonly string[] {
  const turn = turnOf(root, session);
  if (turn === null) return [];
  const named = sessionLines(root, session).flatMap((line) =>
    "change" in line && line.turn === turn ? [line.change] : [],
  );
  return [...new Set(named)];
}

/** One session's fact as a change's owed words read it: its file name, its namings and the changes its loads went to. */
export interface SessionNamings {
  /** The session's id as its files are named. */
  readonly session: string;
  readonly namings: readonly {
    readonly change: string;
    readonly turn: number | null;
    readonly at: string;
  }[];
  /** The changes the session's loads were noted in. */
  readonly noted: ReadonlySet<string>;
}

/**
 * The sessions that worked on a change (J-189 S1): each session's fact
 * that names the change by writing its record or noted a load in it, with
 * its namings, oldest first.
 * @param root the repository root
 * @param id the change
 * @returns the sessions
 */
export function sessionsOf(root: string, id: string): readonly SessionNamings[] {
  const home = sessionFactsHome(root);
  let names: readonly string[];
  try {
    names = readdirSync(home).filter((name) => /^\d{4}-\d{2}-\d{2}-.+\.jsonl$/.test(name));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    let lines: readonly SessionLine[];
    try {
      lines = parseSessionFact(readFileSync(join(home, name), "utf8"));
    } catch {
      return [];
    }
    const namings = lines.flatMap((line) => ("change" in line ? [line] : []));
    const noted = new Set(
      lines.flatMap((line) => ("change" in line || line.noted === null ? [] : [line.noted])),
    );
    return namings.some((line) => line.change === id) || noted.has(id)
      ? [{ session: name.slice(11, -".jsonl".length), namings, noted }]
      : [];
  });
}

/** A turn counter's file as the latest session is read from it: the turns counted and the last start's time. */
const COUNTED = z.object({ turn: z.number().int().min(0), at: z.string() });

/**
 * The session whose turn started last in the checkout, read from the turn
 * counters in the main checkout's sessions, for a reader that runs in no
 * session, as `greenline status` does.
 * @param root the repository root
 * @returns the session's file name, or undefined where no turn was counted
 */
export function latestSession(root: string): string | undefined {
  const home = sessionsHome(root);
  let names: readonly string[];
  try {
    names = readdirSync(home).filter((name) => /^[A-Za-z0-9-]+\.json$/.test(name));
  } catch {
    return undefined;
  }
  let latest: { readonly session: string; readonly at: string } | undefined;
  for (const name of names) {
    try {
      const read = COUNTED.safeParse(parseJson(readFileSync(join(home, name), "utf8")));
      if (read.success && (latest === undefined || read.data.at > latest.at))
        latest = { session: name.slice(0, -".json".length), at: read.data.at };
    } catch {
      // A counter that does not read names no session.
    }
  }
  return latest?.session;
}

/**
 * Whether a change's record reads stopped while the session that wrote it
 * goes on (J-200 S1, the run j196t-states-stop-2): the session named the
 * change by writing its record at a turn before the one it is in now, so the
 * stop was written in a session that still holds the change, where a wait
 * leaves the record open. The session is the one given, or, for a reader in
 * no session, the one whose turn started last; a fresh session's resume and
 * the stop's own turn read false. A stopped line that holds the owner's
 * stop, as git's pre-commit reads it against the session's journal
 * (`stopNotHeld`), reads false too: the owner ended the work, and the
 * session holds no stop of its own (J-228 S1, the run j217c-conduct-runner,
 * whose record quoted the owner's "Stop there; we build it another day.").
 * @param root the repository root
 * @param id the change
 * @param session the harness's session id, null for the session whose turn started last
 * @param journal the session's journaled messages of the owner, by its id (`ownerJournal`)
 * @returns true where the record reads stopped and the session holds it still
 */
function stoppedInSession(
  root: string,
  id: string,
  session: string | null,
  journal: (session: string) => OwnerJournal,
): boolean {
  const record = workingRecord(root, id);
  if (record?.state !== "stopped") return false;
  const named = session === null ? latestSession(root) : fileSafe(session);
  if (named === undefined) return false;
  const turn = turnOf(root, named);
  if (turn === null) return false;
  // A stopped line that holds the owner's stop, by the door's reading, is the owner's stop and no held one (J-228 S1).
  if (stopNotHeld(record.stopped, journal(session ?? named)) === undefined) return false;
  return sessionsOf(root, id).some(
    (each) =>
      each.session === named &&
      each.namings.some(
        (naming) => naming.change === id && naming.turn !== null && naming.turn < turn,
      ),
  );
}

/**
 * The line the mirror and status print for a record stopped while the
 * session that wrote it goes on (J-200 S1), undefined where none is; where
 * the owner's message of the turn answers it, the line says so (J-205 S1).
 * @param root the repository root
 * @param id the change, undefined where none stands open or stopped here
 * @param session the harness's session id, null for the session whose turn started last
 * @param journal the session's journaled messages of the owner, by its id (`ownerJournal`), read against the stopped line (J-228 S1)
 * @param words the owner's message of the turn, undefined where none stands
 * @returns the line, unindented
 */
export function stoppedHeldText(
  root: string,
  id: string | undefined,
  session: string | null,
  journal: (session: string) => OwnerJournal,
  words?: string,
): string | undefined {
  if (id === undefined || !stoppedInSession(root, id, session, journal)) return undefined;
  const record = workingRecord(root, id);
  return stoppedHeldLine(id, record?.stopped, recordAnswer(record, words));
}

/**
 * The stop's commit the mirror and status name (J-210 S1, the run
 * j196t-states-stop-2c): one line for each record that reads stopped while
 * no commit holds the stop, until the commit stands, undefined where none
 * does. A record the owner's message of the turn answers or resumes
 * (`answersRecord`, J-205 S1, J-214 S1) owes none: its first write sets it
 * open. Where the tree holds uncommitted edits outside the folder and the
 * folder no shown patch, the line names them and the patch the stop keeps
 * (J-214 S1, `editsToKeep`).
 * @param root the repository root
 * @param words the owner's message of the turn, undefined where none stands
 * @param ids the changes to read, every record the working tree holds where none are given
 * @returns the lines, unindented and joined, or undefined
 */
export function stopCommitText(
  root: string,
  words: string | undefined,
  ids?: readonly string[],
): string | undefined {
  const owed = stopsUncommitted(root, ids).filter(
    (id) => !answersRecord(workingRecord(root, id), words),
  );
  return owed.length === 0
    ? undefined
    : owed.map((id) => stopCommitLine(id, editsToKeep(root, id))).join("\n");
}

/**
 * The wait of the one change stopped here, while the branch names no change
 * of its own (J-149 S3), read beside the owner's message of the turn
 * (J-205 S1, J-214 S1), the folder's shown patch named where the checkout
 * lacks its edits (`shownPatchOwed`); the mirror and `greenline status`
 * print it alike.
 * @param root the repository root
 * @param words the owner's message of the turn, undefined where none stands
 * @returns the line, unindented, or undefined where no one change stopped here waits on the owner
 */
export function stoppedWaitText(root: string, words: string | undefined): string | undefined {
  const id = stoppedHere(root);
  const record = id === undefined ? undefined : workingRecord(root, id);
  return id === undefined || record === undefined
    ? undefined
    : waitingLine(record, id, words, shownPatchOwed(root, id));
}

/**
 * The change a session holds by writing its record (J-202 S1): the change
 * its latest naming names, at any turn, so a change the session closed is
 * still the one it holds at the owner's next words. The session is the one
 * given, or, for a reader in no session, the one whose turn started last.
 * @param root the repository root
 * @param session the harness's session id, null for the session whose turn started last
 * @returns the change, or undefined where the session named none
 */
export function sessionChange(root: string, session: string | null): string | undefined {
  const named = session === null ? latestSession(root) : session;
  if (named === undefined) return undefined;
  const namings = sessionLines(root, named).flatMap((line) =>
    "change" in line ? [line.change] : [],
  );
  return namings.at(-1);
}

/** A session's load as the change's folder keeps it, without the change it was noted in. */
function withoutNoted(load: SessionLoad): Omit<SessionLoad, "noted"> {
  const { noted: _noted, ...rest } = load;
  return rest;
}

/*
 * The running surface a session's hook reads (J-151 S1): the hook payload's
 * permission mode and the session's source, which the first line of the
 * transcript the payload names records on Codex, choose the adapters' row;
 * the turn's start notes the row under the session's id, so `greenline
 * status` and the viewer, which run in no session, print the row the last
 * turn's start read. The note stands under the sessions home, the main
 * checkout's, as every other session note does, so a linked worktree's git
 * hooks read the model the session reported (J-226 S1; j217t-ground
 * finding 2).
 */

/** A surface note's suffix after the session's file name. */
const SUFFIX = ".surface.json";

/** The payload's permission mode, where it names one. */
const PERMISSION_MODE = z.object({ permission_mode: z.string().min(1) });
/** The transcript the payload names, where it names one. */
const TRANSCRIPT = z.object({ transcript_path: z.string().min(1) });

/** How much of a transcript's start is read for its first line, which a Codex rollout fills with the session's instructions. */
const HEAD_CAP = 1024 * 1024;
const CHUNK = 64 * 1024;

/** A file's first line, read a chunk at a time up to the cap; undefined where it cannot be read or runs past the cap. */
function firstLine(path: string): string | undefined {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    const chunks: Buffer[] = [];
    let length = 0;
    while (length < HEAD_CAP) {
      const buffer = Buffer.alloc(CHUNK);
      const read = readSync(descriptor, buffer, 0, CHUNK, length);
      if (read === 0) break;
      const end = buffer.subarray(0, read).indexOf(0x0a);
      if (end !== -1) {
        chunks.push(buffer.subarray(0, end));
        return Buffer.concat(chunks).toString("utf8");
      }
      chunks.push(buffer.subarray(0, read));
      length += read;
    }
    return length < HEAD_CAP ? Buffer.concat(chunks).toString("utf8") : undefined;
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * The surface a hook reads as running from the session's payload (J-151
 * S1): on Codex the payload's permission mode and the source the first line
 * of the transcript it names records; on every other harness its first row.
 * @param harness the harness the adapter names
 * @param payload the hook's payload as parsed
 * @param base the directory a relative transcript path resolves from
 * @returns the row
 */
export function sessionSurface(harness: Harness, payload: JsonValue, base: string): SurfaceFacts {
  if (harness !== "codex") return runningSurface(harness);
  const mode = PERMISSION_MODE.safeParse(payload);
  const transcript = TRANSCRIPT.safeParse(payload);
  const line = transcript.success
    ? firstLine(resolve(base, transcript.data.transcript_path))
    : undefined;
  return runningSurface(harness, {
    permissionMode: mode.success ? mode.data.permission_mode : undefined,
    source: line === undefined ? undefined : codexSessionSource(line),
  });
}

/**
 * A surface note: the row's harness and surface, read back against the
 * table, with the model the harness's payload named and the transcript it
 * pointed at, where it did, from which git's hooks and status read the
 * model the session runs on (J-192 S1).
 */
const NOTE = z.object({
  harness: z.string(),
  surface: z.string(),
  model: z.string().optional().catch(undefined),
  transcript: z.string().optional().catch(undefined),
});

/** What a session's start says of the model: the payload's model, and the transcript's absolute path, where each is given. */
export interface SessionModelFacts {
  readonly model?: string | undefined;
  readonly transcript?: string | undefined;
}

/**
 * Note the surface a session's turn start read, for status and the viewer,
 * with the model facts its payload gave (J-192 S1). A note greenline cannot
 * write leaves them reading the harness's first row and no model.
 * @param root the repository root
 * @param session the harness's session id
 * @param row the row read
 * @param model the payload's model and the transcript's path, where given
 */
export function noteSurface(
  root: string,
  session: string,
  row: SurfaceFacts,
  model: SessionModelFacts = {},
): void {
  const safe = sessionFileName(session);
  if (safe === undefined) return;
  const path = join(sessionsHome(root), `${safe}${SUFFIX}`);
  try {
    mkdirSync(dirname(path), { recursive: true });
    atomicWriteFile(
      path,
      `${JSON.stringify({ harness: row.harness, surface: row.surface, ...model })}\n`,
    );
  } catch {
    // A note greenline cannot write leaves the first row read.
  }
}

/** How much of a transcript's end is read for the model it last names. */
const TRANSCRIPT_TAIL = 512 * 1024;

/**
 * The model a session's transcript last names, read from its end (J-143
 * S2): a Codex rollout's turn context or a Claude Code assistant message.
 * @param path the transcript's absolute path
 * @returns the model, or undefined where the file names none or does not read
 */
export function transcriptTailModel(path: string): string | undefined {
  let descriptor: number | undefined;
  try {
    const size = statSync(path).size;
    descriptor = openSync(path, "r");
    const length = Math.min(size, TRANSCRIPT_TAIL);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, size - length);
    return transcriptModel(buffer.toString("utf8").split("\n"));
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * The model the harness reports for its newest session here (J-192 S1),
 * which the record's agent line names: the model the newest note of that
 * harness carries, else the one its transcript last names; undefined where
 * no note of the harness stands or it names no model, so a harness that
 * reports none leaves the agent line as written. Git's hooks and status,
 * which run in no session, read it.
 * @param root the repository root
 * @param harness the harness the agent line names
 * @returns the harness and its model, or undefined
 */
export function reportedModel(root: string, harness: string): ReportedModel | undefined {
  const home = sessionsHome(root);
  let names: readonly string[];
  try {
    names = readdirSync(home);
  } catch {
    return undefined;
  }
  const notes = names.flatMap((name) => {
    if (!name.endsWith(SUFFIX) || name.startsWith(".")) return [];
    try {
      const path = join(home, name);
      const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
      return read.success && read.data.harness === harness
        ? [{ note: read.data, at: statSync(path).mtimeMs }]
        : [];
    } catch {
      return [];
    }
  });
  const newest = notes.sort((a, b) => b.at - a.at)[0]?.note;
  if (newest === undefined) return undefined;
  const model =
    newest.model ??
    (newest.transcript === undefined ? undefined : transcriptTailModel(newest.transcript));
  return model === undefined ? undefined : { harness, model };
}

/** The row a surface note names, where it names a row of the table. */
function noteRow(path: string): SurfaceFacts | undefined {
  try {
    const read = NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success && isHarness(read.data.harness)
      ? surfaceRow(read.data.harness, read.data.surface)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The row the newest surface note names for a harness, where one does. */
function newestNote(root: string, harness: Harness): SurfaceFacts | undefined {
  const home = sessionsHome(root);
  let names: readonly string[];
  try {
    names = readdirSync(home);
  } catch {
    return undefined;
  }
  const notes = names.flatMap((name) => {
    if (!name.endsWith(SUFFIX) || name.startsWith(".")) return [];
    try {
      return [{ path: join(home, name), at: statSync(join(home, name)).mtimeMs }];
    } catch {
      return [];
    }
  });
  for (const note of notes.sort((a, b) => b.at - a.at)) {
    const row = noteRow(note.path);
    if (row?.harness === harness) return row;
  }
  return undefined;
}

/**
 * The surface status and the viewer print for a harness, which run in no
 * session: the row the newest note of that harness names, the row its last
 * turn's start read, else the harness's first row.
 * @param root the repository root
 * @param harness the harness
 * @returns the row
 */
export function notedSurface(root: string, harness: Harness): SurfaceFacts {
  return newestNote(root, harness) ?? runningSurface(harness);
}
