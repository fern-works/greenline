---
name: "anticipate"
description: "Attack a change's plan before the build: state each claim the build would rest on, hand the artifact and its contract to a fresh reading that tries to disprove it, reconcile every finding against the text and stop where the depth ends, at the depth the change's mode gives the step anticipate, the careful mode's premise review. Use when the mode reaches anticipate, or when the owner asks to stress-test a plan for hidden failure modes."
---

# Anticipate

Anticipate attacks a change's plan before the build: it states the claims the build would rest on and has a fresh reading try to disprove each one, so a hidden failure mode is found while changing course is still cheap. It runs where the change's mode reaches the anticipate step, at the depth the mode gives it, and alone when the owner asks to stress-test a plan. Asked for by name with no change open, it runs at the written depth, its result stays in the reply, and it writes no file. It reads the change record's frame and plan sections first. It changes the plan only where a finding requires it and records each change in its section; a finding that would reopen a choice the owner made goes back to the owner. It never builds: the build step takes the plan as anticipate leaves it.

## The reach of the cycle

Run the cycle below on each non-trivial claim the plan makes, or, where one claim alone can be attacked, on the claim that would cost most if it were wrong. Where Step 4 says to re-classify or to re-loop and no fresh reading can be had, run one more self-questioning pass on that claim; a finding still open after it is recorded as open.

## The claims worth attacking

A confident answer is not a correct one. Long sessions accumulate context that quietly turns assumptions into "facts" without anyone noticing.

A decision is **non-trivial** when at least one of these is true:

- It introduces or modifies branching logic
- It crosses a module or service boundary
- It asserts a property the type system or compiler cannot verify (thread safety, idempotence, ordering, invariants)
- Its correctness depends on context the future reader cannot see
- Its blast radius is irreversible (production deploy, data migration, public API change)

If you doubt every keystroke, you ship nothing. The skill applies only to non-trivial decisions as defined above.

## The Process

In the steps below the user is the owner of the request, and the orchestrator is the agent running the step.

### Step 1: CLAIM — Surface what stands

Name the decision in two or three lines:

```
CLAIM: "The new caching layer is thread-safe under the
        read-heavy workload described in the spec."
WHY THIS MATTERS: a race here corrupts user data and is
                  hard to detect in QA.
```

If you can't write the claim that compactly, you have a vibe, not a decision. Surface it before scrutinizing it.

### Step 2: EXTRACT — Smallest reviewable unit

A fresh-context reviewer needs the **artifact** and the **contract**, not the journey.

- Code: the diff or the function — not the whole file
- Decision: the proposal in 3–5 sentences plus the constraints it has to satisfy
- Assertion: the claim plus the evidence that supposedly supports it (kept distinct from the Step 1 CLAIM block, which is the orchestrator's hypothesis under scrutiny)

Strip your reasoning. If you hand over conclusions, you'll get back validation of your conclusions. The unit must be small enough that a reviewer can hold it in mind in one read — if it's a 500-line PR, decompose first.

### Step 3: DOUBT — Invoke the fresh-context reviewer

The reviewer's prompt **must be adversarial**. Framing decides the answer.

```
Adversarial review. Find what is wrong with this artifact.
Assume the author is overconfident. Look for:
- Unstated assumptions
- Edge cases not handled
- Hidden coupling or shared state
- Ways the contract could be violated
- Existing conventions this might break
- Failure modes under unexpected input

Do NOT validate. Do NOT summarize. Find issues, or state
explicitly that you cannot find any after thorough examination.

ARTIFACT: <paste artifact>
CONTRACT: <paste contract>
```

**Pass ARTIFACT + CONTRACT only. Do NOT pass the CLAIM.** Handing the reviewer your conclusion biases it toward agreement. The reviewer must independently determine whether the artifact satisfies the contract.

Where the step's depth spends a fresh agent, that agent is the fresh reading: it gets ARTIFACT and CONTRACT and never the CLAIM, starts no agent of its own, and returns a report of the claims it tried, those that held, those that broke and its limits; the step waits for the report, and no other agent runs beside it. Step 4 reconciles what broke.

Where no fresh agent can be started, the fresh reading is the self-questioning form: rewrite ARTIFACT + CONTRACT as a fresh self-prompt with a hard mental separator from your prior reasoning, and run the adversarial prompt against it yourself. This is not a fresh-context review, since you carry your own context with you, so its result is recorded as degraded.

### Step 4: RECONCILE — Fold findings back

The reviewer's output is data, not verdict. **You are still the orchestrator.** Re-read the artifact text against each finding before classifying — rubber-stamping the reviewer is the same failure mode as ignoring it.

For each finding, classify in this **precedence order** (first matching class wins):

1. **Contract misread** — reviewer flagged something specifically because the CONTRACT you provided was unclear or incomplete. Fix the contract first, re-classify on the next cycle.
2. **Valid + actionable** — real issue requiring a change to the artifact. Change it, re-loop.
3. **Valid trade-off** — issue is real but cost of fixing exceeds cost of accepting. Document the trade-off explicitly so the user sees it.
4. **Noise** — reviewer flagged something that's actually correct under context the reviewer didn't have. Note it, move on, and ask: would adding that context to the contract have prevented the false flag?

A fresh reviewer can be wrong because it lacks context. Don't defer just because it's "fresh."

### Step 5: STOP — Bounded loop, not recursion

Stop when:

- Next iteration returns only trivial or already-considered findings, **or**
- The mode's rounds are spent (escalate to user, don't grind another alone), **or**
- User explicitly says "ship it"

If after the last round the reviewer still surfaces substantive issues, the artifact may not be ready. Surface this to the user — unresolved rounds are information about the artifact, not a reason to keep looping.

If the mode's rounds are "obviously insufficient" because the artifact is large: the artifact is too big — return to Step 2 and decompose. Do not lift the bound.

## Red Flags

- Re-spawning fresh-context on an unchanged artifact (you'll get the same findings; you're stalling)
- **Doubt theater (checkable signal)**: across 2 or more cycles where the reviewer surfaced substantive findings, zero findings were classified as actionable. You are validating, not doubting. Stop and escalate.

## Handoff

Consumes: the change record's frame and plan sections in .greenline/ledger/<id>.md, and when the work splits the plan directory's spec.md and tickets.md
Produces: the anticipate section of .greenline/ledger/<id>.md, the one line none at the modes that skip it, and otherwise the claims attacked and the findings reconciled, citing the agent's report .greenline/ledger/<id>/anticipate-1.md at the independent depth; any change the findings made to the plan, recorded in that section; the reply alone when asked for by name with no change open
Next: the next step of the change's mode
