---
name: "verify"
description: "Prove a change's claims with fresh evidence: restate each item of its acceptance so it can fail, capture a baseline and a treatment with the same command, compare the raw artifacts, and return VERIFIED, NOT VERIFIED or INCONCLUSIVE for each, at the depth the change's mode gives the verify step. Use when the mode reaches verify, or when the owner says \"verify this\", \"prove it works\" or \"did this fix it\"."
---

# Verify

Verify proves a change's claims with fresh evidence: each item of its acceptance is restated so it can fail, measured against the state before the change, and given one verdict. It runs where the change's mode reaches the verify step, at the depth the mode gives it, and alone when the owner asks for it by name: "verify this", "prove it works", "did this fix it". Asked for by name with no change open, it verifies the claim the owner states, the result stays in the reply, and its artifacts stay outside the repository. It reads the change record's front matter and its acceptance first: the plan section's acceptance criteria, the ticket's entry in the plan directory's tickets file, or the frame section where the mode skipped the plan. It never fixes what it finds and never explains in place of measuring: a `NOT VERIFIED` item goes back to the build step, the cause of a failure is diagnose's to find, and a general explanation needs authoritative knowledge, not a manufactured repository experiment. The request's grant covers necessary local verification; an external action or spending beyond it remains a decision for the owner.

Verification is not a recap. It proves or disproves a specific claim with repeatable evidence.

## When To Use

- The user asks "verify this", "prove it works", "did this fix it", or "show me the evidence".
- A bug fix needs a before/after repro.
- A UI, CLI, API, performance, or memory claim needs measurement.
- A test passes but the user-visible behavior still needs confirmation.

Do not use this for vague claims like "the code is cleaner". Ask for a measurable claim first.

## Workflow

1. Restate the claim in falsifiable form: condition, metric, and threshold. For a change, each claim is one item of its acceptance, against the change's last commit, whose commits verify's references page says how to list.
2. Pick the smallest local surface that can disprove it.
3. Capture a baseline from the old state: merge base, parent commit, failing branch, or current broken repro.
4. Capture treatment from the changed state with the same command, data, warmup, and environment.
5. Compare raw artifacts: numbers, screenshots, terminal transcripts, HTTP responses, profiles, heap snapshots, or test output.
6. Return exactly one verdict: `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE`.

Reuse the repository's own instruments first. Record each check, as verify's references page says, so that the change's checks hold it with the commit and the tree id it ran on; a check already recorded on the same tree id, at the build step or in an earlier round, is cited rather than run again. A cited check carries its command, its exit code and its tree id, never its output, so a claim whose evidence is the output itself, a failure count or a transcript, is run again. Asked for by name with no change open, run every command plainly and quote its outcome. Capture a baseline at an earlier commit in a copy of that commit, never in the change's working tree: export it with `git archive <commit> | tar -x -C <folder>` into the claim's `baseline/` folder, link in what the command needs and the copy lacks, such as installed dependencies, and run the command there. Once its probes have run and what the verdict relies on is promoted, remove the copy, so that no check of the change, run at the repository root, reads it. Never check out the earlier commit, revert a fix or copy an old file over the change's working tree: it stays as the build left it, its uncommitted work included.

## Checks and probes

A check is a command whose green the change claims on its final code, such as its tests, its linter or its build: every run of it on the change's code is recorded, a red one included, such as the red of the red-green cycle, and its latest run is green before the change is done. A probe is a run whose green the change never claims: a baseline at an earlier commit, a mutation run, a negative control that must fail, a bench's timings. Run a probe plainly and never record it as a check of the change: keep what it showed among the claim's artifacts ("Artifact Layout") and quote its outcome in the verdict. The treatment of a claim on the final code, the baseline's command run there, is a check; a bench's timings stay a probe on both sides. A verifier's check is the change's check like the builder's: the same command run plainly, `npm test` or `node --test`, is a read that proves nothing to the record, and so is one test run plainly again to read why it failed: record it too. The one run left plain is a probe. A probe recorded as a check by mistake is never removed or edited: mark it as verify's references page says, which leaves it out of the change's checks, and say in the verify section why.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

