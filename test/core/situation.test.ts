import { describe, expect, it } from "vitest";
import {
  documentsAt,
  orientationOf,
  orientationText,
  predatingText,
  remoteKindOf,
  remoteText,
  renderSituationText,
  type RemoteKind,
  type Situation,
} from "../../src/core/situation.ts";

/**
 * The orientation the situation names (J-129 S1): classified once from the
 * commits, the change records, the languages and the documents at the roots,
 * so the agent reads the decision rather than re-deriving it.
 */

const NONE_STOPPED = { kind: "known", changes: [], worktrees: [] } as const;

const EMPTY = {
  commits: { kind: "known", count: 0, branch: "main" },
  records: { kind: "known", count: 0 },
  stoppedElsewhere: NONE_STOPPED,
  languages: { kind: "known", languages: [] },
  documents: 0,
} as const;

describe("J-129 S1 the orientation the situation names", () => {
  it("counts the documents by extension, leaving out .greenline/ and the installed files", () => {
    expect(
      documentsAt(
        [
          "README.md",
          "docs/brief.MD",
          "docs/notes.txt",
          "docs/design.rst",
          "docs/manual.adoc",
          "todo.org",
          "spec.pdf",
          "plan.docx",
          "AGENTS.md",
          ".greenline/WORK.md",
          "src/app.ts",
          "LICENSE",
          ".gitignore",
        ],
        new Set(["AGENTS.md"]),
      ),
    ).toBe(8);
  });

  it("names groundwork on an empty tree: no commit, no language, no document", () => {
    expect(orientationOf(EMPTY)).toEqual({ kind: "groundwork", reason: "empty tree" });
  });

  it("names the survey of the documents on a tree of documents without code, committed or not", () => {
    for (const count of [0, 2])
      expect(
        orientationOf({
          ...EMPTY,
          commits: { kind: "known", count, branch: "main" },
          documents: 5,
        }),
      ).toEqual({ kind: "survey", reason: "documents, no code" });
  });

  it("names the survey where a language is found, and on a tree with commits and neither", () => {
    expect(
      orientationOf({
        ...EMPTY,
        languages: { kind: "known", languages: [{ language: "typescript", roots: ["src/"] }] },
        documents: 3,
      }),
    ).toEqual({ kind: "survey", reason: null });
    expect(
      orientationOf({ ...EMPTY, commits: { kind: "known", count: 4, branch: "main" } }),
    ).toEqual({ kind: "survey", reason: null });
  });

  it("names none where a change record exists, on disk, stopped on another branch, or committed on any branch", () => {
    expect(orientationOf({ ...EMPTY, records: { kind: "known", count: 1 } })).toEqual({
      kind: "none",
    });
    expect(orientationOf({ ...EMPTY, documents: 3, recordsElsewhere: true })).toEqual({
      kind: "none",
    });
    expect(orientationOf({ ...EMPTY, recordsElsewhere: false })).toEqual({
      kind: "groundwork",
      reason: "empty tree",
    });
    expect(
      orientationOf({
        ...EMPTY,
        stoppedElsewhere: { kind: "known", changes: ["2026-10-01-a"], worktrees: [] },
      }),
    ).toEqual({ kind: "none" });
  });

  it("says unknown with the reason where a fact it rests on is unknown", () => {
    expect(
      orientationOf({
        commits: { kind: "unknown", why: "git cannot run" },
        records: { kind: "known", count: 0 },
        stoppedElsewhere: { kind: "unknown", why: "git cannot run" },
        languages: { kind: "unknown", why: "git cannot run" },
        documents: undefined,
      }),
    ).toEqual({ kind: "unknown", why: "git cannot run" });
    expect(
      orientationOf({ ...EMPTY, records: { kind: "unknown", why: "the ledger cannot be read" } }),
    ).toEqual({ kind: "unknown", why: "the ledger cannot be read" });
  });

  it("prints the line in the situation, after the languages", () => {
    expect(orientationText({ kind: "groundwork", reason: "empty tree" })).toBe(
      "orientation: groundwork (empty tree)",
    );
    expect(orientationText({ kind: "survey", reason: "documents, no code" })).toBe(
      "orientation: survey (documents, no code)",
    );
    expect(orientationText({ kind: "survey", reason: null })).toBe("orientation: survey");
    expect(orientationText({ kind: "none" })).toBe("orientation: none (a change record exists)");
    expect(orientationText({ kind: "unknown", why: "git cannot run" })).toBe(
      "orientation: unknown (git cannot run)",
    );
    const situation: Situation = {
      commits: EMPTY.commits,
      records: EMPTY.records,
      homes: [],
      languages: EMPTY.languages,
      orientation: { kind: "groundwork", reason: "empty tree" },
      stoppedElsewhere: NONE_STOPPED,
      remote: { kind: "none" },
      ground: { kind: "none", setting: null },
    };
    expect(renderSituationText(situation).split("\n").slice(4, 6)).toEqual([
      "  languages: none found",
      "  orientation: groundwork (empty tree)",
    ]);
  });
});

