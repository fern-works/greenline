/**
 * The progress line (J-107 S3, J-144 S1; the block's reply section, "The
 * progress line"): every step of the change's line named with its state,
 * `✓` written, `▶` in progress, `·` to come and `–` a step its mode does
 * not run, the id without its date first and a tail from a fixed set last.
 * The status mirror prints it at a turn's start from the record's stations,
 * and the inspector's step strip takes its states from the same stations,
 * so the two never disagree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRecordForm, type RecordForm } from "../../src/core/change.ts";
import { driftLine, mirrorText } from "../../src/core/mirror.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import {
  lineStations,
  progressLine,
  progressTail,
  recordPart,
  sectionStateOf,
  shortId,
  waitingOn,
} from "../../src/core/progress.ts";

const ID = "2026-10-25-share-cover";
const SHORT = "share-cover";

function definition(): ModesDefinition {
  const parsed = parseModes(
    readFileSync(join(import.meta.dirname, "../../corpus/runtime/modes.json"), "utf8"),
    "corpus/runtime/modes.json",
  );
  if (parsed._tag === "err") throw new Error("the corpus's modes definition does not parse");
  return parsed.value;
}

/** A record of the mode given whose sections are given in order, each heading with its text. */
function form(
  mode: string,
  sections: readonly (readonly [string, string])[],
  lines: readonly string[] = [],
  state: readonly string[] = ["state: open"],
): RecordForm {
  const text = [
    "---",
    `mode: ${mode}`,
    "choice: accepted",
    'why: "the cover"',
    ...state,
    ...lines,
    "---",
    "",
    ...sections.flatMap(([heading, text]) => [`## ${heading}`, "", text, ""]),
  ].join("\n");
  const parsed = parseRecordForm(`${ID}.md`, text);
  if (parsed._tag === "err") throw new Error(JSON.stringify(parsed.error));
  return parsed.value;
}

/** The progress line of a whole record. */
function lineOf(record: RecordForm): string | undefined {
  return progressLine(ID, lineStations(definition(), record, "whole"), record.position);
}

/** A regular record written through build. */
const THROUGH_BUILD: readonly (readonly [string, string])[] = [
  ["frame", "the intent"],
  ["plan", "the acceptance"],
  ["anticipate", "none at regular"],
  ["build", "the slices"],
  ["review", ""],
  ["verify", ""],
  ["close", ""],
];

