# PR writing: the method

**These are requirements, not preferences.** A message that breaks one gets rewritten, not shipped.

## Operating order

### 1. Read the diff first

Read `git diff --staged --stat` for a commit, and for a PR the change's commits, which the change's status lists by their trailer; then the real hunks. You cannot state *why* from a file list.

### 2. Write the subject

Under 50 characters. No period. Imperative mood.

Test every subject: **"If applied, this commit will ___."** If the sentence breaks, the subject is wrong.

```
fix(auth): add a retry guard to the token refresh path
```

Banned first words: `Added`, `Adding`, `Adds`, `Fixed`, `Fixes`, `Updated`, `Changes`, `WIP`, `Misc`, `Various`. Banned anywhere in a subject: emoji, ticket IDs, `[tags]`, trailing `.`.

Every commit subject takes the form build's commit page gives, `<type>(<scope>): <imperative summary>`, and a PR title the same form; where the repository keeps a commit convention of its own, such as a tracker's key, it governs instead. Fifty characters is the aim and 72 the hard cap, and the capital after the colon follows the repository's convention, lower case where it keeps none.

### 3. Blank line, then body wrapped at 72

No exceptions — `rebase`, `format-patch`, and `git log` all break without the blank line, and the default pager does not wrap.

### 4. Body says what and why, never how

The diff already says how. The body says: the problem that existed, why this solution, what you rejected, what it costs.

The last lines of every commit of a change are the practice's two trailers, as build's commit page says.

### 5. Apply the prose habit

Every sentence, in commits and PR bodies both, is prose: the prose habit's catalog of tells and its measurement in place of the adjective apply, and a PR body is a briefing a reviewer reads in under a minute.

### 6. Fill the PR body template

```markdown
## What changed
<1 to 3 sentences. Active voice, present tense.>

## Why
<The problem. The reason for this solution. What you rejected.>

## How to verify
1. <One action per step.>
2. <Expected result, stated concretely.>

## Risk
<What breaks if this is wrong. How to roll it back.>

## Special things to note
- <A reviewer warning, a migration, a deliberate omission, or None.>

Change record: `.greenline/ledger/<id>.md`
```

Drop a section only when it is genuinely empty, and say so: `Risk: none — docs only.`

The body is a projection of the change record, never a second home for it: What changed and Why come from the record's sections, How to verify from its verify section and the checks the change recorded, and the last line links the record. Where the change alters a shape, a flow, a hierarchy or a file layout, What changed carries the smallest visual the show-me habit gives for it, after its sentences.

   - Keep **Special things to note** to 1-3 bullets. Prioritize reviewer warnings, migrations, compatibility constraints, deliberate omissions, or surprising decisions. Write `- None.` when there are no special considerations.
   - Make What changed's visual a **change outline**, a compact, show-me-inspired structural view rather than prose or a file-by-file changelog.
   - Include only the views that help explain this PR:
     - SQL table and endpoint contract changes, plus pseudocode for business logic.
     - key data structure / type changes
     - A shallow file tree showing changed responsibilities.
     - React component tree changes, including important hooks, state, and package boundaries.
     - Call-tree, call-stack, control-flow, or data-flow changes.
   - Prefer `diff` blocks when showing changes to an existing shape. Show the complete target shape when most of it is new or diff notation would obscure ownership or order.
   - Keep each view focused on what a reviewer needs. Omit categories that did not change.

A durable visual the change made is linked from What changed by its path in the repository, after the change outline, never pasted into the body; a picture over twelve nodes is linked there, never drawn.

**How to verify** carries the evidence:

Concrete evidence that the change works. Show a before and after.

Screenshots are S-tier - when the environment is set up for it and the change is visual.

Execution-based evidence is A-tier. Test results, console output. Show the exact test that now fails and passes, using pseudocode.

**Risk** names the merge danger:

Describe whether it's a one-way or two-way door. You can walk back through two-way doors, but not one-way doors. A PR that is cheap to roll back is lower risk. Changes that involve destructive actions or hard-to-reverse decisions are one-way doors.

The blast radius is the potential impact or scope of the changes introduced by this PR. Consider all possibilities. Examples are layout shift, breakages for consumers, mobile responsiveness, etc.

### 7. Make it easy to review

When code behavior should stay untouched, prefer PR description and review notes:

- Add a TL;DR that matches the actual diff.
- Separate core files from generated or mechanical files.
- Call out risky behavior changes, migration order, rollout plan, and test coverage.
- Link issue trackers, dashboards, or design docs when they explain intent.

A reviewability fix here changes the PR body and the review notes, never a commit: regrouping the change's commits is close's history cleanup, under the record's rebase line, with the tree compared before and after. The tree the reviewer reads, `git rev-parse HEAD^{tree}`, stays the one the change's checks ran on; never offer a PR whose tree changed unintentionally. A change over about 500 changed lines says so in Special things to note, with the split the plan should have made; the size is a note, never a gate.

### 8. Leave the push and the PR to the landing

Writing the messages and the body is this habit's work. Pushing the branch and opening the PR are the close step's landing, offered there in one line and never here. Editing the PR's body on the forge is outward too: offer it, and do it on the owner's word.

## Non-negotiables

1. Never `git commit -m` for a change that needs a body. Use a message file or a heredoc.
2. The PR title obeys the subject rules exactly — 50 characters, imperative, no period.
3. A squash-merge message is a commit message. Same rules.
4. Never let a template heading survive with placeholder text under it.
5. If you cannot state the *why*, you do not understand the change yet. Go read the diff again.

## Guardrails

- Never hide meaningful behavior changes inside "cleanup".
- Do not bypass hooks unless the user explicitly asks.
- If the PR is too large to make reviewable with notes, recommend splitting instead of polishing around the problem.
