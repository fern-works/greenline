import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isChangeId, unreadRecord } from "../../core/change.ts";
import { discussionCommit, discussionOfPath } from "../../core/discussion.ts";
import {
  changeOfBranch,
  confirmedVerdict,
  discussionRecordVerdict,
  DISCUSSION_TRAILER_KEY,
  doneVerdict,
  finishedRecordVerdict,
  firstCommitVerdict,
  isDefaultBranch,
  isGitHookName,
  mergeBaseVerdict,
  messageHasText,
  noChangeVerdict,
  orderTrailerBlock,
  outsideClauseVerdict,
  outsideConfirmVerdict,
  pushUpdates,
  pushVerdict,
  rebaseVerdict,
  recordFormVerdict,
  recordReadVerdict,
  refreshVerdict,
  ruled,
  refUpdates,
  renderVerdict,
  rewriteVerdict,
  stagedPathsVerdict,
  stopVerdict,
  AGENT_TRAILER_KEY,
  TRAILER_KEY,
  trailerVerdict,
  yesVerdict,
  type GitHookName,
  type HookVerdict,
  type MergedChange,
  type ProceedSetting,
  type PushFacts,
  type RewriteFacts,
} from "../../core/git-hooks.ts";
import type { Manifest } from "../../core/manifest.ts";
import type { ModesDefinition } from "../../core/modes.ts";
import { marksLine } from "../../core/marks.ts";
import { agentBreaches, carefulFrameGaps, recordBreaches } from "../../core/record-lint.ts";
import { parseAgent } from "../../core/ground.ts";
import type { Installation } from "../../core/installation.ts";
import { owedAtDone } from "../habits-owed.ts";
import { ownerJournal, yesJournal } from "../owner-words.ts";
import { confirmJournal, frameUnconfirmedAt, indexSource } from "../frame-ask.ts";
import { lintFolder } from "../changes.ts";
import { openMarks, readMarksFiles } from "../marks.ts";
import { changeLoads, reportedModel } from "../skill-loads.ts";
import { checksOfChange } from "../../core/interface-check.ts";
import { renderOwedOf } from "../interface-check.ts";
import { refreshOwed, refreshUnnamed } from "../visuals.ts";
import { parseInterfaceFact } from "../../core/interface-fact.ts";
import { gitExitCode, readGit } from "../code-tree.ts";
import { addTrailer, addTrailers, findGitRoot } from "../git.ts";
import {
  ancestry,
  branchFacts,
  changeReader,
  commitChangeReader,
  commitFacts,
  committedDiscussion,
  committedRecord,
  liftingRecord,
  currentBranch,
  pushedChange,
  recordFinished,
  declaredChecks,
  merging,
  planEdits,
  recordedFacts,
  stagedDiscussion,
  stagedPaths,
  stagedRecord,
  stagedRecordIds,
  stagedRecordText,
  unfinishedRecordsAt,
  workingRecord,
  workspaceManifest,
} from "../hooks.ts";
import { EXIT_FAILURE, EXIT_OK, type CliWriter } from "./output.ts";

/**
 * `greenline hook <name> [<arg>...]` (`docs/SPEC.md` §4): what the scripts
 * under `.greenline/hooks/` run, with git's own arguments and stdin. It
 * reads git's facts and the change record's and exits 1 with one line
 * naming the fact to refuse, or 0 to let git go on. greenline's own error,
 * a repository with no workspace and hooks the manifest turned off all let
 * git go on, since a refusal rests only on a fact greenline could read. A
 * trailer git cannot write stops the commit with git's own words, since
 * every commit of a change carries it. In a workspace, pre-commit also
 * refuses a commit while no change is open on the branch HEAD names, and
 * reads a `standing` choice against the manifest's `proceed` (J-102 S1).
 */

