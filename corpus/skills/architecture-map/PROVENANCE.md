# architecture-map: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/almendili/skills at 572d2591157f09103c93c9d65aed054dd635c1d3, `architecture-map`. Drift: 13899 of 3382 lines changed (411%). Records: baseline-copies-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:fe1c68e47a21db5a` in `SKILL.md`

```diff
-name: architecture-map
-description: Build or update an interactive isometric map of a repository's architecture — buildings sized by real measurements, neighborhoods by subsystem, animated flows tracing actual call paths, and a drift counter that fails CI when the map falls behind the code. Use when someone wants to see, explain, or onboard people to how a codebase fits together, or asks for an architecture diagram, system map, codebase overview, or "show me how this repo works". Adapts to the repo's design system; re-run to refresh.
-metadata:
-  version: 1.0.0
+name: "architecture-map"
+description: "Build or update an interactive isometric map of the repository's architecture, versioned under .greenline/map/ with a measured snapshot and staleness tiers. Use when someone wants to see, onboard into, or refresh how the codebase fits together."
```

## scope: An opening paragraph after the title says the map is durable, versioned state under .greenline/map/ (map.md authored, snapshot.json measured with the snapshot commit and prose provenance, architecture.html generated), when it is offered and refreshed, and that it is repo-level rather than initiative state; greenline needs this because the consumer reads no prelude.

Record `fold-2026-09-11`, 1 hunk.

### `h:4e59f9c563bff455` in `SKILL.md`

```diff
+This skill builds and refreshes the repository's map as durable, versioned state under `.greenline/map/`: `map.md` holds the authored half (groups, node prose, edges, flows and coverage globs, as Markdown with frontmatter, edited only by the agent), `snapshot.json` holds the measured half with the snapshot commit and per-node prose provenance, and `architecture.html` is the generated viewer. Offer it in one line when someone wants to see how the code fits together, and refresh it after improve-codebase-architecture lands a deepening. The map is repo-level state, not initiative state; an initiative that commissions map work tracks it through its ticket.
+
```

## location: Every place upstream names the in-repo files (architecture.config.json as the existing-map detector in step 1 and in the update section, graph.ts as the authored file in step 4 and in the closing quote, core/layout.ts as a copied module) names greenline's home instead: .greenline/map/snapshot.json, .greenline/map/map.md, the skill's own assets/core/layout.ts with the derived geometry landing in snapshot.json, and the viewer regenerated after a prose edit.

Record `fold-2026-09-11`, 5 hunks.

### `h:f5340146210a8c43` in `SKILL.md`

```diff
-| Existing map | a previous `architecture.config.json` — if present, this is an **update** |
+| Existing map | `.greenline/map/snapshot.json`; if present, this is an **update** |
```

### `h:9c7c4723b1e90a8b` in `SKILL.md`

```diff
-This is the real work. Write `graph.ts` exporting `GROUPS`, `NODES`, `EDGES`,
-`FLOWS` and `INTRO`, typed by `core/types.ts`.
+This is the real work. Write `.greenline/map/map.md`: frontmatter, then the
+groups, the nodes, the edges, the flows, the intro and the coverage globs, each
+as a section, in the shapes `$SKILL_DIR/assets/core/types.ts` defines for
+`Group`, `ArchNode`, `ArchEdge` and `ArchFlow`.
```

### `h:2c0bf5fb341b5378` in `SKILL.md`

```diff
-Derive `archetype`, `params`, `height` and `footprint` with `core/layout.ts`:
+Derive `archetype`, `params`, `height` and `footprint` with
+`$SKILL_DIR/assets/core/layout.ts`; the derived geometry lands in
+`snapshot.json` beside the measures it comes from:
```

### `h:b97383e2517c5fdc` in `SKILL.md`

```diff
-> single pass is weakest. Edit `graph.ts`; nothing else needs to change.
+> single pass is weakest. Edit `.greenline/map/map.md` and regenerate the viewer; nothing else needs to
+> change.
```

### `h:8d4422ff07cf000a` in `SKILL.md`

```diff
-If `architecture.config.json` exists, this is an update. **Never clobber
+If `.greenline/map/snapshot.json` exists, this is an update. **Never clobber
```

## scope: three of upstream's four questions have no options under greenline (the home, the design system, the extras are fixed); the coverage question is a real choice and is asked in one line when the request did not say

Record `fold-walk-2026-09-11`, 3 hunks.

### `h:723e20c301fe00bd` in `SKILL.md`

```diff
-## Step 2 — Ask exactly four questions
+## Step 2: settle the four questions, asking one
```

### `h:ac90930d8f39a040` in `SKILL.md`

```diff
-Ask them together — in one structured-question call if your harness has one
-(Claude Code: `AskUserQuestion`), otherwise as a single numbered message — then
-work uninterrupted. Do not drip-feed them one at a time.
+Three of the four answers an installed map would need are settled here; the
+second is a real choice, asked in one line when the request did not already
+say, and the work is uninterrupted otherwise:
```

### `h:38b059ba92572eca` in `SKILL.md`

