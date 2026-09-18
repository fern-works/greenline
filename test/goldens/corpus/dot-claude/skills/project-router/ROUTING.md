# The pipeline map

Use installed descriptions to find candidates. Read this when neighboring
methods could produce different work, then read the selected method and its
required support. These distinctions describe methods in the corpus, not a
promise that all are installed. Check the AGENTS.md installed roster first; an
excluded or absent method is unavailable, even when named below. Follow its
availability rule before choosing another method or reporting a capability
gap. A routing example is not a substitute for the selected method. The
request's authority carries through its supporting stages; ask about an
unresolved product decision or scope boundary, not permission to read a skill.

Every installed skill has one class, listed with the roster in AGENTS.md: an
entry, a stage of the delivery arc, a support skill, a discipline, or a
situational skill. Stages and support skills end with a Handoff section that names what
they consume, what they produce and which stage reads it next; the table
below is that chain in order.

## The delivery arc

| Stage | Consumes | Produces | Next |
| --- | --- | --- | --- |
| what-to-build | the decisions book, shipped specs, `ponytail:` comments | a ranked proposal in the reply; nothing durable until the user's yes | grill-with-docs for a larger idea, implement for a compact one |
| grill-with-docs | the initiative's intent and existing decisions | the initiative directory and `initiative.md` when none exists; `decisions.md`; the initiative at decided | to-spec |
| wayfinder | a loose idea too big for one session | `map.md` with its decision tickets; resolved answers in `decisions.md` or research records; the initiative at decided | to-spec, then to-tickets |
| to-spec | `decisions.md`, research and prototype records, pinned | `spec.md` with `consumes`; the initiative at specified | to-tickets |
| to-tickets | `spec.md`, or `decisions.md` when no spec was written | `.greenline/work/tickets/TKT-NNN.md` with `depends_on`; the initiative at planned | implement takes the ready frontier from `greenline status` |
| implement | one ready ticket and the revisions in its `consumes` | the claim, the commits, `result_commit`, the ticket at implemented, the implementation account | delivery-review; at close, record-architecture-decisions |
| delivery-review | the ticket at implemented, its spec, the range and the account | `.greenline/work/reviews/REV-NNN.md`; the ticket at reviewing, then verifying or back to implementing | verify-this |
| verify-this | the ticket at verifying, its acceptance and exact result | the verdict and its evidence; NOT VERIFIED returns the ticket | the request holder completes the ticket; the decision harvest |
| record-architecture-decisions | the landed change at close and the repository's decision home | an ADR in that home, linked from the decisions book | none |

A settled compact change goes to implement with one ticket and its account;
on the light path (one source file and its test, no open choice, a failing
test that already names it if there is one; a red test that does not name
the change, or an instruction the change cannot keep, makes it not light)
with no ticket at all. Substantial uncertainty earns a spec or an initiative; file
size and the existence of planning skills do not require them. Missing
consequential decisions return to shaping; a spec-writing request does not
authorize inventing them. Tickets have global IDs; initiative membership
references them without changing their paths or evidence. wayfinder's
decision tickets are open questions in the map, not delivery tickets; they
become delivery work only through to-tickets.

Other stages, each its own ticket: groundwork establishes only the
missing baseline the repository's purpose needs, chooses and records the
toolchain on an empty repository, and its one ticket accounts for the setup itself, leaving later work uncreated; diagnosing-bugs establishes a reproducer and falsifies causes
in the owning ticket's evidence, then a repair follows the normal review and
verification; improve-codebase-architecture surveys and reports, and accepted
work becomes a ticket or an initiative; sweep-tests audits a suite with
mutation proof in its own ticket; ponytail-review lists what a committed
range can lose, and accepted cuts return to the owning ticket;
product-description maintains a separate description repository.

## Start from the question

| The uncertainty | Method and boundary |
| --- | --- |
| What were we doing? | project-router reads current work, claims, and inputs. A dated conversation or the newest initiative alone cannot identify ownership. |
| What should this product do next? | what-to-build proposes evidence-backed product possibilities. An accepted idea can become work; a suggestion alone changes no files. |
| Is this design sound? | grilling tests the design tree. Use grill-with-docs when a larger intent needs durable shaping decisions; use wayfinder when the open decision space spans contexts. |
| Is a claim documented? | research follows primary sources. Return its answer to the requesting stage. |
| Would this approach work or feel right? | prototype answers a bounded experimental question with disposable work. Establish whether the requested result is a prototype or a shipping change when the request leaves that consequential distinction open. |
| Why is observed behavior wrong? | diagnosing-bugs establishes a reproducer and falsifies causes. An unclear product goal is a shaping problem, not a runnable bug. |
| Did the repair satisfy its claim? | verify-this compares actual evidence against falsifiable acceptance. Diagnosis identifies a cause; verification proves the claimed outcome. |
| How do we drive the real surface? | control-cli or control-ui supplies the instrument. Reuse an available harness and use a plain captured command when sufficient; the requesting diagnosis or verification owns the verdict. |

