import { NO_CHECKS_LINE, gitHooksLine, type HooksReport } from "./adapters.ts";
import { checkWhere, isRunOf, type DeclaredCheck } from "./checks.ts";
import type { CheckFacts, HookRun } from "./facts.ts";
import { factsBlock, type FactName, type FactRow } from "./facts-table.ts";
import { recordPath, type RecordFacts } from "./git-hooks.ts";
import { waitingOn } from "./progress.ts";
import { joined, REAL_STOP, waitAnswer } from "./record-lines.ts";
import {
  firstOfEach,
  COST_COUNTS,
  METHOD_AGENTS_NOWHERE,
  methodAgentsWords,
  type AgentLine,
  type MethodAgents,
} from "./method-agents.ts";

/**
 * The status mirror (N-56 item 5; `docs/SPEC.md` §4, `greenline event`):
 * the few lines `greenline event` prints into the harness's context at a
 * session's and a turn's start, and the nudges `status` shows beside a
 * change. It states the open change, its mode and its "next" line, the
 * facts table the reply copies (`./facts-table.ts`, J-144 S1), each
 * declared check's latest run, the fresh agents the events counted beside
 * the record's cost, the skills its loads name (J-116 S3), the open and
 * parked discussions (J-118 S2), the orientation while no change record
 * exists (J-129 S1), the branches cut before the install (J-213 S1), git
 * hooks that are absent, and last the progress line
 * on the steps of the change's line (`./progress.ts`). Every line is a fact
 * and a nudge, never a refusal. It reads no installation itself; the facts
 * table and the progress line are computed before it from the record and
 * the modes definition, which the event loads only at a turn's start with a
 * change open.
 */

/** One declared check's latest run, from `check`'s facts or a hook's record, the newer of the two. */
export interface CheckStanding {
  readonly check: DeclaredCheck;
  readonly latest:
    | {
        readonly by: "check";
        readonly outcome: "passed" | "failed" | "started";
        readonly at: string;
      }
    | {
        readonly by: "hook";
        readonly outcome: "ok" | "failed" | "unknown";
        readonly harness: string;
        readonly at: string;
      }
    | undefined;
}

function checkOutcome(facts: CheckFacts): "passed" | "failed" | "started" {
  if (facts.state === "started") return "started";
  return facts.outcome.kind === "exited" && facts.outcome.code === 0 ? "passed" : "failed";
}

/**
 * Each declared check with its latest run: the newest `check` fact that is
 * its run, read by its name, its command and its directory, or the newest
 * run a hook recorded of it, whichever started later; a probe is no run.
 * @param checks the declared checks
 * @param facts the change's check facts
 * @param hookRuns the change's hook-recorded runs
 * @returns one standing per declared check, in the manifest's order
 */
export function checkStandings(
  checks: readonly DeclaredCheck[],
  facts: readonly CheckFacts[],
  hookRuns: readonly HookRun[],
): readonly CheckStanding[] {
  return checks.map((check) => {
    const byCheck = facts
      .filter((fact) => fact.probe !== true && isRunOf(check, fact))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    const byHook = hookRuns
      .filter((run) => run.check === check.name)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    if (byCheck === undefined && byHook === undefined) return { check, latest: undefined };
    if (byHook === undefined || (byCheck !== undefined && byCheck.startedAt >= byHook.startedAt))
      return byCheck === undefined
        ? { check, latest: undefined }
        : {
            check,
            latest: { by: "check", outcome: checkOutcome(byCheck), at: byCheck.startedAt },
          };
    return {
      check,
      latest: {
        by: "hook",
        outcome: byHook.outcome.kind,
        harness: byHook.harness,
        at: byHook.startedAt,
      },
    };
  });
}

/**
 * The fresh agents the change's events counted against the mode's limit:
 * the agents the harness reported starting, or stopping where it reports no
 * start, as Droid does, each by its id once, so a reviewer resumed for a
 * recheck is no second agent (J-144 S4), less the agents a method started,
 * which are counted nowhere (J-134 S2, `./method-agents.ts`).
 * @param lines the change's raw events, in order, each with the method its start names and the agent's id
 * @returns the count
 */
export function agentsCounted(lines: readonly AgentLine[]): number {
  const starts = firstOfEach(lines, "agent-start");
  const stops = firstOfEach(lines, "agent-stop").length;
  const byMethod = starts.filter(
    (line) => line.method !== undefined && line.method !== null,
  ).length;
  return Math.max(0, Math.max(starts.length, stops) - byMethod);
}

/**
 * The nudge a record's cost earns beside the agents the events counted: at
 * close, a record whose `agents` is not the builder and the counted agents.
 * @param record the record's lines
 * @param counted the fresh agents counted
 * @param byMethods the agents the methods started, which a record may count too
 * @returns the nudge, or undefined
 */
function agentsNudge(record: RecordFacts, counted: number, byMethods: number): string | undefined {
  if (record.state !== "done" || counted === 0) return undefined;
  // A record that counted the methods' agents too agrees with its events, as status reads it (J-134 S2).
  if (record.agents === counted + 1 || record.agents === counted + 1 + byMethods) return undefined;
  return `the events counted ${String(counted)} fresh agent${counted === 1 ? "" : "s"} and the record states agents: ${record.agents === undefined ? "none" : String(record.agents)}; ${COST_COUNTS}`;
}

