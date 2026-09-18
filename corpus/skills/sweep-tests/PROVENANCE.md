# sweep-tests: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/freddie-northam/skills at e8417d4e7724558a4f74a5e9e1854b5dc8350bb9, `skills/sweep-tests`. Drift: 73 of 412 lines changed (18%). Records: baseline-copies-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, series-s7-roster-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:56830880f3e13bdb` in `SKILL.md`

```diff
-name: sweep-tests
-description: >-
-  Use when asked to prune, audit, or improve a test suite; when tests break on
-  refactors that change no behavior; when a test file changes in the same commit
-  as its source again and again; when coverage is high but defects still ship;
-  or when production code carries interfaces, mocks, dependency hooks, or
-  exported symbols that only tests use.
+name: "sweep-tests"
+description: "Prune or audit a test suite with mutation proof, as its own announced task on a green suite. Invoke it by name when tests break on refactors that change no behavior, coverage is high but defects still ship, or production code carries seams only tests use."
```

## scope: one opening paragraph in the skill's voice after the title: a standing program, not an initiative stage, fired by name on a green suite in its own dedicated ticket and never inside another ticket's build; a red check goes to diagnosing-bugs and the review of the committed result to delivery-review; it deletes nothing unproved by mutation, adds no test and never certifies its own review

Record `fold-2026-09-11`, 1 hunk.

### `h:283a5d1bf815376e` in `SKILL.md`

```diff
+This skill is a standing program, not an initiative stage. It fires by name, when tests break on refactors that change no behavior, when coverage is high but defects still ship, or when production code carries seams only tests use, and it runs on a green suite in its own dedicated ticket, never inside another ticket's build. A red check goes to diagnosing-bugs; the review of the sweep's committed result is delivery-review's. It deletes nothing it has not proved by mutation, adds no test, and never certifies its own review.
+
```

## method: the gate's 'repair the source' names its owner, diagnosing-bugs, and the sweep restarts from the top once the suite is green, a step upstream lacks; upstream's rule that no test is touched until then stands Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:af596ca674aab292` in `SKILL.md`

```diff
-repair the source. You may not touch a test at all until the suite is green
-again.
+repair the source through diagnosing-bugs, and restart the sweep from the top
+once the suite is green again. You may not touch a test at all until the suite
+is green again.
```

## lifecycle: upstream's 'separate task' is a dedicated ticket in .greenline/work/tickets/, and 'another task' is another ticket's build

Record `fold-2026-09-11`, 1 hunk.

### `h:630dc685187377a1` in `SKILL.md`

```diff
-This skill is a separate task. Announce it. Never run it inside another task.
+This skill is a separate task with its own ticket in `.greenline/work/tickets/`.
+Announce it. Never run it inside another ticket's build.
```

## harness: the <skill-dir> in upstream's command is this skill's installed directory, found by the glob **/sweep-tests/bin/mutate.mjs under the installed skills rather than by assuming a harness; the command itself is unchanged

Record `fold-2026-09-11`, 1 hunk.

### `h:8ee877a5de3a1b83` in `SKILL.md`

```diff
-Only when the repository has none, use the tool that ships here:
+Only when the repository has none, use the tool that ships here, `bin/mutate.mjs`
+in this skill's installed directory. Find it with the glob
+`**/sweep-tests/bin/mutate.mjs` under the installed skills rather than assuming
+a harness:
```

## method: the bundled mutate.mjs masks strings and comments but its raw-text ternary operator can swap a quoted ternary inside a comment, so a survivor is judged only after the measurement is validated, and a survivor on an error path is the highest-value finding and is never pruned on coverage alone: two criteria upstream does not state Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:dbf66a9cae72b6db` in `SKILL.md`

```diff
+Validate the measurement before judging a survivor. The bundled tool masks
+strings and comments for its comparison and numeric operators, but its raw-text
+ternary operator can still swap a quoted ternary example inside a comment, and
+its "defect your suite ships" line is a candidate, not a diagnosis. A mutation
+that changes no executable behavior, or whose validity is unresolved, is an
+invalid measurement, not a shipped defect: the run proves no deletion, so keep
+the tests and seams, record the invalid measurement with the sweep's evidence,
+and use an already available capable runner only within the authorized scope.
+Never add a test for a comment, and never drop a baseline mutant to make the
+score pass.
+
+A survivor inside error-handling code is the sweep's highest-value finding.
+Code that has not run does not work, and error handlers run rarest of all: a
+study of production failures in distributed data-intensive systems (Yuan et
+al., OSDI 2014) found 92% of catastrophic failures came from incorrect handling
+of non-fatal errors the software explicitly signaled. A test that exercises an
+error path is never pruned as redundant on coverage grounds alone; weigh its
+deletion against what its mutants proved.
+
```

