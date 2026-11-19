import { INSPECT_SCHEMA } from "../../core/inspector/contract.ts";
import type {
  CareItem,
  ChangeListEntry,
  DeskChange,
  DeskClose,
  DeskDocument,
  DeskSince,
  DeskToday,
  SinceChange,
  TodaySegment,
  Unread,
} from "../../core/inspector/documents.ts";
import type { ChangeView } from "../../core/status.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import { openMarks, readMarksFiles } from "../marks.ts";
import { readVisualsHome } from "../visuals.ts";
import { pathOf } from "./app/addresses.ts";
import {
  changedFilesOf,
  commitFiles,
  installedTest,
  noFiles,
  type CommitFiles,
} from "./changed-files.ts";
import { discussionSummaries } from "./discussions.ts";
import { readChanges } from "./ledger.ts";
import { checkStandingOf, statusDiagnostics } from "./readings.ts";
import { closeChecks, commitWithSubject } from "./desk-facts.ts";
import { driftReading } from "./visuals.ts";

/*
 * The desk (J-154 S3, on J-156's picked design): the first screen's one
 * document. What waits on the owner, the changes in progress with what each
 * waits on and the files it changed since the owner's last look, what moved
 * since that look, the last close, what needs care and today's work, each
 * summary with its source. The owner's last look is the time the page
 * sends, `?since=<time>`; a first look sends none, and the desk then shows
 * each change's files whole. Every commit is a change's, found by its
 * trailer as `greenline status` finds it.
 */

/** A change's commits as the status derivations list them, or why they cannot be listed. */
function hashesOf(view: ChangeView | undefined): readonly string[] | undefined {
  const commits = view?.commits;
  return commits?.kind === "known" ? commits.commits.map((commit) => commit.hash) : undefined;
}

/** The time the page sent, read as an instant; undefined where it sends none or none that reads. */
export function sinceOf(query: URLSearchParams): string | undefined {
  const sent = query.get("since");
  if (sent === null || sent.trim() === "") return undefined;
  const at = Date.parse(sent);
  return Number.isNaN(at) ? undefined : new Date(at).toISOString();
}

const after = (date: string, since: string): boolean => Date.parse(date) > Date.parse(since);

/** Whether an instant falls on the server's day of another. */
const sameDay = (date: string, day: Date): boolean =>
  new Date(date).toDateString() === day.toDateString();

/** The newest and the oldest of a change's commits. */
function span(commits: readonly CommitFiles[]): { first: string; last: string } | undefined {
  const dates = commits.map((commit) => commit.date).sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = dates[0];
  const last = dates.at(-1);
  return first === undefined || last === undefined ? undefined : { first, last };
}

/** What happened to a change since the owner's look, read from its state and its commits. */
function happened(
  entry: ChangeListEntry,
  commits: readonly CommitFiles[],
  since: string,
): SinceChange["happened"] {
  const range = span(commits);
  if (entry.state === "done") return "closed";
  if (entry.state === "dropped") return "dropped";
  return range !== undefined && after(range.first, since) ? "opened" : "steps written";
}

/**
 * The desk as the repository stands.
 * @param root the repository root
 * @param env the CLI environment
 * @param now the server's time, the day today's work is counted on
 * @param since the time the page sent, the owner's last look; undefined on a first look
 * @returns the document
 */
