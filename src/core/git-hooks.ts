import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { isChangeId } from "./change.ts";
import { parseGround } from "./ground.ts";
import { checkWhere, isRunOf, ROOT_DIR, type DeclaredCheck } from "./checks.ts";
import { discussionPath, parseDiscussionRecord } from "./discussion.ts";
import type { CheckFacts } from "./facts.ts";
import { breachesLine, type RecordBreach } from "./record-lint.ts";
import { inHomes } from "./event.ts";
import { PATHS_FILE, SURVEY_FILE } from "./interface-home.ts";
import { sectionStateOf } from "./progress.ts";
import {
  CAREFUL_MODE,
  confirmState,
  isPlaceholder,
  REAL_STOP,
  saidByOwner,
  stopNotHeld,
  unownedWords,
  unwrittenLine,
  yesNotHeld,
  type ConfirmJournal,
  type ConfirmState,
  type OwnerJournal,
} from "./record-lines.ts";
import { fieldData, parseFrontMatter, type FieldData } from "./front-matter.ts";
import { commitFirst, wordsName } from "./guardrails.ts";
import {
  CAPTURE_COMMAND,
  limitsOwedText,
  renderOwedText,
  SCREEN_COMMAND,
  type TouchedPages,
} from "./interface-pages.ts";

/**
 * The git hooks greenline installs (`docs/SPEC.md` §4 and §5,
 * `workshop/components/installation-payload.md`): small scripts under
 * `.greenline/hooks/` that hand git's arguments and stdin to
 * `greenline hook <name>`, and the decisions that command makes. Every
 * decision here reads only git's own arguments, the change record's front
 * matter and the check facts, never the agent's words or a command line
 * (the operator's ruling of 2026-10-19), and every refusal names the fact it
 * rests on. The record facts the hooks read are the ones ruled on 2026-10-19:
 * the owner's yes is the record's `choice` line, the owner's word for a push,
 * a pull request or a merge is its `landing` line, and the owner's word for a
 * rebase of the change's branch is its `rebase` line. In a workspace, the
 * branch HEAD names holding no open change is a fact too, and the manifest's
 * `proceed` setting decides whether a `standing` choice is the yes (the
 * operator's rulings of 2026-10-21).
 */

/** The hooks greenline installs, in the order a commit, a rewrite and a push meet them. */
export const GIT_HOOK_NAMES = [
  "pre-commit",
  "prepare-commit-msg",
  "commit-msg",
  "reference-transaction",
  "pre-rebase",
  "post-rewrite",
  "pre-push",
] as const;

/** One of the hooks greenline installs, by git's own name for it. */
export type GitHookName = (typeof GIT_HOOK_NAMES)[number];

/** Where the scripts live, from the repository root. */
export const HOOKS_DIRECTORY = ".greenline/hooks";

/** The trailer every commit of a change carries. */
export const TRAILER_KEY = "Greenline-Change";
/** The trailer that names the harness and the model a commit's agent ran on, `<harness>/<model>`, just above the change's (J-114). */
export const AGENT_TRAILER_KEY = "Greenline-Agent";
/** The trailer a discussion's commit carries in place of a change's: one per discussion it touches (J-118 S1). */
export const DISCUSSION_TRAILER_KEY = "Greenline-Discussion";

const ZERO = /^0+$/;

/**
 * Whether a name is one of the hooks greenline installs.
 * @param name the name given
 * @returns true for one of {@link GIT_HOOK_NAMES}
 */
export function isGitHookName(name: string): name is GitHookName {
  return GIT_HOOK_NAMES.some((hook) => hook === name);
}

const HEADER = (name: GitHookName): string =>
  [
    "#!/bin/sh",
    `# greenline's ${name} hook, written by greenline init and refreshed by sync; an edit is`,
    "# replaced at the next sync. It hands git's arguments and stdin to greenline, which",
    "# reads only git's facts and the change record's and refuses only on one of them.",
  ].join("\n");

/** Without greenline on the PATH nothing can read the facts, so git goes on. */
const GUARD = "command -v greenline >/dev/null 2>&1 || exit 0";

/**
 * A hook's script, the bytes `init` writes and `sync` refreshes. The
 * reference-transaction script starts greenline only for the prepared state
 * of an update to a branch, since git runs it three times for every
 * reference it updates, a merge's and a remote's own included.
 * @param name the hook
 * @returns the script, ending with a newline
 */
export function gitHookScript(name: GitHookName): string {
  if (name === "reference-transaction")
    return [
      HEADER(name),
      "# git runs this hook three times for every reference update; only the prepared",
      "# state of an update to a branch can be refused, so every other run ends here",
      "# without starting greenline, its stdin read so git's writes into it never fail.",
      'if [ "$1" != prepared ]; then cat >/dev/null; exit 0; fi',
      "updates=$(cat)",
      'case "$updates" in *" refs/heads/"*) ;; *) exit 0 ;; esac',
      GUARD,
      `printf '%s\\n' "$updates" | greenline hook ${name} "$@"`,
      "",
    ].join("\n");
  return [HEADER(name), GUARD, `exec greenline hook ${name} "$@"`, ""].join("\n");
}

/** What a hook reads of a change record: whether its front matter reads, and the lines it holds. */
export interface RecordFacts {
  /** False when the front matter does not read, so no line of it is known. */
  readonly readable: boolean;
  readonly mode?: string | undefined;
  readonly state?: string | undefined;
  readonly next?: string | undefined;
  readonly choice?: string | undefined;
  /** The owner's words that answered the proposal, which an accepted record quotes (J-176 S1). */
  readonly yes?: string | undefined;
  /** The owner's words that confirmed a careful frame's restatement (J-223 S1). */
  readonly confirmed?: string | undefined;
  readonly landing?: string | undefined;
  /**
   * The owner's answer to the landing offer that took no act, the branch
   * left or the merge declined, as the landing line states it,
   * `declined: <the owner's words>` (J-143 S1): it lifts nothing, so the
   * line reads as no `landing` to every hook.
   */
  readonly declined?: string | undefined;
  readonly rebase?: string | undefined;
  /** The owner's words for throwing the change's work away, which lift the harness hook's refusal of a discard. */
  readonly discard?: string | undefined;
  /** The owner's words that stopped the change, which a stopped record quotes whole (J-200 S1). */
  readonly stopped?: string | undefined;
  /** The ground and the agent as the record states them, read for the status lines. */
  readonly ground?: string | undefined;
  readonly agent?: string | undefined;
  /** The plan the record belongs to, and its ticket when it is one. */
  readonly plan?: string | undefined;
  readonly ticket?: string | undefined;
  /** The agents the cost states, the builder counted. */
  readonly agents?: number | undefined;
  /** The rounds the cost states (J-174), read with the agents for the owner's accepted overrun. */
  readonly rounds?: number | undefined;
  /** The owner's words accepting a cost past the mode's count, the record's `overrun` line (J-174). */
  readonly overrun?: string | undefined;
  /** Whether the record's close section is written in the agent's words: no placeholder, stand-in or none line (J-226 S1). */
  readonly closeWritten?: boolean | undefined;
  /** The interface line as the record states it (J-123 S1), read by the harness hook's finding and the mirror. */
  readonly interface?: string | undefined;
  /** The record's design section's text, where it holds one, for the components the mirror prints. */
  readonly design?: string | undefined;
  /** The pages the close's refreshes rewrote, by name, from the record's `refreshes` (J-147 S1). */
  readonly refreshed?: readonly string[] | undefined;
  /** The record's close section's text, where it holds one, for the owner's words that leave the pages (J-147 S3). */
  readonly closeText?: string | undefined;
  /** The floors the record's line names, none read as the empty list; absent where the line is missing or its placeholder (J-226 S1). */
  readonly floors?: readonly string[] | undefined;
}

/** The floors line as a hook reads it: a list of names, or the word none; anything else reads as absent. */
const floorsLine = z
  .union([z.literal("none").transform((): string[] => []), z.array(z.string().min(1))])
  .optional()
  .catch(undefined);

const refreshLine = z.object({ pages: z.string().min(1) });

/** The items of a list that read, each read alone, so one malformed item hides no other. */
function itemsOf<T>(schema: z.ZodType<T>, value: FieldData | undefined): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const read = schema.safeParse(item);
    return read.success ? [read.data] : [];
  });
}

/** A line of text the record states, read as absent when it is anything else. */
/** A line a hook reads: text, and absent where it holds the skeleton's placeholder, which states nothing yet (J-176 S1). */
const line = z
  .string()
  .min(1)
  .optional()
  .catch(undefined)
  .transform((value) => (isPlaceholder(value) ? undefined : value));

/** The front-matter lines a hook reads, each absent where the record states none or states another form. */
const RECORD_LINES = z.object({
  mode: line,
  state: line,
  next: line,
  choice: line,
  yes: line,
  confirmed: line,
  landing: line,
  rebase: line,
  discard: line,
  stopped: line,
  ground: line,
  agent: line,
  plan: line,
  ticket: line,
  agents: z.number().int().optional().catch(undefined),
  rounds: z.number().int().optional().catch(undefined),
  overrun: line,
  interface: line,
});

/** A second-level section's text in a record's body, or undefined where the body holds none. */
function sectionText(body: string, heading: string): string | undefined {
  const lines = body.split("\n");
  const at = lines.findIndex((text) => text.trimEnd() === `## ${heading}`);
  if (at === -1) return undefined;
  const after = lines.slice(at + 1);
  const next = after.findIndex((text) => text.startsWith("## "));
  return (next === -1 ? after : after.slice(0, next)).join("\n").trim();
}

/**
 * Whether a record's body holds a close section in the agent's words (J-226
 * S1; j217c-states-stop finding 4): written by the reading the progress
 * dots take, and no line of it the skeleton's placeholder or a stand-in, as
 * the `record lacks:` line reads it, so the close nudge never says a close
 * is written over its placeholder.
 */
function closeWritten(body: string): boolean {
  const section = sectionText(body, "close");
  return (
    sectionStateOf(section) === "written" &&
    !(section ?? "").split("\n").some((line) => unwrittenLine(line.trim()))
  );
}

/** The prefix of a landing line that holds the owner's answer declining the landing. */
const DECLINED_PREFIX = "declined:";

/**
 * The owner's words a landing line holds when they decline the landing
 * (J-143 S1): the line `declined: <the owner's words>`, written when the
 * owner answers the offer with no act.
 * @param landing the landing line's text, if any
 * @returns the owner's words, empty where the line holds none, or undefined when the line is no answer of that form
 */
function declinedAnswer(landing: string | undefined): string | undefined {
  if (landing?.toLowerCase().startsWith(DECLINED_PREFIX) !== true) return undefined;
  return landing.slice(DECLINED_PREFIX.length).trim();
}

