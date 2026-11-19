import { frameMapOf, type FrameMap } from "../../../core/frame-map.ts";
import type {
  AtlasRefreshView,
  AtlasStandingView,
  DocumentView,
  ChangeDetail,
  ChangeDocument,
  ChangedFilesDocument,
  ChangeNotesDocument,
  CheckFactsDocument,
  CommitsDocument,
  FrameMapDocument,
  PicturesDocument,
  SkillLoadsDocument,
  SourceDocument,
  DiffCommit,
  FolderFile,
  ChangeListEntry,
  DiagnosticEntry,
  DiscussionSummary,
  DiscussionView,
  DriftNotice,
  InspectorDocument,
  KnowledgeHome,
  MapLayer,
  Ref,
  WaitingOn,
  PlanDetail,
  PlanListEntry,
  RosterSkill,
  RosterUse,
  SkillKindView,
  SearchDocument,
  SectionView,
  StepSummary,
  PracticeDocument,
  SettingsDocument,
  SkillLoad,
  StripStep,
  SubsystemView,
  VisualView,
  OwedUse,
  OwedView,
} from "../../../core/inspector/documents.ts";
import type { ReceiptRequestView } from "../../../core/inspect.ts";
import { pathOf } from "./addresses.ts";
import {
  CAPTURE,
  CAPTURE_PICTURE,
  DEAL,
  INTERFACE,
  INTERFACE_CHECKS,
  MARKS,
  READ,
} from "./interface-fixtures.ts";
import { CLOSES, NOW_CARDS } from "./desk-fixtures.ts";

/*
 * The catalogue's fixtures: one or more of every artefact kind's shapes,
 * written in the contract's types, so the catalogue renders each component
 * from data alone and a test holds every fixture to its schema. They are
 * specimens, never shown as the repository's own records.
 */

const STEPS = [
  "frame",
  "design",
  "plan",
  "anticipate",
  "build",
  "review",
  "verify",
  "close",
] as const;

function strip(current: string, skipped: readonly string[] = []): readonly StripStep[] {
  const at = STEPS.findIndex((step) => step === current);
  return STEPS.map((step, index) =>
    // The specimens' changes touch no interface, so design holds its one line.
    step === "design"
      ? { step, state: "skipped", current: false, depth: "none, no interface" }
      : {
          step,
          state: skipped.includes(step)
            ? "skipped"
            : step === current
              ? "now"
              : index < at
                ? "written"
                : "not-yet",
          current: step === current,
          depth: skipped.includes(step)
            ? "skipped at regular"
            : step === "review"
              ? "independent, 1 fresh agent"
              : "written",
        },
  );
}

const ID = "2026-10-24-cache-headers";

/** A change's reference as the server names it: its id without its date, humanised. */
function changeRef(id: string, name: string): Ref {
  return { id, name, address: pathOf({ page: "change", id, part: null }) };
}

/** A picture's reference: its title. */
function pictureRef(id: string, title: string): Ref {
  return { id, name: title, address: pathOf({ page: "picture", id }) };
}

/** A discussion's reference: its idea. */
function discussionRef(id: string, idea: string): Ref {
  return { id, name: idea, address: pathOf({ page: "discussion", id }) };
}

/** What a change at its frame waits on: a question of the frame map with its proposed answer. */
const WAITING_ON: WaitingOn = {
  question: "Ten tries a minute, or five?",
  next: "frame: ask the owner the threshold",
  step: "frame",
  askedAt: "2026-10-23T15:40:00.000Z",
  options: ["Ten tries a minute"],
  source: {
    label: "the frame map, question Q2",
    address: pathOf({
      page: "change",
      id: "2026-10-23-login-rate-limit",
      part: "frame-map",
      anchor: "constraints",
    }),
  },
};

/** A change in each state the list shows, and one whose record does not parse. */
export const CHANGE_ROWS: readonly { readonly name: string; readonly change: ChangeListEntry }[] = [
  {
    name: "in progress, at build",
    change: {
      id: ID,
      ref: changeRef(ID, "Cache headers"),
      path: `.greenline/ledger/${ID}.md`,
      state: "in-progress",
      waitingOn: null,
      mode: "regular",
      why: "Serve the static assets with long cache headers",
      next: "build: write the header middleware and its test",
      plan: null,
      ticket: null,
      opened: "2026-10-24",
      ageDays: 0,
      problem: null,
      step: "build",
      strip: strip("build", ["anticipate"]),
      closedAt: null,
      lastAt: "2026-10-24T11:40:00+00:00",
      size: { files: 2, added: 48, removed: 3, installed: 0 },
      commits: 1,
    },
  },
  {
    name: "stopped at verify, a ticket of a plan",
    change: {
      id: "2026-10-23-login-rate-limit",
      ref: changeRef("2026-10-23-login-rate-limit", "Login rate limit"),
      path: ".greenline/ledger/2026-10-23-login-rate-limit.md",
      state: "stopped",
      waitingOn: null,
      mode: "careful",
      why: "Rate-limit the login endpoint",
      next: "verify: the owner's word on the threshold, 5 or 10 tries a minute",
      plan: "007-auth",
      ticket: "T2",
      opened: "2026-10-23",
      ageDays: 1,
      problem: null,
      step: "verify",
      strip: strip("verify"),
      closedAt: null,
      lastAt: "2026-10-23T17:05:00+00:00",
      size: { files: 3, added: 61, removed: 12, installed: 1 },
      commits: 3,
    },
  },
  {
    name: "done",
    change: {
      id: "2026-10-22-search-index",
      ref: changeRef("2026-10-22-search-index", "Search index"),
      path: ".greenline/ledger/2026-10-22-search-index.md",
      state: "done",
      waitingOn: null,
      mode: "regular",
      why: "Add a trigram index to search",
      next: null,
      plan: null,
      ticket: null,
      opened: "2026-10-22",
      ageDays: 2,
      problem: null,
      step: "none",
      strip: strip("close"),
      closedAt: "2026-10-22T16:00:00.000Z",
      lastAt: "2026-10-22T16:00:00.000Z",
      size: { files: 4, added: 130, removed: 22, installed: 0 },
      commits: 4,
    },
  },
  {
    name: "unreadable",
    change: {
      id: "2026-10-20-old-import",
      ref: changeRef("2026-10-20-old-import", "Old import"),
      path: ".greenline/ledger/2026-10-20-old-import.md",
      state: null,
      waitingOn: null,
      mode: null,
      why: null,
      next: null,
      plan: null,
      ticket: null,
      opened: "2026-10-20",
      ageDays: 4,
      problem: "state: expected one of open, stopped, done, dropped",
      step: null,
      strip: [],
      closedAt: null,
      lastAt: null,
      size: null,
      commits: null,
    },
  },
  {
    name: "waiting on the owner at frame",
    change: {
      id: "2026-10-24-session-timeout",
      ref: changeRef("2026-10-24-session-timeout", "Session timeout"),
      path: ".greenline/ledger/2026-10-24-session-timeout.md",
      state: "waiting",
      waitingOn: WAITING_ON,
      mode: "regular",
      why: "Log a session out after an hour idle",
      next: "frame: ask the owner the threshold",
      plan: null,
      ticket: null,
      opened: "2026-10-24",
      ageDays: 0,
      problem: null,
      step: "frame",
      strip: strip("frame"),
      closedAt: null,
      lastAt: null,
      size: { files: 0, added: 0, removed: 0, installed: 0 },
      commits: 0,
    },
  },
];

