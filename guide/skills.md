# The skills

Describe the work. greenline installs skills of three kinds, and each kind
says when its skills run: the mode runs the steps, the situation a request
begins in chooses a start, and the situation of the moment loads a habit.
Installation makes a skill available; the agent loads only what the work
reaches.

## Steps, starts and habits

[The default roster installs every skill but the extras, which install on
request, and the trials, which install where you enable them; explicit
exclusions win.]{claim: One default method roster with optional integrations and explicit exclusions}
AGENTS.md lists the installed roster by kind.

**Steps** run where the change's mode reaches them on the line, at the depth
the mode gives them, and the agent never chooses among them. They are the
eight of [the pipeline](./pipeline.md), in its order: <!-- guide-roster begin steps: generated from corpus/manifest.json, never edited by hand -->frame, design, plan, anticipate, build, review, verify and close<!-- guide-roster end steps -->. Where a step's depth
starts a fresh agent, its skill starts that agent with the one brief every
fresh agent gets, which `greenline brief` writes for a reviewer and a
verifier, pointing it at the skill to work by and at its scratch folder; the agent reads the skill whole, writes its own report and starts no agent of
its own. The fresh agent is started through the harness's own delegation, on Codex
as on Claude Code, with its brief as its only context and never a fork of
the builder's conversation where the harness lets the builder choose, and
the hooks record its start as fresh or forked where they see it; a start that fails is said in the harness's words and the work
stops for you, never done inline in its place.

Each skill's `SKILL.md` is its front, under 300 words: the situation it
serves, its promises, and a pointer to its method page, `method.md`, that
names the moment the page is read. The method page holds the method its
sources wrote, cut and merged by its recipe, and a step's
`references/greenline.md` holds greenline's own mechanics: where the step's
work lands in the record, the section's form at each depth and the commands
the step runs. The agent reads the front and the references page when the
mode reaches the step, and the method page at the moment the front names.

**Starts** are chosen once, from the situation a request begins in, and hand
the job to a mode.

<!-- guide-roster begin starts: generated from corpus/manifest.json, never edited by hand -->

| The situation                                                         | Start                                 |
| --------------------------------------------------------------------- | ------------------------------------- |
| The next step is unclear, or continuity ("what were we doing?")       | router                                |
| What should we build next                                             | what-to-build                         |
| Multi-session uncertainty, mapped one decision at a time              | wayfinder                             |
| A known failure or regression                                         | diagnose                              |
| Survey the architecture                                               | architecture-survey                   |
| Prune or audit a test suite with mutation proof                       | sweep-tests                           |
| Set this repository up properly                                       | groundwork                            |
| Describe how the product behaves for its user, feature by feature     | product-description (extra)           |
| A vague idea to sharpen before any change                             | idea-refine (trial)                   |
| No quality bar is written down                                        | constraint-driven-development (trial) |
| An agent repeats a mistake it made before                             | correct (trial)                       |
| Tidy the instructions file outside greenline's markers                | improve-instructions (trial)          |
| A state machine, a race or an invariant to prove                      | verify-formally                       |
| How a part of the code works, or the map of its subsystems            | explain                               |
| A question the code does not answer, in papers, on the web or in code | research                              |
| Survey the interface a repository already has                         | design-survey                         |
| Redesign an interface                                                 | redesign                              |
| Find the implicit state machines in your app                          | state-machines                        |
| List the invariants your app relies on but does not enforce           | invariants                            |

<!-- guide-roster end starts -->

**Habits** load only when their situation arises, at any step, and write no
record of their own.

<!-- guide-roster begin habits: generated from corpus/manifest.json, never edited by hand -->

