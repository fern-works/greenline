---
name: "verify-this"
description: "Verify a claim with fresh local evidence: restate it falsifiably, capture baseline and treatment, compare artifacts, and return VERIFIED, NOT VERIFIED, or INCONCLUSIVE."
---

# Verify This

This skill proves one claim. A ticket at verifying supplies its acceptance and exact result; a standalone request supplies a measurable claim of its own. It fires on "verify this", "prove it works", "did this fix it", and at the handoff from delivery-review. The harness, when the surface needs one, is control-cli's or control-ui's, and a simple captured invocation is often enough; the cause of a failure is diagnosing-bugs' to find; the durable decision at close is record-architecture-decisions'. It never explains in place of measuring: a general explanation needs authoritative knowledge, not a manufactured repository experiment. The request's grant covers necessary local verification; an external action or spending beyond it remains a decision for the owner.

Verification is not a recap. It proves or disproves a specific claim with repeatable evidence.

## When To Use

- The user asks "verify this", "prove it works", "did this fix it", or "show me the evidence".
- A bug fix needs a before/after repro.
- A UI, CLI, API, performance, or memory claim needs measurement.
- A test passes but the user-visible behavior still needs confirmation.

Do not use this for vague claims like "the code is cleaner". Ask for a measurable claim first.

## Workflow

1. Restate the claim in falsifiable form: condition, metric, and threshold. For a ticket, the claim is an acceptance item against its exact `result_commit`.
2. Pick the smallest local surface that can disprove it, reusing the repository's own instruments first.
3. Capture a baseline from the old state: merge base, parent commit, the ticket's `base_commit`, failing branch, or current broken repro.
4. Capture treatment from the changed state with the same command, data, warmup, and environment.
5. Compare raw artifacts: numbers, screenshots, terminal transcripts, HTTP responses, profiles, heap snapshots, or test output.
6. Return exactly one verdict: `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE`.

## Local Surfaces

- Code behavior: focused unit/integration tests or a minimal repro script.
- CLI/TUI behavior: `control-cli`, terminal transcript, or demo recording.
- UI behavior: `control-ui`, screenshots, accessibility snapshots, or browser traces.
- API behavior: local HTTP/RPC request and response diff.
- Performance: same-machine baseline/treatment timings or CPU profiles.
- Memory: heap snapshots before and after the suspected operation.

## Artifact Layout

When safe to write artifacts, during authorized repository work:

```text
.greenline/tmp/verify-this/<claim-slug>/
├── claim.md
├── timeline.md
├── baseline/
├── treatment/
├── diff/
└── verdict.md
```

Promote the relied-on instruments and results together, before handoff, to `.greenline/work/evidence/<work-id>/verify-this/<claim-slug>/` for a ticket's verification, or to `.greenline/ledger/evidence/<contribution>/verify-this/<claim-slug>/` for standalone upkeep; an evidence reference into the scratch directory never resolves. A read-only request keeps its artifacts outside the repository and leaves repository files unchanged.

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

Do not soften a negative result. A clear `NOT VERIFIED` is useful. Lead with the observed result, not an adjective standing in for a measurement.

Record the verdict with its actual baseline, treatment and measured comparison where the work owns them: the promoted evidence, linked from the ticket, and this contribution's account as `.greenline/ledger/README.md` defines it, whose `checks` reference the instruments beside their output. Cite a shared measurement rather than claiming a separate run, keep an unavailable proof explicit, and leave earlier completed review records as history. `NOT VERIFIED` returns the affected work to implementation; `INCONCLUSIVE` remains an explicit proof limit; `VERIFIED`, with the required independent review already supported, lets the request holder complete the ticket within its grant. A read-only request reports the evidence without repository writes.

## Handoff

Consumes: the ticket at verifying, its acceptance and exact result_commit
Produces: the verdict VERIFIED, NOT VERIFIED or INCONCLUSIVE with claim, baseline, treatment, diff and verdict files under .greenline/work/evidence/<work-id>/verify-this/<claim-slug>/ or .greenline/ledger/evidence/<contribution>/verify-this/<claim-slug>/; NOT VERIFIED returns the ticket to implementing
Next: the request holder completes the ticket; record-architecture-decisions and the decisions book close it
