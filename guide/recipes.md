# Recipes

Everyday work starts with ordinary requests.

## “Fix it”

Name the broken behavior. The agent proposes a mode, quick for a settled
one-commit fix, and waits for your yes; "fix it in quick" chooses the mode
yourself. The change gets one record, and quick runs frame, plan, build,
verify and close in one line each, with no review; the record's review
section says `none at quick`. Name regular or careful when a fix deserves a
fresh reviewer. A hidden consequential choice becomes a
concrete question, and a known failure starts with diagnose, which builds a
reproducer before the mode is chosen.

## “Stop here” and “carry on”

Say stop at any point. The agent sets the change's record to `stopped` and
rewrites its "next" line: the step reached and the action that resumes it.
A request for another change stops the open one the same way before it is
proposed. Later, in the same session or a fresh one, `greenline status`
lists each open and stopped change with its "next" line; ask "what were we
doing?" or "carry on with that change", and the agent resumes at that step
on the change's branch, under the record's mode, with no new proposal.

## “Prove it”

Ask “Did this fix it?” or “Prove it is faster.” Verify needs a falsifiable
claim, an appropriate baseline, and a check that could fail, run through
`greenline check` so its facts are recorded with the change. A performance
claim needs a relevant workload and a measured result; a missing baseline or
noise makes the result inconclusive, with its limit named. What a result
relies on is copied into the change's folder, `.greenline/ledger/<id>/`, so
it can be checked again.

## “What should we build next?”

The agent can explore ideas against current product evidence and recorded
decisions. Discussion alone creates no change and no record. Choosing an
idea hands it to a mode: the agent proposes one for the idea's first change
and waits.

## “Find out which design works”

Frame answers such a question by work rather than by asking. A bounded
prototype answers it through execution, in the change's working files or on
a throwaway branch, never in the shipping code. Research reads primary
sources and records what remains uncertain. Both return their answer to the
change's frame section. A read-only request keeps repository bytes
unchanged.

## Changing how the agent works

State your preference directly. It applies within your request; you do not
need to repeat it merely because a skill suggests a different default.
A substantive conflict should be explained with its consequence.

Two settings in .greenline/manifest.json change the loop itself, and
`greenline inspect` edits both. `proceed` lets the agent go on without
waiting: at `quick` it goes on for quick changes and still waits for the
others, at `regular` for quick and regular ones; at `none`, the default, it
waits for every mode. `trials` enables a trial skill, a start or a habit
not yet a default, such as `idea-refine`, which otherwise does not install.
Run `greenline sync` after changing `trials`.

Persistent engineering choices belong in .greenline/DECISIONS.md with scope
and reasons. `greenline status` [lists dash bullets under `## House rulings`]{claim: Status lists the optional House-rulings bullet stanza, not all prose instructions}
outside AGENTS.md's managed markers. It does not interpret other prose as
structured rulings; those instructions still govern the agent. The installed
WORK.md shows the optional stanza and where to write it. Longer governing documents can be referenced
from the decisions book.

## Knowledge and settled choices

The agent works within your decisions. Advice it reads, from garden when the
connector is enabled, does not silently replace a framework or change an
exclusion. It brings back a consequential conflict with evidence. Nothing runs
while the agent is idle.

An inspector save leaves the latest change's hashes and time for the next
invocation. The agent checks relevant consequences while preserving your intent.
Direct edits remain visible through the files and Git history.

## Reading another option

Ask “Compare Go options for this service without changing files.” The agent
answers from the installed methods and the repository's evidence. With the
garden connector enabled it may also consult garden, when the comparison is
an open choice, and it names what it consulted in the reply. Reading another
language does not add it to your repository's choices.

## Editing work by hand

Change records and plan documents are yours, and you can edit them. A
record is checked against its mode whenever `greenline status` reads it: it
reports a change record or plan file that does not parse, an open or
stopped record that does not match its mode, and a cited file that is missing; see
[the reference](./status.md). A done record is judged while its latest check
ran under the current installation; after an update, or with no check
at all, it is history and is read for its form alone.