| Habit                            | Its situation                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| tdd                              | writing or changing a test, or fixing a bug whose cause is known                                |
| ponytail                         | before writing code the request leaves open, when refactoring, and when asked what was deferred |
| deep-modules                     | designing a module's interface or placing a seam                                                |
| boundaries                       | where outside data enters, and at every catch, default, retry or fallback                       |
| domain-and-types                 | stateful logic, a new requirement meeting a design, a type or a signature                       |
| concurrency                      | concurrency, two writers of one thing, an operation that must survive a crash                   |
| secrets                          | a key, a token or a .env file in reach, staged or built into an image, or a possible leak       |
| prose                            | a document or a commit message, a contradicted answer, a reply that did not land                |
| show-me                          | a picture in a reply, in one of six forms, or one asked for                                     |
| progress-check                   | progress to report on long work with no change open, and a change to how often                  |
| use-garden                       | an open engineering choice, only while the garden connector is enabled                          |
| diagram-design                   | a durable diagram for a change, a plan or a decision, made on your ask                          |
| architecture-map                 | the repository's architecture map, built or refreshed on your ask                               |
| anatomy                          | an explanatory figure of a concept, made on your ask                                            |
| interface-catalog (extra)        | an interface's direction still open at the design step, dealt from the catalog                  |
| build-the-lever (trial)          | work bigger than a few obvious edits: build the script or check that does it                    |
| guard-the-context-window (trial) | a large output or a long stretch of exploration about to enter the thread                       |
| pr-writing                       | a commit message, a PR title or a PR body, with its change outline, about to be written         |
| to-questionnaire (trial)         | a decision only someone other than you can answer                                               |
| benchmark-checklist (trial)      | a measured number about to be reported or acted on                                              |

<!-- guide-roster end habits -->

An extra carries a large set of support files and installs only when you
name it under `skills.include` in .greenline/manifest.json and run
`greenline sync`. A trial is a new start or habit not yet a default: it
installs only where `trials` in the same file names it, and it becomes a
default only on a measured run. A new method for a step enters at careful
alone, on a page of its own that the careful depth reads.

A start or a habit loads only in the situation its row names, never ahead of
it, and a start also when you name it; the change record
names a start only when it ran. Every start and habit carries trigger rows,
the words of a request, the classes of the files a change touches (a test,
a schema, a migration, a page, a module's entry file, a secret, an API
contract, a README or a benchmark), a step or a mode that make the change
owe it, each with a weight and whether its whole page or its front is read.
The rows loosen by mode. At quick a habit a touched file calls for is owed
by its front; at regular it is owed whole at the step that uses it, such as
tdd at build once a test is touched; careful adds a start your request's
looser words point to and the advisory habits, show-me, deep-modules,
progress-check and the catalog, each by its front. A start you name
outright is owed whole at every mode, and a skill your workspace did not
install is owed nothing. The installation carries the rows, and while a
change is open the status line's `owes:` line names the skills it owes
over every step its mode runs, each with the step that uses it, read from
your words for that change alone, heaviest first within
the mode's reading budget, the room the mode's words budget leaves after
the block and the steps' skills. A front is under 300 words, so the room
holds several reads: the line names the owed skills that fit and counts the
rest, and names the next once one is loaded. A skill owed whole is read
whole: its `SKILL.md` and each page its recipe names for a whole read,
tdd's method and tests pages and ponytail's simplify page among them,
each read alone, one page per read. A page read in one shell call with
another page, or one whose result the harness cut, counts as read in part,
and the line names it, `method.md cut by the harness, read it again` or
`tests.md unread`, until it is read whole; so does a page piped through a
`cut` that keeps part of each line, by character, byte or field. The hooks
count only the reads that ran: under zsh, macOS's default shell, a
word that opens with an equals sign, such as an `echo =====`
row between two pages, stops the command there, so the pages after it
never print and count as unread, and the one page printed before it alone
counts whole; where the harness hands the hooks the result, zsh's error in
it confirms the stop. With no change open, a finished or stopped change
still on the branch counting as none, the line names what your request's
words alone owe, a simplify request owing ponytail and the state-machines
phrase its start, until the turn loads them, so an answer that opens no
change still sees it. A fresh reviewer's or verifier's reads count at the
step its brief names. The agent loads them from a printed fact rather than
from memory; git's hooks refuse `done` while an owed
skill is named by neither a load the hooks recorded nor the record's
`skills` line and no waiver in your words stands, and while a skill owed
whole has a page the hooks recorded unread or read in part, whatever the
`skills` line says; where the hooks recorded no load at all, the line
stays a hint. architecture-survey runs only when you ask for a survey, never as a step
put before a change you asked for; it writes its report into the working
files, never opens it, tells you its path and the viewer's address before it
ends, and writes what it found into the knowledge homes. redesign starts before any edit when you ask for a page to be redesigned, or
for a working page to look different while it keeps what it does, denser,
cleaner or like another product. state-machines and invariants open on
your own words, "find all of the implicit state machines in my app" and
"find every invariant my app relies on but doesn't explicitly enforce", or a
request that means them: the first draws each flow the code holds in flags
and status fields as a map, its unnamed transitions marked; the second lists
each invariant in three parts, the invariant, where the code relies on it and
the door that would hold it, and an entry on a public contract or a security
boundary is a floor the next proposal names. Neither changes code; each fix is
a change of its own. With nothing to resume, router says so and asks what you want done. diagnose shows its hypotheses ranked in the reply before its first probe,
each with the prediction that would refute it, and keeps them ranked once
one is confirmed. secrets loads only with a secret
in reach, and a commit with none does not call for it; ponytail loads for code
the request leaves open, a refactor, a new internal API replacing an old one,
or a question about what was deferred, builds only on a need it measured, and
reads its simplify page before replacing code that works.

