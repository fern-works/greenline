import { lockedChanged, lockRefusal, patchWrite, textAfter } from "../../core/design-lock.ts";
import { DESIGN_FILE } from "../../core/design-file.ts";
import { unlocks } from "../../core/record-interface.ts";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  adapterInstructions,
  isHarness,
  runningSurface,
  type Harness,
  type SurfaceFacts,
} from "../../core/adapters.ts";
import { matchedCheck, ROOT_DIR, type DeclaredCheck } from "../../core/checks.ts";
import { parseJson, type JsonValue } from "../../core/contract.ts";
import {
  afterToolOutput,
  contextOutput,
  inHomes,
  isEventKind,
  namesItsAgents,
  normaliseEvent,
  takesAfterToolContext,
  takesContextAt,
  type EventKind,
  type NormalisedEvent,
} from "../../core/event.ts";
import { cardsNoteLine, mirrorMissed, noteCards, noteMirrorDelivered } from "../cards-note.ts";
import { frameUnconfirmedAt, noteFrameActing, noteFrameAsk } from "../frame-ask.ts";
import { heldLandingText, noteLandingOffer, withheldMerge } from "../landing.ts";
import { rabbitholeNudge } from "../rabbithole.ts";
import {
  cardAnswers,
  journalOwner,
  noteOwnerWords,
  ownerJournal,
  ownerWords,
  turnWords,
  yesJournal,
} from "../owner-words.ts";
import { dealWordsRefusal, namesReroll } from "../../core/deal-ask.ts";
import { keptDealAsk } from "../deal-view.ts";
import { pickFromWords } from "../inspect/interface.ts";
import { yesNotHeld } from "../../core/record-lines.ts";
import { ownersOwnWords } from "../../core/habits-owed.ts";
import {
  hookRunFileName,
  parseChecksFile,
  serializeHookRun,
  type CheckFacts,
  type HookRun,
} from "../../core/facts.ts";
import {
  changeOfBranch,
  holdsNoChange,
  noChangeReason,
  recordPath,
  ruled,
  standingReason,
  type BranchChange,
  type BranchFacts,
  type ProceedSetting,
} from "../../core/git-hooks.ts";
import {
  agentsCounted,
  checkStandings,
  mirrorText,
  startMissedLine,
  type MirrorInput,
} from "../../core/mirror.ts";
import { MARKED_LABEL, unmarkedCards } from "../../core/reply-forms.ts";
import { factsOf, progressOf } from "../facts-table.ts";
import {
  agentPromptOf,
  agentStarter,
  helpersLine,
  launchProvenance,
  methodAgents,
  methodOfStart,
  rolloutSpawns,
  servedOfStart,
  servedStep,
  type AgentLine,
  type HelperStart,
  type Provenance,
} from "../../core/method-agents.ts";
import { marksLine } from "../../core/marks.ts";
import { openMarks, readMarksFiles } from "../marks.ts";
import { groundLine, groundSettingLine, payloadModel, predatesLine } from "../../core/ground.ts";
import type { ModesDefinition } from "../../core/modes.ts";
import { recordIds } from "../changes.ts";
import {
  openElsewhereText,
  orientationText,
  predatingText,
  remoteText,
} from "../../core/situation.ts";
import {
  openInWorktrees,
  readOrientation,
  readPredating,
  readRemote,
  worktreesOf,
} from "../situation.ts";
import {
  installedPaths,
  notedSurface,
  noteSurface,
  sessionChange,
  sessionSurface,
  transcriptTailModel,
  type SessionModelFacts,
} from "../skill-loads.ts";
import { NO_PROCEED, type Manifest } from "../../core/manifest.ts";
import type { RecordFacts } from "../../core/git-hooks.ts";
import { headCommit, workingTreeId } from "../code-tree.ts";
import { atomicWriteFile } from "../fs/io.ts";
import { commonGitDirectory, findGitRoot } from "../git.ts";
import {
  checksFolder,
  committedRecord,
  gitHooksState,
  hooksNotInstalled,
  lockedRevision,
  branchFacts,
  merging,
  predatingBranch,
  recordFinished,
  shownPatchOwed,
  stoppedHere,
  workingRecord,
  workspaceManifest,
} from "../hooks.ts";
import {
  changeVisualsFolder,
  closePinLine,
  LINKS_FILE,
  NO_REMAKE_OFFER,
} from "../../core/visuals.ts";
import type { ShellWrites } from "../interface-check.ts";
import { interfaceRootOf } from "../../core/interface-detection.ts";
import {
  declaredComponents,
  interfaceLine,
  parseInterfaceFact,
} from "../../core/interface-fact.ts";
import { checksOfChange } from "../../core/interface-check.ts";
import { readInterfaceRulings } from "../interface.ts";
import {
  designPickMirrorLine,
  findingsAfterWrite,
  interfaceChecksMirrorLine,
  renderMirrorLine,
  writtenByShell,
} from "../interface-check.ts";
import {
  guardOf,
  ledgerRefusalOf,
  ledgerShellRefusalOf,
  syncRefusal,
  writtenIn,
} from "../guard.ts";
import { noteHooksShown } from "../sync-ask.ts";
import { shellWrites as wordsWritten } from "../../core/guardrails.ts";
import { hiddenWriteLine, inChangeVisuals } from "../../core/ledger-files.ts";
import { noteLifts } from "../lifts.ts";
import {
  backgroundStarts,
  killActs,
  killRefusal,
  sessionPids,
  startedRows,
  startsInspector,
  tidyChangeOf,
} from "../../core/processes.ts";
import {
  allStarted,
  inspectorRow,
  noteServedInspector,
  noteStarted,
  ownPids,
  processTable,
} from "../processes.ts";
import {
  atlasLineOf,
  docsLineOf,
  keepChangeDocuments,
  manifestFilesRefusal,
  keepDocuments,
  reachingVisuals,
  readDocuments,
  readDrift,
  recordMakers,
  recordReaches,
  repinChangeVisuals,
  sessionMadeVisuals,
  writeChangeLinks,
} from "../visuals.ts";
import { pictureLine, promptTextOf, replyTextOf } from "../../core/pictures.ts";
import {
  closingChange,
  currentTurnStart,
  lastTurnStartedAt,
  notePictures,
  noteReplyOwed,
  noteTurnStart,
  readPictureNote,
  readReplyOwed,
  replyLacksLines,
} from "../pictures.ts";
import { firstCodeWrite, noteSeen, proposalLines } from "../habits-owed.ts";
import { recordHintsLine, reportNonceNotice } from "../record-hints.ts";
import { lackingLine, recordLack } from "../../core/record-lines.ts";
import type { Installation } from "../../core/installation.ts";
import { writeFrameMap } from "../frame-map.ts";
import { discussionsLine, discussionsReport } from "../../core/discussion.ts";
import { listDiscussions } from "../discussions.ts";
import {
  changesNamed,
  cutLoads,
  loadsLine,
  rosterNamesOf,
  shellDirectories,
  skillFileOf,
  unrunLoads,
  type LoadSeen,
  type ShellReading,
} from "../../core/skill-loads.ts";
import {
  changeLoads,
  loadsOfEvent,
  logSessionError,
  markLoadsNoted,
  nameChange,
  noteLoads,
  recordStep,
  recordsWritten,
  startTurn,
  stopCommitText,
  stoppedHeldText,
  stoppedWaitText,
  takeLoadsNoted,
} from "../skill-loads.ts";
import type { CliWriter } from "./output.ts";

/**
 * `greenline event [<kind>] --harness <name> [--native <event>]`
 * (`docs/SPEC.md` §4): the one entry point every harness adapter pipes its
 * events into, the harness's JSON on stdin. It normalises the event, appends
 * it to the open change's raw log, `.greenline/tmp/<id>/events.jsonl`, in
 * the checkout the tool call acts in, a worktree of the change's own among
 * them (J-215 S1, `actingCheckout`),
 * matches a shell command against the declared checks and writes a matched
 * run whole as a hook-recorded run beside the change's check facts, prints
 * the status mirror at a session's and a turn's start, keeps the change's
 * links file to its visuals, `.greenline/ledger/<id>/visuals.json`, after
 * each tool (J-110 S1), and refuses two acts: a write-class tool's path
 * outside the homes while the record lacks the owner's yes, a `standing`
 * choice the manifest's `proceed` does not admit lacking it, or while no
 * change is open on the branch HEAD names (J-102 S1), each path judged in
 * the repository it stands in, a worktree of the change's own among them;
 * and, before a shell command runs, a git command the guardrails refuse
 * where it runs unless the record's line lifts it (J-114 S3,
 * `src/shell/guard.ts`). Before a tool runs, it notes each roster skill the
 * call loads, the Skill tool's, a reading tool's or a shell read's, in the
 * session's fact and in the change the session opened or resumed by
 * writing its record (J-116 S2, `../skill-loads.ts`), counting each turn's
 * start for the loads' turn. It exits 2 with one line to refuse, and 0 otherwise, on its own error
 * and without a workspace included, so greenline never stops a tool by
 * failing.
 */

/** Where the command runs, its stdin, and the clock and file names a test may fix. */
export interface EventEnvironment {
  readonly cwd: string;
  /** The harness's JSON, read whole. */
  readonly stdin: () => string;
  readonly now?: () => Date;
  readonly factsFile?: (startedAt: string) => string;
  /** The modes definition's modes in order, fastest first, read only when a standing choice's mode is not the one `proceed` names; undefined when they cannot be read. */
  readonly modes?: () => readonly string[] | undefined;
  /** The modes definition, read only when a turn's start finds a change with its record, for the mirror's progress line; undefined when it cannot be read. */
  readonly line?: () => ModesDefinition | undefined;
  /** The installation, read at a turn's start for the situation and the skills owed (J-176 S1); undefined when it cannot be read. */
  readonly installation?: () => Installation | undefined;
  /**
   * Whether zsh runs the harness's shell lines, read from the environment
   * the hook runs in (J-207 S1; `readsAsZsh`): a list then stops at a word
   * zsh's equals expansion refuses. Absent, a shell line is read whole.
   */
  readonly zsh?: boolean | undefined;
}

/** greenline's refusal, which every command-hook harness reads as its own. */
const EXIT_REFUSE = 2;
const EXIT_ALLOW = 0;

/** The arguments, or why they do not read, which lets the tool go on. */
type Parsed =
  | {
      readonly kind: EventKind | undefined;
      readonly harness: Harness;
      readonly native: string | undefined;
    }
  | { readonly refused: string };

function parseEventArgs(argv: readonly string[]): Parsed {
  let kind: EventKind | undefined;
  let harness: string | undefined;
  let native: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    const value = argv[index + 1];
    if (argument === "--harness" && value !== undefined) {
      harness = value;
      index += 1;
    } else if (argument === "--native" && value !== undefined) {
      native = value;
      index += 1;
    } else if (kind === undefined && isEventKind(argument)) kind = argument;
    else return { refused: `unknown argument '${argument}'` };
  }
  if (harness === undefined || !isHarness(harness))
    return {
      refused: `--harness names one of the harnesses greenline reads, not '${harness ?? ""}'`,
    };
  return { kind, harness, native };
}

/** A path from the root, `/`-separated; undefined when it lies outside the repository. */
function fromRoot(root: string, path: string, base: string): string | undefined {
  const relation = relative(root, isAbsolute(path) ? path : resolve(base, path));
  if (relation === "") return ROOT_DIR;
  if (relation.startsWith("..") || isAbsolute(relation)) return undefined;
  return relation.split(sep).join("/");
}

/** The raw log of a change, its ignored working folder's events.jsonl. */
function eventsPath(root: string, id: string): string {
  return join(root, ".greenline", "tmp", id, "events.jsonl");
}

/** The commit and tree a matched before-tool event records for its run. */
const OPENED = z.object({ commit: z.string().nullable(), tree: z.string().nullable() });
type Opened = z.infer<typeof OPENED>;

/** What the raw log's lines are read for: the kind, the pairing, the time and a matched run's start. */
const LOGGED = z.object({
  kind: z.string().optional().catch(undefined),
  call: z.string().nullable().optional().catch(undefined),
  at: z.string().optional().catch(undefined),
  opened: OPENED.optional().catch(undefined),
  launch: z.string().nullable().optional().catch(undefined),
  method: z.string().nullable().optional().catch(undefined),
  agent: z.string().nullable().optional().catch(undefined),
  served: z.string().nullable().optional().catch(undefined),
  provenance: z.enum(["fresh", "forked"]).optional().catch(undefined),
  via: z.enum(["agent-tool", "rollout"]).optional().catch(undefined),
});
type Logged = z.infer<typeof LOGGED>;

