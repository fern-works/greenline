---
name: "correct"
description: "Find the mistakes agents keep repeating in this repository and make each one impossible: architecture first, then types, then a lint whose error names the fix, then a test, and written rules last, each check proved on a real past mistake. Use when the owner corrects an agent for a mistake made before (\"the same mistake\", \"you keep doing that\"), or asks to stop a repeated one."
---

# Correct

correct is a trial start for an owner who keeps correcting agents in this repository for the same mistake. Finding the classes of mistake edits no file; fixing them is a change: propose its mode and wait, as AGENTS.md says, open its record with a `## start` section naming correct and the classes it found, and run the line from `frame`, each class fixed as one commit of that change. A lint, a CI check or a script the repository lacks is furniture: propose it in the reply, as AGENTS.md says, and add it on the owner's yes.

Before the first class is named, read [method.md](method.md): finding the classes, the levels a fix takes, the proof and the rule table.

## Handoff

Consumes: the owner's repeated corrections; recent commits, reverts, review comments, the change records and the agent instructions file
Produces: the mistake classes with their evidence, in the reply; through the change, each class fixed at the highest level that works, one commit each with its check proved on a real past mistake, and the rule table in the decision home
Next: frame, under the mode the owner approves