## location: the before-report and the after-report go to different paths under the sweep ticket's evidence home, .greenline/work/evidence/TKT-NNN/

Record `fold-2026-09-11`, 1 hunk.

### `h:3e9fd6bf24bb72de` in `SKILL.md`

```diff
-Write the before-report and the after-report to different paths. A runner that
-overwrites its own baseline leaves you unable to find the mutant you lost.
+Write the before-report and the after-report to different paths under the
+sweep ticket's evidence home, `.greenline/work/evidence/TKT-NNN/`. A runner
+that overwrites its own baseline leaves you unable to find the mutant you lost.
```

## correction: upstream's 'the report names one killer for each mutant' holds only for a runner that reports per-test identities; the bundled mutate.mjs reports suite-level killed and survived outcomes and names no killer, so that attribution is never invented and its absence is not evidence that a test is redundant; the rest of the paragraph (run order, not ownership; shortlist, never proof; the rerun is the proof) is upstream's

Record `fold-2026-09-11`, 1 hunk.

### `h:dc4604af7905e17c` in `SKILL.md`

```diff
-**The report names one killer for each mutant: the first test that reached it.**
-That is run order, not ownership. A test credited with no kills can still be the
-only real net under a mutant that another test happens to reach first. Use the
-report to shortlist candidates. Never use it as proof. The rerun is the proof.
+**A runner that reports per-test identities names one killer for each mutant:
+the first test that reached it.** That is run order, not ownership. The bundled
+`mutate.mjs` reports suite-level killed and survived outcomes and names no
+killer; do not invent that attribution, and its silence is not evidence that a
+test is redundant. A test credited with no kills can still be the only real net
+under a mutant that another test happens to reach first. Use the report to
+shortlist candidates. Never use it as proof. The rerun is the proof.
```

## lifecycle: the sweep's evidence and its review: the Report section says the baselines, survivors and kills, both reports, the table and the resulting checks stay with the sweep's ticket under its evidence home, acceptance is judged against those measurements since an aggregate score cannot prove each baseline mutant remains killed, and the committed result goes to delivery-review like any implementation with the sweeper never writing its own review record; the Handoff section names the green suite and the sweep's own ticket consumed, the reports and table produced under .greenline/work/evidence/TKT-NNN/ with the ticket implementing then implemented, and delivery-review next

Record `fold-2026-09-11`, 2 hunks.

### `h:e2ce9abebae93dc6` in `SKILL.md`

```diff
+The baselines, the identified survivors and kills, both reports, the table and
+the resulting checks stay with the sweep's ticket under its evidence home, and
+acceptance is judged against those measurements: an aggregate score alone
+cannot prove that each baseline mutant remains killed. The sweep is
+implementation work. Commit its result under the ticket and hand it to
+delivery-review like any implementation; the sweeper never writes its own
+review record.
+
```

### `h:34dbb8ea06080716` in `SKILL.md`

```diff
+
+## Handoff
+
+Consumes: a green suite and the sweep's own ticket at ready
+Produces: the before and after mutation reports at different paths, the deletion and seam table, and the baselines and kills, under .greenline/work/evidence/TKT-NNN/; the ticket at implementing then implemented with its committed result
+Next: delivery-review reviews the sweep's ticket like any implementation
```

## Retired

- `h:20948fda3bad55bb` in `fold-2026-09-11`: the prelude folded into the body at its step: the dedicated ticket and diagnosing-bugs in the gate, the installed mutate.mjs at the command, the measurement validation and the error-path priority after the survivor sentence, the first-killer limit in its own paragraph
- `h:8f68cd642a12e8da` in `fold-2026-09-11`: the completion folded into the body at its step: the evidence home and the delivery-review handoff in the Report section and the Handoff section
- `h:dbf66a9cae72b6db` in `fold-walk-2026-09-11`: re-kinded from correction to method
- `h:af596ca674aab292` in `fold-walk-2026-09-11`: re-kinded from dependency to method
- `h:dbf66a9cae72b6db` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
- `h:af596ca674aab292` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
