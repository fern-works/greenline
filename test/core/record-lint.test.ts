import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { frameMapOf } from "../../src/core/frame-map.ts";
import {
  breachesLine,
  carefulFrameGaps,
  discussionBreaches,
  recordBreaches,
  skillsHintNotice,
  type RecordBreach,
} from "../../src/core/record-lint.ts";
import { parseRecordForm } from "../../src/core/change.ts";
import {
  agentFamilyAlone,
  lackingLine,
  OUTCOME_CAP,
  recordLack,
  yesLackClause,
} from "../../src/core/record-lines.ts";
import * as readers from "../../src/readers/index.ts";
import { recordBreaches as exported } from "../../src/readers/index.ts";

/**
 * The record lint (J-149 S1; the ledger guide, "The sections"): read over
 * the Linear replay's records as its run ended, beside the breaches the
 * apparatus's ledger oracle found in them (oracle 008, kept with them under
 * test/fixtures/captures/records/j109c-linearb/), over every record the capture
 * corpus keeps (test/fixtures/captures/, J-150 S1), each reading reviewed
 * here, and over planted records for each form.
 */

const ROOT = join(import.meta.dirname, "..", "..");

function corpusModes(): ModesDefinition {
  const parsed = parseModes(
    readFileSync(join(ROOT, "corpus", "runtime", "modes.json"), "utf8"),
    "modes.json",
  );
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const definition = corpusModes();
const LINEAR = join(ROOT, "test", "fixtures", "captures", "records", "j109c-linearb");
const CAPTURES = join(ROOT, "test", "fixtures", "captures");

/** The skills a change's facts loaded, from its folder's `skills/<date>.jsonl`. */
function loadedOf(folder: string): readonly string[] {
  const skills = join(folder, "skills");
  if (!existsSync(skills)) return [];
  return readdirSync(skills).flatMap((file) =>
    readFileSync(join(skills, file), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => z.object({ skill: z.string() }).parse(JSON.parse(line)).skill),
  );
}

/**
 * Whether the series' captures stand in this checkout: they are the
 * workshop's and stay out of the public tree, so the readings over them run
 * here alone, and the planted records run everywhere.
 */
const CAPTURED_HERE = existsSync(join(LINEAR, "oracle-008.json"));

/** The oracle's breaches over the Linear records. */
function oracleBreaches(): readonly string[] {
  return z
    .object({ run: z.literal("j109c-linearb"), breaches: z.array(z.string()) })
    .parse(JSON.parse(readFileSync(join(LINEAR, "oracle-008.json"), "utf8"))).breaches;
}

/** Each Linear record's breaches, its id before each. */
function linearBreaches(): readonly {
  readonly id: string;
  readonly breaches: readonly RecordBreach[];
}[] {
  return (
    readdirSync(LINEAR)
      // Each record kept as text, its bytes as the run left them, as the capture corpus keeps its records.
      .filter((file) => file.endsWith(".txt"))
      .map((file) => {
        const id = file.slice(0, -".txt".length);
        return {
          id,
          breaches: recordBreaches({
            id,
            text: readFileSync(join(LINEAR, file), "utf8"),
            definition,
            loaded: loadedOf(join(LINEAR, id)),
          }),
        };
      })
  );
}

/**
 * The oracle's breaches the lint's forms do not read: the visuals' links
 * file, the design section's components and its none line; and the verify
 * section's links to the interface check's runs, which the lint admits
 * beside its reports since J-199 S1 (j196t-roster-use), where the oracle
 * read them as reports.
 */
const OUT_OF_FORM = [
  /visuals\.json: stands nowhere/,
  /the verify section cites \S+\/interface\/\S*, not a report/,
  /the design section names the component/,
  /is done without the design section "none, no interface"/,
];

describe.skipIf(!CAPTURED_HERE)("J-149 S1 the record lint over the Linear replay's records", () => {
  const linear = CAPTURED_HERE ? linearBreaches() : [];
  const breaches = CAPTURED_HERE ? oracleBreaches() : [];
  const found = linear.flatMap(({ id, breaches: each }) =>
    each.map((breach) => `${id} ${breach.message}`),
  );

  it("finds every breach of the oracle's in the forms it reads: the reports cited, the counts and the frame's answers", () => {
    const missed: string[] = [];
    for (const line of breaches) {
      if (OUT_OF_FORM.some((pattern) => pattern.test(line))) continue;
      const read = /^(?:\.greenline\/ledger\/)?([0-9a-z-]+)\.md: (.*)$/.exec(line);
      const [, id = "", rest = ""] = read ?? [];
      const cites = /^the (\w+) section cites (\S+), not a report/.exec(rest);
      const question = /^frame: (Q\d+) names who decided and holds no answer$/.exec(rest);
      const node = /^frame: (Q\d+) names '([^']+)', no node/.exec(rest);
      const count = /^the independent (\w+) section cites (\d+) report/.exec(rest);
      const wanted =
        cites !== null
          ? `${id} the ${cites[1] ?? ""} section cites ${cites[2] ?? ""},`
          : question !== null
            ? `${id} frame question ${question[1] ?? ""} holds no answer`
            : node !== null
              ? `${id} frame: ${node[1] ?? ""} names '${node[2] ?? ""}', no node of the thirteen`
              : count !== null
                ? `${id} the independent ${count[1] ?? ""} section cites ${count[2] ?? ""} report`
                : undefined;
      if (wanted === undefined || !found.some((each) => each.startsWith(wanted))) missed.push(line);
    }
    expect(missed).toEqual([]);
    expect(breaches.length).toBe(110);
  });

  it("reads the skills lines that name skills the facts never loaded as a hint's notice, no breach (J-176 S1)", () => {
    const hinted = (id: string): string | undefined => {
      const text = readFileSync(join(LINEAR, `${id}.txt`), "utf8");
      const form = parseRecordForm(`${id}.md`, text);
      return form._tag === "ok"
        ? skillsHintNotice(form.value.skills, loadedOf(join(LINEAR, id)))
        : undefined;
    };
    expect(hinted("2026-10-28-comments")).toBeDefined();
    expect(hinted("2026-10-28-tracker-t2-server")).toMatch(
      /^the skills line names close, which the hooks saw no load of and leaves out .*build.*, which the hooks saw loaded: reconcile it with what the change used, in your own words$/,
    );
  });

  it("reads the oracle's 18 unanswered questions, and the three with neither an answer nor a decided line beside them", () => {
    const frame = found.filter((each) => / frame question Q\d+ holds no answer/.test(each));
    expect(frame).toHaveLength(21);
  });
});

