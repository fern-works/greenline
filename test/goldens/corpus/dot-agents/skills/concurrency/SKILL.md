---
name: "concurrency"
description: "Decide whether code should be concurrent, reason about a concurrent design by its timelines, separate shared state before serializing it, and make an operation converge when a crash, a restart or a retry runs it twice, an idempotency key derived from the intent and claimed atomically. Use when adding threading, async, goroutines, workers or parallelism; when a race or an ordering bug appears, or the owner asks whether something can happen twice or at once; when two actors may write the same file, key or branch; and when a command, a step or a loop must survive crashes, restarts and retries."
---

# Concurrency

concurrency is the habit for the moment code is made concurrent or a race or an ordering bug appears, two actors may write the same state, or an operation must survive a crash, a restart or a retry, at whatever step the work is in, most often build. It writes no record of its own. Concurrency is a floor in AGENTS.md: found before the mode is proposed, it raises the proposal to the mode that floor names, and found later it is reported. Sections 1 to 5 reason about concurrent code; section 6 makes an operation that may run twice converge.

Three questions in order: whether concurrency is warranted, how to
reason about the design, and which laws hold whatever the runtime is
called. The last two are wasted on a program that failed the first.

Before the first concurrent line, read [method.md](method.md): the decision whose default is no, the timelines, the ladder, the laws, the primitives and the operations that run twice.