/** What the hook needs beyond its arguments: where it runs and git's stdin. */
export interface HookEnvironment {
  readonly cwd: string;
  /** The hook's stdin, read whole; git writes the updates or the rewrites there. */
  readonly stdin: () => string;
  /** The modes definition's modes in order, fastest first, read only when a standing choice's mode is not the one `proceed` names; undefined when they cannot be read. */
  readonly modes?: () => readonly string[] | undefined;
  /** The modes definition, read only when a commit sets a record done, for the depths its record lint counts reports against (J-149 S1); undefined when it cannot be read. */
  readonly line?: () => ModesDefinition | undefined;
  /** The installation, read only when a commit sets a record done, for the skills the change owed (J-176 S1); undefined when it cannot be read. */
  readonly installation?: () => Installation | undefined;
}

/** The values of one trailer key a message carries, as git reads its trailers. */
function messageTrailers(root: string, file: string, key: string = TRAILER_KEY): readonly string[] {
  const read = readGit(root, ["interpret-trailers", "--parse", file]);
  if (read._tag === "err") return [];
  return read.value.split("\n").flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator === -1) return [];
    return line.slice(0, separator).trim().toLowerCase() === key.toLowerCase()
      ? [line.slice(separator + 1).trim()]
      : [];
  });
}

/** The agent line of the record a commit is made under: the staged one where the index holds it, the ticket's or the branch's own change's. */
function agentOf(root: string, id: string, owner: string): string | undefined {
  return stagedRecord(root, id)?.agent ?? stagedRecord(root, owner)?.agent;
}

/** The ids whose staged record sets `state: done` while HEAD's does not: the commit that closes them. */
function closingChanges(root: string): readonly string[] {
  return stagedRecordIds(root).filter(
    (id) =>
      stagedRecord(root, id)?.state === "done" &&
      committedRecord(root, "HEAD", id)?.state !== "done",
  );
}

/** The branch HEAD names, the default branch's test and the records a pushed commit holds unfinished, which a push to the default branch reads (J-139 S1). */
function defaultFacts(
  root: string,
): Pick<PushFacts, "current" | "isDefault" | "unfinishedAt" | "pushedChangeOf"> {
  const facts = branchFacts(root);
  return {
    current: facts.current,
    isDefault: (branch) => facts.hasRemote && isDefaultBranch(branch, facts.defaultBranch),
    unfinishedAt: (object) => unfinishedRecordsAt(root, object),
    pushedChangeOf: (object) => pushedChange(root, object),
  };
}

function rewriteFacts(root: string): RewriteFacts {
  return {
    changeOf: changeReader(root),
    recordOf: (id) => liftingRecord(root, id),
    workingOf: (id) => workingRecord(root, id),
    isAncestor: ancestry(root),
    currentObject: (ref) => {
      const read = readGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return read._tag === "ok" && read.value.trim() !== "" ? read.value.trim() : undefined;
    },
    // A rebase line lifts only on one of the owner's journaled messages whole, every session's of the checkout (J-193 S1).
    journal: ownerJournal(root),
  };
}

/**
 * pre-commit: no path beside a finished change's record on any branch, its
 * own `greenline/<id>` one included (J-144 S4); no commit while no change is
 * open on the branch HEAD names,
 * a commit that concludes a merge aside, since it is the merge's; no commit
 * on a change's branch before the owner's yes; no record set stopped
 * without the owner's stop quoted in its stopped line (J-200 S1); no path of another change's
 * record or folder in a change's commit (J-143 S1); and no done over a check that
 * is not green, the merge's checks included in the commit that records them
 * after a local landing (J-130 S1); no careful record's confirmed line the
 * owner's words after its restatement do not hold, and no path outside the
 * homes before a careful frame is confirmed (J-223 S1); and, after every other door, no staged
 * change record `greenline status` cannot read, in the parser's words
 * (J-208 S1).
 */
