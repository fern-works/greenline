# record-architecture-decisions: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://gist.github.com/ericclemmons/96cc6c774e2062e6660f1acb97506940 at 79756870d126c97dbd2c8c7ceb57ef6f8eea5dbc, `SKILL.md`. Drift: 28 of 82 lines changed (34%). Records: baseline-copies-2026-09-11, descriptions-practice-the-catalog-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, ready-copies-2026-09-12, vocabulary-owner-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and description; the description rewritten without em dashes under the widened rule

Record `descriptions-practice-the-catalog-2026-09-11`, 1 hunk.

### `h:91b9d08f67c1c444` in `SKILL.md`

```diff
-name: record-architecture-decisions
-description: Record small Architecture Decision Records (ADRs) for durable technical choices in this monorepo. Use when a change chooses among meaningful alternatives, moves from an ideal approach to a practical one because of discovered constraints, establishes a cross-component contract or convention, accepts a consequential trade-off, or supersedes an earlier decision. Also use before completing any non-trivial implementation thread or merge request to decide whether its work produced an ADR-worthy decision.
+name: "record-architecture-decisions"
+description: "Record small Architecture Decision Records (ADRs) for durable technical choices. Use when a change chooses among meaningful alternatives, abandons an ideal approach over a discovered constraint, establishes a cross-component contract or convention, accepts a consequential trade-off, or supersedes an earlier decision. Also use it before completing any non-trivial ticket, to evaluate whether the work produced an ADR-worthy decision."
```

## scope: one opening paragraph in the skill's voice after the title: the decision harvest at a ticket's close, named by implement and verify-this and also fired on its own by upstream's triggers; it writes in the repository's existing decision home; shaping rulings belong to the initiative's decisions.md and domain words to domain-modeling; it never reopens the decision it records, and the harvest closes the ticket for the request owner to complete (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:745228bdc7612f27` in `SKILL.md`

```diff
+This skill is the decision harvest at a ticket's close: implement and verify-this name it when a landed change may have settled something durable, and it also fires on its own when a change chooses among meaningful alternatives, abandons an approach over a discovered constraint, establishes a cross-component contract, accepts a consequential trade-off or supersedes an earlier decision. It writes the record in the repository's existing decision home. The shaping rulings that scoped an initiative belong in that initiative's `decisions.md`, and the words of the domain belong to domain-modeling; this skill never reopens the decision it records, and the harvest closes the ticket for the request holder to complete.
+
```

## lifecycle: the evaluation happens at the ticket's close over its base_commit..result_commit diff and its outcome is stated in the request owner's handoff; step 3 says a shaping ruling that scoped the work goes to the initiative's decisions.md while an ADR holds the durable technical reasoning the work itself surfaced (a constraint discovered, an approach abandoned); upstream's criteria for writing or skipping an ADR are unchanged

Record `fold-2026-09-11`, 1 hunk.

### `h:5510b622d9a7056a` in `SKILL.md`

```diff
-1. Review the conversation, implementation attempts, test results, and diff for durable decisions.
+1. At the ticket's close, review the conversation, implementation attempts, test results, and the diff of its `base_commit..result_commit` for durable decisions.
```

## lifecycle: upstream's merge request is the reviewed ticket's change: the ADR lands with it and a lasting choice is linked from the decisions book .greenline/DECISIONS.md rather than copied there (WORK.md's repository-memory rule), and acceptance is that change landing; the Handoff section names the harvest and the decision home consumed, the ADR in that home linked from the decisions book (docs/adr/YYYY-MM-DD-short-title.md only when seeded), and no next stage (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:0a0e90aa3b02cc97` in `SKILL.md`

```diff
-3. Skip an ADR for routine maintenance, implementation details, straightforward bug fixes, and choices already dictated by an accepted ADR.
-4. If no ADR is needed, state that explicitly in the final handoff.
+3. Skip an ADR for routine maintenance, implementation details, straightforward bug fixes, and choices already dictated by an accepted ADR. A deferral is not a decision: a choice put off is a line inside the decision it defers from, never an ADR or a decisions-book entry of its own. A shaping ruling that scoped the work belongs in the initiative's `decisions.md`, not in an ADR; an ADR holds the durable technical reasoning the work itself surfaced, such as a constraint discovered or an approach abandoned.
+4. If no ADR is needed, state that explicitly in the request holder's handoff.
```