```diff
-1. **Where should it live?** Recommend `/~/architecture` — a `~` segment reads
-   as "internal tool" and sorts away from real routes. Offer `/architecture` and
-   `/internal/architecture`.
-2. **What should it cover?** Whole repo / source only / one package. Preselect
-   sensibly if it is a monorepo.
-3. **Design system.** State what you detected — "Tailwind v4 with CSS custom
-   properties" — and offer: use it, or the bundled neutral palette.
-4. **Extras.** Wire the freshness check into CI? Add the sync to `predev`/
-   `prebuild`? Include the version-history dropdown?
+1. **Where it lives:** `.greenline/map/`. There is no route.
+2. **What it covers:** what the request named; when it named nothing, ask
+   whether the map covers the whole repository, the source only, or one
+   package, and say the answer in the reply.
+3. **Design system:** nothing to choose; the viewer ships prebuilt with its
+   own palette.
+4. **Extras:** none. No freshness check in CI, no sync on `predev`/`prebuild`,
+   no version-history dropdown; the snapshot commit is the version.
```

## dependency: The prebuilt self-contained viewer shell (assets/gl-shell.html, its __GL_MAP_DATA__ placeholder replaced with the map's data JSON and saved as .greenline/map/architecture.html) replaces upstream's install, bundler, sync-script and CI machinery in place: step 2 asks none of its four questions because the route, the CI wiring, the predev hook and the version dropdown do not exist here; step 3 installs nothing into the repository; step 4 writes coverage globs into map.md and measures counts, lines and the unclaimed list into snapshot.json with a scanner and no sync script; step 5 renders the shell instead of mounting a route (references/frameworks.md no longer applies); step 6 checks the snapshot and edge ids and opens architecture.html instead of typechecking, running --check and the app.

Record `fold-2026-09-11`, 9 hunks.

### `h:301555e9b09ed7de` in `SKILL.md`

```diff
-## Step 3 — Install the core
+## Step 3: nothing to install
```

### `h:6ded958676d8f5e6` in `SKILL.md`

```diff
-Copy `$SKILL_DIR/assets/core/`, `assets/stores/` and `assets/components/` into
-the repo under the path you agreed (e.g. `src/architecture/`). These are dependency-free
-apart from React, and typecheck under `strict`.
+The viewer is this skill's prebuilt, self-contained shell,
+`$SKILL_DIR/assets/gl-shell.html`. Nothing is copied into the repository: no
+`architecture.config.json`, no sync script, no `package.json` script, no theme
+file. The map's three files live under `.greenline/map/` and nowhere else.
```

### `h:30be5af52a4e3de6` in `SKILL.md`

```diff
-Then write `architecture.config.json` at the repo root:
-
-```json
-{
-  "coverage": "src/architecture/coverage.json",
-  "output": "src/architecture/measured.generated.ts",
-  "sources": ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
-  "ignore": ["next-env.d.ts"]
-}
-```
-
-Copy `$SKILL_DIR/scripts/architecture-sync.mjs` into the repo's own `scripts/`
-and add
-`"architecture:sync": "node scripts/architecture-sync.mjs"`.
-
-### Adapt the theme
-
-Edit `components/theme.ts` only. Point each semantic name at the repo's tokens:
-
-```ts
-export const paint = {
-  surface: 'var(--tsc-background)',
-  border: 'var(--tsc-foreground-tertiary)',
-  accent: 'var(--tsc-brand)',
-  // …
-}
-```
-
-If the repo has no design system, leave the defaults — they define
-`--am-*` fallbacks and work standalone. **Never** reach for a host token
-anywhere except this file.
-
```

### `h:fbc1331feb4bccc9` in `SKILL.md`

```diff
-**Coverage** — write `coverage.json` so every source file is claimed exactly
-once. `$`-prefixed keys are notes. Use `priority` when a nested directory must
-win over its parent. Then:
+**Coverage**: write the coverage globs in `map.md` so every source file is
+claimed exactly once. Use `priority` when a nested directory must win over its
+parent. Then measure each node's file count and line total from its globs, and
+the list of files no glob claims, with a scanner rather than by hand. Write
+the numbers into `.greenline/map/snapshot.json` as each node's `count` and
+`loc`, with the unclaimed list, the snapshot commit (`git rev-parse HEAD`) and
+each node's prose provenance (the commit whose files its prose describes)
+beside them. No sync script runs and nothing is written into the repository's
+source tree.
```

### `h:c195d3704b8e50d2` in `SKILL.md`

```diff
-```bash
-node scripts/architecture-sync.mjs
-```
+Iterate until the unclaimed list is empty, or until what remains genuinely is
+not part of the system.
```

### `h:08a29513bfc3d27a` in `SKILL.md`

```diff
-Iterate until it reports zero unmapped, or until what remains genuinely is not
-part of the system.
+## Step 5: render the viewer
```

### `h:3d09d7821bf152df` in `SKILL.md`

