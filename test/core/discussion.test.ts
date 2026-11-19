/**
 * The discussion record (J-118 S1 and S3): an idea explored with frame's
 * engine before it is work, kept at `.greenline/ledger/discussions/<id>.md`
 * with its folder beside it. Its front matter holds the idea and the state
 * the owner's word set, its body the frame in the question list form, the
 * research and the open questions; a commit whose paths lie only under the
 * folder is the discussion's, and a state moves only with the owner's words.
 */
import { describe, expect, it } from "vitest";
import {
  decisionLines,
  discussionCommit,
  discussionOfPath,
  discussionPath,
  discussionsLine,
  discussionsReport,
  DISCUSSION_STATES,
  parseDiscussionRecord,
  readDiscussionEntry,
  renderDiscussionsText,
  uncopiedResearch,
  copiedResearchFolder,
  researchReports,
  type DiscussionRecord,
} from "../../src/core/discussion.ts";
import { discussionRecordVerdict } from "../../src/core/git-hooks.ts";

const ID = "2026-10-21-offline-mode";

function record(lines: readonly string[], body = BODY): string {
  return ["---", 'idea: "Let the app work on a train"', ...lines, "---", "", body].join("\n");
}

const BODY = `## frame

### Round 1

- Q1 [purpose] Is it for commuters with no signal?
  - proposed: yes, reading only
  - answer: yes, reading and queued writes
  - decided: owner
- Q2 [data] Which data must be at hand offline?
  - proposed: the last week of items
- closed [security]: nothing new crosses a trust boundary

## research

- [the cache limits](${ID}/frame-research-1.md): what a service worker may hold

## open questions

- How do queued writes sync?
`;

function parsed(text: string): DiscussionRecord {
  const read = parseDiscussionRecord(`${ID}.md`, text);
  if (read._tag === "err") throw new Error(read.error.issues.map((i) => i.message).join("; "));
  return read.value;
}

