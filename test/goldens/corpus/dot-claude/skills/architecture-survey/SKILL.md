---
name: "architecture-survey"
description: "Scan a codebase for deepening opportunities and present them as a visual report, then grill through the one you pick. Use for 'refactor what next', 'tech debt', 'this repo is a mess, where do I start', or a scoped architecture review."
---

# Architecture survey

Architecture survey is the start for a question about the code's structure as a whole: "refactor what next", "tech debt", "this repo is a mess, where do I start", or a scoped architecture review. Outside an orientation the survey is a report and edits no file of the repository, so it needs no mode and no record: its report lives in the working files, the id a date and a slug as a change's is, deleted when the survey ends without a finding taken up, and a change that takes one up holds the report under its own id. When `architecture-map` (extra, installs on request) has written the map's snapshot, read it before walking the codebase; once a deepening lands, the map's refresh folds it back in. The owner decides what is taken up, and a finding taken up becomes a change under the mode the owner approves. At an orientation, a repository with documents and no change record on any branch, local or remote-tracking, the survey runs before the first change, as AGENTS.md says, and opens a quick record before it writes its result into the knowledge homes the workspace's work guide names; the report itself stays in the working files. Where a change record exists on any branch, the survey is no orientation: it runs only when the request asks for a survey or the owner names it.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Load deep-modules through the harness's native skill mechanism, or read its installed SKILL.md and required support when the harness has none, for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion and in every delegated brief, and don't drift into "component," "service," "API," or "boundary."
- The domain language in `GLOSSARY.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.

## Process

### 1. Explore

**Scope before you scan: YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net. When the map's snapshot exists, start from it: its drifting nodes and churn tint are these hot spots, already measured, and its unclaimed-files list is ground the map has not described, so inspect that ground before making a finding.

Read the project's domain glossary (`GLOSSARY.md`) and any ADRs in the area you're touching first.

Then walk the codebase: through one agent the harness's delegation starts, whose report you wait for, or by your own reading where the harness has no delegation; the delegated walk is the survey's one extra agent, so say so before starting it. That agent is the survey's own reader, not a fresh agent of a change's line, and no record cites what it hands back. Don't follow rigid heuristics; explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the working files as `architecture-review-<timestamp>.html` so each run gets a fresh file and nothing lands in the repo: a survey need not create implementation work, and git never sees the working files. Never open it: no `open`, `xdg-open` or `start`, no browser, nothing that reaches the owner's desktop. Tell the owner its absolute path; opening it is the owner's. When the owner takes a finding up, copy the report into that change's folder once its record cites it.

The report is offline-complete: **embedded CSS** for layout and styling, and **static inline SVG** for diagrams where a graph/flow/sequence reliably communicates the structure, with no network-loaded script, style, font, or image needed to view it. Mix graph-shaped SVG with hand-crafted CSS/HTML visuals: draw relationships directly in SVG when they are graph-shaped (call graphs, dependencies, sequences), and use hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture is causing friction
- **Solution**: plain English description of what would change
- **Benefits**: explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram**: side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength**: one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use GLOSSARY.md vocabulary for the domain, and the `deep-modules` vocabulary for the architecture.** If `GLOSSARY.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007, but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance, and pass it to the walk's reader. Before handing the report over, read the file for any network-loaded reference, a `src` or a `<link>`'s `href` naming a host, an `@import`, or a `url()` that leaves the file, and remove each; the check is that read, never a browser, and where it could not run, say so and call the report unverified offline.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, load frame (through the harness's skill mechanism, or its installed SKILL.md) to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive. Side effects arise as decisions crystallize; the survey edits no file, so each is offered in one line, and the close step of the change that takes the finding up writes what the owner accepted:

- **Naming a deepened module after a concept not in `GLOSSARY.md`?** Offer the term for `GLOSSARY.md` in one line.
- **Sharpening a fuzzy term during the conversation?** Offer the sharper entry in one line.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing; skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** Load deep-modules, the design habit, and design the interface twice by its DESIGN-IT-TWICE.md, one design after another.

The survey, its evidence and the grilled candidate return to the owner; a recommendation alone does not authorize implementation. A finding the owner takes up is a change like any other: propose its mode and wait, as AGENTS.md says, open its record with a `## start` section naming architecture-survey and the finding, and run the line from `frame`; its plan step splits the work into tickets only where it needs them. Do not manufacture a planning program for each observation.

## Handoff

Consumes: the repository; .greenline/map/snapshot.json when architecture-map (extra) has written it (optional); GLOSSARY.md and the decision records
Produces: the offline HTML report under .greenline/tmp/<id>/, never opened, its path told to the owner, copied into the change's folder under .greenline/ledger/<id>/ only when a finding taken up cites it; at an orientation, its result in the knowledge homes; the survey returns to the owner, and a recommendation is not authorization
Next: frame, under the mode the owner approves, for a finding the owner takes up; otherwise none, the survey staying in the reply
