# Review: the practice's mechanics

This page holds review at each mode's depth and where its work lands, how every fresh agent runs, whatever its step, and the reviewer's mechanics a fresh reviewer reads with its brief. Read it with `SKILL.md` when the mode reaches review, and when AGENTS.md's index sends you here.

## The depths

- **None, at quick.** No review runs: the review section holds the one line `none at quick`.
- **Independent, at regular with one agent and at careful with two.** Fresh agents review, one after another, each started as [reviewers.md](reviewers.md) says and each writing its own report, `.greenline/ledger/<id>/review-<n>.md` for the `<n>`th agent. With one agent, it reads both axes in one pass. With two, the first reads the Standards axis and the second, started only once the first's report is written, the Spec axis. The review section holds the builder's judgment of every finding and cites each report.
- **Inline, where the harness has no delegation, and when review is asked for by name.** The builder reads the reviewer's brief, [brief.md](brief.md), whole and reads its own commits by it, both axes in one pass, and writes the change record's review section, in `.greenline/ledger/<id>.md`, as one line: each finding at a blocking rung, rung 1 or 2 (the brief's "Severity"), with what was done about it, or none.

At the independent depth the builder reads [reviewers.md](reviewers.md), starts each reviewer with the brief file `greenline brief` writes, and never reads the reviewer's brief or a brief file. Where the harness has no delegation the review runs inline, and the section says so.

The front matter records the depth the review ran at. Review takes its own fix pass, apart from verify's: the builder acts on the findings in the fix rounds the mode gives this step. Where the mode gives none, a finding at a blocking rung is recorded in the review section and goes to the owner.

## The judgment's table

Write the judgment into the review section as one table, a row for each finding, its columns `Finding`, `Severity`, `Bucket` and `What was done`: the finding and the report it came from, the rung its reviewer gave it, its bucket, and what you did with a one-line reason, the dismissed included. Under the table, give your ruling on each behavior a reviewer declined to judge. The section cites each report by its path.

## Fixes

Commit each fix with the change's trailer, `Greenline-Change: <id>`, on the last line of its message, with a test where the fix changes behavior. A reviewer's checks of the change's code run through `greenline check --change <id> --step review -- <command>`, as the brief says, and so do the builder's in its fix rounds. A second review of a fix waits for the owner's word. A finding you push back on stays in the review section with your evidence.

## Fresh agents

One agent runs at a time, in the change's one checkout and never a worktree of its own: a depth that needs a fresh agent starts it through the harness's delegation, with the one brief the ledger guide states, and waits for its report before the next starts. A fresh agent delegates nothing. Each fresh agent writes its report into `.greenline/ledger/<id>/<step>-<n>.md`, and the record cites it. A fresh agent's checks run through `greenline check` too, as `greenline check --change <id> --step <step> -- <command>`: the same command run plainly, `npm test` or `node --test`, is a read that proves nothing to the record. Where the harness has no delegation, every depth above written, independent and looped alike, runs without one: review inline, verify at the written depth, anticipate as its degraded self-questioning pass; the step's section records the limit.

## The reviewer's mechanics

A fresh reviewer reads this section with its brief. Its brief is the file `greenline brief` wrote from the record, the one brief every fresh agent gets (`.greenline/ledger/README.md`, "The brief and the relay note"); its report is `.greenline/ledger/<id>/review-<n>.md`, and its scratch folder `.greenline/tmp/<id>/review-<n>/`. For a change, list its commits with `greenline status --change <id>`, which finds them by their trailer, `Greenline-Change: <id>`, and by the commits that touch the record or its folder; capture the diff of the code leaving out `.greenline/`, where the record and the reports live, `git diff <first>^ <last> -- . ':(exclude).greenline'` when the set is contiguous and `git show` of each commit in order, with the same exclusion, when it is not. The decisions book is `.greenline/DECISIONS.md`.

Every check you run of the change's code, its tests, its linter, its build or a script that exercises a behaviour its acceptance claims, runs through `greenline check --change <id> --step review -- <command>`, a fresh reviewer adding the `--round <n>` its brief names, which sets `TMPDIR` to its scratch folder, so the record holds its facts: the same command run plainly, `npm test` or `node --test`, is a read that proves nothing to the record. A run whose green the change never claims, a baseline at an earlier commit or a mutation, is a probe and runs plainly, as the verify skill's "Checks and probes" says; never remove or edit a recorded fact. Asked for by name with no change open, run every command plainly.
