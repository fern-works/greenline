---
name: "invariants"
description: "List every invariant the app relies on but does not enforce: each with where it is relied on and the door that would hold it. Use for \"find every invariant my app relies on but doesn't explicitly enforce\", for what a part of the code relies on or assumes, or beside a floor on a public contract or a security boundary."
---

# Invariants

invariants is the start for these words of the owner's, or a request that means them:

find every invariant my app relies on but doesn't explicitly enforce

An invariant is a fact the code needs to stay true and assumes rather than checks: an amount never negative, a record written once, a caller always signed in. The start lists each one in three parts, the invariant, where the code relies on it and the door that would hold it, and marks each entry that sits on a public contract or a security boundary, since each of those is a floor the proposal names. It changes no code; each door is a change of its own.

Greenline's paths for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the list is written.

Before the first file is read, read [method.md](method.md): where invariants hide, the three parts, the doors and the boundary.

## Handoff

Consumes: the request, and the code it names or the whole application
Produces: the three-part list, its entries on a public contract or a security boundary marked, in the reply and in the change's folder
Next: frame, whose proposal names each marked entry as a floor; each door offered as a change of its own
