---
name: "sweep-tests"
description: "Prune or audit a test suite with mutation proof, as its own announced task on a green suite. Invoke it by name when tests break on refactors that change no behavior, coverage is high but defects still ship, or production code carries seams only tests use, and when the owner asks to prune or audit the tests or names flaky or slow tests."
---

# Test value sweep

Sweep tests is the start for a test suite that needs pruning or an audit. A red check goes to diagnose. It deletes nothing it has not proved by mutation, adds no test, and never certifies its own review without naming that limit.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the gate, read [method.md](method.md): its own change, the review's reach, the gate, the proof of each deletion, the report, the batches, the seams and what not to do.

## Handoff

Consumes: a green suite and the request to sweep it
Produces: the before and after mutation results at different paths, the deletion and seam table, and the baselines and kills, in the change's folder under .greenline/ledger/<id>/; the sweep committed as the change's build
Next: frame, under the mode the owner approves; the sweep is the change's build, and review and verify follow at the depths its mode gives