/**
 * The nudge a record owes when its close is written and it is not finished:
 * the close with no done the turn's end leaves for the next turn's start.
 * @param record the record's lines
 * @returns the nudge, or undefined
 */
function closeNudge(record: RecordFacts): string | undefined {
  if (record.closeWritten !== true || record.state === "done" || record.state === "dropped")
    return undefined;
  return "its close section is written and its state is not done: set done once its checks are green, or say in the record why it stays open.";
}

/**
 * One declared check's standing as a line of text.
 * @param standing the check and its latest run
 * @returns the line, indented two spaces
 */
export function standingLine(standing: CheckStanding): string {
  const { check, latest } = standing;
  if (latest === undefined) return `  ${check.name} (${checkWhere(check)}): no recorded run`;
  if (latest.by === "check")
    return `  ${check.name} (${checkWhere(check)}): ${latest.outcome}, recorded by greenline check`;
  return `  ${check.name} (${checkWhere(check)}): ${latest.outcome === "ok" ? "ran green" : latest.outcome === "failed" ? "ran red" : "ran, its outcome unknown"} by the ${latest.harness} hook; only a run through greenline check counts for the close`;
}

/** What the mirror shows. */
export interface MirrorInput {
  /** The open change, or undefined when none is; its progress line where its record holds a step its mode runs. */
  readonly change:
    | {
        readonly id: string;
        readonly record: RecordFacts | undefined;
        readonly progress?: string | undefined;
      }
    | undefined;
  readonly checks: readonly CheckStanding[];
  readonly declared: number;
  readonly agents: number;
  /** The agents each method started, which the count leaves out (J-134 S2); none where no start names a method. */
  readonly methodAgents?: readonly MethodAgents[];
  readonly git: HooksReport["git"];
  /** The visuals and the atlas pages whose covered files changed since their commits (J-110 S3). */
  readonly drift?: { readonly visuals: number; readonly pages: number };
  /** The atlas line (`./atlas.ts`, `atlasLine`): none with the first offer's standing, or the pages, the drifting ones and the map's commits behind (J-147 S1). */
  readonly atlas?: string | undefined;
  /** The docs line: the indexed documents drifting, undefined where no documents index stands (J-147 S1). */
  readonly docs?: string | undefined;
  /** The visuals whose file loads an address outside the repository, GL0608's line, undefined while none does (J-147 S3). */
  readonly reaches?: string | undefined;
  /** The lines the open change's record still lacks (`./record-lines.ts`, `lackingLine`), undefined while it lacks none (J-176 S1). */
  readonly lacking?: string | undefined;
  /** The helpers the hooks saw start, fresh or forked (`./method-agents.ts`, `helpersLine`), a hint the agent reconciles; undefined while none did (J-176 S1). */
  readonly helpers?: string | undefined;
  /** The hooks' facts the record's lines disagree with, each a notice and never a refusal (J-176 S1). */
  readonly hints?: string | undefined;
  /** The situation the proposal answers (`./situation.ts`, `situationLine`), while a request is read or a change is open (J-176 S1). */
  readonly situation?: string | undefined;
  /** The skills the change owes by their trigger rows, in weight order within the mode's reading budget (`./owed.ts`, `owedLine`), undefined where none is owed (J-176 S1). */
  readonly owed?: string | undefined;
  /** The running surface's `renders` fact, printed at every turn (J-110 S4). */
  readonly renders?: string | undefined;
  /** The running surface's `worktree` fact, whether the harness gives a native worktree tool (J-114 S1). */
  readonly worktree?: string | undefined;
  /** The running surface's `questions` fact, where frame's questions go, `cards` or `reply` (J-117 S2). */
  readonly questions?: string | undefined;
  /** The orientation line (`./situation.ts`, `orientationText`) while no change is open and no change record exists (J-129 S1). */
  readonly orientation?: string | undefined;
  /** The ground line (`./ground.ts`): the open change's ground and agent, or the manifest's standing choice while none is open (J-114 S1). */
  readonly ground?: string | undefined;
  /** The remote line (`./situation.ts`, `remoteText`): the remote and whether it is a forge, which the landing's offer reads (J-130 S1). */
  readonly remote?: string | undefined;
  /** The open change's skill loads as one line (`./skill-loads.ts`, `loadsLine`), undefined while it has none (J-116 S3). */
  readonly skills?: string | undefined;
  /** The habits a build owes that no load of the change holds (`./habits-owed.ts`, `habitsLine`), undefined while none is owed or the change is not at build (J-134 S3). */
  readonly habits?: string | undefined;
  /** The open and parked discussions as one line (`./discussion.ts`, `discussionsLine`), undefined while none is (J-118 S2). */
  readonly discussions?: string | undefined;
  /** The open change's interface line (`./interface-fact.ts`, `interfaceLine`), undefined where the workspace has no interface roots (J-123 S1). */
  readonly interface?: string | undefined;
  /** The open change's latest interface check by tier (`./interface-check.ts`, `interfaceChecksLine`), undefined where none ran (J-123 S4). */
  readonly interfaceChecks?: string | undefined;
  /** The open interface change's pages still uncaptured (`./interface-pages.ts`, `renderOwedLine`), undefined where none is owed (J-133 S1). */
  readonly interfaceRender?: string | undefined;
  /** The deal view's pick while the design section does not name it (`./design-pick.ts`, `designPickLine`), undefined where none waits (J-123 S7). */
  readonly designPick?: string | undefined;
  /** The open marks on captures, by address, the stale ones named (`./marks.ts`, `marksLine`), undefined while none is open (J-124 S2). */
  readonly marks?: string | undefined;
  /** The previous turn's picture past its cap or owed at a rubric turn (`./pictures.ts`, `pictureLine`), undefined where none was noted (J-129 S6, J-134 S1). */
  readonly picture?: string | undefined;
  /** The after-tool lines the previous turn owed where its harness took no after-tool context: a card asked with no marked first option, a record line the hooks wrote (J-149 S2, S3). */
  readonly cards?: string | undefined;
  /** A turn that began without its mirror (`startMissedLine`, J-225 S1): this one, where a later event prints the mirror, or the previous one; undefined elsewhere. */
  readonly startMissed?: string | undefined;
  /** The `proceed` setting at a turn that opens on the owner's words with no change open, where it lets a request go on (`proceedLine`, J-206 S1); undefined elsewhere, and in `greenline status`. */
  readonly proceed?: string | undefined;
  /** What the previous turn's reply lacked of what its turn owed: the address its turn printed, the first reply's mode line under `proceed` (`./pictures.ts`, J-199 S1). */
  readonly replyLacks?: readonly string[] | undefined;
  /** The one stopped change's wait while the branch holds no change of its own (`waitingLine`), undefined where none waits (J-149 S3). */
  readonly waiting?: string | undefined;
  /** The owner's message of the turn, as the hooks journaled it, which the open change's waiting line reads (J-205 S1); undefined where none stands. */
  readonly turnWords?: string | undefined;
  /** The open change's shown patch the checkout lacks, by its path from the root, which its waiting line names (J-214 S1, `shownPatchOwed`); undefined where none is owed. */
  readonly shownPatch?: string | undefined;
  /** A record that reads stopped while the session that wrote it goes on (`stoppedHeldLine`), undefined where none does (J-200 S1). */
  readonly stoppedHeld?: string | undefined;
  /** The stop's commit each record that reads stopped owes while no commit holds it (`stopCommitLine`), undefined where none does (J-210 S1). */
  readonly stopCommit?: string | undefined;
  /** The landing's state of a change the session holds whose close has run (`landingLine`), undefined where none is (J-202 S1). */
  readonly landing?: string | undefined;
  /** The visuals the session made itself, undefined while none is (J-129 S6). */
  readonly sessionMade?: string | undefined;
  /** The facts table's rows while a change is open (`./facts-table.ts`, J-144 S1), its `View` row the page the turn calls for (J-142 S2). */
  readonly facts?: readonly FactRow[] | undefined;
  /**
   * The linked worktree the mirror was read from, by its path from the main
   * checkout's root, where the hook's checkout holds no change and the change
   * the session holds is open on that worktree's branch (J-228 S1, the run
   * j217t-conduct-interface, whose Codex session stood in the main checkout);
   * undefined elsewhere.
   */
  readonly heldIn?: string | undefined;
  /** The changes open in other checkouts git lists (`./situation.ts`, `openElsewhereText`), undefined while none is (J-143 S2). */
  readonly openElsewhere?: string | undefined;
  /** The branches cut before the install (`./situation.ts`, `predatingText`), undefined while none is named (J-213 S1). */
  readonly predating?: string | undefined;
  /** The adapter's instructions beside the block (`./adapters.ts`, `adapterInstructions`), Codex's rule on the owner's words (J-144 S3). */
  readonly instructions?: string | undefined;
}

