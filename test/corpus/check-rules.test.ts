/** The checks and the close's end (J-84 S2): the sentences the block, the ledger guide and the build, review, verify and close skills give an agent, read from the corpus as it ships. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repository = join(import.meta.dirname, "..", "..");

/** A corpus page's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return readFileSync(join(repository, "corpus", path), "utf8").replace(/\s+/g, " ");
}

const block = page("runtime/agent.md");
/** A step's references page, where J-93 S1 moved the block's mechanics of that step. */
const references = (step: string): string => page(`skills/${step}/references/greenline.md`);
const ledger = page("runtime/ledger.md");
const build = page("skills/build/SKILL.md");
const brief = page("skills/review/references/brief.md");
const verify = page("skills/verify/SKILL.md");
const close = page("skills/close/SKILL.md");

const PLAIN =
  "the same command run plainly, `npm test` or `node --test`, is a read that proves nothing to the record";

describe("J-84 S2 every check through greenline check", () => {
  it("the review page extends the check rule to a fresh agent's checks, and a plain test command proves nothing", () => {
    expect(references("review")).toContain(
      `A fresh agent's checks run through \`greenline check\` too, as \`greenline check --change <id> --step <step> -- <command>\`: ${PLAIN}.`,
    );
  });

  it("the build skill runs each increment's checks through greenline check", () => {
    // J-93 S2: the recorder stands on build's references page.
    expect(references("build")).toContain(
      "Run each of `SKILL.md`'s increment checks, and the completion contract's final test run, through `greenline check -- <command>`, its red runs included, so the change's checks record it:",
    );
  });

  it("the review skill and the reviewer's brief run a reviewer's checks through greenline check, with the review step", () => {
    // J-93 S2: the recorder's command stands on review's references page, which the brief names.
    expect(references("review")).toContain(
      "A reviewer's checks of the change's code run through `greenline check --change <id> --step review -- <command>`, as the brief says, and so do the builder's in its fix rounds.",
    );
    expect(references("review")).toContain(
      `Every check you run of the change's code, its tests, its linter, its build or a script that exercises a behaviour its acceptance claims, runs through \`greenline check --change <id> --step review -- <command>\`, a fresh reviewer adding the \`--round <n>\` its brief names, which sets \`TMPDIR\` to its scratch folder, so the record holds its facts: ${PLAIN}.`,
    );
    expect(brief).toContain(
      "Every check you run of the change's code, its tests, its linter, its build or a script that exercises a behaviour its acceptance claims, is recorded, as review's references page says,",
    );
    expect(brief).toContain(
      "you write nothing in the repository but your report, the facts of the checks you record and the working files in your scratch folder.",
    );
    expect(brief).not.toContain("you write nothing in the repository but your report.");
    expect(brief).toContain(
      "Your review is read-only: do not change the index, HEAD, a branch or the working tree, your report, the facts your recorded checks write and your scratch folder excepted;",
    );
  });

  it("the verify skill says the same of the verifier's checks", () => {
    expect(verify).toContain(
      `A verifier's check is the change's check like the builder's: ${PLAIN},`,
    );
    expect(ledger).toContain(`A reviewer's and a verifier's checks are no exception: ${PLAIN}.`);
  });
});

