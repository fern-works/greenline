# Design survey: the practice's mechanics

This page holds where the survey's work lands and its commands. Read it with `SKILL.md` when the work lands in the workspace.

## Where its work lands

- The sheet is `.greenline/ledger/interface/survey.json`, opening with its `generatedBy` key: one row per fact, `{ "fact", "value", "source" }`, the source one of `{ "kind": "measured", "command", "commit" }`, `{ "kind": "read", "from" }` or `{ "kind": "confirmed", "date" }`. `greenline check interface --survey` measures the rows it can and writes them, keeping every row you read and every row the owner confirmed.
- Your instrument is a script in the project, declared as a check with `greenline check --declare --name interface-survey -- <its command>` and run through `greenline check`, so its numbers are facts at a commit.
- DESIGN.md is written at the root, and at a root whose register differs; the rulings go under `## Interface` in `.greenline/DECISIONS.md`. Every write of the survey belongs to a change: where none is open, open a quick record first, and write the sheet, DESIGN.md and the rulings under it. The harness hook admits DESIGN.md and the ledger home before the owner's yes, never the decisions book.
- `.greenline/manifest.json`'s `interface` block holds the roots, the platform and the frameworks the setup detected: set `confirmed` to true once the owner confirms them. In the same round ask the owner once whether the interface check holds the close, the opt-in, and write the answer as `check`, `true` or `false`, never leaving it out; where it is true the check and the render hold `done` on every class, a platform no browser renders included.

## The section

Where a change is open, the record's `## start` section names `design-survey`, the mode, the sources read and the files it wrote, and cites the sheet. A survey with no change open opens a quick record first, its `## start` naming `design-survey`, and that change commits the sheet, DESIGN.md and the rulings.

## Commands

- `greenline status` prints the interface line and, once DESIGN.md reads, the drift between the code and it.
- `greenline check interface --survey` measures the sheet's rows at the current commit.
