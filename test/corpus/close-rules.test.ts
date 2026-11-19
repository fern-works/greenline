/** The close's record and commits (J-84 S1): the sentences the block, the ledger and work guides and the close and verify skills give an agent, read from the corpus as it ships. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusPage } from "./skill-text.ts";
import { z } from "zod";

const repository = join(import.meta.dirname, "..", "..");

/** A corpus page's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return corpusPage(repository, path);
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

  it("J-175 S1 records a probe through greenline check and marks it, so it never counts as a check, with the words that tell the two apart", () => {
    expect(block).toContain(
      "a probe, a run whose green the change never claims, is then marked with `greenline check --change <id> --probe <fact>`, which keeps it out of the change's checks, as the verify skill says.",
    );
    expect(verify).toContain(
      "A check is a command whose green the change claims on its final code, such as its tests, its linter or its build: every run of it on the change's code is recorded, a red one included, such as the red of the red-green cycle, and its latest run is green before the change is done.",
    );
    // J-93 S2: the recorder's name stands on verify's references page.
    expect(verify).toContain(
      "A probe runs through `greenline check` too, a baseline's command run in its copy,",
    );
    expect(verify).toContain(
      "A probe is a run whose green the change never claims: a baseline at an earlier commit, a mutation run, a negative control that must fail, a bench's timings.",
    );
    expect(verify).toContain(
      "Record a probe as you record a check, its command run in the baseline's copy where it has one, then mark it a probe as verify's references page says, which leaves it out of the change's checks: keep what it showed among the claim's artifacts (\"Artifact Layout\") and quote its outcome in the verdict with its fact.",
    );
    expect(verify).not.toContain("Run a probe plainly");
    expect(close).toContain(
      'A probe never enters the checks: verify\'s "Checks and probes" tells the two apart.',
    );
    expect(ledger).toContain(
      "Every run of a check on the change's code goes through `check`, a red one included, such as the red of the red-green cycle, and a rerun made only to read why it failed. A probe, a run whose green the change never claims, such as a baseline at an earlier commit, a mutation run, a negative control or a bench, runs through `check` too, its command run in the baseline's copy where it has one, and is then marked a probe, so no run a section cites stays plain and none counts as a check of the change.",
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
    // J-200 S1: a stop is the owner's words, quoted in the record's stopped line; a wait leaves the record open.
    expect(block).toContain(
      "A wait for the owner within the session, at a proposal, a question or a review, is no stop: the record stays `open`, and where a record reads `stopped` while the session that wrote it goes on, the status line says so and you set it `open` again.",
    );
    expect(ledger).toContain(
      "a wait for the owner within the session, at a proposal, a question or a review, leaves it `open`.",
    );
    expect(ledger).toContain(
      "`stopped` is set only on the owner's words that end the work for now, such as \"stop there for today\", quoted whole, one message of theirs, in the record's `stopped` line,",
    );
    expect(close).toContain(
      "A wait for the owner within the session, at a proposal, a question or a review, is no stop: the record stays `open`,",
    );
  });
});

describe("J-84 S1 a stopped record opened before an edit, and the stop's commit the record and its folder", () => {
  it("a stopped change is set open before any edit of its record or its code", () => {
    expect(block).toContain(
      // J-176 S1: the hooks say so and the agent writes the state; no hook writes a line of the record.
      "A stopped change is set `open` before any edit of its record or its code: a session that resumes one, which `router` finds, does so as its first write and writes on in its record; where its first write leaves the record `stopped`, the hooks say so, and you set it `open`",
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
      'A stop is the owner\'s words that end the work for now, such as "stop there for today": set the state `stopped`, quote those words whole, one message of theirs, in its `stopped` line, rewrite the "next" line and commit the record and its folder, the check facts under it, and nothing else; working edits the owner asks to commit are a commit of their own, apart from the stop\'s.',
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
    // J-130 S1: the merge's order stands on the references page, the merge made with its commit there.
    expect(close).toContain(
      "Make the merge in the order close's references give, then record the change's checks on the merge commit, so their facts name the merge they checked;",
    );
    expect(close).toContain(
      "Check out the base and merge with its commit, `git merge --no-ff -F .greenline/tmp/<id>/merge-message.txt <branch>`; never `--no-commit` or `--squash`",
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

describe("J-130 S1 the landing on a remote that is no forge", () => {
  const build = [page("skills/build/SKILL.md"), page("skills/build/references/greenline.md")].join(
    " ",
  );

  it("offers the landing by the status line's remote fact, never the URL, and names a local merge's base first", () => {
    // J-175 S1: the offer is a choice, never "ready for review" (j109t-landing-2, j109t-landing-4).
    expect(close).toContain(
      "Offer the landing's choice in one line, by the status line's remote: push the branch and open a pull request where it names a forge, merge it into its base branch locally where it names no forge, or leave the branch; a close that names no choice, such as \"ready for review\", has offered none.",
    );
    expect(close).toContain("The local merge's offer names its base branch first:");
    expect(close).toContain(
      "The offer reads the remote's kind from the status line, `remote: origin, a forge (github.com)`, `remote: origin, not a forge (a local path)` or `remote: none`, never from the URL:",
    );
    expect(block).toContain("the `remote` line's offer");
  });

  it("writes the local merge's order the hooks hold: the record on the branch first, the merge commit checked, its facts the one commit after it", () => {
    expect(close).toContain("commit the record and its folder there, before the merge.");
    expect(close).toContain(
      "Run each check of the change on the merge commit through `greenline check --change <id> --step close -- <command>`, so its facts name the merge; it is the change's last check.",
    );
    expect(close).toContain(
      "Commit those facts on the base, the record and its folder alone: git's hooks take the commit after the landing's merge as the change's and refuse its `done` while the latest run of a check, the merge's among them, is red.",
    );
    expect(close).toContain("Commit nothing else on the base:");
    expect(close).toContain(
      "A merge that fails, on a conflict or a command's error, is reported as it stands with git's words and left for the owner, never checked by another runner:",
    );
    expect(close).toContain(
      'Once the owner has concluded or aborted it, the record goes back to `open` on the change\'s branch, its "next" line naming the merge, and its close section says the merge failed.',
    );
    expect(ledger).toContain(
      "On any branch, with a remote or none, so is the commit after a local landing's merge, the merge carrying the change's trailer, that stages only the change's record and folder:",
    );
  });

  it("answers a hook's refusal by its named line, never by --no-verify, in close's and build's pages", () => {
    const sentence =
      "A hook's refusal is answered by the line it names, never by `--no-verify`, which is the owner's bypass alone.";
    expect(close).toContain(sentence);
    expect(build).toContain(sentence);
  });

  it("J-135 S1 reports a refusal believed wrong, never works around it, and states the concluding commit once in the ledger guide", () => {
    const reported =
      "A refusal you believe wrong is reported to the owner by its first sentence, in their terms, and never worked around, by a working copy set apart from the index or any other way.";
    expect(close).toContain(reported);
    expect(build).toContain(reported);
    const flat = ledger.replace(/\s+/g, " ");
    expect(flat).toContain(
      "On any branch, with a remote or none, the commit that finishes or stops a change is that change's, trailer included, whatever state HEAD holds its record in",
    );
    expect(flat).toContain(
      "The hooks read each record as the commit carries it, the staged version, never the working copy apart from it.",
    );
    expect(flat).not.toContain("A record HEAD holds `done` is closed");
    expect(flat).toContain(
      "The refusal leaves alone a merge commit, a conflicted merge concluded with `git commit` among them, and the commit after a local landing's merge",
    );
    // J-144 S3: the refusal reaches the owner by its first sentence, in their terms.
    expect(flat).toContain(
      "a refusal you believe wrong is reported to the owner by its first sentence, in their terms, and never worked around",
    );
  });

  it("J-139 S1 commits the owner's landing words after done with the record and its folder alone, and states the rule in the ledger guide", () => {
    expect(close.replace(/\s+/g, " ")).toContain(
      "Where the close committed the record `done` before the owner's words came, write them after it and commit the record and its folder alone the same way: git's hooks take that commit as the change's in every state, and a `done` record never goes with code beside it.",
    );
    const flat = ledger.replace(/\s+/g, " ");
    expect(flat).toContain(
      "and so is a commit of the record, its folder or both alone in every state, `done` included, the owner's words written after the close and a done change's check fact under its folder among them, on the default branch of a repository with a remote too, where only a record the index holds `open` is no change's, since no change opens there.",
    );
    // J-144 S4: on every branch, the change's own included.
    expect(flat).toContain(
      "A record HEAD holds `done` or `dropped` changes only in a commit of the record and its folder alone, the owner's words for the landing among them, and never with code beside it, on every branch, the change's own included: pre-commit refuses such a commit, naming the commit of the record alone",
    );
  });

  it("J-139 S1 declines an ask to push an unfinished change to the default branch, naming what the push skips", () => {
    expect(close.replace(/\s+/g, " ")).toContain(
      "An ask to push an unfinished change to the default branch is not those words either: decline once, naming what the push skips, the review, the verify and the close, and ask for the close first;",
    );
    expect(ledger.replace(/\s+/g, " ")).toContain(
      "an ask to push an unfinished change to the default branch is not the words for `landing`, so decline once, name what the push skips, the review, the verify and the close, and ask for the close first.",
    );
  });
});

describe("J-168 S1 the close writes the outcome line", () => {
  it("the close sets the outcome line, one sentence of what landed under 200 characters, never the why, and done is refused without it", () => {
    expect(close).toContain(
      'the `outcome` line, `outcome: "<what landed>"`, one sentence in your own words under 200 characters saying what landed, never the why repeated',
    );
    expect(close).toContain("git's hooks refuse `done` without it or over the length");
    // The front names it in words and the handoff by the line it writes.
    expect(page("skills/close/SKILL.md")).toContain(
      'set the record\'s state, its "next" line, its cost and its outcome line',
    );
    expect(page("skills/close/SKILL.md")).toContain("cost, `outcome` line and `skills` line");
    // The ledger guide's table names the line and its length.
    expect(ledger).toMatch(
      /\| `outcome` \| what landed, in one sentence of the agent's own words under 200 characters/,
    );
  });

  it("names the outcome line's keeper: the record-form hold, its words read by the pictures' home and view scenario", () => {
    const recipe = z
      .object({
        keepers: z.array(
          z.object({ promise: z.string(), kind: z.string(), where: z.string().optional() }).loose(),
        ),
      })
      .loose()
      .parse(JSON.parse(readFileSync(join(repository, "corpus", "recipes", "close.json"), "utf8")));
    const kept = recipe.keepers.find((keeper) => keeper.promise.includes("outcome line"));
    expect(kept).toMatchObject({
      kind: "hold",
      where: "record-form",
      cost: "free",
      oracle: "The pictures, the home and the view",
    });
  });
});