function section(
  heading: string,
  state: SectionView["state"],
  text: string,
  current = false,
): SectionView {
  return {
    heading,
    kind: "step",
    state,
    depth: heading === "review" ? "independent, 1 fresh agent" : "written",
    text,
    html: state === "written" || (state === "now" && text !== "") ? `<p>${text}</p>` : "",
    rounds: 0,
    current,
    heldBy: null,
  };
}

/** The change's steps whole, as the step document serves each one (J-155 S2). */
export const CHANGE_STEPS: readonly SectionView[] = [
  section(
    "frame",
    "written",
    "Repeat visits re-download every asset; hashed assets are cached for a year.",
  ),
  section("plan", "written", "One middleware, one test per kind of path."),
  { ...section("anticipate", "skipped", "none at regular"), depth: "skipped at regular" },
  section("build", "now", "The middleware sets the header from the path's hash.", true),
  section("review", "not-yet", ""),
  section("verify", "not-yet", ""),
  section("close", "not-yet", ""),
];

/** A step as the change page folds it, its text left to the step document. */
function folded(step: SectionView): StepSummary {
  return {
    heading: step.heading,
    kind: step.kind,
    state: step.state,
    depth: step.depth,
    rounds: step.rounds,
    current: step.current,
    heldBy: step.heldBy,
    line: step.state === "skipped" ? step.text : null,
    written: step.text !== "",
  };
}

/** The change's review report whole, as the file document serves it (J-155 S2). */
export const CHANGE_FILE: FolderFile = {
  file: "review-1.md",
  text: "# Review 1\n\nClean.",
  html: "<h1>Review 1</h1><p>Clean.</p>",
  problem: null,
};

/** One change's page, with its steps, its checks against two commits and the working tree, a report and a brief. */
export const CHANGE_PAGE: ChangeDetail = {
  id: ID,
  path: `.greenline/ledger/${ID}.md`,
  reading: "judged",
  problem: null,
  text: null,
  opened: "2026-10-24",
  ageDays: 0,
  card: {
    mode: "regular",
    choice: "accepted",
    proposed: null,
    why: "Serve the static assets with long cache headers",
    state: "in-progress",
    next: "build: write the header middleware and its test",
    step: "build",
    floors: [],
    raises: [],
    reviewed: null,
    plan: null,
    ticket: null,
    agents: 2,
    rounds: 1,
    starts: null,
    lines: [],
    landing: null,
    rebase: null,
    discard: null,
    stopped: null,
    ground: { kind: "worktree", path: ".worktrees/2026-10-24-cache-headers" },
    agent: "claude-code/opus",
    from: ["2026-10-21-offline-mode"],
    refreshes: [{ by: "explain", pages: "http, map", cost: "one agent, four minutes" }],
  },
  summary: {
    text: "Hashed assets now carry a year's cache header, and the others revalidate.",
    html: "<p>Hashed assets now carry a year's cache header, and the others revalidate.</p>",
    from: "outcome",
  },
  sections: CHANGE_STEPS.map(folded),
  reports: [{ file: "review-1.md", problem: null }],
  briefs: [{ file: "brief-review-1.md", problem: null, step: "review", round: 1, written: true }],
  folder: ["review-1.md", "brief-review-1.md"],
};

/** The change's checks against two commits and the working tree, with what the status says of it: its checks part (J-165 S1). */
export const CHANGE_CHECKS: Pick<
  CheckFactsDocument,
  "checks" | "notes" | "sinceCheck" | "consultations" | "landing"
> = {
  checks: {
    targets: [
      {
        kind: "working-tree",
        hash: null,
        subject: null,
        date: null,
        trailers: [],
        shared: false,
        tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
        runs: [
          {
            file: "20261024T120000000Z-a1.json",
            command: ["make", "test"],
            step: "build",
            outcome: "passed",
            ended: "exit 0",
            startedAt: "2026-10-24T12:00:00.000Z",
            durationMs: 4200,
            commit: "c0ffee1c0ffee1c0ffee1c0ffee1c0ffee1c0ffe",
            tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
            probe: false,
            latest: true,
            verdict: "ran on the final code",
          },
        ],
      },
      {
        kind: "commit",
        hash: "c0ffee1c0ffee1c0ffee1c0ffee1c0ffee1c0ffe",
        subject: "Add the cache header middleware",
        date: "2026-10-24T11:40:00+00:00",
        trailers: [{ key: "Greenline-Change", value: ID }],
        shared: false,
        tree: "9a1b2c39a1b2c39a1b2c39a1b2c39a1b2c39a1b2",
        runs: [
          {
            file: "20261024T114500000Z-b2.json",
            command: ["make", "test"],
            step: "build",
            outcome: "failed",
            ended: "exit 1",
            startedAt: "2026-10-24T11:45:00.000Z",
            durationMs: 3900,
            commit: "c0ffee1c0ffee1c0ffee1c0ffee1c0ffee1c0ffe",
            tree: "9a1b2c39a1b2c39a1b2c39a1b2c39a1b2c39a1b2",
            probe: false,
            latest: false,
            verdict: null,
          },
        ],
      },
    ],
    commitsUnknown: null,
    elsewhere: [],
    problems: [],
    runs: 2,
  },
  notes: [
    { code: "GL0310", severity: "warning", message: "1 commit of code since the last check" },
  ],
  sinceCheck: "1 commit of code since the last check",
  consultations: [],
  landing: null,
};

/** The plan's reference: its folder's name without its number. */
const PLAN_REF: Ref = {
  id: "007-auth",
  name: "Auth",
  address: pathOf({ page: "plan", name: "007-auth", part: null }),
};

