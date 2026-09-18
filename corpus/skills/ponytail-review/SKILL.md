---
name: "ponytail-review"
description: "Code review focused exclusively on over-engineering. Finds what to delete: reinvented standard library, unneeded dependencies, speculative abstractions, dead flexibility. One line per finding: location, what to cut, what replaces it. Use when the user says \"review for over-engineering\", \"what can we delete\", \"is this over-engineered\", \"simplify review\", or invokes ponytail-review. Complements correctness-focused review, this one only hunts complexity."
---

This skill is the over-engineering pass on a committed range: a ticket's `base_commit..result_commit`, or a named range. It fires when the user says "review for over-engineering", "what can we delete", "is this over-engineered" or "simplify review". Correctness and fidelity belong to delivery-review; cuts to the test suite and the seams those tests demanded belong to sweep-tests, which proves a deletion by mutation. This skill hunts production-code complexity only, proves nothing and applies nothing: it reports findings, and each accepted cut returns to the ticket that owns the code.

Review diffs for unnecessary complexity. One line per finding: location, what
to cut, what replaces it. The diff's best outcome is getting shorter.

## Format

`L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` for
multi-file diffs.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Examples

❌ "This EmailValidator class might be more complex than necessary, have you
considered whether all these validation rules are needed at this stage?"

✅ `L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✅ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✅ `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✅ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✅ `L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If there is nothing to cut, say `Lean already. Ship.` and stop.

The finding list and the `net:` line are the review report. When a durable
review exists for the range, write them into `.greenline/work/reviews/REV-NNN.md`
under its ticket, execution account and result range; a read-only review
returns them in the reply. Reporting a cut is not approval to make it.

## Boundaries

Scope: over-engineering and complexity only. Correctness bugs, security holes,
and performance are explicitly out of scope. Route them to delivery-review,
not this one. Test-suite cuts and the seams those tests demanded go to
sweep-tests. A single smoke test or `assert`-based
self-check is the ponytail minimum, not bloat, never flag it for deletion.
Does not apply the fixes, only lists them: an accepted cut returns to the
owning ticket for implementation and fresh proof.

## Handoff

Consumes: a committed range, a ticket's base_commit..result_commit or a named range
Produces: findings, one line each with location, what to cut and what replaces it, and the net: line, in .greenline/work/reviews/REV-NNN.md when a durable review exists, otherwise in the reply
Next: implement takes each accepted cut back into the owning ticket