/** Each record the capture corpus keeps, by its capture and its id, and the breaches the lint reads in it, each reviewed. */
const CAPTURED = new Map<string, readonly string[]>(
  Object.entries({
    "j109c-conduct-empty/001-003 2026-10-26-groundwork": [
      "frame: Q3 names 'behavior', no node of the thirteen",
      "frame question Q4 holds no answer",
    ],
    "j109c-conduct-empty/002-001 2026-10-26-groundwork": [
      "frame: Q3 names 'behavior', no node of the thirteen",
      "frame question Q4 holds no answer",
    ],
    "j109c-conduct-emptyb/001-003 2026-10-27-groundwork": ["frame question Q4 holds no answer"],
    "j109c-conduct-emptyb/002-001 2026-10-27-groundwork": ["frame question Q4 holds no answer"],
    "j109c-conduct-emptyb/002-002 2026-10-27-groundwork": ["frame question Q4 holds no answer"],
    "j109c-conduct-emptyd/002-001 2026-10-27-groundwork": ["frame question Q3 holds no answer"],
    "j109c-conduct-emptyd/002-006 2026-10-27-groundwork": ["frame question Q3 holds no answer"],
    // The decided line written as a sentence, the shape emptyg's discussion took.
    // J-173 S1: a done interface change's design section with no components line.
    "j109c-conduct-interfacec/001-011 2026-10-28-members-header-orange": [
      "the design section of an interface change names no components line",
    ],
    // J-173 S1: components lines run on into the section's prose.
    "j109x-conduct-interface/001-009 2026-10-28-members-header-colour": [
      "the design section's components line names \"table. Read the existing lock",
    ],
    "j109x-conduct-interface/001-009 2026-10-28-members-row-remove": [
      "the design section's components line names \"empty-state. The existing lock covers the page. No directions dealt: the owner accepted the small red trash action",
    ],
    "j109c-conduct-interfacec/001-011 2026-10-28-members-marks": [
      "frame question Q3's decided is 'agent, taking the first",
    ],
    "j109c-pictures-driftc/001-002 2026-10-28-shelf-find-by-year": [
      "frame: a closed line names 'data-migration', no node of the thirteen",
    ],
    "j109c-pictures-driftc/001-006 2026-10-28-shelf-find-by-year": [
      "frame: a closed line names 'data-migration', no node of the thirteen",
    ],
    "j109c-pictures-driftc/001-008 2026-10-28-shelf-find-by-year": [
      "the review section cites 2026-10-28-shelf-find-by-year/brief-review-1.md, not a report",
      "frame: a closed line names 'data-migration', no node of the thirteen",
    ],
    // A review section citing its brief and the check facts, where its reviewer's report stands alone.
    "j109x-conduct-emptyc/002-001 2026-10-27-farewell": [
      "the review section cites 2026-10-27-farewell/brief-review-1.md, not a report",
      "the review section cites 2026-10-27-farewell/checks/",
      "the review section cites 2026-10-27-farewell/checks/",
    ],
    "j109x-conduct-interface/001-009 2026-10-28-members-table-search": [
      "the review section cites 2026-10-28-members-table-search/verify/header/red.txt, not a report",
      "the review section cites 2026-10-28-members-table-search/verify/header/green.txt, not a report",
      "the review section cites 2026-10-28-members-table-search/verify/header/final.txt, not a report",
    ],
    "j109x-situation-brownfield-proceed/001-002 2026-10-28-book-reservations": [
      "the verify section cites 2026-10-28-book-reservations/checks/",
      "the verify section cites 2026-10-28-book-reservations/checks/",
    ],
    // Its two closed lines each name several nodes, read closed since J-223 S1.
    "j109x-situation-empty/001-003 2026-10-28-temperature-cli": [
      "the review section cites 2026-10-28-temperature-cli/brief-review-1.md, not a report",
    ],
    "j109x-situation-greenfield-with-docs/001-003 2026-10-28-week-one-plan": [
      "frame question Q1 holds no answer",
      "frame question Q2 holds no answer",
      "frame question Q3 holds no answer",
    ],
    // greenfield-with-docs 001/004 closed the behaviour node and asked it later, which the form allows.
  }),
);

