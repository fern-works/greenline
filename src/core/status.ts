import type { Result } from "../commons/result.ts";
import { shouldNeverHappen } from "../commons/defect.ts";
import {
  currentStep,
  mismatches,
  parseRecordForm,
  type ChangeRecord,
  type Cost,
  type Mismatch,
  type Unrequired,
  type Position,
  type RecordContext,
  type RecordForm,
} from "./change.ts";
import {
  commitsOfChanges,
  deletedRecords,
  unclaimedCommits,
  type ChangeCommits,
  type CodeTarget,
  type FilesReading,
  type GitHistory,
  type HistoryGap,
} from "./change-history.ts";
import type { ContractParseFailed } from "./contract.ts";
import type { GuidanceRequest } from "./guidance-receipts.ts";
import { readBrief } from "./brief.ts";
import { bodyLines } from "./front-matter.ts";
import { MARKDOWN_LINK } from "./links.ts";
import type { CheckFacts, CheckOutcome, HookRun } from "./facts.ts";
import { depthOf, freshAgents, type ModesDefinition, type StepName } from "./modes.ts";
import type { DeclaredCheck } from "./checks.ts";
import { checkStandings, standingLine, type CheckStanding } from "./mirror.ts";
import {
  readyFrontier,
  ticketProgress,
  type PlanDocument,
  type TicketProgress,
  type TicketsFile,
} from "./plan-documents.ts";

/**
 * The House rulings as status prints them (ADR 0028's amendment): the
 * stanza's dash lines, listed as facts, or the plain absence.
 */
export function renderHouseRulingsText(rulings: readonly string[]): string {
  if (rulings.length === 0) return "house rulings: none\n";
  const lines = [`house rulings (AGENTS.md): ${rulings.length}`];
  for (const ruling of rulings) lines.push(`  - ${ruling}`);
  lines.push("");
  return lines.join("\n");
}

/*
 * The changes view (`workshop/components/cli-contracts.md`): the owner's
 * bookkeeping view and the agent's resume view, derived from the change
 * records, their folders, the plan directories and git history, and stored
 * nowhere. It states facts and checks declared values against them; it never
 * chooses a mode and never advances a step. A finding fails the command and
 * a notice never does. A finished record is history unless its latest check
 * facts name the current installation's revision: it is then read for its
 * form alone and never re-judged against a later modes definition.
 */

/** One parsed file beside a record: its path and its parse, so one bad file never hides the others. */
export interface ParsedFile<T> {
  readonly file: string;
  readonly parsed: Result<T, ContractParseFailed>;
}

/** A change's folder, `.greenline/ledger/<id>/`: the reports in it, its briefs and its check facts. */
export interface ChangeFolder {
  /** Every file in the folder except the JSON files under `checks/`, relative to the folder, sorted; the briefs among them. */
  readonly reports: readonly string[];
  /** Each top-level `brief-*.md` of the folder with its text, undefined when it cannot be read, which `status` reads for the command's mark. */
  readonly briefs: readonly { readonly file: string; readonly text: string | undefined }[];
  /** Each JSON file under `checks/` that `check` wrote, parsed as check facts; a file that is neither kind is here too, refused as facts. */
  readonly checks: readonly ParsedFile<CheckFacts>[];
  /** Each run a hook recorded under `checks/`, which feeds the mirror and never a finding. */
  readonly hookRuns: readonly ParsedFile<HookRun>[];
}

/** One record file: its change id, its text and its parse against the loaded modes, so one bad file never hides the others. */
export interface ChangeEntry {
  readonly id: string;
  /** The file's text; undefined when it could not be read, and `record` says why. */
  readonly text: string | undefined;
  readonly record: Result<ChangeRecord, ContractParseFailed>;
}

/** A change on disk: its record and, when it has one, its folder, or why the folder could not be read. */
export interface ChangeOnDisk extends ChangeEntry {
  readonly folder: Result<ChangeFolder, ContractParseFailed> | undefined;
}

/** What a plan directory holds: its tickets file when present and its other plan documents. */
export interface PlanContents {
  readonly tickets: ParsedFile<TicketsFile> | undefined;
  readonly documents: readonly ParsedFile<PlanDocument>[];
}

/** A plan directory, `.greenline/plans/<name>/`, and what it holds, or why it could not be read. */
export interface PlanOnDisk {
  readonly name: string;
  readonly contents: Result<PlanContents, ContractParseFailed>;
}

/** Everything `status` derives from on disk; nothing here is judged. */
export interface ChangesOnDisk {
  readonly changes: readonly ChangeOnDisk[];
  readonly plans: readonly PlanOnDisk[];
  /** The working folders under `.greenline/tmp/`, each named by a change id, sorted. */
  readonly working: readonly string[];
}

/** What the changes view derives from. */
export interface ChangesInput {
  readonly definition: ModesDefinition;
  /** The installation's revision; a done record whose latest check facts name it is still judged. */
  readonly revision: string;
  /** The workspace's `proceed` setting, from its manifest: `none` or a mode; undefined when the manifest cannot be read, so no standing record is read against it. */
  readonly proceed: string | undefined;
  readonly disk: ChangesOnDisk;
  /** What the history reader found; undefined when no record is on disk, so no history was read. */
  readonly history: GitHistory | undefined;
  /** The paths greenline installed, from the lock; a commit touching only these belongs to no change and is not counted. */
  readonly installed: ReadonlySet<string>;
  /** The workspace's decisions book, `.greenline/DECISIONS.md`; undefined when it is absent. */
  readonly decisions: string | undefined;
  /** The garden request collections that could be read; a change's are those it owns. */
  readonly consultations: readonly GuidanceRequest[];
  /** The garden receipt collections, or their folder, that could not be read, each with why; each is a finding of its own. */
  readonly unreadableReceipts: readonly { readonly path: string; readonly issues: string }[];
  /** The checks the workspace declares, from its manifest; none when it declares none or cannot be read. */
  readonly checks: readonly DeclaredCheck[];
  /** The fresh agents each change's harness events counted, by change; absent for a change with no events. */
  readonly agentsCounted: ReadonlyMap<string, number>;
}

/** One garden request a change owns: its handle, what it is bound to, and how many calls it made; never a unit's text. */
export interface ConsultationView {
  readonly request: string;
  readonly binding:
    | { readonly state: "unresolved" }
    | { readonly state: "publication"; readonly publication: string }
    | { readonly state: "comparison"; readonly from: string; readonly to: string };
  readonly calls: number;
}

/** Which view: the default list, every change with `all`, or one change's resume view. */
export type ChangesRequest =
  | { readonly view: "list"; readonly all: boolean }
  | { readonly view: "resume"; readonly change: string };

/** A tree id git gave, or why it gave none. */
export type TreeAnswer =
  | { readonly kind: "tree"; readonly id: string }
  | { readonly kind: "unknown"; readonly reason: string };

/** The git readings the view needs about the code: tree ids and changed files. */
export interface CodeQuestions {
  /** The commits whose tree id, outside `.greenline/`, is needed. */
  readonly commitTrees: readonly string[];
  /** Whether the working tree's id is needed. */
  readonly workingTree: boolean;
  /** The files that changed from a check's commit to a change's code. */
  readonly diffs: readonly { readonly from: string; readonly to: CodeTarget }[];
  /** For each open change shown, the commit its last recorded run started on, null for none: the commits of code on the branch after it are asked. */
  readonly since: readonly (string | null)[];
}

/**
 * The commits of code on the branch after a commit, as git lists them: those
 * HEAD reaches and the commit does not, that change a path outside
 * `.greenline/`, newest first, with the tree id of the oldest by the code's
 * rule; or why git cannot say, such as a commit no longer on the branch.
 */
export type CommitsSince =
  | {
      readonly kind: "commits";
      readonly hashes: readonly string[];
      /** The tree id of the oldest listed commit, `.greenline/` left out; undefined when none is listed. */
      readonly oldestTree: TreeAnswer | undefined;
    }
  | { readonly kind: "unknown"; readonly reason: string };

/**
 * The key of one `since` question in the answers.
 * @param from the commit the last recorded run started on, or null when it recorded none
 * @returns the commit, or the empty string for none
 */
export function sinceKey(from: string | null): string {
  return from ?? "";
}

/** git's answers to the questions, keyed as asked. */
export interface CodeAnswers {
  readonly commitTrees: ReadonlyMap<string, TreeAnswer>;
  readonly workingTree: TreeAnswer | undefined;
  /** Keyed by `diffKey`. */
  readonly diffs: ReadonlyMap<string, FilesReading>;
  /** Keyed by `sinceKey`. */
  readonly since: ReadonlyMap<string, CommitsSince>;
}

/**
 * The key of one diff in the answers.
 * @param from the commit a check ran on
 * @param to the change's code
 * @returns a key unique to the pair
 */
export function diffKey(from: string, to: CodeTarget): string {
  return `${from} ${to.kind === "commit" ? to.hash : "working-tree"}`;
}