export function deskDocument(
  root: string,
  env: CliEnvironment,
  now: Date,
  since: string | undefined,
): Unread<DeskDocument> {
  const reading = readChanges(root, env, now);
  const entries = reading.list.changes;
  const installed = installedTest(root);
  const read = commitFiles(
    root,
    entries.flatMap((entry) => hashesOf(reading.views.get(entry.id)) ?? []),
  );
  const unknown = "unknown" in read ? read.unknown : null;
  const commitsOf = (entry: ChangeListEntry): readonly CommitFiles[] | undefined => {
    const hashes = hashesOf(reading.views.get(entry.id));
    if (hashes === undefined || "unknown" in read) return undefined;
    return hashes.flatMap((hash) => {
      const found = read.get(hash);
      return found === undefined ? [] : [found];
    });
  };
  const inProgress = entries
    .filter((entry) => entry.state !== null && entry.state !== "done" && entry.state !== "dropped")
    .map((entry): DeskChange => {
      const view = reading.views.get(entry.id);
      const commits = commitsOf(entry);
      return {
        ...entry,
        commits: hashesOf(view)?.length ?? null,
        checks: (view?.declaredChecks ?? []).map(checkStandingOf),
        changedFiles:
          commits === undefined
            ? null
            : changedFilesOf(
                since === undefined
                  ? commits
                  : commits.filter((commit) => after(commit.date, since)),
                installed,
              ),
      };
    });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  // The last three closes in their three lines, the most recent first (J-155 S1).
  const closes = reading.closed.slice(0, 3).flatMap((id) => {
    const entry = byId.get(id);
    return entry === undefined
      ? []
      : [closeOf(root, entry, reading.views.get(id), commitsOf(entry), installed, unknown)];
  });
  const lastClose = closes[0] ?? null;
  const closedToday = entries.filter((entry) => {
    if (entry.state !== "done" && entry.state !== "dropped") return false;
    const range = span(commitsOf(entry) ?? []);
    return range !== undefined && sameDay(range.last, now);
  }).length;
  const diagnostics = statusDiagnostics({ ...env, cwd: root });
  const errors = diagnostics.filter((note) => note.severity === "error").length;
  const drift = driftReading(root);
  const notes = openMarks(root, readMarksFiles(root)).length;
  const all = entries.map((entry) => ({ entry, commits: commitsOf(entry) ?? [] }));
  return {
    schema: INSPECT_SCHEMA,
    kind: "desk",
    summary: {
      waiting: entries.filter((entry) => entry.waitingOn !== null).length,
      inProgress: inProgress.length,
      closedToday,
      lastCloseAt: lastClose?.closedAt ?? null,
      source: {
        label: "the change records under .greenline/ledger/ and their commits",
        address: pathOf({ page: "changes" }),
      },
    },
    since: since === undefined ? null : sinceSince(root, all, since, installed, unknown),
    waiting: entries.flatMap((entry) =>
      entry.waitingOn === null ? [] : [{ change: entry.ref, ...entry.waitingOn }],
    ),
    inProgress,
    unavailable: reading.list.unavailable,
    lastClose,
    closes,
    care: careOf(errors, diagnostics.length - errors, drift.items.length, notes),
    today: todayOf(all, now),
    // The discussions at hand: the open and the parked (J-118 S4).
    discussions: {
      available: true,
      items: discussionSummaries(root).filter(
        (discussion) => discussion.state === "open" || discussion.state === "parked",
      ),
    },
    drift,
    diagnostics: { errors, warnings: diagnostics.length - errors },
  };
}

/** A close: when, how long it took, what it touched, its checks and its last commit. */
function closeOf(
  root: string,
  entry: ChangeListEntry,
  view: ChangeView | undefined,
  commits: readonly CommitFiles[] | undefined,
  installed: (path: string) => boolean,
  unknown: string | null,
): DeskClose {
  const range = span(commits ?? []);
  const last = [...(commits ?? [])].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1);
  return {
    ...entry,
    closedAt: range?.last ?? null,
    tookMinutes:
      range === undefined
        ? null
        : Math.round((Date.parse(range.last) - Date.parse(range.first)) / 60_000),
    touched:
      commits === undefined
        ? unknown === null
          ? null
          : noFiles(unknown)
        : changedFilesOf(commits, installed),
    checked: closeChecks(view),
    lastCommit: last === undefined ? null : commitWithSubject(root, last.hash),
    commits: commits?.length ?? null,
    source: {
      label: "the change's commits",
      address: pathOf({ page: "change", id: entry.id, part: "commits" }),
    },
  };
}

