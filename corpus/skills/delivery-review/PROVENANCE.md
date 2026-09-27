# delivery-review: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/code-review`. Drift: 60 of 90 lines changed (67%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, series-s7-roster-2026-09-11, replay-s7-delivery-review-2026-09-11, ready-copies-2026-09-12, ready-review-role-2026-09-12, ready-review-bound-2026-09-12, ready-review-convention-2026-09-12, ready-review-installation-2026-09-12, vocabulary-owner-2026-09-12, garden-removal-2026-09-26, retrieval-pointers-2026-09-26.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:51f5a2e7955e6c30` in `SKILL.md`

```diff
-name: code-review
-description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
+name: "delivery-review"
+description: "Review an explicit committed range for implemented work or a ticket already in reviewing, along two axes: Standards (the repo's documented standards and installed guideline skills) and Spec (does the code match what the spec asked?). Use for 'review the branch', 'review since X', or a PR."
```

## scope: one opening paragraph in the skill's voice: reviews committed work (a ticket at implemented or a user-named range read-only); fires on 'review the branch', 'review since X', a PR and the handoff from implement; review-lens supplies finding discipline, ponytail-review the over-engineering pass, verify-this the proof; never implements fixes, never reviews uncommitted work, never extends a recorded range to a later HEAD

Record `fold-2026-09-11`, 1 hunk.

### `h:eb940e764b458d05` in `SKILL.md`

```diff
-Two-axis review of the diff between `HEAD` and a fixed point the user supplies:
+This skill reviews committed work: a ticket at implemented with its recorded range and pinned implementation account, or a range the user names for a read-only report. It fires on "review the branch", "review since X", a PR, and the handoff from implement. Finding discipline and severity come from review-lens, which both child reviews are briefed to read; a pass for over-engineering is ponytail-review's; the proof of acceptance is verify-this's. This skill never implements the fixes it finds, never reviews uncommitted work, and never extends a recorded range to a later HEAD.
```

## lifecycle: the fixed point for a ticket is its recorded base_commit..result_commit, both ends resolved exactly (two-dot diff and log, rev-parse of both ends); upstream's fixed-point-to-HEAD procedure stays for a read-only request without a ticket; taking a ticket writes the draft REV-NNN.md with ticket, implementation_account and range, opens the review-role account pinning the implementation account bytes, and advances the ticket to reviewing

Record `fold-2026-09-11`, 4 hunks.

### `h:ecd47ba13af4ded3` in `SKILL.md`

```diff
+Two-axis review of a committed range: the ticket's recorded `base_commit..result_commit`, or, for a read-only request, the diff between `HEAD` and a fixed point the user supplies:
+
```

### `h:33d512a278a940e1` in `SKILL.md`

```diff
-Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.
+For a ticket, the fixed point is its recorded range: `base_commit` and `result_commit` from the ticket at implemented, both resolved to exact commits. For a read-only request without a ticket, whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.
```

### `h:3c57b1f15052ade0` in `SKILL.md`

