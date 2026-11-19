/**
 * A push to the default branch, while the change is open and once it is
 * done, walked as the pages give it: corpus/runtime/ledger.md, "Commits" ("A
 * push that carries the change to the default branch is refused by git's
 * hooks and the harness hook while the record is not `done` in a commit,
 * whatever the `landing` line holds") and
 * corpus/skills/close/references/greenline.md, "The landing".
 *
 * The owner's ask is quoted into the landing line and committed while the
 * change is open: the harness hook, on each harness's payload, and pre-push
 * both refuse the push to main. The close commits the record done; the same
 * push goes through on both.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanUp,
  commitCode,
  commitRecord,
  fire,
  GROUND,
  type Harness,
  ID,
  recordText,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  ownerSays,
  shellEvent,
  workspace,
  writeCheck,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

const ASKED = 'landing: "Push it straight to main."';
const PUSH = "git push origin HEAD:main";

describe.skipIf(SEQUENCES_OFF)("a push to the default branch, open and then done", () => {
  it.each<Harness>(["claude-code", "codex"])(
    "on %s: refused while the record stands open in a commit, through once the close commits it done",
    (harness) => {
      const space = workspace("forge");
      space.git("checkout", "--quiet", "-b", GROUND);
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: open", ASKED]), "open").code,
      ).toBe(0);
      expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
      const guard = (call: string) =>
        fire(space, harness, shellEvent(space, harness, "PreToolUse", call, PUSH));
      const open = guard("p1");
      expect(open.code).toBe(2);
      expect(open.err).toContain("stands open in its last commit");
      const refused = space.git("push", "--quiet", "origin", "HEAD:main");
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `this push would put change ${ID} on the default branch before its close: the push updates refs/heads/main`,
      );
      // The close: done over a green check, the ask still in the landing line.
      writeCheck(space, 0, "10");
      const closed = commitRecord(
        space,
        recordText(["choice: accepted", "state: done", ASKED], "the checks green"),
        "close the change",
      );
      expect(closed.code, closed.err).toBe(0);
      // The owner's words the landing line quotes, heard by the hooks in the session (J-176 S1).
      ownerSays(space, harness, "Push it straight to main.");
      const done = guard("p2");
      expect(done.code, done.err).toBe(0);
      const pushed = space.git("push", "--quiet", "origin", "HEAD:main");
      expect(pushed.code, pushed.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );
});
