# Skills and engineering guidance

Describe the work. Your agent chooses methods and reads the knowledge the task
needs. Installation makes a skill available; it does not require the agent to
use every installed method.

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

## Engineering guidance informs decisions

Guidance covers architecture, testing, repository structure, language rules,
patterns, coherent tooling/library sets, and dated options. It retains reasoning
and exceptions, not only checklists.

In a configured repository, the agent lists metadata by language, purpose,
technology, task and concern, reads the matching conditions, then retrieves the
units it needs. General TypeScript testing advice can be queried independently
of framework-specific advice. A tool-option query can compare alternatives by
responsibility before you settle a stack. The flags are `--language`, `--purpose`,
`--technology`, `--task` and `--concern`; `--kind` narrows the unit kind and
`--responsibility` narrows competing options. Values come from
`greenline guidance vocabulary --read-only`; repeated values are OR within a
facet, and different facets combine with AND. For example, a configured
repository can inspect testing candidates with:

```bash
greenline guidance list --read-only --root . --language typescript --task test --concern testing
```

This lists metadata; selected full reads reuse its request handle. A technology
filter names that technology and excludes generic units, so language-wide and
shared advice use a separate query without that filter. In an explicitly
unconfigured workspace, list returns `configuration: "unconfigured"` with
`result: null`; a configured query with no matches returns a result with
`count: 0` and an empty `units` list.

The library stays in the service. Bodies are returned to the agent for this
request; the repository keeps compact delivery receipts, not a guidance cache.
A new request retrieves the current publication. Your decisions stay settled
until you or the authorized agent deliberately revise them.

Exclusions belong in a root statement in .greenline/DECISIONS.md; the exact
JSON format and its two exclusion forms are in the installed WORK.md. They govern
that exact root and contained units, even when required reading points at one.
They do not erase the source or affect sibling roots.

## Where the knowledge comes from

[Preserved methods come from]{claim: Distributed methods identify their source family and source-specific terms} Matt Pocock, Dietrich Gebert's Ponytail, Cursor's
team kit, pstack, Freddie Northam, Steve Ruiz, Eric Clemmons, HumanLayer,
Cathryn Lavery, Alaa Mendili, and tjcages. Source pins and notices remain
recorded. greenline does not imply endorsement.

[Preserved methods are edited copies of their sources]{claim: Skill source trees are preserved and composition changes are recorded}: the steps and support
are the author's, and every difference (homes, names, handoffs, harness
mechanics, scope) is recorded with its reason. Any change to an author's own
steps needs the operator's ruling and is recorded with it. The third-party
notices identify each source and its terms, and the
[provenance pages](https://fernworks.dev/greenline/provenance/) show every difference from its
source with the reason for each, rendered from the ledger.

Authored guidance combines supported source ideas with their bounds and evidence.
Coverage remains a matter of supported use cases; an available language reference
does not mean every framework or emerging stack is covered.

## What the ledger establishes

Read means obtaining content; select means choosing it for this task; apply means
using it with a supported outcome. Repository decisions retain lasting choices.
Generated receipts and sparse account annotations keep these distinctions visible.
A declaration, a captured read, and independent verification are different things.
