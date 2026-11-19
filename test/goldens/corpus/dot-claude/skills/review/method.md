# Review: the method

It runs where the change's mode reaches the review step, at the depth the mode gives it, and alone when the owner asks for it by name: "review the branch", "review since X", a PR, or "what can we delete", which runs the excess lens alone. Asked for by name with no change open, the agent itself reviews the range the owner names, by the reviewer's brief, and the result stays in the reply: it starts no agent and writes no file. The skill has two halves, the reviewer's brief and the builder's half, each under its heading below.

## The reviewer's brief

The reviewer's brief is a page of its own, `references/brief.md`: what the reviewer receives and never receives, the two axes, the rungs and its report. Who reads the brief depends on the depth: at the inline depth the builder reads it whole, reviewing its own commits; where fresh agents review, each fresh reviewer reads it whole and the builder never reads it, nor a brief file, which the builder never opens. The reviewer needs nothing else on this page.

## The builder's half

This part is the builder's, the session holding the change, which writes its record.

### State the intent

In this half the user is the owner of the request. Before spawning reviewers, state the intent in one clear paragraph from the user's message, commit messages, the PR description if one exists, and the code. If you're unsure about the intent, ask the user before proceeding.

Then, where fresh agents review, start the reviewers as [references/reviewers.md](references/reviewers.md) says.

### Judge the findings

When the last report is in, judge every finding yourself. The reports keep each finding as its reviewer wrote it; the judgment is yours. Apply pragmatic engineering judgment. Don't aggregate. Filter, contextualize, and decide.

Categorize every finding, in the table, using these buckets:

- **Act on**. Real issues affecting correctness, security, or maintainability given the actual goals. They would block a real PR.
- **Consider**. Legitimate, but you're not sure they outweigh the cost of addressing them now. Worth the user's attention.
- **Noted**. Technically valid but not actionable. Context-dependent, premature optimization, or low-impact at this stage.
- **Dismissed**. Wrong, nitpicky, or missing context, with a brief reason.

The "Dismissed" bucket is not busywork. It's a trust mechanism. Showing the user what you rejected and why lets them override your judgment where they disagree. This is more valuable than hiding the rejected findings.

### Act on them

Act on the findings you judged act on, and on those under consider that you take up, in the fix round the mode gives. In what follows your human partner is the owner. The reviewer has finished when you act, so a question a report leaves open goes to the owner, and a pushback is written in the review section with its evidence.

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

Push back when:
- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Legacy/compatibility reasons exist
- Conflicts with your human partner's architectural decisions

**How to push back:**
- Use technical reasoning, not defensiveness
- Ask specific questions
- Reference working tests/code
- Involve your human partner if architectural

Commit each fix, with a test where the fix changes behavior. A finding you push back on stays in the review section with your evidence.
