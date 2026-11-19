---
name: "constraint-driven-development"
description: "Writes the repository's quality bar down as a contract in its decision home, a command behind every number, and guards it against an agent quietly lowering it: a new suppression, a skipped or deleted test, a stripped assertion, an unimplemented stub, a threshold edited down. Use when no quality bar is written down, when the owner says \"set up constraints\", \"define our standards\" or sets a rule to hold from now on, or when an agent keeps silencing checks or skipping tests to reach green."
---

# Constraint-Driven Development

constraint-driven-development is a trial start for a repository whose quality bar is not written down, or whose checks were loosened to reach green. Install only what the owner picked: an option is not an obligation to install a dependency, as groundwork says, and a default the owner takes with "I don't know" is no pick: what it would install is proposed with its cost and installed only on the owner's yes.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the first question, read [method.md](method.md): the change it runs as, loading the constraints, and the six steps from detection to the ratchets, with the escalation path.

## Handoff

Consumes: the repository, its stack, its checks and its CI; the owner's answers to the four questions; the decision home
Produces: through the change, the bar in the decision home's `## Constraints` section, a command behind every number, the measured values a ratchet holds, and the floor guard as one of the repository's checks
Next: frame, under the mode the owner approves
