/**
 * The record's lines are the agent's (J-176 S1; the register's row of
 * 2026-11-05, "The record's lines are the agent's"): the lines a mode owes
 * now and by the close, read from a record's text, a skeleton's placeholder
 * read as no line; the one line status and the mirror print; and an
 * accepted record's `yes` line read against the owner's journaled messages.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderRecordSkeleton } from "../../src/core/change.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import {
  answersOwnerWait,
  answersWait,
  confirmedSettled,
  confirmsRestatement,
  confirmState,
  isPlaceholder,
  joined,
  lackingLine,
  landingAnswer,
  owedLines,
  ownerWait,
  readsAsResume,
  readsAsStop,
  recordLack,
  saidByOwner,
  stopNotHeld,
  waitAnswer,
  yesLackClause,
  yesNotHeld,
  yesToProposal,
} from "../../src/core/record-lines.ts";

const definition = ((): ModesDefinition => {
  const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
})();
const mode = (name: string) => {
  const found = definition.modes.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(name);
  return found;
};

describe("J-176 S1 the lines a mode owes", () => {
  it("owes the yes only under an accepted choice, and the cost lines only where the mode may start an agent or run a round", () => {
    expect(owedLines(definition, mode("quick"), "owner")).toEqual({
      open: ["choice", "why", "floors", "ground", "agent"],
      close: ["skills", "outcome"],
    });
    expect(owedLines(definition, mode("regular"), "accepted")).toEqual({
      open: ["choice", "yes", "why", "floors", "ground", "agent"],
      close: ["skills", "agents", "rounds", "starts", "outcome"],
    });
  });

  it("reads a quoted skeleton placeholder as no line", () => {
    expect(isPlaceholder("<why the change exists, in one line>")).toBe(true);
    expect(isPlaceholder("the retry loses the deadline")).toBe(false);
    expect(isPlaceholder(["frame"])).toBe(false);
  });
});

describe("J-176 S1 what the record lacks, and the line that says it", () => {
  it("names every owed line of a fresh skeleton, now and by the close, and the sections at their placeholders", () => {
    const skeleton = renderRecordSkeleton(definition, mode("regular"), "none");
    const lack = recordLack(definition, skeleton);
    expect(lack?.open).toEqual(["choice", "why", "floors", "ground", "agent"]);
    expect(lack?.close).toEqual(["skills", "agents", "rounds", "starts", "outcome"]);
    expect(lack?.placeholders).toContain("why");
    expect(lack?.sections).toContain("frame");
    expect(
      lackingLine(
        lack ?? {
          mode: "",
          open: [],
          close: [],
          placeholders: [],
          sections: [],
          standIns: [],
          noneStart: false,
          absent: [],
        },
      ),
    ).toMatch(
      /^record lacks: choice, why, floors, ground and agent now; skills, agents, rounds, starts and outcome by the close; the .* sections at their placeholders; write each in your own words for its meaning; for floors, write floors: none, or the floors you found as a list, as \[security\]$/,
    );
  });

  it("owes the yes once the choice is accepted, and says nothing of a record that lacks nothing", () => {
    const record = (lines: readonly string[]) =>
      ["---", "mode: quick", ...lines, "---", "", "## frame", "", "the letters", ""].join("\n");
    const accepted = recordLack(
      definition,
      record([
        "choice: accepted",
        'why: "w"',
        "floors: none",
        "state: open",
        "ground: branch",
        'agent: "codex/sol"',
      ]),
    );
    expect(accepted?.open).toEqual(["yes"]);
    const whole = recordLack(
      definition,
      record([
        "choice: owner",
        'why: "w"',
        "floors: none",
        "state: done",
        "ground: branch",
        'agent: "codex/sol"',
        "skills: [frame]",
        'outcome: "The letters go out."',
      ]),
    );
    expect(whole === undefined ? undefined : lackingLine(whole)).toBeUndefined();
    // A record whose mode is no mode of the definition reads nothing.
    expect(
      recordLack(definition, record(["mode: brisk"]).replace("mode: quick\n", "")),
    ).toBeUndefined();
  });

  it("J-229 S1 names a missing yes apart as the owner's words, and the run's 0.1.0 record as one written before this version's form", () => {
    // The record of j217c-workspace-010 as 0.1.0 left it at its build.
    const older = [
      "---",
      "mode: regular",
      "choice: accepted",
      'why: "The desk needs the books published in a range of years, oldest first."',
      "state: open",
      'next: "build: the owner reads the red tests, then write findByYear and run npm test through greenline check"',
      "---",
      "",
      "## frame",
      "",
      "The ask.",
      "",
    ].join("\n");
    const lack = recordLack(definition, older);
    expect(lack?.open).toEqual(["yes", "floors", "ground", "agent"]);
    expect(lack?.absent).toEqual(["yes", "floors", "ground", "agent"]);
    expect(lack === undefined ? undefined : lackingLine(lack)).toBe(
      "record lacks: floors, ground and agent now; skills, agents, rounds, starts and outcome by the close; write each in your own words for its meaning; the yes now, " +
        yesLackClause() +
        "; for floors, write floors: none, or the floors you found as a list, as [security]; the record has no line at all for yes, floors, ground and agent, the form of a record written before this version: the owner's two ways are to complete it as ordinary work, or to close the change and open it again",
    );
    expect(yesLackClause()).toBe(
      "the owner's words that answered your proposal, never yours: quote them where this session heard them, ask the owner for them where it did not, and write nothing outside the proposal's homes before it",
    );
  });

  it("J-229 S1 names the yes apart in a skeleton greenline open wrote, and no older form, since every line stands", () => {
    const skeleton = renderRecordSkeleton(definition, mode("regular"), "none").replace(
      'choice: "<owner, accepted or standing>"',
      "choice: accepted",
    );
    const lack = recordLack(definition, skeleton);
    expect(lack?.absent).toEqual([]);
    const line = lack === undefined ? undefined : lackingLine(lack);
    expect(line).toMatch(/^record lacks: why, floors, ground and agent now; /);
    expect(line).toContain(`; the yes now, ${yesLackClause()}`);
    expect(line).not.toContain("before this version");
    // A record that states every line gets no line.
    const whole = [
      "---",
      "mode: quick",
      "choice: accepted",
      'yes: "Yes, fix it."',
      'why: "w"',
      "floors: none",
      "state: open",
      "ground: branch",
      'agent: "codex/sol"',
      "skills: [frame]",
      'outcome: "The letters go out."',
      "---",
      "",
      "## frame",
      "",
      "the letters",
      "",
    ].join("\n");
    const stated = recordLack(definition, whole);
    expect(stated === undefined ? undefined : lackingLine(stated)).toBeUndefined();
  });

  it("joins names with commas and a last and", () => {
    expect(joined([])).toBe("");
    expect(joined(["yes"])).toBe("yes");
    expect(joined(["yes", "why", "ground"])).toBe("yes, why and ground");
  });
});

describe("J-176 S1 the yes line read against the owner's journaled messages", () => {
  const journal = (...messages: string[]) => ({ kept: true as const, messages });

  it("holds an accepted record with no yes line, and asks nothing of another choice", () => {
    expect(yesNotHeld("accepted", undefined, { kept: false })).toContain(
      "the record says choice: accepted with no yes line",
    );
    expect(yesNotHeld("owner", undefined, journal("Do it at careful."))).toBeUndefined();
  });

  it("lets a yes the owner said through, case aside, and holds words no message holds or one that reads as no yes", () => {
    expect(yesNotHeld("accepted", "yes, go ahead", journal("Yes, go ahead."))).toBeUndefined();
    expect(
      yesNotHeld("accepted", "Ship it", journal("Add the letters.", "ship it")),
    ).toBeUndefined();
    expect(yesNotHeld("accepted", "Yes, go ahead.", journal("Add the letters."))).toContain(
      "which no message of the owner's holds",
    );
    expect(
      yesNotHeld("accepted", "no worries, go ahead", journal("no worries, go ahead")),
    ).toContain("reads as no yes");
    // With no journal nothing is read against the line.
    expect(yesNotHeld("accepted", "Yes.", { kept: false })).toBeUndefined();
  });

  it("finds a line's words in a message, case aside", () => {
    expect(saidByOwner("Force-push the branch.", ["Please force-push the branch."])).toBe(true);
    expect(saidByOwner("force-push the branch", ["Push the branch."])).toBe(false);
  });
});

describe("J-200 S1 the stopped line holds the owner's stop (j196t-states-stop-2)", () => {
  const WAIT =
    "Yes, go ahead. Write the tests first and show them to me before you write the code.";
  const STOP = "Stop there for today; I will pick this up tomorrow.";
  const NEXT = "Add a findByAuthor search to the shelf, ignoring case.";
  const journal = { kept: true, messages: [WAIT, STOP, NEXT] } as const;

  it("reads the owner's stop as a stop and their wait as none", () => {
    expect(readsAsStop(STOP)).toBe(true);
    expect(readsAsStop(WAIT)).toBe(false);
    expect(readsAsStop("Leave it on the branch.")).toBe(false);
  });

  it("holds the line to one message of the owner's that reads as a stop, or their request for another change", () => {
    expect(stopNotHeld(STOP, journal)).toBeUndefined();
    expect(stopNotHeld(undefined, journal)).toBe("carries no stopped line");
    expect(stopNotHeld(WAIT, journal)).toContain("reads as no stop");
    expect(stopNotHeld(`another change: ${NEXT}`, journal)).toBeUndefined();
    expect(stopNotHeld("another change: Add a sort.", journal)).toContain(
      "which no message of the owner's holds",
    );
    // Where no journal stands, the line's own words are read.
    expect(stopNotHeld(STOP, { kept: false })).toBeUndefined();
    expect(stopNotHeld(WAIT, { kept: false })).toContain("reads as no stop");
  });
});

describe("J-205 S1 the owner's words that answer a wait (j196t-conduct-emptyb)", () => {
  const WAIT = "wait for the owner to resume independent review";
  const STOP = "Stop here for today; we carry on later.";

  it("reads the run's go-aheads as a resume, and its stop, a question and a refusal as none", () => {
    for (const words of ["Carry on with that change.", "Go on.", "Continue", "Please resume it."])
      expect(readsAsResume(words), words).toBe(true);
    for (const words of ["Pick up where we left off.", "Keep going", "Proceed with the review."])
      expect(readsAsResume(words), words).toBe(true);
    for (const words of [
      STOP,
      "Yes, please.",
      "What does the farewell function return?",
      "Don't carry on yet.",
      "Please do not continue.",
      "Wait, before you continue, show me the tests.",
      "I will pick this up tomorrow.",
      "We go on later.",
    ])
      expect(readsAsResume(words), words).toBe(false);
  });

  it("answers the wait on a resume, on a yes where the wait is a yes, and on nothing else", () => {
    expect(answersWait(WAIT, "Carry on with that change.")).toBe(true);
    expect(answersWait(WAIT, "Go on.")).toBe(true);
    // The run's wait asks the owner to resume, which a yes answers.
    expect(answersWait(WAIT, "Yes, please.")).toBe(true);
    expect(answersWait("wait for the owner's yes", "Sure, go ahead.")).toBe(true);
    // A wait for the owner's review is answered by their yes and their review's words, never by a resume alone (J-214 S1).
    expect(answersWait("wait for the owner's review of the tests", "Yes, please.")).toBe(true);
    expect(answersWait("wait for the owner's review of the tests", "Go on.")).toBe(false);
    expect(answersWait(WAIT, STOP)).toBe(false);
    expect(answersWait(WAIT, "Yes, but stop there for today.")).toBe(false);
    expect(answersWait(WAIT, "What does the farewell function return?")).toBe(false);
    expect(answersWait(WAIT, undefined)).toBe(false);
    expect(answersWait(undefined, "Yes, please.")).toBe(false);
    expect(answersWait(undefined, "Go on.")).toBe(true);
  });
});

describe("J-214 S1 a resume is not the answer to a wait on the owner (j196t-states-stop-2d)", () => {
  /** The next line's action at the stop commit a483507 of the run's sandbox. */
  const REVIEW = "wait for the owner's review of the tests, then implement findByYear";
  const RESUME = "Carry on with that change.";

  it("reads the wait on the owner from a next line in the ledger guide's form, giving the wait's words", () => {
    expect(ownerWait(REVIEW)).toBe("the owner's review of the tests");
    expect(ownerWait("wait for the owner's review of the tests")).toBe(
      "the owner's review of the tests",
    );
    expect(ownerWait("waiting for the owner's answer on the column name; then rename it")).toBe(
      "the owner's answer on the column name",
    );
    expect(ownerWait("wait for the owner's review of test/shelf.test.js. Then implement")).toBe(
      "the owner's review of test/shelf.test.js",
    );
    expect(ownerWait("wait for the owner's yes")).toBe("the owner's yes");
  });

  it("reads no wait on the owner where the next line names none, or where the wait asks for the resume itself", () => {
    for (const action of [
      undefined,
      "implement findByYear",
      "rerun the reviewer on the fixed commits",
      "ask the owner which name to use",
      // The run j196t-conduct-emptyb's wait, which the owner's resume answers (J-205 S1).
      "wait for the owner to resume independent review",
      "wait for the owner to continue",
    ])
      expect(ownerWait(action), String(action)).toBeUndefined();
  });

  it("answers the wait on the owner on a yes and the review's words, never on a resume alone or a refusal", () => {
    for (const words of [
      "Looks good, go ahead",
      "Yes, please.",
      "Approved.",
      "I approve the tests.",
      "The tests look right; go on and write the code.",
      "Go ahead with the code.",
      "Make these changes and then implement it.",
      "Change the second test to use 2001.",
      "Fix the name of the first test.",
      "LGTM",
    ])
      expect(answersOwnerWait(words), words).toBe(true);
    for (const words of [
      RESUME,
      "Go on.",
      "Continue",
      "OK, carry on with that change.",
      "Yes, carry on.",
      "Pick it back up.",
      "The tests don't look right.",
      "Don't write the code yet.",
      "Not approved.",
      "No, change nothing yet.",
      "Looks good, but stop there for today.",
      "What does findByYear return?",
      "I don't have it either. Write the test again and show it to me.",
    ])
      expect(answersOwnerWait(words), words).toBe(false);
  });

  it("tells the resume of the stop apart from the answer to the wait the next line names", () => {
    expect(waitAnswer(REVIEW, RESUME)).toEqual({
      kind: "resumed",
      wait: "the owner's review of the tests",
    });
    expect(waitAnswer(REVIEW, "Looks good, go ahead")).toEqual({ kind: "answered" });
    // The second pass's 2b, whose explicit approval did not lift the wait.
    expect(waitAnswer(REVIEW, "The tests look right; go on and write the code.")).toEqual({
      kind: "answered",
    });
    expect(waitAnswer(REVIEW, "What does findByYear return?")).toBeUndefined();
    expect(waitAnswer(REVIEW, "Stop there for today; I will pick this up tomorrow.")).toBe(
      undefined,
    );
    expect(waitAnswer(REVIEW, undefined)).toBeUndefined();
    expect(answersWait(REVIEW, RESUME)).toBe(false);
    expect(answersWait(REVIEW, "Looks good, go ahead")).toBe(true);
  });

  it("reads a next line with no wait on the owner as J-205 left it", () => {
    for (const wait of [
      "wait for the owner to resume independent review",
      "ask the owner which name to use",
      undefined,
    ]) {
      expect(waitAnswer(wait, RESUME), String(wait)).toEqual({ kind: "answered" });
      expect(answersWait(wait, RESUME), String(wait)).toBe(true);
    }
    expect(waitAnswer("ask the owner which name to use", "Yes, please.")).toBeUndefined();
  });
});

