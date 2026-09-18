---
name: record-architecture-decisions
description: Record small Architecture Decision Records (ADRs) for durable technical choices in this monorepo. Use when a change chooses among meaningful alternatives, moves from an ideal approach to a practical one because of discovered constraints, establishes a cross-component contract or convention, accepts a consequential trade-off, or supersedes an earlier decision. Also use before completing any non-trivial implementation thread or merge request to decide whether its work produced an ADR-worthy decision.
---

# Record Architecture Decisions

Capture why a decision made sense with the constraints and evidence available at the time. Keep the record useful after those constraints change.

## Evaluate the change

1. Review the conversation, implementation attempts, test results, and diff for durable decisions.
2. Write an ADR when the work:
   - chose among meaningful alternatives;
   - abandoned a preferred design because evidence exposed a constraint;
   - established a convention, dependency, interface, data model, deployment pattern, or operational policy;
   - accepted a trade-off that a future maintainer may otherwise undo without understanding it; or
   - changes a decision documented by an existing ADR.
3. Skip an ADR for routine maintenance, implementation details, straightforward bug fixes, and choices already dictated by an accepted ADR.
4. If no ADR is needed, state that explicitly in the final handoff.

## Write the ADR

1. Read `docs/adr/README.md` and `docs/adr/template.md` completely.
2. Create `docs/adr/YYYY-MM-DD-short-title.md`. Use a specific, durable title and avoid sequential numbers that conflict across concurrent branches.
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
5. Include the ADR in the same merge request as the decision whenever possible.

## Preserve history

- Do not rewrite a landed ADR to make the old decision appear current.
- Add a new ADR when a decision changes, and link the earlier record under `Supersedes`.
- Do not add approval or status metadata. Landing through merge request review records acceptance; an unmerged ADR remains a proposal in its branch.