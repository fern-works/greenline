# tdd: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/tdd`. Drift: 21 of 177 lines changed (12%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, series-s7-roster-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:23a92b1fd81ed8c7` in `SKILL.md`

```diff
-name: tdd
-description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
+name: "tdd"
+description: "Test-driven development: load before writing code in any build stage, red before green at the seams the spec already pinned. Also fires on 'red-green-refactor' and integration tests."
```

## scope: one opening paragraph in the skill's voice: applied on the agent's own judgment before code in any build stage at the seams the ticket and spec pinned, also on 'red-green-refactor' and integration tests; seam shape is codebase-design's, review is delivery-review's with findings returning to implementation, suite pruning is sweep-tests' ticket; its use is recorded in the contribution's account; never announced or offered, never re-asks a settled seam

Record `fold-2026-09-11`, 1 hunk.

### `h:51b8ca21e41b6d8f` in `SKILL.md`

```diff
+This discipline applies on your own judgment before writing code in any build stage, red before green at the seams the owning ticket and its spec already pinned; it also fires on "red-green-refactor" and on integration tests. The shape of a seam or interface is codebase-design's; the review of the result is delivery-review's, whose findings return to implementation instead of being fixed in the review context; the pruning of an existing suite is sweep-tests' own ticket. It is applied within the request's scope and its use is recorded in the current contribution's account; it is never announced, never offered, and it never asks the user to confirm a seam the ticket or spec already settled.
+
```

## lifecycle: the owning ticket and the Testing Decisions its consumed spec records are read while exploring so settled seams are inherited; the seam confirmation is satisfied by an accepted ticket or spec or a standing testing grant (for a compact change, the accepted observable behavior and existing public interface), and the user is asked only for a consequential seam choice outside the grant; a test-value or doubles judgment retrieves configured guidance through the request loop with receipts carrying delivery and the account carrying application evidence

Record `fold-2026-09-11`, 2 hunks.

### `h:a814db9e2b3ee223` in `SKILL.md`

```diff
-When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.
+When exploring the codebase, read the owning ticket and any Testing Decisions its consumed spec records, so settled seams are inherited rather than asked again, and read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.
```

### `h:482d310bcc0ce041` in `SKILL.md`

```diff
-See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.
+See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines. For a judgment about test value or doubles in this repository, when guidance is configured, retrieve through the request loop in AGENTS.md with the testing task and concern and the actual language and runner; generated receipts carry the delivery, and the current account carries your application evidence.
```

## method: upstream confirms the seams with the user before any test; greenline lets an accepted ticket or spec, or a standing testing grant, stand as that confirmation and asks only about a consequential unresolved seam, which changes when the method stops to ask Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:21cbf7f97a6a3dea` in `SKILL.md`

```diff
-**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.
+**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them: an accepted ticket or spec, or a standing testing grant, that establishes the public boundary is that confirmation, and for a compact change the accepted observable behavior and the existing public interface establish it. Ask the user only when a consequential seam choice remains outside the grant, not for an ordinary test shape. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.
```

## method: upstream asks the user for the public interface and the seams; greenline establishes them from the accepted ticket or spec and asks only for a consequential unresolved seam, the same method edit as the seam rule above it Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:78dbbf0cd44c94b6` in `SKILL.md`

```diff
-Ask: "What's the public interface, and which seams should we test?"
+Establish the public interface and the seams under test from the accepted ticket or spec; ask "which seams should we test?" only when a consequential seam is unresolved.
```

## harness: upstream's 'call the Skill tool with codebase-design' is the harness's native skill mechanism, or the installed SKILL.md and support files read directly, carried into any delegated brief

Record `fold-2026-09-11`, 1 hunk.

### `h:bd8ef3e30d3b7a37` in `SKILL.md`

```diff
-When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.
+When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), load codebase-design through the harness's native skill mechanism, or read its installed SKILL.md and support files, for the vocabulary; carry the same instruction into any delegated brief. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.
```

## lifecycle: upstream sends refactoring to the review stage; here delivery-review never implements, so a refactor its findings call for returns to implementation as its own change

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:f0a9a674f7999eab` in `SKILL.md`

```diff
-- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
+- **Refactoring is not part of the loop.** It is not part of the red → green implementation cycle; a refactor that delivery-review's findings call for returns to implementation as its own change.
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:ad504e6de32b4d4d` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:556ff1e835538dce` in `fold-2026-09-11`: the prelude folded into the body at its step: the ticket and Testing Decisions in the exploring sentence, the inherited seam confirmation in the pre-agreed-seams rule, the guidance loop beside the support files, the Skill-tool translation in the sentence that named the tool
- `h:cb7f8da881abd812` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:21cbf7f97a6a3dea` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
- `h:78dbbf0cd44c94b6` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