/** What a note is about: one change, one plan, or the history. */
export type NoteSubject =
  | { readonly kind: "change"; readonly id: string }
  | { readonly kind: "plan"; readonly name: string }
  | { readonly kind: "history" };

/** A finding fails the command; each names what is wrong and the remedy. */
export type FindingKind =
  | "unparsed"
  | "mismatch"
  | "below-floor"
  | "checks-failed"
  | "cited-missing"
  | "ticket-mode"
  | "planning-below-careful"
  | "brief-unwritten"
  | "cost-below-starts";

/** A notice never fails the command. */
export type NoticeKind = "code-moved" | "uncited" | "deleted" | "unchecked" | "fact-missing";

/** One finding or notice: what it is, the sentence with its remedy, the file it concerns and its subject. */
export interface Note<K extends string> {
  readonly kind: K;
  readonly message: string;
  readonly path?: string;
  readonly subject: NoteSubject;
}

/** How a record was read: judged against the definition, read as history for its form, or not parsed at all. */
export type RecordReading = "judged" | "history" | "unparsed";

/** A check's latest run: passed exits zero; failed ended otherwise; unfinished never wrote its outcome. */
export type RunOutcome = "passed" | "failed" | "unfinished";

/** Whether a check ran on the change's final code: the same tree, a moved one with the files that changed, or unknown. */
export type CodeVerdict =
  | { readonly kind: "final" }
  | {
      readonly kind: "moved";
      readonly files: FilesReading;
      /** The commit the files are counted from when the check ran on uncommitted work; null when it ran on that commit exactly. */
      readonly relativeTo: string | null;
    }
  | { readonly kind: "unknown"; readonly why: string };

/** One check of a change: its command, its latest run and whether that run saw the final code. */
export interface CheckView {
  readonly arguments: readonly string[];
  /** The directory a declared check's runs ran in, from the root; absent for runs at the root. */
  readonly dir?: string | undefined;
  readonly step: string | null;
  /** How many runs it has, the latest included. */
  readonly runs: number;
  readonly outcome: RunOutcome;
  readonly startedAt: string;
  readonly durationMs: number | null;
  /** How the latest run ended; null while it is unfinished. */
  readonly exit: CheckOutcome | null;
  readonly commit: string | null;
  readonly tree: string | null;
  readonly installation: string;
  readonly code: CodeVerdict;
}

/**
 * An open change's commits of code since its last recorded check, a nudge to
 * run its checks through `greenline check` and never a finding or a notice:
 * counted from the commit the latest run of any check started on, a probe's
 * left out, less the commit that holds exactly the code that run saw, and
 * none while the working tree's code is that run's; none recorded while the
 * change has no check; or why git cannot say.
 */
export type SinceCheckView =
  | {
      readonly kind: "counted";
      readonly commits: number;
      /** When the last recorded run started. */
      readonly startedAt: string;
    }
  | { readonly kind: "none-recorded" }
  | { readonly kind: "unknown"; readonly why: string };

/** A change's commits as the view shows them. */
export type CommitsView =
  | { readonly kind: "unknown"; readonly why: string }
  | {
      readonly kind: "known";
      readonly commits: readonly { readonly hash: string; readonly shared: boolean }[];
      readonly files: readonly string[];
    };

/** One change as the default view lists it and the resume view details it. */
export interface ChangeView {
  readonly id: string;
  readonly path: string;
  readonly reading: RecordReading;
  readonly state: Position["state"] | null;
  readonly mode: string | null;
  readonly choice: "owner" | "accepted" | "standing" | null;
  readonly proposed: string | null;
  readonly why: string | null;
  readonly next: string | null;
  readonly raises: readonly { readonly from: string; readonly reason: string }[];
  readonly floors: readonly string[];
  /** The step the "next" line names, or for an open record with none the first required section not yet written; "none" when all are; null when the record is not judged. */
  readonly step: string | null;
  readonly reviewed: string | null;
  readonly plan: string | null;
  readonly ticket: string | null;
  readonly cost: Cost | null;
  readonly commits: CommitsView;
  readonly checks: readonly CheckView[];
  /** For an open change, its commits of code since its last recorded check; null for any other. */
  readonly sinceCheck: SinceCheckView | null;
  /** The garden requests the change owns, oldest first. */
  readonly consultations: readonly ConsultationView[];
  /** The briefs `greenline brief` wrote in the change's folder, by file name, which the close cites; a brief file it did not write is a finding and is not listed. */
  readonly briefs: readonly BriefView[];
  /** For an open or stopped change, each declared check with its latest run, `check`'s or a hook's; none for any other. */
  readonly declaredChecks: readonly CheckStanding[];
  /** The nudges beside the change: lines that fail nothing (`nudgesOf`). */
  readonly nudges: readonly string[];
}

/** One brief the command wrote: its file in the change's folder, the step its agent serves and its number. */
export interface BriefView {
  readonly file: string;
  readonly step: string;
  readonly round: number;
}

/** A plan directory as the view shows it: each ticket's progress and the ready frontier. */
export interface PlanView {
  readonly name: string;
  readonly readable: boolean;
  /** The tickets file's status; null when there is none or it does not parse. */
  readonly tickets: "draft" | "complete" | null;
  readonly progress: readonly { readonly ticket: string; readonly progress: TicketProgress }[];
  readonly frontier: readonly string[];
}

/** The totals over every change record that parses. */
export interface ChangeTotals {
  readonly changes: number;
  readonly unparsed: number;
  readonly byMode: readonly { readonly mode: string; readonly changes: number }[];
  readonly ownerChose: number;
  readonly raised: number;
  readonly cost: { readonly agents: number; readonly rounds: number; readonly changes: number };
}

/** The commits that belong to no change, counted, or why history cannot say. */
export type UnclaimedView =
  | { readonly kind: "not-read" }
  | { readonly kind: "unknown"; readonly why: string }
  | {
      readonly kind: "known";
      readonly count: number;
      /** The commits by their short hash, the first five named and the rest counted; empty for none. */
      readonly named: string;
    };

/** The view `status` prints and `--json` carries. */
export type ChangesReport =
  | {
      readonly view: "list";
      readonly all: boolean;
      /** The open and stopped changes, and those that do not parse. */
      readonly current: readonly ChangeView[];
      /** The finished changes shown, the most recently closed first: the last ten closed, or every one with `all`. */
      readonly finished: readonly ChangeView[];
      /** How many finished changes the view leaves out. */
      readonly finishedHidden: number;
      readonly plans: readonly PlanView[];
      readonly totals: ChangeTotals;
      readonly unclaimed: UnclaimedView;
      readonly findings: number;
      readonly notices: number;
    }
  | {
      readonly view: "resume";
      readonly change: ChangeView;
      readonly plan: PlanView | null;
      readonly findings: number;
      readonly notices: number;
    }
  | { readonly view: "unavailable"; readonly reason: string };

/** The view with its findings and notices. */
export interface ChangesOutcome {
  readonly report: ChangesReport;
  readonly findings: readonly Note<FindingKind>[];
  readonly notices: readonly Note<NoticeKind>[];
}

/** How one record reads. */
type Standing =
  | {
      readonly kind: "judged";
      readonly record: ChangeRecord;
      readonly mismatches: readonly Mismatch[];
      readonly step: StepName | undefined;
    }
  | { readonly kind: "history"; readonly form: RecordForm }
  | { readonly kind: "unparsed"; readonly issues: string };

/** One check: its runs with the same arguments in the same directory, the latest first. */
interface CheckRuns {
  readonly arguments: readonly string[];
  readonly dir: string | undefined;
  readonly runs: readonly CheckFacts[];
}

/** The code a change's checks are compared with, or why there is none. */
type Target = CodeTarget | { readonly kind: "unknown"; readonly why: string };

/** One change, read and placed, before git is asked about its code. */
interface Assessed {
  readonly entry: ChangeOnDisk;
  readonly path: string;
  readonly standing: Standing;
  readonly checks: readonly CheckRuns[];
  readonly commits: CommitsView;
  readonly target: Target;
}

/** Every change read, the ones the view shows, and what derives from history. */
export interface ChangesAssessment {
  readonly input: ChangesInput;
  readonly request: ChangesRequest;
  readonly changes: readonly Assessed[];
  readonly shown: readonly Assessed[];
}

const LEDGER = ".greenline/ledger";
const WORKING = ".greenline/tmp";
/** The folder of a change's check facts, inside its ledger folder. */
const CHECKS = "checks";
/** The mode a planning change runs under at least, since its plan writes the tickets with the floor named: careful. */
const PLANNING_LEAST = "careful";
/** The `proceed` value that allows no mode. */
const PROCEED_NONE = "none";
const NOT_READ: GitHistory = { kind: "read", head: undefined, commits: [] };
const FINISHED_SHOWN = 10;
const GAPS = {
  shallow: "the clone is shallow",
  "no-git": "git cannot run",
  "not-a-repository": "this is not a git repository",
  unreadable: "git could not read the log",
} as const satisfies Readonly<Record<HistoryGap, string>>;