describe("J-89 S2 every check through the recorder on a long build", () => {
  it("the build skill writes each example of a check as the recorder runs it, the short form first", () => {
    // J-93 S2: the front's checklist is upstream's again, and the references page runs every
    // one of its checks through the recorder, the short form first.
    expect(build).toContain(
      "(the repository's test command: `npm test`, `./gradlew test`, `pytest`, ...)",
    );
    expect(build.split("## Handoff")[0]).not.toContain("greenline check");
    expect(references("build")).toContain(
      "Run each of `SKILL.md`'s increment checks, and the completion contract's final test run, through `greenline check -- <command>`",
    );
    expect(references("build")).toContain(
      "the short form takes the open change and the step its record is in, and names that step beside the facts, so give `--change <id> --step <step>` where it names another.",
    );
  });

  it("the build skill runs a read's red command again green once fixed, since done waits on it", () => {
    expect(references("build")).toContain(
      "Each such command is a check of its own: once its cause is fixed, run it again green, since `done` waits on the latest run of every check.",
    );
  });

  it("the build and verify skills name a rerun made only to read a check, and the plain run a probe alone", () => {
    expect(references("build")).toContain(
      "A run of the change's code you make only to read, a failing test's detail or a quick look after an edit, is a check too: `greenline check -- node --test --test-name-pattern=<name> <file>` records it,",
    );
    expect(references("build")).toContain(
      "The one run left plain is a probe, a run whose green the change never claims: a baseline at an earlier commit, a mutation run, a negative control.",
    );
    expect(verify).toContain(
      "and so is one test run plainly again to read why it failed: record it too. The one run left plain is a probe.",
    );
    expect(references("verify")).toContain(
      "Run each check through `greenline check -- <command>`, which takes the open change and the step its record is in and names that step beside the facts, or with both named, `greenline check --change <id> --step verify -- <command>`, a fresh verifier adding the `--round <n>` its brief names, as the block gives a fresh agent and wherever the step it names is another,",
    );
    expect(ledger).toContain(
      "a red one included, such as the red of the red-green cycle, and a rerun made only to read why it failed.",
    );
  });

  it("the ledger guide gives the short form and the step it reads, and status's count of the commits since the last recorded check", () => {
    expect(ledger).toContain(
      "Run every check through `greenline check -- <command>`, or `greenline check --change <id> --step <step> -- <command>`.",
    );
    expect(ledger).toContain(
      'Left out, `--change` takes the one open change and `--step` the step its record is in: the step its "next" line names, or else the first required section not yet written, which `check` names beside the facts.',
    );
    expect(ledger).toContain(
      "for an open change counts the commits of code since its last recorded check, a nudge to run the checks again and never a finding.",
    );
    expect(references("build")).toContain(
      "`greenline status --change <id>` counts the commits since the last recorded check, and a count above zero is code committed since that no recorded check saw.",
    );
  });

  it("the close's audit runs the checks again when status counts commits since the last recorded check", () => {
    expect(close).toContain(
      "The change's status counts the commits since the last recorded check: above zero, they may hold code no recorded check saw, so record the change's checks again on the final code before it is done,",
    );
    expect(references("close")).toContain(
      "and counts the commits since the last recorded check; the audit and the close section read their numbers there.",
    );
  });

  it("the tdd habit runs its loop's tests through the recorder's short form, a rerun made only to read included (J-89 S5)", () => {
    const tdd = page("skills/tdd/SKILL.md");
    expect(tdd).toContain(
      "Record the focused command's runs during the loop as checks, each red, each green and each rerun made only to read why a test failed;",
    );
    // J-93 S2: the recorder's short form stands on tdd's references page.
    expect(page("skills/tdd/references/greenline.md")).toContain(
      "Each run of the focused command during the loop, red, green or a rerun made only to read why a test failed, goes through `greenline check -- <command>`, so the change's checks record it.",
    );
    expect(tdd).not.toContain("each red and each green through `greenline check`,");
  });

  it("the block's check sentence stays as J-84 made it, on build's page since J-93 S1, the block keeping its promise", () => {
    expect(block).toContain(
      "Every check runs through `greenline check`, a red run included; a command run plainly proves nothing.",
    );
    expect(references("build")).toContain(
      "Every check runs through `greenline check`, its red runs included; a probe, a run whose green the change never claims, runs outside it, as the verify skill says.",
    );
  });
});

describe("J-84 S2 recorded facts never removed", () => {
  it("the block, build's page and the ledger guide forbid removing or editing a recorded fact, and name the probe mark", () => {
    expect(block).toContain("a recorded check fact is never edited or removed.");
    expect(references("build")).toContain(
      "A recorded check fact is never removed or edited: a rerun records a new one, and a probe recorded by mistake is marked with `greenline check --change <id> --probe <fact>`.",
    );
    expect(ledger).toContain(
      "A recorded check fact is never removed or edited, by the session holding the change or by a fresh agent: a rerun of a command records a new fact beside the earlier ones, and `check` never writes over a facts file already standing.",
    );
    expect(ledger).toContain(
      "Each fact names, as `previous`, the newest fact the folder held when its run started, so `greenline status` names a fact removed from between two runs (GL0459), whose remedy is to restore it from history; a fact removed while it was the newest leaves no trace, since the next run names the one before it, and that is no licence to remove one.",
    );
    expect(ledger).toContain(
      "A probe recorded through `check` by mistake stays where it is: mark it with `greenline check --change <id> --probe <fact>`, and `status` leaves it out of the change's checks, the latest-run rule and GL0451 included; the verify section says why it was marked.",
    );
    expect(verify).toContain(
      "A probe recorded as a check by mistake is never removed or edited: mark it as verify's references page says, which leaves it out of the change's checks, and say in the verify section why.",
    );
    expect(references("verify")).toContain(
      "a probe recorded through `greenline check` by mistake is marked with `greenline check --change <id> --probe <fact>`, which leaves it out of the change's checks.",
    );
  });
});

