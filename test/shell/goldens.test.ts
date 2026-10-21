import { fixtureConfiguration, gardenEnabledConfiguration } from "../fixtures/corpus.ts";
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { compileInstallation } from "../../src/shell/installation.ts";
import { renderProjection } from "../../src/core/render.ts";
import { findBrokenReferences } from "../../src/core/links.ts";
import { wordsOf } from "../../src/corpus/segments.ts";
// @ts-expect-error plain-mjs gate helper shares the path mapping (audit 4, R1)
import { gardenDelta, goldenPath } from "../../scripts/lib/golden-path.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

const goldenRoot = join(repoRoot, "test", "goldens", "corpus");
const enabledRoot = join(repoRoot, "test", "goldens", "garden-enabled");

function walk(root: string): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else
        out.push(
          full
            .slice(root.length + 1)
            .split(sep)
            .join("/"),
        );
    }
  };
  visit(root);
  return out;
}

describe("full-corpus golden projection", () => {
  const release = compileInstallation(join(repoRoot, "corpus"));
  if (release._tag === "err") throw release.error;
  const manifest = {
    ...fixtureConfiguration,
  };
  const projection = renderProjection(manifest, release.value);

  it("matches the committed golden tree exactly (both targets)", () => {
    // Flat-sort both sides: the projection sorts full path strings while
    // the walk sorts per directory, and the two orders diverge when one
    // sibling name prefixes another (ponytail / ponytail-review).
    const flat = (paths: readonly string[]): readonly string[] => [...paths].sort();
    expect(flat(projection.map((file) => goldenPath(file.path)))).toEqual(flat(walk(goldenRoot)));
    for (const file of projection) {
      const golden = readFileSync(join(goldenRoot, goldenPath(file.path)), "utf8");
      expect(golden, `${file.path} diverges from the golden`).toBe(file.content);
    }
  });

  it("renders no broken same-directory references", () => {
    // `-template.md` support files are skeletons for the repo their skill
    // generates (product-description); their relative links resolve in
    // that built repo, never inside the projection.
    const skillFiles = projection.filter(
      (file) =>
        (file.path.startsWith(".agents/skills/") || file.path.startsWith(".claude/skills/")) &&
        !file.path.endsWith("-template.md"),
    );
    expect(findBrokenReferences(skillFiles)).toEqual([]);
  });
});

describe("the garden-enabled golden: what enabling garden adds to the default projection", () => {
  const release = compileInstallation(join(repoRoot, "corpus"));
  if (release._tag === "err") throw release.error;
  const disabled = renderProjection(fixtureConfiguration, release.value);
  const enabled = renderProjection(gardenEnabledConfiguration, release.value);

  it("holds exactly the files enabling adds or changes, each byte for byte, and enabling removes none", () => {
    const delta: readonly { path: string; content: string }[] = gardenDelta(disabled, enabled);
    const flat = (paths: readonly string[]): readonly string[] => [...paths].sort();
    expect(flat(delta.map((file) => goldenPath(file.path)))).toEqual(flat(walk(enabledRoot)));
    for (const file of delta) {
      const golden = readFileSync(join(enabledRoot, goldenPath(file.path)), "utf8");
      expect(golden, `${file.path} diverges from the enabled golden`).toBe(file.content);
    }
    // Every other enabled file is the default golden's own bytes.
    const changed = new Set(delta.map((file) => file.path));
    for (const file of enabled.filter((entry) => !changed.has(entry.path)))
      expect(readFileSync(join(goldenRoot, goldenPath(file.path)), "utf8")).toBe(file.content);
  });

  it("renders no broken same-directory references in the skill enabling adds", () => {
    const skillFiles = enabled.filter((file) => file.path.includes("/skills/use-garden/"));
    expect(skillFiles.length).toBeGreaterThan(0);
    expect(findBrokenReferences(skillFiles)).toEqual([]);
  });
});