/**
 * The front-matter lines a hook reads, from a record's text. The hooks run
 * without the installation, so the record is read for these lines alone,
 * never judged against the modes.
 * @param text the record's text
 * @returns the lines it holds, or unreadable
 */
export function recordFacts(text: string): RecordFacts {
  const document = parseFrontMatter(text, "a change record");
  if (document._tag === "err") return { readable: false };
  const data = fieldData(document.value.fields);
  const lines = RECORD_LINES.parse(data);
  const design = sectionText(document.value.body, "design");
  const refreshed = itemsOf(refreshLine, data["refreshes"])?.flatMap((item) =>
    item.pages
      .split(",")
      .map((page) => page.trim())
      .filter((page) => page !== ""),
  );
  const facts: RecordFacts = {
    readable: true,
    ...lines,
    closeWritten: closeWritten(document.value.body),
    design,
    refreshed,
    closeText: sectionText(document.value.body, "close"),
    floors: floorsLine.parse(data["floors"]),
  };
  // An answer that declines the landing lifts nothing, so it is no landing line to any hook (J-143 S1).
  const declined = declinedAnswer(lines.landing);
  return declined === undefined ? facts : { ...facts, landing: undefined, declined };
}

/** A record the working tree holds: its change id and its lines. */
export interface RecordEntry {
  readonly id: string;
  readonly facts: RecordFacts;
}

/** What decides the change of a branch: the branch HEAD names, the default branch, whether a remote exists and the working tree's records. */
export interface BranchFacts {
  readonly current: string | undefined;
  /** The repository's default branch as its remote or its configuration names it; undefined when nothing does. */
  readonly defaultBranch: string | undefined;
  /** Whether the repository names a remote; without one the frame rule puts a change's commits on the current branch, the default one included. */
  readonly hasRemote: boolean;
  readonly records: readonly RecordEntry[];
  /** The changes the commit being made concludes ({@link concludes}): the commit is theirs. None when absent. */
  readonly finishing?: readonly string[] | undefined;
  /**
   * The change whose local landing's merge HEAD is, a merge commit carrying
   * its trailer alone, while the index stages only its record and its
   * folder: the commit being made records the merge's checks, the change's
   * last on the base branch (J-130 S1). Undefined otherwise.
   */
  readonly landed?: string | undefined;
  /**
   * The change whose record, folder or both hold every path the commit
   * being made stages (J-143 S1): the commit is that change's on any branch
   * and in any state, the default branch of a repository with a remote and
   * no open change included (J-145 S2), as a commit of the record alone is
   * (J-139 S1), so it carries that change's trailer. Read by the commit's
   * own hooks alone; undefined otherwise.
   */
  readonly alone?: string | undefined;
  /**
   * The linked worktree HEAD's branch stands in, read where the hooks run in
   * one (J-193 S1): a record whose `ground` line names it, `worktree:
   * <path>`, makes its branch the change's own whatever its name. Undefined
   * in the main checkout and where git cannot say.
   */
  readonly worktree?: WorktreePlace | undefined;
  /** The change trailers HEAD's commit carries, read in a linked worktree alone: the change of its last commit (J-193 S1). */
  readonly tip?: readonly string[] | undefined;
}

/** A linked worktree as the hooks read it: its own root's spellings, whole, its links resolved first, and the main checkout's root, from which a ground line's path reads. */
export interface WorktreePlace {
  readonly roots: readonly string[];
  readonly main: string;
}

/** The ledger's folder from the root, where every record and its folder stand. */
const LEDGER_DIRECTORY = ".greenline/ledger/";

/**
 * The change a path under the ledger belongs to: its record,
 * `.greenline/ledger/<id>.md`, or a file of its folder,
 * `.greenline/ledger/<id>/...` (J-143 S1). A discussion's path, the ledger
 * guide and the marks' file belong to no change.
 * @param path the path from the root
 * @returns the change's id, or undefined
 */
function changeOfLedgerPath(path: string): string | undefined {
  if (!path.startsWith(LEDGER_DIRECTORY)) return undefined;
  const rest = path.slice(LEDGER_DIRECTORY.length);
  const slash = rest.indexOf("/");
  const id =
    slash === -1
      ? rest.endsWith(".md")
        ? rest.slice(0, -".md".length)
        : ""
      : rest.slice(0, slash);
  return isChangeId(id) ? id : undefined;
}

/** The interface home's two files, the change's own check's record of the workspace and never ignored (J-228 S1). */
const COMPANIONS: ReadonlySet<string> = new Set([SURVEY_FILE, PATHS_FILE]);

/**
 * The paths a commit stages, the interface home's two files set aside where
 * a change's record or folder stands beside them (J-228 S1, the run
 * j217c-roster-use, whose close's interface check wrote the path index the
 * close's commit left out): they go with the change's record, before done
 * and after. A commit that stages them with no record or folder of a change
 * keeps them, so it reads as before.
 * @param paths the staged paths from the root
 * @returns the paths the commit's change is read from
 */
function withoutCompanions(paths: readonly string[]): readonly string[] {
  const rest = paths.filter((path) => !COMPANIONS.has(path));
  return rest.length < paths.length && rest.some((path) => changeOfLedgerPath(path) !== undefined)
    ? rest
    : paths;
}

/**
 * The change whose record and folder hold every path a commit stages, or
 * undefined where the commit stages nothing or a path of anything else; the
 * interface home's two files beside the record or its folder go with it
 * (J-228 S1).
 * @param paths the staged paths from the root
 * @returns the change's id, or undefined
 */
export function aloneChange(paths: readonly string[]): string | undefined {
  const ids = new Set(withoutCompanions(paths).map((path) => changeOfLedgerPath(path)));
  const [only, ...others] = [...ids];
  return others.length === 0 ? only : undefined;
}

/**
 * Whether the commit being made concludes a change, and so is the change's
 * on any branch (J-135 S1). A commit of the record and its folder alone is
 * the change's whatever state HEAD holds the record in, open, stopped, done
 * or not yet committed (J-139 S1), so the owner's words for a landing, a
 * rebase or a discard are committed alone after the close, as the pages
 * order them. With any other path beside the record, the commit concludes
 * the change where it stages the record `done` or `stopped` from open,
 * stopped or not yet committed, a stopped record staged stopped aside; a
 * record HEAD holds `done` never carries code.
 * @param head the record's lines as HEAD holds them, undefined where HEAD holds none
 * @param staged the record's lines as the commit stages them
 * @param alone whether the commit stages nothing but the record and its folder
 * @returns true when the commit is the change's by concluding it
 */
export function concludes(
  head: RecordFacts | undefined,
  staged: RecordFacts | undefined,
  alone: boolean,
): boolean {
  if (alone) return true;
  if (head?.state === "done") return false;
  if (head?.state === "stopped" && staged?.state === "stopped") return false;
  return staged?.state === "done" || staged?.state === "stopped";
}

/** The change a branch belongs to, and how it was found. */
export interface BranchChange {
  /** The change the work belongs to: on a planning change's branch, the one open ticket of its plan, else the branch's own change. */
  readonly id: string;
  /** The change whose branch it is, whose record carries the owner's `rebase` and `landing` words. */
  readonly owner: string;
  /** By the branch's name, `greenline/<id>`; as the one open change of the branch HEAD names; or by the record's `ground` line naming the worktree that holds it (J-193 S1). */
  readonly via: "branch" | "open" | "ground";
  /** The trailers a commit on the branch may carry: its change's and, on a planning change's branch, those of the plan's tickets. */
  readonly trailers: readonly string[];
}

/** The prefix of a change's own branch. */
const CHANGE_BRANCH = "greenline/";

/**
 * Whether a branch carries the prefix of a change's own branch with a name
 * that holds no change's id, `greenline/author-case` (J-188 S1, the run
 * j109t-conduct-runnerd): no change's branch, whatever change its working
 * tree holds open or a commit's trailer names, so its first commit waits
 * for the rename to the id.
 * @param branch the branch's short name
 * @returns true for such a branch
 */
function idlessBranch(branch: string): boolean {
  return branch.startsWith(CHANGE_BRANCH) && !isChangeId(branch.slice(CHANGE_BRANCH.length));
}

/**
 * Whether a branch is the repository's default branch, which is no change's
 * branch where the repository has a remote (the ledger guide, "Commits"):
 * the one the remote or the configuration names, or main or master where
 * nothing names one.
 * @param branch the branch's short name
 * @param named the default branch the repository names, if any
 * @returns true for the default branch
 */
export function isDefaultBranch(branch: string, named: string | undefined): boolean {
  return named === undefined ? branch === "main" || branch === "master" : branch === named;
}

/**
 * The changes the commit being made closes on the default branch of a
 * repository with a remote: those it finishes or stops, their record moving
 * to done or stopped, the local landing's close (J-102 S1).
 */
function closedHere(facts: BranchFacts): readonly string[] {
  return (facts.finishing ?? []).filter((id) => {
    const state = facts.records.find((entry) => entry.id === id)?.facts.state;
    return state === "done" || state === "stopped";
  });
}

/** The change whose branch it is, and how it was found. */
interface BranchOwner {
  readonly owner: string;
  readonly via: "branch" | "open" | "ground";
}

/**
 * The records whose `ground` line names the linked worktree HEAD's branch
 * stands in, `worktree: <path>` from the main checkout's root or whole
 * (J-193 S1). None in the main checkout.
 */
function groundedHere(facts: BranchFacts): readonly RecordEntry[] {
  const place = facts.worktree;
  if (place === undefined) return [];
  return facts.records.filter((entry) => {
    const ground = entry.facts.ground === undefined ? undefined : parseGround(entry.facts.ground);
    if (ground?.kind !== "worktree") return false;
    const path = resolve(isAbsolute(ground.path) ? ground.path : resolve(place.main, ground.path));
    return place.roots.some((root) => resolve(root) === path);
  });
}

/**
 * The change whose branch a linked worktree holds by its record's `ground`
 * line (J-193 S1, the run j179c-conduct-runnerb, where the harness's own
 * worktree tool named the branch `worktree-<slug>`): the one running change
 * the line names there; or, where no change runs on the branch at all, the
 * one change the line names, or, where it names several, the one HEAD's
 * commit carries, so a done change's landing finds its record. Several
 * running changes the line names, or one running beside a done one, are
 * read as before.
 */
function groundOwner(facts: BranchFacts): BranchOwner | undefined {
  const grounded = groundedHere(facts);
  if (grounded.length === 0) return undefined;
  const finishing = facts.finishing ?? [];
  const running = (entry: RecordEntry): boolean =>
    entry.facts.state === "open" || finishing.includes(entry.id);
  const live = grounded.filter(running);
  if (live.length === 1 && live[0] !== undefined) return { owner: live[0].id, via: "ground" };
  if (live.length > 0 || facts.records.some(running)) return undefined;
  const carried = grounded.filter((entry) => facts.tip?.includes(entry.id) === true);
  const only = grounded.length === 1 ? grounded[0] : carried.length === 1 ? carried[0] : undefined;
  return only === undefined ? undefined : { owner: only.id, via: "ground" };
}

