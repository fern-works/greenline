# diagram-design: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cathrynlavery/diagram-design at 8d8b2993ee2256ee7dfc0eeb3b5713aba3b60792, `skills/diagram-design`. Drift: 60 of 40232 lines changed (0%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, series-s7-roster-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and greenline's description, extended to name waterfall and Excalidraw sources; no license or metadata fields

Record `pull-2026-09-11`, 1 hunk.

### `h:880d7b7f0cd6bc8e` in `SKILL.md`

```diff
-name: diagram-design
-description: Create branded architecture, IT current-state, flowchart, sequence, state machine, ER/data model, timeline, swimlane, quadrant, radar/spider, polar chart (polar/radial lollipop), loop/flywheel, nested, tree, org chart, layer stack, Venn, pyramid/funnel, treemap, bar, waterfall, line, Gantt and scatter charts, high-level, process, medallion, data flow, DP integration, DP security matrix, Sankey, fishbone, Wardley map, kanban, user journey, deployment, dependency graph, UML class, story map, or database schema diagrams as standalone HTML/SVG/PNG. Redraw .drawio/.drawio.png/.drawio.svg, Mermaid .mmd, or Excalidraw .excalidraw sources at a chosen size/detail; onboard brand tokens from a website; add semantic patterns, callouts, accessible motion, or sketchy/hand-drawn styling.
-license: MIT
-metadata:
-  version: "2.6"
+name: "diagram-design"
+description: "Create branded, durable diagrams as standalone HTML/SVG/PNG for artifacts and decisions, saved under .greenline/diagrams/ and linked from the owning artifact. Covers architecture, flowchart, sequence, state machine, ER, timeline, waterfall, and dozens more forms; redraws .drawio, Mermaid and Excalidraw sources at a chosen size and detail."
```

## scope: An opening paragraph after the title says the skill draws a durable diagram under .greenline/diagrams/<work-id>/ linked from its artifact, is offered in one line and started on the user's yes, defers a reply-side sketch to show-me, and is invoked by natural language with no plugin commands, no client-profile verbs and greenline doctor as the only doctor; greenline needs this because the consumer reads no prelude.

Record `fold-2026-09-11`, 1 hunk.

### `h:fa3174b263b01489` in `SKILL.md`

```diff
+This skill draws a durable diagram for an artifact or a decision: a standalone HTML, SVG or PNG file saved under `.greenline/diagrams/<work-id>/` and linked from the artifact it illustrates. Offer it in one line when a durable diagram would serve and the user did not ask for one, and start on the user's yes; a quick sketch that lives in the reply belongs to show-me. Everything here is invoked by asking in natural language: no plugin commands are installed, the client-profile verbs do not apply, and the only doctor is `greenline doctor`.
+
```

## dependency: §0 and §5 replace the home-directory profile store, the repository-root .diagram-design marker and the first-run ask-the-user gate with the effective style guide: .greenline/diagrams/style-guide.md when it exists (unmanaged workspace state, the only copy to edit), otherwise the installed references/style-guide.md, which greenline sync and greenline doctor own and which is never edited; brand tokens are written to the workspace copy from the skill or folder onboarding sections or pasted tokens, URL onboarding being out of scope offline. references/profiles.md and references/doctor.md are no longer pointed to.

Record `fold-2026-09-11`, 5 hunks.

### `h:a5548c6a58d72ddf` in `SKILL.md`

```diff
-## 0. First-time setup — style guide gate
+## 0. First-time setup: the effective style guide
```

### `h:a13ae7a0e6ab166b` in `SKILL.md`

```diff
-**Before generating your first diagram in a new project, verify the style guide has been customized.**
+**Before generating your first diagram in a project, resolve the effective style guide.** It is `.greenline/diagrams/style-guide.md` when that file exists: unmanaged workspace state, and the only copy to edit. Otherwise it is the installed [`references/style-guide.md`](references/style-guide.md) at its shipped defaults, which `greenline sync` and `greenline doctor` own and which is never edited.
```

### `h:b6eb204d3bea5e67` in `SKILL.md`

```diff
-First check the project root for a `.diagram-design` marker and resolve it per [`references/profiles.md`](references/profiles.md). A valid marker whose profile exists selects that file directly and skips this gate; `profile: default` also skips it. A malformed or missing-profile marker follows the visible failure handling in that reference. Never copy a marker-selected profile over the installed working copy.
+The profile is default: there is no home-directory profile store, no repository-root marker, and no first-run gate to pause on, so do not ask before drawing; say in the reply which guide the diagram used. When the user wants diagrams in their brand, write the project's tokens to `.greenline/diagrams/style-guide.md` as a full copy of the installed guide with its semantic roles changed, from the skill or folder sections of [`references/onboarding.md`](references/onboarding.md) or from tokens the user pastes; onboarding from a website URL is out of scope offline.
```

