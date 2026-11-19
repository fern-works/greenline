# Progress Check: the method

It also fires the
moment the owner asks to change how or how often you report, whether more
updates, silence or an estimated clock: follow the preference within the
current task, keep reporting actionable blockers, and save nothing anywhere
unless the owner asks for a lasting rule (Persist a preference, below).

Full method: [METHODOLOGY.md](./METHODOLOGY.md). Chat shape:
[RESPONSE.md](./RESPONSE.md). Examples: [EXAMPLES.md](./EXAMPLES.md).

## Choose the mode

- **Report progress:** default for qualifying long-running work.
- **Persist a preference:** only when the owner asks for a lasting rule. The
  greenline CLI installs this skill, so there is no install-globally mode here.

## Report progress

1. Define a small set of observable milestones before estimating a percentage.
   Weight by work and risk, not elapsed time. Where a change owns the work, the
   status line's progress line counts its steps instead of these milestones.
2. Send one baseline update after scope is understood.
3. Send a routine update only when turns of work have passed since the previous
   routine update or a milestone of the work has ended, **and** one of these is
   true: a milestone completed, verified progress rose by at least 10 percentage
   points, or the next action materially changed. Never estimate elapsed time to
   open the gate; an estimated clock is an unmeasured claim.
4. Report a new blocker immediately when the user can act on it. Report
   completion immediately.
5. Never repeat an unchanged bar or send a routine “still working” message.

The update is conversation and nothing else: milestone evidence stays in
the reply and the checks the work ran, and no parallel progress file or
tracker is created. Keep each update to at most three short items: completed
evidence, current work, and next step or blocker. End with exactly one overall
bar styled as inline code on its own line:

`Performance rollout  [██████████████████░░] 90%`

Use one pair of backticks for inline-code styling. Do not indent the line by
four spaces and do not use a fenced code block; both create a separate block
that interfaces may label or make copyable.

- Replace the label with a short task-specific label.
- Use 20 cells: `█` completed and `░` remaining.
- Round down to the nearest 5% unless completion evidence supports 100%.
- Show only the overall bar unless the user requests subtask bars.
- In multi-agent work, only the coordinator shows the overall bar.
- The progress line is the final content in the update. End immediately after
  it with no note, recap, or closer.

## Persist a preference

The greenline CLI installs this skill; there is no global installation step
here and no machine-global instruction write. A request to change how or how
often you report is followed within the current task and saved nowhere.
Persist a preference only when the owner asks for a lasting repository
rule, as a house ruling in the repository's user-owned instruction home, in the
format the work guide defines. The next context reads that rule without
demanding a second confirmation.