describe("J-209 S1 the owner's words that answer the landing's offer (j196c-landing-4b)", () => {
  it('reads the run\'s "Merge it." and the other merge words as the merge, into the base they name or none', () => {
    for (const words of [
      "Merge it.",
      "merge",
      "Land it locally.",
      "Go ahead with the merge.",
      "Please merge it.",
      "Merge anyway.",
      "Merge it; we tidy the import up later.",
    ])
      expect(landingAnswer(words, "merge"), words).toEqual({ kind: "merge", base: undefined });
    expect(landingAnswer("Merge it into release-1.2.", "merge")).toEqual({
      kind: "merge",
      base: "release-1.2",
    });
    expect(landingAnswer("merge into `main`", "push")).toEqual({ kind: "merge", base: "main" });
  });

  it("reads the push words as the push, and land it as the act the offer named", () => {
    for (const words of [
      "Push it.",
      "Push the branch.",
      "Open the pull request.",
      "open a PR",
      "Land it where the remote is a forge.",
    ])
      expect(landingAnswer(words, "merge"), words).toEqual({ kind: "push" });
    expect(landingAnswer("Land it.", "push")).toEqual({ kind: "push" });
    expect(landingAnswer("Land it.", "merge")).toEqual({ kind: "merge", base: undefined });
  });

  it("reads the decline words, a refused act and a put-off one as neither", () => {
    for (const words of [
      "Leave the branch.",
      "Leave it for the review.",
      "Not now.",
      "Later.",
      "No merge.",
      "Don't merge it.",
      "Do not push.",
      "Merge it later.",
      "No.",
    ])
      expect(landingAnswer(words, "merge"), words).toEqual({ kind: "decline" });
  });

  it("reads a yes as the one act the offer named, and a question or words off the lists as no answer", () => {
    expect(landingAnswer("Yes, go ahead.", "merge")).toEqual({ kind: "merge", base: undefined });
    expect(landingAnswer("Yes.", "push")).toEqual({ kind: "push" });
    for (const words of [
      "What does the catalogue import do?",
      "Should we merge?",
      "Show me the diff first.",
      "Merge it and push it.",
      "",
    ])
      expect(landingAnswer(words, "merge"), words).toBeUndefined();
    expect(landingAnswer("Can you merge it?", "merge")).toEqual({ kind: "merge", base: undefined });
  });
});

