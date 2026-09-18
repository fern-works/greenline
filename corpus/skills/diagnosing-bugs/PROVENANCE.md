# diagnosing-bugs: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/diagnosing-bugs`. Drift: 34 of 185 lines changed (18%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, series-s7-roster-2026-09-11, roster-keepers-2026-09-15, light-path-negative-2026-09-15.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:b22d0c9f3bd0ecc4` in `SKILL.md`

```diff
-name: diagnosing-bugs
-description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
+name: "diagnosing-bugs"
+description: "Diagnosis loop for hard bugs and performance regressions. Use when the user says \"diagnose\"/\"debug this\", or reports something broken/throwing/failing/slow."
```

## scope: the opening paragraph: a repair no ticket owns gets a compact ticket except on the block's light path (one source file and its test, no open choice, a failing test that already names it if there is one; a red test that does not name the change, or an instruction the change cannot keep, makes it not light), matching implement; carried from roster-keepers-2026-09-15 (J-13, 2026-09-15)

Record `light-path-negative-2026-09-15`, 1 hunk.

### `h:ca094dcceac4f528` in `SKILL.md`

```diff
+The router or the request names this stage when a red or flake resists first read, or when something is broken, throwing, failing or slow. If a ticket owns the failure, read it first and keep its `acceptance:` items in view: the tight reproduction loop you build is the evidence the ticket's completion will cite. A code repair no ticket owns gets a compact ticket, except on the light path (one source file and its test, no open choice, a failing test that already names it if there is one; a red test that does not name the change, or an instruction the change cannot keep, makes it not light); a diagnosis-only request returns its findings in the reply and writes nothing to the repository. Where the loop drives a CLI or a browser, control-cli and control-ui build the harness: this method owns the diagnosis, they own the surface it runs against. A credential in a captured artifact is airgap-secrets' concern. The repair is not reviewed here: it takes the ticket through delivery-review and verify-this like any other change.
+
```

## dependency: The Redact section's practice is airgap-secrets'; when a captured artifact already carries a credential that skill owns the revoke-first response, so the reader is sent there at the point the leak is noticed rather than left with redaction alone.

Record `fold-2026-09-11`, 1 hunk.

### `h:ff8ab5556decb18d` in `SKILL.md`

```diff
+A credential that already sits in a captured artifact has leaked: airgap-secrets owns the revoke-first response, so load it before going on.
+
```

## dependency: Loop options 3 and 4 name the roster skills that build the CLI and browser harness, control-cli and control-ui, at the point the reader chooses them: this method owns the diagnosis, they own the surface it runs against.

Record `fold-2026-09-11`, 1 hunk.

### `h:7375a6e8810c9220` in `SKILL.md`

```diff
-3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
-4. **Headless browser script** (Playwright / Puppeteer) that drives the UI and asserts on DOM/console/network.
+3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot; control-cli builds the harness when the CLI is interactive.
+4. **Headless browser script** (Playwright / Puppeteer) that drives the UI and asserts on DOM/console/network; control-ui builds the harness.
```

## location: A throwaway harness is built under .greenline/tmp/diagnosing-bugs/, greenline's git-ignored scratch home, named at the step that builds it.

Record `fold-2026-09-11`, 1 hunk.

### `h:ecb84c11994b1135` in `SKILL.md`

```diff
-6. **Throwaway harness.** Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call.
+6. **Throwaway harness.** Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call, under `.greenline/tmp/diagnosing-bugs/`, which git ignores.
```

## dependency: scripts/hitl-loop.template.sh is this skill's own support file, installed beside SKILL.md and never at the repo root, so the pointer says where the installed file is.

Record `fold-2026-09-11`, 1 hunk.

### `h:559f82f5e6f7cd13` in `SKILL.md`

```diff
-10. **HITL bash script.** Last resort. If a human must click, drive _them_ with `scripts/hitl-loop.template.sh` so the loop is still structured. Captured output feeds back to you.
+10. **HITL bash script.** Last resort. If a human must click, drive _them_ with `scripts/hitl-loop.template.sh`, installed beside this SKILL.md, so the loop is still structured. Captured output feeds back to you.
```

