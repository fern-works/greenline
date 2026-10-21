---
name: "build"
description: "Turn a change's plan into working code one slice at a time, each slice tested, verified and committed with the change's trailer and the build green between slices, every command's output compared with what the plan expected and every deviation recorded, at the depth the change's mode gives the build step. Use when the mode reaches build, or when the owner asks to build a ready ticket or to make a small settled fix."
---

# Build

Build turns a change's plan into working code, one slice at a time, each slice tested, verified and committed before the next. It runs where the change's mode reaches the build step, at the depth the mode gives it, and alone when the owner asks to build a ready ticket, which opens its own change record under the mode approved with the ticket list, or to make a small settled fix, which opens its own change record under the mode the owner accepts. It reads the change record's plan section first, or its frame section where the mode skipped the plan, and for a ticket its entry in the plan directory's tickets file and the planning change's plan section. The builder runs every task itself, one after another, and no agent runs beside the conversation. A consequential choice the plan leaves open, a product or a contract choice, returns to the owner rather than being decided during the build. It never reviews its own result or verifies the change's claim: those are the review and verify steps'.

## The slices

In what follows a task is the plan's, a ticket's work or one task of a change's plan section; a slice, an increment or a unit is one tested and committed piece of a task; and a step is one of the task's steps as the plan lists them, not a step of the change's mode.

Build in thin vertical slices — implement one piece, test it, verify it, then expand. Avoid implementing an entire feature in one pass. Each increment should leave the system in a working, testable state.

For each slice:

1. **Implement** the smallest complete piece of functionality
2. **Test** — run the test suite (or write a test if none exists)
3. **Verify** — confirm the slice works as expected (tests pass, build succeeds, manual check)
4. **Commit** -- save your progress with a descriptive message
5. **Move to the next slice** — carry forward, don't restart

Use tdd where possible, at pre-agreed seams.

**Execution.** In a sweep, migration, or any run of similar edits, verify each change before starting the next. Each unit is a before/after bracket: known-good state, one change, run the check, then proceed.

## Implementation Rules

### Rule 0: Scope Discipline

Touch only what the task requires.

Do NOT:
- "Clean up" code adjacent to your change
- Refactor imports in files you're not modifying
- Remove comments you don't fully understand
- Add features not in the spec because they "seem useful"
- Modernize syntax in files you're only reading

If you notice something worth improving outside your task scope, note it — don't fix it, and list it in the build section.

### Rule 1: One Thing at a Time

Each increment changes one logical thing. Don't mix concerns:

**Bad:** One commit that adds a new component, refactors an existing one, and updates the build config.

**Good:** Three separate commits — one for each change.

**Delivery.** Stack commits in the order that proves the work. The canonical shape is the failing test first, then the fix on top. Other story orders are a subtraction before the reshape, a baseline capture before the treatment, the scaffold before the feature. Each commit lands on its own and the sequence reads as an argument.

### Rule 2: Keep It Compilable

After each increment, the project must build and existing tests must pass. Don't leave the codebase in a broken state between slices.

## Increment Checklist

After each increment, verify with the repository's own commands:

- [ ] The change does one thing and does it completely
- [ ] All existing tests still pass (the repository's test command: `npm test`, `./gradlew test`, `pytest`, ...)
- [ ] The build succeeds (the repository's build command)
- [ ] Type checking passes, where the stack has one (`npx tsc --noEmit`, `mypy`, ...)
- [ ] Linting passes (the repository's lint command)
- [ ] The new functionality works as expected
- [ ] The change is committed with a descriptive message

**Note:** Run each verification command after a change that could affect it. After a successful run, don't repeat the same command unless the code has changed since — re-running on unchanged code adds no information.

## Against the plan

In what follows the spec is the plan directory's spec, or, for a change that stands alone, its frame section with its acceptance criteria. Where the plan states what a step's command should show, run the command, read its output, and compare. Three outcomes:

- **Matches.** Next step.
- **The code is wrong.** Find the
  cause; never patch the symptom to make the step's output match.
- **The plan is wrong** — a step contradicts the spec, an interface from an
  earlier task doesn't match what this task consumes, a command that
  cannot work. Rule on the smallest change that satisfies the spec, record it in the build section as a deviation, with what you decided and why, and continue; a choice the spec does not settle, a product or a contract choice, returns to the owner instead. The ruling is carried, not remembered: later tasks that touch the same interface read it from the build section.

## The completion contract

Before a task is called done, all of the following are true, with evidence in this session, not inferred from the diff looking right:

- Every test the task names exists and ran in this task, and you read the output.
- The final test run for the task passed, recorded as a check of the change, as build's references page says.
- Every result the plan said a step's command should show was compared against real output.
- Every deviation from the plan is in the build section, with what you decided and why.

If any item is missing, the task is not complete: finish it.

## Handoff

Consumes: the change record's plan section in .greenline/ledger/<id>.md, or its frame section where the mode skipped the plan; for a ticket, its entry in the plan directory's tickets.md and the planning change's plan section
Produces: the commits on the change's branch, each carrying the trailer Greenline-Change: <id>; the checks greenline check records under .greenline/ledger/<id>/checks/; the build section of .greenline/ledger/<id>.md, one line at the inline depth, and at the written depth what was built with the deviations from the plan, the approaches tried and dropped, and what was noticed and left alone
Next: the next step of the change's mode