/** The fact a line of the mirror states (J-142 S1). */
export type MirrorFact =
  | "change"
  | "orientation"
  | "predating"
  | "facts"
  | "mode"
  | "step"
  | "progress"
  | "waiting"
  | "landing"
  | "view"
  | "picture"
  | "cards"
  | "start-missed"
  | "reply-lacks"
  | "proceed"
  | "ground"
  | "remote"
  | "interface"
  | "interface-checks"
  | "interface-render"
  | "design-pick"
  | "skills"
  | "habits"
  | "choice"
  | "close"
  | "agents"
  | "agents-nudge"
  | "discussions"
  | "drift"
  | "atlas"
  | "docs"
  | "lacking"
  | "helpers"
  | "hints"
  | "situation"
  | "owed"
  | "marks"
  | "session-made"
  | "reaches"
  | "surface"
  | "instructions"
  | "checks"
  | "check"
  | "git-hooks";

/**
 * The waiting line (J-149 S3; the ledger guide, "Stops and resumes"): what
 * an open or stopped record's "next" line waits on the owner for, the
 * `Waiting on` row's words, printed at a resume as at the stop. Read beside
 * the owner's message of the turn (J-205 S1, the run j196t-conduct-emptyb,
 * whose fresh session left the stopped change stopped after three
 * go-aheads while this line said the work went no further than the wait):
 * where the words answer the wait, the line says so and that the first
 * write sets a stopped record open. Where the next line names a wait on
 * the owner and the words resume the work without answering it (J-214 S1,
 * the run j196t-states-stop-2d, whose clone's agent read "Carry on with
 * that change." as the answer to the review's wait and implemented
 * unshown), the line says the work resumes, a stopped record set open at
 * the step the next line names, and the wait stands with its act first;
 * otherwise it names the wait as the record states it. Where the shell
 * found the folder's shown patch owed (`shownPatchOwed`), the line names
 * it beside the wait.
 * @param record the record's lines
 * @param stopped the stopped change's id, where the branch holds no change of its own and the line names it
 * @param words the owner's message of the turn, undefined where none stands
 * @param shown the folder's shown patch the checkout lacks, by its path from the root, undefined where none is owed
 * @returns the line, unindented, or undefined where it waits on no word of the owner's
 */
