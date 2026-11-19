import { fixtureConfiguration, gardenEnabledConfiguration } from "../fixtures/corpus.ts";
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { compileInstallation } from "../../src/shell/installation.ts";
import { renderProjection } from "../../src/core/render.ts";
import { findBrokenReferences } from "../../src/core/links.ts";
import { FRONT_WORDS, frontWords } from "../../src/corpus/fronts.ts";
import { wordsOf } from "../../src/corpus/segments.ts";
// @ts-expect-error plain-mjs gate helper shares the path mapping (audit 4, R1)
import { gardenDelta, goldenPath } from "../../scripts/lib/golden-path.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

const goldenRoot = join(repoRoot, "test", "goldens", "corpus");
const enabledRoot = join(repoRoot, "test", "goldens", "garden-enabled");

/**
 * A stored golden page. A skill's `SKILL.md` is read with its method page,
 * `method.md`, where J-180 S1 moved every sentence past the front, so a
 * skill says what either page says.
 */
function goldenText(path: string): string {
  const text = readFileSync(join(goldenRoot, goldenPath(path)), "utf8");
  if (!path.endsWith("/SKILL.md")) return text;
  const method = join(goldenRoot, goldenPath(path.replace(/SKILL\.md$/, "method.md")));
  return existsSync(method) ? `${text}\n${readFileSync(method, "utf8")}` : text;
}

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

  it("J-176 S1 holds the authored block under 1,500 words, the loop, the promises, the reply and the situation index", () => {
    const authored = readFileSync(join(repoRoot, "corpus", "runtime", "agent.md"), "utf8");
    expect(wordsOf(authored).length).toBeLessThan(1500);
  });

  it("J-180 S1 holds every skill's front under 300 words and the block under 1,500, each named in its failure", () => {
    const authored = readFileSync(join(repoRoot, "corpus", "runtime", "agent.md"), "utf8");
    expect(wordsOf(authored).length, "the block, corpus/runtime/agent.md").toBeLessThan(1500);
    expect(skills.length).toBeGreaterThan(0);
    // J-181 S1: the count and the cap are the corpus-fronts row's, read from one place.
    const over = skills
      .map((skill) => ({
        name: skill.name,
        words: frontWords(
          readFileSync(join(repoRoot, "corpus", "skills", skill.name, "SKILL.md"), "utf8"),
        ),
      }))
      .filter((front) => front.words >= FRONT_WORDS)
      .map((front) => `the front of ${front.name}, ${String(front.words)} words`);
    expect(over, `the fronts at ${String(FRONT_WORDS)} words or more`).toEqual([]);
    // Each front points at its method page in a sentence that says when it is read.
    const unpointed = skills
      .filter((skill) => existsSync(join(repoRoot, "corpus", "skills", skill.name, "method.md")))
      .filter((skill) => {
        const front = readFileSync(
          join(repoRoot, "corpus", "skills", skill.name, "SKILL.md"),
          "utf8",
        ).replace(/\s+/g, " ");
        return !/\bBefore [^.]*?\[method\.md\]\(method\.md\)/.test(front);
      })
      .map((skill) => skill.name);
    expect(unpointed, "the fronts that name no moment for their method page").toEqual([]);
  });

  it("J-93 S1 cut the block, and J-107 S3 holds the version's edition under 2,650 words in both states, J-142 S3's and J-144 S2's raises of 100 on the operator's cards and J-147 S2's of 150 on the register's row of 2026-10-28: the loop, the promises, the reply, the situation index, the modes and the roster", () => {
    for (const root of [goldenRoot, enabledRoot]) {
      const stored = readFileSync(join(root, "AGENTS.md"), "utf8");
      expect(wordsOf(stored).length, root).toBeLessThan(2650);
      expect(stored.split("\n").filter((line) => line.startsWith("## "))).toEqual([
        "## The request loop",
        "## The promises",
        "## The reply",
        "## The stances",
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
      "Wait for the owner's yes, unless the request names the mode or the `proceed` setting allows it; then state the mode, the ground and any repository rule you read in one line before the first edit, and go on: the orientation runs inside the change, never asked first.",
    );
    // J-176 S1: the record opens through the CLI's skeleton, every line its mode owes named.
    expect(text).toContain(
      "run `greenline open --change <id> --mode <mode>`, which writes the record with every line its mode owes, and replace each placeholder in your own words for its meaning.",
    );
    expect(text).toContain(
      "load the step's skill and its references page, `references/greenline.md`, which says where the step's work lands",
    );
    // J-93 S1's review: the loop still skips a step at none, and states the fallback with no delegation.
    // J-175 S1: design's skill is not loaded where the record says the change has no interface (j109t-line-depths-1 F1).
    expect(text).toContain(
      "each at the depth the mode gives it, skipping a step at none and design's skill where the record says `interface: no`:",
    );
    // J-174, J-176 S1: each fresh agent through the harness's own delegation; a failed start stops; the fallback only with no tool.
    // J-175 S1: its brief its only context, never a fork where the builder can choose (j109t-handoff F4).
    expect(text).toContain(
      "Start each fresh agent a depth needs through the harness's own delegation, its brief its only context, never a fork where you can choose; a failed start is said in the harness's words and stops for the owner. With no delegation tool, review runs inline, verify written and anticipate as its self-questioning pass, the section naming the limit.",
    );
    // J-176 S1: the ticket list stands on disk before the wait that asks for it.
    expect(text).toContain(
      "Work that splits into tickets waits twice: for the planning change's mode, careful, and for the ticket list, written to the plan directory with each ticket's mode before you ask.",
    );
    // J-176 S1: the situation and owed lines status prints are read and followed.
    expect(text).toContain(
      "the `situation:` and `owes:` lines `greenline status` prints: do what they say.",
    );
    expect(text).toContain("| Agents, at most | 1 | 2 | 6 |");
  });

  it("J-195 S1 points the situation index at the two starts in short rows", () => {
    expect(block).toMatch(/^\| Implicit state machines to find +\| `state-machines` +\|$/m);
    expect(block).toMatch(/^\| Unenforced invariants to list +\| `invariants` +\|$/m);
    // The amended ruling (1) of 2026-11-07: the index rows are the starts' pointers, and the Start table names neither.
    expect(block).not.toMatch(/^\| [^|]+\| `(state-machines|invariants)` \|$/m);
  });

  it("J-195 S4 carries the stances section between the reply and the situation index, its three phrases verbatim, the block under 1,500 words", () => {
    const authored = readFileSync(join(repoRoot, "corpus", "runtime", "agent.md"), "utf8");
    const stances = authored.slice(
      authored.indexOf("## The stances"),
      authored.indexOf("## When this happens"),
    );
    expect(stances.replace(/\s+/g, " ").trim()).toBe(
      "## The stances - Be thorough in your analysis and bold in your recommendations - You are responsible for maintaining a high standard of excellence and demanding the same of any subagents - Execute tool calls concurrently in large batches. Do not serialize what can run in parallel.",
    );
    expect(wordsOf(stances).length).toBeLessThan(60);
    expect(wordsOf(authored).length).toBeLessThan(1500);
    expect(block.indexOf("## The stances")).toBeGreaterThan(block.indexOf("## The reply"));
  });

  it("J-176 S1 the reply holds three parts and no facts table, and a durable picture is kept on the owner's ask alone", () => {
    const text = block.replace(/\s+/g, " ");
    expect(text).toContain(
      "Before any edit, say the mode from the table below and its cost, each floor found, the change's id and its ground (the branch, or a worktree of its own, as frame's references say), and why in a sentence.",
    );
    const reply = block.slice(block.indexOf("## The reply"), block.indexOf("## When this happens"));
    const words = reply.replace(/\s+/g, " ");
    expect(words).toContain(
      // J-199 S1: the address the turn printed is owed on every reply, a decline and a stop included (j196c-conduct-empty finding 1).
      "A reply holds three parts: one sentence of what happened, one line of what it waits on, opening `Waiting on:`, and the address the turn printed, declines and stops included. The reply copies no other fact.",
    );
    // No facts table, no rubric of turns and no progress line in the reply.
    expect(words).not.toMatch(/\| Fact \| Now \||\| The turn |progress line/);
    // The answer first, unsure said plainly, a rule only where it stops the owner's ask, a thing said once.
    expect(words).toContain(
      'The answer comes first: the outcome, yes or no, a number, or "I do not know" and how you will find out; unsure, say what was not checked, never a percentage.',
    );
    expect(words).toContain(
      "Name a rule only when it stops what the owner asked for, in their terms. Say a thing once.",
    );
    expect(words).not.toContain("█");
    // The three sentences the judges banned never appear in the block.
    for (const banned of [
      "This is a change, not a discussion.",
      "A floor is a risk that forces a higher mode.",
      "The untracked .greenline/ledger/sessions/ folder was left out of the commit.",
    ])
      expect(block.replace(/\s+/g, " "), banned).not.toContain(banned);
    // A picture inline where a shape decides or a turn moved one, by show-me's table (J-204 S1); one offer per change at the caps in its line, never a lost picture's remake; a durable one on the owner's ask, through the one door.
    expect(words).toContain(
      "Draw inline where a shape decides or a turn moved one, by `show-me`'s table, within 72 columns and twelve nodes. Past them, offer once per change: `Picture offered: <what>, <form>, <finish>; say keep`, never a lost picture's remake. Keep on the owner's ask: `greenline picture keep`.",
    );
    // J-199 S1: the remake of a lost picture is never offered (j196c-conduct-empty finding 2).
    expect(words).not.toContain("A durable picture is kept only on the owner's ask");
    // The offer ritual is gone: no offer at every turn, no first map offered.
    expect(text).not.toMatch(/Would you like|ask whether the reply deserves a lasting visual/);
    const index = block.slice(block.indexOf("## When this happens"));
    expect(index).not.toMatch(/offer its first pages/);
    expect(index).toMatch(
      /^\| A document the change made stale +\| name it at the close; refresh it on the owner's ask +\|/m,
    );
    expect(index).toMatch(
      /^\| How X works, or end to end: the code's path, unless the owner names the practice +\|/m,
    );
  });

  it("J-93 S1 and S3 keeps each promise one line, the trailer, done on green, the yes, the recorded check and the scratch folder among them, each a hook holds naming it", () => {
    const text = block.replace(/\s+/g, " ");
    for (const promise of [
      "Every commit of a change carries `Greenline-Change: <id>` as the last line of its message's last paragraph; no commit is rewritten to move it. Git hooks hold both.",
      "A change is `done` only when the latest recorded run of each of its checks is green, never over a red or absent one; a git hook refuses it.",
      "No commit, and no file outside `.greenline/ledger/` and `.greenline/tmp/<id>/`, before the owner's yes, nor while no change is open; hooks refuse them, reading `choice: standing` as the yes only where `proceed` allows the mode.",
      // J-175 S1: a baseline and a probe go through the recorder too, a probe then marked.
      "Every check runs through `greenline check`, a red run, a baseline and a probe included, a probe then marked one; a command run plainly proves nothing. The manifest's `checks` declares them.",
      // J-176 S1: the record's lines are the agent's; a lifting line holds the owner's own words.
      // J-175 S1: the skills, agents and rounds lines too, in the agent's words, reconciled against the hints; no harness feature named.
      "Every line of the record is yours, written in your own words for its meaning, the `skills`, `agents` and `rounds` lines too, reconciled against the hints `greenline status` shows; git's hooks refuse done while one is missing.",
      "No push, pull request or merge without the owner's words in the record's `landing`, no rewrite without `rebase`, no discarded work without `discard`, each committed before the act and quoted as the owner said them; hooks refuse them. Where no hook hears the owner, a push to the default branch is the owner's, from their own terminal.",
      "`greenline status` is read at the start of each turn.",
      "Nothing contacts a remote before the proposal.",
      "A stop commits only the record and its folder.",
      // J-174: its own change's folder, never another's.
      "Every scratch file goes under its own change's `.greenline/tmp/<id>/`, never the host's temporary directory.",
      "Every step's section stands, a skipped one holding only `none at <mode>`; `greenline status` checks it, and a fact removed between runs.",
      "The owner's choice is final; every floor found is in `floors`; a recorded check fact is never edited or removed.",
    ])
      expect(text).toContain(promise);
  });

  it("J-129 S4 says the sequence: the owner's words quoted into the line, the record committed alone, then the act; an ask is not the words", () => {
    const ledger = readFileSync(join(goldenRoot, ".greenline/ledger/README.md"), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(ledger).toContain(
      "quote the owner's words into the line, commit the record alone, as a stop commits it, then run the act, and a refusal whose line stands only in the working tree names that commit.",
    );
    expect(ledger).toContain("the words lift it only when they say so of that act,");
    expect(references("build")).toContain(
      "A line lifts only once the record is committed with it: quote the owner's words into it, commit the record alone, then run the act,",
    );
    expect(references("close")).toContain("and the record is committed with them, before either");
  });

  it("J-129 S5 says a closure in words is the owner's verdict on that mark, and an instruction to close marks unseen is none", () => {
    const ledger = readFileSync(join(goldenRoot, ".greenline/ledger/README.md"), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(ledger).toContain(
      'an instruction to close marks unseen, such as "close them all yourself", is none, and `close` refuses it: leave the marks open and say so.',
    );
    const marks = readFileSync(
      join(goldenRoot, goldenPath(".agents/skills/design/references/marks.md")),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(marks).toContain(
      "an instruction to close marks the owner has not looked at is no verdict, and the command refuses it,",
    );
    expect(references("close")).toContain(
      "an instruction to close marks unseen is not one, so they stay open and the reply says so;",
    );
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
    // J-175 S1: the survey is no orientation, so the index names it no longer; the roster's start table does.
    expect(index).not.toContain("`architecture-survey`");
  });

  it("J-73 S2 and J-93 S1 the review page runs one fresh agent at a time with the one brief, and states the fallback for every depth above written", () => {
    const review = references("review");
    expect(review).toContain(
      // J-176 S1: the harness's own delegation, each start recorded fresh or forked.
      // J-175 S1: the brief its only context, never a fork where the builder can choose, a forked start said in the section.
      "One agent runs at a time, in the change's one checkout and never a worktree of its own: a depth that needs a fresh agent starts it through the harness's own delegation, on Codex as on Claude Code, with the one brief the ledger guide states as its only context, and waits for its report before the next starts. Where the harness's delegation lets you choose, start the agent fresh, never a fork of your conversation; where it can only fork, the step's section says the agent ran forked. `greenline status` shows each start it saw as fresh or forked, a hint beside the record's `agents` and `starts` lines, which stay yours to write. A fresh agent delegates nothing.",
    );
    // J-175 S1: no delegation is claimed while the session offers a tool (j109t-states-stop-1 F3).
    expect(review).toContain(
      "Claim no delegation only where the session offers you no such tool: one it offers is used.",
    );
    // J-174: a failed start is said in the harness's words and stops for the owner; the fallback only with no tool.
    expect(review).toContain(
      "Where a start fails, say so in the harness's own words, write the failure in the step's section and keep the record's `agents` and `starts` to the agents that ran, then stop for the owner; never review inline in its place and call the change done.",
    );
    expect(review).toContain(
      "Where the session has no delegation tool at all, every depth above written, independent and looped alike, runs without one: review inline, verify at the written depth, anticipate as its degraded self-questioning pass; the step's section records the limit.",
    );
    expect(review).toContain("`.greenline/ledger/<id>/<step>-<n>.md`");
  });

  it("J-73 S3, J-93 S1 and J-114 S2 the frame and close pages state the ground from local facts, its two-way offer, the worktree made on the word and the landing on the owner's word", () => {
    const frame = references("frame");
    const close = references("close");
    expect(frame).toContain(
      "It is read from local facts only, the current branch, the default branch, the remotes, a pull-request template and a CI workflow, with no network command: read the remote's state only as the repository holds it,",
    );
    expect(frame).toContain(
      "it is the current branch when that is not the default branch or the repository has no remote.",
    );
    expect(frame).toContain(
      "The owner accepts it or names another mode, branch or ground, and that choice is final; a mode named above yours has its cost restated before the work. A request that names a mode, a branch or a worktree has chosen it.",
    );
    // J-114 S2: the register's rows of 2026-10-22, the two-way offer, the branch recommended, the manifest's standing choice.
    expect(frame).toContain(
      "The branch of its own is recommended: a new branch, `greenline/<id>`, made from the default branch in this checkout. The worktree of its own on that branch is named as the one alternative, once a session, in one sentence of prose and never in a table's cell. A plain yes takes the branch, and the word worktree takes the worktree.",
    );
    expect(frame).toContain(
      "Recommend the worktree first, the branch named as its alternative, only when this checkout holds unfinished work, another change is open here, or more than one agent works in the repository.",
    );
    expect(frame).toContain(
      "state that ground as taken instead of offering the two, as `proceed` stands for the mode.",
    );
    expect(frame).toContain(
      "A worktree of its own is made as [worktree.md](worktree.md) says, once the owner has answered:",
    );
    expect(frame).toContain(
      "The worktree is the change's one checkout: a fresh agent the line starts works in it, never in a worktree of its own.",
    );
    expect(frame).not.toContain("you never make one");
    expect(references("plan")).toContain(
      "A ticket then opens under its approved mode, or one the owner names as it opens, with no further wait, on the planning change's branch.",
    );
    // J-93 S2: the landing is stated once, in the close skill's front; its references page
    // records it and names the front's order.
    const closeFront = goldenText(".agents/skills/close/SKILL.md").replace(/\s+/g, " ");
    // J-175 S1: the landing is a choice, never "ready for review" (j109t-landing-2, j109t-landing-4).
    expect(closeFront).toContain(
      "Offer the landing's choice in one line, by the status line's remote: push the branch and open a pull request where it names a forge, merge it into its base branch locally where it names no forge, or leave the branch; a close that names no choice, such as \"ready for review\", has offered none. Each push, pull request and merge is done only on the owner's word.",
    );
    expect(close).toContain(
      "The landing is offered as `SKILL.md`'s closing order says, and the close section records what was done.",
    );
    expect(closeFront).toContain(
      "A ticket's close offers none: the planning change's close offers the landing for the whole plan, its tickets' commits included.",
    );
    expect(closeFront).toContain(
      'Where the commits already sit on the base branch and no remote is a forge, there is nothing to land: offer nothing, and the close section says, word for word, "nothing to land: the commits are on <branch>".',
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
    // P5.9: no new change in a checkout holding another change's uncommitted edits; J-114 S2 recommends a worktree of its own.
    expect(frame).toContain(
      "While the tree holds another change's uncommitted edits, propose no new change in this checkout: say so, recommend a worktree of its own, below, and wait for the owner, whatever `proceed` or the request allows.",
    );
    // P5.2: the id at the proposal, since the "where" line names greenline/<id>.
    expect(frame).toContain(
      "A change's id is chosen at its proposal, or earlier for a start's working file.",
    );
    // P5.3: every stop commits the record, and every commit carries the trailer,
    // so a stopped change is found from any branch; J-84 S1: the record and its
    // folder alone, and the trailer in the message's last paragraph.
    expect(close).toContain(
      'set the state `stopped`, quote those words whole, one message of theirs, in its `stopped` line, rewrite the "next" line and commit the record and its folder, the check facts under it, and nothing else;',
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
    // J-175 S1 (the seven cuts): the orientation is a habit inside the first change's frame,
    // with no record, proposal or wait of its own (j109t-wait-named-1 F1).
    expect(frame).toContain(
      "With no change record on any branch, local or remote-tracking, the first request's own change carries the orientation, which the `orientation` line of `greenline status` names, as a habit of its frame: it takes no record, no proposal and no wait of its own, and it is never a question put before the request's own proposal, so a request that names its mode, or that `proceed` allows, starts at once with the orientation inside it.",
    );
    expect(frame).toContain(
      "On an empty tree (commits `none`, and no language and no document found) the orientation is `groundwork`: the setup is that first change's own work, built before the feature it asks for.",
    );
    // J-129 S1: a tree of documents without code is read, never taken for an empty one.
    expect(frame).toContain(
      "A tree of documents without code, `survey (documents, no code)`, is no empty tree: read its documents before any plan.",
    );
    // J-175 S1: outside a repository nothing is installed before the owner's yes (j109t-situation-no-repository).
    expect(frame).toContain(
      "Outside a Git repository, offer `git init` in one line and end your turn: nothing is initialized or installed before the owner's yes.",
    );
    const groundwork = goldenText(".agents/skills/groundwork/SKILL.md").replace(/\s+/g, " ");
    expect(groundwork).toContain(
      "It is then a habit inside the first change's frame, its setup that change's own work before the feature it asks for, with no record, proposal or wait of its own.",
    );
    expect(block.replace(/\s+/g, " ")).toContain(
      "the orientation the status line names, a habit inside that change's frame, `groundwork` on an empty tree;",
    );
    expect(frame).toContain("A question needs no mode and no record");
    // "What were we doing?" with nothing to resume is the router's, the start that answers it,
    // and the close page reaches it from its one sentence on resuming.
    expect(references("close")).toContain(
      "a session that resumes one, which `router` finds, does so as its first write",
    );
    const router = goldenText(".agents/skills/router/SKILL.md").replace(/\s+/g, " ");
    // J-84 S4: with nothing to resume, the session says so and asks for the request.
    expect(router).toContain(
      'A session that resumes, or is asked "what were we doing?", with no open or stopped change on any branch says there is nothing to resume, proposes nothing and asks the owner for the request.',
    );
  });

  it("J-65 S2 cures frame: the facts rule on its opening, a start's depth and answers, and the repository's glossary", () => {
    const read = (path: string): string =>
      goldenText(`.agents/skills/frame/${path}`).replace(/\s+/g, " ");
    const skill = read("SKILL.md");
    const opening = skill.slice(0, skill.indexOf("## The depths"));
    // The rule reaches the inline depth, which never reads the interview page, so it leaves that page.
    expect(opening).toContain("Facts are yours to look up first, decisions the owner's.");
    expect(read("references/interview.md")).not.toContain("is your job, never the user's");
    // A start that loads frame with no change open runs it at the written depth.
    expect(opening).toContain(
      "Asked for by name, or loaded by a start, with no change open, it runs at the written depth, its result stays in the reply or in a discussion's record, and it writes no other file.",
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
      goldenText(`.agents/skills/${path}`).replace(/\s+/g, " ");
    const frame = read("frame/references/greenline.md");
    expect(frame).toContain(
      // J-117 S2 narrows the rule to the surfaces where the harness's cards do not render.
      "A question to the owner goes through the channel [interview.md](interview.md) names, the harness's question tool where the status line says `questions cards` and the reply that ends your turn otherwise, and you wait for the answer; never put it through a side channel the owner may not see, such as an input call a headless session hides.",
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
    const interview = read("frame/references/interview.md");
    expect(interview).toContain(
      // J-117 S2: cards where the status line says they render, the reply otherwise, never a side channel.
      "Where it says `questions reply`, where no question tool is offered to you, or where the tool refuses the round or returns no answer, put every question of the round in the reply that ends your turn, in the form above:",
    );
    expect(interview).toContain(
      "Then wait there for the answers: a question put through a side channel the user may not see is not asked.",
    );
    // J-151 S1: under exec the tool is not called, the answers stand numbered, the recommended first and labelled.
    expect(interview).toContain(
      "each question numbered, its answers numbered under it, your recommended answer the first, labelled (Recommended) with its reason in a few words, the other answers you weighed after it.",
    );
    expect(interview).toContain(
      "Where it says `questions reply`, do not call a question tool even where one is offered, since no one there answers it, as under `codex exec`.",
    );
    expect(interview).toContain(
      "The user's next message is the round's answers: read each by its number, as 1.2 for the first question's second answer, or by the user's own words, \"yes\" taking every recommended answer, and say how you read an answer given in words.",
    );
    expect(interview).toContain(
      "1. **<question title>** <the question in a sentence or two, its choices named in plain words> 1. <your recommended answer, a word or a short phrase> (Recommended): <why, in a few words> 2. <another answer you weighed>",
    );
    expect(interview).not.toContain("Recommended: <your answer");
    const groundwork = read("groundwork/references/greenline.md");
    expect(groundwork).toContain("## The setup change's commit");
    expect(groundwork).toContain(
      "every file `greenline init` wrote, the paths `.greenline/lock.json` lists, with the lock and `.greenline/manifest.json`.",
    );
    expect(groundwork).toContain("after the commit, `git status` shows none of them untracked.");
  });

  it("J-65 S3 cures review: the brief on its own page, its imported block as conditions, the lens without the workshop's notes, the section as a table", () => {
    const read = (path: string): string =>
      goldenText(`.agents/skills/review/${path}`).replace(/\s+/g, " ");
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
    expect(text).toContain("On a detached HEAD, name no branch and ask. The default branch is");
    const close = goldenText(".agents/skills/close/SKILL.md").replace(/\s+/g, " ");
    // The combine of superpowers' finishing-a-development-branch, as ruled on 2026-10-15.
    expect(close).toContain("Each push, pull request and merge is done only on the owner's word.");
    expect(close).toContain(
      "The local merge's offer names its base branch first: the default branch where the change's branch was made from it at its proposal, and otherwise ask the owner which, in the offer's own line. Confirm before merging: merging into the wrong base is expensive to undo. Make the merge in the order close's references give, then record the change's checks on the merge commit, so their facts name the merge they checked; a failed merge or a red result stops the landing and is told as it stands, the merge left local and recoverable for the owner to keep or undo. A rejected push is reported, never forced. Where the commits already sit on the base branch",
    );
    // Nothing the source runs that the close step does not: no worktree cleanup, no branch deletion, no pull.
    expect(close).not.toMatch(/\bgit (worktree|branch -[dD]|pull)\b|(^|\s)--force\b/);
  });

  it("J-79 names, in the where sentence, the local refs read for the remote's state and the commands never run before the proposal", () => {
    const text = references("frame");
    // The ground's local-facts sentence runs from "It is read from local facts" to the offer.
    const start = text.indexOf("It is read from local facts only");
    const end = text.indexOf("Where the repository has a remote and HEAD names", start);
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
    const start = text.indexOf("## The ground");
    const end = text.indexOf("Where a repository rule forbids", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(text.slice(start, end)).toContain(
      "A repository rule pulling the other way, in a contribution guide or a branch policy, is named beside the ground the local facts give, never in its place.",
    );
    expect(references("close")).toContain(
      "The landing is offered as `SKILL.md`'s closing order says, and the close section records what was done.",
    );
    const close = goldenText(".agents/skills/close/SKILL.md").replace(/\s+/g, " ");
    // J-175 S1: the review rule is stated in the offer, and the branch is never merged against it on the agent's reading (j109t-landing-2).
    expect(close).toContain(
      "Each push, pull request and merge is done only on the owner's word. State the repository's review rule in the offer where its contribution guide or its like holds one, beside the choice and never in its place; where it forbids merging your own branch, recommend leaving the branch for the review it asks, and merge only on the owner's words that say to merge despite it. The local merge's offer names its base branch first:",
    );
  });

  it("J-81 puts every probe and scratch file under the change's working folder, never the host's temporary directory, and a check's facts cite repository paths", () => {
    // J-60 S3's replay: a verifier wrote its probes into the host's /tmp and the
    // verify check's facts cited /tmp/readme-example.mjs.
    expect(references("build")).toContain(
      "Every file written on the way and not part of the change, a probe, a scratch script or a before-and-after copy, yours or a fresh agent's, goes under `.greenline/tmp/<id>/`, never the host's temporary directory, and a check's facts cite paths inside the repository.",
    );
    for (const target of [".agents/skills/verify/SKILL.md", ".claude/skills/verify/SKILL.md"]) {
      const verify = goldenText(target).replace(/\s+/g, " ");
      expect(verify, target).toContain(
        "For a change, every probe, scratch script and before-and-after copy goes under the change's working folder, `<working folder>` in this skill's pages, never the host's temporary directory, and a check's facts cite paths inside the repository. The working files are deleted at close,",
      );
    }
  });

  it("J-132 S1 puts each merged skill's page where its method starts: ponytail's simplify page at the first rung, tdd's references, bug-fix and tests rules before Verify RED", () => {
    // J-109 S4's merged-skills run: the agent refactored without simplify.md and fixed a bug
    // test-first without bug-fix.md, the references page or tests.md, each named after the method.
    for (const tree of [".agents", ".claude"]) {
      const read = (path: string): string => goldenText(`${tree}/skills/${path}`);
      const ponytail = read("ponytail/SKILL.md");
      const rung = ponytail.split("\n").find((line) => line.startsWith("1. "));
      expect(rung, tree).toBe(
        "1. Does this need to be built at all? (YAGNI) Replacing code that already works, a scan by an index or a loop by a library call, is a refactor: read [simplify.md](simplify.md) whole before its first edit.",
      );
      // The closing section keeps its sentence as the reminder.
      expect(ponytail.slice(ponytail.indexOf("## Refactoring and deferrals")), tree).toContain(
        "before its first edit, read [simplify.md](simplify.md) whole",
      );
      const tdd = read("tdd/SKILL.md");
      const rules = tdd.slice(tdd.indexOf("## Rules of the loop"), tdd.indexOf("### Verify RED"));
      const bullets = rules.split("\n").filter((line) => line.startsWith("- "));
      // J-144 S5: the references page is pointed at where the loop's commands start, said once there.
      expect(
        tdd.slice(
          tdd.indexOf("## Discover the Stack First"),
          tdd.indexOf("## What a good test is"),
        ),
        tree,
      ).toContain(
        "In a workspace, the commands that record them and where they land stand on [references/greenline.md](references/greenline.md): read it before the first command you run.",
      );
      expect(rules, tree).not.toContain("references/greenline.md");
      expect(bullets[0], tree).toBe(
        "- **A known cause, its page before its test.** Fixing a bug whose cause is known, read [bug-fix.md](bug-fix.md) before the failing test: when a regression test is worth writing, where it goes, what stands in when it is impractical, and what the fix's report names.",
      );
      expect(bullets[1], tree).toMatch(/^- \*\*Red before green\.\*\*/);
      // J-144 S5: anatomy's walkthrough is pointed at where the workflow it works through starts.
      const anatomy = read("anatomy/SKILL.md");
      expect(
        anatomy.slice(
          anatomy.indexOf("## Workflow"),
          anatomy.indexOf("1. **Size it before you start.**"),
        ),
        tree,
      ).toContain(
        "This order is worked once, for the test rig from its concept to its code, in [references/walkthrough.md](references/walkthrough.md): read it before the first figure you build.",
      );
      expect(rules, tree).toContain(
        "- **tests.md's checks before a test is kept.** Read the checks [tests.md](tests.md) holds and pass each before you keep a test.",
      );
      // Each pointer stands once, in the loop: no closing section and no "when the work lands" pointer.
      expect(tdd, tree).not.toContain("## A bug fix");
      expect(tdd, tree).not.toContain("read it when the work lands in the workspace");
      expect(tdd.split("[bug-fix.md](bug-fix.md)").length - 1, tree).toBe(1);
      // The references page's own timing sentence says the same moment.
      expect(read("tdd/references/greenline.md"), tree).toContain(
        "Read it with `SKILL.md` before the first command the loop runs.",
      );
    }
  });

  it("J-175 S1 draws the changed shape first at the picture turns and offers nothing, and J-134 S4 the deal on cards in design's fourth move before the references' detail", () => {
    // J-109 S4's interface run: the deal in reply tables where cards rendered.
    for (const tree of [".agents", ".claude"]) {
      const read = (path: string): string => goldenText(`${tree}/skills/${path}`);
      const showMe = read("show-me/SKILL.md");
      const head = showMe.slice(showMe.indexOf("# Show me"), showMe.indexOf("It applies on"));
      // J-175 S1 (the seven cuts): the offer ritual gone; the structural change's shape drawn on its turn (j109t-pictures-inline).
      expect(head, tree).toContain(
        "Draw a picture where its shape decides something, and of the resulting shape whenever a change moved one, a module extracted or a schema, a state machine or a flow changed, on the turn it lands: prose alone does not show a shape.",
      );
      expect(showMe, tree).not.toMatch(/At every turn, ask whether|Would you like|owes that offer/);
      // J-204 S1 (the register's row of 2026-11-08): one offer per change at the caps, in its one line, never a remake.
      const method = read("show-me/method.md");
      expect(method, tree).toContain(
        "One offer per change, no more: where the shape a turn wants passes twelve nodes or 72 columns, draw the part that decides and offer the whole once in the change, in one line, `Picture offered: <what it would show>, <form>, <finish>; say keep`,",
      );
      expect(method, tree).toContain("A lasting visual is made only on the owner's ask,");
      expect(method, tree).toContain("## The kinds of lasting visual");
      expect(read("show-me/references/greenline.md"), tree).not.toContain("offer owed at turn");
      expect(read("show-me/references/greenline.md"), tree).toContain(
        "The offers are counted per change in a working file under `.greenline/tmp/sessions/`, never in the record, and no turn's end is held for a picture.",
      );
      const design = read("design/SKILL.md");
      const move = design.split("\n").find((line) => line.startsWith("4. **Show it.**"));
      expect(move, tree).toBe(
        "4. **Show it.** Deal the three on cards where they render, one per direction with its name and a line, the one reroll an option there; the owner's own direction is their answer on a card, never one you compose on a delegation. Where none render, show the deal view, a specimen or a reply table. Say what each gives up.",
      );
      // The sentence stands in the step skill, before the pages' detail it points to.
      expect(design.indexOf("4. **Show it.**"), tree).toBeLessThan(
        design.indexOf("## The pages, by moment"),
      );
    }
  });

  it("J-204 S1 show-me's decision table names, for each kind of turn and each shape, one of the six forms or none, and its pages point at it", () => {
    const forms = new Set([
      "pseudocode",
      "call tree",
      "component tree",
      "file tree",
      "shape diff",
      "box drawing",
      "none",
    ]);
    for (const tree of [".agents", ".claude"]) {
      const read = (path: string): string => goldenText(`${tree}/skills/${path}`);
      const method = read("show-me/method.md");
      const section = method.slice(
        method.indexOf("## When to draw: the turn and the shape"),
        method.indexOf("One offer per change"),
      );
      const rows = section
        .split("\n")
        .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"));
      const [head, ...body] = rows.map((line) =>
        line
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim()),
      );
      expect(head, tree).toEqual([
        "The turn",
        "A flow or a sequence",
        "A set of states",
        "A hierarchy",
        "The parts and their joins",
        "A change to a shape",
        "An algorithm",
      ]);
      expect(
        body.map((row) => row[0]),
        tree,
      ).toEqual([
        "A plain answer",
        "A proposal",
        "A build turn that moved code",
        "An explanation",
        "A close",
      ]);
      for (const row of body)
        for (const cell of row.slice(1)) expect(forms.has(cell), `${tree}: ${cell}`).toBe(true);
      expect(section, tree).toContain(
        "Draw the part that decides, within twelve nodes and 72 columns.",
      );
      expect(read("show-me/SKILL.md"), tree).toContain("the table of the turn and the shape");
      expect(read("show-me/drawing.md"), tree).toContain(
        "whether to draw, and in which form, is the table of the turn and the shape on [method.md](method.md)",
      );
    }
    expect(block.replace(/\s+/g, " ")).toContain("by `show-me`'s table");
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
      // research returns as a start in J-117 S3, so the block names it again.
      "prototype",
    ])
      expect(block, retired).not.toMatch(new RegExp(`\`${retired}\``));
  });

  it("keys every start and habit of the roster by at least one intent row, show-me by its read-this row since J-110 S4 and the phrasebook's two starts by theirs since J-195 S1", () => {
    // research takes no row (J-119's ruling): frame's research page reaches it by name.
    // interface-catalog takes none either (J-123 S6): the block's offer row covers the extra, and design's pages deal from it as the catalog.
    const keyed = new Set([
      ...intents.flatMap((row) => row.skills),
      "show-me",
      "research",
      "interface-catalog",
      // J-195 S1, on the amended ruling (1) of 2026-11-07: the phrasebook's two starts are keyed by their read-this rows alone.
      "state-machines",
      "invariants",
    ]);
    expect(block).toMatch(/\| A picture in a reply, or one asked for +\| `show-me`,/);
    expect(block).toMatch(/\| Implicit state machines to find +\| `state-machines` +\|/);
    expect(block).toMatch(/\| Unenforced invariants to list +\| `invariants` +\|/);
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
    // research returns as a start in J-117 S3, so the guides may name it again.
    const retired = [
      "grilling",
      "grill-with-docs",
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
      "A change's branch is any `greenline/<id>` branch, or a branch other than the default branch that a change's proposal named as its ground and its commits sit on; the default branch is never a change's branch,",
    );
    // J-98 S1 (B-1): with no remote, the hooks hold the change open on the default branch, where the frame rule puts its commits.
    expect(ledger).toContain(
      "A repository with no remote keeps a change's commits on the current branch, the default branch included, and there the git hooks hold the change as on its own branch:",
    );
    // J-102 S1: with a remote the default branch is no change's, so the hooks hold it as a branch where no change is open.
    // J-135 S1: the commit that concludes a change is its own on any branch, whatever HEAD holds its record in.
    expect(ledger).toContain(
      "Where the repository has a remote, no change is open on the default branch. On any branch, with a remote or none, the commit that finishes or stops a change is that change's, trailer included, whatever state HEAD holds its record in, a local landing's close among them, and so is a commit of the record, its folder or both alone in every state, `done` included, the owner's words written after the close and a done change's check fact under its folder among them, on the default branch of a repository with a remote too, where only a record the index holds `open` is no change's, since no change opens there. On any branch, with a remote or none, so is the commit after a local landing's merge,",
    );
    expect(ledger).toContain(
      "While no change is open on the branch HEAD names, pre-commit refuses every other commit,",
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
    // P5.4: a method's agent is named in its section, counted nowhere and listed nowhere (J-208 S1).
    expect(ledger).toContain(
      "An agent a method starts, such as a research agent, a design agent, a picture's helper or wayfinder's reader, is named in the section it serves, counted nowhere and listed nowhere: neither in `agents` nor in `starts`, which names the starts of the line's steps alone; the close's refresh agent is named in `refreshes`.",
    );
    expect(ledger).toContain(
      "a method's agent, a picture's helper among them, is listed nowhere here, and git's hooks refuse a commit of a record whose start names no step",
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

describe("J-148 the stored pages: the close's copied marks line, the floor's ruling, the lock and the pid form", () => {
  const read = (path: string): string => goldenText(`.agents/skills/${path}`).replace(/\s+/g, " ");

  it("tells the close to copy the marks line status prints and to stop only what the session started", () => {
    const close = read("close/references/greenline.md");
    expect(close).toContain(
      "The close section's marks line is the `marks:` line `greenline status` prints, copied as it stands, or `marks: none open` where it prints none, never written from memory",
    );
    expect(close).toContain('`landing: "merge into <base>: <their words>"`');
    expect(read("close/SKILL.md")).toContain("stop what you started, never what you did not.");
    expect(read("design/references/marks.md")).toContain(
      "At the close, copy the `marks:` line `greenline status` prints into the close section as it stands",
    );
  });

  it("puts a floor finding to the owner, waits on a locked section, and names the pid form", () => {
    const design = read("design/references/greenline.md");
    expect(design).toContain('`- floor <rule> at <where>: waived, "<their words>"`');
    expect(design).toContain("`- page <address>: <path>`");
    expect(read("design/references/home.md")).toContain('`- unlock <section>: "<their words>"`');
    expect(read("build/references/greenline.md")).toContain(
      "Stop a process by its pid, one the session started",
    );
  });
});
