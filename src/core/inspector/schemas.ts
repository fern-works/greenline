import { z } from "zod";
import { HARNESSES } from "../adapters.ts";
import { frameMapSchema } from "../frame-map-file.ts";
import { declaredCheckSchema } from "../checks.ts";
import type { DiffLine, ReceiptCallView, ReceiptRequestView } from "../inspect.ts";
import { parseManifest, type Manifest } from "../manifest.ts";
import { rootStatementSchema } from "../root-statements.ts";
import { interfaceCheckFactSchema } from "../interface-check.ts";
import { designPickSchema } from "../design-pick.ts";
import { boxedElementSchema } from "../interface-boxes.ts";
import { markSchema } from "../marks.ts";
import type {
  BriefEntry,
  DiffDocument,
  FileDocument,
  FolderEntry,
  StepDocument,
  StepSummary,
  AtlasDocument,
  CaptureScores,
  CaptureView,
  CatalogDocument,
  ChangeDetail,
  ChangeDocument,
  ChangedFilesDocument,
  ChangeNotesDocument,
  ChangeSize,
  ChangeListEntry,
  ChangedFile,
  ChangedFiles,
  ChangesDocument,
  CheckFactsDocument,
  CheckStandingView,
  ChecksView,
  CodeTargetView,
  CommitView,
  CommitsDocument,
  ContractDocument,
  DealDocument,
  DecisionRecord,
  DeskChange,
  DeskDocument,
  HealthFinding,
  DiscussionDocument,
  DiscussionSummary,
  DiscussionView,
  DiscussionsDocument,
  DiffNet,
  NumberedDiffLine,
  DocumentPageDocument,
  DocumentView,
  DriftNotice,
  FolderFile,
  FrameMapDocument,
  HomeDocument,
  HomeReading,
  HomeSummary,
  HomesDocument,
  InspectorDocument,
  InstalledFileDocument,
  InterfaceChecksDocument,
  InterfaceDocument,
  JourneyView,
  KnowledgeHome,
  MapLayer,
  MarkDocument,
  MarkView,
  NotesReading,
  PictureDocument,
  PicturesDocument,
  PlanDetail,
  PlanDocumentView,
  PlanListEntry,
  PlanPageDocument,
  PlanRecord,
  PlansDocument,
  PracticeDocument,
  Read,
  RecordCard,
  Ref,
  RefreshView,
  RemainingDocument,
  RenderedText,
  RosterDocument,
  SearchDocument,
  SearchEntry,
  RosterSkill,
  RosterUse,
  OwedUse,
  OwedView,
  RunView,
  SectionView,
  SettingsDocument,
  SkillChange,
  SkillChangeLoad,
  SkillDocument,
  SkillKindView,
  SkillLoad,
  SkillLoadsDocument,
  SourceDocument,
  Source,
  StateCounts,
  StripStep,
  SubsystemDocument,
  SubsystemView,
  TicketView,
  Trailer,
  VisualView,
  WaitingOn,
} from "./documents.ts";

/*
 * The schema of every document the inspector serves, one per shape of
 * `documents.ts`, strict: a field the contract does not name is refused,
 * so a reader and the server can never drift apart in silence. Each is
 * typed against its interface, so the two cannot disagree either.
 */

const text = z.string();
const nullableText = z.string().nullable();
const count = z.number().int().nonnegative();
const changeState = z.enum(["waiting", "in-progress", "stopped", "done", "dropped", "proposed"]);
const stepState = z.enum(["written", "now", "not-yet", "skipped", "in-plan"]);
const ref: z.ZodType<Ref> = z.object({ id: text, name: text, address: text }).strict();
const read: z.ZodType<Read> = z.object({ at: text, revision: text }).strict();
const source: z.ZodType<Source> = z.object({ label: text, address: nullableText }).strict();

const waitingFields = {
  question: text,
  next: nullableText,
  step: nullableText,
  askedAt: nullableText,
  options: z.array(text).nullable(),
  source,
};
const waitingOn: z.ZodType<WaitingOn> = z.object(waitingFields).strict();

const changedFile: z.ZodType<ChangedFile> = z
  .object({ path: text, added: count.nullable(), removed: count.nullable() })
  .strict();
const changedFiles: z.ZodType<ChangedFiles> = z
  .object({
    groups: z.array(z.object({ folder: text, count, files: z.array(changedFile) }).strict()),
    totals: z.object({ files: count, added: count, removed: count }).strict(),
    installed: count,
    unknown: nullableText,
  })
  .strict();
const tier = z.enum(["fresh", "drifting", "stale"]);
const notes = z.array(z.object({ code: text, severity: text, message: text }).strict());
const problems = z.array(z.object({ file: text, message: text }).strict());

