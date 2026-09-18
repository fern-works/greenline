---
name: "grill-with-docs"
description: "A relentless interview that shapes an initiative and records each settled ruling in the initiative's decisions.md. Use when a shaping conversation must outlive the session."
---

grill-with-docs fires when a larger intent needs shaping decisions that must outlive the session: it shapes the initiative and records every settled ruling in that initiative's `decisions.md`. Resolve the intended initiative from the request and the current work first, then read its intent, its existing decisions and the decisions book, `.greenline/DECISIONS.md`, when it exists; ask only when ownership stays ambiguous, and never reopen a ruling already recorded. It never manufactures a planning layer for a settled compact fix, which goes to implement as one ticket; a new component's open engineering choices belong to groundwork; a discussion that needs no durable record is grilling alone, which writes nothing to the repository.

Load both methods, grilling and domain-modeling, through the harness's native skill mechanism; when it has none, read each installed SKILL.md and its required support files.

Record each settled ruling in the initiative's `decisions.md` (`id: INIT-NNN/DEC`, `type: decisions`) as it lands, `status: draft` while questions stay open and `status: complete` when the frontier is empty; a question still open stays visible there rather than silently assumed. The initiative advances to decided only then. A ruling that outlives the initiative is promoted into the decisions book with a reference back to its entry. Stop at the planning boundary the owner set; the finished decisions are what to-spec reads.

## Handoff

Consumes: the initiative's intent (a request, or an accepted what-to-build proposal) and its existing decisions.md (INIT-NNN/DEC) when one exists
Produces: the initiative directory and its initiative.md (INIT-NNN) at shaping when none exists; the initiative's decisions.md (INIT-NNN/DEC), status draft then complete; the initiative advances to decided
Next: to-spec reads decisions.md
