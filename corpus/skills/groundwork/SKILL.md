---
name: "groundwork"
description: "Establish the missing engineering baseline for a repository's purpose and prove first green. Use when the owner says \"set this repo up properly\", asks for a working baseline or a first green, or starts a project from scratch; preserve established components and avoid unnecessary infrastructure."
source: "greenline native setup workflow; the work guide and the ledger guide own its integration."
---

# Groundwork

Groundwork is the start for a setup request: set this repository up properly,
or bring it to a working baseline. Read the existing repository and settled
decisions first, and establish the purpose and the choices before any edit.
Then hand the work to a mode: propose it and wait, as AGENTS.md says, open the
change record with a `## start` section naming groundwork and the combination
it recommends, and run the line from `frame`. The setup request authorizes ordinary
reversible work in its scope; clarify only consequential choices the request
and evidence leave open. Outside a Git repository,
offer `git init` in one line and end the turn: nothing is initialized or
installed before the owner's yes.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the first edit, read [method.md](method.md): the empty tree's orientation, the configuration, the purpose and constraints, the missing baseline and the first green.

## Handoff

Consumes: the repository as found and its settled decisions
Produces: the recommended combination and the owner's open choices, in the reply and the change record's start section; through the change, the toolchain, check, ignore and README baseline, a rationale row and an explicit greenline-roots root statement in .greenline/DECISIONS.md
Next: frame, under the mode the owner approves
