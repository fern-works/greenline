import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isBriefFile, readBrief } from "../../core/brief.ts";
import {
  currentStep,
  isChangeId,
  parseChangeRecord,
  parseRecordForm,
  type Position,
  type RecordForm,
} from "../../core/change.ts";
import { contractFailure, contractOk } from "../../core/contract.ts";
import { FRAME_MAP_FILE } from "../../core/frame-map.ts";
import { parseChecksFile, type HookRun } from "../../core/facts.ts";
import type { ParsedFile } from "../../core/status.ts";
import { recordFacts } from "../../core/git-hooks.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import type { CheckFacts } from "../../core/facts.ts";
import {
  depthOf,
  inapplicableLine,
  kindNamed,
  stepApplies,
  type Depth,
  type ModesDefinition,
} from "../../core/modes.ts";
import {
  lineStations,
  recordPart,
  sectionStateOf,
  type RecordPart,
  type SectionState,
} from "../../core/progress.ts";
import type { ChangeOnDisk, ChangeView, CheckView, PlanOnDisk } from "../../core/status.ts";
import { planHasTickets, readChangesOnDisk } from "../changes.ts";
import { commitTreeId, OncePerState, pinnedHead, workingTreeId } from "../code-tree.ts";
import { listFilesRecursive } from "../fs/walk.ts";
import { runStatus } from "../cli/status.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import type {
  BriefEntry,
  CommitsDocument,
  ChangeDetail,
  ChangeSize,
  ChangeSummary,
  CheckFactsDocument,
  ChangeListEntry,
  ChangeState,
  ChangesList,
  ChecksView,
  CodeTargetView,
  FolderFile,
  RecordCard,
  RunView,
  SectionView,
  StepState,
  StepSummary,
  StripStep,
  Trailer,
  WaitingOn,
} from "../../core/inspector/documents.ts";
import { posix } from "node:path";
import { changedFilesOf, commitFiles, installedTest } from "./changed-files.ts";
import { changeResolver } from "./links.ts";
import { renderMarkdown, type LinkResolver } from "./markdown.ts";
import { changeRef } from "./refs.ts";
import { readShownFile } from "./repository-read.ts";
import { waitingOn } from "./waiting.ts";

/*
 * The changes view's data: the change records, their folders and their
 * check facts as `readChangesOnDisk` reads them, with the status
 * derivations (`runStatus`'s resume view) for what a record means: the step
 * reached, the commits, each check's verdict on the final code and the
 * findings. Nothing here writes; every read is of the repository as it
 * stands when the page asks.
 */

const LEDGER = ".greenline/ledger";

/**
 * The subject and date of each commit asked, read from git by the server,
 * which owns the inspector's git reads; a commit git cannot describe is
 * left out and shown with its subject unknown.
 */
export type CommitLog = (
  hashes: readonly string[],
) => ReadonlyMap<
  string,
  { readonly subject: string; readonly date: string; readonly trailers: readonly Trailer[] }
>;

function openedOf(id: string, today: Date): Pick<ChangeListEntry, "opened" | "ageDays"> {
  const opened = id.slice(0, 10);
  const start = Date.parse(`${opened}T00:00:00.000Z`);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return { opened, ageDays: Math.max(0, Math.round((now - start) / 86_400_000)) };
}

function issuesText(error: ContractParseFailed): string {
  return error.issues
    .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
    .join("; ");
}

/** A record read for its form: the form, or why it does not parse. */
export interface FormReading {
  readonly form: RecordForm | undefined;
  readonly problem: string | null;
}

/**
 * The record read for its form, which every state and installation keeps readable.
 * @param entry the change on disk
 * @returns the form, or why it does not parse
 */
export function formOf(entry: ChangeOnDisk): FormReading {
  if (entry.text === undefined)
    return {
      form: undefined,
      problem: entry.record._tag === "err" ? issuesText(entry.record.error) : "unreadable",
    };
  const form = parseRecordForm(`${entry.id}.md`, entry.text);
  if (form._tag === "err") return { form: undefined, problem: issuesText(form.error) };
  return { form: form.value, problem: null };
}

/**
 * A change's state in the contract's vocabulary: an open record waits
 * where its next word is the owner's, a record with no choice line is
 * proposed, and the rest are as the record states them.
 * @param form the record's form, undefined where it does not parse
 * @param text the record's text
 * @param waiting what it waits on
 * @returns the state, or null for a record that does not read
 */
function stateOf(
  form: RecordForm | undefined,
  text: string | undefined,
  waiting: WaitingOn | null,
): ChangeState | null {
  if (form === undefined) {
    const facts = text === undefined ? undefined : recordFacts(text);
    return facts?.readable === true &&
      facts.choice === undefined &&
      (facts.state === undefined || facts.state === "open")
      ? "proposed"
      : null;
  }
  const state = form.position.state;
  if (state !== "open") return state;
  return waiting === null ? "in-progress" : "waiting";
}

