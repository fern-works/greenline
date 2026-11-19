import { describe, expect, it } from "vitest";
import { finishedFacts, startedFacts, type CheckFacts } from "../../src/core/facts.ts";
import { recordBreaches } from "../../src/core/record-lint.ts";
import { confirmedSettled } from "../../src/core/record-lines.ts";
import {
  changeOfBranch,
  concludes,
  confirmedVerdict,
  doneVerdict,
  GIT_HOOK_NAMES,
  gitHookScript,
  gitVersionOf,
  holdsNoChange,
  isDefaultBranch,
  mergeBaseVerdict,
  messageHasText,
  noChangeVerdict,
  orderTrailerBlock,
  outsideClauseVerdict,
  outsideConfirmVerdict,
  planningChangesOf,
  proceedAdmits,
  pushUpdates,
  pushVerdict,
  rebaseVerdict,
  recordFacts,
  recordFormVerdict,
  refreshVerdict,
  refUpdates,
  registrationFor,
  rewriteVerdict,
  trailerVerdict,
  wordsName,
  yesVerdict,
  type BranchFacts,
  type ProceedSetting,
  type PushFacts,
  type RecordEntry,
  type RecordFacts,
} from "../../src/core/git-hooks.ts";

const ID = "2026-10-19-retry";
const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const ZERO = "0".repeat(40);
const REVISION = "c".repeat(64);

function run(args: readonly string[], code: number | "started", at = "12"): CheckFacts {
  const started = startedFacts({
    arguments: args,
    startedAt: `2026-10-19T${at}:00:00.000Z`,
    commit: null,
    tree: null,
    installation: REVISION,
  });
  return code === "started" ? started : finishedFacts(started, { kind: "exited", code }, 5);
}

const chosen: RecordFacts = { readable: true, state: "open", choice: "accepted", yes: "Yes." };

function facts(record: RecordFacts | undefined, ancestor: boolean | undefined): PushFacts {
  return {
    changeOf: (branch) =>
      changeOfBranch(branch, {
        current: "main",
        defaultBranch: undefined,
        hasRemote: true,
        records: [],
      }),
    recordOf: () => record,
    isAncestor: () => ancestor,
    currentObject: () => OLD,
    hasObject: () => true,
  };
}

describe("J-93 S3 the git hooks' scripts", () => {
  it("each hands git's arguments to greenline and lets git go on when greenline is not on the PATH", () => {
    for (const name of GIT_HOOK_NAMES) {
      const script = gitHookScript(name);
      expect(script.startsWith("#!/bin/sh\n")).toBe(true);
      expect(script).toContain("command -v greenline >/dev/null 2>&1 || exit 0");
      expect(script).toContain(`greenline hook ${name} "$@"`);
      expect(script.endsWith("\n")).toBe(true);
      expect(script).not.toContain("—");
    }
  });

  it("the reference-transaction script starts greenline only for the prepared state of a branch update", () => {
    const script = gitHookScript("reference-transaction");
    expect(script).toContain('if [ "$1" != prepared ]; then cat >/dev/null; exit 0; fi');
    expect(script).toContain('case "$updates" in *" refs/heads/"*) ;; *) exit 0 ;; esac');
  });
});