const stripStep: z.ZodType<StripStep> = z
  .object({ step: text, state: stepState, current: z.boolean(), depth: nullableText })
  .strict();

const changeSize: z.ZodType<ChangeSize> = z
  .object({ files: count, added: count, removed: count, installed: count })
  .strict();

const changeListFields = {
  id: text,
  ref,
  path: text,
  state: changeState.nullable(),
  waitingOn: waitingOn.nullable(),
  mode: nullableText,
  why: nullableText,
  next: nullableText,
  plan: nullableText,
  ticket: nullableText,
  opened: text,
  ageDays: count,
  problem: nullableText,
  step: nullableText,
  strip: z.array(stripStep),
  closedAt: nullableText,
  lastAt: nullableText,
  size: changeSize.nullable(),
  commits: count.nullable(),
};

const changeListEntry: z.ZodType<ChangeListEntry> = z.object(changeListFields).strict();

const refreshView: z.ZodType<RefreshView> = z
  .object({ by: text, pages: text, cost: text })
  .strict();

const recordCard: z.ZodType<RecordCard> = z
  .object({
    mode: nullableText,
    choice: z.enum(["owner", "accepted", "standing"]).nullable(),
    proposed: nullableText,
    why: nullableText,
    state: changeState.nullable(),
    next: nullableText,
    step: nullableText,
    floors: z.array(text),
    raises: z.array(z.object({ from: text, reason: text }).strict()),
    reviewed: nullableText,
    plan: nullableText,
    ticket: nullableText,
    agents: count.nullable(),
    rounds: count.nullable(),
    starts: z.array(text).nullable(),
    lines: z.array(z.object({ field: text, text }).strict()),
    landing: nullableText,
    rebase: nullableText,
    discard: nullableText,
    stopped: nullableText,
    ground: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("branch") }).strict(),
        z.object({ kind: z.literal("worktree"), path: text }).strict(),
      ])
      .nullable(),
    agent: nullableText,
    from: z.array(text),
    refreshes: z.array(refreshView),
  })
  .strict();

const sectionView: z.ZodType<SectionView> = z
  .object({
    heading: text,
    kind: z.enum(["step", "kind", "other"]),
    state: stepState,
    depth: nullableText,
    text,
    html: text,
    rounds: count,
    current: z.boolean(),
    heldBy: z.enum(["plan", "ticket"]).nullable(),
  })
  .strict();

const stepSummary: z.ZodType<StepSummary> = z
  .object({
    heading: text,
    kind: z.enum(["step", "kind", "other"]),
    state: stepState,
    depth: nullableText,
    rounds: count,
    current: z.boolean(),
    heldBy: z.enum(["plan", "ticket"]).nullable(),
    line: nullableText,
    written: z.boolean(),
  })
  .strict();

const folderEntry: z.ZodType<FolderEntry> = z
  .object({ file: text, problem: nullableText })
  .strict();
const briefEntry: z.ZodType<BriefEntry> = z
  .object({
    file: text,
    problem: nullableText,
    step: nullableText,
    round: count.nullable(),
    written: z.boolean(),
  })
  .strict();

const folderFields = { file: text, text: nullableText, html: nullableText, problem: nullableText };
const folderFile: z.ZodType<FolderFile> = z.object(folderFields).strict();

const runView: z.ZodType<RunView> = z
  .object({
    file: text,
    command: z.array(text),
    step: nullableText,
    outcome: z.enum(["passed", "failed", "unfinished"]),
    ended: nullableText,
    startedAt: text,
    durationMs: z.number().nonnegative().nullable(),
    commit: nullableText,
    tree: nullableText,
    probe: z.boolean(),
    latest: z.boolean(),
    verdict: nullableText,
  })
  .strict();

const trailer: z.ZodType<Trailer> = z.object({ key: text, value: text }).strict();

const codeTarget: z.ZodType<CodeTargetView> = z
  .object({
    kind: z.enum(["commit", "working-tree"]),
    hash: nullableText,
    subject: nullableText,
    date: nullableText,
    trailers: z.array(trailer),
    shared: z.boolean(),
    tree: nullableText,
    runs: z.array(runView),
  })
  .strict();

const checksView: z.ZodType<ChecksView> = z
  .object({
    targets: z.array(codeTarget),
    commitsUnknown: nullableText,
    elsewhere: z.array(runView),
    problems,
    runs: count,
  })
  .strict();

