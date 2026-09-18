# progress-check: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/tjcages/skills at 687c395cba58a7183546c480b3d975ddf422356f, `progress-check/skills/progress-check`. Drift: 129 of 266 lines changed (48%). Records: baseline-copies-2026-09-11, descriptions-practice-the-catalog-2026-09-11, fold-2026-09-11, vocabulary-owner-2026-09-12.

## harness: The greenline CLI installs this skill, so the Install globally mode, its npx skills add command and its native always-on instruction steps are not procedures here and Report progress is the only reporting mode; the mode bullet says so where the mode was introduced, EXAMPLES.md marks the Dogfood log as upstream's own install history rather than a command or a claim about this installation, and the last SKILL.md hunk carries the situational closing line (Durable output: none; applied on its own cadence in the worker moment and the moment the user asks to change the cadence, before any preference is saved).

Record `fold-2026-09-11`, 3 hunks.

### `h:bea2e5935b23fe79` in `EXAMPLES.md`

```diff
+This log is upstream's record of its own install runs, kept as written. It is
+not a command to run here and makes no claim about this installation, which
+the greenline CLI performs.
+
```

### `h:d30626330e9eb3ab` in `METHODOLOGY.md`

```diff
-```bash
-npx skills add tjcages/skills --skill progress-check -g --agent '*'
-```
-
-This lets compatible agents discover the same skill without maintaining copies
-of the rules in several products.
-
-If the user explicitly wants native always-on rules, detect each product's
-documented user-level mechanism at execution time. Preserve existing content,
-add one identifiable section, make repeated runs idempotent, and avoid project
-files when a user-global mechanism exists. For UI-only products, report the
-exact settings location and provide the block; do not invent a filesystem path.
-
```

### `h:367127038b627d20` in `SKILL.md`

```diff
-```bash
-npx skills add tjcages/skills --skill progress-check -g --agent '*'
-```
-
-If the user explicitly requests native always-on instructions instead:
-
-1. Detect each installed agent's documented user-level instruction mechanism.
-2. Merge the progress rules without overwriting existing instructions.
-3. Make the change idempotent and avoid repository-level instruction files.
-4. If an agent supports only UI-managed rules, give the exact settings location
-   and a copy-ready block instead of inventing a file path.
-5. Verify each changed target and state whether a new session is required.
-
-Do not claim an unsupported agent was configured. Do not modify unrelated
-preferences.
+Durable output: none. Applied on its own cadence in the worker moment, and the moment the user asks to change how or how often you report, before any preference is saved anywhere.
```

## harness: The agent has no wall clock and its unit of reply is the turn, so the 30-minute half of the routine-update gate is re-anchored in SKILL.md step 3 and METHODOLOGY.md section 3 to turns of work since the previous routine update or a status transition of the owning ticket, the change half (a milestone, ten verified points, a different next action) unchanged and an estimated elapsed time never used to open the gate; section 8's open gap names the turn-and-status cadence in place of the 30-minute default and drops the global-install gap that went with the removed mode.

Record `fold-2026-09-11`, 4 hunks.

### `h:dfe250e6bc5ab601` in `METHODOLOGY.md`

```diff
-1. At least 30 minutes since the previous routine update.
+1. Turns of work since the previous routine update, or a status transition of
+   the owning ticket; never an estimate of elapsed time.
```

### `h:fe483732675b0df1` in `METHODOLOGY.md`

```diff
-New actionable blockers and final completion bypass the time gate. Waiting,
+New actionable blockers and final completion bypass the turn gate. Waiting,
```

### `h:04b1e2cc40a9e10f` in `METHODOLOGY.md`

```diff
-- Validate native always-on installation against new agent products as their
-  documented global configuration mechanisms change.
-- Revisit the 30-minute and 10-point defaults only after real usage shows that
-  they are too sparse or still noisy.
+- Revisit the turn-and-status cadence and the 10-point default only after real
+  usage shows that they are too sparse or still noisy.
```

### `h:713df5f93df45877` in `SKILL.md`

