---
name: "build-the-lever"
description: "Build the tool that does or proves non-trivial work instead of doing it by hand: a codemod, a script, a generator, a query or a rerunnable check, proved against one unit done by hand and safe to rerun. Use when the work is more than a couple of obvious edits: many similar edits, a migration, an analysis over many files or rows, or a check you would otherwise make by eye."
---

# Build the Lever

build-the-lever is a trial habit, installed only where the workspace's `trials` names it, for the moment the work in front of you is more than a couple of obvious edits: many similar edits, a migration, an analysis over many files or rows, or a check you would otherwise make by eye, at whatever step the work is in, most often build. It writes no record of its own: the section of the step that runs names the lever and the check that proved it, recorded as a check, and since the record relies on the lever, it is committed with the change or, where it should not stay in the code, copied into the change's folder. You build and run the lever yourself, one agent in the one checkout. Making a recurring instruction a durable guardrail is `correct`'s, a trial start, and proving that an output is real is the verify step's.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

When the work isn't trivial, build the tool that does it instead of doing it by hand.

**Why:** Two payoffs. Throughput: a codemod, generator, or script does the work the same way every time and reruns for free. Confidence: the tool is one artifact a reviewer can read and rerun to check the work. Hand-done changes can only be re-verified by redoing them. A deterministic script turns "trust me" into "run this".

**Pattern:** Default to building the lever. Skip it only when the task is trivial, a couple of obvious edits you can see at a glance.

- Do the first unit by hand to learn the recipe, then build the tool. Prove it by rerunning it on that unit and diffing against your hand-done version. Make the lever safe to rerun.
- Codemod or script for edits, generator for repetitive files, a dump-to-sqlite query for analysis, a rerunnable check for verification.
- A deterministic lever beats fan-out. If the tool can process every unit in one pass, run it yourself. Don't fan out delegates to hand-apply what a script can do.
- Applying this principle produces a file. If you cited it and there is no codemod, script, or generator in the diff, you didn't apply it.
- Commit the lever when the work outlives the session.

**Balance:** The bar is triviality, not repetition. A one-off still earns a lever when the lever is what makes the work checkable. Per the ponytail habit, build the smallest script that does or proves the job, never a framework.
