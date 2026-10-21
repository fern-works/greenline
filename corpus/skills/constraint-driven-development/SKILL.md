---
name: "constraint-driven-development"
description: "Writes the repository's quality bar down as a contract in its decision home, a command behind every number, and guards it against an agent quietly lowering it: a new suppression, a skipped or deleted test, a stripped assertion, an unimplemented stub, a threshold edited down. Use when no quality bar is written down, when the owner says \"set up constraints\" or \"define our standards\", or when an agent keeps silencing checks or skipping tests to reach green."
---

# Constraint-Driven Development

constraint-driven-development is a trial start for a repository whose quality bar is not written down, or whose checks were loosened to reach green. Writing the bar is a change: propose its mode and wait, as AGENTS.md says, open its record with a `## start` section naming constraint-driven-development, and run the line from `frame`; the interview below is the frame step's, its four questions asked at any depth since each has a default, and the bar is written at the build step. Install only what the owner picked: an option is not an obligation to install a dependency, as groundwork says, and a default the owner takes with "I don't know" is no pick: what it would install is proposed with its cost and installed only on the owner's yes.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

## Overview

This skill produces a written record of **this project's** bar, with numbers, that outlives the conversation and can be checked mechanically.

The reason matters. When you wrote the code, reading it told you whether it was any good. An agent writes more in an afternoon than you will read that week, so the judgement moves out of your head and into checks that run around the loop. Those checks need to exist, they need numbers you actually chose, and they need to fire close enough to the work that the agent fixes its own output.

Spec-driven development says what to build. Test-driven development proves it works. Constraint-driven development defines what "good enough to ship" means, before anyone argues about it in a pull request.

## Loading Constraints

The interview needs a live user. **Don't run it in non-interactive contexts** (CI, autonomous runs). If constraints are missing and you're in one of those, apply the Floor below, note that you did, and flag the rest for a human. In such a context the floor is applied only as a change the workspace's `proceed` setting lets you make without waiting; otherwise propose it, as AGENTS.md says.

## The Process

### Step 1: Detect before you ask

Never ask what you can read. Before the first question, gather:

| What | Where to look |
|------|---------------|
| Language and stack | `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` |
| Test runner | dev dependencies, `test` script, existing test files |
| Existing linters | `eslint.config.*`, `biome.json`, `.ruff.toml` |
| Coverage today | `coverage/` output, or the suite run once with its coverage provider; with none there is no number, until Q1's (a) adds one |
| CI | `.github/workflows/`, `.gitlab-ci.yml` |

Report what you found in two lines, then ask only what's left.

### Step 2: Four questions, each with a default

Follow the frame skill's interview, [../frame/references/interview.md](../frame/references/interview.md), with the differences this start keeps: the four questions below are fixed, each has a default, so "I don't know" is a complete answer that still produces a working config, and no round follows them. At every depth, the inline one included, ask all four in one round, each with its guess, and wait, and record the answers in the change record's frame section, never in a section of this start's own.

```
Q1: Beyond the floor, which of these do you want enforced?
    (a) Test coverage on new code
    (b) Security scanning
    (c) Performance budgets
    (d) Accessibility
    (e) Architecture boundaries
GUESS: (a) and (b) — you have a test runner already and you're handling user input.
DEFAULT if unsure: (a) and (b).
Say what each pick costs: (c) and (d) need a running URL, (e) needs a rules file written.
```

```
Q2: When a check fails while the agent is mid-task, should it block or warn?
GUESS: Block. You're running agents unattended and a warning nobody reads is a warning.
DEFAULT if unsure: Block on the floor, warn on everything else for the first two weeks.
```

```
Q3: Do you have target numbers in mind, or should I measure where you are today and hold that line?
GUESS: Measure. Most teams don't have a number, and an invented one gets ignored.
DEFAULT if unsure: Measure and hold. See "Ratchets" below.
```

```
Q4: What's the slowest check you'll tolerate before the agent hands work back?
GUESS: About 90 seconds. Longer and you'll stop running it.
DEFAULT if unsure: 90 seconds at task end, unlimited in CI.
```

Stop at four. A twelve-question intake produces a config nobody understands and a user who regrets starting.

### Step 3: Write the bar into the decision home

One section, `## Constraints`, in the repository's decision home: its own decisions document, or the decisions book where it keeps none. Every agent reads it, since AGENTS.md sends each one to the decision home, and a change to it shows up in review where it belongs.

```markdown
## Constraints

Last reviewed: 2026-08-08 by @addy

### Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `# noqa`, `# type: ignore`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`
- No skipped or deleted tests; the floor guard flags each one, and only the owner lets one through
- No secrets in source
- This section does not get weakened to make a change pass

### Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|-----------|---------|
| Types | Zero type errors | `tsc --noEmit` | every edit |
| Lint | Zero errors from our config | `biome check` | every edit |
| Secrets | No secrets in source | `gitleaks detect --redact` | every edit |
| Coverage | Changed lines ≥ 80% covered | `vitest run --coverage` + git diff | task end, CI |
| Security: code | No high findings | `semgrep scan --config p/default` | CI |
| Security: deps | Nothing at high or above | `osv-scanner scan source -r .` | CI |
| Accessibility | Zero critical or serious | `axe $PREVIEW_URL --tags wcag2a,wcag2aa,wcag21aa` | preview deploy |
| Performance | LCP ≤ 2500ms, CLS ≤ 0.1 | `lighthouse $PREVIEW_URL --output=json` | preview deploy |

Every row names the command that produces the verdict. A dimension with a
number and no command in this column is an aspiration, not a constraint.

### Measured, not yet enforced

| Metric | Today | Direction |
|--------|-------|-----------|
| Project coverage | 62.4% | must not fall |
| Bundle size (main) | 184 kB | must not grow |

### Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
| W1 | `no-explicit-any` | `src/legacy/**` | Rewrite tracked in ENG-441 | @addy | 2026-11-01 |
```

No line goes into the agent instructions file: AGENTS.md already sends every agent to the decision home.

### Step 4: Wire it to the lifecycle

The single biggest mistake is running everything everywhere. A check that stalls the agent gets switched off, and a gate people switched off is worse than no gate, because the bar still looks like it exists.

| Step | When | What runs | Budget |
|-------|---------|-----------|--------|
| build | after each edit | Types, lint, secrets, the floor | under 5s, changed file only |
| verify | at task end | Related tests, coverage on changed lines | under 90s |
| review | at the review step | Everything, plus the guards below | minutes |
| CI | before a merge | Direction checks, no regressions | CI |

Two rules that keep this tolerable:

1. **Scope to the diff.** Check the lines this change touched, not the whole repo. Coverage of changed lines is a number the agent can move; project coverage is one it inherited.
2. **Cost decides placement.** Anything over a few seconds moves out of the edit loop. Mutation testing on a whole repo takes hours; on the files a change touched it takes under a minute, which is the difference between a check people run and one they don't.

### Step 5: Guard the bar itself

Someone will point out that if the agent writes the code and the checks, the checks prove nothing. Half right, and worth engineering around.

Agents don't craft clever loopholes. They hit a red check and take the cheapest road to green. Watch for these five moves in the diff, at review time:

1. **The threshold moved.** A budget lowered, a severity dropped, a check removed from the fast stage. Compare the bar in the decision home against its state at the branch point.
2. **A test got easier.** `.skip` added, a test file deleted, assertions pulled out of tests that stayed.
3. **A checker got silenced.** New `@ts-ignore` or `eslint-disable`. Four suppressions deserve special attention because they switch off a check you're relying on: `istanbul ignore` drops code from coverage instead of testing it, `Stryker disable` hides a surviving mutant, `nosemgrep` and `gitleaks:allow` do it for security findings.
4. **Work is unfinished.** A stub that throws, an empty `catch` turning a failure into silence, a `TODO` standing where the implementation should be.
5. **An exception appeared.** A new row in the Exceptions table nobody discussed.

None of this needs tooling beyond `git diff`. Tightening the bar should be silent; loosening it should be loud.

Unlike the numbered dimensions, the floor has no de facto tool of its own, so an agent asked to enforce it tends to write a checker from scratch, and two agents write two different ones. A reference implementation of these five checks ships with this skill in [references/floor-guard.md](references/floor-guard.md) (diff-scoped, exit `0`/`1`/`2`, patterns adaptable per ecosystem). Adapt that rather than reinventing it, for the same reason every dimension names a de facto tool: so the mechanism is the same across runs and stacks. Run the floor guard as one of the repository's own checks, recorded as a check, with `--bar` naming the file that holds the bar where the decision home is the repository's own, at the build and review steps; it never runs as a harness hook. In CI, where the repository has one, the job calls the guard directly on each change before it merges, not as a recorded check, whose facts a CI run does not keep: it checks out the whole history of the change and of the branch it merges into, and passes `--base` naming that branch as CI fetched it, such as `origin/main`, and `--bar` as above; a shallow checkout holds no merge base, so the guard bails with exit `2`, which fails the job as exit `1` does.

**Not all checks are equally circular.** Rank them by one question: can the agent make this pass by writing code that doesn't work?

- **External** — axe-core encodes WCAG, `osv-scanner` reads a vulnerability database, Lighthouse measures a real browser. The agent can't argue with these.
- **Project** — your lint rules, your layer boundaries. A human owns the file.
- **Suite** — your own tests. Most useful, and the only genuinely circular one.

A bar made entirely of the third kind is worth less than one with an outside opinion in it. Check that at least one external constraint is present.

### Step 6: Ratchets, when you don't have a number

Set 80% coverage on a codebase at 62% and you get a red build forever, then a team that learns to ignore red builds.

The alternative asks for no decision: record where you are, then refuse to get worse. Put it in the "Measured, not yet enforced" table with today's number and a direction. Every check compares against the recorded value, not an aspiration. When a number improves, update it; when it drops, that's the finding.

This also answers a fair objection to training. Models are rewarded for passing tests, which you can evaluate in seconds. Architectural rot shows up over months and never reaches the weights. A ratchet is the missing penalty, written down where the build can see it.

## Escalation Path

Constraints work at three levels of teeth. Start at the first.

1. **Written only.** The bar is written in the decision home, and agents read it. Costs nothing, catches the honest mistakes, relies on the agent complying.
2. **Scripted.** An `npm run check` (or `make check`) that runs the fast checks, recorded as a check and in your CI. Deterministic, no new dependency.
3. **Tool-backed.** A dedicated runner that handles diff scoping, budgets, ratchets, and the guard checks. Use when the config outgrows a shell script. The floor-guard reference in [references/floor-guard.md](references/floor-guard.md) is the starting point for the guard-checks half of this.

Most projects should stop at 2. Move to 3 when you're maintaining more than about thirty lines of check-running shell.

**A first run can be floor-only.** The floor guard is diff-only and needs no installs, so you can enforce the floor on day one and add numbered dimensions as you install each tool, rather than standing up every checker before the first commit is protected. Security tools that install machine-wide (gitleaks, osv-scanner) can also run CI-only if you'd rather keep laptops clean; declare where each dimension runs in the `Runs at` column.

## Handoff

Consumes: the repository, its stack, its checks and its CI; the owner's answers to the four questions; the decision home
Produces: through the change, the bar in the decision home's `## Constraints` section, a command behind every number, the measured values a ratchet holds, and the floor guard as one of the repository's checks
Next: frame, under the mode the owner approves