const changeDetail: z.ZodType<ChangeDetail> = z
  .object({
    id: text,
    path: text,
    reading: z.enum(["judged", "history", "unparsed"]),
    problem: nullableText,
    text: nullableText,
    opened: text,
    ageDays: count,
    card: recordCard,
    summary: z
      .object({ text, html: text, from: z.enum(["outcome", "why"]) })
      .strict()
      .nullable(),
    sections: z.array(stepSummary),
    reports: z.array(folderEntry),
    briefs: z.array(briefEntry),
    folder: z.array(text),
  })
  .strict();

const commitView: z.ZodType<CommitView> = z
  .object({
    hash: text,
    subject: nullableText,
    date: nullableText,
    shared: z.boolean(),
    trailers: z.array(trailer),
  })
  .strict();

const planRecord: z.ZodType<PlanRecord> = z
  .object({
    id: text,
    ref,
    state: changeState.nullable(),
    mode: nullableText,
    opened: nullableText,
    why: nullableText,
    ticket: nullableText,
    proposed: nullableText,
    owner: z.boolean(),
  })
  .strict();

const ticketsMark = z.enum(["draft", "complete"]).nullable();

const planListEntry: z.ZodType<PlanListEntry> = z
  .object({
    name: text,
    ref,
    path: text,
    tickets: ticketsMark,
    counts: z.object({ total: count, done: count, inProgress: count, notStarted: count }).strict(),
    ready: z.array(text),
    documents: z.array(z.object({ file: text, status: nullableText }).strict()),
    planning: z.array(planRecord),
    problem: nullableText,
  })
  .strict();

const ticketView: z.ZodType<TicketView> = z
  .object({
    id: text,
    ref,
    intent: text,
    scope: z.array(text),
    acceptance: z.array(text),
    after: z.array(text),
    mode: text,
    progress: z.enum(["not started", "in progress", "done"]),
    ready: z.boolean(),
    records: z.array(planRecord),
  })
  .strict();

const planDocument: z.ZodType<PlanDocumentView> = z
  .object({
    file: text,
    title: text,
    status: nullableText,
    body: nullableText,
    html: nullableText,
    problem: nullableText,
  })
  .strict();

const planDetail: z.ZodType<PlanDetail> = z
  .object({
    name: text,
    ref,
    path: text,
    mark: ticketsMark,
    hasTickets: z.boolean(),
    ticketsProblem: nullableText,
    ticketsRefused: z.boolean(),
    tickets: z.array(ticketView),
    frontier: z.array(text),
    derived: z.boolean(),
    documents: z.array(planDocument),
    planning: z.array(planRecord),
    strays: z.array(planRecord),
    notes,
    problem: nullableText,
  })
  .strict();

const homeFields = {
  title: text,
  path: text,
  role: text,
  present: z.boolean(),
  holds: nullableText,
  written: nullableText,
};

const homeSummary: z.ZodType<HomeSummary> = z
  .object({ id: z.enum(["work", "decisions", "adr", "glossary"]), ...homeFields })
  .strict();

const decisionRecord: z.ZodType<DecisionRecord> = z
  .object({
    file: text,
    title: text,
    status: nullableText,
    date: nullableText,
    body: nullableText,
    html: nullableText,
    problem: nullableText,
  })
  .strict();

const renderedText: z.ZodType<RenderedText> = z
  .object({
    heading: nullableText,
    html: text,
    outline: z.array(z.object({ level: z.number().int().positive(), text, anchor: text }).strict()),
  })
  .strict();

const knowledgeHome: z.ZodType<KnowledgeHome> = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("document"),
      id: z.enum(["work", "glossary"]),
      ...homeFields,
      text: nullableText,
      rendered: renderedText.nullable(),
      problem: nullableText,
    })
    .strict(),
  z
    .object({
      kind: z.literal("decisions"),
      id: z.literal("decisions"),
      ...homeFields,
      text: nullableText,
      rendered: renderedText.nullable(),
      roots: z.array(rootStatementSchema).nullable(),
      problem: nullableText,
    })
    .strict(),
  z
    .object({
      kind: z.literal("records"),
      id: z.literal("adr"),
      ...homeFields,
      records: z.array(decisionRecord),
      problem: nullableText,
    })
    .strict(),
]);

const healthFinding: z.ZodType<HealthFinding> = z
  .object({
    message: text.exactOptional(),
    path: text.exactOptional(),
  })
  .strict();

const diffLine: z.ZodType<DiffLine> = z
  .object({ kind: z.enum(["same", "del", "add"]), line: text })
  .strict();
const lineNumber = z.number().int().positive().nullable();
const numberedDiffLine: z.ZodType<NumberedDiffLine> = z
  .object({
    kind: z.enum(["same", "del", "add"]),
    line: text,
    oldLine: lineNumber,
    newLine: lineNumber,
  })
  .strict();
