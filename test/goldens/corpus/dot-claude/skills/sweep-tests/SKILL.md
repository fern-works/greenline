---
name: "sweep-tests"
description: "Prune or audit a test suite with mutation proof, as its own announced task on a green suite. Invoke it by name when tests break on refactors that change no behavior, coverage is high but defects still ship, or production code carries seams only tests use."
---

# Test value sweep

This skill is a standing program, not an initiative stage. It fires by name, when tests break on refactors that change no behavior, when coverage is high but defects still ship, or when production code carries seams only tests use, and it runs on a green suite in its own dedicated ticket, never inside another ticket's build. A red check goes to diagnosing-bugs; the review of the sweep's committed result is delivery-review's. It deletes nothing it has not proved by mutation, adds no test, and never certifies its own review.

A test must justify its presence. A test that changes when the implementation
changes, while the behavior stays the same, asserts implementation. Delete it.

Then simplify the source. Seams in production code often exist only because
those tests demanded them. When the test goes, the seam goes with it.

## The gate

**Run this only when the suite is green.**

A red check makes test deletion fraud, not maintenance. When a check is red,
repair the source through diagnosing-bugs, and restart the sweep from the top
once the suite is green again. You may not touch a test at all until the suite
is green again.

This skill is a separate task with its own ticket in `.greenline/work/tickets/`.
Announce it. Never run it inside another ticket's build.

## Prove each deletion

You may not read a test and then declare it worthless. That judgment certifies
itself, and it always says yes. Run the mutation check instead.

**If the repository already has a mutation runner, use it.** Look for Stryker,
mutmut, go-mutesting, PIT, or a `test:mutation` script. Its configuration holds
knowledge this skill does not have, such as which files repay the run and which
generate thousands of worthless mutants.

**The mutation scope must cover the subject file of every test you delete in the
batch.** A test whose subject sits outside the scope is never proved, however
green the score looks. Widen the scope, or split the batch.

Only when the repository has none, use the tool that ships here, `bin/mutate.mjs`
in this skill's installed directory. Find it with the glob
`**/sweep-tests/bin/mutate.mjs` under the installed skills rather than assuming
a harness:

```bash
node <skill-dir>/bin/mutate.mjs --file src/thing.js --fn theFunction
```

Either tool breaks the source on purpose, one change at a time, and runs the
suite after each change. A mutant that survives is a behavior that no test
covers.

Validate the measurement before judging a survivor. The bundled tool masks
strings and comments for its comparison and numeric operators, but its raw-text
ternary operator can still swap a quoted ternary example inside a comment, and
its "defect your suite ships" line is a candidate, not a diagnosis. A mutation
that changes no executable behavior, or whose validity is unresolved, is an
invalid measurement, not a shipped defect: the run proves no deletion, so keep
the tests and seams, record the invalid measurement with the sweep's evidence,
and use an already available capable runner only within the authorized scope.
Never add a test for a comment, and never drop a baseline mutant to make the
score pass.

A survivor inside error-handling code is the sweep's highest-value finding.
Code that has not run does not work, and error handlers run rarest of all: a
study of production failures in distributed data-intensive systems (Yuan et
al., OSDI 2014) found 92% of catastrophic failures came from incorrect handling
of non-fatal errors the software explicitly signaled. A test that exercises an
error path is never pruned as redundant on coverage grounds alone; weigh its
deletion against what its mutants proved.

**Take the report before you delete anything. Take it again at the end.**

Compare mutants by identity, not by number. Three failures hide behind an
unchanged total:

1. **A trade.** Two mutants swap status and the total holds.
2. **A disappearance.** You removed the source a mutant lived in, so the mutant
   is gone. Nothing moved from killed to survived, and the behaviour is now
   untested. This is the one that catches seam removal.
3. **A scope change.** The second run covered fewer files than the first.

So: record every baseline mutant identifier before you start, with the source
hash and the exact test command. At the end, **every baseline mutant must still
exist and must still be killed.** A missing mutant fails the sweep exactly as a
survived one does.

The suite stays green throughout, so green proves nothing here.

The score is not proof either. It shows that the mutants this runner generated,
under this operator set, over this file set, kept their status. Behaviour no
operator reaches is invisible to it, and a dynamic caller found only through a
configuration string or a plugin registry is invisible to your grep. **A sweep
without a score has proved nothing. A sweep with one has proved something
narrow.** Say which.

