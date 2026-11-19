---
name: "plan"
description: "Turn a change's framed intent into what the build follows: acceptance that can fail, the work cut into ordered tasks or tickets, and the shape of the code, at the depth the change's mode gives the plan step; work that splits writes a spec and a tickets file with a mode per ticket. Use when the mode reaches plan, or when the owner asks for a spec or tickets."
---

# Plan

Plan turns a change's framed intent into what the build follows: acceptance criteria that can fail, the work cut into tasks or tickets in order, and the shape the code will take. It runs where the change's mode reaches the plan step, at the depth the mode gives it, and alone when the owner asks for a spec or tickets by name. It reads the change record's frame section first and settles nothing the frame left open: such a question goes back to the owner. It never builds: the build step takes the plan as written.

Before the spec or the tickets read [method.md](method.md): the spec, the tickets, their order and size, and the shape of the code; once the plan is written, its self-review.

## Handoff

Consumes: the change record's frame section, and when the work splits the plan directory's decisions.md, research and prototypes
Produces: the plan section of .greenline/ledger/<id>.md; when the work splits, .greenline/plans/<NNN-name>/spec.md and tickets.md, status draft then complete, each ticket with its approved mode
Next: the next step of the change's mode
