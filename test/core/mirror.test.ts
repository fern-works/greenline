/**
 * The facts table the status mirror prints while a change is open (J-144
 * S1; the block's reply section, "The facts"): the rows `Change`, `Mode`
 * with its cost, `Step` with its depth, `Where` and `View`, in that order,
 * each cell one clause under about forty characters, in the reply's own
 * `| Fact | Now |` form, which the reply copies and never composes. The
 * view line is printed alone no more, and nothing is printed while no
 * change is open.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  factsBlock,
  factsRows,
  modeCell,
  whereCell,
  type FactsInput,
} from "../../src/core/facts-table.ts";
import { mirrorLines, mirrorText } from "../../src/core/mirror.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";

const ID = "2026-10-26-find-by-year";

function definition(): ModesDefinition {
  const parsed = parseModes(
    readFileSync(join(import.meta.dirname, "../../corpus/runtime/modes.json"), "utf8"),
    "corpus/runtime/modes.json",
  );
  if (parsed._tag === "err") throw new Error("the corpus's modes definition does not parse");
  return parsed.value;
}

function modeNamed(name: string): FactsInput["mode"] {
  const line = definition();
  const mode = line.modes.find((entry) => entry.name === name);
  if (mode === undefined) throw new Error(`no mode ${name}`);
  return { definition: line, mode, touches: false };
}

const OPEN: FactsInput = {
  id: ID,
  mode: modeNamed("regular"),
  state: "open",
  step: "build",
  branch: `greenline/${ID}`,
  base: "main",
  ground: "branch",
  view: undefined,
};

const base = { checks: [], declared: 0, agents: 0, git: { state: "off" as const } };

describe("J-144 S1 the facts table's rows", () => {
  it("prints Change, Mode with its cost, Step with its depth, Where and View, in that order", () => {
    expect(factsRows(OPEN)).toEqual([
      { fact: "Change", now: ID },
      { fact: "Mode", now: "regular, 2 agents, 1 fix round" },
      { fact: "Step", now: "build, written" },
      { fact: "Where", now: `branch greenline/${ID} from main` },
      { fact: "View", now: "not serving" },
    ]);
    expect(factsRows({ ...OPEN, view: `http://127.0.0.1:7433/changes/${ID}` }).at(-1)).toEqual({
      fact: "View",
      now: `http://127.0.0.1:7433/changes/${ID}`,
    });
  });

  it("states each mode's cost in one phrase, the design step's agent counted only where the change touches an interface", () => {
    const line = definition();
    const named = (name: string) => line.modes.find((entry) => entry.name === name);
    const quick = named("quick");
    const careful = named("careful");
    if (quick === undefined || careful === undefined) throw new Error("no modes");
    expect(modeCell(line, quick, false)).toBe("quick, 1 agent, no fix round");
    expect(modeCell(line, careful, false)).toBe("careful, 5 agents, 2 fix rounds");
    expect(modeCell(line, careful, true)).toBe("careful, 6 agents, 2 fix rounds");
  });

  it("J-174 names the owner's accepted overrun in the Mode cell, and nothing where the record states none or the cost keeps the count", () => {
    const careful = modeNamed("careful");
    if (careful === undefined) throw new Error("no careful");
    const touching = { ...careful, touches: true };
    expect(
      factsRows({
        ...OPEN,
        mode: { ...touching, cost: { agents: 7, rounds: 1, overrun: "the extra helper is fine" } },
      })[1],
    ).toEqual({
      fact: "Mode",
      now: "careful, 6 agents, 2 fix rounds; 7 agents accepted by the owner",
    });
    expect(
      factsRows({ ...OPEN, mode: { ...touching, cost: { agents: 7, rounds: 1 } } })[1],
    ).toEqual({ fact: "Mode", now: "careful, 6 agents, 2 fix rounds" });
    expect(
      factsRows({
        ...OPEN,
        mode: { ...touching, cost: { agents: 6, rounds: 1, overrun: "the extra helper is fine" } },
      })[1],
    ).toEqual({ fact: "Mode", now: "careful, 6 agents, 2 fix rounds" });
  });

  it("names the ground as the branch from the default branch, the branch alone on the default, or the worktree", () => {
    expect(whereCell({ branch: `greenline/${ID}`, base: "main", ground: "branch" })).toBe(
      `branch greenline/${ID} from main`,
    );
    expect(whereCell({ branch: "main", base: "main", ground: "branch" })).toBe("branch main");
    expect(whereCell({ branch: "topic", base: undefined, ground: undefined })).toBe("branch topic");
    expect(whereCell({ branch: `greenline/${ID}`, base: "main", ground: "worktree: ../yr" })).toBe(
      `worktree ../yr on greenline/${ID}`,
    );
  });

  it("keeps the rows a record does not state out, prints the depth beside the step, and done once the record is", () => {
    expect(factsRows({ ...OPEN, mode: undefined, state: undefined, step: undefined })).toEqual([
      { fact: "Change", now: ID },
      { fact: "Where", now: `branch greenline/${ID} from main` },
      { fact: "View", now: "not serving" },
    ]);
    expect(factsRows({ ...OPEN, step: "review" })[2]).toEqual({
      fact: "Step",
      now: "review, independent",
    });
    expect(factsRows({ ...OPEN, state: "done", step: undefined })[2]).toEqual({
      fact: "Step",
      now: "done",
    });
  });

  it("holds each cell to one clause under about forty characters, the id and the address aside", () => {
    for (const mode of ["quick", "regular", "careful"])
      for (const step of ["frame", "plan", "build", "review", "verify", "close"])
        for (const row of factsRows({ ...OPEN, mode: modeNamed(mode), step })) {
          const cell = row.now.replace(ID, "<id>");
          expect(cell.length, `${row.fact}: ${cell}`).toBeLessThanOrEqual(40);
          expect(cell, row.fact).not.toMatch(/[.;:]|\band\b/);
        }
  });
});

describe("J-144 S1 the mirror prints the facts block in the table's own form", () => {
  const change = {
    id: ID,
    record: { readable: true, mode: "regular", state: "open", choice: "accepted" },
  };

  it("prints the block under the change's line, its rows in the reply's | Fact | Now | form", () => {
    const lines = mirrorText({ ...base, change, facts: factsRows(OPEN) }).split("\n");
    expect(lines.slice(1, 9)).toEqual([
      "facts:",
      "| Fact | Now |",
      "| --- | --- |",
      `| Change | ${ID} |`,
      "| Mode | regular, 2 agents, 1 fix round |",
      "| Step | build, written |",
      `| Where | branch greenline/${ID} from main |`,
      "| View | not serving |",
    ]);
    expect(factsBlock(factsRows(OPEN))).toEqual(lines.slice(1, 9));
  });

  it("states each row's fact, so the now page links the row to its view", () => {
    const facts = mirrorLines({ ...base, change, facts: factsRows(OPEN) })
      .slice(1, 9)
      .map((line) => line.fact);
    expect(facts).toEqual(["facts", "facts", "facts", "change", "mode", "step", "ground", "view"]);
  });

  it("prints the view in the block's View row alone, never as a line of its own", () => {
    const text = mirrorText({ ...base, change, facts: factsRows(OPEN) });
    expect(text).not.toMatch(/^\s*view:/m);
  });

  it("prints no block and no row while no change is open", () => {
    const text = mirrorText({ ...base, change: undefined });
    expect(text).not.toContain("facts:");
    expect(text).not.toContain("| Fact | Now |");
    expect(factsBlock([])).toEqual([]);
  });
});
