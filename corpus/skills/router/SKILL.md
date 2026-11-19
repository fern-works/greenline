---
name: "router"
description: "Find where a request stands on the line when the next step is unclear: resume an open or stopped change at the step its \"next\" line names, choose the start the request's situation calls for, or send a new change to its proposal. Use for continuity (\"what were we doing?\", \"where were we?\", \"what should we work on?\", \"carry on with that change\"), for a request no start fits, and for doubt about the next step."
---

# Router

AGENTS.md owns the request loop, the modes and the roster by kind. This
start finds where a request stands: an open or stopped change to resume, a
start to choose, or a new change to propose. The ledger guide owns the
change record's format.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before you resume, choose or propose, read [method.md](method.md): resuming a change, what to work on, choosing the start and watching the habits.

## Handoff

Consumes: the request, the open or stopped change records under .greenline/ledger/ and the open or parked discussions under .greenline/ledger/discussions/
Produces: the record's state in .greenline/ledger/<id>.md, open for the change resumed and stopped, with its "next" line and committed, for the change set aside; otherwise nothing durable: the start loaded, the proposal made, or, with nothing to resume, the owner asked for the request, in the reply
Next: the step the resumed change's "next" line names, the start the situation calls for, or frame under the mode the owner approves