/**
 * The change whose branch it is: named by a `greenline/<id>` branch, or the
 * one open change, a planning change's open tickets aside, of the branch HEAD
 * names, which is the default branch too where the repository has no remote,
 * since the frame rule puts a change's commits there (J-98 S1). A change the
 * commit being made finishes or stops counts as open, so that commit is the
 * change's too, on the default branch of a repository with a remote as well,
 * where a local landing's close is made (J-102 S1).
 */
function ownerOf(branch: string, facts: BranchFacts): BranchOwner | undefined {
  if (branch.startsWith(CHANGE_BRANCH)) {
    const id = branch.slice(CHANGE_BRANCH.length);
    // A greenline branch whose name holds no change's id is no change's, whatever stands open there (J-188 S1).
    return isChangeId(id) ? { owner: id, via: "branch" } : undefined;
  }
  if (branch !== facts.current) return undefined;
  // The commit after a local landing's merge that records its checks is that change's, on any branch (J-130 S1).
  if (facts.landed !== undefined) return { owner: facts.landed, via: "open" };
  // The default branch of a repository with a remote holds no open change, but the one
  // commit there that finishes or stops a change, a local landing's close, is that change's.
  if (facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch)) {
    const [only, ...others] = closedHere(facts);
    return only !== undefined && others.length === 0 ? { owner: only, via: "open" } : undefined;
  }
  // A branch the record's ground line names by its worktree is the change's own, whatever its name (J-193 S1).
  const grounded = groundOwner(facts);
  if (grounded !== undefined) return grounded;
  const finishing = facts.finishing ?? [];
  const open = facts.records.filter(
    (entry) => entry.facts.state === "open" || finishing.includes(entry.id),
  );
  const planning = open.filter(
    (entry) => entry.facts.plan !== undefined && entry.facts.ticket === undefined,
  );
  const lead = planning.length === 1 ? planning[0] : undefined;
  // Where several stand open, the one change outside a plan the commit concludes owns it (J-135 S1).
  const concluded = open.filter(
    (entry) => finishing.includes(entry.id) && entry.facts.plan === undefined,
  );
  // A planning change shares its branch with its tickets, which stay open beside it.
  const owner =
    open.length === 1
      ? open[0]
      : lead !== undefined && open.every((entry) => entry.facts.plan === lead.facts.plan)
        ? lead
        : concluded.length === 1
          ? concluded[0]
          : undefined;
  return owner === undefined ? undefined : { owner: owner.id, via: "open" };
}

/**
 * The change whose record, its folder or both the commit being made stages
 * alone, taken as the commit's change on the branch HEAD names whatever
 * else stands open there (J-145 S2): its record stands in the index, in any
 * state, so a done change's check fact committed under its folder alone is
 * that change's. On the default branch of a repository with a remote,
 * where no change is open, the record must not stand open, so no change is
 * opened there by committing its record alone (J-102 S1).
 * @param branch the branch's short name
 * @param facts the branch's facts, the staged change among them
 * @returns the change's id, or undefined
 */
function aloneHeld(branch: string, facts: BranchFacts): string | undefined {
  const id = facts.alone;
  if (id === undefined || branch !== facts.current) return undefined;
  const record = facts.records.find((entry) => entry.id === id);
  if (record === undefined) return undefined;
  const opening = facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch);
  return opening && record.facts.state === "open" ? undefined : id;
}

/**
 * The change a branch belongs to: the change a `greenline/<id>` branch names,
 * none for a `greenline/` branch whose name holds no id (J-188 S1),
 * or, for the branch HEAD names, the one open change its working tree holds,
 * on the default branch only where the repository has no remote, or else the
 * one change the commit being made finishes or stops there, and on any
 * branch the change whose landing's merge HEAD is while the commit being
 * made records its checks alone (J-130 S1); in a linked worktree whose path
 * a record's `ground` line names, that change whatever the branch's name
 * (J-193 S1, {@link groundOwner}); none when no fact says which. On a
 * planning change's branch, which its tickets share, the work belongs to the
 * one open ticket of its plan when one is open, and a commit there may carry
 * the trailer of any of the plan's tickets.
 * @param branch the branch's short name, or undefined when HEAD is detached
 * @param facts the branch HEAD names, the default branch and the records
 * @returns the change, or undefined
 */
export function changeOfBranch(
  branch: string | undefined,
  facts: BranchFacts,
): BranchChange | undefined {
  if (branch === undefined) return undefined;
  if (idlessBranch(branch)) return undefined;
  const alone = branch === facts.current ? facts.alone : undefined;
  // A commit of one change's record, its folder or both is that change's where no other fact names one (J-145 S2).
  const held = aloneHeld(branch, facts);
  const found =
    ownerOf(branch, facts) ?? (held === undefined ? undefined : { owner: held, via: "open" });
  if (found === undefined) return undefined;
  const lead = facts.records.find((entry) => entry.id === found.owner)?.facts;
  // A ticket the commit being made finishes or stops is that commit's work, so its closing commit carries its own trailer.
  const finishing = facts.finishing ?? [];
  const running = (entry: RecordEntry): boolean =>
    entry.facts.state === "open" || finishing.includes(entry.id);
  const tickets = ticketsOf(lead, facts.records, running);
  const open = tickets.filter(running);
  const only = open.length === 1 ? open[0] : undefined;
  const trailers = [found.owner, ...tickets.map((entry) => entry.id)];
  // A commit of one change's record, its folder or both is that change's, on any branch (J-143 S1).
  return {
    ...found,
    id: alone ?? only?.id ?? found.owner,
    trailers: alone === undefined || trailers.includes(alone) ? trailers : [...trailers, alone],
  };
}

/** A ticket's planning change as the trailers read it: the records that name its plan, or the stand-in. */
export interface PlanningChanges {
  readonly named: readonly RecordEntry[];
  readonly standIn: RecordEntry | undefined;
}

/**
 * A ticket's planning change, read as the trailers read it (J-143 S1; J-223
 * S1, after the falsifier's second reading, so the doors and `ticketsOf`
 * never disagree): the records that name the ticket's plan and no ticket,
 * or, where none does, the stand-in, the one running record that names
 * neither a plan nor a ticket.
 * @param ticket the ticket's lines
 * @param records the records the branch's facts hold
 * @param running whether a record runs: open, or finished by the commit being made
 * @returns the named records, and the stand-in where none is named
 */
export function planningChangesOf(
  ticket: RecordFacts,
  records: readonly RecordEntry[],
  running: (entry: RecordEntry) => boolean,
): PlanningChanges {
  const plan = ticket.plan;
  if (plan === undefined) return { named: [], standIn: undefined };
  const named = records.filter(
    (entry) => entry.facts.plan === plan && entry.facts.ticket === undefined,
  );
  if (named.length > 0) return { named, standIn: undefined };
  const unnamed = records.filter(
    (entry) => entry.facts.plan === undefined && entry.facts.ticket === undefined && running(entry),
  );
  return { named: [], standIn: unnamed.length === 1 ? unnamed[0] : undefined };
}

/**
 * The tickets of the plan a branch's change leads, which share its branch:
 * the records naming the plan its record names, each with its ticket. Where
 * the planning change's record names no plan, as a record may omit the
 * line, its tickets are the running ones whose planning change it stands in
 * for (`planningChangesOf`), so a ticket's own trailer still stands on its
 * planning change's branch and no other change's branch takes it. A
 * ticket's branch leads no plan.
 */
function ticketsOf(
  lead: RecordFacts | undefined,
  records: readonly RecordEntry[],
  running: (entry: RecordEntry) => boolean,
): readonly RecordEntry[] {
  if (lead === undefined || lead.ticket !== undefined) return [];
  const plan = lead.plan;
  if (plan !== undefined)
    return records.filter((entry) => entry.facts.plan === plan && entry.facts.ticket !== undefined);
  return records.filter(
    (entry) =>
      entry.facts.ticket !== undefined &&
      running(entry) &&
      planningChangesOf(entry.facts, records, running).standIn?.facts === lead,
  );
}

/**
 * The branch a full reference names, when it is a local branch.
 * @param ref a reference such as `refs/heads/main`
 * @returns the branch's short name, or undefined
 */
function branchOfRef(ref: string): string | undefined {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : undefined;
}

/** A hook's verdict: git goes on, or the hook refuses with one line naming the fact. */
export type HookVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "refuse"; readonly reason: string };

const ALLOW: HookVerdict = { kind: "allow" };

/**
 * The rule each refusal names after its words (J-144 S3): the agent and
 * the viewer read it, and the owner's sentence never leads with it.
 */
export type HookRule =
  | "no-open-change"
  | "owner-yes"
  | "standing-choice"
  | "done-checks"
  | "interface-captures"
  | "atlas-refresh"
  | "manifest-files"
  | "finished-record-alone"
  | "discussion-form"
  | "discussion-words"
  | "change-trailer"
  | "one-trailer"
  | "other-change-paths"
  | "rebase-words"
  | "landing-words"
  | "force-push-words"
  | "push-before-close"
  | "interface-fact"
  | "marks-by-hand"
  | "ledger-by-hand"
  | "picture-in-ledger"
  | "visuals-by-hand"
  | "owned-words"
  | "hooks-installed"
  | "push-from-terminal"
  | "sync-on-word"
  | "discussion-trailer"
  | "message-trailer"
  | "record-form"
  | "frame-confirmed";

/**
 * A refusal's one line (J-144 S3): what stopped, in the owner's terms, and
 * the way forward first, then the rule's name after a semicolon; the hook
 * that prints it adds its own name after the rule.
 * @param text what stopped and the way forward
 * @param rule the rule's name
 * @returns the line
 */
export function ruled(text: string, rule: HookRule): string {
  return `${text}; ${rule}`;
}

function refuse(text: string, rule: HookRule): HookVerdict {
  return { kind: "refuse", reason: ruled(text, rule) };
}

/** A record's path from the root, as every refusal names it. */
export function recordPath(id: string): string {
  return `.greenline/ledger/${id}.md`;
}

/**
 * Whether the branch HEAD names holds no open change: a `greenline/` branch
 * whose name holds no change's id, whatever its working tree holds open or
 * the commit stages (J-188 S1); or it is no
 * `greenline/<id>` branch, and it is the default branch of a repository with
 * a remote, which is never a change's branch, unless the commit being made
 * finishes or stops a change there, or its working tree holds no record open
 * there, a record the commit being made finishes or stops counted open. Two open changes no fact tells apart are open changes all
 * the same, so they hold this refusal off. The commit that records a local
 * landing's merge checks, its index staging only the change's record and
 * folder over the merge, is the change's too (J-130 S1), and so is any
 * commit staging only one change's record, its folder or both, whatever
 * state the change stands in (J-145 S2).
 * @param branch the branch HEAD names
 * @param facts the default branch, the remote and the records
 * @returns true when no change is open on the branch
 */
