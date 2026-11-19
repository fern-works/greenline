# Guard the Context Window: the method

Where the harness cannot remove text from the thread, cutting means not quoting it again and carrying its one-sentence summary forward, and putting material last means restating it at the end of the work in hand. Reporting progress to the owner is progress-check's concern.

The context window is finite and non-renewable within a session. Every token should be worth its cost.

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress.

**Pattern:**
- **Isolate large payloads.** Read a large output by excerpt: its head, a search, or the lines that matter. Carry forward a summary of what it showed, not the payload.
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.

## Context Budget Management

The context window is not a filing cabinet — it's a working desk. As a session runs, conversation history, tool output, and exploration accumulate. Most of it becomes deadweight. Budget proactively: waiting until the window is full causes abrupt quality drops; managing regularly keeps the agent coherent through long tasks.

**Start trimming at 75% capacity, not 100%.** By the time the window is genuinely full, the model's attention is already fragmented across too many signals. The 75% threshold gives room to compress gracefully rather than cut desperately mid-task.

### What to cut first

| Content | When to cut |
|---|---|
| Past failed attempts and their error output | Once you've moved past them — keep the conclusion, not the journey |
| Verbose tool output (long `find` results, full file listings) | After you've extracted what you needed |
| Conversational back-and-forth | As soon as the decision is reached |
| Earlier drafts of code that were replaced | Immediately on replacement — the current file is the record |

### What to protect until the end

- The original task definition and key constraints
- The current error message or failing test output you are actively debugging
- The file currently being edited, or its most recent version
- Any hard constraints the agent has been asked to enforce (auth rules, naming conventions, etc.)

### Compress before dropping

Summarizing beats deleting. Before removing a long stretch of exploration, reduce it to one sentence capturing the conclusion:

```
Before: [8 messages debugging a failing import — various attempts, error logs, dead ends]
After:  "Import issue traced to a circular dependency in src/lib/db.ts —
         resolved by moving the shared type to src/types/index.ts."
```

The detail is gone; the decision is preserved. If the detail turns out to matter, the summary is a breadcrumb for re-investigation.

### Order for recency

Put the most task-critical content **last** in context. Models recall content at the start and end of the window more reliably than the middle (the lost-in-the-middle effect — Liu et al., 2023). Keep stable rules and specs at the start; put the active task material last, closest to the generation point:

```
← session start                              generation point →
[background: rules, specs, architecture]  [working: current file, error, task]
```