describe("J-84 S2 the close's writes before the last check, and tidy at every close", () => {
  it("the close runs the checks again after its writes outside .greenline/, and close's page says every close does", () => {
    expect(close).toContain(
      "Once the decisions and the terms are written, record again each check whose code they moved: an ADR or a glossary entry outside the workspace's own folder moves the code a check last ran on, and the change's status names each such check. No write outside that folder follows that run but the landing's merge, whose checks run on the merged result.",
    );
    expect(references("close")).toContain(
      "a write outside `.greenline/` moves the code a check last ran on, and `greenline status --change <id>` names each such check (GL0451).",
    );
    expect(references("close")).toContain(
      "Every close, the quick mode's included, writes its terms and decisions before the checks' last run, so no check is older than the code, and ends with `greenline tidy --change <id>`.",
    );
  });

  it("tidy runs at every close, the quick mode's inline close included", () => {
    expect(references("close")).toContain(
      "Remove the working files with `greenline tidy --change <id>` at every close, the quick mode's inline close included:",
    );
    expect(references("close")).toContain(
      "Close the record by `SKILL.md`'s steps, every one of them, the checks' last run and `greenline tidy` included.",
    );
    expect(close).toContain("8. Remove the working files at every close,");
  });
});

describe("J-84 S2 the status history names each code commit", () => {
  it("the change's first commit carries its record, and the close names a commit made before it", () => {
    expect(references("frame")).toContain(
      "The change's first commit carries its record: `greenline status` reads history only from the commit where the first change record entered.",
    );
    expect(ledger).toContain(
      "The change's first commit carries its record: `greenline status` reads history only from the commit where the first change record entered the repository, so in a repository's first change a commit made before its record is counted nowhere.",
    );
    expect(references("build")).toContain(
      "and the change's first commit carries its record, `.greenline/ledger/<id>.md`, since `greenline status` reads history only from the commit where the first change record entered",
    );
    expect(close).toContain(
      "Every code commit of the change is among those its status lists. One made before the record entered the repository, in a repository's first change, is counted for no change: name it in the close section by its short hash, and leave it as it is.",
    );
  });
});

describe("J-84 S2 the practice, never the product's name", () => {
  it("the block speaks of the practice and tells the agent never to call it by its CLI's name", () => {
    expect(block).toContain("You are the agent of this repository's practice.");
    expect(block).toContain(
      "To the owner, call it the practice, never by the name of the CLI that installs it; a command, a path or a branch is quoted as it stands.",
    );
    expect(references("frame")).toContain("you maintain the practice's installed files");
    // The product's name appears in the block only inside a command, a path, a branch or the trailer.
    const prose = block.replace(/`[^`]*`/g, "");
    expect(prose).not.toMatch(/greenline/i);
  });
});

describe("J-84 S2 verify's baseline on a copy", () => {
  it("verify captures a baseline in a copy of the earlier commit and never touches the change's working tree", () => {
    expect(verify).toContain(
      "Capture a baseline at an earlier commit in a copy of that commit, never in the change's working tree: export it with `git archive <commit> | tar -x -C <folder>` into the claim's `baseline/` folder, link in what the command needs and the copy lacks, such as installed dependencies, and run the command there.",
    );
    expect(references("verify")).toContain("its baseline's copy in its `baseline/` folder");
    expect(verify).toContain(
      "Never check out the earlier commit, revert a fix or copy an old file over the change's working tree: it stays as the build left it, its uncommitted work included.",
    );
    expect(verify).toContain(
      "Once its probes have run and what the verdict relies on is promoted, remove the copy, so that no check of the change, run at the repository root, reads it.",
    );
    expect(verify).toContain(
      "The revert runs in the baseline's copy, never in the change's working tree: put the regression test into the copy of the commit before the fix and run it there, plainly, as a probe that must fail;",
    );
    expect(verify).not.toContain("return HEAD, the branch and any uncommitted work");
  });
});
