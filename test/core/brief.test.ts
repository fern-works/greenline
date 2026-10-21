/** The fresh agent's brief written by the command (J-89 S1): its text from a fixture record, its mark, and the reading status gives a brief file. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  briefFileName,
  composeBrief,
  readBrief,
  type BriefRequest,
  type BriefSources,
} from "../../src/core/brief.ts";
import { parseChangeRecord, type ChangeRecord } from "../../src/core/change.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { parseTicketsFile } from "../../src/core/plan-documents.ts";

const modesFile = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
const parsedModes = parseModes(readFileSync(modesFile, "utf8"), modesFile);
if (parsedModes._tag === "err") throw parsedModes.error;
const definition: ModesDefinition = parsedModes.value;

const ID = "2026-10-04-fix";

function recordText(front: readonly string[], body: readonly string[]): string {
  return ["---", ...front, "---", "", ...body, ""].join("\n");
}

const HIGH_FRONT = [
  "mode: careful",
  "choice: accepted",
  'why: "retry the deadline"',
  "state: open",
];
const HIGH_BODY = [
  "## frame",
  "The owner wants the retry to stop at the deadline.",
  "## plan",
  "- The retry stops at the deadline.",
  "- A late reply is dropped.",
  "",
  "Tasks: one.",
  "## anticipate",
  "Nothing hidden.",
  "## build",
  "My diagnosis: the timer was the cause.",
];

function parsed(text: string): ChangeRecord {
  const record = parseChangeRecord(definition, `${ID}.md`, text);
  if (record._tag === "err") throw record.error;
  return record.value;
}

function sources(text: string, overrides: Partial<BriefSources> = {}): BriefSources {
  return {
    definition,
    record: parsed(text),
    recordText: text,
    tickets: undefined,
    skillPages: [".claude/skills/review/references/brief.md"],
    scratch: `/repo/.greenline/tmp/${ID}/review-1`,
    ...overrides,
  };
}

const REVIEW_ONE: BriefRequest = {
  change: ID,
  step: "review",
  round: 1,
  axis: undefined,
  intent: "The retry must stop at the deadline.",
};

function written(request: BriefRequest, from: BriefSources): { file: string; text: string } {
  const brief = composeBrief(request, from);
  if (brief._tag === "refused") throw new Error(brief.message);
  return brief;
}

describe("J-89 S1 the brief the command writes", () => {
  const text = recordText(HIGH_FRONT, HIGH_BODY);

  it("names its file for the step and the number, in the change's folder", () => {
    expect(briefFileName("review", 2)).toBe("brief-review-2.md");
    expect(written(REVIEW_ONE, sources(text)).file).toBe(
      `.greenline/ledger/${ID}/brief-review-1.md`,
    );
  });

  it("opens with the command's mark, naming the exact command, and carries the record's front matter, the plan section whole, the id, the report and the skill", () => {
    const brief = written({ ...REVIEW_ONE, axis: "standards" }, sources(text)).text;
    const [mark] = brief.split("\n");
    expect(mark).toMatch(
      /^<!-- greenline brief --change 2026-10-04-fix --step review --round 1 --axis standards --intent <the paragraph under "Intent"> sha256:[0-9a-f]{64}; /,
    );
    expect(mark).toMatch(/ -->$/);
    for (const line of HIGH_FRONT) expect(brief).toContain(line);
    expect(brief).toContain(
      "- The retry stops at the deadline.\n- A late reply is dropped.\n\nTasks: one.",
    );
    expect(brief).toContain(`\`.greenline/ledger/${ID}/review-1.md\``);
    expect(brief).toContain("`.claude/skills/review/references/brief.md`");
    expect(brief).toContain("The retry must stop at the deadline.");
    expect(brief).toContain("Standards");
  });

  it("carries nothing else of the record: never the builder's other sections or its diagnosis", () => {
    const brief = written(REVIEW_ONE, sources(text)).text;
    expect(brief).not.toContain("My diagnosis");
    expect(brief).not.toContain("Nothing hidden.");
    expect(brief).not.toContain("The owner wants the retry");
  });

  it("takes the frame section where the mode skips the plan", () => {
    const looped = recordText(
      ["mode: careful", "choice: accepted", 'why: "w"', "state: open"],
      ["## frame", "Frame it.", "## plan", "Plan it."],
    );
    expect(written(REVIEW_ONE, sources(looped)).text).toContain("Plan it.");
    // No shipped mode reviews by a fresh agent and skips the plan, so a definition is made that does.
    const skipping: ModesDefinition = {
      ...definition,
      modes: definition.modes.map((mode) =>
        mode.name === "careful"
          ? { ...mode, steps: { ...mode.steps, plan: { depth: "none" } } }
          : mode,
      ),
    };
    const noPlan = recordText(HIGH_FRONT, ["## frame", "The frame's acceptance.", "## build", "x"]);
    const brief = written(REVIEW_ONE, {
      ...sources(noPlan),
      definition: skipping,
      record: (() => {
        const record = parseChangeRecord(skipping, `${ID}.md`, noPlan);
        if (record._tag === "err") throw record.error;
        return record.value;
      })(),
    }).text;
    expect(brief).toContain("The frame's acceptance.");
    expect(brief).toContain("frame section");
  });

  it("takes a ticket's acceptance from its entry in the plan's tickets file", () => {
    const ticketed = recordText(
      [...HIGH_FRONT, "plan: 001-retry", "ticket: T1"],
      ["## frame", "x", "## plan", "The plan of the whole."],
    );
    const tickets = parseTicketsFile(
      definition,
      "tickets.md",
      [
        "---",
        "status: complete",
        "---",
        "",
        "## T1",
        'intent: "stop at the deadline"',
        "scope: [src/]",
        'acceptance: ["the retry stops at the deadline", "a late reply is dropped"]',
        "mode: careful",
        "",
      ].join("\n"),
    );
    if (tickets._tag === "err") throw tickets.error;
    const brief = written(REVIEW_ONE, sources(ticketed, { tickets: tickets.value })).text;
    expect(brief).toContain("- the retry stops at the deadline\n- a late reply is dropped");
    expect(brief).toContain("`.greenline/plans/001-retry/tickets.md`");
    expect(brief).not.toContain("The plan of the whole.");
  });

  it("writes an intent given with carriage returns as plain lines, so the brief it writes reads as written", () => {
    const brief = written(
      { ...REVIEW_ONE, intent: "The retry stops.\r\nA late reply is dropped." },
      sources(text),
    );
    expect(brief.text).not.toContain("\r");
    expect(brief.text).toContain("The retry stops.\nA late reply is dropped.");
    expect(readBrief(ID, "brief-review-1.md", brief.text).kind).toBe("written");
  });

  it("writes the verifier's brief, which adds nothing to the one brief", () => {
    const brief = written(
      { change: ID, step: "verify", round: 1, axis: undefined, intent: undefined },
      sources(text, { skillPages: [".agents/skills/verify/SKILL.md"] }),
    );
    expect(brief.file).toBe(`.greenline/ledger/${ID}/brief-verify-1.md`);
    expect(brief.text.split("\n")[0]).toMatch(
      /^<!-- greenline brief --change 2026-10-04-fix --step verify --round 1 sha256:[0-9a-f]{64}; /,
    );
    expect(brief.text).toContain(`\`.greenline/ledger/${ID}/verify-1.md\``);
    expect(brief.text).toContain("`.agents/skills/verify/SKILL.md`");
    // J-93 S2: verify's mechanics, its recorder and its paths, stand on its references page beside the front.
    expect(brief.text).toContain(
      "Read the verify skill whole, `.agents/skills/verify/SKILL.md`, with its references page, `references/greenline.md` beside it, and verify every item of the acceptance by them.",
    );
    expect(brief.text).toContain("Verify adds nothing to this brief");
  });

  it("names the agent's own scratch folder by its absolute path, the host's temporary directory never used, and the check that sets TMPDIR to it", () => {
    const review = written(REVIEW_ONE, sources(text)).text;
    expect(review).toContain("## Your scratch folder");
    expect(review).toContain(`Your scratch folder is \`/repo/.greenline/tmp/${ID}/review-1\`.`);
    expect(review).toContain(
      `Every file you write on the way that is not your report, a probe, a scratch script or a before-and-after copy, goes in it, or where the skill you work by names under the change's working folder, \`.greenline/tmp/${ID}/\`.`,
    );
    expect(review).toContain(
      "The host's temporary directory is never used, and a working file there is a finding.",
    );
    expect(review).toContain(
      `Run each check of the change's code as \`greenline check --change ${ID} --step review --round 1 -- <command>\`, which sets \`TMPDIR\` to your scratch folder for the command it records.`,
    );
    const looped = recordText(
      ["mode: careful", "choice: accepted", 'why: "w"', "state: open"],
      HIGH_BODY,
    );
    const verify = written(
      { change: ID, step: "verify", round: 1, axis: undefined, intent: undefined },
      sources(looped, { scratch: `/repo/.greenline/tmp/${ID}/verify-1` }),
    ).text;
    expect(verify).toContain(`Your scratch folder is \`/repo/.greenline/tmp/${ID}/verify-1\`.`);
    expect(verify).toContain(
      `\`greenline check --change ${ID} --step verify --round 1 -- <command>\``,
    );
  });

  it("refuses a step that starts no fresh agent at the record's mode, a number past the depth, a review without its intent, and the extras out of place", () => {
    const refusal = (request: BriefRequest, from: BriefSources): string => {
      const brief = composeBrief(request, from);
      if (brief._tag !== "refused") throw new Error("a refusal expected");
      return brief.message;
    };
    const fast = recordText(
      ["mode: quick", "choice: accepted", 'why: "w"', "state: open"],
      ["## frame", "x"],
    );
    expect(refusal(REVIEW_ONE, sources(fast))).toContain("none");
    expect(refusal({ ...REVIEW_ONE, round: 3 }, sources(text))).toContain("2");
    expect(refusal({ ...REVIEW_ONE, intent: undefined }, sources(text))).toContain("--intent");
    expect(
      refusal(
        { change: ID, step: "verify", round: 1, axis: undefined, intent: "x" },
        sources(text),
      ),
    ).toContain("--intent");
    expect(
      refusal(
        { change: ID, step: "verify", round: 1, axis: "spec", intent: undefined },
        sources(text),
      ),
    ).toContain("--axis");
    expect(refusal({ ...REVIEW_ONE, round: 2, axis: "standards" }, sources(text))).toContain(
      "spec",
    );
    const done = recordText(
      ["mode: careful", "choice: accepted", 'why: "w"', "state: done", "agents: 1", "rounds: 0"],
      HIGH_BODY,
    );
    expect(refusal(REVIEW_ONE, sources(done))).toContain("open");
    const unplanned = recordText(HIGH_FRONT, ["## frame", "x"]);
    expect(refusal(REVIEW_ONE, sources(unplanned))).toContain("plan section");
  });

  it("derives the axis from the agent's number where two review one after another", () => {
    expect(written({ ...REVIEW_ONE, round: 2 }, sources(text)).text).toContain("Spec axis");
    expect(written(REVIEW_ONE, sources(text)).text).toContain("Standards axis");
  });
});

describe("J-89 S1 reading a brief file in the change's folder", () => {
  const text = recordText(HIGH_FRONT, HIGH_BODY);
  const brief = written(REVIEW_ONE, sources(text));

  it("reads a brief the command wrote as written, with its step and number", () => {
    expect(readBrief(ID, "brief-review-1.md", brief.text)).toEqual({
      kind: "written",
      step: "review",
      round: 1,
    });
  });

  it("reads a file with no mark on its first line as unmarked", () => {
    expect(readBrief(ID, "brief-review-2.md", "# A brief I wrote\n").kind).toBe("unmarked");
    expect(readBrief(ID, "brief-review-2.md", "").kind).toBe("unmarked");
  });

  it("reads a marked file whose text after the mark changed, or one copied under another name, as altered", () => {
    expect(readBrief(ID, "brief-review-1.md", `${brief.text}one more line\n`).kind).toBe("altered");
    expect(readBrief(ID, "brief-review-2.md", brief.text).kind).toBe("altered");
    expect(readBrief("2026-10-05-other", "brief-review-1.md", brief.text).kind).toBe("altered");
    expect(
      readBrief(ID, "brief-review-1.md", brief.text.replace("review 1", "review 2")).kind,
    ).toBe("altered");
  });

  it("reads a copy whose mark alone was edited to its new name, change or axis as altered, since the digest covers the mark's words", () => {
    const [mark = "", ...rest] = brief.text.split("\n");
    const body = rest.join("\n");
    const renumbered = `${mark.replace("--round 1", "--round 2")}\n${body}`;
    expect(readBrief(ID, "brief-review-2.md", renumbered).kind).toBe("altered");
    const moved = `${mark.replace(ID, "2026-10-05-other")}\n${body}`;
    expect(readBrief("2026-10-05-other", "brief-review-1.md", moved).kind).toBe("altered");
    const axis = `${mark.replace("--round 1", "--round 1 --axis spec")}\n${body}`;
    expect(readBrief(ID, "brief-review-1.md", axis).kind).toBe("altered");
  });

  it("reads a brief whose line endings a checkout turned into carriage returns and newlines as written", () => {
    expect(readBrief(ID, "brief-review-1.md", brief.text.replace(/\n/g, "\r\n")).kind).toBe(
      "written",
    );
  });
});