function issues(text: string, name = `${ID}.md`): readonly string[] {
  const read = parseDiscussionRecord(name, text);
  return read._tag === "err"
    ? read.error.issues.map((issue) =>
        issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`,
      )
    : [];
}

describe("J-118 S1 the discussion record", () => {
  it("reads an open discussion: its idea, its state, its frame, its research and its open questions", () => {
    const value = parsed(record(["state: open"]));
    expect(value.id).toBe(ID);
    expect(value.idea).toBe("Let the app work on a train");
    expect(value.state).toBe("open");
    expect(value.changes).toEqual([]);
    expect(value.related).toEqual([]);
    expect(value.sections.map((section) => section.heading)).toEqual([
      "frame",
      "research",
      "open questions",
    ]);
    expect(decisionLines(value)).toEqual([
      "Q1 Is it for commuters with no signal? yes, reading and queued writes",
    ]);
  });

  it("holds the five states, open, parked, declined, promoted and merged", () => {
    expect(DISCUSSION_STATES).toEqual(["open", "parked", "declined", "promoted", "merged"]);
  });

  it("refuses a file name that is no real date and a slug, a missing idea or state, and an unknown field", () => {
    expect(issues(record(["state: open"]), "offline.md")).toEqual([
      "a discussion record's file name is '<real date>-<slug>.md'",
    ]);
    expect(issues(["---", "state: open", "---", ""].join("\n")).join(" ")).toContain("idea");
    expect(issues(record([])).join(" ")).toContain("state");
    expect(issues(record(["state: open", "mode: quick"])).join(" ")).toContain("mode");
  });

  it("refuses text that stands before the first section", () => {
    expect(issues(record(["state: open"], "a stray line\n\n## frame\n\nx\n"))).toEqual([
      'body: line 6: text stands before the first section; the body holds frame, research and open questions and nothing else (.greenline/ledger/README.md, "Discussions")',
    ]);
  });

  it("refuses a heading that is no section of a discussion, and a repeated one", () => {
    expect(issues(record(["state: open"], "## build\n\nx\n"))).toEqual([
      "line 6: the heading 'build' is not a section of a discussion; its sections are frame, research and open questions (.greenline/ledger/README.md, \"Discussions\")",
    ]);
    expect(issues(record(["state: open"], "## frame\n\nx\n\n## frame\n\ny\n"))).toEqual([
      "line 10: the heading 'frame' has a section already",
    ]);
  });

  it("lists the related discussions and the changes promoted, each a real date and a slug", () => {
    const value = parsed(
      record([
        "state: promoted",
        'words: "make the cache headers and the service worker two changes"',
        "changes: [2026-10-24-cache-headers, 2026-10-25-service-worker]",
        "related: [2026-10-23-plugins]",
      ]),
    );
    expect(value.changes).toEqual(["2026-10-24-cache-headers", "2026-10-25-service-worker"]);
    expect(value.related).toEqual(["2026-10-23-plugins"]);
    expect(issues(record(["state: open", "related: [plugins]"]))).toEqual([
      "related[0]: 'plugins' is not a discussion's id, a real date and a slug",
    ]);
    expect(issues(record(["state: open", `related: [${ID}]`]))).toEqual([
      "related[0]: a discussion is not related to itself",
    ]);
  });
});

describe("J-118 S3 the states, each set on the owner's word", () => {
  it("needs the owner's words for every state but open", () => {
    for (const lines of [
      ['revisit: "after the release"', "state: parked"],
      ['reason: "the app is online-only by design"', "state: declined"],
      ["state: promoted", "changes: [2026-10-24-cache-headers]"],
      ["state: merged", "into: 2026-10-23-plugins"],
    ])
      expect(issues(record(lines))).toEqual([
        "words: a discussion's state other than open is set on the owner's word: quote it in the words line",
      ]);
  });

  it("parks with a revisit, declines with the reason kept, promotes with its changes and merges into another discussion", () => {
    const words = 'words: "park it"';
    expect(issues(record(["state: parked", words]))).toEqual([
      "revisit: a parked discussion names when to come back to it",
    ]);
    expect(issues(record(["state: declined", words]))).toEqual([
      "reason: a declined discussion keeps its reason",
    ]);
    expect(issues(record(["state: promoted", words]))).toEqual([
      "changes: a promoted discussion names the changes it promoted",
    ]);
    expect(issues(record(["state: merged", words]))).toEqual([
      "into: a merged discussion names the discussion it joined",
    ]);
    expect(issues(record(["state: merged", words, `into: ${ID}`]))).toEqual([
      "into: a discussion is not merged into itself",
    ]);
    expect(issues(record(["state: open", 'revisit: "later"']))).toEqual([
      "revisit: only a parked discussion names when to come back to it",
    ]);
    expect(issues(record(["state: open", "into: 2026-10-23-plugins"]))).toEqual([
      "into: only a merged discussion names the discussion it joined",
    ]);
    // A declined discussion opened again keeps its reason, and its changes stay its history.
    expect(
      parsed(
        record([
          "state: open",
          'reason: "the app is online-only by design"',
          "changes: [2026-10-24-cache-headers]",
        ]),
      ).reason,
    ).toBe("the app is online-only by design");
  });

  it("lets a commit move the state only with words of the owner's that the record did not hold before", () => {
    const open = record(["state: open"]);
    const parked = record(['revisit: "after the release"', "state: parked", 'words: "park it"']);
    expect(discussionRecordVerdict(ID, parked, open)).toEqual({ kind: "allow" });
    expect(discussionRecordVerdict(ID, parked, undefined)).toEqual({ kind: "allow" });
    expect(discussionRecordVerdict(ID, parked, parked)).toEqual({ kind: "allow" });
    const declined = record([
      'reason: "online-only by design"',
      "state: declined",
      'words: "park it"',
    ]);
    expect(discussionRecordVerdict(ID, declined, parked)).toEqual({
      kind: "refuse",
      reason: `the discussion's move from parked to declined needs the owner's word: .greenline/ledger/discussions/${ID}.md keeps the words line it held before, "park it"; quote the owner's words that set declined in its words line; discussion-words`,
    });
    expect(discussionRecordVerdict(ID, open, parked)).toEqual({
      kind: "refuse",
      reason: `the discussion's move from parked to open needs the owner's word: .greenline/ledger/discussions/${ID}.md keeps the words line it held before, "park it"; quote the owner's words that set open in its words line; discussion-words`,
    });
    const reopened = record(["state: open", 'words: "pick it up again"']);
    expect(discussionRecordVerdict(ID, reopened, parked)).toEqual({ kind: "allow" });
    expect(discussionRecordVerdict(ID, "---\nidea: x\n---\n", open)).toEqual({
      kind: "refuse",
      reason: `the discussion cannot be committed as it stands: .greenline/ledger/discussions/${ID}.md does not read as a discussion record (state: Invalid option: expected one of "open"|"parked"|"declined"|"promoted"|"merged"); correct it as .greenline/ledger/README.md, "Discussions", gives its form; discussion-form`,
    });
    // A record the commit removes is no state moved.
    expect(discussionRecordVerdict(ID, undefined, parked)).toEqual({ kind: "allow" });
  });
});

describe("J-118 S1 the discussion's paths and its commit", () => {
  it("places the record and its folder under the ledger's discussions folder", () => {
    expect(discussionPath(ID)).toBe(`.greenline/ledger/discussions/${ID}.md`);
    expect(discussionOfPath(`.greenline/ledger/discussions/${ID}.md`)).toBe(ID);
    expect(discussionOfPath(`.greenline/ledger/discussions/${ID}/frame-research-1.md`)).toBe(ID);
    expect(discussionOfPath(".greenline/ledger/discussions/README.md")).toBeUndefined();
    expect(discussionOfPath(`.greenline/ledger/${ID}.md`)).toBeUndefined();
    expect(discussionOfPath("src/discussions/a.ts")).toBeUndefined();
  });

  it("reads a commit as a discussion's when every path lies under the folder, and names the discussions it touches", () => {
    expect(
      discussionCommit([
        `.greenline/ledger/discussions/${ID}.md`,
        `.greenline/ledger/discussions/${ID}/frame-research-1.md`,
        ".greenline/ledger/discussions/2026-10-23-plugins.md",
      ]),
    ).toEqual([ID, "2026-10-23-plugins"]);
    expect(
      discussionCommit([`.greenline/ledger/discussions/${ID}.md`, "src/a.ts"]),
    ).toBeUndefined();
    expect(
      discussionCommit([
        `.greenline/ledger/discussions/${ID}.md`,
        ".greenline/ledger/2026-10-24-cache-headers.md",
      ]),
    ).toBeUndefined();
    expect(discussionCommit([])).toBeUndefined();
  });
});

