# to-tickets: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/to-tickets`. Drift: 79 of 110 lines changed (72%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:2259b2ad8a475a49` in `SKILL.md`

```diff
-name: to-tickets
-description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
-disable-model-invocation: true
+name: "to-tickets"
+description: "Break a plan, spec, or the current conversation into a set of tracer-bullet ticket files in .greenline/work/tickets/, each declaring its blocking edges as depends_on ids."
```

## scope: The opening paragraph in the skill's own voice: to-tickets fires when the plan is settled in spec.md or decisions.md, never shapes or specifies (a gap returns to grill-with-docs or to-spec), never implements (implement takes the ready frontier), and a settled compact change is one ticket while wayfinder's decision tickets are not the tickets written here.

Record `fold-2026-09-11`, 1 hunk.

### `h:31a7eebb4f9d2296` in `SKILL.md`

```diff
+to-tickets fires when an initiative's plan is settled, in its `spec.md` or, for an initiative that went from shaping straight to slicing, its `decisions.md`, and the work needs cutting into delivery tickets under `.greenline/work/tickets/`. It never shapes or specifies: a consequential gap in the plan returns to grill-with-docs or to-spec rather than being sliced around. It never implements: implement takes each ticket from the ready frontier. A settled compact change is one ticket and needs no slicing pass; wayfinder's decision tickets are questions in the initiative's `map.md`, not the tickets written here.
+
```

## lifecycle: the plan is the initiative's spec.md or decisions.md, or the conversation when neither was written; a settled compact change is implement's one ticket, so this skill never writes it

Record `fold-walk-2026-09-11`, 1 hunk.

### `h:445ae57f413bbc39` in `SKILL.md`

```diff
-The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.
+The plan is the initiative's `spec.md`, or its `decisions.md` when no spec was written; read it whole and pin the revision the tickets consume. A conversation can supply the plan when no spec or decisions record was written; name that source in the tickets and pin nothing. A settled compact change is implement's one ticket, not a slicing pass.
```

## vocabulary: A reference the user passes is a greenline artifact, a spec path, an initiative id or a ticket id read whole, not an issue number or URL with comments; the term names a greenline artifact, which is the one case a vocabulary edit covers.

Record `fold-2026-09-11`, 1 hunk.

### `h:0bce3d12c4136f92` in `SKILL.md`

```diff
-Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.
+Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an initiative id or a ticket id) as an argument, read it whole.
```

## location: Step 5's heading and its opening sentence write the approved tickets to .greenline/work/tickets/TKT-NNN.md, in dependency order so depends_on names real ids, with an unused global id checked against the directory and greenline status, one file per ticket, at status ready in place of the ready-for-agent label; there is no configured tracker to choose.

Record `fold-2026-09-11`, 2 hunks.

### `h:55649b843b9de368` in `SKILL.md`

```diff
-### 5. Publish the tickets to the configured tracker
+### 5. Write the tickets to `.greenline/work/tickets/`
```

### `h:c93dcbe70d6c5a78` in `SKILL.md`

```diff
-Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:
+Write the approved tickets, one file per ticket at `.greenline/work/tickets/TKT-NNN.md`, in dependency order (blockers first) so each ticket's `depends_on` can name real ids. Inspect the filenames already there (an absent directory is empty) and `greenline status --json` for an unused TKT-NNN, and recheck before writing to avoid a concurrent collision. Use the ticket template below: one ticket per file, never a single combined file. Each ticket is written at `status: ready` unless instructed otherwise; the tickets are agent-grabbable by construction.
```

## lifecycle: The local-files and real-tracker branches collapse into the initiative's lifecycle: the new ids listed in the initiative's tickets, the initiative advancing to planned, greenline doctor validating the graph, a later slice keeping existing ids, paths and evidence, greenline status projecting the frontier, and the parent spec or decisions held as a consumes pin never written to.

Record `fold-2026-09-11`, 3 hunks.

### `h:0456585f919e0730` in `SKILL.md`

```diff
-- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
-- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise; the tickets are agent-grabbable by construction.
+Then list the new ids in the initiative's `tickets` and advance the initiative to planned. `greenline doctor` validates the graph. A slice added later keeps every existing ticket's id, path and evidence; it edits membership, and a revision only where it changes a consumed contract.
```

### `h:6810b34e035b5385` in `SKILL.md`

