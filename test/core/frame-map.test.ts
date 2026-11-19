/**
 * The frame map (J-117 S1): the frame section's question list form read into
 * the nodes, the questions with their proposed answer, answer and decider,
 * the closed nodes with their reason, the research each question drew on
 * and the restatement, which the CLI writes beside the record as
 * `frame-map.json` and the inspector draws.
 */
import { describe, expect, it } from "vitest";
import {
  FRAME_NODES,
  frameMapOf,
  frameMapText,
  researchTopicsOf,
  SUBJECT_NODES,
} from "../../src/core/frame-map.ts";
import { parseFrameMapFile } from "../../src/core/frame-map-file.ts";

const ID = "2026-10-25-export-rows";

/** A careful frame section in the list form, two rounds, one research report. */
const SECTION = `Here's what I now think you want:

- Outcome: a CSV of the live rows

### Round 1

- Q1 [purpose] Is the export for the monthly audit?
  - proposed: yes, the audit alone
  - answer: yes
  - decided: owner
- Q2 [scope] Does it include archived rows?
  - proposed: no, live rows only
  - answer: no, live rows only
  - decided: owner
- closed [security]: the rows hold no personal data
- closed [operations]: nothing deploys; the CLI runs locally

### Round 2

- Q3 [data] Which encoding does the audit tool read?
  - proposed: UTF-8 with a byte-order mark
  - answer: UTF-8 with a byte-order mark
  - decided: agent
  - research: [the encodings](${ID}/frame-research-1.md)
- Q4 [performance] Must it hold a million rows?
  - proposed: yes, streamed

Out of scope: the archive, a scheduled export.`;

describe("J-117 S1 the frame map, derived from the frame section's list form", () => {
  it("names the thirteen nodes in their order", () => {
    expect(FRAME_NODES).toEqual([
      "purpose",
      "scope",
      "adjacent",
      "journey",
      "surface",
      "data",
      "behaviour",
      "security",
      "performance",
      "operations",
      "verification",
      "constraints",
      "generic",
    ]);
  });

  it("yields the questions with their node, round, proposed answer, answer, decider and research", () => {
    const map = frameMapOf(SECTION);
    expect(map.questions).toEqual([
      {
        id: "Q1",
        round: 1,
        node: "purpose",
        question: "Is the export for the monthly audit?",
        proposed: "yes, the audit alone",
        answer: "yes",
        decided: "owner",
        research: [],
      },
      {
        id: "Q2",
        round: 1,
        node: "scope",
        question: "Does it include archived rows?",
        proposed: "no, live rows only",
        answer: "no, live rows only",
        decided: "owner",
        research: [],
      },
      {
        id: "Q3",
        round: 2,
        node: "data",
        question: "Which encoding does the audit tool read?",
        proposed: "UTF-8 with a byte-order mark",
        answer: "UTF-8 with a byte-order mark",
        decided: "agent",
        research: ["frame-research-1.md"],
      },
      {
        id: "Q4",
        round: 2,
        node: "performance",
        question: "Must it hold a million rows?",
        proposed: "yes, streamed",
        answer: null,
        decided: null,
        research: [],
      },
    ]);
    expect(map.issues).toEqual([]);
  });

  it("yields every node open, closed with its reason, or untouched, with its questions", () => {
    const nodes = frameMapOf(SECTION).nodes;
    expect(nodes.map((node) => node.node)).toEqual([...FRAME_NODES]);
    const byName = new Map(nodes.map((node) => [node.node, node]));
    expect(byName.get("scope")).toEqual({
      node: "scope",
      state: "open",
      reason: null,
      questions: ["Q2"],
    });
    expect(byName.get("security")).toEqual({
      node: "security",
      state: "closed",
      reason: "the rows hold no personal data",
      questions: [],
    });
    expect(byName.get("journey")).toEqual({
      node: "journey",
      state: "untouched",
      reason: null,
      questions: [],
    });
  });

  it("yields the research reports with the questions that drew on them, and the restatement last", () => {
    const map = frameMapOf(SECTION);
    expect(map.research).toEqual([{ file: "frame-research-1.md", questions: ["Q3"] }]);
    expect(map.restatement).toBe(
      "Here's what I now think you want:\n\n- Outcome: a CSV of the live rows\n\nOut of scope: the archive, a scheduled export.",
    );
  });

  it("names a report cited only in the prose, with no question", () => {
    const map = frameMapOf(`The frame read [the survey](${ID}/frame-research-2.md) first.`);
    expect(map.research).toEqual([{ file: "frame-research-2.md", questions: [] }]);
    expect(map.questions).toEqual([]);
  });

  it("reads an inline line as the restatement alone", () => {
    const map = frameMapOf("Intent: export the live rows; no open question.");
    expect(map.questions).toEqual([]);
    expect(map.nodes.every((node) => node.state === "untouched")).toBe(true);
    expect(map.restatement).toBe("Intent: export the live rows; no open question.");
  });

  it("names each line it cannot read, keeping what it can", () => {
    const map = frameMapOf(`- Q1 [interfaces] Which screen?
  - proposed: the list
  - decided: maybe
  - asked: today
- closed [scope]: nothing
- Q2 [scope] In or out?`);
    expect(map.questions.map((question) => question.id)).toEqual(["Q1", "Q2"]);
    expect(map.issues).toEqual([
      "Q1 names 'interfaces', no node of the thirteen",
      "Q1's decided is 'maybe', where owner or agent is read",
      "Q1 holds 'asked', where proposed, answer, decided or research is read",
      "the node 'scope' is closed and has a question",
    ]);
  });

  it("writes the file opening with its generatedBy key", () => {
    const text = frameMapText(ID, frameMapOf(SECTION), "greenline event");
    expect(
      text.startsWith(
        '{\n  "generatedBy": "greenline event",\n  "change": "2026-10-25-export-rows",',
      ),
    ).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
    const parsed: unknown = JSON.parse(text);
    expect(parsed).toMatchObject({ change: ID, research: [{ file: "frame-research-1.md" }] });
  });

  it("J-117 S4 reads the file back for the inspector, and names why a file does not read", () => {
    const map = frameMapOf(SECTION);
    expect(parseFrameMapFile(frameMapText(ID, map, "greenline event"), ID)).toEqual({ map });
    expect(parseFrameMapFile("{", ID)).toEqual({ reason: "frame-map.json is not JSON" });
    expect(parseFrameMapFile(frameMapText(ID, map, "greenline event"), "2026-10-25-other")).toEqual(
      {
        reason: `frame-map.json names the change ${ID}, written by greenline event`,
      },
    );
    expect("reason" in parseFrameMapFile('{ "generatedBy": "greenline event" }', ID)).toBe(true);
  });

  it("names a key it does not read, an indented line it does not read and a near-question line; a blank line keeps a question open, and an empty answer is none", () => {
    const map = frameMapOf(`- Q1 [scope] In or out?

  - Proposed: in
  - answer:
  - decided: owner
  - note this one
- Q2 scope Which side?
- closed: nothing`);
    expect(map.questions).toEqual([
      {
        id: "Q1",
        round: 1,
        node: "scope",
        question: "In or out?",
        proposed: null,
        answer: null,
        decided: "owner",
        research: [],
      },
    ]);
    expect(map.issues).toEqual([
      "Q1 holds 'Proposed', where proposed, answer, decided or research is read",
      "Q1 holds a line the form does not read: '- note this one'",
      "a line the form does not read: '- Q2 scope Which side?'",
      "a line the form does not read: '- closed: nothing'",
    ]);
  });
});

