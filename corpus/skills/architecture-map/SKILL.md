---
name: "architecture-map"
description: "Build or update an interactive isometric map of the repository's architecture, versioned under .greenline/map/ with a measured snapshot and staleness tiers. Use when someone wants to see, onboard into, or refresh how the codebase fits together."
---

# Architecture map

This skill builds and refreshes the repository's map as durable, versioned state under `.greenline/map/`: `map.md` holds the authored half (groups, node prose, edges, flows and coverage globs, as Markdown with frontmatter, edited only by the agent), `snapshot.json` holds the measured half with the snapshot commit and per-node prose provenance, and `architecture.html` is the generated viewer. Offer it in one line when someone wants to see how the code fits together, and refresh it after improve-codebase-architecture lands a deepening. The map is repo-level state, not initiative state; an initiative that commissions map work tracks it through its ticket.

Turn a repository into a place you can walk around: an isometric city where
every building is a real subsystem sized by its real weight, every line is a
call path that exists in the code, and every moving dot is a payload the app
actually ships.

## The one rule

**Prose, groups and flows are authored. Counts, coverage and geometry are
measured.**

No scanner can say what a subsystem is *for*, and no human can keep file counts
honest. Every good property of this page falls out of that line — including the
fact that it does not rot, because "unmapped files" is only meaningful once a
human has claimed the rest.

Do not try to generate the authored half mechanically. Read the code and write
about it. That is the work, and it is why this is a skill rather than a
codegen script.

## Before you start

Read `references/authoring.md`. It has the voice, the archetype vocabulary, and
worked examples of good and bad node prose. Read `references/geometry.md` only
if you need to hand-tune footprints or edge routes.

## Step 1 — Detect

Answer these from the repo. Do not ask.

| Question | Where to look |
|---|---|
| Framework and router | `package.json`, `app/` vs `pages/` vs `src/routes/`, `vite.config`, `next.config`, `remix.config` |
| Design tokens | global stylesheet for `--*` custom properties; `tailwind.config`; any `tokens`/`theme` module |
| Dark mode mechanism | `.dark` class, `[data-theme]`, or `prefers-color-scheme` |
| Test runner | `package.json` scripts, `vitest.config`, `jest.config` |
| Package manager | lockfile |
| Monorepo | `workspaces`, `pnpm-workspace.yaml`, `turbo.json` |
| Existing map | `.greenline/map/snapshot.json`; if present, this is an **update** |

Then run the proposer to get a first read of the shape. It lives beside this
file, not in the repo you are mapping, so resolve its path first:

> **`SKILL_DIR`** — the absolute path of the directory containing *this
> SKILL.md*, which your harness reported when it loaded this file. It differs
> per tool (`~/.claude/skills/architecture-map`,
> `~/.codex/skills/architecture-map`, `~/.agents/skills/architecture-map`, a
> plugin cache, or a project-local `.claude/skills/…`). Substitute the literal
> path; do not rely on an environment variable.

```bash
node "$SKILL_DIR/scripts/propose-coverage.mjs" --root . --target 22
```

It returns directory clusters with file counts and line totals, plus suggested
groups. Treat it as a draft, not an answer — it knows where code *is*, not what
it *does*.

## Step 2: settle the four questions, asking one

Three of the four answers an installed map would need are settled here; the
second is a real choice, asked in one line when the request did not already
say, and the work is uninterrupted otherwise:

1. **Where it lives:** `.greenline/map/`. There is no route.
2. **What it covers:** what the request named; when it named nothing, ask
   whether the map covers the whole repository, the source only, or one
   package, and say the answer in the reply.
3. **Design system:** nothing to choose; the viewer ships prebuilt with its
   own palette.
4. **Extras:** none. No freshness check in CI, no sync on `predev`/`prebuild`,
   no version-history dropdown; the snapshot commit is the version.

## Step 3: nothing to install

The viewer is this skill's prebuilt, self-contained shell,
`$SKILL_DIR/assets/gl-shell.html`. Nothing is copied into the repository: no
`architecture.config.json`, no sync script, no `package.json` script, no theme
file. The map's three files live under `.greenline/map/` and nowhere else.

## Step 4 — Author the graph

This is the real work. Write `.greenline/map/map.md`: frontmatter, then the
groups, the nodes, the edges, the flows, the intro and the coverage globs, each
as a section, in the shapes `$SKILL_DIR/assets/core/types.ts` defines for
`Group`, `ArchNode`, `ArchEdge` and `ArchFlow`.

**Groups** — 4–7 neighborhoods, named the way the team talks: "Entry &
control", "The pixel pipeline", "Outside world". Not "utils" and "lib".

**Nodes** — aim for 15–25. For each, *read the actual files* and write:
- `whatItDoes` — one or two sentences, plain language, no jargon
- `howItsBuilt` — the interesting decision, not a dependency list
- `role` — a short noun phrase for the flow captions: "the session gate"
- `files` — real paths a reader can open

