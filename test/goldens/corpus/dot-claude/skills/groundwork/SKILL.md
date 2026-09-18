---
name: "groundwork"
description: "Establish the missing engineering baseline for a repository's purpose and prove first green. Use for a request to set a repo up properly or bring it to a working baseline; preserve established components and avoid unnecessary infrastructure."
---

# Groundwork

Carry a setup request through a usable, verified baseline. Read the existing
repository and settled decisions first. Follow the request loop in AGENTS.md;
compare choices only where this component lacks an established answer.
The setup request authorizes ordinary reversible work in its scope; clarify
only consequential choices the request and evidence leave open.

## Establish configuration

If initialization is part of the request, establish the guidance choice:
a provider URL, or explicit skills-only work, and the intended harness trees.
For both harnesses, use `greenline init --targets codex,claude-code --guidance URL`
or `greenline init --targets codex,claude-code --guidance none`; keep keys in the process environment.
An existing configured repository is not reset because a request fails.

## Establish purpose and constraints

Identify the first real use, deployment constraints, component roots, existing
tools, collaborators, and relevant environment boundaries. An established tree
may need a repaired check rather than a new stack. A disposable script may need
only its lightweight execution form. Recommend a coherent combination where
choices are open, with its meaningful trade-offs and compatibility evidence.
Ask about an unresolved license or consequential platform choice before choosing
it; leave an unanswered choice open. Do not infer publication or paid services
from a request for local setup. On an empty repository the toolchain is this
method's to choose from the brief and the runtime: decide it, record it as the
toolchain decision in the book with its rationale row, and name it in the reply
in one line.

## Build the missing baseline

Use one compact ticket when the baseline is a bounded change. An initiative
and multiple tickets earn their place when distinct outcomes or dependencies
need them. `.greenline/WORK.md` owns those records; no fixed ticket count or
extra grant artifact is required. The current execution account includes
preparatory guidance work and the resulting setup.

Assess which of these outcomes the purpose actually needs:

- A coherent language and tool combination, with current compatible versions
  and its scoped rationale recorded once in `.greenline/DECISIONS.md`.
  Write its explicit root statement using the exact `greenline-roots` format
  in `.greenline/WORK.md` under Repository memory. The rationale field is
  `decision`. Unknown purpose stays null; unknown choices stay empty. Keep siblings separate.
- A reproducible check that exercises the actual code and relevant failure
  paths. Use the repository's dependency resolution and execution conventions.
- Appropriate ignores, editor settings, and environment boundaries where
  those are needed. Secret values belong outside repository evidence.
- A clear starting README and the owner's licensing choice.
- Domain vocabulary or architectural decisions when there is something
  durable to name or explain; empty documents do not improve the baseline.

Preserve established choices outside the requested change. For configured work,
query relevant language, purpose and responsibility facets, compare candidates'
conditions and read coherent options. Resolve volatile compatibility from primary
sources when it matters. Choose only roles the component needs; an option is
not an obligation to install a dependency or invent a service.

## Prove first green

Run the actual pinned tools and frozen dependency resolution as the check
will use them. Preserve failed runs and fix their causes. Commit a coherent
result for independent review, then verify the ticket's acceptance against
that result. Several tickets may share an execution result, but each keeps
its own intent, implementation account, and exact review linkage. Shared
measurements are cited, not represented as separate runs.

Reconcile relevant changes to repository choices in the same work. Report what is
usable, the important choices and evidence, and any open owner decision.
A remote-less repository can finish with a local check. Forge protection,
secrets, hosting, and publication require their own authority when needed;
prepare a concrete next action without turning them into setup busywork.

## Handoff

Consumes: the repository as found and its settled decisions
Produces: the toolchain, check, ignore and README baseline, committed, reviewed and verified as this ticket's own result; a rationale row and an explicit greenline-roots root statement in .greenline/DECISIONS.md; one compact ticket for the setup itself (or an initiative when the request is larger)
Next: project-router picks up continuity; implement builds the next requested work
