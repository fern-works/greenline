/**
 * The interface home's files go with the change (J-228 S1; the register's
 * row of 2026-11-09, "Outcomes, not manners"), each case a run's own:
 * j217c-roster-use finding 13, whose close's interface check wrote
 * `.greenline/ledger/interface/paths.json`, whose close's commit left it out,
 * and whose door then refused it beside the done record; and
 * j201t-linear-visuals 001/028 `item_10`, where the same file aborted a merge.
 * The survey sheet and the path index are companions of a record a commit
 * stages: set aside beside a record or its folder, admitted beside a done
 * record, refused beside code after done as before, and read as before
 * where the commit stages no record or folder.
 */
import { describe, expect, it } from "vitest";
import { aloneChange, finishedRecordVerdict, type RecordFacts } from "../../src/core/git-hooks.ts";
import { PATHS_FILE, SURVEY_FILE } from "../../src/core/interface-home.ts";

const ID = "2026-11-10-settings";
const RECORD = `.greenline/ledger/${ID}.md`;
const FACT = `.greenline/ledger/${ID}/checks/2026-11-10T20-34-13.000Z-abc123.json`;
const DONE: RecordFacts = { readable: true, state: "done" };

describe("J-228 S1 the interface home's files go with the change (j217c-roster-use F13)", () => {
  it("reads a commit of a record or its folder with the interface home's files as the change's alone", () => {
    expect(aloneChange([RECORD, PATHS_FILE])).toBe(ID);
    expect(aloneChange([FACT, PATHS_FILE, SURVEY_FILE])).toBe(ID);
    expect(aloneChange([RECORD, FACT, SURVEY_FILE])).toBe(ID);
  });

  it("reads the interface home's files with no record or folder, or beside code, as before", () => {
    expect(aloneChange([PATHS_FILE])).toBeUndefined();
    expect(aloneChange([PATHS_FILE, SURVEY_FILE])).toBeUndefined();
    expect(aloneChange([RECORD, PATHS_FILE, "src/settings.ts"])).toBeUndefined();
  });

  it("admits the done record's commit with the path index, and refuses it beside code after done", () => {
    expect(finishedRecordVerdict(ID, DONE, [RECORD, PATHS_FILE])).toEqual({ kind: "allow" });
    expect(finishedRecordVerdict(ID, DONE, [RECORD, FACT, PATHS_FILE, SURVEY_FILE])).toEqual({
      kind: "allow",
    });
    const beside = finishedRecordVerdict(ID, DONE, [RECORD, PATHS_FILE, "src/settings.ts"]);
    expect(beside.kind).toBe("refuse");
    expect(JSON.stringify(beside)).toContain(
      `change ${ID} is done, so src/settings.ts cannot be committed beside its record`,
    );
    // The path index committed with no record or folder of the change reads as before.
    const alone = finishedRecordVerdict(ID, DONE, [PATHS_FILE]);
    expect(alone.kind).toBe("refuse");
    expect(JSON.stringify(alone)).toContain(
      `so ${PATHS_FILE} cannot be committed beside its record`,
    );
  });
});
