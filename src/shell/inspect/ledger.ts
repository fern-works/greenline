import { isBriefFile } from "../../core/brief.ts";
import { isChangeId, parseRecordForm, type RecordForm } from "../../core/change.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import type { CheckFacts } from "../../core/facts.ts";
import { depthOf, kindNamed, type Depth, type ModesDefinition } from "../../core/modes.ts";
import type { ChangeOnDisk, ChangeView, CheckView } from "../../core/status.ts";
import { readChangesOnDisk } from "../changes.ts";
import { commitTreeId, workingTreeId } from "../code-tree.ts";
import { runStatus } from "../cli/status.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import { readShownFile } from "./repository-read.ts";

/*
 * The changes view's data: the change records, their folders and their
 * check facts as `readChangesOnDisk` reads them, with the status
 * derivations (`runStatus`'s resume view) for what a record means: the step
 * reached, the commits, each check's verdict on the final code and the
 * findings. Nothing here writes; every read is of the repository as it
 * stands when the page asks.
 */

const LEDGER = ".greenline/ledger";
const NONE_LINE = /^none at [a-z][a-z0-9-]*$/;

/**
 * The subject and date of each commit asked, read from git by the server,
 * which owns the inspector's git reads; a commit git cannot describe is
 * left out and shown with its subject unknown.
 */
export type CommitLog = (
  hashes: readonly string[],
) => ReadonlyMap<string, { readonly subject: string; readonly date: string }>;

/** A change's state as the record states it; where a field holds it, null stands for a record whose form does not parse. */
export type ChangeState = "open" | "stopped" | "done" | "dropped";

/** One change as the list shows it. */
export interface ChangeListEntry {
  readonly id: string;
  readonly path: string;
  readonly state: ChangeState | null;
  readonly mode: string | null;
  readonly why: string | null;
  /** The "next" line of an open or stopped change; null when it states none. */
  readonly next: string | null;
  readonly plan: string | null;
  readonly ticket: string | null;
  /** The date the id names, when the change was opened. */
  readonly opened: string;
  /** Whole days from that date to today; 0 for today. */
  readonly ageDays: number;
  /** Why the record does not parse; null when it does. */
  readonly problem: string | null;
}

/** The changes view's list, or why the ledger cannot be read. */
export interface ChangesList {
  readonly changes: readonly ChangeListEntry[];
  readonly unavailable: string | null;
}

/** The front matter as the record card shows it, every field present, null where the record states none. */
export interface RecordCard {
  readonly mode: string | null;
  readonly choice: "owner" | "accepted" | "standing" | null;
  readonly proposed: string | null;
  readonly why: string | null;
  readonly state: ChangeState | null;
  readonly next: string | null;
  /** The step the status derivations read as reached; null when the record is not judged. */
  readonly step: string | null;
  readonly floors: readonly string[];
  readonly raises: readonly { readonly from: string; readonly reason: string }[];
  readonly reviewed: string | null;
  readonly plan: string | null;
  readonly ticket: string | null;
  readonly agents: number | null;
  readonly rounds: number | null;
  /** Each start as the record names it, `review 1` or `review 2 restarted`; null when it names none or cannot be read for it. */
  readonly starts: readonly string[] | null;
  /** The front-matter lines of the kinds whose record is a line. */
  readonly lines: readonly { readonly field: string; readonly text: string }[];
  /** The owner's words for a push, a pull request or a merge; null when the record holds none. */
  readonly landing: string | null;
  /** The owner's words for rewriting the change's branch; null when the record holds none. */
  readonly rebase: string | null;
}

/**
 * How a section stands: written, the skipped step's one line, present but
 * empty, absent, or absent because the other record of a split holds it.
 */
export type SectionState = "written" | "skipped" | "empty" | "missing" | "elsewhere";

/** One section of the body, in the line's order. */
export interface SectionView {
  readonly heading: string;
  /** A step of the line, a kind's own section (a start's), or a heading the modes do not name. */
  readonly kind: "step" | "kind" | "other";
  readonly state: SectionState;
  /** The depth the record's mode gives the step, in words; null outside the steps or when the mode is unknown. */
  readonly depth: string | null;
  readonly text: string;
  /** The third-level headings it holds, which count a looped step's rounds. */
  readonly rounds: number;
  /** Whether this is the step the change has reached. */
  readonly current: boolean;
  /** For a step the work's split gives the other record, which one holds it: the planning record or the tickets' records; null otherwise. */
  readonly heldBy: "plan" | "ticket" | null;
}