/** A plan with its tickets, one done, one ready. */
export const PLAN_PAGE: PlanDetail = {
  name: "007-auth",
  ref: PLAN_REF,
  path: ".greenline/plans/007-auth/",
  mark: "complete",
  hasTickets: true,
  ticketsProblem: null,
  ticketsRefused: false,
  tickets: [
    {
      id: "T1",
      ref: {
        id: "T1",
        name: "T1 Hash the stored passwords with a slow hash",
        address: pathOf({ page: "plan", name: "007-auth", part: "T1" }),
      },
      intent: "Hash the stored passwords with a slow hash",
      scope: ["src/auth/hash.ts"],
      acceptance: ["A stored password never equals its plain text."],
      after: [],
      mode: "regular",
      progress: "done",
      ready: false,
      records: [],
    },
    {
      id: "T2",
      ref: {
        id: "T2",
        name: "T2 Rate-limit the login endpoint",
        address: pathOf({ page: "plan", name: "007-auth", part: "T2" }),
      },
      intent: "Rate-limit the login endpoint",
      scope: ["src/auth/login.ts"],
      acceptance: ["The sixth try in a minute is refused."],
      after: ["T1"],
      mode: "careful",
      progress: "not started",
      ready: true,
      records: [],
    },
  ],
  frontier: ["T2"],
  derived: true,
  documents: [
    {
      file: "spec.md",
      title: "The auth spec",
      status: "settled",
      body: "Text.",
      html: "<p>Text.</p>",
      problem: null,
    },
  ],
  planning: [],
  strays: [],
  notes: [],
  problem: null,
};

/** The plan as the list shows it. */
export const PLAN_ROW: PlanListEntry = {
  name: "007-auth",
  ref: PLAN_REF,
  path: ".greenline/plans/007-auth/",
  tickets: "complete",
  counts: { total: 2, done: 1, inProgress: 0, notStarted: 1 },
  ready: ["T2"],
  documents: [{ file: "spec.md", status: "settled" }],
  planning: [],
  problem: null,
};

/** The decisions book with one root statement. */
export const DECISIONS_HOME: KnowledgeHome = {
  id: "decisions",
  kind: "decisions",
  title: "Decisions book",
  path: ".greenline/DECISIONS.md",
  role: "Settled product and engineering choices, the root statements, and references to their reasons.",
  present: true,
  holds: "2 sections, 1 root statement",
  written: "2026-10-24T11:20:00.000Z",
  text: "# Decisions",
  rendered: {
    heading: "Decisions",
    html: '<h2 data-anchor="search">Search</h2><p>A trigram index over the titles.</p><h2 data-anchor="auth">Auth</h2><p>A slow hash.</p>',
    outline: [
      { level: 2, text: "Search", anchor: "search" },
      { level: 2, text: "Auth", anchor: "auth" },
    ],
  },
  roots: [
    {
      root: ".",
      purpose: "The web app",
      languages: ["typescript"],
      technologies: ["node"],
      decision: "docs/adr/0001-stack.md",
      exclusions: [],
    },
  ],
  problem: null,
};

/** The decision records' home with one record. */
export const RECORDS_HOME: KnowledgeHome = {
  id: "adr",
  kind: "records",
  title: "Decision records",
  path: "docs/adr/",
  role: "Consequential technical reasoning, its alternatives and costs, one record per decision.",
  present: true,
  holds: "1 record",
  written: "2026-10-22T09:00:00.000Z",
  records: [
    {
      file: "0001-stack.md",
      title: "The stack",
      status: "Accepted",
      date: "2026-10-01",
      body: "We use Node.",
      html: "<p>We use Node.</p>",
      problem: null,
    },
  ],
  problem: null,
};

/** A discussion that promoted a change, its frame in the list form (J-118 S4). */
export const DISCUSSION: DiscussionView = {
  id: "2026-10-21-offline-mode",
  ref: discussionRef("2026-10-21-offline-mode", "Let the app work on a train"),
  path: ".greenline/ledger/discussions/2026-10-21-offline-mode.md",
  title: "Let the app work on a train",
  state: "promoted",
  opened: "2026-10-21",
  touched: "2026-10-24",
  decisions: 2,
  promoted: [ID],
  sections: [
    {
      heading: "open questions",
      text: "- How do queued writes sync?",
      html: "<ul><li>How do queued writes sync?</li></ul>",
    },
  ],
  decisionLines: [
    "Q1 Is it for commuters with no signal? yes, reading and queued writes",
    "Q2 Which data must be at hand offline? the last week of items",
  ],
  research: ["frame-research-1.md"],
  map: frameMapOf(
    [
      "### Round 1",
      "",
      "- Q1 [purpose] Is it for commuters with no signal?",
      "  - proposed: yes, reading only",
      "  - answer: yes, reading and queued writes",
      "  - decided: owner",
      "- Q2 [data] Which data must be at hand offline?",
      "  - proposed: the last week of items",
      "  - answer: the last week of items",
      "  - decided: owner",
      "  - research: [the cache limits](2026-10-21-offline-mode/frame-research-1.md)",
      "- closed [security]: nothing new crosses a trust boundary",
    ].join("\n"),
  ),
  restatementHtml: null,
  related: ["2026-10-23-plugins"],
  revisit: null,
  reason: null,
  into: null,
  words: "make the cache headers a change",
};

/** The discussions as a list shows them. */
export const DISCUSSION_ROWS: readonly DiscussionSummary[] = [
  {
    id: DISCUSSION.id,
    ref: DISCUSSION.ref,
    path: DISCUSSION.path,
    title: DISCUSSION.title,
    state: DISCUSSION.state,
    opened: DISCUSSION.opened,
    touched: DISCUSSION.touched,
    decisions: DISCUSSION.decisions,
    promoted: DISCUSSION.promoted,
  },
  {
    id: "2026-10-23-plugins",
    ref: discussionRef("2026-10-23-plugins", "A plugin system"),
    path: ".greenline/ledger/discussions/2026-10-23-plugins.md",
    title: "A plugin system",
    state: "open",
    opened: "2026-10-23",
    touched: null,
    decisions: 0,
    promoted: [],
  },
  {
    id: "2026-10-19-docs-dark",
    ref: discussionRef("2026-10-19-docs-dark", "Dark mode for the docs"),
    path: ".greenline/ledger/discussions/2026-10-19-docs-dark.md",
    title: "Dark mode for the docs",
    state: "parked",
    opened: "2026-10-19",
    touched: "2026-10-20",
    decisions: 0,
    promoted: [],
  },
  {
    id: "2026-10-18-rust",
    ref: discussionRef("2026-10-18-rust", "Rewrite the CLI in Rust"),
    path: ".greenline/ledger/discussions/2026-10-18-rust.md",
    title: "Rewrite the CLI in Rust",
    state: "declined",
    opened: "2026-10-18",
    touched: "2026-10-18",
    decisions: 1,
    promoted: [],
  },
];

