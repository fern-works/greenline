---
name: "build"
description: "Turn a change's plan into working code one slice at a time, each slice tested, verified and committed with the change's trailer and the build green between slices, every command's output compared with what the plan expected and every deviation recorded, at the depth the change's mode gives the build step. Use when the mode reaches build, or when the owner asks to build a ready ticket or to make a small settled fix."
---

# Build

Build turns a change's plan into working code, one slice at a time, each slice tested, verified and committed before the next. The builder runs every task itself, one after another, and no agent runs beside the conversation. A consequential choice the plan leaves open, a product or a contract choice, returns to the owner rather than being decided during the build. It never reviews its own result or verifies the change's claim: those are the review and verify steps'.

Before the first slice read [method.md](method.md), the slices and the rules each keeps; before a task is called done, its completion contract.

## Handoff

Consumes: the change record's plan section in .greenline/ledger/<id>.md, or its frame section where the mode skipped the plan; for a ticket, its entry in the plan directory's tickets.md and the planning change's plan section
Produces: the commits on the change's branch, each carrying the trailer Greenline-Change: <id>; the checks greenline check records under .greenline/ledger/<id>/checks/; the build section of .greenline/ledger/<id>.md, one line at the inline depth, and at the written depth what was built with the deviations from the plan, the approaches tried and dropped, and what was noticed and left alone
Next: the next step of the change's mode
