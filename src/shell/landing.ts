import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { parseChecksFile, type CheckFacts } from "../core/facts.ts";
import { ownersOwnWords } from "../core/habits-owed.ts";
import {
  landingLine,
  type BaseHold,
  type LandingAsked,
  type LandingState,
} from "../core/mirror.ts";
import { landingAnswer, type LandingOffer } from "../core/record-lines.ts";
import { gitExitCode, readGit } from "./code-tree.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionsHome } from "./git.ts";
import { checksFolder, currentBranch, defaultBranch, workingRecord } from "./hooks.ts";
import { journaledMessages } from "./owner-words.ts";
import { homesOf, readRemote } from "./situation.ts";
import { latestSession, sessionChange, sessionFileName, sessionTurn } from "./skill-loads.ts";

/*
 * The landing fact (J-202 S1; the register's row of 2026-11-05, "The keeper
 * over the oracle"): for a change the session holds whose close has run, the
 * mirror at a turn's start and `greenline status` name the landing's state,
 * read from the record's `landing` line, the base's hold of the branch's
 * head and the change's checks on a merge commit, from git and the ledger
 * alone. The run j196c-landing-4's agent, holding the owner's "Merge it.",
 * read the base's new commit and withheld the merge on a red it foresaw; the
 * fact puts beside the owner's words that no merge ran and no check stands
 * on a merge commit. While the record carries no landing line, the fact
 * also reads the owner's journaled messages since the offer against the
 * merge, push and decline words (J-209 S1, the run j196c-landing-4b, whose
 * agent read "none recorded" as a wait on the owner's "Merge it."), and says
 * what they ask and what comes next until the landing line holds them; the
 * turn's end names a reply that withheld the merge they asked for. It reads
 * git without writing, and never refuses.
 */

/** The prefix of a landing line whose words are the owner's for a merge. */
const MERGE = /^\s*merge\b/i;

