---
name: "domain-modeling"
description: "Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR."
---

# Domain Modeling

This skill writes the words down; model-the-domain restructures the code around them. It fires when codebase terminology is under discussion, when `CONTEXT.md` is written or edited, when a term change needs an ADR, and when a term is doing two jobs, where it is offered in one line: name it and write it down? The home for terms is the repository's existing glossary or vocabulary document; `CONTEXT.md` is created only when the repository has none. A term change that is a durable decision goes through record-architecture-decisions, whose dated naming governs ADRs. This skill never restructures code and never records a decision that is not one.

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 2026-01-12-event-sourced-orders.md
│       └── 2026-02-03-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. An existing glossary or vocabulary document is the home for terms, whatever its name; if the repository has none, create `CONTEXT.md` when the first term is resolved. An existing decision home (a decisions document, an ADR directory of its own) is the home for ADRs; if the repository has none, `docs/adr/` is created when the first ADR is needed, seeded by record-architecture-decisions.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md` or the repository's own glossary, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md`, or the repository's existing glossary in its own format, right there when the request's grant covers that file; otherwise offer the entry in one line and write it on the owner's word. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) for `CONTEXT.md`.

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. When all three hold, record it through record-architecture-decisions, in the repository's decision home and under its dated `YYYY-MM-DD-short-title.md` naming; [ADR-FORMAT.md](./ADR-FORMAT.md) describes the short form an ADR can take and yields to that convention wherever the two disagree. Where record-architecture-decisions is not installed, ADR-FORMAT.md carries the bar and its dated naming is the convention.

Durable output: CONTEXT.md entries (or the repository's existing glossary), and an ADR through record-architecture-decisions when a term change is a durable decision. Offered in one line when a term is doing two jobs: "name it and write it down?"; applied in the reply otherwise.
