import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mismatches,
  parseChangeRecord,
  renderRecordSkeleton,
  type RecordContext,
} from "../../src/core/change.ts";
import { situationLine, type FileClass } from "../../src/core/habits-owed.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { recordBreaches } from "../../src/core/record-lint.ts";
import { lackingLine, owedLines, recordLack } from "../../src/core/record-lines.ts";

/**
 * One record form for every reader (J-226 S1): `greenline status`, through
 * the record's mismatches and the record lint, and git's pre-commit, through
 * the record lint, read one record the same way, so a close one admits the
 * other admits too. Each case is a run's own record of the final series.
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
const plain: RecordContext = { ticketsFile: "absent" };

/** The marks line `greenline status` printed in j217c-conduct-interface at 001/006. */
const MARKS = "marks: 3 open on /members; 1 stale since its capture (meb842cf)";

/** The close's words of that record, the marks aside, as the agent wrote them at 001/006. */
const CLOSE_WORDS =
  "No ADR and no term (the one lasting choice, names matched whatever the runs of spaces inside them, is a reversible behaviour already updated in `.greenline/DECISIONS.md` under `## Members search`, and there is no glossary); nothing to land: the commits are on main; audited: each claim maps to a commit or a recorded check, `frame`, `plan`, `build`, `verify` and `close` were read earlier this session for the first change and not loaded again here, and the owner's pause after the build was lifted by their word to finish and close; not probed: real page or club data; not mine: the open marks and stale capture on `/members`, the declined button change and `feature/welcome-list`";

const QUICK_ID = "2026-11-09-members-search-name-spaces";

/**
 * The quick record of j217c-conduct-interface at 001/006 (the snapshot
 * `quick-close-refused`, the record at 7fe1e35), carried to done with the
 * outcome its close wrote, its close section given.
 */
function quickRecord(close: readonly string[]): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'yes: "Yes, go ahead, and pause after the build."',
    'why: "The members search should find a name whatever the spaces inside it, such as Ada  Lovelace with two spaces, which today it misses unless typed exactly."',
    "floors: []",
    "state: done",
    "next: none",
    "ground: branch",
    'agent: "claude-code/claude-sonnet-5-5"',
    'interface: "no"',
    "skills: [frame, plan, build, tdd, verify, close, pr-writing]",
    'outcome: "The members search now ignores extra spaces inside a name, in the stored name and in the search, with a test that fails without it."',
    "---",
    "",
    "## frame",
    "",
    "The owner accepted quick on `main` and asked to pause after the build; a run of spaces inside a name counts as one space, in the search and in the stored name.",
    "",
    "## design",
    "",
    "none, no interface",
    "",
    "## plan",
    "",
    'Acceptance: `findMembers(members, "ada lovelace")` finds "Ada  Lovelace", and every existing search in `test/members.test.js` still passes.',
    "",
    "## anticipate",
    "",
    "none at quick",
    "",
    "## build",
    "",
    "Followed `tdd`: the new test ran red, then green after `findMembers` made each run of spaces one space.",
    "",
    "## review",
    "",
    "none at quick",
    "",
    "## verify",
    "",
    "VERIFIED: the same test is red on the code before the fix and green on the final code, `npm test` 5 of 5.",
    "",
    "## close",
    "",
    ...close,
    "",
  ].join("\n");
}

/** What status names of a record's form: its mismatches with its mode. */
function statusMismatches(text: string): readonly string[] {
  const parsed = parseChangeRecord(definition, `${QUICK_ID}.md`, text);
  if (parsed._tag === "err") throw parsed.error;
  return mismatches(definition, parsed.value, plain).map((mismatch) => mismatch.kind);
}

/** What the record lint, which both status and git's pre-commit run, finds, the marks read from the line status prints. */
function lintMessages(text: string, marks: string | undefined = MARKS): readonly string[] {
  return recordBreaches({ id: QUICK_ID, text, definition, marks: { line: marks } }).map(
    (breach) => `${breach.rule}: ${breach.message}`,
  );
}

