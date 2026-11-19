import type {
  ChangedFiles,
  ChangeListEntry,
  DeskChange,
  DeskClose,
  DeskDocument,
  DiscussionSummary,
  DriftNotice,
  Ref,
  StripStep,
  WaitingOn,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";

/*
 * The desk's fixtures (J-155 S1): a change in progress waiting on the
 * owner, one at build with an open offer, one stopped, and closes in the
 * states their three lines take, written in the contract's types so the
 * catalogue draws the desk's components from data alone and a test holds
 * each one to its schema. They are specimens, never shown as the
 * repository's own records.
 */

const STEPS = ["frame", "design", "plan", "anticipate", "build", "review", "verify", "close"];

/** A change's reference in the specimens, its name humanised from the id as the server names it. */
function changeRef(id: string): Ref {
  const words = id.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ");
  return {
    id,
    name: `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
    address: pathOf({ page: "change", id, part: null }),
  };
}

/** A strip with the steps before `current` written, `current` the step reached, the rest not yet. */
function strip(current: string | null, skipped: readonly string[] = ["anticipate"]): StripStep[] {
  const at = current === null ? STEPS.length : STEPS.indexOf(current);
  return STEPS.map((step, index) => ({
    step,
    state: skipped.includes(step)
      ? "skipped"
      : step === current
        ? "now"
        : index < at
          ? "written"
          : "not-yet",
    current: step === current,
    depth: skipped.includes(step) ? "skipped at regular" : "written",
  }));
}

function entry(
  id: string,
  why: string,
  state: ChangeListEntry["state"],
  step: string | null,
  next: string | null,
  waitingOn: WaitingOn | null = null,
): ChangeListEntry {
  return {
    id,
    ref: changeRef(id),
    path: `.greenline/ledger/${id}.md`,
    state,
    waitingOn,
    mode: "regular",
    why,
    next,
    plan: null,
    ticket: null,
    opened: id.slice(0, 10),
    ageDays: 0,
    problem: null,
    step: step ?? "none",
    strip: strip(step),
    closedAt: null,
    lastAt: null,
    size: null,
    commits: null,
  };
}

const FILES: ChangedFiles = {
  groups: [
    {
      folder: "src/web",
      count: 3,
      files: [
        { path: "src/web/list.ts", added: 64, removed: 21 },
        { path: "src/web/style.css", added: 58, removed: 30 },
        { path: "src/web/keys.ts", added: 4, removed: 1 },
      ],
    },
    {
      folder: "test",
      count: 2,
      files: [
        { path: "test/list.test.ts", added: 18, removed: 4 },
        { path: "test/fixtures/list.png", added: null, removed: null },
      ],
    },
    { folder: ".", count: 1, files: [{ path: "DESIGN.md", added: 4, removed: 1 }] },
  ],
  totals: { files: 6, added: 148, removed: 57 },
  installed: 2,
  unknown: null,
};

const NONE_SINCE: ChangedFiles = {
  groups: [],
  totals: { files: 0, added: 0, removed: 0 },
  installed: 0,
  unknown: null,
};

const WAITING: WaitingOn = {
  question: "the owner chooses how the Move buttons show, then rerun the browser check",
  next: "build: the owner chooses how the Move buttons show, then rerun the browser check",
  step: "build",
  askedAt: "2026-10-28T10:18:35.000Z",
  options: ["always shown, quiet", "shown on hover and focus"],
  source: {
    label: "the record's next line, as the status's Waiting on row says it",
    address: "/changes/2026-10-28-dense-list",
  },
};

/** The desk's cards: waiting on the owner, at build with an open offer, stopped with nothing since. */
export const NOW_CARDS: readonly { readonly name: string; readonly change: DeskChange }[] = [
  {
    name: "waiting on the owner, with the files since the last look",
    change: {
      ...entry(
        "2026-10-28-dense-list",
        "The owner wants the issues list denser, with the keys between issues still working.",
        "waiting",
        "build",
        WAITING.next,
        WAITING,
      ),
      commits: 9,
      size: { files: 6, added: 148, removed: 57, installed: 2 },
      lastAt: "2026-10-28T10:18:35.000Z",
      checks: [
        { name: "test", command: "npm test", outcome: "passed", at: "2026-10-28T10:15:00.000Z" },
      ],
      waitingOn: WAITING,
      changedFiles: FILES,
    },
  },
  {
    name: "at review, a picture offered and not answered",
    change: {
      ...entry(
        "2026-10-28-light-dark",
        "The owner wants a light scheme beside the dark, chosen by the system or by hand.",
        "in-progress",
        "review",
        "review: write the review section from the fresh reviewer's report",
      ),
      commits: 6,
      checks: [],
      waitingOn: null,
      changedFiles: {
        ...FILES,
        groups: FILES.groups.slice(0, 1),
        totals: { files: 3, added: 126, removed: 52 },
        installed: 0,
      },
    },
  },
  {
    name: "stopped with its next line, nothing changed since the last look",
    change: {
      ...entry(
        "2026-10-27-board-drag",
        "The owner wants the board's cards moved by dragging as well as by the buttons.",
        "stopped",
        "plan",
        "plan: compare the two drag libraries the decisions book allows",
      ),
      commits: 1,
      checks: [],
      waitingOn: null,
      changedFiles: NONE_SINCE,
    },
  },
];

/** The desk's closes: every check passed on the final code, one failed, and one with no commit read. */
export const CLOSES: readonly { readonly name: string; readonly close: DeskClose }[] = [
  {
    name: "closed, every check passed on the final code",
    close: {
      ...entry(
        "2026-10-28-projects",
        "The owner wants issues grouped into projects, each with its own list.",
        "done",
        null,
        null,
      ),
      closedAt: "2026-10-28T09:51:12.000Z",
      tookMinutes: 33,
      touched: FILES,
      checked: { total: 5, passed: 5, failed: 0, onFinal: 5, failing: [] },
      lastCommit: {
        hash: "70913b0d4e1f",
        subject: "docs(record): link the evidence the change kept",
      },
      commits: 17,
      source: { label: "the change's commits", address: null },
    },
  },
  {
    name: "closed with a failing check",
    close: {
      ...entry(
        "2026-10-28-keyboard-shortcuts",
        "The owner wants every list and the board driven from the keyboard.",
        "done",
        null,
        null,
      ),
      closedAt: "2026-10-28T07:02:40.000Z",
      tookMinutes: 33,
      touched: {
        ...FILES,
        groups: FILES.groups.slice(0, 2),
        totals: { files: 5, added: 144, removed: 56 },
      },
      checked: { total: 3, passed: 2, failed: 1, onFinal: 2, failing: ["npm run e2e"] },
      lastCommit: { hash: "4fadb1b77c20", subject: "docs(record): close the keyboard shortcuts" },
      commits: 8,
      source: { label: "the change's commits", address: null },
    },
  },
  {
    name: "dropped, no commit read",
    close: {
      ...entry(
        "2026-10-27-export-csv",
        "The owner wanted the list exported as a spreadsheet file.",
        "dropped",
        null,
        null,
      ),
      closedAt: null,
      tookMinutes: null,
      touched: NONE_SINCE,
      checked: { total: 0, passed: 0, failed: 0, onFinal: 0, failing: [] },
      lastCommit: null,
      commits: 0,
      source: { label: "the change's commits", address: null },
    },
  },
];

/** The time the desk's specimens are read at, half an hour after the wait was asked. */
export const DESK_AT: Date = new Date("2026-10-28T10:48:35.000Z");

/** The owner's last look in the specimens, before the wait was asked. */
export const DESK_SINCE = "2026-10-28T10:05:00.000Z";

/**
 * The desk as its specimens draw it: a change waiting, two more in
 * progress, the last three closes, and the drift and the discussions given.
 * @param discussions the open discussions
 * @param drift what drifted
 * @returns the document
 */
export function deskSpecimen(
  discussions: readonly DiscussionSummary[],
  drift: readonly DriftNotice[],
): DeskDocument {
  const inProgress = NOW_CARDS.map((card) => card.change);
  const closes = CLOSES.map((close) => close.close);
  return {
    schema: "greenline.inspect/v2",
    kind: "desk",
    read: { at: DESK_AT.toISOString(), revision: "specimen" },
    summary: {
      waiting: inProgress.filter((change) => change.waitingOn !== null).length,
      inProgress: inProgress.length,
      closedToday: closes.length,
      lastCloseAt: closes[0]?.closedAt ?? null,
      source: { label: "the change records", address: pathOf({ page: "changes" }) },
    },
    since: {
      at: DESK_SINCE,
      commits: 9,
      changes: closes.slice(0, 1).map((close) => ({ change: close.ref, happened: "closed" })),
      pictures: 1,
      changedFiles: FILES,
    },
    waiting: inProgress.flatMap((change) =>
      change.waitingOn === null ? [] : [{ change: change.ref, ...change.waitingOn }],
    ),
    inProgress,
    unavailable: null,
    lastClose: closes[0] ?? null,
    closes,
    care: [
      {
        kind: "notes",
        count: 1,
        text: "1 note open on the captures",
        address: pathOf({ page: "marks" }),
        source: { label: "the marks files", address: pathOf({ page: "marks" }) },
      },
    ],
    today: {
      commits: 0,
      first: null,
      last: null,
      commitsPerHour: Array.from({ length: 24 }, () => 0),
      segments: [],
    },
    discussions: { available: true, items: discussions },
    drift: { available: true, items: drift },
    diagnostics: { errors: 2, warnings: 1 },
  };
}