describe("J-93 S3 the record facts the hooks read, never a command", () => {
  it("reads the choice, landing and rebase lines and the state, mode, next and agents loosely", () => {
    expect(
      recordFacts(
        '---\nmode: quick\nchoice: owner\nwhy: "w"\nstate: done\noutcome: "The change landed."\nagents: 2\nrounds: 0\nlanding: "push it, the owner, 2026-10-19"\nrebase: "rebase onto main"\n---\n',
      ),
    ).toEqual({
      readable: true,
      mode: "quick",
      choice: "owner",
      state: "done",
      agents: 2,
      // The rounds beside the agents, read for the owner's accepted overrun (J-174).
      rounds: 0,
      landing: "push it, the owner, 2026-10-19",
      rebase: "rebase onto main",
      closeWritten: false,
    });
    expect(recordFacts("no front matter\n")).toEqual({ readable: false });
  });

  it("reads whether the close section holds text of its own, its none line apart", () => {
    const close = (body: string) => recordFacts(`---\nstate: open\n---\n\n${body}`).closeWritten;
    expect(close("## build\n\nx\n\n## close\n\nThe landing was offered.\n")).toBe(true);
    expect(close("## close\n\nnone at quick\n")).toBe(false);
    expect(close("## close\n\n## verify\n\nx\n")).toBe(false);
    expect(close("## build\n\nx\n")).toBe(false);
  });

  it("J-226 S1 reads the record's floors line: a list, none as the empty list, absent where it is missing or a placeholder", () => {
    const floors = (line: string) => recordFacts(`---\nstate: open\n${line}\n---\n`).floors;
    expect(floors("floors: [public-contract, security]")).toEqual(["public-contract", "security"]);
    expect(floors("floors: []")).toEqual([]);
    expect(floors("floors: none")).toEqual([]);
    expect(floors('floors: "<each floor you found, as [security], or none>"')).toBeUndefined();
    expect(floors("why: w")).toBeUndefined();
  });

  it("J-226 S1 reads a close at its placeholder or a stand-in as unwritten, as the record lacks line does (j217c-states-stop finding 4)", () => {
    const close = (body: string) => recordFacts(`---\nstate: open\n---\n\n${body}`).closeWritten;
    // The resume's record at 002/001: the close still at the skeleton's placeholder.
    expect(
      close("## build\n\n<the builder's section>\n\n## close\n\n<one line by the builder>\n"),
    ).toBe(false);
    expect(close("## close\n\n<the builder's section>\n")).toBe(false);
    expect(close("## close\n\nPending.\n")).toBe(false);
    expect(close("## close\n\n**TBD**\n")).toBe(false);
    // The agent's words with a placeholder left beside them are not written yet either.
    expect(close("## close\n\nThe landing was offered.\n\n<the builder's section>\n")).toBe(false);
    expect(close("## close\n\nThe landing was offered; no ADR.\n")).toBe(true);
  });

  it("finds a change by its greenline branch, or as the one open change of a branch that is not the default", () => {
    const facts = (current: string, open: readonly string[], named?: string) => ({
      current,
      defaultBranch: named,
      hasRemote: true,
      records: open.map((id) => ({ id, facts: chosen })),
    });
    expect(changeOfBranch(`greenline/${ID}`, facts("main", []))).toEqual({
      id: ID,
      owner: ID,
      via: "branch",
      trailers: [ID],
    });
    expect(changeOfBranch("feature", facts("feature", [ID]))).toMatchObject({
      id: ID,
      via: "open",
    });
    expect(changeOfBranch("feature", facts("feature", [ID, "2026-10-19-other"]))).toBeUndefined();
    expect(changeOfBranch("feature", facts("feature", []))).toBeUndefined();
    expect(changeOfBranch("side", facts("feature", [ID]))).toBeUndefined();
    expect(changeOfBranch("greenline/not-an-id", facts("main", []))).toBeUndefined();
    expect(changeOfBranch(undefined, facts("main", [ID]))).toBeUndefined();
  });

  it("where a remote exists, never takes the default branch for a change's, as its remote or configuration names it, or main and master", () => {
    const facts = (current: string, named?: string) => ({
      current,
      defaultBranch: named,
      hasRemote: true,
      records: [{ id: ID, facts: chosen }],
    });
    expect(changeOfBranch("main", facts("main"))).toBeUndefined();
    expect(changeOfBranch("master", facts("master"))).toBeUndefined();
    expect(changeOfBranch("trunk", facts("trunk", "trunk"))).toBeUndefined();
    expect(changeOfBranch("main", facts("main", "trunk"))).toMatchObject({ id: ID });
    expect(isDefaultBranch("main", undefined)).toBe(true);
    expect(isDefaultBranch("develop", "develop")).toBe(true);
  });

  it("J-98 S1 with no remote, takes the one open change of the default branch, where the frame rule puts its commits", () => {
    const onBranch = (current: string, named?: string) => ({
      current,
      defaultBranch: named,
      hasRemote: false,
      records: [{ id: ID, facts: chosen }],
    });
    expect(changeOfBranch("main", onBranch("main"))).toMatchObject({ id: ID, via: "open" });
    expect(changeOfBranch("master", onBranch("master"))).toMatchObject({ id: ID, via: "open" });
    expect(changeOfBranch("trunk", onBranch("trunk", "trunk"))).toMatchObject({ id: ID });
    // Only the branch HEAD names holds the open change, the default one included.
    expect(changeOfBranch("main", onBranch("feature"))).toBeUndefined();
    expect(
      changeOfBranch("main", {
        ...onBranch("main"),
        records: [{ id: ID, facts: { ...chosen, state: "done" } }],
      }),
    ).toBeUndefined();
  });

  it("J-98 S1 takes the change a commit finishes or stops as the branch's, so its closing commit carries its trailer", () => {
    const closing = {
      current: "main",
      defaultBranch: undefined,
      hasRemote: false,
      records: [{ id: ID, facts: { ...chosen, state: "done" } }],
      finishing: [ID],
    };
    expect(changeOfBranch("main", closing)).toMatchObject({ id: ID, via: "open" });
    expect(changeOfBranch("main", { ...closing, finishing: [] })).toBeUndefined();
    // J-102 S1: where a remote exists, the default branch holds no open change, but the commit
    // that finishes or stops one there, a local landing's close, is that change's.
    expect(changeOfBranch("main", { ...closing, hasRemote: true })).toMatchObject({
      id: ID,
      via: "open",
    });
    expect(changeOfBranch("main", { ...closing, hasRemote: true, finishing: [] })).toBeUndefined();
    // Only a record moving to done or stopped is a close; a dropped or unreadable one is not.
    expect(
      changeOfBranch("main", {
        ...closing,
        hasRemote: true,
        records: [{ id: ID, facts: { ...chosen, state: "stopped" } }],
      }),
    ).toMatchObject({ id: ID });
    for (const facts of [{ ...chosen, state: "dropped" }, { readable: false }])
      expect(
        changeOfBranch("main", { ...closing, hasRemote: true, records: [{ id: ID, facts }] }),
      ).toBeUndefined();
    expect(
      changeOfBranch("main", {
        ...closing,
        hasRemote: true,
        records: [
          ...closing.records,
          { id: "2026-10-19-other", facts: { ...chosen, state: "done" } },
        ],
        finishing: [ID, "2026-10-19-other"],
      }),
    ).toBeUndefined();
    expect(
      changeOfBranch("feature", { ...closing, current: "feature", hasRemote: true }),
    ).toMatchObject({ id: ID });
  });

  it("J-135 S1 takes a commit staging done or stopped as concluding the change whatever HEAD holds, a done record with code beside it aside", () => {
    const at = (state: string): RecordFacts => ({ ...chosen, state });
    // Concludes with code beside the record: open, stopped or no record at HEAD, staged done or stopped.
    for (const head of [at("open"), at("stopped"), undefined, { readable: false }])
      for (const staged of [at("done"), at("stopped")])
        expect(concludes(head, staged, true)).toBe(true);
    for (const head of [at("open"), undefined])
      expect(concludes(head, at("stopped"), false)).toBe(true);
    expect(concludes(at("stopped"), at("done"), false)).toBe(true);
    // A stopped record's amendment concludes it only in a commit of its record and folder alone.
    expect(concludes(at("stopped"), at("stopped"), false)).toBe(false);
    // A record HEAD holds done never carries code; a staged open, dropped or unreadable record beside code concludes nothing.
    for (const staged of [at("done"), at("stopped"), at("open")])
      expect(concludes(at("done"), staged, false)).toBe(false);
    for (const staged of [at("open"), at("dropped"), { readable: false }, undefined])
      expect(concludes(at("stopped"), staged, false)).toBe(false);
    // The concluded change is the branch's on main with no remote, a stopped record included.
    const stopped = {
      current: "main",
      defaultBranch: undefined,
      hasRemote: false,
      records: [{ id: ID, facts: at("stopped") }],
      finishing: [ID],
    };
    expect(changeOfBranch("main", stopped)).toMatchObject({ id: ID, via: "open" });
    expect(holdsNoChange("main", stopped)).toBe(false);
    expect(holdsNoChange("main", { ...stopped, finishing: [] })).toBe(true);
    // Beside another open change, the one change the commit concludes owns it, its trailer written.
    const beside = {
      ...stopped,
      records: [...stopped.records, { id: "2026-10-19-other", facts: chosen }],
    };
    expect(changeOfBranch("main", beside)).toMatchObject({ id: ID, trailers: [ID] });
    expect(changeOfBranch("main", { ...beside, finishing: [] })).toMatchObject({
      id: "2026-10-19-other",
    });
  });

  it("J-139 S1 takes a commit of the record and its folder alone as the change's whatever state HEAD holds the record in", () => {
    const at = (state: string): RecordFacts => ({ ...chosen, state });
    // Alone: open, stopped, done, unreadable or no record at HEAD, whatever the commit stages.
    for (const head of [at("open"), at("stopped"), at("done"), undefined, { readable: false }])
      for (const staged of [at("open"), at("stopped"), at("done"), at("dropped"), undefined])
        expect(concludes(head, staged, true)).toBe(true);
    // The owner's landing words after the close: done at HEAD, done staged, alone, on a branch with a remote.
    const words = {
      current: "feature/find-by-author",
      defaultBranch: "main",
      hasRemote: true,
      records: [{ id: ID, facts: at("done") }],
      finishing: [ID],
    };
    expect(changeOfBranch("feature/find-by-author", words)).toMatchObject({
      id: ID,
      trailers: [ID],
    });
    expect(holdsNoChange("feature/find-by-author", words)).toBe(false);
    // The same on main with no remote, and on main with a remote, where the one change the commit finishes owns it.
    const main = { ...words, current: "main", defaultBranch: undefined, hasRemote: false };
    expect(changeOfBranch("main", main)).toMatchObject({ id: ID });
    expect(changeOfBranch("main", { ...main, hasRemote: true })).toMatchObject({ id: ID });
    // With code beside it the done record concludes nothing, so no change is open.
    expect(holdsNoChange("main", { ...main, finishing: [] })).toBe(true);
  });

  it("J-145 S2 takes a commit of one change's folder alone as that change's on any branch, its record in the index in any state", () => {
    const at = (state: string): RecordFacts => ({ ...chosen, state });
    // A done change's check fact staged under its folder alone: the record unstaged, so it concludes nothing.
    const folder = {
      current: "main",
      defaultBranch: "main",
      hasRemote: true,
      records: [{ id: ID, facts: at("done") }],
      finishing: [],
      alone: ID,
    };
    for (const facts of [
      folder,
      { ...folder, hasRemote: false },
      { ...folder, current: "feature/find-by-author" },
      { ...folder, current: `greenline/${ID}` },
    ]) {
      const branch = facts.current;
      expect(changeOfBranch(branch, facts)).toMatchObject({ id: ID, trailers: [ID] });
      expect(holdsNoChange(branch, facts)).toBe(false);
    }
    // Stopped or dropped, the same.
    for (const state of ["stopped", "dropped"])
      expect(holdsNoChange("main", { ...folder, records: [{ id: ID, facts: at(state) }] })).toBe(
        false,
      );
    // Another branch than HEAD's takes nothing from the commit being made.
    expect(changeOfBranch("feature/find-by-author", folder)).toBeUndefined();
    // No record in the index: the folder names no change.
    expect(holdsNoChange("main", { ...folder, records: [] })).toBe(true);
    expect(changeOfBranch("main", { ...folder, records: [] })).toBeUndefined();
    // On the default branch of a repository with a remote, a record staged open opens no change there (J-102 S1).
    const opening = { ...folder, records: [{ id: ID, facts: at("open") }] };
    expect(holdsNoChange("main", opening)).toBe(true);
    expect(changeOfBranch("main", opening)).toBeUndefined();
    // With no remote, the open record alone is the change's, as the frame rule keeps its commits there.
    expect(holdsNoChange("main", { ...opening, hasRemote: false })).toBe(false);
    // Two changes' folders read as no one change.
    expect(holdsNoChange("main", { ...folder, alone: undefined })).toBe(true);
  });

  it("on a planning change's branch, takes the one open ticket's work and allows each of the plan's tickets' trailers", () => {
    const planning = "2026-10-19-plan";
    const records = [
      { id: planning, facts: { ...chosen, plan: "001-login" } },
      { id: "2026-10-19-t1", facts: { ...chosen, state: "done", plan: "001-login", ticket: "T1" } },
      { id: "2026-10-19-t2", facts: { ...chosen, plan: "001-login", ticket: "T2" } },
      { id: "2026-10-19-other", facts: { ...chosen, state: "done" } },
    ];
    const facts = { current: "main", defaultBranch: undefined, hasRemote: true, records };
    expect(changeOfBranch(`greenline/${planning}`, facts)).toEqual({
      id: "2026-10-19-t2",
      owner: planning,
      via: "branch",
      trailers: [planning, "2026-10-19-t1", "2026-10-19-t2"],
    });
    const none = records.map((entry) =>
      entry.id === "2026-10-19-t2" ? { ...entry, facts: { ...entry.facts, state: "done" } } : entry,
    );
    expect(changeOfBranch(`greenline/${planning}`, { ...facts, records: none })?.id).toBe(planning);
    // J-98 S1: the commit that closes the one open ticket is that ticket's, so it carries the ticket's trailer.
    const closing = records.map((entry) =>
      entry.id === "2026-10-19-t2" ? { ...entry, facts: { ...entry.facts, state: "done" } } : entry,
    );
    expect(
      changeOfBranch(`greenline/${planning}`, {
        ...facts,
        records: closing,
        finishing: ["2026-10-19-t2"],
      })?.id,
    ).toBe("2026-10-19-t2");
    // On a branch that is not the default, the planning change owns it while its tickets stay open beside it.
    expect(changeOfBranch("login", { ...facts, current: "login" })).toMatchObject({
      owner: planning,
      id: "2026-10-19-t2",
    });
  });
});

