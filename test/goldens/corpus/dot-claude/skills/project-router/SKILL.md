---
name: "project-router"
description: "Resolve the current request, its durable work, and the methods it needs. Use for continuation, a new intent, or uncertainty about the next engineering step."
---

# Project router

AGENTS.md owns the request loop. This method resolves continuity and method
choice within that loop; `.greenline/WORK.md` owns artifact contracts.

## Establish continuity

Use `greenline status`, exact references in the request, current branch claims,
and the relevant files to find ongoing work. Read candidates before deciding
which intent the owner means. Recency alone is not ownership. Resume an
exact referenced or claimed ticket; clarify only when several distinct intents
remain plausible. Use the decisions book defined in `.greenline/WORK.md` for lasting choices.

A settled compact change can be its own ticket. Larger uncertainty earns only
the planning artifacts needed to resolve it; a skill's availability is not a
reason to create an initiative or force every stage.

## Choose the next needed method

- **Clarify consequential uncertainty:** grilling for a bounded discussion;
  grill-with-docs for durable shaping decisions; wayfinder when the open
  decision space spans contexts.
- **Gather evidence:** research for primary-source questions; prototype for a
  bounded experiment. Their results return to the requesting method.
- **Describe settled intent:** to-spec when a spec helps; to-tickets when a
  dependency graph of tracer-bullet changes is needed.
- **Implement:** implement and relevant disciplines. Read the existing
  frontier when continuing, and update intent explicitly if scope changes.
- **Diagnose:** diagnosing-bugs establishes the cause of a failure or
  regression, then returns to the owning implementation.
- **Review and verify:** delivery-review examines the committed result;
  verify-this produces acceptance evidence. Findings return to implementation.

Use descriptions and the class listed with the roster to find candidates. Read
ROUTING.md, the pipeline map, when adjacent methods could produce different
work, then read the chosen method and its support.
Supporting stages return to this request holder within the existing grant.