describe("J-222 S1 the wait on the owner under every form the next line takes (j217c-states-stop)", () => {
  /** The Claude run's next line's action at the stop commit 83caaba, its step aside. */
  const CLAUDE =
    "wait on the owner's review of the five red tests (test/shelf.test.js, kept as 2026-11-10-find-by-year/shown.patch), then write findByYear in src/shelf.js";
  /** The Codex run j217t-states-stop's next line's action at the stop commit 079e57a, which held. */
  const CODEX = "wait for the owner's review of the tests";
  const RESUME = "Carry on with that change.";

  it("reads the wait on the owner under each form of the list, giving the wait's words", () => {
    expect(ownerWait(CLAUDE)).toBe("the owner's review of the five red tests");
    expect(ownerWait(CODEX)).toBe("the owner's review of the tests");
    for (const [action, words] of [
      [
        "wait on the owner's review of the tests, then implement",
        "the owner's review of the tests",
      ],
      ["wait for the owner's answer on the name", "the owner's answer on the name"],
      ["wait until the owner reviews the tests, then implement", "the owner reviews the tests"],
      ["waiting on the owner's yes; then rename it", "the owner's yes"],
      [
        "waiting for the owner's review of the tests. Then implement",
        "the owner's review of the tests",
      ],
      ["wait on your review of the tests, then implement", "your review of the tests"],
      ["show the tests and take the owner's review, then implement", "the owner's review"],
      [
        "the owner's answer on the column name, then rename it",
        "the owner's answer on the column name",
      ],
      ["the owner's yes to write the code", "the owner's yes to write the code"],
      [
        "once the owner reviews the shown tests, write findByYear",
        "the owner reviews the shown tests",
      ],
      ["ask the owner to review the tests, then implement", "the owner to review the tests"],
    ] as const)
      expect(ownerWait(action), action).toBe(words);
  });

  it("reads a review of shown tests as a wait on the owner while the record is stopped, and only then", () => {
    const shown = "show the five red tests for review again, then write findByYear";
    expect(ownerWait(shown, true)).toBe("show the five red tests for review again");
    expect(ownerWait("the review of the shown tests; then implement", true)).toBe(
      "the review of the shown tests",
    );
    expect(ownerWait(shown)).toBeUndefined();
    expect(ownerWait(shown, false)).toBeUndefined();
    for (const action of [
      "rerun the reviewer on the tests",
      "review the tests against the plan",
      "implement findByYear",
    ])
      expect(ownerWait(action, true), action).toBeUndefined();
  });

  it("reads no wait on a line that names none, holds the owner's name alone or asks for the resume", () => {
    for (const action of [
      undefined,
      "implement findByYear",
      "rerun the reviewer on the fixed commits",
      "ask the owner which name to use",
      "tell the owner the tests are red",
      "merge into the owner's branch",
      "wait for the owner to resume independent review",
      "wait on the owner to carry on",
      "waiting on you to continue",
    ])
      expect(ownerWait(action), String(action)).toBeUndefined();
  });

  it("reads the Claude run's carry-on as a resume while its wait stands, and the review's words as the answer", () => {
    expect(waitAnswer(CLAUDE, RESUME)).toEqual({
      kind: "resumed",
      wait: "the owner's review of the five red tests",
    });
    expect(answersWait(CLAUDE, RESUME)).toBe(false);
    expect(waitAnswer(CLAUDE, "The tests look right; go on and write the code.")).toEqual({
      kind: "answered",
    });
    expect(waitAnswer(CLAUDE, "What does findByYear return?")).toBeUndefined();
    for (const action of [
      "wait until the owner reviews the tests, then implement",
      "ask the owner to review the tests, then implement",
      "the owner's answer on the column name, then rename it",
    ])
      expect(waitAnswer(action, RESUME)?.kind, action).toBe("resumed");
  });

  it("reads the Codex run's line as before, and a stopped review of shown tests as a wait only while stopped", () => {
    expect(waitAnswer(CODEX, RESUME)).toEqual({
      kind: "resumed",
      wait: "the owner's review of the tests",
    });
    expect(waitAnswer(CODEX, "The tests look right; go on and write the code.")).toEqual({
      kind: "answered",
    });
    const shown = "show the five red tests for review again, then write findByYear";
    expect(waitAnswer(shown, RESUME, true)).toEqual({
      kind: "resumed",
      wait: "show the five red tests for review again",
    });
    expect(waitAnswer(shown, RESUME)).toEqual({ kind: "answered" });
    // J-205 S1's wait that asks for the resume is answered by it, under every form.
    expect(waitAnswer("wait on the owner to carry on", RESUME)).toEqual({ kind: "answered" });
  });
});