describe("J-93 S3 pre-commit: no commit before the owner's yes", () => {
  const branch = { id: ID, owner: ID, via: "branch", trailers: [ID] } as const;
  it("refuses a change's branch whose record stands nowhere, does not read, or carries no choice, naming the record", () => {
    for (const record of [
      undefined,
      { readable: false },
      { readable: true, state: "open" },
    ] satisfies (RecordFacts | undefined)[]) {
      const verdict = yesVerdict(branch, record, NONE);
      expect(verdict.kind).toBe("refuse");
      expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
        `.greenline/ledger/${ID}.md`,
      );
    }
  });

  it("allows a record with a choice, and a commit that belongs to no change", () => {
    expect(yesVerdict(branch, chosen, NONE)).toEqual({ kind: "allow" });
    expect(yesVerdict(undefined, undefined, NONE)).toEqual({ kind: "allow" });
  });
});

/** The modes in the definition's order, fastest first, as the tests read them. */
const ORDER = ["quick", "regular", "careful"] as const;

function setting(proceed: string, order: readonly string[] | "unread" = ORDER): ProceedSetting {
  return { proceed, modes: () => (order === "unread" ? undefined : order) };
}

const NONE = setting("none");

describe("J-102 S1 pre-commit: no commit while no change is open on the branch HEAD names", () => {
  const record = (id: string, state: string): RecordEntry => ({
    id,
    facts: { readable: true, state, choice: "accepted" },
  });
  const branchFacts = (over: Partial<BranchFacts> = {}): BranchFacts => ({
    current: "main",
    defaultBranch: undefined,
    hasRemote: false,
    records: [],
    ...over,
  });

  it("holds a branch whose working tree holds no open record, the default one with no remote included", () => {
    expect(holdsNoChange("main", branchFacts())).toBe(true);
    expect(holdsNoChange("feature", branchFacts({ current: "feature" }))).toBe(true);
    expect(holdsNoChange("main", branchFacts({ records: [record(ID, "done")] }))).toBe(true);
    expect(holdsNoChange("main", branchFacts({ records: [record(ID, "stopped")] }))).toBe(true);
  });

  it("holds the default branch of a repository with a remote, an open record there counting for nothing", () => {
    expect(
      holdsNoChange("main", branchFacts({ hasRemote: true, records: [record(ID, "open")] })),
    ).toBe(true);
    // A commit there that finishes or stops a change, the local landing's close, is that change's.
    expect(
      holdsNoChange(
        "main",
        branchFacts({ hasRemote: true, records: [record(ID, "done")], finishing: [ID] }),
      ),
    ).toBe(false);
    expect(
      holdsNoChange(
        "trunk",
        branchFacts({ current: "trunk", hasRemote: true, defaultBranch: "trunk" }),
      ),
    ).toBe(true);
  });

  it("lets go of a change's own branch, an open record, one the commit finishes or stops, and two open changes", () => {
    expect(holdsNoChange(`greenline/${ID}`, branchFacts({ current: `greenline/${ID}` }))).toBe(
      false,
    );
    expect(holdsNoChange("main", branchFacts({ records: [record(ID, "open")] }))).toBe(false);
    expect(
      holdsNoChange("main", branchFacts({ records: [record(ID, "done")], finishing: [ID] })),
    ).toBe(false);
    expect(
      holdsNoChange(
        "feature",
        branchFacts({
          current: "feature",
          hasRemote: true,
          records: [record(ID, "open"), record("2026-10-19-other", "open")],
        }),
      ),
    ).toBe(false);
  });

  it("refuses with one line naming the branch and the remedy, and lets a detached HEAD go on", () => {
    expect(noChangeVerdict("main", branchFacts())).toEqual({
      kind: "refuse",
      reason:
        "no change is open on main, so nothing is committed there yet; open the change's record under .greenline/ledger/ first, once the owner has said yes; no-open-change",
    });
    expect(noChangeVerdict(undefined, branchFacts())).toEqual({ kind: "allow" });
    expect(noChangeVerdict("main", branchFacts({ records: [record(ID, "open")] }))).toEqual({
      kind: "allow",
    });
  });

  it("J-186 S1 names a greenline branch whose name holds no change's id, with the id's form and the rename (j109t-conduct-runnerc)", () => {
    const branch = "greenline/find-author-case";
    expect(noChangeVerdict(branch, branchFacts({ current: branch }))).toEqual({
      kind: "refuse",
      reason:
        "no change is open on greenline/find-author-case, whose name holds no change's id: a change's branch is greenline/<id>, the id the date it was chosen and a slug, such as greenline/2026-10-08-retry-deadline; rename the branch to its change's id, `git branch -m greenline/find-author-case greenline/<YYYY-MM-DD>-find-author-case`, and open the change's record under .greenline/ledger/ once the owner has said yes; no-open-change",
    });
    // A record whose id ends in the branch's slug names the id the rename takes.
    const named = noChangeVerdict(
      branch,
      branchFacts({ current: branch, records: [record("2026-11-06-find-author-case", "stopped")] }),
    );
    expect(named).toMatchObject({ kind: "refuse" });
    expect(named.kind === "refuse" ? named.reason : "").toContain(
      "`git branch -m greenline/find-author-case greenline/2026-11-06-find-author-case`",
    );
  });

  it("J-188 S1 holds a greenline branch whose name holds no change's id whatever change its tree holds open, naming no change for it (j109t-conduct-runnerd)", () => {
    const branch = "greenline/author-case";
    const id = "2026-11-07-author-case";
    // The change open in the working tree, the commit staging its record alone, the trailer's change aside.
    for (const over of [
      { records: [record(id, "open")] },
      { records: [record(id, "open")], alone: id },
      { records: [record(id, "done")], finishing: [id] },
    ]) {
      const facts = branchFacts({ current: branch, hasRemote: true, ...over });
      expect(changeOfBranch(branch, facts)).toBeUndefined();
      expect(holdsNoChange(branch, facts)).toBe(true);
      const verdict = noChangeVerdict(branch, facts);
      expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
        `whose name holds no change's id: a change's branch is greenline/<id>, the id the date it was chosen and a slug, such as greenline/2026-10-08-retry-deadline; rename the branch to its change's id, \`git branch -m ${branch} greenline/${id}\``,
      );
    }
    // A change's own branch, and a branch outside the prefix with its one open change, are as before.
    const own = branchFacts({ current: `greenline/${id}`, records: [record(id, "open")] });
    expect(changeOfBranch(`greenline/${id}`, own)).toMatchObject({ id, via: "branch" });
    expect(holdsNoChange(`greenline/${id}`, own)).toBe(false);
    const feature = branchFacts({ current: "feature", records: [record(id, "open")] });
    expect(changeOfBranch("feature", feature)).toMatchObject({ id, via: "open" });
    expect(holdsNoChange("feature", feature)).toBe(false);
  });
});

