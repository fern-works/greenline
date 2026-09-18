# grill-with-docs: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/grill-with-docs`. Drift: 22 of 12 lines changed (183%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, vocabulary-owner-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:e1c504cdaa21b7d5` in `SKILL.md`

```diff
-name: grill-with-docs
-description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
-disable-model-invocation: true
+name: "grill-with-docs"
+description: "A relentless interview that shapes an initiative and records each settled ruling in the initiative's decisions.md. Use when a shaping conversation must outlive the session."
```

## lifecycle: upstream's one-line body: the scope paragraph, the native skill mechanism, the decisions.md recording and the handoff, which now also creates the initiative directory and initiative.md at shaping when none exists (carried from fold-walk-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:55b7e02c96dac0d8` in `SKILL.md`

```diff
-Call the Skill tool twice, for "grilling" and "domain-modeling".
+grill-with-docs fires when a larger intent needs shaping decisions that must outlive the session: it shapes the initiative and records every settled ruling in that initiative's `decisions.md`. Resolve the intended initiative from the request and the current work first, then read its intent, its existing decisions and the decisions book, `.greenline/DECISIONS.md`, when it exists; ask only when ownership stays ambiguous, and never reopen a ruling already recorded. It never manufactures a planning layer for a settled compact fix, which goes to implement as one ticket; a new component's open engineering choices belong to groundwork; a discussion that needs no durable record is grilling alone, which writes nothing to the repository.
+
+Load both methods, grilling and domain-modeling, through the harness's native skill mechanism; when it has none, read each installed SKILL.md and its required support files.
+
+Record each settled ruling in the initiative's `decisions.md` (`id: INIT-NNN/DEC`, `type: decisions`) as it lands, `status: draft` while questions stay open and `status: complete` when the frontier is empty; a question still open stays visible there rather than silently assumed. The initiative advances to decided only then. A ruling that outlives the initiative is promoted into the decisions book with a reference back to its entry. Stop at the planning boundary the owner set; the finished decisions are what to-spec reads.
+
+## Handoff
+
+Consumes: the initiative's intent (a request, or an accepted what-to-build proposal) and its existing decisions.md (INIT-NNN/DEC) when one exists
+Produces: the initiative directory and its initiative.md (INIT-NNN) at shaping when none exists; the initiative's decisions.md (INIT-NNN/DEC), status draft then complete; the initiative advances to decided
+Next: to-spec reads decisions.md
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:c14699a46b3b7afd` in `agents/openai.yaml`

Removed file, 5 lines.

## Retired

- `h:062e7be9064a7d22` in `fold-2026-09-11`: the prelude folded into the body: its initiative resolution and deferrals became the opening scope paragraph, and its Skill-tool translation became the method sentence itself
- `h:68d857571d9f0c8a` in `fold-2026-09-11`: the completion folded into the body at its step: decisions.md, its statuses and the initiative's advance to decided follow the method sentence, and the Handoff section names to-spec
- `h:469bbd3fd22abad6` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:cecf0e149748422f` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-walk-2026-09-11) carries to the hunk that replaced it