/** What moved since the owner's last look. */
function sinceSince(
  root: string,
  all: readonly { readonly entry: ChangeListEntry; readonly commits: readonly CommitFiles[] }[],
  since: string,
  installed: (path: string) => boolean,
  unknown: string | null,
): DeskSince {
  const moved = all.flatMap(({ entry, commits }) => {
    const later = commits.filter((commit) => after(commit.date, since));
    return later.length === 0 ? [] : [{ entry, commits, later }];
  });
  const pictures = readVisualsHome(root).filter((visual) => {
    if (visual.manifest._tag === "err") return false;
    const made = Date.parse(visual.manifest.value.made);
    return !Number.isNaN(made) && made > Date.parse(since);
  }).length;
  // A commit two changes claim is counted once.
  const later = [
    ...new Map(
      moved.flatMap((change) => change.later).map((commit) => [commit.hash, commit]),
    ).values(),
  ];
  return {
    at: since,
    commits: later.length,
    changes: moved.map(({ entry, commits }) => ({
      change: entry.ref,
      happened: happened(entry, commits, since),
    })),
    pictures,
    changedFiles: unknown === null ? changedFilesOf(later, installed) : noFiles(unknown),
  };
}

/** What needs the owner's care, grouped: the errors, the warnings, what drifted and the open notes. */
function careOf(
  errors: number,
  warnings: number,
  drift: number,
  notes: number,
): readonly CareItem[] {
  const status = {
    label: "greenline status",
    address: pathOf({ page: "practice" }),
  };
  const items: CareItem[] = [];
  if (errors > 0)
    items.push({
      kind: "errors",
      count: errors,
      text: `${String(errors)} error${errors === 1 ? "" : "s"} from greenline status`,
      address: status.address,
      source: status,
    });
  if (warnings > 0)
    items.push({
      kind: "warnings",
      count: warnings,
      text: `${String(warnings)} warning${warnings === 1 ? "" : "s"} from greenline status`,
      address: status.address,
      source: status,
    });
  if (drift > 0) {
    const address = pathOf({ page: "atlas", tab: "map" });
    items.push({
      kind: "drift",
      count: drift,
      text: `${String(drift)} picture${drift === 1 ? "" : "s"} or page${drift === 1 ? "" : "s"} drifted from the code`,
      address,
      source: { label: "the visual home's index", address },
    });
  }
  if (notes > 0) {
    const address = pathOf({ page: "marks" });
    items.push({
      kind: "notes",
      count: notes,
      text: `${String(notes)} note${notes === 1 ? "" : "s"} open on the captures`,
      address,
      source: { label: "the marks files", address },
    });
  }
  return items;
}

/** Today's work on the server's clock: the commits by hour and each change's first and last. */
function todayOf(
  all: readonly { readonly entry: ChangeListEntry; readonly commits: readonly CommitFiles[] }[],
  now: Date,
): DeskToday {
  const perHour = Array.from({ length: 24 }, () => 0);
  const segments: TodaySegment[] = [];
  const seen = new Map<string, string>();
  for (const { entry, commits } of all) {
    const today = commits.filter((commit) => sameDay(commit.date, now));
    for (const commit of today) seen.set(commit.hash, commit.date);
    const range = span(today);
    if (range !== undefined)
      segments.push({
        change: entry.ref,
        mode: entry.mode,
        state: entry.state,
        firstAt: range.first,
        lastAt: range.last,
      });
  }
  // A commit two changes claim is counted once.
  for (const date of seen.values()) {
    const hour = new Date(date).getHours();
    perHour[hour] = (perHour[hour] ?? 0) + 1;
  }
  const range = span([...seen.entries()].map(([hash, date]) => ({ hash, date, files: [] })));
  return {
    commits: seen.size,
    first: range?.first ?? null,
    last: range?.last ?? null,
    commitsPerHour: perHour,
    segments: segments.sort((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt)),
  };
}