/** The base a merge's words name after `merge into`, its quotes aside. */
const MERGE_BASE = /^\s*merge\s+into\s+[`'"]?([^\s:`'",;]+)/i;

/** A local branch's commit, undefined where none of that name stands. */
function branchAt(root: string, name: string): string | undefined {
  const read = readGit(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}^{commit}`]);
  return read._tag === "ok" && read.value.trim() !== "" ? read.value.trim() : undefined;
}

/** Whether the first commit is the second or one of its ancestors. */
function holds(root: string, commit: string, by: string): boolean {
  return gitExitCode(root, ["merge-base", "--is-ancestor", commit, by]) === 0;
}

/**
 * The base a landing with no base in its words goes to: the default branch
 * git names where it stands, else main or master. A name that is the
 * change's own branch, `greenline/<id>`, is no base (J-228 S1, the run
 * j217c-states-stop, whose clone's `origin/HEAD` named the change's branch).
 */
function defaultBase(root: string, id: string): string | undefined {
  const own = `greenline/${id}`;
  const named = defaultBranch(root);
  const stands = (name: string): boolean => name !== own && branchAt(root, name) !== undefined;
  if (named !== undefined && stands(named)) return named;
  return ["main", "master"].find(stands) ?? (named === own ? undefined : named);
}

/** Whether the base holds the change's last commit, the newest whose trailer names it. */
function holdsLast(root: string, id: string, base: string): boolean {
  const at = branchAt(root, base);
  const last = changeCommits(root, id)[0];
  return at !== undefined && last !== undefined && holds(root, last, at);
}

/**
 * The change's commits on the local branches, each not a merge, newest
 * first in topological order: the commits whose `Greenline-Change` trailer
 * names it.
 */
function changeCommits(root: string, id: string): readonly string[] {
  const read = readGit(root, [
    "log",
    "--branches",
    "--topo-order",
    "--no-merges",
    "--fixed-strings",
    `--grep=Greenline-Change: ${id}`,
    "--format=%H%x00%(trailers:key=Greenline-Change,valueonly,separator=%x1f)",
  ]);
  if (read._tag === "err") return [];
  return read.value.split("\n").flatMap((line) => {
    const [hash, trailers] = line.split("\0");
    if (hash === undefined || !/^[0-9a-f]{40,64}$/.test(hash)) return [];
    const named = (trailers ?? "").split("\x1f").map((value) => value.trim());
    return named.includes(id) ? [hash] : [];
  });
}

/**
 * The change's branch: `greenline/<id>` where it stands, else a local branch
 * other than the base that holds the change's first commit, the branch HEAD
 * names first among them; undefined where none does, a branch deleted after
 * its merge among them.
 */
function changeBranch(
  root: string,
  id: string,
  base: string | undefined,
  first: string | undefined,
): string | undefined {
  const own = `greenline/${id}`;
  if (branchAt(root, own) !== undefined) return own;
  if (first === undefined) return undefined;
  const read = readGit(root, [
    "for-each-ref",
    "--format=%(refname:short)",
    "--contains",
    first,
    "refs/heads",
  ]);
  if (read._tag === "err") return undefined;
  const names = read.value
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== base);
  const current = currentBranch(root);
  return current !== undefined && names.includes(current) ? current : names[0];
}

/** The base's hold of the change's branch, or of its last commit where no branch of it stands. */
function baseHold(root: string, id: string, base: string | undefined): BaseHold | undefined {
  if (base === undefined) return undefined;
  const at = branchAt(root, base);
  const commits = changeCommits(root, id);
  const branch = changeBranch(root, id, base, commits.at(-1));
  const head = branch === undefined ? commits[0] : branchAt(root, branch);
  return {
    name: base,
    at,
    branch,
    holds: at !== undefined && head !== undefined && holds(root, head, at),
  };
}

/** The change's finished checks as `greenline check` recorded them, a probe aside. */
function recordedChecks(root: string, id: string): readonly CheckFacts[] {
  const folder = join(root, checksFolder(id));
  let names: readonly string[];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      const read = parseChecksFile(readFileSync(join(folder, name), "utf8"), name);
      return read.kind === "check" &&
        read.parsed._tag === "ok" &&
        read.parsed.value.state === "finished" &&
        read.parsed.value.probe !== true
        ? [read.parsed.value]
        : [];
    } catch {
      return [];
    }
  });
}

/** Whether a commit is a merge commit: two parents or more. */
function isMerge(root: string, commit: string): boolean {
  const read = readGit(root, ["rev-list", "--parents", "-n", "1", commit]);
  return read._tag === "ok" && read.value.trim().split(/\s+/).length > 2;
}

/**
 * The latest check of the change on a merge commit the base holds, and
 * whether the latest run of any command on that commit was red; undefined
 * where none ran.
 */
function mergeChecked(
  root: string,
  id: string,
  base: BaseHold | undefined,
): { readonly commit: string; readonly red: boolean } | undefined {
  const at = base?.at;
  if (at === undefined) return undefined;
  const merged = new Map<string, boolean>();
  const onMerge = recordedChecks(root, id).filter((facts) => {
    const commit = facts.commit;
    if (commit === null) return false;
    const known = merged.get(commit);
    if (known !== undefined) return known;
    const answer = isMerge(root, commit) && holds(root, commit, at);
    merged.set(commit, answer);
    return answer;
  });
  const latest = [...onMerge].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (latest?.commit === undefined || latest.commit === null) return undefined;
  const commit = latest.commit;
  // The latest run of each command on that commit, its directory beside it.
  const runs = new Map<string, CheckFacts>();
  for (const facts of onMerge.filter((each) => each.commit === commit)) {
    const key = `${facts.arguments.join("\0")}\0${facts.dir ?? ""}`;
    const known = runs.get(key);
    if (known === undefined || facts.startedAt > known.startedAt) runs.set(key, facts);
  }
  const red = [...runs.values()].some(
    (facts) =>
      facts.state !== "finished" || facts.outcome.kind !== "exited" || facts.outcome.code !== 0,
  );
  return { commit, red };
}

/** The push's state as git knows it: the branch's head and its remote-tracking branch. */
function pushState(root: string, id: string): LandingState {
  const remote = readRemote(root);
  const name = remote.kind === "forge" || remote.kind === "not-forge" ? remote.name : undefined;
  const commits = changeCommits(root, id);
  const branch = changeBranch(root, id, undefined, commits.at(-1));
  const head = branch === undefined ? undefined : branchAt(root, branch);
  const tracking =
    name === undefined || branch === undefined
      ? undefined
      : readGit(root, ["rev-parse", "--verify", "--quiet", `refs/remotes/${name}/${branch}`]);
  const pushed =
    tracking?._tag === "ok" && tracking.value.trim() !== "" ? tracking.value.trim() : undefined;
  return {
    kind: "push",
    branch,
    head,
    remote: name,
    pushed,
    holds: pushed !== undefined && head !== undefined && holds(root, head, pushed),
  };
}

/*
 * The landing's offer noted at a turn's end (J-209 S1): the turn a change
 * the session holds was first seen `done` with no landing line, the turn
 * whose reply offered the landing, in `<session>.landing.json` in the main
 * checkout's sessions, a working file no commit carries; the owner's
 * messages of the turns after it are read against the landing's words, and
 * the note goes once the record carries a landing line or leaves `done`.
 */

const OFFER_NOTE = z.object({ change: z.string(), turn: z.number().int().min(0) });

function offerFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(sessionsHome(root), `${safe}.landing.json`);
}

function readOffer(path: string): z.infer<typeof OFFER_NOTE> | undefined {
  try {
    const read = OFFER_NOTE.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a change's record is `done` and carries no landing line, the owner's answer to the offer still owed. */
function offerStands(root: string, id: string): boolean {
  const record = workingRecord(root, id);
  return (
    record !== undefined &&
    record.readable &&
    record.state === "done" &&
    record.landing === undefined &&
    record.declined === undefined
  );
}

/**
 * Note at a turn's end the turn the landing was offered (J-209 S1): the
 * change the session holds, `done` with no landing line, noted at the first
 * turn's end that sees it so; the note removed once its record carries a
 * landing line or leaves `done`.
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change the branch holds, undefined where none
 */
export function noteLandingOffer(root: string, session: string, change: string | undefined): void {
  const id = change ?? sessionChange(root, session);
  const path = offerFile(root, session);
  const turn = sessionTurn(root, session);
  if (id === undefined || path === undefined || turn === null) return;
  const noted = readOffer(path);
  if (!offerStands(root, id)) {
    if (noted?.change === id) rmSync(path, { force: true });
    return;
  }
  if (noted?.change === id) return;
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify({ change: id, turn })}\n`);
}