Derive `archetype`, `params`, `height` and `footprint` with
`$SKILL_DIR/assets/core/layout.ts`; the derived geometry lands in
`snapshot.json` beside the measures it comes from:

```ts
const { archetype, params } = deriveArchetype(measure)
const height = deriveHeight(measure)
const footprints = packLayout(inputs, GROUPS.map((g) => g.id))
```

Keep a hand-written footprint if a human already tuned one — the merge prefers
the authored value.

**Edges** — real call and data paths only. If you cannot point at the code that
makes the call, do not draw the line. Add `via` waypoints when a route would
otherwise cut through a building.

**Flows** — 3–6, each an ordered list of edge ids with a payload name. These are
the page's verbs and the first thing a newcomer presses. Find them by tracing
real paths: sign-in, the main create/read loop, the expensive background job.

**Coverage**: write the coverage globs in `map.md` so every source file is
claimed exactly once. Use `priority` when a nested directory must win over its
parent. Then measure each node's file count and line total from its globs, and
the list of files no glob claims, with a scanner rather than by hand. Write
the numbers into `.greenline/map/snapshot.json` as each node's `count` and
`loc`, with the unclaimed list, the snapshot commit (`git rev-parse HEAD`) and
each node's prose provenance (the commit whose files its prose describes)
beside them. No sync script runs and nothing is written into the repository's
source tree.

Iterate until the unclaimed list is empty, or until what remains genuinely is
not part of the system.

## Step 5: render the viewer

Assemble the map's data JSON (groups, nodes, edges, flows and intro in the
shapes `$SKILL_DIR/assets/core/types.ts` defines: the authored half from
`map.md` merged with the measures and geometry from `snapshot.json`), take
`$SKILL_DIR/assets/gl-shell.html`, replace its single `__GL_MAP_DATA__`
placeholder with that JSON, and save the result as
`.greenline/map/architecture.html`. The shell is prebuilt and self-contained:
no build tooling, no framework mounting, no server, no route, and no
`keyframes.css` import; opening the file is the viewer. Regenerate it whenever
`map.md` or `snapshot.json` changes.

## Step 6 — Verify, then be honest

1. Check `snapshot.json` against the tree: every file the coverage globs
   claim is counted once, the unclaimed list is what remains, and the snapshot
   commit is `HEAD`.
2. Every edge id a flow routes exists, and every edge's `from` and `to` name a
   node.
3. Open `.greenline/map/architecture.html` in a browser and **look at it**.
   Screenshot it. Check: no overlapping buildings, no edge cutting through a
   facade, every flow plays start to finish, the rail and the map agree on
   what is lit.

Then tell the user plainly:

> The geometry and measurements are correct — they are derived. **The prose is
> a first draft.** I read the code, but "what this subsystem does" is where a
> single pass is weakest. Edit `.greenline/map/map.md` and regenerate the viewer; nothing else needs to
> change.

Do not leave mediocre writing behind a confident-looking map without saying so.

## Updating an existing map

If `.greenline/map/snapshot.json` exists, this is an update. **Never clobber
authored content.**

1. Read `snapshot.json`, fold `git diff --name-status <snapshot-commit>..HEAD`
   through the coverage globs, and report the staleness tier before touching
   anything: fresh (nothing landed), current (commits landed, no mapped node
   touched), drifting (named nodes dirty), or stale (unclaimed files exist).
   Staleness arithmetic uses commit dates, never the wall clock.
2. Re-measure. New numbers land in `snapshot.json`; nothing else moves.
3. Read the unclaimed list. Each entry is either a subsystem the map has not
   been told about, or an existing module whose pattern is too narrow.
4. Re-read only the dirty nodes' files and revise their prose; an unchanged
   node's prose is reused byte-identical. For genuinely new subsystems:
   *append* a node with derived geometry and drafted prose, and extend the
   coverage globs. A node whose files all vanished keeps a ghost foundation
   for one snapshot so the deletion is seen. Leave every other node's prose,
   footprint and edges exactly as they are.
5. Rewrite `snapshot.json` (snapshot commit, per-node measure, per-node prose
   provenance) and `map.md` in the same pass, regenerate `architecture.html`
   from the shell, and report what you added and what you left alone: the
   staleness tier found, the nodes re-read versus reused, new and ghosted
   nodes, and the unclaimed list.

## Scale

Past ~25 buildings the map stops being readable. The proposer folds the
smallest siblings into a parent node that owns the wider glob — the partition
stays total, only the drawing simplifies. If a repo genuinely needs more, map
one package at a time rather than shrinking everything.

## What not to do

- Do not draw an edge you cannot trace to a call in the code.
- Do not set prose in the mono face. Monospace is for codes and paths.
- Do not import a host repo's `Button` or `Dropdown` — the map ships its own.
- Do not hand-write file counts. That is what the scanner is for.
- Do not invent flows that sound good. A flow nobody can follow in the source
  is a lie the page tells confidently.

Durable output: .greenline/map/ (map.md, snapshot.json, architecture.html); offered in one line when someone wants to see how the code fits together, refreshed after improve-codebase-architecture lands a deepening.
