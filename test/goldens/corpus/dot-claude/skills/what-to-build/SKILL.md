---
name: "what-to-build"
description: "Propose what this product could do next at three altitudes: sharpen a shipped slice, extend one, or open ground the product does not stand on yet. Use for 'what should we build next', 'any ideas for this app', 'what's missing', 'is this done or is there more in it', and quick-win hunts. Not for refactors, which belong to the architecture survey."
---

# What To Build

You propose product work. You do not shape it, spec it, or build it, and you never propose a refactor: how the code is shaped belongs to `improve-codebase-architecture`, which reads different evidence and produces a different list. Your output is a short ranked set of candidate ideas the user can take, kill, or ignore, each carrying the evidence it came from.

The pass is read-only until the user picks something. Nothing here mints an artifact on its own.

## Read before you invent

Ideas invented from the product's name are worthless, and the repo has already written most of the good ones down. Read in this order, and skip a source only because it does not exist:

1. `.greenline/DECISIONS.md`, the decisions book. Everything settled and everything refused is in it. A standing refusal kills an idea before you write it down; an idea that reopens one may still be proposed, but it names the ruling and says exactly what changed.
2. `greenline status`; use `greenline doctor` if a workspace diagnostic is relevant. Work already in flight is not an idea. Doctor findings, blocked tickets, and NOT VERIFIED or INCONCLUSIVE verdicts are friction the project has already admitted in writing.
3. The shipped initiatives' `spec.md` files, read for their edges rather than their content: out-of-scope clauses, "not in v1" lines, acceptance items that were narrowed. A deferral is an idea with its reasoning attached.
4. The code, for `ponytail:` comments. Each names a deliberate shortcut and its ceiling, written by whoever hit it. Highest yield in the repo for the first altitude.
5. The product's actual surface: what a user can do today, from the entry points, commands, routes, or screens. Where `product-description` has already written that down, read it instead of re-deriving it.

Say which of the five you read and which were absent. An idea with no source in the five is legal, and it is labelled speculative.

## The three altitudes

Every idea is filed at one altitude, and the altitude is stated.

- **Sharpen.** A shipped slice works and is rough. The bar: a user hits it today, the change is small, and nothing about the product's shape moves. A `ponytail:` ceiling, a deferred edge case, an error that teaches nothing.
- **Extend.** An existing slice grows a real feature. The bar: it stands on ground the product already holds, it is worth a spec, and it is more than one ticket.
- **Open.** Ground the product does not stand on. The bar: it changes what the product is for, so it needs a decision before it needs a plan. Two open ideas is usually one too many.

Three per altitude is the ceiling and rarely the right number. Returning one, or returning none for an altitude with a sentence saying why, is a better answer than filling the table.

## The shape of one idea

Six lines, no more:

- The altitude, and a one-line intent in the user's words.
- The evidence: the file, the `ponytail:` comment, the decision id, the doctor code, or "speculative" when there is none.
- What the user gets, said as a behavior rather than a feature name.
- The cost, in whatever units are honest: tickets, or "one decision first, then unknown".
- The smallest first slice that would ship something usable. An idea that cannot be sliced is a wish.
- Strength: strong, worth exploring, or speculative.

Put the set in the reply as a view rather than paragraphs; `show-me` owns the forms, and a labelled list or a small table usually carries it. Rank the set and say which one you would take first and why, in one sentence. An unranked list hands the work back.

## Rules of the pass

- Never re-pitch what the decisions book refused. That is why reading it is step one.
- Never propose a refactor, a test-suite change, or a process change. Those have owners: `improve-codebase-architecture` and `sweep-tests`, and the roster names the rest.
- Ideas are not tickets and never get ids. An id exists when an artifact does.
- Do not grill the list. When the user picks one, clarify consequential uncertainty with `grilling`; settled compact intent needs no new shaping round.
- Mutating steps need the user's explicit authorization. Classification never mutates.

## Where it lands

Nothing lands by default: a list of ideas is not project state, and an idea nobody takes evaporates with the session. When the user authorizes an idea, `project-router` chooses the work it needs under `.greenline/WORK.md`: a settled compact change becomes one ticket; a larger intent earns an initiative and only the shaping or planning artifacts needed to resolve it. Carry the intent and evidence line into that home. An idea's altitude does not force an artifact or an extra owner round trip.

## When to offer this

You may propose the pass; the user's yes starts it. Worth proposing when an initiative just closed and its harvest is done, when a release just shipped, when the user asks an open question about direction, or when a `ponytail:` deferral just landed and its ceiling looks worth revisiting. Never propose it mid-ticket, mid-review, or inside a grill. An idea offered while someone is building is scope creep with better manners.

## Handoff

Consumes: the decisions book, shipped initiatives' spec.md, ponytail comments, greenline status
Produces: a ranked proposal in the reply; nothing durable until the user's yes
Next: grill-with-docs shapes an accepted larger idea into an initiative; implement takes an accepted compact idea as one ticket
