# improve-codebase-architecture: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/improve-codebase-architecture`. Drift: 124 of 199 lines changed (62%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, vocabulary-owner-2026-09-12, roster-keepers-2026-09-15, roster-keepers-fix-2026-09-15.

## dependency: The report is offline-complete: embedded CSS and static inline SVG replace the Tailwind and Mermaid CDN scripts in step 2 and throughout HTML-REPORT.md (the scaffold's stylesheet, the SVG graph pattern in place of the Mermaid workhorse, the utility-class mentions, the no-scripts rule), with a network-off check before handoff and the HTML-REPORT.md passed to any delegate; greenline's consumer must open the report with no network, and HTML-REPORT.md's intro line also names the tmp home the report lives in.

Record `fold-2026-09-11`, 16 hunks.

### `h:1399bff592b8e056` in `HTML-REPORT.md`

```diff
-The architectural review is rendered as a single self-contained HTML file in the OS temp directory. Tailwind and Mermaid both come from CDNs. Mermaid handles graph-shaped diagrams reliably; hand-built divs and inline SVG handle the more editorial visuals (mass diagrams, cross-sections). Mix the two: don't lean on Mermaid for everything, it'll start to look generic.
+The architectural review is rendered as a single self-contained HTML file under `.greenline/tmp/improve-codebase-architecture/`. It is offline-complete: the CSS is embedded and every diagram is static inline SVG or HTML, so no script, style, font, or image loads from a network. Inline SVG draws the graph-shaped diagrams; hand-built divs and inline SVG handle the more editorial visuals (mass diagrams, cross-sections). Mix the two: don't lean on one pattern for everything, it'll start to look generic.
```

### `h:941b160bf511f165` in `HTML-REPORT.md`

```diff
-    <script src="https://cdn.tailwindcss.com"></script>
-    <script type="module">
-      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
-      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
-    </script>
```

### `h:995273c7c6e2a602` in `HTML-REPORT.md`

```diff
-      /* small custom layer for things Tailwind doesn't cover cleanly:
+      /* the whole stylesheet is embedded: nothing loads from a network */
+      body { margin: 0; background: #fafaf9; color: #0f172a; font-family: system-ui, sans-serif; }
+      main { max-width: 64rem; margin: 0 auto; padding: 3rem 1.5rem; }
+      main > * + * { margin-top: 3rem; }
+      article { border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #fff; padding: 1.5rem; }
+      article + article { margin-top: 2.5rem; }
+      .badge { display: inline-block; border-radius: 9999px; padding: 0.125rem 0.625rem; font-size: 0.75rem; font-weight: 600; }
+      .strong { background: #d1fae5; color: #065f46; }
+      .explore { background: #fef3c7; color: #92400e; }
+      .speculative { background: #e2e8f0; color: #334155; }
+      .files { font-family: ui-monospace, monospace; font-size: 0.875rem; }
+      .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
+      .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
+      .diagram { border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #fff; padding: 1rem; }
+      .callout { border: 1px solid #fcd34d; background: #fffbeb; border-radius: 0.375rem; padding: 0.5rem 0.75rem; }
+      /* small custom layer for the diagrams:
```

### `h:77101e2cf5561008` in `HTML-REPORT.md`

```diff
-  <body class="bg-stone-50 text-slate-900 font-sans">
-    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
+  <body>
+    <main>
```

### `h:b272196e34427926` in `HTML-REPORT.md`

```diff
-      <section id="candidates" class="space-y-10">...</section>
+      <section id="candidates">...</section>
```

### `h:20e1e2de93fa3132` in `HTML-REPORT.md`

```diff
-- **Files**: monospaced list, `font-mono text-sm`.
+- **Files**: monospaced list (the `.files` class).
```

### `h:793c1bd92893f169` in `HTML-REPORT.md`

```diff
-### Mermaid graph (the workhorse for dependencies / call flow)
+### Inline SVG graph (the workhorse for dependencies / call flow)
```

### `h:c48dd4983a4d5a1b` in `HTML-REPORT.md`

```diff
-Use a Mermaid `flowchart` or `graph` when the point is "X calls Y calls Z, and look at the mess." Wrap it in a Tailwind-styled card so it doesn't feel parachuted in. Style with classDef to colour leakage edges red and the deep module dark. Sequence diagrams work well for "before: 6 round-trips; after: 1."
+Draw the graph directly in SVG when the point is "X calls Y calls Z, and look at the mess": modules as `<rect>` elements with a `<text>` label, calls as `<path>` elements ending in an arrowhead `<marker>`, laid out by hand left to right. Wrap it in a `.diagram` card so it doesn't feel parachuted in. Put the `leak` class on leakage edges to colour them red and the `deep` treatment on the deep module. Prefix marker ids per diagram so two SVGs on the page never share one. A hand-drawn sequence (lifelines as vertical lines, messages as horizontal arrows) works well for "before: 6 round-trips; after: 1."
```

