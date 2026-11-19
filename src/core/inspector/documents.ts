import type { TicketProgress } from "../plan-documents.ts";
import type { RootStatement } from "../root-statements.ts";
import type { HooksReport } from "../adapters.ts";
import type { DiffLine, ReceiptRequestView } from "../inspect.ts";
import type { HookSettings, Manifest } from "../manifest.ts";
import type { FrameMap } from "../frame-map.ts";
import type { InterfaceCheckFact } from "../interface-check.ts";
import type { DesignPick } from "../design-pick.ts";
import type { Box, BoxedElement } from "../interface-boxes.ts";
import type { Mark } from "../marks.ts";

/*
 * The documents the inspector's readers build, as the contract serves
 * them: a change and its steps, check facts and commits; a plan with its
 * tickets; a knowledge home; the settings; and the kinds a later version's
 * homes fill. The shell's readers fill them from the same readers
 * `greenline status` uses; the client app reads them as types only, and
 * `schemas.ts` holds each one's schema.
 */

/**
 * A reference to a change, a plan, a ticket, a discussion, a picture, a
 * note or a skill: its id, the name the server gives it and the page's
 * address. The name is a change's id without its date, humanised, a plan's
 * folder name without its number, a picture's title, a note's words; the
 * client shows the name and keeps the id for the address.
 */
export interface Ref {
  readonly id: string;
  readonly name: string;
  /** The page's path in the app, such as `/changes/<id>`. */
  readonly address: string;
}

/** When a document was read, and the revision of the state it read: the ledger folder with git's HEAD and index, the cache's key. */
export interface Read {
  readonly at: string;
  readonly revision: string;
}

/** Where a summary the inspector composes was read from, and the page that shows it. */
export interface Source {
  readonly label: string;
  /** The page's path in the app; null where no page shows it. */
  readonly address: string | null;
}

/**
 * A change's state in the contract's one vocabulary: `waiting`, an open
 * change whose next word is the owner's; `in-progress`, any other open
 * change; `proposed`, a record whose choice line the owner has not given;
 * then `stopped`, `done` and `dropped` as the record states them. Where a
 * field holds it, null stands for a record whose form does not parse.
 */
export type ChangeState = "waiting" | "in-progress" | "stopped" | "done" | "dropped" | "proposed";

/**
 * A step's state in the contract's one vocabulary: its section written,
 * the step the change is at now, not yet written, skipped by the mode, or
 * held in the other record of a plan's split.
 */
export type StepState = "written" | "now" | "not-yet" | "skipped" | "in-plan";

/**
 * What a change waits on from the owner (J-154 S3): the question or the act
 * the owner's next word decides, read from the change's own facts in this
 * order: a frame question with neither an answer nor a decider, the deal's
 * pick while the design waits for one, and the record's "next" line where
 * its action waits on the owner's word. Null where nothing waits.
 */
export interface WaitingOn {
  /** The question, or the act, in the record's or the frame map's own words. */
  readonly question: string;
  /** The record's "next" line; null where it states none. */
  readonly next: string | null;
  /** The step the change waits at; null where none is read. */
  readonly step: string | null;
  /** The turn it was asked at: the latest turn's end the change's raw log holds, else the record's last write. */
  readonly askedAt: string | null;
  /** The answers offered, where the question names them: the frame's proposed answer, the deal's directions. */
  readonly options: readonly string[] | null;
  readonly source: Source;
}

/** One file a change's commits touched, with its lines added and removed; null for a binary file. */
export interface ChangedFile {
  readonly path: string;
  readonly added: number | null;
  readonly removed: number | null;
}

/**
 * The files a set of commits touched (J-154 S3), grouped by folder with
 * their counts, the files under the trees the installation writes, such as
 * `.agents/`, `.claude/` and `.greenline/`, counted apart and not listed.
 */
export interface ChangedFiles {
  readonly groups: readonly {
    readonly folder: string;
    readonly count: number;
    readonly files: readonly ChangedFile[];
  }[];
  readonly totals: { readonly files: number; readonly added: number; readonly removed: number };
  readonly installed: number;
  /** Why the commits' files cannot be read; null when they can. */
  readonly unknown: string | null;
}

/** One change as the list shows it. */
export interface ChangeListEntry {
  readonly id: string;
  readonly ref: Ref;
  readonly path: string;
  readonly state: ChangeState | null;
  /** What the change waits on from the owner; null where nothing waits. */
  readonly waitingOn: WaitingOn | null;
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
  /** The step the status derivations read as reached; null when the record is not judged. */
  readonly step: string | null;
  /** Each step of the line with how its section stands, in the line's order: the step strip's words. */
  readonly strip: readonly StripStep[];
  /** A finished change's last commit's time; null for an open change, or one whose commits cannot be listed or hold none (J-165 S1). */
  readonly closedAt: string | null;
  /** Its last commit's time, open or finished; null where its commits cannot be listed or hold none (J-165 S1). */
  readonly lastAt: string | null;
  /** The files its commits touched, counted; null where its commits cannot be listed (J-165 S1). */
  readonly size: ChangeSize | null;
  /** How many commits it holds; null when they cannot be listed (J-165 S1). */
  readonly commits: number | null;
}

/** A change's size: the files its commits touched with their lines, the installation's own counted apart (J-165 S1). */
export interface ChangeSize {
  readonly files: number;
  readonly added: number;
  readonly removed: number;
  /** The files under the trees the installation writes, counted apart and not in `files`. */
  readonly installed: number;
}

/** One station of the step strip: a step of the line, its section's state and whether it is the step reached. */
export interface StripStep {
  readonly step: string;
  readonly state: StepState;
  readonly current: boolean;
  /** The depth the record's mode gives the step, in words; null when the mode is unknown. */
  readonly depth: string | null;
}

/** How many changes stand in each state. */
export interface StateCounts {
  readonly waiting: number;
  readonly inProgress: number;
  readonly stopped: number;
  readonly done: number;
  readonly dropped: number;
  readonly proposed: number;
  /** The records whose form does not parse. */
  readonly unreadable: number;
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
  /** The owner's words for throwing the change's work away; null when the record holds none (J-114). */
  readonly discard: string | null;
  /** The owner's words that stopped the change; null when the record holds none (J-200 S1). */
  readonly stopped: string | null;
  /** Where the change's work goes, as its `ground` line states it; null when it states none. */
  readonly ground: GroundCard | null;
  /** The harness and the model that do the work, `<harness>/<model>`, as its `agent` line states them; null when it states none. */
  readonly agent: string | null;
  /** The discussions it was promoted from, as its `from` line names them; none when it names none (J-118 S4). */
  readonly from: readonly string[];
  /** The close's refreshes of the pages the change touched, each with its pages and cost (J-147 S5). */
  readonly refreshes: readonly RefreshView[];
}

/** One refresh the close made, its method's agent named apart (J-147 S5). */
export interface RefreshView {
  readonly by: string;
  readonly pages: string;
  readonly cost: string;
}

