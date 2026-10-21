# Plan: the practice's mechanics

This page holds plan at each mode's depth and where its work lands: the section, the plan directory's files and their marks, the checks it names, the tickets' waits and modes. Read it with `SKILL.md` when the mode reaches plan, and when AGENTS.md's index sends you here.

## The depths

- **Inline, at quick.** The plan section, in `.greenline/ledger/<id>.md`, is one line: the acceptance, a condition a check could fail, and the check that will show it.
- **Written, at regular and careful.** The plan is written before the build, in one of two shapes. A change that stands alone writes the plan section of its change record, `.greenline/ledger/<id>.md`: its acceptance criteria, each a condition that can fail, and its tasks in order, each with its check, cut by the rules of `SKILL.md`'s tickets and checked by the self-review, a task standing for a ticket. That section may name file paths, which a spec and a ticket never do. Work that splits into tickets writes a plan directory, `.greenline/plans/<NNN-name>/`, holding `SKILL.md`'s spec in `spec.md` and its tickets in `tickets.md`, each marked `status: draft` until it is whole and `status: complete` then; the planning change's own plan section names the directory and holds what every ticket shares. The careful mode's plan names each floor found and, when the work splits, the floor each ticket carries.

## Checks

The plan names the change's checks: the project's own commands that show the acceptance, each run through `greenline check`. They are the checks `.greenline/manifest.json` declares in its `checks`, which `greenline init` proposed from the project's own files: the first change confirms or corrects them, reading how the project runs its tests, its linter and its build. Where the project has no check that could fail, or lacks one the change needs, the plan names the one the change adds and declares it with `greenline check --declare -- <command>`, a line the owner's yes covers.

## Tickets

Work that will be split into tickets waits twice: at the start, for the planning change's mode, careful, unless the request names it; and after ticketing, on the ticket list with a mode beside each ticket. A ticket then opens under its approved mode, or one the owner names as it opens, with no further wait, on the planning change's branch.

## The ticket list and the tickets file

A ticket's change record takes its id as it opens, and the tickets share the planning change's branch: each ticket's commits go there carrying its own trailer, and the planning change's close offers the landing for the whole.

Show beside each ticket the mode you propose for it, for the reasons a change's mode is proposed, its floors included. The owner's approval of the breakdown approves each ticket's mode: this is the plan's second wait, and no ticket opens before it. A mode the owner names beside a ticket while the list waits is part of approving it and edits that ticket's entry: write it there before the list is complete. A mode the owner names when a ticket opens, once the list is approved, overrides that ticket alone: open its record under the owner's mode with `choice: owner` and `proposed` the entry's mode, leave the entry as approved, and `greenline status` marks the difference (GL0406).

Write the approved tickets into the plan directory's `tickets.md`, in dependency order (blockers first): one `## <id>` entry per ticket, with its `intent`, its `scope` (the roots it touches), its `acceptance`, the entries it comes `after` and its `mode`. Mark it `status: complete` once the owner has approved the list. No ticket's progress is written there: it is read from the change records that name the ticket, and a ticket is ready once every entry it comes `after` is done, which `greenline status` shows as the ready frontier.

## What the plan may add

Furniture the repository lacks, a test lane, a script, a convention of its own, is proposed in the reply, not added, whoever names it; the default homes AGENTS.md and `.greenline/WORK.md` name are not furniture. A new toolchain, a paid service, a consequential exception or an unrelated migration needs authority beyond mere detection, and a missing tool does not authorize replacing a toolchain. A source's date or novelty does not mandate a migration.
