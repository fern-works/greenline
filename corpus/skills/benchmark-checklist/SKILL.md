---
name: "benchmark-checklist"
description: "Vet a measured number before you report or act on it: name the limiter, check the sides were tuned, do the arithmetic against physical limits, count the errors, run each side at least five times alternating them, weigh the result end to end and confirm the work happened, then report the verdict with the median and the range. Use when a performance or eval number is about to be reported, or to decide a choice, and when the owner wants it faster or a benchmark file is touched."
---

# Benchmark checklist

benchmark-checklist is a trial habit, installed only where the workspace's `trials` names it, for the moment a performance or eval number is about to be reported, or to decide a choice: a library or configuration choice at frame, a performance regression in diagnose, a speedup or a regression at verify. It writes no record of its own: the number goes into the section of the step that measured it, with its run count, its range and its limiter, and the runs it reports are checks, run as the verify step runs its own. For a measured number its alternating runs replace the verify step's single baseline then treatment; every other claim keeps the verify step's method. Proving that an output is real is the verify step's, and finding the cause of a regression is diagnose's.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the first run, read [method.md](method.md): what to settle before you run anything, the questions every number answers, and the report.