const diffNet: z.ZodType<DiffNet> = z
  .object({ from: nullableText, to: text, lines: z.array(numberedDiffLine) })
  .strict();

const receiptCall: z.ZodType<ReceiptCallView> = z
  .object({
    sequence: count,
    operation: text,
    outcome: text,
    full: z.array(z.object({ id: text, revision: text }).strict()),
    metadata: z.array(text),
    error: nullableText,
    startedAt: text,
    finishedAt: nullableText,
  })
  .strict();

const receiptRequest: z.ZodType<ReceiptRequestView> = z
  .object({
    id: text,
    source: text,
    binding: text,
    owner: text,
    createdAt: text,
    calls: z.array(receiptCall),
    advisories: count,
  })
  .strict();

/** The manifest is checked by its own parser, which owns its contract. */
const manifest = z.custom<Manifest>(
  (value) => parseManifest(JSON.stringify(value), ".greenline/manifest.json")._tag === "ok",
  "the manifest does not parse",
);

const hooksReport = z
  .object({
    git: z.union([
      z
        .object({
          state: z.enum(["config", "hooks-path"]),
          greenline: z.literal("missing").exactOptional(),
        })
        .strict(),
      z.object({ state: z.literal("absent"), reason: text, line: text }).strict(),
      z.object({ state: z.literal("off") }).strict(),
    ]),
    checks: z.array(declaredCheckSchema),
    adapters: z.array(z.enum(HARNESSES)),
    settings: z.object({ git: z.boolean(), adapters: z.boolean() }).strict(),
  })
  .strict();

const inspectorStateFields = {
  manifest,
  installation: text,
  revisions: z.object({ manifest: text, decisions: text, agents: text }).strict(),
  cliVersion: text,
  roots: z.array(rootStatementSchema),
  decisions: text,
  policyChanges: z.array(z.object({ path: text, before: text, after: text, at: text }).strict()),
  houseRulings: z.object({ stanza: text, rulings: z.array(text) }).strict(),
  files: z.array(
    z
      .object({ folder: text, files: z.array(z.object({ name: text, size: count }).strict()) })
      .strict(),
  ),
  unreadable: z.array(z.object({ path: text, error: text }).strict()),
  changes: z
    .object({
      baseline: nullableText,
      files: z.array(z.object({ path: text, diff: z.array(diffLine) }).strict()),
      unavailable: z.array(text),
    })
    .strict(),
  settings: z.object({ proceed: z.array(text), trials: z.array(text) }).strict(),
  skills: z.array(z.object({ name: text, installed: z.boolean(), extra: z.boolean() }).strict()),
};

function homeReading<T>(item: z.ZodType<T>): z.ZodType<HomeReading<T>> {
  return z.discriminatedUnion("available", [
    z.object({ available: z.literal(true), items: z.array(item) }).strict(),
    z.object({ available: z.literal(false), reason: text, items: z.tuple([]) }).strict(),
  ]);
}

const discussionState = z.enum(["open", "parked", "declined", "promoted", "merged"]);
const discussionFields = {
  id: text,
  ref,
  path: text,
  title: text,
  state: discussionState,
  opened: text,
  touched: text.nullable(),
  decisions: count,
  promoted: z.array(text),
};
const discussionSummary: z.ZodType<DiscussionSummary> = z.object(discussionFields).strict();
const discussionView: z.ZodType<DiscussionView> = z
  .object({
    ...discussionFields,
    sections: z.array(z.object({ heading: text, text, html: text }).strict()),
    decisionLines: z.array(text),
    research: z.array(text),
    map: frameMapSchema.nullable(),
    restatementHtml: nullableText,
    related: z.array(text),
    revisit: text.nullable(),
    reason: text.nullable(),
    into: text.nullable(),
    words: text.nullable(),
  })
  .strict();

const captureScores: z.ZodType<CaptureScores> = z
  .object({ floor: count, reflex: count, finish: count })
  .strict();

const visualView: z.ZodType<VisualView> = z
  .object({
    id: text,
    ref,
    path: text,
    place: z.enum(["change", "map", "journey", "interface", "style"]),
    file: z
      .object({ path: text, kind: z.enum(["svg", "html", "md"]) })
      .strict()
      .nullable(),
    revision: text,
    title: text,
    form: text,
    skill: text,
    change: nullableText,
    commit: text,
    files: z.array(text),
    made: text,
    madeBy: z.enum(["agent", "session"]).nullable(),
    summary: text,
    question: nullableText,
    finish: nullableText,
    scores: captureScores.nullable(),
    tier,
    commitsSince: count.nullable(),
  })
  .strict();

