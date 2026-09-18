# The register, and the catalog beside it

Two instruments, and merging them loses the difference. The REGISTER
is fourteen symptoms of excess complexity, stated about interfaces,
decomposition, names, and comments, diagnosed by reading (Ousterhout
2e, 2021). The CATALOG is seven misused mechanisms, stated about
constructs, diagnosed close to a grep (Matthews, 2024). Run the
catalog first because it is cheap, then the register, which needs a
whole file in view. They overlap once: redundant indirection and
shallow module both hunt a layer that buys nothing.

Every sighting is a prompt to search for a design that removes the
flag, and giving up when the first fails is the named failure. Roughly
half the flags ship with a counter-case that narrows them, and the
counter-case is part of the flag.

## The fourteen

**Depth (1).** SHALLOW MODULE: an interface no simpler to think about
than the implementation behind it, so learning it costs what knowing
the internals would; small modules tend to be shallow. Flag 13
supplies the test: if the interface comment must recite the
implementation's major features, the module is shallow. Counter-case:
some shallow classes are unavoidable and still useful, a list type
among them; they simply buy no leverage.

**Leakage (2, 3).** INFORMATION LEAKAGE: one design decision reflected
in several modules, so changing it changes all of them. A fact in an
interface is leaked by definition; the worse form is back-door
leakage, where two modules know the same thing without either exposing
it, invisible and therefore more pernicious. TEMPORAL DECOMPOSITION:
structure mirroring the order operations happen rather than what each
module hides, the leading cause of the first, and easy to fall into
because execution order is what is on your mind while coding. On
seeing one fact in two places, ask how to reorganize so only one
module is affected: merge them, or extract a class holding just that
knowledge, watching the trap where the extracted interface exposes it
anyway. Counter-case: where the stages genuinely use disjoint
information, the time-ordered structure coincides with information
hiding.

**Defaults (4).** OVEREXPOSURE: an API forcing callers to learn rarely
used features in order to reach the common ones. A default is partial
information hiding, since only the caller who overrides it learns the
item exists, so a value the module can derive from what it holds is
defaulted rather than demanded from a caller who probably does not
know the answer.

**Forwarding (5).** PASS-THROUGH METHOD: a method that does little but
invoke another with a similar signature, making its class shallower
and creating a signature dependency. It signals confusion over which
class owns what, which is the reviewer's question. Three remedies, and
naming one lifts the finding above a complaint: expose the lower class
to the higher class's callers, redistribute so neither calls the
other, or merge them. Counter-case: identical signatures are not the
defect. A dispatcher earns its callees' signature by deciding who
handles each task, and implementations behind one interface duplicate
signatures and REDUCE load; such siblings sit in one layer and do not
invoke each other, unlike a cross-layer pass-through.

**Repetition (6).** A nontrivial piece of code recurring over and
over, read as a sign the right abstraction has not been found. Two
remedies, and reviewers forget the second: factor the snippet into a
method, or restructure so it only needs to run in one place.
Extraction works best when the snippet is long and the new signature
simple; at one or two lines there may be no benefit, and a snippet
entangled with its environment yields a by-reference argument list
that destroys the value. Ousterhout adds a narrow rehabilitation of
`goto` here, and it is scoped or it reads as an error: it covers
escaping nested code to one shared cleanup block at the end of a
method and nothing else.

**Splitting (7, 8).** SPECIAL-GENERAL MIXTURE: a module providing a
general-purpose mechanism provides that one mechanism, with no code
specializing it for a particular use, since the specialization leaks
and later changes to the use case then force changes to the mechanism;
relocate it to the module that wants it. CONJOINED METHODS: two pieces
of code physically separated where each can only be understood by
reading the other, and the tell is behavioral: a split that leaves you
flipping between the halves was a bad split. Counter-case, which is
the register's own anti-reflex line: length alone is rarely a good
reason to split, methods of hundreds of lines are fine when the
signature is simple and they read easily, because such methods are
DEEP, and where the blocks interact it is MORE important to keep them
together.

**Documentation (9, 10).** COMMENT REPEATS CODE, and the stranger test
runs it mechanically: could someone who had never seen this code have
written this comment purely from the code beside it? If yes, rewrite
or delete. The named failure is recycling the entity's own name into
its comment, padded from argument names and types, which hides the
real gap: units, which side a value applies to, what a domain term
means. The remedy is choosing words absent from the name.
IMPLEMENTATION DOCUMENTATION CONTAMINATES INTERFACE: an interface
comment describing detail users do not need. Cross-link and
counter-case both: a comment that cannot avoid the implementation
means the method is shallow (flag 1).

**Naming (11, 12).** VAGUE NAME: too generic to say what it refers to,
which fails to inform and invites misuse. Sight-list: a count that
never says count of what; a coordinate-style letter for a character
position readers will take for pixels; a boolean pairing a vague noun
with a vague state word so neither value means anything. Three
counter-cases: short loop variables are fine while the whole range of
use is visible at once, a name can be too SPECIFIC, and result is
reasonable in a method that returns one. HARD TO PICK NAME turns a
naming problem into a design finding: difficulty finding a name that
is precise, intuitive, and short is evidence the entity has no clean
definition, often one variable representing several things, so
reconsider the factoring instead.

**The two that need a human (13, 14).** HARD TO DESCRIBE is the one
PROCEDURE in the register rather than a symptom you recognize: write
the complete interface comment first, then judge the abstraction by
how long and how complicated the comment had to be, since a simple
interface can be documented completely and briefly. Writing it early
tunes the abstraction before the implementation exists; an incomplete
comment measures nothing. NONOBVIOUS CODE, meaning or behavior that
cannot be grasped in a quick reading, has no textual test at all; its
instrument is another reader, which is what this venue is for.

## The seven

- **The escape hatch.** Reaching for the language's unsafety escape
  where a safe abstraction exists, called "the mother of all
  antipatterns" (Matthews, 2024). Four legitimate uses: foreign
  interfaces, system calls with no safe wrapper, building a safe
  abstraction over an unsafe one, and optimizations inexpressible
  safely.
- **The discarded failure.** A call throwing failure information away
  instead of carrying or handling it, signaling that error handling
  and the possibility of failure were never thought through. Often a
  smell rather than a rule breach.
- **The speculative structure.** Reaching past the default container
  for an exotic one on speculative performance grounds. Benchmark
  before the reach; the exotic structure does sometimes win wide.
- **Working around the checker.** A copy taken to get past the
  compiler rather than for a reason. The signal is the intent, not the
  operation.
- **The implicit relationship.** An implicit conversion making one
  type behave like another, approximating inheritance the language
  lacks. The objection is the silence: the explicit form states the
  relationship the implicit one leaves readers to guess.
- **The global.** Globals and singletons, for coupling, testability,
  and reasoning cost; pass the data or inject it. Counter-case: a
  library may expose an initializer and leave management to its
  consumer.
- **The redundant indirection.** Two indirections nested where both
  already allocate. Each layer earns its own keep, and the reviewer
  counts what each buys.
