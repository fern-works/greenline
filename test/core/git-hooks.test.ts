import { describe, expect, it } from "vitest";
import { finishedFacts, startedFacts, type CheckFacts } from "../../src/core/facts.ts";
import {
  changeOfBranch,
  doneVerdict,
  GIT_HOOK_NAMES,
  gitHookScript,
  gitVersionOf,
  holdsNoChange,
  isDefaultBranch,
  messageHasText,
  noChangeVerdict,
  proceedAdmits,
  pushUpdates,
  pushVerdict,
  rebaseVerdict,
  recordFacts,
  refUpdates,
  registrationFor,
  rewriteVerdict,
  trailerVerdict,
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

const chosen: RecordFacts = { readable: true, state: "open", choice: "accepted" };

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
        '---\nmode: quick\nchoice: owner\nwhy: "w"\nstate: done\nagents: 2\nrounds: 0\nlanding: "push it, the owner, 2026-10-19"\nrebase: "rebase onto main"\n---\n',
      ),
    ).toEqual({
      readable: true,
      mode: "quick",
      choice: "owner",
      state: "done",
      agents: 2,
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
        "no change is open on main; open its record under .greenline/ledger/ before the first commit",
    });
    expect(noChangeVerdict(undefined, branchFacts())).toEqual({ kind: "allow" });
    expect(noChangeVerdict("main", branchFacts({ records: [record(ID, "open")] }))).toEqual({
      kind: "allow",
    });
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
      reason: `.greenline/ledger/${ID}.md: choice is standing, which proceed none does not allow; wait for the owner's yes, the choice line owner or accepted`,
    });
    const careful = yesVerdict(branch, standing("careful"), setting("regular"));
    expect(careful.kind === "refuse" ? careful.reason : "").toContain(
      "choice is standing, which proceed regular does not allow",
    );
    expect(yesVerdict(branch, standing("quick"), setting("quick"))).toEqual({ kind: "allow" });
    expect(yesVerdict(branch, standing("quick"), setting("careful"))).toEqual({ kind: "allow" });
    expect(yesVerdict(branch, standing("quick"), setting("careful", "unread"))).toEqual({
      kind: "allow",
    });
  });

  it("keeps owner and accepted as the yes whatever proceed says", () => {
    for (const choice of ["owner", "accepted"])
      expect(
        yesVerdict(branch, { readable: true, state: "open", choice, mode: "careful" }, NONE),
      ).toEqual({ kind: "allow" });
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
      `the update of refs/heads/greenline/${ID} from ${OLD.slice(0, 12)} to ${NEW.slice(0, 12)} rewrites change ${ID}'s history`,
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

  it("pre-rebase refuses a change's branch without the rebase line, and allows it with one", () => {
    const refused = rebaseVerdict(`greenline/${ID}`, branchFacts());
    expect(refused.kind === "refuse" ? refused.reason : "").toContain("carries no rebase line");
    expect(rebaseVerdict(`greenline/${ID}`, branchFacts("yes"))).toEqual({ kind: "allow" });
    expect(rebaseVerdict("side", branchFacts())).toEqual({ kind: "allow" });
    expect(rebaseVerdict(undefined, branchFacts())).toEqual({ kind: "allow" });
  });
});

describe("J-93 S3 pre-push: no push without the owner's landing words, and never a force push", () => {
  const line = (remote: string) =>
    pushUpdates(`refs/heads/greenline/${ID} ${NEW} refs/heads/greenline/${ID} ${remote}\n`);
  const landed: RecordFacts = { ...chosen, landing: "push and open the pull request" };

  it("refuses any push of a change's branch while the record lacks landing", () => {
    const verdict = pushVerdict(line(ZERO), facts(chosen, true));
    expect(verdict.kind === "refuse" ? verdict.reason : "").toContain("carries no landing line");
  });

  it("refuses a force push even with the landing line, and allows a fast-forward or a new branch", () => {
    const forced = pushVerdict(line(OLD), facts(landed, false));
    expect(forced.kind === "refuse" ? forced.reason : "").toContain("force push");
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
