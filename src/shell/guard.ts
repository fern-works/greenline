import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { HOOKS_NOT_INSTALLED_LINE } from "../core/adapters.ts";
import { unreadRecord } from "../core/change.ts";
import {
  changeOfBranch,
  isDefaultBranch,
  recordPath,
  recordReadVerdict,
  ruled,
  stopVerdict,
} from "../core/git-hooks.ts";
import {
  gitInvocations,
  greenlineSyncs,
  guardAct,
  guardLift,
  liftKindOf,
  namedBranches,
  shellWrites,
  syncWaitRefusal,
  type GuardAct,
  type GuardPlace,
  type GuardWords,
  type SpentLift,
} from "../core/guardrails.ts";
import { ledgerWriteRefusal, restoredFolders } from "../core/ledger-files.ts";
import { changeVisualFolders } from "./visuals.ts";
import type { ModesDefinition } from "../core/modes.ts";
import type { OwnerJournal } from "../core/record-lines.ts";
import { spentLifts } from "./lifts.ts";
import { syncWait } from "./sync-ask.ts";
import { commonGitDirectory, findGitRoot } from "./git.ts";
import { worktreesOf } from "./situation.ts";
import {
  branchFacts,
  committedFacts,
  committedRecord,
  hooksNotInstalled,
  liftingRecord,
  pushedChange,
  recordTexts,
  workingRecord,
  workspaceManifest,
} from "./hooks.ts";

/**
 * The guardrails on the disk (J-114 S3; `src/core/guardrails.ts`): where
 * each git invocation of a shell command runs, read from the directory the
 * harness gave and the `cd` and `-C` steps before it, or the linked
 * worktree whose branch its words name (J-188 S1), which repository that
 * is, the change of the branch HEAD names there and the record lines that
 * lift the act, the change and its state read from the record HEAD's commit
 * holds, never the working tree's (J-144 S4). Every git command here only
 * reads. A repository that is no
 * greenline workspace, or whose adapters the manifest turns off, is left
 * alone.
 */

