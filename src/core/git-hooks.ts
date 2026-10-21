import { z } from "zod";
import { isChangeId } from "./change.ts";
import { checkWhere, isRunOf, ROOT_DIR, type DeclaredCheck } from "./checks.ts";
import type { CheckFacts } from "./facts.ts";
import { fieldData, parseFrontMatter } from "./front-matter.ts";

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
  readonly landing?: string | undefined;
  readonly rebase?: string | undefined;
  /** The plan the record belongs to, and its ticket when it is one. */
  readonly plan?: string | undefined;
  readonly ticket?: string | undefined;
  /** The agents the cost states, the builder counted. */
  readonly agents?: number | undefined;
  /** Whether the record's close section holds anything but its `none at` line. */
  readonly closeWritten?: boolean | undefined;
}

/** A line of text the record states, read as absent when it is anything else. */
const line = z.string().min(1).optional().catch(undefined);

/** The front-matter lines a hook reads, each absent where the record states none or states another form. */
const RECORD_LINES = z.object({
  mode: line,
  state: line,
  next: line,
  choice: line,
  landing: line,
  rebase: line,
  plan: line,
  ticket: line,
  agents: z.number().int().optional().catch(undefined),
});

/** Whether a record's body holds a close section with text of its own. */
function closeWritten(body: string): boolean {
  const lines = body.split("\n");
  const at = lines.findIndex((text) => /^## close\s*$/.test(text));
  if (at === -1) return false;
  const after = lines.slice(at + 1);
  const next = after.findIndex((text) => text.startsWith("## "));
  const section = (next === -1 ? after : after.slice(0, next)).join("\n").trim();
  return section !== "" && !section.startsWith("none at ");
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
  const lines = RECORD_LINES.parse(fieldData(document.value.fields));
  return { readable: true, ...lines, closeWritten: closeWritten(document.value.body) };
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
  /** The changes whose record HEAD holds open and the index holds finished or stopped: the commit being made is theirs. None when absent. */
  readonly finishing?: readonly string[] | undefined;
}

/** The change a branch belongs to, and how it was found. */
export interface BranchChange {
  /** The change the work belongs to: on a planning change's branch, the one open ticket of its plan, else the branch's own change. */
  readonly id: string;
  /** The change whose branch it is, whose record carries the owner's `rebase` and `landing` words. */
  readonly owner: string;
  /** By the branch's name, `greenline/<id>`, or as the one open change of the branch HEAD names. */
  readonly via: "branch" | "open";
  /** The trailers a commit on the branch may carry: its change's and, on a planning change's branch, those of the plan's tickets. */
  readonly trailers: readonly string[];
}

/** The prefix of a change's own branch. */
const CHANGE_BRANCH = "greenline/";

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
  readonly via: "branch" | "open";
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
    if (isChangeId(id)) return { owner: id, via: "branch" };
  }
  if (branch !== facts.current) return undefined;
  // The default branch of a repository with a remote holds no open change, but the one
  // commit there that finishes or stops a change, a local landing's close, is that change's.
  if (facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch)) {
    const [only, ...others] = closedHere(facts);
    return only !== undefined && others.length === 0 ? { owner: only, via: "open" } : undefined;
  }
  const finishing = facts.finishing ?? [];
  const open = facts.records.filter(
    (entry) => entry.facts.state === "open" || finishing.includes(entry.id),
  );
  const planning = open.filter(
    (entry) => entry.facts.plan !== undefined && entry.facts.ticket === undefined,
  );
  const lead = planning.length === 1 ? planning[0] : undefined;
  // A planning change shares its branch with its tickets, which stay open beside it.
  const owner =
    open.length === 1
      ? open[0]
      : lead !== undefined && open.every((entry) => entry.facts.plan === lead.facts.plan)
        ? lead
        : undefined;
  return owner === undefined ? undefined : { owner: owner.id, via: "open" };
}