const journeyView: z.ZodType<JourneyView> = z
  .object({ id: text, title: text, path: text, tier })
  .strict();

const subsystemView: z.ZodType<SubsystemView> = z
  .object({
    name: text,
    title: text,
    page: text,
    layer: text,
    summary: text,
    files: z.array(text),
    commit: text,
    tier,
    journeys: z.array(journeyView),
    calls: z.array(text),
    calledBy: z.array(text),
  })
  .strict();

const mapLayer: z.ZodType<MapLayer> = z
  .object({ name: text, subsystems: z.array(z.object({ name: text, tier }).strict()) })
  .strict();

const driftNotice: z.ZodType<DriftNotice> = z
  .object({
    kind: z.enum(["visual", "subsystem", "document"]),
    id: text,
    title: text,
    tier,
    detail: text,
  })
  .strict();

const skillLoad: z.ZodType<SkillLoad> = z
  .object({
    skill: text,
    file: text,
    whole: z.boolean(),
    via: text,
    cause: z.enum(["together", "cut"]).optional(),
    at: text,
    step: nullableText,
    agent: nullableText,
  })
  .strict();

const countedName = z.object({ name: text, loads: count }).strict();

const rosterUse: z.ZodType<RosterUse> = z
  .object({
    skill: text,
    loads: count,
    whole: count,
    part: count,
    steps: z.array(text),
    agents: z.array(text),
    changes: count,
    byStep: z.array(countedName),
    byAgent: z.array(countedName),
    outside: count,
    firstAt: text,
    lastAt: text,
  })
  .strict();

const rosterSkill: z.ZodType<RosterSkill> = z
  .object({
    name: text,
    ref,
    kind: text,
    slot: nullableText,
    installed: z.boolean(),
    extra: z.boolean(),
    description: text,
    activation: z.enum(["implicit", "explicit"]),
  })
  .strict();

const skillKind: z.ZodType<SkillKindView> = z.object({ name: text, when: text }).strict();
const skillChangeLoad: z.ZodType<SkillChangeLoad> = z
  .object({
    skill: text,
    file: text,
    whole: z.boolean(),
    via: text,
    at: text,
    step: nullableText,
    agent: nullableText,
    change: text,
  })
  .strict();
const skillChange: z.ZodType<SkillChange> = z
  .object({ change: ref, loads: count, steps: z.array(text) })
  .strict();

const checkStanding: z.ZodType<CheckStandingView> = z
  .object({
    name: text,
    command: text,
    outcome: z.enum(["passed", "failed", "unfinished", "not-run"]),
    at: nullableText,
  })
  .strict();

const deskChange: z.ZodType<DeskChange> = z
  .object({
    ...changeListFields,
    commits: count.nullable(),
    checks: z.array(checkStanding),
    changedFiles: changedFiles.nullable(),
  })
  .strict();

const generatedFile = z
  .object({ name: text, home: text, header: text, writer: text, tidy: z.boolean(), note: text })
  .strict();

const contractEntry = z.object({ kind: text, artefact: text, address: text }).strict();
const remainingDocument: z.ZodType<RemainingDocument> = z
  .object({ kind: text, address: text, carries: text, owner: text })
  .strict();

const changeRef = { change: text };
const schema = z.literal("greenline.inspect/v2");

function envelope<K extends string, F extends Readonly<Record<string, z.ZodType>>>(
  kind: K,
  fields: F,
) {
  return z.object({ schema, kind: z.literal(kind), read, ...fields }).strict();
}

const contractDocument: z.ZodType<ContractDocument> = envelope("contract", {
  version: z.literal(2),
  documents: z.array(contractEntry),
  remaining: z.array(remainingDocument),
  generatedFiles: z.array(generatedFile),
});
const deskClose = z
  .object({
    ...changeListFields,
    closedAt: nullableText,
    tookMinutes: count.nullable(),
    touched: changedFiles.nullable(),
    checked: z
      .object({
        total: count,
        passed: count,
        failed: count,
        onFinal: count,
        failing: z.array(text),
      })
      .strict(),
    lastCommit: z.object({ hash: text, subject: text }).strict().nullable(),
    commits: count.nullable(),
    source,
  })
  .strict();

