/** The reviewer's brief kept from the builder (J-89 S1): the sentences the ledger guide, the work guide and the review, verify and close skills give an agent, read from the corpus as it ships. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repository = join(import.meta.dirname, "..", "..");

/** A corpus page's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return readFileSync(join(repository, "corpus", path), "utf8").replace(/\s+/g, " ");
}

const ledger = page("runtime/ledger.md");
const work = page("runtime/work.md");
const review = page("skills/review/SKILL.md");
const reviewers = page("skills/review/references/reviewers.md");
const brief = page("skills/review/references/brief.md");
const verify = page("skills/verify/SKILL.md");
const close = page("skills/close/SKILL.md");
/** A step's references page, where its commands and paths stand since J-93 S2. */
const references = (step: string): string => page(`skills/${step}/references/greenline.md`);

describe("J-89 S1 the builder never handles a brief file", () => {
  it("the ledger guide has greenline brief write the reviewer's and the verifier's brief into the change's folder, and the builder never open one", () => {
    expect(ledger).toContain(
      "A reviewer's and a verifier's brief is a file the builder never writes: `greenline brief --change <id> --step <step> --round <n>`",
    );
    expect(ledger).toContain("`.greenline/ledger/<id>/brief-<step>-<n>.md`");
    expect(ledger).toContain("Start the agent with that path and nothing else.");
    expect(ledger).toContain(
      "The builder never opens, copies, diffs or derives a brief file, one the command wrote included: a read of one is a finding for the next review",
    );
    expect(ledger).toContain("(GL0408)");
    expect(ledger).toContain(
      "Anticipate's brief is the builder's file, `.greenline/tmp/<id>/brief-anticipate-<n>.md`",
    );
    expect(ledger).not.toContain("`.greenline/tmp/<id>/brief-<step>-<n>.md`");
    expect(work).not.toContain("`.greenline/tmp/<id>/brief-<step>-<n>.md`");
  });

  it("the reviewers page has the command write each reviewer's brief and the builder start the reviewer with its path alone", () => {
    expect(reviewers).toContain("You never write a reviewer's brief.");
    expect(reviewers).toContain(
      'For each reviewer run `greenline brief --change <id> --step review --round <n> --intent "<your intent paragraph>"`',
    );
    expect(reviewers).toContain("start the reviewer with that path and nothing else");
    expect(reviewers).toContain(
      "Never open, copy, diff or derive a brief file, one the command wrote for you included: a read of one is a finding for the next review",
    );
    expect(reviewers).toContain("which the reviewer alone reads whole");
    expect(reviewers).not.toContain(".greenline/tmp/<id>/brief-review-<n>.md");
  });

  it("the review skill and the reviewer's page say the same", () => {
    // J-93 S2: the command is named on review's references page; the front keeps the rule.
    expect(references("review")).toContain(
      "starts each reviewer with the brief file `greenline brief` writes, and never reads the reviewer's brief or a brief file.",
    );
    expect(review).toContain("nor a brief file, which the builder never opens.");
    expect(brief).toContain(
      "the file the brief command wrote from the record, whose path the builder gave you",
    );
    expect(references("review")).toContain(
      "Its brief is the file `greenline brief` wrote from the record",
    );
  });

  it("the verify skill starts its fresh agent with the path the command prints", () => {
    // J-93 S2: the independent depth stands on verify's references page.
    expect(references("verify")).toContain(
      "It is started with the path `greenline brief --change <id> --step verify --round 1` prints, and nothing else",
    );
    expect(references("verify")).toContain(
      "The builder never writes, opens, copies, diffs or derives a brief file.",
    );
    expect(verify + references("verify")).not.toContain(".greenline/tmp/<id>/brief-verify-1.md");
  });

  it("the close section links each brief the command wrote, from the status listing", () => {
    expect(close).toContain(
      "a link to each brief the change's status lists, taken from that listing and never by opening one",
    );
    // J-93 S2: the status command and the brief command stand on close's references page.
    expect(references("close")).toContain(
      "the files it changed and each brief as `greenline brief` wrote it",
    );
  });
});
