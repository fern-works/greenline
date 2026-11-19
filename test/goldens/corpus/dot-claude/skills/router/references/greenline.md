# Router: the practice's mechanics

This page holds where router's work lands in the workspace and the commands it runs, which `SKILL.md` names by their nouns. Read it with `SKILL.md` when the work lands in the workspace.

## Where its work lands

The ledger is `.greenline/ledger/`, its guide `.greenline/ledger/README.md`, which owns the change record's format and the stop; each change's record is `.greenline/ledger/<id>.md` and its folder `.greenline/ledger/<id>/`. `greenline status` lists each change with its state and its "next" line. A change's checks run through `greenline check`. Working files live under `.greenline/tmp/<id>/`, and `greenline tidy` removes them when the change is done, never a cited file. Each discussion's record is `.greenline/ledger/discussions/<id>.md`, which `greenline status` lists with its state and its idea; the ledger guide's "Discussions" gives its form and its states.

## Floor debt

Where `.greenline/ledger/interface/paths.json` gives a route floor findings, or `greenline status` reports interface drift, list them as floor debt among the next things to work on, each with its route and its rule.

## Marks

Where the status line prints `marks:`, list the owner's open marks among the next things to work on, each with its id, its address and its note, from `greenline mark list`: the ones on an open change's address are that change's follow-up, and the rest are the next proposal's input.