export function holdsNoChange(branch: string, facts: BranchFacts): boolean {
  if (branch.startsWith(CHANGE_BRANCH)) return idlessBranch(branch);
  // The commit recording a local landing's merge checks is that change's (J-130 S1).
  if (facts.landed !== undefined && branch === facts.current) return false;
  // So is a commit of one change's record, its folder or both, in any state, on any branch (J-145 S2).
  if (aloneHeld(branch, facts) !== undefined) return false;
  // There a commit that finishes or stops a change, a local landing's close, is the change's.
  if (facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch))
    return closedHere(facts).length === 0;
  const finishing = facts.finishing ?? [];
  return !facts.records.some(
    (entry) => entry.facts.state === "open" || finishing.includes(entry.id),
  );
}

/**
 * Whether a commit may change a finished change's record (J-144 S4; the
 * ledger guide, "Commits"): a record HEAD's commit holds `done` or
 * `dropped` changes only in a commit of the record and its folder alone,
 * never with code or any other path beside it, on the change's own
 * `greenline/<id>` branch as on the default branch and on a ground branch.
 * The commit of the record alone, the owner's landing words after the
 * close and the landing's last commit after a local merge among them, is
 * admitted, the interface home's two files beside it among its own (J-228
 * S1).
 * @param id the change whose record the commit stages, or the change of the branch
 * @param head the record's lines as HEAD holds them, undefined where HEAD holds none
 * @param paths the paths the commit stages, from the root
 * @returns the verdict
 */
export function finishedRecordVerdict(
  id: string,
  head: RecordFacts | undefined,
  paths: readonly string[],
): HookVerdict {
  if (head?.state !== "done" && head?.state !== "dropped") return ALLOW;
  // The interface home's files beside the record or its folder go with it (J-228 S1).
  const outside = withoutCompanions(paths).find((path) => changeOfLedgerPath(path) !== id);
  if (outside === undefined) return ALLOW;
  const record = recordPath(id);
  return refuse(
    `change ${id} is ${head.state}, so ${outside} cannot be committed beside its record; commit ${record} and its folder alone, \`git commit -- ${record} .greenline/ledger/${id}/\`, and make the other work a new change`,
    "finished-record-alone",
  );
}

/**
 * Whether a commit may set a change's record stopped (J-200 S1, the run
 * j196t-states-stop-2; the ledger guide, "Stops and resumes"): a record the
 * commit carries stopped, where HEAD's commit holds it in another state or
 * with another `stopped` line, quotes the owner's words that stopped the
 * change in its `stopped` line, one message of theirs whole that reads as a
 * stop where the hooks journaled the owner's messages, and words an earlier
 * stop already spent stop nothing again. Git's pre-commit hook reads the
 * staged record, the harness hook the working tree's, before a commit.
 * @param id the change
 * @param record the record's lines as the commit would carry them, undefined where it carries none
 * @param head the record's lines as HEAD's commit holds them, undefined where it holds none
 * @param journal the owner's messages the hooks journaled, none kept where no hook journaled any
 * @returns the verdict
 */
export function stopVerdict(
  id: string,
  record: RecordFacts | undefined,
  head: RecordFacts | undefined,
  journal: OwnerJournal = { kept: false },
): HookVerdict {
  if (record?.state !== "stopped") return ALLOW;
  if (head?.state === "stopped" && head.stopped === record.stopped) return ALLOW;
  const path = recordPath(id);
  const forward = `set state: open in ${path} and wait with the record open, or quote the owner's stop in its stopped line and commit the record alone`;
  // Words an earlier stop of the change spent stop nothing again (002/001 item_16, the resumed session's wait).
  if (record.stopped !== undefined && head?.state !== "stopped" && record.stopped === head?.stopped)
    return refuse(
      `change ${id} is set stopped on the stopped line "${record.stopped}", whose words stopped the change once already, before its resume: ${REAL_STOP}; ${forward}`,
      "owned-words",
    );
  const unheld = stopNotHeld(record.stopped, journal);
  if (unheld === undefined) return ALLOW;
  return refuse(
    `change ${id} is set stopped, and ${path} ${unheld}: ${REAL_STOP}; ${forward}`,
    "owned-words",
  );
}

/**
 * The one line every hook gives while no change is open on the branch. A
 * `greenline/` branch whose name holds no change's id is named so, with the
 * id's form and the rename that makes it the change's branch (J-186 S1, the
 * run j109t-conduct-runnerc): the id a record of the branch's slug takes
 * where the working tree holds one, else the date's place left to fill.
 * @param branch the branch HEAD names
 * @param records the ids of the records the working tree holds
 * @param more a further way forward the hook that gives the line names, before the rule
 * @returns the fact and the remedy
 */
export function noChangeReason(
  branch: string,
  records: readonly string[] = [],
  more?: string,
): string {
  const after = more === undefined ? "" : `; ${more}`;
  const slug = branch.startsWith(CHANGE_BRANCH) ? branch.slice(CHANGE_BRANCH.length) : undefined;
  if (slug === undefined || slug === "" || isChangeId(slug))
    return ruled(
      `no change is open on ${branch}, so nothing is committed there yet; open the change's record under .greenline/ledger/ first, once the owner has said yes${after}`,
      "no-open-change",
    );
  // A record whose id is a date and the branch's slug names the id the rename takes.
  const id =
    records.find((each) => each.length === slug.length + 11 && each.endsWith(`-${slug}`)) ??
    `<YYYY-MM-DD>-${slug}`;
  return ruled(
    `no change is open on ${branch}, whose name holds no change's id: a change's branch is ${CHANGE_BRANCH}<id>, the id the date it was chosen and a slug, such as ${CHANGE_BRANCH}2026-10-08-retry-deadline; rename the branch to its change's id, \`git branch -m ${branch} ${CHANGE_BRANCH}${id}\`, and open the change's record under .greenline/ledger/ once the owner has said yes${after}`,
    "no-open-change",
  );
}

/**
 * Whether a commit may go on in a workspace: refused on the branch HEAD
 * names while no change is open there ({@link holdsNoChange}). A detached
 * HEAD names no branch, so no fact refuses its commit here.
 * @param branch the branch HEAD names, undefined when it is detached
 * @param facts the default branch, the remote and the records
 * @returns the verdict
 */
export function noChangeVerdict(branch: string | undefined, facts: BranchFacts): HookVerdict {
  if (branch === undefined || !holdsNoChange(branch, facts)) return ALLOW;
  return {
    kind: "refuse",
    reason: noChangeReason(
      branch,
      facts.records.map((entry) => entry.id),
    ),
  };
}

/** The `proceed` value that admits no mode. */
const PROCEED_NONE = "none";

/** What a standing choice is read against: the manifest's `proceed` and the modes in order. */
export interface ProceedSetting {
  /** The manifest's `proceed`: `none` or a mode. */
  readonly proceed: string;
  /** The modes definition's modes in its order, fastest first; undefined when it cannot be read. Read only when the order decides. */
  readonly modes: () => readonly string[] | undefined;
}

/**
 * Whether the `proceed` setting admits a mode: at a mode it admits that mode
 * and every faster one, at `none` no mode. A mode the definition does not
 * name is admitted only by a setting that names it.
 * @param setting the setting and the modes' order
 * @param mode the record's mode line
 * @returns true or false, or undefined when the order decides and cannot be read
 */
export function proceedAdmits(
  setting: ProceedSetting,
  mode: string | undefined,
): boolean | undefined {
  if (setting.proceed === PROCEED_NONE || mode === undefined) return false;
  if (setting.proceed === mode) return true;
  const order = setting.modes();
  if (order === undefined) return undefined;
  const at = order.indexOf(mode);
  const ceiling = order.indexOf(setting.proceed);
  return at !== -1 && ceiling !== -1 && at <= ceiling;
}

/**
 * The refusal of a standing choice the `proceed` setting does not admit, or
 * undefined where the record's choice is the owner's yes: `owner` or
 * `accepted`, or `standing` where `proceed` admits the record's mode. Where
 * the modes' order cannot be read, no fact refuses it.
 * @param id the change
 * @param record the record's lines, readable and with a choice
 * @param setting the setting and the modes' order
 * @returns the reason, or undefined
 */
export function standingReason(
  id: string,
  record: RecordFacts,
  setting: ProceedSetting,
): string | undefined {
  if (record.choice !== "standing" || proceedAdmits(setting, record.mode) !== false)
    return undefined;
  return ruled(
    `the change waits for the owner's yes, since ${recordPath(id)} says choice: standing, which proceed ${setting.proceed} does not allow; wait for the yes and write the choice line owner or accepted`,
    "standing-choice",
  );
}

/**
 * Whether the commit may go on before the owner's yes: on a change's branch,
 * the record must stand and carry its `choice` line, the owner's yes; a
 * record that is absent or carries none is no yes, and a `standing` choice is
 * the yes only where the `proceed` setting admits the record's mode. An
 * accepted record quotes the owner's yes in its `yes` line, and where the
 * hooks journaled the owner's messages one of them holds it (J-176 S1).
 * @param change the change of the branch, if any
 * @param record the record's lines as the commit would carry them, undefined when it stands nowhere
 * @param setting the manifest's `proceed` and the modes' order
 * @param journal the owner's messages the hooks journaled, none kept where no hook journaled any
 * @returns the verdict
 */
export function yesVerdict(
  change: BranchChange | undefined,
  record: RecordFacts | undefined,
  setting: ProceedSetting,
  journal: OwnerJournal = { kept: false },
): HookVerdict {
  if (change === undefined) return ALLOW;
  const path = recordPath(change.id);
  if (record === undefined)
    return refuse(
      `the change waits for the owner's yes: the branch is change ${change.id}'s and ${path} stands neither staged nor in the working tree; propose the change, wait for the yes and open the record first`,
      "owner-yes",
    );
  if (!record.readable)
    return refuse(
      `the owner's yes cannot be read, since the front matter of ${path} does not read; correct the record`,
      "owner-yes",
    );
  if (record.choice === undefined)
    return refuse(
      `the change waits for the owner's yes: ${path} carries no choice line; record the owner's choice before the first commit`,
      "owner-yes",
    );
  // The yes an accepted record quotes is the owner's, where the hooks journaled their messages (J-176 S1).
  const unheld = yesNotHeld(record.choice, record.yes, journal);
  if (unheld !== undefined)
    return refuse(`the change waits for the owner's yes: ${unheld}`, "owner-yes");
  const standing = standingReason(change.id, record, setting);
  return standing === undefined ? ALLOW : { kind: "refuse", reason: standing };
}