describe.skipIf(!CAPTURED_HERE)(
  "J-149 S1 the record lint over the capture corpus's records",
  () => {
    const captures = CAPTURED_HERE
      ? z
          .object({ captures: z.array(z.string()) })
          .parse(JSON.parse(readFileSync(join(CAPTURES, "manifest.json"), "utf8"))).captures
      : [];
    const read = captures.flatMap((capture) => {
      const folder = join(CAPTURES, capture, "record");
      if (!existsSync(folder)) return [];
      return readdirSync(folder).map((file) => {
        const id = file.replace(/\.txt$/, "");
        return {
          key: `${capture} ${id}`,
          // The captures closed before the outcome line (J-168 S1) and before the skeleton's owed
          // lines (J-176 S1), so neither rule is read in them here; the lines are read below.
          breaches: recordBreaches({
            id,
            text: readFileSync(join(folder, file), "utf8"),
            definition,
          }).filter(
            // The careful frame's reading postdates them too (J-223 S1), read over the run j217t-frame-nodes's frame below.
            (breach) =>
              breach.rule !== "outcome" && breach.rule !== "lines" && breach.rule !== "careful",
          ),
          lines: recordBreaches({
            id,
            text: readFileSync(join(folder, file), "utf8"),
            definition,
          }).filter((breach) => breach.rule === "lines"),
          done: /^state: done$/m.test(readFileSync(join(folder, file), "utf8")),
        };
      });
    });

    it("reads every captured record, more than a hundred, and the breaches each holds as reviewed", () => {
      expect(read.length).toBeGreaterThan(100);
      const breached = read.filter((each) => each.breaches.length > 0);
      expect(breached.map((each) => each.key).toSorted()).toEqual([...CAPTURED.keys()].toSorted());
      for (const { key, breaches } of breached) {
        const wanted = CAPTURED.get(key) ?? [];
        expect(breaches.length, key).toBe(wanted.length);
        breaches.forEach((breach, at) => {
          expect(
            breach.message.startsWith(wanted[at] ?? "\u0000"),
            `${key}: ${breach.message}`,
          ).toBe(true);
        });
      }
    });

    it("reads the lines each done record of the series lacks, the skeleton's owed lines it predates, and none in an open one (J-176 S1)", () => {
      const done = read.filter((each) => each.done);
      expect(done.length).toBeGreaterThan(20);
      for (const each of done)
        expect(each.lines.map((breach) => breach.message)[0], each.key).toMatch(
          // A record of the series predates the floors line too, which its own words name first (J-226 S1).
          /^the done record lacks its (?:.+ lines?: write each in your own words for its meaning|floors line: write floors: none|yes line, the owner's words that answered your proposal)/,
        );
      expect(read.filter((each) => !each.done && each.lines.length > 0)).toEqual([]);
    });
  },
);

/** A record's text from its front matter's lines and its body's. */
function record(front: readonly string[], body: readonly string[]): string {
  return ["---", ...front, "---", "", ...body, ""].join("\n");
}

const ID = "2026-10-29-overdue-letters";

/** A record's breaches less the owed lines (J-176 S1) and the careful frame's reading (J-223 S1), which their own tests read. */
function formsOf(input: Parameters<typeof recordBreaches>[0]): readonly RecordBreach[] {
  return recordBreaches(input).filter(
    (breach) => breach.rule !== "lines" && breach.rule !== "careful",
  );
}

/** A regular record's front matter, its state and its other lines given. */
function regular(state: string, more: readonly string[] = []): readonly string[] {
  return [
    "mode: regular",
    "choice: accepted",
    'why: "the overdue letters"',
    `state: ${state}`,
    // A done record states what landed (J-168 S1) and every line its mode owes (J-176 S1).
    ...(state === "done"
      ? [
          "next: none",
          "floors: none",
          'outcome: "The overdue letters go out each morning."',
          'yes: "Yes, go ahead."',
          "ground: branch",
          'agent: "claude-code/opus"',
          "skills: [frame, build]",
          "agents: 2",
          "rounds: 0",
          'starts: ["review 1"]',
        ]
      : []),
    ...more,
  ];
}

describe("J-148 S3 the close's marks line and the floor's ruling", () => {
  const closed = (close: readonly string[], more: readonly string[] = []): string =>
    record(regular("done"), [...more, "## close", "", ...close]);

  it("holds the close's marks line to the line status prints from the marks files", () => {
    const status = "marks: 1 open on /settings";
    const said = closed(["- marks: 1 open on /settings"]);
    expect(recordBreaches({ id: ID, text: said, marks: { line: status } })).toEqual([]);
    // The owner closed the mark in words: the file holds none open, so a line saying one waits is refused.
    expect(
      recordBreaches({ id: ID, text: said, marks: { line: undefined } }).map(
        (breach) => breach.message,
      ),
    ).toEqual([
      `the close section's marks line says "marks: 1 open on /settings", and the marks files say "marks: none open": copy the marks line greenline status prints as it stands, never from memory`,
    ]);
    // An open mark the close leaves out is refused too.
    expect(
      recordBreaches({ id: ID, text: closed(["the checks green"]), marks: { line: status } }),
    ).toEqual([
      {
        rule: "marks",
        message: `the close section names no marks line while the marks files hold open marks: copy the line greenline status prints, "${status}"`,
      },
    ]);
    // No mark open and none named, or marks not read: nothing to hold.
    expect(
      recordBreaches({ id: ID, text: closed(["the checks green"]), marks: { line: undefined } }),
    ).toEqual([]);
    expect(recordBreaches({ id: ID, text: said })).toEqual([]);
  });

  it("refuses a floor finding the ## Interface section names with no owner's ruling", () => {
    const text = closed(
      ["the checks green"],
      [
        "## Interface",
        "",
        "- floor target-size at the remove button",
        "- floor focus-visible: fixed",
        `- floor contrast-both-schemes: waived, "dark is not shipped yet"`,
        "",
      ],
    );
    expect(recordBreaches({ id: ID, text })).toEqual([
      {
        rule: "floor",
        message: `the floor finding target-size at the remove button has no ruling of the owner's: put it to the owner on a card, then write their answer in the ## Interface section, \`- floor target-size: fixed\` once fixed or \`- floor target-size: waived, "<their words>"\``,
      },
    ]);
  });
});

describe("J-149 S1 the record lint over planted records", () => {
  it("holds a frame question to its answer and who decided, an open one to answer: open", () => {
    const text = record(regular("open"), [
      "## frame",
      "",
      "- Q1 [scope] Does it include archived rows?",
      "  - proposed: no",
      "  - answer: no",
      "  - decided: owner",
      "- Q2 [data] Which encoding?",
      "  - proposed: utf-8",
      "  - answer: open",
      "  - decided: owner",
      "- Q3 [behaviour] What on a duplicate?",
      "  - proposed: skip it",
      "  - decided: owner",
      "- Q4 [journey] Who sends it?",
      "  - answer: the desk",
      "- Q5 [surface] Where is it shown?",
      "  - answer: the list",
      "  - decided: the owner, on the card",
    ]);
    expect(recordBreaches({ id: ID, text, definition }).map((breach) => breach.message)).toEqual([
      "frame question Q3 holds no answer: write the answer taken and who decided, or answer: open with decided: owner where the owner left it open",
      "frame question Q4 has an answer and no decided line: write decided: owner for the owner's answer, or decided: agent for a choice inside the accepted scope",
      "frame question Q5's decided is 'the owner, on the card', where owner or agent is read",
    ]);
  });

  it("holds an independent section to its own reports, as many as its depth starts", () => {
    const front = [
      "mode: careful",
      "choice: accepted",
      'why: "the overdue letters"',
      "state: done",
      "next: none",
      'outcome: "The overdue letters go out each morning."',
    ];
    const cited = record(front, [
      "## review",
      "",
      `Two reviewers: [one](${ID}/review-1.md) and [two](${ID}/review-2.md).`,
      "",
      "## verify",
      "",
      `[The verifier](${ID}/verify-1.md) found the evidence under [the claim](${ID}/verify/letters/run.txt) and [visuals](${ID}/visuals.json).`,
    ]);
    expect(formsOf({ id: ID, text: cited, definition })).toEqual([
      {
        rule: "reports",
        message: `the verify section cites ${ID}/verify/letters/run.txt, not a report named ${ID}/verify-<n>.md: at the independent depth it cites its fresh agents' reports alone, and each report cites its own evidence`,
      },
    ]);
    const short = record(front, ["## review", "", `One reviewer: [one](${ID}/review-1.md).`]);
    expect(formsOf({ id: ID, text: short, definition })).toEqual([
      {
        rule: "reports",
        message: `the independent review section cites 1 report, where its depth starts 2: cite each fresh agent's report by its path, ${ID}/review-<n>.md`,
      },
    ]);
    // A written verify at regular cites its evidence; only a depth that starts agents is held.
    const written = record(regular("done"), [
      "## verify",
      "",
      `VERIFIED, [the run](${ID}/verify/letters/run.txt).`,
    ]);
    expect(formsOf({ id: ID, text: written, definition })).toEqual([]);
  });

  it("owes no report where the step ran without a fresh agent: a review the record says ran inline, and a step no start names on a harness not known to delegate", () => {
    const careful = (more: readonly string[]) => [
      "mode: careful",
      "choice: accepted",
      'why: "the overdue letters"',
      "state: done",
      "next: none",
      'outcome: "The overdue letters go out each morning."',
      ...more,
    ];
    const body = ["## review", "", "Reviewed inline: no finding at a blocking rung."];
    expect(
      formsOf({ id: ID, text: record(careful(["reviewed: inline"]), body), definition }),
    ).toEqual([]);
    // A harness no source has read to delegate, such as Gemini, owes no report for a start it never made.
    const gemini = 'agent: "gemini/gemini-3-pro"';
    expect(formsOf({ id: ID, text: record(careful([gemini]), body), definition })).toEqual([]);
    // A start the record names owes its report there too.
    expect(
      formsOf({
        id: ID,
        text: record(careful([gemini, "starts:", '  - "review 1"']), body),
        definition,
      }).map((breach) => breach.rule),
    ).toEqual(["reports"]);
    // On Claude Code, which delegates, the depth owes its reports whatever the starts say, and on
    // Codex too since J-174: the Linear run's comments change, reviewed inline at careful where
    // delegation was called unavailable, is refused at done.
    for (const agent of ['agent: "claude-code/opus"', 'agent: "codex/gpt-6.1-terra"'])
      expect(
        formsOf({ id: ID, text: record(careful([agent]), body), definition }).map(
          (breach) => breach.rule,
        ),
        agent,
      ).toEqual(["reports"]);
  });

  it("counts a report linked to one of its headings or with a title as the report", () => {
    const front = [
      "mode: careful",
      "choice: accepted",
      'why: "the overdue letters"',
      "state: done",
      "next: none",
      'outcome: "The overdue letters go out each morning."',
    ];
    const text = record(front, [
      "## review",
      "",
      `[one](${ID}/review-1.md#findings), [two](${ID}/review-2.md "the second reviewer")`,
    ]);
    expect(formsOf({ id: ID, text, definition })).toEqual([]);
  });

  it("counts a planning change's citations of its tickets' reports, and leaves a section not yet written", () => {
    const planning = record(
      [
        "mode: careful",
        "choice: accepted",
        'why: "the tracker"',
        "state: open",
        "plan: 001-tracker",
      ],
      [
        "## review",
        "",
        "[T1's first](2026-10-29-tracker-t1/review-1.md), [T1's second](2026-10-29-tracker-t1/review-2.md)",
        "",
        "## verify",
        "",
        "<the verifier's report, cited>",
      ],
    );
    expect(recordBreaches({ id: ID, text: planning, definition })).toEqual([]);
  });

  it("holds a done record to every line its mode owes, and no placeholder left in a line or a section (J-176 S1)", () => {
    // The regular helper's done record states each line its mode owes.
    expect(recordBreaches({ id: ID, text: record(regular("done"), []), definition })).toEqual([]);
    const lacking = record(
      [
        "mode: regular",
        "choice: accepted",
        'why: "the overdue letters"',
        "state: done",
        "next: none",
        'outcome: "The overdue letters go out each morning."',
        'agent: "<harness>/<the model, as the harness states it>"',
        'research: "<one line by the research skill that ran; leave the line out when none did>"',
      ],
      ["## build", "", "<the builder's section>", "", "## verify", "", "VERIFIED."],
    );
    expect(recordBreaches({ id: ID, text: lacking, definition })).toEqual([
      {
        rule: "lines",
        message:
          "the done record lacks its floors line: write floors: none, or the floors you found as a list, as [security]; a record opened before this version adds the line by hand",
      },
      {
        rule: "lines",
        message: `the done record lacks its yes line, ${yesLackClause()}`,
      },
      {
        rule: "lines",
        message:
          "the done record lacks its ground, agent, skills, agents, rounds and starts lines: write each in your own words for its meaning, as the ledger guide's front matter gives it",
      },
      {
        rule: "lines",
        message:
          "the research line still holds the skeleton's placeholder: write it in your own words, or take an optional line out",
      },
      {
        rule: "lines",
        message:
          "the build section still holds the skeleton's placeholder: write the section, or the one line its depth gives a step that did not run",
      },
    ]);
    // An open record owes them by its close: the lint holds done, and status names the lack.
    expect(
      recordBreaches({
        id: ID,
        text: lacking.replace("state: done", "state: open").replace("next: none\n", ""),
        definition,
      }),
    ).toEqual([]);
  });

  it("J-229 S1 names a missing yes at the done door and in the status's lacking line in the same clause, the owner's words", () => {
    const lines = (state: string): readonly string[] => [
      "mode: quick",
      "choice: accepted",
      'why: "a typo"',
      "floors: none",
      `state: ${state}`,
      "ground: branch",
      'agent: "codex/sol"',
      "skills: [frame, build, verify, close]",
      'outcome: "The typo is fixed."',
    ];
    const body = [
      "## frame",
      "",
      "x",
      "",
      "## build",
      "",
      "x",
      "",
      "## verify",
      "",
      "x",
      "",
      "## close",
      "",
      "x",
    ];
    const refused = recordBreaches({
      id: ID,
      text: record(lines("done"), body),
      definition,
    }).filter((breach) => breach.rule === "lines");
    expect(refused).toEqual([
      { rule: "lines", message: `the done record lacks its yes line, ${yesLackClause()}` },
    ]);
    // While open, the skeleton's yes placeholder still stands, so the record is of this version's form.
    const lack = recordLack(
      definition,
      record([...lines("open"), 'yes: "<the owner\'s words that answered the proposal>"'], body),
    );
    const line = lack === undefined ? undefined : lackingLine(lack);
    expect(line).toBe(`record lacks: the yes now, ${yesLackClause()}`);
    expect(refused[0]?.message).toContain(yesLackClause());
  });

  it("reads the skills line beside the loads as no breach, and holds a done change to each skill it owed (J-176 S1)", () => {
    const text = record(regular("done"), []);
    expect(
      recordBreaches({ id: ID, text, definition, loaded: ["review"] }).map((each) => each.rule),
    ).toEqual([]);
    const owed = [
      { skill: "tdd", why: "a test file touched" },
      { skill: "redesign", why: "the request says denser" },
    ];
    expect(recordBreaches({ id: ID, text, definition, loaded: ["tdd"], owed })).toEqual([
      {
        rule: "owed",
        message:
          "the change owed redesign (the request says denser), and neither the loads the hooks recorded nor the skills line name it: read it where it applies and name it in the skills line, or write the owner's waiver, waived: redesign: <reason>; the owner's yes: \"<their words>\"",
      },
    ]);
    const waived = record(regular("done"), [
      "## close",
      "",
      'waived: redesign: the page keeps its look; the owner\'s yes: "leave the look alone"',
    ]);
    expect(recordBreaches({ id: ID, text: waived, definition, loaded: ["tdd"], owed })).toEqual([]);
    // An open change owes them by its close.
    expect(
      recordBreaches({ id: ID, text: record(regular("open"), []), definition, loaded: [], owed }),
    ).toEqual([]);
    // Nothing leans on one harness's hooks: where they recorded no load at all, the owed line is a hint.
    expect(recordBreaches({ id: ID, text, definition, loaded: [], owed })).toEqual([]);
    // The agent's own skills line naming the skill stands where the facts are silent on it.
    const named = text.replace("skills: [frame, build]", "skills: [frame, build, redesign]");
    expect(named).not.toBe(text);
    expect(recordBreaches({ id: ID, text: named, definition, loaded: ["tdd"], owed })).toEqual([]);
  });

  it("J-203 S1 holds a done change to a skill owed whole whose pages the loads show read in part, the skills line naming it or not, and lets the owner's waiver meet it", () => {
    const owed = [
      {
        skill: "tdd",
        why: "a test file touched, at build",
        held: [
          { file: "method.md", state: "cut" as const },
          { file: "tests.md", state: "unread" as const },
        ],
      },
    ];
    const named = record(regular("done"), []).replace(
      "skills: [frame, build]",
      "skills: [frame, build, tdd]",
    );
    const message =
      "the change owed tdd whole (a test file touched, at build), and the loads the hooks recorded show method.md cut by the harness, read it again; tests.md unread: read each page alone and whole where it applies, or write the owner's waiver, waived: tdd: <reason>; the owner's yes: \"<their words>\"";
    expect(recordBreaches({ id: ID, text: named, definition, loaded: ["tdd"], owed })).toEqual([
      { rule: "owed", message },
    ]);
    expect(
      recordBreaches({
        id: ID,
        text: record(regular("done"), []),
        definition,
        loaded: ["tdd"],
        owed,
      }),
    ).toEqual([{ rule: "owed", message }]);
    const waived = record(regular("done"), [
      "## close",
      "",
      'waived: tdd: the tests were already there; the owner\'s yes: "keep the tests as they are"',
    ]);
    expect(recordBreaches({ id: ID, text: waived, definition, loaded: ["tdd"], owed })).toEqual([]);
    // No load of tdd at all: the skills line stands where the facts are silent on it.
    expect(recordBreaches({ id: ID, text: named, definition, loaded: ["frame"], owed })).toEqual(
      [],
    );
  });

  it("holds a done change to a filed report for each research topic the owner accepted (J-176 S1)", () => {
    const frame = (link: string) =>
      record(regular("done"), [
        "## frame",
        "",
        "- R1 [data] The rates the bank charges",
        "  - source: the web",
        "  - question: which rate applies?",
        "  - changes: the letter's fee",
        '  - accepted: "yes, look it up"',
        "- R2 [scope] Proposed and never accepted",
        "  - source: code",
        "",
        link,
      ]);
    expect(
      recordBreaches({ id: ID, text: frame("The rate is fixed."), definition }).map(
        (each) => each.message,
      ),
    ).toEqual([
      `the owner accepted the research R1, The rates the bank charges, and the frame section links no report of it: file the report with greenline research report <file> --change ${ID} --topic R1, and link [R1](${ID}/frame-research-1.md) where it informs a question`,
    ]);
    expect(
      recordBreaches({
        id: ID,
        text: frame(`The rate is fixed, [R1](${ID}/frame-research-1.md).`),
        definition,
      }),
    ).toEqual([]);
  });

  it("holds a plan the change extended to its commit at the close, and names the breaches in one line", () => {
    const breaches = recordBreaches({
      id: ID,
      text: record(regular("done"), []),
      definition,
      planEdits: [".greenline/plans/001-tracker/tickets.md"],
    });
    expect(breaches).toEqual([
      {
        rule: "plan",
        message:
          "the plan's files .greenline/plans/001-tracker/tickets.md hold edits left uncommitted: a plan extended during a change is committed at its close, with its planning change's record, on that change's branch",
      },
    ]);
    expect(breachesLine(ID, breaches)).toBe(breaches[0]?.message);
    expect(
      breachesLine(ID, [
        ...breaches,
        { rule: "frame", message: "frame question Q1 holds no answer" },
      ]),
    ).toBe(
      `${breaches[0]?.message ?? ""}; and 1 more, each named by greenline status --change ${ID}`,
    );
  });

  it("reads nothing in a record that does not parse, which its parse names, and is the readers module's", () => {
    expect(recordBreaches({ id: ID, text: "no front matter", definition })).toEqual([]);
    expect(exported).toBe(recordBreaches);
    expect(readers.discussionBreaches).toBe(discussionBreaches);
    expect(readers.breachesLine).toBe(breachesLine);
    expect(readers.frameMapOf).toBe(frameMapOf);
  });

  it("holds a discussion's decided to the owner or the agent, the shape emptyg's discussion broke", () => {
    const discussion = (decided: string) =>
      record(
        ['idea: "a cache for the list"', "state: open"],
        [
          "## frame",
          "",
          "- Q1 [scope] Which pages?",
          "  - answer: the list",
          `  - decided: ${decided}`,
          "- Q2 [data] How long?",
          "",
          "## open questions",
          "",
          "- Q2",
        ],
      );
    expect(discussionBreaches("2026-10-29-list-cache", discussion("owner"))).toEqual([]);
    expect(
      discussionBreaches("2026-10-29-list-cache", discussion("the owner, after the card")),
    ).toEqual([
      {
        rule: "frame",
        message:
          "frame: Q1's decided is 'the owner, after the card', where owner or agent is read: why the owner chose stands in its answer (.greenline/ledger/README.md, \"Discussions\")",
      },
    ]);
  });
});

describe("J-151 S2 the owner's yes against the messages the hooks journaled", () => {
  const OVERDUE = "2026-10-29-overdue";
  const text = (lines: readonly string[]): string =>
    [
      "---",
      "mode: quick",
      'why: "w"',
      ...lines,
      "state: open",
      "---",
      "",
      "## frame",
      "",
      "x",
      "",
    ].join("\n");
  const yes = (lines: readonly string[], request: string) =>
    recordBreaches({
      id: OVERDUE,
      text: text(lines),
      journal: { kept: true, messages: ["Add the overdue letters.", request] },
    }).filter((breach) => breach.rule === "yes");

  it("reads the quote against the owner's journaled messages, and nothing where none was journaled (J-176 S1)", () => {
    expect(yes(["choice: accepted", 'yes: "Yes, go ahead."'], "Yes,  go ahead.")).toEqual([]);
    expect(yes(["choice: accepted"], "Approved.").map((breach) => breach.message)).toEqual([
      "the record says choice: accepted with no yes line: quote the owner's words that answered the proposal in it",
    ]);
    expect(
      yes(
        ["choice: accepted", 'yes: "just write the code"'],
        "just write the code now and commit what you have",
      ),
    ).toEqual([
      expect.objectContaining({
        rule: "yes",
        message: expect.stringContaining("reads as no yes"),
      }),
    ]);
    expect(yes(["choice: accepted", 'yes: "Yes, all of it."'], "Yes.")).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("which no message of the owner's holds"),
      }),
    ]);
    expect(
      recordBreaches({
        id: OVERDUE,
        text: text(["choice: accepted", 'yes: "Yes, all of it."']),
        journal: { kept: false },
      }),
    ).toEqual([]);
    // The owner named the mode, or proceed let it stand: no yes is quoted.
    expect(yes(["choice: owner"], "Do it at quick.")).toEqual([]);
    expect(
      recordBreaches({ id: OVERDUE, text: text(["choice: accepted"]) }).filter(
        (breach) => breach.rule === "yes",
      ),
    ).toEqual([]);
  });

  it("reads the owner's words as a yes by their opening, and quotes them on one line", () => {
    for (const words of [
      "Yes, go ahead.",
      "Approve these tickets.",
      "LGTM",
      "ok",
      "Sounds good, proceed.",
      // A yes anywhere in the words, on its word boundaries.
      "ship it",
      "fine, go ahead",
      "looks right to me, do it",
      "that works",
      "please proceed with the second",
      "ok yes",
      "Perfect. Carry on.",
    ])
      expect(readers.yesToProposal(words), words).toBe(true);
    for (const words of [
      "just write the code now and commit what you have",
      "No, smaller.",
      "Wait, what about the guarantor?",
      "Can it be regular?",
      // A no at the words' start is no yes, whatever follows it.
      "no worries, go ahead",
      "Not yet, I want to see the plan first.",
      "don't, it is fine as it is",
      "Hold on, yes, but smaller.",
      // A word that holds a yes inside it is none: going, goodness, okayed.
      "Ongoing questions first; goodness knows.",
    ])
      expect(readers.yesToProposal(words), words).toBe(false);
    expect(readers.yesValue('Yes,\n  "all" of it.')).toBe(`"Yes, 'all' of it."`);
    expect(readers.yesQuotes("Yes, 'all' of it.", 'Yes,\n  "all" of it.')).toBe(true);
    expect(readers.yesQuotes("", "Yes.")).toBe(false);
  });
});

