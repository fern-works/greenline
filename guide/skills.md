# The skills

Describe the work. Your agent chooses the methods the task needs.
Installation makes a skill available; it does not require the agent to use
every installed method.

## Skills are methods and disciplines

The default roster includes planning, implementation, review, verification,
communication, and engineering disciplines. [Explicit exclusions are supported;
diagram-design and architecture-map are optional asset integrations.]{claim: One default method roster with optional integrations and explicit exclusions}

| Work                           | Some relevant methods                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Establish continuity           | project-router, groundwork                                                               |
| Resolve uncertainty            | grilling, grill-with-docs, wayfinder, domain-modeling                                    |
| Gather evidence                | research, prototype, control-cli, control-ui                                             |
| Describe and implement work    | to-spec, to-tickets, implement, tdd                                                      |
| Review and verify              | delivery-review, review-lens, ponytail-review, verify-this                               |
| Diagnose failures              | diagnosing-bugs                                                                          |
| Exercise engineering restraint | ponytail, codebase-design, boundary-discipline, type-system-discipline, model-the-domain |
| Reason about concurrency       | concurrency-method                                                                       |
| Examine architecture or tests  | improve-codebase-architecture, sweep-tests                                               |
| Explain and communicate        | answer-plainly, technical-writing, unslop, show-me, progress-check                       |
| Retain product knowledge       | product-description, record-architecture-decisions, what-to-build                        |
| Protect evidence and secrets   | fail-loud, airgap-secrets                                                                |

The review runs as a subagent the harness starts fresh. When a session will not start one (some Claude Code sessions decline delegation unless asked), the agent leaves the ticket implemented and blocked for review with the reason recorded, and the owner opens a fresh session to review it; nothing is skipped silently.

These are neighboring methods, not a fixed order or a promise that every method
is installed. The installed roster is the availability list; exclusions still win.
Every skill has one class, listed with the roster in AGENTS.md: an entry
(project-router), a stage of the delivery arc, a support skill a stage
dispatches, a discipline the agent applies on its own judgment, or a
situational skill that fires on a situation in the conversation and is
offered in one line when its output is a durable file you did not ask for.
Codex's per-method `allow_implicit_invocation: false` disables implicit
discovery for stages, not work already authorized by the owner; Claude
Code reads the same conduct rules in the block. Neither creates a separate
stage approval.

The installed descriptions and project-router's ROUTING.md, the pipeline map,
help distinguish them. You do not have to select a persona or call each stage
yourself. Each stage or support skill ends with a Handoff section naming what
it consumes, produces and hands to next; each situational skill with a line
naming its durable output.

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
Cathryn Lavery, Alaa Mendili, and tjcages. Source pins and notices remain
recorded. greenline does not imply endorsement.

[Preserved methods are edited copies of their sources]{claim: Skill source trees are preserved and composition changes are recorded}: the steps and support
are the author's, and every difference (homes, names, handoffs, harness
mechanics, scope) is recorded with its reason. A change to an author's own
steps is made only on a ruling of greenline's maintainer and is recorded
with it. The third-party
notices identify each source and its terms, and the
[provenance pages](https://fernworks.dev/greenline/provenance/) show every difference from its
source with the reason for each, rendered from the ledger.

## What the ledger establishes

Read means obtaining content; select means choosing it for this task; apply means
using it with a supported outcome. Repository decisions retain lasting choices.
Generated receipts and sparse account annotations keep these distinctions visible.
A declaration, a captured read, and independent verification are different things.
