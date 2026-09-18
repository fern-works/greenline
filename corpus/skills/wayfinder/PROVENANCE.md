# wayfinder: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/wayfinder`. Drift: 82 of 133 lines changed (62%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:38e86dacec17d393` in `SKILL.md`

```diff
-name: wayfinder
-description: Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
-disable-model-invocation: true
+name: "wayfinder"
+description: "Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets in the initiative's map.md, and resolve them one at a time until the way to the destination is clear."
```

## scope: The opening paragraph in the skill's own voice: wayfinder fires for a decision space too large for one session and spanning contexts, defers a single design to grilling or grill-with-docs and a settled compact change to implement, keeps its decision tickets as map.md checklist items with no TKT id that reach delivery only through to-tickets, and names how its methods are loaded; the diff aligns it against upstream's first paragraph, which survives as the next hunk.

Record `fold-2026-09-11`, 1 hunk.

### `h:d8ad06b49a10097d` in `SKILL.md`

```diff
-A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.
+wayfinder fires when an initiative's open decision space is too large for one session and spans more than one context: it charts that space as the initiative's `map.md` and works it down until the way is clear. A single design that needs stress-testing goes to grilling, or to grill-with-docs when its rulings must outlive the session; a settled compact change goes to implement as one ticket and needs no map. The map's decision tickets are checklist items in `map.md`, never delivery tickets: they carry no TKT id, and they become delivery work only through to-tickets once the way is clear. The methods a ticket needs (grilling, domain-modeling, research, prototype) are loaded through the harness's native skill mechanism; when it has none, read the installed SKILL.md and its required support files.
```

## location: Upstream's opening paragraph with the shared map at the initiative's map.md in place of the repo's issue tracker; the sentence and its position are upstream's, only the map's home changed.

Record `fold-2026-09-11`, 1 hunk.

### `h:d38949374ab8b7ea` in `SKILL.md`

```diff
+A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** in the initiative's `map.md`, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.
+
```

## lifecycle: Where the body says the map is done and it is time to hand off, the copy says what done is in the artifact system: map.md at status complete, the initiative decided, to-spec reading the resolved decisions, and a now-compact effort taking one ticket through implement.

Record `fold-2026-09-11`, 1 hunk.

### `h:82ba9f13773c0aa0` in `SKILL.md`

```diff
-Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables.
+Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables. When the way is clear, set the map's `status: complete`, advance the initiative to decided, and hand off: to-spec reads the resolved decisions, and a now-compact effort takes one ticket through implement.
```

## vocabulary: checklist items carry a name and no id or URL, so the id-wrapping rule has nothing to wrap.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:d1a6a5e785fdd678` in `SKILL.md`