/** One file of the change's folder, its text when it can be shown. */
export interface FolderFile {
  readonly file: string;
  /** The text, null when it is too large or cannot be read, and `problem` says which. */
  readonly text: string | null;
  readonly problem: string | null;
}

/** A brief in the change's folder, with the step and number `greenline brief` wrote it for. */
export interface BriefFile extends FolderFile {
  readonly step: string | null;
  readonly round: number | null;
  /** Whether the status derivations read it as one the command wrote. */
  readonly written: boolean;
}

/** One recorded run of a check. */
export interface RunView {
  readonly file: string;
  readonly command: readonly string[];
  readonly step: string | null;
  readonly outcome: "passed" | "failed" | "unfinished";
  /** How the run ended, in words: `exit 0`, `exit 1`, a signal or why it never started; null while it is unfinished. */
  readonly ended: string | null;
  readonly startedAt: string;
  readonly durationMs: number | null;
  readonly commit: string | null;
  readonly tree: string | null;
  readonly probe: boolean;
  /** Whether it is the latest run of its command, the one the status derivations judge. */
  readonly latest: boolean;
  /** For the latest run, whether it saw the final code, in words; null for the others. */
  readonly verdict: string | null;
}

/** Code the change's checks can be held against: a commit of the change, or the working tree. */
export interface CodeTargetView {
  readonly kind: "commit" | "working-tree";
  /** The commit; null for the working tree. */
  readonly hash: string | null;
  readonly subject: string | null;
  readonly date: string | null;
  /** Whether another change claims the commit too. */
  readonly shared: boolean;
  /** The code's tree id, `.greenline/` left out, as `greenline check` records it; null when git cannot say. */
  readonly tree: string | null;
  /** The runs that ran on exactly this code. */
  readonly runs: readonly RunView[];
}

/** The check facts held against the commits. */
export interface ChecksView {
  /** The change's commits, the working tree first for a change still in progress, each with the runs on its code. */
  readonly targets: readonly CodeTargetView[];
  /** Why the change's commits cannot be listed; null when they can. */
  readonly commitsUnknown: string | null;
  /** The runs whose code is none of the targets', such as uncommitted work later changed. */
  readonly elsewhere: readonly RunView[];
  /** The facts files that cannot be read, each with why. */
  readonly problems: readonly { readonly file: string; readonly message: string }[];
  /** How many runs are recorded, probes included. */
  readonly runs: number;
}

/** One change as its page shows it. */
export interface ChangeDetail {
  readonly id: string;
  readonly path: string;
  /** How the status derivations read the record: judged, read as history for its form, or not parsed. */
  readonly reading: "judged" | "history" | "unparsed";
  readonly problem: string | null;
  /** The record's text, shown whole when it does not parse. */
  readonly text: string | null;
  readonly opened: string;
  readonly ageDays: number;
  readonly card: RecordCard;
  readonly sections: readonly SectionView[];
  readonly reports: readonly FolderFile[];
  readonly briefs: readonly BriefFile[];
  readonly checks: ChecksView;
  /** The findings and notices `greenline status --change` gives for it. */
  readonly notes: readonly {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
  }[];
  /** For an open change, its commits of code since its last recorded check, in words; null otherwise. */
  readonly sinceCheck: string | null;
  readonly consultations: readonly {
    readonly request: string;
    readonly binding: string;
    readonly calls: number;
  }[];
  /** Every file of the folder by name, which the page's links resolve against. */
  readonly folder: readonly string[];
}

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
  const disk = readChangesOnDisk(root, env.installation.modes);
  if (disk._tag === "err")
    return {
      changes: [],
      unavailable: disk.error.issues.map((issue) => issue.message).join("; "),
    };
  const entries = disk.value.changes.map((entry): ChangeListEntry => {
    const { form, problem: formProblem } = formOf(entry);
    const state = form?.position.state ?? null;
    // An open or stopped record is read against the modes too; one that fails there names why, as status does.
    const problem =
      formProblem ??
      ((state === "open" || state === "stopped") && entry.record._tag === "err"
        ? issuesText(entry.record.error)
        : null);
    return {
      id: entry.id,
      path: `${LEDGER}/${entry.id}.md`,
      state,
      mode: form?.mode ?? null,
      why: form?.why ?? null,
      next: form === undefined ? null : nextOf(form),
      plan: form?.belongs?.plan ?? null,
      ticket: form?.belongs?.ticket ?? null,
      ...openedOf(entry.id, today),
      problem,
    };
  });
  // A record that does not parse stands with the work in progress, where the owner looks first.
  const current = (entry: ChangeListEntry): boolean =>
    entry.state === null || entry.state === "open" || entry.state === "stopped";
  const newest = (a: ChangeListEntry, b: ChangeListEntry): number =>
    a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  return {
    changes: [
      ...entries.filter(current).sort(newest),
      ...entries.filter((entry) => !current(entry)).sort(newest),
    ],
    unavailable: null,
  };
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