export function waitingLine(
  record: RecordFacts,
  stopped?: string,
  words?: string,
  shown?: string,
): string | undefined {
  const { state } = record;
  const waits = recordWait(record);
  if (waits === undefined) return undefined;
  const from = stopped === undefined ? "the record's" : `the stopped change ${stopped}'s`;
  const answer = recordAnswer(record, words);
  const tail =
    answer === undefined
      ? "the Waiting on row says it"
      : answer.kind === "resumed"
        ? resumedWords(answer, state === "stopped")
        : state === "stopped"
          ? ANSWERED
          : "the owner's words this turn answer it: rewrite the next line and go on";
  const patch = shown === undefined ? "" : `; ${shownPatchWords(shown)}`;
  return `waiting on: ${waits}, from ${from} next line; ${tail}${patch}`;
}

/** What the waiting line and the stopped fact say where the owner's words of the turn answer a stopped record's wait (J-205 S1). */
const ANSWERED =
  "the owner's words this turn answer it: set state open as the first write and go on";

/** What the owner's words of the turn do to a record's wait, the step its next line names beside a resume's standing wait (J-214 S1). */
export type RecordAnswer =
  | { readonly kind: "answered" }
  | {
      readonly kind: "resumed";
      /** The wait on the owner that still stands, in the next line's words. */
      readonly wait: string;
      /** The step the next line names, undefined where it names none. */
      readonly step?: string | undefined;
    };

/** The step a next line names, and the action after it. */
const NEXT_STEP = /^([a-z][a-z0-9-]*): /;

/**
 * The wait an open or stopped record's next line names (J-149 S3, J-222
 * S1, `waitingOn`, which reads every form `ownerWait` reads): its action,
 * or undefined where it waits on no word of the owner's.
 * @param record the record's lines
 * @returns the next line's action, or undefined
 */
function recordWait(record: RecordFacts | undefined): string | undefined {
  const next = record?.next;
  const state = record?.state;
  return next === undefined || (state !== "open" && state !== "stopped")
    ? undefined
    : waitingOn({ state, next });
}

/**
 * What the owner's message of the turn does to an open or stopped record's
 * wait (J-205 S1, J-214 S1, `waitAnswer`): answers it, resumes the work
 * while a wait on the owner stands, or neither.
 * @param record the record's lines
 * @param words the owner's message of the turn, undefined where none stands
 * @returns the answer, or undefined where the words do neither
 */
export function recordAnswer(
  record: RecordFacts | undefined,
  words: string | undefined,
): RecordAnswer | undefined {
  const next = record?.next;
  const answer = waitAnswer(recordWait(record), words, record?.state === "stopped");
  if (answer?.kind !== "resumed") return answer;
  return { ...answer, step: next === undefined ? undefined : NEXT_STEP.exec(next)?.[1] };
}

/**
 * Whether the owner's message of the turn answers or resumes a stopped
 * record (J-205 S1, J-214 S1): either way its first write sets it open.
 * @param record the record's lines
 * @param words the owner's message of the turn, undefined where none stands
 * @returns true where the words answer the record or resume it
 */
export function answersRecord(record: RecordFacts | undefined, words: string | undefined): boolean {
  return recordAnswer(record, words) !== undefined;
}

/**
 * What the waiting line and the stopped fact say where the owner's words
 * resume the work while a wait on the owner stands (J-214 S1): a stopped
 * record set open at the step its next line names, and the wait's act
 * first, what it waits on shown again where the checkout holds none of it.
 * @param answer the resume and its standing wait
 * @param stopped whether the record reads stopped
 * @returns the words
 */
function resumedWords(
  answer: Extract<RecordAnswer, { kind: "resumed" }>,
  stopped: boolean,
): string {
  const open = !stopped
    ? ""
    : `: set state open as the first write${answer.step === undefined ? "" : `, at ${answer.step}`}`;
  return `the owner's words this turn resume the work${open}; the wait on the owner stands, ${answer.wait}: do its act first, show again what it waits on where this checkout holds none, and wait for the owner's answer to it`;
}

/**
 * The name of the patch a stop keeps in the record's folder (J-214 S1, the
 * run j196t-states-stop-2d F2): the uncommitted edits the owner saw, which
 * the stop's commit carries as a file of the folder, so a clone finds them.
 */
export const SHOWN_PATCH = "shown.patch";

/**
 * The words naming the folder's shown patch beside the wait (J-214 S1).
 * @param path the patch's path from the root
 * @returns the words
 */
function shownPatchWords(path: string): string {
  return `the folder's ${SHOWN_PATCH} holds the edits the owner saw: apply it before the wait's act, \`git apply ${path}\``;
}

/**
 * The line the mirror and `greenline status` print where a record reads
 * stopped while the session that wrote it goes on (J-200 S1, the run
 * j196t-states-stop-2, whose agent set the record stopped to wait for the
 * owner's review): a wait leaves the record open, and a stop stands only on
 * the owner's words that ended the work, quoted in its stopped line. Where
 * the owner's words of the turn answer it (J-205 S1), the line says so and
 * that the first write sets the record open; where they resume the work
 * while a wait on the owner stands (J-214 S1), it says the wait's act
 * comes first.
 * @param id the change
 * @param stopped the record's stopped line, undefined where it states none
 * @param answer what the owner's message of the turn does to the record (`recordAnswer`)
 * @returns the line, unindented
 */