/**
 * The owner's latest words since the landing's offer that answer it (J-209
 * S1): the session's journaled messages of the turns after the one its
 * offer was noted at, or the current turn's where none was noted, each read
 * against the merge, push and decline words (`landingAnswer`), the act the
 * offer named taken from the remote's kind.
 * @param root the repository root
 * @param id the change
 * @param session the harness's session id, null for the session whose turn started last
 * @param base the base the landing would go to, which a merge whose words name none takes
 * @returns the answer, or undefined where no message answers it
 */
function landingAsked(
  root: string,
  id: string,
  session: string | null,
  base: string | undefined,
): LandingAsked | undefined {
  const named = session ?? latestSession(root);
  if (named === undefined) return undefined;
  const turn = sessionTurn(root, named);
  if (turn === null) return undefined;
  const path = offerFile(root, named);
  const noted = path === undefined ? undefined : readOffer(path);
  const offered = noted?.change === id ? noted.turn : undefined;
  const offer: LandingOffer = readRemote(root).kind === "forge" ? "push" : "merge";
  let asked: LandingAsked | undefined;
  for (const entry of journaledMessages(root, named)) {
    const at = entry.turn;
    if (at === undefined || (offered === undefined ? at !== turn : at <= offered)) continue;
    // Before the offer is noted, only words that name the act answer it (J-228 S1).
    const answer = landingAnswer(ownersOwnWords(entry.words), offer, offered !== undefined);
    if (answer === undefined) continue;
    asked =
      answer.kind === "merge"
        ? { kind: "merge", base: answer.base ?? base ?? "the base", turn: at }
        : { kind: answer.kind, turn: at };
  }
  return asked;
}