/**
 * Whether a record is careful, its frame then held by the doors (J-223 S1),
 * whatever its state: the commit that sets it done is held too, so a done
 * line never carries code or a confirmation past them, and a dropped state
 * opens nothing, as the yes's door reads no state line (after the
 * falsifier's third reading); once HEAD's commit holds it done or dropped,
 * `finishedRecordVerdict` admits the record alone.
 */
function carefulHeld(record: RecordFacts | undefined): boolean {
  return record?.readable === true && record.mode === CAREFUL_MODE;
}

/**
 * The clause for a careful change the record says is dropped and whose frame
 * holds no confirmation (after the falsifier's third reading): a cure the
 * agent can reach, never a restatement put for a change the owner dropped.
 * @param id the change
 * @returns the clause
 */
export function droppedUnconfirmed(id: string): string {
  return `the change is dropped and its frame was never confirmed: commit ${recordPath(id)} and its folder alone, and make the other work a new change`;
}

/** The lint's words for a confirmed line on a ticket's record (`carefulBreaches`), which the commit refuses. */
const TICKET_CONFIRMED =
  "a ticket's record holds no confirmed line: its frame is its planning change's, so the owner's confirming words stand in the confirmed line of the planning change's record; take the line out here";

/** The way forward that puts the restatement to the owner, the same on every harness. */
const PUT_IT =
  "put it to them, by a card or in the reply that ends your turn, and wait for their words";

/**
 * Why a careful frame's confirmation is not held, in the words the doors
 * give by state (J-223 S1; frame's references page, the careful depth), or
 * undefined where it is: the frame not whole, its gaps named; whole and its
 * restatement not put; put and unanswered; answered and not quoted; or the
 * quoted words not held by a message after the ask. Each clause says what
 * is missing and what to do next.
 * @param id the change
 * @param gaps the frame's gaps (`carefulFrameGaps`), none where it is whole
 * @param state where the confirmation stands
 * @returns the clause, or undefined where the confirmation is held
 */
export function frameUnconfirmed(
  id: string,
  gaps: readonly RecordBreach[],
  state: ConfirmState,
): string | undefined {
  if (gaps.length > 0) return `the frame is not whole: ${breachesLine(id, gaps)}`;
  switch (state.kind) {
    case "held":
      return undefined;
    case "missing":
      return `${recordPath(id)} holds no confirmed line: put the frame's restatement to the owner, by a card or in the reply that ends your turn, and quote their confirming words in confirmed: "<their words>"`;
    case "not-put":
      return `the frame is whole and its restatement has not been put to the owner: ${PUT_IT}`;
    case "unanswered":
      return "the restatement was put to the owner and they have not answered: end your turn and wait for their words";
    case "answered":
      return 'the owner answered after the restatement was put: where their words confirm it, quote them as they said them in confirmed: "<their words>", and otherwise revise the frame and put it again';
    case "before":
      return `the confirmed line quotes "${state.words}", said before the restatement was put to the owner, and an earlier answer, the yes to the proposal or an interview's among them, never confirms the frame: ${PUT_IT}, then quote their later words`;
    case "unheld":
      return `the confirmed line quotes "${state.words}", which no message of the owner's since the restatement was put holds: quote their words as they said them`;
    case "no":
      return `the confirmed line quotes "${state.words}", and the owner's message that holds it confirms nothing, a question, a negation or a contrast confirming nothing: answer what it asks, revise the frame where it asks, and put it again`;
  }
}

/**
 * Whether a commit may carry a careful record's `confirmed` line (J-223 S1),
 * the yes's twin: a line HEAD's commit does not carry the same is held by a
 * message of the owner's the hooks journaled after the restatement was put
 * to them, on every commit, a commit of the homes alone included, a merge's
 * among them; where no hook journaled, the line's presence is read. A line
 * HEAD's commit or a merged commit carries on the careful record with the
 * same words is settled (J-223 S1, after the falsifier's reading), only
 * where that commit holds the record with no ticket line. A ticket's record
 * holds no confirmation of its own, its frame its planning change's, so a
 * line staged there on a careful ticket is refused in the lint's words.
 * @param id the change
 * @param record the record's lines as the commit would carry them
 * @param carried the record's lines as HEAD's commit and each merged commit hold them
 * @param journal the owner's timed messages and the ask's time
 * @returns the verdict
 */
export function confirmedVerdict(
  id: string,
  record: RecordFacts | undefined,
  carried: readonly (RecordFacts | undefined)[],
  journal: ConfirmJournal,
): HookVerdict {
  if (!carefulHeld(record) || record?.confirmed === undefined) return ALLOW;
  // A ticket's record holds no confirmation: its frame is its planning change's (after the falsifier's second reading).
  if (record.ticket !== undefined)
    return refuse(
      `the change waits for the owner's confirmation of the frame: ${TICKET_CONFIRMED}`,
      "frame-confirmed",
    );
  const confirmed = record.confirmed;
  if (
    carried.some(
      (each) =>
        each?.mode === CAREFUL_MODE && each.ticket === undefined && each.confirmed === confirmed,
    )
  )
    return ALLOW;
  // Every line HEAD's commit carries was judged at the commit that brought it, whatever the record's state then,
  // so a line carried on the careful record with no ticket line is settled and needs no state of its own.
  const state = confirmState(record.confirmed, journal);
  const unheld = frameUnconfirmed(id, [], state);
  if (unheld === undefined) return ALLOW;
  if (record.state === "dropped")
    return refuse(
      `the change is dropped and its confirmed line quotes "${confirmed}", which no message of the owner's after the restatement was put confirms: take the line out, commit ${recordPath(id)} and its folder alone, and make the other work a new change`,
      "frame-confirmed",
    );
  return refuse(
    `the change waits for the owner's confirmation of the frame: ${unheld}`,
    "frame-confirmed",
  );
}

/**
 * Whether a commit may stage a path outside the change's homes at careful
 * (J-223 S1): not while the frame is not whole or the owner's words after
 * its restatement was put do not confirm it; a commit of the homes alone
 * passes, the record-first commit and a stop's among them.
 * @param id the change
 * @param record the record's lines as the commit would carry them
 * @param gaps the frame's gaps, none where it is whole, undefined where the record is not careful
 * @param paths the paths the commit stages, from the root
 * @param journal the owner's timed messages and the ask's time, none kept where the line is settled or no hook journaled
 * @returns the verdict
 */
export function outsideConfirmVerdict(
  id: string,
  record: RecordFacts | undefined,
  gaps: readonly RecordBreach[] | undefined,
  paths: readonly string[],
  journal: ConfirmJournal,
): HookVerdict {
  if (!carefulHeld(record)) return ALLOW;
  const unheld = frameUnconfirmed(id, gaps ?? [], confirmState(record?.confirmed, journal));
  return outsideClauseVerdict(
    id,
    paths,
    unheld !== undefined && record?.state === "dropped" ? droppedUnconfirmed(id) : unheld,
  );
}

/**
 * Whether a commit may stage a path outside the change's homes while the
 * doors name a careful frame unconfirmed (J-223 S1, after the falsifier's
 * second reading): the clause the before-write door gives, a ticket's
 * naming its planning change's record or the cure where none is found.
 * @param id the change the commit is made under, whose homes the paths are read against
 * @param paths the paths the commit stages, from the root
 * @param clause what the frame lacks and what to do next, undefined where it holds
 * @returns the verdict
 */
export function outsideClauseVerdict(
  id: string,
  paths: readonly string[],
  clause: string | undefined,
): HookVerdict {
  if (clause === undefined) return ALLOW;
  const outside = paths.find((path) => !inHomes(path, id));
  if (outside === undefined) return ALLOW;
  return refuse(
    `at careful nothing outside the change's homes is committed before the owner confirms the frame: the commit stages ${outside}, outside .greenline/ledger/, and ${clause}; commit ${recordPath(id)} and its folder alone until then`,
    "frame-confirmed",
  );
}

/** One check fact with the file it came from. */
export interface RecordedFact {
  readonly file: string;
  readonly facts: CheckFacts;
}

/** A recorded run's text, its arguments joined as given, never split again, with its directory where that is not the root. */
function runText(facts: CheckFacts): string {
  const text = facts.arguments.join(" ");
  return facts.dir === undefined ? text : `${text} in ${facts.dir}`;
}

function latestFirst(a: RecordedFact, b: RecordedFact): number {
  return a.facts.startedAt < b.facts.startedAt ? 1 : a.facts.startedAt > b.facts.startedAt ? -1 : 0;
}

/** How a recorded run ended, for a refusal's words; undefined when it passed. */
function notGreen(facts: CheckFacts): string | undefined {
  if (facts.state === "started") return "is still started, with no outcome";
  switch (facts.outcome.kind) {
    case "exited":
      return facts.outcome.code === 0 ? undefined : `exited ${String(facts.outcome.code)}`;
    case "signalled":
      return `was ended by ${facts.outcome.signal}`;
    case "unstarted":
      return "could not start";
  }
}

/**
 * Whether a commit may set a record's state to done over its forms (J-149
 * S1, S3; the ledger guide, "The sections" and "Planned work"): a record the
 * lint finds a breach in is refused, one line naming the first breach and
 * how many more stand, which `greenline status --change <id>` names each.
 * @param id the change whose staged record sets `state: done`
 * @param breaches the lint's breaches of the record as the commit carries it
 * @returns the verdict
 */
export function recordFormVerdict(id: string, breaches: readonly RecordBreach[]): HookVerdict {
  if (breaches.length === 0) return ALLOW;
  return refuse(
    `change ${id} is not done while its record breaks its form: ${breachesLine(id, breaches)}; correct ${recordPath(id)} and commit the close again`,
    "record-form",
  );
}

/**
 * Whether a commit may carry a change record `greenline status` cannot
 * read (J-208 S1, the run j196t-conduct-emptyc, whose done commit carried
 * two picture helpers in `starts` and left status refusing the record as
 * GL0401): one parser reads a record, status's, so the hooks refuse a
 * record it refuses, the first sentence status's own, at any state the
 * commit stages. A record the parser reads is held by the lint's doors as
 * before.
 * @param id the change whose record the commit carries
 * @param issues the parser's issues in one line, undefined where status reads the record
 * @returns the verdict
 */
export function recordReadVerdict(id: string, issues: string | undefined): HookVerdict {
  if (issues === undefined) return ALLOW;
  return refuse(
    `the change record '${id}' does not parse: ${issues}; greenline status reads no record that does not parse, so correct ${recordPath(id)} and commit again`,
    "record-form",
  );
}

