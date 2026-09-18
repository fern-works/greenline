# implement: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/implement`. Drift: 28 of 20 lines changed (140%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, series-s7-roster-2026-09-11, vocabulary-owner-2026-09-12, roster-keepers-2026-09-15, light-path-negative-2026-09-15.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:d7c0bafe420e6b1e` in `SKILL.md`

```diff
-name: implement
-description: "Implement a piece of work based on a spec or set of tickets."
-disable-model-invocation: true
+name: "implement"
+description: "Build one frontier ticket in a fresh context, or make one settled fix with no ceremony on the light path. Use for 'build TKT-NNN', 'next ticket', and small clear changes: fix, add, rename, adjust."
```

## scope: one opening paragraph in the skill's voice: fires on 'build TKT-NNN', 'next ticket' and a small clear change; shaping goes to grill-with-docs, planning to to-spec and to-tickets, review to delivery-review, proof to verify-this; never reviews its own result or settles an open consequential decision (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:c015ca2ac6dc491c` in `SKILL.md`

```diff
-Implement the work described by the user in the spec or tickets.
+This skill builds one ready ticket, or makes one settled fix on the light path. It fires on "build TKT-NNN", "next ticket", and a small clear change: fix, add, rename, adjust. An open product question is not settled here: it goes to grill-with-docs, and a plan to to-spec and to-tickets. The independent review belongs to delivery-review and the proof of acceptance to verify-this; this skill never reviews its own result, and a consequential unresolved decision returns to the owner with evidence rather than being decided during the build.
```

## lifecycle: the work is one ready ticket from greenline status (a compact ticket for a settled change without one, none on the light path of one source file and its test with no open choice, whose failing test, if any, already names it; a test red before the work starts that does not name the change makes it not light, a red test written for the change does not count, and an instruction the change cannot keep is an open choice), read with the pinned revisions in its consumes, claimed with claimed_by and base_commit; carried from roster-keepers-2026-09-15 (J-13, 2026-09-15)

Record `light-path-negative-2026-09-15`, 1 hunk.

### `h:2d4836c8a1d99388` in `SKILL.md`

```diff
-Use /tdd where possible, at pre-agreed seams.
+Implement the work described by the user in the spec or tickets. The work is one ticket: `greenline status` lists the ready frontier, and a settled change that has no ticket gets one compact ticket with intent, scope and falsifiable acceptance as `.greenline/WORK.md` defines it, except on the light path, where a change confined to one source file and its test, with no open choice, whose failing test, if any, already names it, takes fix, checks, one commit and the reply, with no ticket, account or review; a test red before the work starts that does not name the change makes it not light, a red test written for the change does not count, and an instruction the change cannot keep is an open choice. A change across files is never light. Read the ticket and the actual revisions in its `consumes`; a stale input is reassessed before dependent work. Claim it with `claimed_by` and `base_commit`, and create the implementation account as `.greenline/ledger/README.md` defines it; a ticket already claimed or implementing under your own claim is a resumption, so read its reviews and the commits since the base and continue what remains. An existing ticket keeps its global ID and evidence home. Follow the retrieval loop in AGENTS.md before the first edit, respecting the touched roots' decisions; guidance delivery facts come from generated receipts, and you add only the meaning and result evidence. Preparatory upkeep belongs to this same contribution.
```

## rename: bare roster name in prose: /tdd is tdd; the same rename as before the fold, remeasured because the surrounding lines moved

Record `fold-2026-09-11`, 1 hunk.

### `h:f1165ac5614ee3ee` in `SKILL.md`

```diff
-Run typechecking regularly, single test files regularly, and the full test suite once at the end.
+Use tdd where possible, at pre-agreed seams.
```

## location: the checks' captured commands and outcomes live under .greenline/work/evidence/TKT-NNN/ and are referenced from the account's checks; a failed or unrun check stays visible and quantified acceptance needs evidence covering the stated set

Record `fold-2026-09-11`, 1 hunk.

### `h:16785ae61cac5cf5` in `SKILL.md`

