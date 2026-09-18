# The pipeline

The agent chooses the methods needed to turn your request into supported work.
[A compact fix needs one ticket and execution account.]{claim: A small change uses a ticket and its contributor account} A larger uncertain
initiative can need decisions, research, a spec, and a ticket graph.
These are useful stages, not a sequence you must invoke manually.

<!-- diagram: pipeline-rail -->

## Shape: decisions.md

Consequential uncertainty is resolved before dependent work. The agent inspects
the existing system and asks what evidence cannot settle. Durable decisions
record alternatives and accepted costs. Broader uncertainty can use a decision
map; a settled request does not need an interview for its own sake.

## Specify: spec.md

A useful spec describes behavior and acceptance. It records the exact decisions
and research revisions it consumed. If those inputs change, affected work is
rechecked before the agent relies on it.

## Decompose: tickets/

A larger change becomes tracer-bullet tickets: usable vertical slices with
falsifiable acceptance and explicit dependencies. Tickets have global IDs.
An initiative lists its members; joining one does not move a ticket's files.
`greenline status` shows the frontier whose dependencies are complete.

## Build: one ticket, one worktree

The agent claims work within your authorization, reads relevant methods and
guidance, and implements against acceptance. The ticket records its result
commit; its execution account records consultations, choices, and application
evidence. One implementer owns a worktree.

Durable measurements keep instruments beside raw results in
.greenline/work/evidence/<work-id>. Temporary output that a result relies on
becomes durable evidence before completion.

## Review: reviews/

An independent context reviews the committed result. The review names the exact
ticket and implementation account, even when multiple tickets share a commit.
If the harness has no delegation tool, open a separate reviewing session with
the committed range and its account. Until independent review is available, the
implementation remains blocked for review; recording a limit does not complete it.
Findings return affected work to implementation. A subsequent change requires
the affected review to be checked again.

## Verify: measured, not asserted

Acceptance is proved with actual commands and observations. A performance claim
needs a relevant workload and measured result; a correctness claim needs a check
that can fail. VERIFIED means the valid comparison supports the claim;
NOT VERIFIED means it fails the claimed behavior or threshold. Missing baselines,
failed measurements, noise or confounds make the result INCONCLUSIVE, with the
limit recorded. Neither negative outcome completes acceptance.

## Close, and the harvest

The agent [completes authorized work only when acceptance, review, and verification
are supported]{claim: Completion needs evidence and independent review}. You can set a different stopping boundary; ordinary completion
does not require another permission merely to advance a stage.

An initiative's [lasting product decisions are retained in .greenline/DECISIONS.md]{claim: The decisions book records lasting choices; House rulings record the owner's instructions}
with source references. The next agent reads them before reopening settled
ground. Engineering choices and root statements live in the same decisions book.

<!-- diagram: compounding-loop -->

## The loop

A review finding, bug, or changed assumption re-enters the work at the affected
point. Current files preserve intent and evidence; Git preserves history.
The execution ledger makes the account inspectable without replacing independent
judgment.
