# codebase-design: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/codebase-design`. Drift: 13 of 198 lines changed (7%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, series-s7-roster-2026-09-11.

## method: upstream tells the deepener to delete old shallow-module tests once interface tests exist; greenline retains them through the deepening and routes deletion to sweep-tests with mutation proof, which changes the criterion (the D3 consumer finding of 2026-09-10, carried as a bookend override until this fold); the operator is asked to confirm this method edit in the S3 report Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:e865f2465fb34c2c` in `DEEPENING.md`

```diff
-- Old unit tests on shallow modules become waste once tests at the deepened module's interface exist; delete them.
+- Old unit tests on shallow modules become candidates for examination once tests at the deepened module's interface exist, not proven waste: retain them through the deepening, and route their deletion, with the removal of any seam only they use, to sweep-tests in a dedicated ticket with its green baseline and before/after mutation proof. A deepening that cannot retain the existing protection reports that constraint before removing it; no unproven test deletion is part of this method. Carry this rule into any delegated deepening brief.
```

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:f7fa9c848516ae8f` in `SKILL.md`

```diff
-name: codebase-design
-description: Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when another skill needs the deep-module vocabulary.
+name: "codebase-design"
+description: "Shared vocabulary for designing deep modules: a reference to consult mid-build, not a session to run. Use when designing or improving one module's interface, placing a seam, or making code testable; repo-wide surveys belong to improve-codebase-architecture."
```

## scope: one opening paragraph in the skill's voice: a reference consulted mid-build on the agent's own judgment for one module's interface, a seam or testability, which tdd consults for its seam vocabulary; repo-wide surveys are improve-codebase-architecture's, test deletion is sweep-tests' dedicated ticket with mutation proof; never deletes a test, never announced or offered, not a session to run

Record `fold-2026-09-11`, 1 hunk.

### `h:91a4d80635d5f86f` in `SKILL.md`

```diff
+This discipline is a reference to consult mid-build, on your own judgment, whenever one module's interface is being designed or improved, a seam placed, or code made testable; tdd consults it for the vocabulary of the seam it tests at. A repo-wide survey belongs to improve-codebase-architecture. Existing tests are retained through a deepening, and their deletion, with any seam only they use, belongs to sweep-tests in a dedicated ticket with its green baseline and before/after mutation proof; this skill never deletes a test, is never announced or offered, and is not a session to run.
+
```

## lifecycle: the SKILL.md pointer to DEEPENING.md names the retained tests and the sweep-tests route, matching the edited bullet

Record `fold-2026-09-11`, 1 hunk.

### `h:a7b3fd6abdb92635` in `SKILL.md`

```diff
-- **Deepening a cluster given its dependencies**, see [DEEPENING.md](DEEPENING.md): dependency categories, seam discipline, and replace-don't-layer testing.
+- **Deepening a cluster given its dependencies**, see [DEEPENING.md](DEEPENING.md): dependency categories, seam discipline, and replace-don't-layer testing, with the old tests retained until sweep-tests proves their deletion.
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:e0adb966674b989e` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:bc1deb68ccbf0a10` in `fold-2026-09-11`: the prelude folded into the support file it superseded: the retention rule is now DEEPENING.md's own bullet, and the scope paragraph names sweep-tests as the owner of deletions
- `h:e865f2465fb34c2c` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
