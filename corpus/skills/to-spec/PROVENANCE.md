# to-spec: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/to-spec`. Drift: 24 of 80 lines changed (30%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, series-s7-roster-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:7a76189f45541b77` in `SKILL.md`

```diff
-name: to-spec
-description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
-disable-model-invocation: true
+name: "to-spec"
+description: "Turn the current conversation into a spec and publish it to the initiative's spec.md under .greenline/work/: no interview, just synthesis of what you've already discussed."
```

## scope: The opening paragraph in the skill's own voice: to-spec fires when shaping is done, reads decisions.md and the research and prototype records, never shapes (a consequential gap returns to grill-with-docs, research or prototype), never slices (to-tickets does), and a settled compact change goes to implement without a spec.

Record `fold-2026-09-11`, 1 hunk.

### `h:36d810aa197f5a96` in `SKILL.md`

```diff
+to-spec fires when an initiative's shaping is done and its rulings need one synthesized document: it reads the initiative's `decisions.md` and the research and prototype records the discussion relied on, and writes the initiative's `spec.md`. It never shapes: a consequential gap in the decisions returns to grill-with-docs, or to research or prototype for the fact or the feel it needs, rather than being invented here. It never slices: to-tickets reads the finished spec. A settled compact change needs no spec and goes to implement as one ticket.
+
```

## dependency: Upstream's tracker-and-label sentence points at a setup skill no consumer install carries (ADR 0022 retired that rename); in its place the sentence names the spec's inputs under the initiative's directory, decisions.md and the research and prototype records, with the rule to pin each consumed revision and to name a settled conversation as the source when no decisions artifact exists.

Record `fold-2026-09-11`, 1 hunk.

### `h:8345f4ab1257039d` in `SKILL.md`

```diff
-The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.
+The spec's inputs are already standing in the initiative's directory under `.greenline/work/`: its `decisions.md`, and any `research/RSRCH-NNN.md` or `prototypes/PROTO-NNN.md` the discussion relied on. Read them and pin the revision of each one the spec consumes. A settled conversation can supply the intent where no decisions artifact was written; the spec then names that source and its limits.
```

## method: upstream's step 2 checks the seams with the user; greenline lets settled seams in the accepted task, the existing interfaces or a standing grant satisfy that check and asks only about a consequential unresolved seam choice, which changes when the method stops to ask Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:c166f298de6e51a4` in `SKILL.md`

```diff
-Check with the user that these seams match their expectations.
+Settled seams in the accepted task, the existing interfaces or a standing grant satisfy this check; ask the user only about a consequential unresolved seam choice.
```

## lifecycle: Upstream's publish-to-tracker-and-label step becomes writing the initiative's spec.md with its frontmatter and consumes pins, status draft then complete when the inputs support it, the initiative advancing to specified, Testing Decisions recorded for tdd to inherit, lasting choices promoted to the decisions book, and WORK.md's revision rule for a meaning-changing edit; the Handoff section restates the chain to to-tickets.

Record `fold-2026-09-11`, 2 hunks.

### `h:f03cf90f2d6726db` in `SKILL.md`

```diff
-3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.
+3. Write the spec using the template below into the initiative's `spec.md` (frontmatter `id: INIT-NNN/SPEC`, `type: spec`, `status: draft`, and `consumes` pinning the decisions, research and prototype revisions it rests on), then set `status: complete` once those inputs support every section and advance the initiative to specified; the status is the whole triage. Its Testing Decisions are what tdd inherits when the tickets are implemented, so record them here rather than leaving them to be reopened. A choice settled here that outlives the initiative goes into the decisions book, `.greenline/DECISIONS.md`, with a reference back. A later edit that changes the spec's meaning increments its revision and reopens the tickets that consume it; an annotation alone does not.
```

### `h:10fab8da9071df21` in `SKILL.md`

```diff
+
+## Handoff
+
+Consumes: decisions.md (INIT-NNN/DEC, pinned revision); the research/RSRCH-NNN.md and prototypes/PROTO-NNN.md records it relies on (pinned revisions)
+Produces: the initiative's spec.md (INIT-NNN/SPEC) with consumes pins, status draft then complete when its inputs support it; the initiative advances to specified
+Next: to-tickets reads spec.md
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:560393035543cca2` in `agents/openai.yaml`

Removed file, 5 lines.

## Retired

- `h:33716f1892cd2834` in `fold-2026-09-11`: the prelude folded into the body: its inputs and pin rule are the sentence after the method's opening, its deferrals are the opening scope paragraph, and its publication mapping is step 3; its clause that settled seams satisfy step 2's confirmation was not folded, since it changes a method criterion and needs the operator's ruling
- `h:7b56a7909b2c2c3b` in `fold-2026-09-11`: the tracker-is-the-initiative sentence gave way to the inputs sentence at the same position; the dependency claim continues on the new hunk
- `h:8070543d5f5bd1ed` in `fold-2026-09-11`: the completion folded into the body at its step: spec.md, consumes, statuses, the initiative's advance to specified, the testing decisions, the decisions book and the revision rule sit in step 3, and the Handoff section names to-tickets
- `h:c166f298de6e51a4` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
