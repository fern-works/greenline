# research: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/research`. Drift: 22 of 15 lines changed (147%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, vocabulary-owner-2026-09-12, cold-review-wording-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:ba2fb995d2c49728` in `SKILL.md`

```diff
-name: research
-description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
+name: "research"
+description: "Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent."
```

## scope: The skill's scope opens the body in its own voice: a stage (wayfinder, grill-with-docs or to-spec) dispatches it for a decision or task waiting on a factual answer, it uses that existing owner rather than recency, it supplies evidence without settling the decision, and a read-only request writes nothing; the diff pairs this paragraph with upstream's background-agent line, which continues, extended, in the next hunk (carried from fold-2026-09-11; the word workflow became stage, the internal refactor's step 1, ruling 2, after the cold review of the cutover, Prose 1, 2026-09-12)

Record `cold-review-wording-2026-09-12`, 1 hunk.

### `h:e5a45ae4f5626c1d` in `SKILL.md`

```diff
-Spin up a **background agent** to do the research, so you keep working while it reads.
+A stage dispatches this method when a decision or task is waiting on a factual answer: wayfinder, grill-with-docs or to-spec names the question, and the answer goes back to that stage. Identify the decision or task waiting on the answer and use its existing owner; recency alone does not choose an initiative. The decision itself stays with the requesting stage: this method supplies cited evidence and does not settle the question. A read-only request returns its cited answer in the reply and writes nothing to the repository.
```

## lifecycle: The background agent's reading is its own consultation under greenline's ledger: the requester cites the file it hands back and does not record the agent's sources as ones it read itself (the consumer block's rule that another agent's receipt is not its reading).

Record `fold-2026-09-11`, 1 hunk.

### `h:a36429c563fc14db` in `SKILL.md`

```diff
+Spin up a **background agent** to do the research, so you keep working while it reads. Its reading is its own: cite the file it hands back, and do not record its sources as ones you consulted.
+
```

## lifecycle: the handoff section: dispatched by wayfinder or to-spec, or by the request owner directly; grill-with-docs does not dispatch research (carried from fold-walk-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:51a8ffc975679f35` in `SKILL.md`

```diff
-2. Write the findings to a single Markdown file, citing each claim's source.
-3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
+2. Write the findings to a single Markdown file, citing each claim's source: the question, the supported findings, the counterevidence, and the limits of the sources.
+3. Save it as the owning initiative's `research/RSRCH-NNN.md`, with the supporting-artifact frontmatter `.greenline/WORK.md` defines, or under `.greenline/work/evidence/TKT-NNN/research/` when a compact ticket owns the question, and say where.
+
+## Handoff
+
+Consumes: the decision or task waiting on the answer, from wayfinder or to-spec, or from the request holder
+Produces: research/RSRCH-NNN.md in the owning initiative, or a file under .greenline/work/evidence/TKT-NNN/research/ for a compact ticket; nothing for a read-only request
+Evidence at: that file, cited claim by claim
+Returns to: the requesting stage, with the citation and the pinned revision
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:9c31e6f8fba43485` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:3c3b53dea4071366` in `fold-2026-09-11`: The prelude is folded into the body: its owner rule and read-only rule became the opening scope paragraph, its research home became step 3.
- `h:1878cfe16420db51` in `fold-2026-09-11`: The completion is folded into the body: what the file retains sits in step 2, the home in step 3, the ledger rule on the background-agent line, and the return and the pinned revision in the Handoff section.
- `h:1bbbe88f4a6a1b10` in `fold-walk-2026-09-11`: the walk's correction rewrote this hunk in place; its replacement is claimed above
- `h:f8f0b2199a1f8f54` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-walk-2026-09-11) carries to the hunk that replaced it
- `h:8f430d10b616a097` in `cold-review-wording-2026-09-12`: re-measured after the word change; its claim (scope from fold-2026-09-11) carries to the hunk that replaced it
