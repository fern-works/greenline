---
name: "plan"
description: "Turn a change's framed intent into what the build follows: acceptance that can fail, the work cut into ordered tasks or tickets, and the shape of the code, at the depth the change's mode gives the plan step; work that splits writes a spec and a tickets file with a mode per ticket. Use when the mode reaches plan, or when the owner asks for a spec or tickets."
---

# Plan

Plan turns a change's framed intent into what the build follows: acceptance criteria that can fail, the work cut into tasks or tickets in order, and the shape the code will take. It runs where the change's mode reaches the plan step, at the depth the mode gives it, and alone when the owner asks for a spec or tickets by name. It reads the change record's frame section first and settles nothing the frame left open: such a question goes back to the owner. It never builds: the build step takes the plan as written.

## The spec

In the steps below the user is the owner of the request; in the spec template the user is the person the product serves.

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

Write a spec only when the work splits into tickets; a change that stands alone puts its criteria in its plan section. The spec's inputs are the change record's frame section and what the plan directory already holds, its decisions, research and prototypes, each read whole. A consequential gap in them returns to the owner rather than being invented here.

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check that these seams match what the user expects: settled seams in the frame section, the existing interfaces or a standing grant satisfy that check, and the user is asked only about a consequential unresolved seam choice.

**Reframe instructions as success criteria.** When receiving vague requirements, translate them into concrete conditions:

```
REQUIREMENT: "Make the dashboard faster"

REFRAMED SUCCESS CRITERIA:
- Dashboard LCP < 2.5s on 4G connection
- Initial data load completes in < 500ms
- No layout shift during load (CLS < 0.1)
→ Are these the right targets?
```

This lets you loop, retry, and problem-solve toward a clear goal rather than guessing what "faster" means.

3. Write the spec using the template below into the plan directory's spec, a draft until it is complete, which it is once the frame section and the plan directory's records support every section. Its Testing Decisions are what the build inherits, so record them here rather than leaving them to be reopened. A choice settled here that outlives the work goes into the repository's decision home, with a reference back.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>

## The tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The plan is the plan directory's spec, read whole; a conversation can supply it when no spec was written, and the tickets then name that source. A change that stands alone cuts its tasks by the same rules into its plan section, and steps 4 and 5 do not apply to it.

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path or a plan directory) as an argument, read it whole.

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

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share the planning change's branch, all blocking a final integrate-and-verify ticket; green is promised only there.

Then order and size the tickets by these rules, a task in them being a ticket:

Arrange tasks so that:

1. Dependencies are satisfied (build foundation first)
2. Each task leaves the system in a working state
3. Verification checkpoints occur after every 2-3 tasks
4. High-risk tasks are early (fail fast)

| Size | Files | Scope | Example |
|------|-------|-------|---------|
| **XS** | 1 | Single function or config change | Add a validation rule |
| **S** | 1-2 | One component or endpoint | Add a new API endpoint |
| **M** | 3-5 | One feature slice | User registration flow |
| **L** | 5-8 | Multi-component feature | Search with filtering and pagination |
| **XL** | 8+ | **Too large — break it down further** | — |

If a task is L or larger, it should be broken into smaller tasks. An agent performs best on S and M tasks.

**When to break a task down further:**
- It would take more than one focused session (roughly 2+ hours of agent work)
- You cannot describe the acceptance criteria in 3 or fewer bullet points
- It touches two or more independent subsystems (e.g., auth and billing)
- You find yourself writing "and" in the task title (a sign it is two tasks)

A plan is the set of decisions the implementer cannot make alone. A plan
longer than the code it describes has written the code instead. Lines that
decide nothing ("TBD", "handle edge cases", "add appropriate validation",
"write tests for the above", a type or function no task defines) are the
opposite failure, and the self-review catches both.

So each ticket states, in its intent or its acceptance, the interfaces it consumes from the tickets before it and produces for the ones after, by their exact names and types, since its builder sees only its own ticket. The project-wide requirements every ticket shares (version floors, dependency limits, naming and copy rules, platform requirements) are written once, as the global constraints in the planning change's plan section, one line each with the exact values from the spec, and every ticket holds to them without restating them.

Where the shape of the code is not settled yet, design it before the tickets are final:

Design before implementing. Sketch types, function signatures, class shapes, and module boundaries with `not implemented` bodies and pseudocode.

Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. Whole-shape alternatives, not point fixes inside one shape. Write the candidates one after another yourself, each whole before the next, then compare them and synthesize the chosen design from the strongest, before any code; no agent runs beside the conversation for them, and none runs on another model.

The caller's usage is written first and the type sketch derived from it. One file with new types and signatures for small changes. Module map plus type definitions for larger work.

Whether it is one file of types and signatures or a module map, the sketch stands in the plan section, with each candidate that lost and one line on why it lost; the build writes it into the source.

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

### 5. Write the tickets file

Write the approved tickets into the plan directory's tickets file, in dependency order (blockers first), one entry per ticket in the form plan's references page gives. No ticket's progress is written there: it is read from the change records that name the ticket.

**Never overwrite an incomplete plan.** Before writing a plan directory's spec or tickets file, check whether the directory already exists and still holds tickets whose changes are not done, its unchecked tasks in the words below:

- Same work being replanned (the user asked to revise or extend this plan) → update the existing files in place.
- Different work → **stop and ask.** The unchecked tasks may be mid-build in another session. Do not delete, overwrite, or rename the existing files on your own; present the conflict and let the user decide (finish the old plan first, explicitly discard it, or tell you where the new plan should go).

In a ticket, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Self-Review

For a change that stands alone, the spec in the checks below is its frame section with its acceptance criteria, and the plan is its tasks; a task may list its steps, each one action with a checkable result.

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Step scan:** Every step must let the implementer write exactly one reasonable thing, and no step may carry more than that: a line that decides nothing is a gap, a function body the signature and tests already determine is a transcript. Fix both.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Handoff

Consumes: the change record's frame section, and when the work splits the plan directory's decisions.md, research and prototypes
Produces: the plan section of .greenline/ledger/<id>.md; when the work splits, .greenline/plans/<NNN-name>/spec.md and tickets.md, status draft then complete, each ticket with its approved mode
Next: the next step of the change's mode