describe("J-168 S1 the close's outcome line", () => {
  const done = (more: readonly string[]): string =>
    record(
      [
        "mode: regular",
        "choice: owner",
        'why: "the overdue letters"',
        "state: done",
        "next: none",
        ...more,
      ],
      [],
    );
  const outcome = (said: string): readonly RecordBreach[] =>
    recordBreaches({ id: ID, text: done([`outcome: "${said}"`]) });

  it("refuses a done record with no outcome line, naming the line to write", () => {
    expect(recordBreaches({ id: ID, text: done([]) })).toEqual([
      {
        rule: "outcome",
        message:
          'the done record states no outcome line: write outcome: "<what landed>" in its front matter, one sentence in your own words under 200 characters, never the why repeated',
      },
    ]);
    // An open or stopped record writes it at the close.
    expect(recordBreaches({ id: ID, text: record(regular("open"), []) })).toEqual([]);
    expect(outcome("The overdue letters go out each morning at eight.")).toEqual([]);
  });

  it("holds the line under 200 characters wherever it stands", () => {
    expect(OUTCOME_CAP).toBe(200);
    expect(outcome("a".repeat(200))).toEqual([]);
    expect(outcome("a".repeat(201))).toEqual([
      {
        rule: "outcome",
        message:
          "the outcome line runs to 201 characters: say what landed in one sentence under 200 characters, never the why repeated",
      },
    ]);
    expect(
      recordBreaches({
        id: ID,
        text: record(regular("open", [`outcome: "${"a".repeat(240)}"`]), []),
      }).map((breach) => breach.rule),
    ).toEqual(["outcome"]);
  });
});

