# control-ui: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cursor/plugins at f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d, `cursor-team-kit/skills/control-ui`. Drift: 20 of 109 lines changed (18%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, roster-keepers-2026-09-15, roster-keepers-fix-2026-09-15.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:6ce2d1749bb00dad` in `SKILL.md`

```diff
-name: control-ui
-description: Build or adapt a local browser/CDP harness to drive and inspect a web, IDE, or Electron UI. Use for local UI verification, screenshots, accessibility snapshots, perf profiles, visual diffs, or reproducing UI bugs.
+name: "control-ui"
+description: "Build or adapt a local browser harness to drive and inspect a web, IDE, or Electron UI. Use to click through the app, check it in the browser, take screenshots or accessibility snapshots, capture perf profiles, or reproduce a UI bug."
```

## lifecycle: the opening paragraph and the Handoff name the same three dispatchers, verify-this, diagnosing-bugs and product-description, and the stages the capture returns to, so the chain closes; carried from roster-keepers-2026-09-15 (J-8's fix, 2026-09-15)

Record `roster-keepers-fix-2026-09-15`, 1 hunk.

### `h:3cebe4f77e1fb7d6` in `SKILL.md`

```diff
+verify-this, diagnosing-bugs or product-description dispatches this method when its verdict needs a screenshot, an accessibility snapshot, a trace or a profile; the capture goes back to that stage as evidence, and the verdict stays there. Reuse an existing local UI harness before assembling one. Screenshots and traces support a verdict; they do not decide it.
+
```

## location: Upstream's /tmp screenshot paths become greenline's scratch home in place: the two sample probes write under .greenline/tmp/control-ui/, the interaction loop saves before/after artifacts there, and one guardrail states that a new disposable instrument and its captures live there, are promoted to the owner's evidence home when the requesting verdict relies on them, and stay outside the repository for a read-only request; browser interaction and privacy rules are untouched.

Record `fold-2026-09-11`, 4 hunks.

### `h:8d9711df2d0c0158` in `SKILL.md`

```diff
-await page.screenshot({ path: "/tmp/ui-harness-after.png", fullPage: true });
+await page.screenshot({ path: ".greenline/tmp/control-ui/ui-harness-after.png", fullPage: true });
```

### `h:f707a0e3db4fc06f` in `SKILL.md`

```diff
-await page.screenshot({ path: "/tmp/ui-harness-cdp.png", fullPage: true });
+await page.screenshot({ path: ".greenline/tmp/control-ui/ui-harness-cdp.png", fullPage: true });
```

### `h:52d7511a516a4aa0` in `SKILL.md`

```diff
-6. Save artifacts for before/after comparisons when the user asked for proof.
+6. Save artifacts under `.greenline/tmp/control-ui/` for before/after comparisons when the user asked for proof, and promote the ones the requesting verdict relies on to the owner's evidence home.
```

### `h:c10a9ac2894bcf59` in `SKILL.md`

```diff
+- Keep a new disposable instrument and its captures in `.greenline/tmp/control-ui/`. That directory is not durable proof: promote a relied-on capture and its instrument to the owner's evidence home before closing. A read-only request keeps them outside the repository.
```

## lifecycle: The Handoff section names what this support skill consumes, the evidence it produces, its scratch and promoted homes, and the stages it returns to, product-description among them since it dispatches the verification pass, so the chain closes; carried from fold-2026-09-11 (J-8, 2026-09-15)

Record `roster-keepers-2026-09-15`, 1 hunk.

### `h:a274488189d665aa` in `SKILL.md`

```diff
+
+## Handoff
+
+Consumes: the surface under test and the question the requesting stage needs answered
+Produces: screenshots, snapshots, logs, traces or profiles with the instrument that made them, as evidence for the requester's verdict
+Evidence at: .greenline/tmp/control-ui/, promoted to .greenline/work/evidence/<work-id>/ or .greenline/ledger/evidence/<contribution>/ when the result relies on it
+Returns to: verify-this, diagnosing-bugs or product-description
```

## Retired

- `h:5f72d561a6e4c213` in `fold-2026-09-11`: The prelude is folded into the body: its path replacements were made in the samples themselves, its harness reuse rule became the opening scope paragraph, and its promotion rule became a guardrail.
- `h:00fa381e7e16ac5f` in `fold-2026-09-11`: The completion is folded into the body: captures support a verdict without deciding it in the scope paragraph, promotion in the interaction loop and the guardrail, and the return in the Handoff section.
- `h:8ff9917b9201ef31` in `roster-keepers-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8, 2026-09-15)
- `h:e21ae79ded28d256` in `roster-keepers-fix-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8's fix, 2026-09-15)