/** The Markdown visual among them, a state chart, which the page renders in place. */
export const MARKDOWN_VISUAL: VisualView = {
  id: "2026-10-23-login-rate-limit/login-states",
  ref: pictureRef("2026-10-23-login-rate-limit/login-states", "Login state chart"),
  path: ".greenline/visuals/2026-10-23-login-rate-limit/login-states.md",
  place: "change",
  file: { path: ".greenline/visuals/2026-10-23-login-rate-limit/login-states.md", kind: "md" },
  revision: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  title: "Login state chart",
  form: "state chart",
  skill: "verify-formally",
  change: "2026-10-23-login-rate-limit",
  commit: "1234567123456712345671234567123456712345",
  files: ["src/auth/login.ts"],
  made: "2026-10-23T10:00:00.000Z",
  madeBy: "agent",
  summary: "The login's states and the limit.",
  question: null,
  finish: null,
  scores: null,
  tier: "stale",
  commitsSince: 14,
};

/** A visual in each tier. */
export const VISUALS: readonly VisualView[] = [
  {
    id: "map/architecture",
    ref: pictureRef("map/architecture", "The architecture map"),
    path: ".greenline/visuals/map/architecture.html",
    place: "map",
    file: { path: ".greenline/visuals/map/architecture.html", kind: "html" },
    revision: "0f0e0d0c0b0a09080706050403020100f0e0d0c0b0a090807060504030201000",
    title: "The architecture map",
    form: "map",
    skill: "architecture-map",
    change: "2026-10-20-atlas",
    commit: "4d2e1f04d2e1f04d2e1f04d2e1f04d2e1f04d2e1",
    files: ["src/"],
    made: "2026-10-20",
    madeBy: null,
    summary: "The repository's districts and the calls between them.",
    question: null,
    finish: null,
    scores: null,
    tier: "drifting",
    commitsSince: 3,
  },
  {
    id: `${ID}/request-flow`,
    ref: pictureRef(`${ID}/request-flow`, "Request flow"),
    path: `.greenline/visuals/${ID}/request-flow.svg`,
    place: "change",
    file: { path: `.greenline/visuals/${ID}/request-flow.svg`, kind: "svg" },
    revision: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    title: "Request flow",
    form: "diagram",
    skill: "diagram-design",
    change: ID,
    commit: "9a1b2c39a1b2c39a1b2c39a1b2c39a1b2c39a1b2",
    files: ["src/http/static.ts"],
    made: "2026-10-24T10:00:00.000Z",
    madeBy: "session",
    summary: "How a static asset request passes the middleware.",
    question: "Which middleware does a static asset request pass before it is served?",
    finish: "branded SVG",
    scores: null,
    tier: "fresh",
    commitsSince: 0,
  },
  MARKDOWN_VISUAL,
];

/**
 * The Maps tab's two kinds (J-221 S1), a map and an anatomy figure with the
 * fields the Codex run j201t-visuals kept; each names no picture beside its
 * manifest, so the catalogue loads no raw bytes the fixtures do not hold.
 */
export const MAP_VISUALS: readonly VisualView[] = [
  {
    ...MARKDOWN_VISUAL,
    id: "map/architecture",
    ref: pictureRef("map/architecture", "Shelf and overdue letters"),
    path: ".greenline/visuals/map/architecture.visual.json",
    place: "map",
    file: null,
    form: "map",
    skill: "architecture-map",
    commit: "ad21bebeed31df97485f2dabf1c9d0917d96da3f",
    tier: "drifting",
    commitsSince: 2,
    title: "Shelf and overdue letters",
    change: "2026-11-09-lending-on-map",
    files: ["src/shelf.js", "test/shelf.test.js", "README.md"],
    made: "2026-11-09",
    madeBy: "agent",
    summary: "The shelf, its tests, the lending and return path.",
    question: "How does lending a book work end to end in the available code?",
    finish: "interactive",
  },
  {
    ...MARKDOWN_VISUAL,
    id: "2026-11-09-loan-lifecycle-figure/loan-lifecycle",
    ref: pictureRef("2026-11-09-loan-lifecycle-figure/loan-lifecycle", "Loan lifecycle"),
    path: ".greenline/visuals/2026-11-09-loan-lifecycle-figure/loan-lifecycle.visual.json",
    file: null,
    title: "Loan lifecycle",
    form: "figure",
    skill: "anatomy",
    change: "2026-11-09-loan-lifecycle-figure",
    files: ["src/shelf.js"],
    made: "2026-11-09",
    summary: "A desk fixture illustrates opening and returning a loan.",
    question: "How does a loan open, become due or overdue, and close when returned?",
    finish: "interactive",
    tier: "fresh",
    commitsSince: 0,
  },
];

/** A Markdown visual as the server's house renderer draws it. */
export const VISUAL_HTML: string =
  "<p>The login is <code>open</code>, then <code>limited</code> after five failures in a minute, then <code>open</code> again once the minute passes.</p><pre><code>open --5 failures--&gt; limited --1 minute--&gt; open</code></pre>";

/** A subsystem's page in the explain form, as the server renders it. */
export const SUBSYSTEM_HTML: string =
  "<h2>Overview</h2><p>The HTTP layer hands each request to its handler.</p><h2>How it works</h2><p><code>src/http/server.ts</code> reads the request, runs the middleware in order and writes the answer.</p>";

/** The map's bands. */
export const MAP: readonly MapLayer[] = [
  { name: "edge", subsystems: [{ name: "cli", tier: "fresh" }] },
  {
    name: "shell",
    subsystems: [
      { name: "http", tier: "drifting" },
      { name: "auth", tier: "fresh" },
    ],
  },
  { name: "core", subsystems: [{ name: "search", tier: "fresh" }] },
];

/** One subsystem page. */
export const SUBSYSTEM: SubsystemView = {
  name: "http",
  title: "The HTTP layer",
  page: ".greenline/visuals/subsystems/http.md",
  layer: "shell",
  summary:
    "The HTTP layer hands each request to its handler, applies the middleware in order and writes the answer.",
  files: ["src/http/server.ts", "src/http/static.ts"],
  commit: "4d2e1f04d2e1f04d2e1f04d2e1f04d2e1f04d2e1",
  tier: "drifting",
  journeys: [
    {
      id: "subsystems/http/static",
      title: "A static asset request",
      path: ".greenline/visuals/subsystems/http/static.html",
      tier: "fresh",
    },
    {
      id: "subsystems/http/login",
      title: "A login attempt",
      path: ".greenline/visuals/subsystems/http/login.html",
      tier: "stale",
    },
  ],
  calls: ["auth", "search"],
  calledBy: ["cli"],
};