describe("J-102 S1 a standing choice is the yes only where proceed admits the record's mode", () => {
  const branch = { id: ID, owner: ID, via: "branch", trailers: [ID] } as const;
  const standing = (mode: string | undefined): RecordFacts => ({
    readable: true,
    state: "open",
    choice: "standing",
    mode,
  });

  it("reads proceed as the mode it names and every faster one, none admitting no mode", () => {
    expect(proceedAdmits(setting("none"), "quick")).toBe(false);
    expect(proceedAdmits(setting("quick"), "quick")).toBe(true);
    expect(proceedAdmits(setting("regular"), "quick")).toBe(true);
    expect(proceedAdmits(setting("regular"), "careful")).toBe(false);
    expect(proceedAdmits(setting("careful"), "regular")).toBe(true);
    expect(proceedAdmits(setting("regular"), undefined)).toBe(false);
    expect(proceedAdmits(setting("regular"), "turbo")).toBe(false);
  });

  it("needs the modes' order only where the setting names another mode, and says nothing where it cannot be read", () => {
    const unread = setting("regular", "unread");
    expect(proceedAdmits(unread, "regular")).toBe(true);
    expect(proceedAdmits(unread, "quick")).toBeUndefined();
    expect(proceedAdmits(setting("none", "unread"), "quick")).toBe(false);
  });

  it("refuses a standing choice proceed does not admit, naming the setting, and allows one it admits", () => {
    expect(yesVerdict(branch, standing("quick"), NONE)).toEqual({
      kind: "refuse",
      reason: `the change waits for the owner's yes, since .greenline/ledger/${ID}.md says choice: standing, which proceed none does not allow; wait for the yes and write the choice line owner or accepted; standing-choice`,
    });
    const careful = yesVerdict(branch, standing("careful"), setting("regular"));
    expect(careful.kind === "refuse" ? careful.reason : "").toContain(
      "says choice: standing, which proceed regular does not allow",
    );
    expect(yesVerdict(branch, standing("quick"), setting("quick"))).toEqual({ kind: "allow" });
    expect(yesVerdict(branch, standing("quick"), setting("careful"))).toEqual({ kind: "allow" });
    expect(yesVerdict(branch, standing("quick"), setting("careful", "unread"))).toEqual({
      kind: "allow",
    });
  });

  it("keeps owner and accepted as the yes whatever proceed says, an accepted record quoting the owner's yes", () => {
    for (const choice of ["owner", "accepted"])
      expect(
        yesVerdict(
          branch,
          { readable: true, state: "open", choice, mode: "careful", yes: "Yes." },
          NONE,
        ),
      ).toEqual({ kind: "allow" });
  });

  it("J-176 S1 holds an accepted record's yes line to the owner's journaled messages where the hooks kept them", () => {
    const accepted: RecordFacts = {
      readable: true,
      state: "open",
      choice: "accepted",
      mode: "careful",
      yes: "Yes, go ahead.",
    };
    const heard = { kept: true as const, messages: ["Fix it.", "Yes, go ahead."] };
    expect(yesVerdict(branch, accepted, NONE, heard)).toEqual({ kind: "allow" });
    expect(yesVerdict(branch, accepted, NONE, { kept: true, messages: ["Fix it."] })).toEqual({
      kind: "refuse",
      reason: `the change waits for the owner's yes: the yes line quotes "Yes, go ahead.", which no message of the owner's holds: quote their words as they said them, or ask for their yes; owner-yes`,
    });
    expect(yesVerdict(branch, { ...accepted, yes: undefined }, NONE, heard).kind).toBe("refuse");
    // A placeholder the skeleton left is no choice.
    expect(
      yesVerdict(branch, recordFacts('---\nchoice: "<owner, accepted or standing>"\n---\n'), NONE)
        .kind,
    ).toBe("refuse");
  });
});

describe("J-93 S3 pre-commit: no done over a check that is not green", () => {
  const test = { name: "test", command: "pnpm run test", dir: "." };
  const fact = (facts: CheckFacts, file = "checks/1.json") => ({ file, facts });

  it("refuses a done whose declared check has no run, a red one, or one still started, naming the fact", () => {
    const absent = doneVerdict(ID, [test], []);
    expect(absent).toMatchObject({ kind: "refuse" });
    expect(absent.kind === "refuse" ? absent.reason : "").toContain(
      "greenline check recorded no run of the declared check 'test' (pnpm run test)",
    );
    const red = doneVerdict(ID, [test], [fact(run(["pnpm", "run", "test"], 1))]);
    expect(red.kind === "refuse" ? red.reason : "").toContain(
      `exited 1 (.greenline/ledger/${ID}/checks/1.json)`,
    );
    const started = doneVerdict(ID, [test], [fact(run(["pnpm", "run", "test"], "started"))]);
    expect(started.kind === "refuse" ? started.reason : "").toContain("is still started");
  });

  it("reads the latest run, a probe left out, and a check the change recorded beside the declared ones", () => {
    const green = fact(run(["pnpm", "run", "test"], 0, "13"), "checks/2.json");
    expect(doneVerdict(ID, [test], [fact(run(["pnpm", "run", "test"], 1)), green])).toEqual({
      kind: "allow",
    });
    // A narrower green run matches the declared check's prefix and never hides the full run's red.
    const narrower = fact(
      run(["pnpm", "run", "test", "--", "a.test.ts"], 0, "15"),
      "checks/4.json",
    );
    const masked = doneVerdict(ID, [test], [fact(run(["pnpm", "run", "test"], 1)), narrower]);
    expect(masked.kind === "refuse" ? masked.reason : "").toContain("'pnpm run test' exited 1");
    const probe = fact({ ...run(["pnpm", "run", "test"], 1, "14"), probe: true }, "checks/3.json");
    expect(doneVerdict(ID, [test], [green, probe])).toEqual({ kind: "allow" });
    const other = doneVerdict(ID, [], [fact(run(["make", "lint"], 2))]);
    expect(other.kind === "refuse" ? other.reason : "").toContain(
      "the latest recorded run of the check 'make lint' exited 2",
    );
    expect(doneVerdict(ID, [], [])).toEqual({ kind: "allow" });
  });

  it("J-98 S1 reads a declared check's runs by its name, its command and its directory", () => {
    const web = { ...test, name: "web-test", dir: "apps/web" };
    const at = (ran: CheckFacts, dir: string, check?: string): CheckFacts => ({
      ...ran,
      dir,
      check,
    });
    expect(doneVerdict(ID, [web], [])).toMatchObject({ kind: "refuse" });
    // A run at the root is no run of the check declared in apps/web.
    const root = doneVerdict(ID, [web], [fact(run(["pnpm", "run", "test"], 0))]);
    expect(root.kind === "refuse" ? root.reason : "").toContain(
      "greenline check recorded no run of the declared check 'web-test' (pnpm run test in apps/web)",
    );
    expect(
      doneVerdict(ID, [web], [fact(at(run(["pnpm", "run", "test"], 0), "apps/web", "web-test"))]),
    ).toEqual({ kind: "allow" });
    // A run another check's name claims is not this one's, whatever its text and directory.
    expect(
      doneVerdict(ID, [web], [fact(at(run(["pnpm", "run", "test"], 0), "apps/web", "other"))]),
    ).toMatchObject({ kind: "refuse" });
    // The same command declared in two directories: each is read from its own runs.
    const api = { ...test, name: "api-test", dir: "apps/api" };
    const both = doneVerdict(
      ID,
      [web, api],
      [
        fact(at(run(["pnpm", "run", "test"], 0, "12"), "apps/web", "web-test"), "checks/1.json"),
        fact(at(run(["pnpm", "run", "test"], 1, "13"), "apps/api", "api-test"), "checks/2.json"),
      ],
    );
    expect(both.kind === "refuse" ? both.reason : "").toContain(
      "the latest recorded run of the declared check 'api-test' exited 1",
    );
  });
});