describe("J-226 S1 the marks line in a quick close, read by status and the pre-commit alike (j217c-conduct-interface finding 1)", () => {
  it("admits the marks on a line of their own beside the one line, which status named as more than one line", () => {
    const text = quickRecord([MARKS, CLOSE_WORDS]);
    expect(statusMismatches(text)).toEqual([]);
    expect(lintMessages(text)).toEqual([]);
  });

  it("admits the marks as the one line's last clause, which the pre-commit found no marks line in", () => {
    const text = quickRecord([`${CLOSE_WORDS}; ${MARKS}`]);
    expect(statusMismatches(text)).toEqual([]);
    expect(lintMessages(text)).toEqual([]);
  });

  it("still names a quick close of two lines neither of which is the marks line", () => {
    const text = quickRecord(["No ADR and no term.", "Nothing to land: the commits are on main."]);
    expect(statusMismatches(text)).toEqual(["inline-over-one-line"]);
  });

  it("still refuses a marks clause that disagrees with the marks files, the clause read to its line's end", () => {
    const stale = "marks: 2 open on /members";
    expect(lintMessages(quickRecord([`${CLOSE_WORDS}; ${stale}`]))).toEqual([
      `marks: the close section's marks line says "${stale}", and the marks files say "${MARKS}": copy the marks line greenline status prints as it stands, never from memory`,
    ]);
    // A clause that opens the line runs to its end, so the words after it are no part of the marks line.
    expect(lintMessages(quickRecord([`${MARKS}; ${CLOSE_WORDS}`]))).toEqual([
      `marks: the close section's marks line says "${MARKS}; ${CLOSE_WORDS}", and the marks files say "${MARKS}": copy the marks line greenline status prints as it stands, never from memory`,
    ]);
    // A close that names the open marks in prose alone holds no marks line.
    expect(lintMessages(quickRecord([CLOSE_WORDS]))).toEqual([
      `marks: the close section names no marks line while the marks files hold open marks: copy the line greenline status prints, "${MARKS}"`,
    ]);
  });
});

/**
 * A done regular record of j217t-roster-use (2026-11-10-theme-settings, as
 * the run committed it at done), its start section given.
 */
function themeRecord(start: readonly string[], state = "done"): string {
  return [
    "---",
    "mode: regular",
    "choice: owner",
    "proposed: careful",
    'why: "Let staff choose a theme and keep it across visits."',
    "floors: []",
    `state: ${state}`,
    `next: ${state === "done" ? "none" : '"build: write the theme store"'}`,
    "ground: branch",
    'agent: "codex/gpt-6.1-terra"',
    "skills: [frame, plan, build, review, verify, close]",
    "agents: 2",
    "rounds: 1",
    'starts: ["review 1"]',
    'outcome: "Settings offers System, Light and Dark themes and remembers the device\'s choice."',
    "---",
    "",
    ...(start.length === 0 ? [] : ["## start", "", ...start, ""]),
    "## frame",
    "",
    "`frame`: Add settings with System, Light and Dark choices, default to System, and remember the choice on this device.",
    "",
    "## design",
    "",
    "none, no interface",
    "",
    "## plan",
    "",
    "One store, its test first.",
    "",
    "## anticipate",
    "",
    "none at regular",
    "",
    "## build",
    "",
    "The test went red, then green.",
    "",
    "## review",
    "",
    "[Review](2026-11-10-theme-settings/review-1.md): one finding, fixed.",
    "",
    "## verify",
    "",
    "`npm test` passed 6 of 6 on the final code.",
    "",
    "## close",
    "",
    "No ADR or term; the landing offered.",
    "",
  ].join("\n");
}

const THEME_ID = "2026-11-10-theme-settings";
const START_REFUSED =
  "the start section says no start ran, and the skeleton leaves the section out: a start section names a start loaded and followed in this change's session, so take the section out where none was";

describe("J-226 S1 the start section's forms, one list both readers take (j217t-roster-use finding 4)", () => {
  const lines = (text: string): readonly string[] =>
    recordBreaches({ id: THEME_ID, text, definition })
      .filter((breach) => breach.rule === "lines")
      .map((breach) => breach.message);

  it("refuses done over the run's start section, and names it in the record lacks line while open", () => {
    expect(lines(themeRecord(["No start skill applied."]))).toEqual([START_REFUSED]);
    const lack = recordLack(definition, themeRecord(["No start skill applied."], "open"));
    expect(lack?.noneStart).toBe(true);
    expect(lack === undefined ? undefined : lackingLine(lack)).toBe(
      "record lacks: the start section saying no start ran, which the skeleton leaves out; write each in your own words for its meaning",
    );
  });

  it("reads each listed form as none is read, at the line's first words, its emphasis and its case aside", () => {
    for (const form of [
      "none",
      "None.",
      "No start skill applied.",
      "_no start was loaded_",
      "Not applicable.",
      "N/A",
      "n/a: no start ran",
    ])
      expect(lines(themeRecord([form])), form).toEqual([START_REFUSED]);
  });

  it("holds a section naming a start loaded and followed, no section at all, and a first line outside the list", () => {
    for (const start of [
      [],
      ["`groundwork`: laid the empty tree's first files."],
      ["Loaded no other skill; `groundwork` laid the tree."],
      ["Nothing started here beyond the frame."],
      ["Nonetheless `groundwork` ran first."],
    ])
      expect(lines(themeRecord(start)), start.join("")).toEqual([]);
  });
});

