---
name: "domain-and-types"
description: "Encode the domain in a structure instead of scattered conditionals, redesign around a new requirement instead of bolting it on, and let the type checker rule out impossible states: state machines, discriminated unions, branded primitives, parsing at the boundary, exhaustive matching. Use when writing stateful logic or a branch that grows by one more case, when a new requirement meets an existing design, when a schema file is touched, and when designing a type or a function signature in any typed language."
---

# Domain and types

domain-and-types is the habit for the moment stateful logic is written, a branch grows by one more case, a new requirement meets an existing design, or a type or a function signature is designed, at whatever step the work is in, most often build. It writes no record of its own. Where data enters from outside, boundaries says where it is parsed and validated.

Before the first type or branch is written, read [method.md](method.md): modelling the domain, redesigning from first principles, and the types.