describe("J-173 S1 a done record's links to its visuals and check runs, and its components line", () => {
  const done = (body: readonly string[], more: readonly string[] = []): string =>
    record(regular("done", ['interface: "yes, app"', ...more]), body);
  const DESIGN = ["## design", "", "components: form, table", "", "The lock read: DESIGN.md.", ""];

  it("names a done record whose links file lists a visual the record does not link", () => {
    const text = done(DESIGN);
    expect(
      recordBreaches({ id: ID, text, folder: { files: ["visuals.json"], visuals: 2 } }),
    ).toEqual([
      {
        rule: "visuals",
        message: `the done record does not link its visuals: its folder's visuals.json lists 2 under .greenline/visuals/${ID}/; link them once, as [visuals](${ID}/visuals.json), in the close section`,
      },
    ]);
    const linked = done([...DESIGN, "## close", "", `[visuals](${ID}/visuals.json)`]);
    expect(
      recordBreaches({ id: ID, text: linked, folder: { files: ["visuals.json"], visuals: 2 } }),
    ).toEqual([]);
    // An empty links file and an open record owe nothing yet.
    expect(
      recordBreaches({ id: ID, text, folder: { files: ["visuals.json"], visuals: 0 } }),
    ).toEqual([]);
  });

  it("names a done record that links none of the interface check's runs under its folder", () => {
    const files = [
      "interface/20261031T130840811Z-5e65f4.json",
      "interface/20261031T130247432Z-0558d8.json",
    ];
    expect(recordBreaches({ id: ID, text: done(DESIGN), folder: { files, visuals: 0 } })).toEqual([
      {
        rule: "check-report",
        message: `the done record links 0 of the 2 runs of the interface check under its folder, ${ID}/interface/20261031T130840811Z-5e65f4.json among them: link the runs from the verify section, each by its path or all at once as [interface check](${ID}/interface/)`,
      },
    ]);
    const folderLink = done([...DESIGN, "## verify", "", `[interface check](${ID}/interface/)`]);
    expect(recordBreaches({ id: ID, text: folderLink, folder: { files, visuals: 0 } })).toEqual([]);
    const each = done([...DESIGN, "## verify", "", ...files.map((file) => `[run](${ID}/${file})`)]);
    expect(recordBreaches({ id: ID, text: each, folder: { files, visuals: 0 } })).toEqual([]);
  });

  it("names a components line that runs into prose, and one missing from an interface change's design section", () => {
    const runOn = done([
      "## design",
      "",
      "`design`: components: filters, dropdown, empty state. Work within the lock.",
      "",
    ]);
    expect(recordBreaches({ id: ID, text: runOn })).toEqual([
      {
        rule: "components",
        message:
          'the design section\'s components line names "filters", "empty state. Work within the lock.", which the closed list does not hold: write components: with names from the list alone, comma-separated, such as components: form, table, and put the rest of the section on lines of its own',
      },
    ]);
    const none = done(["## design", "", "The lock read: DESIGN.md, the form reworked.", ""]);
    expect(recordBreaches({ id: ID, text: none })).toEqual([
      {
        rule: "components",
        message:
          "the design section of an interface change names no components line: write components: with the names from the closed list it builds, comma-separated, such as components: form, table",
      },
    ]);
    // A change that touches no interface, or a record not done, owes no line here.
    expect(
      recordBreaches({
        id: ID,
        text: record(regular("done", ["interface: no"]), ["## design", "", "none, no interface"]),
      }),
    ).toEqual([]);
    expect(
      recordBreaches({
        id: ID,
        text: record(regular("open", ['interface: "yes, app"']), [
          "## design",
          "",
          "components: search",
        ]),
      }),
    ).toEqual([]);
    expect(recordBreaches({ id: ID, text: done(DESIGN) })).toEqual([]);
  });
});

const LINEAR_T = join(ROOT, "test", "fixtures", "captures", "records", "j109t-linear");

describe.skipIf(!existsSync(LINEAR_T))(
  "J-173 S1 the record lint over the Linear run's two done records (j109t-linear)",
  () => {
    /** One record's breaches, its folder read as the shell reads it. */
    const linted = (id: string): readonly RecordBreach[] => {
      const folder = join(LINEAR_T, id);
      const links = z
        .object({ visuals: z.array(z.unknown()) })
        .parse(JSON.parse(readFileSync(join(folder, "visuals.json"), "utf8")));
      return recordBreaches({
        id,
        text: readFileSync(join(LINEAR_T, `${id}.txt`), "utf8"),
        definition,
        folder: {
          files: [
            "visuals.json",
            ...readdirSync(join(folder, "interface")).map((file) => `interface/${file}`),
          ],
          visuals: links.visuals.length,
        },
      });
    };

    it("finds the filter search's unlinked visuals, its nine unlinked check runs and its components run into prose", () => {
      expect(linted("2026-10-31-filter-search").map((breach) => breach.rule)).toEqual([
        "visuals",
        "check-report",
        "components",
      ]);
      expect(
        linted("2026-10-31-filter-search").find((breach) => breach.rule === "check-report")
          ?.message,
      ).toMatch(/^the done record links 0 of the 9 runs of the interface check/);
    });

    it("finds the shortcuts' unlinked visuals, its six unlinked check runs and its components run into prose", () => {
      const breaches = linted("2026-10-31-keyboard-shortcuts");
      expect(breaches.map((breach) => breach.rule)).toEqual([
        "visuals",
        "check-report",
        "components",
      ]);
      expect(breaches.find((breach) => breach.rule === "components")?.message).toContain(
        '"card. Follow the existing DESIGN.md direction"',
      );
    });
  },
);

