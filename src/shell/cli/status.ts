import { runningText } from "../processes.ts";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { join } from "node:path";
import { agentsCounted, driftLine } from "../../core/mirror.ts";
import { methodAgents, type MethodAgents } from "../../core/method-agents.ts";
import { owedAtDone, proposalLines } from "../habits-owed.ts";
import { recordHintsLine } from "../record-hints.ts";
import { lackingLine, recordLack } from "../../core/record-lines.ts";
import type { OwedAtDone } from "../../core/record-lint.ts";
import { parseJson } from "../../core/contract.ts";
import { makerWords, NO_REMAKE_OFFER } from "../../core/visuals.ts";
import {
  HOOKS_NOT_INSTALLED_LINE,
  HARNESSES,
  isHarness,
  renderHooksText,
  surfaceLine,
  type Harness,
} from "../../core/adapters.ts";
import { predatesStatusLine } from "../../core/ground.ts";
import { changeOfBranch, recordPath } from "../../core/git-hooks.ts";
import {
  CAPTURE_COMMAND,
  limitsOwedText,
  renderOwedText,
  SCREEN_COMMAND,
} from "../../core/interface-pages.ts";
import type { Manifest } from "../../core/manifest.ts";
import { captureLimitLines, renderOwedOf } from "../interface-check.ts";
import { renderProjection } from "../../core/render.ts";
import {
  branchFacts,
  committedRecord,
  gitHooksState,
  hooksNotInstalled,
  hooksReport,
  predatingBranch,
  presentHarnesses,
  stoppedHere,
  workingRecord,
  workspaceManifest,
} from "../hooks.ts";
import {
  atlasLineOf,
  brieflessVisuals,
  deletedPictures,
  docsLineOf,
  reachingVisuals,
  readDrift,
  replacedPictures,
  sessionMadeVisuals,
  type DriftItem,
  type HomeDrift,
} from "../visuals.ts";
import {
  notedSurface,
  recordStep,
  reportedModel,
  stopCommitText,
  stoppedHeldText,
  stoppedWaitText,
} from "../skill-loads.ts";
import { ownerJournal, turnWords } from "../owner-words.ts";
import { heldLandingText, landingText } from "../landing.ts";
import { factsOf, factsText } from "../facts-table.ts";
import type { ModesDefinition } from "../../core/modes.ts";
import { interfaceStatusText } from "../interface.ts";
import {
  discussionsReport,
  renderDiscussionsText,
  type DiscussionsReport,
} from "../../core/discussion.ts";
import { listDiscussions, readUncopiedResearch, readUnnamedOrigins } from "../discussions.ts";
import {
  assessChanges,
  changesReport,
  codeQuestions,
  diffKey,
  renderChangesText,
  renderHouseRulingsText,
  sinceKey,
  type ChangesInput,
  type ChangesOutcome,
  type ChangesRequest,
  type CodeAnswers,
  type CodeQuestions,
  type FindingKind,
  type NoticeKind,
} from "../../core/status.ts";
import { GuidanceRequests } from "../guidance-requests.ts";
import { shouldNeverHappen } from "../../commons/defect.ts";
import { findGitRoot } from "../git.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { readChangesOnDisk, recordIds } from "../changes.ts";
import { readSituation } from "../situation.ts";
import { renderSituationText } from "../../core/situation.ts";
import { changedFiles, codeCommitsSince, readGitHistory } from "../git-history.ts";
import { commitTreeIds, installedPaths, workingTreeId } from "../code-tree.ts";
import { GL, diagnostic, type Diagnostic } from "./output.ts";
import { parseHouseRulings } from "../../core/house-rulings.ts";
import { type RepositoryEnvironment, envRead } from "./command-environment.ts";
import { type CommandOutcome, fail, succeed } from "./command-outcome.ts";
import { diagnoseInstallation } from "./diagnosis.ts";
import type { Installation } from "../../core/installation.ts";
import { readRepositoryManifest, rosterOf } from "../repository-state.ts";

