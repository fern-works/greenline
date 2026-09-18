# ponytail-review: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/dietrichgebert/ponytail at 356918eba965ee1eac64bd3a7f0dd02108350de5, `skills/ponytail-review`. Drift: 33 of 57 lines changed (58%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:2ea900bb6efdc75f` in `SKILL.md`

```diff
-name: ponytail-review
-description: >
-  Code review focused exclusively on over-engineering. Finds what to delete:
-  reinvented standard library, unneeded dependencies, speculative abstractions,
-  dead flexibility. One line per finding: location, what to cut, what replaces
-  it. Use when the user says "review for over-engineering", "what can we
-  delete", "is this over-engineered", "simplify review", or invokes
-  /ponytail-review. Complements correctness-focused review, this one only
-  hunts complexity.
+name: "ponytail-review"
+description: "Code review focused exclusively on over-engineering. Finds what to delete: reinvented standard library, unneeded dependencies, speculative abstractions, dead flexibility. One line per finding: location, what to cut, what replaces it. Use when the user says \"review for over-engineering\", \"what can we delete\", \"is this over-engineered\", \"simplify review\", or invokes ponytail-review. Complements correctness-focused review, this one only hunts complexity."
```

## scope: one opening paragraph in the skill's voice before the method (upstream has no title): the over-engineering pass on a committed range, a ticket's base_commit..result_commit or a named range, fired by the user's review-for-over-engineering phrases; correctness and fidelity are delivery-review's, test-suite cuts and the seams those tests demanded are sweep-tests'; it hunts production-code complexity only, proves nothing and applies nothing, and each accepted cut returns to the ticket that owns the code

Record `fold-2026-09-11`, 1 hunk.

### `h:d83cda420ceac361` in `SKILL.md`

```diff
+This skill is the over-engineering pass on a committed range: a ticket's `base_commit..result_commit`, or a named range. It fires when the user says "review for over-engineering", "what can we delete", "is this over-engineered" or "simplify review". Correctness and fidelity belong to delivery-review; cuts to the test suite and the seams those tests demanded belong to sweep-tests, which proves a deletion by mutation. This skill hunts production-code complexity only, proves nothing and applies nothing: it reports findings, and each accepted cut returns to the ticket that owns the code.
+
```

## location: the Scoring section says where the finding list and the net: line land: .greenline/work/reviews/REV-NNN.md under its ticket, execution account and result range when a durable review exists, otherwise the reply; reporting a cut is not approval to make it

Record `fold-2026-09-11`, 1 hunk.

### `h:ef98b11a195386d1` in `SKILL.md`

```diff
+The finding list and the `net:` line are the review report. When a durable
+review exists for the range, write them into `.greenline/work/reviews/REV-NNN.md`
+under its ticket, execution account and result range; a read-only review
+returns them in the reply. Reporting a cut is not approval to make it.
+
```

## dependency: upstream's 'a normal review pass' is the roster skill that owns correctness, delivery-review, and the Boundaries name sweep-tests as the owner of test-suite cuts and the seams those tests demanded

Record `fold-2026-09-11`, 1 hunk.

### `h:e9722962ef58dd28` in `SKILL.md`

```diff
-and performance are explicitly out of scope. Route them to a normal review
-pass, not this one. A single smoke test or `assert`-based
+and performance are explicitly out of scope. Route them to delivery-review,
+not this one. Test-suite cuts and the seams those tests demanded go to
+sweep-tests. A single smoke test or `assert`-based
```

## lifecycle: the closing Boundaries line says an accepted cut returns to the owning ticket for implementation and fresh proof, and the Handoff section names the consumed range, the produced findings with their home, and implement as the next stage; upstream's 'stop ponytail-review' mode-toggle line stays dropped inside the same hunk, since greenline has no verbose review mode to revert to

Record `fold-2026-09-11`, 1 hunk.

### `h:0179b1f3105dd052` in `SKILL.md`

```diff
-Does not apply the fixes, only lists them.
-"stop ponytail-review" or "normal mode": revert to verbose review style.
+Does not apply the fixes, only lists them: an accepted cut returns to the
+owning ticket for implementation and fresh proof.
+
+## Handoff
+
+Consumes: a committed range, a ticket's base_commit..result_commit or a named range
+Produces: findings, one line each with location, what to cut and what replaces it, and the net: line, in .greenline/work/reviews/REV-NNN.md when a durable review exists, otherwise in the reply
+Next: implement takes each accepted cut back into the owning ticket
```

## Retired

- `h:772256beccc9506a` in `fold-2026-09-11`: the prelude folded into the body at its step: the committed range and the delivery-review and sweep-tests boundaries in the opening paragraph and the Boundaries section
- `h:f71c44f27819f406` in `fold-2026-09-11`: the completion folded into the body at its step: the report home in Scoring, the return of accepted cuts in Boundaries, the Handoff section at the end; the dropped mode-toggle line now measures inside h:0179b1f3105dd052