/**
 * The landing's state of a change from its record and git (J-202 S1), for a
 * change whose close has run: its record `done`, or its `landing` line
 * holding the owner's answer; while no landing line stands, the owner's
 * words since the offer that answer it (J-209 S1).
 * @param root the repository root
 * @param id the change
 * @param session the session whose journal is read, null for the one whose turn started last, undefined for none
 * @returns the state, or undefined where the change's close has not run
 */
function landingState(root: string, id: string, session?: string | null): LandingState | undefined {
  const record = workingRecord(root, id);
  if (record === undefined || !record.readable) return undefined;
  if (record.declined !== undefined) return { kind: "declined" };
  const landing = record.landing;
  if (landing === undefined) {
    if (record.state !== "done") return undefined;
    const name = defaultBase(root, id);
    const remote = readRemote(root).kind;
    // The base holds the change's commits and no remote is a forge: nothing is to land, and no words answer it (J-228 S1).
    if (remote !== "forge" && name !== undefined && holdsLast(root, id, name))
      return { kind: "nothing", base: name };
    return {
      kind: "none",
      base: baseHold(root, id, name),
      asked: session === undefined ? undefined : landingAsked(root, id, session, name),
      // The offer's facts where a session is read, the mirror's and the status's (J-228 S1).
      offer:
        session === undefined
          ? undefined
          : {
              act: remote === "forge" ? "push" : "merge",
              guide: homesOf(root).find((home) => home.kind === "contributing")?.path,
            },
    };
  }
  if (!MERGE.test(landing)) return pushState(root, id);
  const base = baseHold(root, id, MERGE_BASE.exec(landing)?.[1] ?? defaultBase(root, id));
  return { kind: "merge", base, checked: mergeChecked(root, id, base) };
}

/**
 * Whether the turn the session is in withheld the merge the owner asked for
 * (J-209 S1): the change it holds carries no landing line, the owner's words
 * since the offer ask for the merge, and the base does not hold the branch;
 * read at the turn's end for the next mirror, a notice and never a refusal.
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change the branch holds, undefined where none
 * @returns true where the merge was withheld
 */
export function withheldMerge(root: string, session: string, change: string | undefined): boolean {
  try {
    const id = change ?? sessionChange(root, session);
    if (id === undefined) return false;
    const state = landingState(root, id, session);
    return state?.kind === "none" && state.asked?.kind === "merge" && state.base?.holds !== true;
  } catch {
    return false;
  }
}

/**
 * The landing line of a change whose close has run (J-202 S1), undefined
 * for any other change.
 * @param root the repository root
 * @param id the change, undefined where none is named
 * @param session the session whose journal the owner's words are read from, null for the one whose turn started last, undefined for none (J-209 S1)
 * @returns the line, unindented
 */
export function landingText(
  root: string,
  id: string | undefined,
  session?: string | null,
): string | undefined {
  if (id === undefined) return undefined;
  try {
    const state = landingState(root, id, session);
    return state === undefined ? undefined : landingLine(id, state);
  } catch {
    // A reading git cannot finish names nothing; the fact never stops the turn.
    return undefined;
  }
}

/**
 * The landing line the mirror and the status print for the change the
 * session holds (J-202 S1): the open change where one is, else the change
 * the session last named by writing its record.
 * @param root the repository root
 * @param open the open change, undefined where none is
 * @param session the harness's session id, null for the session whose turn started last
 * @returns the line, unindented, or undefined where the change's close has not run
 */
export function heldLandingText(
  root: string,
  open: string | undefined,
  session: string | null,
): string | undefined {
  return landingText(root, open ?? sessionChange(root, session), session);
}
