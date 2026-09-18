# prototype: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/mattpocock/skills at 3cca18b368ae95cdbdebbff572ccafa662551015, `skills/engineering/prototype`. Drift: 22 of 208 lines changed (11%). Records: baseline-copies-2026-09-11, pull-2026-09-11, fold-2026-09-11, fold-walk-2026-09-11, series-s7-roster-2026-09-11, roster-keepers-2026-09-15, roster-keepers-fix-2026-09-15.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:a8c6c9f1398c0368` in `SKILL.md`

```diff
-name: prototype
-description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
+name: "prototype"
+description: "Build a throwaway prototype, a spike, to answer one design question. Use when the user wants to sanity-check whether a state model or logic feels right, mock up a couple of UI options, or 'just try it and see'."
```

## scope: The skill's scope opens the body in its own voice: a decision or plan dispatches it for one experimental question, it settles the disposable-or-ship distinction and uses the existing owner, a promising prototype never becomes production code silently, and it publishes no external issue and needs no tracker.

Record `fold-2026-09-11`, 1 hunk.

### `h:178ac777842f7d80` in `SKILL.md`

```diff
+A decision or plan dispatches this method when one experimental question stands in its way: the requesting stage names the question, and the answer goes back to it. Establish the question, which branch below it needs, and whether the result is disposable or intended to ship; resolve that distinction when the request leaves it open, and use the existing task's owner. A promising prototype does not silently become production code: the validated decision moves into the real code by the normal path, and the disposable code never enters the shipping source tree. This method publishes no external issue and needs no tracker.
+
```

## method: upstream's rules 1 and 2 place prototype code next to the module it prototypes and add a task-runner entry; greenline keeps disposable code out of the shipping tree (scratch, the owner's evidence home, or a throwaway checkout) and adds no runner entry, which changes where the method works Confirmed by the operator on 2026-09-11 (method-rulings.md).

Record `series-s7-roster-2026-09-11`, 1 hunk.

### `h:e96371c5252019e1` in `SKILL.md`

```diff
-1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious, but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
-2. **Trivial to run.** A UI prototype starts from one command in the project's task runner: `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
+1. **Throwaway from day one, and clearly marked as such.** Keep the prototype code out of the shipping source tree: a runnable experiment lives in `.greenline/tmp/prototype/`, in the owner's evidence home, or in an isolated throwaway checkout of the project when it needs the real modules and pages around it (mirror the project's module and routing conventions there, so context stays obvious), and name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
+2. **Trivial to run.** A UI prototype starts from one documented command run from the experiment's directory or isolated checkout with the tools already available: `pnpm <name>`, `python <path>`, `bun <path>`, etc.; the shipping task runner gains no prototype entry. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
```

## location: Rule 6 and the Handoff agree: the relied-on copy is promoted into the owner's evidence home and cited there, a throwaway branch exists only for a prototype built in an isolated checkout and its pointer is context, never evidence; the owning ticket and an initiative's prototypes/PROTO-NNN.md remain the greenline homes; carried from roster-keepers-2026-09-15 (J-8's fix, 2026-09-15)

Record `roster-keepers-fix-2026-09-15`, 1 hunk.

### `h:a937db45bf2bfcfe` in `SKILL.md`

```diff
-6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too (the verdict and the question it settled) in the issue or a commit. The main branch keeps only the validated decision.
+6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: copy what the decision relies on into the owning ticket's evidence home first, and cite that copy; a prototype built in an isolated checkout may also be kept on a throwaway branch, out of main, with a context pointer to that branch on the owning ticket, `.greenline/work/tickets/TKT-NNN.md`, which is context and never evidence. Capture the answer too (the verdict, the question it settled, and its limits) in the ticket or a commit; when an initiative owns the question, its `prototypes/PROTO-NNN.md` carries the question, the answer, the limits and the branch pointer. The main branch keeps only the validated decision.
+
+## Handoff
+
+Consumes: one experimental question and whether its result is disposable or meant to ship, from the requesting decision or plan
+Produces: prototypes/PROTO-NNN.md in the owning initiative, or the answer on the owning ticket with the relied-on copy in its evidence home; for a prototype built in an isolated checkout, a throwaway branch with its pointer as context; disposable code never in shipping implementation
+Evidence at: the owner's evidence home, where the relied-on copy is promoted from .greenline/tmp/prototype/ or an isolated throwaway checkout; a throwaway branch, when one exists, is a context pointer and never evidence
+Returns to: the requesting decision or plan, with the answer and its limits
```

## harness: the renderer generates agents/openai.yaml from the manifest; the vendored copy is not projected

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:898ec71a9ae1edd5` in `agents/openai.yaml`

Removed file, 3 lines.

## Retired

- `h:c49dfe1851fcb05b` in `fold-2026-09-11`: The prelude is folded into the body: its question and owner rules became the opening scope paragraph, its rule 1 and rule 2 replacements were made in place, and its reading of 'issue' as the owning ticket was written into rule 6.
- `h:f9014c43247aa6c6` in `fold-2026-09-11`: The completion is folded into the body: question, answer, limits and the reproducible pointer sit in rule 6, and the return to the requesting decision or plan in the Handoff section.
- `h:e96371c5252019e1` in `fold-walk-2026-09-11`: re-kinded from location to method
- `h:e96371c5252019e1` in `series-s7-roster-2026-09-11`: re-recorded with the operator's ruling as authority; the same hunk is claimed above
- `h:7bcab25d21c05eea` in `roster-keepers-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8, 2026-09-15)
- `h:022bc739d8eb7194` in `roster-keepers-fix-2026-09-15`: re-measured: the earlier claim on this hunk is carried forward in the new hunk's edit (J-8's fix, 2026-09-15)