```diff
-3. Send a routine update only when at least 30 minutes have passed **and** one
-   of these is true: a milestone completed, verified progress rose by at least
-   10 percentage points, or the next action materially changed.
+3. Send a routine update only when turns of work have passed since the previous
+   routine update or the owning ticket changed status, **and** one of these is
+   true: a milestone completed, verified progress rose by at least 10 percentage
+   points, or the next action materially changed. Never estimate elapsed time to
+   open the gate; an estimated clock is an unmeasured claim.
```

## location: A reporting preference is followed within the current task and saved nowhere; a lasting rule is recorded only on the operator's request as a house ruling in the repository's user-owned instruction home in the format .greenline/WORK.md defines, never in a machine-global instruction file, and the next context reads it without a second confirmation; the section that described the global install (SKILL.md and METHODOLOGY.md section 5) now carries this rule under a heading that names it.

Record `fold-2026-09-11`, 2 hunks.

### `h:e38d814025b95f31` in `METHODOLOGY.md`

```diff
-## 5. Global installation
+## 5. Installation and persistence
```

### `h:6846ebb6f0d264e9` in `SKILL.md`

```diff
-## Install globally
+## Persist a preference
```

## scope: The opening paragraph says the skill governs speaking unasked during long owned work (a ticket held at implementing, a multi-milestone build, delegated agents), never on a short answer or two-state work, on a cadence that is judgment; that it also fires the moment the user asks to change how or how often progress is reported, the preference followed within the task and saved nowhere unless the operator asks for a lasting rule; and that progress stays in the conversation with an estimated clock never claimed. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:93dc693bc34cbc87` in `METHODOLOGY.md`

```diff
-The portable default is a global Agent Skills installation:
+The greenline CLI installs this skill; there is no global installation step
+here and no machine-global instruction write. A reporting preference the user
+states is followed within the current task and saved nowhere. When the
+owner asks for a lasting repository rule, record it as a house ruling in
+the repository's user-owned instruction home, in the format
+`.greenline/WORK.md` defines; the next context reads it without a second
+confirmation.
```

## lifecycle: Milestone evidence belongs to the owning ticket's acceptance items and its execution account, so every update quotes that evidence, the update is conversation with no parallel progress file or tracker, and METHODOLOGY.md section 7 keeps no 0/1/2 readiness score (its sixth item scored a global persistence greenline does not perform); the execution contract is the readiness measure.

Record `fold-2026-09-11`, 4 hunks.

### `h:b791b85579c6b278` in `METHODOLOGY.md`

```diff
-Score each item 0, 1, or 2. A usable implementation scores at least 10/12 with
-no zero.
+No readiness score is kept here. Report observable milestone evidence and its
+limits under the execution contract: the owning ticket's acceptance items and
+the witnesses recorded in its account. Global persistence is not a criterion,
+since the greenline CLI installs this skill.
```

### `h:48ae2ad4e7367e7a` in `METHODOLOGY.md`

```diff
-1. Eligibility: the method activates only for qualifying work.
-2. Denominator: milestones are observable and evidence-based.
-3. Honesty: percentages follow completed work and round down.
-4. Cadence: routine updates satisfy both gates.
-5. Clarity: one bar and at most three concise items.
-6. Persistence: global installation preserves unrelated configuration.
-
```

### `h:1643c6e2051a6d16` in `SKILL.md`

```diff
-   Weight by work and risk, not elapsed time.
+   Weight by work and risk, not elapsed time. Where a ticket owns the work, the
+   milestones are its acceptance items and every update quotes their evidence.
```

### `h:422bb63a86bf1432` in `SKILL.md`

```diff
-Keep each update to at most three short items: completed evidence, current
-work, and next step or blocker. End with exactly one overall bar styled as
-inline code on its own line:
+The update is conversation and nothing else: milestone evidence belongs to the
+owning ticket and its execution account, and no parallel progress file or
+tracker is created. Keep each update to at most three short items: completed
+evidence, current work, and next step or blocker. End with exactly one overall
+bar styled as inline code on its own line:
```

## harness: greenline renders its own frontmatter: quoted name and description; the description rewritten without em dashes under the widened rule

Record `descriptions-practice-the-catalog-2026-09-11`, 1 hunk.

### `h:cc5770e1dba9c130` in `SKILL.md`

