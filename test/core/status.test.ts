import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessChanges,
  changesReport,
  codeQuestions,
  diffKey,
  renderChangesText,
  sinceKey,
  type ChangeOnDisk,
  type CommitsSince,
  type ChangesInput,
  type ChangesOutcome,
  type ChangesReport,
  type ChangesRequest,
  type CodeAnswers,
  type CodeQuestions,
  type PlanOnDisk,
} from "../../src/core/status.ts";
import { ok } from "../../src/commons/result.ts";
import { parseChangeRecord } from "../../src/core/change.ts";
import type { GitHistory, LoggedCommit, PathStatus } from "../../src/core/change-history.ts";
import type { GuidanceRequest } from "../../src/core/guidance-receipts.ts";
import { contractFailure } from "../../src/core/contract.ts";
import type { CheckFacts, HookRun } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { parseTicketsFile } from "../../src/core/plan-documents.ts";
import { composeBrief } from "../../src/core/brief.ts";

// ---- The changes view (S6) ----

const modesFile = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
const modesJson: string = readFileSync(modesFile, "utf8");

function modesFrom(text: string): ModesDefinition {
  const parsed = parseModes(text, modesFile);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const definition = modesFrom(modesJson);
const REVISION = "a".repeat(64);
const MOVED_ON = "b".repeat(64);
const hash = (digit: string): string => digit.repeat(40);
const QUICK_BODY = [
  "## frame",
  "A typo.",
  "## plan",
  "The line reads as the README shows it.",
  "## anticipate",
  "none at quick",
  "## build",
  "Fixed it.",
  "## review",
  "none at quick",
  "## verify",
  "Ran it.",
  "## close",
  "Nothing to carry.",
];
const quickDone = ["mode: quick", "choice: accepted", 'why: "a typo"', "state: done"];
const quickOpen = ["mode: quick", "choice: accepted", 'why: "a typo"', "state: open"];

function recordText(front: readonly string[], body: readonly string[]): string {
  return ["---", ...front, "---", "", ...body].join("\n");
}

function change(
  id: string,
  front: readonly string[],
  body: readonly string[] = [],
  onDisk: ChangeOnDisk["folder"] = undefined,
  modes: ModesDefinition = definition,
): ChangeOnDisk {
  const text = recordText(front, body);
  return { id, text, record: parseChangeRecord(modes, `${id}.md`, text), folder: onDisk };
}

interface RunFacts {
  readonly code?: number;
  readonly state?: "started" | "finished";
  readonly signal?: string;
  readonly installation?: string;
  readonly tree?: string | null;
  readonly commit?: string | null;
  readonly startedAt?: string;
  readonly durationMs?: number;
}

function run(argumentsGiven: readonly string[], facts: RunFacts = {}): CheckFacts {
  const start = {
    schemaVersion: 1 as const,
    arguments: argumentsGiven,
    startedAt: facts.startedAt ?? "2026-10-04T12:00:00.000Z",
    commit: facts.commit === undefined ? hash("c") : facts.commit,
    tree: facts.tree === undefined ? hash("e") : facts.tree,
    installation: facts.installation ?? REVISION,
  };
  if (facts.state === "started") return { ...start, state: "started" };
  return {
    ...start,
    state: "finished",
    outcome:
      facts.signal === undefined
        ? { kind: "exited", code: facts.code ?? 0 }
        : { kind: "signalled", signal: facts.signal },
    durationMs: facts.durationMs ?? 5,
  };
}

function folder(
  runs: readonly CheckFacts[],
  reports: readonly string[] = [],
  briefs: readonly { readonly file: string; readonly text: string | undefined }[] = [],
): ChangeOnDisk["folder"] {
  return ok({
    reports,
    briefs,
    hookRuns: [],
    checks: runs.map((facts, index) => ({ file: `checks/${index}.json`, parsed: ok(facts) })),
  });
}

function changesInput(
  changes: readonly ChangeOnDisk[],
  more: Partial<ChangesInput> = {},
): ChangesInput {
  return {
    definition,
    revision: REVISION,
    disk: { changes, plans: [], working: [] },
    proceed: undefined,
    history: changes.length === 0 ? undefined : { kind: "read", head: undefined, commits: [] },
    installed: new Set(),
    decisions: undefined,
    consultations: [],
    unreadableReceipts: [],
    checks: [],
    agentsCounted: new Map(),
    ...more,
  };
}

/** git's answers, from the trees and diffs a test names; anything else unknown. */
function gitAnswers(
  trees: Readonly<Record<string, string>> = {},
  working: string | undefined = undefined,
  diffs: Readonly<Record<string, readonly string[]>> = {},
  since: Readonly<Record<string, CommitsSince>> = {},
): (questions: CodeQuestions) => CodeAnswers {
  return (questions) => ({
    since: new Map(
      questions.since.map((from) => [
        sinceKey(from),
        since[sinceKey(from)] ?? { kind: "unknown", reason: "not in the test" },
      ]),
    ),
    commitTrees: new Map(
      questions.commitTrees.map((commit) => {
        const tree = trees[commit];
        return [
          commit,
          tree === undefined
            ? { kind: "unknown", reason: "not in the test" }
            : { kind: "tree", id: tree },
        ];
      }),
    ),
    workingTree: !questions.workingTree
      ? undefined
      : working === undefined
        ? { kind: "unknown", reason: "not in the test" }
        : { kind: "tree", id: working },
    diffs: new Map(
      questions.diffs.map((diff) => {
        const key = diffKey(diff.from, diff.to);
        const files = diffs[key];
        return [
          key,
          files === undefined
            ? { kind: "unknown", reason: "not in the test" }
            : { kind: "files", files },
        ];
      }),
    ),
  });
}

const LIST: ChangesRequest = { view: "list", all: false };

function derive(
  input: ChangesInput,
  request: ChangesRequest = LIST,
  answers: (questions: CodeQuestions) => CodeAnswers = gitAnswers(),
): ChangesOutcome {
  const assessment = assessChanges(input, request);
  return changesReport(assessment, answers(codeQuestions(assessment)));
}

const findingKinds = (outcome: ChangesOutcome): readonly string[] =>
  outcome.findings.map((note) => note.kind);
const noticeKinds = (outcome: ChangesOutcome): readonly string[] =>
  outcome.notices.map((note) => note.kind);

function listed(outcome: ChangesOutcome): Extract<ChangesReport, { view: "list" }> {
  if (outcome.report.view !== "list") throw new Error(`the view is ${outcome.report.view}`);
  return outcome.report;
}

function logged(
  id: string,
  parents: readonly string[],
  paths: readonly (readonly [PathStatus, string])[],
  changes: readonly string[] = [],
): LoggedCommit {
  return { hash: id, parents, changes, paths: paths.map(([status, path]) => ({ status, path })) };
}

const ledger = (id: string): string => `.greenline/ledger/${id}.md`;
const passed = folder([run(["pnpm", "test"])]);

describe("the changes view: what it reads", () => {
  it("S6 a repository with no change records reports none and no finding", () => {
    const outcome = derive(changesInput([]));
    expect(outcome.findings).toEqual([]);
    expect(outcome.notices).toEqual([]);
    expect(listed(outcome)).toMatchObject({
      current: [],
      finished: [],
      unclaimed: { kind: "not-read" },
    });
    expect(renderChangesText(outcome.report)).toBe("changes: none recorded\n");
  });

  it("S20 each garden receipt collection that cannot be read is one finding of its own, with a remedy, and hides nothing else", () => {
    const outcome = derive(
      changesInput([change("2026-10-04-a", quickOpen)], {
        unreadableReceipts: [
          { path: ".greenline/ledger/receipts/1.json", issues: "request evidence" },
          { path: ".greenline/ledger/receipts/2.json", issues: "request evidence" },
        ],
      }),
    );
    expect(outcome.findings.map((note) => [note.kind, note.path])).toEqual([
      ["unparsed", ".greenline/ledger/receipts/1.json"],
      ["unparsed", ".greenline/ledger/receipts/2.json"],
    ]);
    expect(outcome.findings[0]?.message).toContain("cannot be read: request evidence");
    expect(outcome.findings[0]?.message).toContain("remove it");
    expect(listed(outcome).current.map((entry) => entry.id)).toEqual(["2026-10-04-a"]);
    const resume = derive(
      changesInput([change("2026-10-04-a", quickOpen)], {
        unreadableReceipts: [{ path: ".greenline/ledger/receipts/1.json", issues: "x" }],
      }),
      { view: "resume", change: "2026-10-04-a" },
    );
    expect(resume.findings).toEqual([]);
  });

  it("S6 a record that fails to parse is one finding and hides no other change", () => {
    const outcome = derive(
      changesInput([
        {
          id: "2026-10-04-broken",
          text: "no front matter\n",
          record: parseChangeRecord(definition, "2026-10-04-broken.md", "no front matter\n"),
          folder: undefined,
        },
        change("2026-10-04-open", quickOpen),
        change("2026-10-04-done", quickDone, QUICK_BODY, passed),
      ]),
    );
    expect(findingKinds(outcome)).toEqual(["unparsed"]);
    expect(outcome.findings[0]).toMatchObject({ path: ".greenline/ledger/2026-10-04-broken.md" });
    expect(listed(outcome).current.map((view) => [view.id, view.reading])).toEqual([
      ["2026-10-04-broken", "unparsed"],
      ["2026-10-04-open", "judged"],
    ]);
    expect(listed(outcome).finished.map((view) => view.id)).toEqual(["2026-10-04-done"]);
  });

  it("S6 an open record naming a mode the definition does not hold is a finding", () => {
    expect(
      findingKinds(
        derive(changesInput([change("2026-10-04-a", ["mode: turbo", ...quickOpen.slice(1)])])),
      ),
    ).toEqual(["unparsed"]);
    expect(findingKinds(derive(changesInput([change("2026-10-04-a", quickOpen)])))).toEqual([]);
  });

  it("S6 check facts that do not parse, a folder that cannot be read and a plan file that does not parse are findings", () => {
    const bad = ok({
      reports: [],
      briefs: [],
      hookRuns: [],
      checks: [
        {
          file: "checks/x.json",
          parsed: contractFailure("checks/x.json", [
            { path: "", message: "check facts are not valid JSON" },
          ]),
        },
      ],
    });
    const unreadable = contractFailure(".greenline/ledger/2026-10-04-b", [
      { path: "", message: "unreadable: EACCES" },
    ]);
    const outcome = derive({
      ...changesInput([
        change("2026-10-04-a", quickOpen, [], bad),
        change("2026-10-04-b", quickOpen, [], unreadable),
      ]),
      disk: {
        changes: [
          change("2026-10-04-a", quickOpen, [], bad),
          change("2026-10-04-b", quickOpen, [], unreadable),
        ],
        plans: [
          {
            name: "001-a",
            contents: ok({
              tickets: undefined,
              documents: [
                {
                  file: "spec.md",
                  parsed: contractFailure("spec.md", [{ path: "status", message: "Required" }]),
                },
              ],
            }),
          },
          {
            name: "002-b",
            contents: contractFailure(".greenline/plans/002-b", [
              { path: "", message: "unreadable: EACCES" },
            ]),
          },
        ],
        working: [],
      },
    });
    expect(outcome.findings.map((note) => [note.kind, note.path])).toEqual([
      ["unparsed", ".greenline/ledger/2026-10-04-a/checks/x.json"],
      ["unparsed", ".greenline/ledger/2026-10-04-b"],
      ["unparsed", ".greenline/plans/001-a/spec.md"],
      ["unparsed", ".greenline/plans/002-b"],
    ]);
  });
});

describe("the changes view: findings", () => {
  it("S6 an open or stopped record that does not match its mode is a finding, and one that matches is not", () => {
    const extra = derive(
      changesInput([change("2026-10-04-a", quickOpen, ["## review", "A review."])]),
    );
    expect(findingKinds(extra)).toEqual(["mismatch"]);
    expect(extra.findings[0]?.message).toContain(
      "does not match what its mode asks of this record",
    );
    const stopped = [
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: stopped",
      'next: "build: go on"',
    ];
    expect(
      findingKinds(derive(changesInput([change("2026-10-04-a", stopped, ["## review", "x"])]))),
    ).toEqual(["mismatch"]);
    expect(
      findingKinds(derive(changesInput([change("2026-10-04-a", quickOpen, ["## build", "x"])]))),
    ).toEqual([]);
  });

  it("S6 a section's remedy follows its cause, and only the mode's cause offers raising the mode", () => {
    const tickets = (name: string): PlanOnDisk => ({
      name,
      contents: ok({
        tickets: {
          file: "tickets.md",
          parsed: parseTicketsFile(definition, "tickets.md", ticketsText(["T1"])),
        },
        documents: [],
      }),
    });
    const message = (entry: ChangeOnDisk): string => {
      const outcome = derive({
        ...changesInput([entry]),
        disk: { changes: [entry], plans: [tickets("001-a")], working: [] },
      });
      expect(findingKinds(outcome)).toEqual(["mismatch"]);
      return outcome.findings[0]?.message ?? "";
    };
    const open = ["choice: accepted", 'why: "w"', "state: open"];
    // J-93 S1: a skipped step keeps its section, the one line saying so.
    const mode = message(change("2026-10-04-a", ["mode: quick", ...open], ["## review", "x"]));
    expect(mode).toContain(
      "its mode 'quick' does not run the step 'review', so its section holds the one line 'none at quick' and nothing else: write that line, or raise the mode",
    );
    const ticket = message(
      change(
        "2026-10-04-a",
        ["mode: quick", ...open, "plan: 001-a", "ticket: T1"],
        ["## frame", "x"],
      ),
    );
    expect(ticket).toContain("the step 'frame' belongs to the plan's record");
    expect(ticket).toContain("move the text there and remove the section");
    const planning = message(
      change("2026-10-04-a", ["mode: careful", ...open, "plan: 001-a"], ["## build", "x"]),
    );
    expect(planning).toContain("the step 'build' belongs to the tickets' records");
    expect(planning).toContain("remove the section");
    for (const text of [ticket, planning]) expect(text).not.toContain("raise the mode");
  });

  it("S6 a floor found in a change taken without waiting (choice: standing) with a mode below it is its own finding; the owner's choice raises none", () => {
    const front = (choice: string): readonly string[] => [
      "mode: regular",
      `choice: ${choice}`,
      'why: "w"',
      "state: open",
      "floors: [security]",
    ];
    const standing = derive(changesInput([change("2026-10-04-a", front("standing"))]));
    expect(findingKinds(standing)).toEqual(["below-floor"]);
    // J-102 S1: a standing choice applies only under the proceed setting, never on the request's words.
    expect(standing.findings[0]?.message).toContain(
      "taken without waiting (choice: standing) under the proceed setting, does not meet it",
    );
    expect(standing.findings[0]?.message).not.toContain("request's own words");
    expect(findingKinds(derive(changesInput([change("2026-10-04-a", front("owner"))])))).toEqual(
      [],
    );
  });

  it("S6 a done record is judged while its latest check facts name the current installation, and is history after", () => {
    const missingClose = QUICK_BODY.slice(0, 12);
    const current = derive(
      changesInput([change("2026-10-04-a", quickDone, missingClose, folder([run(["t"])]))]),
    );
    expect(findingKinds(current)).toEqual(["mismatch"]);
    expect(current.findings[0]?.message).toContain("no 'close' section");
    const history = derive(
      changesInput([
        change(
          "2026-10-04-a",
          quickDone,
          missingClose,
          folder([run(["t"], { installation: MOVED_ON })]),
        ),
      ]),
    );
    expect(findingKinds(history)).toEqual([]);
    expect(listed(history).finished[0]).toMatchObject({
      reading: "history",
      step: null,
      mode: "quick",
    });
  });

  it("S6 a change in the modes definition turns no finished record into a finding, and an open record naming what it removed is one", () => {
    const moved = JSON.parse(modesJson);
    for (const step of moved.steps) if (step.name === "close") step.name = "wrap-up";
    for (const mode of moved.modes) {
      mode.steps["wrap-up"] = mode.steps.close;
      delete mode.steps.close;
    }
    moved.modes = moved.modes.filter((mode: { name: string }) => mode.name !== "careful");
    // The floors left name a mode the later definition holds.
    moved.floors = moved.floors
      .filter((floor: { name: string }) => floor.name !== "security")
      .map((floor: { name: string; risk: string }) => ({ ...floor, mode: "regular" }));
    const later = modesFrom(JSON.stringify(moved));
    const old = folder([run(["t"], { installation: MOVED_ON })]);
    const finished = [
      change("2026-10-01-renamed-step", quickDone, QUICK_BODY, old, later),
      change(
        "2026-10-02-removed-mode",
        ["mode: careful", "choice: owner", 'why: "w"', "state: done"],
        [],
        old,
        later,
      ),
      change(
        "2026-10-03-removed-floor",
        ["mode: regular", "choice: standing", 'why: "w"', "state: dropped", "floors: [security]"],
        [],
        undefined,
        later,
      ),
    ];
    const quiet = derive({ ...changesInput(finished), definition: later });
    expect(quiet.findings).toEqual([]);
    expect(
      listed(quiet).finished.map((view) => [view.id, view.reading, view.mode, view.floors]),
    ).toEqual([
      // The two done changes closed on their checks of 2026-10-04; the
      // dropped one, with no check, at the start of the day its id names.
      ["2026-10-02-removed-mode", "history", "careful", []],
      ["2026-10-01-renamed-step", "history", "quick", []],
      ["2026-10-03-removed-floor", "history", "regular", ["security"]],
    ]);
    const open = [
      change("2026-10-04-step", quickOpen, ["## close", "x"], undefined, later),
      change(
        "2026-10-04-mode",
        ["mode: careful", "choice: owner", 'why: "w"', "state: open"],
        [],
        undefined,
        later,
      ),
      change(
        "2026-10-04-floor",
        ["mode: regular", "choice: owner", 'why: "w"', "state: open", "floors: [security]"],
        [],
        undefined,
        later,
      ),
    ];
    expect(findingKinds(derive({ ...changesInput(open), definition: later }))).toEqual([
      "unparsed",
      "unparsed",
      "unparsed",
    ]);
  });

  it("S16b a finished record is history and is not re-judged when the definition changes its kinds or its steps", () => {
    const gated = JSON.parse(modesJson);
    gated.kinds.push({
      name: "gate",
      mechanism: "reach",
      record: "line",
      place: "ordered",
      budget: "free",
      when: "A fixture gate holds the change where the mode reaches it until its check passes.",
    });
    const before = modesFrom(JSON.stringify(gated));
    const front = [
      "mode: careful",
      "choice: accepted",
      'why: "w"',
      "state: done",
      'gate: "the licence check passed"',
    ];
    const body = [
      "## start",
      "diagnose reproduced it.",
      "## frame",
      "x",
      "## plan",
      "x",
      "## anticipate",
      "x",
      "## build",
      "x",
      "## review",
      "x",
      "## verify",
      "x",
      "## close",
      "x",
    ];
    // Judged on the definition it was written under, it matches.
    const current = derive({
      ...changesInput([change("2026-10-04-a", front, body, folder([run(["t"])]), before)]),
      definition: before,
    });
    expect(current.findings).toEqual([]);
    // The definition then drops the gate kind and the start kind.
    const later = JSON.parse(modesJson);
    later.kinds = later.kinds.filter((kind: { name: string }) => kind.name !== "start");
    const after = modesFrom(JSON.stringify(later));
    const history = derive({
      ...changesInput([
        change(
          "2026-10-04-a",
          front,
          body,
          folder([run(["t"], { installation: MOVED_ON })]),
          after,
        ),
      ]),
      definition: after,
    });
    expect(history.findings).toEqual([]);
    expect(listed(history).finished[0]).toMatchObject({ reading: "history", mode: "careful" });
  });

  it("J-93 S1 status reports a done record's skipped step with no section saying so, and a run step's missing section", () => {
    const regularDone = ["mode: regular", "choice: accepted", 'why: "w"', "state: done"];
    const ran = ["frame", "plan", "build", "review", "verify", "close"];
    const without = ran.flatMap((name) => [`## ${name}`, "x"]);
    const whole = [...without.slice(0, 4), "## anticipate", "none at regular", ...without.slice(4)];
    const judged = (bodyLines: readonly string[]) =>
      derive(
        changesInput([change("2026-10-04-a", regularDone, bodyLines, folder([run(["t"])]))]),
      ).findings.map((note) => note.message);
    expect(judged(whole)).toEqual([]);
    expect(judged(without)).toEqual([
      "the done change '2026-10-04-a' does not match what its mode asks of this record: the done record has no 'anticipate' section; its mode 'regular' does not run the step, and every mode keeps the whole record: write the section with the one line 'none at regular'",
    ]);
    const unreviewed = [...whole.slice(0, 8), ...whole.slice(10)];
    expect(judged(unreviewed)).toEqual([
      "the done change '2026-10-04-a' does not match what its mode asks of this record: the done record has no 'review' section its mode requires: write it",
    ]);
  });

  it("J-73 S2 status judges a record's cost against its mode's agents and rounds derived from its depths", () => {
    const carefulOpen = (agents: number, rounds: number) => [
      "mode: careful",
      "choice: owner",
      'why: "w"',
      "state: open",
      `agents: ${agents}`,
      `rounds: ${rounds}`,
    ];
    const judged = (front: readonly string[]) =>
      derive(changesInput([change("2026-10-04-a", front, [])])).findings.map(
        (note) => note.message,
      );
    // Careful may start 5 agents, the builder counted, over 4 rounds.
    expect(judged(carefulOpen(5, 4))).toEqual([]);
    expect(judged(carefulOpen(6, 4))).toEqual([
      "the open change '2026-10-04-a' does not match what its mode asks of this record: it cost 6 agents and 4 rounds, over the mode's 5 and 4: raise the mode, or correct the cost",
    ]);
  });

  it("S16b the step reached is the one the next line names; an open record with none reads its sections", () => {
    const view = (front: readonly string[], body: readonly string[]) =>
      listed(derive(changesInput([change("2026-10-04-a", front, body)]))).current[0]?.step;
    const regular = ["mode: regular", "choice: accepted", 'why: "w"'];
    expect(
      view([...regular, "state: stopped", 'next: "verify: rerun it"'], ["## frame", "x"]),
    ).toBe("verify");
    expect(view([...regular, "state: open"], ["## frame", "x"])).toBe("plan");
    expect(view([...regular, "state: open", "next: none"], ["## frame", "x"])).toBe("plan");
  });

  it("S16b a next line naming a step the record does not run is a finding whose remedy follows its cause", () => {
    const outcome = derive(
      changesInput([
        change("2026-10-04-a", [...quickOpen, 'next: "review: start a reviewer"'], []),
      ]),
    );
    expect(outcome.findings.map((note) => [note.kind, note.message])).toEqual([
      [
        "mismatch",
        `the open change '2026-10-04-a' does not match what its mode asks of this record: its "next" line names the step 'review', which this record does not run: its mode 'quick' does not run it; name a step the mode runs, or raise the mode`,
      ],
    ]);
  });

  it("S6 a done change whose latest check did not pass is a finding; a later pass, or a dropped change, is not", () => {
    const one = (runs: readonly CheckFacts[], front: readonly string[] = quickDone) =>
      findingKinds(derive(changesInput([change("2026-10-04-a", front, QUICK_BODY, folder(runs))])));
    expect(one([run(["t"], { code: 1 })])).toEqual(["checks-failed"]);
    expect(one([run(["t"], { state: "started" })])).toEqual(["checks-failed"]);
    expect(one([run(["t"], { signal: "SIGTERM" })])).toEqual(["checks-failed"]);
    expect(
      one([
        run(["t"], { code: 1, startedAt: "2026-10-04T10:00:00.000Z" }),
        run(["t"], { startedAt: "2026-10-04T11:00:00.000Z" }),
      ]),
    ).toEqual([]);
    expect(one([run(["t"], { code: 1, installation: MOVED_ON })])).toEqual(["checks-failed"]);
    expect(one([run(["t"], { code: 1 })], [...quickDone.slice(0, 3), "state: dropped"])).toEqual(
      [],
    );
  });
});

describe("the changes view: the code a check ran on", () => {
  const C0 = hash("0");
  const C1 = hash("1");
  const history: GitHistory = {
    kind: "read",
    head: C1,
    commits: [
      logged(C1, [C0], [["M", "src/a.ts"]], ["2026-10-04-a"]),
      logged(C0, [], [["A", ledger("2026-10-04-a")]]),
    ],
  };
  const done = (runs: readonly CheckFacts[]) =>
    changesInput([change("2026-10-04-a", quickDone, QUICK_BODY, folder(runs))], { history });

  it("S6 a check whose tree is the tree of the change's latest commit ran on the final code, and raises nothing", () => {
    const outcome = derive(
      done([run(["t"], { commit: C0, tree: "f".repeat(40) })]),
      LIST,
      gitAnswers({ [C1]: "f".repeat(40) }),
    );
    expect(listed(outcome).finished[0]?.checks[0]?.code).toEqual({ kind: "final" });
    expect(outcome.notices).toEqual([]);
  });

  it("S6 a check whose tree differs is a notice naming the files that changed after it", () => {
    const outcome = derive(
      done([run(["t"], { commit: C0, tree: "d".repeat(40) })]),
      LIST,
      gitAnswers({ [C1]: "f".repeat(40), [C0]: "d".repeat(40) }, undefined, {
        [diffKey(C0, { kind: "commit", hash: C1 })]: ["src/a.ts"],
      }),
    );
    expect(listed(outcome).finished[0]?.checks[0]?.code).toEqual({
      kind: "moved",
      files: { kind: "files", files: ["src/a.ts"] },
      relativeTo: null,
    });
    expect(noticeKinds(outcome)).toEqual(["code-moved"]);
    expect(outcome.notices[0]?.message).toContain("src/a.ts changed");
    expect(outcome.findings).toEqual([]);
  });

  it("S6 a check that ran on uncommitted work names the files relative to its commit", () => {
    const outcome = derive(
      done([run(["t"], { commit: C0, tree: "9".repeat(40) })]),
      LIST,
      gitAnswers({ [C1]: "f".repeat(40), [C0]: "d".repeat(40) }, undefined, {
        [diffKey(C0, { kind: "commit", hash: C1 })]: ["src/a.ts"],
      }),
    );
    expect(listed(outcome).finished[0]?.checks[0]?.code).toMatchObject({
      kind: "moved",
      relativeTo: C0,
    });
    expect(outcome.notices[0]?.message).toContain("counted from");
  });

  it("S6 when the tree of the commit a check ran on cannot be read, the files that changed are unknown", () => {
    const outcome = derive(
      done([run(["t"], { commit: C0, tree: "9".repeat(40) })]),
      LIST,
      gitAnswers({ [C1]: "f".repeat(40) }, undefined, {
        [diffKey(C0, { kind: "commit", hash: C1 })]: ["src/a.ts"],
      }),
    );
    expect(listed(outcome).finished[0]?.checks[0]?.code).toMatchObject({
      kind: "moved",
      files: { kind: "unknown" },
      relativeTo: null,
    });
    expect(outcome.notices[0]?.message).toContain("which files changed is unknown");
  });

  it("S6 an open change is compared with the working tree", () => {
    const input = changesInput(
      [change("2026-10-04-a", quickOpen, [], folder([run(["t"], { tree: "f".repeat(40) })]))],
      { history },
    );
    const assessment = assessChanges(input, LIST);
    expect(codeQuestions(assessment).workingTree).toBe(true);
    expect(
      listed(derive(input, LIST, gitAnswers({}, "f".repeat(40)))).current[0]?.checks[0]?.code,
    ).toEqual({ kind: "final" });
  });

  it("S6 a stopped change is compared with its latest commit, and with the working tree while it has none", () => {
    const stopped = [
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: stopped",
      'next: "build: go on"',
    ];
    const committed = changesInput(
      [change("2026-10-04-a", stopped, [], folder([run(["t"], { tree: "f".repeat(40) })]))],
      { history },
    );
    const asked = codeQuestions(assessChanges(committed, LIST));
    expect(asked.workingTree).toBe(false);
    expect(asked.commitTrees).toContain(C1);
    const none = changesInput(
      [change("2026-10-05-b", stopped, [], folder([run(["t"], { tree: "f".repeat(40) })]))],
      { history },
    );
    expect(codeQuestions(assessChanges(none, LIST)).workingTree).toBe(true);
    expect(
      listed(derive(none, LIST, gitAnswers({}, "f".repeat(40)))).current[0]?.checks[0]?.code,
    ).toEqual({ kind: "final" });
  });

  it("S6 an unknown tree or history is shown as unknown, never as a pass or a failure", () => {
    const unknownTree = derive(done([run(["t"], { commit: C0 })]));
    expect(listed(unknownTree).finished[0]?.checks[0]?.code).toMatchObject({ kind: "unknown" });
    expect(unknownTree.notices).toEqual([]);
    const shallow = derive({
      ...done([run(["t"])]),
      history: { kind: "unknown", why: "shallow", detail: "the clone is shallow" },
    });
    const view = listed(shallow);
    expect(view.finished[0]?.commits).toEqual({ kind: "unknown", why: "the clone is shallow" });
    expect(view.finished[0]?.checks[0]?.code).toEqual({
      kind: "unknown",
      why: "the clone is shallow",
    });
    expect(view.unclaimed).toEqual({ kind: "unknown", why: "the clone is shallow" });
    expect(shallow.notices).toEqual([]);
    expect(renderChangesText(shallow.report)).toContain("commits: unknown (the clone is shallow)");
  });
});

describe("the changes view: notices", () => {
  const C0 = hash("0");
  const C1 = hash("1");
  const C2 = hash("2");

  it("S6 and J-93 S3 commits after the first change record that touch code and belong to no change are counted on the history line, a nudge with no code", () => {
    const history = (paths: readonly (readonly [PathStatus, string])[]): GitHistory => ({
      kind: "read",
      head: C2,
      commits: [
        logged(C2, [C1], paths),
        logged(C1, [C0], [["M", "src/b.ts"]], ["2026-10-04-a"]),
        logged(C0, [], [["A", ledger("2026-10-04-a")]]),
      ],
    });
    const input = (paths: readonly (readonly [PathStatus, string])[]) =>
      changesInput([change("2026-10-04-a", quickOpen)], {
        history: history(paths),
        installed: new Set(["AGENTS.md"]),
      });
    const counted = derive(input([["M", "src/hand.ts"]]));
    expect(noticeKinds(counted)).toEqual([]);
    expect(listed(counted).unclaimed).toEqual({
      kind: "known",
      count: 1,
      named: C2.slice(0, 7),
    });
    expect(renderChangesText(counted.report)).toContain(
      "  history: 1 commit since the first change record, on the first parent and not merges, touches code",
    );
    expect(listed(derive(input([["M", "AGENTS.md"]]))).unclaimed).toEqual({
      kind: "known",
      count: 0,
      named: "",
    });
    expect(counted.findings).toEqual([]);
  });

  it("J-84 S1 and J-93 S3 the commits with no trailer are named by their short hash on the history line, and the remedy says how the next commit carries it", () => {
    const commits = ["3", "4", "5", "6", "7", "8", "9"].map(hash);
    const history: GitHistory = {
      kind: "read",
      head: commits[0],
      commits: [
        ...commits.map((id, index) =>
          logged(id, [commits[index + 1] ?? C1], [["M", `src/${index}.ts`]]),
        ),
        logged(C1, [C0], [["M", "src/b.ts"]], ["2026-10-04-a"]),
        logged(C0, [], [["A", ledger("2026-10-04-a")]]),
      ],
    };
    const one: GitHistory = { ...history, head: hash("9") };
    const derived = (read: GitHistory) =>
      renderChangesText(
        derive(
          changesInput([change("2026-10-04-a", quickOpen)], {
            history: read,
            installed: new Set(),
          }),
        ).report,
      )
        .split("\n")
        .find((line) => line.startsWith("  history:"));
    expect(derived(one)).toBe(
      "  history: 1 commit since the first change record, on the first parent and not merges, touches code and belongs to no change: 9999999. A change's commits carry the trailer 'Greenline-Change: <id>' in the message's last paragraph, beside any other trailer there such as 'Co-Authored-By'; write it so in the next commit, and leave the commits already made as they are",
    );
    expect(derived(history)).toMatch(
      /^ {2}history: 7 commits .* belong to no change: 3333333, 4444444, 5555555, 6666666, 7777777 and 2 more\. /,
    );
    expect(derived(history)).not.toMatch(/rebase|amend|filter-branch|reset|rewrite/);
  });

  it("S6 a record history shows as deleted is a notice while it is absent on disk", () => {
    const history: GitHistory = {
      kind: "read",
      head: C1,
      commits: [
        logged(C1, [C0], [["D", ledger("2026-10-04-gone")]]),
        logged(
          C0,
          [],
          [
            ["A", ledger("2026-10-04-gone")],
            ["A", ledger("2026-10-04-a")],
          ],
        ),
      ],
    };
    const absent = derive(changesInput([change("2026-10-04-a", quickOpen)], { history }));
    expect(noticeKinds(absent)).toEqual(["deleted"]);
    expect(absent.notices[0]?.path).toBe(ledger("2026-10-04-gone"));
    const back = derive(
      changesInput([change("2026-10-04-a", quickOpen), change("2026-10-04-gone", quickOpen)], {
        history,
      }),
    );
    expect(noticeKinds(back)).toEqual([]);
  });

  it("S6 and J-93 S3 a done planning record the decisions book does not name is a nudge beside it, with no code", () => {
    const plans: PlanOnDisk[] = [
      {
        name: "001-login",
        contents: ok({
          tickets: {
            file: "tickets.md",
            parsed: parseTicketsFile(definition, "tickets.md", ticketsText(["T1"])),
          },
          documents: [],
        }),
      },
    ];
    const planning = change(
      "2026-10-04-plan",
      ["mode: careful", "choice: owner", 'why: "w"', "state: done", "plan: 001-login"],
      [],
      folder([run(["t"], { installation: MOVED_ON })]),
    );
    const notes = (decisions: string | undefined, entry: ChangeOnDisk = planning) => {
      const outcome = derive({
        ...changesInput([entry], { decisions }),
        disk: { changes: [entry], plans, working: [] },
      });
      expect(noticeKinds(outcome)).toEqual([]);
      return listed(outcome).finished.flatMap((view) => view.nudges);
    };
    expect(notes(undefined)).toEqual([
      "the planning change is done and .greenline/DECISIONS.md does not name it: record its lasting choices there with references to their sources, or record that none remain",
    ]);
    expect(notes("- 2026-10-04-plan: the session lasts a day")).toEqual([]);
    const ticket = change(
      "2026-10-04-t1",
      [
        "mode: quick",
        "choice: accepted",
        'why: "w"',
        "state: done",
        "plan: 001-login",
        "ticket: T1",
      ],
      QUICK_BODY,
      folder([run(["t"], { installation: MOVED_ON })]),
    );
    expect(notes(undefined, ticket)).toEqual([]);
  });

  it("S6 a done change with no check facts is a notice", () => {
    expect(
      noticeKinds(derive(changesInput([change("2026-10-04-a", quickDone, QUICK_BODY)]))),
    ).toEqual(["unchecked"]);
    expect(
      noticeKinds(derive(changesInput([change("2026-10-04-a", quickDone, QUICK_BODY, passed)]))),
    ).toEqual([]);
    expect(noticeKinds(derive(changesInput([change("2026-10-04-a", quickOpen)])))).toEqual([]);
  });
});

describe("the changes view: the files a record cites", () => {
  // The links stand in the close section, one line, as a quick record's inline close holds them.
  const withLinks = (links: readonly string[]): readonly string[] => [
    ...QUICK_BODY.slice(0, 12),
    "## close",
    ...links,
  ];

  it("S6 a link into the record's own folder whose file is missing is a finding, and one whose file is there is not", () => {
    const body = withLinks([
      "Reviewed: [the review](2026-10-04-a/review-1.md), [its notes](./2026-10-04-a/notes/round-2.md).",
    ]);
    const present = folder([run(["t"])], ["notes/round-2.md", "review-1.md"]);
    expect(
      findingKinds(derive(changesInput([change("2026-10-04-a", quickDone, body, present)]))),
    ).toEqual([]);
    const missing = derive(
      changesInput([
        change("2026-10-04-a", quickDone, body, folder([run(["t"])], ["review-1.md"])),
      ]),
    );
    expect(missing.findings.map((note) => [note.kind, note.path])).toEqual([
      ["cited-missing", ".greenline/ledger/2026-10-04-a/notes/round-2.md"],
    ]);
    const noFolder = derive(
      changesInput([change("2026-10-04-a", quickOpen, ["## build", "[r](2026-10-04-a/r.md)"])]),
    );
    expect(findingKinds(noFolder)).toEqual(["cited-missing"]);
  });

  it("S6 a link in a fence or inline code is no citation; a query is dropped and an escaped name read", () => {
    const body = withLinks([
      "See `[quoted](2026-10-04-a/inline.md)`, [the review](2026-10-04-a/review%201.md?raw=1#top).",
    ]);
    const fenced = [...body, "```md", "[example](2026-10-04-a/example.md)", "```"];
    const outcome = derive(
      changesInput([
        change(
          "2026-10-04-a",
          [...quickDone],
          fenced,
          folder([run(["t"], { installation: MOVED_ON })], ["review 1.md"]),
        ),
      ]),
    );
    expect(outcome.findings).toEqual([]);
    expect(outcome.notices).toEqual([]);
  });

  it("S6 links that point outside the record's folder are not checked", () => {
    const body = withLinks([
      "See [the code](../../src/a.ts), [another change](2026-10-03-b/review.md), [a climb out](2026-10-04-a/../2026-10-03-b/x.md), [the web](https://example.com/x.md) and [a heading](#review); an absolute path is read from the root: [not the folder](/2026-10-04-a/missing.md), [a web folder](https://host/2026-10-04-a/missing.md).",
    ]);
    const outcome = derive(
      changesInput([change("2026-10-04-a", quickDone, body, folder([run(["t"])]))]),
    );
    expect(outcome.findings).toEqual([]);
    expect(outcome.notices).toEqual([]);
  });

  it("S6 a file in a finished change's folder that no link of its record cites is a notice; check facts are exempt", () => {
    const body = withLinks(["[the review](2026-10-04-a/review-1.md)"]);
    const reports = ["notes.md", "review-1.md", "root.md"];
    const rooted = [...body, "[from the root](/.greenline/ledger/2026-10-04-a/root.md)"];
    const done = derive(
      changesInput([change("2026-10-04-a", quickDone, rooted, folder([run(["t"])], reports))]),
    );
    expect(done.notices.map((note) => [note.kind, note.path])).toEqual([
      ["uncited", ".greenline/ledger/2026-10-04-a/notes.md"],
    ]);
    const dropped = [...quickDone.slice(0, 3), "state: dropped"];
    expect(
      noticeKinds(
        derive(changesInput([change("2026-10-04-a", dropped, rooted, folder([], reports))])),
      ),
    ).toEqual(["uncited"]);
    const open = derive(
      changesInput([
        change("2026-10-04-a", quickOpen, ["## build", "x"], folder([run(["t"])], reports)),
      ]),
    );
    expect(open.notices).toEqual([]);
  });
});

function ticketsText(ids: readonly string[]): string {
  return [
    "---",
    "status: complete",
    "---",
    "",
    "# Tickets",
    "",
    ...ids.flatMap((id, index) => [
      `## ${id}`,
      "",
      `intent: "the ${id} work"`,
      "scope:",
      `  - src/${id.toLowerCase()}.ts`,
      "acceptance:",
      '  - "the focused tests pass"',
      ...(index === 0 ? [] : [`after: [${ids[index - 1]}]`]),
      "mode: quick",
      "",
    ]),
  ].join("\n");
}

/** A schema-5 collection with an owner, a binding and a number of calls; no unit text anywhere. */
function consultation(
  id: string,
  owner: GuidanceRequest["owner"],
  binding: GuidanceRequest["binding"],
  calls: number,
): GuidanceRequest {
  const at = "2026-10-04T12:00:00.000Z";
  return {
    schemaVersion: 5,
    id,
    source: "garden",
    owner,
    parent: null,
    createdAt: at,
    binding,
    publicationUse: "current",
    limits: { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 },
    receipts: Array.from({ length: calls }, (_, index) => ({
      id: `2222222${index}-2222-4222-8222-222222222222`,
      sequence: index + 1,
      operation: "snapshot" as const,
      query: null,
      requested: [],
      closure: false,
      excluded: [],
      roots: ["."],
      policyRevision: "a".repeat(64),
      units: [],
      count: 0,
      outcome: "received" as const,
      error: null,
      startedAt: at,
      finishedAt: at,
    })),
    advisories: [],
  };
}

describe("the changes view: a change's consultations", () => {
  const origin = "https://garden.example/";
  const A = { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" };
  const B = { id: "example-publication-b", publishedAt: "2026-01-02T00:00:00.000Z" };
  const requests = [
    consultation(
      "11111111-1111-4111-8111-111111111111",
      { kind: "change", change: "2026-10-04-a" },
      { state: "publication", origin, snapshot: A },
      3,
    ),
    consultation(
      "11111111-1111-4111-8111-111111111112",
      { kind: "change", change: "2026-10-04-a" },
      { state: "comparison", origin, from: A, to: B },
      1,
    ),
    consultation(
      "11111111-1111-4111-8111-111111111113",
      { kind: "change", change: "2026-10-04-b" },
      { state: "unresolved", origin },
      1,
    ),
    consultation(
      "11111111-1111-4111-8111-111111111114",
      { kind: "none" },
      { state: "unresolved", origin },
      2,
    ),
  ];
  const input = changesInput(
    [change("2026-10-04-a", quickOpen), change("2026-10-04-b", quickOpen)],
    {
      consultations: requests,
    },
  );

  it("S7 the resume view lists each of the change's requests with its publication and its count of calls", () => {
    const outcome = derive(input, { view: "resume", change: "2026-10-04-a" });
    if (outcome.report.view !== "resume") throw new Error("not the resume view");
    expect(outcome.report.change.consultations).toEqual([
      {
        request: "11111111-1111-4111-8111-111111111111",
        binding: { state: "publication", publication: A.id },
        calls: 3,
      },
      {
        request: "11111111-1111-4111-8111-111111111112",
        binding: { state: "comparison", from: A.id, to: B.id },
        calls: 1,
      },
    ]);
    const text = renderChangesText(outcome.report);
    expect(text).toContain("  consultations (2):");
    expect(text).toContain(
      "    11111111-1111-4111-8111-111111111111  publication example-publication-a, 3 calls",
    );
    expect(text).toContain(
      "    11111111-1111-4111-8111-111111111112  comparison of example-publication-a with example-publication-b, 1 call",
    );
  });

  it("S7 the default view counts the consultations per change, and a question's belongs to none", () => {
    const view = listed(derive(input));
    expect(view.current.map((entry) => [entry.id, entry.consultations.length])).toEqual([
      ["2026-10-04-a", 2],
      ["2026-10-04-b", 1],
    ]);
    expect(renderChangesText(view)).toContain("2 consultations");
    expect(renderChangesText(view)).toContain("1 consultation");
    const none = listed(
      derive(changesInput([change("2026-10-04-c", quickOpen)], { consultations: requests })),
    );
    expect(none.current[0]?.consultations).toEqual([]);
    expect(renderChangesText(none)).not.toContain("consultation");
  });
});

describe("the changes view: what it shows", () => {
  it("S6 the default view shows the open and stopped changes and the ten most recently closed; all shows every one", () => {
    const finished = Array.from({ length: 12 }, (_, index) =>
      change(`2026-09-${String(index + 10)}-done`, quickDone, QUICK_BODY, passed),
    );
    const stopped = [
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: stopped",
      'next: "build: resume"',
    ];
    const input = changesInput([
      ...finished,
      change("2026-10-04-open", quickOpen),
      change("2026-10-04-stopped", stopped),
    ]);
    const view = listed(derive(input));
    expect(view.current.map((entry) => [entry.id, entry.state, entry.next])).toEqual([
      ["2026-10-04-open", "open", null],
      ["2026-10-04-stopped", "stopped", "build: resume"],
    ]);
    expect(view.finished.map((entry) => entry.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `2026-09-${String(21 - index)}-done`),
    );
    expect(view.finishedHidden).toBe(2);
    expect(listed(derive(input, { view: "list", all: true })).finished).toHaveLength(12);
    expect(renderChangesText(view)).toContain("finished, the last 10 of 12:");
  });

  it("J-89 S4 the ten finished shown are the ten most recently closed, by each one's latest check, newest first", () => {
    // Twelve changes opened on one day and closed out of id order: the
    // newest ids are not the newest closes, so an id order would hide the
    // two closed last.
    const hours = { a: 22, b: 3, c: 20, d: 1, e: 18, f: 5, g: 16, h: 7, i: 14, j: 9, k: 12, l: 11 };
    const finished = Object.entries(hours).map(([slug, hour]) =>
      change(
        `2026-10-05-${slug}`,
        quickDone,
        QUICK_BODY,
        folder([
          run(["pnpm", "test"], {
            startedAt: `2026-10-05T${String(hour).padStart(2, "0")}:00:00.000Z`,
          }),
        ]),
      ),
    );
    const input = changesInput([...finished, change("2026-10-05-open", quickOpen)]);
    const view = listed(derive(input));
    expect(view.finished.map((entry) => entry.id.slice(11))).toEqual([
      "a",
      "c",
      "e",
      "g",
      "i",
      "k",
      "l",
      "j",
      "h",
      "f",
    ]);
    expect(view.finishedHidden).toBe(2);
    expect(renderChangesText(view)).toContain("finished, the last 10 of 12:");
    const every = listed(derive(input, { view: "list", all: true }));
    expect(every.finished.map((entry) => entry.id.slice(11))).toEqual([
      "a",
      "c",
      "e",
      "g",
      "i",
      "k",
      "l",
      "j",
      "h",
      "f",
      "b",
      "d",
    ]);
  });

  it("J-89 S4 the close's time is the latest run's end, a probe left out, and the id's day where no check ran; the id breaks a tie", () => {
    const at = (time: string): string => `2026-10-06T${time}:00.000Z`;
    const shown = listed(
      derive(
        changesInput([
          // Started first, but its run ended last: three hours long.
          change(
            "2026-10-06-long",
            quickDone,
            QUICK_BODY,
            folder([run(["t"], { startedAt: at("10:00"), durationMs: 3 * 60 * 60 * 1000 })]),
          ),
          change(
            "2026-10-06-short",
            quickDone,
            QUICK_BODY,
            folder([run(["t"], { startedAt: at("12:00") })]),
          ),
          // A probe after its last check is no check of the change.
          change(
            "2026-10-06-probed",
            quickDone,
            QUICK_BODY,
            folder([
              run(["t"], { startedAt: at("09:00") }),
              { ...run(["t"], { startedAt: at("23:00") }), probe: true },
            ]),
          ),
          // An unfinished run counts at its start.
          change(
            "2026-10-06-unfinished",
            [...quickDone.slice(0, 3), "state: dropped"],
            QUICK_BODY,
            folder([run(["t"], { startedAt: at("11:00"), state: "started" })]),
          ),
          // Two closed at the same time: the newer id first.
          change(
            "2026-10-06-tie-a",
            quickDone,
            QUICK_BODY,
            folder([run(["t"], { startedAt: at("08:00") })]),
          ),
          change(
            "2026-10-06-tie-b",
            quickDone,
            QUICK_BODY,
            folder([run(["t"], { startedAt: at("08:00") })]),
          ),
          // No check facts: the start of the day its id names, after an
          // earlier day's close and before any close on its own day.
          change("2026-10-06-dropped", [...quickDone.slice(0, 3), "state: dropped"]),
          change(
            "2026-10-05-late",
            quickDone,
            QUICK_BODY,
            folder([run(["t"], { startedAt: "2026-10-05T23:59:00.000Z" })]),
          ),
          change("2026-10-07-unchecked", [...quickDone.slice(0, 3), "state: dropped"]),
        ]),
      ),
    );
    expect(shown.finished.map((entry) => entry.id.slice(11))).toEqual([
      "unchecked",
      "long",
      "short",
      "unfinished",
      "probed",
      "tie-b",
      "tie-a",
      "dropped",
      "late",
    ]);
  });

  it("S6 the totals count the changes by mode, the owner's choices, the raises and the cost", () => {
    const outcome = derive(
      changesInput([
        change(
          "2026-10-01-a",
          [
            ...quickDone.slice(0, 1),
            "choice: owner",
            ...quickDone.slice(2),
            "agents: 1",
            "rounds: 0",
          ],
          QUICK_BODY,
          passed,
        ),
        change("2026-10-02-b", [
          "mode: regular",
          "choice: accepted",
          'why: "w"',
          "state: open",
          "raises:",
          '  - { from: quick, reason: "r" }',
        ]),
        change("2026-10-03-c", [
          "mode: regular",
          "choice: standing",
          'why: "w"',
          "state: dropped",
          "agents: 2",
          "rounds: 1",
        ]),
      ]),
    );
    expect(listed(outcome).totals).toEqual({
      changes: 3,
      unparsed: 0,
      byMode: [
        { mode: "quick", changes: 1 },
        { mode: "regular", changes: 2 },
      ],
      ownerChose: 1,
      raised: 1,
      cost: { agents: 3, rounds: 1, changes: 2 },
    });
    expect(renderChangesText(outcome.report)).toContain(
      "totals: 3 changes; quick 1, regular 2; the owner chose 1; raised 1; cost 3 agents and 1 round, from the 2 changes that state it",
    );
  });

  it("S6 each plan shows each ticket as not started, in progress or done, and its ready frontier", () => {
    const plans: PlanOnDisk[] = [
      {
        name: "001-login",
        contents: ok({
          tickets: {
            file: "tickets.md",
            parsed: parseTicketsFile(definition, "tickets.md", ticketsText(["T1", "T2", "T3"])),
          },
          documents: [],
        }),
      },
    ];
    const t1 = change(
      "2026-10-04-t1",
      [
        "mode: quick",
        "choice: accepted",
        'why: "w"',
        "state: done",
        "plan: 001-login",
        "ticket: T1",
      ],
      QUICK_BODY,
      passed,
    );
    const t2 = change("2026-10-04-t2", [
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: open",
      "plan: 001-login",
      "ticket: T2",
    ]);
    const outcome = derive({
      ...changesInput([t1, t2]),
      disk: { changes: [t1, t2], plans, working: [] },
    });
    expect(listed(outcome).plans).toEqual([
      {
        name: "001-login",
        readable: true,
        tickets: "complete",
        progress: [
          { ticket: "T1", progress: "done" },
          { ticket: "T2", progress: "in progress" },
          { ticket: "T3", progress: "not started" },
        ],
        frontier: [],
      },
    ]);
  });

  it("S6 the resume view shows one change in full and only the findings and notices about it and its plan", () => {
    const outcome = derive(
      changesInput([
        change(
          "2026-10-04-a",
          [
            "mode: regular",
            "choice: owner",
            "proposed: quick",
            'why: "the login form"',
            "state: stopped",
            'next: "review: rerun the reviewer"',
            "reviewed: independent",
          ],
          ["## frame", "x", "## plan", "y"],
        ),
        change("2026-10-04-b", quickOpen, ["## plan", "one line at quick"]),
        change("2026-10-03-c", quickDone, QUICK_BODY),
      ]),
      { view: "resume", change: "2026-10-04-a" },
    );
    if (outcome.report.view !== "resume") throw new Error("not the resume view");
    expect(outcome.report.change).toMatchObject({
      id: "2026-10-04-a",
      mode: "regular",
      choice: "owner",
      proposed: "quick",
      why: "the login form",
      state: "stopped",
      next: "review: rerun the reviewer",
      step: "review",
      reviewed: "independent",
    });
    expect(outcome.findings).toEqual([]);
    expect(outcome.notices).toEqual([]);
    const text = renderChangesText(outcome.report);
    expect(text).toContain("change 2026-10-04-a (.greenline/ledger/2026-10-04-a.md)");
    expect(text).toContain("  next: review: rerun the reviewer");
    expect(text).toContain("  step reached: review");
    expect(text).toContain("  checks: none");
  });
});

describe("J-73 S4 four prose rules read by status", () => {
  const ticketsWith = (mode: string): PlanOnDisk => ({
    name: "001-login",
    contents: ok({
      tickets: {
        file: "tickets.md",
        parsed: parseTicketsFile(
          definition,
          "tickets.md",
          ticketsText(["T1"]).replace("mode: quick", `mode: ${mode}`),
        ),
      },
      documents: [],
    }),
  });
  const withPlan = (entries: readonly ChangeOnDisk[], plan: PlanOnDisk): ChangesInput => ({
    ...changesInput(entries),
    disk: { changes: entries, plans: [plan], working: [] },
  });
  const ticket = (front: readonly string[]): ChangeOnDisk =>
    change("2026-10-14-t1", [...front, 'why: "w"', "state: open", "plan: 001-login", "ticket: T1"]);

  it("J-73 S4 a ticket's record that opened under a mode its tickets.md entry does not give is a finding; one that opened under it, then raised, is not", () => {
    const mismatched = derive(
      withPlan([ticket(["mode: regular", "choice: accepted"])], ticketsWith("quick")),
    );
    expect(findingKinds(mismatched)).toEqual(["ticket-mode"]);
    expect(mismatched.findings[0]?.message).toContain(
      "the ticket 'T1' of the plan '001-login' opened under 'regular', and its entry in .greenline/plans/001-login/tickets.md gives 'quick'",
    );
    expect(mismatched.findings[0]?.path).toBe(ledger("2026-10-14-t1"));
    expect(
      findingKinds(
        derive(withPlan([ticket(["mode: quick", "choice: accepted"])], ticketsWith("quick"))),
      ),
    ).toEqual([]);
    const raised = ticket([
      "mode: regular",
      "choice: accepted",
      "raises:",
      '  - { from: quick, reason: "the change touches the session store" }',
    ]);
    expect(findingKinds(derive(withPlan([raised], ticketsWith("quick"))))).toEqual([]);
  });

  it("J-84 S3 a ticket opened under the owner's override is still GL0406, its remedy keeping the owner's mode; a mode the owner named at the list goes into the entry", () => {
    const override = derive(
      withPlan(
        [ticket(["mode: quick", "choice: owner", "proposed: careful"])],
        ticketsWith("careful"),
      ),
    );
    expect(findingKinds(override)).toEqual(["ticket-mode"]);
    const message = override.findings[0]?.message ?? "";
    expect(message).toContain(
      "the ticket 'T1' of the plan '001-login' opened under 'quick', the mode the owner named as it opened (choice: owner), and its entry in .greenline/plans/001-login/tickets.md gives 'careful'",
    );
    expect(message).toContain(
      "the owner's override stands: keep the record's mode with proposed naming the entry's mode; a mode the owner named while the ticket list waited belongs in the entry: write it into tickets.md",
    );
    expect(message).not.toContain("correct the record's mode");
    // Words at the list edit the entry: the entry gives the owner's mode, and no finding stands.
    expect(
      findingKinds(
        derive(withPlan([ticket(["mode: quick", "choice: accepted"])], ticketsWith("quick"))),
      ),
    ).toEqual([]);
    // A mode the agent took is no override: the remedy corrects it.
    const taken = derive(
      withPlan([ticket(["mode: regular", "choice: accepted"])], ticketsWith("quick")),
    );
    expect(taken.findings[0]?.message).toContain(
      "correct the record's mode, or raise it from that mode with a raise that says why; a mode the owner named as the ticket opened is recorded choice: owner",
    );
  });

  it("J-84 S3 a planning change the owner kept below careful is still GL0407, its remedy keeping the owner's choice", () => {
    const owned = derive(
      withPlan(
        [
          change("2026-10-14-plan", [
            "mode: regular",
            "choice: owner",
            "proposed: careful",
            'why: "w"',
            "state: open",
            "plan: 001-login",
          ]),
        ],
        ticketsWith("quick"),
      ),
    );
    expect(findingKinds(owned)).toEqual(["planning-below-careful"]);
    const message = owned.findings[0]?.message ?? "";
    expect(message).toContain(
      "the planning change '2026-10-14-plan' runs under 'regular', the mode the owner named (choice: owner), and a planning change runs under careful",
    );
    expect(message).toContain(
      "the owner's choice stands: keep the mode, and raise it only on the owner's word",
    );
    expect(message).not.toContain("have the owner choose");
  });

  it("J-73 S4 a planning change below careful is a finding; one at careful is not, and a ticket's record is no planning change", () => {
    const planning = (mode: string): ChangeOnDisk =>
      change("2026-10-14-plan", [
        `mode: ${mode}`,
        "choice: accepted",
        'why: "w"',
        "state: open",
        "plan: 001-login",
      ]);
    const below = derive(withPlan([planning("regular")], ticketsWith("quick")));
    expect(findingKinds(below)).toEqual(["planning-below-careful"]);
    expect(below.findings[0]?.message).toContain(
      "the planning change '2026-10-14-plan' runs under 'regular', and a planning change runs under careful",
    );
    expect(findingKinds(derive(withPlan([planning("careful")], ticketsWith("quick"))))).toEqual([]);
    // A plan directory with no tickets file yet, as a map's planning change has, is still planning.
    expect(findingKinds(derive(changesInput([planning("quick")])))).toEqual([
      "planning-below-careful",
    ]);
    expect(
      findingKinds(
        derive(withPlan([ticket(["mode: quick", "choice: accepted"])], ticketsWith("quick"))),
      ),
    ).toEqual([]);
  });

  it("J-73 S4 and J-93 S3 a working folder a finished change left is a nudge naming tidy; an open or stopped change's, or one with no record, is not", () => {
    const working = (entries: readonly ChangeOnDisk[], ids: readonly string[]): ChangesInput => ({
      ...changesInput(entries),
      disk: { changes: entries, plans: [], working: ids },
    });
    const done = change("2026-10-14-a", quickDone, QUICK_BODY, passed);
    const nudged = (input: ChangesInput): readonly string[] => {
      const outcome = derive(input);
      expect(noticeKinds(outcome)).toEqual([]);
      const report = listed(outcome);
      return [...report.current, ...report.finished].flatMap((view) => view.nudges);
    };
    const left = derive(working([done], ["2026-10-14-a"]));
    expect(noticeKinds(left)).toEqual([]);
    expect(listed(left).finished[0]?.nudges).toEqual([
      "its working files remain in .greenline/tmp/2026-10-14-a/: distil what is worth keeping into its record, then remove them with 'greenline tidy --change 2026-10-14-a'",
    ]);
    expect(renderChangesText(left.report)).toContain(
      "      its working files remain in .greenline/tmp/2026-10-14-a/",
    );
    const dropped = change("2026-10-14-a", [
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: dropped",
    ]);
    expect(nudged(working([dropped], ["2026-10-14-a"]))).toHaveLength(1);
    expect(nudged(working([done], []))).toEqual([]);
    const stopped = change("2026-10-14-a", [
      ...quickOpen.slice(0, 3),
      "state: stopped",
      'next: "build: carry on"',
    ]);
    expect(nudged(working([stopped], ["2026-10-14-a"]))).toEqual([]);
    expect(nudged(working([change("2026-10-14-a", quickOpen)], ["2026-10-14-a"]))).toEqual([]);
    expect(nudged(working([], ["2026-10-14-z"]))).toEqual([]);
  });

  it("J-73 S4 and J-93 S3 a standing record whose mode proceed does not allow is a nudge, the owner to choose (J-102 S1), and never fails the command", () => {
    const standing = (mode: string): ChangeOnDisk =>
      change("2026-10-14-a", [`mode: ${mode}`, "choice: standing", 'why: "w"', "state: open"]);
    const notice = (mode: string, proceed: string | undefined): readonly string[] =>
      listed(derive({ ...changesInput([standing(mode)]), proceed })).current.flatMap(
        (view) => view.nudges,
      );
    const beyond = derive({ ...changesInput([standing("careful")]), proceed: "regular" });
    expect(noticeKinds(beyond)).toEqual([]);
    expect(findingKinds(beyond)).toEqual([]);
    const said = listed(beyond).current[0]?.nudges[0] ?? "";
    expect(said).toContain(
      "a standing choice applies only where the proceed setting admits the mode, so have the owner choose the mode",
    );
    expect(said).not.toContain("request's words");
    expect(said).toContain(
      "took the mode 'careful' without waiting (choice: standing), and the proceed setting 'regular' does not allow it",
    );
    expect(notice("regular", "none")).toHaveLength(1);
    expect(notice("regular", "regular")).toEqual([]);
    expect(notice("quick", "regular")).toEqual([]);
    expect(notice("careful", undefined)).toEqual([]);
    const accepted = change("2026-10-14-a", [
      "mode: careful",
      "choice: accepted",
      'why: "w"',
      "state: open",
    ]);
    expect(noticeKinds(derive({ ...changesInput([accepted]), proceed: "none" }))).toEqual([]);
  });
});

describe("J-73 S4 the changes list shows each open and stopped change's next line", () => {
  it("J-73 S4 each open or stopped row prints its next line beside its state, and a finished row prints none", () => {
    const outcome = derive(
      changesInput([
        change("2026-10-14-a", [
          ...quickOpen.slice(0, 3),
          "state: stopped",
          'next: "verify: rerun the checks"',
        ]),
        change("2026-10-14-b", [...quickOpen, 'next: "build: write the retry"']),
        change("2026-10-14-c", quickOpen),
        change("2026-10-13-d", quickDone, QUICK_BODY, passed),
      ]),
    );
    const report = listed(outcome);
    expect(report.current.map((view) => view.next)).toEqual([
      "verify: rerun the checks",
      "build: write the retry",
      null,
    ]);
    const text = renderChangesText(outcome.report);
    expect(text).toContain("    2026-10-14-a  stopped, next verify: rerun the checks  quick (");
    expect(text).toContain("    2026-10-14-b  open, next build: write the retry  quick (");
    expect(text).toContain("    2026-10-14-c  open  quick (");
    expect(text).toContain("    2026-10-13-d  done  quick (");
  });
});

describe("the changes view: recorded facts kept, and a probe marked", () => {
  const A = "20261004T100000000Z-aaaaaa.json";
  const B = "20261004T110000000Z-bbbbbb.json";
  const C = "20261004T120000000Z-cccccc.json";
  function named(entries: readonly (readonly [string, CheckFacts])[]): ChangeOnDisk["folder"] {
    return ok({
      reports: [],
      briefs: [],
      hookRuns: [],
      checks: entries.map(([name, facts]) => ({ file: `checks/${name}`, parsed: ok(facts) })),
    });
  }
  const at = (hour: string, more: RunFacts = {}): CheckFacts =>
    run(["t"], { startedAt: `2026-10-04T${hour}:00:00.000Z`, ...more });
  const after = (facts: CheckFacts, previous: string): CheckFacts => ({ ...facts, previous });
  const probe = (facts: CheckFacts): CheckFacts => ({ ...facts, probe: true });

  it("J-84 S2 a fact that names a facts file missing from its folder is a notice, GL0459's, naming both", () => {
    const outcome = derive(
      changesInput([
        change("2026-10-04-a", quickOpen, [], named([[C, after(at("12"), B)]])),
        change(
          "2026-10-04-b",
          quickOpen,
          [],
          named([
            [A, at("10")],
            [B, after(at("11"), A)],
          ]),
        ),
      ]),
    );
    expect(outcome.findings).toEqual([]);
    expect(outcome.notices.map((note) => [note.kind, note.path, note.message])).toEqual([
      [
        "fact-missing",
        `.greenline/ledger/2026-10-04-a/checks/${B}`,
        `the check facts '${C}' of '2026-10-04-a' follow '${B}', which is not in its folder: a recorded fact is never removed or edited; restore it from history where it was committed, and say in the record what it held`,
      ],
    ]);
  });

  it("J-84 S2 a fact is missing whatever the change's state, a finished one's included", () => {
    const kinds = noticeKinds(
      derive(
        changesInput([
          change("2026-10-04-a", quickDone, QUICK_BODY, named([[C, after(at("12"), B)]])),
        ]),
      ),
    );
    expect(kinds).toEqual(["fact-missing"]);
  });

  it("J-84 S2 a run marked a probe is left out of the checks: no GL0404 on a done change, and no row in the view", () => {
    const outcome = derive(
      changesInput([
        change(
          "2026-10-04-a",
          quickDone,
          QUICK_BODY,
          named([
            [A, probe(run(["probe"], { code: 1, startedAt: "2026-10-04T10:00:00.000Z" }))],
            [B, after(at("11"), A)],
          ]),
        ),
      ]),
    );
    expect(outcome.findings).toEqual([]);
    expect(listed(outcome).finished[0]?.checks.map((check) => check.arguments)).toEqual([["t"]]);
  });

  it("J-84 S2 a facts file that does not parse is restored, never removed, by GL0401's remedy", () => {
    const outcome = derive(
      changesInput([
        change(
          "2026-10-04-a",
          quickOpen,
          [],
          ok({
            reports: [],
            briefs: [],
            hookRuns: [],
            checks: [
              {
                file: `checks/${A}`,
                parsed: contractFailure(`checks/${A}`, [{ path: "", message: "bad" }]),
              },
            ],
          }),
        ),
      ]),
    );
    expect(outcome.findings.map((note) => [note.kind, note.message])).toEqual([
      [
        "unparsed",
        `the check facts 'checks/${A}' of '2026-10-04-a' do not parse: bad; greenline check writes them and a recorded fact is never removed: restore the file from history, or read it with a greenline as new as the one that wrote it; where neither can, tell the owner, who decides`,
      ],
    ]);
  });

  it("J-84 S2 a done change whose only facts are marked probes has no check facts, GL0456's notice", () => {
    const outcome = derive(
      changesInput([
        change("2026-10-04-a", quickDone, QUICK_BODY, named([[A, probe(at("10", { code: 1 }))]])),
      ]),
    );
    expect(outcome.findings).toEqual([]);
    expect(noticeKinds(outcome)).toEqual(["unchecked"]);
  });

  it("J-84 S2 a probe's mark on a later run does not hide the check's own red run", () => {
    const outcome = derive(
      changesInput([
        change(
          "2026-10-04-a",
          quickDone,
          QUICK_BODY,
          named([
            [A, at("10", { code: 1 })],
            [B, after(probe(at("11")), A)],
          ]),
        ),
      ]),
    );
    expect(findingKinds(outcome)).toEqual(["checks-failed"]);
  });

  it("J-84 S2 a probe whose code moved after it raises no GL0451", () => {
    const C0 = hash("0");
    const C1 = hash("1");
    const history: GitHistory = {
      kind: "read",
      head: C1,
      commits: [
        logged(C1, [C0], [["M", "src/a.ts"]], ["2026-10-04-a"]),
        logged(C0, [], [["A", ledger("2026-10-04-a")]]),
      ],
    };
    const outcome = derive(
      changesInput(
        [
          change(
            "2026-10-04-a",
            quickDone,
            QUICK_BODY,
            named([
              [A, probe(run(["probe"], { commit: C0, tree: "d".repeat(40), code: 1 }))],
              [B, after(run(["t"], { commit: C1, tree: "f".repeat(40) }), A)],
            ]),
          ),
        ],
        { history },
      ),
      LIST,
      gitAnswers({ [C1]: "f".repeat(40), [C0]: "d".repeat(40) }, undefined, {
        [diffKey(C0, { kind: "commit", hash: C1 })]: ["src/a.ts"],
      }),
    );
    expect(outcome.notices).toEqual([]);
    expect(outcome.findings).toEqual([]);
  });
});

describe("J-89 S1 the briefs greenline brief wrote", () => {
  const ID = "2026-10-04-a";
  const highOpen = ["mode: careful", "choice: accepted", 'why: "w"', "state: open"];
  const highBody = ["## frame", "x", "## plan", "- it holds", "## build", "x"];
  const written = (step: "review" | "verify", round: number) => {
    const text = recordText(highOpen, highBody);
    const record = parseChangeRecord(definition, `${ID}.md`, text);
    if (record._tag === "err") throw record.error;
    const brief = composeBrief(
      {
        change: ID,
        step,
        round,
        axis: undefined,
        intent: step === "review" ? "The intent." : undefined,
      },
      {
        definition,
        record: record.value,
        recordText: text,
        tickets: undefined,
        skillPages: [],
        scratch: `/repo/.greenline/tmp/${ID}/${step}-${String(round)}`,
      },
    );
    if (brief._tag === "refused") throw new Error(brief.message);
    return { file: brief.file.slice(`.greenline/ledger/${ID}/`.length), text: brief.text };
  };
  const onDisk = (
    briefs: readonly { readonly file: string; readonly text: string | undefined }[],
  ): ChangeOnDisk["folder"] =>
    folder(
      [],
      briefs.map((brief) => brief.file),
      briefs,
    );

  it("lists the briefs the command wrote in the resume view and its JSON, for the close to cite", () => {
    const review = written("review", 1);
    const verify = written("verify", 1);
    const outcome = derive(
      changesInput([change(ID, highOpen, highBody, onDisk([verify, review]))]),
      { view: "resume", change: ID },
    );
    expect(outcome.findings).toEqual([]);
    if (outcome.report.view !== "resume") throw new Error("the resume view expected");
    expect(outcome.report.change.briefs).toEqual([
      { file: "brief-review-1.md", step: "review", round: 1 },
      { file: "brief-verify-1.md", step: "verify", round: 1 },
    ]);
    expect(renderChangesText(outcome.report)).toContain(
      "  briefs greenline brief wrote: brief-review-1.md, brief-verify-1.md; the close cites each",
    );
  });

  it("shows no briefs line where the command wrote none", () => {
    const outcome = derive(changesInput([change(ID, highOpen, highBody, onDisk([]))]), {
      view: "resume",
      change: ID,
    });
    if (outcome.report.view !== "resume") throw new Error("the resume view expected");
    expect(outcome.report.change.briefs).toEqual([]);
    expect(renderChangesText(outcome.report)).not.toContain("briefs");
  });

  it("reports a brief file the command did not write as a finding, unmarked or altered, in a change of any state", () => {
    const review = written("review", 1);
    const unmarked = { file: "brief-review-2.md", text: "# My brief for the second reviewer\n" };
    const copied = { file: "brief-review-2.md", text: review.text };
    const edited = { file: "brief-review-1.md", text: `${review.text}and one more thing\n` };
    for (const brief of [unmarked, copied, edited]) {
      const outcome = derive(changesInput([change(ID, highOpen, highBody, onDisk([brief]))]));
      expect(findingKinds(outcome)).toEqual(["brief-unwritten"]);
      const [note] = outcome.findings;
      expect(note?.path).toBe(`.greenline/ledger/${ID}/${brief.file}`);
      expect(note?.message).toContain(`greenline brief --change ${ID}`);
      expect(note?.message).toContain("never opens, copies, diffs or derives");
    }
    const done = ["mode: careful", "choice: accepted", 'why: "w"', "state: done"];
    const finished = derive(changesInput([change(ID, done, highBody, onDisk([unmarked]))]));
    expect(findingKinds(finished)).toContain("brief-unwritten");
  });

  it("names a finished change's brief no link of its record cites, as any file of its folder", () => {
    const review = written("review", 1);
    const done = ["mode: quick", "choice: accepted", 'why: "w"', "state: done"];
    const uncited = derive(
      changesInput([change(ID, done, QUICK_BODY, folder([run(["t"])], [review.file], [review]))]),
    );
    expect(uncited.notices.map((note) => [note.kind, note.path])).toEqual([
      ["uncited", `.greenline/ledger/${ID}/brief-review-1.md`],
    ]);
    const citing = [...QUICK_BODY.slice(0, -1), `Briefs: [review 1](${ID}/brief-review-1.md).`];
    const cited = derive(
      changesInput([change(ID, done, citing, folder([run(["t"])], [review.file], [review]))]),
    );
    expect(noticeKinds(cited)).toEqual([]);
  });

  it("reports a brief file that cannot be read as a finding too", () => {
    const outcome = derive(
      changesInput([
        change(ID, highOpen, highBody, onDisk([{ file: "brief-review-1.md", text: undefined }])),
      ]),
    );
    expect(findingKinds(outcome)).toEqual(["brief-unwritten"]);
  });
});

describe("J-89 S2 the commits since the last recorded check", () => {
  const ID = "2026-10-04-a";
  const resume: ChangesRequest = { view: "resume", change: ID };
  const at = (minute: number): string => `2026-10-04T12:${String(minute).padStart(2, "0")}:00.000Z`;
  const commits = (
    hashes: readonly string[],
    oldestTree: string | undefined = undefined,
  ): CommitsSince => ({
    kind: "commits",
    hashes,
    oldestTree:
      hashes.length === 0
        ? undefined
        : oldestTree === undefined
          ? { kind: "unknown", reason: "not in the test" }
          : { kind: "tree", id: oldestTree },
  });
  const resumed = (
    runs: readonly CheckFacts[],
    since: Readonly<Record<string, CommitsSince>>,
    front: readonly string[] = quickOpen,
  ): Extract<ChangesReport, { view: "resume" }> & { readonly text: string } => {
    const outcome = derive(
      changesInput([change(ID, front, [], folder(runs))]),
      resume,
      gitAnswers({}, undefined, {}, since),
    );
    expect(outcome.findings).toEqual([]);
    if (outcome.report.view !== "resume") throw new Error("the resume view expected");
    return { ...outcome.report, text: renderChangesText(outcome.report) };
  };

  it("counts the commits of code on the branch after the commit the last recorded run started on, in the resume view and its JSON", () => {
    const view = resumed(
      [
        run(["npm", "test"], { commit: hash("1"), startedAt: at(1) }),
        run(["npm", "run", "lint"], { commit: hash("2"), startedAt: at(2) }),
      ],
      { [hash("2")]: commits([hash("5"), hash("4"), hash("3")]) },
    );
    expect(view.change.sinceCheck).toEqual({ kind: "counted", commits: 3, startedAt: at(2) });
    expect(view.text).toContain(
      `  3 commits since the last recorded check, started ${at(2)}: run the change's checks again through greenline check -- <command>`,
    );
  });

  it("leaves out the commit that holds exactly the code the last run saw on uncommitted work", () => {
    const view = resumed([run(["npm", "test"], { commit: hash("2"), tree: hash("e") })], {
      [hash("2")]: commits([hash("4"), hash("3")], hash("e")),
    });
    expect(view.change.sinceCheck).toMatchObject({ kind: "counted", commits: 1 });
    expect(view.text).toContain("  1 commit since the last recorded check, started");
  });

  it("prints no line when no commit came after the last recorded run, the JSON counting none", () => {
    const view = resumed([run(["npm", "test"], { commit: hash("2"), tree: hash("e") })], {
      [hash("2")]: commits([hash("3")], hash("e")),
    });
    expect(view.change.sinceCheck).toMatchObject({ kind: "counted", commits: 0 });
    expect(view.text).not.toContain("since the last recorded check");
  });

  it("counts none while the working tree's code is the code the last run saw, its work committed in two commits", () => {
    const outcome = derive(
      changesInput([
        change(
          ID,
          quickOpen,
          [],
          folder([run(["npm", "test"], { commit: hash("2"), tree: hash("e") })]),
        ),
      ]),
      resume,
      gitAnswers({}, hash("e"), {}, { [hash("2")]: commits([hash("4"), hash("3")], hash("d")) }),
    );
    if (outcome.report.view !== "resume") throw new Error("the resume view expected");
    expect(outcome.report.change.sinceCheck).toMatchObject({ kind: "counted", commits: 0 });
    expect(renderChangesText(outcome.report)).not.toContain("since the last recorded check");
  });

  it("reads a run that recorded no commit against every commit of code on the branch", () => {
    const view = resumed([run(["npm", "test"], { commit: null })], {
      "": commits([hash("4"), hash("3")]),
    });
    expect(view.change.sinceCheck).toMatchObject({ kind: "counted", commits: 2 });
  });

  it("leaves a run marked a probe out of the last recorded check", () => {
    const view = resumed(
      [
        run(["npm", "test"], { commit: hash("1"), startedAt: at(1) }),
        { ...run(["node", "bench.js"], { commit: hash("2"), startedAt: at(2) }), probe: true },
      ],
      { [hash("1")]: commits([hash("3"), hash("2")]), [hash("2")]: commits([hash("3")]) },
    );
    expect(view.change.sinceCheck).toEqual({ kind: "counted", commits: 2, startedAt: at(1) });
  });

  it("states none recorded for an open change with no check, and prints no line beside its checks: none", () => {
    const view = resumed([], {});
    expect(view.change.sinceCheck).toEqual({ kind: "none-recorded" });
    expect(view.text).toContain("  checks: none");
    expect(view.text).not.toContain("since the last recorded check");
  });

  it("says why the count is unknown when git cannot say", () => {
    const view = resumed([run(["npm", "test"], { commit: hash("2") })], {
      [hash("2")]: { kind: "unknown", reason: "the commit is not on the branch" },
    });
    expect(view.change.sinceCheck).toEqual({
      kind: "unknown",
      why: "the commit is not on the branch",
    });
    expect(view.text).toContain(
      "  commits since the last recorded check: unknown (the commit is not on the branch)",
    );
  });

  it("is a nudge, never a finding or a notice, and only for an open change", () => {
    const many = { [hash("2")]: commits([hash("9"), hash("8"), hash("7")]) };
    const facts = [run(["npm", "test"], { commit: hash("2") })];
    const open = derive(
      changesInput([change(ID, quickOpen, [], folder(facts))]),
      resume,
      gitAnswers({}, undefined, {}, many),
    );
    expect(open.findings).toEqual([]);
    expect(open.notices).toEqual([]);
    const stopped = resumed(facts, many, [
      "mode: quick",
      "choice: accepted",
      'why: "a typo"',
      "state: stopped",
      'next: "build: resume"',
    ]);
    expect(stopped.change.sinceCheck).toBeNull();
    expect(stopped.text).not.toContain("since the last recorded check");
  });

  it("asks git only for the open changes the view shows, from the commit of each one's last recorded run", () => {
    const input = changesInput([
      change(ID, quickOpen, [], folder([run(["npm", "test"], { commit: hash("2") })])),
      change("2026-10-04-b", quickDone, QUICK_BODY, folder([run(["t"], { commit: hash("3") })])),
    ]);
    expect(codeQuestions(assessChanges(input, LIST)).since).toEqual([hash("2")]);
  });
});

describe("J-89 S3 a cost below the starts its record names", () => {
  const ID = "2026-10-04-a";
  const highOpen = ["mode: careful", "choice: accepted", 'why: "w"', "state: open"];
  const body = ["## frame", "x", "## plan", "- it holds", "## build", "x"];
  const starts = (...items: readonly string[]): readonly string[] => [
    "starts:",
    ...items.map((item) => `  - "${item}"`),
  ];
  const costed = (agents: number, ...items: readonly string[]): readonly string[] => [
    ...highOpen,
    `agents: ${agents}`,
    "rounds: 1",
    ...(items.length === 0 ? [] : starts(...items)),
  ];
  const outcomeOf = (front: readonly string[], reports: readonly string[] = []) =>
    derive(changesInput([change(ID, front, body, folder([], reports))]));

  it("reports a cost that counts a restarted agent as the same one, naming the builder and every start", () => {
    const outcome = outcomeOf(costed(3, "review 1", "review 1 restarted", "verify 1"));
    expect(findingKinds(outcome)).toEqual(["cost-below-starts"]);
    const [note] = outcome.findings;
    expect(note?.path).toBe(ledger(ID));
    expect(note?.message).toContain(
      `the cost of '${ID}' counts 3 agents, fewer than the 4 its record names: the builder, review 1, review 1 restarted and verify 1`,
    );
    expect(note?.message).toContain("a restart one more");
    expect(
      findingKinds(outcomeOf(costed(4, "review 1", "review 1 restarted", "verify 1"))),
    ).toEqual([]);
  });

  it("counts each report of a fresh agent in the folder as a start its record names, and nothing else there", () => {
    expect(findingKinds(outcomeOf(costed(2), ["review-1.md", "review-2.md"]))).toEqual([
      "cost-below-starts",
    ]);
    expect(
      findingKinds(
        outcomeOf(costed(3, "review 1"), [
          "review-1.md",
          "review-2.md",
          "brief-review-1.md",
          "verify/readme/verdict.md",
          "notes-1.md",
        ]),
      ),
    ).toEqual([]);
  });

  it("counts no report of a step the mode runs without fresh agents: a method's agent's report counts nowhere", () => {
    expect(findingKinds(outcomeOf(costed(1), ["frame-1.md", "build-1.md"]))).toEqual([]);
    const quick = derive(
      changesInput([
        change(
          ID,
          [...quickOpen, "agents: 1", "rounds: 0"],
          QUICK_BODY,
          folder([], ["review-1.md", "verify-1.md"]),
        ),
      ]),
    );
    expect(findingKinds(quick)).toEqual([]);
  });

  it("counts a restart's first start where the record names the restart alone", () => {
    const outcome = outcomeOf(costed(2, "review 1 restarted"));
    expect(findingKinds(outcome)).toEqual(["cost-below-starts"]);
    expect(outcome.findings[0]?.message).toContain(
      "fewer than the 3 its record names: the builder, review 1 and review 1 restarted",
    );
  });

  it("judges no record that states no cost, and a done record the same as an open one", () => {
    expect(findingKinds(outcomeOf([...highOpen, ...starts("review 1", "review 2")]))).toEqual([]);
    const done = derive(
      changesInput([
        change(
          ID,
          [
            "mode: careful",
            "choice: accepted",
            'why: "w"',
            "state: done",
            "agents: 1",
            "rounds: 0",
          ],
          QUICK_BODY,
          folder([run(["pnpm", "test"])], ["review-1.md"]),
        ),
      ]),
    );
    expect(findingKinds(done)).toContain("cost-below-starts");
  });
});

describe("J-93 S3 the declared checks and the harness's events in the changes view", () => {
  const unit = { name: "unit", command: "pnpm run test", dir: "." };
  const hookRun: HookRun = {
    schemaVersion: 1,
    source: "hook",
    harness: "codex",
    check: "unit",
    arguments: ["pnpm run test"],
    dir: ".",
    startedAt: "2026-10-04T13:00:00.000Z",
    commit: null,
    tree: null,
    treeAt: "run-end",
    installation: null,
    state: "finished",
    outcome: { kind: "unknown", code: null },
    durationMs: null,
  };
  const withRuns = (
    checks: readonly CheckFacts[],
    hooks: readonly HookRun[],
  ): ChangeOnDisk["folder"] =>
    ok({
      reports: [],
      briefs: [],
      checks: checks.map((facts, index) => ({ file: `checks/${index}.json`, parsed: ok(facts) })),
      hookRuns: hooks.map((runFacts, index) => ({
        file: `checks/h${index}.json`,
        parsed: ok(runFacts),
      })),
    });

  it("shows each declared check's latest run, check's or a hook's, in the resume view, a hook's never a finding", () => {
    const outcome = derive(
      changesInput(
        [
          change(
            "2026-10-04-a",
            quickOpen,
            [],
            withRuns([run(["pnpm", "run", "test"], { code: 1 })], [hookRun]),
          ),
        ],
        { checks: [unit] },
      ),
      { view: "resume", change: "2026-10-04-a" },
    );
    if (outcome.report.view !== "resume") throw new Error("a resume view");
    expect(outcome.report.change.declaredChecks.map((standing) => standing.latest)).toEqual([
      { by: "hook", outcome: "unknown", harness: "codex", at: "2026-10-04T13:00:00.000Z" },
    ]);
    expect(renderChangesText(outcome.report)).toContain(
      "    unit (pnpm run test): ran, its outcome unknown by the codex hook; only a run through greenline check counts for the close",
    );
    expect(outcome.findings).toEqual([]);
  });

  it("nudges a done record whose agents differ from the builder and the fresh agents its events counted", () => {
    const done = (agents: number) =>
      change(
        "2026-10-04-a",
        [...quickDone, `agents: ${String(agents)}`, "rounds: 0"],
        QUICK_BODY,
        withRuns([run(["t"])], []),
      );
    const nudges = (agents: number) =>
      listed(
        derive(changesInput([done(agents)], { agentsCounted: new Map([["2026-10-04-a", 2]]) })),
      ).finished.flatMap((view) => view.nudges);
    expect(nudges(1)).toEqual([
      "its harness's events counted 2 fresh agents and its record states agents: 1; the cost counts the builder and each fresh agent",
    ]);
    expect(nudges(3)).toEqual([]);
  });
});