describe("J-93 S3 commit-msg and prepare-commit-msg: the trailer", () => {
  it("refuses another change's trailer, and allows the change's own or none", () => {
    const change = { id: ID, owner: ID, via: "branch", trailers: [ID] } as const;
    const other = trailerVerdict(change, [ID, "2026-10-19-other"]);
    expect(other.kind === "refuse" ? other.reason : "").toContain(
      "'Greenline-Change: 2026-10-19-other'",
    );
    const plan = { ...change, trailers: [ID, "2026-10-19-t1"] };
    expect(trailerVerdict(plan, ["2026-10-19-t1"])).toEqual({ kind: "allow" });
    expect(trailerVerdict(change, [ID])).toEqual({ kind: "allow" });
    expect(trailerVerdict(change, [])).toEqual({ kind: "allow" });
    expect(trailerVerdict(undefined, ["2026-10-19-other"])).toEqual({ kind: "allow" });
  });

  it("J-129 S3 orders the trailer block: the harness's trailers first, the agent's next, the change's last, once each", () => {
    const agent = "Greenline-Agent: claude-code/sonnet";
    const change = `Greenline-Change: ${ID}`;
    const coauthor = "Co-Authored-By: A <a@example.com>";
    expect(orderTrailerBlock(`fix: b\n\nthe body\n\n${agent}\n${coauthor}\n${change}\n`)).toBe(
      `fix: b\n\nthe body\n\n${coauthor}\n${agent}\n${change}\n`,
    );
    expect(orderTrailerBlock(`fix: b\n\n${agent}\n${change}\n${coauthor}`)).toBe(
      `fix: b\n\n${coauthor}\n${agent}\n${change}`,
    );
    expect(orderTrailerBlock(`fix: b\n\n${change}\n${coauthor}\n${change}\n`)).toBe(
      `fix: b\n\n${coauthor}\n${change}\n`,
    );
    // A block already in order, and a message with no block, stand as they are.
    const ordered = `fix: b\n\n${coauthor}\nSigned-off-by: S <s@example.com>\n${agent}\n${change}\n`;
    expect(orderTrailerBlock(ordered)).toBe(ordered);
    expect(orderTrailerBlock("fix: b\n")).toBe("fix: b\n");
    expect(orderTrailerBlock(`${change}\n`)).toBe(`${change}\n`);
    expect(orderTrailerBlock("fix: b\n\nNote: a body line\nnot a trailer\n")).toBe(
      "fix: b\n\nNote: a body line\nnot a trailer\n",
    );
  });

  it("J-129 S3 keeps a trailer's continuation lines with it, and git's comments and scissors' tail where they stand", () => {
    const message = [
      "fix: b",
      "",
      `Greenline-Change: ${ID}`,
      "Co-Authored-By: A",
      "  <a@example.com>",
      "",
      "# Please enter the commit message",
      "# ------------------------ >8 ------------------------",
      "diff --git a/b b/b",
    ].join("\n");
    expect(orderTrailerBlock(message)).toBe(
      [
        "fix: b",
        "",
        "Co-Authored-By: A",
        "  <a@example.com>",
        `Greenline-Change: ${ID}`,
        "",
        "# Please enter the commit message",
        "# ------------------------ >8 ------------------------",
        "diff --git a/b b/b",
      ].join("\n"),
    );
  });

  it("reads a message's text as git keeps it: comments and the scissors' tail left out", () => {
    expect(messageHasText("# Please enter the commit message\n#\n")).toBe(false);
    expect(messageHasText("\n\n")).toBe(false);
    expect(messageHasText("fix\n# comment\n")).toBe(true);
    expect(messageHasText("# ------------------------ >8 ------------------------\nfix\n")).toBe(
      false,
    );
  });
});

describe("J-93 S3 reference-transaction and pre-rebase: no rewrite of a change's history", () => {
  const branchFacts = (rebase?: string) => facts({ ...chosen, rebase }, false);

  it("refuses an update of a change's branch whose old commit is not an ancestor of the new, naming both", () => {
    const verdict = rewriteVerdict(
      refUpdates(`${OLD} ${NEW} refs/heads/greenline/${ID}\n`),
      branchFacts(),
    );
    expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
      `this would rewrite change ${ID}'s history without the owner's word: the update of refs/heads/greenline/${ID} from ${OLD.slice(0, 12)} to ${NEW.slice(0, 12)} leaves the old commit behind`,
    );
  });

  it("allows it with the owner's rebase line, a fast-forward, a branch made or deleted, another branch, and an answer git cannot give", () => {
    const updates = refUpdates(`${OLD} ${NEW} refs/heads/greenline/${ID}\n`);
    expect(rewriteVerdict(updates, branchFacts("the owner: rebase onto main"))).toEqual({
      kind: "allow",
    });
    expect(rewriteVerdict(updates, facts(chosen, true))).toEqual({ kind: "allow" });
    expect(rewriteVerdict(updates, facts(chosen, undefined))).toEqual({ kind: "allow" });
    expect(
      rewriteVerdict(refUpdates(`${ZERO} ${NEW} refs/heads/greenline/${ID}\n`), {
        ...branchFacts(),
        currentObject: () => undefined,
      }),
    ).toEqual({ kind: "allow" });
    // A forced move gives zeros as its old object; the branch's current one is read instead.
    expect(
      rewriteVerdict(refUpdates(`${ZERO} ${NEW} refs/heads/greenline/${ID}\n`), branchFacts()),
    ).toMatchObject({ kind: "refuse" });
    expect(
      rewriteVerdict(refUpdates(`${OLD} ${ZERO} refs/heads/greenline/${ID}\n`), branchFacts()),
    ).toEqual({ kind: "allow" });
    expect(
      rewriteVerdict(
        refUpdates(`${OLD} ${NEW} refs/heads/side\n${OLD} ${NEW} HEAD\n`),
        branchFacts(),
      ),
    ).toEqual({ kind: "allow" });
  });

  it("J-129 S4 names the commit to make where the working tree alone holds the rebase line", () => {
    const working = { ...branchFacts(), workingOf: () => ({ ...chosen, rebase: "regroup" }) };
    const rebase = rebaseVerdict(`greenline/${ID}`, working);
    expect(rebase.kind === "refuse" ? rebase.reason : "").toContain(
      `.greenline/ledger/${ID}.md holds the rebase line only in the working tree, and a line lifts only once committed: commit the record first, \`git commit -m "record the owner's words" -- .greenline/ledger/${ID}.md\`, then run it again; rebase-words`,
    );
    const rewrite = rewriteVerdict(
      refUpdates(`${OLD} ${NEW} refs/heads/greenline/${ID}\n`),
      working,
    );
    expect(rewrite.kind === "refuse" ? rewrite.reason : "").toContain(
      "holds the rebase line only in the working tree",
    );
    // Without a working line the refusal names no commit.
    const plainRefusal = rebaseVerdict(`greenline/${ID}`, branchFacts());
    expect(plainRefusal.kind === "refuse" ? plainRefusal.reason : "").not.toContain(
      "only in the working tree",
    );
  });

  it("pre-rebase refuses a change's branch without the rebase line, and allows it with one", () => {
    const refused = rebaseVerdict(`greenline/${ID}`, branchFacts());
    expect(refused.kind === "refuse" ? refused.reason : "").toContain("carries no rebase line");
    expect(rebaseVerdict(`greenline/${ID}`, branchFacts("yes"))).toEqual({ kind: "allow" });
    expect(rebaseVerdict("side", branchFacts())).toEqual({ kind: "allow" });
    expect(rebaseVerdict(undefined, branchFacts())).toEqual({ kind: "allow" });
  });
});

describe("J-93 S3 pre-push: no push without the owner's landing words, and no force push without the rebase words too", () => {
  const line = (remote: string) =>
    pushUpdates(`refs/heads/greenline/${ID} ${NEW} refs/heads/greenline/${ID} ${remote}\n`);
  const landed: RecordFacts = { ...chosen, landing: "push and open the pull request" };

  it("refuses any push of a change's branch while the record lacks landing", () => {
    const verdict = pushVerdict(line(ZERO), facts(chosen, true));
    expect(verdict.kind === "refuse" ? verdict.reason : "").toContain("carries no landing line");
    // J-129 S4: a landing line the working tree alone holds lifts nothing, and the refusal names the commit.
    const working = pushVerdict(line(ZERO), { ...facts(chosen, true), workingOf: () => landed });
    expect(working.kind === "refuse" ? working.reason : "").toContain(
      "holds the landing line only in the working tree",
    );
  });

  it("refuses a force push with the landing line alone, and allows a fast-forward or a new branch", () => {
    const forced = pushVerdict(line(OLD), facts(landed, false));
    expect(forced.kind === "refuse" ? forced.reason : "").toContain(
      `this push would write over change ${ID}'s pushed history without the owner's word`,
    );
    expect(forced.kind === "refuse" ? forced.reason : "").toMatch(/; force-push-words$/);
    expect(forced.kind === "refuse" ? forced.reason : "").toContain(
      "carries no rebase line with the owner's words for the rewrite beside its landing line",
    );
    // J-114 S3: a history cleanup after a push is pushed over under both of the owner's lines.
    expect(
      pushVerdict(line(OLD), facts({ ...landed, rebase: "regroup the commits" }, false)),
    ).toEqual({
      kind: "allow",
    });
    expect(pushVerdict(line(OLD), facts(landed, true))).toEqual({ kind: "allow" });
    expect(pushVerdict(line(ZERO), facts(landed, false))).toEqual({ kind: "allow" });
  });

  it("allows a remote object git does not hold, since no fact shows a rewrite, and another branch's push", () => {
    expect(pushVerdict(line(OLD), { ...facts(landed, false), hasObject: () => false })).toEqual({
      kind: "allow",
    });
    expect(
      pushVerdict(
        pushUpdates(`refs/heads/main ${NEW} refs/heads/main ${OLD}\n`),
        facts(chosen, false),
      ),
    ).toEqual({ kind: "allow" });
  });
});