```diff
-name: progress-check
-license: MIT
-metadata:
-  version: "1.0.1"
-description: >-
-  Give sparse, evidence-based progress updates for long-running agent tasks and
-  projects. Use when work will take more than 15 minutes, spans multiple
-  milestones, involves delegated agents, or when the user asks for progress
-  bars, status cadence, fewer updates, or a global cross-agent progress rule.
-  Not for short answers or tasks with no meaningful intermediate state.
+name: "progress-check"
+description: "Give sparse, evidence-based progress updates during long-running work: observable milestones weighted by work and risk, an update only when something material changed, one rounded-down bar. Fires in the worker moment, a claimed ticket or a multi-milestone build, never for short answers or work with no intermediate state. Also fires the moment the user asks to change how or how often you report progress, whether more updates, total silence or estimated clocks, BEFORE any such preference is saved anywhere."
```

## harness: The greenline CLI installs this skill, so the Install globally mode, its npx skills add command and its native always-on instruction steps are not procedures here and Report progress is the only reporting mode; the mode bullet says so where the mode was introduced, EXAMPLES.md marks the Dogfood log as upstream's own install history rather than a command or a claim about this installation, and the last SKILL.md hunk carries the situational closing line (Durable output: none; applied on its own cadence in the worker moment and the moment the user asks to change the cadence, before any preference is saved). (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:45e0d9912df190a2` in `SKILL.md`

```diff
+This skill governs speaking unasked during long owned work: a ticket you hold
+at implementing, a multi-milestone build, delegated agents running. It never
+fires on a short answer or on work whose only honest states are started and
+finished, and its cadence is judgment, never spam. It also fires the moment the
+user asks to change how or how often you report, whether more updates, silence
+or an estimated clock: follow the preference within the current task, keep
+reporting actionable blockers, and save nothing anywhere unless the owner
+asks for a lasting rule (Persist a preference, below). Progress stays in the
+conversation; the evidence behind it belongs to the owning ticket and its
+execution account, and an estimated clock is an unmeasured claim this skill
+never makes.
+
```

## location: A reporting preference is followed within the current task and saved nowhere; a lasting rule is recorded only on the operator's request as a house ruling in the repository's user-owned instruction home in the format .greenline/WORK.md defines, never in a machine-global instruction file, and the next context reads it without a second confirmation; the section that described the global install (SKILL.md and METHODOLOGY.md section 5) now carries this rule under a heading that names it. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 2 hunks.

### `h:0f2efccd617e33fd` in `SKILL.md`

```diff
-- **Install globally:** only when the user asks to persist this behavior across
-  agents or projects.
+- **Persist a preference:** only when the owner asks for a lasting rule. The
+  greenline CLI installs this skill, so there is no install-globally mode here.
```

### `h:abd205df2e54b7d6` in `SKILL.md`

```diff
-Prefer installing this skill globally through the available Agent Skills CLI
-so one source works across supported agents:
+The greenline CLI installs this skill; there is no global installation step
+here and no machine-global instruction write. A request to change how or how
+often you report is followed within the current task and saved nowhere.
+Persist a preference only when the owner asks for a lasting repository
+rule, as a house ruling in the repository's user-owned instruction home, in the
+format `.greenline/WORK.md` defines. The next context reads that rule without
+demanding a second confirmation.
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:edd65b75bd682bb1` in `agents/openai.yaml`

Removed file, 4 lines.

## Retired

- `h:d41f2558785c8fa0` in `descriptions-practice-the-catalog-2026-09-11`: the description as cut over carried em dashes greenline wrote
- `h:171e822eb6faab33` in `fold-2026-09-11`: the greenline prelude and its support-file paragraph are folded into the body at their steps: the scope paragraph, step 1 and step 3, the mode bullet, and METHODOLOGY.md sections 3, 5, 7 and 8 and EXAMPLES.md's Dogfood log
- `h:82850ad62d364968` in `fold-2026-09-11`: the greenline completion is folded into the body: the conversation-only rule sits at the update format, the preference rule in the Persist a preference section, and the situational closing line ends the skill
- `h:3882ad91e3776adc` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
- `h:7537a0b6bd6475d3` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (harness from fold-2026-09-11) carries to the hunk that replaced it
- `h:76df2c769e8135f7` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (location from fold-2026-09-11) carries to the hunk that replaced it
- `h:1ef0e868465016c7` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (location from fold-2026-09-11) carries to the hunk that replaced it
