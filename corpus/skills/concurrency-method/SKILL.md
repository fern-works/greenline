---
name: concurrency-method
description: "Deciding whether code should be concurrent, and reasoning about a concurrent design once it is. Use when adding threading, async, goroutines, workers, or parallelism; when a race or an ordering bug appears; when deciding whether to parallelize; when reviewing a concurrent design."
---

# Concurrency method

Three questions in order: whether concurrency is warranted, how to
reason about the design, and which laws hold whatever the runtime is
called. The last two are wasted on a program that failed the first.

## 1. Decide, and the default is no

The burden of proof rests on the concurrency, never on the serial
version: three languages agree that "this shiny feature" is where the
danger sits (Latour), that many tasks do not need it (Matthews), and
that short work loses to the cost of moving values (Bodner).

**Three properties qualify a workload, all of them:** parts doing I/O
without interacting, a place where results combine, and a deadline
that is a number. For I/O, interleaving pays only where waiting
exceeds processing, and splitting a saturated resource degrades.
Reason in orders of magnitude, and benchmark only where the order is
genuinely unknown. **Decide up front,** since the choice is
architectural and dearest after the second consumer. **Write it
serially first, then benchmark both ways,** with the serial version as
the control: one author's own benchmark refuted his own parallel tool,
cheap arithmetic running longer in parallel (Matthews).

## 2. The instrument: draw the timelines

One author's method (Normand): section 1 has three witnesses, while
sections 2, 3 and 5 have one.

A timeline is a sequence of actions over time, and a diagram draws
several side by side, which makes interference visible. Actions in
order share a timeline; actions that can run at once or out of order
go on separate ones. Calculations are left off, since their results
do not depend on when they run, which keeps the diagram usably small.
Three steps, and their order defends against drawing the diagram you
already believe: identify the actions, draw each on a new timeline
only where it can run in parallel, then simplify by platform
guarantees. Draw before the code, redraw from zero after a change.

**Count the orderings and prune them; do not trace them all.** Two
single-action timelines admit three orderings, two three-box timelines
with one constrained start admit ten, and real systems generate
thousands or millions. Tracing them all is impossible at realistic
sizes, and that is the pivot: correctness comes from a structural
guarantee that deletes orderings, never from green runs that may never
see the interleaving a production week will.

**Only pairs touching the same resource need analysis.** Annotate
every step with the resource it touches, then for each pair that
shares one check all three relative orders: simultaneous, left first,
right first. Decompose before you draw: an increment on a shared value
is a read, a calculation, and a write, and one box hides the race the
pair analysis exists to find. Explicit temporaries make it visible.

**Duration is never synchronisation:** the rare interleaving becomes
common under load.

## 3. The ladder

Ranked: earlier rungs remove the problem, later rungs manage it.

1. **Fewer timelines,** often outside your control.
2. **Shorter timelines,** by converting actions to calculations and
   reading shared values once into explicit parameters.
3. **Fewer shared resources,** preferring a single worker, which cuts
   the orderings you must think about rather than the orderings.
4. **Coordinate the sharing that remains** with a primitive.
5. **Manipulate time as a first-class concept,** since a platform's
   implicit model of ordering and repetition rarely fits.

## 4. The laws that survive translation

**Never block the scheduler, whatever it is called.** Blocking is
holding the scheduler from switching tasks for a long period; I/O
counts, and so does long-running compute. Two remedies and no third:
run it off the scheduler's own workers, or break it up with yield
points. Scheduler throughput is the shared resource nobody names.

**Share by communicating where the language offers it.** "Share
memory by communicating; do not communicate by sharing memory" (the
Go community, via Bodner). Legibility is the argument before safety:
a guarded value never says which worker owns it, while a passed value
shows its flow. Convert passing to guarding only once it has caused a
real performance problem.

**Bound everything unbounded.** Every queue, fan-out, and wait
carries a ceiling that is a number a person chose for a reason they
can say. Where only the latest result matters it may discard stale
entries, correct only where discarded work has no independent
effect.

**Whoever starts a unit of concurrency decides at the launch site how
it stops.** Above leak-hygiene sits the method claim: an unterminated
timeline never closes, so no cut across it, the line splitting
timelines into halves that cannot interleave, holds, and its orderings
never leave the set.

## 5. Primitives, a vocabulary of shapes

A primitive lets timelines share a resource safely, and the mechanism
is always the same one: it removes undesirable orderings from the
set. **Linearize** lets one instance of a timeline run at a time, and
is the name to teach: the queue is the implementation, the guarantee
is the point. **The cut** runs across the ends of several timelines,
splitting each into halves that cannot interleave.

A primitive is an action, deliberately. It holds mutable state,
defended rather than hidden: any timeline may call it and get
predictable behaviour from state closed where nothing outside
reaches it. What is built from calculations is what it coordinates,
rung two. **Use the primitive your language or platform ships,**
since hand-built shapes teach the reasoning, not the library, and are
safe only on the single-threaded platform they were written for.

## Sources

Normand, _Grokking Simplicity_, is the sole witness behind sections 2, 3 and 5.
Other sources: Bodner, _Learning Go_ (3e early release, revisit April 2027);
Latour, _Go Pocket Projects_; Matthews, _Code Like a Pro in Rust_.
The maintainer's graded research records are provenance, not required installed
support files. The complete method above is available here.