/**
 * Whether a change's first commit, the one that first carries its record,
 * may carry the record's agent line (J-192 S1): a line naming a model
 * family alone, where the harness reports the model, is refused with the
 * line to write, since every commit's trailer carries it from here on; the
 * done commit's lint reads it again.
 * @param id the change whose first commit carries its record
 * @param breaches the lint's agent breaches of the record as the commit carries it
 * @returns the verdict
 */
export function firstCommitVerdict(id: string, breaches: readonly RecordBreach[]): HookVerdict {
  const first = breaches.find((breach) => breach.rule === "agent");
  if (first === undefined) return ALLOW;
  return refuse(
    `change ${id}'s first commit carries its record, and ${first.message}; correct ${recordPath(id)} and commit again`,
    "record-form",
  );
}

/**
 * Whether a commit may set a record's state to done: the latest run
 * `greenline check` recorded of each declared check, read by its name, its
 * command and its directory, and of every check the change recorded, by its
 * arguments and its directory, must have passed. A run marked a probe is no
 * run of a check; a run a hook recorded is not read, since only `check`
 * vouches for a run.
 * @param id the change whose staged record sets `state: done`
 * @param declared the workspace's declared checks
 * @param facts the change's check facts
 * @returns the verdict
 */
export function doneVerdict(
  id: string,
  declared: readonly DeclaredCheck[],
  facts: readonly RecordedFact[],
): HookVerdict {
  const runs = facts.filter((fact) => fact.facts.probe !== true).sort(latestFirst);
  const path = recordPath(id);
  const where = (fact: RecordedFact): string => `.greenline/ledger/${id}/${fact.file}`;
  for (const check of declared) {
    const latest = runs.find((fact) => isRunOf(check, fact.facts));
    if (latest === undefined)
      return refuse(
        `the change cannot be marked done yet: ${path} sets state: done, and greenline check recorded no run of the declared check '${check.name}' (${checkWhere(check)}); run it with greenline check -- ${check.command}${check.dir === ROOT_DIR ? "" : `, which runs it in ${check.dir}`}`,
        "done-checks",
      );
    const ended = notGreen(latest.facts);
    if (ended !== undefined)
      return refuse(
        `the change cannot be marked done yet: ${path} sets state: done, and the latest recorded run of the declared check '${check.name}' ${ended} (${where(latest)}); run it again with greenline check until it passes, or keep the record open`,
        "done-checks",
      );
  }
  const seen = new Set<string>();
  for (const fact of runs) {
    const key = JSON.stringify([fact.facts.dir ?? ROOT_DIR, fact.facts.arguments]);
    if (seen.has(key)) continue;
    seen.add(key);
    const ended = notGreen(fact.facts);
    if (ended !== undefined)
      return refuse(
        `the change cannot be marked done yet: ${path} sets state: done, and the latest recorded run of the check '${runText(fact.facts)}' ${ended} (${where(fact)}); run it again with greenline check until it passes, or keep the record open`,
        "done-checks",
      );
  }
  return ALLOW;
}

/**
 * Whether a commit may set an interface change's record to done while the
 * render is owed (J-133 S1; `./interface-pages.ts`): on a change whose
 * record says `interface: yes` and that the declared interface check holds,
 * each page the change touched carries a capture at the three widths or the
 * browser limit the engine named, made after its files last changed, and a
 * file no page names waits for one render after it changed. The static
 * engines' runs after each write never settle it.
 * @param id the change whose staged record sets `state: done`
 * @param owed what the render still owes, undefined where nothing is
 * @returns the verdict
 */
export function renderVerdict(id: string, owed: TouchedPages | undefined): HookVerdict {
  if (owed === undefined) return ALLOW;
  // A limit the record does not name yet: the line that names it, never a capture it cannot make (J-191 S1).
  const limits = owed.limits ?? [];
  if (limits.length > 0)
    return refuse(
      `the interface change cannot be marked done yet: ${recordPath(id)} sets state: done, and ${limitsOwedText(limits)}, so the owner sees what was not captured; or capture it with ${CAPTURE_COMMAND}, or keep the record open`,
      "interface-captures",
    );
  return refuse(
    `the interface change cannot be marked done yet: ${recordPath(id)} sets state: done, and the interface check recorded no capture and no named browser limit since the files last changed for ${renderOwedText(owed)}; run ${CAPTURE_COMMAND} for each page, which keeps the captures at 1440, 768 and 390 or, where no browser runs, names the limit in its fact's browser field, and on a platform no browser renders ${SCREEN_COMMAND} for each screen, which names that limit, or keep the record open`,
    "interface-captures",
  );
}

/** The cure for a rewritten page the record's refreshes do not name, as the door and the atlas line say it (J-227 S1). */
export const UNNAMED_CURE = "name each with the agent that refreshed it and its cost";

/** The owner's words in a record's close that leave the touched pages unrefreshed (J-147 S3). */
const LEAVE_PAGES = "leave the pages";

/** The touched pages the close refreshes by itself; past these nothing is held and the offer stands (J-147 S3). */
export const REFRESH_CAP = 3;

/**
 * Whether a commit may set a change's record to done while the pages it
 * touched drift (J-147 S3; the register's row of 2026-10-28 on the offer
 * at every turn and the permanent pages refreshed at the close): an atlas
 * page or journey whose covered files the change touched, or the map when
 * such a page changed, that drifted and that the record's `refreshes` name
 * nowhere holds done, up to three pages; past three nothing is held and the
 * close's offer stands, and the owner's words in the record's close, "leave
 * the pages", lift it, as a named browser limit lifts the capture's. A page
 * the change rewrote that the record's `refreshes` name nowhere holds done
 * whatever the owner's words and however many, since the refresh was made
 * and naming it costs one line (J-227 S1).
 * @param id the change whose staged record sets `state: done`
 * @param owed the touched pages that drift and no refresh names, by name
 * @param unnamed the pages, journeys and the map the change rewrote that no refresh names, by name
 * @param closeText the staged record's close section, undefined where it holds none
 * @returns the verdict
 */
export function refreshVerdict(
  id: string,
  owed: readonly string[],
  unnamed: readonly string[],
  closeText: string | undefined,
): HookVerdict {
  // A refresh made is a refresh named (J-227 S1, j201t-linear-visuals finding 15).
  if (unnamed.length > 0)
    return refuse(
      `the change cannot be marked done yet: ${recordPath(id)} sets state: done, and the change rewrote ${unnamed.join(", ")}, which the record's refreshes line does not name; ${UNNAMED_CURE}, as refreshes: [{ by: <skill>, pages: "${unnamed.join(", ")}", cost: "<the agent and its time>" }], since a refresh made is a refresh named`,
      "atlas-refresh",
    );
  if (owed.length === 0 || owed.length > REFRESH_CAP) return ALLOW;
  if (closeText?.toLowerCase().includes(LEAVE_PAGES) === true) return ALLOW;
  return refuse(
    `the change cannot be marked done yet: ${recordPath(id)} sets state: done, and the ${owed.length === 1 ? "page" : "pages"} it touched, ${owed.join(", ")}, drifted with no refresh; have one fresh agent refresh ${owed.length === 1 ? "it" : "them"} and name the refresh in the record's refreshes, or write the owner's words "${LEAVE_PAGES}" in its close`,
    "atlas-refresh",
  );
}

/**
 * Whether a commit may carry a discussion record as it stages it (J-118 S1
 * and S3): the record must read as the ledger guide gives its form, and a
 * state it moves from HEAD's must come with words of the owner's the record
 * did not hold before, since a discussion's state is set on the owner's
 * word and never by the agent alone. A record the commit removes, or one
 * HEAD holds in a form that does not read, moves no state the hook can
 * judge.
 * @param id the discussion
 * @param staged the record's text as the commit stages it, undefined when the commit removes it
 * @param head the record's text in HEAD, undefined when HEAD holds none
 * @returns the verdict
 */
export function discussionRecordVerdict(
  id: string,
  staged: string | undefined,
  head: string | undefined,
): HookVerdict {
  if (staged === undefined) return ALLOW;
  const path = discussionPath(id);
  const read = parseDiscussionRecord(`${id}.md`, staged);
  if (read._tag === "err")
    return refuse(
      `the discussion cannot be committed as it stands: ${path} does not read as a discussion record (${read.error.issues
        .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
        .join(", ")}); correct it as .greenline/ledger/README.md, "Discussions", gives its form`,
      "discussion-form",
    );
  const before = head === undefined ? undefined : parseDiscussionRecord(`${id}.md`, head);
  if (before === undefined || before._tag === "err") return ALLOW;
  const from = before.value.state;
  const to = read.value.state;
  if (from === to || (read.value.words !== undefined && read.value.words !== before.value.words))
    return ALLOW;
  const held = before.value.words === undefined ? "none" : `"${before.value.words}"`;
  return refuse(
    `the discussion's move from ${from} to ${to} needs the owner's word: ${path} keeps the words line it held before, ${held}; quote the owner's words that set ${to} in its words line`,
    "discussion-words",
  );
}

/**
 * The commit message's text with git's comment lines and everything below
 * a scissors line left out, as git strips it.
 * @param message the message file's text
 * @returns whether anything but white space remains
 */
