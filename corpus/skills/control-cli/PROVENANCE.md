# control-cli: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cursor/plugins at f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d, `cursor-team-kit/skills/control-cli`. Drift: 17 of 109 lines changed (16%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:1e182b7d9db22ee0` in `SKILL.md`

```diff
-name: control-cli
-description: Build or adapt a local harness to drive, inspect, and profile an interactive CLI or TUI without external services. Use for CLI UX checks, startup regressions, memory leaks, hangs, prompt flows, or terminal demos.
+name: "control-cli"
+description: "Build or adapt a local harness to drive, inspect, and profile an interactive CLI or TUI without external services. Use to drive a CLI end to end, reproduce a terminal bug, chase startup regressions, memory leaks, hangs, or prompt flows, or record a terminal demo."
```

## scope: The skill's scope opens the body in its own voice: verify-this, diagnosing-bugs or product-description's phase 5 dispatches it when a verdict needs a transcript, timing or profile, the capture returns as evidence while the verdict stays with the requester, the repo's own harness comes first, and a non-interactive command needs no tmux session, PTY probe or fixture.

Record `fold-2026-09-11`, 1 hunk.

### `h:eea4913785cc49a2` in `SKILL.md`

```diff
+verify-this, diagnosing-bugs or product-description's phase 5 dispatches this method when its verdict needs a terminal transcript, a timing or a profile; the capture goes back to that stage as evidence, and the verdict stays there. Prefer the repo's own harness wherever one exists and assemble a new one only when none does. When the command under test is non-interactive, a plain captured invocation is the harness: no tmux session, no PTY probe, no fixture.
+
```

## location: Upstream's /tmp becomes greenline's scratch home in place: the harness and its captures live in .greenline/tmp/control-cli/ unless the repo has its own harness, are promoted to the owner's evidence home when the requesting verdict relies on them because the scratch directory is not durable proof, and a read-only request keeps them outside the repository.

Record `fold-2026-09-11`, 2 hunks.

### `h:d4f1a3b3a190d1db` in `SKILL.md`

```diff
-7. Save the transcript and any profile artifacts.
+7. Save the transcript and any profile artifacts under `.greenline/tmp/control-cli/`, and promote the ones the requesting verdict relies on to the owner's evidence home.
```

### `h:577bfa7de9cb18eb` in `SKILL.md`

```diff
-- Keep the harness in `/tmp` unless the repo already has a testing/demo harness.
+- Keep the harness in `.greenline/tmp/control-cli/` unless the repo already has a testing/demo harness. That directory is not durable proof: promote a relied-on instrument and its capture to the owner's evidence home before closing. A read-only request keeps its instrument and capture outside the repository.
```

## lifecycle: The Handoff section (ADR 0039) names what this support skill consumes, the evidence it produces, its scratch and promoted homes, and the stages it returns to, so the chain closes.

Record `fold-2026-09-11`, 1 hunk.

### `h:f9ba69fd5ed1e337` in `SKILL.md`

```diff
+
+## Handoff
+
+Consumes: the command under test and the question the requesting stage needs answered
+Produces: a transcript, timing or profile with the instrument that made it, as evidence for the requester's verdict
+Evidence at: .greenline/tmp/control-cli/, promoted to .greenline/work/evidence/<work-id>/ or .greenline/ledger/evidence/<contribution>/ when the result relies on it
+Returns to: verify-this or diagnosing-bugs, or product-description's phase 5
```

## Retired

- `h:defdd2751bd76467` in `fold-2026-09-11`: The prelude is folded into the body: its harness preference and non-interactive rule became the opening scope paragraph, and its /tmp replacement was made in the guardrail itself.
- `h:59112ee344092c28` in `fold-2026-09-11`: The completion is folded into the body: the transcript-is-evidence rule sits in the scope paragraph, promotion in the save step and the guardrail, and the return in the Handoff section.
