# Recipes

Everyday work starts with ordinary requests.

## “Fix it”

Name the broken behavior. A settled code change gets one compact ticket,
its execution account, and the required implementation, review, and verification.
A hidden consequential choice becomes a concrete question; there is no
mandatory initiative for a small fix.

## “Prove it”

Ask “Did this fix it?” or “Prove it is faster.” The result needs a falsifiable
claim, an appropriate baseline, and actual evidence. Instruments and raw results
stay together under .greenline/work/evidence/<work-id> so they can be checked
again. A changed instrument invalidates results that depended on its old form.

## “What should we build next?”

The agent can explore ideas against current product evidence and recorded
decisions. Discussion alone does not create a project commitment. Choosing an
idea establishes its scope and the artifacts its uncertainty warrants.

## “Find out which design works”

A bounded prototype answers a question through execution. Research uses
primary sources and records what remains uncertain. Both return evidence to
the work that needs them. A read-only request keeps repository bytes unchanged.

## Changing how the agent works

State your preference directly. It applies within your request; you do not
need to repeat it merely because a skill suggests a different default.
A substantive conflict should be explained with its consequence.

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

Work documents are yours. Meaningful changes increment their revision and
require dependent inputs to be rechecked. A corrected typo or link does not
change meaning. `greenline doctor` reports invalid fields, stale references,
or unsupported status claims; see [the reference](./doctor.md).