const deskDocument: z.ZodType<DeskDocument> = envelope("desk", {
  summary: z
    .object({
      waiting: count,
      inProgress: count,
      closedToday: count,
      lastCloseAt: nullableText,
      source,
    })
    .strict(),
  since: z
    .object({
      at: text,
      commits: count,
      changes: z.array(
        z
          .object({
            change: ref,
            happened: z.enum(["opened", "steps written", "closed", "dropped"]),
          })
          .strict(),
      ),
      pictures: count,
      changedFiles,
    })
    .strict()
    .nullable(),
  waiting: z.array(z.object({ change: ref, ...waitingFields }).strict()),
  inProgress: z.array(deskChange),
  unavailable: nullableText,
  lastClose: deskClose.nullable(),
  closes: z.array(deskClose),
  care: z.array(
    z
      .object({
        kind: z.enum(["errors", "warnings", "drift", "notes"]),
        count,
        text,
        address: nullableText,
        source,
      })
      .strict(),
  ),
  today: z
    .object({
      commits: count,
      first: nullableText,
      last: nullableText,
      commitsPerHour: z.array(count).length(24),
      segments: z.array(
        z
          .object({
            change: ref,
            mode: nullableText,
            state: changeState.nullable(),
            firstAt: text,
            lastAt: text,
          })
          .strict(),
      ),
    })
    .strict(),
  discussions: homeReading(discussionSummary),
  drift: homeReading(driftNotice),
  diagnostics: z.object({ errors: count, warnings: count }).strict(),
});
const stateCounts: z.ZodType<StateCounts> = z
  .object({
    waiting: count,
    inProgress: count,
    stopped: count,
    done: count,
    dropped: count,
    proposed: count,
    unreadable: count,
  })
  .strict();
const changesDocument: z.ZodType<ChangesDocument> = envelope("changes", {
  changes: z.array(changeListEntry),
  unavailable: nullableText,
  counts: stateCounts,
  plans: count,
  discussions: count,
});
const stepDocument: z.ZodType<StepDocument> = envelope("step", {
  change: ref,
  section: sectionView,
});
const fileDocument: z.ZodType<FileDocument> = envelope("file", { change: ref, file: folderFile });
const diffDocument: z.ZodType<DiffDocument> = envelope("diff", {
  change: ref,
  path: text,
  commits: z.array(
    z.object({ hash: text, subject: text, date: text, lines: z.array(numberedDiffLine) }).strict(),
  ),
  net: diffNet.nullable(),
  unknown: nullableText,
});
const checkFactsDocument: z.ZodType<CheckFactsDocument> = envelope("check-facts", {
  ...changeRef,
  checks: checksView,
  notes,
  sinceCheck: nullableText,
  consultations: z.array(z.object({ request: text, binding: text, calls: count }).strict()),
  landing: nullableText,
});
const changedFilesDocument: z.ZodType<ChangedFilesDocument> = envelope("changed-files", {
  ...changeRef,
  changedFiles,
});
const sourceDocument: z.ZodType<SourceDocument> = envelope("source", {
  change: ref,
  path: text,
  text: nullableText,
  at: nullableText,
  problem: nullableText,
});
const commitsDocument: z.ZodType<CommitsDocument> = envelope("commits", {
  ...changeRef,
  commits: z.array(commitView),
  unknown: nullableText,
});
const owedView: z.ZodType<OwedView> = z
  .object({
    skill: text,
    read: z.enum(["part", "whole"]),
    why: text,
    loaded: z.boolean(),
    held: text.optional(),
  })
  .strict();
const owedUse: z.ZodType<OwedUse> = z.object({ skill: text, owed: count, loaded: count }).strict();
const skillLoadsDocument: z.ZodType<SkillLoadsDocument> = envelope("skill-loads", {
  ...changeRef,
  loads: homeReading(skillLoad),
  owed: z.array(owedView),
});
const frameMapDocument: z.ZodType<FrameMapDocument> = envelope("frame-map", {
  ...changeRef,
  source: z.enum(["file", "record"]).nullable(),
  map: frameMapSchema.nullable(),
  reason: nullableText,
  restatementHtml: nullableText,
  confirmed: nullableText,
});
const discussionsDocument: z.ZodType<DiscussionsDocument> = envelope("discussions", {
  discussions: homeReading(discussionSummary),
});
const discussionDocument: z.ZodType<DiscussionDocument> = envelope("discussion", {
  discussion: discussionView,
});
const documentView: z.ZodType<DocumentView> = z
  .object({
    path: text,
    author: z.enum(["practice", "owner"]),
    files: z.array(text),
    commit: text,
    change: nullableText,
    tier,
    commitsSince: z.number().int().min(0).nullable(),
  })
  .strict();

