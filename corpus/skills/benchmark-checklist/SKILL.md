---
name: "benchmark-checklist"
description: "Vet a measured number before you report or act on it: name the limiter, check the sides were tuned, do the arithmetic against physical limits, count the errors, run each side at least five times alternating them, weigh the result end to end and confirm the work happened, then report the verdict with the median and the range. Use when a performance or eval number is about to be reported, or to decide a choice."
---

# Benchmark checklist

benchmark-checklist is a trial habit, installed only where the workspace's `trials` names it, for the moment a performance or eval number is about to be reported, or to decide a choice: a library or configuration choice at frame, a performance regression in diagnose, a speedup or a regression at verify. It writes no record of its own: the number goes into the section of the step that measured it, with its run count, its range and its limiter, and the runs it reports are checks, run as the verify step runs its own. For a measured number its alternating runs replace the verify step's single baseline then treatment; every other claim keeps the verify step's method. Proving that an output is real is the verify step's, and finding the cause of a regression is diagnose's.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Use this when you produce a performance number: a PR's before and after, a regression claim, a hillclimb harness, or a library or config choice.

**Why:** A run that went wrong still prints a plausible number. Requests that failed, a cache that skipped the work, code that never ran, a side left on default settings, and run-to-run noise all produce results that look fine. If you cannot say why the number is not twice as good, you do not know what you measured.

Answer each question below with evidence from a run, not from a guess about the code.

For a quick ballpark the user asked for, one run is enough. Still check questions 4 and 7, and say that it is one run. Skip the rest unless that run looks wrong. A choice between options is never a ballpark.

## Before you run anything

- Write down the claim you expect to make, in the words you would ship ("export is 30% faster at p50 on the 60k-row dataset"). The questions test that sentence.
- Read the measurement script. Note what it times, what it counts, and what it ignores.
- Check the load average with `uptime` and the core count with `nproc`. If the machine is busy, find out what is running. If you cannot stop it, interleave the sides so both see the same noise, and say so in the report.

## The questions

1. **Why not double?** Name the limiter. Profile in a run you do not report, because profilers and tracers slow the work down. Use CPU per process (`top`, `pidstat`), a profiler for the runtime (`node --cpu-prof`, `py-spy`, `perf`), I/O wait, and syscall counts (`strace -c` on Linux). Then map the hot spot to source. Watch the load generator too. If it saturates first, you measured the load generator. If a change did not move the number, the limiter explains why, so find it before you call the change useless.
2. **Was it tuned?** Run every side the way production runs it: release builds, production flags and env, batching and transaction settings, connection pools, caches as warm or cold as production sees them, and the same versions and data. If one side runs on defaults, you compared configurations, not implementations. A limiter that is a setting, such as a commit per row, a debug build, or a missing index, means that side is untuned. Tune it and measure again before you pick a winner. If you cannot tune it, do not pick a winner from that run. Narrowing the claim to the code as it ships today does not fix this when the user is choosing what to adopt, because they adopt the option, not today's settings.
3. **Did it break limits?** Do the arithmetic. Compare bytes per second with disk and network bandwidth, and operations per second times the cost per operation with the cores you have. Compare the time saved with the time the changed piece took. Removing a piece that takes 10% of the run can make the run at most about 11% faster. A result past a limit means the run measured something other than the work, such as a cache, a no-op, or a bug.
4. **Did it error?** Count failures and non-success responses, and check that the outputs are correct, not just present. Errors behave differently from successes. Rejections are often fast, and timeouts and retries are slow. If the script does not count errors, add the count.
5. **Does it reproduce?** Run each side at least 5 times, and alternate the sides (A, B, A, B, and so on) so that warmup, lazy initialization, caches, and drift do not favor one side. Report the median and the range. Treat a gap smaller than the run-to-run variation as no measurable difference. When the call is close, use a rank-sum test or the harness's own statistics.
6. **Does it matter?** Next to any micro result, measure the end-to-end path a user waits on, with realistic data sizes and concurrency. Report the micro result as a share of the whole. A helper that takes 1% of a request can make the request at most 1% faster, however fast the helper gets.
7. **Did it even happen?** Confirm the work ran inside the timed region. The request reached the server, the rows were written, the bytes were read, and the code used the result. Lazy code (generators nobody iterates, promises nobody awaits, results the JIT can discard) and timeouts all produce numbers for work that never happened.

For an eval result, ask the same of the trials: did every run do the task, does the gap hold across trials and models, and does the scenario matter.

## Report

- Lead with the verdict: faster, slower, no measurable difference, or inconclusive.
- Give the number with its unit, the run count, the range, and the limiter. For example, "p50 41 ms → 33 ms, median of 7 runs per side, range 32 to 35 ms after, bound by JSON parsing on one core."
- Call the verdict inconclusive when you claim a difference but cannot name the limiter, when a side ran untuned, or when you could not check questions 4 and 7. Name the gap.
- Keep a PR body to one primary number. Put the runs, the range and the limiter evidence in the claim's evidence in the change's folder, as the verify step promotes its evidence, and cite them from the step's section.

In the verify step the verdict is one of its three: faster or slower as the claim predicts is `VERIFIED`, the other direction, or no measurable difference where the claim named one, is `NOT VERIFIED`, and inconclusive is `INCONCLUSIVE`.

You skipped this when the evidence behind a number has no run count, no spread, or no named limiter, or when the time saved is larger than the time the changed piece took.