```diff
-## Step 5 — Mount it
+Assemble the map's data JSON (groups, nodes, edges, flows and intro in the
+shapes `$SKILL_DIR/assets/core/types.ts` defines: the authored half from
+`map.md` merged with the measures and geometry from `snapshot.json`), take
+`$SKILL_DIR/assets/gl-shell.html`, replace its single `__GL_MAP_DATA__`
+placeholder with that JSON, and save the result as
+`.greenline/map/architecture.html`. The shell is prebuilt and self-contained:
+no build tooling, no framework mounting, no server, no route, and no
+`keyframes.css` import; opening the file is the viewer. Regenerate it whenever
+`map.md` or `snapshot.json` changes.
```

### `h:81b5daf65fdc5512` in `SKILL.md`

```diff
-Create the route for the detected framework — see `references/frameworks.md`.
-Import `keyframes.css` once. Pass `ArchitectureData` in from your graph module
-plus `UNCLAIMED` from the generated file.
-
-Add `robots: noindex` if the route is public: this is a tool handed out by
-link, not a search result.
-
```

### `h:a7e535242148c17d` in `SKILL.md`

```diff
-1. Typecheck and lint.
-2. `node scripts/architecture-sync.mjs --check` — must pass.
-3. Run the app and **look at it**. Screenshot it. Check: no overlapping
-   buildings, no edge cutting through a facade, every flow plays start to
-   finish, the rail and the map agree on what is lit.
-4. Both themes if the repo has two.
+1. Check `snapshot.json` against the tree: every file the coverage globs
+   claim is counted once, the unclaimed list is what remains, and the snapshot
+   commit is `HEAD`.
+2. Every edge id a flow routes exists, and every edge's `from` and `to` name a
+   node.
+3. Open `.greenline/map/architecture.html` in a browser and **look at it**.
+   Screenshot it. Check: no overlapping buildings, no edge cutting through a
+   facade, every flow plays start to finish, the rail and the map agree on
+   what is lit.
```

## lifecycle: The update procedure reads snapshot.json, folds git diff --name-status <snapshot-commit>..HEAD through the coverage globs and reports the staleness tier (fresh, current, drifting, stale) from commit dates before touching anything, re-reads only dirty nodes and reuses unchanged prose byte-identical, keeps a ghost foundation for a vanished node for one snapshot, rewrites snapshot.json and map.md in the same pass, regenerates the viewer and reports tier, re-read versus reused nodes, ghosts and the unclaimed list; the Durable output line names .greenline/map/ and the offer rule for the situational class.

Record `fold-2026-09-11`, 2 hunks.

### `h:2293e85a458a383a` in `SKILL.md`

```diff
-1. Run the sync. New numbers land in the generated file; nothing else moves.
-2. Read `UNCLAIMED`. Each entry is either a subsystem the map has not been told
-   about, or an existing module whose pattern is too narrow.
-3. For genuinely new subsystems: *append* a node with derived geometry and
-   drafted prose, and extend `coverage.json`. Leave every existing node's
-   prose, footprint and edges exactly as they are.
-4. Report what you added and what you left alone.
+1. Read `snapshot.json`, fold `git diff --name-status <snapshot-commit>..HEAD`
+   through the coverage globs, and report the staleness tier before touching
+   anything: fresh (nothing landed), current (commits landed, no mapped node
+   touched), drifting (named nodes dirty), or stale (unclaimed files exist).
+   Staleness arithmetic uses commit dates, never the wall clock.
+2. Re-measure. New numbers land in `snapshot.json`; nothing else moves.
+3. Read the unclaimed list. Each entry is either a subsystem the map has not
+   been told about, or an existing module whose pattern is too narrow.
+4. Re-read only the dirty nodes' files and revise their prose; an unchanged
+   node's prose is reused byte-identical. For genuinely new subsystems:
+   *append* a node with derived geometry and drafted prose, and extend the
+   coverage globs. A node whose files all vanished keeps a ghost foundation
+   for one snapshot so the deletion is seen. Leave every other node's prose,
+   footprint and edges exactly as they are.
+5. Rewrite `snapshot.json` (snapshot commit, per-node measure, per-node prose
+   provenance) and `map.md` in the same pass, regenerate `architecture.html`
+   from the shell, and report what you added and what you left alone: the
+   staleness tier found, the nodes re-read versus reused, new and ghosted
+   nodes, and the unclaimed list.
```

### `h:64d55796d510ebfa` in `SKILL.md`

```diff
+
+Durable output: .greenline/map/ (map.md, snapshot.json, architecture.html); offered in one line when someone wants to see how the code fits together, refreshed after improve-codebase-architecture lands a deepening.
```

## dependency: the map viewer shell replaces the upstream bundler and CI steps

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:87a6db74cb4f5c82` in `assets/gl-shell.html`

Added file, 13728 lines.

## Retired

- `h:570bd963d4f81433` in `fold-2026-09-11`: the prelude is folded into the body step by step: the scope paragraph after the title, steps 1 to 6 rewritten in place, and the update section; its churn-tint and provenance-badge sentence has no mechanism in the prebuilt shell and is not carried
- `h:9bfece8d46972947` in `fold-2026-09-11`: the completion is folded into the update section's last step and the Durable output line at the end
- `h:c8404a6a0115009a` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:a1e6b3a720124308` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:b2f8cc3ed708adf9` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