export function messageHasText(message: string): boolean {
  const kept: string[] = [];
  for (const line of message.split("\n")) {
    if (/^# -+ >8 -+$/.test(line)) break;
    if (!line.startsWith("#")) kept.push(line);
  }
  return kept.join("\n").trim() !== "";
}

/** A trailer's first line: a key of letters, digits and dashes, a colon and its value. */
const TRAILER_LINE = /^[A-Za-z0-9][A-Za-z0-9-]*:\s/;

/** Where a trailer sorts in the block: the harness's and any other first, the agent's next, the change's last. */
function trailerRank(trailer: string): number {
  const key = trailer.slice(0, trailer.indexOf(":")).toLowerCase();
  if (key === AGENT_TRAILER_KEY.toLowerCase()) return 1;
  if (key === TRAILER_KEY.toLowerCase()) return 2;
  return 0;
}

/**
 * The message with its trailer block in the documented order (J-129 S3;
 * `docs/SPEC.md`, the change's trailer): every other trailer first, a
 * harness's `Co-Authored-By` among them, in the order it stood, then
 * `Greenline-Agent`, then `Greenline-Change` last, an exact duplicate
 * written once. The block is the last paragraph above git's comment lines
 * and its scissors line, and only one made of trailers alone, each with its
 * indented continuation lines; the subject, the body and every comment line
 * are left as they stand, and a message with no such block is returned
 * unchanged.
 * @param message the message file's text
 * @returns the text with the block ordered, the same text where it already is
 */
export function orderTrailerBlock(message: string): string {
  const lines = message.split("\n");
  const scissors = lines.findIndex((line) => /^# -+ >8 -+$/.test(line));
  let end = scissors === -1 ? lines.length : scissors;
  while (end > 0 && (lines[end - 1]?.trim() === "" || lines[end - 1]?.startsWith("#") === true))
    end -= 1;
  let start = end;
  while (start > 0 && lines[start - 1]?.trim() !== "") start -= 1;
  // The subject's paragraph is never a trailer block.
  if (start === 0 || start === end) return message;
  const trailers: string[][] = [];
  for (const line of lines.slice(start, end)) {
    if (TRAILER_LINE.test(line)) trailers.push([line]);
    else if (/^\s/.test(line) && trailers.length > 0) trailers[trailers.length - 1]?.push(line);
    else return message;
  }
  const seen = new Set<string>();
  const ordered = trailers
    .map((group) => group.join("\n"))
    .filter((trailer) => {
      const fresh = !seen.has(trailer);
      seen.add(trailer);
      return fresh;
    })
    .map((trailer, index) => ({ trailer, index }))
    .sort((a, b) => trailerRank(a.trailer) - trailerRank(b.trailer) || a.index - b.index)
    .map((entry) => entry.trailer);
  return [...lines.slice(0, start), ...ordered, ...lines.slice(end)].join("\n");
}

/**
 * Whether a message may stand: it carries no other change's trailer, and
 * one change's trailer at most, so a commit that mixes two tickets of a
 * plan is refused though each trailer stands on the branch (J-143 S1).
 * @param change the change of the branch, if any
 * @param trailers the values of the message's change trailers, as git reads its trailers
 * @returns the verdict
 */
export function trailerVerdict(
  change: BranchChange | undefined,
  trailers: readonly string[],
): HookVerdict {
  if (change === undefined) return ALLOW;
  const other = trailers.find((value) => !change.trailers.includes(value));
  if (other !== undefined)
    return refuse(
      `this commit names change ${other}, but it is made on change ${change.owner}'s branch: the message carries '${TRAILER_KEY}: ${other}', and that branch's commits carry ${change.trailers.length === 1 ? "its own trailer" : "its own trailer or a trailer of its plan's tickets"} alone; commit the work on its own change's branch`,
      "change-trailer",
    );
  const [first, second] = [...new Set(trailers)];
  return first === undefined || second === undefined
    ? ALLOW
    : refuse(
        `this commit names two changes, ${first} and ${second}, and a commit is one change's: the message carries '${TRAILER_KEY}: ${first}' and '${TRAILER_KEY}: ${second}'; commit each ticket's work apart with its own`,
        "one-trailer",
      );
}

/**
 * Whether a change's commit may stage what it stages (J-143 S1): no path
 * under another change's record or folder, `.greenline/ledger/<other>.md`
 * or `.greenline/ledger/<other>/`, since a record and its folder are staged
 * by path, never the ledger whole. A commit that concludes or amends that
 * other change alone is that change's ({@link BranchFacts.alone},
 * {@link concludes}), and the records of a plan's tickets on its planning
 * change's branch are the branch's own.
 * @param change the change of the commit
 * @param paths the paths the commit stages, from the root
 * @param own the other changes the commit is also, those it concludes and the landed one
 * @returns the verdict
 */
export function stagedPathsVerdict(
  change: BranchChange | undefined,
  paths: readonly string[],
  own: readonly string[],
): HookVerdict {
  if (change === undefined) return ALLOW;
  const ours = new Set([change.id, ...change.trailers, ...own]);
  for (const path of paths) {
    const other = changeOfLedgerPath(path);
    if (other !== undefined && !ours.has(other))
      return refuse(
        `this commit would carry change ${other}'s file into change ${change.id}'s work: the commit stages ${path}; unstage it with \`git restore --staged -- ${path}\`, stage this change's record and folder by path, never the ledger whole, and commit the other change's files alone, apart, telling the owner they changed`,
        "other-change-paths",
      );
  }
  return ALLOW;
}

/** One reference update git is about to make: the old object, the new one and the reference. */
export interface RefUpdate {
  readonly old: string;
  readonly next: string;
  readonly ref: string;
}

/**
 * The updates git passes on stdin, one `<old> <new> <ref>` per line.
 * @param input the hook's stdin
 * @returns the updates, a malformed line left out
 */
export function refUpdates(input: string): readonly RefUpdate[] {
  return input.split("\n").flatMap((line) => {
    const [old, next, ref] = line.trim().split(" ");
    return old === undefined || next === undefined || ref === undefined ? [] : [{ old, next, ref }];
  });
}

/** What the rewrite verdicts read beyond the update: the change a branch belongs to, the record, and git's answer on ancestry. */
export interface RewriteFacts {
  readonly changeOf: (branch: string) => BranchChange | undefined;
  /** The record's lines as a commit holds them, HEAD's or the change's branch tip's: only these lift (J-129 S4). */
  readonly recordOf: (id: string) => RecordFacts | undefined;
  /** The record's lines as the working tree holds them, read only to name the commit a refusal asks for. */
  readonly workingOf?: (id: string) => RecordFacts | undefined;
  /** Whether the first object is an ancestor of the second; undefined when git cannot say. */
  readonly isAncestor: (old: string, next: string) => boolean | undefined;
  /** The object a reference names before the transaction, undefined when it names none. */
  readonly currentObject: (ref: string) => string | undefined;
  /** The owner's messages the hooks journaled in every session of the checkout, which a rebase line's words stand in whole (J-193 S1); none kept where no hook saw the owner's text. */
  readonly journal?: OwnerJournal | undefined;
}

/**
 * The refusal of a rebase line whose words no one message of the owner's
 * holds whole (J-193 S1, the run j109t-conduct-runnere, where the line
 * joined "Reword the last commit." and "Your call." from two messages):
 * read where the hooks journaled the owner's messages, as the harness hook
 * reads a discard's and a landing's words.
 */
function unownedRebase(facts: RewriteFacts, id: string, words: string): HookVerdict {
  const journal = facts.journal;
  if (journal?.kept !== true || saidByOwner(words, journal.messages)) return ALLOW;
  return refuse(
    `this would rewrite change ${id}'s history on words that are not the owner's: the rebase line of ${recordPath(id)} says "${words}", ${unownedWords(words, journal.messages)}; a line lifts an act only in the owner's own words, one message of theirs quoted whole, so ask the owner, quote their words there and commit the record alone first`,
    "owned-words",
  );
}

/**
 * What a refusal adds where the working tree's record holds the line a
 * commit does not: the line lifts only once committed, and the commit to
 * make (J-129 S4).
 */
function uncommittedHint(facts: RewriteFacts, id: string, line: "rebase" | "landing"): string {
  if (facts.workingOf?.(id)?.[line] === undefined) return "";
  const path = recordPath(id);
  return `; ${path} holds the ${line} line only in the working tree, and a line lifts only once committed: commit the record first, \`${commitFirst(path)}\`, then run it again`;
}

/**
 * Whether a transaction may update a change's branch: an update whose old
 * object is not an ancestor of the new rewrites the change's history, by an
 * amend, a reset to another commit, a finished rebase or a forced branch
 * move, and is refused unless the record carries the owner's `rebase` line.
 * git gives a forced move's old object as zeros, as `branch -f` and
 * `update-ref` do, so the branch's current object is read in its place. A
 * branch made or deleted, and an update git cannot read, is let through.
 * @param updates the transaction's updates
 * @param facts what the verdict reads
 * @returns the verdict
 */
export function rewriteVerdict(updates: readonly RefUpdate[], facts: RewriteFacts): HookVerdict {
  for (const update of updates) {
    const branch = branchOfRef(update.ref);
    if (branch === undefined || ZERO.test(update.next)) continue;
    const change = facts.changeOf(branch);
    if (change === undefined) continue;
    const old = ZERO.test(update.old) ? facts.currentObject(update.ref) : update.old;
    if (old === undefined || old === update.next) continue;
    if (facts.isAncestor(old, update.next) !== false) continue;
    const words = facts.recordOf(change.owner)?.rebase;
    if (words !== undefined) {
      const unowned = unownedRebase(facts, change.owner, words);
      if (unowned.kind === "refuse") return unowned;
      continue;
    }
    return refuse(
      `this would rewrite change ${change.owner}'s history without the owner's word: the update of ${update.ref} from ${old.slice(0, 12)} to ${update.next.slice(0, 12)} leaves the old commit behind, and ${recordPath(change.owner)} carries no rebase line with the owner's words in a commit; ask the owner, since no commit of a change is amended, reset away or rebased without them${uncommittedHint(facts, change.owner, "rebase")}`,
      "rebase-words",
    );
  }
  return ALLOW;
}

/**
 * Whether a rebase may start: a rebase of a change's branch is refused
 * unless its record carries the owner's `rebase` line, before any work, as
 * the transaction would refuse it at the end.
 * @param branch the branch to be rebased
 * @param facts what the verdict reads
 * @returns the verdict
 */
export function rebaseVerdict(branch: string | undefined, facts: RewriteFacts): HookVerdict {
  const change = branch === undefined ? undefined : facts.changeOf(branch);
  if (change === undefined) return ALLOW;
  const words = facts.recordOf(change.owner)?.rebase;
  if (words !== undefined) return unownedRebase(facts, change.owner, words);
  return refuse(
    `this rebase would rewrite change ${change.owner}'s history without the owner's word: the branch ${branch ?? ""} is that change's, and ${recordPath(change.owner)} carries no rebase line with the owner's words in a commit; ask the owner first${uncommittedHint(facts, change.owner, "rebase")}`,
    "rebase-words",
  );
}

/** One ref a push would update: the local ref and object, and the remote ref and object. */
export interface PushUpdate {
  readonly localRef: string;
  readonly localObject: string;
  readonly remoteRef: string;
  readonly remoteObject: string;
}

/**
 * The updates git passes to pre-push, one
 * `<local-ref> <local-object> <remote-ref> <remote-object>` per line.
 * @param input the hook's stdin
 * @returns the updates, a malformed line left out
 */
export function pushUpdates(input: string): readonly PushUpdate[] {
  return input.split("\n").flatMap((line) => {
    const [localRef, localObject, remoteRef, remoteObject] = line.trim().split(" ");
    return localRef === undefined ||
      localObject === undefined ||
      remoteRef === undefined ||
      remoteObject === undefined
      ? []
      : [{ localRef, localObject, remoteRef, remoteObject }];
  });
}

/** What the push verdict reads beyond the rewrite facts: whether git holds an object, the branch HEAD names and the default branch. */
export interface PushFacts extends RewriteFacts {
  readonly hasObject: (object: string) => boolean;
  /** The branch HEAD names, whose change a push of `HEAD` carries; undefined when detached or unread. */
  readonly current?: string | undefined;
  /** Whether a branch is the remote's default branch (J-139 S1); none is where unread. */
  readonly isDefault?: ((branch: string) => boolean) | undefined;
  /** The change a commit pushed from a branch other than the default one carries, from its records, where the branch holds none open (J-139 S1). */
  readonly pushedChangeOf?: ((object: string) => string | undefined) | undefined;
  /** The change records a commit holds `open` or `stopped`, by id and state: what a push of it to the default branch would land unfinished (J-139 S1). */
  readonly unfinishedAt?: ((object: string) => readonly UnfinishedRecord[]) | undefined;
}

/** A change record a commit holds unfinished: its id and its state. */
export interface UnfinishedRecord {
  readonly id: string;
  readonly state: string;
}

/** How a record stands in a commit, as a refusal of an early push says it. */
function standingIn(record: RecordFacts | undefined): string {
  if (record === undefined) return "is in no commit";
  if (!record.readable) return "does not read in a commit";
  return record.state === undefined
    ? "states no state in a commit"
    : `stands ${record.state} in a commit`;
}

/** The refusal of a push that would land a change on the default branch before its close (J-139 S1). */
function earlyPushReason(update: PushUpdate, id: string, standing: string): HookVerdict {
  return refuse(
    `this push would put change ${id} on the default branch before its close: the push updates ${update.remoteRef}, and ${recordPath(id)} ${standing}; finish the review, the verify and the close first, or the owner pushes, since a change reaches the default branch only once its close sets the record done, whatever its landing line holds`,
    "push-before-close",
  );
}

/**
 * The change a push's update carries: the one whose branch the remote or
 * the local reference names; for a push to the default branch from `HEAD`
 * or an object, the change of the branch HEAD names; and for a push of
 * that branch where no change stands open, the one the commit pushed
 * carries in its records, a done change's landing push among them (J-139
 * S1).
 */
function changeOfUpdate(
  update: PushUpdate,
  facts: PushFacts,
  toDefault: boolean,
): BranchChange | undefined {
  const local = branchOfRef(update.localRef);
  const named = [branchOfRef(update.remoteRef), local]
    .flatMap((branch) => (branch === undefined ? [] : [facts.changeOf(branch)]))
    .find((found) => found !== undefined);
  if (named !== undefined) return named;
  // The branch HEAD names, pushed as itself or as `HEAD`: its open change, else the change of the commit pushed.
  const ownPush = local === undefined ? toDefault : local === facts.current;
  if (!ownPush || facts.current === undefined) return undefined;
  const open = local === undefined ? facts.changeOf(facts.current) : undefined;
  if (open !== undefined) return open;
  // A done change's landing push finds its record in the commit pushed, as the harness hook does.
  const carried = facts.pushedChangeOf?.(update.localObject);
  return carried === undefined
    ? undefined
    : { id: carried, owner: carried, via: "open", trailers: [carried] };
}

/**
 * Whether a push may go on: no push of a change's branch while its record
 * lacks the owner's `landing` line, and no force push of it, read as a
 * remote object the local one does not descend from, unless its `rebase`
 * line holds the owner's words for the rewrite too, as a history cleanup
 * after a push asks (J-114 S3). A remote object git does not hold shows no
 * rewrite, so it is let through. A push that carries a change to the
 * default branch goes on only once the change's record is `done` in a
 * commit, whatever its landing line holds, so the close comes first, and
 * a commit pushed there that holds any change record `open` or `stopped`
 * is refused, whatever the working tree holds (J-139 S1); a local
 * landing's base push after the merge carries no open change and is let
 * through as before (J-130 S1).
 * @param updates the push's updates
 * @param facts what the verdict reads
 * @returns the verdict
 */
export function pushVerdict(updates: readonly PushUpdate[], facts: PushFacts): HookVerdict {
  for (const update of updates) {
    const remote = branchOfRef(update.remoteRef);
    const toDefault =
      remote !== undefined && facts.isDefault?.(remote) === true && !ZERO.test(update.localObject);
    // The commit pushed is read for every record it holds unfinished, whatever the working tree holds.
    const [held] = toDefault ? (facts.unfinishedAt?.(update.localObject) ?? []) : [];
    if (held !== undefined)
      return earlyPushReason(update, held.id, `stands ${held.state} in a commit`);
    const change = changeOfUpdate(update, facts, toDefault);
    if (change === undefined) continue;
    const path = recordPath(change.owner);
    const record = facts.recordOf(change.owner);
    if (toDefault && record?.state !== "done")
      return earlyPushReason(update, change.owner, standingIn(record));
    if (record?.landing === undefined)
      return refuse(
        `this push waits for the owner's word on the landing: the push updates ${update.remoteRef}, ${toDefault ? `the default branch, with change ${change.owner}` : `change ${change.owner}'s branch`}${record?.state === "open" ? ", mid-change while the record is open," : ","} and ${path} ${record?.declined === undefined ? "carries no landing line with the owner's words in a commit" : `holds in its landing line the owner's answer declining the landing, "${record.declined}", which lifts no push`}; ask the owner, since no push, pull request or merge goes ahead without them${uncommittedHint(facts, change.owner, "landing")}`,
        "landing-words",
      );
    if (ZERO.test(update.remoteObject) || ZERO.test(update.localObject)) continue;
    if (!facts.hasObject(update.remoteObject)) continue;
    const rewrites = facts.isAncestor(update.remoteObject, update.localObject) === false;
    if (rewrites && record.rebase !== undefined) {
      const unowned = unownedRebase(facts, change.owner, record.rebase);
      if (unowned.kind === "refuse") return unowned;
    }
    if (rewrites && record.rebase === undefined)
      return refuse(
        `this push would write over change ${change.owner}'s pushed history without the owner's word: the push moves ${update.remoteRef} from ${update.remoteObject.slice(0, 12)} to ${update.localObject.slice(0, 12)}, which does not descend from it, and ${path} carries no rebase line with the owner's words for the rewrite beside its landing line; ask the owner first${uncommittedHint(facts, change.owner, "rebase")}`,
        "force-push-words",
      );
  }
  return ALLOW;
}

/** The git version a registration is chosen by, as `git --version` gives it. */
export type GitVersion = readonly [number, number, number];

/**
 * The version `git --version` prints.
 * @param output git's output, such as `git version 2.54.0`
 * @returns the version, or undefined when it does not read
 */
export function gitVersionOf(output: string): GitVersion | undefined {
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? "0")];
}