export function stoppedHeldLine(
  id: string,
  stopped: string | undefined,
  answer?: RecordAnswer,
): string {
  const held = `stopped: ${recordPath(id)} reads stopped while this session still holds the change`;
  if (answer?.kind === "answered") return `${held}; ${ANSWERED}`;
  if (answer?.kind === "resumed") return `${held}; ${resumedWords(answer, true)}`;
  return `${held}; ${REAL_STOP}${stopped === undefined ? ", and its stopped line stands nowhere" : ""}; set state: open and wait with it open, unless the owner's words end the work, quoted whole in its stopped line`;
}

/**
 * Whether a commit holds a record's stop (J-210 S1, the run
 * j196t-states-stop-2c, whose agent set the record stopped on the owner's
 * words and committed nothing, the record and its folder left untracked):
 * a record that reads stopped is held where HEAD's commit holds it stopped
 * on the same stopped line, as git's pre-commit hook reads a stop already
 * committed (`stopVerdict`); a record HEAD holds in no state, or in
 * another, or stopped on other words, owes the stop's commit.
 * @param record the record's lines as the working tree holds them, undefined where it stands nowhere
 * @param head the record's lines as HEAD's commit holds them, undefined where it holds none
 * @returns true where the record reads stopped and no commit holds the stop
 */
export function stopCommitOwed(
  record: RecordFacts | undefined,
  head: RecordFacts | undefined,
): boolean {
  if (record?.state !== "stopped") return false;
  return !(head?.state === "stopped" && head.stopped === record.stopped);
}

/** The uncommitted edits outside a stopped record's folder (J-214 S1): the tracked files' and the untracked files the record names. */
export interface ShownEdits {
  readonly tracked: readonly string[];
  readonly untracked: readonly string[];
}

/**
 * The stop's commit fact (J-210 S1): what the after-tool hook says after
 * the write that sets a record stopped, and the mirror and `greenline
 * status` say until the commit stands, in the same words. No hook commits
 * for the agent: a clone and a fresh session carry commits alone, so the
 * agent commits the record and its folder in the stop's own turn. Where
 * the tree holds uncommitted edits outside the folder and the folder no
 * shown patch (J-214 S1, the run j196t-states-stop-2d F2, whose clone lost
 * the shown tests), the line names them and the patch the stop keeps of
 * them, with the git command that writes it: the tracked files' diff
 * against HEAD, each untracked file added as new.
 * @param id the change
 * @param shown the uncommitted edits outside the folder, where it holds no shown patch
 * @returns the line, unindented
 */
export function stopCommitLine(id: string, shown?: ShownEdits): string {
  const line = `stopped: ${recordPath(id)} reads stopped and no commit holds it; commit the record and its folder now, the stop's commit, since a clone and a fresh session carry commits alone`;
  if (shown === undefined || shown.tracked.length + shown.untracked.length === 0) return line;
  const patch = `.greenline/ledger/${id}/${SHOWN_PATCH}`;
  const commands = [
    ...(shown.tracked.length === 0
      ? []
      : [`git diff HEAD -- ${shown.tracked.map(shellPath).join(" ")}`]),
    ...shown.untracked.map((path) => `git diff --no-index /dev/null ${shellPath(path)}`),
  ].map((command, index) => `${command} ${index === 0 ? ">" : ">>"} ${patch}`);
  const paths = joined([...shown.tracked, ...shown.untracked]);
  return `${line}; uncommitted edits outside its folder: ${paths}; keep them as ${patch}, which the stop's commit carries, since a clone carries commits alone: \`${commands.join("; ")}\``;
}

/**
 * A path as a shell reads it: bare where it holds no character the shell
 * treats apart, else in single quotes.
 * @param path the path from the root
 * @returns the path for the command
 */
