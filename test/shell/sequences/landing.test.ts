/**
 * The landing's order, walked as the pages give it:
 * corpus/skills/close/references/greenline.md, "The landing" (the local
 * merge's steps 1 to 5, and a forge's push of the change's branch), and
 * corpus/runtime/ledger.md, "Commits" (the record and its folder committed
 * alone in every state, the commit after a local landing's merge).
 *
 * One change is opened, built, checked and closed `done`; the owner's words
 * are written after the close and committed alone; then the landing the
 * remote's kind calls for runs: on a forge the push of the change's branch,
 * elsewhere the `--no-ff` merge with close's message, the check on the merge
 * commit and the commit of its facts, nothing else committed on main after.
 * Each on the change's own `greenline/<id>` branch and on a ground branch the
 * proposal named, on a forge's remote, a path remote and no remote.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BRANCH,
  checkOnMerge,
  cleanUp,
  commitCode,
  commitRecord,
  fire,
  GROUND,
  ID,
  type Origin,
  recordText,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  shellEvent,
  trailerOf,
  workspace,
  writeCheck,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

// The base the offer named and the owner's answer, as close's references write them (J-148 S2).
const WORDS = 'landing: "merge into main: land it, the owner"';
const CLOSE = "the checks green; the landing offered";

describe.skipIf(SEQUENCES_OFF)("the landing's order after the close", () => {
  const cases: Array<[Origin, string]> = [
    ["forge", BRANCH],
    ["forge", GROUND],
    ["path", BRANCH],
    ["path", GROUND],
    ["none", BRANCH],
    ["none", GROUND],
  ];
  it.each(cases)(
    "on a %s remote from %s: closed done, the words alone, then the landing the remote calls for",
    async (origin, branch) => {
      const space = workspace(origin);
      expect(space.git("checkout", "--quiet", "-b", branch).code).toBe(0);
      // Frame and build: the record committed open with the owner's yes, then the code.
      const opened = commitRecord(space, recordText(["choice: accepted", "state: open"]), "open");
      expect(opened.code, opened.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      const built = commitCode(space, "src/shelf.ts", "build the finder");
      expect(built.code, built.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      // The close: the check green, the state done and the close section, committed.
      writeCheck(space, 0, "10");
      const closed = commitRecord(
        space,
        recordText(["choice: accepted", "state: done"], CLOSE),
        "close the change",
      );
      expect(closed.code, closed.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      // The owner's words after the close, committed with the record alone.
      const words = commitRecord(
        space,
        recordText(["choice: accepted", "state: done", WORDS], CLOSE),
        "record the owner's landing words",
      );
      expect(words.code, words.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);

      if (origin === "forge") {
        // A forge's landing: the change's branch pushed, the harness hook and pre-push both letting it through.
        const push = `git push -u origin ${branch}`;
        expect(
          fire(space, "claude-code", shellEvent(space, "claude-code", "PreToolUse", "p1", push))
            .code,
        ).toBe(0);
        const pushed = space.git("push", "--quiet", "-u", "origin", branch);
        expect(pushed.code, pushed.err).toBe(0);
        return;
      }
      // A local merge: close's message, the --no-ff merge into main.
      const message = `.greenline/tmp/${ID}/merge-message.txt`;
      space.write(message, `Merge ${ID} into main\n\nGreenline-Change: ${ID}\n`);
      expect(space.git("checkout", "--quiet", "main").code).toBe(0);
      const merged = space.git("merge", "--quiet", "--no-ff", "-F", message, branch);
      expect(merged.code, merged.err).toBe(0);
      expect(space.git("log", "-1", "--format=%P").out.trim().split(" ")).toHaveLength(2);
      expect(trailerOf(space)).toBe(ID);
      rmSync(join(space.root, ".greenline/tmp"), { recursive: true, force: true });
      // The check on the merge commit, its facts committed with the record's folder alone.
      expect(await checkOnMerge(space, 0)).toBe(space.git("rev-parse", "HEAD").out.trim());
      space.git("add", "--", `.greenline/ledger/${ID}/`);
      const recorded = space.git("commit", "--quiet", "-m", "record the merge's check");
      expect(recorded.code, recorded.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
      expect(space.git("status", "--porcelain").out).toBe("");
      // Nothing else is committed on main.
      const after = commitCode(space, "src/later.ts", "after the landing");
      expect(after.code).not.toBe(0);
      expect(after.err).toContain("no change is open on main");
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "refuses the facts commit's done after a red check on the merge commit, and takes the record set back open",
    async () => {
      const space = workspace("path");
      space.git("checkout", "--quiet", "-b", BRANCH);
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: open"]), "open").code,
      ).toBe(0);
      expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
      writeCheck(space, 0, "10");
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: done", WORDS], CLOSE), "close")
          .code,
      ).toBe(0);
      const message = `.greenline/tmp/${ID}/merge-message.txt`;
      space.write(message, `Merge ${ID} into main\n\nGreenline-Change: ${ID}\n`);
      space.git("checkout", "--quiet", "main");
      expect(space.git("merge", "--quiet", "--no-ff", "-F", message, BRANCH).code).toBe(0);
      rmSync(join(space.root, ".greenline/tmp"), { recursive: true, force: true });
      await checkOnMerge(space, 1);
      space.git("add", "--", `.greenline/ledger/${ID}/`);
      const red = space.git("commit", "--quiet", "-m", "record the merge's red check");
      expect(red.code).not.toBe(0);
      // Step 4: on a red result the same commit sets the state back to open, its next line naming the check.
      const reopened = commitRecord(
        space,
        recordText(
          [
            "choice: accepted",
            "state: open",
            'next: "close: the check on the merge commit is red"',
            WORDS,
          ],
          `${CLOSE}; the merge stands red`,
        ),
        "the merge stands red",
      );
      expect(reopened.code, reopened.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "refuses a merge into a base the owner's words did not name, and one with no words, at the merge commit's hook (J-148 S2)",
    () => {
      const space = workspace("path");
      space.git("checkout", "--quiet", "-b", BRANCH);
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: open"]), "open").code,
      ).toBe(0);
      expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
      writeCheck(space, 0, "10");
      // The owner's words name another base.
      expect(
        commitRecord(
          space,
          recordText(
            ["choice: accepted", "state: done", 'landing: "merge into release: yes"'],
            CLOSE,
          ),
          "close",
        ).code,
      ).toBe(0);
      const message = `.greenline/tmp/${ID}/merge-message.txt`;
      space.write(message, `Merge ${ID} into main\n\nGreenline-Change: ${ID}\n`);
      space.git("checkout", "--quiet", "main");
      const elsewhere = space.git("merge", "--quiet", "--no-ff", "-F", message, BRANCH);
      expect(elsewhere.code).not.toBe(0);
      expect(elsewhere.err).toContain(
        `this merge would land change ${ID} on main, a base the owner's words in its landing line do not name, "merge into release: yes"`,
      );
      expect(elsewhere.err).toContain("; landing-words, greenline's commit-msg hook");
      space.git("merge", "--abort");
      // No words at all: the merge is refused the same way, naming the line to write.
      space.git("checkout", "--quiet", BRANCH);
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: done"], CLOSE), "no words")
          .code,
      ).toBe(0);
      space.git("checkout", "--quiet", "main");
      const none = space.git("merge", "--quiet", "--no-ff", "-F", message, BRANCH);
      expect(none.code).not.toBe(0);
      expect(none.err).toContain(
        "carries no landing line with the owner's words in the commit merged",
      );
      space.git("merge", "--abort");
      // The words name main: the merge goes on.
      space.git("checkout", "--quiet", BRANCH);
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: done", WORDS], CLOSE), "words")
          .code,
      ).toBe(0);
      space.git("checkout", "--quiet", "main");
      const merged = space.git("merge", "--quiet", "--no-ff", "-F", message, BRANCH);
      expect(merged.code, merged.err).toBe(0);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "lets a merge of the base into the change's own branch through, its record open with no landing words (J-148 S2)",
    () => {
      const space = workspace("path");
      space.git("checkout", "--quiet", "-b", BRANCH);
      expect(
        commitRecord(space, recordText(["choice: accepted", "state: open"]), "open").code,
      ).toBe(0);
      expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
      // The base moves on with a commit of its own while the change is built.
      space.git("checkout", "--quiet", "main");
      space.write("BASE.md", "the base moves on\n");
      space.git("add", "BASE.md");
      expect(space.git("commit", "--quiet", "--no-verify", "-m", "base moves").code).toBe(0);
      space.git("checkout", "--quiet", BRANCH);
      const updated = space.git("merge", "--quiet", "--no-ff", "--no-edit", "main");
      expect(updated.code, updated.err).toBe(0);
      expect(space.git("log", "-1", "--format=%P").out.trim().split(" ")).toHaveLength(2);
    },
    SEQUENCE_TIMEOUT,
  );
});
