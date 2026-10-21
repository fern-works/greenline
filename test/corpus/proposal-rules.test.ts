/** The proposal, the modes and the floors (J-84 S3): the sentences the block, the ledger guide and the frame, plan and review skills give an agent, read from the corpus as it ships. The public tree carries this test and the corpus, never docs/ or workshop/, so it reads the corpus alone. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repository = join(import.meta.dirname, "..", "..");

/** A file's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
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
/** What the frame step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const frame = [page("skills/frame/SKILL.md"), page("skills/frame/references/greenline.md")].join(
  " ",
);
/** What the plan step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const plan = [page("skills/plan/SKILL.md"), page("skills/plan/references/greenline.md")].join(" ");
/** What the review step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const review = [page("skills/review/SKILL.md"), page("skills/review/references/greenline.md")].join(
  " ",
);
const brief = page("skills/review/references/brief.md");

describe("J-84 S3 a named mode needs no yes", () => {
  it("a request that names a mode goes on with no yes awaited, the proposal stated first and a question asked only for a choice left open", () => {
    expect(block).toContain(
      "Proceed without waiting in two cases only: the request names the mode, or the workspace's `proceed` setting allows the proposed mode (none by default).",
    );
    // J-102 S2: the request's own words are no yes, and a standing choice holds only where proceed admits the mode.
    expect(block).toContain(
      "The owner's yes to a mode is the record's choice line, `owner` or `accepted`, written after the proposal: a request to commit, to checkpoint, to \"go ahead\" or to put a fix straight into a file is not that yes, and neither are words saying to implement without asking.",
    );
    expect(block).toContain(
      "A `choice: standing` applies only where `proceed` admits the mode, that mode and every faster one; elsewhere the hooks refuse it.",
    );
    expect(block).toContain(
      "The proposal still comes before the first edit, the mode stated as taken with its reason and the where line, and asks only a substantive choice the request leaves open.",
    );
  });

  it("the wait stays where the request names no mode", () => {
    expect(block).toContain(
      "Then state where the commits go, below, and wait. The owner accepts it or names another mode",
    );
    expect(block).toContain("**Propose the mode and where, then wait.**");
    expect(block).toContain(
      "Work that will be split into tickets waits twice: at the start, for the planning change's mode, careful, unless the request names it;",
    );
  });

  it("a branch a repository rule forbids is the one question, and a branch left to the agent is one the rules allow", () => {
    expect(block).toContain(
      "Where a repository rule forbids committing on the branch the local facts give and the request names no branch, ask which, recommending `greenline/<id>`, and start once it is answered; a branch the owner leaves to you is one the repository's rules allow, never one they forbid.",
    );
  });
});

describe("J-84 S3 the floor recorded and the owner's choice below it", () => {
  it("the block has the record name every floor found, whoever chose the mode", () => {
    expect(block).toContain(
      "Either way the record names every floor found, as the ledger guide says.",
    );
  });

  it("the ledger guide names the floor, its source and, below it, the owner's choice and the floor's reason, with one mode field", () => {
    expect(ledger).toContain(
      "Every floor you find, at the proposal or during the work, goes into `floors` when you find it, whatever the mode and whoever chose it.",
    );
    expect(ledger).toContain(
      "The frame section names where each floor came from: the decision, the file or the call that raised it.",
    );
    expect(ledger).toContain(
      "Where the owner names a mode below a floor, the record says `choice: owner` with `proposed` the mode you proposed, and the frame section states the floor's reason, so a reader sees the owner chose below it.",
    );
    expect(ledger).toContain(
      "A floor is never a second mode: `mode` is the one mode the change runs under.",
    );
  });

  it("the frame line carries the floors and their source", () => {
    expect(frame).toContain(
      "It also names each floor found and where it came from, and under a mode the owner chose below one, the floor's reason.",
    );
  });
});

describe("J-84 S3 the ticket list's words edit the entry; at a ticket's open they override", () => {
  it("the plan skill writes a mode named at the list into the entry and records a mode named at the open as an override", () => {
    expect(plan).toContain(
      "A mode the owner names beside a ticket while the list waits is part of approving it and edits that ticket's entry: write it there before the list is complete.",
    );
    expect(plan).toContain(
      "A mode the owner names when a ticket opens, once the list is approved, overrides that ticket alone: open its record under the owner's mode with `choice: owner` and `proposed` the entry's mode, leave the entry as approved, and `greenline status` marks the difference (GL0406).",
    );
  });

  it("the block opens a ticket under the owner's override too", () => {
    expect(block).toContain(
      "A ticket then opens under its approved mode, or one the owner names as it opens, with no further wait, on the planning change's branch.",
    );
  });

  it("the ledger guide records the override the same way", () => {
    expect(ledger).toContain(
      "A mode the owner names while the ticket list waits edits that ticket's entry in `tickets.md`; a mode the owner names when a ticket opens is an override of that ticket: its record says `choice: owner`, `proposed` the entry's mode, and `greenline status` marks the difference (GL0406), the owner's choice standing.",
    );
  });
});

describe("J-84 S3 the mode stated first and its cost restated, and J-93 S1 no step a trial", () => {
  it("under proceed the proposal states the mode before the work", () => {
    expect(block).toContain(
      "The proposal still comes before the first edit, the mode stated as taken with its reason and the where line,",
    );
  });

  it("a mode the owner names above the proposal has its cost restated before the work", () => {
    expect(block).toContain(
      "The owner accepts it or names another mode or branch, and that choice is final; a mode named above yours has its cost in agents and rounds restated before the work.",
    );
  });

  it("J-93 S1 names no trial step: every step runs where the mode reaches it", () => {
    expect(block).not.toMatch(/trial step/);
  });
});

describe("J-84 S3 the builder reads the reviewer's brief at the inline depth only", () => {
  it("the review skill says who reads the brief at each depth", () => {
    expect(review).toContain(
      "Who reads the brief depends on the depth: at the inline depth the builder reads it whole, reviewing its own commits; where fresh agents review, each fresh reviewer reads it whole and the builder never reads it, nor a brief file, which the builder never opens.",
    );
    // J-89 S1: the brief file is the command's, and the builder starts the reviewer with it unread.
    expect(review).toContain(
      "At the independent depth the builder reads [reviewers.md](reviewers.md), starts each reviewer with the brief file `greenline brief` writes, and never reads the reviewer's brief or a brief file.",
    );
  });

  it("the brief says the same at its head", () => {
    expect(brief).toContain(
      "This page is the reviewer's: a fresh reviewer reads it whole at the independent depth, and the builder reads it only at the inline depth, reviewing its own commits, the fallback a harness with no delegation takes included, and never where fresh reviewers run.",
    );
  });
});

describe("J-84 S3 the frame asks what is open and credits the owner only with the owner's choices", () => {
  it("at the written depth every open behaviour goes to the owner through the interview", () => {
    expect(frame).toContain(
      "At this depth every behaviour the request leaves open goes to the owner through the interview, each with your recommended answer, and none is settled on your own.",
    );
    expect(block).toContain(
      "A product behavior the request left open (what a user would notice) and the frame does not ask is decided,",
    );
  });

  it("the inline line records only a choice the owner made and puts an unclear term to the owner", () => {
    expect(frame).toContain(
      "A term the request leaves unclear is such a question: put it to the owner, never settle it by your own reading.",
    );
    expect(frame).toContain(
      "The line credits the owner only with a choice the owner made, in the request or in an answer; a choice you made is written as yours.",
    );
  });
});