/** The atlas's standing with three pages and the map behind (J-147 S5). */
const ATLAS_STANDING: AtlasStandingView = {
  pages: 3,
  major: null,
  mapBehind: 2,
};

/** The atlas's standing before any page (J-147 S5). */
export const EMPTY_STANDING: AtlasStandingView = {
  pages: 0,
  major: null,
  mapBehind: null,
};

/** One indexed document the owner wrote, drifting (J-147 S5). */
export const DOCUMENT: DocumentView = {
  path: "README.md",
  author: "owner",
  files: ["src/http/", "src/cache.ts"],
  commit: "0123abc",
  change: null,
  tier: "drifting",
  commitsSince: 2,
};

/** The indexed documents: the owner's README and a page the practice keeps (J-147 S5). */
export const DOCUMENTS: readonly DocumentView[] = [
  DOCUMENT,
  {
    path: "docs/cache.md",
    author: "practice",
    files: ["src/cache.ts"],
    commit: "0123abc",
    change: ID,
    tier: "fresh",
    commitsSince: 0,
  },
];

/** A document's text, rendered. */
export const DOCUMENT_HTML =
  "<h1>cache-headers</h1><p>Serves the assets with long cache headers.</p>";

/** The skills the change owes, one loaded and one not (J-176 S1). */
export const OWED: readonly OwedView[] = [
  { skill: "tdd", read: "part", why: "a test file touched", loaded: true },
  { skill: "show-me", read: "part", why: "the request says diagram", loaded: false },
];

/** The skills the changes owed, owed against loaded (J-176 S1). */
const OWED_USE: readonly OwedUse[] = [
  { skill: "tdd", owed: 3, loaded: 3 },
  { skill: "show-me", owed: 2, loaded: 1 },
];

/** The refreshes the atlas's index records (J-147 S5). */
export const ATLAS_REFRESHES: readonly AtlasRefreshView[] = [
  { change: ID, whole: false, pages: ["http"], cost: "one agent, four minutes" },
];

/** The drift notices. */
export const DRIFT: readonly DriftNotice[] = [
  {
    kind: "visual",
    id: "2026-10-23-login-rate-limit/login-states",
    title: "Login state chart",
    tier: "stale",
    detail: "14 commits since",
  },
  { kind: "subsystem", id: "http", title: "http", tier: "drifting", detail: "3 files changed" },
];

/** A careful frame's map (J-117 S4): three nodes open, two closed, research off one question. */
export const FRAME_MAP: FrameMap = frameMapOf(
  [
    "### Round 1",
    "",
    "- Q1 [purpose] Is the aim that repeat visits load fast?",
    "  - proposed: yes, repeat visits only",
    "  - answer: yes, repeat visits only",
    "  - decided: owner",
    "- Q2 [scope] Which responses take the headers?",
    "  - proposed: static assets only",
    "  - answer: static assets only",
    "  - decided: owner",
    "- Q3 [behaviour] How long do hashed assets live?",
    "  - proposed: a year, immutable",
    "  - answer: a year, immutable",
    "  - decided: agent",
    `  - research: [the cache rules](${ID}/frame-research-1.md)`,
    "- Q4 [behaviour] Is the HTML ever cached?",
    "  - proposed: never",
    "- closed [security]: no secret is served",
    "- closed [operations]: the headers ship with the app",
    "",
    "Repeat visits load fast: hashed assets are cached for a year and the HTML never.",
  ].join("\n"),
);

/** Skill loads on a change. */
export const LOADS: readonly SkillLoad[] = [
  {
    skill: "frame",
    file: "SKILL.md",
    whole: true,
    via: "Skill",
    at: "2026-10-24T09:00:00.000Z",
    step: null,
    agent: null,
  },
  {
    skill: "tdd",
    file: "SKILL.md",
    whole: false,
    via: "Read",
    at: "2026-10-24T11:00:00.000Z",
    step: "build",
    agent: null,
  },
  {
    skill: "review",
    file: "references/greenline.md",
    whole: true,
    via: "cat",
    at: "2026-10-24T12:00:00.000Z",
    step: "review",
    agent: "a41c9e",
  },
];

/** The roster as installed. */
export const ROSTER_SKILLS: readonly RosterSkill[] = [
  {
    name: "frame",
    ref: { id: "frame", name: "frame", address: pathOf({ page: "roster", skill: "frame" }) },
    kind: "step",
    slot: "frame",
    installed: true,
    extra: false,
    description: "Frames the request before any plan.",
    activation: "implicit",
  },
  {
    name: "review",
    ref: { id: "review", name: "review", address: pathOf({ page: "roster", skill: "review" }) },
    kind: "step",
    slot: "review",
    installed: true,
    extra: false,
    description: "Reads the change as a reviewer would.",
    activation: "implicit",
  },
  {
    name: "build",
    ref: { id: "build", name: "build", address: pathOf({ page: "roster", skill: "build" }) },
    kind: "step",
    slot: "build",
    installed: true,
    extra: false,
    description: "Builds the change test first.",
    activation: "implicit",
  },
  {
    name: "verify",
    ref: { id: "verify", name: "verify", address: pathOf({ page: "roster", skill: "verify" }) },
    kind: "step",
    slot: "verify",
    installed: true,
    extra: false,
    description: "Checks the change against what was asked.",
    activation: "implicit",
  },
  {
    name: "plan",
    ref: { id: "plan", name: "plan", address: pathOf({ page: "roster", skill: "plan" }) },
    kind: "step",
    slot: "plan",
    installed: false,
    extra: true,
    description: "Orders the work into steps.",
    activation: "implicit",
  },
];

/** The step kind with its sentence, the kind the specimens' skills are of, as the modes declare it (J-165 S1). */
const ROSTER_KINDS: readonly SkillKindView[] = [
  {
    name: "step",
    when: "A step runs where the change's mode reaches it on the line, at the depth the mode gives it, and the agent never chooses it.",
  },
];

/** A skill for the skill document's specimen where the roster holds none. */
const FALLBACK_SKILL: RosterSkill = {
  name: "frame",
  ref: { id: "frame", name: "frame", address: pathOf({ page: "roster", skill: "frame" }) },
  kind: "step",
  slot: "frame",
  installed: true,
  extra: false,
  description: "Frames the request before any plan.",
  activation: "implicit",
};

