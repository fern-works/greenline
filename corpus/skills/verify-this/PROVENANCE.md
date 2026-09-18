# verify-this: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cursor/plugins at f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d, `cursor-team-kit/skills/verify-this`. Drift: 26 of 74 lines changed (35%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, vocabulary-owner-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:ed8f50a65b0cb2be` in `SKILL.md`

```diff
-name: verify-this
+name: "verify-this"
```

## scope: one opening paragraph in the skill's voice: proves one claim, a ticket at verifying's acceptance against its exact result or a standalone measurable claim; fires on 'verify this', 'prove it works', 'did this fix it' and the handoff from delivery-review; control-cli and control-ui supply a harness when needed, diagnosing-bugs the cause, record-architecture-decisions the decision at close; never explains in place of measuring; the grant covers local verification, not external actions or spending (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:64b45387fb39791d` in `SKILL.md`

```diff
+This skill proves one claim. A ticket at verifying supplies its acceptance and exact result; a standalone request supplies a measurable claim of its own. It fires on "verify this", "prove it works", "did this fix it", and at the handoff from delivery-review. The harness, when the surface needs one, is control-cli's or control-ui's, and a simple captured invocation is often enough; the cause of a failure is diagnosing-bugs' to find; the durable decision at close is record-architecture-decisions'. It never explains in place of measuring: a general explanation needs authoritative knowledge, not a manufactured repository experiment. The request's grant covers necessary local verification; an external action or spending beyond it remains a decision for the owner.
+
```

## lifecycle: for a ticket the claim is an acceptance item against its exact result_commit, the baseline may be its base_commit, and the repository's own instruments are reused first; the verdict is recorded with its baseline, treatment and comparison in the promoted evidence and this contribution's account with checks beside their output, citing shared measurements; NOT VERIFIED returns the work to implementation, INCONCLUSIVE stays an explicit limit, VERIFIED with review supported lets the request owner complete the ticket; the Handoff section names consumes, produces and next

Record `fold-2026-09-11`, 1 hunk.

### `h:3ac5563ea9264912` in `SKILL.md`

```diff
-1. Restate the claim in falsifiable form: condition, metric, and threshold.
-2. Pick the smallest local surface that can disprove it.
-3. Capture a baseline from the old state: merge base, parent commit, failing branch, or current broken repro.
+1. Restate the claim in falsifiable form: condition, metric, and threshold. For a ticket, the claim is an acceptance item against its exact `result_commit`.
+2. Pick the smallest local surface that can disprove it, reusing the repository's own instruments first.
+3. Capture a baseline from the old state: merge base, parent commit, the ticket's `base_commit`, failing branch, or current broken repro.
```

## location: upstream's OS temp layout is rooted at .greenline/tmp/verify-this/<claim-slug>/ during authorized repository work and promoted before handoff to .greenline/work/evidence/<work-id>/verify-this/<claim-slug>/ or .greenline/ledger/evidence/<contribution>/verify-this/<claim-slug>/, since an evidence reference into scratch never resolves; a read-only request keeps its artifacts in the system's temporary directory and writes nothing to the repository

Record `fold-2026-09-11`, 2 hunks.

### `h:421cf087c6d71ef9` in `SKILL.md`

```diff
-When safe to write artifacts:
+When safe to write artifacts, during authorized repository work:
```

### `h:03870ec841082f2d` in `SKILL.md`

```diff
-/tmp/verify-this/<claim-slug>/
+.greenline/tmp/verify-this/<claim-slug>/
```

## location: promotion of instruments and results to the work or ledger evidence home before handoff; a read-only request keeps its artifacts outside the repository, as control-cli and control-ui say for the same case

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:254bee76b7ce4f65` in `SKILL.md`

```diff
+Promote the relied-on instruments and results together, before handoff, to `.greenline/work/evidence/<work-id>/verify-this/<claim-slug>/` for a ticket's verification, or to `.greenline/ledger/evidence/<contribution>/verify-this/<claim-slug>/` for standalone upkeep; an evidence reference into the scratch directory never resolves. A read-only request keeps its artifacts outside the repository and leaves repository files unchanged.
+
```

## lifecycle: for a ticket the claim is an acceptance item against its exact result_commit, the baseline may be its base_commit, and the repository's own instruments are reused first; the verdict is recorded with its baseline, treatment and comparison in the promoted evidence and this contribution's account with checks beside their output, citing shared measurements; NOT VERIFIED returns the work to implementation, INCONCLUSIVE stays an explicit limit, VERIFIED with review supported lets the request owner complete the ticket; the Handoff section names consumes, produces and next (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:1f47d8eb654e0ae0` in `SKILL.md`

```diff
-Do not soften a negative result. A clear `NOT VERIFIED` is useful.
+Do not soften a negative result. A clear `NOT VERIFIED` is useful. Lead with the observed result, not an adjective standing in for a measurement.
+
+Record the verdict with its actual baseline, treatment and measured comparison where the work owns them: the promoted evidence, linked from the ticket, and this contribution's account as `.greenline/ledger/README.md` defines it, whose `checks` reference the instruments beside their output. Cite a shared measurement rather than claiming a separate run, keep an unavailable proof explicit, and leave earlier completed review records as history. `NOT VERIFIED` returns the affected work to implementation; `INCONCLUSIVE` remains an explicit proof limit; `VERIFIED`, with the required independent review already supported, lets the request holder complete the ticket within its grant. A read-only request reports the evidence without repository writes.
+
+## Handoff
+
+Consumes: the ticket at verifying, its acceptance and exact result_commit
+Produces: the verdict VERIFIED, NOT VERIFIED or INCONCLUSIVE with claim, baseline, treatment, diff and verdict files under .greenline/work/evidence/<work-id>/verify-this/<claim-slug>/ or .greenline/ledger/evidence/<contribution>/verify-this/<claim-slug>/; NOT VERIFIED returns the ticket to implementing
+Next: the request holder completes the ticket; record-architecture-decisions and the decisions book close it
```

## Retired

- `h:0d343beacedbe3ea` in `fold-2026-09-11`: the prelude folded into the body at its step: the ticket's acceptance and result in the workflow, the scratch and evidence homes in the artifact layout
- `h:8c3aa9db32a9233b` in `fold-2026-09-11`: the completion folded into the body at its step: the verdict's record and its effect on the ticket in the output section, the handoff in the Handoff section
- `h:1c78d40d7cffb1cc` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:a0a1eeb4cd4a64cf` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
- `h:db99aed12c64a0a5` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-2026-09-11) carries to the hunk that replaced it
