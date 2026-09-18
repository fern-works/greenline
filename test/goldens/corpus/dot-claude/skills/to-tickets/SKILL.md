---
name: "to-tickets"
description: "Break a plan, spec, or the current conversation into a set of tracer-bullet ticket files in .greenline/work/tickets/, each declaring its blocking edges as depends_on ids."
---

# To Tickets

to-tickets fires when an initiative's plan is settled, in its `spec.md` or, for an initiative that went from shaping straight to slicing, its `decisions.md`, and the work needs cutting into delivery tickets under `.greenline/work/tickets/`. It never shapes or specifies: a consequential gap in the plan returns to grill-with-docs or to-spec rather than being sliced around. It never implements: implement takes each ticket from the ready frontier. A settled compact change is one ticket and needs no slicing pass; wayfinder's decision tickets are questions in the initiative's `map.md`, not the tickets written here.

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The plan is the initiative's `spec.md`, or its `decisions.md` when no spec was written; read it whole and pin the revision the tickets consume. A conversation can supply the plan when no spec or decisions record was written; name that source in the tickets and pin nothing. A settled compact change is implement's one ticket, not a slicing pass.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an initiative id or a ticket id) as an argument, read it whole.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Write the tickets to `.greenline/work/tickets/`

Write the approved tickets, one file per ticket at `.greenline/work/tickets/TKT-NNN.md`, in dependency order (blockers first) so each ticket's `depends_on` can name real ids. Inspect the filenames already there (an absent directory is empty) and `greenline status --json` for an unused TKT-NNN, and recheck before writing to avoid a concurrent collision. Use the ticket template below: one ticket per file, never a single combined file. Each ticket is written at `status: ready` unless instructed otherwise; the tickets are agent-grabbable by construction.

Then list the new ids in the initiative's `tickets` and advance the initiative to planned. `greenline doctor` validates the graph. A slice added later keeps every existing ticket's id, path and evidence; it edits membership, and a revision only where it changes a consumed contract.

Work the **frontier**: any ticket whose blockers are all done; `greenline status` projects it. For a purely linear chain that means top to bottom.

Do NOT close or modify the spec or decisions the tickets consume; a parent is a `consumes` pin, never a write.

<local-ticket-template>

```markdown
---
id: TKT-NNN
type: ticket
status: ready
revision: 1
intent: "<the end-to-end behaviour this ticket makes work, from the user's perspective>"
scope:
  - <repository-relative root the slice touches>
depends_on: [] # the TKT ids that gate this one; empty when it can start immediately
consumes:
  - { id: INIT-NNN/SPEC, revision: <N> }
acceptance:
  - [ ] Acceptance criterion 1
  - [ ] Acceptance criterion 2
---

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

## Scope and authority

The plan this ticket consumes and what its grant covers.
```

</local-ticket-template>

In the ticket's intent and body, avoid specific file paths or code snippets: they go stale fast (the `scope` field names roots, not the files inside them). Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Handoff

Consumes: spec.md (INIT-NNN/SPEC, pinned revision), or decisions.md (INIT-NNN/DEC, pinned revision) when no spec was written
Produces: .greenline/work/tickets/TKT-NNN.md per slice, status ready, with depends_on edges and consumes pins; the initiative's tickets membership; the initiative advances to planned
Next: implement takes the ready frontier from greenline status; greenline doctor validates the graph
