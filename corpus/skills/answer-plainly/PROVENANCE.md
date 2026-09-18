# answer-plainly: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/freddie-northam/skills at e8417d4e7724558a4f74a5e9e1854b5dc8350bb9, `skills/answer-plainly`. Drift: 27 of 45 lines changed (60%). Records: baseline-copies-2026-09-11, fold-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:f91754003133f3da` in `SKILL.md`

```diff
-name: answer-plainly
-description: >-
-  Use when the user asks a direct question about a codebase, a result, a status,
-  or a risk; when reporting what you did; and whenever you are about to write
-  "significantly", "much faster", "should work", "generally", or "nearly all".
+name: "answer-plainly"
+description: "Use when the user asks a direct question about a codebase, a result, a status, or a risk; when reporting what you did; and whenever you are about to write \"significantly\", \"much faster\", \"should work\", \"generally\", or \"nearly all\"."
```

## scope: The opening paragraph says the discipline governs replies, reports and review findings on the agent's own judgment and is never announced, that a measured number enters an artifact with its claim, that the process is not the answer, that show-me decides the form after the answer, that dense wording goes through unslop, and that a contradicted answer is re-measured through verify-this and never repeated unchanged; the body's four-answer rule is scoped in its own sentence to yes/no, quantity and unknown-result questions, a known name, path, definition or explanation being answered directly with its evidence, so the rule stops forcing a yes/no prefix or invented uncertainty onto factual answers (a QA finding behind the baseline prelude).

Record `fold-2026-09-11`, 2 hunks.

### `h:dafa217418a63083` in `SKILL.md`

```diff
-A question has four permitted answers.
+This discipline governs replies, reports and review findings on your own
+judgment, never announced; where a claim enters an artifact, the measured
+number goes in with it. The four-answer rule below covers yes/no, quantity and
+unknown-result questions. A known name, path, definition or explanation is
+answered with that answer itself and the repository evidence behind it, with
+no yes/no prefix and no invented uncertainty; a number stays required for a
+quantitative claim, not for every fact. The process is not the answer: report
+what is true, not the tools you are about to run, unless the user asked how
+you work. Answer first, then the view: show-me decides what form the answer
+takes, after the answer. Dense wording goes through unslop. When the user
+contradicts an answer you already gave, the reply is a fresh measurement,
+never the same sentence again: re-run the check through verify-this, quote
+the new verdict, and either name the benign difference that explains their
+result or correct the record plainly.
```

### `h:1d476bbcc4c51001` in `SKILL.md`

```diff
+A yes/no, quantity or unknown-result question has four permitted answers.
+
```

## dependency: The measurement rule names verify-this, the roster stage that records the verdict a quantitative claim quotes, so the number has an owner in the installed roster.

Record `fold-2026-09-11`, 1 hunk.

### `h:29818259c5437beb` in `SKILL.md`

```diff
-An adjective is a claim you did not measure.
+An adjective is a claim you did not measure. verify-this supplies the
+measurement: quote its recorded verdict, never an adjective in its place.
```

## Retired

- `h:5f5410c854c84406` in `fold-2026-09-11`: the greenline prelude and its four-answer scoping paragraph are folded into the body: the opening paragraph, the scoped first sentence of the rule and the verify-this sentence at the measurement rule
