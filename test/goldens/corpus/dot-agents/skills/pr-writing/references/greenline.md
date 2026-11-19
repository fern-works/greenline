# PR writing: the practice's mechanics

This page holds where pr-writing's work lands in the workspace and the commands it runs, which `SKILL.md` names by their nouns. Read it with `SKILL.md` when the work lands in the workspace.

## Where its work lands

`greenline status --change <id>` lists a change's commits by their trailer, `Greenline-Change: <id>`, the last line of every commit of the change, with `Greenline-Agent: <harness>/<model>`, the record's `agent` line, just above it; the checks the change recorded are those `greenline check` wrote. A change's durable visuals stand under `.greenline/visuals/<id>/`, listed in `.greenline/ledger/<id>/visuals.json`.

## An interface change

Where the change touches an interface, the pull request's body links its captures at the three widths, before and after, from the visuals the change keeps, and states the interface check's findings by tier: none on the floor, each waived reflex with its reason, and the finish findings listed. It lists the marks the change answered, from `greenline mark list --all`, each with its note and its before and after at the mark's width, the element outlined in both.
