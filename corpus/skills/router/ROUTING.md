# The map of the line

Read this when two methods could produce different work. It describes the
corpus's methods, not a promise that all are installed: the roster in
AGENTS.md lists what is installed, and an absent skill is unavailable even
when named here. The request's authority carries through the line; ask
about an unresolved product decision or a scope boundary, never for
permission to read a skill.

## The steps

A change's mode runs the steps in this order, each at the depth the mode
table in AGENTS.md gives it, and you never choose among them. Each step's
skill writes its section of the change record
when the step ends.

| Step | Its section of the record holds |
| --- | --- |
| `frame` | the intent restated, what is out of scope, the settled terms and the open questions |
| `plan` | acceptance that can fail and the work in ordered tasks; when the work splits, the plan directory's spec and its tickets file, a mode beside each ticket |
| `anticipate` | the claims the build rests on, attacked before the build; it is careful's premise review |
| `build` | what was built, the deviations from the plan and the approaches dropped; the commits carry the change's trailer and the checks are recorded |
| `review` | each reviewer's findings and what was done with each |
| `verify` | each acceptance item verified, not verified or inconclusive, with its evidence |
| `close` | the decisions and terms the change settled, the state, the "next" line and the cost |

A step asked for by name runs alone: "grill me" is `frame`, a spec or
tickets is `plan`, a stress test of a plan is `anticipate`,
"review this branch" is `review`, "verify this" is
`verify`, and a decision or a term to write down is `close`. It needs no
mode and no record while it changes no file. Once it edits a file, a
write into the knowledge homes (the decisions book, the ADR home and the
glossary) included, it opens a change and its proposal like any other
edit, and `close` opens a quick record first.

## Resuming

An open or stopped change resumes at the step its "next" line names, on
the branch its record's commit sits on, under the record's mode, and the session that resumes it sets
it `open`. Its earlier sections record what was done, and the builder's
sections are the builder's claims, not evidence. A ticket of a plan
directory opens its own change record under the mode beside it in the
tickets file, on the planning change's branch, and the record omits the
steps its plan's record holds.

## Two methods that look alike

| The situation | Choose | Not |
| --- | --- | --- |
| Observed behavior is wrong and its cause is unknown | `diagnose`, a start: a reproducer and the cause, then the repair as a change | `verify`, which proves a claimed outcome |
| A design question inside one change | `frame`, at its depth | `wayfinder`, a start that maps a decision space spanning sessions |
| Which product idea to build next | `what-to-build`, a start that proposes in the reply | `frame`, which shapes a request already chosen |
| The structure of the code as a whole | `architecture-survey`, a start that surveys and reports | `review`, which judges one change's commits |
| A brittle or slow test suite | `sweep-tests`, a start with its mutation proof | `review`'s excess lens, which reads one change |
| The repository lacks its baseline | `groundwork`, a start that sets up only what the purpose needs | `build`, which works inside a baseline |
| An idea the owner brings is still vague | `idea-refine` (trial), a start that varies it, stress-tests it and states its assumptions before any change | `what-to-build`, which proposes ideas from the repository's own evidence |
| The repository's quality bar is unwritten, or a check was loosened to reach green | `constraint-driven-development` (trial), a start that writes the bar down and guards it | `groundwork`, which sets up the baseline a bar measures |

Use evidence available locally before asking the owner a factual question.
When two plausible tasks remain, explain the difference in the intended
result. Routine implementation choices stay with the agent inside the
settled scope.

## The records

Working files are removed when the change is done, never a cited file.
What a claim relies on goes into the change's folder, and the record cites it. A repository's existing home for a kind of memory
is that home: lasting choices go to its decision home and settled terms to
its glossary, or `GLOSSARY.md` when it has none.
