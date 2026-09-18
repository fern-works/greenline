# Progress Check methodology

**Version:** 1.0.1 — 2026-08-25

## 0. Core thesis

Progress updates are decision signals, not proof that an agent is busy. A good
update helps the user understand what became true, what remains uncertain, and
whether intervention is needed. Reassurance without changed evidence is noise.

## 1. When progress reporting applies

Use this method when work is expected to exceed 15 minutes, spans multiple
milestones, coordinates multiple agents, or has meaningful blockers between
start and completion. Skip it for short answers, one-command changes, or work
whose only honest states are started and finished.

## 2. Establish the denominator

Before showing a percentage, identify 3–7 observable milestones. A milestone
is complete only when its evidence exists: a passing check, committed artifact,
accepted review, accessible deployment, or another task-specific gate.

Weight milestones by expected work and risk. Do not divide them equally when
one milestone clearly dominates the task. Never derive progress from elapsed
time, tool-call count, token use, or confidence.

Rebaseline only when scope materially changes. State the scope change in the
same update; do not silently move the percentage backward or inflate it.

## 3. Cadence

Send one baseline update after the scope and denominator are understood.

Routine updates require both:

1. Turns of work since the previous routine update, or a status transition of
   the owning ticket; never an estimate of elapsed time.
2. A completed milestone, at least 10 percentage points of verified progress,
   or a materially different next action.

New actionable blockers and final completion bypass the turn gate. Waiting,
unchanged checks, agent polling, and repeated test runs do not.

## 4. Format

Each update contains no more than three concise items:

1. What completed, with concrete evidence.
2. What is active now.
3. The next step or blocker.

End with one 20-cell overall bar styled as inline code on its own line:

`Performance rollout  [██████████████████░░] 90%`

Use one pair of backticks for inline-code styling. Do not indent the line by
four spaces and do not use a fenced code block. Those forms create a separate
code block that interfaces may label or make copyable.

Use `█` for completed cells and `░` for remaining cells. Each cell represents
5%. Round down to avoid overstating progress. Use 100% only when every required
gate is complete.

Replace the label with a short task-specific label. Keep one overall bar even
when the work has batches or subagents. Subtask bars appear only when the user
asks for them. In coordinated work, the root agent owns the bar.

The progress line is the final content. End immediately after it; do not add a
note, recap, disclaimer, or closer beneath it.

## 5. Installation and persistence

The greenline CLI installs this skill; there is no global installation step
here and no machine-global instruction write. A reporting preference the user
states is followed within the current task and saved nowhere. When the
owner asks for a lasting repository rule, record it as a house ruling in
the repository's user-owned instruction home, in the format
`.greenline/WORK.md` defines; the next context reads it without a second
confirmation.

## 6. Anti-patterns

| Pattern | Failure | Correction |
|---|---|---|
| Activity percentage | Measures motion, not completion | Tie each increase to evidence |
| Update spam | Hides meaningful changes | Apply both cadence gates |
| Frozen repeated bar | Pretends to inform | Stay silent until state changes |
| Batch bar collection | Makes the user aggregate status | Show one overall bar |
| Optimistic rounding | Overstates readiness | Round down to 5% |
| Instant 90% | Leaves the risky tail invisible | Weight validation and delivery gates |
| Silent rebaseline | Breaks trust in the denominator | Name the scope change |

## 7. Readiness rubric

No readiness score is kept here. Report observable milestone evidence and its
limits under the execution contract: the owning ticket's acceptance items and
the witnesses recorded in its account. Global persistence is not a criterion,
since the greenline CLI installs this skill.

## 8. Open gaps

- Revisit the turn-and-status cadence and the 10-point default only after real
  usage shows that they are too sparse or still noisy.
