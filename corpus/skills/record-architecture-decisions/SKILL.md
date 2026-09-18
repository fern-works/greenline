---
name: "record-architecture-decisions"
description: "Record small Architecture Decision Records (ADRs) for durable technical choices. Use when a change chooses among meaningful alternatives, abandons an ideal approach over a discovered constraint, establishes a cross-component contract or convention, accepts a consequential trade-off, or supersedes an earlier decision. Also use it before completing any non-trivial ticket, to evaluate whether the work produced an ADR-worthy decision."
---

# Record Architecture Decisions

This skill is the decision harvest at a ticket's close: implement and verify-this name it when a landed change may have settled something durable, and it also fires on its own when a change chooses among meaningful alternatives, abandons an approach over a discovered constraint, establishes a cross-component contract, accepts a consequential trade-off or supersedes an earlier decision. It writes the record in the repository's existing decision home. The shaping rulings that scoped an initiative belong in that initiative's `decisions.md`, and the words of the domain belong to domain-modeling; this skill never reopens the decision it records, and the harvest closes the ticket for the request holder to complete.

Capture why a decision made sense with the constraints and evidence available at the time. Keep the record useful after those constraints change.

## Evaluate the change

1. At the ticket's close, review the conversation, implementation attempts, test results, and the diff of its `base_commit..result_commit` for durable decisions.
2. Write an ADR when the work:
   - chose among meaningful alternatives;
   - abandoned a preferred design because evidence exposed a constraint;
   - established a convention, dependency, interface, data model, deployment pattern, or operational policy;
   - accepted a trade-off that a future maintainer may otherwise undo without understanding it; or
   - changes a decision documented by an existing ADR.
3. Skip an ADR for routine maintenance, implementation details, straightforward bug fixes, and choices already dictated by an accepted ADR. A deferral is not a decision: a choice put off is a line inside the decision it defers from, never an ADR or a decisions-book entry of its own. A shaping ruling that scoped the work belongs in the initiative's `decisions.md`, not in an ADR; an ADR holds the durable technical reasoning the work itself surfaced, such as a constraint discovered or an approach abandoned.
4. If no ADR is needed, state that explicitly in the request holder's handoff.

## Write the ADR

1. Find the repository's existing decision home: a decisions document, or an ADR directory of its own. When one exists, write there in that home's format. Only when the repository keeps no decisions anywhere, seed `docs/adr/` on first use from this skill's `template.md` and `README.md` support files, then read `docs/adr/README.md` and `docs/adr/template.md` completely.
2. In `docs/adr/`, create `docs/adr/YYYY-MM-DD-short-title.md`; in another home, add the entry in that home's own form. Use a specific, durable title and avoid sequential numbers that conflict across concurrent branches. The dated naming is repository-wide and supersedes domain-modeling's `ADR-FORMAT.md` where they disagree.
3. Preserve the facts from the work:
   - the need or problem;
   - the constraints encountered;
   - concrete evidence such as failed approaches, validation results, limits, or links;
   - the chosen approach and meaningful rejected alternatives;
   - positive and negative consequences; and
   - conditions under which the decision should be reconsidered.
4. Keep the ADR terse and scannable:
   - Default to one or two concise bullets under each template heading.
   - Use paragraphs only when bullets would obscure necessary reasoning.
   - Combine closely related alternatives and consequences instead of cataloging every detail.
   - Preserve the decision, evidence, trade-off, and reconsideration trigger without narrating the implementation.
5. Include the ADR in the same ticket's change as the decision whenever possible, and link a lasting choice from the decisions book, `.greenline/DECISIONS.md`, rather than copying it there.

A decision that spans modules is recorded where a developer must stand to extend it: the ADR lives at, or is pointed at from, the extension point, and it carries an explicit checklist of the other places that must change in step, because that is the moment the reader is already committed to the change (Ousterhout, 2021). The ADR is still a dated file in the decision home; what stands at the extension point is the record's pointer and the in-step checklist the extending reader must act on. Duplicating the explanation into every dependent site drifts apart, and parking it in one dependent site hides it; where no obvious central location exists, the decision home is the fallback and the extension point gains the pointer.

## Preserve history

- Do not rewrite a landed ADR to make the old decision appear current.
- Add a new ADR when a decision changes, and link the earlier record under `Supersedes`.
- Do not add approval or status metadata. Landing with the reviewed ticket's change records acceptance; an unmerged ADR remains a proposal in its branch.

## Handoff

Consumes: the landed change at a ticket's close (the decision harvest) and the repository's existing decision home
Produces: an ADR in that home, linked from the decisions book .greenline/DECISIONS.md; docs/adr/YYYY-MM-DD-short-title.md only when the repository keeps no decisions elsewhere and docs/adr/ is seeded from this skill's template and README on first use
Next: none; the harvest closes the ticket and the request holder completes it