## location: The captured symptom is kept in the owning ticket's evidence home, .greenline/work/evidence/TKT-NNN/, at the step that captures it, so later phases and the ticket's completion can cite it.

Record `fold-2026-09-11`, 1 hunk.

### `h:db273b870fdf6d3b` in `SKILL.md`

```diff
-- [ ] You have captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix actually addresses it.
+- [ ] You have captured the exact symptom (error message, wrong output, slow timing) in the owning ticket's evidence home, `.greenline/work/evidence/TKT-NNN/`, so later phases can verify the fix actually addresses it.
```

## lifecycle: The fix and its regression test are the owning ticket's implementation and take its normal path through delivery-review and verify-this, stated at the end of Phase 5 where the fix is applied.

Record `fold-2026-09-11`, 1 hunk.

### `h:05af32b5d06c9f7f` in `SKILL.md`

```diff
+The fix and its test are the owning ticket's implementation and take its normal path: delivery-review, then verify-this.
+
```

## method: upstream's Phase 6 has no slot for the seam finding Phase 5 flags; greenline adds a required checklist item that carries it into the ticket, which adds a step (the approved patch of 2026-08-26, re-kinded from lifecycle) Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:cb3f1bb9f77080c9` in `SKILL.md`

```diff
+- [ ] A missing correct seam flagged in Phase 5 is routed to `record-architecture-decisions`: the architecture that blocks the lock-down is the finding to record
```

## location: Phase 6's 'clearly-marked debug location' is .greenline/tmp/diagnosing-bugs/, which the sweep empties after relied-on instruments are promoted to .greenline/work/evidence/TKT-NNN/; the commit / PR message becomes the commit message and the owning ticket, greenline's record of the work; the Handoff section (ADR 0039) names the ticket consumed, the evidence produced and the review and verification stages that follow.

Record `fold-2026-09-11`, 1 hunk.

### `h:c35fe78e21763e54` in `SKILL.md`

```diff
-- [ ] Throwaway prototypes deleted (or moved to a clearly-marked debug location)
-- [ ] The hypothesis that turned out correct is stated in the commit / PR message, so the next debugger learns
+- [ ] Throwaway probes and harnesses deleted from `.greenline/tmp/diagnosing-bugs/`, after any instrument the ticket's evidence relies on is promoted to `.greenline/work/evidence/TKT-NNN/`
+- [ ] The hypothesis that turned out correct is stated in the commit message and on the owning ticket, so the next debugger learns
+
+## Handoff
+
+Consumes: the owning ticket and its acceptance items, or a diagnosis-only request
+Produces: reproduction, causal evidence and regression proof under .greenline/work/evidence/TKT-NNN/ and in the ticket's account; a code repair on the ticket, status implementing then implemented
+Next: delivery-review reads the ticket, its account and base_commit..result_commit, then verify-this checks acceptance; a diagnosis-only request returns its findings in the reply
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:a766c8d8fe46f715` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:fbe49986ddb8db53` in `fold-2026-09-11`: The prelude is folded into the body: the ticket and acceptance rule became the opening scope paragraph, the hitl script location went into loop option 10, the probe home into loop option 6 and the Phase 6 sweep, the control-cli and control-ui deferral into loop options 3 and 4, and the airgap-secrets deferral into the Redact section.
- `h:c2bed51efaa4b452` in `fold-2026-09-11`: The completion is folded into the body: evidence with the ticket sits in Phase 2 and Phase 6, the compact-ticket and diagnosis-only rules in the scope paragraph, the review and verification contract at the end of Phase 5 and in the Handoff section.
- `h:9450bf65c95c12fb` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:cb3f1bb9f77080c9` in `fold-walk-2026-09-11`: re-kinded from lifecycle to method
- `h:cb3f1bb9f77080c9` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
- `h:9343b2804912f378` in `roster-keepers-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8, 2026-09-15)
- `h:2f247bf939a281b9` in `light-path-negative-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-13, 2026-09-15)