/** What a record waits on from the owner, read from its form and its step. */
function waitingOf(root: string, form: RecordForm | undefined, step: string | null, id: string) {
  if (form === undefined) return null;
  const position = form.position;
  return waitingOn(root, {
    id,
    state: position.state,
    next: position.state === "open" || position.state === "stopped" ? position.next : undefined,
    step,
    touchesInterface: form.interface?.touches === true,
  });
}

function nextOf(form: RecordForm): string | null {
  const position = form.position;
  if (position.state !== "open" && position.state !== "stopped") return null;
  return position.next === undefined || position.next === "none" ? null : position.next;
}

/**
 * Every change on disk for the list: the open and stopped changes and those
 * that do not parse first, then the finished, each group newest id first.
 * @param root the repository root
 * @param env the CLI environment, for the installation's modes
 * @param today the date ages are counted to
 * @returns the list, or why the ledger cannot be read
 */
export function changesList(root: string, env: CliEnvironment, today: Date): ChangesList {
  return readChanges(root, env, today).list;
}

/** The list with what the status derivations hold of each change, which the desk reads too. */
export interface ChangesReading {
  readonly list: ChangesList;
  /** Each change's view by id, from the status derivations' list. */
  readonly views: ReadonlyMap<string, ChangeView>;
  /** The finished changes, the most recently closed first, as status orders them. */
  readonly closed: readonly string[];
}

/** Status's list of every change, run once for the state a build reads. */
const listed = new OncePerState<ReturnType<typeof runStatus>>();

/**
 * Status's list of every change, the changes' views and the plans', run once
 * for the state a build reads (J-154 S2) and shared by the list, Now and the
 * plans.
 * @param root the repository root
 * @param env the environment it reads under
 * @returns status's answer
 */
export function listedStatus(root: string, env: CliEnvironment): ReturnType<typeof runStatus> {
  return listed.answer(root, () => runStatus({ ...env, cwd: root }, { view: "list", all: true }));
}

/**
 * Every change on disk with its status derivations: the list, each
 * change's view and the order the finished closed in.
 * @param root the repository root
 * @param env the CLI environment, for the installation's modes and the status derivations
 * @param today the date ages are counted to
 * @returns the reading
 */
export function readChanges(root: string, env: CliEnvironment, today: Date): ChangesReading {
  const definition = env.installation.modes;
  const disk = readChangesOnDisk(root, definition);
  if (disk._tag === "err")
    return {
      list: {
        changes: [],
        unavailable: disk.error.issues.map((issue) => issue.message).join("; "),
      },
      views: new Map(),
      closed: [],
    };
  const status = listedStatus(root, env).changes;
  const listed = status?.view === "list" ? [...status.current, ...status.finished] : [];
  const views = new Map(listed.map((view) => [view.id, view]));
  const plans = disk.value.plans;
  const facts = listFacts(root, views);
  const entries = disk.value.changes.map((entry): ChangeListEntry => {
    const { form, problem: formProblem } = formOf(entry);
    const recorded = form?.position.state ?? null;
    // An open or stopped record is read against the modes too; one that fails there names why, as status does.
    const problem =
      formProblem ??
      ((recorded === "open" || recorded === "stopped") && entry.record._tag === "err"
        ? issuesText(entry.record.error)
        : null);
    const waiting = waitingOf(root, form, views.get(entry.id)?.step ?? null, entry.id);
    return {
      id: entry.id,
      ref: changeRef(entry.id),
      path: `${LEDGER}/${entry.id}.md`,
      state: stateOf(form, entry.text, waiting),
      waitingOn: waiting,
      mode: form?.mode ?? null,
      why: form?.why ?? null,
      next: form === undefined ? null : nextOf(form),
      plan: form?.belongs?.plan ?? null,
      ticket: form?.belongs?.ticket ?? null,
      ...openedOf(entry.id, today),
      problem,
      step: views.get(entry.id)?.step ?? null,
      strip:
        form === undefined
          ? []
          : stripOf(
              sectionsOf(definition, form, views.get(entry.id)?.step ?? null, partOf(form, plans)),
            ),
      ...(facts.get(entry.id) ?? NO_FACTS),
    };
  });
  // A finished change's close is its last commit's time; an open change has none yet.
  const closed = (entry: ChangeListEntry): ChangeListEntry =>
    entry.state === "done" || entry.state === "dropped" ? entry : { ...entry, closedAt: null };
  // A record that does not parse stands with the work in progress, where the owner looks first.
  const current = (entry: ChangeListEntry): boolean =>
    entry.state !== "done" && entry.state !== "dropped";
  const newest = (a: ChangeListEntry, b: ChangeListEntry): number =>
    a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  return {
    list: {
      changes: [
        ...entries.filter(current).sort(newest),
        ...entries.filter((entry) => !current(entry)).sort(newest),
      ].map(closed),
      unavailable: null,
    },
    views,
    closed: status?.view === "list" ? status.finished.map((view) => view.id) : [],
  };
}

