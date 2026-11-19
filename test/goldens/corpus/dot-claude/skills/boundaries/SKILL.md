---
name: "boundaries"
description: "Concentrate validation, parsing and error handling at system boundaries (CLI, config, network, external APIs), trust internal types and keep business logic in pure functions; and let no failure become success-shaped output: no catch block returning a default, no fabricated data, a test that forces each changed integration to fail. Use when validating input or handling an error at a boundary, an API contract or an import is touched, when writing a catch block, a default value, a retry or a fallback, when a dependency fails during the work, and when a deadline or a demonstration makes a working-looking result tempting."
---

# Boundaries

boundaries is the habit for the moment input is validated or an error handled where data enters the system, a catch block, a default, a retry or a fallback is written, a dependency fails during the work, or a deadline or a demonstration makes a working-looking result tempting, at whatever step the work is in, most often build. It writes no record of its own: the negative-path tests it asks for are named in the step's section and the reply. A system boundary here is where outside data enters, a CLI, a config file, the network, an external API; between two modules of one program, deep-modules' word is seam.

Before input is validated or a failure handled, read [method.md](method.md): where validation stands, failing loud, what a catch block may do, fabrication and the failing dependency's test.