/** A record's ground as the card shows it: a branch in place, or a worktree of its own at a path from the root. */
export type GroundCard =
  | { readonly kind: "branch" }
  | { readonly kind: "worktree"; readonly path: string };

/** One section of the body, in the line's order. */
export interface SectionView {
  readonly heading: string;
  /** A step of the line, a kind's own section (a start's), or a heading the modes do not name. */
  readonly kind: "step" | "kind" | "other";
  /** A step's state; a section outside the steps is `written` or `not-yet`. The step the change is at reads `now`, written so far or not. */
  readonly state: StepState;
  /** The depth the record's mode gives the step, in words; null outside the steps or when the mode is unknown. */
  readonly depth: string | null;
  readonly text: string;
  /** The text rendered by the house Markdown renderer, every byte escaped and every link resolved to a page address; empty when the section is not written. */
  readonly html: string;
  /** The third-level headings it holds, which count a looped step's rounds. */
  readonly rounds: number;
  /** Whether this is the step the change has reached. */
  readonly current: boolean;
  /** For a step the work's split gives the other record, which one holds it: the planning record or the tickets' records; null otherwise. */
  readonly heldBy: "plan" | "ticket" | null;
}

/**
 * One section as the change page folds it (J-155 S2): its heading, state,
 * depth and rounds, with no text; the step document carries the text, read
 * when the fold opens.
 */
export interface StepSummary {
  readonly heading: string;
  readonly kind: "step" | "kind" | "other";
  readonly state: StepState;
  readonly depth: string | null;
  readonly rounds: number;
  readonly current: boolean;
  readonly heldBy: "plan" | "ticket" | null;
  /** A skipped step's one line, which is all it holds; null for any other. */
  readonly line: string | null;
  /** Whether the section holds any words, so an unwritten fold opens on nothing to read. */
  readonly written: boolean;
}

/** One file of the change's folder by its name; the file document carries its text (J-155 S2). */
export interface FolderEntry {
  readonly file: string;
  /** Why it cannot be shown; null when it can. */
  readonly problem: string | null;
}

/** A brief by its name, with the step and number `greenline brief` wrote it for (J-155 S2). */
export interface BriefEntry extends FolderEntry {
  readonly step: string | null;
  readonly round: number | null;
  /** Whether the status derivations read it as one the command wrote. */
  readonly written: boolean;
}

/** What the change page opens on: the record's outcome line where it holds one, else its why, never the close's prose (J-168 S1). */
export interface ChangeSummary {
  readonly text: string;
  /** The same words rendered by the house Markdown renderer, every byte escaped (J-165 S1). */
  readonly html: string;
  /** The line it was read from, `outcome` or `why`. */
  readonly from: "outcome" | "why";
}

/** One file of the change's folder, its text when it can be shown. */
export interface FolderFile {
  readonly file: string;
  /** The text, null when it is too large or cannot be read, and `problem` says which. */
  readonly text: string | null;
  /** The text rendered by the house Markdown renderer, every byte escaped and every link resolved to a page address; null for a file that is not Markdown or cannot be shown. */
  readonly html: string | null;
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
  /** The commit message's trailers, in order; none for the working tree. */
  readonly trailers: readonly Trailer[];
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
  /** The record's text, carried only where its form does not parse and the page has no section to show; null otherwise (J-155 S2). */
  readonly text: string | null;
  readonly opened: string;
  readonly ageDays: number;
  readonly card: RecordCard;
  /** What the page opens on; null where the record holds neither an outcome nor a why. */
  readonly summary: ChangeSummary | null;
  readonly sections: readonly StepSummary[];
  readonly reports: readonly FolderEntry[];
  readonly briefs: readonly BriefEntry[];
  /** Every file of the folder by name, which the page's links resolve against. */
  readonly folder: readonly string[];
}