describe("J-130 S1 the remote's kind the situation names", () => {
  it("reads a forge from a known host in each URL form, a host of its own, and a scheme that names one", () => {
    const forge = (host: string): RemoteKind => ({ kind: "forge", host });
    expect(remoteKindOf("https://github.com/owner/repo.git")).toEqual(forge("github.com"));
    expect(remoteKindOf("git@github.com:owner/repo.git")).toEqual(forge("github.com"));
    expect(remoteKindOf("ssh://git@ssh.github.com:443/owner/repo.git")).toEqual(
      forge("ssh.github.com"),
    );
    expect(remoteKindOf("https://GitLab.com/group/repo")).toEqual(forge("gitlab.com"));
    expect(remoteKindOf("git@bitbucket.org:team/repo.git")).toEqual(forge("bitbucket.org"));
    expect(remoteKindOf("https://codeberg.org/someone/repo.git")).toEqual(forge("codeberg.org"));
    expect(remoteKindOf("https://user:secret@github.com/owner/repo.git")).toEqual(
      forge("github.com"),
    );
    // A self-hosted forge names itself in its host.
    expect(remoteKindOf("https://gitlab.example.com/group/repo.git")).toEqual(
      forge("gitlab.example.com"),
    );
    expect(remoteKindOf("git@github.corp.example:org/repo.git")).toEqual(
      forge("github.corp.example"),
    );
    // A remote helper's scheme that names a forge.
    expect(remoteKindOf("gitlab::https://git.example.com/repo")).toEqual(forge("git.example.com"));
  });

  it("reads a path, a file URL, an unknown host and an empty URL as no forge", () => {
    const not = (why: string): RemoteKind => ({ kind: "not-forge", why });
    expect(remoteKindOf("/srv/git/origin.git")).toEqual(not("a local path"));
    expect(remoteKindOf("../origin.git")).toEqual(not("a local path"));
    expect(remoteKindOf("remote/origin.git")).toEqual(not("a local path"));
    expect(remoteKindOf("~/repos/origin.git")).toEqual(not("a local path"));
    expect(remoteKindOf("C:\\repos\\origin.git")).toEqual(not("a local path"));
    expect(remoteKindOf("C:/repos/origin.git")).toEqual(not("a local path"));
    expect(remoteKindOf("./github.com:owner/repo.git")).toEqual(not("a local path"));
    expect(remoteKindOf("file:///srv/git/origin.git")).toEqual(not("a file URL"));
    expect(remoteKindOf("https://git.example.com/repo.git")).toEqual(
      not("an unknown host, git.example.com"),
    );
    expect(remoteKindOf("git@notgithub.com:owner/repo.git")).toEqual(
      not("an unknown host, notgithub.com"),
    );
    expect(remoteKindOf("[::1]:repo.git")).toEqual(not("an unknown host, [::1]"));
    expect(remoteKindOf("  ")).toEqual(not("no URL"));
  });

  it("prints the line before the ground, each reading in its words", () => {
    expect(remoteText({ kind: "none" })).toBe("remote: none");
    expect(remoteText({ kind: "forge", name: "origin", host: "github.com" })).toBe(
      "remote: origin, a forge (github.com)",
    );
    expect(remoteText({ kind: "not-forge", name: "origin", why: "a local path" })).toBe(
      "remote: origin, not a forge (a local path)",
    );
    expect(remoteText({ kind: "unknown", why: "git cannot run" })).toBe(
      "remote: unknown (git cannot run)",
    );
    const situation: Situation = {
      commits: EMPTY.commits,
      records: EMPTY.records,
      homes: [],
      languages: EMPTY.languages,
      orientation: { kind: "groundwork", reason: "empty tree" },
      stoppedElsewhere: NONE_STOPPED,
      remote: { kind: "not-forge", name: "origin", why: "a local path" },
      ground: { kind: "none", setting: null },
    };
    expect(renderSituationText(situation).split("\n").slice(7, 9)).toEqual([
      "  remote: origin, not a forge (a local path)",
      "  ground: no change open; the proposal offers it",
    ]);
  });
});

/** What a request for a branch cut before the install owes under `proceed: regular` (j196t-wait-proceed-1c, finding F1). */
const OWED =
  "; a request for their files under proceed regular proposes the merge of main into the branch as the one yes, asks no direction first, and once it is done the owner starts a new session there";

describe("J-213 S1 the branches before the practice the situation names (j196t-wait-proceed-1c)", () => {
  it("names the branches, with what a request for their files owes where proceed names a mode, and none where none is", () => {
    const known = (
      branches: readonly string[],
      proceed: string | null,
      base: string | null = "main",
    ) => predatingText({ kind: "known", base, branches, proceed });
    expect(known(["feature/overdue"], null)).toBe("branches before the practice: feature/overdue");
    expect(known(["feature/overdue"], "regular")).toBe(
      `branches before the practice: feature/overdue${OWED}`,
    );
    expect(known(["feature/overdue", "origin/spike"], "regular")).toBe(
      `branches before the practice: feature/overdue, origin/spike${OWED}`,
    );
    // No branch named, or no default branch holding the manifest: none, and no words.
    expect(known([], "regular")).toBe("branches before the practice: none");
    expect(known(["feature/overdue"], "regular", null)).toBe("branches before the practice: none");
    expect(predatingText({ kind: "unknown", why: "git cannot run" })).toBe(
      "branches before the practice: unknown (git cannot run)",
    );
  });

  it("names ten branches and counts the rest", () => {
    const branches = Array.from(
      { length: 13 },
      (_, index) => `old/${String(index).padStart(2, "0")}`,
    );
    expect(predatingText({ kind: "known", base: "main", branches, proceed: null })).toBe(
      `branches before the practice: ${branches.slice(0, 10).join(", ")} and 3 more`,
    );
  });

  it("prints the line after the changes stopped on other branches", () => {
    const situation: Situation = {
      commits: EMPTY.commits,
      records: EMPTY.records,
      homes: [],
      languages: EMPTY.languages,
      orientation: { kind: "survey", reason: null },
      stoppedElsewhere: NONE_STOPPED,
      predating: { kind: "known", base: "main", branches: ["feature/overdue"], proceed: "regular" },
      remote: { kind: "none" },
      ground: { kind: "none", setting: null },
    };
    expect(renderSituationText(situation).split("\n").slice(6, 9)).toEqual([
      "  stopped on other branches: none",
      `  branches before the practice: feature/overdue${OWED}`,
      "  remote: none",
    ]);
  });
});