/** The raw events already logged for a change; a line that does not read is left out. */
function loggedEvents(root: string, id: string): readonly Logged[] {
  let text: string;
  try {
    text = readFileSync(eventsPath(root, id), "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    const read = LOGGED.safeParse(parseJson(line));
    return read.success ? [read.data] : [];
  });
}

/**
 * One line of the raw log: an event, a matched before-tool event with the
 * code its run starts on, an agent tool's before-tool event with the method
 * its prompt names, or an agent's start with the method that started it
 * (J-134 S2), null for a start the mode's limit counts.
 */
type LogLine =
  | NormalisedEvent
  | (NormalisedEvent & { readonly opened: Opened })
  | (NormalisedEvent & {
      readonly launch: string | null;
      readonly served: string | null;
      readonly provenance?: Provenance | undefined;
      readonly via?: "agent-tool";
    })
  | (NormalisedEvent & { readonly method: string | null; readonly served: string | null })
  | (Omit<NormalisedEvent, "kind"> & {
      readonly kind: "helper";
      readonly provenance: Provenance;
      readonly via: "rollout";
    });

/**
 * The turn's end read for its pictures (J-129 S6): the largest picture past
 * its cap noted for the next turn's mirror; a turn that changed code and
 * drew no shape, and the reply's offers of a kept picture counted per
 * change (J-204 S1); the landing's offer noted and a withheld merge named
 * (J-209 S1); a careful frame's restatement noted put to the owner, where
 * the reply that ends the turn carries it (J-223 S1). Never stops the event.
 */
function readTurnEnd(
  root: string,
  harness: Harness,
  payload: JsonValue,
  session: string,
  modes: readonly string[],
  change: string | undefined,
  at: string,
): void {
  // The turn ends on the reply, so a careful frame whole and unconfirmed was put to the owner there (J-223 S1).
  noteFrameAsk(root, session, change, at);
  // The change the session holds in a linked worktree, where the hook's checkout holds none, is read there (J-228 S1).
  const held = change === undefined ? heldWorktree(root, session) : undefined;
  const landingRoot = held?.root ?? root;
  const landingChange = held?.change.id ?? change;
  try {
    // The turn whose reply offered the landing, noted once its change reads done with no landing line (J-209 S1).
    noteLandingOffer(landingRoot, session, landingChange);
  } catch {
    // An offer greenline cannot note leaves the owner's words read at the current turn alone.
  }
  try {
    notePictures(root, session, replyTextOf(harness, payload));
    // The address its turn printed, the first reply's mode line, the turn's pictures and a withheld merge, read from the same text (J-199 S1, J-204 S1, J-209 S1).
    readReplyOwed(
      root,
      session,
      replyTextOf(harness, payload),
      modes,
      change,
      withheldMerge(landingRoot, session, landingChange),
    );
  } catch {
    // A note greenline cannot write leaves the turn as it is.
  }
}

/**
 * Name the inspector the session started in its turn (J-151 S2): at a
 * Codex turn's end, whose server run gets no after-tool event while it
 * serves, under the change open or the one the turn closed; and before a
 * close's `greenline tidy --change <id>` on any harness, under that change,
 * so tidy stops it. Never stops the event.
 */
function noteTurnInspector(
  root: string,
  harness: Harness,
  event: NormalisedEvent,
  change: BranchChange | undefined,
): void {
  if (event.session === null) return;
  try {
    const text = event.command?.text ?? null;
    const tidied = event.kind === "before-tool" && text !== null ? tidyChangeOf(text) : undefined;
    const ending = event.kind === "turn-end" && harness === "codex";
    if (tidied === undefined && !ending) return;
    const since = lastTurnStartedAt(root, event.session);
    if (since === undefined) return;
    const under = tidied ?? change?.id ?? closingChange(root, event.session, undefined) ?? null;
    noteServedInspector(root, event.session, under, since);
  } catch {
    // An inspector greenline cannot read stays unnamed, as one the session did not start.
  }
}

/**
 * The owner's words at a turn's start (J-149 S4): kept for the turn, which
 * the deal's hold reads, and read for the pick of the deal the change
 * dealt, recorded as the viewer's pick is. A harness's notice the prompt
 * carries, a fresh agent's completion among them, is no word of the
 * owner's and is neither kept nor journaled; a prompt that holds nothing
 * else keeps nothing (J-199 S1, the run j196c-conduct-runner). Never stops
 * the event.
 */
function readOwnerWords(
  root: string,
  payload: JsonValue,
  session: string,
  change: string | undefined,
  at: string,
): void {
  try {
    const given = promptTextOf(payload);
    const prompt = given === undefined ? undefined : ownersOwnWords(given);
    if (prompt === undefined || prompt === "") return;
    noteOwnerWords(root, session, [prompt]);
    // Every message of the owner's is journaled, which a record's yes and its lifting lines are held against (J-176 S1).
    journalOwner(root, session, [prompt], at);
    if (change !== undefined) pickFromWords(root, change, prompt, lastTurnStartedAt(root, session));
  } catch {
    // Words greenline cannot keep leave the deal unpicked and its holds on the words the turn noted.
  }
}

/** The question tools whose cards the after-tool hook reads: Claude Code's, and Codex's in plan mode. */
const CARD_TOOLS: ReadonlySet<string> = new Set(["AskUserQuestion", "request_user_input"]);

/** A payload's tool input, as the harness handed it. */
const toolInput = z.object({ tool_input: z.json().optional().catch(undefined) }).catch({});

/**
 * The line naming the cards a question tool asked whose first option is not
 * the marked one (J-149 S2; frame's interview page), once per card, in a
 * refusal's form, or undefined where every card is marked or the call asks none.
 */
function cardsLine(event: NormalisedEvent, payload: JsonValue): string | undefined {
  const name = event.tool?.name;
  if (event.kind !== "after-tool" || name === null || name === undefined || !CARD_TOOLS.has(name))
    return undefined;
  const input = toolInput.parse(payload).tool_input;
  const cards = input === undefined ? [] : unmarkedCards(input);
  if (cards.length === 0) return undefined;
  const named = cards.map((card) => `"${card.card}" puts "${card.first}" first`).join(", ");
  return `cards: ${named}, with no "${MARKED_LABEL}" on it; the next round puts the answer you put forward first on each card, its label ending "${MARKED_LABEL}" and its description the reason, so a yes takes it; card-label, greenline's harness hook`;
}

/**
 * The visual home and the documents after a tool under an open change
 * (J-147 S1 and S3): each written visual's reach outside the repository and
 * each indexed document the change wrote kept at HEAD; the close's pin is
 * the write's that sets the record done (`closePinNotice`). Never stops the
 * event.
 */
function followHome(
  root: string,
  change: string,
  written: readonly string[],
  documents: readonly string[],
): void {
  try {
    recordReaches(root, written);
    keepDocuments(root, [...written, ...documents], change);
  } catch {
    // A fact greenline cannot write leaves the tool as it is.
  }
}

/**
 * Pin a change's visuals to the commit HEAD names at the write that sets
 * its record done (J-147 S3, J-216 S1), while HEAD's commit does not hold
 * it done yet, so the concluding commit carries them: a visual moves only
 * where nothing it covers changed since its commit, and the rest keep
 * theirs, their drift status's to name.
 * @returns the line naming what moved and what was kept, or undefined where nothing was pinned
 */
function pinAtClose(root: string, change: string): string | undefined {
  if (workingRecord(root, change)?.state !== "done") return undefined;
  // Once HEAD's commit holds the record done, the close is committed and nothing more may stand beside it.
  if (committedRecord(root, "HEAD", change)?.state === "done") return undefined;
  const head = headCommit(root);
  if (head.kind !== "commit") return undefined;
  const pin = repinChangeVisuals(root, change, head.id);
  keepChangeDocuments(root, change, head.id);
  return closePinLine(pin, head.id);
}

/**
 * The close's pin, made at the tool that wrote a change's record done and
 * at no other (J-216 S1): no later tool, commit or stop's commit of the
 * record moves an anchor, the run j196t-conduct-emptyd's anchors having
 * moved to the commit HEAD named at the close's write. A command that moves
 * the tree writes no record of the agent's. Never stops the event.
 * @returns the after-tool line, or undefined where nothing was pinned
 */
function closePinNotice(
  root: string,
  event: NormalisedEvent,
  shellHomes: readonly string[],
  base: string,
): string | undefined {
  try {
    const homes = MOVES_TREE.test(event.command?.text ?? "") ? [] : shellHomes;
    const written = recordsWritten(
      root,
      [...(event.write?.paths ?? []).flatMap((path) => fromRoot(root, path, base) ?? []), ...homes],
      root,
    );
    const lines = written.flatMap((id) => pinAtClose(root, id) ?? []);
    return lines.length === 0 ? undefined : lines.join("\n");
  } catch {
    return undefined;
  }
}

