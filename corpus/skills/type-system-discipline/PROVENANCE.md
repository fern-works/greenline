# type-system-discipline: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cursor/plugins at f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d, `pstack/skills/principle-type-system-discipline`. Drift: 7 of 31 lines changed (23%). Records: baseline-copies-2026-09-11, pull-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 2 hunks.

### `h:1deca8eb1d331f03` in `SKILL.md`

```diff
-name: principle-type-system-discipline
+name: "type-system-discipline"
```

### `h:77b3bcc62192797b` in `SKILL.md`

```diff
-disable-model-invocation: true
```

## dependency: The typescript-best-practices skill is not vendored, so the body pointed the agent at a skill the install does not carry.

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:5a43a1bb587c1a31` in `SKILL.md`

```diff
-Applies to any typed language. Skills like `typescript-best-practices` ground it in specific syntax.
-
```

## dependency: the encode-lessons-in-structure principle skill is not vendored; the pointer stays out of the derive-types bullet

Record `pull-2026-09-11`, 1 hunk.

### `h:9e3266cca8ef5ab1` in `SKILL.md`

```diff
-- **Derive types from authoritative schemas.** When a protocol buffer, OpenAPI spec, GraphQL schema, database migration, or design-system token file defines a shape, derive from it instead of hand-rolling a parallel type. See the **encode-lessons-in-structure** principle skill.
+- **Derive types from authoritative schemas.** When a protocol buffer, OpenAPI spec, GraphQL schema, database migration, or design-system token file defines a shape, derive from it instead of hand-rolling a parallel type.
```

## Retired

- `h:5622c408f44a4328` in `pull-2026-09-11`: the same dependency edit against the previous pin, whose sentence upstream has since trimmed