/** Each finding's code; a finding fails the command. */
const FINDINGS = {
  unparsed: GL.changeUnparsed,
  mismatch: GL.changeMismatch,
  "below-floor": GL.changeBelowFloor,
  "checks-failed": GL.changeChecksFailed,
  "cited-missing": GL.changeCitedMissing,
  "ticket-mode": GL.changeTicketMode,
  "planning-below-careful": GL.changePlanningBelowCareful,
  "brief-unwritten": GL.changeBriefUnwritten,
  "cost-below-starts": GL.changeCostBelowStarts,
  "record-form": GL.changeRecordForm,
} satisfies Readonly<Record<FindingKind, string>>;

/** Each notice's code; a notice never changes the exit code. */
const NOTICES = {
  "code-moved": GL.changeCodeMoved,
  uncited: GL.changeUncited,
  deleted: GL.changeDeleted,
  unchecked: GL.changeUnchecked,
  "fact-missing": GL.changeFactMissing,
  "habit-owed": GL.changeHabitOwed,
  "record-form-open": GL.changeRecordFormOpen,
} satisfies Readonly<Record<NoticeKind, string>>;

/** The findings as errors and the notices as warnings, in the CLI's diagnostics. */
function changeDiagnostics(outcome: ChangesOutcome): readonly Diagnostic[] {
  return [
    ...outcome.findings.map((note) =>
      diagnostic(FINDINGS[note.kind], "error", note.message, note.path),
    ),
    ...outcome.notices.map((note) =>
      diagnostic(NOTICES[note.kind], "warning", note.message, note.path),
    ),
  ];
}

/** What a drifting visual is, as its notice names it: a capture, or another visual. */
function noun(item: DriftItem): string {
  return item.form === "capture" ? "capture" : "visual";
}

/**
 * The visual home's notices (J-110 S3 and S7): a visual or an atlas page
 * whose covered files changed since its commit, with its tier, and a
 * manifest or the atlas's index that does not read. GL0601 names the tier
 * and what the drift reaches, the capture or the visual and the record of
 * the change that links it (J-143 S3), and who drew it; it names the fact
 * and invites no remake, the owner's ask alone (J-198 S1). A notice never
 * fails.
 */
function driftDiagnostics(drift: HomeDrift): readonly Diagnostic[] {
  return [
    ...drift.items.map((item) => {
      const short = item.commit.slice(0, 7);
      const why =
        item.staleness.commitsSince === null
          ? `its commit ${short} is not in this repository's history`
          : item.staleness.tier === "stale"
            ? `a path it covers is gone since ${short}`
            : `${String(item.staleness.commitsSince)} commit${item.staleness.commitsSince === 1 ? "" : "s"} since ${short} touched the files it covers`;
      if (item.kind === "document")
        return diagnostic(
          GL.documentDrifted,
          "warning",
          item.author === "owner"
            ? `name the document ${item.id} to the owner, who wrote it and whose ask alone has it refreshed: it is ${item.staleness.tier}, as ${why}`
            : `name the document ${item.id} at the close, and refresh it on the owner's ask: it is ${item.staleness.tier}, as ${why}`,
          item.path,
        );
      return item.kind === "visual"
        ? diagnostic(
            GL.visualDrifted,
            "warning",
            `name the ${noun(item)} '${item.id}', "${item.title}"${makerWords(item.madeBy)}, to the owner: it is at the tier ${item.staleness.tier}, reaching the ${noun(item)}${item.change === null || item.change === undefined ? "" : ` and change ${item.change}'s record, which links it`}, as ${why}; the owner may delete it in greenline inspect, and ${NO_REMAKE_OFFER}`,
            item.path,
          )
        : diagnostic(
            GL.atlasPageDrifted,
            "warning",
            `refresh the atlas page '${item.id}', "${item.title}", at the close of the change that touched its files, or on the owner's ask: it is ${item.staleness.tier}, as ${why}`,
            item.path,
          );
    }),
    ...drift.unreadable.map((file) =>
      diagnostic(
        GL.visualUnreadable,
        "warning",
        `correct ${file.path}, or remove the visual it describes: it does not read, ${file.message}`,
        file.path,
      ),
    ),
  ];
}