describe("J-144 S1 the progress line names every step of the change's line with its state", () => {
  it("marks a written step ✓, the step in progress ▶, a step to come · and a step the mode does not run –", () => {
    expect(lineOf(form("regular", THROUGH_BUILD))).toBe(
      `${SHORT} · frame ✓ plan ✓ anticipate – build ✓ review ▶ verify · close`,
    );
    expect(lineOf(form("quick", []))).toBe(
      `${SHORT} · frame ▶ plan · anticipate – build · review – verify · close`,
    );
    expect(lineOf(form("careful", []))).toBe(
      `${SHORT} · frame ▶ plan · anticipate · build · review · verify · close`,
    );
  });

  it('takes the step in progress from the record\'s "next" line, else the first step it runs whose section is not written', () => {
    // A fix pass sends the work back to build after review's section is written.
    const back = form(
      "regular",
      [
        ["frame", "the intent"],
        ["plan", "the acceptance"],
        ["anticipate", "none at regular"],
        ["build", "the slices"],
        ["review", "two findings"],
      ],
      ['next: "build: fix the two findings"'],
    );
    expect(lineOf(back)).toBe(
      `${SHORT} · frame ✓ plan ✓ anticipate – build ▶ review ✓ verify · close`,
    );
    // A "next" line naming a step the mode does not run leaves the first unwritten step in progress.
    const skipped = form("regular", [["frame", "the intent"]], ['next: "anticipate: read"']);
    expect(lineOf(skipped)).toBe(
      `${SHORT} · frame ✓ plan ▶ anticipate – build · review · verify · close`,
    );
  });

  it("names design only where the record says the change touches an interface, and leaves out the steps another record of a split holds", () => {
    const sections: readonly (readonly [string, string])[] = [
      ["frame", "the intent"],
      ["design", "none, no interface"],
      ["plan", "the acceptance"],
    ];
    expect(lineOf(form("regular", sections, ["interface: no"]))).toBe(
      `${SHORT} · frame ✓ plan ✓ anticipate – build ▶ review · verify · close`,
    );
    expect(lineOf(form("regular", sections, ["interface: yes"]))).toBe(
      `${SHORT} · frame ✓ design ▶ plan ✓ anticipate – build · review · verify · close`,
    );
    const ticket = form(
      "regular",
      [
        ["build", "done"],
        ["review", ""],
        ["verify", ""],
        ["close", ""],
      ],
      ["plan: 001-household", "ticket: T1"],
    );
    expect(recordPart(ticket, true)).toBe("ticket");
    const stations = lineStations(definition(), ticket, "ticket");
    expect(stations.filter((station) => station.state === "elsewhere").map((s) => s.step)).toEqual([
      "frame",
      "design",
      "plan",
      "anticipate",
    ]);
    expect(progressLine(ID, stations, ticket.position)).toBe(
      `${SHORT} · build ✓ review ▶ verify · close`,
    );
  });

  it("reads the record's form, so a heading inside a fenced block is no section", () => {
    const fenced = form("quick", [
      ["frame", "the intent"],
      ["plan", "```text\n## build\nnot a section\n```"],
      ["anticipate", "none at quick"],
      ["build", ""],
    ]);
    expect(lineOf(fenced)).toBe(
      `${SHORT} · frame ✓ plan ✓ anticipate – build ▶ review – verify · close`,
    );
  });

  it("prints the done form once the record is done: the id, done and the steps the mode ran", () => {
    const sections = THROUGH_BUILD.map(([heading, text]): readonly [string, string] => [
      heading,
      text === "" ? "written" : text,
    ]);
    expect(lineOf(form("regular", sections, [], ["state: done"]))).toBe(
      `✓ ${SHORT} done · 6 steps`,
    );
    expect(lineOf(form("quick", sections, [], ["state: done"]))).toBe(`✓ ${SHORT} done · 5 steps`);
  });

  it("ends a stopped change's line with stopped, a red one's with red and a wait on the owner's word with waiting on you, never a sentence", () => {
    const stopped = form(
      "regular",
      [["frame", "the intent"]],
      [],
      ["state: stopped", 'next: "plan: write the acceptance"'],
    );
    expect(lineOf(stopped)).toBe(
      `${SHORT} · frame ✓ plan ▶ anticipate – build · review · verify · close · stopped`,
    );
    expect(progressTail({ state: "open", next: "verify: fix the red test" })).toBe("red");
    expect(progressTail({ state: "open", next: "build: rerun the failing check" })).toBe("red");
    expect(progressTail({ state: "open", next: "frame: wait for the owner's answer" })).toBe(
      "waiting on you",
    );
    expect(progressTail({ state: "open", next: "design: ask the owner to pick" })).toBe(
      "waiting on you",
    );
    expect(progressTail({ state: "open", next: "build: write the owner's page" })).toBeUndefined();
    // A wait on another agent, or a failure the change is about, is no tail.
    expect(
      progressTail({ state: "open", next: "review: wait for the reviewer's report" }),
    ).toBeUndefined();
    expect(
      progressTail({ state: "open", next: "build: fix the case where search fails" }),
    ).toBeUndefined();
    // The tail stands after the separator when the last step carries a mark too.
    const closing = form(
      "quick",
      [
        ["frame", "the intent"],
        ["plan", "the acceptance"],
        ["build", "done"],
        ["verify", "done"],
      ],
      [],
      ["state: stopped", 'next: "close: write the close"'],
    );
    expect(lineOf(closing)).toBe(
      `${SHORT} · frame ✓ plan ✓ anticipate – build ✓ review – verify ✓ close ▶ · stopped`,
    );
    expect(progressTail({ state: "open" })).toBeUndefined();
    expect(progressTail({ state: "done" })).toBeUndefined();
    const waiting = form(
      "regular",
      [["frame", "the intent"]],
      ['next: "plan: wait for the owner\'s yes on the acceptance"'],
    );
    const line = lineOf(waiting) ?? "";
    expect(line).toBe(
      `${SHORT} · frame ✓ plan ▶ anticipate – build · review · verify · close · waiting on you`,
    );
    // No count, no "steps" and no "next" outside the done form.
    expect(line).not.toMatch(/\d|steps|next/);
  });

  it("drops the date from the id, and has no line where the mode runs no step the record holds", () => {
    expect(shortId(ID)).toBe(SHORT);
    expect(shortId("share-cover")).toBe("share-cover");
    expect(
      progressLine(ID, [{ step: "frame", state: "skipped", runs: false, applies: true }]),
    ).toBeUndefined();
    expect(progressLine(ID, [])).toBeUndefined();
  });
});