```diff
-Every map and ticket is an issue, so it has a **name**: its title. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish; a name wraps its link, but they ride _inside_ the name, never stand in for it.
+Every ticket has a **name**: the bolded label on its checklist item. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare number or slug. A wall of `#42, #43, #44` is illegible; names read at a glance.
```

## location: names map.md and its checklist items directly, and retires the tracker-doc lookup that sends the map to a location the artifact contract does not recognise.

Record `baseline-copies-2026-09-11`, 3 hunks.

### `h:72c321b23bb33c78` in `SKILL.md`

```diff
-The map is a single issue on this repo's issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.
+The map is one file, the initiative's `.greenline/work/<NNN>-<name>/map.md`, the canonical artifact. Its tickets are checklist items inside it.
```

### `h:6c416e6a47e98ef2` in `SKILL.md`

```diff
-The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place, its ticket, so the map never restates it, only gists it and links.
+The map is an **index**, not a store. It lists the decisions made and points at the artifacts that hold their detail; a decision lives in exactly one place, its entry in the initiative's `decisions.md` or `research/RSRCH-NNN.md`, so the map never restates it, only gists it and links.
```

### `h:11b5975b7c6ab53b` in `SKILL.md`

```diff
-**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.
+**The map needs no issue tracker.** Everything a tracker would hold, the tickets, their claims, their blocking edges, and the frontier query, is written in `map.md` itself, in the shape the sections below describe.
```

## lifecycle: with no tracker to query, the open tickets have to be visible in the map body; the template gains the section that holds them.

Record `baseline-copies-2026-09-11`, 2 hunks.

### `h:47ab99e181729fe1` in `SKILL.md`

```diff
-The whole map at low resolution, loaded once per session. Open tickets are **not** listed: they are open child issues, found by query.
+The whole map at low resolution, loaded once per session, tickets included: the open ones are the unchecked items under **Tickets**.
```

### `h:b95516d8738b8c40` in `SKILL.md`

```diff
+## Tickets
+
+<!-- see "Tickets": one checklist item per ticket, unchecked while open -->
+
+- [ ] **<name>** (`grilling`): <the question> after: <name>
+
```

## lifecycle: child issues, assignees, and native dependency links have no home in a single file; the item, the name beside it, and the after: prose carry the same three jobs.

Record `baseline-copies-2026-09-11`, 6 hunks.

### `h:8cd56f541044ec55` in `SKILL.md`

```diff
-Each ticket is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:
+Each ticket is a **checklist item** under the map's **Tickets** section; its bolded name is its identity. The item states the question, sized to one 100K token agent session:
```

### `h:d82b268f6b502c61` in `SKILL.md`

```diff
-## Question
-
-<the decision or investigation this ticket resolves>
+- [ ] **<name>** (`<type>`): <the decision or investigation this ticket resolves> after: <name>, <name> [claimed: <session>]
```

### `h:ebdb69ce533562e2` in `SKILL.md`

```diff
-Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).
+The `<type>` is one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).
```

### `h:5f10d248e96cabb8` in `SKILL.md`

```diff
-A session **claims** a ticket by assigning it to the dev driving the map, **first**, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.
+A session **claims** a ticket by writing its name beside the item, **first**, before any work, so concurrent sessions skip it. That name _is_ the claim: an open item with no name beside it is unclaimed.
```

### `h:bf746fc67008053c` in `SKILL.md`

```diff
-Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.
+Blocking is item prose: `after: <name>, <name>`, naming the tickets this one waits on. A ticket is **unblocked** when every ticket it names is checked; the **frontier** is the first open, unblocked, unclaimed item, the edge of the known.
```

### `h:cdee9382945122b8` in `SKILL.md`

```diff
-The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
+The answer isn't part of the item; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the item, not pasted in.
```

## harness: Every 'call the Skill tool' sentence (the research, prototype and grilling ticket types, chart step 1, and the load of Notes-named skills) now loads the roster method through the harness's native skill mechanism, whose fallback to the installed SKILL.md the opening paragraph states once; no consumer install carries a tool by that name.

Record `fold-2026-09-11`, 2 hunks.

### `h:794029919cdde25d` in `SKILL.md`

```diff
-- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that calls the Skill tool with "research". Use when knowledge outside the current working directory is required.
-- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
-- **Grilling** (HITL): Conversation. The default case. Always call the Skill tool twice, for "grilling" and "domain-modeling".
+- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that loads research. Use when knowledge outside the current working directory is required.
+- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by loading prototype. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
+- **Grilling** (HITL): Conversation. The default case. Always load both grilling and domain-modeling.
```

### `h:352046200a22be6d` in `SKILL.md`

```diff
-1. **Name the destination.** Call the Skill tool twice, for "grilling" and "domain-modeling", to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
+1. **Name the destination.** Load both grilling and domain-modeling to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
```

## lifecycle: there is no issue to close; a mis-scoped ticket leaves the checklist and lives on as one Out-of-scope line.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:316896762aea4faf` in `SKILL.md`

```diff
-Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
+Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **delete its item from Tickets** (an item off the list is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
```

## location: Charting writes one file, so the map is created with its frontmatter and the tickets are added as items rather than created and then wired by id; step 5's research subagent captures its findings in the initiative's research/RSRCH-NNN.md, the one research home WORK.md defines, instead of a throwaway branch, and loads research natively.

Record `fold-2026-09-11`, 1 hunk.

### `h:caa3dafa9b353109` in `SKILL.md`

```diff
-3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
-4. **Create the tickets you can specify now** as child issues of the map, then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
-5. **Fire the research subagents.** For each `research` ticket you just created, spin up a subagent that calls the Skill tool with "research" to resolve it in parallel, capturing its findings on a throwaway `research/<name>` branch with a context pointer from the ticket.
+3. **Write the map** to the initiative's `map.md` (frontmatter `id: INIT-NNN/MAP`, `type: map`, `status: draft`): Destination and Notes filled in, Tickets and Decisions-so-far empty, the fog sketched into **Not yet specified**.
+4. **Add the tickets you can specify now** as checklist items under **Tickets**, then write their `after:` edges once every item has a name. The edges sort them into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
+5. **Fire the research subagents.** For each `research` ticket you just created, spin up a subagent that loads research to resolve it in parallel, capturing its findings in the initiative's `research/RSRCH-NNN.md` (an unused id per ticket, rechecked before writing) with a context pointer from the ticket.
```