```diff
-Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.
+Capture the diff command once: `git diff <base-commit> <result-commit>` for a recorded range, or `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base) for a user-supplied fixed point. Also note the list of commits via `git log <base-commit>..<result-commit> --oneline`. A later HEAD does not extend a recorded range, and the merge-base does not replace the recorded base.
```

### `h:7a81100d73f6ce62` in `SKILL.md`

```diff
+Before going further, confirm both ends resolve (`git rev-parse <base-commit>`, `git rev-parse <result-commit>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.
+
```

## harness: each review sub-agent starts fresh with only its brief: on Codex it is spawned without the parent's turns (never fork_turns: all), because a fork of the implementer's conversation is not the independent context the method asks for (the Hono replay's judge)

Record `ready-copies-2026-09-12`, 1 hunk.

### `h:175550d2664c7bf1` in `SKILL.md`

```diff
-Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.
+Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings. Each sub-agent starts fresh with only its brief: on Codex, spawn it without the parent's turns (never `fork_turns: all`); a fork of the implementer's conversation is not an independent context.
```

## dependency: Green Line writes no docs/agents/issue-tracker.md, so the body's opening nudge sends the reviewer to configure a file workspace-setup never creates.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:12f2651a4ae6ccfc` in `SKILL.md`

```diff
-The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.
-
```

## harness: the independent context is defined by its mechanism: a spawned agent started fresh that inherits none of the implementer's conversation, never a fork of the implementer's turns (Codex fork_turns), so the durable review is independent by construction on both harnesses

Record `replay-s7-delivery-review-2026-09-11`, 1 hunk.

### `h:83f51b190f7a1271` in `SKILL.md`

```diff
-Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.
+Taking a ticket for a durable review is a separate contribution in an independent context, one that inherits none of the implementer's conversation (a spawned agent started fresh, never a fork of the implementer's turns): read `.greenline/WORK.md` and `.greenline/ledger/README.md`, write the draft `.greenline/work/reviews/REV-NNN.md` naming the ticket, its `implementation_account` and this `range`, open the review-role account whose `reviews` pins the implementation account bytes examined at their accounting commit, then advance the ticket to reviewing. A read-only request produces the report without repository edits.
```

## location: the originating spec is the one the ticket's consumes pins at its revision (a compact ticket's intent, scope and acceptance when there is none), with consumed decisions when their rationale matters; the standards sources add greenline's homes, the decisions book and the initiative's decisions.md, actual configuration, installed guideline skills and guidance retrieved under the review's own request handle, derived independently of the implementer's selections; the aggregate lands below the frontmatter of REV-NNN.md for a durable review

Record `fold-2026-09-11`, 2 hunks.

### `h:4b4f6be23af49668` in `SKILL.md`

```diff
-Look for the originating spec, in this order:
+The originating spec is the one the ticket's `consumes` pins: read the ticket and its consumed spec at that revision where one exists, and the consumed decisions when their rationale matters. For a compact ticket with no separate spec, its intent, scope and acceptance are the fidelity contract for the Spec axis. For a read-only request without a ticket, the spec is the path the user passed as an argument.
```

### `h:a2ee311994d04291` in `SKILL.md`

```diff
-Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).
+Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned, below the frontmatter of `.greenline/work/reviews/REV-NNN.md` for a durable review, or in the reply for a read-only request. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_); the reviewers' severity rungs stand, and the aggregator adds none.
```

## dependency: Step 2's search order routes through an issue tracker Green Line does not keep and spec directories it does not use; the ticket's consumes chain is the only spec source here.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:a66da356bb354407` in `SKILL.md`

```diff
-1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
-2. A path the user passed as an argument.
-3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
-4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".
-
```

## location: the originating spec is the one the ticket's consumes pins at its revision (a compact ticket's intent, scope and acceptance when there is none), with consumed decisions when their rationale matters; the standards sources add greenline's homes, the decisions book and the initiative's decisions.md, actual configuration, installed guideline skills and any guidance the review consults under its own account, derived independently of the implementer's selections; the aggregate lands below the frontmatter of REV-NNN.md for a durable review

Record `retrieval-pointers-2026-09-26`, 1 hunk.

### `h:057cd723e23e836c` in `SKILL.md`

```diff
-Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.
+Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`, together with the scoped repository decisions in `.greenline/DECISIONS.md` and the initiative's `decisions.md`, the actual configuration, the installed guideline skills whose methods apply, and any guidance this review consults under its own account. Derive the applicable obligations from the task, the diff and those sources, independently of the implementer's selections; an implementer's selected list, or a repository path to an absent guidance file, is not a source. A source's prestige or location gives it no authority.
```

## dependency: review-lens and its REGISTER.md are the roster's finding and severity discipline: both axes carry them, both briefs say to read them, refute each candidate and give each survivor its severity rung with the rule or acceptance criterion it cites; the reviewers' rungs stand and the aggregator adds none

Record `fold-2026-09-11`, 1 hunk.

### `h:838eeb91dea5fa93` in `SKILL.md`

```diff
+Beside the smell baseline, both axes carry review-lens and its REGISTER.md: the stance, the reflex check, the catalog and register that raise candidates, and the severity rungs that place what survives.
+
```

## harness: the standards sub-agent's prompt carries the full diff command and commit list with the exact ticket and range identities, the standards-source files and the smell baseline pasted in full, and the scoped decisions; its brief cites a documented standard by file and rule, decision, or guidance unit and revision; the retrieval access through the removed greenline guidance read command is gone with that command

Record `garden-removal-2026-09-26`, 1 hunk.

### `h:6dade48c90776e9b` in `SKILL.md`

```diff
-- The full diff command and commit list.
-- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
-- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."
+- The full diff command and commit list, with the exact ticket and range identities.
+- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it), and the scoped decisions.
+- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule, or the decision, or the guidance unit and its revision); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."
```

## scope: the spec brief gains (f): a change to a stored representation that an existing installation cannot take is in scope, quoted by the statement that creates the representation and the one that changes it, so refuting it needs evidence rather than the word speculation; (a) to (e) and the word limit are unchanged

Record `ready-review-installation-2026-09-12`, 1 hunk.

### `h:b011501374147e8e` in `SKILL.md`

```diff
-- The diff command and commit list.
-- The path or fetched contents of the spec.
-- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."
+- The diff command and commit list, with the exact ticket and range identities.
+- The ticket's intent, scope and acceptance, and the path or fetched contents of the consumed spec at its pinned revision.
+- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; (d) a state or transition a recorded decision forbids that the diff can reach, whether or not the ticket's acceptance names it; (e) a convention the diff introduces that other code must now follow and that no recorded decision names; (f) a change to a stored representation that an existing installation cannot take. Quote the spec line, the ticket's acceptance line, or the decision, for each finding; for (e), the hunk that sets the convention and the decision home it is absent from; for (f), the statement that creates the representation and the one that changes it. Under 400 words."
```

## scope: the bounded first pass moves into the sentence both sub-agent briefs carry (read review-lens, refute each candidate, rung each finding, and keep the pass bounded to the change's seams: no mutation, load or multi-process experiment unless the ticket or a recorded decision names the risk, never in the first pass of a first delivery), so the reviewer receives the bound rather than the aggregator alone; the briefs' other content is unchanged

Record `ready-review-bound-2026-09-12`, 2 hunks.

### `h:27a4d819823c6029` in `SKILL.md`

```diff
-If the spec is missing, skip the Spec sub-agent and note this in the final report.
+Both briefs also say: read review-lens and its REGISTER.md, refute each candidate before filing it, give each surviving finding its severity rung with the rule or acceptance criterion it cites, and keep the pass bounded to the change's own seams and its acceptance: no mutation, load or multi-process experiment unless the ticket or a recorded decision names the risk, never in the first pass of a first delivery; a limit the pass did not probe is reported as a limit, not explored. Each reviewer returns its own ranked findings.
```

### `h:ce36fcab72162390` in `SKILL.md`

```diff
+A ticket always supplies the Spec contract, so the spec is missing only on a read-only request with no path; then skip the Spec sub-agent and note this in the final report as a limit, never as a pass. A contract that is present but ambiguous is reported as the concrete limit it is, with the missing intent obtained from the ticket's owner.
+
```

## scope: the durable review's transitions are unchanged (a finding needing code returns the ticket; a correction gets a new result and a second review waits for the word; a clean review moves the ticket to verifying; a missing prior account is a reviewLimit) and one sentence bounds what a finding may ask: repository furniture (a test lane, a script, a convention) is proposed to the operator, never assigned as rework, whatever standard names it (carried from series-s7-roster-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:7c4de268a98f3b4b` in `SKILL.md`

