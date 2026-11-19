# Invariants: the method

## Where they hide

- A value the code reads without checking: an id assumed present, a list assumed not empty, an amount assumed positive.
- A uniqueness the data needs and no constraint holds: one active subscription per account, one fee per day.
- An order the code assumes between writes, or a group of writes assumed to land together.
- A caller assumed allowed because the route that reaches the code checked once, somewhere else.
- Units, time zones, currencies and precision assumed the same across modules.
- A shape assumed of outside data: a webhook's body, a file, a setting.

Read for the places where the code would go wrong in silence if the fact failed: a division, an index, a sum, a write with no condition, a branch with no else.

## The three parts

Each entry has three parts:

1. **The invariant**, one sentence that is true or false of the data or the calls.
2. **Where the code relies on it**: each place, by file and function, since two places that rely on it differently are a finding of their own.
3. **The door that would hold it**: the cheapest one that holds it where it can first fail, a type that cannot hold the bad value, an assertion at the boundary, a check that refuses, a schema or a constraint in the store, or a test that fails when it breaks.

Then mark its boundary: `public contract` where callers outside the module rely on it, such as an interface, a file format, a command's output or a published package; `security` where it guards who may read or write; `none` otherwise.

## The list

The list is one table, the invariant, where it is relied on, the door and the boundary, its entries on a public contract or a security boundary first. Each marked entry is a floor, named in the proposal by its entry. Offer each door as a change of its own: a test that fails first, then the door that turns it green.