describe("J-144 S1 the status mirror prints the progress line last of its lines", () => {
  const base = {
    checks: [],
    declared: 0,
    agents: 0,
    git: { state: "off" as const },
  };
  const LINE = `${SHORT} · frame ✓ plan ✓ anticipate – build ▶ review · verify · close`;

  it("prints the line as inline code the agent copies, after every other line", () => {
    const text = mirrorText({
      ...base,
      change: {
        id: ID,
        record: { readable: true, mode: "regular", state: "open", choice: "accepted" },
        progress: LINE,
      },
      ground: "ground: branch greenline/2026-10-25-share-cover; agent: claude-code/opus",
      discussions: "discussions: 1 open (2026-10-21-offline-mode)",
    });
    const lines = text.trimEnd().split("\n");
    expect(lines[0]).toBe(`greenline: change ${ID}, regular, open.`);
    expect(lines.at(-1)).toBe(`progress: \`${LINE}\``);
    expect(lines.filter((line) => line.includes("progress:"))).toHaveLength(1);
  });

  it("prints no progress line when the change has none, and none with no change open", () => {
    const without = mirrorText({
      ...base,
      change: { id: ID, record: { readable: true, mode: "regular", state: "open" } },
    });
    expect(without).not.toContain("progress:");
    expect(mirrorText({ ...base, change: undefined })).not.toContain("progress:");
  });
});

describe("J-110 S3 and S4 the mirror's drift and surface lines", () => {
  const base = { checks: [], declared: 0, agents: 0, git: { state: "off" as const } };

  it("prints the drift line only when something drifts, in the edition's words", () => {
    expect(driftLine(0, 0)).toBeUndefined();
    expect(driftLine(2, 1)).toBe("drift: 2 visuals and 1 atlas page changed since their commits");
    expect(driftLine(1, 0)).toBe("drift: 1 visual changed since its commit");
    const text = mirrorText({ ...base, change: undefined, drift: { visuals: 0, pages: 2 } });
    expect(text).toContain("  drift: 2 atlas pages changed since their commits\n");
    const none = mirrorText({ ...base, change: undefined, drift: { visuals: 0, pages: 0 } });
    expect(none).not.toContain("drift:");
  });

  it("J-147 S1 and S3 prints the atlas and docs lines after the drift, and the visuals reaching outside after the session's", () => {
    const lines = mirrorText({
      ...base,
      change: undefined,
      drift: { visuals: 1, pages: 0 },
      atlas: "atlas: none; the map's first pages not yet offered",
      docs: "docs: 1 page drifting: README.md",
      sessionMade: "visuals the session made itself: a/b",
      reaches: "visuals reaching outside the repository: a/c loads https://cdn.example.com/d3.js",
      renders: "text",
    }).split("\n");
    const at = (start: string): number => lines.findIndex((line) => line.startsWith(`  ${start}`));
    expect(at("drift:")).toBeLessThan(at("atlas:"));
    expect(at("atlas:") + 1).toBe(at("docs:"));
    expect(at("visuals the session")).toBeLessThan(at("visuals reaching"));
    expect(at("visuals reaching")).toBeLessThan(at("surface:"));
    expect(mirrorText({ ...base, change: undefined })).not.toContain("atlas:");
  });

  it("prints the running surface's renders fact before the checks", () => {
    const lines = mirrorText({ ...base, change: undefined, renders: "text" }).split("\n");
    expect(lines).toContain("  surface: renders text");
    expect(lines.indexOf("  surface: renders text")).toBe(1);
  });

  it("J-114 S1 prints the surface's worktree fact, and the ground line under the change's facts or the standing choice", () => {
    const surface = mirrorText({ ...base, change: undefined, renders: "text", worktree: "yes" });
    expect(surface).toContain("  surface: renders text; worktree yes\n");
    // J-117 S2: the questions fact follows, so the interview's channel reads it at every turn.
    const asked = mirrorText({
      ...base,
      change: undefined,
      renders: "text",
      worktree: "yes",
      questions: "cards",
    });
    expect(asked).toContain("  surface: renders text; worktree yes; questions cards\n");
    const replied = mirrorText({ ...base, change: undefined, renders: "text", questions: "reply" });
    expect(replied).toContain("  surface: renders text; questions reply\n");
    const standing = mirrorText({
      ...base,
      change: undefined,
      ground:
        "ground: no change open; the manifest's standing choice is branch, stated at the proposal",
    });
    expect(standing.split("\n")[1]).toBe(
      "  ground: no change open; the manifest's standing choice is branch, stated at the proposal",
    );
    const open = mirrorText({
      ...base,
      change: {
        id: "2026-10-25-a",
        record: { readable: true, mode: "quick", state: "open", choice: "accepted" },
        progress: "a · frame ✓ build ▶",
      },
      facts: [{ fact: "Change", now: "2026-10-25-a" }],
      ground: "ground: branch greenline/2026-10-25-a; agent: claude-code/opus",
    }).split("\n");
    expect(open.slice(1, 5)).toEqual([
      "facts:",
      "| Fact | Now |",
      "| --- | --- |",
      "| Change | 2026-10-25-a |",
    ]);
    expect(open[5]).toBe("  ground: branch greenline/2026-10-25-a; agent: claude-code/opus");
  });

  it("J-114 S2 names the three homes the fence admits before the record is written", () => {
    const text = mirrorText({ ...base, change: { id: "2026-10-25-a", record: undefined } });
    expect(text).toContain(
      "no write outside .greenline/ledger/, .greenline/tmp/2026-10-25-a/ and .greenline/visuals/2026-10-25-a/",
    );
  });
});

