# unslop: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/cursor/plugins at f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d, `pstack/skills/unslop`. Drift: 7 of 68 lines changed (10%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, vocabulary-owner-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and greenline's description, no upstream activation flag (upstream added disable-model-invocation; a discipline is implicit here)

Record `pull-2026-09-11`, 1 hunk.

### `h:dcb286af7ca6bfaa` in `SKILL.md`

```diff
-name: unslop
-description: Cut AI tells from any writing. Must always apply.
-disable-model-invocation: true
+name: "unslop"
+description: "Cut AI tells from any writing: replies, artifacts, commit messages, PR prose, docs. Apply to every prose surface before it lands."
```

## scope: The opening paragraph says the discipline is applied on the agent's own judgment to every prose surface and never announced, that artifacts (decisions, specs, tickets, reviews) pass through it before they land and replies, commit messages and PR prose follow it, and that the installed copy is greenline's and rewritten by sync, so a catalog addition is proposed to the operator in the reply rather than written into the copy. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:490fc835bbd9415a` in `SKILL.md`

```diff
+Apply this on your own judgment to every prose surface, and never announce it. Artifacts are prose that outlives the session: decisions, specs, tickets and reviews pass through it before they land, and replies, commit messages and PR prose follow it too. The installed copy is greenline's and sync rewrites it, so a pattern worth adding to the catalog is proposed to the owner in the reply rather than written into the copy.
+
```

## Retired

- `h:114b0069a372c792` in `pull-2026-09-11`: the frontmatter hunk against the previous pin; upstream's frontmatter changed
- `h:a358076d05fb347e` in `fold-2026-09-11`: the greenline prelude is folded into the body as the opening scope paragraph
- `h:3616d9247a8b21a8` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
