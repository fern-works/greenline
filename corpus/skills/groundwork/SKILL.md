---
name: "groundwork"
description: "Establish the missing engineering baseline for a repository's purpose and prove first green. Use for a request to set a repo up properly or bring it to a working baseline; preserve established components and avoid unnecessary infrastructure."
source: "greenline native setup workflow; the work guide and the ledger guide own its integration."
---

# Groundwork

Groundwork is the start for a setup request: set this repository up properly,
or bring it to a working baseline. Read the existing repository and settled
decisions first, and establish the purpose and the choices before any edit.
Then hand the work to a mode: propose it and wait, as AGENTS.md says, open the
change record with a `## start` section naming groundwork and the combination
it recommends, and run the line from `frame`. Compare choices only where this
component lacks an established answer. The setup request authorizes ordinary
reversible work in its scope; clarify only consequential choices the request
and evidence leave open.

On an empty tree groundwork is also the orientation AGENTS.md names: its
own change, proposed before the feature a first request asks for, or that
request's own change when it asks to set the repository up.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

## Establish configuration

If initialization is part of the request, it is the change's first edit, at its build step: install the practice for the
harnesses the owner works in, as groundwork's references page says. An existing initialized repository is not reset because a
request fails.

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

The change's build step builds the baseline. Its plan step splits the work
into tickets only where distinct outcomes or dependencies need them;
The work guide says where those files live, and no fixed ticket count
or extra grant artifact is required.

Assess which of these outcomes the purpose actually needs:

- A coherent language and tool combination, with current compatible versions
  and its scoped rationale recorded once in the decisions book.
  Write its explicit root statement using the exact `greenline-roots` format
  the work guide gives under Repository memory. The rationale field is
  `decision`. Unknown purpose stays null; unknown choices stay empty. Keep siblings separate.
- A reproducible check that exercises the actual code and relevant failure
  paths. Use the repository's dependency resolution and execution conventions.
- Appropriate ignores, editor settings, and environment boundaries where
  those are needed. Secret values belong outside repository evidence.
- A clear starting README and the owner's licensing choice.
- Domain vocabulary or architectural decisions when there is something
  durable to name or explain; empty documents do not improve the baseline.

Preserve established choices outside the requested change. Resolve volatile
compatibility from primary sources when it matters. Choose only roles the component needs; an option is
not an obligation to install a dependency or invent a service.

## Prove first green

Run the actual pinned tools and frozen dependency resolution as the check
will use them, each recorded as a check, so the change's record keeps
the facts of every run. Preserve failed runs and fix their causes. Commit a
coherent result, each commit carrying the change's trailer, for the review
step at the depth its mode gives, then verify the change's acceptance against
that result at the verify step's depth. Shared measurements are cited, not
represented as separate runs.

Reconcile relevant changes to repository choices in the same work. Report what is
usable, the important choices and evidence, and any open owner decision.
A remote-less repository can finish with a local check. Forge protection,
secrets, hosting, and publication require their own authority when needed;
prepare a concrete next action without turning them into setup busywork.

## Handoff

Consumes: the repository as found and its settled decisions
Produces: the recommended combination and the owner's open choices, in the reply and the change record's start section; through the change, the toolchain, check, ignore and README baseline, a rationale row and an explicit greenline-roots root statement in .greenline/DECISIONS.md
Next: frame, under the mode the owner approves
