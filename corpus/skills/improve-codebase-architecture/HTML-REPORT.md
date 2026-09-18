# HTML Report Format

The architectural review is rendered as a single self-contained HTML file under `.greenline/tmp/improve-codebase-architecture/`. It is offline-complete: the CSS is embedded and every diagram is static inline SVG or HTML, so no script, style, font, or image loads from a network. Inline SVG draws the graph-shaped diagrams; hand-built divs and inline SVG handle the more editorial visuals (mass diagrams, cross-sections). Mix the two: don't lean on one pattern for everything, it'll start to look generic.

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review for {{repo name}}</title>
    <style>
      /* the whole stylesheet is embedded: nothing loads from a network */
      body { margin: 0; background: #fafaf9; color: #0f172a; font-family: system-ui, sans-serif; }
      main { max-width: 64rem; margin: 0 auto; padding: 3rem 1.5rem; }
      main > * + * { margin-top: 3rem; }
      article { border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #fff; padding: 1.5rem; }
      article + article { margin-top: 2.5rem; }
      .badge { display: inline-block; border-radius: 9999px; padding: 0.125rem 0.625rem; font-size: 0.75rem; font-weight: 600; }
      .strong { background: #d1fae5; color: #065f46; }
      .explore { background: #fef3c7; color: #92400e; }
      .speculative { background: #e2e8f0; color: #334155; }
      .files { font-family: ui-monospace, monospace; font-size: 0.875rem; }
      .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
      .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
      .diagram { border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #fff; padding: 1rem; }
      .callout { border: 1px solid #fcd34d; background: #fffbeb; border-radius: 0.375rem; padding: 0.5rem 0.75rem; }
      /* small custom layer for the diagrams:
         dashed seam lines, hand-drawn-feeling arrow heads, etc. */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body>
    <main>
      <header>...</header>
      <section id="candidates">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Repo name, date, and a compact legend: solid box = module, dashed line = seam, red arrow = leakage, thick dark box = deep module. No introduction paragraph. Straight into the candidates.

## Candidate card

The diagrams carry the weight. Prose is sparse, plain, and uses the glossary terms (from the `codebase-design` skill) without ceremony.

Each candidate is one `<article>`:

- **Title**: short, names the deepening (e.g. "Collapse the Order intake pipeline").
- **Badge row**: recommendation strength (`Strong` = emerald, `Worth exploring` = amber, `Speculative` = slate), plus a tag for the dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
- **Files**: monospaced list (the `.files` class).
- **Before / After diagram**: the centrepiece. Two columns, side by side. See patterns below.
- **Problem**: one sentence. What hurts.
- **Solution**: one sentence. What changes.
- **Wins**: bullets, ≤6 words each. e.g. "Tests hit one interface", "Pricing logic stops leaking", "Delete 4 shallow wrappers".
- **ADR callout** (if applicable): one line in an amber-tinted box.

No paragraphs of explanation. If the diagram needs a paragraph to be understood, redraw the diagram.

## Diagram patterns

Pick the pattern that fits the candidate. Mix them. Don't make every diagram look the same. Variety is part of the point.

### Inline SVG graph (the workhorse for dependencies / call flow)

Draw the graph directly in SVG when the point is "X calls Y calls Z, and look at the mess": modules as `<rect>` elements with a `<text>` label, calls as `<path>` elements ending in an arrowhead `<marker>`, laid out by hand left to right. Wrap it in a `.diagram` card so it doesn't feel parachuted in. Put the `leak` class on leakage edges to colour them red and the `deep` treatment on the deep module. Prefix marker ids per diagram so two SVGs on the page never share one. A hand-drawn sequence (lifelines as vertical lines, messages as horizontal arrows) works well for "before: 6 round-trips; after: 1."

```html
<div class="diagram">
  <svg viewBox="0 0 560 120" role="img" aria-label="OrderHandler calls OrderValidator, which calls OrderRepo, which leaks into PricingClient">
    <defs>
      <marker id="c1-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#475569" />
      </marker>
    </defs>
    <rect x="8" y="40" width="112" height="40" rx="4" fill="#fff" stroke="#0f172a" />
    <text x="64" y="64" text-anchor="middle" font-size="12">OrderHandler</text>
    <rect x="168" y="40" width="112" height="40" rx="4" fill="#fff" stroke="#0f172a" />
    <text x="224" y="64" text-anchor="middle" font-size="12">OrderValidator</text>
    <rect x="328" y="40" width="88" height="40" rx="4" fill="#fff" stroke="#dc2626" />
    <text x="372" y="64" text-anchor="middle" font-size="12">OrderRepo</text>
    <rect x="456" y="40" width="96" height="40" rx="4" fill="#fff" stroke="#dc2626" />
    <text x="504" y="64" text-anchor="middle" font-size="12">PricingClient</text>
    <path d="M120 60 H168" stroke="#475569" fill="none" marker-end="url(#c1-arrow)" />
    <path d="M280 60 H328" stroke="#475569" fill="none" marker-end="url(#c1-arrow)" />
    <path class="leak seam" d="M416 60 H456" stroke-width="2" fill="none" marker-end="url(#c1-arrow)" />
  </svg>
</div>
```

### Hand-built boxes-and-arrows (when the graph needs weight)

Modules as `<div>`s with borders and labels. Arrows as inline SVG `<line>` or `<path>` elements positioned absolutely over a relative container. Reach for this when you want the "after" diagram to feel like one thick-bordered deep module with greyed-out internals, since a plain node graph won't carry that weight.

### Cross-section (good for layered shallowness)

Stack horizontal bands (3rem tall, with a thick left border) to show layers a call passes through. Before: 6 thin layers each doing nothing. After: 1 thick band labelled with the consolidated responsibility.

### Mass diagram (good for "interface as wide as implementation")

Two rectangles per module: one for interface surface area, one for implementation. Before: interface rectangle is nearly as tall as the implementation rectangle (shallow). After: interface rectangle is short, implementation rectangle is tall (deep).

### Call-graph collapse

Before: a tree of function calls rendered as nested boxes. After: the same tree collapsed into one box, with the now-internal calls shown faded inside it.

## Style guidance

- Lean editorial, not corporate-dashboard. Generous whitespace. Serif optional for headings (a serif stack works well with stone/slate).
- Colour sparingly: one accent (emerald or indigo) plus red for leakage and amber for warnings.
- Keep diagrams ~320px tall so before/after sits comfortably side by side without scrolling.
- Use the `.label` treatment (small, uppercase, tracked) for module labels inside diagrams, so they read as schematic, not as UI.
- No scripts at all. The report is static: no app code, no interactivity, and nothing fetched from a network, so it reads the same with the network off.

## Top recommendation section

One larger card. Candidate name, one sentence on why, anchor link to its card. That's it.

## Tone

Plain English, concise, but the architectural nouns and verbs come straight from the `codebase-design` skill. Concision is not an excuse to drift.

**Use exactly:** module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality.

**Never substitute:** component, service, unit (for module) · API, signature (for interface) · boundary (for seam) · layer, wrapper (for module, when you mean module).

**Phrasings that fit the style:**

- "Order intake module is shallow: interface nearly matches the implementation."
- "Pricing leaks across the seam."
- "Deepen: one interface, one place to test."
- "Two adapters justify the seam: HTTP in prod, in-memory in tests."

**Wins bullets** name the gain in glossary terms: *"locality: bugs concentrate in one module"*, *"leverage: one interface, N call sites"*, *"interface shrinks; implementation absorbs the wrappers"*. Don't write *"easier to maintain"* or *"cleaner code"*, because those terms aren't in the glossary and don't earn their place.

No hedging, no throat-clearing, no "it's worth noting that…". If a sentence could be a bullet, make it a bullet. If a bullet could be cut, cut it. If a term isn't in the `codebase-design` glossary, reach for one that is before inventing a new one.
