# grilling: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/productivity/grilling`. Drift: 11 of 31 lines changed (35%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, vocabulary-owner-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:0f8ca6b9b697666a` in `SKILL.md`

```diff
-name: grilling
-description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
+name: "grilling"
+description: "Grill the user relentlessly about a plan, decision, or idea, and fire on your own judgment the moment scope, intent, or a term is unclear mid-work. Use for any 'grill' trigger phrase, for stress-testing thinking, and for ambiguity that must not be guessed through."
```

## scope: The opening paragraph and the closing Durable output line say when grilling fires (a grill trigger phrase, or on the agent's own judgment when scope, intent or a term is unclear mid-work), that settled decisions in the decisions book, an initiative's decisions.md or the ticket are read first and not reopened, that a discussion earns no initiative or ticket, that durable shaping decisions belong to grill-with-docs and a compact task's settled intent to its ticket, and that a read-only discussion and the operator's stopping point are respected; grilling is situational, applied and never offered, with no durable output. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:7f7c85d8f9b734e0` in `SKILL.md`

```diff
+Fire on any 'grill' trigger phrase, and on your own judgment the moment scope, intent or a term is unclear mid-work: an ambiguity is put to the user, never guessed through. The questions are the consequential ones this request leaves open, so read the settled decisions first, in the decisions book, an initiative's decisions.md or the ticket at hand, and reopen none of them. A discussion earns no initiative and no ticket merely because this skill is available. When the shared understanding is a larger intent that needs durable shaping decisions, grill-with-docs records them; a compact task keeps its settled intent and acceptance in its own ticket. A read-only discussion stays read-only, and the owner's stated stopping point ends the interview where it stands.
+
```

## scope: The opening paragraph and the closing Durable output line say when grilling fires (a grill trigger phrase, or on the agent's own judgment when scope, intent or a term is unclear mid-work), that settled decisions in the decisions book, an initiative's decisions.md or the ticket are read first and not reopened, that a discussion earns no initiative or ticket, that durable shaping decisions belong to grill-with-docs and a compact task's settled intent to its ticket, and that a read-only discussion and the operator's stopping point are respected; grilling is situational, applied and never offered, with no durable output.

Record `fold-2026-09-11`, 1 hunk.

### `h:d1e16ad8222c8dce` in `SKILL.md`

```diff
+
+Durable output: none. Applied, never offered, when scope, intent or a term is unclear mid-work; a discussion earns no initiative; durable shaping belongs to grill-with-docs.
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:a12124d9a6b3ea24` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:d2d1b1c24ceb3560` in `fold-2026-09-11`: the greenline prelude is folded into the body: its scoping sentences became the opening paragraph and the situational closing line
- `h:72ecaba10b9c2cb8` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