## lifecycle: claiming, resolving, and concurrency all happen in map.md: a name beside the item, a checked box with its gist, one file two sessions may be editing.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:4eb71aee81fea74b` in `SKILL.md`

```diff
-User invokes with a map (URL or number). A ticket is **optional**: without one, you pick the next decision, not the user.
+User invokes with a map (the initiative, or a ticket's name). A ticket is **optional**: without one, you pick the next decision, not the user.
```

## lifecycle: Claiming, resolving and concurrency all happen in map.md: a name beside the item, a checked box with its gist, one file two sessions may be editing; step 4 restores upstream's resolution comment as the answer's greenline home, an entry in the initiative's decisions.md or, for a research ticket, its research/RSRCH-NNN.md, and step 3 loads Notes-named skills natively.

Record `fold-2026-09-11`, 1 hunk.

### `h:c5cbdce71a606c3f` in `SKILL.md`

```diff
-1. Load the **map**: the low-res view, not every ticket body.
-2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
-3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".
-4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
-5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
+1. Load the **map**: `map.md` whole, which is already the low-res view.
+2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier item in order. **Claim it**: write your session's name beside the item and save, before any work.
+3. Resolve it. **Zoom as needed**: read the landed decision behind any related or checked ticket on demand; load whichever skills the `## Notes` block names. If in doubt, load both grilling and domain-modeling.
+4. Record the resolution: write the answer where it lives, an entry in the initiative's `decisions.md` (a research ticket's answer is its `research/RSRCH-NNN.md`), then **check the item**, replacing its question with a one-line gist of the answer, and **append a context pointer** to the map's Decisions-so-far.
+5. Add newly-surfaced tickets (item first, `after:` edges once they all have names); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new item. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those items.
```

## lifecycle: the handoff section: map.md as the product, the initiative directory and initiative.md created at shaping when none exists, resolved answers in decisions.md or research records, to-spec and to-tickets as the readers

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:c89750a25c72cfc7` in `SKILL.md`

```diff
-The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.
+The user may run unblocked tickets in parallel, so expect other sessions to be editing `map.md` concurrently.
+
+## Handoff
+
+Consumes: a loose idea too big for one session; the initiative's intent and its existing decisions.md (INIT-NNN/DEC) when one exists
+Produces: the initiative directory and its initiative.md (INIT-NNN) at shaping when none exists; the initiative's map.md (INIT-NNN/MAP), status draft while charting and complete when the way is clear; each resolved ticket's answer in decisions.md (INIT-NNN/DEC) or research/RSRCH-NNN.md; the initiative advances to decided
+Next: to-spec reads the resolved decisions, and to-tickets reads them after the spec
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:4f1f8a679867d871` in `agents/openai.yaml`

Removed file, 5 lines.

## Retired

- `h:44deb00af3835381` in `fold-2026-09-11`: the prelude folded into the body: the map's home and statuses sit in the Map section, Plan-don't-do and the Handoff; the decision-ticket distinction is the opening scope paragraph
- `h:bdaaa28fbbf24bfb` in `fold-2026-09-11`: the Skill-tool translation paragraph folded into the body: each Skill-tool sentence now says load the method natively, and the opening paragraph carries the installed-SKILL.md fallback once
- `h:fccefbbfeada87a0` in `fold-2026-09-11`: re-measured: chart step 5 joined steps 3 and 4 when its research findings moved from a throwaway branch to research/RSRCH-NNN.md; the location claim continues on the new hunk
- `h:1adac485af3ae689` in `fold-2026-09-11`: re-measured: work step 4 gained the answer's home and step 3 loads its skills natively; the lifecycle claim continues on the new hunk
- `h:8128af0b0029a9e1` in `fold-2026-09-11`: the completion folded into the body at its step: resolved answers land in decisions.md or research records (work step 4), the clear-way hand-off is in Plan-don't-do, and the Handoff section names to-spec; the concurrency sentence continues on the new hunk
- `h:b405556072275c60` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