/** The first git that runs hooks from its configuration. */
const CONFIG_HOOKS: GitVersion = [2, 54, 0];

function atLeast(version: GitVersion, least: GitVersion): boolean {
  for (const index of [0, 1, 2] as const) {
    if (version[index] !== least[index]) return version[index] > least[index];
  }
  return true;
}

/** How the hooks are registered, or why they are not. */
export type Registration =
  | { readonly kind: "config" }
  | { readonly kind: "hooks-path" }
  | { readonly kind: "manual"; readonly reason: string };

/**
 * How `init` and `sync` register the hooks, in the research page's order: on
 * git 2.54 or later, config-based hooks in the repository's local
 * configuration, which run beside an owner's hooks, the hookdir's own last;
 * on an older git with no `core.hooksPath` and no hook of the owner's,
 * `core.hooksPath` set to `.greenline/hooks`; otherwise nothing, since
 * setting the path would stop the owner's hooks or a manager's from running,
 * and the one line to add is printed instead.
 * @param version the git version, undefined when git cannot say
 * @param hooksPath the `core.hooksPath` the repository sets, undefined when none
 * @param ownerHooks the hooks in the repository's hook directory, git's samples left out
 * @returns the registration
 */
export function registrationFor(
  version: GitVersion | undefined,
  hooksPath: string | undefined,
  ownerHooks: readonly string[],
): Registration {
  if (version === undefined)
    return { kind: "manual", reason: "git's version cannot be read, so no registration is safe" };
  if (atLeast(version, CONFIG_HOOKS)) return { kind: "config" };
  if (hooksPath === HOOKS_DIRECTORY) return { kind: "hooks-path" };
  if (hooksPath !== undefined)
    return {
      kind: "manual",
      reason: `git ${version.join(".")} runs hooks only from core.hooksPath, which is set to '${hooksPath}', a hook manager's or the owner's`,
    };
  if (ownerHooks.length > 0)
    return {
      kind: "manual",
      reason: `git ${version.join(".")} runs hooks from one directory, and the repository's holds the owner's ${ownerHooks.join(", ")}`,
    };
  return { kind: "hooks-path" };
}

/**
 * The line to add to an owner's hooks or manager when nothing could be registered.
 * @returns the line, one sentence with the hooks named
 */
export function manualLine(): string {
  return `add '${HOOKS_DIRECTORY}/<hook> "$@"' as a line of each of your hooks ${GIT_HOOK_NAMES.join(", ")} (a husky hook file, a lefthook command or a local pre-commit hook), or use git 2.54 or later, where greenline registers them beside yours`;
}

/** One change a local merge lands: its id and the record's lines in the commit merged. */
export interface MergedChange {
  readonly id: string;
  readonly record: RecordFacts | undefined;
}

/** Whether the owner's words name a branch, read where the guardrails read a forced push's (J-173 S1). */
export { wordsName };

/**
 * Whether a local merge may go on (J-148 S2): a merge that lands a change
 * runs only into a base the owner's words in the change's committed
 * `landing` line name, as the landing's offer names the base and asks
 * once, so a merge into a base the owner did not name, or one with no
 * words at all, is refused at the merge commit's own hook, naming the base
 * and the line to write. A merge that lands no change, a change's branch
 * updated from its base among them, goes on.
 * @param base the branch the merge commit lands on, undefined on a detached HEAD
 * @param merged the changes the merge lands, each with its record as the merged commit holds it
 * @returns the verdict
 */
export function mergeBaseVerdict(
  base: string | undefined,
  merged: readonly MergedChange[],
): HookVerdict {
  const onto = base ?? "a detached HEAD";
  for (const { id, record } of merged) {
    const path = recordPath(id);
    if (record?.landing === undefined)
      return refuse(
        `this merge would land change ${id} on ${onto}, and ${path} ${record?.declined === undefined ? "carries no landing line with the owner's words in the commit merged" : `holds in its landing line the owner's answer declining the landing, "${record.declined}", which lifts no merge`}; ask the owner, naming the base, write their words in the landing line as \`landing: "merge into <base>: <their words>"\`, commit the record on the change's branch and merge again`,
        "landing-words",
      );
    if (base === undefined || !wordsName(record.landing, base))
      return refuse(
        `this merge would land change ${id} on ${onto}, a base the owner's words in its landing line do not name, "${record.landing}"; ask the owner once, naming ${base === undefined ? "the base" : base}, write their words as \`landing: "merge into ${base ?? "<base>"}: <their words>"\`, commit the record on the change's branch and merge again, or merge into the base they named`,
        "landing-words",
      );
  }
  return ALLOW;
}