/** The roster's use across the changes. */
export const ROSTER_USE: readonly RosterUse[] = [
  {
    skill: "frame",
    loads: 14,
    whole: 14,
    part: 0,
    steps: ["before the record", "frame", "plan"],
    agents: ["claude-code/opus", "codex/gpt-6.1-sol"],
    changes: 9,
    byStep: [
      { name: "before the record", loads: 9 },
      { name: "frame", loads: 4 },
      { name: "plan", loads: 1 },
    ],
    byAgent: [
      { name: "claude-code/opus", loads: 10 },
      { name: "codex/gpt-6.1-sol", loads: 4 },
    ],
    outside: 1,
    firstAt: "2026-10-18T09:00:00.000Z",
    lastAt: "2026-10-24T09:10:00.000Z",
  },
  {
    skill: "review",
    loads: 9,
    whole: 3,
    part: 6,
    steps: ["review"],
    agents: ["claude-code/opus"],
    changes: 4,
    byStep: [{ name: "review", loads: 9 }],
    byAgent: [{ name: "claude-code/opus", loads: 9 }],
    outside: 0,
    firstAt: "2026-10-19T14:00:00.000Z",
    lastAt: "2026-10-24T12:00:00.000Z",
  },
  {
    skill: "build",
    loads: 6,
    whole: 2,
    part: 4,
    steps: ["build"],
    agents: ["not stated"],
    changes: 3,
    byStep: [{ name: "build", loads: 6 }],
    byAgent: [{ name: "not stated", loads: 6 }],
    outside: 0,
    firstAt: "2026-10-20T10:00:00.000Z",
    lastAt: "2026-10-24T11:00:00.000Z",
  },
];

/** A diagnostic of each severity. */
export const DIAGNOSTICS: readonly DiagnosticEntry[] = [
  {
    code: "GL0201",
    severity: "error",
    message: "The change record names a step the modes do not hold.",
    path: ".greenline/ledger/2026-10-20-old-import.md",
  },
  {
    code: "GL0125",
    severity: "warning",
    message: "The connector garden is enabled but its executable is not on PATH.",
  },
];

/** One receipt with one call. */
export const RECEIPTS: readonly ReceiptRequestView[] = [
  {
    id: "r-0001",
    source: "garden",
    binding: "publication 2026.10",
    owner: `change ${ID}`,
    createdAt: "2026-10-24T09:30:00.000Z",
    calls: [
      {
        sequence: 1,
        operation: "search",
        outcome: "received",
        full: [{ id: "caching-headers", revision: "abcdef0123456789" }],
        metadata: ["etag-basics"],
        error: null,
        startedAt: "2026-10-24T09:30:00.000Z",
        finishedAt: "2026-10-24T09:30:01.000Z",
      },
    ],
    advisories: 0,
  },
];

/** The settings as a workspace holds them. */
export const SETTINGS: SettingsDocument = {
  schema: "greenline.inspect/v2",
  read: READ,
  kind: "settings",
  manifest: {
    schemaVersion: 6,
    targets: ["claude-code"],
    skills: { include: [], exclude: [] },
    connectors: {},
    proceed: "quick",
    trials: [],
    checks: [{ name: "test", command: "make test", dir: "." }],
    hooks: { git: true, adapters: true },
  },
  installation: "0".repeat(64),
  revisions: { manifest: "1".repeat(64), decisions: "2".repeat(64), agents: "3".repeat(64) },
  cliVersion: "0.0.0",
  roots: [],
  decisions: "# Decisions\n",
  policyChanges: [
    {
      path: ".greenline/DECISIONS.md",
      before: "a".repeat(64),
      after: "b".repeat(64),
      at: "2026-10-22T10:14:00.000Z",
    },
  ],
  houseRulings: {
    stanza: "- Every endpoint has a rate limit.",
    rulings: ["Every endpoint has a rate limit."],
  },
  files: [{ folder: ".", files: [{ name: "AGENTS.md", size: 9 }] }],
  unreadable: [],
  changes: {
    baseline: "a41c9e27f0b1a41c9e27f0b1a41c9e27f0b1a41c",
    files: [
      {
        path: "AGENTS.md",
        diff: [
          { kind: "same", line: "# Agents" },
          { kind: "add", line: "- Every endpoint has a rate limit." },
        ],
      },
    ],
    unavailable: [],
  },
  settings: { proceed: ["none", "quick", "regular", "careful"], trials: [] },
  skills: [
    { name: "frame", installed: true, extra: false },
    { name: "product-description", installed: false, extra: true },
  ],
};

/** The practice: the health grouped, the hooks, the version and the receipts. */
export const PRACTICE: PracticeDocument = {
  schema: "greenline.inspect/v2",
  read: READ,
  kind: "practice",
  health: {
    errors: 1,
    warnings: 1,
    groups: [
      {
        kind: "error",
        code: "GL0201",
        count: 1,
        text: DIAGNOSTICS[0]?.message ?? "",
        address: pathOf({ page: "change", id: "2026-10-20-old-import", part: null }),
        findings: [{ path: ".greenline/ledger/2026-10-20-old-import.md" }],
      },
      {
        kind: "warning",
        code: "GL0125",
        count: 1,
        text: DIAGNOSTICS[1]?.message ?? "",
        address: null,
        findings: [{}],
      },
    ],
    source: { label: "greenline status", address: pathOf({ page: "practice" }) },
  },
  hooks: {
    settings: { git: true, adapters: true },
    git: { state: "config" },
    checks: [{ name: "test", command: "make test", dir: "." }],
    adapters: ["claude-code"],
  },
  version: "0.0.0",
  receipts: RECEIPTS,
  problems: [],
  connector: true,
};

const SCHEMA = "greenline.inspect/v2";

/** The specimen of what changed: no commit, no file. */
const NO_FILES = {
  groups: [],
  totals: { files: 0, added: 0, removed: 0 },
  installed: 0,
  unknown: null,
} as const;

/** The change's reference in the specimens. */
function changeRefOf(): Ref {
  return (
    CHANGE_ROWS[0]?.change.ref ?? {
      id: ID,
      name: "Cache headers",
      address: pathOf({ page: "change", id: ID, part: null }),
    }
  );
}

/** A step for the step document's specimen where the list holds none. */
const CHANGE_STEPS_FALLBACK: SectionView = section("frame", "written", "The frame.");

