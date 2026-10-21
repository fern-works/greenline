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
seven of [the pipeline](./pipeline.md), in its order: <!-- guide-roster begin steps: generated from corpus/manifest.json, never edited by hand -->frame, plan, anticipate, build, review, verify and close<!-- guide-roster end steps -->. Where a step's depth
starts a fresh agent, its skill starts that agent with the one brief every
fresh agent gets, which `greenline brief` writes for a reviewer and a
verifier, pointing it at the skill to work by and at its scratch folder; the
agent reads the skill whole, writes its own report and starts no agent of
its own.

Each step's `SKILL.md` is the method its sources wrote, cut and merged by
its recipe, and its `references/greenline.md` holds greenline's own
mechanics: where the step's work lands in the record, the section's form at
each depth and the commands the step runs. The agent reads both when the
mode reaches the step.

**Starts** are chosen once, from the situation a request begins in, and hand
the job to a mode.

<!-- guide-roster begin starts: generated from corpus/manifest.json, never edited by hand -->

| The situation                                                     | Start                                 |
| ----------------------------------------------------------------- | ------------------------------------- |
| The next step is unclear, or continuity ("what were we doing?")   | router                                |
| What should we build next                                         | what-to-build                         |
| Multi-session uncertainty, mapped one decision at a time          | wayfinder                             |
| A known failure or regression                                     | diagnose                              |
| Survey the architecture                                           | architecture-survey                   |
| Prune or audit a test suite with mutation proof                   | sweep-tests                           |
| Set this repository up properly                                   | groundwork                            |
| Describe how the product behaves for its user, feature by feature | product-description (extra)           |
| A vague idea to sharpen before any change                         | idea-refine (trial)                   |
| No quality bar is written down                                    | constraint-driven-development (trial) |
| An agent repeats a mistake it made before                         | correct (trial)                       |
| Tidy the instructions file outside greenline's markers            | improve-instructions (trial)          |

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
| prose                            | a document, a commit message, a report or a reply that did not land                             |
| show-me                          | a structure to explain in chat                                                                  |
| progress-check                   | progress to report while long work runs                                                         |
| use-garden                       | an open engineering choice, only while the garden connector is enabled                          |
| diagram-design (extra)           | a durable diagram for a change, a plan or a decision                                            |
| architecture-map (extra)         | the repository's architecture map, built or refreshed                                           |
| build-the-lever (trial)          | work bigger than a few obvious edits: build the script or check that does it                    |
| guard-the-context-window (trial) | a large output or a long stretch of exploration about to enter the thread                       |
| pr-writing (trial)               | a commit message, a PR title or a PR body about to be written                                   |
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
it, and a start also at the orientation or when you name it; the change record
names a start only when it ran. architecture-survey is the orientation of a
repository with documents and no change record yet, and otherwise runs only
when you ask for a survey; it writes its report into the working files, never
opens it, and tells you the path. With nothing to resume, router says so and
asks what you want done. diagnose ranks its hypotheses before its first probe
and keeps them ranked once one is confirmed. secrets loads only with a secret
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
diagnose, verify and close are implicit and architecture-map explicit;
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

[Preserved methods come from]{claim: Distributed methods identify their source family and source-specific terms} Matt Pocock, Dietrich Gebert's Ponytail, Cursor's
team kit, pstack, Freddie Northam, Steve Ruiz, Eric Clemmons, HumanLayer,
Cathryn Lavery, Alaa Mendili, tjcages, Addy Osmani's agent-skills and Jesse
Vincent's Superpowers. One skill may combine several of them, every sentence
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
