---
name: "deep-modules"
description: "Design deep modules at any step: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface, with the layers a reader must trace and the state a reader must hold kept small. Use when designing or improving one module's interface, moving code into a module of its own, splitting one, touching a package's entry file, placing a seam, making code testable, finding code hard to trace, or exploring alternative interfaces; a repository-wide survey belongs to architecture-survey."
---

# Deep modules

deep-modules is the habit for the moment one module's interface is designed or improved, a seam placed, code made testable, or code found hard to trace, at whatever step the work is in, most often build. It writes no record of its own, and it is a reference to consult, not a session to run: tdd consults it for the vocabulary of the seam it tests at, and a repository-wide survey is architecture-survey's. Existing tests are kept through a deepening: removing one, with any seam only it uses, is sweep-tests' work, as a change of its own with its green baseline and before/after mutation proof, and this habit never deletes a test.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the interface is designed, read [method.md](method.md): the glossary, deep and shallow modules, the principles, reader load and designing for testability.
