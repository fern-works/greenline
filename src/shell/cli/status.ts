import { readFileSync } from "node:fs";
import { z } from "zod";
import { join } from "node:path";
import { agentsCounted } from "../../core/mirror.ts";
import { parseJson } from "../../core/contract.ts";
import { renderHooksText } from "../../core/adapters.ts";
import { renderProjection } from "../../core/render.ts";
import { gitHooksState, hooksReport, presentHarnesses } from "../hooks.ts";
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
import { parseLock } from "../../core/lock.ts";
import { GuidanceRequests } from "../guidance-requests.ts";
import { shouldNeverHappen } from "../../commons/defect.ts";
import { findGitRoot } from "../git.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { readChangesOnDisk, recordIds } from "../changes.ts";
import { readSituation } from "../situation.ts";
import { renderSituationText } from "../../core/situation.ts";
import { changedFiles, codeCommitsSince, readGitHistory } from "../git-history.ts";
import { commitTreeId, workingTreeId } from "../code-tree.ts";
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
} satisfies Readonly<Record<FindingKind, string>>;

/** Each notice's code; a notice never changes the exit code. */
const NOTICES = {
  "code-moved": GL.changeCodeMoved,
  uncited: GL.changeUncited,
  deleted: GL.changeDeleted,
  unchecked: GL.changeUnchecked,
  "fact-missing": GL.changeFactMissing,
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

/** Ask git what the view needs about the code; every answer is read-only. */
function answer(root: string, questions: CodeQuestions): CodeAnswers {
  return {
    commitTrees: new Map(questions.commitTrees.map((hash) => [hash, commitTreeId(root, hash)])),
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

/** The paths greenline installed, as the lock records them; none when the lock cannot be read, which the installation's diagnosis reports. */
function installedPaths(io: FileIo, root: string): ReadonlySet<string> {
  const text = envRead(io, join(root, ".greenline", "lock.json"));
  const lock = text === undefined ? undefined : parseLock(text, ".greenline/lock.json");
  return new Set(lock?._tag === "ok" ? lock.value.files.keys() : []);
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
): Pick<ChangesInput, "proceed" | "checks"> {
  const manifest = readRepositoryManifest(root, io, rosterOf(installation));
  if (manifest._tag === "err") return { proceed: undefined, checks: [] };
  return { proceed: manifest.value.proceed, checks: manifest.value.checks };
}

/** A raw log line's kind, the one field the count reads. */
const KIND_LINE = z.object({ kind: z.string() });

/**
 * The fresh agents each change's harness events counted, read from the raw
 * logs under `.greenline/tmp/`; a change with none has no entry.
 */
function agentsFromEvents(root: string, working: readonly string[]): ReadonlyMap<string, number> {
  const counted = new Map<string, number>();
  for (const id of working) {
    let text: string;
    try {
      text = readFileSync(join(root, ".greenline", "tmp", id, "events.jsonl"), "utf8");
    } catch {
      continue;
    }
    const kinds = text.split("\n").flatMap((line) => {
      const kind = KIND_LINE.safeParse(parseJson(line));
      return kind.success ? [kind.data.kind] : [];
    });
    const count = agentsCounted(kinds);
    if (count > 0) counted.set(id, count);
  }
  return counted;
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
      installed: installedPaths(io, root),
      decisions: envRead(io, join(root, ".greenline", "DECISIONS.md")),
      ...receiptCollections(root, io),
      agentsCounted: agentsFromEvents(root, disk.value.working),
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
    return fail([
      diagnostic(
        GL.manifestMissing,
        "error",
        "not a greenline workspace; run 'greenline init' first",
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
    return {
      ...succeed([], changeDiagnostics(changes)),
      text: renderChangesText(changes.report),
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
  const situation = readSituation(root, {
    records: records?.length,
    onDisk: new Set(records ?? []),
    installed: installedPaths(io, root),
  });
  const outcome = succeed([], [...installation.diagnostics, ...changeDiagnostics(changes)]);
  // The git hooks, the declared checks and the adapters, when the manifest reads.
  const manifest = readRepositoryManifest(root, io, rosterOf(env.installation));
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
  // The situation comes first, read before a session's first proposal; the
  // hooks follow it, and the connectors' lines, when the manifest could be
  // read, follow the changes and the rulings.
  const text =
    renderSituationText(situation) +
    (hooks === undefined ? "" : renderHooksText(hooks)) +
    renderChangesText(changes.report) +
    renderHouseRulingsText(houseRulings) +
    (installation.connectors?.text ?? "");
  const shown = { ...outcome, text, situation, changes: changes.report, houseRulings };
  const viewed: CommandOutcome = hooks === undefined ? shown : { ...shown, hooks };
  return installation.connectors === undefined
    ? viewed
    : { ...viewed, connectors: installation.connectors.statuses };
}