describe.skipIf(!existsSync(LINEAR_T))(
  "J-174 the shortcuts record's skills line beside the loads its agents saw, a hint (j109t-linear, J-176 S1)",
  () => {
    const stated = (): readonly string[] | undefined => {
      const form = parseRecordForm(
        "2026-10-31-keyboard-shortcuts.md",
        readFileSync(join(LINEAR_T, "2026-10-31-keyboard-shortcuts.txt"), "utf8"),
      );
      return form._tag === "ok" ? form.value.skills : undefined;
    };

    it("agrees where only the reviewer's reads reached an agent", () => {
      // The builder's reads went to /dev/null and wrote no fact; the reviewer's two reads did.
      expect(skillsHintNotice(stated(), ["review", "design"])).toBeUndefined();
    });

    it("names a line that drops a skill the hooks saw loaded, or names one they never saw", () => {
      expect(skillsHintNotice(stated(), ["review", "design", "frame"])).toBe(
        "the skills line leaves out frame, which the hooks saw loaded: reconcile it with what the change used, in your own words",
      );
      expect(skillsHintNotice(stated(), ["review"])).toBe(
        "the skills line names design, which the hooks saw no load of: reconcile it with what the change used, in your own words",
      );
    });
  },
);

describe("J-174 the owner's accepted overrun", () => {
  const careful = (more: readonly string[]): readonly string[] => [
    "mode: careful",
    "choice: accepted",
    'why: "the tracker"',
    "state: open",
    ...more,
  ];

  it("reads an overrun line beside a cost past the mode's count, and names one beside a cost within it", () => {
    const over = record(
      careful(["agents: 7", "rounds: 1", 'overrun: "the extra helper is fine"']),
      [],
    );
    expect(
      recordBreaches({ id: ID, text: over, definition }).filter(
        (breach) => breach.rule === "overrun",
      ),
    ).toEqual([]);
    const within = record(
      careful(["agents: 6", "rounds: 1", 'overrun: "the extra helper is fine"']),
      [],
    );
    expect(
      recordBreaches({ id: ID, text: within, definition }).filter(
        (breach) => breach.rule === "overrun",
      ),
    ).toEqual([
      {
        rule: "overrun",
        message:
          "the overrun line accepts a cost of 6 agents and 1 round, within careful's 6 agents and 4 rounds: take the line out, since the owner's words accept nothing here",
      },
    ]);
  });
});

describe("J-192 S1 the record's doors: done over a stand-in, and the agent line's model", () => {
  /** The record j109t-landing-2c committed done, its build, verify and close sections still the stand-in "Pending.". */
  const PENDING = [
    "---",
    "mode: quick",
    "choice: owner",
    'why: "Author search must match the README\'s case-insensitive promise."',
    "floors: none",
    "state: done",
    "next: none",
    "agents: 1",
    "rounds: 0",
    "ground: branch",
    'agent: "codex/gpt-6.1-terra"',
    "skills: [frame, architecture-survey, ponytail, prose, plan, build, tdd, verify, close, pr-writing]",
    'outcome: "Author search matches names without regard to case."',
    "---",
    "",
    "## frame",
    "`frame`: Match author names regardless of case in src/shelf.js as README promises; no open question or floor found.",
    "",
    "## design",
    "none, no interface",
    "",
    "## plan",
    "`plan`: Mixed-case queries and author names return matching books only; the declared npm test check proves it.",
    "",
    "## anticipate",
    "none at quick",
    "",
    "## build",
    "Pending.",
    "",
    "## review",
    "none at quick",
    "",
    "## verify",
    "Pending.",
    "",
    "## close",
    "Pending.",
    "",
  ].join("\n");
  const CASE = "2026-11-07-case-insensitive-author";

  it("refuses done while a section holds the stand-in the agent left for the template's text, naming each section (j109t-landing-2c)", () => {
    const lines = recordBreaches({ id: CASE, text: PENDING, definition }).filter(
      (breach) => breach.rule === "lines",
    );
    expect(lines.map((breach) => breach.message)).toEqual([
      'the build section still holds "Pending.", a stand-in for the template\'s text: write the section in your own words, or the one line its depth gives a step that did not run',
      'the verify section still holds "Pending.", a stand-in for the template\'s text: write the section in your own words, or the one line its depth gives a step that did not run',
      'the close section still holds "Pending.", a stand-in for the template\'s text: write the section in your own words, or the one line its depth gives a step that did not run',
    ]);
    // Each other stand-in reads the same; a section in the agent's words that mentions one is untouched.
    for (const standIn of ["TBD", "TODO.", "_Pending_", "To be written.", "…"])
      expect(
        recordBreaches({
          id: CASE,
          text: PENDING.replace("## close\nPending.", `## close\n${standIn}`),
          definition,
        }).some((breach) =>
          breach.message.startsWith(`the close section still holds "${standIn}"`),
        ),
      ).toBe(true);
    const written = PENDING.replace(
      "## build\nPending.",
      "## build\nThe pending loans stay out of the export; the regression test ran red, then green.",
    )
      .replace("## verify\nPending.", "## verify\nnpm test passed on the final code.")
      .replace("## close\nPending.", "## close\nDone; nothing is left pending.");
    expect(
      recordBreaches({ id: CASE, text: written, definition }).filter(
        (breach) => breach.rule === "lines",
      ),
    ).toEqual([]);
  });

  it("names the stand-in sections in the record lacks line while the change is open", () => {
    const open = PENDING.replace("state: done", "state: open");
    const lack = recordLack(definition, open);
    expect(lack?.sections).toEqual(["build", "verify", "close"]);
  });

  /** j109t-landing-4c's record, its agent line the family the agent wrote. */
  const FAMILY = PENDING.replace('agent: "codex/gpt-6.1-terra"', 'agent: "codex/GPT-6"')
    .replace("## build\nPending.", "## build\nThe test ran red, then green.")
    .replace("## verify\nPending.", "## verify\nnpm test passed.")
    .replace("## close\nPending.", "## close\nDone.");

  it("refuses an agent line naming a model family alone where the harness reports the model, naming it (j109t-landing-4c F2)", () => {
    const reported = { harness: "codex", model: "gpt-6.1-terra" };
    expect(
      recordBreaches({ id: CASE, text: FAMILY, definition, reported }).filter(
        (breach) => breach.rule === "agent",
      ),
    ).toEqual([
      {
        rule: "agent",
        message:
          "the agent line names codex/GPT-6, a model family alone, where the harness reports the model gpt-6.1-terra: write agent: codex/gpt-6.1-terra, the model as the harness states it, which every commit's trailer carries",
      },
    ]);
    // A family the Claude harness reports in full reads the same.
    expect(
      agentFamilyAlone("claude-code/opus", { harness: "claude-code", model: "claude-opus-5-5" }),
    ).toBe("claude-code/claude-opus-5-5");
  });

  it("admits the model the harness reports, a harness that reports none, another harness and a model the session moved off", () => {
    const named = FAMILY.replace('agent: "codex/GPT-6"', 'agent: "codex/gpt-6.1-terra"');
    const lint = (text: string, reported?: { harness: string; model: string }) =>
      recordBreaches({ id: CASE, text, definition, reported }).filter(
        (breach) => breach.rule === "agent",
      );
    expect(lint(named, { harness: "codex", model: "gpt-6.1-terra" })).toEqual([]);
    expect(lint(FAMILY)).toEqual([]);
    expect(lint(FAMILY, { harness: "claude-code", model: "claude-opus-5-5" })).toEqual([]);
    // A model no part of the reported one is the session's earlier model, never a family alone.
    expect(lint(named, { harness: "codex", model: "gpt-6.1-sol" })).toEqual([]);
    // Case and separators aside, the reported model is the model.
    expect(
      agentFamilyAlone("codex/GPT-6.1-Terra", { harness: "codex", model: "gpt-6.1-terra" }),
    ).toBe(undefined);
  });
});