Write the before-report and the after-report to different paths under the
sweep ticket's evidence home, `.greenline/work/evidence/TKT-NNN/`. A runner
that overwrites its own baseline leaves you unable to find the mutant you lost.

**A runner that reports per-test identities names one killer for each mutant:
the first test that reached it.** That is run order, not ownership. The bundled
`mutate.mjs` reports suite-level killed and survived outcomes and names no
killer; do not invent that attribution, and its silence is not evidence that a
test is redundant. A test credited with no kills can still be the only real net
under a mutant that another test happens to reach first. Use the report to
shortlist candidates. Never use it as proof. The rerun is the proof.

### Delete in batches

Time one scoped run before you plan the sweep. The cost ranges from seconds to
many minutes, so whether one run for each candidate is affordable depends on the
repository. When it is not, delete a batch and run once.

- The score holds. The whole batch stands.
- The score falls. One test in the batch was the only killer of a mutant.
  Restore the batch, halve it, and run again. Repeat until you find the test
  that matters, then keep it and delete the rest.

A batch proof is weaker than a proof for each test. It shows that no deletion
was the unique killer of a mutant. That is enough, and it is affordable.

## Delete

- Tests that assert that a call happened, when the call is not the contract
- Tests whose assertions restate the source line above them
- Snapshot tests that you regenerate instead of read
- Tests that exercise only a mock
- Repeated coverage of one behavior across many cases
- Tests for a private function that a public function already reaches

## Keep

- The only test that covers a behavior, however ugly it is
- Call assertions on a unit whose whole job is to drive other units. There the
  call and its arguments are the result, and the mutation score will show it
- Regression tests that name a defect or an issue
- Contract tests at a boundary that you do not own
- Property tests and fuzz tests

## Remove the seams

A deleted test may have been the only caller of a seam. Grep for each one.

- An interface with one implementation
- A constructor parameter that only a test supplies
- An exported symbol that only tests import
- A mock or fake, and the hook it plugs into
- A flag that only a test reads

Delete the seam, or inline it. Follow each simplification to its end. When you
remove a seam and a wrapper becomes a pass-through, remove the wrapper too.

**A seam can have one caller, and that caller can be a test in another file.
Leave that seam alone.** Report it as a candidate for a later sweep. A sweep that
reaches past its own scope breaks files that nobody asked you to touch.

**A grep does not find every caller.** Dependency injection tokens, plugin
registries, configuration strings and generated registrations all reference a
symbol without naming it in a way `rg` matches. Removing such a seam keeps every
unit test green, removes the mutants that lived in it, and fails in production.
When a symbol is exported across a package boundary, treat the grep as
inconclusive and leave it.

## Report

Close with the two scores and one table.

```
Tests: 26 -> 9 (-65%)   Mutation score: 16/18 -> 16/18 (no change)
```

The table lists each test you deleted and each seam you removed. Prose is not
the report.

The baselines, the identified survivors and kills, both reports, the table and
the resulting checks stay with the sweep's ticket under its evidence home, and
acceptance is judged against those measurements: an aggregate score alone
cannot prove that each baseline mutant remains killed. The sweep is
implementation work. Commit its result under the ticket and hand it to
delivery-review like any implementation; the sweeper never writes its own
review record.

## Don't

- Delete a test to turn a red check green
- Delete a test that you did not prove by mutation
- Rewrite a test and count that as a sweep
- Add a test in this pass
- Change anything outside the test suite and its seams

## It's working if

- Every deletion has a mutation report before it and one after it.
- Both reports name the same mutants, not just the same total.
- The close is two scores and a table. Prose is not the report.
- Seams disappear in the same pass as the tests that demanded them.
- A sweep that cannot prove a deletion says so, and keeps the test.
- You deleted nothing while a check showed red.

## Handoff

Consumes: a green suite and the sweep's own ticket at ready
Produces: the before and after mutation reports at different paths, the deletion and seam table, and the baselines and kills, under .greenline/work/evidence/TKT-NNN/; the ticket at implementing then implemented with its committed result
Next: delivery-review reviews the sweep's ticket like any implementation