describe("J-139 S1 pre-push: a change reaches the default branch only once its record is done", () => {
  const FEATURE = "feature/find-by-author";
  const words: RecordFacts = { ...chosen, landing: "Push it straight to main." };
  /** The facts of a push from the branch given, the change's record as given, main the default branch. */
  const from = (record: RecordFacts, current = FEATURE): PushFacts => ({
    changeOf: (branch) =>
      changeOfBranch(branch, {
        current,
        defaultBranch: "main",
        hasRemote: true,
        records: [{ id: ID, facts: record }],
      }),
    recordOf: () => record,
    isAncestor: () => true,
    currentObject: () => OLD,
    hasObject: () => true,
    current,
    isDefault: (branch) => branch === "main",
  });
  const head = pushUpdates(`HEAD ${NEW} refs/heads/main ${OLD}\n`);
  const named = pushUpdates(`refs/heads/${FEATURE} ${NEW} refs/heads/main ${OLD}\n`);
  const own = `greenline/${ID}`;

  it("refuses HEAD:main and the branch pushed to main while the record is open, whatever its landing line holds", () => {
    for (const updates of [head, named]) {
      const verdict = pushVerdict(updates, from(words));
      expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
        `this push would put change ${ID} on the default branch before its close: the push updates refs/heads/main, and .greenline/ledger/${ID}.md stands open in a commit; finish the review, the verify and the close first, or the owner pushes, since a change reaches the default branch only once its close sets the record done, whatever its landing line holds; push-before-close`,
      );
    }
    // On the change's own branch, a stopped record too.
    expect(pushVerdict(head, from(words, own)).kind).toBe("refuse");
    expect(pushVerdict(head, from({ ...words, state: "stopped" }, own)).kind).toBe("refuse");
  });

  it("lets the push through once the record is done with the landing words, and holds a done record without them", () => {
    expect(pushVerdict(head, from({ ...words, state: "done" }, own))).toEqual({ kind: "allow" });
    const bare = pushVerdict(head, from({ ...chosen, state: "done" }, own));
    expect(bare.kind === "refuse" ? bare.reason : "").toContain("carries no landing line");
  });

  it("reads the commit pushed: a record it holds open is refused though the working tree holds none open, two open records among them", () => {
    const working = {
      ...from({ ...words, state: "done" }),
      unfinishedAt: () => [{ id: ID, state: "open" }],
    };
    const verdict = pushVerdict(head, working);
    expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
      `this push would put change ${ID} on the default branch before its close: the push updates refs/heads/main, and .greenline/ledger/${ID}.md stands open in a commit`,
    );
    const two = {
      ...from(words),
      changeOf: () => undefined,
      unfinishedAt: () => [
        { id: ID, state: "open" },
        { id: "2026-10-19-other", state: "stopped" },
      ],
    };
    expect(pushVerdict(head, two).kind).toBe("refuse");
    // A commit that holds every record done goes on, as the close's push does.
    expect(
      pushVerdict(head, { ...from({ ...words, state: "done" }, own), unfinishedAt: () => [] }),
    ).toEqual({ kind: "allow" });
    // A record in no commit is named so.
    const none = pushVerdict(head, { ...from(words), recordOf: () => undefined });
    expect(none.kind === "refuse" ? none.reason : "").toContain(`${ID}.md is in no commit;`);
  });

  it("finds a done change's landing push from a ground branch in the commit pushed, its landing words read from the record", () => {
    const done = { ...words, state: "done" };
    const carried = { ...from(done), pushedChangeOf: () => ID };
    expect(pushVerdict(head, carried)).toEqual({ kind: "allow" });
    const bare = pushVerdict(head, { ...carried, recordOf: () => ({ ...chosen, state: "done" }) });
    expect(bare.kind === "refuse" ? bare.reason : "").toContain(
      `the push updates refs/heads/main, the default branch, with change ${ID}, and .greenline/ledger/${ID}.md carries no landing line`,
    );
    // Without the commit's change, as before, nothing is read.
    expect(pushVerdict(head, from(done))).toEqual({ kind: "allow" });
    // The ground branch pushed as itself is held to the same line, a done record's landing push.
    const branch = pushUpdates(`refs/heads/${FEATURE} ${NEW} refs/heads/${FEATURE} ${ZERO}\n`);
    const own = pushVerdict(branch, { ...carried, recordOf: () => ({ ...chosen, state: "done" }) });
    expect(own.kind === "refuse" ? own.reason : "").toContain(
      `the push updates refs/heads/${FEATURE}, change ${ID}'s branch, and .greenline/ledger/${ID}.md carries no landing line`,
    );
    expect(pushVerdict(branch, carried)).toEqual({ kind: "allow" });
    // Another branch pushed from the ground branch is not the commit's change's push.
    const other = pushUpdates(`refs/heads/other ${NEW} refs/heads/other ${ZERO}\n`);
    expect(pushVerdict(other, { ...carried, recordOf: () => undefined })).toEqual({
      kind: "allow",
    });
  });

  it("leaves the base push after a local landing alone: main pushed from main carries no open change", () => {
    const merged = { ...from(words), current: "main" };
    expect(
      pushVerdict(pushUpdates(`refs/heads/main ${NEW} refs/heads/main ${OLD}\n`), merged),
    ).toEqual({ kind: "allow" });
    // Without the default branch's facts, as before, the push carries no change.
    expect(pushVerdict(head, { ...from(words), isDefault: undefined })).toEqual({ kind: "allow" });
  });
});

describe("J-93 S3 registration: config-based hooks, core.hooksPath, or the line to add", () => {
  it("reads git's version", () => {
    expect(gitVersionOf("git version 2.54.0\n")).toEqual([2, 54, 0]);
    expect(gitVersionOf("git version 2.39.5 (Apple Git-154)")).toEqual([2, 39, 5]);
    expect(gitVersionOf("git version 3.0")).toEqual([3, 0, 0]);
    expect(gitVersionOf("nothing")).toBeUndefined();
  });

  it("registers config-based hooks on git 2.54 or later, whatever stands beside them", () => {
    expect(registrationFor([2, 54, 0], undefined, [])).toEqual({ kind: "config" });
    expect(registrationFor([2, 55, 1], ".husky/_", ["pre-commit"])).toEqual({ kind: "config" });
    expect(registrationFor([3, 0, 0], undefined, [])).toEqual({ kind: "config" });
  });

  it("sets core.hooksPath on an older git only where nothing else holds the hooks", () => {
    expect(registrationFor([2, 53, 9], undefined, [])).toEqual({ kind: "hooks-path" });
    expect(registrationFor([2, 40, 0], ".greenline/hooks", [])).toEqual({ kind: "hooks-path" });
    expect(registrationFor([2, 40, 0], ".husky/_", [])).toMatchObject({
      kind: "manual",
      reason: expect.stringContaining("'.husky/_'"),
    });
    expect(registrationFor([2, 40, 0], undefined, ["pre-commit"])).toMatchObject({
      kind: "manual",
      reason: expect.stringContaining("the owner's pre-commit"),
    });
    expect(registrationFor(undefined, undefined, [])).toMatchObject({ kind: "manual" });
  });
});