Use evidence available locally before asking the owner a factual question.
When two plausible tasks remain, explain the difference in intended result.
Routine implementation choices stay with the agent inside the settled scope.

## Support: dispatched by a stage

research and prototype are dispatched by wayfinder, to-spec or the request
owner and return their record and its pinned revision to the requester;
control-cli and control-ui are dispatched by verify-this, diagnosing-bugs or
product-description and return the instrument and its capture, promoted to
the owner's evidence home when the result relies on it. A support skill is
never started on its own; the requesting stage owns the verdict.

## Engineering disciplines

AGENTS.md owns retrieval and authority. Choose disciplines by the reasoning
needed and apply them on your own judgment, never announced: codebase-design
for a deep module or boundary, ponytail for deletion and reuse,
model-the-domain for incoherent state, type-system-discipline for expressing
contracts, boundary-discipline for trust boundaries, fail-loud for truthful
errors, concurrency-method for competing timelines, tdd for the red-green
loop, review-lens for what counts as a finding, airgap-secrets when a secret
is in reach, and unslop, technical-writing and answer-plainly for prose.
sweep-tests is a bounded audit of a brittle suite, not permission to erase a
failing behavior during diagnosis.

## In conversation

| The situation | Method | Applied or offered |
| --- | --- | --- |
| Scope, intent or a term is unclear mid-work | grilling | applied; a discussion earns no initiative |
| A flow, hierarchy, state machine or comparison to explain | show-me | applied in the reply |
| A durable diagram would serve and nobody asked for one | diagram-design (opt-in) | offered in one line; drawn on the user's yes, under `.greenline/diagrams/`; when not installed, a text diagram in the repository's docs home on the user's ask, and the optional method named |
| Someone wants to see how the code fits together | architecture-map (opt-in) | offered; a one-off subsystem explanation may only need show-me |
| Long owned work with milestones | progress-check | applied on its own cadence; also the moment the user asks to change how often you report, before any preference is saved |
| A term is doing two jobs | domain-modeling | offered: name it and write it down in the repository's glossary, or `CONTEXT.md` when it has none |

Offer a method when its output is a durable file the user did not ask for or
when it changes the scope of the work; apply it silently when the output
stays in the reply or shapes work already authorized. A stage's next stage
is named at its handoff and proceeds when the grant covers it;
otherwise it waits for the word.

## Communicate and retain knowledge

| Intended result | Method |
| --- | --- |
| A factual answer with measured limits | answer-plainly; use verify-this when the evidence still needs to be produced. |
| Clear sentences and a credible voice | unslop. Preserve quotations and upstream wording; change commissioned copy within its brief. |
| A document with a useful information structure | technical-writing, while retaining any artifact contract the document must satisfy. |
| User-visible behavior documented from the running product | product-description. Establish the surface and scope; an ordinary README request need not become a separate documentation program. |
| A durable consequential technical choice | record-architecture-decisions records alternatives, constraints, and consequences in the repository's existing decision home. Shaping decisions belong with their intent; vocabulary belongs in the glossary. |

## Review the result

delivery-review checks the committed work against repository standards and
its task contract in an independent context, one bounded round. review-lens
provides finding and severity discipline inside that review. ponytail-review
examines excess and deletion opportunities; it does not substitute for
correctness review. verify-this proves acceptance after the result and review
are current. A standards candidate needs its applicable rule, the concrete
failure, and its counter-case checked. A source without repository authority
may support an advisory judgment, not an invented requirement. Findings
return to the owning ticket; a code correction invalidates affected review
and verification. A review request alone authorizes reporting findings, not
applying its recommendations.

Optional methods install through the manifest as `.greenline/WORK.md`
describes; follow that path before choosing an absent method. The
repository-memory table in `.greenline/WORK.md` distinguishes the decisions
book, vocabulary, ADRs and House rulings, and says that a repository's
existing home for a kind of memory is that home. Retain relied-on instruments
and results in the work's evidence home; temporary probes can use
`.greenline/tmp/`, and an acceptance claim must not depend on evidence that
will disappear with that scratch space.