```diff
+For a durable review, the record is the account of what it saw. A standards finding cites the applicable decision, the exact guidance unit and revision, or the repository rule. A finding that needs a code change returns the ticket to implementing and its request holder; this review does not implement the fix in the review context. A finding that would add repository furniture, a test lane, a script, a convention, is written as a proposal for the owner, not as rework, whatever standard names it. A correction receives a new result, and a second review of it waits for the owner's word. A future-ticket issue can be linked as a bounded trap note with its triggering condition. A clean, supported review sets the review account's `resultCommit` to the implementation commit at the end of `range`, completes the REV artifact, and moves the ticket to verifying, where verify-this proves its acceptance. A missing prior implementation account is an explicit `reviewLimit`, never invented evidence. Respect read-only scope and any other stop boundary, and return the findings or the supported result to the same request holder so the authorized work continues.
+
```

## lifecycle: the durable review's transitions: a finding needing code returns the ticket to implementing and its request owner without the reviewer fixing it, a correction gets a new result and a second review waits for the operator's word, a clean supported review sets the review account's resultCommit to the end of range, completes the REV artifact and moves the ticket to verifying for verify-this; a missing prior account is a reviewLimit; the Handoff section names consumes, produces and next

Record `fold-2026-09-11`, 1 hunk.

### `h:83b4bded0e935b7b` in `SKILL.md`