describe("J-147 S3 the refresh's verdict and the record's offers", () => {
  it("refuses done for up to three drifted pages with no refresh, and lets the owner's words or more pages through", () => {
    expect(refreshVerdict("2026-10-28-loans", [], [], undefined)).toEqual({ kind: "allow" });
    const refused = refreshVerdict("2026-10-28-loans", ["loans", "map"], [], "Closed.");
    expect(refused.kind).toBe("refuse");
    expect(refused.kind === "refuse" ? refused.reason : "").toContain(
      "the pages it touched, loans, map, drifted with no refresh; have one fresh agent refresh them",
    );
    expect(
      refreshVerdict("2026-10-28-loans", ["loans"], [], "The owner: Leave the pages."),
    ).toEqual({
      kind: "allow",
    });
    expect(refreshVerdict("2026-10-28-loans", ["a", "b", "c", "d"], [], undefined)).toEqual({
      kind: "allow",
    });
  });

  it("refuses done over a page the change rewrote that its refreshes do not name, whatever the owner's words and past any cap (J-227 S1)", () => {
    const unnamed = refreshVerdict(
      "2026-11-09-issue-projects",
      [],
      ["interface", "map"],
      undefined,
    );
    expect(unnamed).toEqual({
      kind: "refuse",
      reason:
        'the change cannot be marked done yet: .greenline/ledger/2026-11-09-issue-projects.md sets state: done, and the change rewrote interface, map, which the record\'s refreshes line does not name; name each with the agent that refreshed it and its cost, as refreshes: [{ by: <skill>, pages: "interface, map", cost: "<the agent and its time>" }], since a refresh made is a refresh named; atlas-refresh',
    });
    expect(
      refreshVerdict("2026-11-09-issue-projects", [], ["interface"], "The owner: leave the pages.")
        .kind,
    ).toBe("refuse");
    expect(
      refreshVerdict("2026-11-09-issue-projects", [], ["a", "b", "c", "d"], undefined).kind,
    ).toBe("refuse");
    // The owner's words lift the drifted list alone.
    expect(
      refreshVerdict("2026-11-09-issue-projects", ["loans"], [], "The owner: leave the pages."),
    ).toEqual({ kind: "allow" });
  });

  it("reads the pages its refreshes name and its close's text, and a placeholder as no line (J-176 S1)", () => {
    const facts = recordFacts(
      [
        "---",
        "mode: quick",
        "state: open",
        'choice: "<owner, accepted or standing>"',
        'yes: "Yes, go ahead."',
        "refreshes:",
        '  - { by: explain, pages: "loans, map", cost: "one agent" }',
        "---",
        "",
        "## close",
        "",
        "Leave the pages.",
        "",
      ].join("\n"),
    );
    expect(facts.choice).toBeUndefined();
    expect(facts.yes).toBe("Yes, go ahead.");
    expect(facts.refreshed).toEqual(["loans", "map"]);
    expect(facts.closeText).toBe("Leave the pages.");
  });
});

describe("J-148 S2 a local merge runs only into the base the owner's words named", () => {
  const facts = (landing?: string): RecordFacts =>
    recordFacts(
      [
        "---",
        "state: done",
        'outcome: "The change landed."',
        ...(landing === undefined ? [] : [`landing: "${landing}"`]),
        "---",
        "",
      ].join("\n"),
    );
  const ID = "2026-10-30-shelf";

  it("reads the base as one of the words, never a part of one", () => {
    expect(wordsName("merge into main: yes", "main")).toBe(true);
    expect(wordsName("Merge it into release/2.1.", "release/2.1")).toBe(true);
    expect(wordsName("maintain it, yes", "main")).toBe(false);
    expect(wordsName("yes", "main")).toBe(false);
  });

  it("lets a merge into the named base through, and one that lands no change", () => {
    expect(mergeBaseVerdict("main", [{ id: ID, record: facts("merge into main: yes") }])).toEqual({
      kind: "allow",
    });
    expect(mergeBaseVerdict("feature", [])).toEqual({ kind: "allow" });
  });

  it("refuses a merge into a base the words did not name, with one line naming the base and the line", () => {
    const verdict = mergeBaseVerdict("main", [
      { id: ID, record: facts("merge into release: yes") },
    ]);
    expect(verdict).toEqual({
      kind: "refuse",
      reason: `this merge would land change ${ID} on main, a base the owner's words in its landing line do not name, "merge into release: yes"; ask the owner once, naming main, write their words as \`landing: "merge into main: <their words>"\`, commit the record on the change's branch and merge again, or merge into the base they named; landing-words`,
    });
  });

  it("refuses a merge with no landing words, a declined answer named, and one on a detached HEAD", () => {
    const none = mergeBaseVerdict("main", [{ id: ID, record: facts() }]);
    expect(none.kind === "refuse" ? none.reason : "").toContain(
      "carries no landing line with the owner's words in the commit merged",
    );
    const declined = mergeBaseVerdict("main", [{ id: ID, record: facts("declined: later") }]);
    expect(declined.kind === "refuse" ? declined.reason : "").toContain(
      `the owner's answer declining the landing, "later", which lifts no merge`,
    );
    const detached = mergeBaseVerdict(undefined, [{ id: ID, record: facts("merge into main") }]);
    expect(detached.kind === "refuse" ? detached.reason : "").toContain("on a detached HEAD");
  });
});

describe("J-148 S3 the finished record's verdict over the marks line and the floor's ruling", () => {
  const ID = "2026-10-30-shelf";
  const text = (close: string, more: readonly string[] = []): string =>
    [
      "---",
      "mode: quick",
      'why: "w"',
      "choice: accepted",
      "state: done",
      'outcome: "The change landed."',
      "next: none",
      "---",
      "",
      ...more,
      "## close",
      "",
      close,
      "",
    ].join("\n");

  it("refuses done while the close says a mark waits that the files hold closed", () => {
    const verdict = recordFormVerdict(
      ID,
      recordBreaches({ id: ID, text: text("- marks: 1 open on /"), marks: { line: undefined } }),
    );
    expect(verdict.kind).toBe("refuse");
    expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
      `the close section's marks line says "marks: 1 open on /", and the marks files say "marks: none open"`,
    );
    expect(verdict.kind === "refuse" ? verdict.reason : "").toMatch(/; record-form$/);
  });

  it("refuses done while a named floor finding has no ruling, and allows it ruled", () => {
    const named = text("the checks green", ["## Interface", "", "- floor target-size", ""]);
    expect(recordFormVerdict(ID, recordBreaches({ id: ID, text: named })).kind).toBe("refuse");
    const ruled = text("the checks green", ["## Interface", "", "- floor target-size: fixed", ""]);
    expect(recordFormVerdict(ID, recordBreaches({ id: ID, text: ruled }))).toEqual({
      kind: "allow",
    });
  });
});

