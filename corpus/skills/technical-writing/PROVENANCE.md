# technical-writing: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cursor/plugins at f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d, `pstack/skills/technical-writing`. Drift: 7 of 127 lines changed (6%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:5e57da7507864960` in `SKILL.md`

```diff
-name: technical-writing
-description: "Layered technical-writing standard: Diátaxis structure, Google developer style sentences, STE instruction rules, Global English syntax. Use for /technical-writing or when writing or reviewing docs, RFCs, readmes, PR descriptions, or commit messages."
-disable-model-invocation: true
+name: "technical-writing"
+description: "Layered technical-writing standard: Diátaxis structure, Google developer style sentences, STE instruction rules, Global English syntax. Use when writing or reviewing docs, RFCs, readmes, PR descriptions, or commit messages."
```

## scope: An opening paragraph after the title says when the skill applies (docs, READMEs, RFC-shaped artifacts and PR descriptions), that it is a discipline applied on the agent's own judgment and never announced, and that unslop owns the slop catalog; greenline needs the scope in the body because the consumer reads no prelude.

Record `fold-2026-09-11`, 1 hunk.

### `h:ddade7542e0c00f8` in `SKILL.md`

```diff
+This skill covers docs, READMEs, RFC-shaped artifacts, and PR descriptions. Apply it on your own judgment while writing or reviewing them; it is never announced. It pairs with unslop, which owns the slop catalog.
+
```

## Retired

- `h:eb25d631e541e397` in `pull-2026-09-11`: upstream now says to propose unslop additions in the reply and not edit that skill; the prelude sentence that said so is removed
- `h:329d78574cdfebf7` in `fold-2026-09-11`: the prelude paragraph is folded into the body as the scope paragraph after the title