describe("J-118 S3 a promoted change copies its discussion's research", () => {
  it("names each report a change's discussions hold that its copies of that discussion lack, and none for a discussion that stands nowhere", () => {
    const folders = new Map([
      [ID, ["frame-research-10.md", "frame-research-2.md", "frame-research-1.md", "notes.txt"]],
      ["2026-10-23-plugins", ["frame-research-1.md"]],
    ]);
    const changes = [
      { id: "2026-10-24-cache-headers", from: [ID] },
      { id: "2026-10-25-service-worker", from: [ID, "2026-10-23-plugins", "2026-10-22-gone"] },
    ];
    // Each discussion's copies stand apart, so two reports of one number never meet.
    const held = new Map([
      [
        `2026-10-24-cache-headers ${ID}`,
        ["frame-research-1.md", "frame-research-2.md", "frame-research-10.md"],
      ],
      [`2026-10-25-service-worker ${ID}`, ["frame-research-1.md"]],
    ]);
    expect(
      uncopiedResearch(
        changes,
        (discussion) => folders.get(discussion),
        (change, discussion) => held.get(`${change} ${discussion}`) ?? [],
      ),
    ).toEqual([
      { change: "2026-10-25-service-worker", discussion: ID, report: "frame-research-2.md" },
      { change: "2026-10-25-service-worker", discussion: ID, report: "frame-research-10.md" },
      {
        change: "2026-10-25-service-worker",
        discussion: "2026-10-23-plugins",
        report: "frame-research-1.md",
      },
    ]);
    expect(copiedResearchFolder("2026-10-25-service-worker", ID)).toBe(
      `.greenline/ledger/2026-10-25-service-worker/discussions/${ID}`,
    );
    expect(researchReports(["frame-research-10.md", "a.md", "frame-research-9.md"])).toEqual([
      "frame-research-9.md",
      "frame-research-10.md",
    ]);
  });
});

describe("J-118 S2 the discussions beside the changes: status's block and the mirror's line", () => {
  const entries = [
    readDiscussionEntry(`${ID}.md`, record(["state: open"])),
    readDiscussionEntry(
      "2026-10-22-search.md",
      record(["state: open"]).replace("Let the app work on a train", "Search the archive"),
    ),
    readDiscussionEntry(
      "2026-10-23-plugins.md",
      record(['revisit: "after the release"', "state: parked", 'words: "park it"']),
    ),
    readDiscussionEntry(
      "2026-10-19-rust.md",
      record(['reason: "the team writes TypeScript"', "state: declined", 'words: "no"']),
    ),
    readDiscussionEntry("2026-10-20-broken.md", "---\nidea: x\n---\n"),
  ];
  const report = discussionsReport(entries);

  it("lists each discussion with its state and idea, and the records that do not read with why", () => {
    expect(report.discussions.map((row) => [row.id, row.state, row.idea])).toEqual([
      [ID, "open", "Let the app work on a train"],
      ["2026-10-22-search", "open", "Search the archive"],
      ["2026-10-23-plugins", "parked", "Let the app work on a train"],
      ["2026-10-19-rust", "declined", "Let the app work on a train"],
    ]);
    expect(report.discussions[2]?.revisit).toBe("after the release");
    expect(report.unreadable).toEqual([
      {
        id: "2026-10-20-broken",
        path: ".greenline/ledger/discussions/2026-10-20-broken.md",
        problem: expect.stringContaining("state:"),
      },
    ]);
    expect(readDiscussionEntry(`${ID}.md`, undefined)).toEqual({
      id: ID,
      path: `.greenline/ledger/discussions/${ID}.md`,
      problem: "it cannot be read",
    });
  });

  it("prints the open and parked discussions with their idea, the settled ones counted", () => {
    expect(renderDiscussionsText(report)).toBe(
      [
        "discussions",
        `  ${ID}: open; "Let the app work on a train"`,
        '  2026-10-22-search: open; "Search the archive"',
        '  2026-10-23-plugins: parked until after the release; "Let the app work on a train"',
        "  settled: 1 declined",
        "  2026-10-20-broken: does not read",
        "",
      ].join("\n"),
    );
    expect(renderDiscussionsText(discussionsReport([]))).toBe("");
  });

  it("gives the mirror one line while a discussion is open or parked, and none otherwise", () => {
    expect(discussionsLine(report)).toBe(
      `discussions: 2 open (${ID}, 2026-10-22-search), 1 parked`,
    );
    expect(discussionsLine(discussionsReport(entries.slice(2, 3)))).toBe("discussions: 1 parked");
    expect(discussionsLine(discussionsReport(entries.slice(3, 4)))).toBeUndefined();
  });
});