describe("J-223 S1 git's pre-commit holds the careful frame: the confirmed line, and nothing outside the homes before it", () => {
  const CHANGE = "2026-11-10-open-loans-csv";
  const ASKED = "2026-11-10T10:00:00.000Z";
  const careful = (more: Partial<RecordFacts> = {}): RecordFacts => ({
    readable: true,
    mode: "careful",
    state: "open",
    choice: "owner",
    ...more,
  });
  const journal = (asked: string | undefined, ...messages: [string, string][]) => ({
    kept: true as const,
    asked,
    messages: messages.map(([at, words]) => ({ at, words })),
  });
  const AFTER = "2026-11-10T10:05:00.000Z";
  const BEFORE = "2026-11-10T09:55:00.000Z";
  const homes = [`.greenline/ledger/${CHANGE}.md`, `.greenline/ledger/${CHANGE}/frame-map.json`];
  const code = [...homes, "src/shelf.js"];

  it("lets a commit of the homes alone through with no confirmed line, the record-first commit and a stop's", () => {
    expect(outsideConfirmVerdict(CHANGE, careful(), [], homes, journal(undefined))).toEqual({
      kind: "allow",
    });
    expect(confirmedVerdict(CHANGE, careful(), [], journal(undefined))).toEqual({
      kind: "allow",
    });
  });

  it("refuses a staged path outside the homes while the frame is not whole, naming its gaps", () => {
    const verdict = outsideConfirmVerdict(
      CHANGE,
      careful(),
      [{ rule: "careful", message: "the careful frame leaves 10 of the 12 subject nodes" }],
      code,
      journal(undefined),
    );
    expect(verdict.kind).toBe("refuse");
    expect(verdict.kind === "refuse" ? verdict.reason : "").toBe(
      `at careful nothing outside the change's homes is committed before the owner confirms the frame: the commit stages src/shelf.js, outside .greenline/ledger/, and the frame is not whole: the careful frame leaves 10 of the 12 subject nodes; commit .greenline/ledger/${CHANGE}.md and its folder alone until then; frame-confirmed`,
    );
  });

  it("refuses it while the restatement was not put, put and unanswered, and lets it through once confirmed after the ask", () => {
    const reason = (facts: RecordFacts, held: ReturnType<typeof journal>): string => {
      const verdict = outsideConfirmVerdict(CHANGE, facts, [], code, held);
      return verdict.kind === "refuse" ? verdict.reason : "allow";
    };
    expect(reason(careful(), journal(undefined))).toContain(
      "the frame is whole and its restatement has not been put to the owner",
    );
    expect(reason(careful(), journal(ASKED))).toContain(
      "the restatement was put to the owner and they have not answered",
    );
    expect(
      reason(
        careful({ confirmed: "Yes, that is it." }),
        journal(ASKED, [AFTER, "Yes, that is it."]),
      ),
    ).toBe("allow");
  });

  it("refuses a confirmed line whose words were said before the ask, on every commit, the homes' alone included", () => {
    const verdict = confirmedVerdict(
      CHANGE,
      careful({ confirmed: "Use careful." }),
      [],
      journal(ASKED, [BEFORE, "Use careful."]),
    );
    expect(verdict.kind).toBe("refuse");
    expect(verdict.kind === "refuse" ? verdict.reason : "").toMatch(
      /^the change waits for the owner's confirmation of the frame: the confirmed line quotes "Use careful\.", said before the restatement was put to the owner.*; frame-confirmed$/,
    );
  });

  it("reads a confirmed line HEAD's commit carries the same as settled, and the line's presence alone where no hook journaled", () => {
    const confirmed = careful({ confirmed: "Yes." });
    expect(confirmedVerdict(CHANGE, confirmed, [confirmed], journal(ASKED))).toEqual({
      kind: "allow",
    });
    expect(confirmedVerdict(CHANGE, confirmed, [], { kept: false })).toEqual({
      kind: "allow",
    });
    expect(outsideConfirmVerdict(CHANGE, confirmed, [], code, { kept: false })).toEqual({
      kind: "allow",
    });
    expect(outsideConfirmVerdict(CHANGE, careful(), [], code, { kept: false }).kind).toBe("refuse");
  });

  it("holds nothing at regular or quick, and holds a dropped record and the commit that sets the record done (correction 3, F1)", () => {
    for (const mode of ["regular", "quick"]) {
      expect(
        outsideConfirmVerdict(CHANGE, careful({ mode }), [], code, journal(undefined)),
      ).toEqual({ kind: "allow" });
      expect(
        confirmedVerdict(CHANGE, careful({ mode, confirmed: "x" }), [], journal(ASKED)),
      ).toEqual({ kind: "allow" });
    }
    // A dropped state opens nothing: the refusal names the record-alone commit and a new change, never a restatement.
    const dropped = outsideConfirmVerdict(
      CHANGE,
      careful({ state: "dropped" }),
      [],
      code,
      journal(undefined),
    );
    expect(dropped.kind === "refuse" ? dropped.reason : "").toContain(
      `the change is dropped and its frame was never confirmed: commit .greenline/ledger/${CHANGE}.md and its folder alone, and make the other work a new change`,
    );
    expect(dropped.kind === "refuse" ? dropped.reason : "").not.toContain("put it to them");
    const droppedLine = confirmedVerdict(
      CHANGE,
      careful({ state: "dropped", confirmed: "Use careful." }),
      [],
      journal(ASKED, [BEFORE, "Use careful."]),
    );
    expect(droppedLine.kind === "refuse" ? droppedLine.reason : "").toContain(
      'the change is dropped and its confirmed line quotes "Use careful."',
    );
    // The drop itself passes: the record and its folder alone, no confirmed line.
    expect(
      outsideConfirmVerdict(
        CHANGE,
        careful({ state: "dropped" }),
        [],
        [`.greenline/ledger/${CHANGE}.md`],
        journal(undefined),
      ),
    ).toEqual({ kind: "allow" });
    expect(confirmedVerdict(CHANGE, careful({ state: "dropped" }), [], journal(ASKED))).toEqual({
      kind: "allow",
    });
    // A done line carries no code past the doors, nor a confirmation the journal does not hold.
    expect(
      outsideConfirmVerdict(CHANGE, careful({ state: "done" }), [], code, journal(undefined)).kind,
    ).toBe("refuse");
    expect(
      confirmedVerdict(
        CHANGE,
        careful({ state: "done", confirmed: "Use careful." }),
        [],
        journal(ASKED, [BEFORE, "Use careful."]),
      ).kind,
    ).toBe("refuse");
  });

  it("reads the confirmed line as a hook reads a line, its placeholder as none", () => {
    expect(recordFacts('---\nmode: careful\nconfirmed: "Yes."\n---\n').confirmed).toBe("Yes.");
    expect(
      recordFacts('---\nmode: careful\nconfirmed: "<the owner\'s words>"\n---\n').confirmed,
    ).toBeUndefined();
  });
});

describe("J-223 S1 correction: the confirmed line in a merge, and a ticket's frame read from its planning change", () => {
  const CHANGE = "2026-11-10-open-loans-csv";
  const PLAN = "2026-11-10-loans-plan";
  const careful = (more: Partial<RecordFacts> = {}): RecordFacts => ({
    readable: true,
    mode: "careful",
    state: "open",
    choice: "owner",
    ...more,
  });
  const journal = (asked: string | undefined, ...messages: [string, string][]) => ({
    kept: true as const,
    asked,
    messages: messages.map(([at, words]) => ({ at, words })),
  });
  const BEFORE = "2026-11-10T09:55:00.000Z";
  const ASKED = "2026-11-10T10:00:00.000Z";

  it("C2 settles a line a merged commit carries on that careful record, and holds any other to the journal", () => {
    const staged = careful({ confirmed: "Yes, that is it." });
    expect(
      confirmedVerdict(
        CHANGE,
        staged,
        [careful(), careful({ confirmed: "Yes, that is it." })],
        journal(ASKED),
      ),
    ).toEqual({ kind: "allow" });
    expect(
      confirmedVerdict(
        CHANGE,
        careful({ confirmed: "Use careful." }),
        [careful(), careful({ confirmed: "Yes, that is it." })],
        journal(ASKED, [BEFORE, "Use careful."]),
      ).kind,
    ).toBe("refuse");
  });

  it("C4 refuses a confirmed line staged on a careful ticket's record in the lint's words, and never settles one carried beside a ticket line", () => {
    const verdict = confirmedVerdict(
      CHANGE,
      careful({ plan: "001-loans", ticket: "T1", confirmed: "Use careful." }),
      [],
      journal(ASKED, [BEFORE, "Use careful."]),
    );
    expect(verdict.kind === "refuse" ? verdict.reason : "").toMatch(
      /^the change waits for the owner's confirmation of the frame: a ticket's record holds no confirmed line: its frame is its planning change's.*; frame-confirmed$/,
    );
    expect(
      confirmedVerdict(
        CHANGE,
        careful({ confirmed: "Use careful." }),
        [careful({ plan: "001-loans", ticket: "T1", confirmed: "Use careful." })],
        journal(ASKED, [BEFORE, "Use careful."]),
      ).kind,
    ).toBe("refuse");
    expect(confirmedSettled({ mode: "careful", ticket: "T1", confirmed: "Yes." }, "Yes.")).toBe(
      false,
    );
  });

  it("C4 refuses a commit outside the homes on a clause the doors gave, naming it", () => {
    const verdict = outsideClauseVerdict(
      CHANGE,
      [`.greenline/ledger/${CHANGE}.md`, "src/shelf.js"],
      `the frame is its planning change's, .greenline/ledger/${PLAN}.md, and the frame is whole and its restatement has not been put to the owner`,
    );
    expect(verdict.kind === "refuse" ? verdict.reason : "").toContain(
      `the commit stages src/shelf.js, outside .greenline/ledger/, and the frame is its planning change's, .greenline/ledger/${PLAN}.md`,
    );
    expect(outsideClauseVerdict(CHANGE, [`.greenline/ledger/${CHANGE}.md`], "x")).toEqual({
      kind: "allow",
    });
  });

  it("C4 reads a ticket's planning change as the trailers read it: named, a stand-in, or none", () => {
    const entry = (id: string, facts: Partial<RecordFacts>): RecordEntry => ({
      id,
      facts: { readable: true, state: "open", ...facts },
    });
    const ticket = entry("2026-11-10-t1", { plan: "001-loans", ticket: "T1" });
    const running = (each: RecordEntry): boolean => each.facts.state === "open";
    const named = [entry(PLAN, { plan: "001-loans" }), ticket];
    expect(planningChangesOf(ticket.facts, named, running)).toEqual({
      named: [named[0]],
      standIn: undefined,
    });
    const stand = [entry(PLAN, {}), ticket];
    expect(planningChangesOf(ticket.facts, stand, running)).toEqual({
      named: [],
      standIn: stand[0],
    });
    expect(planningChangesOf(ticket.facts, [ticket], running)).toEqual({
      named: [],
      standIn: undefined,
    });
    // The trailers agree: the branch's change of each form takes the ticket's.
    for (const records of [named, stand]) {
      const facts = {
        current: `greenline/${PLAN}`,
        defaultBranch: "main",
        hasRemote: false,
        records,
      };
      expect(changeOfBranch(`greenline/${PLAN}`, facts)?.trailers).toContain("2026-11-10-t1");
    }
  });
});