const atlasDocument: z.ZodType<AtlasDocument> = envelope("atlas", {
  map: homeReading(mapLayer),
  subsystems: homeReading(subsystemView),
  standing: z
    .object({
      pages: z.number().int().min(0),
      major: nullableText,
      mapBehind: z.number().int().min(0).nullable(),
    })
    .strict(),
  documents: homeReading(documentView),
  refreshes: z.array(
    z
      .object({ change: text, whole: z.boolean(), pages: z.array(text), cost: nullableText })
      .strict(),
  ),
});
const documentPageDocument: z.ZodType<DocumentPageDocument> = envelope("document", {
  document: documentView,
  html: nullableText,
});
const subsystemDocument: z.ZodType<SubsystemDocument> = envelope("subsystem", {
  subsystem: subsystemView,
  html: nullableText,
});
const rosterDocument: z.ZodType<RosterDocument> = envelope("roster", {
  kinds: z.array(skillKind),
  skills: z.array(rosterSkill),
  use: homeReading(rosterUse),
  neverRead: z.array(text),
  owed: z.array(owedUse),
});
const skillDocument: z.ZodType<SkillDocument> = envelope("skill", {
  skill: rosterSkill,
  skillKind: skillKind.nullable(),
  use: rosterUse.nullable(),
  changes: z.array(skillChange),
  loads: z.array(skillChangeLoad),
  wholeRead: z.array(text).optional(),
});
const practiceDocument: z.ZodType<PracticeDocument> = envelope("practice", {
  health: z
    .object({
      errors: count,
      warnings: count,
      groups: z.array(
        z
          .object({
            kind: z.enum(["error", "warning"]),
            code: text,
            count,
            text,
            address: nullableText,
            findings: z.array(healthFinding),
          })
          .strict(),
      ),
      source,
    })
    .strict(),
  hooks: hooksReport.nullable(),
  version: text,
  receipts: z.array(receiptRequest),
  problems,
  connector: z.boolean(),
});
const settingsDocument: z.ZodType<SettingsDocument> = envelope("settings", inspectorStateFields);
const installedFileDocument: z.ZodType<InstalledFileDocument> = envelope("installed-file", {
  path: text,
  size: count.nullable(),
  content: nullableText,
  problem: nullableText,
});
const plansDocument: z.ZodType<PlansDocument> = envelope("plans", {
  plans: z.array(planListEntry),
  unavailable: nullableText,
  derived: z.boolean(),
});
const planPageDocument: z.ZodType<PlanPageDocument> = envelope("plan", { plan: planDetail });
const homesDocument: z.ZodType<HomesDocument> = envelope("homes", { homes: z.array(homeSummary) });
const homeDocument: z.ZodType<HomeDocument> = envelope("home", { home: knowledgeHome });

const scores = z
  .object({ floor: z.number().int(), reflex: z.number().int(), finish: z.number().int() })
  .strict();
const catalogDocument: z.ZodType<CatalogDocument> = envelope("catalog", {
  catalog: homeReading(
    z
      .object({
        id: text,
        kind: text,
        register: text,
        platform: z.array(text),
        concerns: z.array(text),
        components: z.array(text),
        words: text,
        source: text,
        seen: nullableText,
        specimen: nullableText,
      })
      .strict(),
  ),
});
const dealDocument: z.ZodType<DealDocument> = envelope("deal", {
  change: text,
  register: z.enum(["site", "app"]).nullable(),
  job: nullableText,
  catalog: nullableText,
  seed: z.number().int(),
  reroll: z.boolean(),
  dealt: z.boolean(),
  directions: homeReading(
    z
      .object({
        index: z.number().int(),
        name: text,
        parts: z.array(z.object({ role: text, id: text, kind: text, words: text }).strict()),
        light: text,
        dark: nullableText,
      })
      .strict(),
  ),
  pick: designPickSchema.nullable(),
  revision: text,
});
const interfaceDocumentFields = {
  pages: homeReading(
    z
      .object({
        address: text,
        register: nullableText,
        capture: z
          .object({ visual: text, widths: z.array(z.number()), commit: text, at: text })
          .strict()
          .nullable(),
        scores: scores.nullable(),
        fidelity: z
          .object({ inPalette: z.number(), offPalette: z.array(text) })
          .strict()
          .nullable(),
        history: z.array(
          z
            .object({
              visual: text,
              made: text,
              floor: z.number(),
              reflex: z.number(),
              finish: z.number(),
            })
            .strict(),
        ),
        tier: tier.nullable(),
        limit: z
          .object({ cause: text, origin: nullableText, at: text, words: text })
          .strict()
          .nullable(),
      })
      .strict(),
  ),
  facets: z
    .object({ platform: text, frameworks: z.array(text), registers: z.array(text) })
    .strict()
    .nullable(),
  tokens: z.array(z.object({ group: text, name: text, value: text }).strict()),
  drift: nullableText,
  specimen: nullableText,
  page: z.object({ light: text, dark: nullableText }).strict().nullable(),
  notices: z.array(text),
};
const interfaceChecksDocument: z.ZodType<InterfaceChecksDocument> = envelope("interface-checks", {
  change: text,
  touches: z.boolean(),
  fact: interfaceCheckFactSchema.nullable(),
  design: nullableText,
  pick: designPickSchema.nullable(),
});

