# domain-modeling: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/domain-modeling`. Drift: 30 of 184 lines changed (16%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, roster-keepers-2026-09-15.

## vocabulary: two ADR authorities write to one docs/adr/; the house convention is the dated filename record-architecture-decisions sets, not sequential numbers that collide across concurrent branches.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:7cef8b0384786ada` in `ADR-FORMAT.md`

```diff
-ADRs live in `docs/adr/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.
+ADRs live in `docs/adr/` and are named `YYYY-MM-DD-short-title.md`: a dated file with a specific, durable title. Sequential numbers are not used, because they conflict across concurrent branches.
```

## vocabulary: the Status option names sequential ADR-NNNN ids and adds approval metadata the house convention forbids; superseding is recorded by a later ADR linking the earlier one.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:52ed6604d2004321` in `ADR-FORMAT.md`

```diff
-- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`): useful when decisions are revisited
```

## vocabulary: the Numbering section is the operative half of the sequential scheme; with dated filenames there is nothing to scan or increment.

Record `baseline-copies-2026-09-11`, 2 hunks.

### `h:cefcdcfc1ec43586` in `ADR-FORMAT.md`

```diff
-## Numbering
+## Naming
```

### `h:7072b9dcb593d2b0` in `ADR-FORMAT.md`

```diff
-Scan `docs/adr/` for the highest existing number and increment by one.
+Take today's date and a short, specific title: `2026-08-26-raw-sql-for-serializable-reads.md`. Nothing to scan, nothing to increment.
```

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:a571d33c694a2cba` in `SKILL.md`

```diff
-name: domain-modeling
-description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR.
+name: "domain-modeling"
+description: "Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR."
```

## scope: one opening paragraph in the skill's voice after the title: writes the words down while model-the-domain restructures the code; fires on terminology discussion, CONTEXT.md edits, a term change that needs an ADR, and a term doing two jobs, where it is offered in one line; the existing glossary is the home and CONTEXT.md is created only when the repository has none; a durable term decision goes through record-architecture-decisions; it never restructures code and never records a decision that is not one

Record `fold-2026-09-11`, 1 hunk.

### `h:06d22e76122e86e4` in `SKILL.md`

```diff
+This skill writes the words down; model-the-domain restructures the code around them. It fires when codebase terminology is under discussion, when `CONTEXT.md` is written or edited, when a term change needs an ADR, and when a term is doing two jobs, where it is offered in one line: name it and write it down? The home for terms is the repository's existing glossary or vocabulary document; `CONTEXT.md` is created only when the repository has none. A term change that is a durable decision goes through record-architecture-decisions, whose dated naming governs ADRs. This skill never restructures code and never records a decision that is not one.
+
```

## vocabulary: the ADR example tree shows dated filenames (YYYY-MM-DD-short-title.md), the house convention record-architecture-decisions owns, in place of sequential numbers that collide across branches

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:79077b3a5d79bf71` in `SKILL.md`

```diff
-│       ├── 0001-event-sourced-orders.md
-│       └── 0002-postgres-for-write-model.md
+│       ├── 2026-01-12-event-sourced-orders.md
+│       └── 2026-02-03-postgres-for-write-model.md
```

## location: an existing glossary or vocabulary document is the home for terms, whatever its name, and CONTEXT.md is created only when the repository has none; an existing decision home is likewise the home for an ADR (docs/ledger/evidence/qa-s6-block-fixes/artifact-discipline.md, the home rule)

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:ca55ef0b03d7197b` in `SKILL.md`

```diff
-Create files lazily: only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.
+Create files lazily: only when you have something to write. An existing glossary or vocabulary document is the home for terms, whatever its name; if the repository has none, create `CONTEXT.md` when the first term is resolved. An existing decision home (a decisions document, an ADR directory of its own) is the home for ADRs; if the repository has none, `docs/adr/` is created when the first ADR is needed, seeded by record-architecture-decisions.
```

## location: the artifact-discipline rule (review of 2026-09-11, item 3): an existing glossary or vocabulary document is the home for terms, whatever its name, and CONTEXT.md is created only when the repository has none; an existing decision home is the home for ADRs and docs/adr/ is seeded by record-architecture-decisions only when there is none; the glossary challenge and the inline update read and write that home, with CONTEXT-FORMAT.md governing CONTEXT.md

Record `fold-2026-09-11`, 1 hunk.

### `h:44aea2af19997bd9` in `SKILL.md`

```diff
-When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
+When the user uses a term that conflicts with the existing language in `CONTEXT.md` or the repository's own glossary, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
```

## method: the inline update writes CONTEXT.md or the existing glossary right there only when the request's grant covers that file, and otherwise offers the entry in one line and writes on the owner's word, matching the block's situational-skill rule; the earlier location claim stands: an existing glossary is the home for terms and CONTEXT.md is created only when the repository has none (carried from fold-2026-09-11); the method edit is on the operator's word of 2026-09-15 at the card J-8, with J-2 folded in

Record `roster-keepers-2026-09-15`, 1 hunk.

### `h:1972c58333e873d4` in `SKILL.md`

```diff
-When a term is resolved, update `CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).
+When a term is resolved, update `CONTEXT.md`, or the repository's existing glossary in its own format, right there when the request's grant covers that file; otherwise offer the entry in one line and write it on the owner's word. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) for `CONTEXT.md`.
```

## dependency: upstream's 'use the format in ADR-FORMAT.md' goes through record-architecture-decisions, in the repository's decision home under the dated YYYY-MM-DD-short-title.md naming, with ADR-FORMAT.md describing the short form and yielding where they disagree, and carrying the bar only when record-architecture-decisions is not installed; the closing Durable output line names CONTEXT.md entries (or the existing glossary) and an ADR through record-architecture-decisions, with the one-line offer when a term is doing two jobs

Record `fold-2026-09-11`, 1 hunk.

### `h:911f6018bc52d0c3` in `SKILL.md`

```diff
-If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
+If any of the three is missing, skip the ADR. When all three hold, record it through record-architecture-decisions, in the repository's decision home and under its dated `YYYY-MM-DD-short-title.md` naming; [ADR-FORMAT.md](./ADR-FORMAT.md) describes the short form an ADR can take and yields to that convention wherever the two disagree. Where record-architecture-decisions is not installed, ADR-FORMAT.md carries the bar and its dated naming is the convention.
+
+Durable output: CONTEXT.md entries (or the repository's existing glossary), and an ADR through record-architecture-decisions when a term change is a durable decision. Offered in one line when a term is doing two jobs: "name it and write it down?"; applied in the reply otherwise.
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:36a789e1f94e9a0a` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:3a0ac588ba9d3f62` in `fold-2026-09-11`: the prelude folded into the body at its step: the words-not-code split in the opening paragraph, the ADR convention and its fallback in Offer ADRs sparingly
- `h:79077b3a5d79bf71` in `fold-walk-2026-09-11`: re-claimed with a reason a merger can act on
- `h:ca55ef0b03d7197b` in `fold-walk-2026-09-11`: re-claimed with a reason a merger can act on
- `h:4afe66050a8f8eef` in `roster-keepers-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8, 2026-09-15)