describe("S16a the stored block: the loop under the modes and the roster by kind", () => {
  const block = readFileSync(join(goldenRoot, "AGENTS.md"), "utf8");
  const release = compileInstallation(join(repoRoot, "corpus"));
  if (release._tag === "err") throw release.error;
  const { modes, skills, intents } = release.value;

  it("introduces each kind once, by its when-sentence taken from the modes definition", () => {
    for (const kind of modes.kinds) expect(block.split(kind.when).length - 1, kind.name).toBe(1);
  });

  /** A step's references page as the golden stores it, its white space folded. */
  const references = (step: string): string =>
    readFileSync(
      join(goldenRoot, goldenPath(`.agents/skills/${step}/references/greenline.md`)),
      "utf8",
    ).replace(/\s+/g, " ");

  it("J-93 S1 cut the block to under 1,500 words in both states, holding the loop, the promises, the situation index, the modes and the roster", () => {
    for (const root of [goldenRoot, enabledRoot]) {
      const stored = readFileSync(join(root, "AGENTS.md"), "utf8");
      expect(wordsOf(stored).length, root).toBeLessThan(1500);
      expect(stored.split("\n").filter((line) => line.startsWith("## "))).toEqual([
        "## The request loop",
        "## The promises",
        "## When this happens, read this",
        "## The modes",
        "## Step skills",
        "## Start skills",
        "## Habit skills",
      ]);
    }
  });

  it("J-93 S1 the loop proposes the mode and where, waits, opens the record from the ledger guide and runs each step with its references page", () => {
    const text = block.replace(/\s+/g, " ");
    expect(text).toContain("**Propose the mode and where, then wait.**");
    expect(text).toContain(
      "Wait for the owner's yes, unless the request names the mode or the `proceed` setting allows it; state the proposal all the same.",
    );
    expect(text).toContain("from its mode's skeleton in `.greenline/ledger/README.md`");
    expect(text).toContain(
      "load the step's skill and its references page, `references/greenline.md`, which says where the step's work lands",
    );
    // J-93 S1's review: the loop still skips a step at none, and states the fallback with no delegation.
    expect(text).toContain("each at the depth the mode gives it, skipping a step at none:");
    expect(text).toContain(
      "Where the harness has no delegation, a depth that needs a fresh agent runs without one: review inline, verify written, anticipate as its self-questioning pass, the section naming the limit.",
    );
    expect(text).toContain(
      "Work that splits into tickets waits twice: for the planning change's mode, careful, and for the ticket list.",
    );
    expect(text).toContain("| Agents, at most | 1 | 2 | 5 |");
  });

  it("J-93 S1 and S3 keeps each promise one line, the trailer, done on green, the yes, the recorded check and the scratch folder among them, each a hook holds naming it", () => {
    const text = block.replace(/\s+/g, " ");
    for (const promise of [
      "Every commit of a change carries `Greenline-Change: <id>` as the last line of its message's last paragraph; no commit is rewritten to move it. Git hooks hold both.",
      "A change is `done` only when the latest recorded run of each of its checks is green, never over a red or absent one; a git hook refuses it.",
      "No commit, and no file outside `.greenline/ledger/` and `.greenline/tmp/<id>/`, before the owner's yes, nor while no change is open; hooks refuse them, reading `choice: standing` as the yes only where `proceed` allows the mode.",
      "Every check runs through `greenline check`, a red run included; a command run plainly proves nothing. The manifest's `checks` declares them.",
      "Every fresh agent the line's depths start is counted in the record's `agents` and named in `starts`; a harness hook counts them.",
      "No push, pull request or merge without the owner's word in the record's `landing`; a git hook refuses it.",
      "`greenline status` is read at the start of each turn; a harness hook prints it.",
      "Nothing contacts a remote before the proposal.",
      "A stop commits only the record and its folder.",
      "Every scratch file goes under `.greenline/tmp/<id>/`, never the host's temporary directory.",
      "The record states who chose the mode and has every step's section, a skipped one holding only `none at <mode>`; `greenline status` checks both, and a fact removed between runs.",
      "The owner's choice is final; every floor found is in `floors`; a recorded check fact is never edited or removed.",
    ])
      expect(text).toContain(promise);
  });

  it("J-93 S1 points each situation the block once spent prose on at a page the installation holds", () => {
    const index = block.slice(
      block.indexOf("## When this happens, read this"),
      block.indexOf("## The modes"),
    );
    const rows = index
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"));
    expect(rows.length).toBeGreaterThanOrEqual(13);
    // Each step's references page a row names is installed, and each section it names is on it.
    for (const row of rows.slice(1))
      for (const found of row.matchAll(/(\w+)'s references(?:, "([^"]+)")?/g)) {
        const page = references(found[1] ?? "");
        if (found[2] !== undefined) expect(page, row).toContain(`## ${found[2]}`);
      }
    expect(index).toContain("`router`");
    expect(index).toContain("`groundwork`");
    expect(index).toContain("`architecture-survey`");
  });

  it("J-73 S2 and J-93 S1 the review page runs one fresh agent at a time with the one brief, and states the fallback for every depth above written", () => {
    const review = references("review");
    expect(review).toContain(
      "One agent runs at a time, in the change's one checkout and never a worktree of its own: a depth that needs a fresh agent starts it through the harness's delegation, with the one brief the ledger guide states, and waits for its report before the next starts. A fresh agent delegates nothing.",
    );
    expect(review).toContain(
      "Where the harness has no delegation, every depth above written, independent and looped alike, runs without one: review inline, verify at the written depth, anticipate as its degraded self-questioning pass; the step's section records the limit.",
    );
    expect(review).toContain("`.greenline/ledger/<id>/<step>-<n>.md`");
  });

  it("J-73 S3 and J-93 S1 the frame and close pages state where the commits go from local facts, the worktree rule and the landing on the owner's word", () => {
    const frame = references("frame");
    const close = references("close");
    expect(frame).toContain(
      "The where line names the branch the change's commits will go to, read from local facts only, the current branch, the default branch, the remotes, a pull-request template and a CI workflow, with no network command: read the remote's state only as the repository holds it,",
    );
    expect(frame).toContain(
      "It is the current branch when that is not the default branch or the repository has no remote, and otherwise a new branch, `greenline/<id>`.",
    );
    expect(frame).toContain(
      "The owner accepts it or names another mode or branch, and that choice is final; a mode named above yours has its cost in agents and rounds restated before the work. A request that names a mode or a branch has chosen it.",
    );
    expect(frame).toContain(
      "A worktree holds the change's checkout only on the owner's request and only where the harness runs the session in it; you never make one.",
    );
    expect(references("plan")).toContain(
      "A ticket then opens under its approved mode, or one the owner names as it opens, with no further wait, on the planning change's branch.",
    );
    // J-93 S2: the landing is stated once, in the close skill's front; its references page
    // records it and names the front's order.
    const closeFront = readFileSync(
      join(goldenRoot, goldenPath(".agents/skills/close/SKILL.md")),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(closeFront).toContain(
      "Offer the landing in one line, by the setup: push the branch and open a pull request where the remote is a forge, merge it into its base branch locally where no remote is a forge, or leave the branch. Each push, pull request and merge is done only on the owner's word.",
    );
    expect(close).toContain(
      "The landing is offered as `SKILL.md`'s closing order says, and the close section records what was done.",
    );
    expect(closeFront).toContain(
      "A ticket's close offers none: the planning change's close offers the landing for the whole plan, its tickets' commits included.",
    );
    expect(closeFront).toContain(
      'Where the commits already sit on the base branch and no remote is a forge, there is nothing to land: offer nothing, and the close section says "nothing to land: the commits are on <branch>".',
    );
    // No sentence of the block or the frame page has the agent push, open a pull request, merge
    // or fetch on its own; the where sentence names `git fetch` only among the commands never run.
    const prohibition =
      "before the proposal never run `git ls-remote`, `git fetch`, `git pull` or any other command that contacts a remote.";
    expect(frame).toContain(prohibition);
    expect(frame.replace(prohibition, "")).not.toMatch(/\b(git push|gh pr|git merge|git fetch)\b/);
    expect(block).not.toMatch(/\b(git push|gh pr|git merge|git fetch)\b/);
  });

  it("J-73 S6 and J-93 S1 give a change its own branch, choose the id at the proposal and commit the record at every stop", () => {
    const frame = references("frame");
    const close = references("close");
    // P5.1: no change's commits land on another change's branch.
    expect(frame).toContain(
      "on another change's branch, never that branch: the default branch where there is no remote, and otherwise one made from it, `greenline/<id>`.",
    );
    // P5.7 and P5.10: the default branch from local facts alone, never a change's
    // branch, and no branch named when every fact fails.
    expect(frame).toContain(
      "The default branch is `origin/HEAD`, else `init.defaultBranch`, else the branch HEAD names unless it is a change's branch, as the ledger guide defines one, and with none, name no branch and ask;",
    );
    // P5.9: no new change on a tree holding another change's uncommitted edits.
    expect(frame).toContain(
      "While the tree holds another change's uncommitted edits, propose no new change: say so and wait for the owner, whatever `proceed` or the request allows.",
    );
    // P5.2: the id at the proposal, since the "where" line names greenline/<id>.
    expect(frame).toContain(
      "A change's id is chosen at its proposal, or earlier for a start's working file.",
    );
    // P5.3: every stop commits the record, and every commit carries the trailer,
    // so a stopped change is found from any branch; J-84 S1: the record and its
    // folder alone, and the trailer in the message's last paragraph.
    expect(close).toContain(
      'set the state `stopped`, rewrite the "next" line and commit the record and its folder, the check facts under it, and nothing else;',
    );
    expect(references("build")).toContain(
      "Every commit carries the trailer `Greenline-Change: <id>` from the moment it is made, as the last line of the message's last paragraph,",
    );
    // P5.8: step 1 reads the stopped records beside the open ones.
    expect(block.replace(/\s+/g, " ")).toContain(
      "the open and stopped records under `.greenline/ledger/`",
    );
  });

  it("J-73 S6 and J-93 S1 settle the orientation's edges: its trigger, the empty tree, its own change, the survey, a question and nothing to resume", () => {
    const frame = references("frame");
    // A clone whose changes sit stopped on other branches is not the orientation,
    // and a question, which is no request for a change, needs none.
    expect(frame).toContain(
      "With no change record on any branch, local or remote-tracking, the first request for a change is the orientation: on an empty tree (commits `none`, languages `none found`) it is `groundwork`, its own change before a feature request or the request's own when it asks for setup; otherwise a survey, `architecture-survey` where installed or a read of the top-level documents, its result written into the knowledge homes `.greenline/WORK.md` names under a quick record opened first.",
    );
    expect(frame).toContain("A question needs no mode and no record");
    // "What were we doing?" with nothing to resume is the router's, the start that answers it,
    // and the close page reaches it from its one sentence on resuming.
    expect(references("close")).toContain(
      "a session that resumes one, which `router` finds, does so as its first write",
    );
    const router = readFileSync(
      join(goldenRoot, goldenPath(".agents/skills/router/SKILL.md")),
      "utf8",
    ).replace(/\s+/g, " ");
    // J-84 S4: with nothing to resume, the session says so and asks for the request.
    expect(router).toContain(
      'A session that resumes, or is asked "what were we doing?", with no open or stopped change on any branch says there is nothing to resume, proposes nothing and asks the owner for the request.',
    );
  });

  it("J-65 S2 cures frame: the facts rule on its opening, a start's depth and answers, and the repository's glossary", () => {
    const read = (path: string): string =>
      readFileSync(join(goldenRoot, goldenPath(`.agents/skills/frame/${path}`)), "utf8").replace(
        /\s+/g,
        " ",
      );
    const skill = read("SKILL.md");
    const opening = skill.slice(0, skill.indexOf("## The depths"));
    // The rule reaches the inline depth, which never reads the interview page, so it leaves that page.
    expect(opening).toContain("Facts are yours to look up first, decisions the owner's.");
    expect(read("references/interview.md")).not.toContain("is your job, never the user's");
    // A start that loads frame with no change open runs it at the written depth.
    expect(opening).toContain(
      "Asked for by name, or loaded by a start, with no change open, it runs at the written depth, its result stays in the reply, and it writes no file.",
    );
    expect(skill).toContain("the reply alone when no change is open");
    // The inline frame section stays one line and may hold a start's answers; since J-93 S2
    // the depth bullets stand on frame's references page.
    expect(read("references/greenline.md")).toContain(
      "is that one line: the intent, then the open question with its answer, or a start's answers, or none.",
    );
    const interview = read("references/interview.md");
    expect(interview).toContain(
      "and runs the interview to its end; a start's own questions are asked here at any depth, in one round.",
    );
    expect(interview).toContain(
      "nothing left silently assumed; a start's own questions end with their one round.",
    );
    expect(interview).toContain("the existing language in the repository's glossary");
    expect(interview).not.toContain("`GLOSSARY.md`");
    // The research and prototype pages serve a frame question at either depth, not only the interview.
    expect(read("references/research.md")).toContain(
      "Frame reads this page when a frame question waits on a fact the repository does not hold.",
    );
    expect(read("references/prototype.md")).toContain(
      "The answer returns to frame, and the frame section cites it.",
    );
  });

  it("J-98 S1 puts a frame question in the reply that ends the turn, says what the hooks hold where the commits go, and commits the installed practice with the setup change", () => {
    const read = (path: string): string =>
      readFileSync(join(goldenRoot, goldenPath(`.agents/skills/${path}`)), "utf8").replace(
        /\s+/g,
        " ",
      );
    const frame = read("frame/references/greenline.md");
    expect(frame).toContain(
      "A question to the owner goes in the reply that ends your turn, and you wait there for the answer; never put it through a side channel the owner may not see, such as a harness's asynchronous user-input call.",
    );
    expect(frame).toContain(
      "A behaviour the scope the owner accepted already settles is yours: decide it within that scope and name it in the frame section and the reply as your choice; one it leaves open still goes to the owner.",
    );
    expect(frame).toContain(
      "The proposal, and any question with it, goes in the reply that ends your turn, never through a side channel the owner may not see.",
    );
    expect(frame).toContain(
      "In a repository with no remote, the git hooks hold the change whose record is open on the current branch, the default one included, as on a branch of its own:",
    );
    expect(read("frame/references/interview.md")).toContain(
      "Put each round in the reply that ends your turn, and wait there for the answers: a question put through a side channel the user may not see, such as a harness's asynchronous input call, is not asked.",
    );
    const groundwork = read("groundwork/references/greenline.md");
    expect(groundwork).toContain("## The setup change's commit");
    expect(groundwork).toContain(
      "every file `greenline init` wrote, the paths `.greenline/lock.json` lists, with the lock and `.greenline/manifest.json`.",
    );
    expect(groundwork).toContain("after the commit, `git status` shows none of them untracked.");
  });

  it("J-65 S3 cures review: the brief on its own page, its imported block as conditions, the lens without the workshop's notes, the section as a table", () => {
    const read = (path: string): string =>
      readFileSync(join(goldenRoot, goldenPath(`.agents/skills/review/${path}`)), "utf8").replace(
        /\s+/g,
        " ",
      );
    const skill = read("SKILL.md");
    const brief = read("references/brief.md");
    // The brief is a page the reviewer reads whole; the builder reads it only at the inline depth.
    expect(brief).toMatch(/^# The reviewer's brief /);
    expect(brief).toContain(
      "This page is the reviewer's: a fresh reviewer reads it whole at the independent depth, and the builder reads it only at the inline depth, reviewing its own commits, the fallback a harness with no delegation takes included, and never where fresh reviewers run.",
    );
    expect(brief).toContain(
      "and this page, which you read whole with the reference files it names;",
    );
    expect(skill).not.toContain("### 1. Pin the commits");
    expect(skill).not.toContain("### 5. Severity");
    // J-93 S2: the depth bullets, the builder's inline reading among them, stand on the references page.
    const mechanics = read("references/greenline.md");
    expect(mechanics).toContain(
      "The builder reads the reviewer's brief, [brief.md](brief.md), whole and reads its own commits by it, both axes in one pass,",
    );
    expect(skill).toContain("The reviewer's brief is a page of its own, `references/brief.md`:");
    // Nothing points at the brief as "below" any more.
    expect(skill).not.toContain("by the reviewer's brief below");
    expect(skill).not.toContain('("Severity" below)');
    expect(mechanics).toContain('rung 1 or 2 (the brief\'s "Severity")');
    expect(read("references/reviewers.md")).toContain(
      "and the pointer to the reviewer's brief, [brief.md](brief.md), which the reviewer alone reads whole with the reference files it names;",
    );
    expect(read("references/lens.md")).toContain(
      "the severity ladder is the reviewer's brief's, [brief.md](brief.md) (\"Severity\").",
    );
    // The imported block reads as conditions with its credit; nothing is set aside silently.
    expect(brief).not.toContain("This is a complex codebase");
    expect(brief).not.toContain("SHOULD NOT waste the author's time");
    expect(brief).toContain(
      "Where the diff changes how developers run or build the code, it is a finding even where the acceptance is silent, citing what a reasonable developer of this repository expects, to run and build it as before; such changes include:",
    );
    expect(brief).toContain(
      "put it on your list of behaviors set aside below, with that intent as its reason, rather than among the findings;",
    );
    // The workshop's notes leave the installed lens; the excess lens has the repository's override.
    const lens = read("references/lens.md");
    expect(lens).not.toContain("## The shape of a review list");
    expect(lens).not.toContain("## Sources");
    expect(lens).not.toContain("revisit April 2027");
    expect(lens).not.toContain("retained by the maintainer");
    expect(brief).not.toContain("house ground");
    const excess = read("references/excess.md");
    expect(excess).toContain(
      "A documented repository standard overrides this lens as it overrides the smell baseline:",
    );
    expect(excess).toContain(
      'A `MUST KILL` flag is rung 3, advisory, unless it cites the rule it enforces ([brief.md](brief.md), "Severity").',
    );
    // The review section is one table with the bucket a column.
    expect(skill).toContain("Categorize every finding, in the table, using these buckets:");
    expect(mechanics).toContain(
      "a row for each finding, its columns `Finding`, `Severity`, `Bucket` and `What was done`:",
    );
    expect(skill).not.toContain("under the four buckets");
    expect(mechanics).toContain(
      "Write the judgment into the review section as one table, a row for each finding,",
    );
    // An intended effect set aside has its place on the list, and the brief keeps the house's word for an agent.
    expect(brief).toContain(
      "set aside as outside the plan or spec, or as the change's stated intent, one line each",
    );
    expect(brief).not.toMatch(/\bseats?\b/);
    // The reviewers page's leftovers, and the builder's link to it after the intent.
    const reviewers = read("references/reviewers.md");
    expect(reviewers).toContain("## Start the reviewers");
    expect(reviewers).not.toContain("### Start the reviewers");
    expect(reviewers).not.toContain("At the inline depth you start none");
    expect(skill).toContain(
      "Then, where fresh agents review, start the reviewers as [references/reviewers.md](references/reviewers.md) says.",
    );
  });

  it("J-74 R3 asks for the branch on a detached HEAD, and the landing names its base and checks the merged result", () => {
    const text = references("frame");
    // A harness-made worktree may sit on a detached HEAD, which has no current branch.
    expect(text).toContain(
      "and otherwise a new branch, `greenline/<id>`. On a detached HEAD, name no branch and ask. The default branch is",
    );
    const close = readFileSync(
      join(goldenRoot, goldenPath(".agents/skills/close/SKILL.md")),
      "utf8",
    ).replace(/\s+/g, " ");
    // The combine of superpowers' finishing-a-development-branch, as ruled on 2026-10-15.
    expect(close).toContain("Each push, pull request and merge is done only on the owner's word.");
    expect(close).toContain(
      "Before a local merge, name the base branch: the default branch where the change's branch was made from it at its proposal, and otherwise the one the owner names when asked. Confirm before merging: merging into the wrong base is expensive to undo. Make the merge with its commit, its message carrying the change's trailer, never staged alone with `--no-commit`, then record the change's checks on the merged result, so their facts name the merge they checked; on a red result, stop the landing and tell the owner, leaving the merge, local and recoverable, for the owner to keep or undo. A rejected push is reported, never forced. Where the commits already sit on the base branch",
    );
    // Nothing the source runs that the close step does not: no worktree cleanup, no branch deletion, no pull.
    expect(close).not.toMatch(/\bgit (worktree|branch -[dD]|pull)\b|(^|\s)--force\b/);
  });

  it("J-79 names, in the where sentence, the local refs read for the remote's state and the commands never run before the proposal", () => {
    const text = references("frame");
    // The where sentence runs from "The where line names" to the branch it picks.
    const start = text.indexOf("The where line names");
    const end = text.indexOf("It is the current branch when", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const where = text.slice(start, end);
    // J-60 S3's first stop: an agent read "with no network command" and still ran
    // `git ls-remote origin`; the sentence it reads names what to read instead.
    expect(where).toContain(
      "with no network command: read the remote's state only as the repository holds it, its remote list, `refs/remotes/<remote>/HEAD` and the remote-tracking branches beside it, and the current branch's upstream, and before the proposal never run `git ls-remote`, `git fetch`, `git pull` or any other command that contacts a remote.",
    );
  });

  it("J-80 names a repository rule that pulls the other way beside the where line's branch and beside the landing offer, the owner deciding", () => {
    const text = references("frame");
    // J-60 S3's landing family: a contribution guide's rule against merging one's own branch
    // took the place of the branch the local facts give and of the local-merge offer.
    const start = text.indexOf("The where line names");
    const end = text.indexOf("Where a repository rule forbids", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(text.slice(start, end)).toContain(
      "A repository rule pulling the other way, in a contribution guide or a branch policy, is named beside the branch the local facts give, never in its place.",
    );
    expect(references("close")).toContain(
      "The landing is offered as `SKILL.md`'s closing order says, and the close section records what was done.",
    );
    const close = readFileSync(
      join(goldenRoot, goldenPath(".agents/skills/close/SKILL.md")),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(close).toContain(
      "Each push, pull request and merge is done only on the owner's word. A repository rule against that offer, such as a contribution guide's rule against merging one's own branch, is named beside the offer, never in its place, and the owner's answer decides. Before a local merge,",
    );
  });

  it("J-81 puts every probe and scratch file under the change's working folder, never the host's temporary directory, and a check's facts cite repository paths", () => {
    // J-60 S3's replay: a verifier wrote its probes into the host's /tmp and the
    // verify check's facts cited /tmp/readme-example.mjs.
    expect(references("build")).toContain(
      "Every file written on the way and not part of the change, a probe, a scratch script or a before-and-after copy, yours or a fresh agent's, goes under `.greenline/tmp/<id>/`, never the host's temporary directory, and a check's facts cite paths inside the repository.",
    );
    for (const target of [".agents/skills/verify/SKILL.md", ".claude/skills/verify/SKILL.md"]) {
      const verify = readFileSync(join(goldenRoot, goldenPath(target)), "utf8").replace(
        /\s+/g,
        " ",
      );
      expect(verify, target).toContain(
        "For a change, every probe, scratch script and before-and-after copy goes under the change's working folder, `<working folder>` in this skill's pages, never the host's temporary directory, and a check's facts cite paths inside the repository. The working files are deleted at close,",
      );
    }
  });

  it("names no skill class and no retired skill", () => {
    expect(block).not.toMatch(/\b(entry|stage|support|discipline|situational) skill/i);
    expect(block).not.toMatch(/## (Installed skills|What to load when|Methods by class)/);
    for (const retired of [
      "grilling",
      "grill-with-docs",
      "to-spec",
      "to-tickets",
      "implement",
      "delivery-review",
      "review-lens",
      "ponytail-review",
      "verify-this",
      "control-cli",
      "control-ui",
      "record-architecture-decisions",
      "domain-modeling",
      "research",
      "prototype",
    ])
      expect(block, retired).not.toMatch(new RegExp(`\`${retired}\``));
  });

  it("keys every start and habit of the roster by at least one intent row", () => {
    const keyed = new Set(intents.flatMap((row) => row.skills));
    const beside = new Set<string>(
      modes.kinds.filter((kind) => kind.place === "beside").map((kind) => kind.name),
    );
    expect(
      skills.filter((skill) => beside.has(skill.kind) && !keyed.has(skill.name)).map((s) => s.name),
    ).toEqual([]);
  });
});

describe("S16b the stored work and ledger guides", () => {
  const guides = [".greenline/WORK.md", ".greenline/ledger/README.md"].map((path) => ({
    path,
    text: readFileSync(join(goldenRoot, path), "utf8"),
  }));
  const release = compileInstallation(join(repoRoot, "corpus"));
  if (release._tag === "err") throw release.error;
  const { modes } = release.value;

  it("name no ticket lifecycle, execution account, initiative, retired skill or old schema", () => {
    const old = [
      /\binitiative/i,
      /execution (account|ledger)/i,
      /\baccounts?\b/i,
      /\b(TKT|INIT|REV|RSRCH|PROTO)-/,
      /\b(claimed|implementing|implemented|reviewing|verifying)\b/,
      /\bresult_commit\b|\bbase_commit\b|\bclaimed_by\b|\bdepends_on\b|\bconsumes\b/,
      /\.greenline\/work\//,
      /\.greenline\/ledger\/(records|evidence)\//,
      /schemaVersion|schema [0-9]/i,
      /greenline (doctor|evidence)\b/,
    ];
    const retired = [
      "grilling",
      "grill-with-docs",
      "research",
      "prototype",
      "to-spec",
      "to-tickets",
      "implement",
      "record-architecture-decisions",
      "domain-modeling",
      "delivery-review",
      "review-lens",
      "ponytail-review",
      "verify-this",
      "control-cli",
      "control-ui",
    ];
    for (const { path, text } of guides) {
      for (const pattern of old) expect(text, `${path} ${String(pattern)}`).not.toMatch(pattern);
      for (const name of retired)
        expect(text, `${path} ${name}`).not.toMatch(
          name.includes("-") ? new RegExp(`\\b${name}\\b`) : new RegExp(`\`${name}\``),
        );
    }
  });

  it("J-73 S6 the guides commit the record at every stop, keep a step stopped midway and leave a method's agent out of the cost with the one brief", () => {
    const [work, ledger] = guides.map((guide) => guide.text.replace(/\s+/g, " "));
    // P5.2 and P5.3 in the work guide, pointing at AGENTS.md.
    expect(work).toContain(
      "The id is chosen when the change's proposal is written, or earlier for a start's working file, such as a diagnosis's reproducer, as AGENTS.md says, so the folder, the branch and the record share it from the start.",
    );
    expect(work).toContain(
      'at every stop, the state `stopped` and the "next" line, and the record and its folder committed with the change\'s trailer;',
    );
    // P5.9, with J-84 S1's "the record and its folder": a stop commits the record and its folder
    // alone; its uncommitted edits stay and hold off a new change.
    expect(work).toContain(
      "A stop commits the record and its folder, the check facts under it, and nothing else: the change's uncommitted edits stay in its checkout for its resume, and while they are there a proposal for another change says so and waits for the owner;",
    );
    // P5.10: the change's branch the block's default-branch fallback refers to.
    expect(ledger).toContain(
      "A change's branch is any `greenline/<id>` branch, or a branch other than the default branch that a change's proposal named in its \"where\" line and its commits sit on; the default branch is never a change's branch,",
    );
    // J-98 S1 (B-1): with no remote, the hooks hold the change open on the default branch, where the frame rule puts its commits.
    expect(ledger).toContain(
      "A repository with no remote keeps a change's commits on the current branch, the default branch included, and there the git hooks hold the change as on its own branch:",
    );
    // J-102 S1: with a remote the default branch is no change's, so the hooks hold it as a branch where no change is open.
    expect(ledger).toContain(
      "Where the repository has a remote, no change is open on the default branch, but the commit there that finishes or stops a change, a local landing's close, is that change's, trailer included.",
    );
    expect(ledger).toContain(
      "While no change is open on the branch HEAD names, pre-commit refuses every commit,",
    );
    expect(ledger).toContain(
      "A `choice: standing` is the owner's yes only where the manifest's `proceed` allows the record's mode, and the hooks refuse it elsewhere, naming the setting.",
    );
    // J-98 S1: the installed practice is committed with the setup change, so a clone holds it.
    expect(ledger).toContain(
      "The installed practice travels with the repository in its commit: the change that sets the repository up, or the first change where none does, commits every file `greenline init` wrote,",
    );
    // P5.3: a stopped change resumes on the branch its stop's commit sits on.
    expect(ledger).toContain(
      "A stopped change resumes on the branch the stop's commit sits on; a change stopped before any other commit has that commit as its first.",
    );
    // P5.8: a step stopped midway.
    expect(ledger).toContain(
      'A step stopped midway keeps its section as written so far, and the "next" line names that step and the action that resumes it.',
    );
    // P5.5: a method's agent gets the one brief with its page's extras.
    expect(ledger).toContain(
      "An agent a habit or a step's method starts gets this brief too, with the extras the page that starts it names.",
    );
    // P5.4: a method's agent is named in its section and counted nowhere.
    expect(ledger).toContain(
      "An agent a method starts, such as a research agent, a design agent or wayfinder's reader, is named in the section it serves and counted nowhere.",
    );
  });

  it("the ledger guide holds one skeleton per mode, and each matches the definition's steps and kinds", () => {
    const ledger = guides[1]?.text ?? "";
    const skeletons = [...ledger.matchAll(/### ([a-z-]+)\n\n```markdown\n([\s\S]*?)\n```/g)];
    expect(skeletons.map((found) => found[1])).toEqual(modes.modes.map((mode) => mode.name));
    for (const [, name, skeleton] of skeletons) {
      const mode = modes.modes.find((entry) => entry.name === name);
      if (mode === undefined) throw new Error(`no mode ${name}`);
      const headings = (skeleton ?? "").split("\n").filter((line) => line.startsWith("## "));
      const sectionKinds = modes.kinds
        .filter((kind) => kind.name !== "step" && kind.record === "section")
        .map((kind) => `## ${kind.name}`);
      // J-93 S1: every mode keeps the whole record, a skipped step's section saying so.
      const steps = modes.steps.map((step) => `## ${step.name}`);
      expect(headings, name).toEqual([...sectionKinds, ...steps]);
      for (const step of modes.steps)
        if (mode.steps[step.name]?.depth === "none")
          expect(skeleton, `${name} ${step.name}`).toContain(
            `## ${step.name}\n\nnone at ${name}\n`,
          );
    }
  });
});