```diff
-Once done, use /code-review to review the work.
+Run typechecking regularly, single test files regularly, and the full test suite once at the end. Keep each captured command and its outcome under `.greenline/work/evidence/TKT-NNN/`, referenced from the account's `checks`, and keep a failed or unrun check visible. Quantified acceptance needs evidence covering the stated set, with any explicit exceptions accounted for; a sample cannot prove an exhaustive claim.
```

## method: upstream reviews before committing; greenline commits the coherent result, finalizes the account, then requests one bounded delivery-review of the committed ticket (the block, step 5; the S6 QA fix the operator approved on 2026-09-11), so this hunk changes the method order Confirmed by the operator on 2026-09-11 (method-rulings.md). The same paragraph now names the two tests of a durable decision (a convention other code must follow; a trade-off beyond the acceptance) and allows an offer, a scope sharpening from the S7 series. (carried from series-s7-roster-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:5c16941cd1dac2b5` in `SKILL.md`

```diff
-Commit your work to the current branch.
+Once done, commit your work to the current branch: the coherent implementation result, with `result_commit` recorded on the ticket and the ticket at implemented. Then finalize the implementation account with that exact `resultCommit` and commit it separately; the accounting commit is a review input of its own and does not extend the implementation range.
+
+Then request delivery-review of the committed ticket, its account and `base_commit..result_commit` through an available subagent tool, giving the reviewer the relevant contracts and retrieval access: one bounded round, part of the authorized work, not an owner relay. The reviewer writes the review record when it takes the ticket from implemented to reviewing. Findings return to this claim; rework changes the result and reopens affected checks, review and verification. The findings and any rework go to the owner with the reply, and a further round waits for the owner's word. When no delegation tool is available, record that limit in the account, leave the ticket implemented and blocked for review, and reply; the owner can open a fresh reviewing session. Before the ticket closes, evaluate whether the work surfaced a durable decision: a convention other code must now follow, or a trade-off accepted beyond the ticket's acceptance, is one even when an existing decision dictated the behaviour; record it with record-architecture-decisions in the established home, or offer to, or state plainly that none was needed. The ticket completes only when its acceptance, the independent review and the verification are supported; respect an explicit stop boundary and the repository's commit conventions, and report the delivered result and any material remaining decision.
+
+## Handoff
+
+Consumes: the ticket at ready from greenline status, the pinned revisions in its consumes
+Produces: .greenline/work/tickets/TKT-NNN.md, status claimed then implementing then implemented with result_commit; the commits; the implementation account pinned to that result commit; evidence under .greenline/work/evidence/TKT-NNN/
+Next: delivery-review reads the ticket, its account and base_commit..result_commit; at close, record-architecture-decisions evaluates whether the work surfaced a durable decision
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:3ab179e20a5adbbc` in `agents/openai.yaml`

Removed file, 5 lines.

## Retired

- `h:9fc3440bc89a3fe4` in `fold-2026-09-11`: the prelude folded into the body at its step: the ticket, claim, light path and consumes in the implement sentence, the commit-then-account-then-review order in the close
- `h:0e5824ad39553e6d` in `fold-2026-09-11`: the /tdd rename is unchanged in the copy but now measures as h:f1165ac5614ee3ee because the fold moved its upstream counterpart
- `h:1c275cf47dae808d` in `fold-2026-09-11`: the review sentence was rewritten in place as the delivery-review request after the commit (h:40b8db05f0405f05); the bare rename alone no longer exists
- `h:315d643b1ef941ee` in `fold-2026-09-11`: the completion folded into the body at its step: evidence and visible checks beside the test run, the review round and the decision harvest in the close
- `h:40b8db05f0405f05` in `series-s7-roster-2026-09-11`: rewritten in place with the sharpened decision trigger; its replacement is claimed above
- `h:34d8ba64a8ed4709` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
- `h:5ea8983e8aea0d87` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (method from series-s7-roster-2026-09-11) carries to the hunk that replaced it
- `h:57452c3c33485581` in `roster-keepers-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8, 2026-09-15)
- `h:215b35d5f408005d` in `light-path-negative-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-13, 2026-09-15)
