import { describe, expect, it } from "vitest";
import {
  commitsOfChanges,
  deletedRecords,
  unclaimedCommits,
  type GitHistory,
  type LoggedCommit,
  type PathStatus,
} from "../../src/core/change-history.ts";

const P = "2026-10-04-plan-login";
const T1 = "2026-10-04-ticket-form";
const T2 = "2026-10-04-ticket-api";

function commit(
  hash: string,
  parents: readonly string[],
  paths: readonly (readonly [PathStatus, string])[] = [],
  changes: readonly string[] = [],
): LoggedCommit {
  return { hash, parents, changes, paths: paths.map(([status, path]) => ({ status, path })) };
}

function read(commits: readonly LoggedCommit[]): GitHistory {
  return { kind: "read", head: commits[0]?.hash, commits };
}

const record = (id: string): string => `.greenline/ledger/${id}.md`;
const none: ReadonlySet<string> = new Set();

describe("a change's commits", () => {
  it("S5 a commit that only carries the trailer and one that only touches the record both belong to the change", () => {
    const history = read([
      commit("c3", ["c2"], [["M", "src/a.ts"]], [T1]),
      commit("c2", ["c1"], [["A", record(T1)]]),
      commit("c1", [], [["A", "README.md"]]),
    ]);
    expect(commitsOfChanges(history, [T1]).get(T1)).toEqual({
      kind: "known",
      commits: [
        { hash: "c3", shared: false },
        { hash: "c2", shared: false },
      ],
      files: ["src/a.ts"],
    });
  });

  it("S5 a commit that touches a change's folder belongs to it, and .greenline is left out of its files", () => {
    const history = read([
      commit(
        "c1",
        [],
        [
          ["A", `.greenline/ledger/${T1}/checks/20261004T120000000Z-a1b2c3.json`],
          ["A", "src/b.ts"],
        ],
      ),
    ]);
    expect(commitsOfChanges(history, [T1]).get(T1)).toEqual({
      kind: "known",
      commits: [{ hash: "c1", shared: false }],
      files: ["src/b.ts"],
    });
  });

  it("S5 a planning change and its tickets interleaved on one branch each keep their own commits and files", () => {
    const history = read([
      commit("c6", ["c5"], [["M", record(P)]]),
      commit("c5", ["c4"], [["M", "src/api.ts"]], [T2]),
      commit("c4", ["c3"], [["A", record(T2)]]),
      commit(
        "c3",
        ["c2"],
        [
          ["M", "src/form.ts"],
          ["M", record(T1)],
        ],
      ),
      commit("c2", ["c1"], [["A", record(T1)]]),
      commit(
        "c1",
        [],
        [
          ["A", record(P)],
          ["A", ".greenline/plans/003-login/tickets.md"],
        ],
      ),
    ]);
    const answers = commitsOfChanges(history, [P, T1, T2]);
    expect(answers.get(P)).toEqual({
      kind: "known",
      commits: [
        { hash: "c6", shared: false },
        { hash: "c1", shared: false },
      ],
      files: [],
    });
    expect(answers.get(T1)).toEqual({
      kind: "known",
      commits: [
        { hash: "c3", shared: false },
        { hash: "c2", shared: false },
      ],
      files: ["src/form.ts"],
    });
    expect(answers.get(T2)).toEqual({
      kind: "known",
      commits: [
        { hash: "c5", shared: false },
        { hash: "c4", shared: false },
      ],
      files: ["src/api.ts"],
    });
  });

  it("S5 a squash that carries two trailers, or touches two records, is shared and both changes keep it", () => {
    const trailers = read([commit("s1", [], [["M", "src/x.ts"]], [T1, T2])]);
    const records = read([
      commit(
        "s2",
        [],
        [
          ["A", record(T1)],
          ["A", record(T2)],
          ["M", "src/y.ts"],
        ],
      ),
    ]);
    for (const [history, hash, file] of [
      [trailers, "s1", "src/x.ts"],
      [records, "s2", "src/y.ts"],
    ] as const) {
      const answers = commitsOfChanges(history, [T1, T2]);
      for (const id of [T1, T2])
        expect(answers.get(id)).toEqual({
          kind: "known",
          commits: [{ hash, shared: true }],
          files: [file],
        });
    }
  });

  it("S5 a commit shared with a change whose record is gone is still marked shared", () => {
    const history = read([commit("c1", [], [["M", "src/x.ts"]], [T1, "2026-10-01-dropped"])]);
    expect(commitsOfChanges(history, [T1]).get(T1)).toEqual({
      kind: "known",
      commits: [{ hash: "c1", shared: true }],
      files: ["src/x.ts"],
    });
  });

  it("S5 the ledger's earlier formats name no change", () => {
    const history = read([
      commit(
        "c1",
        [],
        [
          ["M", ".greenline/ledger/README.md"],
          ["A", ".greenline/ledger/records/2026-10-04-x.json"],
          ["A", ".greenline/ledger/receipts/r.json"],
          ["A", "src/z.ts"],
        ],
      ),
    ]);
    expect(commitsOfChanges(history, ["README", "records", "receipts"])).toEqual(
      new Map([
        ["README", { kind: "known", commits: [], files: [] }],
        ["records", { kind: "known", commits: [], files: [] }],
        ["receipts", { kind: "known", commits: [], files: [] }],
      ]),
    );
    expect(unclaimedCommits(history, none)).toEqual({ kind: "known", items: ["c1"] });
  });

  it("S5 a change history never mentions has no commits, and a repository with no commit has none either", () => {
    expect(commitsOfChanges(read([commit("c1", [], [["A", "a"]])]), [T1]).get(T1)).toEqual({
      kind: "known",
      commits: [],
      files: [],
    });
    const empty: GitHistory = { kind: "read", head: undefined, commits: [] };
    expect(commitsOfChanges(empty, [T1]).get(T1)).toEqual({
      kind: "known",
      commits: [],
      files: [],
    });
    expect(unclaimedCommits(empty, none)).toEqual({ kind: "known", items: [] });
    expect(deletedRecords(empty)).toEqual({ kind: "known", items: [] });
  });
});