describe("J-199 S1 the done door on a careful interface change: the verifier's report and the check's link together (j196t-roster-use)", () => {
  const RUNS = [
    "interface/20261108T021253195Z-be073e.json",
    "interface/20261108T020911402Z-41c7aa.json",
  ];
  const front = [
    "mode: careful",
    "choice: accepted",
    'why: "the members export"',
    'interface: "yes, app"',
    "state: done",
    "next: none",
    'outcome: "The members list exports as CSV."',
  ];
  const body = (verify: readonly string[]): string =>
    record(front, [
      "## design",
      "",
      "components: button, list",
      "",
      `[The designer](${ID}/design-1.md).`,
      "",
      "## anticipate",
      "",
      `[The anticipator](${ID}/anticipate-1.md).`,
      "",
      "## review",
      "",
      `[One](${ID}/review-1.md) and [two](${ID}/review-2.md).`,
      "",
      "## verify",
      "",
      ...verify,
    ]);
  const lint = (text: string) =>
    formsOf({ id: ID, text, definition, folder: { files: RUNS, visuals: 0 } }).filter(
      (breach) => breach.rule === "reports" || breach.rule === "check-report",
    );

  it("admits the report and the check's runs in one verify section, by the folder's link or each run's", () => {
    expect(
      lint(
        body([
          `\`verify\`: [Independent verification](${ID}/verify-1.md), and [interface check](${ID}/interface/).`,
        ]),
      ),
    ).toEqual([]);
    expect(
      lint(
        body([
          `[Independent verification](${ID}/verify-1.md); the runs ${RUNS.map((run) => `[${run}](${ID}/${run})`).join(" and ")}.`,
        ]),
      ),
    ).toEqual([]);
  });

  it("reads the check's link as the check's evidence, never as a report, naming the two together where either is missing", () => {
    expect(lint(body([`[interface check](${ID}/interface/)`]))).toEqual([
      {
        rule: "reports",
        message: `the independent verify section cites 0 reports, where its depth starts 1: cite each fresh agent's report by its path, ${ID}/verify-<n>.md, beside the link to the interface check's runs`,
      },
    ]);
    expect(lint(body([`[Independent verification](${ID}/verify-1.md).`]))).toEqual([
      {
        rule: "check-report",
        message: `the done record links 0 of the 2 runs of the interface check under its folder, ${ID}/${RUNS[0] ?? ""} among them: link the runs from the verify section beside its fresh agents' reports, each by its path or all at once as [interface check](${ID}/interface/)`,
      },
    ]);
  });

  it("refuses a file no fresh agent wrote as a report in the verify section still, naming the check's link it admits", () => {
    expect(
      lint(
        body([
          `[Independent verification](${ID}/verify-1.md), [interface check](${ID}/interface/) and the [probe](${ID}/verify/csv/probe.mjs).`,
        ]),
      ),
    ).toEqual([
      {
        rule: "reports",
        message: `the verify section cites ${ID}/verify/csv/probe.mjs, not a report named ${ID}/verify-<n>.md: at the independent depth it cites its fresh agents' reports and the interface check's runs alone, and each report cites its own evidence`,
      },
    ]);
  });
});

describe("J-202 S1 the start door: a start section that says none is refused as a placeholder is (j196c-landing-4 note 3)", () => {
  /** The record j196c-landing-4 committed done, its start section the word none where the skeleton leaves the section out. */
  const NONE_START = [
    "---",
    "mode: quick",
    'choice: "owner"',
    'why: "findByAuthor compares names exactly, but the README promises a match whatever the case."',
    "floors: none",
    "state: done",
    'next: "none"',
    'ground: "branch"',
    'agent: "claude-code/claude-sonnet-5-5"',
    "skills: [build, tdd, close, prose, pr-writing]",
    'outcome: "findByAuthor now matches an author whatever the case of the name, as the README says."',
    "---",
    "",
    "## start",
    "",
    "none",
    "",
    "## frame",
    "",
    "The owner asked, naming quick, that `findByAuthor` ignore case as the README says.",
    "",
    "## design",
    "",
    "none, no interface",
    "",
    "## plan",
    "",
    "One test at the `Shelf.findByAuthor` seam, red first, then the fix.",
    "",
    "## anticipate",
    "",
    "none at quick",
    "",
    "## build",
    "",
    "The test went red, then green with the whole suite.",
    "",
    "## review",
    "",
    "none at quick",
    "",
    "## verify",
    "",
    "`npm test` passed 6 of 6 on the final code, recorded by `greenline check`.",
    "",
    "## close",
    "",
    "No ADR or term; the landing offered.",
    "",
  ].join("\n");
  const CASE = "2026-11-08-find-by-author-case";
  const START =
    "the start section says no start ran, and the skeleton leaves the section out: a start section names a start loaded and followed in this change's session, so take the section out where none was";

  it("refuses done while the start section says none, its first sentence saying the skeleton omits the section", () => {
    const lines = recordBreaches({ id: CASE, text: NONE_START, definition }).filter(
      (breach) => breach.rule === "lines",
    );
    expect(lines.map((breach) => breach.message)).toEqual([START]);
    // Its emphasis, its case and a stop read the same.
    for (const none of ["None.", "_none_", "none, no start was loaded"])
      expect(
        recordBreaches({
          id: CASE,
          text: NONE_START.replace("## start\n\nnone", `## start\n\n${none}`),
          definition,
        }).map((breach) => breach.message),
      ).toContain(START);
  });

  it("holds a record with no start section, and one naming the start it loaded", () => {
    for (const text of [
      NONE_START.replace("## start\n\nnone\n\n", ""),
      NONE_START.replace(
        "## start\n\nnone",
        "## start\n\n`groundwork`: laid the empty tree's first files.",
      ),
    ])
      expect(
        recordBreaches({ id: CASE, text, definition }).filter((breach) => breach.rule === "lines"),
      ).toEqual([]);
  });

  it("names the start section in the record lacks line while the change is open", () => {
    const lack = recordLack(definition, NONE_START.replace("state: done", "state: open"));
    expect(lack?.noneStart).toBe(true);
    expect(lack === undefined ? undefined : lackingLine(lack)).toBe(
      "record lacks: the start section saying no start ran, which the skeleton leaves out; write each in your own words for its meaning",
    );
  });
});

/**
 * The run j217t-frame-nodes's frame section (its record
 * 2026-11-10-open-loans-csv, the final snapshot): careful, two questions
 * on two nodes in two rounds, no node closed, a restatement, and the record
 * carried to done in one turn after the second round's answer.
 */
const LOANS_FRAME = [
  "## frame",
  "",
  "Finance needs a CSV of open loans for month-end close, with ISBN, title,",
  "member number and due date, opened in Excel on Windows.",
  "",
  "### Round 1",
  "",
  "- Q1 [surface] How should finance receive the CSV?",
  "  - proposed: a library function the desk app can call",
  "  - answer: delivery is the builder's choice; use a library function",
  "  - decided: owner",
  "- Q2 [data] Which columns should the export contain?",
  "  - proposed: ISBN, title, member number and due date",
  "  - answer: those columns; member number, never a name",
  "  - decided: owner",
  "",
  "### Round 2",
  "",
  "- Q3 [data] Is the existing loan member value always a member number?",
  "  - proposed: yes; export that value as the member number",
  "  - answer: yes, it is always the member number",
  "  - decided: owner",
  "",
  "The export will use UTF-8 with a byte-order mark for Excel. No new storage,",
  "interface, or name lookup is in scope.",
];

/** A frame whole at careful: every subject node asked or closed with a reason, and the restatement. */
const WHOLE_FRAME = [
  "## frame",
  "",
  "Here's what I now think you want: a CSV of the open loans for the month-end close.",
  "Out of scope: names, storage and a screen.",
  "",
  "### Round 1",
  "",
  "- Q1 [purpose] Is the export for the month-end close alone?",
  "  - proposed: yes",
  "  - answer: yes",
  "  - decided: owner",
  "- Q2 [scope] Open loans alone, never the returned ones?",
  "  - proposed: open loans alone",
  "  - answer: open loans alone",
  "  - decided: owner",
  "- Q3 [constraints] Must it stay free of runtime dependencies?",
  "  - proposed: yes",
  "  - answer: yes",
  "  - decided: owner",
  "- closed [adjacent, journey, surface]: a library function beside the shelf, called by the desk app",
  "- closed [data, behaviour]: the loans' existing fields, an empty shelf giving the header alone",
  "- closed [security, performance, operations]: no personal data, a few hundred rows, nothing deployed",
  "- closed [verification]: the shelf's tests cover the export",
];

function carefulFront(state: string, more: readonly string[] = []): readonly string[] {
  return [
    "mode: careful",
    "choice: owner",
    'why: "Give the finance office a CSV of open loans for month-end close."',
    `state: ${state}`,
    ...(state === "done"
      ? [
          "next: none",
          "floors: none",
          'outcome: "The shelf exports open loans as CSV for the desk app."',
          "ground: branch",
          'agent: "codex/gpt-6.1-terra"',
          "skills: [frame, build]",
          "agents: 4",
          "rounds: 1",
          'starts: ["anticipate 1"]',
        ]
      : []),
    ...more,
  ];
}

