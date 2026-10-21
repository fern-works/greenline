---
name: "improve-instructions"
description: "Tidy the agent instructions file, AGENTS.md or CLAUDE.md, outside greenline's managed markers: keep the foundational context bare, key each conditional rule to its situation under a heading of its own, keep every command, and cut what a linter, a hook or the code already says. Use when the owner asks to improve, tidy or shorten the instructions file, or when its rules are skipped because unrelated rules share one broad condition."
---

# Improve instructions

improve-instructions is a trial start for an owner who asks to tidy the agent instructions file, AGENTS.md or CLAUDE.md. Tidying the file is a change: propose its mode and wait, as AGENTS.md says, open its record with a `## start` section naming improve-instructions, and run the line from `frame`; the rewrite is its build. The file holds greenline's managed block between `<!-- greenline:managed begin policy -->` and its end marker. Edit only outside those markers: never move, rewrite or wrap the block, and keep the owner's `## House rulings` stanza as the work guide describes it.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

When the user provides an agent instructions file (or asks you to improve one), rewrite it following the principles and structure below.

## Core Problem

A harness may tell its agent that the instructions file may or may not be relevant to the task. So the agent ignores the parts it deems irrelevant, and the more of the file that does not apply to the current task, the more likely it is to ignore everything, the parts that matter included.

## Solution: a heading per situation

Put each conditionally relevant section of the file under a heading of its own that names the situation it applies in, such as `## When you are adding or modifying imports`. The heading gives the agent an explicit relevance signal that cuts through the "may or may not be relevant" framing: it reads the section whose situation matches its task.

## Principles

### 1. Foundational context stays bare, domain guidance gets keyed

Not everything should be under a situation heading. Context that is relevant to virtually every task — project identity, project map, tech stack — should be left as plain markdown at the top of the file. This is onboarding context the agent always needs.

Domain-specific guidance that only matters for certain tasks — testing patterns, API conventions, state management, i18n — goes under headings that name its situation.

The rule of thumb: if it's relevant to 90%+ of tasks, leave it bare. If it's relevant to a specific kind of work, key it.

### 2. Conditions must be specific and targeted

Bad — overly broad conditions that match everything:

```
## When you are writing or modifying any code
- Use absolute imports
- Use functional components
- Use camelCase filenames
```

Good — each rule has its own narrow trigger:

```
## When you are adding or modifying imports
- Use `@/` absolute imports (see tsconfig.json for path aliases)
- Avoid default exports except in route files

## When you are creating new components
- Use functional components with explicit prop interfaces

## When you are creating new files or directories
- Use camelCase for file and directory names
```

### 3. Keep it short, use progressive disclosure sparingly

Do not shard into separate files that require the agent to make tool calls to discover, unless the extra context is incredibly verbose or complex.

The whole point of situation headings is that everything is inline but conditionally weighted — the agent sees it all but only attends to what matches.

Prefer to keep the file concise.

### 4. Less is more

- Frontier models can reliably follow a few hundred. The harness's system prompt and tools already use ~50 of those. Your instructions file should be as lean as possible.
- Cut any instruction that a linter, formatter, or pre-commit hook can enforce
- Cut any instruction the agent can discover from existing code patterns. LLMs are in-context learners — if your codebase consistently uses a pattern, the agent will follow it after a few searches.
- Cut code snippets. They go stale and bloat the file. Use file path references instead (e.g., "see `src/utils/example.ts` for the pattern").

### 5. Keep all commands

Do not drop commands from the original file. The commands table is foundational reference — the agent needs to know what's available even if some commands are used less frequently.

### 6. Pack the boundaries

The instructions file is the rules file that persists across sessions. This is the highest-leverage context you can provide.

Beside the identity, the project map and the commands, keep the boundaries bare near the top: what an agent never does in this repository, and what it asks before doing, such as committing a secret, adding a dependency without weighing its cost, or changing a database schema.

## Output Structure

When rewriting the instructions file, produce this structure:

```
<!-- greenline:managed begin policy -->
[greenline's block, exactly as it stands]
<!-- greenline:managed end policy -->

[one-line project identity: what it is, what it's built with]

## Project map
[directory listing with brief descriptions]

## Boundaries
[what an agent never does here, and what it asks first]

## When you need to run commands to build, test, lint, or generate code
[commands table: all commands from the original]

## When <specific trigger for rule 1>
[rule 1]

## When <specific trigger for rule 2>
[rule 2]

... more rules, each under its own heading ...

## When <specific trigger for domain area 1>
[guidance]

... more domain sections ...

## House rulings
[the owner's rulings, as they stand]
```

## How to Apply

When given an existing instructions file to improve:

1. **Identify the project identity** — extract a single sentence describing what this is. Leave it bare at the top.
2. **Extract the directory map** — keep it bare (no situation heading). This is foundational context.
3. **Extract the tech stack** — if present, keep it bare near the top. Condense to one or two lines.
4. **Extract commands** — keep ALL commands from the original. Put them under one situation heading.
5. **Break apart rules** — split any list of rules into individual situation headings with specific conditions. You can group rules, but never group unrelated rules under one broad condition.
6. **Key domain sections**: testing, API patterns, state management, i18n, etc. each get their own heading naming when that knowledge matters.
7. **Delete linter territory** — remove style guidelines, formatting rules, and anything enforceable by tooling. Suggest replacing with pre-push or pre-commit hooks.
8. **Delete code snippets** — replace with file path references.
9. **Delete vague instructions** — remove anything like "leverage the X agent" or "follow best practices" that isn't concrete and actionable.

## Example

Input:
```markdown
# CLAUDE.md

This is an Express API with a React frontend in a Turborepo monorepo.

## Commands

| Command | Description |
|---|---|
| `turbo build` | Build all packages |
| `turbo test` | Run all tests |
| `turbo lint` | Lint all packages |
| `turbo dev` | Start dev server |
| `turbo storybook` | Start Storybook |
| `turbo db:generate` | Generate Prisma client |
| `turbo db:migrate` | Run database migrations |
| `turbo analyze` | Bundle analyzer |

## Project Structure

- `apps/api/` - Express REST API
- `apps/web/` - React SPA
- `packages/db/` - Prisma schema and client
- `packages/ui/` - Shared component library
- `packages/config/` - Shared configuration

## Coding Standards

- Use named exports
- Use functional components with TypeScript interfaces for props
- Use camelCase for variables, PascalCase for components
- Prefer `const` over `let`
- Always use strict equality (`===`)
- Use template literals instead of string concatenation
- Write JSDoc comments for all public functions
- Use barrel exports in index.ts files

## API Development

- All routes go in `apps/api/src/routes/`
- Use Zod for request validation
- Use Prisma for database access
- Error responses follow RFC 7807 format
- Authentication via JWT middleware

## Testing

- Jest + Supertest for API tests
- Vitest + Testing Library for frontend
- Test fixtures in `__fixtures__/` directories
- Use `createTestClient()` helper for API integration tests
- Mock database with `prismaMock` from `packages/db/test`

## State Management

- Zustand for global client state
- React Query for server state
- URL state via `nuqs`
```

Output:

```markdown
<!-- greenline:managed begin policy -->
[greenline's block, exactly as it stands]
<!-- greenline:managed end policy -->

Express API + React frontend in a Turborepo monorepo.

## Project map

- `apps/api/` - Express REST API
- `apps/web/` - React SPA
- `packages/db/` - Prisma schema and client
- `packages/ui/` - Shared component library
- `packages/config/` - Shared configuration

## When you need to run commands to build, test, lint, or generate code

Run with `turbo` from the repo root.

| Command | What it does |
|---|---|
| `turbo build` | Build all packages |
| `turbo test` | Run all tests |
| `turbo lint` | Lint all packages |
| `turbo dev` | Start dev server |
| `turbo storybook` | Start Storybook |
| `turbo db:generate` | Regenerate Prisma client after schema changes |
| `turbo db:migrate` | Run database migrations |
| `turbo analyze` | Bundle analyzer |

## When you are adding or modifying imports or exports

- Use named exports (no default exports)

## When you are creating new components

- Use functional components with TypeScript interfaces for props

## When you are adding or modifying API routes

- All routes go in `apps/api/src/routes/`
- Use Zod for request validation
- Use Prisma for database access
- Error responses follow RFC 7807 format
- Authentication via JWT middleware

## When you are writing or modifying tests

- API: Jest + Supertest
- Frontend: Vitest + Testing Library
- Test fixtures in `__fixtures__/` directories
- Use `createTestClient()` helper for API integration tests
- Mock database with `prismaMock` from `packages/db/test`

## When you are working with state management, stores, or URL parameters

- Zustand for global client state
- React Query for server state
- URL state via `nuqs`
```

What was removed and why:
- camelCase/PascalCase, const vs let, strict equality, template literals, JSDoc, barrel exports — linter and formatter territory, or discoverable from existing code patterns
- Coding Standards as a grouped section — split into targeted sections by situation

What was NOT removed:
- All commands kept (including dev, storybook, analyze)
- Project map left bare (foundational context, relevant to every task)

## Handoff

Consumes: the agent instructions file, AGENTS.md or CLAUDE.md, outside greenline's managed markers; the repository's linters, hooks and code patterns
Produces: through the change, the file rewritten outside the markers: the identity, the map and the boundaries bare, every command kept, each conditional rule under a heading naming its situation, the managed block untouched
Next: frame, under the mode the owner approves