/** A discussion record that does not read fails status, as a change record does (J-118 S2). */
function discussionDiagnostics(report: DiscussionsReport): readonly Diagnostic[] {
  return report.unreadable.map((entry) =>
    diagnostic(
      GL.discussionUnparsed,
      "error",
      `the discussion record does not read (${entry.problem}); correct it as .greenline/ledger/README.md, "Discussions", gives its form`,
      entry.path,
    ),
  );
}

/** A change promoted from a discussion whose research report its folder lacks is a notice (J-118 S3). */
function researchDiagnostics(root: string): readonly Diagnostic[] {
  return readUncopiedResearch(root).map((item) =>
    diagnostic(
      GL.discussionResearchUncopied,
      "warning",
      `copy the research report ${item.report} into .greenline/ledger/${item.change}/discussions/${item.discussion}/ and cite the copy: change ${item.change} was promoted from the discussion ${item.discussion}, and its folder lacks the report`,
      `.greenline/ledger/discussions/${item.discussion}/${item.report}`,
    ),
  );
}

/** A record whose from line names a discussion whose changes line does not name it is a notice (J-226 S1). */
function originDiagnostics(root: string): readonly Diagnostic[] {
  return readUnnamedOrigins(root).map((item) =>
    diagnostic(
      GL.discussionOriginUnnamed,
      "warning",
      `say which line is wrong, change ${item.change}'s from line or the discussion ${item.discussion}'s changes line, and correct it: the record names the discussion as its origin, and the discussion's changes line does not name the record`,
      `.greenline/ledger/${item.change}.md`,
    ),
  );
}

/**
 * The open interface change's pages still uncaptured (J-133 S1): the
 * change of the branch HEAD names, open, whose record says `interface: yes`
 * and that the declared interface check holds, with a page it touched that
 * no run captured or rendered to a named browser limit since its files
 * changed. A notice: the pre-commit hook is what holds `done`.
 */
function renderDiagnostics(root: string, manifest: Manifest | undefined): readonly Diagnostic[] {
  if (manifest?.interface === undefined) return [];
  const facts = branchFacts(root);
  const change = changeOfBranch(facts.current, facts);
  if (change === undefined) return [];
  const record = workingRecord(root, change.id);
  if (record?.state !== "open") return [];
  const owed = renderOwedOf(root, change.id, manifest, record.interface);
  if (owed === undefined) return [];
  // A limit the record does not name yet: the line that names it (J-191 S1).
  const limits = owed.limits ?? [];
  if (limits.length > 0)
    return [
      diagnostic(
        GL.interfaceRenderOwed,
        "warning",
        `before done on the interface change ${change.id}, ${limitsOwedText(limits)}, so the owner sees what was not captured; or capture it with ${CAPTURE_COMMAND}`,
        recordPath(change.id),
      ),
    ];
  return [
    diagnostic(
      GL.interfaceRenderOwed,
      "warning",
      `run ${CAPTURE_COMMAND} for each page of the interface change ${change.id} before done, which keeps the captures at 1440, 768 and 390 or, where no browser runs, names the limit in its fact, and on a platform no browser renders ${SCREEN_COMMAND} names that limit for each screen: it has no capture and no named browser limit since the files last changed for ${renderOwedText(owed)}`,
      recordPath(change.id),
    ),
  ];
}

/** The text lines the drift adds to the status view: the mirror's drift, atlas and docs lines (J-147 S1). */
function driftText(
  root: string,
  drift: HomeDrift,
  change: string | undefined,
  atClose: boolean,
): string {
  const lines = [
    driftLine(
      drift.items.filter((item) => item.kind === "visual").length,
      drift.items.filter((item) => item.kind === "subsystem").length,
    ),
    atlasLineOf(root, drift, change, atClose),
    docsLineOf(root, drift),
  ];
  return lines.flatMap((line) => (line === undefined ? [] : [`${line}\n`])).join("");
}

/** The change the branch HEAD names, open or not, as the mirror reads it, and the branch HEAD names. */
interface OpenChange {
  /** The change's id, undefined where the branch names none. */
  readonly id: string | undefined;
  /** The branch HEAD names, undefined at a detached HEAD. */
  readonly branch: string | undefined;
}