describe("J-222 S1 a resume answers no landing's offer (j217c-states-stop F3)", () => {
  it("reads the run's carry-on and the other resume words as no answer to the offer, on either act", () => {
    for (const words of [
      "Carry on with that change.",
      "Go on.",
      "Continue",
      "Yes, carry on.",
      "OK, continue with it.",
      "Please resume it.",
    ]) {
      expect(landingAnswer(words, "merge"), words).toBeUndefined();
      expect(landingAnswer(words, "push"), words).toBeUndefined();
    }
  });

  it("reads a resume beside the merge, push or decline words by those words, and a yes after an offer as before", () => {
    expect(landingAnswer("Carry on and merge it.", "merge")).toEqual({
      kind: "merge",
      base: undefined,
    });
    expect(landingAnswer("Go on, push the branch.", "merge")).toEqual({ kind: "push" });
    expect(landingAnswer("Carry on, but leave the branch.", "merge")).toEqual({
      kind: "decline",
    });
    expect(landingAnswer("Yes, go ahead.", "merge")).toEqual({ kind: "merge", base: undefined });
    expect(landingAnswer("Yes.", "push")).toEqual({ kind: "push" });
  });
});

describe("J-223 S1 the confirmed line, the yes's twin, read against the messages after the ask", () => {
  const ASKED = "2026-11-10T10:00:00.000Z";
  const at = (minute: number): string => `2026-11-10T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const kept = (asked: string | undefined, ...messages: [number, string][]) => ({
    kept: true as const,
    asked,
    messages: messages.map(([minute, words]) => ({ at: at(minute), words })),
  });
  const YES = "Use careful.";
  const ANSWER = "1.1, and member numbers only.";

  it("holds words a message after the ask holds, reading as a yes", () => {
    expect(
      confirmState("Yes, that is it.", kept(ASKED, [-5, YES], [3, "Yes, that is it."])),
    ).toEqual({ kind: "held" });
  });

  it("refuses words said before the ask: the yes to the proposal and an interview answer among them", () => {
    expect(confirmState(YES, kept(ASKED, [-9, YES], [2, "ok"]))).toEqual({
      kind: "before",
      words: YES,
    });
    expect(confirmState(ANSWER, kept(ASKED, [-3, ANSWER]))).toEqual({
      kind: "before",
      words: ANSWER,
    });
  });

  it("refuses words no message holds, and words whose message reads as no", () => {
    expect(confirmState("Yes, exactly.", kept(ASKED, [4, "Yes, go on."]))).toEqual({
      kind: "unheld",
      words: "Yes, exactly.",
    });
    expect(
      confirmState(
        "not quite, add the due dates",
        kept(ASKED, [4, "Not quite, add the due dates"]),
      ),
    ).toEqual({ kind: "no", words: "not quite, add the due dates" });
  });

  it("reads the wait's state where no line stands: not put, put and unanswered, answered", () => {
    expect(confirmState(undefined, kept(undefined, [-9, YES]))).toEqual({ kind: "not-put" });
    expect(confirmState(undefined, kept(ASKED, [-9, YES]))).toEqual({ kind: "unanswered" });
    expect(confirmState(undefined, kept(ASKED, [-9, YES], [1, "Yes."]))).toEqual({
      kind: "answered",
    });
    // Words quoted with no ask noted were said before the restatement was put.
    expect(confirmState("Yes.", kept(undefined, [1, "Yes."]))).toEqual({
      kind: "before",
      words: "Yes.",
    });
  });

  it("reads the line's presence alone where no hook journaled, and its absence as missing", () => {
    expect(confirmState("Yes.", { kept: false })).toEqual({ kind: "held" });
    expect(confirmState(undefined, { kept: false })).toEqual({ kind: "missing" });
  });

  it("is settled once HEAD's commit carries the careful record with the same line", () => {
    expect(confirmedSettled({ mode: "careful", confirmed: "Yes." }, "Yes.")).toBe(true);
    expect(confirmedSettled({ mode: "careful", confirmed: "Yes." }, "Yes, go.")).toBe(false);
    expect(confirmedSettled({ mode: "careful" }, "Yes.")).toBe(false);
    expect(confirmedSettled(undefined, "Yes.")).toBe(false);
    expect(confirmedSettled({ mode: "careful", confirmed: "Yes." }, undefined)).toBe(false);
  });

  it("reads the frame skill's own words for the wait as a wait on the owner, the J-222 S1 reader unchanged", () => {
    expect(ownerWait("wait for the owner's confirmation of the frame's restatement")).toBe(
      "the owner's confirmation of the frame's restatement",
    );
  });
});

describe("J-223 S1 correction C5: the owner's plain confirming words confirm a restatement", () => {
  const WORDS = [
    "That's correct.",
    "Exactly.",
    "Right.",
    "Confirmed.",
    "That's it.",
    "Correct, go on.",
    "That’s right",
    "Yes, that is it.",
  ];
  const NEGATED = [
    "That's not right.",
    "Not correct, the dates are wrong.",
    "That isn't right.",
    "Not quite.",
    "Not exactly.",
    "Wrong, add the due dates.",
    "Incorrect.",
    "No, refine it.",
  ];

  it("reads each plain confirming word as the confirmation", () => {
    for (const words of WORDS) expect(confirmsRestatement(words), words).toBe(true);
  });

  it("reads each negation, and an opening no, as none", () => {
    for (const words of NEGATED) expect(confirmsRestatement(words), words).toBe(false);
  });

  it("leaves the proposal's yes reader as it was", () => {
    expect(yesToProposal("That's correct.")).toBe(false);
    expect(yesToProposal("Exactly.")).toBe(false);
    expect(yesToProposal("Yes, go ahead.")).toBe(true);
  });

  it("holds a confirmed line whose message after the ask says the plain words", () => {
    const journal = {
      kept: true as const,
      asked: "2026-11-10T10:00:00.000Z",
      messages: [{ at: "2026-11-10T10:01:00.000Z", words: "That's correct." }],
    };
    expect(confirmState("That's correct.", journal)).toEqual({ kind: "held" });
  });
});

describe("J-223 S1 correction 2, C5: the confirming words read where they confirm", () => {
  it("reads none where the words stand outside the opening clause, beside a question, or beside negation or contrast", () => {
    for (const words of [
      "Exactly the opposite.",
      "Right, but drop the export.",
      "Is the date column right?",
      "Can you confirm the totals?",
      "You say it's correct but it's not.",
      "Correct, except the dates.",
      "Exactly, though add the fines.",
      "The totals, that's right.",
    ])
      expect(confirmsRestatement(words), words).toBe(false);
  });

  it("still confirms the plain words and a yes in the opening clause", () => {
    for (const words of [
      "That's correct.",
      "Exactly.",
      "Right.",
      "Yes, go ahead.",
      "That is exactly what I want.",
      "Looks good to me.",
    ])
      expect(confirmsRestatement(words), words).toBe(true);
  });
});

describe("J-223 S1 correction 3, F3: a negation written without its apostrophe", () => {
  it("reads none for a negation without an apostrophe, nope and nah, and a contraction with each apostrophe form", () => {
    for (const words of [
      "That isnt right.",
      "Right, dont add the totals.",
      "Yeah, nope.",
      "Yeah nah.",
      "I dont think so.",
      "Cannot confirm that.",
      "Right, that isn't it.",
      "Right, that isn’t it.",
      "Right, that isn‘t it.",
      "Right, that isnʼt it.",
      "Right, that isn`t it.",
      "Right, that isn´t it.",
    ])
      expect(confirmsRestatement(words), words).toBe(false);
  });

  it("still confirms the plain words, and words that only end in nt", () => {
    for (const words of [
      "That's correct.",
      "Exactly.",
      "Right.",
      "Yes, go ahead.",
      "Exactly what I want up front.",
      "Right, I want that.",
    ])
      expect(confirmsRestatement(words), words).toBe(true);
  });
});
