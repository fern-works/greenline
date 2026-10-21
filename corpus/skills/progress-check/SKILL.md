---
name: "progress-check"
description: "Give sparse, evidence-based progress updates during long-running work: observable milestones weighted by work and risk, an update only when something material changed, one rounded-down bar. Use while long work with several milestones runs between replies, never for a short answer or work with no intermediate state; and the moment the owner asks to change how or how often you report progress, whether more updates, total silence or an estimated clock, BEFORE any such preference is saved anywhere."
---

# Progress Check

progress-check is the habit for the moment long work runs between replies: a
change with several milestones, a build of many slices, delegated agents
running one after another. It never fires on a short answer or on work whose
only honest states are started and finished, and its cadence is judgment,
never spam. It also fires the moment the owner asks to change how or how often
you report, whether more updates, silence or an estimated clock: follow the
preference within the current task, keep reporting actionable blockers, and
save nothing anywhere unless the owner asks for a lasting rule (Persist a
preference, below). It writes no record of its own: progress stays in the
conversation, the evidence behind it belongs to the change record's sections
and the checks the change recorded, and an estimated clock is an
unmeasured claim this habit never makes.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Full method: [METHODOLOGY.md](./METHODOLOGY.md). Chat shape:
[RESPONSE.md](./RESPONSE.md). Examples: [EXAMPLES.md](./EXAMPLES.md).

## Choose the mode

- **Report progress:** default for qualifying long-running work.
- **Persist a preference:** only when the owner asks for a lasting rule. The
  greenline CLI installs this skill, so there is no install-globally mode here.

## Report progress

1. Define a small set of observable milestones before estimating a percentage.
   Weight by work and risk, not elapsed time. Where a change owns the work, the
   milestones are its acceptance items and every update quotes their evidence.
2. Send one baseline update after scope is understood.
3. Send a routine update only when turns of work have passed since the previous
   routine update or a step of the change has ended, **and** one of these is
   true: a milestone completed, verified progress rose by at least 10 percentage
   points, or the next action materially changed. Never estimate elapsed time to
   open the gate; an estimated clock is an unmeasured claim.
4. Report a new blocker immediately when the user can act on it. Report
   completion immediately.
5. Never repeat an unchanged bar or send a routine “still working” message.

The update is conversation and nothing else: milestone evidence belongs to the
change record and its checks, and no parallel progress file or tracker is
created. Keep each update to at most three short items: completed
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

Durable output: none. Applied on its own cadence while long work runs, and the moment the owner asks to change how or how often you report, before any preference is saved anywhere.
