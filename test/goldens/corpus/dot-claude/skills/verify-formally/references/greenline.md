# verify-formally: the practice's mechanics

This page holds where verify-formally's work lands in the workspace and the command that records its run, which `SKILL.md` and `upkeep.md` name by their nouns. Read it with them when the work lands in the workspace.

## Where its work lands

The change that writes or updates a verification has its record at `.greenline/ledger/<id>.md`, its `## start` section naming verify-formally and the target. The verification's files, the model, the harness or the property files, stand in the repository as its own code, in the directory the repository keeps such code in or beside its tests, and the note stands beside them as a Markdown file of the repository: the property and the harm, the covered files and functions, the bounds and the assumptions, the one command, and the sync commit. A scratch change that breaks the property and a counterexample's trace live in the change's working files, `.greenline/tmp/<id>/verify-formally/`, and the scratch change is dropped before the close.

## Recording the run

Run the check through `greenline check -- <command>`, so the change's checks record it with the commit and the tree it ran on. The sync commit the note records is a commit the check passed on, or, for a bug, the commit whose failure the report names.