/** The indexed documents a shell command wrote, by their files' times since it started (J-147 S1). */
function documentsWrittenSince(root: string, since: number | undefined): readonly string[] {
  if (since === undefined) return [];
  const index = readDocuments(root);
  if (index?._tag !== "ok") return [];
  return index.value.documents.flatMap((document) => {
    try {
      return statSync(join(root, document.path)).mtimeMs >= since - 2000 ? [document.path] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Append one line to the change's raw log, making its working folder when
 * it is absent; a done or dropped change's events go nowhere, so the tidy's
 * removal stands (J-143 S2).
 */
function logEvent(root: string, id: string, line: LogLine): void {
  if (recordFinished(root, id)) return;
  mkdirSync(join(root, ".greenline", "tmp", id), { recursive: true });
  appendFileSync(eventsPath(root, id), `${JSON.stringify(line)}\n`);
}

/** The checks a change is held to: the declared ones, and the interface check for an interface change under the opt-in (J-123 S4). */
function heldChecks(manifest: Manifest, record: RecordFacts | undefined): readonly DeclaredCheck[] {
  const stated = record?.interface;
  return checksOfChange(
    manifest.checks,
    manifest.interface,
    stated === undefined ? undefined : parseInterfaceFact(stated),
  );
}

/** The declared check a shell command is a run of, in the directory it ran in, or at the session's when the harness gave none. */
function checkOf(
  root: string,
  checks: readonly DeclaredCheck[],
  event: NormalisedEvent,
  base: string,
): DeclaredCheck | undefined {
  const text = event.command?.text;
  if (text === null || text === undefined) return undefined;
  const dir = fromRoot(root, event.command?.dir ?? base, base);
  return dir === undefined ? undefined : matchedCheck(checks, text, dir);
}

/**
 * The line a declared check's plain run with no change acting adds after
 * the tool (J-226 S1; j217t-roster-use finding 6): the check by its name and
 * its command, and that no change records the run. A fact and never a
 * refusal: the owner may run a check at any time.
 * @param root the repository root
 * @param manifest the workspace's manifest
 * @param event the after-tool event
 * @param base the directory a relative path resolves from
 * @returns the line, or undefined where the command is no declared check's run
 */
function plainRunLine(
  root: string,
  manifest: Manifest,
  event: NormalisedEvent,
  base: string,
): string | undefined {
  const check =
    event.command === null
      ? undefined
      : checkOf(root, heldChecks(manifest, undefined), event, base);
  return check === undefined
    ? undefined
    : `the declared check ${check.name} (${check.command}) ran with no change acting, so no change records the run; no-change-run, greenline's harness hook`;
}

/** git's local exclude file, `info/exclude` in the git directory every worktree shares, by its real path; undefined where none reads. */
function localExcludeFile(root: string): string | undefined {
  const common = commonGitDirectory(root);
  return common === undefined ? undefined : join(common, "info", "exclude");
}

/** A file's path with its directory's links resolved, the file itself standing or not. */
function realFile(path: string): string {
  try {
    return join(realpathSync(dirname(path)), basename(path));
  } catch {
    return path;
  }
}

/** The first of the paths outside the homes, the repository's outside included. */
function writtenOutside(
  root: string,
  change: string | undefined,
  paths: readonly string[],
  base: string,
): string | undefined {
  return paths.find((path) => {
    const where = fromRoot(root, path, base);
    return where === undefined || !inHomes(where, change);
  });
}

/** The refusal of a write outside the homes before the owner's yes, or undefined. */
function writeRefusal(
  root: string,
  change: BranchChange,
  paths: readonly string[],
  base: string,
  setting: ProceedSetting,
): string | undefined {
  const outside = writtenOutside(root, change.id, paths, base);
  if (outside === undefined) return undefined;
  const record = workingRecord(root, change.id);
  const homes = `.greenline/ledger/ and .greenline/tmp/${change.id}/`;
  if (record?.choice !== undefined) {
    // An accepted record's yes is the owner's words, held against their journaled messages (J-176 S1),
    // every session's of the checkout, until HEAD's commit carries it settled (J-186 S1).
    const unheld = yesNotHeld(record.choice, record.yes, yesJournal(root, change.id, record.yes));
    if (unheld !== undefined)
      return ruled(
        `nothing outside the proposal's homes is written before the owner's yes: the write to ${outside} lies outside ${homes}, and ${unheld}`,
        "owner-yes",
      );
    const standing = standingReason(change.id, record, setting);
    if (standing !== undefined)
      return `the write to ${outside} waits too, lying outside ${homes}; ${standing}`;
    // At careful the frame is whole and the owner's words after its restatement confirm it before anything outside the homes (J-223 S1).
    const unconfirmed = frameUnconfirmedAt(root, change.id);
    return unconfirmed === undefined
      ? undefined
      : ruled(
          `at careful nothing outside the change's homes is written before the owner confirms the frame: the write to ${outside} lies outside ${homes}, and ${unconfirmed}`,
          "frame-confirmed",
        );
  }
  const why =
    record === undefined
      ? `${recordPath(change.id)} stands nowhere yet`
      : `${recordPath(change.id)} carries no choice line`;
  return ruled(
    `nothing outside the proposal's homes is written before the owner's yes: the write to ${outside} lies outside ${homes}, and ${why}; propose the change and wait for the yes`,
    "owner-yes",
  );
}

/**
 * The finding on a write to an interface file while the change's record
 * says `interface: no` (J-123 S1): the proposal states the fact, so a write
 * under an interface root names it rather than guessing.
 */
function interfaceRefusal(
  root: string,
  change: BranchChange,
  paths: readonly string[],
  base: string,
): string | undefined {
  const setting = workspaceManifest(root)?.interface;
  if (setting === undefined) return undefined;
  if (workingRecord(root, change.id)?.interface !== "no") return undefined;
  for (const path of paths) {
    const where = fromRoot(root, path, base);
    const under =
      where === undefined ? undefined : interfaceRootOf(where, setting.roots, setting.extensions);
    if (where !== undefined && under !== undefined)
      return ruled(
        `this change was proposed as touching no interface, so ${where}, under the interface root ${under}, is not written: ${recordPath(change.id)} says interface: no; propose interface: "yes, <register>" and wait for the owner's yes, or keep the write out of the interface`,
        "interface-fact",
      );
  }
  return undefined;
}

/**
 * The refusal of a write outside the homes while no change is open on the
 * branch HEAD names, or undefined: a detached HEAD names no branch, and a
 * merge under way is the landing's to conclude. A shell command's paths
 * whose directory the harness did not give are read from the session's
 * directory, so where a change stands open in a linked worktree the
 * refusal names it and the words that judge the command there (J-186 S1,
 * the run j109t-conduct-interfaced: Codex hands its hooks no `workdir`).
 * git's local exclude file is admitted, the repository's own uncommitted
 * configuration that changes no tree, so the worktree's directory is
 * ignored before the worktree is made, as frame's worktree page asks
 * (J-199 S1, the run j196t-ground).
 */
function noChangeRefusal(
  root: string,
  facts: BranchFacts,
  paths: readonly string[],
  base: string,
  undirected = false,
): string | undefined {
  const branch = facts.current;
  if (branch === undefined || !holdsNoChange(branch, facts)) return undefined;
  const exclude = localExcludeFile(root);
  const outside = writtenOutside(
    root,
    undefined,
    paths.filter((path) => exclude === undefined || realFile(resolve(base, path)) !== exclude),
    base,
  );
  if (outside === undefined || merging(root)) return undefined;
  // A copy left behind in a worktree is no open change, so the notice never names it (J-228 S1).
  const elsewhere = undirected
    ? openInWorktrees(root).filter((entry) => entry.left === undefined)
    : [];
  const named = elsewhere
    .map((entry) => `change ${entry.id} is open in the worktree ${entry.path}`)
    .join(", ");
  const tree = elsewhere[0]?.path;
  const more =
    tree === undefined
      ? undefined
      : `the hook was given no directory for the command, so its paths are read from the session's; ${named}: name it in the command's own words, \`cd ${tree} && <command>\`, and the write is judged there`;
  return `the write to ${outside} waits, lying outside .greenline/ledger/ and .greenline/tmp/: ${noChangeReason(
    branch,
    facts.records.map((entry) => entry.id),
    more,
  )}`;
}

/**
 * The refusal of a write-class tool's paths, each judged in the repository
 * it stands in: the session's, or a linked worktree of the change's own
 * that the session writes into from the main checkout (J-114 S3), which
 * holds its own branch, change and record. A nested repository or a
 * submodule inside the workspace is judged as the workspace; a worktree
 * whose checkout is no greenline workspace, or whose adapters are off, is
 * left alone.
 */
function writesRefusal(
  root: string,
  facts: BranchFacts,
  change: BranchChange | undefined,
  event: NormalisedEvent,
  base: string,
  setting: ProceedSetting,
  payload: JsonValue,
): string | undefined {
  if (event.kind !== "before-tool") return undefined;
  if (event.write !== null) {
    // An edit to a section of DESIGN.md the owner's pick holds locked waits for their words (J-148 S3, F10).
    const locked = designLockRefusal(root, change, event.write.paths, base, payload);
    if (locked !== undefined) return locked;
    // The ledger's machine-written files are the CLI's, whatever the change's state: the marks file, which
    // records whose act each line is (J-124 S2), the links, the indexes and the facts, and a picture is no record (J-173 S1).
    for (const path of event.write.paths) {
      const machine = ledgerRefusalOf(path, base, root);
      if (machine !== undefined) return machine;
    }
  }
  // A shell command's written files are writes like a write tool's, read from its words (J-176 S1).
  const written = event.write?.paths ?? shellTargets(root, event, base);
  if (written.length === 0) return undefined;
  // A command's paths read from its words where the harness gave no directory for it.
  const undirected = event.write === null && (event.command?.dir ?? null) === null;
  const groups = new Map<string, string[]>();
  for (const path of written) {
    const at = writtenIn(isAbsolute(path) ? path : resolve(base, path), root);
    groups.set(at, [...(groups.get(at) ?? []), path]);
  }
  for (const [at, paths] of groups) {
    if (at === root) {
      const refusal =
        change === undefined
          ? noChangeRefusal(root, facts, paths, base, undirected)
          : (writeRefusal(root, change, paths, base, setting) ??
            interfaceRefusal(root, change, paths, base));
      if (refusal !== undefined) return refusal;
      continue;
    }
    const manifest = workspaceManifest(at);
    if (manifest === undefined || !manifest.hooks.adapters) continue;
    const there = branchFacts(at);
    const owner = changeOfBranch(there.current, there);
    const refusal =
      owner === undefined
        ? noChangeRefusal(at, there, paths, base)
        : (writeRefusal(at, owner, paths, base, { ...setting, proceed: manifest.proceed }) ??
          interfaceRefusal(at, owner, paths, base));
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/**
 * The files a shell command's words write, read before it runs (J-176 S1,
 * the upgrade trial j109t-upgrade): a redirection's file, tee's, a copy's
 * or a move's target, an edit in place and a removal, each resolved through
 * the command's directory and its `cd` steps, as absolute paths. A target
 * the words build from a variable, a glob or a substitution is beyond what
 * they show, and a path outside the workspace and its linked worktrees is
 * not the door's; an interpreter's script is read by the ledger's own door.
 * Each is named from the directory the harness runs in where it lies there,
 * so the refusal reads as the write tool's does.
 */
function shellTargets(root: string, event: NormalisedEvent, base: string): readonly string[] {
  const text = event.command?.text;
  if (text === undefined || text === null) return [];
  const dir =
    event.command?.dir === null || event.command?.dir === undefined
      ? base
      : resolve(base, event.command.dir);
  const out: string[] = [];
  for (const write of wordsWritten(text)) {
    // A script's targets are the ledger door's, and a restore's the one table's (J-227 S1).
    if (
      write.how === "a script" ||
      write.how === "a restore" ||
      /[$`*?~]/.test(write.target) ||
      write.target === "-"
    )
      continue;
    const at = resolve(
      write.dirs.reduce((from, step) => resolve(from, step), dir),
      write.target,
    );
    if (fromRoot(root, at, base) === undefined && writtenIn(at, root) === root) continue;
    // Named as a write tool names it: from the directory the harness runs in, where it lies there.
    const named = relative(base, at);
    out.push(named === "" || named.startsWith("..") || isAbsolute(named) ? at : named);
  }
  return out;
}

/**
 * The linked worktree of the repository whose branch holds a change open,
 * found by `git worktree list` (J-215 S1); undefined where none does, the
 * root's own branch's change among them.
 */
function worktreeOfChange(root: string, id: string): string | undefined {
  const here = resolve(root);
  for (const entry of worktreesOf(root)) {
    if (resolve(entry.path) === here || !existsSync(join(entry.path, ".git"))) continue;
    const facts = branchFacts(entry.path);
    if (changeOfBranch(facts.current, facts)?.id === id) return entry.path;
  }
  return undefined;
}

/**
 * The linked worktree whose branch holds the change the session holds (J-228
 * S1, the run j217t-conduct-interface, whose Codex session stood in the main
 * checkout while its change was open in `.worktrees/<id>`, and whose next
 * turn's mirror said no open change): the change the session last named by
 * writing its record (`sessionChange`), found on a linked worktree's branch
 * (`worktreeOfChange`), read where the hook's checkout holds no change and
 * does not hold that record done or dropped, since a copy left behind there
 * is no open change. A change the session never named is left to "open in
 * other worktrees". Undefined elsewhere, and where git cannot say.
 * @param root the hook's own checkout
 * @param session the harness's session id
 * @returns the worktree's root, its path from the main checkout's root, its branch and its change
 */
function heldWorktree(
  root: string,
  session: string | null,
):
  | {
      readonly root: string;
      readonly path: string;
      readonly branch: string | undefined;
      readonly change: BranchChange;
    }
  | undefined {
  if (session === null) return undefined;
  try {
    const id = sessionChange(root, session);
    if (id === undefined) return undefined;
    const state = workingRecord(root, id)?.state;
    if (state === "done" || state === "dropped") return undefined;
    const at = worktreeOfChange(root, id);
    if (at === undefined) return undefined;
    const there = branchFacts(at);
    const owner = changeOfBranch(there.current, there);
    if (owner?.id !== id) return undefined;
    const main = worktreesOf(root).find((entry) => entry.main)?.path ?? root;
    const inside = relative(main, at);
    const path =
      inside === "" || inside.startsWith("..") || isAbsolute(inside)
        ? at
        : inside.split(sep).join("/");
    return { root: at, path, branch: there.current, change: owner };
  } catch {
    // A worktree git cannot read leaves the mirror the hook's own checkout's.
    return undefined;
  }
}

/**
 * The checkout a tool call acts in (J-215 S1, the run j196t-conduct-emptyd,
 * whose session stood in the main checkout while the agent worked in a
 * worktree of the change's own): the first of the call's places that lies
 * in another checkout of the repository, read in order from the
 * directories its shell line runs in, the harness's directory and the `cd`
 * steps after it, as the sightings read them, the paths a write tool or a
 * patch writes and the paths a reading tool reads; else the worktree whose
 * branch holds the change a greenline command names by `--change`, where
 * the harness hands the hooks no directory, as Codex hands none for its
 * exec call's `workdir`. A call that names none, and a place in another
 * repository, a plain second clone among them, act in the hook's own
 * checkout. Only a before-tool and an after-tool event act anywhere else.
 * @param root the hook's own checkout
 * @param event the normalised event
 * @param base the directory the session stands in
 * @returns the checkout's root
 */
function actingCheckout(root: string, event: NormalisedEvent, base: string): string {
  if (event.kind !== "before-tool" && event.kind !== "after-tool") return root;
  const text = event.command?.text ?? undefined;
  const dir =
    event.command === null || event.command.dir === null ? base : resolve(base, event.command.dir);
  const places = [
    ...(text === undefined ? [base] : [dir, ...shellDirectories(text, dir)]),
    ...(event.write?.paths ?? []).map((path) => resolve(base, path)),
    ...(event.read?.paths ?? []).map((path) => resolve(base, path)),
  ];
  for (const place of places) {
    const at = writtenIn(place, root);
    if (at !== root) return at;
  }
  for (const id of text === undefined ? [] : changesNamed(text)) {
    const held = worktreeOfChange(root, id);
    if (held !== undefined) return held;
  }
  return root;
}

/**
 * The linked worktrees a tool call writes in (J-223 S1, after the
 * falsifier's second reading): a write tool's paths, or the files a shell
 * command's words write (`shellTargets`), each resolved to the checkout it
 * lies in; the session's own checkout left out. A read, a command's
 * directory alone and a change's id named write nowhere.
 */
function worktreesWritten(root: string, event: NormalisedEvent, base: string): readonly string[] {
  if (event.kind !== "before-tool") return [];
  const paths = event.write?.paths ?? shellTargets(root, event, base);
  const places = new Set(
    paths.map((path) => writtenIn(isAbsolute(path) ? path : resolve(base, path), root)),
  );
  places.delete(root);
  return [...places];
}

/** What a write tool was given, as the lock reads it: Claude Code's `Write`, `Edit` and `MultiEdit`, and an apply-patch envelope. */
const writeInput = z
  .object({
    tool_input: z
      .object({
        content: z.string().optional().catch(undefined),
        old_string: z.string().optional().catch(undefined),
        new_string: z.string().optional().catch(undefined),
        replace_all: z.boolean().optional().catch(undefined),
        edits: z
          .array(
            z.object({
              old_string: z.string(),
              new_string: z.string(),
              replace_all: z.boolean().optional().catch(undefined),
            }),
          )
          .optional()
          .catch(undefined),
        command: z.string().optional().catch(undefined),
      })
      .catch({}),
  })
  .catch({ tool_input: {} });

/**
 * The refusal of a write that changes a section of a DESIGN.md the
 * interface rulings hold locked, where the change record's `## Interface`
 * section holds no unlock in the owner's words for it (J-148 S3). A write
 * whose result cannot be read from the payload is left to the other holds.
 */
function designLockRefusal(
  root: string,
  change: BranchChange | undefined,
  paths: readonly string[],
  base: string,
  payload: JsonValue,
): string | undefined {
  for (const path of paths) {
    if (basename(path) !== DESIGN_FILE) continue;
    const absolute = isAbsolute(path) ? path : resolve(base, path);
    const at = writtenIn(absolute, root);
    // Only the sections the rulings' `locked:` line names are locked, the owner's pick.
    const locked = readInterfaceRulings(at).locked ?? [];
    if (locked.length === 0) continue;
    const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    const input = writeInput.parse(payload).tool_input;
    const write =
      input.content !== undefined
        ? { whole: input.content }
        : input.edits !== undefined
          ? {
              edits: input.edits.map((one) => ({
                find: one.old_string,
                put: one.new_string,
                all: one.replace_all === true,
              })),
            }
          : input.old_string !== undefined && input.new_string !== undefined
            ? {
                edits: [
                  {
                    find: input.old_string,
                    put: input.new_string,
                    all: input.replace_all === true,
                  },
                ],
              }
            : input.command === undefined
              ? undefined
              : patchWrite(input.command, (named) => resolve(base, named) === absolute);
    const after = write === undefined ? undefined : textAfter(current, write);
    if (after === undefined) continue;
    const changed = lockedChanged(current, after, locked);
    if (changed.length === 0) continue;
    const owner = at === root ? change : changeOfBranch(branchFacts(at).current, branchFacts(at));
    let body = "";
    try {
      body =
        owner === undefined
          ? ""
          : readFileSync(join(at, `.greenline/ledger/${owner.id}.md`), "utf8");
    } catch {
      // No record on disk: no words unlock the section.
    }
    const refusal = lockRefusal(
      relative(at, absolute) || DESIGN_FILE,
      changed,
      unlocks(body).map((one) => one.section),
    );
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/** The check facts and the hook-recorded runs a change's folder holds. */
interface ChecksOnDisk {
  readonly facts: readonly CheckFacts[];
  readonly runs: readonly HookRun[];
}

function checksOnDisk(root: string, id: string): ChecksOnDisk {
  const folder = join(root, checksFolder(id));
  const facts: CheckFacts[] = [];
  const runs: HookRun[] = [];
  let names: readonly string[] = [];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json"));
  } catch {
    return { facts, runs };
  }
  for (const name of names) {
    try {
      const read = parseChecksFile(readFileSync(join(folder, name), "utf8"), name);
      if (read.kind === "hook" && read.parsed._tag === "ok") runs.push(read.parsed.value);
      if (read.kind === "check" && read.parsed._tag === "ok") facts.push(read.parsed.value);
    } catch {
      // An unreadable file is status's to report; the mirror shows what reads.
    }
  }
  return { facts, runs };
}

/**
 * The orientation line while no change is open: printed only while no
 * change record exists, read by the classification `status` uses (J-129 S1).
 */
function orientationMirrorLine(root: string): string | undefined {
  const records = recordIds(root);
  if (records === undefined || records.length > 0) return undefined;
  const orientation = readOrientation(root, {
    records: records.length,
    onDisk: new Set(records),
    installed: installedPaths(root),
  });
  return orientation.kind === "groundwork" || orientation.kind === "survey"
    ? orientationText(orientation)
    : undefined;
}

/** What a turn's start printed: the mirror's text, and the address its `View` row printed, undefined where it printed none. */
interface MirrorPrinted {
  readonly text: string;
  readonly view: string | undefined;
}

/** The mirror's text for the workspace as it stands, on the harness the adapter names, the proceed line where the turn's first reply owes it (J-206 S1), and the address its `View` row printed. */
function mirror(
  root: string,
  harness: Harness,
  manifest: Manifest,
  branch: string | undefined,
  change: BranchChange | undefined,
  line: (() => ModesDefinition | undefined) | undefined,
  session: string | null,
  model: string | undefined,
  surface: SurfaceFacts,
  installation: (() => Installation | undefined) | undefined,
  proceed: string | undefined,
  start: "session-start" | "turn-start",
  missed: string | undefined,
  heldIn?: string,
): MirrorPrinted {
  const read = mirrorInputOf(
    root,
    harness,
    manifest,
    branch,
    change,
    line,
    session,
    model,
    surface,
    installation,
    start,
  );
  const placed = heldIn === undefined ? read : { ...read, heldIn };
  const owed = proceed === undefined ? placed : { ...placed, proceed };
  // A turn that began without its mirror, named where it is printed late or at the next turn (J-225 S1).
  const input = missed === undefined ? owed : { ...owed, startMissed: missed };
  const view = input.facts?.find((row) => row.fact === "View")?.now;
  return {
    text: mirrorText(input),
    view: view !== undefined && /^https?:\/\//.test(view) ? view : undefined,
  };
}

/**
 * Note at a turn's start what its reply owes (J-199 S1): the address the
 * mirror's `View` row printed, and the `proceed` setting the turn's first
 * reply answers (`proceedOwed`), for the mode line it states. Never stops the event.
 */
function noteTurnOwed(
  root: string,
  session: string,
  proceed: string | undefined,
  view: string | undefined,
): void {
  try {
    noteReplyOwed(root, session, { printed: view ?? null, proceed: proceed ?? null });
  } catch {
    // A note greenline cannot write leaves the reply unread.
  }
}

/**
 * The `proceed` setting a turn's first reply answers (J-199 S1, J-206 S1):
 * the manifest's, where the turn opens on the owner's words with no change
 * open and the setting lets a request go on; undefined otherwise, a
 * session's start and a turn a notice opened among them. The mirror prints
 * it before the reply and the turn's note keeps it for the reply's reading.
 */
function proceedOwed(
  root: string,
  event: { readonly kind: string; readonly session: string | null },
  manifest: Manifest,
  change: BranchChange | undefined,
): string | undefined {
  if (event.kind !== "turn-start" || event.session === null) return undefined;
  if (change !== undefined || manifest.proceed === NO_PROCEED) return undefined;
  try {
    return ownerWords(root, event.session).length > 0 ? manifest.proceed : undefined;
  } catch {
    return undefined;
  }
}

/** The session's transcript a hook's payload names, where it names one. */
const TRANSCRIPT_PATH = z.object({ transcript_path: z.string().min(1) });

/**
 * What the session's payload says of its model (J-192 S1): the payload's
 * `model` where it names one, and the session's transcript by its absolute
 * path, which the session's note keeps for git's hooks and status.
 */
function sessionModelFacts(payload: JsonValue, base: string): SessionModelFacts {
  const transcript = TRANSCRIPT_PATH.safeParse(payload);
  return {
    model: payloadModel(payload),
    transcript: transcript.success ? resolve(base, transcript.data.transcript_path) : undefined,
  };
}

/**
 * The model the harness reports for the session (J-143 S2): the payload's
 * `model` where it names one, else the model the session's transcript last
 * names, read from its end; undefined where neither does, so the agent line
 * stays the agent's to state.
 */
function sessionModel(payload: JsonValue, base: string): string | undefined {
  const facts = sessionModelFacts(payload, base);
  return (
    facts.model ??
    (facts.transcript === undefined ? undefined : transcriptTailModel(facts.transcript))
  );
}

/**
 * What the mirror shows for the workspace as it stands: the one reader the
 * mirror and `greenline status` share (J-142 S1). With no harness named, the
 * surface line and the harness's agent are left out.
 * @param root the repository root
 * @param harness the harness the adapter names, undefined for the viewer
 * @param manifest the workspace's manifest
 * @param branch the branch HEAD names
 * @param change the open change, undefined where none is
 * @param line the modes definition, read for the progress line and the step
 * @param session the harness's session id, null where none is named
 * @param model the model the harness reports for the session, where it reports one (J-143 S2)
 * @param running the surface the session reads as running (J-151 S1), else the harness's first row
 * @param installation the installation, read for the situation and the skills owed (J-176 S1)
 * @param start the start the mirror prints at: a session's start reads no noted line, which the turn's start alone repeats (J-225 S1)
 * @returns the mirror's input
 */
export function mirrorInputOf(
  root: string,
  harness: Harness | undefined,
  manifest: Manifest,
  branch: string | undefined,
  change: BranchChange | undefined,
  line: (() => ModesDefinition | undefined) | undefined,
  session: string | null,
  model?: string,
  running?: SurfaceFacts,
  installation?: () => Installation | undefined,
  start: "session-start" | "turn-start" = "turn-start",
): MirrorInput {
  const home = readDrift(root);
  const drift = home.items;
  // A noted line is the previous turn's, printed by the turn-start's mirror alone, since the turn counter moves only there (J-225 S1).
  const noted = session === null || start === "session-start" ? null : session;
  // The previous turn's picture past its cap, read from the session's note (J-129 S6).
  const pictures = noted === null ? undefined : readPictureNote(root, noted);
  const picture =
    pictures === undefined || pictures.turn === null
      ? undefined
      : pictureLine(pictures.note, pictures.turn);
  const sessionMade = sessionMadeVisuals(root);
  const onDisk: ChecksOnDisk =
    change === undefined ? { facts: [], runs: [] } : checksOnDisk(root, change.id);
  const agentLines: readonly AgentLine[] =
    change === undefined
      ? []
      : loggedEvents(root, change.id).flatMap((line) =>
          line.kind === undefined
            ? []
            : [{ kind: line.kind, method: line.method, agent: line.agent }],
        );
  const record = change === undefined ? undefined : workingRecord(root, change.id);
  const surface = running ?? (harness === undefined ? undefined : runningSurface(harness));
  // The ground line while a change is open, and the standing choice only where the manifest sets one.
  const ground =
    change === undefined
      ? manifest.ground === undefined
        ? undefined
        : groundSettingLine(manifest.ground)
      : groundLine({ branch, ground: record?.ground, agent: record?.agent, harness, model });
  const skills = change === undefined ? undefined : loadsLine(changeLoads(root, change.id));
  // The situation the proposal answers and the skills the change owes, from the trigger rows (J-176 S1).
  const read = installation?.();
  const proposal =
    read === undefined
      ? undefined
      : proposalLines({ root, installation: read, manifest, change: change?.id, session });
  // The lines the record still lacks for its mode, and the hooks' hints beside them (J-176 S1).
  const definition = line?.();
  const text = change === undefined ? undefined : recordTextOf(root, change.id);
  const lack =
    text === undefined || definition === undefined ? undefined : recordLack(definition, text);
  const discussions = discussionsLine(discussionsReport(listDiscussions(root)));
  // The facets in play while a change is open in a workspace with interface roots (J-123 S1).
  const setting = manifest.interface;
  const interfaceText =
    change === undefined || setting === undefined
      ? undefined
      : interfaceLine({
          stated: record?.interface,
          platform: setting.platform,
          frameworks: setting.frameworks,
          rulingRegisters: [
            ...new Set(readInterfaceRulings(root).registers.map((entry) => entry.register)),
          ],
          components: declaredComponents(record?.design ?? ""),
        });
  const held = heldChecks(manifest, record);
  // The owner's message of the turn, which the waiting line and the stopped fact read against the wait (J-205 S1).
  const words = session === null ? undefined : turnWords(root, session);
  // The atlas's and the documents' facts, the close naming the pages it refreshes (J-147 S1).
  const atClose = change !== undefined && recordStep(root, change.id, line) === "close";
  const reaching = reachingVisuals(root);
  return {
    orientation: change === undefined ? orientationMirrorLine(root) : undefined,
    change:
      change === undefined
        ? undefined
        : {
            id: change.id,
            record,
            progress: progressOf(root, change.id, line),
          },
    checks: checkStandings(held, onDisk.facts, onDisk.runs),
    declared: held.length,
    agents: agentsCounted(agentLines),
    methodAgents: methodAgents(agentLines),
    git: gitHooksState(root, manifest.hooks),
    drift: {
      visuals: drift.filter((item) => item.kind === "visual").length,
      pages: drift.filter((item) => item.kind === "subsystem").length,
    },
    atlas: atlasLineOf(root, home, change?.id, atClose),
    docs: docsLineOf(root, home),
    reaches:
      reaching.length === 0
        ? undefined
        : `visuals reaching outside the repository: ${reaching.map((entry) => `${entry.id} loads ${entry.reaches[0] ?? ""}`).join(", ")}; a durable visual keeps its bytes in the home, so name ${reaching.length === 1 ? "it" : "them"} to the owner, and ${NO_REMAKE_OFFER}`,
    renders: surface?.renders,
    worktree: surface?.worktree,
    questions: surface?.questions,
    instructions: harness === undefined ? undefined : adapterInstructions(harness),
    ground,
    // The remote's kind, read from its URL alone, which the landing's offer reads (J-130 S1).
    remote: remoteText(readRemote(root)),
    skills,
    situation: proposal?.situation,
    owed: proposal?.owed,
    lacking: lack === undefined ? undefined : lackingLine(lack),
    helpers: change === undefined ? undefined : helpersLine(helperStarts(root, change.id)),
    hints: change === undefined ? undefined : recordHintsLine(root, change.id),
    discussions,
    interface: interfaceText,
    interfaceChecks:
      change === undefined || setting === undefined
        ? undefined
        : interfaceChecksMirrorLine(root, change.id),
    interfaceRender: change === undefined ? undefined : renderMirrorLine(root, change.id, manifest),
    designPick:
      change === undefined ? undefined : designPickMirrorLine(root, change.id, record?.design),
    marks: setting === undefined ? undefined : marksLine(openMarks(root, readMarksFiles(root))),
    picture,
    // The cards the previous turn asked with no marked first option, where its harness took no after-tool context (J-149 S2).
    cards: noted === null ? undefined : cardsNoteLine(root, noted),
    // What the previous turn's reply lacked of what its turn owed (J-199 S1).
    replyLacks: noted === null ? undefined : replyLacksLines(root, noted),
    // The stopped change's wait, read beside the owner's message of the turn (J-149 S3, J-205 S1).
    waiting: change === undefined ? stoppedWaitText(root, words) : undefined,
    turnWords: words,
    // The open change's shown patch the checkout lacks, which its waiting line names (J-214 S1).
    shownPatch: change === undefined ? undefined : shownPatchOwed(root, change.id),
    // A record stopped while this session goes on, which a wait leaves open and the owner's words may answer (J-200 S1, J-205 S1).
    stoppedHeld:
      session === null
        ? undefined
        : stoppedHeldText(
            root,
            change?.id ?? stoppedHere(root),
            session,
            (named) => ownerJournal(root, named),
            words,
          ),
    // A record that reads stopped while no commit holds the stop, until the stop's commit stands (J-210 S1).
    stopCommit: stopCommitText(root, words),
    // A done change's landing, from its record and git, which the owner's merge words meet (J-202 S1).
    landing: session === null ? undefined : heldLandingText(root, change?.id, session),
    sessionMade:
      sessionMade.length === 0
        ? undefined
        : `visuals the session made itself: ${sessionMade.map((entry) => entry.id).join(", ")}; a fresh agent makes each durable visual, so name ${sessionMade.length === 1 ? "it" : "them"} to the owner, and ${NO_REMAKE_OFFER}`,
    // The facts table status holds for the agent, its View row read from the inspector's address file (J-142 S2, J-144 S1); the reply carries none (J-176 S1).
    facts: change === undefined ? undefined : factsOf(root, change.id, branch, line),
    // A change open in another checkout git lists (J-143 S2).
    openElsewhere: openElsewhereText(openInWorktrees(root)),
    // The branches cut before the install, with what a request for their files owes under proceed (J-213 S1).
    predating: predatingMirrorLine(root, manifest),
  };
}

/**
 * The situation's line on the branches cut before the install, as the
 * mirror prints it at a session's and a turn's start (J-213 S1): only where
 * one is named, `status` printing its `none`.
 */
function predatingMirrorLine(root: string, manifest: Manifest): string | undefined {
  const reading = readPredating(root, manifest.proceed);
  return reading.kind === "known" && reading.base !== null && reading.branches.length > 0
    ? predatingText(reading)
    : undefined;
}

/**
 * The line naming the skills a change owes, at its first write outside
 * greenline's homes (J-134 S3, J-176 S1): undefined at any later write, at
 * a write inside the homes, and where nothing is owed. Never stops the event.
 */
function owedAtFirstWrite(
  root: string,
  manifest: Manifest,
  id: string,
  written: readonly string[],
  event: NormalisedEvent,
  env: EventEnvironment,
): string | undefined {
  try {
    // A write under greenline's own folder, the decisions book's at design among them, is no code write.
    if (!written.some((path) => !path.startsWith(".greenline/") && !inHomes(path, id)))
      return undefined;
    // A done or dropped change's working folder is the tidy's to remove, so no note is written there (J-143 S2).
    if (recordFinished(root, id) || !firstCodeWrite(root, id, event.at)) return undefined;
    const installation = env.installation?.();
    return installation === undefined
      ? undefined
      : proposalLines({ root, installation, manifest, change: id, session: event.session }).owed;
  } catch {
    return undefined;
  }
}

/** A record's text, undefined where it stands nowhere. */
function recordTextOf(root: string, id: string): string | undefined {
  try {
    return readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The installed skills whose own page or references page names a fresh
 * agent, the methods that may start one (J-134 S2), read from the lock's
 * paths.
 */
function agentStartingSkills(root: string): ReadonlySet<string> {
  const skills = new Set<string>();
  for (const path of installedPaths(root)) {
    const file = skillFileOf(path);
    if (file === undefined || (file.file !== "SKILL.md" && file.file !== "references/greenline.md"))
      continue;
    try {
      if (/\bfresh agents?\b/i.test(readFileSync(join(root, path), "utf8"))) skills.add(file.skill);
    } catch {
      // A page that does not read names no agent.
    }
  }
  return skills;
}

/** A prompt that is one file's path inside the repository, read for the file's text beside it. */
function promptWithBrief(root: string, prompt: string, base: string): string {
  const path = prompt.trim();
  if (path === "" || /\s/.test(path)) return prompt;
  const where = fromRoot(root, path, base);
  if (where === undefined || where === ROOT_DIR) return prompt;
  try {
    return `${prompt}\n${readFileSync(join(root, where), "utf8")}`;
  } catch {
    return prompt;
  }
}

/**
 * The raw log's line for an agent tool's launch or an agent's start (J-134
 * S2): a launch carries the method its prompt names, null where it names a
 * step's agent or neither, read from the prompt or the brief file it is the
 * path of; a start carries the method of the launch it pairs with, so the
 * count holds only the agents the line's depths start. Where the modes
 * definition cannot be read no step's skill is known, and every start is
 * counted. Any other event is logged as it stands.
 */
function startedBy(
  root: string,
  id: string,
  event: NormalisedEvent,
  harness: Harness,
  payload: JsonValue,
  env: EventEnvironment,
): LogLine {
  if (event.kind === "agent-start") {
    const lines = loggedEvents(root, id).flatMap((line) =>
      line.kind === undefined
        ? []
        : [
            {
              kind: line.kind,
              launch: line.launch,
              method: line.method,
              agent: line.agent,
              served: line.served,
            },
          ],
    );
    return {
      ...event,
      method: methodOfStart(lines, event.agent),
      served: servedOfStart(lines, event.agent),
    };
  }
  if (event.kind !== "before-tool") return event;
  const prompt = agentPromptOf(harness, payload);
  if (prompt === undefined) return event;
  const steps = env.line?.()?.steps.map((step) => step.name);
  const briefed = promptWithBrief(root, prompt, event.cwd ?? root);
  const starter =
    steps === undefined
      ? { by: "unknown" as const }
      : agentStarter(
          briefed,
          rosterNamesOf(installedPaths(root)),
          new Set(steps),
          agentStartingSkills(root),
        );
  const provenance = launchProvenance(harness, payload);
  // The step a step's agent serves, which its loads are noted at (J-207 S1).
  const served =
    starter.by === "step" && steps !== undefined
      ? (servedStep(briefed, new Set(steps)) ?? null)
      : null;
  const started = { ...event, launch: starter.by === "method" ? starter.method : null, served };
  // Fresh or forked, as the agent tool's launch names it (J-176 S1).
  return provenance === undefined
    ? started
    : { ...started, provenance, via: "agent-tool" as const };
}

/**
 * The helpers the hooks saw start for a change (J-176 S1): each agent
 * tool's launch that named fresh or forked, by its call, and each spawn a
 * Codex rollout showed, by its call id, once each.
 * @param root the repository root
 * @param id the change
 * @returns the helpers, in the order seen
 */
function helperStarts(root: string, id: string): readonly HelperStart[] {
  const seen = new Set<string>();
  return loggedEvents(root, id).flatMap((line) => {
    if (line.provenance === undefined || line.via === undefined) return [];
    const agent = line.agent ?? line.call ?? "";
    if (agent !== "" && seen.has(agent)) return [];
    if (agent !== "") seen.add(agent);
    return [{ agent, provenance: line.provenance, via: line.via }];
  });
}

/**
 * At a Codex turn's end, the helpers its session's rollout shows it spawned
 * that the change's log does not hold yet, logged fresh or forked (J-176
 * S1). Never stops the event.
 */
function noteRolloutSpawns(
  root: string,
  harness: Harness,
  event: NormalisedEvent,
  payload: JsonValue,
  change: BranchChange | undefined,
  base: string,
): void {
  if (harness !== "codex" || event.kind !== "turn-end" || change === undefined) return;
  try {
    const transcript = TRANSCRIPT_PATH.safeParse(payload);
    if (!transcript.success) return;
    const lines = readFileSync(resolve(base, transcript.data.transcript_path), "utf8").split("\n");
    const known = new Set(helperStarts(root, change.id).map((start) => start.agent));
    for (const spawn of rolloutSpawns(lines))
      if (!known.has(spawn.agent))
        logEvent(root, change.id, {
          ...event,
          kind: "helper",
          agent: spawn.agent,
          provenance: spawn.provenance,
          via: "rollout",
        });
  } catch {
    // A rollout greenline cannot read leaves the helpers as the log holds them.
  }
}

/** The commit and the tree of the code as it stands now. */
function codeNow(root: string): Opened {
  const commit = headCommit(root);
  const tree = workingTreeId(root);
  return {
    commit: commit.kind === "commit" ? commit.id : null,
    tree: tree.kind === "tree" ? tree.id : null,
  };
}

/** Write a matched run whole beside the change's check facts, the tree read at its start where the before-tool event recorded it. */
function recordRun(
  root: string,
  change: BranchChange,
  event: NormalisedEvent,
  check: DeclaredCheck,
  base: string,
  env: EventEnvironment,
): void {
  const started = loggedEvents(root, change.id).find(
    (line) =>
      line.kind === "before-tool" &&
      event.call !== null &&
      line.call === event.call &&
      line.opened !== undefined,
  );
  const code = started?.opened ?? codeNow(root);
  const duration = event.command?.durationMs ?? null;
  const startedAt =
    started?.at ??
    (duration === null ? event.at : new Date(Date.parse(event.at) - duration).toISOString());
  const run: HookRun = {
    schemaVersion: 1,
    source: "hook",
    harness: event.harness,
    check: check.name,
    arguments: [event.command?.text ?? check.command],
    dir: fromRoot(root, event.command?.dir ?? base, base) ?? ROOT_DIR,
    startedAt,
    commit: code.commit,
    tree: code.tree,
    treeAt: started?.opened === undefined ? "run-end" : "run-start",
    installation: lockedRevision(root),
    state: "finished",
    outcome: { kind: event.command?.outcome ?? "unknown", code: event.command?.exit ?? null },
    durationMs: duration,
  };
  const folder = join(root, checksFolder(change.id));
  mkdirSync(folder, { recursive: true });
  const name =
    env.factsFile?.(startedAt) ?? hookRunFileName(startedAt, randomBytes(3).toString("hex"));
  // A recorded run is never written over: a name already standing takes no second file.
  if (!existsSync(join(folder, name))) atomicWriteFile(join(folder, name), serializeHookRun(run));
}

/** A call's start file under the working files, named by the call's id; undefined where the id names no file. */
function callStartPath(root: string, call: string | null): string | undefined {
  if (call === null) return undefined;
  const safe = call.replaceAll(/[^A-Za-z0-9_-]/g, "-").slice(0, 120);
  return /[A-Za-z0-9]/.test(safe)
    ? join(root, ".greenline", "tmp", "calls", `${safe}.json`)
    : undefined;
}

/**
 * Note a shell command's start at its before-tool event, by its call's id,
 * whatever change is open or none (J-135 S2), so its after-tool event reads
 * the files it wrote though the change open before differs from the one
 * after, on a harness that reports no duration too. Never stops the event.
 */
function noteCommandStart(root: string, event: NormalisedEvent): void {
  if (event.kind !== "before-tool" || event.command === null) return;
  const path = callStartPath(root, event.call);
  if (path === undefined) return;
  try {
    mkdirSync(join(path, ".."), { recursive: true });
    atomicWriteFile(path, `${JSON.stringify({ at: event.at })}\n`);
  } catch {
    // A start greenline cannot note falls back to the raw log or the duration.
  }
}

/**
 * The refusal of a command's first kill the guard refuses (J-148 S1): a kill
 * by name or pattern, or of a pid the session did not start that the owner's
 * words of the turn do not name; the table is read only for a kill by pid,
 * so a reused pid is never taken for the session's.
 */
function killGuard(root: string, text: string, session: string | null): string | undefined {
  const acts = killActs(text);
  if (acts.length === 0) return undefined;
  const byPid = acts.some((act) => act.kind === "by-pid");
  const table = byPid ? processTable() : undefined;
  // The workspace's sessions' processes, a resumed session's earlier ones among them, and their descendants.
  const started =
    table === undefined ? new Set<number>() : sessionPids(allStarted(root), table.rows);
  const words = byPid && session !== null ? ownerWords(root, session) : [];
  for (const act of acts) {
    const refusal = killRefusal(act, started, words);
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/** Whether the harness ran the command in the background as a whole: Claude Code's `run_in_background`. */
const backgroundRun = z
  .object({ tool_input: z.object({ run_in_background: z.boolean().optional().catch(undefined) }) })
  .transform((payload) => payload.tool_input.run_in_background === true)
  .catch(false);

/**
 * Note the processes a background command started, at its after-tool event
 * (J-148 S1): each command after `&`, under `nohup` or `setsid`, or the
 * whole line the harness ran in the background, matched in the process
 * table by its program, its literal arguments and a start after the
 * command's, which its before-tool event noted. Never stops the event.
 */
function noteBackgroundStarts(
  root: string,
  event: NormalisedEvent,
  payload: JsonValue,
  change: string | undefined,
): void {
  const text = event.command?.text ?? null;
  if (event.kind !== "after-tool" || event.session === null || text === null) return;
  const starts = backgroundStarts(text, backgroundRun.parse(payload));
  const inspector = startsInspector(text);
  if (starts.length === 0 && !inspector) return;
  try {
    const path = callStartPath(root, event.call);
    const read =
      path === undefined || !existsSync(path)
        ? undefined
        : z.object({ at: z.string() }).safeParse(parseJson(readFileSync(path, "utf8")));
    const since = read?.success === true ? Date.parse(read.data.at) : Number.NaN;
    if (Number.isNaN(since)) return;
    const table = processTable();
    if (table === undefined) return;
    const own = ownPids(table.rows);
    // The inspector `greenline view` starts detached, through its address file's pid, where it began after the command.
    const served = inspector ? inspectorRow(root, table.rows, since) : undefined;
    const rows = [
      ...starts.flatMap((words) => startedRows(words, table.rows, since, table.at, own)),
      ...(served === undefined ? [] : [served]),
    ];
    const found = rows.map((row) => ({
      pid: row.pid,
      command: row.command,
      started: new Date(row.started).toISOString(),
      change: change ?? null,
    }));
    noteStarted(root, event.session, found);
  } catch {
    // A start greenline cannot read leaves the process unnamed, as one the session did not start.
  }
}

/** The start a call's before-tool event noted, read once and removed; undefined where none stands. */
function notedStart(root: string, call: string | null): number | undefined {
  const path = callStartPath(root, call);
  if (path === undefined || !existsSync(path)) return undefined;
  try {
    const read = z.object({ at: z.string() }).safeParse(parseJson(readFileSync(path, "utf8")));
    rmSync(path, { force: true });
    const at = read.success ? Date.parse(read.data.at) : Number.NaN;
    return Number.isNaN(at) ? undefined : at;
  } catch {
    return undefined;
  }
}

/**
 * When a shell command started, for the files it wrote (J-133 S1): the
 * start its before-tool event noted by the call's id under the hook's own
 * checkout (J-135 S2), else that event's time in the change's raw log in the
 * checkout the call acts in (J-215 S1), paired by the call's id, else its
 * end less the duration the harness reported; undefined where none is
 * known, so no file is read as its write.
 */
function commandStart(
  root: string,
  work: string,
  id: string | undefined,
  event: NormalisedEvent,
): number | undefined {
  const noted = notedStart(root, event.call);
  if (noted !== undefined) return noted;
  const before =
    event.call === null || id === undefined
      ? undefined
      : loggedEvents(work, id).find(
          (line) => line.kind === "before-tool" && line.call === event.call,
        );
  const at = before?.at === undefined ? Number.NaN : Date.parse(before.at);
  if (!Number.isNaN(at)) return at;
  const duration = event.command?.durationMs ?? null;
  return duration === null ? undefined : Date.parse(event.at) - duration;
}

/**
 * The change's links file follows its folder in the visual home after every
 * tool, whatever wrote there: a write tool, a shell command or a fresh agent.
 * A change with neither a folder there nor a links file is left alone.
 */
function followVisuals(root: string, id: string): void {
  if (
    existsSync(join(root, changeVisualsFolder(id))) ||
    existsSync(join(root, ".greenline", "ledger", id, LINKS_FILE))
  )
    writeChangeLinks(root, id, "greenline event");
}

/**
 * What a shell command wrote, read at its after-tool event (J-133 S1,
 * J-135 S2): the files changed since it started in the checkout it acted
 * in (J-215 S1), its start its before-tool event in the change's raw log or
 * else its end less the duration the harness gave; undefined for any other
 * event, or where the start is unknown, so no file is read as its write.
 */
function shellWrites(
  root: string,
  work: string,
  change: string | undefined,
  event: NormalisedEvent,
): (ShellWrites & { readonly since: number }) | undefined {
  if (event.kind !== "after-tool" || event.write !== null || event.command === null)
    return undefined;
  const started = commandStart(root, work, change, event);
  return started === undefined ? undefined : { ...writtenByShell(work, started), since: started };
}

/**
 * A shell command's writes under the homes, taken as a write tool's paths
 * (J-135 S2): a record it wrote names the change for the session's loads,
 * a visual's manifest in the map's or the atlas's folders gets its maker,
 * never one in a change's folder, which the keep alone writes and whose
 * maker the keep derives (J-227 S1), and the frame map follows each record
 * it wrote, whether the write left the record open or stopped it. A git
 * command that moves the tree, a stash, a checkout or a merge among them,
 * wrote none of the files whose times it moved, so none is followed (J-228
 * S1, the run j201t-linear-visuals, whose stash brought back a manifest the
 * hook then gave a maker, and the merge after it aborted). Never stops the
 * event.
 */
function followShellWrites(
  root: string,
  harness: Harness,
  event: NormalisedEvent,
  homes: readonly string[],
): void {
  if (MOVES_TREE.test(event.command?.text ?? "")) return;
  try {
    const records = recordsWritten(root, homes, root);
    if (event.session !== null)
      for (const id of records) nameChange(root, event.session, id, event.at);
    // Read by the files' times, a shell command's write fills a maker and never replaces one;
    // a change's folder is the keep's, whose maker is the keep's alone (J-227 S1).
    if (event.agent !== null || namesItsAgents(harness))
      recordMakers(
        root,
        homes.filter((path) => !inChangeVisuals(path)),
        event.agent === null ? "session" : "agent",
        true,
      );
    for (const id of records) writeFrameMap(root, id, "greenline event");
  } catch {
    // A fact greenline cannot write leaves the tool and the event as they are.
  }
}

/** The notices for the helpers' reports among the paths a tool wrote, each read for its brief's nonce (J-192 S1). */
function reportNotices(root: string, id: string, written: readonly string[]): string | undefined {
  const folder = `.greenline/ledger/${id}/`;
  const notices = [...new Set(written)].flatMap((path) => {
    if (!path.startsWith(folder) || path.slice(folder.length).includes("/")) return [];
    const notice = reportNonceNotice(root, id, path.slice(folder.length));
    return notice === undefined ? [] : [notice];
  });
  return notices.length === 0 ? undefined : notices.join("\n");
}

/** A shell command whose git act moves the working tree, so the files it changed are git's and no write of the agent's. */
const MOVES_TREE =
  /(?:^|[;&|(]\s*)git\s+(?:-C\s+\S+\s+)?(?:checkout|switch|reset|merge|pull|rebase|stash|restore|cherry-pick|revert|am|clone|worktree)\b/;

/**
 * The resume's notice after a tool (J-149 S3, J-176 S1): where a turn that
 * began with the change stopped writes the change's record, its folder or
 * its code while its record still reads `stopped`, the after-tool line says
 * so, and the agent sets `state: open` itself; no hook writes a line of the
 * record. Never stops the event.
 * @returns the after-tool line, or undefined where none is owed
 */
function resumeNotice(
  root: string,
  event: NormalisedEvent,
  change: BranchChange | undefined,
  shellHomes: readonly string[],
  base: string,
): string | undefined {
  try {
    // A git command that moves the tree, a switch, a reset or a merge among them, writes no record of the agent's.
    const homes = MOVES_TREE.test(event.command?.text ?? "") ? [] : shellHomes;
    // The change a resume reopens: the branch's, or, where the branch names none, as on a
    // default branch with no remote, the one record standing stopped here (J-149 S3).
    const resumed = change?.id ?? stoppedHere(root);
    if (resumed === undefined || event.session === null) return undefined;
    const paths = [
      ...(event.write?.paths ?? []).flatMap((path) => fromRoot(root, path, base) ?? []),
      ...homes,
    ];
    // Only a write of the change's own, its record, its folder or the code, resumes it; a discussion or another change's file does not.
    const resumes = paths.some(
      (path) =>
        path === recordPath(resumed) ||
        path.startsWith(`.greenline/ledger/${resumed}/`) ||
        !path.startsWith(".greenline/"),
    );
    if (!resumes || workingRecord(root, resumed)?.state !== "stopped") return undefined;
    const start = currentTurnStart(root, event.session);
    // The stop's own turn, which began with the record open or before the stop's commit, owes nothing.
    const stoppedBefore =
      start !== undefined &&
      (start.change === resumed
        ? start.state === "stopped"
        : committedRecord(root, "HEAD", resumed)?.state === "stopped");
    return stoppedBefore
      ? `record: ${recordPath(resumed)} still reads stopped while this turn resumes the change; write state: open in it as the resume's first line, before its next edit; resume-open, greenline's harness hook`
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The stop's commit after a tool (J-210 S1, the run j196t-states-stop-2c,
 * whose agent set the record stopped on the owner's words at 001/005 and
 * committed nothing): where a tool's write, or a shell command's, writes a
 * change's record and leaves it reading stopped while no commit holds the
 * stop, the after-tool line says so and that the record and its folder are
 * committed now; read from the written file against HEAD's, once per write
 * that sets it. A git act that moves the tree writes no record of the
 * agent's, and a record the owner's words of the turn answer, or the
 * resume's notice names, owes none. No hook commits for the agent. Never
 * stops the event.
 * @returns the after-tool line, or undefined where none is owed
 */
function stopCommitNotice(
  root: string,
  event: NormalisedEvent,
  shellHomes: readonly string[],
  base: string,
): string | undefined {
  try {
    const homes = MOVES_TREE.test(event.command?.text ?? "") ? [] : shellHomes;
    const written = recordsWritten(
      root,
      [...(event.write?.paths ?? []).flatMap((path) => fromRoot(root, path, base) ?? []), ...homes],
      root,
    );
    if (written.length === 0) return undefined;
    const words = event.session === null ? undefined : turnWords(root, event.session);
    return stopCommitText(root, words, written);
  } catch {
    return undefined;
  }
}

/**
 * The step a fresh agent serves in a change, from its start's line in the
 * change's raw log, which takes it from the brief its launch named (J-207
 * S1); undefined where the log names none.
 * @param root the repository root
 * @param id the change
 * @param agent the id the harness gives the agent
 * @returns the step, or undefined
 */
function agentServed(root: string, id: string, agent: string): string | undefined {
  const start = loggedEvents(root, id).find(
    (line) => line.kind === "agent-start" && line.agent === agent,
  );
  return start?.served ?? undefined;
}

/**
 * The mirror a turn that began without it owes (J-225 S1;
 * j217t-conduct-runner finding 1): at the turn's first after-tool event,
 * where the harness takes context there and at a turn's start, a turn its
 * start counted and never noted delivered prints the mirror with the line
 * that names the gap, its delivery noted once the event's output carries
 * it (`deliverLate`), so it prints once; a fresh agent's call
 * takes none. Undefined elsewhere, and where it cannot be read. Never
 * stops the event.
 */
function lateMirror(
  root: string,
  harness: Harness,
  event: NormalisedEvent,
  manifest: Manifest,
  branch: string | undefined,
  change: BranchChange | undefined,
  env: EventEnvironment,
): string | undefined {
  const session = event.session;
  // A fresh agent's call is no turn of the session's own, so its context never takes the session's mirror.
  if (
    event.kind !== "after-tool" ||
    session === null ||
    event.agent !== null ||
    !takesAfterToolContext(harness)
  )
    return undefined;
  try {
    if (!takesContextAt(harness, "turn-start") || !mirrorMissed(root, session, "this"))
      return undefined;
    const printed = mirror(
      root,
      harness,
      manifest,
      branch,
      change,
      env.line,
      session,
      undefined,
      notedSurface(root, harness),
      env.installation,
      undefined,
      "turn-start",
      startMissedLine("this"),
    );
    return printed.text.trimEnd();
  } catch {
    return undefined;
  }
}

/** Note a late mirror delivered once the event's output carrying it is written (J-225 S1). Never fails. */
function deliverLate(root: string, event: NormalisedEvent, late: string | undefined): void {
  if (late === undefined || event.session === null) return;
  try {
    noteMirrorDelivered(root, event.session);
  } catch {
    // A note greenline cannot write leaves the next after-tool event to print the mirror again.
  }
}

/**
 * The turn's count and the skill loads a tool call makes, never stopping the
 * event: a session names the change whose record it writes, then the loads
 * the call makes are noted (`../skill-loads.ts`).
 */
function noteSkillUse(
  root: string,
  event: NormalisedEvent,
  base: string,
  change: BranchChange | undefined,
  env: EventEnvironment,
): void {
  try {
    // The shell the environment names reads the line: under zsh the list stops at a refused equals word (J-207 S1).
    const reading: ShellReading = { zsh: env.zsh === true };
    const note = (loads: readonly LoadSeen[]): void => {
      noteLoads({
        root,
        event,
        loads,
        branchChange: change?.id,
        line: env.line,
        agentStep: (id, agent) => agentServed(root, id, agent),
      });
    };
    if (event.kind === "after-tool") {
      // A read the call's before-tool event did not note, its event lost or cut, is noted now, keyed by the call, so no read is two facts (J-225 S1).
      const missed = takeLoadsNoted(root, event.call) === false;
      if (!missed && !event.cut && event.refused.length === 0) return;
      const refused = new Set(event.refused);
      // The reads the shell made, stopped where its error in the result says it refused a word.
      const ran = loadsOfEvent(root, event, base, refused.size === 0 ? reading : { refused });
      if (missed) note(ran);
      // A read noted before the call that the shell never made is marked not made, a second reading beside the text's (J-207 S1).
      else if (refused.size > 0) note(unrunLoads(loadsOfEvent(root, event, base, reading), ran));
      // A result the harness cut makes each load its call made a part, where the harness hands the result (J-203 S1).
      if (event.cut) note(cutLoads(ran));
      return;
    }
    if (event.kind !== "before-tool") return;
    if (event.session !== null && event.write !== null)
      for (const id of recordsWritten(root, event.write.paths, base))
        nameChange(root, event.session, id, event.at);
    const loads = loadsOfEvent(root, event, base, reading);
    // The call is marked before its loads are noted, so a noting cut part way is never noted a second time after the tool (J-225 S1).
    if (loads.length > 0) markLoadsNoted(root, event.call);
    note(loads);
  } catch (error) {
    // A load greenline cannot note leaves the tool and the event as they are, and one line in the session's raw log says so (J-225 S1).
    logSessionError(root, event.session, {
      kind: "load-error",
      at: event.at,
      call: event.call,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run `greenline event`.
 * @param argv the arguments after `event`
 * @param writer greenline's own streams: the mirror to stdout, a refusal's line to stderr
 * @param env where it runs and the harness's payload
 * @returns 2 to refuse, 0 otherwise
 */
export function runEventCli(
  argv: readonly string[],
  writer: CliWriter,
  env: EventEnvironment,
): number {
  try {
    const parsed = parseEventArgs(argv);
    if ("refused" in parsed) {
      writer.stderr.write(`greenline event: ${parsed.refused}; the tool goes on\n`);
      return EXIT_ALLOW;
    }
    const at = (env.now?.() ?? new Date()).toISOString();
    // A payload that does not read leaves every field null, never guessed.
    const payload = parseJson(env.stdin()) ?? {};
    const event = normaliseEvent({
      harness: parsed.harness,
      kind: parsed.kind,
      native: parsed.native,
      payload,
      at,
    });
    if (event === undefined) return EXIT_ALLOW;
    const root = findGitRoot(env.cwd) ?? (event.cwd === null ? undefined : findGitRoot(event.cwd));
    if (root === undefined) return EXIT_ALLOW;
    const manifest = workspaceManifest(root);
    // A branch that predates the practice holds nothing, and a session's or a turn's start says so (J-193 S1).
    if (manifest === undefined && (event.kind === "session-start" || event.kind === "turn-start")) {
      const predating = predatingBranch(root);
      if (predating !== undefined)
        writer.stdout.write(
          contextOutput(
            parsed.harness,
            event,
            `${predatesLine(predating.branch, predating.base)}\n`,
          ),
        );
      return EXIT_ALLOW;
    }
    // No workspace, or the adapters turned off: nothing is read or written.
    if (manifest === undefined || !manifest.hooks.adapters) return EXIT_ALLOW;
    // A turn's start is counted first, so a hook cut anywhere after it leaves a turn that reads as begun without its mirror (J-225 S1).
    if (event.kind === "turn-start" && event.session !== null)
      try {
        startTurn(root, event.session, event.at);
      } catch {
        // A count greenline cannot write leaves the turn read as the one before.
      }
    const facts = branchFacts(root);
    const change = changeOfBranch(facts.current, facts);
    const base = event.cwd ?? root;
    // The checkout the call acts in, a worktree of the change's own among them, takes the change's facts (J-215 S1).
    const work = actingCheckout(root, event, base);
    const workFacts = work === root ? facts : branchFacts(work);
    const acting = work === root ? change : changeOfBranch(workFacts.current, workFacts);
    // A change of a linked worktree the session writes in, a refused write among its writes, is noted, so its
    // turn's end notes the ask there too; a read, a command's directory or a change's id named enrols none (J-223 S1).
    if (event.session !== null)
      for (const at of worktreesWritten(root, event, base)) {
        const there = branchFacts(at);
        const owner = changeOfBranch(there.current, there);
        if (owner !== undefined) noteFrameActing(root, event.session, owner.id, at);
      }
    // The guardrails, before the shell runs a command that throws work away or rewrites a branch (J-114 S3).
    const text = event.kind === "before-tool" ? event.command?.text : undefined;
    const guarded =
      text === null || text === undefined
        ? undefined
        : guardOf(
            text,
            event.command === null || event.command.dir === null
              ? base
              : resolve(base, event.command.dir),
            root,
            at,
            // A lifting line's words are the owner's journaled words (J-176 S1).
            event.session === null ? { kept: false } : ownerJournal(root, event.session),
            // The record a commit carries is read against the definition, as status reads it (J-208 S1).
            env.line ?? (() => undefined),
          );
    const guard = guarded?.refusal;
    if (guard !== undefined) {
      if (acting !== undefined) logEvent(work, acting.id, event);
      writer.stderr.write(`${guard}, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    // The agent's sync in a checkout without greenline's git hooks waits for a turn of the owner's (J-224 S1).
    const syncHeld =
      text === null || text === undefined
        ? undefined
        : syncRefusal(
            text,
            event.command === null || event.command.dir === null
              ? base
              : resolve(base, event.command.dir),
            root,
            event.session,
          );
    if (syncHeld !== undefined) {
      if (acting !== undefined) logEvent(work, acting.id, event);
      writer.stderr.write(`${syncHeld}, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    // A command whose words write the ledger's machine-written files or a picture under the ledger (J-173 S1).
    const ledger =
      text === null || text === undefined
        ? undefined
        : ledgerShellRefusalOf(
            text,
            event.command === null || event.command.dir === null
              ? base
              : resolve(base, event.command.dir),
            root,
          );
    if (ledger !== undefined) {
      if (acting !== undefined) logEvent(work, acting.id, event);
      writer.stderr.write(`${ledger}, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    // A kill by name or pattern, or of a pid the session did not start, before the shell runs it (J-148 S1).
    const kill =
      text === null || text === undefined ? undefined : killGuard(root, text, event.session);
    if (kill !== undefined) {
      if (acting !== undefined) logEvent(work, acting.id, event);
      writer.stderr.write(`${kill}, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    noteSkillUse(work, event, base, acting, env);
    // The classes of the files a tool reads or writes, for the situation's floors; no path's name is kept (J-176 S1).
    if (event.kind === "before-tool" && event.session !== null)
      try {
        noteSeen(
          root,
          event.session,
          [...(event.read?.paths ?? []), ...(event.write?.paths ?? [])].flatMap(
            (path) => fromRoot(root, path, base) ?? [],
          ),
        );
      } catch {
        // A class greenline cannot note leaves the situation's floors as they stood.
      }
    // A deal the owner's words did not ask for, a seed scan or an unasked reroll, waits (J-149 S4).
    const dealt =
      text === null || text === undefined || event.session === null
        ? undefined
        : dealWordsRefusal(
            text,
            ownerWords(root, event.session),
            change !== undefined && namesReroll(keptDealAsk(root, change.id) ?? ""),
          );
    if (dealt !== undefined) {
      if (acting !== undefined) logEvent(work, acting.id, event);
      writer.stderr.write(`${dealt}; deal-words, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    // The command goes on: the lines its git acts were lifted by are spent on them (J-173 S1).
    for (const { root: where, change: id, lifts } of guarded?.spends ?? [])
      try {
        noteLifts(where, id, lifts);
      } catch {
        // A lift greenline cannot note leaves the line as it stood.
      }
    // The reply's pictures counted at the turn's end, where the harness hands its text (J-129 S6).
    if (event.kind === "turn-end" && event.session !== null)
      readTurnEnd(
        root,
        parsed.harness,
        payload,
        event.session,
        env.modes?.() ?? env.line?.()?.modes.map((mode) => mode.name) ?? [manifest.proceed],
        change?.id,
        at,
      );
    // Codex's helpers, fresh or forked, read from the session's rollout at its turn's end (J-176 S1), logged in the
    // linked worktree of the change the session holds where the hook's checkout holds none (J-228 S1).
    const spawned =
      change === undefined && parsed.harness === "codex" && event.kind === "turn-end"
        ? heldWorktree(root, event.session)
        : undefined;
    noteRolloutSpawns(
      spawned?.root ?? root,
      parsed.harness,
      event,
      payload,
      spawned?.change ?? change,
      base,
    );
    // The inspector a server run started in the turn, which Codex hands no after-tool while it serves (J-151 S2).
    noteTurnInspector(root, parsed.harness, event, change);
    // A turn's start noted for its end's reading of the rubric turn (J-134 S1).
    if (event.kind === "turn-start" && event.session !== null) {
      // The owner's words kept for the turn's holds, and a deal answered in them picked (J-149 S4).
      readOwnerWords(root, payload, event.session, change?.id, at);
      try {
        noteTurnStart(root, event.session, change?.id);
      } catch {
        // A start greenline cannot note leaves the turn unread.
      }
    }
    // A manifest naming a file its commit does not hold is refused at the write (J-147 S3).
    const absent =
      event.kind === "before-tool" && event.write !== null
        ? manifestFilesRefusal(root, payload, base)
        : undefined;
    if (absent !== undefined) {
      if (acting !== undefined) logEvent(work, acting.id, event);
      writer.stderr.write(`${absent}, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    const setting: ProceedSetting = {
      proceed: manifest.proceed,
      modes: env.modes ?? (() => undefined),
    };
    if (event.kind === "session-start" || event.kind === "turn-start") {
      // The change the session holds in a linked worktree, where the hook's checkout holds none: the mirror is read there (J-228 S1).
      const held = change === undefined ? heldWorktree(root, event.session) : undefined;
      const here = held?.root ?? root;
      const own = held?.change ?? change;
      if (own !== undefined) logEvent(here, own.id, event);
      // The row the session's payload names, noted for status and the viewer (J-151 S1).
      const surface = sessionSurface(parsed.harness, payload, base);
      // The model facts kept with it, which git's hooks read for the agent line (J-192 S1).
      if (event.session !== null)
        noteSurface(root, event.session, surface, sessionModelFacts(payload, base));
      const proceed = proceedOwed(root, event, manifest, own);
      const turn = event.kind === "turn-start" ? event.session : null;
      // What the turn's reply owes, noted before the mirror, so a start hook cut inside it loses no reply check (J-199 S1, J-225 S1).
      if (turn !== null) noteTurnOwed(root, turn, proceed, undefined);
      // A previous turn that began without its mirror, where no later event of it could print one (J-225 S1).
      const delivers = takesContextAt(parsed.harness, event.kind);
      const missed =
        turn !== null && delivers && mirrorMissed(root, turn, "previous")
          ? startMissedLine("previous")
          : undefined;
      const printed = mirror(
        here,
        parsed.harness,
        held === undefined ? manifest : (workspaceManifest(here) ?? manifest),
        held?.branch ?? facts.current,
        own,
        env.line,
        event.session,
        own === undefined ? undefined : sessionModel(payload, base),
        surface,
        env.installation,
        proceed,
        event.kind,
        missed,
        held?.path,
      );
      // The address the mirror's View row printed, which the reply carries (J-199 S1).
      if (turn !== null && printed.view !== undefined)
        noteTurnOwed(root, turn, proceed, printed.view);
      // The hooks line shown, from which the agent's sync waits for a turn of the owner's (J-224 S1).
      if (event.session !== null)
        try {
          if (hooksNotInstalled(root, manifest.hooks))
            noteHooksShown(root, event.session, event.kind);
        } catch {
          // A showing greenline cannot note leaves the sync's hold to begin at its refusal.
        }
      writer.stdout.write(contextOutput(parsed.harness, event, printed.text));
      // The mirror reached stdout: the turn began with it (J-225 S1).
      if (turn !== null && delivers)
        try {
          noteMirrorDelivered(root, turn);
        } catch {
          // A note greenline cannot write leaves the turn read as one without its mirror.
        }
      return EXIT_ALLOW;
    }
    // A turn that began without its mirror, printed at its first after-tool event that carries context (J-225 S1).
    const late = lateMirror(root, parsed.harness, event, manifest, facts.current, change, env);
    // A shell command's start, noted by its call whatever change is open, for its writes after it (J-135 S2).
    noteCommandStart(root, event);
    // The processes a background command started, noted for the session before its start is read away (J-148 S1).
    noteBackgroundStarts(root, event, payload, acting?.id);
    // A shell command's writes under the homes are the hooks' facts in every class (J-135 S2).
    const shell = shellWrites(root, work, acting?.id, event);
    if (shell !== undefined) followShellWrites(work, parsed.harness, event, shell.homes);
    // A shell command seen after it ran to have written in a linked worktree enrols that change too (J-223 S1).
    if (
      shell !== undefined &&
      work !== root &&
      acting !== undefined &&
      event.session !== null &&
      shell.homes.length + shell.interface.length > 0
    )
      noteFrameActing(root, event.session, acting.id, work);
    // A resume's first write that leaves the record stopped, named after the tool for the agent to set open; no hook writes a line of the record (J-149 S3, J-176 S1).
    const kept =
      event.kind === "after-tool"
        ? resumeNotice(work, event, acting, shell?.homes ?? [], base)
        : undefined;
    // A card whose first option is not the marked one, named once: now where the harness takes the after-tool's context, else at the next turn's mirror (J-149 S2).
    const named = cardsLine(event, payload);
    // A card's answer is the owner's word this turn, a reroll asked on the deal's card among them (J-149 S4).
    if (
      event.kind === "after-tool" &&
      event.session !== null &&
      CARD_TOOLS.has(event.tool?.name ?? "")
    )
      try {
        // The card is the restatement's ask where a careful frame stands whole, noted before its answers (J-223 S1).
        noteFrameAsk(root, event.session, change?.id, at);
        noteOwnerWords(root, event.session, cardAnswers(payload));
        journalOwner(root, event.session, cardAnswers(payload), at);
      } catch {
        // An answer greenline cannot keep leaves the turn's words as they were.
      }
    // A write into a change's folder of the visual home the command's words hid, named after the tool, never refused (J-227 S1).
    const hidden =
      event.kind === "after-tool" && shell !== undefined
        ? hiddenWriteLine(event.command?.text ?? "", shell.homes)
        : undefined;
    // The close's pin, at the write that sets the record done alone, naming what it moved and kept (J-147 S3, J-216 S1).
    const pinned =
      event.kind === "after-tool"
        ? closePinNotice(work, event, shell?.homes ?? [], base)
        : undefined;
    // Where the harness takes no after-tool context, the record's and the cards' lines go to the next turn's mirror (J-149 S2, S3).
    if (!takesAfterToolContext(parsed.harness) && event.session !== null)
      for (const owed of [kept, named, pinned, hidden])
        if (owed !== undefined)
          try {
            noteCards(root, event.session, owed);
          } catch {
            // A note greenline cannot write leaves the line unsaid.
          }
    // The stop's commit a write that set the record stopped owes, said now where the harness takes the after-tool's context; elsewhere the next turn's mirror says it in the same words until the commit stands (J-210 S1).
    const stop =
      event.kind === "after-tool" && kept === undefined
        ? stopCommitNotice(work, event, shell?.homes ?? [], base)
        : undefined;
    const recordLines =
      kept === undefined &&
      named === undefined &&
      stop === undefined &&
      pinned === undefined &&
      hidden === undefined
        ? undefined
        : [kept, named, stop, pinned, hidden].filter((text) => text !== undefined).join("\n");
    // The frame map follows a record a write tool wrote too, the write that stops it among them.
    if (event.kind === "after-tool" && event.write !== null)
      try {
        for (const id of recordsWritten(work, event.write.paths, base))
          writeFrameMap(work, id, "greenline event");
      } catch {
        // A map greenline cannot write leaves the tool as it is.
      }
    if (acting === undefined) {
      const refusal = writesRefusal(root, facts, change, event, base, setting, payload);
      if (refusal === undefined) {
        // A declared check run plainly with no change acting is named, never refused (J-226 S1).
        const plain =
          event.kind === "after-tool" ? plainRunLine(root, manifest, event, base) : undefined;
        if (plain !== undefined && !takesAfterToolContext(parsed.harness) && event.session !== null)
          try {
            noteCards(root, event.session, plain);
          } catch {
            // A note greenline cannot write leaves the run unnamed.
          }
        const lines = [late, recordLines, plain].filter((each) => each !== undefined).join("\n");
        if (lines !== "") writer.stdout.write(afterToolOutput(parsed.harness, event, lines));
        deliverLate(root, event, late);
        return EXIT_ALLOW;
      }
      writer.stderr.write(`${refusal}, greenline's harness hook\n`);
      return EXIT_REFUSE;
    }
    // A direct run of the interface check counts as its run, as the mirror holds the change to it.
    // The worktree's own manifest declares its checks, its branch's commit holding it (J-215 S1).
    const workManifest = work === root ? manifest : (workspaceManifest(work) ?? manifest);
    const check =
      event.command === null
        ? undefined
        : checkOf(work, heldChecks(workManifest, workingRecord(work, acting.id)), event, base);
    const matched: NormalisedEvent = check === undefined ? event : { ...event, check: check.name };
    // The commit and tree a matched run starts on, for its record at the after-tool event.
    if (event.kind === "before-tool" && check !== undefined)
      logEvent(work, acting.id, { ...matched, opened: codeNow(work) });
    else
      logEvent(work, acting.id, startedBy(work, acting.id, matched, parsed.harness, payload, env));
    if (event.kind === "after-tool" && check !== undefined)
      recordRun(work, acting, matched, check, base, env);
    if (event.kind === "after-tool") {
      // Who wrote a visual, a fresh agent or the session itself, recorded in its manifest where the harness names its agents (J-129 S6).
      if (event.agent !== null || namesItsAgents(parsed.harness))
        recordMakers(
          work,
          (event.write?.paths ?? []).flatMap((path) => fromRoot(work, path, base) ?? []),
          event.agent === null ? "session" : "agent",
        );
      followVisuals(work, acting.id);
      // The visuals' reaches, the documents kept and the close's pin (J-147 S1 and S3).
      followHome(
        work,
        acting.id,
        [
          ...(event.write?.paths ?? []).flatMap((path) => fromRoot(work, path, base) ?? []),
          ...(shell?.homes ?? []),
        ],
        documentsWrittenSince(work, shell?.since),
      );
      // The frame map follows the record's frame section, whatever wrote it (J-117 S1).
      writeFrameMap(work, acting.id, "greenline event");
      // The static interface rules on the files written, returned as context in code with no model (J-123 S4).
      // A shell command's writes are the interface files it changed while it ran (J-133 S1).
      const written =
        shell === undefined
          ? (event.write?.paths ?? []).flatMap((path) => fromRoot(work, path, base) ?? [])
          : shell.interface;
      const findings =
        written.length === 0
          ? undefined
          : findingsAfterWrite(work, written, acting.id, shell !== undefined);
      // Where the harness takes no after-tool context, the findings go to the next turn's mirror (J-148 S3, F12).
      if (
        findings !== undefined &&
        !takesAfterToolContext(parsed.harness) &&
        event.session !== null
      )
        try {
          noteCards(root, event.session, findings);
        } catch {
          // A note greenline cannot write leaves the findings to the check's own run.
        }
      // The habits a build owes, named once at the change's first code write (J-134 S3).
      const habits = owedAtFirstWrite(work, workManifest, acting.id, written, event, env);
      // The operator's rabbithole phrase, once per change, on the third edit of the same files since the last passing recorded check (J-195 S3).
      const nudge =
        event.write === null ? undefined : rabbitholeNudge(work, acting.id, event.session);
      // A helper's report the tool wrote, read for its brief's nonce, anticipate's as review's (J-192 S1).
      const reports = reportNotices(work, acting.id, [
        ...(event.write?.paths ?? []).flatMap((path) => fromRoot(work, path, base) ?? []),
        ...(shell?.homes ?? []),
      ]);
      if (reports !== undefined && !takesAfterToolContext(parsed.harness) && event.session !== null)
        try {
          noteCards(root, event.session, reports);
        } catch {
          // A note greenline cannot write leaves the report to the mirror's hints.
        }
      const context = [late, findings, habits, nudge, reports, recordLines]
        .filter((text) => text !== undefined)
        .join("\n");
      if (context !== "") writer.stdout.write(afterToolOutput(parsed.harness, event, context));
      deliverLate(root, event, late);
    }
    const refusal = writesRefusal(root, facts, change, event, base, setting, payload);
    if (refusal === undefined) return EXIT_ALLOW;
    writer.stderr.write(`${refusal}, greenline's harness hook\n`);
    return EXIT_REFUSE;
  } catch (error) {
    writer.stderr.write(
      `greenline event: greenline's own error, so the tool goes on: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT_ALLOW;
  }
}