/** One finding or notice `greenline status --change` gives for a change. */
export interface StatusNote {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

/** One consultation a change made, body-free. */
export interface ConsultationEntry {
  readonly request: string;
  readonly binding: string;
  readonly calls: number;
}

/** A change record that names the plan, as the plans view shows it. */
export interface PlanRecord {
  readonly id: string;
  readonly ref: Ref;
  readonly state: ChangeState | null;
  readonly mode: string | null;
  /** The mode it opened under, before any raise, the one status holds against the ticket's entry. */
  readonly opened: string | null;
  readonly why: string | null;
  readonly ticket: string | null;
  /** The mode the owner overrode, when the record says `choice: owner` with `proposed`; null otherwise. */
  readonly proposed: string | null;
  readonly owner: boolean;
}

/** One plan as the list shows it. */
export interface PlanListEntry {
  readonly name: string;
  readonly ref: Ref;
  readonly path: string;
  /** The tickets file's mark; null when there is none or it does not parse. */
  readonly tickets: "draft" | "complete" | null;
  readonly counts: {
    readonly total: number;
    readonly done: number;
    readonly inProgress: number;
    readonly notStarted: number;
  };
  /** The tickets ready to start, as `greenline status` derives them. */
  readonly ready: readonly string[];
  readonly documents: readonly { readonly file: string; readonly status: string | null }[];
  /** The planning change's records: each record naming the plan and no ticket. */
  readonly planning: readonly PlanRecord[];
  /** Why the directory or its tickets file cannot be read; null when they can. */
  readonly problem: string | null;
}

/** The plans view's list, or why the plans cannot be read. */
export interface PlansList {
  readonly plans: readonly PlanListEntry[];
  readonly unavailable: string | null;
  /** Whether `greenline status` derived the tickets' progress; false leaves it unknown, never "not started". */
  readonly derived: boolean;
}

/** One entry of the tickets file, with what is derived for it. */
export interface TicketView {
  readonly id: string;
  readonly ref: Ref;
  readonly intent: string;
  readonly scope: readonly string[];
  readonly acceptance: readonly string[];
  readonly after: readonly string[];
  readonly mode: string;
  readonly progress: TicketProgress;
  readonly ready: boolean;
  /** The change records that name this ticket, newest first. */
  readonly records: readonly PlanRecord[];
}

/** A plan document other than the tickets file. */
export interface PlanDocumentView {
  readonly file: string;
  /** The text of the first-level heading that opens it, or its file name. */
  readonly title: string;
  readonly status: string | null;
  /** The document's text without its front matter; null when it cannot be shown. */
  readonly body: string | null;
  /** The text rendered by the house Markdown renderer, every byte escaped and every link resolved to a page address; its opening heading taken out as the title; null when it cannot be shown. */
  readonly html: string | null;
  readonly problem: string | null;
}

/** One plan as its page shows it. */
export interface PlanDetail {
  readonly name: string;
  readonly ref: Ref;
  readonly path: string;
  /** The tickets file's mark; null when there is none or it does not parse. */
  readonly mark: "draft" | "complete" | null;
  /** Whether the plan directory holds a tickets file. */
  readonly hasTickets: boolean;
  /** Why the tickets file cannot be shown; null when it parses or is absent. */
  readonly ticketsProblem: string | null;
  /** Whether the tickets file is refused because it resolves outside the repository. */
  readonly ticketsRefused: boolean;
  readonly tickets: readonly TicketView[];
  readonly frontier: readonly string[];
  /** Whether `greenline status` derived the tickets' progress and the frontier. */
  readonly derived: boolean;
  readonly documents: readonly PlanDocumentView[];
  readonly planning: readonly PlanRecord[];
  /** Records naming a ticket the tickets file does not hold. */
  readonly strays: readonly PlanRecord[];
  /** The findings and notices `greenline status` gives for the plan directory. */
  readonly notes: readonly {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
  }[];
  readonly problem: string | null;
}

/** A knowledge home by its page name. */
export type HomeId = "work" | "decisions" | "adr" | "glossary";

/** One home as the list shows it. */
export interface HomeSummary {
  readonly id: HomeId;
  readonly title: string;
  readonly path: string;
  readonly role: string;
  readonly present: boolean;
  /** What it holds, counted, such as `3 records`; null when it is absent or cannot be read. */
  readonly holds: string | null;
  /** When it was last written, the time of the last commit that touched it; null while none has (J-166 S1). */
  readonly written: string | null;
}

/** The knowledge view's list: every home, present or not. */
export interface KnowledgeList {
  readonly homes: readonly HomeSummary[];
}

/** One ADR of the ADR home. */
export interface DecisionRecord {
  readonly file: string;
  readonly title: string;
  /** The status the record states, as written; null when it states none. */
  readonly status: string | null;
  readonly date: string | null;
  /** The record's text without its front matter; null when it cannot be shown. */
  readonly body: string | null;
  /** The text rendered by the house Markdown renderer, every byte escaped and every link resolved to a page address; null when it cannot be shown. */
  readonly html: string | null;
  readonly problem: string | null;
}

/** One heading of a whole document's outline. */
export interface OutlineEntry {
  readonly level: number;
  readonly text: string;
  readonly anchor: string;
}

/** A whole document rendered: its opening heading, its HTML and its outline. */
export interface RenderedText {
  /** The text of the first-level heading that opens it; null when none does. */
  readonly heading: string | null;
  readonly html: string;
  readonly outline: readonly OutlineEntry[];
}

/** One home as its page shows it. */
export type KnowledgeHome =
  | (HomeSummary & {
      readonly kind: "document";
      readonly id: "work" | "glossary";
      readonly text: string | null;
      /** The document rendered; null when it cannot be shown. */
      readonly rendered: RenderedText | null;
      readonly problem: string | null;
    })
  | (HomeSummary & {
      readonly kind: "decisions";
      readonly id: "decisions";
      readonly text: string | null;
      /** The book rendered, its root statements' block named where it stands; null when it cannot be shown. */
      readonly rendered: RenderedText | null;
      /** The root statements of the book's fence; null when the fence does not parse. */
      readonly roots: readonly RootStatement[] | null;
      readonly problem: string | null;
    })
  | (HomeSummary & {
      readonly kind: "records";
      readonly id: "adr";
      readonly records: readonly DecisionRecord[];
      readonly problem: string | null;
    });

/** One trailer of a commit message: `Greenline-Change: <id>`. */
export interface Trailer {
  readonly key: string;
  readonly value: string;
}

/** One commit of a change, as the commits document lists it. */
export interface CommitView {
  readonly hash: string;
  readonly subject: string | null;
  readonly date: string | null;
  readonly shared: boolean;
  readonly trailers: readonly Trailer[];
}

/** A diagnostic as `greenline status` reports it. */
export interface DiagnosticEntry {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

/** Installed context and current policy, without any remotely retrieved guidance body. */
export interface InspectorState {
  readonly manifest: Manifest;
  readonly installation: string;
  /** Each editable file's revision, the digest of its text, which a save of that file names (J-165 S1). */
  readonly revisions: {
    readonly manifest: string;
    readonly decisions: string;
    readonly agents: string;
  };
  readonly cliVersion: string;
  readonly roots: readonly RootStatement[];
  readonly decisions: string;
  readonly policyChanges: readonly {
    readonly path: string;
    readonly before: string;
    readonly after: string;
    readonly at: string;
  }[];
  readonly houseRulings: { readonly stanza: string; readonly rulings: readonly string[] };
  /** The installed files by folder, each by its name and size; `GET /api/practice/files/<path>` answers one's text. */
  readonly files: readonly {
    readonly folder: string;
    readonly files: readonly { readonly name: string; readonly size: number }[];
  }[];
  /** The installed files that cannot be read, each with why. */
  readonly unreadable: readonly { readonly path: string; readonly error: string }[];
  readonly changes: {
    readonly baseline: string | null;
    readonly files: readonly { readonly path: string; readonly diff: readonly DiffLine[] }[];
    readonly unavailable: readonly string[];
  };
  /** What the two settings may hold, from the installation: `proceed`'s values in order, and the trial skills. */
  readonly settings: { readonly proceed: readonly string[]; readonly trials: readonly string[] };
  readonly skills: readonly {
    readonly name: string;
    readonly installed: boolean;
    /** An extra installs only when the manifest's include list names it. */
    readonly extra: boolean;
  }[];
}

/**
 * A home a later version of greenline adds: its items where this version
 * keeps it, or why it holds none. A kind this version does not keep is
 * served with no item and its reason, never with placeholder data.
 */
export type HomeReading<T> =
  | { readonly available: true; readonly items: readonly T[] }
  | { readonly available: false; readonly reason: string; readonly items: readonly [] };

/** A discussion's state, set on the owner's word. */
export type DiscussionState = "open" | "parked" | "declined" | "promoted" | "merged";

/** One discussion as a list shows it (J-118 S4): its idea as its title, its state, when it opened and was last touched, its decisions counted and the changes it promoted. */
export interface DiscussionSummary {
  readonly id: string;
  readonly ref: Ref;
  readonly path: string;
  /** The record's idea, in one line. */
  readonly title: string;
  readonly state: DiscussionState;
  /** The date its id was chosen. */
  readonly opened: string;
  /** The date of the last commit that touched its record or folder; null while none has. */
  readonly touched: string | null;
  readonly decisions: number;
  /** The changes it promoted, by id. */
  readonly promoted: readonly string[];
}

/** One discussion as its page shows it: the spine without the work. */
export interface DiscussionView extends DiscussionSummary {
  /** The body's sections other than the frame, research and open questions as written, each rendered by the house Markdown renderer (J-165 S1). */
  readonly sections: readonly {
    readonly heading: string;
    readonly text: string;
    readonly html: string;
  }[];
  /** The frame's answered questions, each one line. */
  readonly decisionLines: readonly string[];
  /** The research reports in its folder, by file name. */
  readonly research: readonly string[];
  /** The frame map of its frame section, J-117's; null while the section holds no frame. */
  readonly map: FrameMap | null;
  /** The map's restatement rendered by the house Markdown renderer; null with no map or none written (J-165 S1). */
  readonly restatementHtml: string | null;
  /** The discussions it relates to, by id. */
  readonly related: readonly string[];
  /** When to come back to it, for a parked one. */
  readonly revisit: string | null;
  /** Why it was declined, kept if it opens again. */
  readonly reason: string | null;
  /** The discussion a merged one joined. */
  readonly into: string | null;
  /** The owner's words that set its state. */
  readonly words: string | null;
}

/** How far a durable picture or an atlas page has drifted from the code it covers. */
export type Tier = "fresh" | "drifting" | "stale";

/** Where a visual stands in its home: under a change, in the map, in a subsystem's journeys, under interface, or the style guide (J-147 S1). */
export type VisualPlaceKind = "change" | "map" | "journey" | "interface" | "style";

/** A visual's file, by its kind: an SVG drawing shown in place, an HTML page in a frame, a Markdown page rendered. */
export interface VisualFile {
  readonly path: string;
  readonly kind: "svg" | "html" | "md";
}

/** One durable visual with its manifest's facts. */
export interface VisualView {
  /** Its path under the home without the extension: `<change>/<slug>`, `map/<slug>` or `subsystems/<name>/<slug>`. */
  readonly id: string;
  readonly ref: Ref;
  /** The visual's file, or its manifest's where no file stands beside it. */
  readonly path: string;
  readonly place: VisualPlaceKind;
  readonly file: VisualFile | null;
  /** The digest of its manifest and its file as read, which a delete names. */
  readonly revision: string;
  readonly title: string;
  readonly form: string;
  readonly skill: string;
  readonly change: string | null;
  readonly commit: string;
  readonly files: readonly string[];
  readonly made: string;
  /** Who wrote it, as the hooks recorded it (J-129 S6): a fresh agent, the session itself, or null where no hook recorded a write. */
  readonly madeBy: "agent" | "session" | null;
  readonly summary: string;
  /** The question its brief says it answers, null where it was kept with no brief (J-204 S1). */
  readonly question: string | null;
  /** Its brief's finish, text, branded SVG or interactive, null where it was kept with no brief (J-204 S1). */
  readonly finish: string | null;
  /** A capture's scores as numbers; null for any other picture (J-165 S1). */
  readonly scores: CaptureScores | null;
  readonly tier: Tier;
  readonly commitsSince: number | null;
}

/** A capture's scores: the floor's and the reflex's red counts and the finish's count (J-165 S1). */
export interface CaptureScores {
  readonly floor: number;
  readonly reflex: number;
  readonly finish: number;
}

/** One journey of a subsystem. */
export interface JourneyView {
  /** The journey's visual id. */
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly tier: Tier;
}

/** One subsystem page of the atlas. */
export interface SubsystemView {
  readonly name: string;
  readonly title: string;
  /** Its page in the explain form, from the root. */
  readonly page: string;
  readonly layer: string;
  readonly summary: string;
  readonly files: readonly string[];
  readonly commit: string;
  readonly tier: Tier;
  readonly journeys: readonly JourneyView[];
  readonly calls: readonly string[];
  readonly calledBy: readonly string[];
}

/** One band of the map, from entry to foundations, with the subsystems it holds by name. */
export interface MapLayer {
  readonly name: string;
  readonly subsystems: readonly { readonly name: string; readonly tier: Tier }[];
}

/** A picture, an atlas page or an indexed document that drifted from its code. */
export interface DriftNotice {
  readonly kind: "visual" | "subsystem" | "document";
  readonly id: string;
  readonly title: string;
  readonly tier: Tier;
  readonly detail: string;
}

/** One load of a skill during a change (J-116 S2's fact). */
export interface SkillLoad {
  readonly skill: string;
  /** The file inside the skill's folder, `SKILL.md` or `references/greenline.md`. */
  readonly file: string;
  readonly whole: boolean;
  /** `Skill`, the reading tool's name, or the shell verb. */
  readonly via: string;
  /** Why a read is a part where one page per read or the harness's cut made it one (J-203 S1): read with another page, or cut. */
  readonly cause?: "together" | "cut" | undefined;
  readonly at: string;
  /** The step the record was in; null before the record stood. */
  readonly step: string | null;
  /** The fresh agent the harness named; null for the session's own agent, the builder. */
  readonly agent: string | null;
}

/** A name and the loads counted under it: a step, or a harness and model. */
export interface CountedName {
  readonly name: string;
  readonly loads: number;
}

/** One skill's use across the changes (J-116 S4). */
export interface RosterUse {
  readonly skill: string;
  readonly loads: number;
  readonly whole: number;
  readonly part: number;
  /** The steps it loaded at, in the order first seen, `before the record` for loads before it stood. */
  readonly steps: readonly string[];
  /** The harnesses and models of the loading records' agent lines, `not stated` where one states none. */
  readonly agents: readonly string[];
  /** The changes that loaded it (J-116 S4). */
  readonly changes: number;
  /** Its loads by step, in the order of `steps`. */
  readonly byStep: readonly CountedName[];
  /** Its loads by harness and model, in the order of `agents`. */
  readonly byAgent: readonly CountedName[];
  /** Its loads outside its situation: a step skill's at another step than its own. */
  readonly outside: number;
  /** Its first load's time and its last's (J-165 S1). */
  readonly firstAt: string;
  readonly lastAt: string;
}

/** One skill of the installation's roster. */
export interface RosterSkill {
  readonly name: string;
  readonly ref: Ref;
  readonly kind: string;
  /** The step it serves, for a skill on the line; null otherwise. */
  readonly slot: string | null;
  readonly installed: boolean;
  readonly extra: boolean;
  /** The first sentence of its description, which says what it is for (J-165 S1). */
  readonly description: string;
  /** Whether the agent loads it when its situation fits, or only when it is named (J-165 S1). */
  readonly activation: "implicit" | "explicit";
}

/** A kind of skill with its sentence from the modes, which says when a skill of it loads (J-165 S1). */
export interface SkillKindView {
  readonly name: string;
  readonly when: string;
}

/** One load of a skill with the change it loaded under (J-165 S1). */
export interface SkillChangeLoad extends SkillLoad {
  readonly change: string;
}

/** One change that loaded a skill: its reference, its loads of the skill and the steps they came at (J-165 S1). */
export interface SkillChange {
  readonly change: Ref;
  readonly loads: number;
  readonly steps: readonly string[];
}

/** One declared check's latest run for a change in progress. */
export interface CheckStandingView {
  readonly name: string;
  readonly command: string;
  /** The latest run's outcome; `not-run` where none ran or none can be read. */
  readonly outcome: "passed" | "failed" | "unfinished" | "not-run";
  readonly at: string | null;
}

/** A change in progress as the desk shows it. */
export interface DeskChange extends ChangeListEntry {
  /** How many commits the change holds; null when its commits cannot be listed. */
  readonly commits: number | null;
  readonly checks: readonly CheckStandingView[];
  /** The files its commits touched since the time the page sent, or all of them on a first look; null when its commits cannot be listed. */
  readonly changedFiles: ChangedFiles | null;
}

/** What happened to a change since the owner's last look. */
export interface SinceChange {
  readonly change: Ref;
  readonly happened: "opened" | "steps written" | "closed" | "dropped";
}

/** What moved since the time the page sent, the owner's last look (J-154 S3). */
export interface DeskSince {
  /** The time the page sent. */
  readonly at: string;
  /** The commits made since. */
  readonly commits: number;
  readonly changes: readonly SinceChange[];
  /** The pictures made since. */
  readonly pictures: number;
  /** The files those commits touched, by folder. */
  readonly changedFiles: ChangedFiles;
}

/** A change waiting on the owner, with what it waits on. */
export interface DeskWaiting extends WaitingOn {
  readonly change: Ref;
}

/** How a closed change's checks stood: each declared command's latest run (J-155 S1). */
export interface CloseChecks {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  /** How many of the latest runs saw the change's final code. */
  readonly onFinal: number;
  /** The commands whose latest run failed. */
  readonly failing: readonly string[];
}

/**
 * A change closed, with when, how long it took, and its three lines (J-155
 * S1): what landed, the files its commits touched; the check, each declared
 * command's latest run; and the commit, its last.
 */
export interface DeskClose extends ChangeListEntry {
  /** Its last commit's time; null where it holds none. */
  readonly closedAt: string | null;
  /** The minutes from its first commit to its last; null where it holds none. */
  readonly tookMinutes: number | null;
  /** The files its commits touched; null when its commits cannot be listed. */
  readonly touched: ChangedFiles | null;
  readonly checked: CloseChecks;
  /** Its last commit; null where it holds none that reads. */
  readonly lastCommit: { readonly hash: string; readonly subject: string } | null;
  /** How many commits it holds; null when they cannot be listed. */
  readonly commits: number | null;
  readonly source: Source;
}

/** One thing that needs the owner's care, grouped on the server. */
export interface CareItem {
  readonly kind: "errors" | "warnings" | "drift" | "notes";
  readonly count: number;
  readonly text: string;
  readonly address: string | null;
  readonly source: Source;
}

/** One change's work today. */
export interface TodaySegment {
  readonly change: Ref;
  readonly mode: string | null;
  readonly state: ChangeState | null;
  readonly firstAt: string;
  readonly lastAt: string;
}

/** Today's work, on the server's clock: the commits, by hour and by change. */
export interface DeskToday {
  readonly commits: number;
  readonly first: string | null;
  readonly last: string | null;
  /** Twenty-four counts, the commits of each hour of the server's day. */
  readonly commitsPerHour: readonly number[];
  readonly segments: readonly TodaySegment[];
}

/** The contract's version, which every document carries as its `schema`. */
export type InspectSchema = "greenline.inspect/v2";

/** A document as a builder makes it, before the server stamps it with its reading. */
export type Unread<D extends { readonly read: Read }> = Omit<D, "read">;

/** Every document opens with the contract's version, its kind and when it was read. */
interface Envelope<K extends string> {
  readonly schema: InspectSchema;
  readonly kind: K;
  readonly read: Read;
}

/** The notes on the captures, the owner's marks, with the revision a write names. */
export interface NotesReading {
  readonly revision: string;
  readonly notes: readonly MarkView[];
  /** A line of a marks file that does not read, as `<path>:<line>: <why>`. */
  readonly unreadable: readonly string[];
}

/** One document the contract serves: its kind, the artefact it carries and its address. */
export interface ContractEntry {
  readonly kind: string;
  readonly artefact: string;
  readonly address: string;
}

/** A file a change's folder, or a ledger home, may hold that a command or an agent generates. */
export interface GeneratedFile {
  /** The file's name in its home; `<date>` and `<n>` stand for its varying part. */
  readonly name: string;
  readonly home: string;
  /** How the file says it is generated. */
  readonly header: string;
  /** What writes it. */
  readonly writer: string;
  /** Whether `greenline tidy` removes it. */
  readonly tidy: boolean;
  /** What the file holds. */
  readonly note: string;
}

/** A document the design names that a later slice adds under this envelope, with the slice that owes it. */
export interface RemainingDocument {
  readonly kind: string;
  readonly address: string;
  readonly carries: string;
  readonly owner: string;
}

/** The contract's index: its version, its documents, the ones still owed and the generated files it names. */
export interface ContractDocument extends Envelope<"contract"> {
  readonly version: 2;
  readonly documents: readonly ContractEntry[];
  readonly remaining: readonly RemainingDocument[];
  readonly generatedFiles: readonly GeneratedFile[];
}

/**
 * The desk, the first screen (J-154 S3): what waits on the owner, the
 * changes in progress, what moved since the owner's last look, the last
 * close, what needs care and today's work, each summary with its source.
 */
export interface DeskDocument extends Envelope<"desk"> {
  readonly summary: {
    readonly waiting: number;
    readonly inProgress: number;
    readonly closedToday: number;
    readonly lastCloseAt: string | null;
    readonly source: Source;
  };
  /** What moved since the time the page sent; null on a first look, when it sends none. */
  readonly since: DeskSince | null;
  readonly waiting: readonly DeskWaiting[];
  readonly inProgress: readonly DeskChange[];
  /** Why the ledger cannot be read; null when it can. */
  readonly unavailable: string | null;
  readonly lastClose: DeskClose | null;
  /** The last three changes closed, the most recent first, each in its three lines (J-155 S1). */
  readonly closes: readonly DeskClose[];
  readonly care: readonly CareItem[];
  readonly today: DeskToday;
  readonly discussions: HomeReading<DiscussionSummary>;
  readonly drift: HomeReading<DriftNotice>;
  readonly diagnostics: { readonly errors: number; readonly warnings: number };
}

/** The changes, with how many stand in each state and the plans and discussions counted. */
export interface ChangesDocument extends Envelope<"changes">, ChangesList {
  readonly counts: StateCounts;
  readonly plans: number;
  readonly discussions: number;
}

/**
 * One change's head (J-165 S1): what it is, where it stands and what it
 * waits on, its strip, its record and its folder by name, read from the
 * record and its folder alone, with no git read and no run of the status.
 * Each part is a document at its own address under `/api/changes/<id>/`:
 * the files its commits touched, its checks, its commits, its skill loads,
 * its frame map, its pictures, the notes on its captures, its interface
 * section and its record's source.
 */
export interface ChangeDocument extends Envelope<"change"> {
  readonly ref: Ref;
  readonly state: ChangeState | null;
  readonly waitingOn: WaitingOn | null;
  /** Each step of the line with how its section stands: the step strip's words (J-165 S1). */
  readonly strip: readonly StripStep[];
  readonly change: ChangeDetail;
}

/** The files a change's commits touched, by folder with their lines, a part of its page (J-165 S1). */
export interface ChangedFilesDocument extends Envelope<"changed-files"> {
  readonly change: string;
  readonly changedFiles: ChangedFiles;
}

/** The notes on a change's captures, the owner's marks, a part of its page (J-165 S1). */
export interface ChangeNotesDocument extends Envelope<"notes"> {
  readonly change: string;
  readonly notes: NotesReading;
}

/** A change's record as written, its Markdown whole with its path and when it was last written (J-165 S1). */
export interface SourceDocument extends Envelope<"source"> {
  readonly change: Ref;
  readonly path: string;
  /** The record's text; null where it cannot be read, and `problem` says why. */
  readonly text: string | null;
  /** When the file was last written; null where it cannot be read. */
  readonly at: string | null;
  readonly problem: string | null;
}

/** One step of a change, its text rendered, read when its fold opens (J-155 S2). */
export interface StepDocument extends Envelope<"step"> {
  readonly change: Ref;
  readonly section: SectionView;
}

/** One file of a change's folder, its text rendered where it is Markdown (J-155 S2). */
export interface FileDocument extends Envelope<"file"> {
  readonly change: Ref;
  readonly file: FolderFile;
}

/**
 * One line of a patch with its numbers from the hunk headers (J-165 S1): the
 * line's number in the file before, null for a line added, and after, null
 * for a line removed; both null for a line that stands for others, the gap
 * between two hunks or the lines past the cap.
 */
export interface NumberedDiffLine extends DiffLine {
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

/** What one commit did to one file: its lines, added, removed and around. */
export interface DiffCommit {
  readonly hash: string;
  readonly subject: string;
  readonly date: string;
  readonly lines: readonly NumberedDiffLine[];
}

/** The net change to one file across a change: from before its first commit to its last (J-165 S1). */
export interface DiffNet {
  /** The commit before the change's first, its base; null where the first commit has none. */
  readonly from: string | null;
  /** The change's last commit that touched the file. */
  readonly to: string;
  readonly lines: readonly NumberedDiffLine[];
}

/** One changed file's lines across the change's commits, the oldest commit first (J-155 S2), and the net change beside them (J-165 S1). */
export interface DiffDocument extends Envelope<"diff"> {
  readonly change: Ref;
  readonly path: string;
  readonly commits: readonly DiffCommit[];
  /** The file from before the change's first commit to its last; null where git could not read it or no commit changed a line. */
  readonly net: DiffNet | null;
  /** Why git could not read the lines; null when it could. */
  readonly unknown: string | null;
}

/** One change's check facts against its commits, with what the status says of it (J-165 S1). */
export interface CheckFactsDocument extends Envelope<"check-facts"> {
  readonly change: string;
  readonly checks: ChecksView;
  /** The findings and notices `greenline status --change` gives for it. */
  readonly notes: readonly StatusNote[];
  /** For an open change, its commits of code since its last recorded check, in words; null otherwise. */
  readonly sinceCheck: string | null;
  readonly consultations: readonly ConsultationEntry[];
  /** The landing's state once the change's close has run, the line the mirror and the status print; null otherwise (J-202 S1). */
  readonly landing: string | null;
}

/** One change's commits with their trailers. */
export interface CommitsDocument extends Envelope<"commits"> {
  readonly change: string;
  readonly commits: readonly CommitView[];
  /** Why the commits cannot be listed; null when they can. */
  readonly unknown: string | null;
}

/** One change's skill loads. */
export interface SkillLoadsDocument extends Envelope<"skill-loads"> {
  readonly change: string;
  readonly loads: HomeReading<SkillLoad>;
  /** The skills the change owes by their trigger rows, each beside whether a load holds it (J-176 S1). */
  readonly owed: readonly OwedView[];
}

/** One skill a change owes (J-176 S1): its read, what owed it, and whether the change loaded it. */
export interface OwedView {
  readonly skill: string;
  readonly read: "part" | "whole";
  readonly why: string;
  readonly loaded: boolean;
  /** The pages that still hold a whole read the loads began, as the owes line names them (J-203 S1); absent where none does. */
  readonly held?: string | undefined;
}

/** One skill the changes owed, with how many owed it and how many of those loaded it (J-176 S1). */
export interface OwedUse {
  readonly skill: string;
  readonly owed: number;
  readonly loaded: number;
}

/**
 * One change's frame map (J-117 S4): the nodes, the questions with the answer
 * proposed, the answer taken and who decided, the research each drew on and
 * the restatement, from `frame-map.json` beside the record, or from the
 * record's frame section where no file stands yet.
 */
export interface FrameMapDocument extends Envelope<"frame-map"> {
  readonly change: string;
  /** Where the map was read: the generated file, or the record's frame section; null with no map. */
  readonly source: "file" | "record" | null;
  readonly map: FrameMap | null;
  /** Why no map is drawn; null when one is. */
  readonly reason: string | null;
  /** The map's restatement rendered by the house Markdown renderer; null with no map or none written (J-165 S1). */
  readonly restatementHtml: string | null;
  /** The owner's words that confirmed a careful frame's restatement, the record's confirmed line; null where it holds none (J-223 S1). */
  readonly confirmed: string | null;
}

/** The discussions. */
export interface DiscussionsDocument extends Envelope<"discussions"> {
  readonly discussions: HomeReading<DiscussionSummary>;
}

/** One discussion. */
export interface DiscussionDocument extends Envelope<"discussion"> {
  readonly discussion: DiscussionView;
}

/** The durable pictures: every visual of the home, the captures among them. */
export interface PicturesDocument extends Envelope<"pictures"> {
  readonly pictures: HomeReading<VisualView>;
}

/**
 * One picture with its manifest (J-154 S3): a visual, or a capture with its
 * widths, its element boxes and the notes pinned to it, at one address.
 */
export interface PictureDocument extends Envelope<"picture"> {
  readonly picture: VisualView;
  /** A Markdown visual rendered by the house renderer; null for any other. */
  readonly html: string | null;
  /** The capture with its boxes, for a capture; null for any other picture. */
  readonly capture: CaptureView | null;
  /** The notes pinned to this capture, with the revision a new note names; none for a picture that is no capture. */
  readonly notes: NotesReading;
}

/** The atlas: the map's bands and the subsystem pages. */
export interface AtlasDocument extends Envelope<"atlas"> {
  readonly map: HomeReading<MapLayer>;
  readonly subsystems: HomeReading<SubsystemView>;
  /** The atlas's standing, which the empty state reads (J-147 S5). */
  readonly standing: AtlasStandingView;
  /** The indexed documents with their tiers (J-147 S5). */
  readonly documents: HomeReading<DocumentView>;
  /** The atlas's refreshes, from the index (J-147 S5). */
  readonly refreshes: readonly AtlasRefreshView[];
}

/** The atlas's standing as the empty state and the map read it (J-147 S5). */
export interface AtlasStandingView {
  readonly pages: number;
  /** A major change since the map, in words; null where none stands (J-176 S1). */
  readonly major: string | null;
  /** The commits touching the map's files since its commit; null where no map stands. */
  readonly mapBehind: number | null;
}

/** One indexed document with its tier (J-147 S5). */
export interface DocumentView {
  readonly path: string;
  readonly author: "practice" | "owner";
  readonly files: readonly string[];
  readonly commit: string;
  readonly change: string | null;
  readonly tier: Tier;
  readonly commitsSince: number | null;
}

/** One indexed document's page: its facts and its text rendered (J-147 S5). */
export interface DocumentPageDocument extends Envelope<"document"> {
  readonly document: DocumentView;
  readonly html: string | null;
}

/** One refresh the atlas's index records (J-147 S5). */
export interface AtlasRefreshView {
  readonly change: string;
  readonly whole: boolean;
  readonly pages: readonly string[];
  readonly cost: string | null;
}

/** One subsystem page with its journeys. */
export interface SubsystemDocument extends Envelope<"subsystem"> {
  readonly subsystem: SubsystemView;
  /** Its page rendered by the house renderer; null where the page stands nowhere. */
  readonly html: string | null;
}

/** The roster and its use across the changes. */
export interface RosterDocument extends Envelope<"roster"> {
  /** The kinds of skill, each with its sentence (J-165 S1). */
  readonly kinds: readonly SkillKindView[];
  readonly skills: readonly RosterSkill[];
  readonly use: HomeReading<RosterUse>;
  /** The installed skills no change has loaded, by name; none while the use is not recorded. */
  readonly neverRead: readonly string[];
  /** Each skill the changes owed, owed against loaded, so a skill nothing owes shows as such (J-176 S1). */
  readonly owed: readonly OwedUse[];
}

/** One skill's page (J-165 S1): the skill, its use, the changes that loaded it and its every load, oldest first. */
export interface SkillDocument extends Envelope<"skill"> {
  readonly skill: RosterSkill;
  /** Its kind with its sentence; null where the modes name no such kind. */
  readonly skillKind: SkillKindView | null;
  /** Its use across the changes; null where no change has loaded it. */
  readonly use: RosterUse | null;
  /** The changes that loaded it, the most recent first. */
  readonly changes: readonly SkillChange[];
  readonly loads: readonly SkillChangeLoad[];
  /** The pages its whole read includes beyond its `SKILL.md`, as its recipe names them (J-203 S1); absent where it names none. */
  readonly wholeRead?: readonly string[] | undefined;
}

/**
 * One finding of a health group (J-232 S1): the file it names, and its
 * message only where it is not the group's first, so a hundred findings of
 * one message carry the message once.
 */
export interface HealthFinding {
  /** The finding's own message; absent where it is the group's `text`. */
  readonly message?: string;
  readonly path?: string;
}

/**
 * One group of the diagnostics: a code with its count, its first message,
 * the page that shows it and each of its findings in status's order.
 */
export interface HealthGroup {
  readonly kind: "error" | "warning";
  readonly code: string;
  readonly count: number;
  readonly text: string;
  /** The page of the record the diagnostic names; null where it names none. */
  readonly address: string | null;
  readonly findings: readonly HealthFinding[];
}

/**
 * The practice (J-154 S3): the health `greenline status` reports, grouped,
 * each group with its findings whole (J-232 S1), the declared checks with the
 * hooks, the CLI's version and the receipts of each consultation.
 */
export interface PracticeDocument extends Envelope<"practice"> {
  readonly health: {
    readonly errors: number;
    readonly warnings: number;
    readonly groups: readonly HealthGroup[];
    readonly source: Source;
  };
  /**
   * The declared checks and the hooks as `greenline status` reports them, with
   * the manifest's hooks settings; null when status could not read the manifest.
   */
  readonly hooks: (HooksReport & { readonly settings: HookSettings }) | null;
  /** The CLI's version. */
  readonly version: string;
  /** The request collections, body-free. */
  readonly receipts: readonly ReceiptRequestView[];
  /** The collection files, or the directory, that could not be read, each with the refusal. */
  readonly problems: readonly { readonly file: string; readonly message: string }[];
  /** Whether a connector is enabled, so that a consultation could be made. */
  readonly connector: boolean;
}

/** The settings: the policy and the installation with their editors' revision, the installed files by name and size. */
export interface SettingsDocument extends Envelope<"settings">, InspectorState {}

/** One installed file's text (J-154 S3), which the settings name by size alone. */
export interface InstalledFileDocument extends Envelope<"installed-file"> {
  readonly path: string;
  readonly size: number | null;
  readonly content: string | null;
  /** Why the file cannot be read; null when it can. Named apart from a refusal's `error`, which a document never carries. */
  readonly problem: string | null;
}

/** The plans. */
export interface PlansDocument extends Envelope<"plans">, PlansList {}

/** One plan with its tickets. */
export interface PlanPageDocument extends Envelope<"plan"> {
  readonly plan: PlanDetail;
}

/** The knowledge homes. */
export interface HomesDocument extends Envelope<"homes">, KnowledgeList {}

/** One knowledge home. */
export interface HomeDocument extends Envelope<"home"> {
  readonly home: KnowledgeHome;
}

/** One catalog entry as the catalog browser shows it (J-123 S7). */
export interface CatalogEntryView {
  readonly id: string;
  readonly kind: string;
  readonly register: string;
  readonly platform: readonly string[];
  readonly concerns: readonly string[];
  readonly components: readonly string[];
  readonly words: string;
  /** Where its language came from: a source's pin, or a studied site. */
  readonly source: string;
  /** The day a studied site was seen; null for a source at a commit. */
  readonly seen: string | null;
  /** Its specimen, rendered from its data alone; null for an entry with neither tokens nor a sketch. */
  readonly specimen: string | null;
}

/** The installed catalog's entries, or why none is installed. */
export interface CatalogDocument extends Envelope<"catalog"> {
  readonly catalog: HomeReading<CatalogEntryView>;
}

/** One part of a direction dealt. */
export interface DealPartView {
  readonly role: string;
  readonly id: string;
  readonly kind: string;
  readonly words: string;
}

/** One direction dealt, with its composite on the register's specimen page. */
export interface DealDirectionView {
  /** Its place in the deal, from 1. */
  readonly index: number;
  readonly name: string;
  readonly parts: readonly DealPartView[];
  readonly light: string;
  /** The dark scheme, where the palette holds one. */
  readonly dark: string | null;
}

/** The deal for a change: the ask, the three directions, and the pick with its revision. */
export interface DealDocument extends Envelope<"deal"> {
  readonly change: string;
  readonly register: "site" | "app" | null;
  readonly job: string | null;
  /** The installed catalog's pin; null where none is installed. */
  readonly catalog: string | null;
  readonly seed: number;
  readonly reroll: boolean;
  /** Whether the change has a deal to show: one its address asks, the one `greenline deal` kept, or the one its pick was made from; false shows the empty state (J-149 S4). */
  readonly dealt: boolean;
  readonly directions: HomeReading<DealDirectionView>;
  readonly pick: DesignPick | null;
  /** The pick file's revision the pick button names; `none` while no pick stands. */
  readonly revision: string;
}

/** One capture of a address kept over time. */
export interface RouteCaptureView {
  readonly visual: string;
  readonly made: string;
  readonly floor: number;
  readonly reflex: number;
  readonly finish: number;
}

/** One address of the interface with its last capture, its scores and their history. */
export interface InterfaceRouteView {
  readonly address: string;
  readonly register: string | null;
  readonly capture: {
    readonly visual: string;
    readonly widths: readonly number[];
    readonly commit: string;
    readonly at: string;
  } | null;
  readonly scores: {
    readonly floor: number;
    readonly reflex: number;
    readonly finish: number;
  } | null;
  readonly fidelity: { readonly inPalette: number; readonly offPalette: readonly string[] } | null;
  /** Every capture of the address the visual home holds, oldest first. */
  readonly history: readonly RouteCaptureView[];
  /** The last capture's staleness by commits, null where none stands. */
  readonly tier: Tier | null;
  /** The limit the latest capture met where it made none, in the check's words; null where none stands (J-191 S1). */
  readonly limit: {
    readonly cause: string;
    readonly origin: string | null;
    readonly at: string;
    readonly words: string;
  } | null;
}

/** One token of DESIGN.md as a tile. */
export interface InterfaceTokenView {
  readonly group: string;
  readonly name: string;
  readonly value: string;
}

/**
 * The workspace's interface (J-154 S3): its pages with their captures and
 * scores, the owner's notes on the captures, its home's tokens and specimen,
 * its drift.
 */
export interface InterfaceDocument extends Envelope<"interface"> {
  readonly pages: HomeReading<InterfaceRouteView>;
  /** The facets in play; null where the workspace names no interface. */
  readonly facets: {
    readonly platform: string;
    readonly frameworks: readonly string[];
    readonly registers: readonly string[];
  } | null;
  readonly tokens: readonly InterfaceTokenView[];
  readonly drift: string | null;
  /** The home's own specimen, and its page in light and dark, rendered live from DESIGN.md; null where none reads. */
  readonly specimen: string | null;
  readonly page: { readonly light: string; readonly dark: string | null } | null;
  readonly notices: readonly string[];
  readonly notes: NotesReading;
}

/** A change's interface: whether it touches one, its latest check by tier, its design section and the pick. */
export interface InterfaceChecksDocument extends Envelope<"interface-checks"> {
  readonly change: string;
  readonly touches: boolean;
  readonly fact: InterfaceCheckFact | null;
  readonly design: string | null;
  readonly pick: DesignPick | null;
}

/** One captured width of a capture: its full-page image, the page's size and the boxes (J-124 S1). */
export interface CaptureWidthView {
  readonly width: number;
  /** The viewport's height at this width. */
  readonly height: number;
  /** The full page, light, as a data URL; null where the capture's page holds none at this width. */
  readonly image: string | null;
  /** The full-page image's height in the page's pixels. */
  readonly imageHeight: number;
  readonly page: { readonly width: number; readonly height: number };
  readonly elements: readonly BoxedElement[];
  readonly truncated: boolean;
}

/** One capture of an address, a picture the owner marks (J-124 S1). */
export interface CaptureView {
  /** Its visual id, `<change>/<slug>` or `interface/<slug>`. */
  readonly id: string;
  readonly address: string;
  readonly change: string | null;
  readonly commit: string;
  readonly made: string;
  readonly files: readonly string[];
  /** Its staleness by commits, as the visuals' tier. */
  readonly tier: Tier;
  readonly commitsSince: number | null;
  readonly widths: readonly CaptureWidthView[];
  /** Why no boxes stand beside it, a capture taken before the boxes were; null where they do. */
  readonly boxes: string | null;
  /** Its scores as numbers (J-165 S1). */
  readonly scores: CaptureScores;
  /** Every capture of the same address, oldest first, this one among them, each earlier or later than this one by its time (J-165 S1). */
  readonly history: readonly {
    readonly id: string;
    readonly made: string;
    readonly commit: string;
    readonly when: "earlier" | "this" | "later";
  }[];
}

/** One mark with where it stands, whether it is stale, and the capture that shows it after (J-124 S2). */
export interface MarkView {
  readonly ref: Ref;
  readonly mark: Mark;
  /** Its file's path from the root. */
  readonly file: string;
  /** The change whose folder holds it; null for the interface ledger home. */
  readonly change: string | null;
  /** Whether the files its capture shows changed since it was taken; false for a closed mark. */
  readonly stale: boolean;
  /** The capture after it, the proposal's or the newest later one of its address, with the element's box there where it is found. */
  readonly after: { readonly capture: string; readonly box: Box | null } | null;
}

/** One note on a capture, the owner's mark, with the revision a write names. */
export interface MarkDocument extends Envelope<"mark"> {
  readonly note: MarkView;
  readonly revision: string;
}

/** The kinds of record the names hold. */
export type SearchKind = "change" | "plan" | "discussion" | "picture" | "note";

/**
 * One record by its name (J-158 S2): its reference, the place of the app that
 * lists it, its state as its record states it and when it was last touched.
 */
export interface SearchEntry extends Ref {
  readonly kind: SearchKind;
  /** The place of the app that lists it, such as Changes. */
  readonly where: string;
  /** Its state as its record states it; null where it states none. */
  readonly state: string | null;
  /** The date or time it was opened, made or last touched; null where none is read. */
  readonly at: string | null;
}

/**
 * Every name the app shows for a record another page refers to, read once
 * by the server: the changes, the plans, the discussions, the pictures and
 * the notes. A page shows a reference by its name and keeps the id for the
 * address; the palette searches the same names.
 */
export interface SearchDocument extends Envelope<"search"> {
  readonly entries: readonly SearchEntry[];
}

/** Every document the contract serves. */
export type InspectorDocument =
  | ContractDocument
  | DeskDocument
  | ChangesDocument
  | ChangeDocument
  | ChangedFilesDocument
  | ChangeNotesDocument
  | SourceDocument
  | StepDocument
  | FileDocument
  | DiffDocument
  | CheckFactsDocument
  | CommitsDocument
  | SkillLoadsDocument
  | FrameMapDocument
  | InterfaceChecksDocument
  | DealDocument
  | PlansDocument
  | PlanPageDocument
  | DiscussionsDocument
  | DiscussionDocument
  | InterfaceDocument
  | MarkDocument
  | HomesDocument
  | HomeDocument
  | PicturesDocument
  | PictureDocument
  | AtlasDocument
  | SubsystemDocument
  | DocumentPageDocument
  | PracticeDocument
  | InstalledFileDocument
  | RosterDocument
  | SkillDocument
  | SettingsDocument
  | CatalogDocument
  | SearchDocument;

/** A document's kind. */
export type DocumentKind = InspectorDocument["kind"];

/** A document by its kind. */
export type DocumentOf<K extends DocumentKind> = Extract<InspectorDocument, { readonly kind: K }>;