describe("J-118 S2 the mirror's discussions line", () => {
  const base = { checks: [], declared: 0, agents: 0, git: { state: "off" as const } };

  it("prints the open and parked discussions under the change's lines, with or without a change, before the drift", () => {
    const line = "discussions: 1 open (2026-10-21-offline-mode), 1 parked";
    const none = mirrorText({
      ...base,
      change: undefined,
      discussions: line,
      drift: { visuals: 1, pages: 0 },
    });
    const lines = none.split("\n");
    expect(lines[1]).toBe(`  ${line}`);
    expect(lines[2]).toBe("  drift: 1 visual changed since its commit");
    const held = mirrorText({
      ...base,
      change: {
        id: ID,
        record: { readable: true, mode: "regular", state: "open", choice: "accepted" },
      },
      discussions: line,
    });
    expect(held).toContain(`  ${line}\n`);
    expect(mirrorText({ ...base, change: undefined })).not.toContain("discussions:");
  });
});

describe("J-176 S1 a section the skeleton left at its placeholder", () => {
  it("reads as empty, so no step counts written before the agent writes it", () => {
    expect(sectionStateOf("<what frame found, in your own words>")).toBe("empty");
    expect(sectionStateOf("\n<one line>\n\n<another>\n")).toBe("empty");
    expect(sectionStateOf("The retry loses the deadline.")).toBe("written");
    expect(sectionStateOf("none at quick")).toBe("skipped");
    expect(sectionStateOf(undefined)).toBe("missing");
  });
});

describe("J-222 S1 the progress tail and the wait read every form of the wait on the owner (j217c-states-stop)", () => {
  /** The Claude run's next line at the stop commit 83caaba. */
  const CLAUDE =
    "build: wait on the owner's review of the five red tests (test/shelf.test.js, kept as 2026-11-10-find-by-year/shown.patch), then write findByYear in src/shelf.js";
  const FORMS = [
    "build: wait for the owner's review of the tests, then implement",
    "build: wait until the owner reviews the tests, then implement",
    "build: waiting on the owner's answer on the name; then rename it",
    "build: wait on your review of the tests, then implement",
    "build: show the tests and take the owner's review, then implement",
    "build: the owner's answer on the column name, then rename it",
    "build: once the owner reviews the shown tests, write findByYear",
    "build: ask the owner to review the tests, then implement",
  ];
  const action = (next: string) => next.replace(/^build: /, "");

  it("names each form waiting on you on an open record, and the wait's action on an open or stopped one", () => {
    for (const next of [CLAUDE, ...FORMS]) {
      // The Claude run's line names red tests, and the red tail comes first on an open record.
      if (next !== CLAUDE)
        expect(progressTail({ state: "open", next }), next).toBe("waiting on you");
      expect(waitingOn({ state: "open", next }), next).toBe(action(next));
      expect(waitingOn({ state: "stopped", next }), next).toBe(action(next));
    }
  });

  it("reads a review of shown tests as a wait while the record is stopped alone", () => {
    const next = "build: show the five tests for review again, then write findByYear";
    expect(waitingOn({ state: "stopped", next })).toBe(action(next));
    expect(waitingOn({ state: "open", next })).toBeUndefined();
    expect(progressTail({ state: "open", next })).toBeUndefined();
  });

  it("keeps what reads as a wait today, the stopped and red tails first, and a wait for the resume as it read", () => {
    for (const next of [
      "review: wait for the owner to resume independent review",
      "frame: ask the owner which name to use",
      "plan: the owner's pick of the three directions",
    ]) {
      expect(progressTail({ state: "open", next }), next).toBe("waiting on you");
      expect(waitingOn({ state: "stopped", next }), next).toBe(next.replace(/^[a-z]+: /, ""));
    }
    expect(progressTail({ state: "stopped", next: CLAUDE })).toBe("stopped");
    expect(progressTail({ state: "open", next: CLAUDE.replace("five red", "five") })).toBe(
      "waiting on you",
    );
    expect(progressTail({ state: "open", next: CLAUDE })).toBe("red");
    for (const next of ["build: implement findByYear", "build: tell the owner the tests pass"]) {
      expect(progressTail({ state: "open", next }), next).toBeUndefined();
      expect(waitingOn({ state: "open", next }), next).toBeUndefined();
    }
  });
});
