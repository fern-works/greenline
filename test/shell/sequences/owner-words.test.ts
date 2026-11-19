/**
 * The owner's words before each act a record line lifts, walked as the pages
 * give them: corpus/runtime/ledger.md, "Commits" ("A line lifts its act only
 * from the committed record ... quote the owner's words into the line,
 * commit the record alone, as a stop commits it, then run the act");
 * corpus/skills/build/references/greenline.md, "Commits"; and
 * corpus/skills/close/references/greenline.md, "The landing".
 *
 * For each act, discard, rebase and landing: refused without its line;
 * refused with the line in the working tree alone, the refusal naming the
 * commit to make; allowed once the record is committed alone with the words.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  BRANCH,
  cleanUp,
  commitCode,
  commitRecord,
  fire,
  type Harness,
  RECORD,
  recordText,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  shellEvent,
  workspace,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

const OPEN = ["choice: accepted", "state: open"];

/** A change opened on its branch with a path remote and one commit of code. */
function built() {
  const space = workspace("path");
  space.git("checkout", "--quiet", "-b", BRANCH);
  expect(commitRecord(space, recordText(OPEN), "open").code).toBe(0);
  expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
  return space;
}

describe.skipIf(SEQUENCES_OFF)("the owner's words before each lifted act", () => {
  it.each<Harness>(["claude-code", "codex"])(
    "discard on %s: refused without the line, refused from the working tree, allowed once committed alone",
    (harness) => {
      const space = built();
      const reset = (call: string) =>
        fire(space, harness, shellEvent(space, harness, "PreToolUse", call, "git reset --hard"));
      const without = reset("d1");
      expect(without.code).toBe(2);
      expect(without.err).toContain("holds no discard line");
      space.write(RECORD, recordText([...OPEN, 'discard: "throw the spike away, the owner"']));
      const working = reset("d2");
      expect(working.code).toBe(2);
      expect(working.err).toContain(
        "the owner's words in the discard line of .greenline/ledger/2026-10-27-shelf.md stand only in the working tree",
      );
      expect(working.err).toContain(`git commit -m "record the owner's words" -- ${RECORD}`);
      space.git("add", "--", RECORD);
      expect(space.git("commit", "--quiet", "-m", "record the owner's words").code).toBe(0);
      expect(reset("d3").code).toBe(0);
      space.write("src/shelf.ts", "work to throw away\n");
      expect(space.git("reset", "--quiet", "--hard").code).toBe(0);
      expect(space.read(RECORD)).toContain("discard:");
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "rebase: refused without the line, an amend carrying it in refused, allowed once committed alone",
    () => {
      const space = built();
      space.git("checkout", "--quiet", "main");
      expect(commitCode(space, "m.txt", "main moves").code).not.toBe(0);
      space.write("m.txt", "m\n");
      space.git("add", "m.txt");
      expect(space.git("commit", "--quiet", "--no-verify", "-m", "main moves").code).toBe(0);
      space.git("checkout", "--quiet", BRANCH);
      const without = space.git("rebase", "--quiet", "main");
      expect(without.code).not.toBe(0);
      expect(without.err).toContain("carries no rebase line");
      space.write(RECORD, recordText([...OPEN, 'rebase: "regroup onto main, the owner"']));
      const carried = space.git("commit", "--quiet", "--amend", "--all", "-m", "build, reworded");
      expect(carried.code).not.toBe(0);
      expect(carried.err).toContain("holds the rebase line only in the working tree");
      space.git("add", "--", RECORD);
      expect(space.git("commit", "--quiet", "-m", "record the owner's rebase words").code).toBe(0);
      const rebased = space.git("rebase", "--quiet", "main");
      expect(rebased.code, rebased.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "landing: a push of the branch refused without the line and from the working tree, allowed once committed alone",
    () => {
      const space = built();
      const without = space.git("push", "--quiet", "origin", BRANCH);
      expect(without.code).not.toBe(0);
      expect(without.err).toContain("carries no landing line");
      // A push mid-change is named so, the record open (J-148 S2).
      expect(without.err).toContain("mid-change while the record is open, and");
      space.write(RECORD, recordText([...OPEN, 'landing: "push it, the owner"']));
      const working = space.git("push", "--quiet", "origin", BRANCH);
      expect(working.code).not.toBe(0);
      expect(working.err).toContain("holds the landing line only in the working tree");
      space.git("add", "--", RECORD);
      expect(space.git("commit", "--quiet", "-m", "record the owner's landing words").code).toBe(0);
      const pushed = space.git("push", "--quiet", "origin", BRANCH);
      expect(pushed.code, pushed.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );
});
