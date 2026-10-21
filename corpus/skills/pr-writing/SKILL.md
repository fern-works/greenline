---
name: "pr-writing"
description: "Write or review a commit message, a PR title or a PR body that says what changed and why: the diff read first, a subject under 50 characters in the imperative, a body of what and why, never how, and a PR body of what changed, why, how to verify, the risk and the notes, linking the change record. Use when a commit message, a PR title or a PR body is about to be written or reviewed."
---

# PR writing

pr-writing is a trial habit, installed only where the workspace's `trials` names it, for the moment a commit message, a PR title or a PR body is about to be written or reviewed, at whatever step the work is in, most often build and close. It writes no record of its own: the change record holds the why, and a PR body is a projection of that record that links it. Pushing the branch and opening the PR are the landing the close step offers, done only on the owner's word as AGENTS.md says, and editing a PR on the forge waits for that word too; this habit keeps the writing. The sentences themselves are the prose habit's to cut, and the visual a PR body carries is show-me's.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

**These are requirements, not preferences.** A message that breaks one gets rewritten, not shipped.

## Operating order

### 1. Read the diff first

Read `git diff --staged --stat` for a commit, and for a PR the change's commits, which the change's status lists by their trailer; then the real hunks. You cannot state *why* from a file list.

### 2. Write the subject

Under 50 characters. Capitalized. No period. Imperative mood.

Test every subject: **"If applied, this commit will ___."** If the sentence breaks, the subject is wrong.

```
Add retry guard to the token refresh path
```

Banned first words: `Added`, `Adding`, `Adds`, `Fixed`, `Fixes`, `Updated`, `Changes`, `WIP`, `Misc`, `Various`. Banned anywhere in a subject: emoji, ticket IDs, `[tags]`, trailing `.`.

Where the repository keeps a commit convention of its own, such as a type prefix or a tracker's key, it governs the subject's form, and these rules apply only where it is silent; where it keeps none, add none.

### 3. Blank line, then body wrapped at 72

No exceptions — `rebase`, `format-patch`, and `git log` all break without the blank line, and the default pager does not wrap.

### 4. Body says what and why, never how

The diff already says how. The body says: the problem that existed, why this solution, what you rejected, what it costs.

The last line of every commit of a change is its trailer, as AGENTS.md says.

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

A reviewability fix changes the PR body and the review notes, never a commit: rewriting a change's history is not this habit's. The tree the reviewer reads, `git rev-parse HEAD^{tree}`, stays the one the change's checks ran on; never offer a PR whose tree changed unintentionally.

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