const careBreaches = (text: string): readonly string[] =>
  recordBreaches({ id: ID, text, definition })
    .filter((breach) => breach.rule === "careful")
    .map((breach) => breach.message);

describe("J-223 S1 the careful frame's nodes and restatement, read by the lint (j217t-frame-nodes)", () => {
  it("names every subject node neither asked nor closed in the run's own frame, ten of the twelve, while the record is open", () => {
    const named = careBreaches(record(carefulFront("open"), LOANS_FRAME));
    expect(named).toEqual([
      "the careful frame leaves 10 of the 12 subject nodes neither asked nor closed, purpose, scope, adjacent, journey, behaviour, security, performance, operations, verification and constraints: ask each in the list form, - Q<n> [<node>] <the question>, or close it with its reason, - closed [<node>]: <why>, one line naming several nodes that share a reason",
    ]);
  });

  it("reads a frame whole when every subject node is asked or closed with a reason and the restatement stands", () => {
    expect(careBreaches(record(carefulFront("open"), WHOLE_FRAME))).toEqual([]);
  });

  it("names a frame with no restatement, the list form alone", () => {
    const listOnly = WHOLE_FRAME.filter((_, at) => at < 2 || at > 4);
    expect(careBreaches(record(carefulFront("open"), listOnly))).toEqual([
      "the careful frame holds no restatement: write what you now understand the owner wants, its out-of-scope list among it, outside the list form, and put it to the owner to confirm",
    ]);
  });

  it("reads the skeleton's placeholder as no restatement and every node uncovered", () => {
    const named = careBreaches(
      record(carefulFront("open"), [
        "## frame",
        "",
        "<the interview's questions in the list form>",
      ]),
    );
    expect(named).toHaveLength(2);
    expect(named[0]).toMatch(/^the careful frame leaves 12 of the 12 subject nodes/);
    expect(named[1]).toMatch(/^the careful frame holds no restatement/);
  });

  it("covers no node by a research topic alone", () => {
    const researched = [
      ...WHOLE_FRAME.filter((line) => !line.startsWith("- closed [verification]")),
      "- R1 [verification] How Excel reads a UTF-8 file",
      "  - source: the vendor's documentation",
      "  - question: does Excel need the byte-order mark?",
      "  - changes: the encoding the export writes",
    ];
    expect(careBreaches(record(carefulFront("open"), researched))).toEqual([
      "the careful frame leaves 1 of the 12 subject nodes neither asked nor closed, verification: ask each in the list form, - Q<n> [<node>] <the question>, or close it with its reason, - closed [<node>]: <why>, one line naming several nodes that share a reason",
    ]);
  });

  it("names status's notice on an open careful record and refuses done on the same breaches", () => {
    const open = record(carefulFront("open"), LOANS_FRAME);
    expect(recordBreaches({ id: ID, text: open, definition }).map((b) => b.rule)).toContain(
      "careful",
    );
    const done = record(carefulFront("done", ['confirmed: "Yes, that is it."']), [
      ...LOANS_FRAME,
      "",
      "## close",
      "",
      "Landed.",
    ]);
    expect(careBreaches(done)).toHaveLength(1);
    expect(careBreaches(done)[0]).toMatch(/^the careful frame leaves 10 of the 12/);
  });

  it("refuses done at careful without the confirmed line, and with its placeholder", () => {
    const body = [...WHOLE_FRAME, "", "## close", "", "Landed."];
    const confirm =
      "the done careful record holds no confirmed line: quote the owner's words that confirmed the frame's restatement, said after it was put to them, in confirmed: \"<their words>\"";
    expect(careBreaches(record(carefulFront("done"), body))).toEqual([confirm]);
    expect(
      careBreaches(
        record(carefulFront("done", ['confirmed: "<the owner\'s words that confirmed it>"']), body),
      ),
    ).toEqual([confirm]);
    expect(
      careBreaches(record(carefulFront("done", ['confirmed: "Yes, that is what I want."']), body)),
    ).toEqual([]);
    // Open, the line is owed only by the doors, never by the lint.
    expect(careBreaches(record(carefulFront("open"), WHOLE_FRAME))).toEqual([]);
  });

  it("reads regular and quick as before: no node, restatement or confirmation is owed there", () => {
    const regularLoans = record(regular("open"), LOANS_FRAME);
    expect(careBreaches(regularLoans)).toEqual([]);
    const quick = record(
      ["mode: quick", "choice: owner", 'why: "the export"', "state: open"],
      ["## frame", "", "A CSV of open loans; no open question."],
    );
    expect(careBreaches(quick)).toEqual([]);
  });

  it("gives the doors the frame's gaps at careful alone, none where it is whole", () => {
    expect(carefulFrameGaps(ID, record(regular("open"), LOANS_FRAME))).toBeUndefined();
    expect(carefulFrameGaps(ID, record(carefulFront("open"), WHOLE_FRAME))).toEqual([]);
    expect(
      carefulFrameGaps(ID, record(carefulFront("open"), LOANS_FRAME))?.map((gap) => gap.rule),
    ).toEqual(["careful"]);
    // An unanswered question is a gap of the frame too.
    const unanswered = [...WHOLE_FRAME, "- Q4 [generic] Anything else?", "  - proposed: no"];
    expect(
      carefulFrameGaps(ID, record(carefulFront("open"), unanswered))?.map((g) => g.rule),
    ).toEqual(["frame"]);
    // C4: a ticket's frame is its planning change's, which the doors read; the ticket owes none of its own.
    expect(
      carefulFrameGaps(
        ID,
        record(carefulFront("open", ["plan: 003-loans", "ticket: T1"]), ["## build", "", "x"]),
      ),
    ).toEqual([]);
    // A careful record with no frame section is not whole.
    expect(carefulFrameGaps(ID, record(carefulFront("open"), ["## plan", "", "x"]))).toEqual([
      {
        rule: "careful",
        message:
          "the careful record holds no frame section: write ## frame with the interview's questions in the list form, the closed nodes with their reasons and the restatement",
      },
    ]);
  });
});

describe("J-223 S1 correction: an unparsed careful record, and a ticket's own record", () => {
  it("C1 reads a careful record that does not parse as a frame not whole, the parser's words carried", () => {
    const unparsed = [
      // why still the skeleton's placeholder
      record(
        [
          "mode: careful",
          "choice: owner",
          'why: "<why the change exists, in one line>"',
          "state: open",
        ],
        WHOLE_FRAME,
      ),
      // confirmed empty
      record(carefulFront("open", ['confirmed: ""']), WHOLE_FRAME),
      // a heading repeated
      record(carefulFront("open"), [...WHOLE_FRAME, "", "## frame", "", "again"]),
    ];
    for (const text of unparsed) {
      const gaps = carefulFrameGaps(ID, text);
      expect(gaps?.map((gap) => gap.rule)).toEqual(["careful"]);
      expect(gaps?.[0]?.message).toMatch(
        /^the careful record does not parse, so its frame cannot be read: .+; correct \.greenline\/ledger\/2026-10-29-overdue-letters\.md$/,
      );
    }
    // A record of another mode that does not parse is no careful record's.
    expect(
      carefulFrameGaps(
        ID,
        record(
          ["mode: regular", "choice: owner", 'why: "<why>"', "state: open"],
          ["## frame", "", "x"],
        ),
      ),
    ).toBeUndefined();
  });

  it("C4 owes a ticket's record no coverage, restatement or confirmed line, and names a confirmed line written there", () => {
    const ticket = (state: string, more: readonly string[] = []) =>
      carefulFront(state, ["plan: 003-loans", "ticket: T1", ...more]);
    const done = record(ticket("done"), ["## build", "", "x", "", "## close", "", "Landed."]);
    expect(careBreaches(done)).toEqual([]);
    expect(careBreaches(record(ticket("open"), LOANS_FRAME))).toEqual([]);
    expect(
      careBreaches(record(ticket("open", ['confirmed: "Yes."']), ["## build", "", "x"])),
    ).toEqual([
      "a ticket's record holds no confirmed line: its frame is its planning change's, so the owner's confirming words stand in the confirmed line of the planning change's record; take the line out here",
    ]);
    // The skeleton's placeholder is no line.
    expect(
      careBreaches(
        record(ticket("open", ['confirmed: "<the owner\'s words>"']), ["## build", "", "x"]),
      ),
    ).toEqual([]);
  });
});