/** The nearest directory that stands, from a path that may not exist yet. */
function standing(path: string): string {
  let current = path;
  for (;;) {
    try {
      if (statSync(current).isDirectory()) return current;
    } catch {
      // Not there yet: its parent is read.
    }
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

/**
 * The repository a path stands in: the git root of its nearest directory
 * that stands, a linked worktree's own root among them.
 * @param path an absolute path, a file or a directory, standing or not
 * @returns the repository's root, or undefined outside any
 */
function repositoryOf(path: string): string | undefined {
  return findGitRoot(standing(path));
}

/** Whether two roots are checkouts of one repository: the main one and its linked worktrees. */
function sameRepository(one: string, other: string): boolean {
  const shared = commonGitDirectory(one);
  return shared !== undefined && shared === commonGitDirectory(other);
}

/**
 * The repository a written path is judged in: a linked worktree of the
 * session's own repository, which holds its own branch, change and record,
 * or else the session's, so a nested repository or a submodule inside the
 * workspace, and any path outside it, stays the workspace's to fence.
 * @param path an absolute path, a file or a directory, standing or not
 * @param root the session's repository root
 * @returns the root the path is judged in
 */
export function writtenIn(path: string, root: string): string {
  const at = repositoryOf(path);
  return at !== undefined && at !== root && sameRepository(at, root) ? at : root;
}

/**
 * The repository a git command is judged in: the session's own and its
 * linked worktrees each for itself, a nested repository or a submodule
 * inside the workspace as the workspace, and a repository outside it as
 * itself, left alone unless it is a greenline workspace.
 */
function commandIn(dir: string, root: string): string | undefined {
  const at = repositoryOf(dir);
  if (at === undefined || at === root || sameRepository(at, root)) return at;
  const from = relative(root, at);
  return from.startsWith("..") || isAbsolute(from) ? at : root;
}

/**
 * The linked worktree an act is judged in where its words name a branch
 * that worktree has checked out (J-188 S1, the run j109t-conduct-runnerd):
 * a push's or a forced push's branch pushed under its own name, or a
 * forced delete's, read against `git worktree list` as the status reads
 * it, so the act is judged by the change whose branch it is whatever
 * directory the harness gave the hook. The main checkout's own branch, a
 * worktree whose directory is gone, and a list git cannot give leave the
 * act where its command runs.
 * @param act the act
 * @param root the repository its command runs in
 * @returns the worktree's root, or undefined
 */
function heldIn(act: GuardAct, root: string): string | undefined {
  const named = namedBranches(act);
  if (named.length === 0) return undefined;
  const linked = worktreesOf(root).filter(
    (entry) => !entry.main && existsSync(join(entry.path, ".git")),
  );
  for (const branch of named) {
    const held = linked.find((entry) => entry.branch === branch);
    if (held !== undefined) return held.path;
  }
  return undefined;
}

/**
 * The words of a change's record that lift an act: the committed record's,
 * HEAD's or its branch tip's, never the working tree's, since a discard
 * would throw an uncommitted line away with the work it lifted (J-129 S4).
 */
function wordsOf(root: string, id: string): GuardWords | undefined {
  const facts = liftingRecord(root, id);
  return facts === undefined
    ? undefined
    : { discard: facts.discard, rebase: facts.rebase, landing: facts.landing };
}

/** The owner-words lines the working tree's record holds and no commit does: they lift nothing, and the refusal names the commit. */
function uncommittedOf(root: string, id: string): GuardWords | undefined {
  const working = workingRecord(root, id);
  if (working === undefined) return undefined;
  const lifting = wordsOf(root, id);
  // A line the working tree holds with words no commit holds, new words for a spent line among them (J-173 S1).
  const only = (line: keyof GuardWords): string | undefined =>
    working[line] !== lifting?.[line] ? working[line] : undefined;
  return { discard: only("discard"), rebase: only("rebase"), landing: only("landing") };
}

const CHANGE_BRANCH = /^greenline\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The guardrails' reading of a command: its refusal, or the lifts it spends where it goes on. */
export interface GuardRead {
  readonly refusal?: string;
  readonly spends: readonly GuardSpends[];
}

/** The lifts an allowed command spends, each in the repository and the change its line is of. */
export interface GuardSpends {
  readonly root: string;
  readonly change: string;
  readonly lifts: readonly SpentLift[];
}

/**
 * The guardrails' verdict on a shell command (J-114 S3, J-173 S1): the
 * refusal of its first git invocation the guardrails refuse where it runs,
 * or, where every one is lifted, the lifts the record's lines spend on
 * them, which the hook notes once the command goes on.
 * @param text the command's text as the harness reported it
 * @param base the directory it runs in: the harness's own, or the session's
 * @param session the session's repository root
 * @param when when the hook reads it
 * @param journal the owner's messages the hooks journaled for the harness's session (J-176 S1)
 * @param line the modes definition a record is read against before a commit, as status reads it (J-208 S1); undefined where none is read
 * @returns the refusal, or the lifts its acts spend
 */
export function guardOf(
  text: string,
  base: string,
  session: string,
  when = "",
  journal: OwnerJournal = { kept: false },
  line: () => ModesDefinition | undefined = () => undefined,
): GuardRead {
  const spends: GuardSpends[] = [];
  for (const invocation of gitInvocations(text)) {
    // A commit is held where git's hooks are not installed, where it would set a record stopped without the owner's stop (J-200 S1), and over a record status cannot read (J-208 S1).
    if (invocation.subcommand === "commit") {
      const at = invocation.dirs.reduce((dir, step) => resolve(dir, step), base);
      const root = commandIn(isAbsolute(at) ? at : resolve(at), session);
      const refusal =
        root === undefined ? undefined : commitRefusal(root, invocation.text, journal, line);
      if (refusal !== undefined) return { refusal, spends: [] };
      continue;
    }
    const act = guardAct(invocation);
    if (act === undefined) continue;
    const at = invocation.dirs.reduce((dir, step) => resolve(dir, step), base);
    const placed = commandIn(isAbsolute(at) ? at : resolve(at), session);
    // An act naming a branch a linked worktree holds is that worktree's, its change's and its record's (J-188 S1).
    const root = placed === undefined ? undefined : (heldIn(act, placed) ?? placed);
    if (root === undefined || !existsSync(resolve(root, ".greenline"))) continue;
    const manifest = workspaceManifest(root);
    if (manifest === undefined || !manifest.hooks.adapters) continue;
    // The change and its state as HEAD's commit holds the record (J-144 S4); the working tree's
    // change only names the record whose committed state then refuses the act.
    const facts = committedFacts(root);
    const working = branchFacts(root);
    const open = changeOfBranch(facts.current, facts) ?? changeOfBranch(working.current, working);
    // A push from a branch where no change stands open is the change of the commit pushed, a done change's landing push among them (J-139 S1).
    const pushed =
      open === undefined && act.kind === "push" ? pushedChange(root, "HEAD") : undefined;
    const change = open ?? (pushed === undefined ? undefined : { owner: pushed });
    // A forced delete of change branches is lifted by those changes' own records, the landing's cleanup.
    const deleted =
      act.kind === "branch-delete" && act.branches.length > 0
        ? act.branches.map((branch) => CHANGE_BRANCH.exec(branch)?.[1])
        : [];
    const place: GuardPlace =
      deleted.length > 0 && deleted.every((id) => id !== undefined)
        ? {
            branch: facts.current,
            change: {
              id: deleted.join(", "),
              record: deleted.map((id) => recordPath(id ?? "")).join(" and "),
              words: mergedWords(deleted.map((id) => wordsOf(root, id ?? ""))),
            },
            journal,
          }
        : {
            branch: facts.current,
            change:
              change === undefined
                ? undefined
                : {
                    id: change.owner,
                    record: recordPath(change.owner),
                    words: wordsOf(root, change.owner),
                    uncommitted: uncommittedOf(root, change.owner),
                    state: committedRecord(root, "HEAD", change.owner)?.state,
                    spent: spentLifts(root, change.owner),
                  },
            isDefault: (branch) => facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch),
            journal,
          };
    const verdict = guardLift(act, place);
    if (verdict.kind === "refuse") return { refusal: verdict.reason, spends: [] };
    // The lines an act of one change spends, each by its words as the committed record holds them.
    const id = change?.owner;
    const words = place.change?.words;
    if (deleted.length === 0 && id !== undefined && words !== undefined)
      spends.push({
        root,
        change: id,
        lifts: verdict.lines.flatMap((line) => {
          const said = words[line];
          return said === undefined
            ? []
            : [{ line, words: said, act: liftKindOf(act), command: invocation.text, at: when }];
        }),
      });
  }
  return { spends };
}

/**
 * The harness hook's hold on a git commit (J-200 S1, the run
 * j196t-states-stop-2): in a workspace whose adapters are on, a commit in a
 * checkout whose git configuration registers none of greenline's hooks is
 * refused with the status line's own words (J-193 S1), since nothing else
 * holds it to the record there, until the sync installs them; and a commit
 * while a record of the working tree reads stopped, where HEAD's commit
 * holds it otherwise, is held to the owner's stop in its stopped line, as
 * git's pre-commit hook holds the staged record; and a commit while a
 * record of the working tree that HEAD's commit does not hold as it stands
 * is one `greenline status` cannot read, in the parser's words (J-208 S1,
 * the run j196t-conduct-emptyc), as git's pre-commit hook holds the
 * staged one.
 * @param root the repository the commit runs in
 * @param command the commit's words, as the refusal quotes them
 * @param journal the owner's messages the hooks journaled for the session
 * @param line the modes definition the record is read against, undefined where none is read
 * @returns the refusal's one line, or undefined
 */
function commitRefusal(
  root: string,
  command: string,
  journal: OwnerJournal,
  line: () => ModesDefinition | undefined,
): string | undefined {
  if (!existsSync(resolve(root, ".greenline"))) return undefined;
  const manifest = workspaceManifest(root);
  if (manifest === undefined || !manifest.hooks.adapters) return undefined;
  if (hooksNotInstalled(root, manifest.hooks))
    return ruled(
      `\`${command}\` waits for greenline's git hooks, which hold every commit to the record: ${HOOKS_NOT_INSTALLED_LINE}; once it has run, commit again`,
      "hooks-installed",
    );
  const records = branchFacts(root).records;
  for (const entry of records) {
    const verdict = stopVerdict(
      entry.id,
      entry.facts,
      committedRecord(root, "HEAD", entry.id),
      journal,
    );
    if (verdict.kind === "refuse") return verdict.reason;
  }
  // The working tree's record read with status's parser; one HEAD holds as it stands is no commit's to refuse (J-208 S1).
  for (const entry of records) {
    const { working, head } = recordTexts(root, entry.id);
    if (working === undefined || working === head) continue;
    const read = recordReadVerdict(entry.id, unreadRecord(line(), `${entry.id}.md`, working));
    if (read.kind === "refuse") return read.reason;
  }
  return undefined;
}

/** The home directory the shell's `~` and `$HOME` name: the environment's, else the system's. */
function homeDirectory(): string {
  return process.env["HOME"] ?? homedir();
}

/**
 * One directory step from a directory, as the shell takes it (J-224 S1,
 * after the falsifier's reading): `~` alone or before a slash, and `$HOME`
 * or `${HOME}` at its start, lead from the home directory; another user's
 * `~name` and any other variable are read as written.
 * @param dir the directory the step starts from
 * @param step the step as the command's words give it
 * @returns the directory it reaches
 */
function stepFrom(dir: string, step: string): string {
  const home = /^(?:~(?=\/|$)|\$HOME(?![\w])|\$\{HOME\})(.*)$/.exec(step);
  return home === null ? resolve(dir, step) : resolve(homeDirectory(), `.${home[1] ?? ""}`);
}

/**
 * The harness hook's hold on the agent's `greenline sync` (J-224 S1, the
 * runs j217t-states-stop and j217c-states-stop): each sync a shell command
 * runs, in any form `greenlineSyncs` reads, judged in the checkout its
 * directory steps reach; where that checkout is a greenline workspace whose
 * adapters are on and whose git configuration registers none of greenline's
 * hooks, the sync waits for a turn of the owner's (`./sync-ask.ts`). A dry
 * run and the usage, and a checkout whose hooks are installed, registered
 * by hand or turned off, are never held; the owner's own terminal runs no
 * harness hook.
 * @param text the command's text as the harness reported it
 * @param base the directory it runs in: the harness's own, or the session's
 * @param root the session's repository root, where its turns are counted
 * @param session the harness's session id, null where the payload names none
 * @returns the refusal's one line, or undefined
 */
export function syncRefusal(
  text: string,
  base: string,
  root: string,
  session: string | null,
): string | undefined {
  for (const sync of greenlineSyncs(text)) {
    if (sync.writesNothing) continue;
    const at = sync.dirs.reduce((dir, step) => stepFrom(dir, step), base);
    const where = commandIn(isAbsolute(at) ? at : resolve(at), root);
    if (where === undefined || !existsSync(resolve(where, ".greenline"))) continue;
    const manifest = workspaceManifest(where);
    if (manifest === undefined || !manifest.hooks.adapters) continue;
    if (!hooksNotInstalled(where, manifest.hooks)) continue;
    const wait = syncWait(root, session, where);
    if (wait !== "admit") return syncWaitRefusal(sync.text, wait);
  }
  return undefined;
}

/**
 * The refusal of a write to the ledger's machine-written files, or of a
 * picture under the ledger, read from a path a write tool names (J-173
 * S1): judged in the repository the path stands in, a greenline workspace
 * whose adapters are on, from that repository's root.
 * @param path the path the tool names, absolute or from the base
 * @param base the directory a relative path resolves from
 * @param session the session's repository root
 * @param restore whether git writes it back, which reads a folder as a write under each change's folder of the home it holds (J-227 S1)
 * @returns the refusal's one line, or undefined
 */
export function ledgerRefusalOf(
  path: string,
  base: string,
  session: string,
  restore = false,
): string | undefined {
  const absolute = isAbsolute(path) ? path : resolve(base, path);
  const root = writtenIn(absolute, session);
  if (!existsSync(resolve(root, ".greenline"))) return undefined;
  const manifest = workspaceManifest(root);
  if (manifest === undefined || !manifest.hooks.adapters) return undefined;
  const from = relative(root, absolute);
  if (from.startsWith("..") || isAbsolute(from)) return undefined;
  const refusal = ledgerWriteRefusal(from, restore);
  if (refusal !== undefined || !restore) return refusal;
  // A restore of a change's folder, or of a folder holding one, writes under each (J-227 S1).
  const folder = restoredFolders(from.split("\\").join("/"), changeVisualFolders(root))[0];
  return folder === undefined ? undefined : ledgerWriteRefusal(`${folder}/`, true);
}

/**
 * The refusal of the first write a shell command's words name onto the
 * ledger's machine-written files or of a picture under the ledger (J-173
 * S1): a redirection, tee, a copy or a move onto it, an edit in place, a
 * removal, an interpreter whose script, an argument or a here-document,
 * names it, or a `git restore` or `git checkout --` of it or of a folder
 * holding a change's folder of the visual home (J-227 S1), each resolved
 * through the `cd` steps before it. The words show what the command names;
 * a script kept in a file, or a path a script builds from parts, is beyond
 * them, and the after-tool line names a write into a change's folder they
 * hid.
 * @param text the command's text as the harness reported it
 * @param base the directory it runs in: the harness's own, or the session's
 * @param session the session's repository root
 * @returns the refusal's one line, or undefined
 */
export function ledgerShellRefusalOf(
  text: string,
  base: string,
  session: string,
): string | undefined {
  for (const write of shellWrites(text)) {
    const at = write.dirs.reduce((dir, step) => resolve(dir, step), base);
    const refusal = ledgerRefusalOf(
      write.target,
      isAbsolute(at) ? at : resolve(at),
      session,
      write.how === "a restore",
    );
    if (refusal !== undefined)
      return `\`${write.command.length > 80 ? `${write.command.slice(0, 77)}...` : write.command}\` writes by ${write.how}: ${refusal}`;
  }
  return undefined;
}

/** The words every record holds: a line lifts only where each record holds it. */
function mergedWords(all: readonly (GuardWords | undefined)[]): GuardWords {
  const every = (line: keyof GuardWords): string | undefined =>
    all.every((words) => words?.[line] !== undefined) ? (all[0]?.[line] ?? undefined) : undefined;
  return { discard: every("discard"), rebase: every("rebase"), landing: every("landing") };
}
