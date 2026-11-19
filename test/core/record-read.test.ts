/**
 * The commit's door on a record status cannot read (J-208 S1, the run
 * j196t-conduct-emptyc, the judge's finding 1): the record's text read with
 * the parser `greenline status` reads it with, and the refusal git's
 * pre-commit hook and the harness hook give, under record-form, its first
 * sentence the parser's own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unreadRecord } from "../../src/core/change.ts";
import { recordReadVerdict } from "../../src/core/git-hooks.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";

const modesPath = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");

function corpus(): ModesDefinition {
  const parsed = parseModes(readFileSync(modesPath, "utf8"), modesPath);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const definition = corpus();
const ID = "2026-11-08-greeting-module";

/** The record the run's done commit cf51e27 carried, its front matter whole, with the starts given. */
function closed(starts: string, state = "done"): string {
  return [
    "---",
    "mode: regular",
    "choice: owner",
    "proposed: quick",
    'why: "Start a small greeting module with a test."',
    `state: ${state}`,
    'stopped: "Stop here for today; we carry on later."',
    "next: none",
    "ground: branch",
    'discard: "Throw away the edits you have not committed, with a hard reset."',
    'rebase: "Reword the last commit."',
    'agent: "codex/gpt-6.1-terra"',
    "floors: []",
    "interface: no",
    "reviewed: independent",
    "agents: 4",
    "rounds: 0",
    `starts: ${starts}`,
    "skills: [frame, groundwork, design, plan, build, tdd, ponytail, prose, pr-writing, close, show-me, explain, diagram-design, architecture-map, router, review, verify]",
    'outcome: "A Python greeting function returns the supplied name with a full stop, with a test and usage documentation."',
    "---",
    "",
    "## frame",
    "",
    "`frame` and `groundwork`: Build a Python function that returns a greeting for a supplied name, with a test.",
    "",
    "## review",
    "",
    "`review`: The independent review found no standards or specification issues.",
    "",
    "## close",
    "",
    "`close`: nothing to land: the commits are on main.",
    "",
  ].join("\n");
}

const HELPERS = '["diagram-design 1", "diagram-design 2", "review 1"]';

describe("J-208 S1 a record read as status reads it, and the commit's door on one it cannot read (j196t-conduct-emptyc)", () => {
  it("names the run's two helper starts in the parser's words, and reads the record once the starts name no helper", () => {
    expect(unreadRecord(definition, `${ID}.md`, closed(HELPERS))).toBe(
      "starts[0]: the start 'diagram-design 1' names 'diagram-design', which is not a step (.greenline/ledger/README.md); starts[1]: the start 'diagram-design 2' names 'diagram-design', which is not a step (.greenline/ledger/README.md)",
    );
    expect(unreadRecord(definition, `${ID}.md`, closed('["review 1"]'))).toBeUndefined();
  });

  it("reads a record's form alone where no definition is read, and a dropped record as history, as status does", () => {
    expect(unreadRecord(undefined, `${ID}.md`, closed(HELPERS))).toBeUndefined();
    expect(unreadRecord(definition, `${ID}.md`, closed(HELPERS, "dropped"))).toBeUndefined();
    // A form status cannot read is refused whatever the definition.
    expect(unreadRecord(undefined, `${ID}.md`, closed('["review one"]'))).toContain(
      `starts[0]: a start is "<step> <n>", or "<step> <n> restarted" for a restart, and 'review one' is neither`,
    );
  });

  it("refuses under record-form with the parser's sentence first, and allows a record that reads", () => {
    const issues = unreadRecord(definition, `${ID}.md`, closed(HELPERS));
    const verdict = recordReadVerdict(ID, issues);
    expect(verdict.kind).toBe("refuse");
    const reason = verdict.kind === "refuse" ? verdict.reason : "";
    expect(
      reason.startsWith(
        `the change record '${ID}' does not parse: starts[0]: the start 'diagram-design 1' names 'diagram-design', which is not a step`,
      ),
    ).toBe(true);
    expect(reason).toContain(`correct .greenline/ledger/${ID}.md and commit again`);
    expect(reason.endsWith("; record-form")).toBe(true);
    expect(recordReadVerdict(ID, undefined)).toEqual({ kind: "allow" });
  });
});
