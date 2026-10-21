---
name: "tdd"
description: "Test-first development at any step: discover the repository's own test commands, name the break a test catches, watch it fail for the intended reason, make it pass with the smallest change, and add a new test only where it catches a realistic failure the existing ones would miss. Use when writing or changing a test, building a feature or fixing a bug test-first, or deciding whether a change needs a new test; also on 'red-green-refactor' and integration tests."
---

# Test-Driven Development

tdd is the habit for the moment a test is written or changed, a change's need for a new test is weighed, or code is built or a bug fixed test-first, at whatever step the work is in, most often build. It writes no record of its own: the tests and the checks it leaves belong to the step that runs, and that step's section names them. Whether a change gains a new test is judged on its cost, below; a behavior change with no check that could fail is a floor in AGENTS.md, so leave one wherever you can: an existing test that fails if the change breaks, a new test, or the closest executable check. The shape of a seam is deep-modules', a bug whose cause is not yet known is diagnose's first, and removing a test is sweep-tests', with its mutation proof: this habit never deletes a test.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## Discover the Stack First

The TDD cycle is universal; the commands are not. Before writing the first test, discover how *this* repository tests, and use its commands for every RED, GREEN, and verification step:

- **Language and build system** — `package.json`, `pom.xml`/`build.gradle`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, a `Makefile`
- **Checked-in wrappers** — prefer `./gradlew`, `./mvnw`, `make test`, or a repo script over globally installed tools
- **Test framework and configuration** — and how it runs a single focused test vs the full suite
- **Existing conventions** — where tests live, how files are named, what patterns neighboring tests follow
- **Documented commands** — README, CONTRIBUTING, and CI workflows show the commands that actually gate merges

Never assume a default like `npm test` — a Gradle, Cargo, or pytest project has its own equivalent.

Record the focused command's runs during the loop as checks, each red, each green and each rerun made only to read why a test failed; wider runs are the build step's increment check and the verify step's, at the depth the change's mode gives it.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines. tests.md also holds the checks a test passes before it is kept: the break it names, the undefined check, assertions on the real component rather than its double, and the mutation check.

## When a new test earns its place

Before adding a test, name the realistic failure it would catch and why the tests already there, or a simpler check, would miss it; with no answer, add none. Extend an existing test before writing a new one, and cover the behavior with the smallest set of cases that does. A test is never added to raise a coverage figure or a test count, or to make the work look finished. Zero new tests is a valid outcome only where an existing test already fails if this change breaks, so the change still leaves a check that could fail. Copy, styling, documentation, configuration and plain wiring are normally checked by inspection, the type checker, the build or a direct run, unless a concrete risk calls for a test.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them: the change record's frame or plan section, a ticket's acceptance, or a standing testing grant that establishes the public boundary is that confirmation, and for a small settled change the accepted observable behavior and the existing public interface establish it. Ask the owner only when a consequential seam choice remains open, not for an ordinary test shape. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Establish the public interface and the seams under test from that section or acceptance; ask "which seams should we test?" only when a consequential seam is unresolved.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), load deep-modules through the harness's skill mechanism, or read its installed SKILL.md, for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review step, not the red → green implementation cycle.

### Verify RED - Watch It Fail

**MANDATORY. Never skip.**

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**Test passes?** You're testing existing behavior. Fix test.

**Test errors?** Fix error, re-run until it fails correctly.

### Verify GREEN - Watch It Pass

**MANDATORY.**

Confirm:
- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

**Test fails?** Fix code, not test.

**Other tests fail?** Fix now.

"Other tests" are the tests the change affects, run with the repository's focused command; wider runs are the build step's increment check and the verify step's, at the depth the change's mode gives it. Any failure that run shows —
including one you didn't cause — goes in your report by name; a red
test you watched scroll past and didn't mention is a report falsified
by omission.

## A bug fix

Fixing a bug whose cause is known, read [bug-fix.md](bug-fix.md) before the failing test: when a regression test is worth writing, where it goes, what stands in when it is impractical, and what the fix's report names.
