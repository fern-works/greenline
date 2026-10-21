---
name: "router"
description: "Find where a request stands on the line when the next step is unclear: resume an open or stopped change at the step its \"next\" line names, choose the start the request's situation calls for, or send a new change to its proposal. Use for continuity (\"what were we doing?\"), for a request no start fits, and for doubt about the next step."
---

# Router

AGENTS.md owns the request loop, the modes and the roster by kind. This
start finds where a request stands: an open or stopped change to resume, a
start to choose, or a new change to propose. The ledger guide owns the
change record's format.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

## Resume a change

Read the open and stopped change records in the ledger, the
exact references in the request and the relevant files; the workspace's status
lists each change with its state and its "next" line. A change stopped on
another branch, local or remote-tracking, is found by its record's commit,
which every stop makes, and read from that branch. Read the candidates before deciding which change the
owner means: recency alone is not ownership. A record's "next" line names
the step reached and the action that resumes it. Resume there on the
change's branch, the one its record's commit sits on, switching to it
first when the session sits on another, and making a local branch from a
remote-tracking one; go on under the record's mode, with
no new proposal, and set the record's state `open` as your first write in
it. Ask only when several changes remain plausible, and say what each would
produce.

## Choose the start

When this session holds a change and the request asks for another
change, stop that change first, as the ledger guide says. A
session that resumes, or is asked "what were we doing?", with no open or
stopped change on any branch says there is nothing to resume, proposes
nothing and asks the owner for the request. When no open or stopped change
is the request's, load the one start whose row in AGENTS.md names the
situation the request begins in, or at an orientation the start AGENTS.md
names for it, and no other; a start the owner names runs. `architecture-survey` loads at an orientation, a repository with
documents and no change record on any branch, local or remote-tracking, or
when the request asks for a survey or the owner names it; where a change
record exists, it is never an orientation. A start that did not run is
never named in the record. A request that asks for a change and fits no
start goes straight to its proposal: the mode, then the line from `frame`.
A step asked for by name runs alone. ROUTING.md, the map of the line,
separates two methods that could produce different work.

## Watch the habits

While any step runs, watch for the situations the habits' rows in
AGENTS.md name. Load a habit only when the situation its row in AGENTS.md
names arises in the work at hand, never ahead of it or beside another habit
in case it might. `secrets` loads only where a secret is in reach: a key, a
token, a credential or a `.env` file that the work reads, writes, stages in
a commit or builds into an image, or a credential that may have leaked; a commit or
an image with none in reach loads nothing. `ponytail` loads only in its own
rows: before writing code the request leaves open, a refactor or a
simplification of code that works, a new internal API replacing an old one
that still has callers, or a question about what was deferred; writing code
the request plainly asks for is none of them. A habit whose output is a
durable file the owner did not ask for is offered in one line and made on
the owner's yes.

## Handoff

Consumes: the request and the open or stopped change records under .greenline/ledger/
Produces: the record's state in .greenline/ledger/<id>.md, open for the change resumed and stopped, with its "next" line and committed, for the change set aside; otherwise nothing durable: the start loaded, the proposal made, or, with nothing to resume, the owner asked for the request, in the reply
Next: the step the resumed change's "next" line names, the start the situation calls for, or frame under the mode the owner approves