describe("J-151 S2 the research topics the frame section proposes", () => {
  const section = [
    "### Round 1",
    "",
    "- Q1 [scope] Does the letter go to the guarantor too?",
    "  - proposed: no",
    "- R1 [data] The rates the bank charges",
    "  - source: the web",
    "  - question: which rate applies to a late loan?",
    "  - changes: the letter's fee",
    '  - accepted: "yes, look it up"',
    "- R2 [constraints] The postal rules",
    "  - source: papers",
    "",
    "```",
    "- R3 [data] in a fence, no topic",
    "```",
  ].join("\n");

  it("reads each topic with its lines and the owner's acceptance, and leaves the questions' map alone", () => {
    expect(researchTopicsOf(section)).toEqual([
      {
        id: "R1",
        node: "data",
        topic: "The rates the bank charges",
        source: "the web",
        question: "which rate applies to a late loan?",
        changes: "the letter's fee",
        accepted: "yes, look it up",
      },
      {
        id: "R2",
        node: "constraints",
        topic: "The postal rules",
        source: "papers",
        question: null,
        changes: null,
        accepted: null,
      },
    ]);
    expect(frameMapOf(section).issues).toEqual([]);
    expect(frameMapOf(section).questions.map((question) => question.id)).toEqual(["Q1"]);
  });
});

describe("J-223 S1 a closed line that names several nodes sharing one reason", () => {
  it("reads each node it names closed with the one reason, the map's shape unchanged", () => {
    const map = frameMapOf(
      [
        "- Q1 [purpose] Is it for the month-end close?",
        "  - proposed: yes",
        "  - answer: yes",
        "  - decided: owner",
        "- closed [adjacent, journey, security]: the export reads the shelf alone and holds no personal data",
      ].join("\n"),
    );
    expect(map.issues).toEqual([]);
    const closed = map.nodes.filter((node) => node.state === "closed");
    expect(closed.map((node) => node.node)).toEqual(["adjacent", "journey", "security"]);
    expect(new Set(closed.map((node) => node.reason))).toEqual(
      new Set(["the export reads the shelf alone and holds no personal data"]),
    );
    expect(Object.keys(map)).toEqual(["nodes", "questions", "research", "restatement", "issues"]);
  });

  it("names a name among them that is no node as an issue, and still closes the nodes beside it", () => {
    const map = frameMapOf("- closed [security, data-migration, operations]: nothing deploys");
    expect(map.issues).toEqual(["a closed line names 'data-migration', no node of the thirteen"]);
    expect(map.nodes.filter((node) => node.state === "closed").map((node) => node.node)).toEqual([
      "security",
      "operations",
    ]);
  });

  it("names the twelve subject nodes owed at careful, every node but generic", () => {
    expect(SUBJECT_NODES).toEqual(FRAME_NODES.filter((node) => node !== "generic"));
    expect(SUBJECT_NODES).toHaveLength(12);
  });
});
