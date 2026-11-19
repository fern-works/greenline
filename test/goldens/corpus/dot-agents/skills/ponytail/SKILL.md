---
name: "ponytail"
description: "Minimalism at any step: before writing code the request leaves open, climb the lazy-senior ladder (does it need to exist, is it already in the repo, does the stdlib or platform cover it, can it be one line) and build only on a measured need; subtract before you add; keep call chains flat; migrate every caller and delete the old API in one wave; mark each deliberate shortcut with a ponytail: comment naming its ceiling. Use before writing code the request leaves open, when refactoring, tidying, cleaning up or simplifying, when a new internal API replaces an old one, and when asked what was deferred."
---

# Ponytail, lazy senior dev mode

ponytail is the habit for the moment code the request leaves open is about to be written, a refactor or a simplification of code that works begun, a new internal API introduced while old callers remain, or the owner asks what was deferred, at whatever step the work is in, most often build; a request to simplify, refactor or clean up working code loads it, and new code the request plainly asks for does not. It writes no record of its own: a shortcut it takes is marked in the code and named in the build section of the change record. Where the ladder says reuse or skip, the change's acceptance still decides the scope, and tdd still decides the tests: a smaller implementation satisfies them too.

Before writing code the request leaves open, read [method.md](method.md): the ladder and its rungs, the refactor's page at the first, subtracting before you add, keeping it flat, and the deferred debt; before simplifying, refactoring or cleaning up code that works, read [simplify.md](simplify.md) whole.