```diff
-Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.
+Work the **frontier**: any ticket whose blockers are all done; `greenline status` projects it. For a purely linear chain that means top to bottom.
```

### `h:1c05e179339d4545` in `SKILL.md`

```diff
-Do NOT close or modify any parent issue.
+Do NOT close or modify the spec or decisions the tickets consume; a parent is a `consumes` pin, never a write.
```

## lifecycle: The local ticket template is WORK.md's ticket shape: title and What-to-build into intent, Blocked-by into depends_on, ready-for-agent into status: ready, the criteria into acceptance, the parent reference into a consumes pin, scope naming the roots touched; the body keeps What to build and adds Scope and authority.

Record `fold-2026-09-11`, 5 hunks.

### `h:99665fbcd4006bc2` in `SKILL.md`

```diff
-# <NN>: <Ticket title>
+```markdown
+---
+id: TKT-NNN
+type: ticket
+status: ready
+revision: 1
+intent: "<the end-to-end behaviour this ticket makes work, from the user's perspective>"
+scope:
+  - <repository-relative root the slice touches>
+depends_on: [] # the TKT ids that gate this one; empty when it can start immediately
+consumes:
+  - { id: INIT-NNN/SPEC, revision: <N> }
+acceptance:
+  - [ ] Acceptance criterion 1
+  - [ ] Acceptance criterion 2
+---
```

### `h:14d7d51d89e46259` in `SKILL.md`

```diff
-**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.
+## What to build
```

### `h:2e4caf1ff81e4f80` in `SKILL.md`

```diff
-**Blocked by:** the numbers/titles of the tickets that gate this one, or "None (can start immediately)".
+The end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.
```

### `h:835c767faacad72b` in `SKILL.md`

```diff
-**Status:** ready-for-agent
+## Scope and authority
```

### `h:2979ef11481b689f` in `SKILL.md`

```diff
-- [ ] Acceptance criterion 1
-- [ ] Acceptance criterion 2
+The plan this ticket consumes and what its grant covers.
+```
```

## location: The real-tracker issue template has no target and goes with its branch; the closing sentence addresses the ticket's intent and body and exempts the scope field, which names roots by contract; the Handoff section closes the chain to implement with greenline status and greenline doctor.

Record `fold-2026-09-11`, 3 hunks.

### `h:dc57cfa21f6863c4` in `SKILL.md`

```diff
-<issue-template>
+In the ticket's intent and body, avoid specific file paths or code snippets: they go stale fast (the `scope` field names roots, not the files inside them). Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
```

### `h:c5e015a08c35422d` in `SKILL.md`

```diff
-## Parent
+## Handoff
```

### `h:83815fc2c104df86` in `SKILL.md`

```diff
-A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).
-
-## What to build
-
-The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.
-
-## Acceptance criteria
-
-- [ ] Criterion 1
-- [ ] Criterion 2
-
-## Blocked by
-
-- A reference to each blocking ticket, or "None (can start immediately)".
-
-</issue-template>
-
-In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
+Consumes: spec.md (INIT-NNN/SPEC, pinned revision), or decisions.md (INIT-NNN/DEC, pinned revision) when no spec was written
+Produces: .greenline/work/tickets/TKT-NNN.md per slice, status ready, with depends_on edges and consumes pins; the initiative's tickets membership; the initiative advances to planned
+Next: implement takes the ready frontier from greenline status; greenline doctor validates the graph
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:e22d4ead65130def` in `agents/openai.yaml`

Removed file, 5 lines.

## Retired

- `h:eaaac2d5a3cad837` in `fold-2026-09-11`: the prelude folded into the body: its inputs and pin rule are the sentence after the method's opening, its deferrals are the opening scope paragraph, and its publication mapping is step 5 and the template
- `h:7b56a7909b2c2c3b` in `fold-2026-09-11`: the tracker-is-the-initiative sentence gave way to the plan sentence at the same position; the dependency claim continues on the new hunk
- `h:86f1a37117b0d228` in `fold-2026-09-11`: step 5's opening sentence now writes the tickets to their home outright; the retired setup pointer it once replaced has nothing left to replace
- `h:a52f48e32d67d971` in `fold-2026-09-11`: the completion folded into the body at its step: the ticket home, the template mapping, membership, the initiative's advance to planned and greenline doctor sit in step 5, and the Handoff section names implement
- `h:c3922b46f0a5f7fa` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