/** A change's commits counted and timed, as the list carries them (J-165 S1). */
type ListFacts = Pick<ChangeListEntry, "closedAt" | "lastAt" | "size" | "commits">;

/** The facts of a change whose commits cannot be listed. */
const NO_FACTS: ListFacts = { closedAt: null, lastAt: null, size: null, commits: null };

/** The list's facts kept for the commit HEAD names, each change's by its commits: a new HEAD reads them again. */
let keptFacts: { root: string; head: string; facts: Map<string, ListFacts> } | undefined;

/**
 * Each change's last commit's time, its size and its commits, read from git
 * once for the commits the change holds and kept on HEAD, so a write to the
 * ledger that moves no commit reads none of them again (J-165 S1). The
 * close time is the last commit's; the caller keeps it for a finished change.
 * @param root the repository root
 * @param views each change's view by id, from the status derivations
 * @returns the facts by change id
 */
function listFacts(root: string, views: ReadonlyMap<string, ChangeView>): Map<string, ListFacts> {
  const head = pinnedHead(root) ?? "";
  if (keptFacts?.root !== root || keptFacts.head !== head || head === "")
    keptFacts = { root, head, facts: new Map() };
  const kept = keptFacts.facts;
  const hashes = (view: ChangeView): readonly string[] | undefined =>
    view.commits.kind === "known" ? view.commits.commits.map((commit) => commit.hash) : undefined;
  const keyOf = (id: string, held: readonly string[]): string => `${id}\0${held.join(",")}`;
  const asked = [...views.values()].flatMap((view) => {
    const held = hashes(view);
    return held === undefined || kept.has(keyOf(view.id, held)) ? [] : held;
  });
  const read = asked.length === 0 ? new Map() : commitFiles(root, asked);
  const installed = asked.length === 0 ? () => false : installedTest(root);
  const facts = new Map<string, ListFacts>();
  for (const view of views.values()) {
    const held = hashes(view);
    if (held === undefined) continue;
    const key = keyOf(view.id, held);
    const known = kept.get(key);
    if (known !== undefined) {
      facts.set(view.id, known);
      continue;
    }
    if ("unknown" in read) continue;
    const commits = held.flatMap((hash) => {
      const found = read.get(hash);
      return found === undefined ? [] : [found];
    });
    const last = commits
      .map((commit) => commit.date)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1);
    const files = changedFilesOf(commits, installed);
    const size: ChangeSize = { ...files.totals, installed: files.installed };
    const fact: ListFacts = {
      closedAt: last ?? null,
      lastAt: last ?? null,
      size,
      commits: held.length,
    };
    kept.set(key, fact);
    facts.set(view.id, fact);
  }
  return facts;
}

/**
 * Which part of a split the record is: a ticket's, the planning record of a
 * plan with tickets, or the whole work (`recordPart`, which the mirror's
 * progress line reads too).
 */
function partOf(form: RecordForm | undefined, plans: readonly PlanOnDisk[]): RecordPart {
  if (form === undefined) return "whole";
  const plan = plans.find((candidate) => candidate.name === form.belongs?.plan);
  return recordPart(
    form,
    plan?.contents._tag === "ok" && plan.contents.value.tickets !== undefined,
  );
}

/**
 * The step strip's words: each step of the line with its section's state,
 * whether it is the step reached and its depth.
 * @param sections the record's sections in the line's order
 * @returns one station per step
 */
function stripOf(sections: readonly SectionView[]): readonly StripStep[] {
  return sections
    .filter((section) => section.kind === "step")
    .map((section) => ({
      step: section.heading,
      state: section.state,
      current: section.current,
      depth: section.depth,
    }));
}

function depthWords(depth: Depth, mode: string): string {
  switch (depth.depth) {
    case "none":
      return `skipped at ${mode}`;
    case "inline":
      return "inline, one line";
    case "written":
      return "written";
    case "independent":
      return `independent, ${depth.agents} fresh agent${depth.agents === 1 ? "" : "s"}`;
    case "looped":
      return `looped, up to ${depth.rounds} round${depth.rounds === 1 ? "" : "s"}`;
  }
}

/**
 * A section's state in the contract's vocabulary: held by the other record
 * of a split, skipped by the mode, the step the change is at now, written,
 * or not yet written.
 * @param state the section's state in the record
 * @param current whether it is the step the change is at
 * @returns the step's state
 */