function preCommit(
  root: string,
  manifest: Manifest,
  setting: ProceedSetting,
  line: () => ModesDefinition | undefined,
  installation: () => Installation | undefined,
): HookVerdict {
  const paths = stagedPaths(root);
  // Every discussion record the commit stages reads, and moves its state only on the owner's new words (J-118 S1, S3).
  for (const id of stagedDiscussionRecords(paths)) {
    const verdict = discussionRecordVerdict(
      id,
      stagedDiscussion(root, id),
      committedDiscussion(root, "HEAD", id),
    );
    if (verdict.kind === "refuse") return verdict;
  }
  // A commit whose paths lie only under the discussions folder is the discussion's, whatever change is open or none.
  if (discussionCommit(paths) !== undefined) return { kind: "allow" };
  // The commit's own facts: the landing's last commit is its change's here alone (J-130 S1).
  const facts = commitFacts(root);
  const current = facts.current;
  const change = current === undefined ? undefined : changeOfBranch(current, facts);
  // A record HEAD holds done or dropped changes only alone, on every branch; a merge's own paths aside (J-144 S4).
  if (!merging(root))
    for (const id of new Set([
      ...stagedRecordIds(root),
      ...(change === undefined ? [] : [change.id]),
    ])) {
      const finished = finishedRecordVerdict(id, committedRecord(root, "HEAD", id), paths);
      if (finished.kind === "refuse") return finished;
    }
  if (change === undefined) {
    const none = noChangeVerdict(current, facts);
    if (none.kind === "refuse" && !merging(root)) return none;
  }
  // A record the commit sets stopped quotes the owner's stop, one journaled message of theirs whole, every session's of the checkout (J-200 S1).
  if (!merging(root))
    for (const id of stagedRecordIds(root)) {
      const stop = stopVerdict(
        id,
        stagedRecord(root, id),
        committedRecord(root, "HEAD", id),
        ownerJournal(root),
      );
      if (stop.kind === "refuse") return stop;
    }
  // The owner's yes, held against the messages the hooks journaled (J-176 S1) until HEAD's commit carries it settled (J-186 S1).
  const staged = change === undefined ? undefined : stagedRecord(root, change.id);
  const yes = yesVerdict(
    change,
    staged,
    setting,
    change === undefined ? { kept: false } : yesJournal(root, change.id, staged?.yes),
  );
  if (yes.kind === "refuse") return yes;
  // A careful record's confirmed line is the owner's words after the restatement was put, on every commit, a
  // merge's included, settled where HEAD's commit or the merged commit carries it (J-223 S1).
  const merged = mergeHead(root);
  for (const id of stagedRecordIds(root)) {
    const record = stagedRecord(root, id);
    const carried = [
      committedRecord(root, "HEAD", id),
      ...(merged === undefined ? [] : [committedRecord(root, merged, id)]),
    ];
    const confirmed = confirmedVerdict(
      id,
      record,
      carried,
      confirmJournal(root, id, record?.confirmed),
    );
    if (confirmed.kind === "refuse") return confirmed;
  }
  // Nothing outside the homes is committed before a careful frame is confirmed, a ticket's read on its planning
  // change's record (J-223 S1); unread in a merge, whose own paths are the merged side's, never the change's writes.
  if (change !== undefined && !merging(root)) {
    // A ticket's frame is its planning change's, read as the trailers read it (after the falsifier's second reading).
    if (staged?.ticket !== undefined) {
      // The ticket's record and its planning change's are read as the commit carries them, the index's (after the
      // falsifier's third reading); where the working tree would read them otherwise, the refusal says so.
      const carried = frameUnconfirmedAt(root, change.id, indexSource(root, facts.records));
      const apart =
        carried !== undefined && frameUnconfirmedAt(root, change.id) === undefined
          ? `${carried}; the records are read as the commit carries them, the index's, so stage the planning change's record`
          : carried;
      const outside = outsideClauseVerdict(change.id, paths, apart);
      if (outside.kind === "refuse") return outside;
    } else {
      const text = stagedRecordText(root, change.id);
      const outside = outsideConfirmVerdict(
        change.id,
        staged,
        text === undefined ? undefined : carefulFrameGaps(change.id, text),
        paths,
        confirmJournal(root, change.id, staged?.confirmed),
      );
      if (outside.kind === "refuse") return outside;
    }
  }

  // The first commit to carry the record holds its agent line to the model the harness reports (J-192 S1).
  if (change !== undefined && staged !== undefined && !merging(root)) {
    const first = committedRecord(root, "HEAD", change.id) === undefined;
    const agent = staged.agent;
    if (first && agent !== undefined) {
      const harness = parseAgent(agent)?.harness;
      const verdict = firstCommitVerdict(
        change.id,
        agentBreaches(agent, harness === undefined ? undefined : reportedModel(root, harness)),
      );
      if (verdict.kind === "refuse") return verdict;
    }
  }
  // No path of another change's record or folder rides in a change's commit; a merge's own paths aside (J-143 S1).
  if (!merging(root)) {
    const own = [...(facts.finishing ?? []), ...(facts.landed === undefined ? [] : [facts.landed])];
    const staged = stagedPathsVerdict(change, paths, own);
    if (staged.kind === "refuse") return staged;
  }
  const checks = declaredChecks(manifest);
  const closing = closingChanges(root);
  // The landing's last commit holds a done record to the merge's checks, though HEAD's says done already (J-130 S1).
  const landed =
    facts.landed !== undefined &&
    !closing.includes(facts.landed) &&
    stagedRecord(root, facts.landed)?.state === "done"
      ? [facts.landed]
      : [];
  for (const id of [...closing, ...landed]) {
    // An interface change under the opt-in is held to the interface check too (J-123 S4).
    const stated = stagedRecord(root, id)?.interface;
    const held = checksOfChange(
      checks,
      manifest.interface,
      stated === undefined ? undefined : parseInterfaceFact(stated),
    );
    const done = doneVerdict(id, held, recordedFacts(root, id));
    if (done.kind === "refuse") return done;
    // The record's forms, and a plan the change extended committed at its close, before done (J-149 S1, S3).
    const text = stagedRecordText(root, id);
    // The skills the change owed by its trigger rows, held to a load at done (J-176 S1).
    const installed = text === undefined ? undefined : installation();
    const owed =
      installed === undefined
        ? undefined
        : owedAtDone({ root, installation: installed, manifest, change: id, session: null });
    const form = recordFormVerdict(
      id,
      text === undefined
        ? []
        : recordBreaches({
            id,
            text,
            definition: line(),
            loaded: changeLoads(root, id).map((load) => load.skill),
            owed,
            journal: yesJournal(root, id, stagedRecord(root, id)?.yes),
            planEdits: planEdits(root, stagedRecord(root, id)?.plan),
            // The close's marks line read against the marks files as status prints them (J-148 S3).
            marks: { line: marksLine(openMarks(root, readMarksFiles(root))) },
            // The folder's links file and the interface check's runs the done record links (J-173 S1).
            folder: lintFolder(root, id),
            // The model the harness reports, which the agent line names (J-192 S1).
            reported: reportedOf(root, stagedRecord(root, id)?.agent),
          }),
    );
    if (form.kind === "refuse") return form;
    // Each page an interface change touched is captured, or its browser limit named, before done (J-133 S1).
    const render = renderVerdict(id, renderOwedOf(root, id, manifest, stated));
    if (render.kind === "refuse") return render;
    // The atlas pages, journeys and map the change touched are refreshed, or left in the owner's words, before done (J-147 S3).
    const record = stagedRecord(root, id);
    const refresh = refreshVerdict(
      id,
      refreshOwed(root, id, record?.refreshed ?? []),
      // A page the change rewrote is named in the refreshes line, whatever the owner's words (J-227 S1).
      refreshUnnamed(root, id, record?.refreshed ?? []),
      record?.closeText,
    );
    if (refresh.kind === "refuse") return refresh;
  }
  // Every record the commit stages reads as status reads it, a start naming a method's helper refused among the rest (J-208 S1); a merge's own records aside.
  if (!merging(root))
    for (const id of stagedRecordIds(root)) {
      const text = stagedRecordText(root, id);
      if (text === undefined) continue;
      const read = recordReadVerdict(id, unreadRecord(line(), `${id}.md`, text));
      if (read.kind === "refuse") return read;
    }
  return { kind: "allow" };
}