### `h:2f219179b4f57bb4` in `SKILL.md`

```diff
-Open [`references/style-guide.md`](references/style-guide.md) and check the default tokens. If they're still the shipped defaults (paper `#f5f5f5`, ink `#2d3142`, accent `#eb6c36` atomic-tangerine), **pause and ask the user**:
-
-> *"This is your first diagram in this project. The style guide is still at the default (neutral white-smoke + atomic-tangerine). Do you want to customize it to match your brand first? Options: (a) pull from your website URL, (b) extract from an installed skill, (c) extract from a local folder / design-system directory, (d) paste tokens manually, (e) proceed with the default for now, (f) load a saved client profile."*
-
-Then branch per the matching section of [`references/onboarding.md`](references/onboarding.md); for **(f)** follow [`references/profiles.md`](references/profiles.md).
-
-**Once the style guide has been customized** (or the user explicitly opted for default), skip this gate on subsequent runs. A leading profile header names the copied-in active profile. Without a header, any semantic-role value or typography family differing from shipped defaults means **custom-unsaved**: skip the gate and offer to save it as a profile. All-default tokens with no marker/header trigger the gate. At the end of every onboarding method, offer to save the result as a named client profile per `references/profiles.md`.
-
```

### `h:4dddb737606d83f7` in `SKILL.md`

```diff
-**The design system is skinnable.** All colors, typography, and tokens live in a single source of truth — [`references/style-guide.md`](references/style-guide.md). This file describes semantic roles (`paper`, `ink`, `muted`, `accent`, `link`, …). The default skin is a cool editorial palette (white-smoke paper, jet-black ink, atomic-tangerine accent, blue-slate muted, silver hairlines); to apply your own brand, either edit `style-guide.md` directly or run the URL-based flow described in [`references/onboarding.md`](references/onboarding.md).
+**The design system is skinnable.** All colors, typography, and tokens live in a single source of truth: the effective style guide of §0, which is [`references/style-guide.md`](references/style-guide.md) until the project writes `.greenline/diagrams/style-guide.md`. This file describes semantic roles (`paper`, `ink`, `muted`, `accent`, `link`, …). The default skin is a cool editorial palette (white-smoke paper, jet-black ink, atomic-tangerine accent, blue-slate muted, silver hairlines); to apply your own brand, write the project's copy as §0 describes, and never edit the installed one.
```

## dependency: §2 routes quick unicode diagrams to show-me, the roster skill that owns the reply-side visual, in place of wiretext, which greenline does not carry.

Record `fold-2026-09-11`, 1 hunk.

### `h:715ba42c346fae0b` in `SKILL.md`

```diff
-- Quick unicode diagrams → use **wiretext**.
+- Quick unicode diagrams → use **show-me**.
```

## dependency: §6 rule 6 and the §9 checklist say that the geometry verifier, the motion verifier and the skin linter do not ship with the installed skill (only scripts/self_check.py does), so those rules are checked by inspection; the em dash on each rewritten line is replaced per the em-dash rule.

Record `fold-2026-09-11`, 3 hunks.

### `h:cbc2645ff3f383f3` in `SKILL.md`

```diff
-6. **A label mask must not overlap a node drawn after it.** Rule 2 keeps the label off its own connector; this one keeps it off the boxes. Because nodes are painted after labels, a mask that lands partly inside a node is covered by the node fill and the text renders as a fragment sitting on the node border. Place the label on a segment of the connector that runs through open canvas — for a connector leaving a node's right edge, that means clearing the node's `x + width` before the mask starts. A mask fully *inside* a node is a badge chip and is fine; a mask overlapping a zone container is fine too, since zones are painted first. From a repository checkout, verify with `python3 <repo-root>/scripts/verify-geometry.py <file>`.
+6. **A label mask must not overlap a node drawn after it.** Rule 2 keeps the label off its own connector; this one keeps it off the boxes. Because nodes are painted after labels, a mask that lands partly inside a node is covered by the node fill and the text renders as a fragment sitting on the node border. Place the label on a segment of the connector that runs through open canvas: for a connector leaving a node's right edge, that means clearing the node's `x + width` before the mask starts. A mask fully *inside* a node is a badge chip and is fine; a mask overlapping a zone container is fine too, since zones are painted first. No geometry verifier ships with the installed skill; check this rule by inspection.
```

### `h:dea867e7482b030b` in `SKILL.md`

```diff
-- [ ] **No label mask overlaps a node drawn after it? (Node fill would clip the text — §6 rule 6. From a repository checkout, run `python3 <repo-root>/scripts/verify-geometry.py <file>`.)**
+- [ ] **No label mask overlaps a node drawn after it? (Node fill would clip the text; §6 rule 6. No geometry verifier ships here, so check by inspection.)**
```

### `h:08447be54346e2c6` in `SKILL.md`

```diff
-- [ ] If animated, does the complete static/no-JS frame work, does reduced motion hide/disable playback, and is the controller copied verbatim from `assets/template-motion.html`? From a repository checkout, also run `python3 <repo-root>/scripts/verify-motion.py path/to/generated.html` plus the skin linter; from an installed skill, manually check print and static-query states on top of the self-check.
+- [ ] If animated, does the complete static/no-JS frame work, does reduced motion hide/disable playback, and is the controller copied verbatim from `assets/template-motion.html`? Neither the motion verifier nor the skin linter ships with the installed skill; manually check print and static-query states on top of the self-check.
```

## method: upstream defaults to the light template; greenline defaults to the dark variant (assets/template-dark.html) and uses the light one on request, which changes what the method produces by default (the operator's ruling of 2026-08-26 against adaptive theming) Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 2 hunks.

### `h:539160ffe9f5d7ea` in `SKILL.md`

```diff
-| **Minimal light** (default) | `assets/template.html`, `example-<type>.html` | Screenshot-ready. Diagram + title. Warm paper. |
-| **Minimal dark** | `assets/template-dark.html`, `example-<type>-dark.html` | Dark mode sites, slides, high-contrast posts. |
+| **Minimal light** | `assets/template.html`, `example-<type>.html` | Screenshot-ready. Diagram + title. Warm paper. When the user asks for light. |
+| **Minimal dark** (default) | `assets/template-dark.html`, `example-<type>-dark.html` | Dark mode sites, slides, high-contrast posts. The default here unless the user asks otherwise. |
```

### `h:876d5159b8bf9e1a` in `SKILL.md`

```diff
-1. Copy the variant closest to what you want (`assets/template.html` for minimal, `assets/template-full.html` for cards, `assets/template-motion.html` only when motion is requested).
+1. Copy the variant closest to what you want (`assets/template-dark.html` by default, `assets/template.html` when the user asks for light, `assets/template-full.html` for cards, `assets/template-motion.html` only when motion is requested).
```

## harness: The plugin slash commands are not installed here, so §11 routes on any request that names the source format instead of 'the matching import command', and the export, export-registry and import references drop the diagram-design:* command invocations they named and keep the natural-language triggers; everything is invoked by asking.

Record `fold-2026-09-11`, 7 hunks.

### `h:4536dd321455332d` in `SKILL.md`

```diff
-Route by source: `.drawio*` → [import-drawio.md](references/import-drawio.md); `.mmd`, `.mermaid`, or Markdown containing a fenced `mermaid` block → [import-mermaid.md](references/import-mermaid.md); `.excalidraw` → [import-excalidraw.md](references/import-excalidraw.md). Follow it for "convert this", "redraw this diagram", "make this presentable", and the matching import command.
+Route by source: `.drawio*` → [import-drawio.md](references/import-drawio.md); `.mmd`, `.mermaid`, or Markdown containing a fenced `mermaid` block → [import-mermaid.md](references/import-mermaid.md); `.excalidraw` → [import-excalidraw.md](references/import-excalidraw.md). Follow it for "convert this", "redraw this diagram", "make this presentable", and any request that names the source format.
```

### `h:cc698fa8ba1ceb50` in `references/export-registry.md`

```diff
-- The user invokes `/diagram-design:export-diagram <html-file> --registry` (alone or combined with `--svg-only`/`--png-only`/`--scale`/`--output`).
+- The user asks for the registry sidecar of an exported diagram (the `--registry` option, alone or combined with `--svg-only`/`--png-only`/`--scale`/`--output`).
```

### `h:b39bd644be1d3b90` in `references/export.md`

```diff
-- The user invokes `/diagram-design:export-diagram <html-file>` (the plugin's slash command — defined in `commands/export-diagram.md` at the repo root).
```

### `h:9cc57d60c10d4406` in `references/export.md`

```diff
-The slash command is a thin wrapper that delegates here — both paths run the same procedure below.
+Every such request runs the same procedure below; there is no separate command here.
```

### `h:df52db37fb23edbf` in `references/import-drawio.md`

```diff
-Load this file when the user points at a `.drawio`, `.drawio.xml`, `.drawio.png`, or `.drawio.svg` file and wants a diagram out of it — "convert this drawio", "redraw this diagram", "make this presentable", "この drawio をきれいにして", or the `/diagram-design:import-drawio` slash command.
+Load this file when the user points at a `.drawio`, `.drawio.xml`, `.drawio.png`, or `.drawio.svg` file and wants a diagram out of it: "convert this drawio", "redraw this diagram", "make this presentable", "この drawio をきれいにして".
```

### `h:360aad95abf96747` in `references/import-excalidraw.md`

```diff
-Load this file for `.excalidraw` or `.excalidraw.json` files (saved from excalidraw.com, the desktop app, or the Obsidian plugin) when the user asks to convert, redraw, clean up, or present the board, or uses `/diagram-design:import-excalidraw`.
+Load this file for `.excalidraw` or `.excalidraw.json` files (saved from excalidraw.com, the desktop app, or the Obsidian plugin) when the user asks to convert, redraw, clean up, or present the board.
```

### `h:00439644985c5532` in `references/import-mermaid.md`

```diff
-Load this file for `.mmd`, `.mermaid`, or Markdown containing fenced `mermaid` blocks when the user asks to convert, redraw, simplify, or present the diagram, or uses `/diagram-design:import-mermaid`.
+Load this file for `.mmd`, `.mermaid`, or Markdown containing fenced `mermaid` blocks when the user asks to convert, redraw, simplify, or present the diagram.
```

## location: section 12 saves every diagram to .greenline/diagrams/<work-id>/ under the owning ticket or initiative, never loose at the repository root, and links it from the artifact it illustrates; the link is an annotative edit that bumps no revision

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:bebc797645aa2adb` in `SKILL.md`

```diff
-Always produce a single self-contained `.html` file:
+Always produce a single self-contained `.html` file, saved to `.greenline/diagrams/<work-id>/` under the owning ticket or initiative (for example `.greenline/diagrams/TKT-001/flow.html`), never loose at the repository root:
```

## location: §12 saves every diagram to .greenline/diagrams/<work-id>/ under the owning ticket or initiative (never loose at the repository root, which QA run 041 saw two agents do on first contact) and links it from the artifact it illustrates as an annotative edit that never bumps that artifact's revision; a diagram that explains a durable spec is durable state.

Record `fold-2026-09-11`, 1 hunk.

### `h:f0658c1e8a42fab3` in `SKILL.md`

```diff
+Link the file from the artifact it illustrates; a diagram that explains a durable spec is durable state. Adding the link is an annotative edit (links, typos and formatting change no meaning), so it never increments that artifact's `revision`; only a change of meaning bumps, and in doubt, bump and re-pin the consumers.
+
```

## lifecycle: The Durable output line for the situational class: .greenline/diagrams/<work-id>/, linked from the owning artifact, offered in one line when a durable diagram would serve and the user did not ask for one, started on the user's yes.

Record `fold-2026-09-11`, 1 hunk.

### `h:631a30d605951def` in `SKILL.md`

```diff
+
+Durable output: .greenline/diagrams/<work-id>/, linked from the owning artifact by an annotative edit that bumps no revision; offered in one line when a durable diagram would serve and the user did not ask for one, started on the user's yes.
```

## rename: renamed skill references and bare roster names in prose (the notation pass)

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:a7d54f1af831e91d` in `references/doctor.md`

```diff
-Load this file when the user asks to run diagnostics, health checks, or first-run troubleshooting, or when they invoke `/diagram-design:doctor` or `/doctor`.
+Load this file when the user asks to run diagnostics, health checks, or first-run troubleshooting, or when they invoke `diagram-design:doctor` or `/doctor`.
```

## Retired

- `h:e642c18495242912` in `pull-2026-09-11`: the frontmatter hunk against the previous pin
- `h:6cbefc8f4a8888e0` in `fold-2026-09-11`: the prelude is folded into the body: the scope paragraph after the title, §0 and §5 for the style guide, §2 for show-me, §6 and §9 for the verifiers, §10 for the dark default, §11 and the references for the plugin commands, §12 for the home and the link rule
- `h:10af307af0eabd5b` in `fold-2026-09-11`: the notation-pass line in references/export.md was rewritten to drop the plugin command it named; the rename hunk dissolved into the harness edit
- `h:be2c268ebe28b66c` in `fold-2026-09-11`: the notation-pass line in references/import-drawio.md was rewritten to drop the plugin command it named; the rename hunk dissolved into the harness edit
- `h:0eeb9e590dfb589c` in `fold-2026-09-11`: the notation-pass line in references/import-mermaid.md was rewritten to drop the plugin command it named; the rename hunk dissolved into the harness edit
- `h:539160ffe9f5d7ea` in `fold-walk-2026-09-11`: re-kinded from scope to method
- `h:876d5159b8bf9e1a` in `fold-walk-2026-09-11`: re-kinded from scope to method
- `h:bebc797645aa2adb` in `fold-walk-2026-09-11`: re-claimed with a reason a merger can act on
- `h:539160ffe9f5d7ea` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
- `h:876d5159b8bf9e1a` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