/** The change the branch HEAD names and the branch, as the mirror reads them. */
function openChange(root: string): OpenChange {
  const facts = branchFacts(root);
  return { id: changeOfBranch(facts.current, facts)?.id, branch: facts.current };
}

/**
 * The harness the open change's raw log last named, the surface status
 * reads as running.
 * @param root the repository root
 * @returns the harness, undefined where no open change's log names one
 */
function runningHarness(root: string): Harness | undefined {
  const facts = branchFacts(root);
  const change = changeOfBranch(facts.current, facts);
  if (change === undefined) return undefined;
  let text: string;
  try {
    text = readFileSync(join(root, ".greenline", "tmp", change.id, "events.jsonl"), "utf8");
  } catch {
    return undefined;
  }
  const harnesses = text.split("\n").flatMap((line) => {
    const read = LOGGED_HARNESS.safeParse(parseJson(line));
    return read.success && isHarness(read.data.harness) ? [read.data.harness] : [];
  });
  return harnesses.at(-1);
}

/** The harness a raw log's line names. */
const LOGGED_HARNESS = z.object({ harness: z.string() });

/** Ask git what the view needs about the code; every answer is read-only. */
function answer(root: string, questions: CodeQuestions): CodeAnswers {
  return {
    // Every commit's code tree in one git read (J-154 S2).
    commitTrees: commitTreeIds(root, questions.commitTrees),
    workingTree: questions.workingTree ? workingTreeId(root) : undefined,
    diffs: new Map(
      questions.diffs.map((diff) => [
        diffKey(diff.from, diff.to),
        changedFiles(root, diff.from, diff.to),
      ]),
    ),
    since: new Map(questions.since.map((from) => [sinceKey(from), codeCommitsSince(root, from)])),
  };
}

const RECEIPTS = ".greenline/ledger/receipts";

/** The garden collections, each read as it stands: the ones that read, and the ones that do not with why, so one bad file hides no other. */
function receiptCollections(
  root: string,
  io: FileIo,
): Pick<ChangesInput, "consultations" | "unreadableReceipts"> {
  const surveyed = new GuidanceRequests(root, io).survey();
  if (surveyed._tag === "err")
    return {
      consultations: [],
      unreadableReceipts: [{ path: RECEIPTS, issues: surveyed.error.input }],
    };
  return {
    consultations: surveyed.value.flatMap((entry) => ("request" in entry ? [entry.request] : [])),
    unreadableReceipts: surveyed.value.flatMap((entry) =>
      "failure" in entry ? [{ path: `${RECEIPTS}/${entry.file}`, issues: entry.failure }] : [],
    ),
  };
}

/**
 * The settings the changes view reads from the manifest, the `proceed`
 * setting and the declared checks; none when the manifest cannot be read,
 * which the installation's diagnosis reports.
 */
function loopSettings(
  root: string,
  io: FileIo,
  installation: Installation,
): Pick<ChangesInput, "proceed" | "checks" | "interfaceSetting"> {
  const manifest = readRepositoryManifest(root, io, rosterOf(installation));
  if (manifest._tag === "err")
    return { proceed: undefined, checks: [], interfaceSetting: undefined };
  return {
    proceed: manifest.value.proceed,
    checks: manifest.value.checks,
    interfaceSetting: manifest.value.interface,
  };
}

/** A raw log line's kind and the method an agent's start names, the fields the count reads. */
const KIND_LINE = z.object({
  kind: z.string(),
  method: z.string().nullable().optional().catch(undefined),
  agent: z.string().nullable().optional().catch(undefined),
});

/** The fresh agents the events counted against the mode's limit, and the agents a method started, by change. */
interface AgentsFromEvents {
  readonly counted: ReadonlyMap<string, number>;
  readonly methods: ReadonlyMap<string, readonly MethodAgents[]>;
}

/**
 * The fresh agents each change's harness events counted, read from the raw
 * logs under `.greenline/tmp/`, and apart the agents a method started
 * (J-134 S2); a change with none has no entry.
 */