/** The model the harness an agent line names reports, where the line names a harness and it reports one (J-192 S1). */
function reportedOf(root: string, agent: string | undefined) {
  const harness = agent === undefined ? undefined : parseAgent(agent)?.harness;
  return harness === undefined ? undefined : reportedModel(root, harness);
}

/** The discussions whose record a commit stages, from its staged paths. */
function stagedDiscussionRecords(paths: readonly string[]): readonly string[] {
  return paths.flatMap((path) => {
    const id = discussionOfPath(path);
    return id !== undefined && path.endsWith(`${id}.md`) ? [id] : [];
  });
}

/**
 * A discussion's commit takes the trailer of each discussion it touches, in
 * place of a change's, a message that already carries one keeping it; an
 * empty message stays empty. A trailer git cannot write stops the commit
 * with git's own words, as a change's does.
 */
function discussionMessage(
  root: string,
  name: GitHookName,
  path: string,
  ids: readonly string[],
): HookVerdict {
  // A discussion's commit is no change's, so it carries no change's trailer (J-118 S1).
  const claimed = messageTrailers(root, path);
  if (name === "commit-msg" && claimed.length > 0)
    return {
      kind: "refuse",
      reason: ruled(
        `a discussion's commit names no change: the commit stages only discussions' paths, ${ids.join(", ")}, and the message carries '${TRAILER_KEY}: ${claimed[0] ?? ""}'; take that trailer out, since a discussion's commit carries ${DISCUSSION_TRAILER_KEY} alone`,
        "discussion-trailer",
      ),
    };
  const text = messageText(path);
  if (text === undefined || !messageHasText(text)) return { kind: "allow" };
  const carried = messageTrailers(root, path, DISCUSSION_TRAILER_KEY);
  for (const id of ids.filter((each) => !carried.includes(each))) {
    const trailer = `${DISCUSSION_TRAILER_KEY}: ${id}`;
    const written = addTrailer(root, path, trailer);
    if (written._tag === "err")
      return {
        kind: "refuse",
        reason: ruled(
          `the commit stopped because git could not write '${trailer}' into its message: ${written.error.message}; commit again once git can write the message file, since a discussion's commit carries it`,
          "discussion-trailer",
        ),
      };
  }
  return { kind: "allow" };
}