```diff
+
+## Handoff
+
+Consumes: the ticket at implemented, its consumed spec (pinned revision), base_commit..result_commit, the pinned implementation account
+Produces: .greenline/work/reviews/REV-NNN.md naming ticket, implementation_account and range; a review-role account; status reviewing then verifying on a clean review, or implementing when findings return the ticket
+Next: verify-this proves the acceptance at verifying
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:8e52616913ca02f6` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:1e7a31e0204f1116` in `fold-2026-09-11`: the prelude folded into the body at its step: the recorded range and the REV draft in step 1, the consumed spec in step 2, the standards homes and review-lens in steps 3 and 4
- `h:29e15b4e2882dbf8` in `fold-2026-09-11`: the step 2 sentence was rewritten again in place as the ticket's consumed spec, with the user-passed path kept for a read-only request (h:4b4f6be23af49668)
- `h:358ea32b2ff2d5e8` in `fold-2026-09-11`: the completion folded into the body at its step: the REV artifact and the ticket transitions in step 5, the handoff in the Handoff section
- `h:b939adc8a2f80bff` in `series-s7-roster-2026-09-11`: rewritten in place with the furniture sentence; its replacement is claimed above
- `h:403d1147f6987fd3` in `replay-s7-delivery-review-2026-09-11`: rewritten in place with the independence mechanism; its replacement is claimed above
- `h:79cb1fa3105f6055` in `ready-copies-2026-09-12`: rewritten in place with the fresh-spawn sentence; its replacement is claimed above
- `h:ce36fcab72162390` in `ready-copies-2026-09-12`: rewritten in place with the spec brief's (d); its replacement is claimed above
- `h:14b8bda25d47b3a7` in `ready-review-role-2026-09-12`: rewritten in place with the read command; its replacement is claimed above
- `h:b013d016b77b6b49` in `ready-review-bound-2026-09-12`: rewritten in place with the bound inside the briefs sentence; its replacement is claimed above
- `h:c1d3aec2150f7784` in `ready-review-bound-2026-09-12`: rewritten in place with the bound inside the briefs sentence; its replacement is claimed above
- `h:770f60b8f9516b40` in `ready-review-convention-2026-09-12`: rewritten in place with (e) added to the spec brief's list; its replacement is claimed above
- `h:4dd4d338ecad959d` in `ready-review-installation-2026-09-12`: rewritten in place with (f) added to the spec brief's list; its replacement is claimed above
- `h:3a1926027a26eb17` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from series-s7-roster-2026-09-11) carries to the hunk that replaced it
- `h:6a19ac4a53edc0fd` in `garden-removal-2026-09-26`: rewritten in place without the removed read command; its replacement is claimed above
- `h:c662f6bd283799ef` in `retrieval-pointers-2026-09-26`: rewritten in place without the guidance retrieved under the review's request handle by the removed loop; its replacement is claimed above