function sectionState(text: string | undefined): SectionState {
  if (text === undefined) return "missing";
  if (text.trim() === "") return "empty";
  return NONE_LINE.test(text.trim()) ? "skipped" : "written";
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
  const plain = (heading: string, text: string, rounds: number, kind: "kind" | "other") => ({
    heading,
    kind,
    state: sectionState(text),
    depth: null,
    text,
    rounds,
    current: false,
    heldBy: null,
  });
  const before = form.sections
    .filter((section) => kindOf(section.heading)?.mechanism === "open")
    .map((section) => plain(section.heading, section.text, section.rounds, "kind"));
  const line = definition.steps.map((entry): SectionView => {
    const found = form.sections.find((section) => section.heading === entry.name);
    const heldBy = holder !== null && entry.whenSplit === holder ? holder : null;
    return {
      heading: entry.name,
      kind: "step",
      state: found === undefined && heldBy !== null ? "elsewhere" : sectionState(found?.text),
      depth: mode === undefined ? null : depthWords(depthOf(mode, entry.name), mode.name),
      text: found?.text ?? "",
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

function folderText(root: string, path: string): Pick<FolderFile, "text" | "problem"> {
  return readShownFile(root, path);
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
  state: ChangeState | null,
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
  view: ChangeView | undefined,
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
    state: form?.position.state ?? null,
    next: form === undefined ? null : nextOf(form),
    step: view?.step ?? null,
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
  };
}

/**
 * One change for its page, or undefined when no record of that id is on disk.
 * @param root the repository root
 * @param env the CLI environment, for the installation's modes and the status derivations
 * @param id the change's id
 * @param today the date its age is counted to
 * @param log the subject and date of the change's commits
 * @returns the change, or undefined
 */
export function changeDetail(
  root: string,
  env: CliEnvironment,
  id: string,
  today: Date,
  log: CommitLog,
): ChangeDetail | undefined {
  if (!isChangeId(id)) return undefined;
  const definition = env.installation.modes;
  const disk = readChangesOnDisk(root, definition);
  if (disk._tag === "err") return undefined;
  const entry = disk.value.changes.find((change) => change.id === id);
  if (entry === undefined) return undefined;
  const status = runStatus({ ...env, cwd: root }, { view: "resume", change: id });
  const view = status.changes?.view === "resume" ? status.changes.change : undefined;
  const { form, problem: formProblem } = formOf(entry);
  const reading = view?.reading ?? (form === undefined ? "unparsed" : "history");
  // A record can parse for its form and still fail against the modes; status reads it unparsed, and the page says why.
  const problem =
    formProblem ??
    (reading === "unparsed" && entry.record._tag === "err" ? issuesText(entry.record.error) : null);
  const card = cardOf(form, entry, view);
  const plan = disk.value.plans.find((candidate) => candidate.name === form?.belongs?.plan);
  const hasTickets = plan?.contents._tag === "ok" && plan.contents.value.tickets !== undefined;
  const part =
    form?.belongs?.ticket !== undefined
      ? "ticket"
      : form?.belongs !== undefined && hasTickets
        ? "plan"
        : "whole";
  const folder = entry.folder?._tag === "ok" ? entry.folder.value : undefined;
  const base = `${LEDGER}/${id}`;
  const briefs = (folder?.briefs ?? []).map((brief): BriefFile => {
    const known = view?.briefs.find((written) => written.file === brief.file);
    return {
      file: brief.file,
      ...folderText(root, `${base}/${brief.file}`),
      step: known?.step ?? null,
      round: known?.round ?? null,
      written: known !== undefined,
    };
  });
  return {
    id,
    path: `${LEDGER}/${id}.md`,
    reading,
    problem,
    text: entry.text ?? null,
    ...openedOf(id, today),
    card,
    sections: form === undefined ? [] : sectionsOf(definition, form, card.step, part),
    reports: (folder?.reports ?? [])
      .filter((file) => !isBriefFile(file))
      .map((file) => ({ file, ...folderText(root, `${base}/${file}`) })),
    briefs,
    checks: checksOf(root, entry, view, card.state, log),
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
    folder: folder === undefined ? [] : [...folder.reports],
  };
}