### `h:1307247b49127a74` in `HTML-REPORT.md`

```diff
-<div class="rounded-lg border border-slate-200 bg-white p-4">
-  <pre class="mermaid">
-    flowchart LR
-      A[OrderHandler] --> B[OrderValidator]
-      B --> C[OrderRepo]
-      C -.leak.-> D[PricingClient]
-      classDef leak stroke:#dc2626,stroke-width:2px;
-      class C,D leak
-  </pre>
+<div class="diagram">
+  <svg viewBox="0 0 560 120" role="img" aria-label="OrderHandler calls OrderValidator, which calls OrderRepo, which leaks into PricingClient">
+    <defs>
+      <marker id="c1-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
+        <polygon points="0 0, 8 3, 0 6" fill="#475569" />
+      </marker>
+    </defs>
+    <rect x="8" y="40" width="112" height="40" rx="4" fill="#fff" stroke="#0f172a" />
+    <text x="64" y="64" text-anchor="middle" font-size="12">OrderHandler</text>
+    <rect x="168" y="40" width="112" height="40" rx="4" fill="#fff" stroke="#0f172a" />
+    <text x="224" y="64" text-anchor="middle" font-size="12">OrderValidator</text>
+    <rect x="328" y="40" width="88" height="40" rx="4" fill="#fff" stroke="#dc2626" />
+    <text x="372" y="64" text-anchor="middle" font-size="12">OrderRepo</text>
+    <rect x="456" y="40" width="96" height="40" rx="4" fill="#fff" stroke="#dc2626" />
+    <text x="504" y="64" text-anchor="middle" font-size="12">PricingClient</text>
+    <path d="M120 60 H168" stroke="#475569" fill="none" marker-end="url(#c1-arrow)" />
+    <path d="M280 60 H328" stroke="#475569" fill="none" marker-end="url(#c1-arrow)" />
+    <path class="leak seam" d="M416 60 H456" stroke-width="2" fill="none" marker-end="url(#c1-arrow)" />
+  </svg>
```

### `h:e1b16f23b6ae9027` in `HTML-REPORT.md`

```diff
-### Hand-built boxes-and-arrows (when Mermaid's layout fights you)
+### Hand-built boxes-and-arrows (when the graph needs weight)
```

### `h:b5e0accd8a8c92b0` in `HTML-REPORT.md`

```diff
-Modules as `<div>`s with borders and labels. Arrows as inline SVG `<line>` or `<path>` elements positioned absolutely over a relative container. Reach for this when you want the "after" diagram to feel like one thick-bordered deep module with greyed-out internals, since Mermaid won't render that with the right weight.
+Modules as `<div>`s with borders and labels. Arrows as inline SVG `<line>` or `<path>` elements positioned absolutely over a relative container. Reach for this when you want the "after" diagram to feel like one thick-bordered deep module with greyed-out internals, since a plain node graph won't carry that weight.
```

### `h:42274dbd7c73a7e8` in `HTML-REPORT.md`

```diff
-Stack horizontal bands (`h-12 border-l-4`) to show layers a call passes through. Before: 6 thin layers each doing nothing. After: 1 thick band labelled with the consolidated responsibility.
+Stack horizontal bands (3rem tall, with a thick left border) to show layers a call passes through. Before: 6 thin layers each doing nothing. After: 1 thick band labelled with the consolidated responsibility.
```

### `h:58903e41160040ff` in `HTML-REPORT.md`

```diff
-- Lean editorial, not corporate-dashboard. Generous whitespace. Serif optional for headings (`font-serif` works well with stone/slate).
+- Lean editorial, not corporate-dashboard. Generous whitespace. Serif optional for headings (a serif stack works well with stone/slate).
```

### `h:31c64011dad50ca9` in `HTML-REPORT.md`

```diff
-- Use `text-xs uppercase tracking-wider` for module labels inside diagrams, so they read as schematic, not as UI.
-- The only scripts are the Tailwind CDN and the Mermaid ESM import. The report is otherwise static: no app code, no interactivity beyond Mermaid's own rendering.
+- Use the `.label` treatment (small, uppercase, tracked) for module labels inside diagrams, so they read as schematic, not as UI.
+- No scripts at all. The report is static: no app code, no interactivity, and nothing fetched from a network, so it reads the same with the network off.
```

### `h:308962af612f83af` in `SKILL.md`

