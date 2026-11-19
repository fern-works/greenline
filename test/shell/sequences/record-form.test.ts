/**
 * The close refused over a record that breaks its forms (J-149 S1, S3; the
 * ledger guide, "The sections" and "Planned work"), walked on real git with
 * greenline's hooks: a frame question left with neither an answer nor
 * `answer: open` holds `done`, the record-form rule named; marked open, the
 * close goes through; and a plan extended during the change holds `done`
 * until its edit is committed with the close.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanUp,
  commitRecord,
  ID,
  outcomeOf,
  RECORD,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  workspace,
  writeCheck,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

/** A quick record whose frame holds one question in the list form, its lines given. */
function record(state: readonly string[], question: readonly string[]): string {
  return [
    "---",
    "mode: quick",
    'why: "the shelf finds books by author"',
    "choice: accepted",
    ...state,
    ...outcomeOf(["choice: accepted", ...state]),
    "---",
    "",
    "## frame",
    "",
    "- Q1 [scope] Does it find archived books?",
    ...question,
    "",
    "## close",
    "",
    "the checks green",
    "",
  ].join("\n");
}

describe.skipIf(SEQUENCES_OFF)("the record lint at the close, on main with no remote", () => {
  it(
    "refuses done over an unanswered frame question with one line naming it, and takes it marked open",
    () => {
      const space = workspace("none");
      expect(commitRecord(space, record(["state: open"], []), "open").code).toBe(0);
      writeCheck(space, 0, "10");
      const refused = commitRecord(
        space,
        record(["state: done", "next: none"], ["  - proposed: no", "  - decided: owner"]),
        "close",
      );
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `change ${ID} is not done while its record breaks its form: frame question Q1 holds no answer`,
      );
      expect(refused.err).toContain("; record-form, greenline's pre-commit hook");
      const taken = commitRecord(
        space,
        record(
          ["state: done", "next: none"],
          ["  - proposed: no", "  - answer: open", "  - decided: owner"],
        ),
        "close",
      );
      expect(taken.code, taken.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "refuses done while a plan the change extended holds an edit the commit leaves, and takes it staged",
    () => {
      const space = workspace("none");
      const answered = ["  - answer: no", "  - decided: owner"];
      expect(
        commitRecord(space, record(["state: open", "plan: 001-shelf"], answered), "open").code,
      ).toBe(0);
      // Another plan's edit is that plan's change's, never this close's to hold.
      space.write(".greenline/plans/002-other/spec.md", "# Spec\n");
      space.write(".greenline/plans/001-shelf/tickets.md", "# Tickets\n");
      space.git("add", "--", ".greenline/plans/001-shelf/");
      expect(space.git("commit", "--quiet", "-m", "the plan").code).toBe(0);
      space.write(".greenline/plans/001-shelf/tickets.md", "# Tickets\n\n## T2\n");
      writeCheck(space, 0, "10");
      const refused = commitRecord(
        space,
        record(["state: done", "next: none", "plan: 001-shelf"], answered),
        "close",
      );
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        "the plan's files .greenline/plans/001-shelf/tickets.md hold edits left uncommitted",
      );
      expect(refused.err).not.toContain("002-other");
      space.git("add", "--", ".greenline/plans/001-shelf/", RECORD, `.greenline/ledger/${ID}/`);
      const taken = space.git("commit", "--quiet", "-m", "close with the plan");
      expect(taken.code, taken.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "J-173 S1 refuses done while the record links neither its visuals nor the interface check's runs, and takes it linked",
    () => {
      const space = workspace("none");
      const answered = ["  - answer: no", "  - decided: owner"];
      expect(commitRecord(space, record(["state: open"], answered), "open").code).toBe(0);
      // What the hooks and the check wrote in the change's folder: the links file and one run.
      space.write(
        `.greenline/ledger/${ID}/visuals.json`,
        `${JSON.stringify({ generatedBy: "greenline event", change: ID, visuals: [{ id: `${ID}/capture-home`, title: "Capture of /", file: null, manifest: `.greenline/visuals/${ID}/capture-home.visual.json` }] })}\n`,
      );
      space.write(
        `.greenline/ledger/${ID}/interface/20261031T130840811Z-5e65f4.json`,
        `${JSON.stringify({ generatedBy: "greenline check interface" })}\n`,
      );
      writeCheck(space, 0, "10");
      const done = record(["state: done", "next: none"], answered);
      const refused = commitRecord(space, done, "close");
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `change ${ID} is not done while its record breaks its form: the done record does not link its visuals`,
      );
      expect(refused.err).toContain("; record-form, greenline's pre-commit hook");
      const linked = done.replace(
        "the checks green\n",
        `the checks green\n\n[visuals](${ID}/visuals.json), [interface check](${ID}/interface/)\n`,
      );
      const taken = commitRecord(space, linked, "close");
      expect(taken.code, taken.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "refuses done while the close says a mark waits that the marks files hold closed, or names a floor finding with no ruling (J-148 S3)",
    () => {
      const space = workspace("none");
      const answered = ["  - answer: no", "  - decided: owner"];
      expect(commitRecord(space, record(["state: open"], answered), "open").code).toBe(0);
      writeCheck(space, 0, "10");
      const done = ["state: done", "next: none"];
      const said = (marks: string, more = ""): string =>
        record(done, answered).replace(
          "the checks green\n",
          `the checks green\n- ${marks}\n${more}`,
        );
      // No mark stands open in the marks files: a close that says one waits is refused.
      const waiting = commitRecord(space, said("marks: 1 open on /settings"), "close");
      expect(waiting.code).not.toBe(0);
      expect(waiting.err).toContain(
        `the close section's marks line says "marks: 1 open on /settings", and the marks files say "marks: none open"`,
      );
      // A floor finding the record names with no ruling is refused too.
      const floor = commitRecord(
        space,
        said("marks: none open", "\n## Interface\n\n- floor target-size at the remove button\n"),
        "close",
      );
      expect(floor.code).not.toBe(0);
      expect(floor.err).toContain(
        "the floor finding target-size at the remove button has no ruling",
      );
      expect(floor.err).toContain("; record-form, greenline's pre-commit hook");
      // The status's line copied, the owner's ruling written: the close goes through.
      const taken = commitRecord(
        space,
        said(
          "marks: none open",
          '\n## Interface\n\n- floor target-size at the remove button: waived, "a dense table, keep it"\n',
        ),
        "close",
      );
      expect(taken.code, taken.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );
});
