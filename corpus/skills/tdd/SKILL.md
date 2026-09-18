---
name: "tdd"
description: "Test-driven development: load before writing code in any build stage, red before green at the seams the spec already pinned. Also fires on 'red-green-refactor' and integration tests."
---

# Test-Driven Development

This discipline applies on your own judgment before writing code in any build stage, red before green at the seams the owning ticket and its spec already pinned; it also fires on "red-green-refactor" and on integration tests. The shape of a seam or interface is codebase-design's; the review of the result is delivery-review's, whose findings return to implementation instead of being fixed in the review context; the pruning of an existing suite is sweep-tests' own ticket. It is applied within the request's scope and its use is recorded in the current contribution's account; it is never announced, never offered, and it never asks the user to confirm a seam the ticket or spec already settled.

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read the owning ticket and any Testing Decisions its consumed spec records, so settled seams are inherited rather than asked again, and read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines. For a judgment about test value or doubles in this repository, when guidance is configured, retrieve through the request loop in AGENTS.md with the testing task and concern and the actual language and runner; generated receipts carry the delivery, and the current account carries your application evidence.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them: an accepted ticket or spec, or a standing testing grant, that establishes the public boundary is that confirmation, and for a compact change the accepted observable behavior and the existing public interface establish it. Ask the user only when a consequential seam choice remains outside the grant, not for an ordinary test shape. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Establish the public interface and the seams under test from the accepted ticket or spec; ask "which seams should we test?" only when a consequential seam is unresolved.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), load codebase-design through the harness's native skill mechanism, or read its installed SKILL.md and support files, for the vocabulary; carry the same instruction into any delegated brief. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It is not part of the red → green implementation cycle; a refactor that delivery-review's findings call for returns to implementation as its own change.