const captureView: z.ZodType<CaptureView> = z
  .object({
    id: text,
    address: text,
    change: nullableText,
    commit: text,
    made: text,
    files: z.array(text),
    tier,
    commitsSince: z.number().int().nullable(),
    widths: z.array(
      z
        .object({
          width: z.number().int(),
          height: z.number().int(),
          image: nullableText,
          imageHeight: z.number(),
          page: z.object({ width: z.number(), height: z.number() }).strict(),
          elements: z.array(boxedElementSchema),
          truncated: z.boolean(),
        })
        .strict(),
    ),
    boxes: nullableText,
    scores: captureScores,
    history: z.array(
      z
        .object({
          id: text,
          made: text,
          commit: text,
          when: z.enum(["earlier", "this", "later"]),
        })
        .strict(),
    ),
  })
  .strict();

/** Every record's name (J-158 S2): each entry a reference with its kind, its place, its state and its time. */
const searchDocument: z.ZodType<SearchDocument> = envelope("search", {
  entries: z.array(
    z
      .object({
        kind: z.enum(["change", "plan", "discussion", "picture", "note"]),
        id: text,
        name: text,
        address: text,
        where: text,
        state: nullableText,
        at: nullableText,
      })
      .strict() satisfies z.ZodType<SearchEntry>,
  ),
});

const markView: z.ZodType<MarkView> = z
  .object({
    ref,
    mark: markSchema,
    file: text,
    change: nullableText,
    stale: z.boolean(),
    after: z
      .object({
        capture: text,
        box: z
          .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const notesReading: z.ZodType<NotesReading> = z
  .object({ revision: text, notes: z.array(markView), unreadable: z.array(text) })
  .strict();
const interfaceDocument: z.ZodType<InterfaceDocument> = envelope("interface", {
  ...interfaceDocumentFields,
  notes: notesReading,
});
const markDocument: z.ZodType<MarkDocument> = envelope("mark", { note: markView, revision: text });
const picturesDocument: z.ZodType<PicturesDocument> = envelope("pictures", {
  pictures: homeReading(visualView),
});
const pictureDocument: z.ZodType<PictureDocument> = envelope("picture", {
  picture: visualView,
  html: nullableText,
  capture: captureView.nullable(),
  notes: notesReading,
});

/** A change's head (J-165 S1); each part is a document of its own. */
const changeDocument: z.ZodType<ChangeDocument> = envelope("change", {
  ref,
  state: changeState.nullable(),
  waitingOn: waitingOn.nullable(),
  strip: z.array(stripStep),
  change: changeDetail,
});
const changeNotesDocument: z.ZodType<ChangeNotesDocument> = envelope("notes", {
  ...changeRef,
  notes: notesReading,
});

/** Each document's schema by its kind: the contract's whole vocabulary. */
export const DOCUMENT_SCHEMAS: ReadonlyMap<string, z.ZodType<InspectorDocument>> = new Map<
  string,
  z.ZodType<InspectorDocument>
>([
  ["contract", contractDocument],
  ["desk", deskDocument],
  ["changes", changesDocument],
  ["change", changeDocument],
  ["changed-files", changedFilesDocument],
  ["notes", changeNotesDocument],
  ["source", sourceDocument],
  ["step", stepDocument],
  ["file", fileDocument],
  ["diff", diffDocument],
  ["check-facts", checkFactsDocument],
  ["commits", commitsDocument],
  ["skill-loads", skillLoadsDocument],
  ["frame-map", frameMapDocument],
  ["interface-checks", interfaceChecksDocument],
  ["deal", dealDocument],
  ["plans", plansDocument],
  ["plan", planPageDocument],
  ["discussions", discussionsDocument],
  ["discussion", discussionDocument],
  ["interface", interfaceDocument],
  ["mark", markDocument],
  ["homes", homesDocument],
  ["home", homeDocument],
  ["pictures", picturesDocument],
  ["picture", pictureDocument],
  ["atlas", atlasDocument],
  ["subsystem", subsystemDocument],
  ["document", documentPageDocument],
  ["practice", practiceDocument],
  ["installed-file", installedFileDocument],
  ["roster", rosterDocument],
  ["skill", skillDocument],
  ["settings", settingsDocument],
  ["catalog", catalogDocument],
  ["search", searchDocument],
]);