```diff
-The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals: use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.
+The report is offline-complete: **embedded CSS** for layout and styling, and **static inline SVG** for diagrams where a graph/flow/sequence reliably communicates the structure, with no network-loaded script, style, font, or image needed to view it. Mix graph-shaped SVG with hand-crafted CSS/HTML visuals: draw relationships directly in SVG when they are graph-shaped (call graphs, dependencies, sequences), and use hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.
```

### `h:93a879c6c6bb1016` in `SKILL.md`

```diff
-See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.
+See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance, and pass it to any report-writing delegate. Before handing the report over, open it with network access disabled and confirm every diagram and label remains visible; if that check could not run, say so and call the report unverified offline.
```

## rename: renamed skill references and bare roster names in prose (the notation pass)

Record `baseline-copies-2026-09-11`, 4 hunks.

### `h:eface0edc8505ebc` in `HTML-REPORT.md`

```diff
-The diagrams carry the weight. Prose is sparse, plain, and uses the glossary terms (from the `/codebase-design` skill) without ceremony.
+The diagrams carry the weight. Prose is sparse, plain, and uses the glossary terms (from the `codebase-design` skill) without ceremony.
```

### `h:23cded290e209427` in `HTML-REPORT.md`

```diff
-Plain English, concise, but the architectural nouns and verbs come straight from the `/codebase-design` skill. Concision is not an excuse to drift.
+Plain English, concise, but the architectural nouns and verbs come straight from the `codebase-design` skill. Concision is not an excuse to drift.
```

### `h:9cb2895e93f75c07` in `HTML-REPORT.md`

```diff
-No hedging, no throat-clearing, no "it's worth noting that…". If a sentence could be a bullet, make it a bullet. If a bullet could be cut, cut it. If a term isn't in the `/codebase-design` glossary, reach for one that is before inventing a new one.
+No hedging, no throat-clearing, no "it's worth noting that…". If a sentence could be a bullet, make it a bullet. If a bullet could be cut, cut it. If a term isn't in the `codebase-design` glossary, reach for one that is before inventing a new one.
```

### `h:fc59bb62cdbec8af` in `SKILL.md`

```diff
-**Use CONTEXT.md vocabulary for the domain, and the `/codebase-design` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."
+**Use CONTEXT.md vocabulary for the domain, and the `codebase-design` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."
```

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:8db9d7b4b37c8346` in `SKILL.md`

```diff
-name: improve-codebase-architecture
-description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
-disable-model-invocation: true
+name: "improve-codebase-architecture"
+description: "Scan a codebase for deepening opportunities and present them as a visual report, then grill through the one you pick. Use for 'refactor what next', 'tech debt', 'this repo is a mess, where do I start', or a scoped architecture review."
```

## scope: An opening paragraph after the title says when the skill fires, that it reads .greenline/map/snapshot.json when architecture-map (opt-in) has written it and that architecture-map (opt-in) is the refresh once a deepening lands, and that the survey is a report the operator decides on; greenline needs this because the consumer reads no prelude. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:eb12c8a8088ec617` in `SKILL.md`

```diff
+This skill surveys a codebase for deepening opportunities: use it for "refactor what next", "tech debt", "this repo is a mess, where do I start", or a scoped architecture review. When `architecture-map` (opt-in) has written `.greenline/map/snapshot.json`, read it before walking the codebase; once a deepening lands, `architecture-map` (opt-in) is the refresh that folds it back into the map. The survey is a report, not implementation work: the owner decides what is taken up, and a taken-up finding becomes a compact ticket or an initiative.
+
```

## harness: Where upstream says 'call the Skill tool with' codebase-design, grilling or domain-modeling, the copy loads the method through the harness's native skill mechanism or reads its installed SKILL.md and required support, and carries the vocabulary into every delegated brief; greenline runs on Codex and Claude Code, neither of which is promised a tool by that name.

Record `fold-2026-09-11`, 3 hunks.

### `h:939714186363595d` in `SKILL.md`

```diff
-- Call the Skill tool with "codebase-design" for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion, and don't drift into "component," "service," "API," or "boundary."
+- Load codebase-design through the harness's native skill mechanism, or read its installed SKILL.md and required support when the harness has none, for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion and in every delegated brief, and don't drift into "component," "service," "API," or "boundary."
```

### `h:28a6fea346ffa91d` in `SKILL.md`

```diff
-Once the user picks a candidate, call the Skill tool with "grilling" to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.
+Once the user picks a candidate, load grilling (through the harness's native skill mechanism, or its installed SKILL.md) to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.
```

### `h:b9bf656f25430341` in `SKILL.md`

```diff
-Side effects happen inline as decisions crystallize; call the Skill tool with "domain-modeling" to keep the domain model current as you go:
+Side effects happen inline as decisions crystallize; load domain-modeling to keep the domain model current as you go:
```

