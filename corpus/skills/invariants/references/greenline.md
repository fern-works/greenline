# invariants: the practice's mechanics

This page holds where the list lands in the workspace and the line that reads it, which `SKILL.md` names by their nouns. Read it with `SKILL.md` when the list is written.

## Where its work lands

The list is `.greenline/ledger/<id>/invariants.md`, under the id the change's proposal will name, written before the proposal so the proposal can name its floors; the record cites it as `[invariants](<id>/invariants.md)` and its `## start` section names `invariants`. Asked for in a question with no change to come, the list stands in the reply alone. The file holds one table with these four columns, in this order:

```markdown
| Invariant | Relied on at | Door | Boundary |
| --- | --- | --- | --- |
| An overdue fee is charged once per day | `src/fees.ts` chargeOverdue | a unique key on the account and the day | public contract |
```

The `Boundary` cell is `public contract`, `security` or `none`.

## The floor it raises

`greenline status` and the line printed at each turn's start read the list the session wrote, and the open change's, and name each entry marked `public contract` or `security` as a floor seen on the `situation:` line, `public-contract (an invariant: <the entry>)` or `security (an invariant: <the entry>)`. The proposal names each such floor, and the record's `floors` line, owed from the open, holds it, as for any floor found; while the line leaves one out, the `situation:` line names it with the cure, and nothing is refused for it.
