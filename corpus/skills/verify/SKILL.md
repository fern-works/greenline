---
name: "verify"
description: "Prove a change's claims with fresh evidence: restate each item of its acceptance so it can fail, capture a baseline and a treatment with the same command, compare the raw artifacts, and return VERIFIED, NOT VERIFIED or INCONCLUSIVE for each, at the depth the change's mode gives the verify step. Use when the mode reaches verify, or when the owner says \"verify this\", \"prove it works\" or \"did this fix it\"."
---

# Verify

Verify proves a change's claims with fresh evidence: each item of its acceptance is restated so it can fail, measured against the state before the change, and given one verdict. The request's grant covers necessary local verification; an external action or spending beyond it remains a decision for the owner.

Before the first claim is measured, read [method.md](method.md): what it reads first, the workflow, checks and probes, the real thing, the artifacts and the verdict's rules.

## Handoff

Consumes: the change record's front matter and its acceptance, the plan section's acceptance criteria, the ticket's entry in the plan directory's tickets.md, or the frame section where the mode skipped the plan; the change's commits by their trailer and the checks greenline check recorded under .greenline/ledger/<id>/checks/
Produces: the verify section of .greenline/ledger/<id>.md, one line at the inline depth, every item with its verdict VERIFIED, NOT VERIFIED or INCONCLUSIVE and its evidence at the written depth, citing the agent's report .greenline/ledger/<id>/verify-1.md at the independent depth; the relied-on evidence under .greenline/ledger/<id>/verify/<claim-slug>/; each NOT VERIFIED item back to the build step; the reply alone when asked for by name with no change open
Next: the next step of the change's mode
