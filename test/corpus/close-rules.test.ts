/** The close's record and commits (J-84 S1): the sentences the block, the ledger and work guides and the close and verify skills give an agent, read from the corpus as it ships. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repository = join(import.meta.dirname, "..", "..");

/** A corpus page's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return readFileSync(join(repository, "corpus", path), "utf8").replace(/\s+/g, " ");
}

/**
 * What the block gives an agent: since J-93 S1 the block carries the loop, the
 * promises and the situation index, and each step's mechanics stand on that
 * step's references page, which the block's loop loads with the step, so a
 * rule is read across the block and those pages.
 */
const block = [
  "runtime/agent.md",
  ...["frame", "plan", "anticipate", "build", "review", "verify", "close"].map(
    (step) => `skills/${step}/references/greenline.md`,
  ),
]
  .map(page)
  .join(" ");
const ledger = page("runtime/ledger.md");
const work = page("runtime/work.md");
/** What the close step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const close = [page("skills/close/SKILL.md"), page("skills/close/references/greenline.md")].join(
  " ",
);
/** What the verify step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const verify = [page("skills/verify/SKILL.md"), page("skills/verify/references/greenline.md")].join(
  " ",
);

describe("J-84 S1 done only on green checks, probes apart", () => {
  it("the close sets done only when every check's latest run is green, and a merged result's red keeps the change open", () => {
    // J-93 S2: the record's marks stand once on close's references page.
    expect(block).toContain(
      "Set `done` only when the latest run of every check under `.greenline/ledger/<id>/checks/` is green, as `greenline status --change <id>` shows;",
    );
    expect(close).toContain(
      'The state is done only when the latest run of every check of the change is green: run a red check again on the final code once its cause is fixed, and while one stays red, the merged result\'s included, the change stays open, the "next" line names that check, and the owner hears why.',
    );
    expect(ledger).toContain(
      "A change is set `done` only when the latest run of each of its checks is green, as the close skill says.",
    );
  });

  it("a probe runs outside greenline check and is never recorded as a check, with the words that tell the two apart", () => {
    expect(block).toContain(
      "Every check runs through `greenline check`, its red runs included; a probe, a run whose green the change never claims, runs outside it, as the verify skill says.",
    );
    expect(verify).toContain(
      "A check is a command whose green the change claims on its final code, such as its tests, its linter or its build: every run of it on the change's code is recorded, a red one included, such as the red of the red-green cycle, and its latest run is green before the change is done.",
    );
    // J-93 S2: the recorder's name stands on verify's references page.
    expect(verify).toContain(
      "A probe runs plainly, outside `greenline check`; a probe recorded through `greenline check` by mistake is marked",
    );
    expect(verify).toContain(
      "A probe is a run whose green the change never claims: a baseline at an earlier commit, a mutation run, a negative control that must fail, a bench's timings.",
    );
    expect(verify).toContain(
      'Run a probe plainly and never record it as a check of the change: keep what it showed among the claim\'s artifacts ("Artifact Layout") and quote its outcome in the verdict.',
    );
    expect(close).toContain(
      'A probe never enters the checks: verify\'s "Checks and probes" tells the two apart.',
    );
    expect(ledger).toContain(
      "Every run of a check on the change's code goes through `check`, a red one included, such as the red of the red-green cycle, and a rerun made only to read why it failed. A probe, a run whose green the change never claims, such as a baseline at an earlier commit, a mutation run, a negative control or a bench, runs outside `check` and is never recorded as a check of the change.",
    );
  });
});

describe("J-84 S1 the trailer written right and never moved", () => {
  it("the block and the ledger guide put the trailer in the message's last paragraph beside the harness's line, when the commit is made", () => {
    expect(block).toContain(
      "Every commit carries the trailer `Greenline-Change: <id>` from the moment it is made, as the last line of the message's last paragraph, one block with any trailer the harness adds there, such as `Co-Authored-By`;",
    );
    expect(ledger).toContain(
      "Every commit of a change carries the trailer `Greenline-Change: <id>`, written when the commit is made, in the message's last paragraph, where Git reads trailers: a line the harness adds there, such as `Co-Authored-By`, shares that paragraph, with no blank line between them, and the change's trailer is its last line.",
    );
  });

  it("no commit, an unpushed one included, is reset, amended, rebuilt or rewritten to move it", () => {
    expect(block).toContain(
      "no commit, an unpushed one included, is reset, amended, rebuilt or rewritten with `filter-branch` to move it.",
    );
    expect(ledger).toContain(
      "A commit made without the trailer keeps its message: no commit, an unpushed one included, is reset, amended, rebuilt or rewritten with `filter-branch` to move it, and `greenline status` names such a commit that touches the code on its history line.",
    );
  });
});

describe("J-84 S1 a wait is no stop", () => {
  it("a wait within the session leaves the record open, and stopped is set only when the session leaves the change unfinished", () => {
    expect(block).toContain(
      "A wait for the owner within the session, at a proposal, a question or a review, is no stop: the record stays `open`.",
    );
    expect(ledger).toContain(
      "a wait for the owner within the session, at a proposal, a question or a review, leaves it `open`.",
    );
    expect(ledger).toContain(
      "`stopped` is set only when the session leaves the change unfinished, as it ends or as another change's request stops it.",
    );
    expect(close).toContain(
      "A wait for the owner within the session, at a proposal, a question or a review, is no stop: the record stays `open`.",
    );
  });
});

describe("J-84 S1 a stopped record opened before an edit, and the stop's commit the record and its folder", () => {
  it("a stopped change is set open before any edit of its record or its code", () => {
    expect(block).toContain(
      "A stopped change is set `open` before any edit of its record or its code: a session that resumes one, which `router` finds, does so as its first write and writes on in its record.",
    );
    expect(ledger).toContain(
      "A stopped change is set `open` before any edit of its record or its code, as the first write of the session that resumes it.",
    );
    expect(close).toContain(
      "working edits the owner asks to commit are a commit of their own, apart from the stop's.",
    );
  });

  it("the stop's commit carries the record and its folder and nothing else, apart from the owner's commit of the working edits", () => {
    expect(block).toContain(
      "A stop is the session leaving the change unfinished, as it ends or as another change's request stops it: set the state `stopped`, rewrite the \"next\" line and commit the record and its folder, the check facts under it, and nothing else; working edits the owner asks to commit are a commit of their own, apart from the stop's.",
    );
    expect(ledger).toContain(
      "Every stop commits the record and its folder, the check facts under it, and nothing else, with the change's trailer, as AGENTS.md says; working edits the owner asks to commit are a commit of their own, apart from the stop's.",
    );
    expect(work).toContain(
      'at every stop, the state `stopped` and the "next" line, and the record and its folder committed with the change\'s trailer;',
    );
    expect(work).toContain(
      "A stop commits the record and its folder, the check facts under it, and nothing else:",
    );
    expect(work).toContain(
      "edits the owner asks to commit are a commit of their own, apart from the stop's.",
    );
    expect(close).toContain(
      "The stop's commit carries the change's trailer, and the working files stay for the close that finishes the change",
    );
    expect(work).not.toContain("A stop commits only the record");
  });
});

describe("J-84 S1 the merged result and the close's count", () => {
  it("the merged-result check runs after the merge's commit, so its facts name the merge it checked", () => {
    expect(close).toContain(
      "Make the merge with its commit, its message carrying the change's trailer, never staged alone with `--no-commit`, then record the change's checks on the merged result, so their facts name the merge they checked;",
    );
    expect(close).toContain(
      "After a local merge, the change's checks run on the merged result through `greenline check`.",
    );
  });

  it("the close's audit counts the commits as they stand at its end", () => {
    expect(close).toContain(
      "Count the commits and checks as they stand at the close's end: a number the close section states is read from the change's status when the section is written, after the landing, with the commit that carries the section counted; a statement of what holds of every commit, such as each carrying the trailer, needs no number.",
    );
  });
});
