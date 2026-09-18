# product-description: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://gist.github.com/steveruizok/83ae5c53f2784ebf8f5fe0a3fb94480f at f9435a3c7b022ecadc8441542675a9163cdb6b7f, `SKILL.md`. Drift: 22 of 793 lines changed (3%). Records: baseline-copies-2026-09-11, fold-2026-09-11, vocabulary-owner-2026-09-12.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:4e81b4965ea57394` in `SKILL.md`

```diff
-name: product-description
-description: Build a "product description" repo for a software product — a set of prose documents describing, from the outside in, what the user sees, what they can do, and exactly what happens when they do it, written from the code and tests, then verified against the running product and triaged into a bug list. Works for any product with a user (canvas editors, web apps, CLIs, chat products, mobile apps). Use when the user asks to "write a product description for X", "describe the user experience of X", "document how X behaves for the user", "make a behavior-spec repo", or wants a feature-by-feature, event-by-event account of an app's behavior rather than API docs. Also use to resume or extend an existing product description repo.
+name: "product-description"
+description: "Build a \"product description\" repo for a software product — a set of prose documents describing, from the outside in, what the user sees, what they can do, and exactly what happens when they do it, written from the code and tests, then verified against the running product and triaged into a bug list. Works for any product with a user (canvas editors, web apps, CLIs, chat products, mobile apps). Use when the user asks to \"write a product description for X\", \"describe the user experience of X\", \"document how X behaves for the user\", \"make a behavior-spec repo\", or wants a feature-by-feature, event-by-event account of an app's behavior rather than API docs. Also use to resume or extend an existing product description repo."
```

## scope: An opening paragraph after the title says the skill is a standing program rather than an initiative stage, that its repo is a deliverable outside .greenline/work/, that it runs as reconnaissance before shaping or after verifying, and which roster skills own harness work (control-cli, control-ui), proof of a claim (verify-this) and oversized charts (diagram-design, opt-in); greenline needs this because the consumer reads no prelude.

Record `fold-2026-09-11`, 1 hunk.

### `h:8b124136bdd9b002` in `SKILL.md`

```diff
+This skill runs a standing program, not an initiative stage. The description repo it builds is a deliverable in its own repository, never `.greenline/work/` state; an initiative that commissions one tracks it through its ticket. It runs on a shipped surface, either as reconnaissance before shaping, whose findings feed proposed initiatives, or after verifying, to describe what actually shipped. Harness work in the verification pass belongs to control-cli and control-ui, the proof of a single claim to verify-this, and a state chart that outgrows a Mermaid block to `diagram-design` (opt-in).
+
```

## location: Phase 0's 'where the repo goes' names the home greenline means: a directory of its own outside the workspace and never under .greenline/work/, with the commissioning initiative linking to it from its ticket, so the description program never becomes workspace state.

Record `fold-2026-09-11`, 1 hunk.

### `h:4cac1e9c3bef6c67` in `SKILL.md`

```diff
-5. **Where the repo goes.** A new directory, `git init`, first commit `Initial commit`.
+5. **Where the repo goes.** A new directory of its own, outside the greenline workspace and never under `.greenline/work/`; `git init`, first commit `Initial commit`. An initiative that commissioned the program links to it from its ticket.
```

## dependency: Phase 5's verification pass names the roster skills that own its harness mechanics (control-ui for the browser, control-cli for the shell) and the stage that proves a single claim (verify-this), so the pass reuses greenline's methods instead of improvising them.

Record `fold-2026-09-11`, 1 hunk.

### `h:9511ee2a61cf1530` in `SKILL.md`

```diff
-If you can drive the product (browser tools, a console handle on the app, a shell for a CLI, a test harness), run a first pass yourself on what can be observed that way, record the results in the Result columns, and say plainly in `verification/README.md` what that pass did and did not cover (for example: a scripted pass checks output, exit codes, and stored state but not what was shown on screen or how long it took to appear). Do not mark a document `verified` on the strength of an automated pass alone. A failed item is not automatically a product bug; sometimes the document is wrong, and the Status line says which.
+If you can drive the product (browser tools, a console handle on the app, a shell for a CLI, a test harness; control-ui carries the browser method and control-cli the shell method), run a first pass yourself on what can be observed that way, record the results in the Result columns, and say plainly in `verification/README.md` what that pass did and did not cover (for example: a scripted pass checks output, exit codes, and stored state but not what was shown on screen or how long it took to appear). Do not mark a document `verified` on the strength of an automated pass alone. A failed item is not automatically a product bug; sometimes the document is wrong, and the Status line says which. A single claim that needs proof of its own proves out through verify-this.
```

