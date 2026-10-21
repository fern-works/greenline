---
name: "boundaries"
description: "Concentrate validation, parsing and error handling at system boundaries (CLI, config, network, external APIs), trust internal types and keep business logic in pure functions; and let no failure become success-shaped output: no catch block returning a default, no fabricated data, a test that forces each changed integration to fail. Use when validating input or handling an error at a boundary, when writing a catch block, a default value, a retry or a fallback, when a dependency fails during the work, and when a deadline or a demonstration makes a working-looking result tempting."
---

# Boundaries

boundaries is the habit for the moment input is validated or an error handled where data enters the system, a catch block, a default, a retry or a fallback is written, a dependency fails during the work, or a deadline or a demonstration makes a working-looking result tempting, at whatever step the work is in, most often build. It writes no record of its own: the negative-path tests it asks for are named in the step's section and the reply. A system boundary here is where outside data enters, a CLI, a config file, the network, an external API; between two modules of one program, deep-modules' word is seam.

Place validation, type narrowing, and error handling at system boundaries. Trust internal code unconditionally. Business logic lives in pure functions. The shell is thin and mechanical.

**Why:** Scattered validation is noisy, redundant, and gives a false sense of safety. Keep logic out of framework wiring so it can be tested without the framework.

**The pattern:**
- **At boundaries** (CLI args, config files, external APIs, network protocols): validate, return errors, handle defensively.
- **Inside the system:** typed data, error propagation, no re-validation. Trust the types.
- **Across the boundary.** Expose domain concepts, not the boundary's private representation. Keep general-purpose mechanism inside and special-purpose policy at the edge.

**Applications:**

Validation and error handling:
- Validate config at parse time (the boundary), not inside business logic
- Parse raw data into domain types at the boundary
- Do not re-export transport, storage, framework, or wire types through the public surface
- No redundant nil checks deep in call chains if the boundary already validated

Code organization:
- Business logic in pure functions with no framework dependencies
- Parse functions: pure transforms from raw bytes to typed state
- Prompt construction: structured state in, string out
- Scoring and assessment: pure transforms from state to results

**The tests:**
- "Is this data crossing a system boundary right now?" If not, validation is redundant.
- "Can this be a pure function that the shell just calls?" If yes, extract it.

## Fail loud

Software that hides a failure looks finished and is not.

**A failure may not become success-shaped output.** No catch block returns a
default in place of an error. No missing integration returns a plausible value.
No absent credential quietly downgrades to a local stub.

## What a catch block may do

A catch block does one of three things, and the code says which:

1. Rethrows, with context added.
2. Handles a named condition that the code states.
3. Reports the failure to the caller as a failure.

A catch block that returns a normal-looking value is none of the three.

## Fabrication

Data that did not come from the source may not appear as though it did. No
invented rows, no placeholder totals, no example values standing in for a call
that failed. When the source is unavailable, that is the result.

## Prove it with a failing dependency

Some fallbacks are correct. A cache miss falls back to origin. A missing
optional setting falls back to a documented default.

A list of them in your report proves nothing. A list is a claim, it rewards
confidence rather than completeness, and it assumes every fallback has one
obvious line, which is false for configuration, injected dependencies,
middleware and caches.

**For every production integration you changed, add a test that forces the
dependency to fail and asserts that no success-shaped output crosses the public
boundary.** Name that test in the closing report.

A negative-path test is checkable by someone who does not trust you. An
inventory is not.

## The demonstration case

Pressure to show something working is the moment this rule earns its place. A
demonstration built on a hidden fallback demonstrates the fallback. Say the
integration is down and show the part that works.

## It's working if

- A broken integration announces itself on the first run, not in production.
- The closing report names a negative-path test for each changed integration.
- A failed call produces an error, not an empty array.
- Mocks appear only under a test directory.