function stepStateOf(state: SectionState, current: boolean): StepState {
  if (state === "elsewhere") return "in-plan";
  if (state === "skipped") return "skipped";
  if (current) return "now";
  return state === "written" ? "written" : "not-yet";
}

/**
 * The body in the line's order: a start's section first, where the kind
 * opens the request, then every step of the line, written or not, then any
 * other heading the record holds, so nothing it says is hidden.
 */
function sectionsOf(
  definition: ModesDefinition,
  form: RecordForm,
  step: string | null,
  part: "ticket" | "plan" | "whole",
): readonly SectionView[] {
  const mode = definition.modes.find((entry) => entry.name === form.mode);
  // A ticket's record leaves the plan's steps to the planning record, which leaves the ticket's steps to its tickets'.
  const holder = part === "ticket" ? "plan" : part === "plan" ? "ticket" : null;
  const steps = new Set<string>(definition.steps.map((entry) => entry.name));
  const kindOf = (heading: string) =>
    steps.has(heading) ? undefined : kindNamed(definition, heading);
  const plain = (
    heading: string,
    text: string,
    rounds: number,
    kind: "kind" | "other",
  ): SectionView => ({
    heading,
    kind,
    state: stepStateOf(sectionStateOf(text), false),
    depth: null,
    text,
    html: "",
    rounds,
    current: false,
    heldBy: null,
  });
  const before = form.sections
    .filter((section) => kindOf(section.heading)?.mechanism === "open")
    .map((section) => plain(section.heading, section.text, section.rounds, "kind"));
  // The stations are the mirror's progress line's too (`src/core/progress.ts`), so the strip and the line never disagree.
  const stations = lineStations(definition, form, part);
  const line = definition.steps.map((entry, index): SectionView => {
    const found = form.sections.find((section) => section.heading === entry.name);
    const heldBy = holder !== null && entry.whenSplit === holder ? holder : null;
    // A step that applies by a fact the record does not state shows the line it holds there (J-123 S2).
    const inapplicable =
      entry.appliesWhen === undefined ||
      stepApplies(entry, { interface: form.interface?.touches === true })
        ? undefined
        : inapplicableLine(entry.appliesWhen);
    return {
      heading: entry.name,
      kind: "step",
      state: stepStateOf(
        stations[index]?.state ?? sectionStateOf(found?.text),
        step === entry.name,
      ),
      depth:
        mode === undefined
          ? null
          : (inapplicable ?? depthWords(depthOf(mode, entry.name), mode.name)),
      text: found?.text ?? "",
      html: "",
      rounds: found?.rounds ?? 0,
      current: step === entry.name,
      heldBy,
    };
  });
  const after = form.sections
    .filter(
      (section) => !steps.has(section.heading) && kindOf(section.heading)?.mechanism !== "open",
    )
    .map((section) =>
      plain(
        section.heading,
        section.text,
        section.rounds,
        kindOf(section.heading) === undefined ? "other" : "kind",
      ),
    );
  return [...before, ...line, ...after];
}

/**
 * One file of a change's folder with its text rendered when it is Markdown:
 * a brief's first line, the command's mark, is left out, since the page
 * names the brief's step and round instead.
 */
function folderFile(root: string, id: string, folder: readonly string[], file: string): FolderFile {
  const path = `${LEDGER}/${id}/${file}`;
  const shown = readShownFile(root, path);
  const html =
    shown.text === null || !file.endsWith(".md")
      ? null
      : renderMarkdown(
          shown.text.replace(/^<!-- greenline brief [^\n]*-->\n?/, ""),
          changeResolver(id, folder, posix.dirname(path)),
        );
  return { file, text: shown.text, html, problem: shown.problem };
}

function endedOf(run: CheckFacts): string | null {
  if (run.state === "started") return null;
  const outcome = run.outcome;
  if (outcome.kind === "exited") return `exit ${outcome.code}`;
  if (outcome.kind === "signalled") return `signal ${outcome.signal}`;
  return `never started: ${outcome.message}`;
}

function outcomeOf(run: CheckFacts): RunView["outcome"] {
  if (run.state === "started") return "unfinished";
  return run.outcome.kind === "exited" && run.outcome.code === 0 ? "passed" : "failed";
}

function verdictOf(check: CheckView): string {
  const code = check.code;
  if (code.kind === "final") return "ran on the final code";
  if (code.kind === "unknown") return `whether it ran on the final code is unknown: ${code.why}`;
  if (code.files.kind === "unknown")
    return `the code moved after it; which files is unknown: ${code.files.reason}`;
  const count = code.files.files.length;
  return `the code moved after it: ${count} file${count === 1 ? "" : "s"} changed`;
}

