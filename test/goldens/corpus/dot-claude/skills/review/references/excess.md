# The excess lens

The Standards reviewer runs this lens on the change's commits: what the change could lose. Asked for by name, "review for over-engineering", "what can we delete" or "is this over-engineered", the review runs it alone. Correctness and fidelity are the two axes'; cuts to the test suite, and the seams those tests demanded, are sweep-tests', which proves a deletion by mutation. The lens proves nothing and applies nothing: it reports cuts, and the builder judges each one. A documented repository standard overrides this lens as it overrides the smell baseline: where the standard asks for what the lens would cut, such as a doc comment on an internal function, the lens keeps it.

Review diffs for unnecessary complexity. One line per finding: location, what
to cut, what replaces it. The diff's best outcome is getting shorter.

## Format

`<N>. L<line>: <tag> <what>. <replacement>.`, or `<N>. <file>:L<line>: ...` for
multi-file diffs. Number findings `1.`, `2.`, ... across the whole report, so the
user can say "fix 2 and 5".

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `reuse:` equivalent helper, util, or pattern already in this repo. Name the path.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Hunt

Deps the stdlib or platform already ships, single-implementation interfaces,
factories with one product, wrappers that only delegate, files exporting one
thing, dead flags and config, hand-rolled stdlib, helpers duplicating an
equivalent that already lives in this repo.
Before emitting `delete:`, grep the whole tree for the symbol, including tests,
fixtures and string or dynamic references.

List the cuts biggest first.

## Examples

❌ "This EmailValidator class might be more complex than necessary, have you
considered whether all these validation rules are needed at this stage?"

✅ `1. L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✅ `2. L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✅ `3. L18-29: reuse: slugify helper duplicates src/lib/slug.ts slugify. Delete it, import the existing one.`

✅ `4. repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✅ `5. L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✅ `6. L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Boundaries

Scope: over-engineering and complexity only. Correctness bugs, security holes,
and performance are explicitly out of scope. A single smoke test or `assert`-based
self-check is the ponytail minimum, not bloat, never flag it for deletion.
Does not apply the fixes, only lists them.

## Comments

A comment the change adds or keeps is a cut, tagged `delete:`, unless one of these exceptions keeps it:

- Legal or license headers.
- Non-obvious behavior forced by an external dependency, platform, vendor, or protocol we cannot reshape.
- `// prettier-ignore`. Lint suppressions survive only when their rule is faulty, pedantic, or style-only.
- Doc comments that define a public API contract.
- Issue or RFC links that explain a constraint code cannot express.

When it is not clear that an exception applies, the comment is a cut. A surprise in the repository's own code is no exception: report it, and flag its exact symbol `MUST KILL` for the rename, extraction, type or redesign that makes the behavior obvious without prose. A suppression such as `eslint-disable`, `@ts-ignore` or `@ts-expect-error` is read against its rule: where the rule catches real bugs or protects correctness or safety, the suppression is a cut and the symbol it guards is flagged `MUST KILL`. `IMPORTANT`, `do not remove`, `too risky`, `fine for now` and a long justification are scent, not conviction: read the nearby code before judging, and keep the comment only for an exception proven true today on a live path. Report only: each cut and each flag is a line of the lens's list, and nothing is deleted here. A `MUST KILL` flag is rung 3, advisory, unless it cites the rule it enforces ([brief.md](brief.md), "Severity").