A check recorded on the same tree id is not a previous run in the table's sense: it ran on the final code, and it is cited as that code's evidence.

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

The revert runs in the baseline's copy, never in the change's working tree: put the regression test into the copy of the commit before the fix and run it there, plainly, as a probe that must fail; the restore is the change's own tree, where the test's recorded run is the check.

## The real thing

Verify every task output by checking the real thing directly. Do not infer from proxies, self-reports, or "it compiles."

Check the real thing, not a proxy:
- Check process liveness directly, not indirectly through derived state
- Read the actual value, not a cached or derived representation
- When verification fails, suspect the observation method before suspecting the system

## Script the check when you can

The strongest proof is a deterministic script that re-runs the same comparison, not a one-time eyeball. Write the script, run it, and keep its output as an artifact a reviewer can re-run instead of trusting your word.

## Local Surfaces

- Code behavior: focused unit/integration tests or a minimal repro script.
- CLI/TUI behavior: `references/control-cli.md`, terminal transcript, or demo recording.
- UI behavior: `references/control-ui.md`, screenshots, accessibility snapshots, or browser traces.
- API behavior: local HTTP/RPC request and response diff.
- Performance: same-machine baseline/treatment timings or CPU profiles.
- Memory: heap snapshots before and after the suspected operation.

## Artifact Layout

When safe to write artifacts:

```text
<working folder>/verify/<claim-slug>/
├── claim.md
├── timeline.md
├── baseline/
├── treatment/
├── diff/
└── verdict.md
```

For a change, every probe, scratch script and before-and-after copy goes under the change's working folder, `<working folder>` in this skill's pages, never the host's temporary directory, and a check's facts cite paths inside the repository. The working files are deleted at close, so promote the relied-on instruments and results together, before the verdict is written, to the claim's evidence in the change's folder; an evidence reference into the working files never resolves. Asked for by name with no change open, the artifacts stay outside the repository and no repository file changes.

If artifacts may contain sensitive code, prompts, screenshots, HTTP bodies, or heap data, keep only the minimal inline evidence unless the user agrees to disk storage.

## Verdict Rules

- `VERIFIED`: baseline and treatment differ in the predicted direction, by the claimed threshold, with no obvious confound.
- `NOT VERIFIED`: the behavior is unchanged, moves the wrong way, or misses the threshold.
- `INCONCLUSIVE`: no valid baseline, noisy signal, failed measurement, or an environment difference invalidates the comparison.

## Output

Use this shape:

```text
VERIFIED | NOT VERIFIED | INCONCLUSIVE
Claim: <falsifiable claim>

Evidence:
<metric/artifact>: baseline=<...>, treatment=<...>, delta=<...>, threshold=<...>

Reasoning:
<one tight paragraph naming the evidence and any confounds>
```

Do not soften a negative result. A clear `NOT VERIFIED` is useful.

Lead with the observed result, not an adjective standing in for a measurement.

Write each verdict into the verify section, or into the report where a fresh verifier runs, with its actual baseline, treatment and comparison, the check by its command and the promoted evidence by its path. Keep an unavailable proof explicit.

## Handoff

Consumes: the change record's front matter and its acceptance, the plan section's acceptance criteria, the ticket's entry in the plan directory's tickets.md, or the frame section where the mode skipped the plan; the change's commits by their trailer and the checks greenline check recorded under .greenline/ledger/<id>/checks/
Produces: the verify section of .greenline/ledger/<id>.md, one line at the inline depth, every item with its verdict VERIFIED, NOT VERIFIED or INCONCLUSIVE and its evidence at the written depth, citing the agent's report .greenline/ledger/<id>/verify-1.md at the independent depth; the relied-on evidence under .greenline/ledger/<id>/verify/<claim-slug>/; each NOT VERIFIED item back to the build step; the reply alone when asked for by name with no change open
Next: the next step of the change's mode