/** One commit's lines to one file, the diff document's specimen. */
export const DIFF_COMMIT: DiffCommit = {
  hash: "9f2c1e7d4b3a29c8e6f0a1b2c3d4e5f60718293a",
  subject: "feat(http): set the cache header from the path's hash",
  date: "2026-10-24T10:00:00.000Z",
  lines: [
    {
      kind: "same",
      line: "export function cacheHeader(path: string): string {",
      oldLine: 12,
      newLine: 12,
    },
    { kind: "del", line: '  return "no-cache";', oldLine: 13, newLine: null },
    {
      kind: "add",
      line: '  return hashed(path) ? "max-age=31536000, immutable" : "no-cache";',
      oldLine: null,
      newLine: 13,
    },
    { kind: "same", line: "}", oldLine: 14, newLine: 14 },
  ],
};

/**
 * The change page's head in the specimens (J-165 S1): the change, its state and its strip.
 * @returns the document
 */
export function changeDocumentSpecimen(): ChangeDocument {
  const envelope = { schema: SCHEMA, read: READ } as const;
  return {
    ...envelope,
    kind: "change",
    ref: CHANGE_ROWS[0]?.change.ref ?? {
      id: ID,
      name: "Cache headers",
      address: pathOf({ page: "change", id: ID, part: null }),
    },
    state: "in-progress",
    waitingOn: null,
    strip: CHANGE_ROWS[0]?.change.strip ?? [],
    change: CHANGE_PAGE,
  };
}

/** The change page's parts in the specimens, each its own document, as the page reads them and beside them its notes and its source (J-165 S1). */
export interface ChangePartSpecimens {
  readonly changed: ChangedFilesDocument;
  readonly checks: CheckFactsDocument;
  readonly commits: CommitsDocument;
  readonly frame: FrameMapDocument;
  readonly pictures: PicturesDocument;
  readonly loads: SkillLoadsDocument;
  readonly notes: ChangeNotesDocument;
  readonly source: SourceDocument;
}

/**
 * The change page's parts in the specimens, each its own document (J-165 S1):
 * its files, its checks, its commits, its frame map, its pictures and its loads.
 * @returns the parts
 */
export function changePartsSpecimen(): ChangePartSpecimens {
  const envelope = { schema: SCHEMA, read: READ } as const;
  return {
    changed: {
      ...envelope,
      kind: "changed-files",
      change: ID,
      changedFiles: NOW_CARDS[0]?.change.changedFiles ?? NO_FILES,
    },
    checks: { ...envelope, kind: "check-facts", change: ID, ...CHANGE_CHECKS },
    commits: {
      ...envelope,
      kind: "commits",
      change: ID,
      commits: CHANGE_CHECKS.checks.targets.flatMap((target) =>
        target.hash === null
          ? []
          : [
              {
                hash: target.hash,
                subject: target.subject,
                date: target.date,
                shared: target.shared,
                trailers: target.trailers,
              },
            ],
      ),
      unknown: null,
    },
    frame: {
      ...envelope,
      kind: "frame-map",
      change: ID,
      source: "file",
      map: FRAME_MAP,
      reason: null,
      restatementHtml: null,
      confirmed: null,
    },
    pictures: {
      ...envelope,
      kind: "pictures",
      pictures: { available: true, items: VISUALS.filter((visual) => visual.change === ID) },
    },
    loads: {
      ...envelope,
      kind: "skill-loads",
      change: ID,
      loads: { available: true, items: LOADS },
      owed: OWED,
    },
    notes: { ...envelope, kind: "notes", change: ID, notes: { ...MARKS, notes: [] } },
    source: {
      ...envelope,
      kind: "source",
      change: changeRefOf(),
      path: `.greenline/ledger/${ID}.md`,
      text: "---\nmode: regular\nstate: open\n---\n\n## frame\n\nRepeat visits re-download every asset.\n",
      at: "2026-10-24T12:00:00.000Z",
      problem: null,
    },
  };
}

/**
 * The names of every record the fixtures refer to, as the server reads them
 * (J-158 S2): a change's id without its date, humanised; a plan's folder
 * without its number; a discussion's idea; a picture's title; a note's words.
 */
export const NAMES: SearchDocument = {
  schema: SCHEMA,
  kind: "search",
  read: READ,
  entries: [
    ...(
      [
        [ID, "Cache headers", "in-progress", "2026-10-24"],
        ["2026-10-23-login-rate-limit", "Login rate limit", "stopped", "2026-10-23"],
        ["2026-10-22-search-index", "Search index", "done", "2026-10-22"],
        ["2026-10-20-old-import", "Old import", "dropped", "2026-10-20"],
        ["2026-10-20-atlas", "Atlas", "done", "2026-10-20"],
        ["2026-10-26-plans-page", "Plans page", "done", "2026-10-26"],
        ["2026-10-24-session-timeout", "Session timeout", "waiting", "2026-10-24"],
        ["2026-10-25-pricing-table", "Pricing table", "done", "2026-10-25"],
      ] as const
    ).map(([id, name, state, at]) => ({
      kind: "change" as const,
      id,
      name,
      address: `/changes/${id}`,
      where: "Changes",
      state,
      at,
    })),
    {
      kind: "plan",
      id: "007-auth",
      name: "Auth",
      address: "/plans/007-auth",
      where: "Plans",
      state: null,
      at: null,
    },
    ...(
      [
        ["2026-10-21-offline-mode", "Let the app work on a train", "open"],
        ["2026-10-23-plugins", "A plugin system", "parked"],
        ["2026-10-19-docs-dark", "Dark mode for the docs", "declined"],
        ["2026-10-18-rust", "Rewrite the CLI in Rust", "declined"],
      ] as const
    ).map(([id, name, state]) => ({
      kind: "discussion" as const,
      id,
      name,
      address: `/discussions/${id}`,
      where: "Discussions",
      state,
      at: id.slice(0, 10),
    })),
    {
      kind: "picture",
      id: "2026-10-23-login-rate-limit/login-states",
      name: "Login state chart",
      address: "/pictures/2026-10-23-login-rate-limit/login-states",
      where: "Pictures",
      state: "fresh",
      at: "2026-10-23T14:00:00.000Z",
    },
    {
      kind: "note",
      id: "m3f9a2c1",
      name: "The call to action sits below the fold on a phone.",
      address: "/interface/notes/m3f9a2c1",
      where: "Your notes",
      state: "addressed",
      at: "2026-10-26T09:30:00.000Z",
    },
  ],
};

/**
 * Every fixture inside a document of the contract, so a test holds each one to its schema.
 * @returns the documents
 */
