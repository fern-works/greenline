# Router: the practice's mechanics

This page holds where router's work lands in the workspace and the commands it runs, which `SKILL.md` names by their nouns. Read it with `SKILL.md` when the work lands in the workspace.

## Where its work lands

The ledger is `.greenline/ledger/`, its guide `.greenline/ledger/README.md`, which owns the change record's format and the stop; each change's record is `.greenline/ledger/<id>.md` and its folder `.greenline/ledger/<id>/`. `greenline status` lists each change with its state and its "next" line. A change's checks run through `greenline check`. Working files live under `.greenline/tmp/<id>/`, and `greenline tidy` removes them when the change is done, never a cited file.
