# show-me: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/humanlayer/skills at 3c2629142c5d437428269b1b722b08c0b87f574d, `plugins/show-me/skills/show-me`. Drift: 24 of 127 lines changed (19%). Records: baseline-copies-2026-09-11, descriptions-practice-the-catalog-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, replay-s7-show-me-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description; the description rewritten without em dashes under the widened rule

Record `descriptions-practice-the-catalog-2026-09-11`, 1 hunk.

### `h:c2bbeb58099b66ed` in `SKILL.md`

```diff
-name: show-me
-description: Help the user understand the current topic visually with concise diagrams, code-shape sketches, and focused HTML artifacts.
+name: "show-me"
+description: "Explain the current topic visually in the reply: pseudocode, call trees, component trees, shallow file trees, shape diffs, and diagrams or a one-file HTML view where a renderer exists. Use whenever a reply would walk through a flow, a hierarchy, a state machine, a comparison, or a change to an existing shape, and whenever the user asks to be shown."
```

## scope: the scope paragraph: a durable diagram the user did not ask for is offered in one line; on the ask or the yes diagram-design draws it when installed, otherwise a text diagram goes into the repository's existing docs home and the optional method is named, so an explicit ask is answered rather than deflected

Record `replay-s7-show-me-2026-09-11`, 1 hunk.

### `h:75e9672fff3af0bb` in `SKILL.md`

```diff
+Answer first, then show. The visual sits beside the answer, in a form the current client renders in the reply; answer-plainly governs the claim, unslop the surrounding prose, and the visual earns its place only when it makes the explanation clearer. Apply this on your own whenever a reply would walk through a flow, a hierarchy, a state machine, a comparison or a change to an existing shape, and whenever the user asks to be shown. A read-only explanation creates no repository artifact: it lives in the response or in a capture outside the repository. A durable diagram the user did not ask for is offered in one line. On the user's ask or yes, `diagram-design` (opt-in) draws it when it is installed; when it is not, draw the diagram as text into the repository's existing docs home and name `diagram-design` as the optional method for a rendered one.
+
```

## harness: mermaid renders in neither harness TUI, so the worked sequenceDiagram taught a form the reader cannot see.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:37f873fc70dd57ae` in `SKILL.md`

```diff
-- Show component interaction, control flow, or data flow with Mermaid:
-
-```mermaid
-sequenceDiagram
-    participant User
-    participant UI
-    participant Daemon
-    User->>UI: choose command
-    UI->>Daemon: send expanded prompt
-    Daemon-->>UI: stream result
-```
-
```

## location: the HTML bullet keeps its scratch home under .greenline/tmp/show-me/ and the read-only case, and compares density against a text view instead of the Mermaid option the copy removed because neither harness renders it

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:42fd50a31cd8d682` in `SKILL.md`

```diff
-- For a visual UI, layout, state comparison, or concept too dense for Mermaid, write one focused HTML file — a diagram, an infographic, or a short slide deck, whichever fits the point. Match the product's colors, type, spacing, and components; use real labels and data; support desktop and mobile. Then open it for the user:
+- For a visual UI, layout, state comparison, or concept too dense for a text view, write one focused HTML file, a diagram, an infographic, or a short slide deck, whichever fits the point. Match the product's colors, type, spacing, and components; use real labels and data; support desktop and mobile. During authorized artifact work the file is scratch under `.greenline/tmp/show-me/`; a read-only explanation writes it outside the repository. Then open it for the user with the harness's shell tool:
```

## harness: Upstream's Bash(open ...) is Claude Code's tool-call notation; the copy shows the plain shell command the harness's shell tool runs, at the greenline scratch path.

Record `fold-2026-09-11`, 1 hunk.

### `h:f906b3e7f860bd96` in `SKILL.md`

```diff
-Bash(open path/to/show-me-{description}.html)
+open .greenline/tmp/show-me/{description}.html
```

## scope: the Durable output line now agrees with the scope paragraph: none unless the user asks, the same offer, draw or text-and-name rule

Record `replay-s7-show-me-2026-09-11`, 1 hunk.

### `h:4a1c63110c07ea89` in `SKILL.md`

```diff
+
+Durable output: none unless the user asks (a visual in the reply; scratch under `.greenline/tmp/show-me/` during authorized artifact work). A durable diagram the user did not ask for is offered in one line; on the ask or the yes, `diagram-design` (opt-in) draws it when installed, otherwise a text diagram goes into the repository's existing docs home and the optional method is named. answer-plainly governs the claim, unslop the prose.
```

## Retired

- `h:80341d0ee151e8f9` in `descriptions-practice-the-catalog-2026-09-11`: the description as cut over carried em dashes greenline wrote
- `h:8f020ffe6c8a88ab` in `fold-2026-09-11`: the greenline prelude is folded into the body: the scope paragraph, the HTML bullet's scratch path and the situational closing line
- `h:d9484200486c9c7c` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:2448ef0cdc6e62a7` in `replay-s7-show-me-2026-09-11`: rewritten in place with the explicit-ask rule; its replacement is claimed above
- `h:53c9af3f7f6d44d2` in `replay-s7-show-me-2026-09-11`: rewritten in place to agree with the scope paragraph; its replacement is claimed above