export function fixtureDocuments(): readonly InspectorDocument[] {
  const envelope = { schema: SCHEMA, read: READ } as const;
  const rows = CHANGE_ROWS.map((row) => row.change);
  return [
    NAMES,
    {
      ...envelope,
      kind: "changes",
      changes: rows,
      unavailable: null,
      counts: {
        waiting: 1,
        inProgress: 1,
        stopped: 1,
        done: 1,
        dropped: 0,
        proposed: 0,
        unreadable: 1,
      },
      plans: 1,
      discussions: DISCUSSION_ROWS.length,
    },
    {
      ...envelope,
      kind: "desk",
      summary: {
        waiting: 1,
        inProgress: NOW_CARDS.length,
        closedToday: 0,
        lastCloseAt: "2026-10-22T16:00:00.000Z",
        source: { label: "the change records", address: pathOf({ page: "changes" }) },
      },
      since: {
        at: "2026-10-23T18:00:00.000Z",
        commits: 2,
        changes: rows.slice(0, 1).map((row) => ({ change: row.ref, happened: "steps written" })),
        pictures: 1,
        changedFiles: NOW_CARDS[0]?.change.changedFiles ?? NO_FILES,
      },
      waiting: rows.flatMap((row) =>
        row.waitingOn === null ? [] : [{ change: row.ref, ...row.waitingOn }],
      ),
      inProgress: NOW_CARDS.map((card) => card.change),
      unavailable: null,
      lastClose: CLOSES[0]?.close ?? null,
      closes: CLOSES.map((close) => close.close),
      care: [
        {
          kind: "errors",
          count: 1,
          text: "1 error from greenline status",
          address: pathOf({ page: "practice" }),
          source: {
            label: "greenline status",
            address: pathOf({ page: "practice" }),
          },
        },
      ],
      today: {
        commits: 0,
        first: null,
        last: null,
        commitsPerHour: Array.from({ length: 24 }, () => 0),
        segments: [],
      },
      discussions: { available: true, items: DISCUSSION_ROWS },
      drift: { available: true, items: DRIFT },
      diagnostics: { errors: 1, warnings: 1 },
    },
    changeDocumentSpecimen(),
    ...Object.values(changePartsSpecimen()),
    {
      ...envelope,
      kind: "step",
      change: changeRefOf(),
      section: CHANGE_STEPS[0] ?? CHANGE_STEPS_FALLBACK,
    },
    { ...envelope, kind: "file", change: changeRefOf(), file: CHANGE_FILE },
    {
      ...envelope,
      kind: "diff",
      change: changeRefOf(),
      path: "src/http/cache.ts",
      commits: [DIFF_COMMIT],
      net: {
        from: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
        to: DIFF_COMMIT.hash,
        lines: DIFF_COMMIT.lines,
      },
      unknown: null,
    },
    { ...envelope, kind: "plan", plan: PLAN_PAGE },
    { ...envelope, kind: "plans", plans: [PLAN_ROW], unavailable: null, derived: true },
    { ...envelope, kind: "home", home: DECISIONS_HOME },
    { ...envelope, kind: "home", home: RECORDS_HOME },
    { ...envelope, kind: "discussion", discussion: DISCUSSION },
    { ...envelope, kind: "pictures", pictures: { available: true, items: VISUALS } },
    {
      ...envelope,
      kind: "picture",
      picture: MARKDOWN_VISUAL,
      html: VISUAL_HTML,
      capture: null,
      notes: { ...MARKS, notes: [] },
    },
    {
      ...envelope,
      kind: "picture",
      picture: CAPTURE_PICTURE,
      html: null,
      capture: CAPTURE.capture,
      notes: MARKS,
    },
    { ...envelope, kind: "subsystem", subsystem: SUBSYSTEM, html: SUBSYSTEM_HTML },
    {
      ...envelope,
      kind: "atlas",
      map: { available: true, items: MAP },
      subsystems: { available: true, items: [SUBSYSTEM] },
      standing: ATLAS_STANDING,
      documents: { available: true, items: DOCUMENTS },
      refreshes: ATLAS_REFRESHES,
    },
    { ...envelope, kind: "document", document: DOCUMENTS[0] ?? DOCUMENT, html: DOCUMENT_HTML },
    {
      ...envelope,
      kind: "skill-loads",
      change: ID,
      loads: { available: true, items: LOADS },
      owed: OWED,
    },
    {
      ...envelope,
      kind: "frame-map",
      change: ID,
      source: "file",
      map: FRAME_MAP,
      reason: null,
      restatementHtml: "<p>Repeat visits re-download every asset.</p>",
      confirmed: null,
    },
    {
      ...envelope,
      kind: "roster",
      kinds: ROSTER_KINDS,
      skills: ROSTER_SKILLS,
      use: { available: true, items: ROSTER_USE },
      neverRead: ["verify"],
      owed: OWED_USE,
    },
    {
      ...envelope,
      kind: "skill",
      skill: ROSTER_SKILLS[0] ?? FALLBACK_SKILL,
      skillKind: ROSTER_KINDS[0] ?? null,
      use: ROSTER_USE[0] ?? null,
      changes: [{ change: changeRefOf(), loads: 2, steps: ["frame"] }],
      loads: LOADS.map((load) => ({ ...load, change: ID })),
    },
    PRACTICE,
    {
      ...envelope,
      kind: "installed-file",
      path: "AGENTS.md",
      size: 9,
      content: "# Agents\n",
      problem: null,
    },
    SETTINGS,
    INTERFACE,
    ...MARKS.notes
      .slice(0, 1)
      .map((note) => ({ ...envelope, kind: "mark" as const, note, revision: MARKS.revision })),
    DEAL,
    INTERFACE_CHECKS,
  ];
}

/** The roster as its document carries it, the kinds, the skills and their use (J-166 S1). */
export const ROSTER_DOCUMENT: Extract<InspectorDocument, { readonly kind: "roster" }> = {
  schema: SCHEMA,
  read: READ,
  kind: "roster",
  kinds: ROSTER_KINDS,
  skills: ROSTER_SKILLS,
  use: { available: true, items: ROSTER_USE },
  neverRead: ["verify"],
  owed: OWED_USE,
};

/** One skill's page as its document carries it (J-166 S1). */
export const SKILL_DOCUMENT: Extract<InspectorDocument, { readonly kind: "skill" }> = {
  schema: SCHEMA,
  read: READ,
  kind: "skill",
  skill: ROSTER_SKILLS[0] ?? FALLBACK_SKILL,
  skillKind: ROSTER_KINDS[0] ?? null,
  use: ROSTER_USE[0] ?? null,
  changes: [{ change: changeRefOf(), loads: 2, steps: ["frame"] }],
  loads: LOADS.map((load) => ({ ...load, change: ID })),
};
