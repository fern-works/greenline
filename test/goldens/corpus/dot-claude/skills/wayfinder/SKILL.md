---
name: "wayfinder"
description: "Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets in the initiative's map.md, and resolve them one at a time until the way to the destination is clear."
---

wayfinder fires when an initiative's open decision space is too large for one session and spans more than one context: it charts that space as the initiative's `map.md` and works it down until the way is clear. A single design that needs stress-testing goes to grilling, or to grill-with-docs when its rulings must outlive the session; a settled compact change goes to implement as one ticket and needs no map. The map's decision tickets are checklist items in `map.md`, never delivery tickets: they carry no TKT id, and they become delivery work only through to-tickets once the way is clear. The methods a ticket needs (grilling, domain-modeling, research, prototype) are loaded through the harness's native skill mechanism; when it has none, read the installed SKILL.md and its required support files.

A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** in the initiative's `map.md`, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting: it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic: engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables. When the way is clear, set the map's `status: complete`, advance the initiative to decided, and hand off: to-spec reads the resolved decisions, and a now-compact effort takes one ticket through implement.

## Refer by name

Every ticket has a **name**: the bolded label on its checklist item. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare number or slug. A wall of `#42, #43, #44` is illegible; names read at a glance.

## The Map

The map is one file, the initiative's `.greenline/work/<NNN>-<name>/map.md`, the canonical artifact. Its tickets are checklist items inside it.

The map is an **index**, not a store. It lists the decisions made and points at the artifacts that hold their detail; a decision lives in exactly one place, its entry in the initiative's `decisions.md` or `research/RSRCH-NNN.md`, so the map never restates it, only gists it and links.

**The map needs no issue tracker.** Everything a tracker would hold, the tickets, their claims, their blocking edges, and the frontier query, is written in `map.md` itself, in the shape the sections below describe.

### The map body

The whole map at low resolution, loaded once per session, tickets included: the open ones are the unchecked items under **Tickets**.

```markdown
## Destination

<what reaching the end of this map looks like: the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Tickets

<!-- see "Tickets": one checklist item per ticket, unchecked while open -->

- [ ] **<name>** (`grilling`): <the question> after: <name>

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link): <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **checklist item** under the map's **Tickets** section; its bolded name is its identity. The item states the question, sized to one 100K token agent session:

```markdown
- [ ] **<name>** (`<type>`): <the decision or investigation this ticket resolves> after: <name>, <name> [claimed: <session>]
```

The `<type>` is one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

A session **claims** a ticket by writing its name beside the item, **first**, before any work, so concurrent sessions skip it. That name _is_ the claim: an open item with no name beside it is unclaimed.

Blocking is item prose: `after: <name>, <name>`, naming the tickets this one waits on. A ticket is **unblocked** when every ticket it names is checked; the **frontier** is the first open, unblocked, unclaimed item, the edge of the known.

The answer isn't part of the item; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the item, not pasted in.

## Ticket Types

Every ticket is either **HITL** (human in the loop, worked _with_ a human who speaks for themselves) or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that loads research. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by loading prototype. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation. The default case. Always load both grilling and domain-modeling.
- **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made: nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides, and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war**: the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets, one at a time, until the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination: everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now, _not_ whether you can answer it now.

- **Ticket when** the question is already sharp, even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope**: it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates (the frontier stops at the destination), so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **delete its item from Tickets** (an item off the list is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session**, with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Load both grilling and domain-modeling to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** (the way to the destination is already clear, the whole journey small enough for one session), you don't need a map. Stop and ask the user how they'd like to proceed.
3. **Write the map** to the initiative's `map.md` (frontmatter `id: INIT-NNN/MAP`, `type: map`, `status: draft`): Destination and Notes filled in, Tickets and Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Add the tickets you can specify now** as checklist items under **Tickets**, then write their `after:` edges once every item has a name. The edges sort them into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
5. **Fire the research subagents.** For each `research` ticket you just created, spin up a subagent that loads research to resolve it in parallel, capturing its findings in the initiative's `research/RSRCH-NNN.md` (an unused id per ticket, rechecked before writing) with a context pointer from the ticket.
6. Stop: charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (the initiative, or a ticket's name). A ticket is **optional**: without one, you pick the next decision, not the user.

1. Load the **map**: `map.md` whole, which is already the low-res view.
2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier item in order. **Claim it**: write your session's name beside the item and save, before any work.
3. Resolve it. **Zoom as needed**: read the landed decision behind any related or checked ticket on demand; load whichever skills the `## Notes` block names. If in doubt, load both grilling and domain-modeling.
4. Record the resolution: write the answer where it lives, an entry in the initiative's `decisions.md` (a research ticket's answer is its `research/RSRCH-NNN.md`), then **check the item**, replacing its question with a one-line gist of the answer, and **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (item first, `after:` edges once they all have names); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new item. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those items.

The user may run unblocked tickets in parallel, so expect other sessions to be editing `map.md` concurrently.

## Handoff

Consumes: a loose idea too big for one session; the initiative's intent and its existing decisions.md (INIT-NNN/DEC) when one exists
Produces: the initiative directory and its initiative.md (INIT-NNN) at shaping when none exists; the initiative's map.md (INIT-NNN/MAP), status draft while charting and complete when the way is clear; each resolved ticket's answer in decisions.md (INIT-NNN/DEC) or research/RSRCH-NNN.md; the initiative advances to decided
Next: to-spec reads the resolved decisions, and to-tickets reads them after the spec
