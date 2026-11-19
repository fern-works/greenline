/** The conduct the 0.2.0 series on Codex found missing (J-175 S1): the sentences the step skills, the starts and the habits give an agent for each judgment the runs got wrong, read from the corpus as it ships, each naming the case that found it. The public tree carries this test and the corpus, never docs/ or workshop/, so it reads the corpus alone. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusPage } from "./skill-text.ts";

const repository = join(import.meta.dirname, "..", "..");

/** A file's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return corpusPage(repository, path);
}

/** A skill's front and its references page, as the loop loads them together. */
function step(skill: string): string {
  return [page(`skills/${skill}/SKILL.md`), page(`skills/${skill}/references/greenline.md`)].join(
    " ",
  );
}

describe("J-175 S1 the frame's decisions", () => {
  it("reads each floor in the code itself and names it with its file (j109t-mode-below-floor, finding 1)", () => {
    expect(step("frame")).toContain(
      "Read each floor in the code the request touches yourself, not only in the situation line: a secret, a key or a signature's expiry, an auth check, a migration, a public contract or a behaviour no check could fail; each raises the mode you propose and stands in the proposal with the file it came from.",
    );
  });

  it("writes a fact the repository settles with its source, never as a round the owner answered (j109t-line-depths-2, F2)", () => {
    expect(step("frame")).toContain(
      "A fact the repository's documents or code settle is no question: write it in the frame with its source, never as a round the owner answered.",
    );
  });

  it("looks a fact up inline, the web included, and proposes research only at careful (the seven cuts)", () => {
    expect(page("skills/frame/SKILL.md")).toContain(
      "A question that waits on a fact the repository does not hold: look it up yourself, the web included, and name its source; at careful, a question that needs a reading of its own is proposed as research,",
    );
    expect(page("skills/research/SKILL.md")).toContain(
      "A fact the builder can look up needs no research agent: frame reads it inline, the web included, and names its source.",
    );
    expect(step("frame")).not.toContain("the hooks refuse a web fetch");
  });
});

describe("J-175 S1 the close's decisions", () => {
  it("names the audit's parts and says the record was audited only once each was read (j109t-landing-2, j109t-line-depths-1 F3)", () => {
    const close = step("close");
    expect(close).toContain(
      'The audit\'s parts, each written in the close section: the skills the sections and the `skills` line name against the loads `greenline status --change <id>` lists, each difference named, declared and never loaded or loaded and not declared; each lasting choice by its entry in the decisions book, or one sentence of why none is owed, never "No ADR needed" alone;',
    );
    expect(close).toContain(
      "Each part close's references page names for the audit is read before the close section says the record was audited.",
    );
  });

  it("closes careful with the review's one table even where both reports found nothing (j109t-line-depths-2, F1)", () => {
    expect(step("review")).toContain(
      "At careful the table stands even where no report found anything: a row for each report, its finding `none found`, and your ruling under it.",
    );
  });

  it("resumes a stopped change on the owner's words, the record set open first (j109t-states-stop-2, F1)", () => {
    expect(step("close")).toContain(
      'The owner\'s words that answer it, such as "the tests look right; write the code", lift it: set the record `open` as your first write, rewrite the "next" line and go on from the step it names;',
    );
  });

  it("tells a resume apart from the answer to a wait on the owner, and keeps the shown edits as the folder's patch (J-214 S1, j196t-states-stop-2d F1 and F2)", () => {
    const close = step("close");
    expect(close).toContain(
      'A resume, such as "carry on with that change", answers the stop and not a wait the "next" line names for the owner\'s review or answer: where the status line says `the wait on the owner stands`, set the record `open` as your first write, do the wait\'s act first, showing again what it waits on where this checkout holds none, and wait for the owner\'s answer to it.',
    );
    expect(close).toContain(
      "keep them as `shown.patch` in the record's folder, `git diff HEAD -- <their paths>`, so the stop's commit carries them, since a clone carries commits alone;",
    );
  });
});

describe("J-175 S1 the build's and verify's decisions", () => {
  it("shows a structural slice's resulting shape inline and starts careful's build after the premise review (j109t-pictures-inline, j109t-pictures-offer)", () => {
    const build = step("build");
    expect(build).toContain(
      "A slice that moves a shape, a module extracted or a schema, a state machine or a flow changed, shows the resulting shape inline on the turn it lands, in one of show-me's six forms: prose alone does not show a shape.",
    );
    expect(build).toContain(
      "At careful the build starts only once anticipate's report is in and the plan answers its findings: a premise review run after the code is no premise review.",
    );
    expect(build).not.toContain("progress line");
  });

  it("starts the premise reader fresh, never a fork where the builder can choose (j109t-handoff F4)", () => {
    expect(page("skills/anticipate/references/greenline.md")).toContain(
      "started through the harness's delegation, fresh and never a fork of your conversation where the harness lets you choose,",
    );
  });
});

describe("J-175 S1 the starts' decisions", () => {
  it("diagnose's ranked list stands in the reply with a prediction on each line (j109t-starts-habits-failure, F1)", () => {
    expect(page("skills/diagnose/SKILL.md")).toContain(
      "Write the ranked list in the reply before the first probe runs, one numbered line per hypothesis with the prediction that would refute it,",
    );
  });

  it("groundwork runs inside the first change and installs nothing outside a repository before the yes (j109t-situation-no-repository)", () => {
    expect(page("skills/groundwork/SKILL.md")).toContain(
      "Outside a Git repository, offer `git init` in one line and end the turn: nothing is initialized or installed before the owner's yes.",
    );
  });

  it("an asked-for map is carried to its last page under a record (j109t-cli, F3)", () => {
    expect(page("skills/explain/SKILL.md")).toContain(
      "A map the owner asked for is carried to its last page under the change's record, and the close names any page not made.",
    );
  });
});

describe("J-175 S1 the words the mechanisms now hold leave", () => {
  it("no skill offers a lasting picture, and none remembers an offer (the seven cuts)", () => {
    for (const path of [
      "skills/show-me/SKILL.md",
      "skills/show-me/references/greenline.md",
      "skills/diagram-design/SKILL.md",
      "skills/diagram-design/references/greenline.md",
      "skills/explain/SKILL.md",
      "skills/explain/references/greenline.md",
      "skills/groundwork/references/greenline.md",
      "skills/architecture-survey/references/greenline.md",
      "skills/plan/references/greenline.md",
      "skills/anatomy/SKILL.md",
      "skills/architecture-map/SKILL.md",
    ])
      expect(page(path), path).not.toMatch(
        /one warm (sentence|offer)|the offer is made once|the map's `offers`|owes that offer|is offered in one sentence/,
      );
  });

  it("the block names no harness feature as required and keeps the record's lines the agent's", () => {
    const block = page("runtime/agent.md");
    expect(block).not.toContain("a harness hook prints it");
    expect(block).not.toContain("which the close sets beside the skill loads the hooks note");
    expect(block).toContain(
      "Every line of the record is yours, written in your own words for its meaning, the `skills`, `agents` and `rounds` lines too, reconciled against the hints `greenline status` shows;",
    );
  });
});