function issuesText(error: ContractParseFailed): string {
  return error.issues
    .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
    .join("; ");
}

/** The latest run of all a change's parsed facts, by start time. */
function latestRun(checks: readonly CheckRuns[]): CheckFacts | undefined {
  return checks
    .map((check) => check.runs[0])
    .filter((run): run is CheckFacts => run !== undefined)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))[0];
}

function checksOf(folder: ChangeOnDisk["folder"]): readonly CheckRuns[] {
  if (folder === undefined || folder._tag === "err") return [];
  const groups = new Map<string, CheckFacts[]>();
  for (const file of folder.value.checks) {
    // A run marked a probe by `greenline check --probe` is no check of the change.
    if (file.parsed._tag === "err" || file.parsed.value.probe === true) continue;
    // The same command run in a declared check's directory is another check than at the root.
    const key = JSON.stringify([file.parsed.value.arguments, file.parsed.value.dir ?? null]);
    groups.set(key, [...(groups.get(key) ?? []), file.parsed.value]);
  }
  return [...groups.values()]
    .map((runs) => {
      const sorted = [...runs].sort((a, b) =>
        a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0,
      );
      return { arguments: sorted[0]?.arguments ?? [], dir: sorted[0]?.dir, runs: sorted };
    })
    .sort((a, b) => {
      const left = JSON.stringify([a.arguments, a.dir ?? null]);
      const right = JSON.stringify([b.arguments, b.dir ?? null]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

function planHasTickets(disk: ChangesOnDisk, plan: string | undefined): "present" | "absent" {
  const found = disk.plans.find((entry) => entry.name === plan);
  return found !== undefined &&
    found.contents._tag === "ok" &&
    found.contents.value.tickets !== undefined
    ? "present"
    : "absent";
}

/** Read one record: for its form first, then, unless it is history, against the definition. */
function standingOf(
  input: ChangesInput,
  entry: ChangeOnDisk,
  checks: readonly CheckRuns[],
): Standing {
  if (entry.text === undefined)
    return {
      kind: "unparsed",
      issues: entry.record._tag === "err" ? issuesText(entry.record.error) : "unreadable",
    };
  const form = parseRecordForm(`${entry.id}.md`, entry.text);
  if (form._tag === "err") return { kind: "unparsed", issues: issuesText(form.error) };
  const state = form.value.position.state;
  const current = state === "done" && latestRun(checks)?.installation === input.revision;
  if (state === "dropped" || (state === "done" && !current))
    return { kind: "history", form: form.value };
  if (entry.record._tag === "err")
    return { kind: "unparsed", issues: issuesText(entry.record.error) };
  const record = entry.record.value;
  const context: RecordContext = {
    ticketsFile: planHasTickets(input.disk, record.belongs?.plan),
  };
  // The step reached is the one the "next" line names (the ruling Q3 on
  // S16b); an open record with none reads it from its sections, and check
  // records the same step when it is given none.
  return {
    kind: "judged",
    record,
    mismatches: mismatches(input.definition, record, context),
    step: currentStep(input.definition, record, context),
  };
}

/** What a record states, judged or read as history; undefined when it does not parse. */
function statedOf(standing: Standing): RecordForm | ChangeRecord | undefined {
  if (standing.kind === "judged") return standing.record;
  if (standing.kind === "history") return standing.form;
  return undefined;
}

function stateOf(standing: Standing): Position["state"] | undefined {
  return statedOf(standing)?.position.state;
}

function commitsView(commits: ChangeCommits | undefined): CommitsView {
  if (commits === undefined) return { kind: "known", commits: [], files: [] };
  return commits.kind === "unknown"
    ? { kind: "unknown", why: GAPS[commits.why] }
    : { kind: "known", commits: commits.commits, files: commits.files };
}

/**
 * An open change is compared with the working tree, and so is a stopped one
 * with no commit yet; any other with its latest commit, since the working
 * tree may already hold another change's work.
 */
function targetOf(state: Position["state"] | undefined, commits: CommitsView): Target {
  if (state === undefined) return { kind: "unknown", why: "the record does not parse" };
  if (state === "open") return { kind: "working-tree" };
  if (commits.kind === "unknown") return { kind: "unknown", why: commits.why };
  const latest = commits.commits[0];
  if (latest !== undefined) return { kind: "commit", hash: latest.hash };
  // A stopped change with no commit yet has only the working tree to compare.
  return state === "stopped"
    ? { kind: "working-tree" }
    : { kind: "unknown", why: "the change has no commit" };
}

/**
 * Read every change and choose the ones the view shows: the open and stopped
 * changes, those that do not parse and the ten finished most recently
 * closed, every change with `all`, or the one change of the resume view.
 * @param input what the view derives from
 * @param request which view
 * @returns the changes read, ready for the questions about their code
 */
export function assessChanges(input: ChangesInput, request: ChangesRequest): ChangesAssessment {
  const history = input.history ?? NOT_READ;
  const answers = commitsOfChanges(
    history,
    input.disk.changes.map((entry) => entry.id),
  );
  const changes = input.disk.changes.map((entry): Assessed => {
    const checks = checksOf(entry.folder);
    const standing = standingOf(input, entry, checks);
    const commits = commitsView(answers.get(entry.id));
    return {
      entry,
      path: `${LEDGER}/${entry.id}.md`,
      standing,
      checks,
      commits,
      target: targetOf(stateOf(standing), commits),
    };
  });
  const shown =
    request.view === "resume"
      ? changes.filter((change) => change.entry.id === request.change)
      : request.all
        ? changes
        : [
            ...changes.filter((change) => !isFinished(change)),
            ...finishedNewestFirst(changes).slice(0, FINISHED_SHOWN),
          ];
  return { input, request, changes, shown };
}

function isFinished(change: Assessed): boolean {
  const state = stateOf(change.standing);
  return state === "done" || state === "dropped";
}

/**
 * The finished changes, the most recently closed first. No record states
 * when it closed, and a done record closes on a green recorded check of its
 * final code, so a change's close is read as the end of its latest check
 * run that is not a probe: its start plus its duration, or its start while
 * it is unfinished. A change with no such run, a dropped one most often, is
 * read as closed at the start (UTC) of the day its id names. The newer id
 * breaks a tie.
 */
function finishedNewestFirst(changes: readonly Assessed[]): readonly Assessed[] {
  return changes
    .filter(isFinished)
    .map((change) => ({ change, closed: closedAt(change) }))
    .sort((a, b) => b.closed - a.closed || newerIdFirst(a.change, b.change))
    .map(({ change }) => change);
}

function newerIdFirst(a: Assessed, b: Assessed): number {
  return a.entry.id < b.entry.id ? 1 : a.entry.id > b.entry.id ? -1 : 0;
}

/** When a finished change is read as closed, in milliseconds since the epoch. */
function closedAt(change: Assessed): number {
  const latest = latestRun(change.checks);
  if (latest === undefined) return Date.parse(`${change.entry.id.slice(0, 10)}T00:00:00.000Z`);
  const started = Date.parse(latest.startedAt);
  return latest.state === "finished" ? started + latest.durationMs : started;
}

/**
 * The git readings the shown changes need: for each check's latest run, the
 * tree of the change's code, the tree of the commit the run started on, and
 * the files changed from that commit to the change's code.
 * @param assessment the changes read
 * @returns what to ask git
 */
export function codeQuestions(assessment: ChangesAssessment): CodeQuestions {
  const commitTrees = new Set<string>();
  const diffs = new Map<string, { from: string; to: CodeTarget }>();
  const since = new Map<string, string | null>();
  let workingTree = false;
  for (const change of assessment.shown) {
    const last = stateOf(change.standing) === "open" ? latestRun(change.checks) : undefined;
    if (last !== undefined) since.set(sinceKey(last.commit), last.commit);
    const target = change.target;
    if (target.kind === "unknown") continue;
    for (const check of change.checks) {
      const latest = check.runs[0];
      if (latest === undefined || latest.tree === null) continue;
      if (target.kind === "commit") commitTrees.add(target.hash);
      else workingTree = true;
      if (latest.commit === null) continue;
      commitTrees.add(latest.commit);
      diffs.set(diffKey(latest.commit, target), { from: latest.commit, to: target });
    }
  }
  return {
    commitTrees: [...commitTrees].sort(),
    workingTree,
    diffs: [...diffs.values()],
    since: [...since.values()],
  };
}

/** An open change's commits of code since its last recorded check, from git's answer; null for any other change. */
function sinceCheckOf(change: Assessed, answers: CodeAnswers | undefined): SinceCheckView | null {
  if (stateOf(change.standing) !== "open") return null;
  const last = latestRun(change.checks);
  if (last === undefined) return { kind: "none-recorded" };
  const reading = answers?.since.get(sinceKey(last.commit));
  if (reading === undefined) return { kind: "unknown", why: "the history was not read" };
  if (reading.kind === "unknown") return { kind: "unknown", why: reading.reason };
  // While the working tree's code is the code the run saw, however it was committed, no commit holds code it did not see.
  const working = answers?.workingTree;
  if (last.tree !== null && working?.kind === "tree" && working.id === last.tree)
    return { kind: "counted", commits: 0, startedAt: last.startedAt };
  // The oldest commit after the run is the one made of the code the run saw, when their trees agree.
  const saw =
    last.tree !== null &&
    reading.oldestTree?.kind === "tree" &&
    reading.oldestTree.id === last.tree;
  return {
    kind: "counted",
    commits: Math.max(0, reading.hashes.length - (saw ? 1 : 0)),
    startedAt: last.startedAt,
  };
}

function outcomeOf(run: CheckFacts): RunOutcome {
  if (run.state === "started") return "unfinished";
  return run.outcome.kind === "exited" && run.outcome.code === 0 ? "passed" : "failed";
}

function verdictOf(target: Target, run: CheckFacts, answers: CodeAnswers): CodeVerdict {
  if (target.kind === "unknown") return { kind: "unknown", why: target.why };
  if (run.tree === null)
    return { kind: "unknown", why: "the check could not read the tree it ran on" };
  const tree =
    target.kind === "commit" ? answers.commitTrees.get(target.hash) : answers.workingTree;
  if (tree === undefined) return { kind: "unknown", why: "the code was not read" };
  if (tree.kind === "unknown") return { kind: "unknown", why: tree.reason };
  if (tree.id === run.tree) return { kind: "final" };
  if (run.commit === null)
    return {
      kind: "moved",
      files: { kind: "unknown", reason: "the check recorded no commit" },
      relativeTo: null,
    };
  const started = answers.commitTrees.get(run.commit);
  // Without the tree of that commit, whether the check ran on it exactly or on uncommitted work is unknown.
  if (started === undefined || started.kind === "unknown")
    return {
      kind: "moved",
      files: {
        kind: "unknown",
        reason: `the tree of the commit the check ran on cannot be read${started === undefined ? "" : `: ${started.reason}`}`,
      },
      relativeTo: null,
    };
  return {
    kind: "moved",
    files: answers.diffs.get(diffKey(run.commit, target)) ?? {
      kind: "unknown",
      reason: "the files were not read",
    },
    relativeTo: started.id === run.tree ? null : run.commit,
  };
}

function checkViews(change: Assessed, answers: CodeAnswers | undefined): readonly CheckView[] {
  return change.checks.flatMap((check): CheckView[] => {
    const latest = check.runs[0];
    if (latest === undefined) return [];
    return [
      {
        arguments: check.arguments,
        dir: check.dir,
        step: latest.step ?? null,
        runs: check.runs.length,
        outcome: outcomeOf(latest),
        startedAt: latest.startedAt,
        durationMs: latest.state === "finished" ? latest.durationMs : null,
        exit: latest.state === "finished" ? latest.outcome : null,
        commit: latest.commit,
        tree: latest.tree,
        installation: latest.installation,
        code:
          answers === undefined
            ? { kind: "unknown", why: "the code was not read" }
            : verdictOf(change.target, latest, answers),
      },
    ];
  });
}

/** The requests a change owns, oldest first, each with its binding and its count of calls. */
function consultationsOf(
  requests: readonly GuidanceRequest[],
  id: string,
): readonly ConsultationView[] {
  return requests
    .filter((request) => request.owner.kind === "change" && request.owner.change === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((request) => ({
      request: request.id,
      binding:
        request.binding.state === "publication"
          ? { state: "publication", publication: request.binding.snapshot.id }
          : request.binding.state === "comparison"
            ? { state: "comparison", from: request.binding.from.id, to: request.binding.to.id }
            : { state: "unresolved" },
      calls: request.receipts.length,
    }));
}

function viewOf(
  input: ChangesInput,
  change: Assessed,
  answers: CodeAnswers | undefined,
): ChangeView {
  const requests = input.consultations;
  const { standing } = change;
  const stated = statedOf(standing);
  const position = stated?.position;
  return {
    id: change.entry.id,
    path: change.path,
    reading: standing.kind,
    state: position?.state ?? null,
    mode: stated?.mode ?? null,
    choice: stated?.choice.by ?? null,
    proposed:
      stated !== undefined && stated.choice.by === "owner"
        ? (stated.choice.proposed ?? null)
        : null,
    why: stated?.why ?? null,
    next:
      position === undefined
        ? null
        : position.state === "open" || position.state === "stopped"
          ? (position.next ?? null)
          : "none",
    raises: stated?.raises ?? [],
    floors: stated?.floors ?? [],
    step: standing.kind === "judged" ? (standing.step ?? "none") : null,
    reviewed: stated?.reviewed ?? null,
    plan: stated?.belongs?.plan ?? null,
    ticket: stated?.belongs?.ticket ?? null,
    cost: stated?.cost ?? null,
    commits: change.commits,
    checks: checkViews(change, answers),
    sinceCheck: sinceCheckOf(change, answers),
    consultations: consultationsOf(requests, change.entry.id),
    briefs: briefsOf(change),
    declaredChecks:
      position?.state === "open" || position?.state === "stopped"
        ? declaredStandings(input.checks, change)
        : [],
    nudges: nudgesOf(input, change),
  };
}

/** Each declared check's latest run for a change: the facts `check` wrote and the runs a hook recorded. */
function declaredStandings(
  checks: readonly DeclaredCheck[],
  change: Assessed,
): readonly CheckStanding[] {
  const folder = change.entry.folder;
  if (folder === undefined || folder._tag === "err") return checkStandings(checks, [], []);
  const facts = folder.value.checks.flatMap((file) =>
    file.parsed._tag === "ok" ? [file.parsed.value] : [],
  );
  const runs = folder.value.hookRuns.flatMap((file) =>
    file.parsed._tag === "ok" ? [file.parsed.value] : [],
  );
  return checkStandings(checks, facts, runs);
}

/** The briefs the command wrote in a change's folder, sorted by file name. */
function briefsOf(change: Assessed): readonly BriefView[] {
  const folder = change.entry.folder;
  if (folder === undefined || folder._tag === "err") return [];
  return folder.value.briefs
    .flatMap((brief): BriefView[] => {
      if (brief.text === undefined) return [];
      const reading = readBrief(change.entry.id, brief.file, brief.text);
      return reading.kind === "written"
        ? [{ file: brief.file, step: reading.step, round: reading.round }]
        : [];
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** The command that writes a brief of this name: its step and number when the name gives them. */
function briefCommand(id: string, file: string): string {
  const named = /^brief-(review|verify)-([1-9]\d*)\.md$/.exec(file);
  return named === null
    ? `greenline brief --change ${id} --step <review or verify> --round <n>`
    : `greenline brief --change ${id} --step ${named[1] ?? ""} --round ${named[2] ?? ""}`;
}

/** Each brief file of a change's folder the command did not write, or that cannot be read, is a finding. */
function briefNotes(id: string, folder: ChangeFolder, findings: Note<FindingKind>[]): void {
  const subject: NoteSubject = { kind: "change", id };
  for (const brief of folder.briefs) {
    const path = `${LEDGER}/${id}/${brief.file}`;
    const remedy = `a brief is written only by '${briefCommand(id, brief.file)}', and the builder never opens, copies, diffs or derives a brief file: remove this one, write the brief with the command, and name the brief written by hand as a finding in the step's section; anticipate's brief stays under ${WORKING}/${id}/`;
    if (brief.text === undefined) {
      findings.push({
        kind: "brief-unwritten",
        message: `the brief '${brief.file}' of '${id}' cannot be read, so whether greenline brief wrote it is unknown: make it readable; ${remedy}`,
        path,
        subject,
      });
      continue;
    }
    const reading = readBrief(id, brief.file, brief.text);
    if (reading.kind === "written") continue;
    findings.push({
      kind: "brief-unwritten",
      message:
        reading.kind === "unmarked"
          ? `the brief '${brief.file}' of '${id}' carries no mark of greenline brief on its first line, so the command did not write it: ${remedy}`
          : `the brief '${brief.file}' of '${id}' carries greenline brief's mark, but its bytes are not the ones the command wrote for this file, so it was copied, renamed or edited: ${remedy}`,
      path,
      subject,
    });
  }
}

function plansView(input: ChangesInput, changes: readonly Assessed[]): readonly PlanView[] {
  const records = changes.flatMap(
    (change): { plan: string; ticket: string; state: Position["state"] }[] => {
      const stated = statedOf(change.standing);
      const ticket = stated?.belongs?.ticket;
      const plan = stated?.belongs?.plan;
      return stated === undefined || ticket === undefined || plan === undefined
        ? []
        : [{ plan, ticket, state: stated.position.state }];
    },
  );
  return input.disk.plans.map((plan): PlanView => {
    const tickets = plan.contents._tag === "ok" ? plan.contents.value.tickets?.parsed : undefined;
    if (tickets === undefined || tickets._tag === "err")
      return {
        name: plan.name,
        readable: plan.contents._tag === "ok",
        tickets: null,
        progress: [],
        frontier: [],
      };
    const mine = records.filter((record) => record.plan === plan.name);
    return {
      name: plan.name,
      readable: true,
      tickets: tickets.value.status,
      progress: ticketProgress(tickets.value, mine),
      frontier: readyFrontier(tickets.value, mine),
    };
  });
}

function totalsOf(changes: readonly Assessed[]): ChangeTotals {
  const stated = changes.flatMap((change): (RecordForm | ChangeRecord)[] => {
    const record = statedOf(change.standing);
    return record === undefined ? [] : [record];
  });
  const byMode = new Map<string, number>();
  for (const record of stated) byMode.set(record.mode, (byMode.get(record.mode) ?? 0) + 1);
  const costed = stated.flatMap((record) => (record.cost === undefined ? [] : [record.cost]));
  return {
    changes: changes.length,
    unparsed: changes.length - stated.length,
    byMode: [...byMode.entries()].map(([mode, count]) => ({ mode, changes: count })),
    ownerChose: stated.filter((record) => record.choice.by === "owner").length,
    raised: stated.filter((record) => record.raises.length > 0).length,
    cost: {
      agents: costed.reduce((total, cost) => total + cost.agents, 0),
      rounds: costed.reduce((total, cost) => total + cost.rounds, 0),
      changes: costed.length,
    },
  };
}

/** Why a section belongs to the other record of a split, and its remedy. */
function heldSentence(step: string, holder: "plan" | "ticket"): string {
  return holder === "plan"
    ? `the step '${step}' belongs to the plan's record when the work is split into tickets, not to a ticket's: move the text there and remove the section`
    : `the step '${step}' belongs to the tickets' records when the work is split, not to the planning record: remove the section`;
}

/** Why the step a "next" line names is not this record's, and the remedy: only the mode's cause offers raising the mode. */
function nextSentence(mode: string, why: Unrequired): string {
  switch (why.by) {
    case "mode":
      return `its mode '${mode}' does not run it; name a step the mode runs, or raise the mode`;
    case "split":
      return why.holder === "plan"
        ? `it belongs to the plan's record when the work is split; name a step of this ticket's record`
        : `it belongs to the tickets' records when the work is split; name a step of the planning record`;
  }
}

function mismatchSentence(mode: string, mismatch: Mismatch): string {
  switch (mismatch.kind) {
    case "unrequired-section":
      return heldSentence(mismatch.step, mismatch.holder);
    case "unrun-section":
      return `its mode '${mode}' does not run the step '${mismatch.step}', so its section holds the one line '${mismatch.line}' and nothing else: write that line, or raise the mode`;
    case "missing-section":
      return `the done record has no '${mismatch.step}' section its mode requires: write it`;
    case "missing-none-line":
      return `the done record has no '${mismatch.step}' section; its mode '${mode}' does not run the step, and every mode keeps the whole record: write the section with the one line '${mismatch.line}'`;
    case "next-unrequired":
      return `its "next" line names the step '${mismatch.step}', which this record does not run: ${nextSentence(mode, mismatch.why)}`;
    case "inline-over-one-line":
      return `the '${mismatch.step}' step runs inline in this mode, so its section is one line: shorten it, or raise the mode`;
    case "rounds-over-cap":
      return `the '${mismatch.step}' section holds ${mismatch.rounds} rounds and the mode allows ${mismatch.cap}: raise the mode, or record the rounds the mode allows`;
    case "below-floor":
      return `the floor '${mismatch.floor}' was found and the mode, taken without waiting (choice: standing) under the proceed setting, does not meet it: raise the mode with a raise that says why, or have the owner choose`;
    case "over-budget":
      return `it cost ${mismatch.cost.agents} agents and ${mismatch.cost.rounds} rounds, over the mode's ${mismatch.budget.agents} and ${mismatch.budget.rounds}: raise the mode, or correct the cost`;
  }
}

/** A check's command as one line: an empty argument, or one with a space or a quote, is quoted. */
function command(argumentsGiven: readonly string[]): string {
  return argumentsGiven
    .map((argument) =>
      argument === "" || /[\s"'\\]/.test(argument) ? JSON.stringify(argument) : argument,
    )
    .join(" ");
}

/** A check's command as one line, with the directory it ran in where that is not the root. */
function checkLine(check: {
  readonly arguments: readonly string[];
  readonly dir?: string | undefined;
}): string {
  return `${command(check.arguments)}${check.dir === undefined ? "" : ` in ${check.dir}`}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function filesSentence(files: FilesReading, relativeTo: string | null): string {
  if (files.kind === "unknown") return `which files changed is unknown (${files.reason})`;
  const counted =
    relativeTo === null
      ? ""
      : ` (counted from ${relativeTo.slice(0, 12)}, since the check ran on uncommitted work)`;
  return files.files.length === 0
    ? `no file outside .greenline/ differs${counted}`
    : `${files.files.join(", ")} changed${counted}`;
}

/** The findings and notices about one change. */
function changeNotes(
  input: ChangesInput,
  change: Assessed,
  view: ChangeView | undefined,
  findings: Note<FindingKind>[],
  notices: Note<NoticeKind>[],
): void {
  const id = change.entry.id;
  const subject: NoteSubject = { kind: "change", id };
  const { standing } = change;
  if (standing.kind === "unparsed")
    findings.push({
      kind: "unparsed",
      message: `the change record '${id}' does not parse: ${standing.issues}; correct it, and nothing else about it is judged until it parses`,
      path: change.path,
      subject,
    });
  if (standing.kind === "judged") {
    for (const mismatch of standing.mismatches)
      findings.push({
        kind: mismatch.kind === "below-floor" ? "below-floor" : "mismatch",
        message: `the ${standing.record.position.state} change '${id}' does not match what its mode asks of this record: ${mismatchSentence(standing.record.mode, mismatch)}`,
        path: change.path,
        subject,
      });
    ruleNotes(input, change, standing.record, findings);
    costNotes(input.definition, change, standing.record, findings);
  }
  const folder = change.entry.folder;
  if (folder !== undefined && folder._tag === "err")
    findings.push({
      kind: "unparsed",
      message: `the folder of '${id}' cannot be read: ${issuesText(folder.error)}; make it readable, or remove what breaks it`,
      path: `${LEDGER}/${id}`,
      subject,
    });
  if (folder !== undefined && folder._tag === "ok")
    for (const file of folder.value.checks)
      if (file.parsed._tag === "err")
        findings.push({
          kind: "unparsed",
          message: `the check facts '${file.file}' of '${id}' do not parse: ${issuesText(file.parsed.error)}; greenline check writes them and a recorded fact is never removed: restore the file from history, or read it with a greenline as new as the one that wrote it; where neither can, tell the owner, who decides`,
          path: `${LEDGER}/${id}/${file.file}`,
          subject,
        });
  if (folder !== undefined && folder._tag === "ok") missingFacts(id, folder.value, notices);
  if (folder !== undefined && folder._tag === "ok") briefNotes(id, folder.value, findings);
  const stated = statedOf(standing);
  if (stated?.position.state === "done") {
    for (const check of change.checks) {
      const latest = check.runs[0];
      if (latest !== undefined && outcomeOf(latest) !== "passed")
        findings.push({
          kind: "checks-failed",
          message: `the done change '${id}' ended with the check '${checkLine(check)}' ${outcomeOf(latest) === "failed" ? "failing" : "unfinished"}: run it again with greenline check until it passes, or reopen the change`,
          path: change.path,
          subject,
        });
    }
    // A run marked a probe shows no check ran; a facts file that does not parse still counts.
    const facts =
      folder !== undefined && folder._tag === "ok"
        ? folder.value.checks.filter(
            (file) => file.parsed._tag === "err" || file.parsed.value.probe !== true,
          ).length
        : 0;
    if (facts === 0)
      notices.push({
        kind: "unchecked",
        message: `the done change '${id}' has no check facts, so nothing shows that a check ran: run its checks with 'greenline check --change ${id} -- <command>'`,
        path: change.path,
        subject,
      });
  }
  for (const check of view?.checks ?? [])
    if (check.code.kind === "moved")
      notices.push({
        kind: "code-moved",
        message: `the code of '${id}' moved after the check '${checkLine(check)}' last ran: ${filesSentence(check.code.files, check.code.relativeTo)}; run the check again on the final code`,
        path: change.path,
        subject,
      });
  if (stated !== undefined && change.entry.text !== undefined)
    citationNotes(change, citedFiles(id, change.entry.text), findings, notices);
}

/** The agents a list names, the last two joined by "and". */
function namesJoined(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/**
 * A stated cost whose agents fall below the starts the record names (the
 * ledger guide, "Fix passes and the cost"): the builder; each first start,
 * `<step> <n>`, that its `starts` names, that a restart there implies, or
 * that a fresh agent's report in its folder, `<step>-<n>.md` of a step the
 * mode runs at the independent or looped depth, shows; and each
 * restart its `starts` names, one more each.
 */
function costNotes(
  definition: ModesDefinition,
  change: Assessed,
  record: ChangeRecord,
  findings: Note<FindingKind>[],
): void {
  if (record.cost === undefined) return;
  // Each first start by its step and number, with the restarts the record names of it.
  const firsts = new Map<string, { step: string; number: number; restarts: number }>();
  const first = (step: string, number: number) => {
    const key = `${step} ${String(number)}`;
    const known = firsts.get(key) ?? { step, number, restarts: 0 };
    firsts.set(key, known);
    return known;
  };
  for (const start of record.starts ?? []) {
    const known = first(start.step, start.number);
    if (start.restarted) known.restarts += 1;
  }
  const folder = change.entry.folder;
  const reports = folder !== undefined && folder._tag === "ok" ? folder.value.reports : [];
  // A report counts where the record's mode runs its step by fresh agents; a
  // method's agent's report, such as frame's research agent's, counts nowhere.
  const mode = definition.modes.find((entry) => entry.name === record.mode);
  for (const file of reports) {
    const report = /^([a-z][a-z0-9-]*)-([1-9]\d*)\.md$/.exec(file);
    const step = definition.steps.find((entry) => entry.name === report?.[1]);
    if (report === null || step === undefined || mode === undefined) continue;
    if (freshAgents(depthOf(mode, step.name)) > 0) first(step.name, Number(report[2]));
  }
  const order = (step: string): number =>
    definition.steps.findIndex((entry) => entry.name === step);
  const named = [...firsts.entries()]
    .sort(([, a], [, b]) => order(a.step) - order(b.step) || a.number - b.number)
    .flatMap(([key, start]) => [
      key,
      ...Array.from({ length: start.restarts }, () => `${key} restarted`),
    ]);
  const needed = 1 + named.length;
  if (record.cost.agents >= needed) return;
  const id = change.entry.id;
  findings.push({
    kind: "cost-below-starts",
    message: `the cost of '${id}' counts ${plural(record.cost.agents, "agent")}, fewer than the ${String(needed)} its record names: ${namesJoined(["the builder", ...named])}; every agent the line's depths start counts, a restart one more: name each start in starts, "<step> <n>" or "<step> <n> restarted", and set agents to the builder and the starts`,
    path: change.path,
    subject: { kind: "change", id },
  });
}

/**
 * Each facts file a run names as the newest before it and the folder no
 * longer holds: a fact removed after a later run started. A fact removed
 * while it was the newest leaves no trace here, the next run naming the one
 * before it.
 */
function missingFacts(id: string, folder: ChangeFolder, notices: Note<NoticeKind>[]): void {
  const present = new Set(folder.checks.map((file) => file.file));
  for (const file of folder.checks) {
    if (file.parsed._tag === "err") continue;
    const previous = file.parsed.value.previous;
    if (previous === undefined || present.has(`${CHECKS}/${previous}`)) continue;
    const name = file.file.slice(`${CHECKS}/`.length);
    notices.push({
      kind: "fact-missing",
      message: `the check facts '${name}' of '${id}' follow '${previous}', which is not in its folder: a recorded fact is never removed or edited; restore it from history where it was committed, and say in the record what it held`,
      path: `${LEDGER}/${id}/${CHECKS}/${previous}`,
      subject: { kind: "change", id },
    });
  }
}

/** A mode's place in the definition's order, fastest first; -1 when the definition does not hold it. */
function rankIn(definition: ModesDefinition, mode: string): number {
  return definition.modes.findIndex((entry) => entry.name === mode);
}

/** The mode a record opened under: the first raise's starting mode, or its mode when it was never raised. */
function openedUnder(record: ChangeRecord): string {
  return record.raises[0]?.from ?? record.mode;
}

/** The entry a ticket's record names in its plan's tickets file, when the file parses and holds it. */
function ticketEntry(
  input: ChangesInput,
  plan: string,
  ticket: string,
): { readonly mode: string } | undefined {
  const found = input.disk.plans.find((entry) => entry.name === plan);
  if (found === undefined || found.contents._tag === "err") return undefined;
  const tickets = found.contents.value.tickets?.parsed;
  if (tickets === undefined || tickets._tag === "err") return undefined;
  return tickets.value.tickets.find((entry) => entry.id === ticket);
}

/**
 * The rules a judged record answers to beyond its mode's skeleton, each read
 * from the record's own fields: a ticket's record opens under the mode its
 * entry gives, and a planning change runs under careful.
 */
function ruleNotes(
  input: ChangesInput,
  change: Assessed,
  record: ChangeRecord,
  findings: Note<FindingKind>[],
): void {
  const id = change.entry.id;
  const subject: NoteSubject = { kind: "change", id };
  const { definition } = input;
  const opened = openedUnder(record);
  const belongs = record.belongs;
  if (belongs?.ticket !== undefined) {
    const entry = ticketEntry(input, belongs.plan, belongs.ticket);
    if (entry !== undefined && entry.mode !== opened) {
      // The owner's words at a ticket's open override its entry; at the list they edit it
      // (the operator's ruling of 2026-10-15). An override still differs from the entry, so
      // it stays GL0406, with a remedy that keeps the owner's choice.
      const where = `.greenline/plans/${belongs.plan}/tickets.md`;
      findings.push({
        kind: "ticket-mode",
        message:
          record.choice.by === "owner"
            ? `the ticket '${belongs.ticket}' of the plan '${belongs.plan}' opened under '${opened}', the mode the owner named as it opened (choice: owner), and its entry in ${where} gives '${entry.mode}': the owner's override stands: keep the record's mode with proposed naming the entry's mode; a mode the owner named while the ticket list waited belongs in the entry: write it into tickets.md`
            : `the ticket '${belongs.ticket}' of the plan '${belongs.plan}' opened under '${opened}', and its entry in ${where} gives '${entry.mode}': a ticket opens its record under the mode the owner approved beside it; correct the record's mode, or raise it from that mode with a raise that says why; a mode the owner named as the ticket opened is recorded choice: owner`,
        path: change.path,
        subject,
      });
    }
  }
  const least = rankIn(definition, PLANNING_LEAST);
  if (
    belongs !== undefined &&
    belongs.ticket === undefined &&
    least !== -1 &&
    rankIn(definition, record.mode) < least
  )
    findings.push({
      kind: "planning-below-careful",
      message:
        record.choice.by === "owner"
          ? `the planning change '${id}' runs under '${record.mode}', the mode the owner named (choice: owner), and a planning change runs under careful: the owner's choice stands: keep the mode, and raise it only on the owner's word`
          : `the planning change '${id}' runs under '${record.mode}', and a planning change runs under careful: raise its mode with a raise that says why, or have the owner choose`,
      path: change.path,
      subject,
    });
}

/**
 * The nudges beside a change (N-56 item 4): lines `status` shows and that
 * fail nothing, each a method the record's own facts cannot settle or a
 * mechanism now holds. A mode taken without waiting that the `proceed`
 * setting does not allow, since a standing choice applies only where it
 * admits the mode and the hooks may have been off or bypassed; a
 * done planning change the decisions book does not name, since what the book
 * should keep is a judgment; a finished change's working files left, which
 * are ignored scratch and no durable fact; and, at close, a record's agents
 * that differ from the fresh agents its harness's events counted.
 */
function nudgesOf(input: ChangesInput, change: Assessed): readonly string[] {
  const id = change.entry.id;
  const nudges: string[] = [];
  const stated = statedOf(change.standing);
  if (change.standing.kind === "judged") {
    const record = change.standing.record;
    const proceed = input.proceed;
    const opened = openedUnder(record);
    const ceiling =
      proceed === undefined || proceed === PROCEED_NONE ? -1 : rankIn(input.definition, proceed);
    const known = proceed !== undefined && (proceed === PROCEED_NONE || ceiling !== -1);
    if (record.choice.by === "standing" && known && rankIn(input.definition, opened) > ceiling)
      nudges.push(
        `it took the mode '${opened}' without waiting (choice: standing), and the proceed setting '${proceed ?? ""}' does not allow it: a standing choice applies only where the proceed setting admits the mode, so have the owner choose the mode`,
      );
  }
  const belongs = stated?.belongs;
  if (
    stated?.position.state === "done" &&
    belongs !== undefined &&
    belongs.ticket === undefined &&
    planHasTickets(input.disk, belongs.plan) === "present" &&
    !(input.decisions ?? "").includes(id)
  )
    nudges.push(
      "the planning change is done and .greenline/DECISIONS.md does not name it: record its lasting choices there with references to their sources, or record that none remain",
    );
  if (isFinished(change) && input.disk.working.includes(id))
    nudges.push(
      `its working files remain in ${WORKING}/${id}/: distil what is worth keeping into its record, then remove them with 'greenline tidy --change ${id}'`,
    );
  const counted = input.agentsCounted.get(id) ?? 0;
  const agents = stated?.cost?.agents;
  if (stated?.position.state === "done" && counted > 0 && agents !== counted + 1)
    nudges.push(
      `its harness's events counted ${plural(counted, "fresh agent")} and its record states agents: ${agents === undefined ? "none" : String(agents)}; the cost counts the builder and each fresh agent`,
    );
  return nudges;
}

/**
 * The files a record cites: each Markdown link whose target, read from the
 * record's own place in the ledger, lies inside the record's folder, as a
 * path relative to that folder; its query and fragment are dropped, its
 * percent escapes read, and a link inside a fence or an inline code span
 * cites nothing. An absolute target is read from the
 * repository root. A link to a heading or a web address, and one that
 * resolves anywhere else, cites nothing.
 */
function citedFiles(id: string, text: string): ReadonlySet<string> {
  const cited = new Set<string>();
  // Text inside a fence or an inline code span quotes a link; it cites nothing.
  const prose = bodyLines(text)
    .filter((line) => !line.fenced)
    .map((line) => line.text.replace(/`[^`]*`/g, ""))
    .join("\n");
  for (const match of prose.matchAll(MARKDOWN_LINK)) {
    const target = unescaped((match[1] ?? "").split(/[?#]/)[0] ?? "");
    if (target === "") continue;
    // A relative target resolves from the ledger, where the record sits; an absolute one from the root.
    const resolved = target.startsWith("/") ? [] : LEDGER.split("/");
    for (const segment of target.split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") resolved.pop();
      else resolved.push(segment);
    }
    const folder = [...LEDGER.split("/"), id];
    if (
      resolved.length > folder.length &&
      folder.every((segment, index) => resolved[index] === segment)
    )
      cited.add(resolved.slice(folder.length).join("/"));
  }
  return cited;
}

/** A link target with its percent escapes read, or as written when they do not decode. */
function unescaped(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/** A cited file that is missing is a finding; in a finished change, a file no link cites is a notice. */
function citationNotes(
  change: Assessed,
  cited: ReadonlySet<string>,
  findings: Note<FindingKind>[],
  notices: Note<NoticeKind>[],
): void {
  const id = change.entry.id;
  const subject: NoteSubject = { kind: "change", id };
  const folder = change.entry.folder;
  if (folder !== undefined && folder._tag === "err") return;
  const reports = folder === undefined ? [] : folder.value.reports;
  const present = new Set([
    ...reports,
    ...(folder === undefined ? [] : folder.value.checks.map((file) => file.file)),
  ]);
  for (const file of [...cited].sort())
    if (!present.has(file))
      findings.push({
        kind: "cited-missing",
        message: `the record of '${id}' links to '${id}/${file}', which is not in its folder: restore the file, or correct the link`,
        path: `${LEDGER}/${id}/${file}`,
        subject,
      });
  if (!isFinished(change)) return;
  for (const file of reports)
    if (!cited.has(file))
      notices.push({
        kind: "uncited",
        message: `the finished change '${id}' holds '${file}' in its folder and its record links to it nowhere: link it from the record, or remove it`,
        path: `${LEDGER}/${id}/${file}`,
        subject,
      });
}

function planNotes(plan: PlanOnDisk, findings: Note<FindingKind>[]): void {
  const where = `.greenline/plans/${plan.name}`;
  const subject: NoteSubject = { kind: "plan", name: plan.name };
  if (plan.contents._tag === "err") {
    findings.push({
      kind: "unparsed",
      message: `the plan directory '${plan.name}' cannot be read: ${issuesText(plan.contents.error)}; make it readable, or remove what breaks it`,
      path: where,
      subject,
    });
    return;
  }
  const { tickets, documents } = plan.contents.value;
  for (const file of [...(tickets === undefined ? [] : [tickets]), ...documents])
    if (file.parsed._tag === "err")
      findings.push({
        kind: "unparsed",
        message: `the plan document '${file.file}' of '${plan.name}' does not parse: ${issuesText(file.parsed.error)}; correct it`,
        path: `${where}/${file.file}`,
        subject,
      });
}

/** The most commits the history line names before it counts the rest. */
const NAMED_COMMITS = 5;

/** How the next commit carries the trailer; a commit already made is left as it is. */
const TRAILER_REMEDY =
  "A change's commits carry the trailer 'Greenline-Change: <id>' in the message's last paragraph, beside any other trailer there such as 'Co-Authored-By'; write it so in the next commit, and leave the commits already made as they are";

/** The commits by their short hash, newest first, the first five named and the rest counted. */
function namedCommits(hashes: readonly string[]): string {
  const named = hashes.slice(0, NAMED_COMMITS).map((hash) => hash.slice(0, 7));
  const rest = hashes.length - named.length;
  if (rest > 0) return `${named.join(", ")} and ${rest} more`;
  if (named.length === 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""}`;
}

function historyNotes(input: ChangesInput, notices: Note<NoticeKind>[]): UnclaimedView {
  if (input.history === undefined) return { kind: "not-read" };
  const subject: NoteSubject = { kind: "history" };
  const deleted = deletedRecords(input.history);
  if (deleted.kind === "known") {
    const onDisk = new Set(input.disk.changes.map((entry) => entry.id));
    for (const id of deleted.items)
      if (!onDisk.has(id))
        notices.push({
          kind: "deleted",
          message: `history shows the change record '${id}' added and later deleted, and it is not on disk: restore it from history if the change is to be kept`,
          path: `${LEDGER}/${id}.md`,
          subject,
        });
  }
  const unclaimed = unclaimedCommits(input.history, input.installed);
  if (unclaimed.kind === "unknown") return { kind: "unknown", why: GAPS[unclaimed.why] };
  const count = unclaimed.items.length;
  return count === 0
    ? { kind: "known", count, named: "" }
    : { kind: "known", count, named: namedCommits(unclaimed.items) };
}

/**
 * The view with its findings and notices, given git's answers about the code.
 * @param assessment the changes read
 * @param answers git's answers to `codeQuestions`
 * @returns the report, the findings and the notices
 */
export function changesReport(assessment: ChangesAssessment, answers: CodeAnswers): ChangesOutcome {
  const { input, request, changes, shown } = assessment;
  const findings: Note<FindingKind>[] = [];
  const notices: Note<NoticeKind>[] = [];
  const views = new Map(shown.map((change) => [change.entry.id, viewOf(input, change, answers)]));
  for (const change of changes)
    changeNotes(input, change, views.get(change.entry.id), findings, notices);
  for (const plan of input.disk.plans) planNotes(plan, findings);
  // A receipt collection is a file of the ledger that names no change it can be read for, so its finding is the view's.
  for (const receipt of input.unreadableReceipts)
    findings.push({
      kind: "unparsed",
      message: `the garden receipt collection '${receipt.path}' cannot be read: ${receipt.issues}; greenline connectors call writes it, so restore the file or remove it, and open a new request for any consultation it held`,
      path: receipt.path,
      subject: { kind: "history" },
    });
  const unclaimed = historyNotes(input, notices);
  const plans = plansView(input, changes);
  if (request.view === "resume") {
    const change =
      views.get(request.change) ??
      shouldNeverHappen(`the change '${request.change}' was checked to be on disk`);
    const about = (subject: NoteSubject): boolean =>
      (subject.kind === "change" && subject.id === request.change) ||
      (subject.kind === "plan" && subject.name === change.plan);
    const own = {
      findings: findings.filter((note) => about(note.subject)),
      notices: notices.filter((note) => about(note.subject)),
    };
    return {
      report: {
        view: "resume",
        change,
        plan: plans.find((plan) => plan.name === change.plan) ?? null,
        findings: own.findings.length,
        notices: own.notices.length,
      },
      ...own,
    };
  }
  const listed = (change: Assessed): ChangeView =>
    views.get(change.entry.id) ?? shouldNeverHappen("every shown change has a view");
  const finished = shown.filter(isFinished);
  return {
    report: {
      view: "list",
      all: request.all,
      current: shown.filter((change) => !isFinished(change)).map(listed),
      finished: finishedNewestFirst(finished).map(listed),
      finishedHidden: changes.filter(isFinished).length - finished.length,
      plans,
      totals: totalsOf(changes),
      unclaimed,
      findings: findings.length,
      notices: notices.length,
    },
    findings,
    notices,
  };
}

// ---- The text ----

function checksLine(view: ChangeView): string {
  if (view.checks.length === 0) return "checks: none";
  const count = (outcome: RunOutcome): number =>
    view.checks.filter((check) => check.outcome === outcome).length;
  const parts = [
    count("passed") > 0 ? `${count("passed")} passed` : "",
    count("failed") > 0 ? `${count("failed")} failed` : "",
    count("unfinished") > 0 ? `${count("unfinished")} unfinished` : "",
  ].filter((part) => part !== "");
  const codes = new Set(view.checks.map((check) => check.code.kind));
  const code = codes.has("moved")
    ? "the code moved after them"
    : codes.has("unknown")
      ? "whether they ran on the final code is unknown"
      : "on the final code";
  return `checks: ${parts.join(", ")}; ${code}`;
}

function commitsLine(commits: CommitsView): string {
  if (commits.kind === "unknown") return `commits: unknown (${commits.why})`;
  const shared = commits.commits.filter((commit) => commit.shared).length;
  return `${plural(commits.commits.length, "commit")}${shared > 0 ? ` (${shared} shared)` : ""}, ${plural(commits.files.length, "file")}`;
}

function modeLine(view: ChangeView): string {
  if (view.mode === null) return "does not parse";
  const proposed = view.proposed === null ? "" : `, proposed ${view.proposed}`;
  const raised =
    view.raises.length === 0
      ? ""
      : `, raised from ${view.raises.map((raise) => raise.from).join(" then ")}`;
  return `${view.mode} (${view.choice ?? "-"}${proposed}${raised})`;
}

function bindingText(binding: ConsultationView["binding"]): string {
  switch (binding.state) {
    case "unresolved":
      return "unresolved";
    case "publication":
      return `publication ${binding.publication}`;
    case "comparison":
      return `comparison of ${binding.from} with ${binding.to}`;
  }
}

function rowLine(view: ChangeView): string {
  if (view.reading === "unparsed") return `    ${view.id}  does not parse`;
  const consulted =
    view.consultations.length === 0 ? [] : [plural(view.consultations.length, "consultation")];
  const next =
    (view.state === "open" || view.state === "stopped") &&
    view.next !== null &&
    view.next !== "none"
      ? `, next ${view.next}`
      : "";
  return [
    `    ${view.id}`,
    `${view.state ?? "-"}${next}`,
    modeLine(view),
    `step ${view.step ?? (view.reading === "history" ? "(history)" : "-")}`,
    `review ${view.reviewed ?? "-"}`,
    commitsLine(view.commits),
    checksLine(view),
    ...consulted,
  ].join("  ");
}

/** A change's row, with each nudge beside it on a line of its own. */
function rowLines(view: ChangeView): readonly string[] {
  return [rowLine(view), ...view.nudges.map((nudge) => `      ${nudge}`)];
}

function planLines(plan: PlanView): readonly string[] {
  if (!plan.readable) return [`    ${plan.name}  cannot be read`];
  if (plan.tickets === null) return [`    ${plan.name}  no tickets file`];
  return [
    `    ${plan.name}  tickets ${plan.tickets}; ready: ${plan.frontier.length === 0 ? "none" : plan.frontier.join(", ")}`,
    ...plan.progress.map((entry) => `      ${entry.ticket}  ${entry.progress}`),
  ];
}

function totalsLine(totals: ChangeTotals): string {
  const modes = totals.byMode.map((entry) => `${entry.mode} ${entry.changes}`).join(", ");
  const unparsed = totals.unparsed > 0 ? `, ${totals.unparsed} not parsed` : "";
  return `  totals: ${totals.changes} ${totals.changes === 1 ? "change" : "changes"}${unparsed}; ${modes === "" ? "no mode" : modes}; the owner chose ${totals.ownerChose}; raised ${totals.raised}; cost ${plural(totals.cost.agents, "agent")} and ${plural(totals.cost.rounds, "round")}, from the ${plural(totals.cost.changes, "change")} that state it`;
}

function unclaimedLine(unclaimed: UnclaimedView): string {
  switch (unclaimed.kind) {
    case "not-read":
      return "  history: not read, since no change record is on disk";
    case "unknown":
      return `  history: unknown (${unclaimed.why})`;
    case "known":
      return unclaimed.count === 0
        ? "  history: every commit since the first change record belongs to a change"
        : `  history: ${plural(unclaimed.count, "commit")} since the first change record, on the first parent and not merges, ${unclaimed.count === 1 ? "touches" : "touch"} code and ${unclaimed.count === 1 ? "belongs" : "belong"} to no change: ${unclaimed.named}. ${TRAILER_REMEDY}`;
  }
}

function resumeLines(view: ChangeView, plan: PlanView | null): readonly string[] {
  const lines = [`change ${view.id} (${view.path})`];
  if (view.reading === "unparsed") return [...lines, "  the record does not parse"];
  if (view.reading === "history")
    lines.push("  read as history: its form alone, as it states it, not judged against the modes");
  lines.push(
    `  mode: ${modeLine(view)}`,
    `  why: ${view.why ?? "-"}`,
    `  state: ${view.state ?? "-"}`,
    `  next: ${view.next ?? "-"}`,
    `  step reached: ${view.step ?? "-"}`,
  );
  for (const raise of view.raises) lines.push(`  raised from ${raise.from}: ${raise.reason}`);
  if (view.floors.length > 0) lines.push(`  floors: ${view.floors.join(", ")}`);
  if (view.reviewed !== null) lines.push(`  review depth: ${view.reviewed}`);
  if (view.plan !== null)
    lines.push(`  plan: ${view.plan}${view.ticket === null ? "" : `, ticket ${view.ticket}`}`);
  if (view.cost !== null)
    lines.push(
      `  cost: ${plural(view.cost.agents, "agent")}, ${plural(view.cost.rounds, "round")}`,
    );
  lines.push(`  ${commitsLine(view.commits)}`);
  if (view.commits.kind === "known") {
    for (const commit of view.commits.commits)
      lines.push(`    ${commit.hash.slice(0, 12)}${commit.shared ? " (shared)" : ""}`);
    if (view.commits.files.length > 0) lines.push(`  files: ${view.commits.files.join(", ")}`);
  }
  lines.push(view.checks.length === 0 ? "  checks: none" : "  checks:");
  for (const check of view.checks) {
    const step = check.step === null ? "" : ` (step ${check.step})`;
    const exit =
      check.exit === null
        ? "no outcome"
        : check.exit.kind === "exited"
          ? `exit ${check.exit.code}`
          : check.exit.kind === "signalled"
            ? `ended by ${check.exit.signal}`
            : "could not start";
    lines.push(
      `    ${checkLine(check)}${step}: ${check.outcome}, ${exit}, started ${check.startedAt}${check.runs > 1 ? `, latest of ${check.runs} runs` : ""}`,
    );
    lines.push(
      check.code.kind === "final"
        ? "      ran on the final code"
        : check.code.kind === "unknown"
          ? `      whether it ran on the final code is unknown (${check.code.why})`
          : `      the code moved after it: ${filesSentence(check.code.files, check.code.relativeTo)}`,
    );
  }
  const since = view.sinceCheck;
  if (since?.kind === "counted" && since.commits > 0)
    lines.push(
      `  ${plural(since.commits, "commit")} since the last recorded check, started ${since.startedAt}: run the change's checks again through greenline check -- <command>`,
    );
  if (since?.kind === "unknown")
    lines.push(`  commits since the last recorded check: unknown (${since.why})`);
  if (view.briefs.length > 0)
    lines.push(
      `  briefs greenline brief wrote: ${view.briefs.map((brief) => brief.file).join(", ")}; the close cites each`,
    );
  if (view.declaredChecks.length > 0)
    lines.push(
      "  declared checks, the latest run of each:",
      ...view.declaredChecks.map((standing) => `  ${standingLine(standing)}`),
    );
  for (const nudge of view.nudges) lines.push(`  ${nudge}`);
  if (view.consultations.length > 0)
    lines.push(
      `  consultations (${view.consultations.length}):`,
      ...view.consultations.map(
        (entry) =>
          `    ${entry.request}  ${bindingText(entry.binding)}, ${plural(entry.calls, "call")}`,
      ),
    );
  if (plan !== null) lines.push("  plan:", ...planLines(plan));
  return lines;
}

/**
 * The changes view as text: deterministic, facts only. The findings and
 * notices are counted here and printed as the command's diagnostics.
 * @param report the view
 * @returns the text, ending with a newline
 */
export function renderChangesText(report: ChangesReport): string {
  if (report.view === "unavailable") return `changes: unavailable (${report.reason})\n`;
  const counts = `  findings: ${report.findings}; notices: ${report.notices}`;
  if (report.view === "resume")
    return [...resumeLines(report.change, report.plan), counts, ""].join("\n");
  if (report.totals.changes === 0 && report.plans.length === 0) return "changes: none recorded\n";
  const lines = ["changes"];
  lines.push(
    report.current.length === 0 ? "  open and stopped: none" : "  open and stopped:",
    ...report.current.flatMap(rowLines),
  );
  const finishedTitle = report.all
    ? "  finished:"
    : `  finished, the last ${report.finished.length}${report.finishedHidden > 0 ? ` of ${report.finished.length + report.finishedHidden}` : ""}:`;
  lines.push(
    report.finished.length === 0 ? "  finished: none" : finishedTitle,
    ...report.finished.flatMap(rowLines),
  );
  if (report.plans.length > 0) lines.push("  plans:", ...report.plans.flatMap(planLines));
  lines.push(totalsLine(report.totals), unclaimedLine(report.unclaimed), counts, "");
  return lines.join("\n");
}
