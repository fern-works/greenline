# ponytail: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/dietrichgebert/ponytail at 356918eba965ee1eac64bd3a7f0dd02108350de5, `.agents/rules/ponytail.md`. Drift: 9 of 30 lines changed (30%). Records: baseline-copies-2026-09-11, descriptions-practice-the-catalog-2026-09-11, pull-2026-09-11, fold-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description written without em dashes; upstream's rule file carries no frontmatter

Record `fold-2026-09-11`, 1 hunk.

### `h:f0bc73f6591c4326` in `SKILL.md`

```diff
+---
+name: "ponytail"
+description: "Minimalism guideline for any coding work. Before writing code, climb the lazy-senior ladder: does it need to exist, is it already in the repo, does the stdlib or platform cover it, can it be one line. Mark every deliberate shortcut with a ponytail: comment naming its ceiling. Load during implementation, refactoring, reviews, and dependency choices."
+---
+
```

## scope: one opening paragraph in the skill's voice after the title: a guideline, not a stage, loaded at the top of every implementing ticket before the first new file and again during refactoring, review and dependency choices, applied on the agent's own judgment and never announced or offered; the ladder runs before the code exists and ponytail-review is the post-commit pass over the committed range; the ticket's acceptance decides scope and testing obligations come from the task and its applicable decisions

Record `fold-2026-09-11`, 1 hunk.

### `h:00caa0c70ff99f99` in `SKILL.md`

```diff
+This discipline is a guideline, not a stage: a pipeline skill owns the lifecycle stage, and this shapes how you build inside it. Load it at the top of every implementing ticket before the first new file, and again during refactoring, review and dependency choices; it applies on your own judgment and is never announced or offered. The ladder runs before the code exists; ponytail-review is the post-commit pass over the committed range. Where the ladder says reuse or skip, the ticket's acceptance still decides scope, and testing obligations come from the task and its applicable decisions: a smaller implementation still has to satisfy them.
+
```

## location: the ponytail: comment rule keeps upstream's wording and adds where the deferral is recorded, the owning ticket or review, so the shortcut and its ceiling survive the session

Record `fold-2026-09-11`, 1 hunk.

### `h:84b991d37566e6e1` in `SKILL.md`

```diff
-- Mark deliberate simplifications that cut a real corner with a known ceiling (global lock, O(n²) scan, naive heuristic) with a `ponytail:` comment naming the ceiling and upgrade path.
+- Mark deliberate simplifications that cut a real corner with a known ceiling (global lock, O(n²) scan, naive heuristic) with a `ponytail:` comment naming the ceiling and upgrade path, and record the deferral in the owning ticket or review so it survives the session.
```

## Retired

- `h:ea577118c219b7f0` in `descriptions-practice-the-catalog-2026-09-11`: the description as cut over carried em dashes greenline wrote
- `h:9fa9180ea76d4ef2` in `fold-2026-09-11`: the frontmatter-plus-prelude hunk split: the frontmatter now measures as h:f0bc73f6591c4326 and the prelude folded into the body at its step, the opening paragraph after the title and the ponytail: comment rule