## location: step 1 looks for the repository's existing decision home, a decisions document or an ADR directory of its own, and writes there in that home's format, seeding docs/adr/ from this skill's template only when the repository has none (docs/ledger/evidence/qa-s6-block-fixes/artifact-discipline.md, the home rule)

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:2ea22c13223d04b2` in `SKILL.md`

```diff
-1. Read `docs/adr/README.md` and `docs/adr/template.md` completely.
-2. Create `docs/adr/YYYY-MM-DD-short-title.md`. Use a specific, durable title and avoid sequential numbers that conflict across concurrent branches.
+1. Find the repository's existing decision home: a decisions document, or an ADR directory of its own. When one exists, write there in that home's format. Only when the repository keeps no decisions anywhere, seed `docs/adr/` on first use from this skill's `template.md` and `README.md` support files, then read `docs/adr/README.md` and `docs/adr/template.md` completely.
+2. In `docs/adr/`, create `docs/adr/YYYY-MM-DD-short-title.md`; in another home, add the entry in that home's own form. Use a specific, durable title and avoid sequential numbers that conflict across concurrent branches. The dated naming is repository-wide and supersedes domain-modeling's `ADR-FORMAT.md` where they disagree.
```

## lifecycle: upstream's merge request is the reviewed ticket's change: the ADR lands with it and a lasting choice is linked from the decisions book .greenline/DECISIONS.md rather than copied there (WORK.md's repository-memory rule), and acceptance is that change landing; the Handoff section names the harvest and the decision home consumed, the ADR in that home linked from the decisions book (docs/adr/YYYY-MM-DD-short-title.md only when seeded), and no next stage

Record `fold-2026-09-11`, 1 hunk.

### `h:63d4a36e7faddb2a` in `SKILL.md`

```diff
-5. Include the ADR in the same merge request as the decision whenever possible.
+5. Include the ADR in the same ticket's change as the decision whenever possible, and link a lasting choice from the decisions book, `.greenline/DECISIONS.md`, rather than copying it there.
```

## location: greenline's paragraph on a decision that spans modules (Ousterhout, 2021) moved from the prelude to the end of Write the ADR: the record stays a dated file in the decision home and the extension point carries the pointer and the in-step checklist; unchanged in substance

Record `fold-2026-09-11`, 1 hunk.

### `h:08d10ab1c931a656` in `SKILL.md`

```diff
+A decision that spans modules is recorded where a developer must stand to extend it: the ADR lives at, or is pointed at from, the extension point, and it carries an explicit checklist of the other places that must change in step, because that is the moment the reader is already committed to the change (Ousterhout, 2021). The ADR is still a dated file in the decision home; what stands at the extension point is the record's pointer and the in-step checklist the extending reader must act on. Duplicating the explanation into every dependent site drifts apart, and parking it in one dependent site hides it; where no obvious central location exists, the decision home is the fallback and the extension point gains the pointer.
+
```

## scope: step 3 says a choice put off is a line inside the decision it defers from, never an ADR or a decisions-book entry of its own, so the three readings the S7 series produced (a new entry, nothing, a line inside D6) collapse to one; the routine-maintenance skip list is unchanged (carried from ready-copies-2026-09-12; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:a18e97d10422fe20` in `SKILL.md`

```diff
-- Do not add approval or status metadata. Landing through merge request review records acceptance; an unmerged ADR remains a proposal in its branch.
+- Do not add approval or status metadata. Landing with the reviewed ticket's change records acceptance; an unmerged ADR remains a proposal in its branch.
+
+## Handoff
+
+Consumes: the landed change at a ticket's close (the decision harvest) and the repository's existing decision home
+Produces: an ADR in that home, linked from the decisions book .greenline/DECISIONS.md; docs/adr/YYYY-MM-DD-short-title.md only when the repository keeps no decisions elsewhere and docs/adr/ is seeded from this skill's template and README on first use
+Next: none; the harvest closes the ticket and the request holder completes it
```

## Retired

- `h:c4cbfdaec06e16df` in `descriptions-practice-the-catalog-2026-09-11`: the description as cut over carried em dashes greenline wrote
- `h:e6f82a3fcebbfbb9` in `fold-2026-09-11`: the prelude folded into the body at its step: the harvest in the opening paragraph and step 1 of the evaluation, decisions.md versus an ADR in step 3, the decision home and the seeding rule in step 1 of Write the ADR, the dated naming in step 2, the extension-point paragraph after the steps
- `h:2ea22c13223d04b2` in `fold-walk-2026-09-11`: re-claimed with a reason a merger can act on
- `h:be5bfebc2dcf2063` in `ready-copies-2026-09-12`: rewritten in place with the deferral sentence; its replacement is claimed above
- `h:4809dd4391004a2e` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
- `h:44f953daaf37152c` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-2026-09-11) carries to the hunk that replaced it
- `h:1e01f1c3aae28b39` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from ready-copies-2026-09-12) carries to the hunk that replaced it