## lifecycle: Phase 6 says the triage is evidence that returns to the operator, that no initiative is created per cluster (an accepted repair takes a compact ticket, substantial uncertain work an initiative and shaping, a symptom needs diagnosis before it is a build contract), and that filing external issues happens only on the operator's authorization; greenline's artifact system needs the triage kept out of automatic planning. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 2 hunks.

### `h:4fd0cca98f1a7328` in `SKILL.md`

```diff
-**Filing upstream is a separate, outward-facing step.** Offer it; do not do it unasked. If the user wants the entries filed as issues, confirm the repo and the format first, file them, then add an Issue line to each entry and a link column to the summary table (`docs: revise bug-triage.md with links to the filed issues`).
+The triage is evidence, with its limits stated, and it returns to the owner; the work that commissioned the program links to it. Offer next actions without creating an initiative per cluster: an accepted repair can use a compact ticket, substantial uncertain work can earn an initiative and shaping, and a triage symptom still needs diagnosis or clarification before it is a build contract.
```

### `h:db27d94b93223447` in `SKILL.md`

```diff
+**Filing upstream is a separate, outward-facing step.** Offer it; do not do it unasked, and file only on the owner's authorization. If the user wants the entries filed as issues, confirm the repo and the format first, file them, then add an Issue line to each entry and a link column to the summary table (`docs: revise bug-triage.md with links to the filed issues`).
+
```

## dependency: The writing rule for one Mermaid state diagram per interaction names diagram-design (opt-in) as the owner of a chart that outgrows a readable Mermaid block, drawn into the description repo and linked from the document, so the durable diagram has its roster owner.

Record `fold-2026-09-11`, 1 hunk.

### `h:1264c859c422eb4a` in `SKILL.md`

```diff
-- One Mermaid `stateDiagram-v2` per interaction, limited to the states the user passes through.
+- One Mermaid `stateDiagram-v2` per interaction, limited to the states the user passes through. When a chart outgrows a readable Mermaid block, draw it with `diagram-design` (opt-in) into the description repo and link it from the document.
```

## lifecycle: The Handoff section the skills-handoff gate parses: consumes the shipped surface at a pinned commit, produces a separate description repository with no automatic initiative per cluster and operator-gated issue filing, and has no next stage because the program is standing and its triage returns to the operator. (carried from fold-2026-09-11; the word operator became owner where the copy names the workspace's person, and request owner became request holder (the internal refactor's step 1, ruling 10, 2026-09-12))

Record `vocabulary-owner-2026-09-12`, 1 hunk.

### `h:b7b509732ea8f519` in `SKILL.md`

```diff
+
+## Handoff
+
+Consumes: the shipped surface at a pinned commit
+Produces: a separate description repository (README, goal, glossary, one document per feature, verification protocol and checklists, one triage file); no automatic initiative per cluster; filing external issues needs the owner
+Next: none; a standing program whose triage returns to the owner
```

## Retired

- `h:e335307b8498f683` in `fold-2026-09-11`: the prelude is folded into the body: the scope paragraph after the title, Phase 0's repository home, Phase 5's harness and proof owners, and the writing rule that routes oversized charts to diagram-design
- `h:04c6cfb0208f564d` in `fold-2026-09-11`: the completion is folded into the body: Phase 6's triage return and filing rule, and the Handoff section at the end
- `h:33f35c1cedca88b6` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-2026-09-11) carries to the hunk that replaced it
- `h:c72a9956237bc796` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-2026-09-11) carries to the hunk that replaced it
- `h:08d5b3cb1b56595b` in `vocabulary-owner-2026-09-12`: re-measured after the word change; its claim (lifecycle from fold-2026-09-11) carries to the hunk that replaced it