function treeOf(reading: ReturnType<typeof commitTreeId>): string | null {
  return reading.kind === "tree" ? reading.id : null;
}

/**
 * The check facts against the commits: every run read from the folder,
 * placed under each commit, or the working tree, whose code is exactly the
 * code it ran on, by the tree id `greenline check` records; a run on code
 * none of them holds is listed apart.
 */
function checksOf(
  root: string,
  entry: ChangeOnDisk,
  view: ChangeView | undefined,
  state: Position["state"] | null,
  log: CommitLog,
): ChecksView {
  const folder = entry.folder?._tag === "ok" ? entry.folder.value : undefined;
  const latest = new Map<string, CheckView>(
    (view?.checks ?? []).map((check) => [JSON.stringify(check.arguments), check]),
  );
  const problems: { file: string; message: string }[] = [];
  const runs: RunView[] = [];
  for (const file of folder?.checks ?? []) {
    if (file.parsed._tag === "err") {
      problems.push({
        file: file.file,
        message: file.parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }
    const run = file.parsed.value;
    const judged = latest.get(JSON.stringify(run.arguments));
    const isLatest =
      run.probe !== true && judged !== undefined && judged.startedAt === run.startedAt;
    runs.push({
      file: file.file,
      command: run.arguments,
      step: run.step ?? null,
      outcome: outcomeOf(run),
      ended: endedOf(run),
      startedAt: run.startedAt,
      durationMs: run.state === "finished" ? run.durationMs : null,
      commit: run.commit,
      tree: run.tree,
      probe: run.probe === true,
      latest: isLatest,
      verdict: isLatest && judged !== undefined ? verdictOf(judged) : null,
    });
  }
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  const commits = view?.commits;
  const known = commits?.kind === "known" ? commits.commits : [];
  const subjects = log(known.map((commit) => commit.hash));
  const on = (tree: string | null): readonly RunView[] =>
    tree === null ? [] : runs.filter((run) => run.tree === tree);
  const targets: CodeTargetView[] = [];
  for (const commit of known) {
    const tree = runs.length === 0 ? null : treeOf(commitTreeId(root, commit.hash));
    const logged = subjects.get(commit.hash);
    targets.push({
      kind: "commit",
      hash: commit.hash,
      subject: logged?.subject ?? null,
      date: logged?.date ?? null,
      trailers: logged?.trailers ?? [],
      shared: commit.shared,
      tree,
      runs: on(tree),
    });
  }
  // A change still in progress may hold code no commit holds yet; the working
  // tree is listed only then, first, so a run on committed code shows once.
  if ((state === "open" || state === "stopped") && runs.length > 0) {
    const tree = treeOf(workingTreeId(root));
    if (tree === null || !targets.some((target) => target.tree === tree))
      targets.unshift({
        kind: "working-tree",
        hash: null,
        subject: null,
        date: null,
        trailers: [],
        shared: false,
        tree,
        runs: on(tree),
      });
  }
  const covered = new Set(targets.flatMap((target) => target.runs.map((run) => run.file)));
  return {
    targets,
    commitsUnknown: commits?.kind === "unknown" ? commits.why : null,
    elsewhere: runs.filter((run) => !covered.has(run.file)),
    problems,
    runs: runs.length,
  };
}

function sinceWords(view: ChangeView | undefined): string | null {
  const since = view?.sinceCheck;
  if (since === null || since === undefined) return null;
  if (since.kind === "none-recorded") return "no check recorded yet";
  if (since.kind === "unknown") return `unknown: ${since.why}`;
  return `${since.commits} commit${since.commits === 1 ? "" : "s"} of code since the last check`;
}

function bindingWords(binding: ChangeView["consultations"][number]["binding"]): string {
  if (binding.state === "unresolved") return "unresolved";
  if (binding.state === "publication") return `publication ${binding.publication}`;
  return `comparison of ${binding.from} with ${binding.to}`;
}

function cardOf(
  form: RecordForm | undefined,
  entry: ChangeOnDisk,
  step: string | null,
  state: ChangeState | null,
): RecordCard {
  const starts =
    entry.record._tag === "ok" && entry.record.value.starts !== undefined
      ? entry.record.value.starts.map(
          (start) => `${start.step} ${start.number}${start.restarted ? " restarted" : ""}`,
        )
      : null;
  const choice = form?.choice;
  return {
    mode: form?.mode ?? null,
    choice: choice?.by ?? null,
    proposed: choice?.by === "owner" ? (choice.proposed ?? null) : null,
    why: form?.why ?? null,
    state,
    next: form === undefined ? null : nextOf(form),
    step,
    floors: form?.floors ?? [],
    raises: form?.raises ?? [],
    reviewed: form?.reviewed ?? null,
    plan: form?.belongs?.plan ?? null,
    ticket: form?.belongs?.ticket ?? null,
    agents: form?.cost?.agents ?? null,
    rounds: form?.cost?.rounds ?? null,
    starts,
    lines: form?.lines ?? [],
    landing: form?.landing ?? null,
    rebase: form?.rebase ?? null,
    discard: form?.discard ?? null,
    stopped: form?.stopped ?? null,
    ground: form?.ground ?? null,
    agent: form?.agent ?? null,
    from: form?.from ?? [],
    refreshes: form?.refreshes ?? [],
  };
}

/**
 * One change's record and its own folder, read alone (J-165 S1): the record
 * parsed for its form and against the modes, and the folder's files by name
 * with its briefs and its check facts, as `readChangesOnDisk` reads each
 * change, and no other change's record read. Undefined where no record of
 * that id stands directly under the ledger.
 * @param root the repository root
 * @param definition the installation's modes
 * @param id the change's id
 * @returns the change on disk, or undefined
 */
function changeOnDisk(
  root: string,
  definition: CliEnvironment["installation"]["modes"],
  id: string,
): ChangeOnDisk | undefined {
  if (!isChangeId(id)) return undefined;
  const name = `${id}.md`;
  const path = join(root, LEDGER, name);
  let text: string | undefined;
  try {
    if (!statSync(path).isFile()) return undefined;
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    text = undefined;
  }
  const record =
    text === undefined
      ? contractFailure(name, [{ path: "", message: "unreadable" }])
      : parseChangeRecord(definition, name, text);
  return { id, text, record, folder: folderOf(root, id) };
}

/** A change's folder read as `readChangesOnDisk` reads it: its files by name, its briefs and its check facts. */
function folderOf(root: string, id: string): ChangeOnDisk["folder"] {
  const folder = join(root, LEDGER, id);
  let files: readonly string[];
  try {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) return undefined;
    files = listFilesRecursive(folder);
  } catch (error) {
    return contractFailure(`${LEDGER}/${id}`, [
      { path: "", message: `unreadable: ${String(error)}` },
    ]);
  }
  const isFacts = (file: string): boolean => file.startsWith("checks/") && file.endsWith(".json");
  const isLoads = (file: string): boolean => /^skills\/[^/]+\.jsonl$/.test(file);
  const checks: ParsedFile<CheckFacts>[] = [];
  const hookRuns: ParsedFile<HookRun>[] = [];
  for (const file of files.filter(isFacts)) {
    let facts: string;
    try {
      facts = readFileSync(join(folder, file), "utf8");
    } catch (error) {
      checks.push({
        file,
        parsed: contractFailure(file, [{ path: "", message: `unreadable: ${String(error)}` }]),
      });
      continue;
    }
    const parsed = parseChecksFile(facts, file);
    if (parsed.kind === "hook") hookRuns.push({ file, parsed: parsed.parsed });
    else checks.push({ file, parsed: parsed.parsed });
  }
  return contractOk({
    reports: files.filter((file) => !isFacts(file) && !isLoads(file) && file !== FRAME_MAP_FILE),
    loads: [],
    briefs: files.filter(isBriefFile).map((file) => {
      try {
        return { file, text: readFileSync(join(folder, file), "utf8") };
      } catch {
        return { file, text: undefined };
      }
    }),
    checks,
    hookRuns,
  });
}

/** A record's reading as the status derivations read it, and the step a judged record reached (J-165 S1). */
interface RecordStanding {
  readonly reading: ChangeDetail["reading"];
  readonly step: string | null;
}

/**
 * How the status derivations read a record, with no git read and no other
 * record read (J-165 S1): unparsed where it does not parse; read as history
 * where it was dropped, or done and its latest check ran under another
 * installation; else judged, with the step it reached, the one its "next"
 * line names or the one its sections reach, as `greenline status` reads it.
 * @param root the repository root
 * @param env the environment, for the modes and the installation's revision
 * @param entry the change on disk
 * @param form its form, undefined where it does not parse
 * @returns its reading and the step a judged record reached
 */
function standingOf(
  root: string,
  env: CliEnvironment,
  entry: ChangeOnDisk,
  form: RecordForm | undefined,
): RecordStanding {
  if (form === undefined) return { reading: "unparsed", step: null };
  const state = form.position.state;
  const runs =
    entry.folder?._tag === "ok"
      ? entry.folder.value.checks.flatMap((file) =>
          file.parsed._tag === "ok" && file.parsed.value.probe !== true ? [file.parsed.value] : [],
        )
      : [];
  const latest = [...runs].sort((a, b) =>
    a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0,
  )[0];
  const current = state === "done" && latest?.installation === env.installation.revision;
  if (state === "dropped" || (state === "done" && !current))
    return { reading: "history", step: null };
  if (entry.record._tag === "err") return { reading: "unparsed", step: null };
  const record = entry.record.value;
  const plan = record.belongs?.plan;
  const tickets =
    plan !== undefined && planHasTickets(root, plan, env.installation.modes) ? "present" : "absent";
  return {
    reading: "judged",
    step: currentStep(env.installation.modes, record, { ticketsFile: tickets }) ?? "none",
  };
}

/** One change read for its head: its detail, its state, what it waits on and its strip, and its pieces on demand (J-165 S1). */
export interface ChangeHead {
  readonly detail: ChangeDetail;
  readonly state: ChangeState | null;
  readonly waitingOn: WaitingOn | null;
  readonly strip: readonly StripStep[];
  /** One section with its text rendered, which the step document serves; undefined for a heading the record does not hold. */
  readonly section: (heading: string) => SectionView | undefined;
  /** One file of the change's folder with its text, by its name; undefined for a name the folder does not hold. */
  readonly file: (name: string) => FolderFile | undefined;
}

/**
 * One change's head (J-165 S1), read from its record and its folder alone,
 * with no git read and no run of the status: its record card, its summary,
 * its sections folded, its folder by name, its state, what it waits on and
 * its strip. Undefined when no record of that id is on disk.
 * @param root the repository root
 * @param env the CLI environment, for the installation's modes
 * @param id the change's id
 * @param today the date its age is counted to
 * @returns the head, or undefined
 */
export function changeHead(
  root: string,
  env: CliEnvironment,
  id: string,
  today: Date,
): ChangeHead | undefined {
  const definition = env.installation.modes;
  const entry = changeOnDisk(root, definition, id);
  if (entry === undefined) return undefined;
  const { form, problem: formProblem } = formOf(entry);
  const { reading, step } = standingOf(root, env, entry, form);
  // A record can parse for its form and still fail against the modes; status reads it unparsed, and the page says why.
  const problem =
    formProblem ??
    (reading === "unparsed" && entry.record._tag === "err" ? issuesText(entry.record.error) : null);
  const waiting = waitingOf(root, form, step, id);
  const state = stateOf(form, entry.text, waiting);
  const card = cardOf(form, entry, step, state);
  const plan = form?.belongs?.plan;
  const part: RecordPart =
    form === undefined
      ? "whole"
      : recordPart(form, plan !== undefined && planHasTickets(root, plan, definition));
  const folder = entry.folder?._tag === "ok" ? entry.folder.value : undefined;
  const names = folder === undefined ? [] : [...folder.reports];
  const resolve = changeResolver(id, names, LEDGER);
  const briefs = (folder?.briefs ?? []).map((brief): BriefEntry => {
    const read = brief.text === undefined ? undefined : readBrief(id, brief.file, brief.text);
    const written = read?.kind === "written" ? read : undefined;
    return {
      file: brief.file,
      problem: null,
      step: written?.step ?? null,
      round: written?.round ?? null,
      written: written !== undefined,
    };
  });
  const sections = form === undefined ? [] : sectionsOf(definition, form, card.step, part);
  const held = new Set([
    ...(folder?.reports ?? []),
    ...(folder?.briefs ?? []).map((brief) => brief.file),
  ]);
  const detail: ChangeDetail = {
    id,
    path: `${LEDGER}/${id}.md`,
    reading,
    problem,
    // The whole text only where the record does not parse and the page has no section to show (J-155 S2).
    text: form === undefined ? (entry.text ?? null) : null,
    ...openedOf(id, today),
    card,
    summary: summaryOf(form, card.why, resolve),
    sections: sections.map(summaryOfSection),
    reports: (folder?.reports ?? [])
      .filter((file) => !isBriefFile(file))
      .map((file) => ({ file, problem: null })),
    briefs,
    folder: names,
  };
  return {
    detail,
    state,
    waitingOn: waiting,
    strip: stripOf(sections),
    section: (heading) => {
      const found = sections.find((each) => each.heading === heading);
      if (found === undefined) return undefined;
      return found.state === "written" || (found.state === "now" && found.text.trim() !== "")
        ? { ...found, html: renderMarkdown(found.text, resolve) }
        : found;
    },
    file: (name) => (held.has(name) ? folderFile(root, id, names, name) : undefined),
  };
}

/** The status's resume view of each change, run once for the state a build reads, by change (J-165 S1). */
const resumed = new OncePerState<Map<string, ReturnType<typeof runStatus>>>();

/**
 * `greenline status --change` for one change, run once for the state a
 * build reads, so its checks, its commits, its changed files and its
 * lines share one run (J-165 S1).
 * @param root the repository root
 * @param env the CLI environment
 * @param id the change's id
 * @returns the status's outcome
 */
function resumeStatus(root: string, env: CliEnvironment, id: string): ReturnType<typeof runStatus> {
  const kept = resumed.answer(root, () => new Map());
  const known = kept.get(id);
  if (known !== undefined) return known;
  const outcome = runStatus({ ...env, cwd: root }, { view: "resume", change: id });
  kept.set(id, outcome);
  return outcome;
}

/** The change's view as the status derivations read it; undefined where they did not read it. */
function resumeView(root: string, env: CliEnvironment, id: string): ChangeView | undefined {
  const status = resumeStatus(root, env, id).changes;
  return status?.view === "resume" ? status.change : undefined;
}

/**
 * A change's commits by their ids, as the status derivations list them, or
 * why they cannot be listed (J-165 S1).
 * @param root the repository root
 * @param env the CLI environment
 * @param id the change's id
 * @returns the commits, or why there are none to read
 */
export function changeCommits(
  root: string,
  env: CliEnvironment,
  id: string,
): readonly string[] | { readonly unknown: string } {
  const commits = resumeView(root, env, id)?.commits;
  if (commits === undefined) return { unknown: "the status derivations did not read the change" };
  return commits.kind === "known"
    ? commits.commits.map((commit) => commit.hash)
    : { unknown: commits.why };
}

/**
 * A change's commits with their subjects, dates and trailers, in the order
 * the status derivations list them, or why they cannot be listed (J-165 S1).
 * @param root the repository root
 * @param env the CLI environment
 * @param id the change's id
 * @param log the subject and date of the change's commits
 * @returns the commits and why none can be listed
 */
export function changeCommitViews(
  root: string,
  env: CliEnvironment,
  id: string,
  log: CommitLog,
): Pick<CommitsDocument, "commits" | "unknown"> {
  const commits = resumeView(root, env, id)?.commits;
  if (commits === undefined)
    return { commits: [], unknown: "the status derivations did not read the change" };
  if (commits.kind !== "known") return { commits: [], unknown: commits.why };
  const logged = log(commits.commits.map((commit) => commit.hash));
  return {
    commits: commits.commits.map((commit) => {
      const found = logged.get(commit.hash);
      return {
        hash: commit.hash,
        subject: found?.subject ?? null,
        date: found?.date ?? null,
        shared: commit.shared,
        trailers: found?.trailers ?? [],
      };
    }),
    unknown: null,
  };
}

/**
 * A change's checks against its commits with what the status says of it
 * (J-165 S1): the runs its folder holds placed on the code they ran on, the
 * findings, the commits of code since its last check and its consultations.
 * Undefined when no record of that id is on disk.
 * @param root the repository root
 * @param env the CLI environment
 * @param id the change's id
 * @param log the subject and date of the change's commits
 * @returns the part's fields, or undefined
 */
export function changeChecks(
  root: string,
  env: CliEnvironment,
  id: string,
  log: CommitLog,
): Pick<CheckFactsDocument, "checks" | "notes" | "sinceCheck" | "consultations"> | undefined {
  const entry = changeOnDisk(root, env.installation.modes, id);
  if (entry === undefined) return undefined;
  const status = resumeStatus(root, env, id);
  const view = resumeView(root, env, id);
  const { form } = formOf(entry);
  return {
    checks: checksOf(root, entry, view, form?.position.state ?? null, log),
    notes: status.diagnostics.map((note) => ({
      code: note.code,
      severity: note.severity,
      message: note.message,
    })),
    sinceCheck: sinceWords(view),
    consultations: (view?.consultations ?? []).map((consultation) => ({
      request: consultation.request,
      binding: bindingWords(consultation.binding),
      calls: consultation.calls,
    })),
  };
}

/** A section as the page folds it: no text, a skipped step's one line, whether it holds words. */
function summaryOfSection(section: SectionView): StepSummary {
  return {
    heading: section.heading,
    kind: section.kind,
    state: section.state,
    depth: section.depth,
    rounds: section.rounds,
    current: section.current,
    heldBy: section.heldBy,
    line: section.state === "skipped" ? section.text.trim() : null,
    written: section.text.trim() !== "",
  };
}

/**
 * What the change page opens on (J-168 S1): the record's outcome line, the
 * one sentence of what landed the close writes, else the why line; never
 * the close's prose.
 * @param form the record's form
 * @param why the record's why line
 * @param resolve how the summary's links resolve to a page
 * @returns the summary, with its words rendered (J-165 S1), or null where the record holds neither
 */
function summaryOf(
  form: RecordForm | undefined,
  why: string | null,
  resolve: LinkResolver,
): ChangeSummary | null {
  if (form?.outcome !== undefined)
    return { text: form.outcome, html: renderMarkdown(form.outcome, resolve), from: "outcome" };
  return why === null ? null : { text: why, html: renderMarkdown(why, resolve), from: "why" };
}
