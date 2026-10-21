---
name: "correct"
description: "Find the mistakes agents keep repeating in this repository and make each one impossible: architecture first, then types, then a lint whose error names the fix, then a test, and written rules last, each check proved on a real past mistake. Use when the owner corrects an agent for a mistake made before, or asks to stop a repeated one."
---

# Correct

correct is a trial start for an owner who keeps correcting agents in this repository for the same mistake. Finding the classes of mistake edits no file; fixing them is a change: propose its mode and wait, as AGENTS.md says, open its record with a `## start` section naming correct and the classes it found, and run the line from `frame`, each class fixed as one commit of that change. A lint, a CI check or a script the repository lacks is furniture: propose it in the reply, as AGENTS.md says, and add it on the owner's yes.

The owner keeps correcting agents in this repo for the same mistakes. Change the repo so the next agent can't make them.

Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the repo so a change that looks right from one file is right for the whole repo.

## Find the mistake classes

First, read recent commits, reverts, review comments, agent instruction files, and comments that explain workarounds. Group the mistakes into classes. A class counts once it has happened twice.

## Fix each class at the highest level that works

1. **Eliminate it with architecture.** Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete old ways and dead code an agent would copy.
2. **Enforce it with types so the bad state can't be written.** If bad code still compiles, add a lint or CI check whose error names the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
3. **Test the behavior.** Fix any test that would still pass if every function it calls returned nothing; a test that should go is deleted only through sweep-tests and its mutation proof.
4. **Write docs or agent rules last, only for judgment calls.** Nothing fails when an agent skips them.

**Why:** Textual instructions are easy to miss. They require the reader to notice, remember, and comply. Structural mechanisms (lint rules, metadata flags, runtime checks, automation scripts) enforce the rule without cooperation.

When you catch yourself writing the same instruction a second time:
1. Ask: can this be a lint rule, a metadata flag, a runtime check, or a script?
2. If yes, encode it. Delete the instruction
3. If no (requires judgment), make the instruction more prominent and add an example of the failure mode

**Pick the strongest mechanism.** When more than one mechanism would work, choose the strongest the situation allows (an unrepresentable state that cannot compile, then a lint or banned API that fails CI, then a canonical helper, then a runtime check), because agents copy whatever the surrounding code already does and a weaker guard becomes the next template.

**Corollary:** If the fix is structural, only use the structural fix. The instruction is the symptom.

## Fix and prove

Then fix the most frequent classes now, one commit each. Prove each new check fails on a real past mistake. Run the same command locally and in CI. Exceptions go on the offending line with a reason, an expiry date, and a human's approval.

## Keep the rule table

Last, keep a table in the repository's decision home that pairs each rule with what enforces it. When the owner corrects you within this change, fix the mistake and add the rule. If the rule was already there and nothing enforces it, that's a repeat, so fix it at the highest level in the same change. Drop a rule once its mistake can't happen.

**Reply:** each class with its evidence, the level you picked, and why a higher level didn't work.

## Handoff

Consumes: the owner's repeated corrections; recent commits, reverts, review comments, the change records and the agent instructions file
Produces: the mistake classes with their evidence, in the reply; through the change, each class fixed at the highest level that works, one commit each with its check proved on a real past mistake, and the rule table in the decision home
Next: frame, under the mode the owner approves
