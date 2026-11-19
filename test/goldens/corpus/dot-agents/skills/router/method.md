# Router: the method

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

## What to work on

Asked what to work on, or what is up, list the stopped changes, each with its
"next" line, and the open and parked discussions, each with its idea and, for
a parked one, when it said to come back to it, from the workspace's status and
the records in the ledger. Recommend one with why, and wait for the owner's
pick: a change picked resumes as above; a discussion picked opens again on the
owner's word and runs as frame's references page says. Nothing is resumed,
opened or set before the owner picks.

## Choose the start

When this session holds a change and the request asks for another
change, stop that change first, as the ledger guide says. A
session that resumes, or is asked "what were we doing?", with no open or
stopped change on any branch says there is nothing to resume, proposes
nothing and asks the owner for the request. When no open or stopped change
is the request's, load the one start whose row in AGENTS.md names the
situation the request begins in, and no other; a start the owner names
runs. The orientation is a habit of the first change's frame, never a start
put before that change: `groundwork` runs inside it on an empty tree, and
`architecture-survey` loads only when the request asks for a survey or the
owner names it. A start that did not run is
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
