/** The fresh agent's scratch folder and the count of every agent started (J-89 S3): the sentences the ledger guide and the review, verify and close pages give an agent, read from the corpus as it ships. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repository = join(import.meta.dirname, "..", "..");

/** A corpus page's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return readFileSync(join(repository, "corpus", path), "utf8").replace(/\s+/g, " ");
}

const block = page("runtime/agent.md");
const ledger = page("runtime/ledger.md");
const brief = page("skills/review/references/brief.md");
/** What the verify step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const verify = [page("skills/verify/SKILL.md"), page("skills/verify/references/greenline.md")].join(
  " ",
);
/** What the close step gives an agent: its front and, since J-93 S2, its references page, which the loop loads with it. */
const close = [page("skills/close/SKILL.md"), page("skills/close/references/greenline.md")].join(
  " ",
);

describe("J-89 S3 a fresh agent works in its own scratch folder", () => {
  it("the ledger guide's one brief names the agent's scratch folder and the rule, and the checks name --round", () => {
    expect(ledger).toContain(
      "the path of its report, the absolute path of its scratch folder, `.greenline/tmp/<id>/<step>-<n>/`, and the skill it works by",
    );
    expect(ledger).toContain(
      "Every working file the agent writes goes in its scratch folder, or where its skill names under `.greenline/tmp/<id>/`, never the host's temporary directory, and a working file there is a finding.",
    );
    expect(ledger).toContain(
      "A fresh agent gives the `--step` and the `--round <n>` its brief names, and `check` runs the command with `TMPDIR` set to that agent's scratch folder.",
    );
  });

  it("the reviewer's page and the verify skill's fresh agent say the same once each", () => {
    expect(brief).toContain(
      "your scratch folder, by its absolute path, where every working file you write goes, never the host's temporary directory, a working file there a finding;",
    );
    // J-93 S2: the scratch folder's path and the round stand on review's references page.
    const reviewPage = page("skills/review/references/greenline.md");
    expect(reviewPage).toContain("and its scratch folder `.greenline/tmp/<id>/review-<n>/`.");
    expect(reviewPage).toContain(
      "a fresh reviewer adding the `--round <n>` its brief names, which sets `TMPDIR` to its scratch folder",
    );
    expect(brief.split("never the host's temporary directory").length).toBe(2);
    expect(verify).toContain(
      "its scratch folder, `.greenline/tmp/<id>/verify-1/`, by its absolute path, and this skill to work by.",
    );
    expect(verify).toContain(
      "`greenline check --change <id> --step verify -- <command>`, a fresh verifier adding the `--round <n>` its brief names,",
    );
    expect(verify).toContain(
      "Every working file it writes goes in its scratch folder or a claim's folder, never the host's temporary directory, a working file there a finding, and it runs each check with `--step verify --round <n>`, which sets `TMPDIR` to its scratch folder.",
    );
  });

  it("the scratch sentence stands on build's page and the block keeps its promise, naming no TMPDIR", () => {
    expect(page("skills/build/references/greenline.md")).toContain(
      "yours or a fresh agent's, goes under `.greenline/tmp/<id>/`, never the host's temporary directory",
    );
    expect(block).toContain(
      "Every scratch file goes under `.greenline/tmp/<id>/`, never the host's temporary directory.",
    );
    expect(block).not.toContain("TMPDIR");
  });
});

describe("J-89 S3 the record counts every agent started", () => {
  it("the ledger guide states the starts row's form and says the cost counts every start in one sentence", () => {
    expect(ledger).toContain(
      '| `starts` | each fresh agent the line\'s depths started, stated with the cost: one item per start, `"<step> <n>"`, or `"<step> <n> restarted"` for a restart |',
    );
    expect(ledger).toContain(
      "`agents` counts every start, a restarted agent one more line in `starts` and one more count, and `greenline status` reports an `agents` below the builder and the starts the record names, in `starts` or by a fresh agent's report in its folder, as GL0409, which the close clears before `done`.",
    );
    expect(ledger).toContain(
      "a start that is not a step of the modes and a number, `restarted` after them or not;",
    );
  });

  it("the close names each start and sets done only once status reports no cost below them", () => {
    expect(close).toContain(
      "and the cost, the agents and the rounds the change used, with `starts` naming each fresh agent started, such as `review 1`, a restart one more line, `review 1 restarted`, and one more agent.",
    );
    expect(close).toContain(
      "Set `done` only once `greenline status --change <id>` reports no cost below the starts the record names (GL0409).",
    );
  });
});
