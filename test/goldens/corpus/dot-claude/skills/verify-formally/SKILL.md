---
name: "verify-formally"
description: "Check a promise the code makes over every order of steps or every input in a stated scope, with a model checker, TLA+ by default for event order, or a verifier that fits the language: choose the strongest target from the code, show the check failing on a broken variant, report a failure as a finding in the code's words, and keep the check in step with the code through a note of what it covers and the commit it was last confirmed at. Use when a race, a retry, a state machine, a parser or an invariant needs more than tests, when a drawn state chart should be checked, when the owner wants to be sure whatever the order, not just tested, or when code a verification covers changed without a recheck."
---

# Verify formally

It finds the target and the tool without editing a file and reports them in the reply.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the target is chosen, read [method.md](method.md): the promise it serves, the change, the upkeep, the target, the tool, what makes it good, the note, the proof and the hand-off.

## Handoff

Consumes: the request's promise and the code that keeps it, a state chart a reply or a diagram drew, and for the upkeep a verification's note and the commits since its sync commit
Produces: the target, the tool and the property in the reply; through the change, the verification's files and its note in the repository, and its run recorded as a check
Next: frame, under the mode the owner approves, with the target in the record's start section