function agentsFromEvents(root: string, working: readonly string[]): AgentsFromEvents {
  const counted = new Map<string, number>();
  const methods = new Map<string, readonly MethodAgents[]>();
  for (const id of working) {
    let text: string;
    try {
      text = readFileSync(join(root, ".greenline", "tmp", id, "events.jsonl"), "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n").flatMap((line) => {
      const read = KIND_LINE.safeParse(parseJson(line));
      return read.success ? [read.data] : [];
    });
    const count = agentsCounted(lines);
    if (count > 0) counted.set(id, count);
    const started = methodAgents(lines);
    if (started.length > 0) methods.set(id, started);
  }
  return { counted, methods };
}

/**
 * The line naming the skills each open change owes that no load holds
 * (J-134 S3, J-176 S1), by change; a change that owes none has no entry.
 */
function owedOf(
  root: string,
  ids: readonly string[],
  installation: Installation,
  manifest: Manifest | undefined,
): ReadonlyMap<string, string> {
  const owed = new Map<string, string>();
  if (manifest === undefined) return owed;
  for (const id of ids) {
    if (workingRecord(root, id)?.state !== "open") continue;
    const line = proposalLines({ root, installation, manifest, change: id, session: null }).owed;
    if (line !== undefined) owed.set(id, line);
  }
  return owed;
}

/**
 * The skills each change owed at done, as git's hooks read them (J-189 S1),
 * by change: every change whose working record stands and whose close HEAD
 * does not hold, so status names what the done door would refuse on.
 */
function owedAtDoneOf(
  root: string,
  ids: readonly string[],
  installation: Installation,
  manifest: Manifest | undefined,
): ReadonlyMap<string, readonly OwedAtDone[]> {
  const owed = new Map<string, readonly OwedAtDone[]>();
  if (manifest === undefined) return owed;
  for (const id of ids) {
    const state = workingRecord(root, id)?.state;
    if (state === undefined || state === "dropped") continue;
    if (state === "done" && committedRecord(root, "HEAD", id)?.state === "done") continue;
    owed.set(id, owedAtDone({ root, installation, manifest, change: id, session: null }));
  }
  return owed;
}

/**
 * The lines status prints beside the facts (J-176 S1): the situation the
 * proposal answers and the skills owed, and, while a change is open, the
 * lines its record lacks and the hooks' hints beside its lines, as the
 * mirror prints them.
 */
function proposalText(
  root: string,
  id: string | undefined,
  installation: Installation | undefined,
  manifest: Manifest | undefined,
): string {
  const lines: (string | undefined)[] = [];
  if (installation !== undefined && manifest !== undefined) {
    const read = proposalLines({ root, installation, manifest, change: id, session: null });
    lines.push(read.situation, read.owed);
  }
  if (id !== undefined && installation !== undefined)
    lines.push(recordLacking(root, id, installation), recordHintsLine(root, id));
  return lines.flatMap((line) => (line === undefined ? [] : [`${line}\n`])).join("");
}

/**
 * The `record lacks:` line of a change's record as the working tree holds
 * it (J-176 S1), the one reader the plain status and the resume view print
 * from (J-229 S1); undefined where the record lacks nothing or does not read.
 */
function recordLacking(root: string, id: string, installation: Installation): string | undefined {
  let text: string | undefined;
  try {
    text = readFileSync(join(root, recordPath(id)), "utf8");
  } catch {
    text = undefined;
  }
  const lack = text === undefined ? undefined : recordLack(installation.modes, text);
  return lack === undefined ? undefined : lackingLine(lack);
}

/** The two counts as the changes view takes them. */
function agentsOf(read: AgentsFromEvents) {
  return { agentsCounted: read.counted, methodAgents: read.methods };
}

/**
 * Gather the changes on disk and git's answers, then derive the view. git is
 * read only when a change record is on disk. A resume view of a change with
 * no record on disk has no outcome.
 */
function readChanges(
  env: RepositoryEnvironment,
  root: string,
  io: FileIo,
  request: ChangesRequest,
): ChangesOutcome | undefined {
  const installation = env.installation;
  if (installation === undefined)
    return {
      report: {
        view: "unavailable",
        reason: "the installation is unavailable, so the modes cannot be read",
      },
      findings: [],
      notices: [],
    };
  const disk = readChangesOnDisk(root, installation.modes);
  if (disk._tag === "err")
    return {
      report: { view: "unavailable", reason: "the ledger or the plans folder cannot be read" },
      findings: [
        {
          kind: "unparsed",
          message: `${disk.error.issues.map((issue) => issue.message).join("; ")}; make the folder readable, and the changes view reads again`,
          path: disk.error.source,
          subject: { kind: "history" },
        },
      ],
      notices: [],
    };
  if (request.view === "resume" && !disk.value.changes.some((entry) => entry.id === request.change))
    return undefined;
  const assessment = assessChanges(
    {
      definition: installation.modes,
      revision: installation.revision,
      ...loopSettings(root, io, installation),
      disk: disk.value,
      history: disk.value.changes.length === 0 ? undefined : readGitHistory(root),
      installed: installedPaths(root),
      decisions: envRead(io, join(root, ".greenline", "DECISIONS.md")),
      ...receiptCollections(root, io),
      ...agentsOf(agentsFromEvents(root, disk.value.working)),
      owedLines: owedOf(
        root,
        disk.value.changes.map((entry) => entry.id),
        installation,
        workspaceManifest(root),
      ),
      owedAtDone: owedAtDoneOf(
        root,
        disk.value.changes.map((entry) => entry.id),
        installation,
        workspaceManifest(root),
      ),
      // The model each harness reports for its newest session here, which an agent line names (J-192 S1).
      reported: new Map(
        HARNESSES.flatMap((harness) => {
          const model = reportedModel(root, harness);
          return model === undefined ? [] : [[harness, model] as const];
        }),
      ),
    },
    request,
  );
  return changesReport(assessment, answer(root, codeQuestions(assessment)));
}

/**
 * The one diagnosis, read-only: the situation, the installation, the
 * connectors, the changes view and the House rulings; or, for `--change`, one
 * change's resume view alone. It writes nothing, chooses no mode and advances no step.
 * @param env where it runs and what it reads
 * @param request the default list, every change, or one change's resume view
 * @returns the outcome; an error or a finding fails it, a warning or a notice never does
 */
export function runStatus(env: RepositoryEnvironment, request: ChangesRequest): CommandOutcome {
  const root = findGitRoot(env.cwd);
  if (root === undefined) {
    return fail([
      diagnostic(GL.notGitRepository, "error", "status requires a Git repository root"),
    ]);
  }
  const io: FileIo = createNodeFileIo();
  if (envRead(io, join(root, ".greenline", "manifest.json")) === undefined) {
    // A branch cut before the install is named with the way back and the new session it owes, never taken for no workspace (J-193 S1, J-206 S1).
    const predating = predatingBranch(root);
    return fail([
      diagnostic(
        GL.manifestMissing,
        "error",
        predating === undefined
          ? "not a greenline workspace; run 'greenline init' first"
          : predatesStatusLine(predating.branch, predating.base),
        ".greenline/manifest.json",
      ),
    ]);
  }
  if (request.view === "resume") {
    const changes = readChanges(env, root, io, request);
    if (changes === undefined)
      return fail([
        diagnostic(
          GL.usage,
          "error",
          `no change record '${request.change}' in .greenline/ledger/`,
          ".greenline/ledger",
        ),
      ]);
    // The change's landing, from its record and git, once its close has run (J-202 S1), and the owner's words since the offer (J-209 S1).
    const landing = landingText(root, request.change, null);
    // The stop's commit the change owes while no commit holds its stop, read in the stop's own turn (J-210 S1, j196t-states-stop-2c 001/005).
    const uncommitted = stopCommitText(root, turnWords(root, null), [request.change]);
    // The lines an open change's record lacks, as the plain status prints them (J-229 S1, j217c-workspace-010 finding 2).
    const lacking =
      env.installation === undefined || workingRecord(root, request.change)?.state !== "open"
        ? undefined
        : recordLacking(root, request.change, env.installation);
    return {
      ...succeed([], changeDiagnostics(changes)),
      text:
        renderChangesText(changes.report) +
        (lacking === undefined ? "" : `${lacking}\n`) +
        (uncommitted === undefined ? "" : `${uncommitted}\n`) +
        (landing === undefined ? "" : `${landing}\n`),
      changes: changes.report,
    };
  }
  const installation = diagnoseInstallation(env, root, io);
  const changes =
    readChanges(env, root, io, request) ??
    shouldNeverHappen("only a resume view can name a missing change");
  // The stanza is the user's text; status lists it and never writes it.
  const houseRulings = parseHouseRulings(envRead(io, join(root, "AGENTS.md")) ?? "");
  const records = recordIds(root);
  // The git hooks, the declared checks, the adapters and the ground's setting, when the manifest reads.
  const manifest = readRepositoryManifest(root, io, rosterOf(env.installation));
  const situation = readSituation(root, {
    records: records?.length,
    onDisk: new Set(records ?? []),
    installed: installedPaths(root),
    groundSetting: manifest._tag === "ok" ? manifest.value.ground : undefined,
    // The branches cut before the install say what a request for their files owes under proceed (J-213 S1).
    proceed: manifest._tag === "ok" ? manifest.value.proceed : undefined,
  });
  const drift = readDrift(root);
  const discussions = discussionsReport(listDiscussions(root));
  const outcome = succeed(
    [],
    [
      ...installation.diagnostics,
      ...changeDiagnostics(changes),
      ...discussionDiagnostics(discussions),
      ...researchDiagnostics(root),
      ...originDiagnostics(root),
      ...driftDiagnostics(drift),
      ...renderDiagnostics(root, manifest._tag === "ok" ? manifest.value : undefined),
      ...reachingVisuals(root).map((visual) =>
        diagnostic(
          GL.visualReachesOutside,
          "warning",
          `name the visual '${visual.id}', "${visual.title}"${makerWords(visual.madeBy)}, to the owner: its file loads ${visual.reaches.join(", ")} from outside the repository, which the viewer's policy refuses and an offline reader cannot reach; ${NO_REMAKE_OFFER}`,
          visual.path,
        ),
      ),
      ...sessionMadeVisuals(root).map((visual) =>
        diagnostic(
          GL.visualMadeBySession,
          "warning",
          `name the visual '${visual.id}', "${visual.title}", to the owner: the session drew it itself, not a fresh agent, and a durable visual is a fresh agent's; ${NO_REMAKE_OFFER}`,
          visual.path,
        ),
      ),
      // A kept picture whose skill wrote no brief before it drew (J-204 S1).
      ...brieflessVisuals(root).map((visual) =>
        diagnostic(
          GL.visualBriefMissing,
          "warning",
          `name the visual '${visual.id}', "${visual.title}", to the owner: it was kept with no brief, the question it answers, its form, its node count, its finish, its palette and its reader, which its skill writes before it draws; ${NO_REMAKE_OFFER}`,
          visual.path,
        ),
      ),
      // A kept picture a remake names it replaces, the owner's to delete in the inspector (J-227 S1).
      ...replacedPictures(root).map((visual) =>
        diagnostic(
          GL.visualReplaced,
          "warning",
          `name the visual '${visual.id}', "${visual.title}", to the owner as replaced: the picture '${visual.by.id}', "${visual.by.title}", was kept with --replaces ${visual.id.slice(visual.id.indexOf("/") + 1)}, and the owner may delete the replaced one in greenline inspect; nothing is deleted unasked, and ${NO_REMAKE_OFFER}`,
          visual.path,
        ),
      ),
      // A kept picture deleted from the home, the owner's delete where the inspector's stamp stands (J-227 S1).
      ...deletedPictures(root).map((visual) =>
        diagnostic(
          GL.visualDeleted,
          "warning",
          `name the visual '${visual.id}', "${visual.title}", to the owner as deleted: ${visual.byOwner ? "the owner deleted it in greenline inspect" : "it is gone from the visual home"}, and change ${visual.change}'s committed links file still lists it; a deleted picture is remade only on the owner's ask, never restored from git`,
          visual.links,
        ),
      ),
    ],
  );
  // The session's harness, or outside a session the manifest's targets, each the surface a session there reads (J-143 S2): the row the last turn's start noted where it names the harness (J-151 S1).
  const harness = runningHarness(root);
  const surfaces: readonly Harness[] =
    harness !== undefined ? [harness] : manifest._tag === "ok" ? manifest.value.targets : [];
  const hooks =
    manifest._tag === "err"
      ? undefined
      : hooksReport(
          manifest.value,
          env.installation === undefined
            ? []
            : renderProjection(manifest.value, env.installation, presentHarnesses(root)),
          // The PATH the hooks run greenline from, read where the CLI passes its environment.
          gitHooksState(root, manifest.value.hooks, env.environment),
        );
  // The situation comes first, read before a session's first proposal, with
  // the open change's facts table and progress line, the mirror's own lines
  // (J-144 S1); the hooks follow it, and the connectors' lines, when the
  // manifest could be read, follow the changes and the rulings.
  const open = openChange(root);
  const modes = (): ModesDefinition | undefined => env.installation?.modes;
  const facts = open.id === undefined ? undefined : factsOf(root, open.id, open.branch, modes);
  // A checkout whose git configuration registers none of the hooks, a clone before its sync, says so in one line (J-193 S1).
  const unhooked =
    manifest._tag === "ok" && hooksNotInstalled(root, manifest.value.hooks)
      ? `${HOOKS_NOT_INSTALLED_LINE}\n`
      : "";
  // The owner's message of the turn that started last, which the waiting line and the stopped fact read against the wait (J-205 S1).
  const words = turnWords(root, null);
  // A record stopped while the session whose turn started last goes on, which a wait leaves open (J-200 S1).
  const held = stoppedHeldText(
    root,
    open.id ?? stoppedHere(root),
    null,
    (named) => ownerJournal(root, named),
    words,
  );
  // A record that reads stopped while no commit holds the stop, until the stop's commit stands (J-210 S1).
  const uncommitted = stopCommitText(root, words);
  // The one change stopped here while no change is open, its wait as the mirror prints it (J-149 S3, J-205 S1).
  const waiting = open.id === undefined ? stoppedWaitText(root, words) : undefined;
  // A done change's landing, from its record and git, for the change the session whose turn started last holds (J-202 S1).
  const landing = heldLandingText(root, open.id, null);
  const text =
    renderSituationText(situation) +
    unhooked +
    (held === undefined ? "" : `${held}\n`) +
    (uncommitted === undefined ? "" : `${uncommitted}\n`) +
    (waiting === undefined ? "" : `${waiting}\n`) +
    (landing === undefined ? "" : `${landing}\n`) +
    factsText(root, open.id, open.branch, modes, words) +
    proposalText(
      root,
      open.id,
      env.installation,
      manifest._tag === "ok" ? manifest.value : undefined,
    ) +
    (hooks === undefined ? "" : renderHooksText(hooks)) +
    renderChangesText(changes.report) +
    renderDiscussionsText(discussions) +
    driftText(
      root,
      drift,
      open.id,
      open.id !== undefined && recordStep(root, open.id, modes) === "close",
    ) +
    interfaceStatusText(root, manifest._tag === "ok" ? manifest.value.interface : undefined) +
    (open.id === undefined
      ? ""
      : captureLimitLines(root, open.id)
          .map((line) => `${line}\n`)
          .join("")) +
    runningText(root) +
    surfaces.map((each) => `${surfaceLine(notedSurface(root, each))}\n`).join("") +
    renderHouseRulingsText(houseRulings) +
    (installation.connectors?.text ?? "");
  const listed: CommandOutcome = {
    ...outcome,
    text,
    situation,
    changes: changes.report,
    houseRulings,
    discussions,
  };
  // The open change's facts table, carried in the JSON while a change is open (J-144 S1).
  const shown: CommandOutcome = facts === undefined ? listed : { ...listed, facts };
  const viewed: CommandOutcome = hooks === undefined ? shown : { ...shown, hooks };
  return installation.connectors === undefined
    ? viewed
    : { ...viewed, connectors: installation.connectors.statuses };
}