/** The merged commit of a merge under way, read as `mergedChanges` reads it; undefined while none is under way. */
function mergeHead(root: string): string | undefined {
  const merged = readGit(root, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
  return merged._tag === "ok" && merged.value.trim() !== "" ? merged.value.trim() : undefined;
}

/**
 * The changes a merge under way lands (J-148 S2): the change a
 * `greenline/<id>` branch at the merged commit names, and each change the
 * merge's message names in its trailer, each whose record the merged
 * commit holds; a merge of a base into a change's branch lands none.
 */
function mergedChanges(root: string, path: string): readonly MergedChange[] {
  const merged = readGit(root, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
  if (merged._tag === "err") return [];
  const object = merged.value.trim();
  const branches = readGit(root, [
    "for-each-ref",
    "--points-at",
    object,
    "--format=%(refname:short)",
    "refs/heads/greenline/",
  ]);
  const named =
    branches._tag === "err"
      ? []
      : branches.value.split("\n").flatMap((line) => {
          const id = line.trim().slice("greenline/".length);
          return isChangeId(id) ? [id] : [];
        });
  // A change worked on the branch merged into, its own branch or one whose HEAD holds its record open or stopped, is no landing there: that merge updates it from its base.
  const current = currentBranch(root);
  const worked = (id: string): boolean => {
    const state = committedRecord(root, "HEAD", id)?.state;
    return current === `greenline/${id}` || state === "open" || state === "stopped";
  };
  const ids = [...new Set([...named, ...messageTrailers(root, path)])].filter((id) => !worked(id));
  return ids.flatMap((id) => {
    const record = committedRecord(root, object, id);
    return record === undefined ? [] : [{ id, record }];
  });
}

/** The message file's text, or undefined when it cannot be read. */
function messageText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The message file's trailer block put in the documented order once the
 * greenline trailers stand in it (J-129 S3, `orderTrailerBlock`): the
 * harness's trailers first, the agent's next, the change's last. A file
 * already in order is not written; one git cannot write keeps its order,
 * since its trailers stand.
 */
function orderedMessage(path: string): HookVerdict {
  const text = messageText(path);
  if (text === undefined) return { kind: "allow" };
  const ordered = orderTrailerBlock(text);
  if (ordered !== text)
    try {
      writeFileSync(path, ordered);
    } catch {
      // The trailers are written; only their order is lost.
    }
  return { kind: "allow" };
}

/**
 * prepare-commit-msg and commit-msg: the change's trailer written into a
 * message that has text, and a message carrying another change's trailer
 * refused. prepare-commit-msg runs under `--no-verify` too; commit-msg
 * writes the trailer a message written in the editor still lacks.
 */
function message(root: string, name: GitHookName, file: string | undefined): HookVerdict {
  if (file === undefined) return { kind: "allow" };
  // git names the message file from the root, or whole in a linked worktree.
  const path = resolve(root, file);
  // A merge that lands a change runs only into the base the owner's words named (J-148 S2).
  if (name === "commit-msg" && merging(root)) {
    const base = mergeBaseVerdict(currentBranch(root), mergedChanges(root, path));
    if (base.kind === "refuse") return base;
  }
  const discussions = discussionCommit(stagedPaths(root));
  if (discussions !== undefined) return discussionMessage(root, name, path, discussions);
  const current = currentBranch(root);
  const change = current === undefined ? undefined : commitChangeReader(root)(current);
  if (change === undefined) return { kind: "allow" };
  const trailers = messageTrailers(root, path);
  if (name === "commit-msg") {
    const verdict = trailerVerdict(change, trailers);
    if (verdict.kind === "refuse") return verdict;
  }
  const text = messageText(path);
  // An empty message stays empty, so git's own refusal of an empty message still stands.
  if (text === undefined || !messageHasText(text)) return { kind: "allow" };
  // The agent's trailer stands just above the change's, where the record states the agent (J-114 S3).
  const agent = agentOf(root, change.id, change.owner);
  const lacksAgent =
    agent !== undefined && messageTrailers(root, path, AGENT_TRAILER_KEY).length === 0;
  // A message that carries a trailer the branch allows keeps it, a ticket's on its plan's branch among them,
  // moved below the agent's trailer where that one is written now.
  const carried = trailers.find((value) => change.trailers.includes(value));
  if (carried !== undefined) {
    if (!lacksAgent) return orderedMessage(path);
    const moved = addTrailers(root, path, [
      `${AGENT_TRAILER_KEY}: ${agent}`,
      `${TRAILER_KEY}: ${carried}`,
    ]);
    return moved._tag === "ok"
      ? orderedMessage(path)
      : {
          kind: "refuse",
          reason: ruled(
            `the commit stopped because git could not write '${AGENT_TRAILER_KEY}: ${agent}' into its message: ${moved.error.message}; commit again once git can write the message file`,
            "message-trailer",
          ),
        };
  }
  const trailer = `${TRAILER_KEY}: ${change.id}`;
  const written = lacksAgent
    ? addTrailers(root, path, [`${AGENT_TRAILER_KEY}: ${agent}`, trailer])
    : addTrailer(root, path, trailer);
  // The trailer is the promise on every commit of a change, so a commit git could not give it stops here, with git's own words.
  return written._tag === "ok"
    ? orderedMessage(path)
    : {
        kind: "refuse",
        reason: ruled(
          `the commit stopped because git could not write '${trailer}' into its message: ${written.error.message}; commit again once git can write the message file, since every commit of change ${change.id} carries it`,
          "message-trailer",
        ),
      };
}

/** post-rewrite: each rewrite of the change's branch recorded in its event log, for status to show. */
function postRewrite(root: string, by: string | undefined, input: string): void {
  const current = currentBranch(root);
  const change = current === undefined ? undefined : changeReader(root)(current);
  // A done or dropped change's working folder is the tidy's to remove (J-143 S2).
  if (change === undefined || recordFinished(root, change.id)) return;
  const pairs = input.split("\n").flatMap((line) => {
    const [old, next] = line.trim().split(" ");
    return old === undefined || next === undefined || next === "" ? [] : [{ old, next }];
  });
  if (pairs.length === 0) return;
  const folder = join(root, ".greenline", "tmp", change.id);
  mkdirSync(folder, { recursive: true });
  appendFileSync(
    join(folder, "events.jsonl"),
    `${JSON.stringify({
      v: 1,
      at: new Date().toISOString(),
      harness: null,
      kind: "rewrite",
      native: "post-rewrite",
      rewrite: { by: by ?? null, branch: current ?? null, pairs },
    })}\n`,
  );
}

/** The hook's verdict, its stdin read only by the hooks that take one. */
function verdictOf(
  root: string,
  manifest: Manifest,
  name: GitHookName,
  args: readonly string[],
  env: HookEnvironment,
): HookVerdict {
  const stdin = env.stdin;
  switch (name) {
    case "pre-commit":
      return preCommit(
        root,
        manifest,
        { proceed: manifest.proceed, modes: env.modes ?? (() => undefined) },
        env.line ?? (() => undefined),
        env.installation ?? (() => undefined),
      );
    case "prepare-commit-msg":
    case "commit-msg":
      return message(root, name, args[0]);
    case "reference-transaction":
      return args[0] === "prepared"
        ? rewriteVerdict(refUpdates(stdin()), rewriteFacts(root))
        : { kind: "allow" };
    case "pre-rebase":
      return rebaseVerdict(args[1] ?? currentBranch(root), rewriteFacts(root));
    case "pre-push":
      return pushVerdict(pushUpdates(stdin()), {
        ...rewriteFacts(root),
        hasObject: (object) => gitExitCode(root, ["cat-file", "-e", object]) === 0,
        ...defaultFacts(root),
      });
    case "post-rewrite":
      postRewrite(root, args[0], stdin());
      return { kind: "allow" };
  }
}

/**
 * Run `greenline hook`.
 * @param argv the arguments after `hook`: the hook's name, then git's arguments
 * @param writer greenline's own streams; a refusal's one line goes to stderr
 * @param env where it runs and git's stdin
 * @returns 1 to refuse, 0 to let git go on
 */
export function runHookCli(
  argv: readonly string[],
  writer: CliWriter,
  env: HookEnvironment,
): number {
  const [name, ...args] = argv;
  if (name === undefined || !isGitHookName(name)) {
    writer.stderr.write(
      `greenline hook: '${name ?? ""}' is no hook greenline installs, so git goes on\n`,
    );
    return EXIT_OK;
  }
  try {
    const root = findGitRoot(env.cwd);
    if (root === undefined) return EXIT_OK;
    const manifest = workspaceManifest(root);
    // Without a workspace's manifest, or with the hooks turned off, no fact is read.
    if (manifest === undefined || !manifest.hooks.git) return EXIT_OK;
    const verdict = verdictOf(root, manifest, name, args, env);
    if (verdict.kind === "allow") return EXIT_OK;
    // The owner's sentence and the way forward first, the rule and the hook last (J-144 S3).
    writer.stderr.write(`${verdict.reason}, greenline's ${name} hook\n`);
    return EXIT_FAILURE;
  } catch (error) {
    writer.stderr.write(
      `greenline hook ${name}: greenline's own error, so git goes on: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT_OK;
  }
}