function shellPath(path: string): string {
  return /^[\w./@%+=:,-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}

/**
 * The landing's state as git and the record give it (J-202 S1): the
 * `landing` line's kind, the base's hold of the branch's head and the
 * change's checks on a merge commit; and, while the record carries no
 * landing line, the owner's journaled words since the offer that answer it
 * (J-209 S1).
 */
export type LandingState =
  /** The record carries no landing line: the base the landing would go to and whether it holds the branch's head. */
  | {
      readonly kind: "none";
      readonly base: BaseHold | undefined;
      /** The owner's latest words since the offer that answer it, undefined where none do (J-209 S1). */
      readonly asked?: LandingAsked | undefined;
      /** The offer's facts, read where a session is read, undefined where none is, as the inspector reads the state alone (J-228 S1). */
      readonly offer?: LandingOfferFacts | undefined;
    }
  /** The record carries no landing line, the base holds the change's last commit and no remote is a forge: nothing is to land (J-228 S1). */
  | { readonly kind: "nothing"; readonly base: string }
  /** The landing line holds the owner's answer that took no act. */
  | { readonly kind: "declined" }
  /** The landing line holds the owner's words for a merge into the base it names. */
  | {
      readonly kind: "merge";
      readonly base: BaseHold | undefined;
      /** The latest check of the change on a merge commit the base holds, undefined where none ran. */
      readonly checked: { readonly commit: string; readonly red: boolean } | undefined;
    }
  /** The landing line holds the owner's words for a push: the branch and its remote-tracking branch as git knows them. */
  | {
      readonly kind: "push";
      readonly branch: string | undefined;
      /** The branch's head, undefined where git names no branch of the change. */
      readonly head: string | undefined;
      /** The remote's name, undefined where the repository names none. */
      readonly remote: string | undefined;
      /** The remote-tracking branch's commit, undefined where git knows none. */
      readonly pushed: string | undefined;
      /** Whether the remote-tracking branch holds the branch's head. */
      readonly holds: boolean;
    };

/**
 * What decides the landing's offer (J-228 S1, the run j201t-linear-visuals,
 * whose closes offered the merge or the branch left with nothing named to
 * choose by and no review rule): the act the remote's kind gives, the push and the
 * pull request where it names a forge and the local merge where it names
 * none, and the contributing guide among the knowledge homes, whose review
 * rule is prose the CLI does not read.
 */
export interface LandingOfferFacts {
  readonly act: "merge" | "push";
  /** The contributing guide's path from the root, undefined where none stands. */
  readonly guide: string | undefined;
}

/** The owner's words since the landing's offer that answer it (J-209 S1): the act they ask for, or neither, and the turn they came at. */
export type LandingAsked =
  | { readonly kind: "merge"; readonly base: string; readonly turn: number }
  | { readonly kind: "push"; readonly turn: number }
  | { readonly kind: "decline"; readonly turn: number };

/**
 * What the owner's words since the offer ask and what comes next, in the
 * order the close page gives (J-209 S1, the run j196c-landing-4b, whose
 * agent read "none recorded" as a wait on the owner's "Merge it.").
 * @param asked the owner's answer
 * @returns the words after the state, unindented
 */
function askedWords(asked: LandingAsked): string {
  const at = `the owner's words at turn ${String(asked.turn)}`;
  switch (asked.kind) {
    case "merge":
      return `${at} ask for the merge into ${asked.base}: write the landing line in those words, merge, run the check on the merge commit, tell the red from its facts`;
    case "push":
      return `${at} ask for the push: write the landing line in those words, commit the record alone, then push the branch and open the pull request`;
    case "decline":
      return `${at} decline the landing: write the landing line in those words after "declined: ", name it in the close section and commit the record alone`;
  }
}

/** A base branch the landing goes to: its name, its commit, the change's branch and whether the base holds the branch's head. */
export interface BaseHold {
  readonly name: string;
  /** The base's commit, undefined where no local branch of that name stands. */
  readonly at: string | undefined;
  /** The change's branch, undefined where git names none, a branch deleted after its merge among them. */
  readonly branch: string | undefined;
  readonly holds: boolean;
}

/**
 * The offer in the close page's order (J-228 S1): the push and the pull
 * request where the remote is a forge, the local merge into the base where
 * it is not, then leaving the branch; where no contributing guide stands,
 * the act the remote and the base decide, `the facts decide:` and the act;
 * where one stands, its path and the close page's section "The landing",
 * the choice left to the agent's reading of the guide.
 * @param offer the offer's facts
 * @param base the base and the change's branch, undefined where no base stands
 * @returns the words after the state, unindented
 */
function offerWords(offer: LandingOfferFacts, base: BaseHold | undefined): string {
  const branch = base?.branch ?? "the change's branch";
  const act =
    offer.act === "push"
      ? `the push of ${branch} and its pull request`
      : base === undefined
        ? `the local merge of ${branch} into a base the owner names`
        : `the local merge of ${branch} into ${base.name}`;
  const choice = `offer: ${act}, or leave the branch`;
  return offer.guide === undefined
    ? `${choice}; the facts decide: ${act}`
    : `${choice}; ${offer.guide} stands: read it as the close page's section "The landing" says before the offer is answered`;
}

/** A commit as the landing line names it, short. */
function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** The base's hold of the branch, in words: `main at 6594a00 does not hold feature/x`, its commit left out where `at` is false. */
function holdWords(base: BaseHold | undefined, branch: string, at: boolean): string {
  if (base === undefined) return "no base branch stands here, nor a default branch git names";
  if (base.at === undefined) return `${base.name} stands nowhere here`;
  return `${base.name}${at ? ` at ${shortCommit(base.at)}` : ""} ${base.holds ? "holds" : "does not hold"} ${branch}`;
}

/**
 * The line the mirror and `greenline status` print for a change the session
 * holds whose close has run (J-202 S1, the run j196c-landing-4, whose agent
 * withheld the owner's merge on a red it foresaw from reading the base's new
 * commit): the landing's state read from the record and git, so the turn that
 * holds the owner's words also holds that no merge ran and no check stands
 * on a merge commit; while no landing line stands, the owner's words since
 * the offer that answer it and what comes next (J-209 S1). It never refuses.
 * @param id the change
 * @param state the landing's state
 * @returns the line, unindented
 */
export function landingLine(id: string, state: LandingState): string {
  switch (state.kind) {
    case "none": {
      const held = `landing: none recorded; ${holdWords(state.base, state.base?.branch ?? "the change's last commit", true)}`;
      if (state.asked !== undefined) return `${held}; ${askedWords(state.asked)}`;
      return state.offer === undefined ? held : `${held}; ${offerWords(state.offer, state.base)}`;
    }
    case "nothing":
      return `landing: nothing to land: the commits are on ${state.base}`;
    case "declined":
      return "landing: declined on the owner's words";
    case "merge": {
      const base = state.base;
      const name = base?.name ?? "the base";
      if (base?.holds === true && state.checked !== undefined)
        return `landing: merged into ${name}, checked at ${shortCommit(state.checked.commit)}${state.checked.red ? `, red; 'greenline status --change ${id}' names the red check (GL0404)` : ""}`;
      return `landing: merge into ${name} on the owner's words; ${holdWords(base, "the branch", false)}; the check on the merge commit owed`;
    }
    case "push": {
      const branch = state.branch ?? "the change's branch";
      if (state.remote === undefined)
        return `landing: push on the owner's words; no remote here, so git knows no push of ${branch}`;
      const tracking = `${state.remote}/${branch}`;
      if (state.pushed === undefined)
        return `landing: push on the owner's words; no ${tracking} here, so git knows no push of ${branch}`;
      const head = state.head === undefined ? "" : ` at ${shortCommit(state.head)}`;
      return state.holds
        ? `landing: push on the owner's words; ${tracking} holds ${branch}${head}`
        : `landing: push on the owner's words; ${tracking} at ${shortCommit(state.pushed)} does not hold ${branch}${head}`;
    }
  }
}

/**
 * The proceed line (J-206 S1, the run j196t-wait-proceed-1b, whose first
 * reply under `proceed: regular` asked a branch question and named no
 * mode, the lack named only at the next turn): printed at a turn's start
 * that opens on the owner's words with no change open, where the setting
 * lets a request for a change go on, so the reply's obligation stands
 * before the reply it binds; the turn's end still reads the reply for it
 * (`./pictures.ts`, `replyLacks`, J-199 S1).
 * @param setting the manifest's `proceed`, a mode's name
 * @returns the line, unindented
 */
function proceedLine(setting: string): string {
  return `proceed: ${setting} lets a request for a change go on; the first reply states the mode taken and its ground in one line before the first edit`;
}

/** One line of the mirror: the fact it states and its text as printed. */
export interface MirrorLine {
  readonly fact: MirrorFact;
  readonly text: string;
}

/** A count and its noun, singular for one. */
function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The drift line the mirror and `greenline status` print, or undefined while
 * nothing drifts: `drift: 2 visuals and 1 atlas page changed since their commits`.
 * @param visuals the visuals that drifted
 * @param pages the atlas pages that drifted
 * @returns the line, unindented
 */
export function driftLine(visuals: number, pages: number): string | undefined {
  if (visuals === 0 && pages === 0) return undefined;
  const parts = [
    ...(visuals === 0 ? [] : [counted(visuals, "visual")]),
    ...(pages === 0 ? [] : [counted(pages, "atlas page")]),
  ];
  const one = visuals + pages === 1;
  return `drift: ${parts.join(" and ")} changed since ${one ? "its commit" : "their commits"}`;
}

/**
 * The mirror's lines, each with the fact it states, in the order printed.
 * @param input what it shows
 * @returns the lines, indented as printed
 */
export function mirrorLines(input: MirrorInput): readonly MirrorLine[] {
  const lines: MirrorLine[] = [];
  const add = (fact: MirrorFact, text: string | undefined, indent = "  "): void => {
    if (text !== undefined) lines.push({ fact, text: `${indent}${text}` });
  };
  const { change } = input;
  if (change === undefined) {
    add(
      "change",
      "greenline: no open change. A request for a change is proposed and waits for the owner's yes; 'greenline status' lists the changes.",
      "",
    );
    // A change open in another checkout is named, so its work is not taken for none (J-143 S2).
    add("change", input.openElsewhere);
    add("orientation", input.orientation);
    // The branches cut before the install, named before the request's files are searched for (J-213 S1).
    add("predating", input.predating);
    // The situation a request read before its proposal answers, and the skills it owes (J-176 S1).
    add("situation", input.situation);
    add("owed", input.owed);
    // A stopped change's wait, where the branch names no change of its own (J-149 S3).
    add("waiting", input.waiting);
    // A stop written while the session goes on, which a wait leaves open (J-200 S1).
    add("waiting", input.stoppedHeld);
    // A stop no commit holds, which the stop's commit settles (J-210 S1).
    add("waiting", input.stopCommit);
    // A done change's landing, from its record and git, beside the owner's words (J-202 S1).
    add("landing", input.landing);
    add("ground", input.ground);
    add("remote", input.remote);
    // The previous turn's picture past its cap or owed (J-129 S6, J-134 S1).
    add("picture", input.picture);
    add("cards", input.cards);
    add("start-missed", input.startMissed);
    // What this turn's first reply owes under proceed, before the reply, beside what the previous one lacked (J-206 S1).
    add("proceed", input.proceed === undefined ? undefined : proceedLine(input.proceed));
    // What the previous turn's reply lacked of what its turn owed (J-199 S1).
    for (const lack of input.replyLacks ?? []) add("reply-lacks", lack);
  } else {
    const record = change.record;
    add(
      "change",
      record === undefined
        ? `greenline: change ${change.id} has no record yet: no write outside .greenline/ledger/, .greenline/tmp/${change.id}/ and .greenline/visuals/${change.id}/, and no commit, before the owner's yes.`
        : `greenline: change ${change.id}, ${record.mode ?? "no mode"}, ${record.state ?? "no state"}${record.next === undefined ? "" : `; next: ${record.next}`}.${input.heldIn === undefined ? "" : ` It is open in the worktree ${input.heldIn}, which this session holds while it stands in another checkout: run each of its commands there, \`cd ${input.heldIn} && <command>\`.`}`,
      "",
    );
    // The facts table the reply copies as its own, its View row the page the turn calls for (J-142 S2, J-144 S1).
    const rows = input.facts ?? [];
    factsBlock(rows).forEach((text, index) => {
      const row = rows[index - FACTS_HEAD];
      add(row === undefined ? "facts" : FACT_OF_ROW[row.fact], text, "");
    });
    // What the owner's word decides, read from the record's next line, kept across a stop and its resume (J-149 S3), the folder's shown patch beside it (J-214 S1).
    add(
      "waiting",
      record === undefined
        ? undefined
        : waitingLine(record, undefined, input.turnWords, input.shownPatch),
    );
    // A stop written while the session goes on, which a wait leaves open (J-200 S1).
    add("waiting", input.stoppedHeld);
    // A stop no commit holds, which the stop's commit settles (J-210 S1).
    add("waiting", input.stopCommit);
    // A done change's landing, from its record and git, beside the owner's words (J-202 S1).
    add("landing", input.landing);
    // The previous turn's picture past its cap or owed, beside the facts (J-129 S6, J-134 S1).
    add("picture", input.picture);
    add("cards", input.cards);
    add("start-missed", input.startMissed);
    for (const lack of input.replyLacks ?? []) add("reply-lacks", lack);
    add("ground", input.ground);
    add("change", input.openElsewhere);
    add("predating", input.predating);
    add("remote", input.remote);
    add("interface", input.interface);
    add("interface-checks", input.interfaceChecks);
    add("interface-render", input.interfaceRender);
    add("design-pick", input.designPick);
    add("skills", input.skills);
    add("habits", input.habits);
    // The situation, the skills the change owes, the record's lacking lines and the hooks' hints (J-176 S1).
    add("situation", input.situation);
    add("owed", input.owed);
    add("lacking", input.lacking);
    add("helpers", input.helpers);
    add("hints", input.hints);
    if (record !== undefined && record.choice === undefined)
      add("choice", "its record carries no choice line: the owner has not said yes.");
    add("close", record === undefined ? undefined : closeNudge(record));
    const methods = methodAgentsWords(input.methodAgents ?? []);
    add(
      "agents",
      `${String(input.agents)} fresh agent${input.agents === 1 ? "" : "s"} counted in its events${methods === "" ? "" : `, and ${methods} that a method started, ${METHOD_AGENTS_NOWHERE}`}; 'greenline status --change ${change.id}' shows its checks and commits.`,
    );
    const byMethods = (input.methodAgents ?? []).reduce((total, entry) => total + entry.count, 0);
    add(
      "agents-nudge",
      record === undefined ? undefined : agentsNudge(record, input.agents, byMethods),
    );
  }
  // The discussions at hand, with or without a change open, which the reply's Read as fact reads (J-118 S2).
  add("discussions", input.discussions);
  add(
    "drift",
    input.drift === undefined ? undefined : driftLine(input.drift.visuals, input.drift.pages),
  );
  // The atlas and the documents, after the drift, with or without a change open (J-147 S1).
  add("atlas", input.atlas);
  add("docs", input.docs);
  // The open marks, with or without a change open: a change's follow-up, or the next proposal's input (J-124 S2).
  add("marks", input.marks);
  // The pictures' maker, with or without a change open (J-129 S6).
  add("session-made", input.sessionMade);
  // A durable visual that loads an address outside the repository (J-147 S3).
  add("reaches", input.reaches);
  add(
    "surface",
    input.renders === undefined
      ? undefined
      : `surface: renders ${input.renders}${input.worktree === undefined ? "" : `; worktree ${input.worktree}`}${input.questions === undefined ? "" : `; questions ${input.questions}`}`,
  );
  add("instructions", input.instructions);
  if (input.declared === 0) add("checks", NO_CHECKS_LINE, "");
  else if (change !== undefined) {
    add("checks", "checks declared, the latest run of each:", "");
    for (const standing of input.checks) add("check", standingLine(standing), "");
  }
  if (input.git.state === "absent") add("git-hooks", gitHooksLine(input.git), "");
  // The reply's progress line, last, as inline code the agent copies to its reply's last line (the block's reply section).
  add(
    "progress",
    change?.progress === undefined ? undefined : `progress: \`${change.progress}\``,
    "",
  );
  return lines;
}

/** The lines the facts block prints before its first row: its heading, the table's header and its rule. */
const FACTS_HEAD = 3;

/** The mirror's fact each row of the facts table states. */
const FACT_OF_ROW = {
  Change: "change",
  Mode: "mode",
  Step: "step",
  Where: "ground",
  View: "view",
} satisfies Readonly<Record<FactName, MirrorFact>>;

/**
 * The line that names a turn which began without its status mirror (J-225
 * S1; j217t-conduct-runner finding 1): this turn, its mirror printed at the
 * first later event that carries context, or the previous turn, where no
 * event of it could.
 * @param which `this` or `previous`
 * @returns the line, unindented
 */
export function startMissedLine(which: "this" | "previous"): string {
  return which === "this"
    ? "this turn began without its status mirror: its start hook did not finish, so the mirror is printed here."
    : "the previous turn began without its status mirror: its start hook did not finish, and no later event of that turn could print it.";
}

/**
 * The mirror's text.
 * @param input what it shows
 * @returns the lines, ending with a newline
 */
export function mirrorText(input: MirrorInput): string {
  return `${mirrorLines(input)
    .map((line) => line.text)
    .join("\n")}\n`;
}