describe("deleted records", () => {
  it("S5 a record history shows as added and later deleted is reported, and one added again is not", () => {
    const history = read([
      commit("c4", ["c3"], [["A", record(T2)]]),
      commit("c3", ["c2"], [["D", record(T2)]]),
      commit("c2", ["c1"], [["D", record(T1)]]),
      commit(
        "c1",
        [],
        [
          ["A", record(T1)],
          ["A", record(T2)],
          ["D", record(P)],
        ],
      ),
    ]);
    expect(deletedRecords(history)).toEqual({ kind: "known", items: [T1] });
  });

  it("S5 deleting a change's folder, not its record, reports nothing", () => {
    const history = read([
      commit("c2", ["c1"], [["D", `.greenline/ledger/${T1}/report.md`]]),
      commit(
        "c1",
        [],
        [
          ["A", record(T1)],
          ["A", `.greenline/ledger/${T1}/report.md`],
        ],
      ),
    ]);
    expect(deletedRecords(history)).toEqual({ kind: "known", items: [] });
  });
});

describe("commits that belong to no change", () => {
  it("S5 only first-parent commits that are not merges, touch code and claim no change are listed", () => {
    const history = read([
      // A merge is never listed, even one whose reader gave it paths.
      commit("m1", ["c4", "side1"], [["A", "src/merged.ts"]]),
      commit("side1", ["c3"], [["A", "src/side.ts"]]),
      commit("c4", ["c3"], [["M", ".greenline/WORK.md"]]),
      commit("c3", ["c2"], [["M", "src/claimed.ts"]], [T1]),
      commit("c2", ["c1"], [["M", "src/free.ts"]]),
      commit("c1", [], [["A", "src/first.ts"]]),
    ]);
    expect(unclaimedCommits(history, none)).toEqual({ kind: "known", items: ["c2", "c1"] });
  });

  it("S5 a commit that touches only files greenline installed belongs to no change and is not listed", () => {
    const history = read([
      commit(
        "c2",
        ["c1"],
        [
          ["M", "AGENTS.md"],
          ["M", ".claude/skills/review/SKILL.md"],
        ],
      ),
      commit(
        "c1",
        [],
        [
          ["M", "AGENTS.md"],
          ["A", "src/own.ts"],
        ],
      ),
    ]);
    const installed = new Set(["AGENTS.md", ".claude/skills/review/SKILL.md"]);
    expect(unclaimedCommits(history, installed)).toEqual({ kind: "known", items: ["c1"] });
  });
});

describe("history that cannot say", () => {
  it("S5 a shallow clone, a missing git, a directory that is not a repository and an unfinished log answer unknown, never no commits", () => {
    for (const why of ["shallow", "no-git", "not-a-repository", "unreadable"] as const) {
      const history: GitHistory = { kind: "unknown", why, detail: "d" };
      expect(commitsOfChanges(history, [T1, T2])).toEqual(
        new Map([
          [T1, { kind: "unknown", why }],
          [T2, { kind: "unknown", why }],
        ]),
      );
      expect(deletedRecords(history)).toEqual({ kind: "unknown", why });
      expect(unclaimedCommits(history, none)).toEqual({ kind: "unknown", why });
    }
  });
});
