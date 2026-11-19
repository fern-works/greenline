---
name: "diagnose"
description: "Find the cause of a known failure or regression before anything is fixed: build a tight loop that goes red, reproduce and minimise, read the evidence, rank hypotheses, instrument, then fix at the cause with a regression test. Use when the owner says \"diagnose\", \"debug this\" or \"find out why\", or reports something broken, throwing, failing, missing or slow."
---

# Diagnose

Diagnose is the start for a known failure or regression whose cause is unknown: something broken, throwing, failing or slow, or a red or a flake that resists a first read. It finds the cause before anything is fixed. A request for a diagnosis alone returns its findings in the reply and changes no file of the repository unless its owner approves that mode.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the first probe, read [method.md](method.md): where the probes live, the stop-the-line rule, the loop, the hypotheses, the fix and the cleanup.

## Handoff

Consumes: the request's failure, or a red that resists a first read inside an open change
Produces: the loop, the minimal reproducer and the confirmed cause, in the working files under .greenline/tmp/<id>/ and in the reply; nothing durable for a diagnosis alone
Next: frame, under the mode the owner approves, with the cause in the record's start section, and the build step runs Phase 5; inside an open change, the step it stopped at; a diagnosis alone returns its findings in the reply