/**
 * The change a branch belongs to: the change a `greenline/<id>` branch names,
 * or, for the branch HEAD names, the one open change its working tree holds,
 * on the default branch only where the repository has no remote, or else the
 * one change the commit being made finishes or stops there; none when no
 * fact says which. On a
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
  const found = ownerOf(branch, facts);
  if (found === undefined) return undefined;
  const lead = facts.records.find((entry) => entry.id === found.owner)?.facts;
  const plan = lead?.ticket === undefined ? lead?.plan : undefined;
  const tickets =
    plan === undefined
      ? []
      : facts.records.filter(
          (entry) => entry.facts.plan === plan && entry.facts.ticket !== undefined,
        );
  // A ticket the commit being made finishes or stops is that commit's work, so its closing commit carries its own trailer.
  const finishing = facts.finishing ?? [];
  const open = tickets.filter(
    (entry) => entry.facts.state === "open" || finishing.includes(entry.id),
  );
  const only = open.length === 1 ? open[0] : undefined;
  return {
    ...found,
    id: only?.id ?? found.owner,
    trailers: [found.owner, ...tickets.map((entry) => entry.id)],
  };
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

function refuse(reason: string): HookVerdict {
  return { kind: "refuse", reason };
}

/** A record's path from the root, as every refusal names it. */
export function recordPath(id: string): string {
  return `.greenline/ledger/${id}.md`;
}

/**
 * Whether the branch HEAD names holds no open change: it is no
 * `greenline/<id>` branch, and it is the default branch of a repository with
 * a remote, which is never a change's branch, unless the commit being made
 * finishes or stops a change there, or its working tree holds no record open
 * there, a record the commit being made finishes or stops counted open. Two open changes no fact tells apart are open changes all
 * the same, so they hold this refusal off.
 * @param branch the branch HEAD names
 * @param facts the default branch, the remote and the records
 * @returns true when no change is open on the branch
 */
export function holdsNoChange(branch: string, facts: BranchFacts): boolean {
  if (branch.startsWith(CHANGE_BRANCH) && isChangeId(branch.slice(CHANGE_BRANCH.length)))
    return false;
  // There a commit that finishes or stops a change, a local landing's close, is the change's.
  if (facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch))
    return closedHere(facts).length === 0;
  const finishing = facts.finishing ?? [];
  return !facts.records.some(
    (entry) => entry.facts.state === "open" || finishing.includes(entry.id),
  );
}

/**
 * The one line every hook gives while no change is open on the branch.
 * @param branch the branch HEAD names
 * @returns the fact and the remedy
 */
export function noChangeReason(branch: string): string {
  return `no change is open on ${branch}; open its record under .greenline/ledger/ before the first commit`;
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
  return refuse(noChangeReason(branch));
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
  return `${recordPath(id)}: choice is standing, which proceed ${setting.proceed} does not allow; wait for the owner's yes, the choice line owner or accepted`;
}

/**
 * Whether the commit may go on before the owner's yes: on a change's branch,
 * the record must stand and carry its `choice` line, the owner's yes; a
 * record that is absent or carries none is no yes, and a `standing` choice is
 * the yes only where the `proceed` setting admits the record's mode.
 * @param change the change of the branch, if any
 * @param record the record's lines as the commit would carry them, undefined when it stands nowhere
 * @param setting the manifest's `proceed` and the modes' order
 * @returns the verdict
 */