## dependency: Step 1's hot-spot search starts from .greenline/map/snapshot.json when it exists: its drifting nodes and churn tint are the hot spots already measured and its unclaimed-files list is ground to inspect before a finding; an optional consume of the opt-in map's home, so the survey does not re-walk what the map measured.

Record `fold-2026-09-11`, 1 hunk.

### `h:76f507097e5dd99b` in `SKILL.md`

```diff
-- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.
+- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net. When `.greenline/map/snapshot.json` exists, start from it: its drifting nodes and churn tint are these hot spots, already measured, and its unclaimed-files list is ground the map has not described, so inspect that ground before making a finding.
```

## location: Step 2 writes the report to .greenline/tmp/improve-codebase-architecture/architecture-review-<timestamp>.html instead of the OS temp directory resolved from $TMPDIR and /tmp, and promotes it to .greenline/work/evidence/<work-id>/ when authorized work takes a finding up; greenline's scratch home keeps the survey out of git and lets accepted work cite the report durably.

Record `fold-2026-09-11`, 1 hunk.

### `h:51bf4bb2bf24859b` in `SKILL.md`

```diff
-Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows), and write to `<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user (`xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows) and tell them the absolute path.
+Write a self-contained HTML file to `.greenline/tmp/improve-codebase-architecture/architecture-review-<timestamp>.html` so each run gets a fresh file and nothing lands in the repo: a survey need not create implementation work, and git never sees tmp. Open it for the user (`xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows) and tell them the absolute path. When authorized work takes a finding up, retain the report in that work's evidence home, `.greenline/work/evidence/<work-id>/`, so its artifacts can cite it durably.
```

## method: both side-effect bullets write CONTEXT.md only when the request's grant covers it and otherwise offer the entry in one line, matching the block's situational-skill rule; carried from roster-keepers-2026-09-15; the method edit is on the operator's word of 2026-09-15 at the card J-8, with J-2 folded in

Record `roster-keepers-fix-2026-09-15`, 1 hunk.

### `h:73ffc7e37ef72997` in `SKILL.md`

```diff
-- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
-- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
+- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` when the request's grant covers it, creating the file lazily if it doesn't exist; otherwise offer the entry in one line.
+- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there when the request's grant covers it, or offer the entry in one line.
```

## lifecycle: After the grilling loop the survey returns to the operator (a recommendation is not authorization, accepted work is linked to the report and becomes a compact ticket or an initiative, no planning program per observation) and the Handoff section the skills-handoff gate parses closes the skill: consumes the repository, the optional map snapshot, CONTEXT.md and the decision records; produces the offline report in tmp promoted only when taken up; next is implement or grill-with-docs. The hunk's first line is the same harness rewrite as the edit above, on the last 'call the Skill tool' sentence. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:0d7c4a93104f235e` in `SKILL.md`

```diff
-- **Want to explore alternative interfaces for the deepened module?** Call the Skill tool with "codebase-design" and use its design-it-twice parallel sub-agent pattern.
+- **Want to explore alternative interfaces for the deepened module?** Load codebase-design and use its design-it-twice parallel sub-agent pattern.
+
+The survey, its evidence and the grilled candidate return to the owner; a recommendation alone does not authorize implementation. Work the owner takes up stays linked to the survey's report and becomes a compact ticket for a bounded change, or an initiative where unresolved intent and dependent work warrant one. Do not manufacture a planning program for each observation.
+
+## Handoff
+
+Consumes: the repository; .greenline/map/snapshot.json when architecture-map (opt-in) has written it (optional); CONTEXT.md and the decision records
+Produces: the offline HTML report under .greenline/tmp/improve-codebase-architecture/, promoted to .greenline/work/evidence/<work-id>/ only when a finding is taken up; the survey returns to the owner and a recommendation is not authorization
+Next: accepted work becomes a compact ticket (implement) or an initiative (grill-with-docs)
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:f159d3ab9f303c53` in `agents/openai.yaml`

Removed file, 5 lines.

## Retired

- `h:411edfa8955c2c1d` in `fold-2026-09-11`: the prelude is folded into the body: the scope paragraph after the title, step 1's snapshot sentence, step 2's tmp home and offline-complete report, HTML-REPORT.md's scaffold and patterns, and the native-mechanism sentences where the Skill tool was called
- `h:a7a3e94245bf8acc` in `fold-2026-09-11`: the completion is folded into the body: the return-to-the-operator paragraph after the grilling loop and the Handoff section at the end
- `h:2ba6e4c1dbb07896` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
- `h:8888e50bb7f89125` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-2026-09-11) carries to the hunk that replaced it
- `h:8dadeec5e9389e9c` in `roster-keepers-fix-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8's fix, 2026-09-15)
