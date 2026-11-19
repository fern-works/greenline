---
name: "product-description"
description: "Build a \"product description\" repo for a software product — a set of prose documents describing, from the outside in, what the user sees, what they can do, and exactly what happens when they do it, written from the code and tests, then verified against the running product and triaged into a bug list. Works for any product with a user (canvas editors, web apps, CLIs, chat products, mobile apps). Use when the user asks to \"write a product description for X\", \"describe the user experience of X\", \"document how X behaves for the user\", \"make a behavior-spec repo\", or wants a feature-by-feature, event-by-event account of an app's behavior rather than API docs. Also use to resume or extend an existing product description repo."
---

# Product description repo

product-description is an extra start, installed on request, for an owner who wants how the product behaves for its user described feature by feature. Before it starts, say what it will build, where, and whether it would spend fresh agents, and wait for the owner's yes.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the scope is asked, read [method.md](method.md): the outputs, the seven phases, the resume and the writing rules.

## Handoff

Consumes: the shipped surface at a pinned commit
Produces: a separate description repository (README, goal, glossary, one document per feature, verification protocol and checklists, one triage file); no change opened per triage entry; filing external issues needs the owner
Next: none; a standing program whose triage returns to the owner, a repair the owner takes up becoming a change run from frame
