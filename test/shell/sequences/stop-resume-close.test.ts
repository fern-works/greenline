/**
 * The stop, the resume and the close on the default branch of a repository
 * with no remote, walked as the pages give them: corpus/runtime/ledger.md,
 * "Open and stopped" (every stop sets `stopped`, rewrites the next line and
 * commits the record and its folder alone; a resume sets it `open` as its
 * first write) and "Commits" (with no remote, a change's commits stay on the
 * current branch, the default branch included);
 * corpus/skills/close/references/greenline.md, "Stops"; and docs/SPEC.md,
 * the owner's yes settled once the record that quotes it is committed
 * (J-186 S1), so a fresh session resumes with no second yes.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanUp,
  commitCode,
  commitRecord,
  fire,
  ID,
  ownerSays,
  recordText,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  trailerOf,
  workspace,
  writeCheck,
  writeEvent,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

describe.skipIf(SEQUENCES_OFF)("the stop, the resume and the close on main with no remote", () => {
  it(
    "stops with the record alone, refuses code while stopped, resumes open as the first write, builds on and closes done",
    () => {
      const space = workspace("none");
      expect(space.git("remote").out).toBe("");
      const opened = commitRecord(space, recordText(["choice: accepted", "state: open"]), "open");
      expect(opened.code, opened.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      expect(commitCode(space, "src/shelf.ts", "build the finder").code).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      // The stop: stopped, its next line, the record and its folder alone, the change's trailer.
      writeCheck(space, 0, "10");
      const stopped = commitRecord(
        space,
        recordText([
          "choice: accepted",
          "state: stopped",
          'next: "build: the author index"',
          'stopped: "Stop there for today."',
        ]),
        "stop the change",
      );
      expect(stopped.code, stopped.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      // While it stands stopped, no change is open on main: code is refused.
      const meanwhile = commitCode(space, "src/index.ts", "code while stopped");
      expect(meanwhile.code).not.toBe(0);
      space.git("reset", "--quiet", "--", "src/index.ts");
      // The resume: open as the first write, committed with the record alone.
      const resumed = commitRecord(
        space,
        recordText(["choice: accepted", "state: open", 'next: "build: the author index"']),
        "resume the change",
      );
      expect(resumed.code, resumed.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      expect(commitCode(space, "src/index.ts", "build the author index").code).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      // The close: done over a green check, the close section written.
      writeCheck(space, 0, "11");
      const closed = commitRecord(
        space,
        recordText(["choice: accepted", "state: done", "next: none"], "the checks green"),
        "close the change",
      );
      expect(closed.code, closed.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      expect(space.git("status", "--porcelain").out).toBe("");
      // Done, the next code is a new change's.
      const later = commitCode(space, "src/later.ts", "after the close");
      expect(later.code).not.toBe(0);
      expect(later.err).toContain("no change is open on main");
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "resumes in a fresh session whose journal holds only the resume, the committed yes settled, with no second yes",
    () => {
      const space = workspace("none");
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: open"]), "open").code,
      ).toBe(0);
      const stopped = commitRecord(
        space,
        recordText([
          "choice: accepted",
          "state: stopped",
          'next: "build: the author index"',
          'stopped: "Stop there for today."',
        ]),
        "stop the change",
      );
      expect(stopped.code, stopped.err).toBe(0);
      // A fresh session: the hooks journal its one message, which holds no yes.
      expect(ownerSays(space, "claude-code", "Carry on with the author index.").code).toBe(0);
      const resumed = commitRecord(
        space,
        recordText(["choice: accepted", "state: open", 'next: "build: the author index"']),
        "resume the change",
      );
      expect(resumed.code, resumed.err).toBe(0);
      const write = fire(
        space,
        "claude-code",
        writeEvent(space, "claude-code", "PreToolUse", "r1", "src/index.ts"),
      );
      expect(write.code, write.err).toBe(0);
      expect(commitCode(space, "src/index.ts", "build the author index").code).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "refuses a close done over a red check, and takes the close once the check is green",
    () => {
      const space = workspace("none");
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: open"]), "open").code,
      ).toBe(0);
      expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
      writeCheck(space, 1, "10");
      const red = commitRecord(
        space,
        recordText(["choice: accepted", "state: done", "next: none"], "closing"),
        "close over red",
      );
      expect(red.code).not.toBe(0);
      writeCheck(space, 0, "11");
      space.git("add", "--", `.greenline/ledger/${ID}/`);
      const green = space.git("commit", "--quiet", "-m", "close over green");
      expect(green.code, green.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );
});