The installed descriptions and the router's ROUTING.md help the agent tell
the skills apart; you never select a persona or call a step yourself, though
you may ask for one by name, such as "review this branch". A step or a start
ends with a Handoff section naming what it consumes, produces and hands to
next, a step's next being the next step of the change's mode. Codex reads
each skill's activation from its metadata: a step and a start are explicit
and a habit implicit unless the skill states otherwise, as the router,
diagnose, verify and close are implicit;
Claude Code reads the same rules in the block. Neither
creates a separate approval.

## Engineering knowledge is garden's

The skills are methods: how to work. Engineering knowledge, what good looks
like for a given language, stack or concern, is garden's, a separate product.
greenline reaches it only through the optional garden connector. With the
connector enabled, one more skill, use-garden, is installed; it tells the
agent when a consultation is relevant and how to make one. Without the
connector, no knowledge is read. [The garden connector](./connector.md) explains
the consultation and its receipt.

Your decisions stay settled until you or the authorized agent deliberately
revise them. A root statement in .greenline/DECISIONS.md can exclude
knowledge for one root; the exact JSON format and its two exclusion forms are
in the installed WORK.md. An exclusion governs that exact root, even when
something points at an excluded unit, and it does not affect sibling roots.

## Where the methods come from

[Preserved methods come from]{claim: Distributed methods identify their source family and source-specific terms} Matt Pocock's skills, Dietrich Gebert's Ponytail, Cursor's
team kit, pstack, Steve Ruiz, Freddie Northam, Eric Clemmons, HumanLayer,
Cathryn Lavery, Alaa Mendili, tjcages, Addy Osmani's agent-skills, Jesse
Vincent's Superpowers, Anatomy, caveman, dsebastien's ai-skill-arxiv and
athola's claude-night-market. One skill may combine several of them, every sentence
keeping its one origin. Source pins and notices remain
recorded. greenline does not imply endorsement.

[Preserved methods are edited copies of their sources]{claim: Skill source trees are preserved and composition changes are recorded}: the steps and support
are the author's, and every difference (homes, names, handoffs, harness
mechanics, scope) is recorded with its reason. A change to an author's own
steps is made only on a ruling of greenline's maintainer and is recorded
with it. A method greenline lifts in its own words, or writes itself,
credits the source it learned from. Each method is defined by a recipe that takes its source's text
sentence by sentence and states the reason for every difference, and every
change to a recipe is recorded in greenline's ledger. The third-party
notices identify each source and its terms, and the
[provenance pages](https://fernworks.dev/greenline/skills/) show every difference from its
source with the reason for each, rendered from the recipes and the ledger.

## What the records establish

Read means obtaining content; select means choosing it for this task; apply
means using it with a supported outcome. A change record says what was done
and why, its check facts say what ran on which code, and a garden receipt
says what a consultation received, never what was applied. The decision home
keeps the lasting choices. A declaration, a recorded check and an independent
verification are different things.