export function yesVerdict(
  change: BranchChange | undefined,
  record: RecordFacts | undefined,
  setting: ProceedSetting,
): HookVerdict {
  if (change === undefined) return ALLOW;
  const path = recordPath(change.id);
  if (record === undefined)
    return refuse(
      `the branch is change ${change.id}'s and ${path} stands neither staged nor in the working tree, so the owner's yes, the record's choice line, is absent; wait for the owner's yes and open the record first`,
    );
  if (!record.readable)
    return refuse(
      `the front matter of ${path} does not read, so its choice line, the owner's yes, cannot be read; correct the record`,
    );
  if (record.choice === undefined)
    return refuse(
      `${path} carries no choice line, so the owner has not said yes; record the owner's choice before the first commit`,
    );
  const standing = standingReason(change.id, record, setting);
  return standing === undefined ? ALLOW : refuse(standing);
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
        `the staged ${path} sets state: done, and greenline check recorded no run of the declared check '${check.name}' (${checkWhere(check)}); run it with greenline check -- ${check.command}${check.dir === ROOT_DIR ? "" : `, which runs it in ${check.dir}`}`,
      );
    const ended = notGreen(latest.facts);
    if (ended !== undefined)
      return refuse(
        `the staged ${path} sets state: done, and the latest recorded run of the declared check '${check.name}' ${ended} (${where(latest)}); run it again with greenline check until it passes, or keep the record open`,
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
        `the staged ${path} sets state: done, and the latest recorded run of the check '${runText(fact.facts)}' ${ended} (${where(fact)}); run it again with greenline check until it passes, or keep the record open`,
      );
  }
  return ALLOW;
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

/**
 * Whether a message may stand: it carries no other change's trailer.
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
  return other === undefined
    ? ALLOW
    : refuse(
        `the message carries '${TRAILER_KEY}: ${other}', and the commit is on change ${change.owner}'s branch, whose commits carry ${change.trailers.length === 1 ? "its own trailer" : "its own trailer or a trailer of its plan's tickets"} alone`,
      );
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
  readonly recordOf: (id: string) => RecordFacts | undefined;
  /** Whether the first object is an ancestor of the second; undefined when git cannot say. */
  readonly isAncestor: (old: string, next: string) => boolean | undefined;
  /** The object a reference names before the transaction, undefined when it names none. */
  readonly currentObject: (ref: string) => string | undefined;
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
    if (facts.recordOf(change.owner)?.rebase !== undefined) continue;
    return refuse(
      `the update of ${update.ref} from ${old.slice(0, 12)} to ${update.next.slice(0, 12)} rewrites change ${change.owner}'s history (the old commit is not an ancestor of the new), and ${recordPath(change.owner)} carries no rebase line with the owner's words; no commit of a change is amended, reset away or rebased without them`,
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
  if (change === undefined || facts.recordOf(change.owner)?.rebase !== undefined) return ALLOW;
  return refuse(
    `the branch ${branch ?? ""} is change ${change.owner}'s, and ${recordPath(change.owner)} carries no rebase line with the owner's words, so its history is not rewritten`,
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

/** What the push verdict reads beyond the rewrite facts: whether git holds an object. */
export interface PushFacts extends RewriteFacts {
  readonly hasObject: (object: string) => boolean;
}

/**
 * Whether a push may go on: no push of a change's branch while its record
 * lacks the owner's `landing` line, and no force push of it at all, read as
 * a remote object the local one does not descend from. A remote object git
 * does not hold shows no rewrite, so it is let through.
 * @param updates the push's updates
 * @param facts what the verdict reads
 * @returns the verdict
 */
export function pushVerdict(updates: readonly PushUpdate[], facts: PushFacts): HookVerdict {
  for (const update of updates) {
    const change =
      [branchOfRef(update.remoteRef), branchOfRef(update.localRef)]
        .flatMap((branch) => (branch === undefined ? [] : [facts.changeOf(branch)]))
        .find((found) => found !== undefined) ?? undefined;
    if (change === undefined) continue;
    const path = recordPath(change.owner);
    if (facts.recordOf(change.owner)?.landing === undefined)
      return refuse(
        `the push updates ${update.remoteRef}, change ${change.owner}'s branch, and ${path} carries no landing line with the owner's words; no push, pull request or merge goes ahead without them`,
      );
    if (ZERO.test(update.remoteObject) || ZERO.test(update.localObject)) continue;
    if (!facts.hasObject(update.remoteObject)) continue;
    if (facts.isAncestor(update.remoteObject, update.localObject) === false)
      return refuse(
        `the push moves ${update.remoteRef} from ${update.remoteObject.slice(0, 12)} to ${update.localObject.slice(0, 12)}, which does not descend from it, so it is a force push of change ${change.owner}'s branch, which is never pushed over`,
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
