---
name: "improve-codebase-architecture"
description: "Scan a codebase for deepening opportunities and present them as a visual report, then grill through the one you pick. Use for 'refactor what next', 'tech debt', 'this repo is a mess, where do I start', or a scoped architecture review."
---

# Improve Codebase Architecture

This skill surveys a codebase for deepening opportunities: use it for "refactor what next", "tech debt", "this repo is a mess, where do I start", or a scoped architecture review. When `architecture-map` (opt-in) has written `.greenline/map/snapshot.json`, read it before walking the codebase; once a deepening lands, `architecture-map` (opt-in) is the refresh that folds it back into the map. The survey is a report, not implementation work: the owner decides what is taken up, and a taken-up finding becomes a compact ticket or an initiative.

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Load codebase-design through the harness's native skill mechanism, or read its installed SKILL.md and required support when the harness has none, for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion and in every delegated brief, and don't drift into "component," "service," "API," or "boundary."
- The domain language in `CONTEXT.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.

## Process

### 1. Explore

**Scope before you scan: YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net. When `.greenline/map/snapshot.json` exists, start from it: its drifting nodes and churn tint are these hot spots, already measured, and its unclaimed-files list is ground the map has not described, so inspect that ground before making a finding.

Read the project's domain glossary (`CONTEXT.md`) and any ADRs in the area you're touching first.

Then spawn a sub-agent to walk the codebase. Don't follow rigid heuristics; explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to `.greenline/tmp/improve-codebase-architecture/architecture-review-<timestamp>.html` so each run gets a fresh file and nothing lands in the repo: a survey need not create implementation work, and git never sees tmp. Open it for the user (`xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows) and tell them the absolute path. When authorized work takes a finding up, retain the report in that work's evidence home, `.greenline/work/evidence/<work-id>/`, so its artifacts can cite it durably.

The report is offline-complete: **embedded CSS** for layout and styling, and **static inline SVG** for diagrams where a graph/flow/sequence reliably communicates the structure, with no network-loaded script, style, font, or image needed to view it. Mix graph-shaped SVG with hand-crafted CSS/HTML visuals: draw relationships directly in SVG when they are graph-shaped (call graphs, dependencies, sequences), and use hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture is causing friction
- **Solution**: plain English description of what would change
- **Benefits**: explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram**: side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength**: one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use CONTEXT.md vocabulary for the domain, and the `codebase-design` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007, but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance, and pass it to any report-writing delegate. Before handing the report over, open it with network access disabled and confirm every diagram and label remains visible; if that check could not run, say so and call the report unverified offline.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, load grilling (through the harness's native skill mechanism, or its installed SKILL.md) to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize; load domain-modeling to keep the domain model current as you go:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` when the request's grant covers it, creating the file lazily if it doesn't exist; otherwise offer the entry in one line.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there when the request's grant covers it, or offer the entry in one line.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing; skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** Load codebase-design and use its design-it-twice parallel sub-agent pattern.

The survey, its evidence and the grilled candidate return to the owner; a recommendation alone does not authorize implementation. Work the owner takes up stays linked to the survey's report and becomes a compact ticket for a bounded change, or an initiative where unresolved intent and dependent work warrant one. Do not manufacture a planning program for each observation.

## Handoff

Consumes: the repository; .greenline/map/snapshot.json when architecture-map (opt-in) has written it (optional); CONTEXT.md and the decision records
Produces: the offline HTML report under .greenline/tmp/improve-codebase-architecture/, promoted to .greenline/work/evidence/<work-id>/ only when a finding is taken up; the survey returns to the owner and a recommendation is not authorization
Next: accepted work becomes a compact ticket (implement) or an initiative (grill-with-docs)