/** The skeleton `greenline open` writes for each mode, and the lines a record owes from the open. */
describe("J-226 S1 the floors line owed from the open (j217t-conduct-runner 6, j217t-discussions 5, j217t-ground 3, j217t-roster-use 10)", () => {
  const FLOORS_DONE =
    "the done record lacks its floors line: write floors: none, or the floors you found as a list, as [security]; a record opened before this version adds the line by hand";

  it("writes the floors placeholder after why in every mode's skeleton, and names it among the lines owed now", () => {
    for (const mode of definition.modes) {
      const skeleton = renderRecordSkeleton(definition, mode, "named");
      const lines = skeleton.split("\n");
      const why = lines.findIndex((line) => line.startsWith("why: "));
      expect(lines[why + 1], mode.name).toBe(
        'floors: "<each floor you found, as [security], or none>"',
      );
      expect(owedLines(definition, mode, undefined).open, mode.name).toEqual([
        "choice",
        "why",
        "floors",
        "ground",
        "agent",
      ]);
      // The placeholder reads as not stated.
      expect(recordLack(definition, skeleton)?.open, mode.name).toContain("floors");
    }
  });

  it("reads a list, an empty list and none each as an answer, none as the empty list", () => {
    for (const [line, floors] of [
      ["floors: none", []],
      ["floors: []", []],
      ["floors: [security]", ["security"]],
    ] as const) {
      const text = themeRecord([]).replace("floors: []", line);
      const parsed = parseChangeRecord(definition, `${THEME_ID}.md`, text);
      expect(parsed._tag === "ok" ? parsed.value.floors : parsed.error, line).toEqual(floors);
      expect(recordLack(definition, text)?.open, line).toEqual([]);
    }
    // A name outside the definition's floors is refused as before.
    const refused = parseChangeRecord(
      definition,
      `${THEME_ID}.md`,
      themeRecord([]).replace("floors: []", "floors: [speed]"),
    );
    expect(refused._tag).toBe("err");
  });

  it("refuses done without the line in quick, regular and careful, in the words the record lacks line uses", () => {
    const withoutFloors = (text: string): string => text.replace("floors: []\n", "");
    const quick = withoutFloors(quickRecord([MARKS, CLOSE_WORDS]));
    const regular = withoutFloors(themeRecord([]));
    const careful = regular
      .replace("mode: regular", "mode: careful")
      .replace("proposed: careful\n", "proposed: regular\n");
    for (const [mode, text] of [
      ["quick", quick],
      ["regular", regular],
      ["careful", careful],
    ] as const) {
      const messages = recordBreaches({ id: QUICK_ID, text, definition }).map(
        (breach) => breach.message,
      );
      expect(messages, mode).toContain(FLOORS_DONE);
      expect(
        recordBreaches({
          id: QUICK_ID,
          text: text.replace("state: done", "state: done\nfloors: none"),
          definition,
        }).map((breach) => breach.message),
        mode,
      ).not.toContain(FLOORS_DONE);
    }
    // While open, the record lacks line names it with the same cure.
    const lack = recordLack(definition, regular.replace("state: done", "state: open"));
    expect(lack === undefined ? undefined : lackingLine(lack)).toBe(
      "record lacks: floors now; write each in your own words for its meaning; for floors, write floors: none, or the floors you found as a list, as [security]; the record has no line at all for floors, the form of a record written before this version: the owner's two ways are to complete it as ordinary work, or to close the change and open it again",
    );
  });
});

describe("J-226 S1 a floor the hooks saw that the record's line does not hold is printed, never refused", () => {
  const facts = (seen: readonly FileClass[], recorded: readonly string[] | undefined): string =>
    situationLine({
      named: "regular",
      proceed: "none",
      seen: new Set(seen),
      interface: { roots: false, stated: undefined },
      heard: true,
      recorded,
    });

  it("names a contract file's floor the line leaves out, with its cure", () => {
    expect(facts(["contract"], [])).toBe(
      "situation: mode regular; proceed none; floors seen: public-contract (a contract file); the record's floors line lacks public-contract: add it there where you judge it a floor; interface: no interface roots",
    );
  });

  it("prints the line as before where the record holds the floor, and where no change is acting", () => {
    const before =
      "situation: mode regular; proceed none; floors seen: public-contract (a contract file); interface: no interface roots";
    expect(facts(["contract"], ["public-contract"])).toBe(before);
    expect(facts(["contract"], undefined)).toBe(before);
    // A floor no file class shows, only the request's words, prints nothing: no reader scans prose.
    expect(facts([], [])).toBe(
      "situation: mode regular; proceed none; floors seen: none; interface: no interface roots",
    );
  });
});
