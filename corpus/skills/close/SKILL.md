---
name: "close"
description: "Close a change: record the durable decisions it surfaced as ADRs in the repository's decision home, write down the terms it settled, audit the record's claims against the change's commits and checks, set the record's state, \"next\" line and cost, and offer the landing of the change's branch, at the depth the change's mode gives the close step. Use when the mode reaches close or the work stops, when the owner asks to record a decision or to write a term down, and when a change chooses among meaningful alternatives, abandons an approach over a discovered constraint or supersedes an earlier decision."
---

# Close

Close ends a change: it records the durable decisions the work surfaced, writes down the terms it settled, audits the record against what happened, sets the record's state, its "next" line and its cost, and offers the landing of the change's branch. It never reopens the decision it records, and it changes no code: the audit corrects the record, and a gap it finds in the work itself goes to the owner.

Before closing, read [method.md](method.md): its order, the decisions, the terms and the audit.

## Handoff

Consumes: the change record .greenline/ledger/<id>.md with its sections, the change's commits found by their trailer, its checks, its working files and the repository's decision home and glossary
Produces: the close section of .greenline/ledger/<id>.md and its front matter's state, "next" line, cost, `outcome` line and `skills` line; each ADR and each term in its home; the landing offered, and done only on the owner's word; the working files removed by greenline tidy
Next: none when the change is done; when the work stops, the record's "next" line, naming the step reached and the action that resumes it
