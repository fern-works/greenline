---
name: "review-lens"
description: "The reviewer's stance, register of design red flags, and severity ladder, above every language's own review lens. Use when reviewing code or a diff, when deciding whether an observation is a finding at all, when placing a finding's severity, when a reaction fired before the reasoning did, and when writing a repo's own review list."
---

# Review Lens

You are reviewing a diff, and your output is findings on it: the
stance decides what counts as one, two instruments raise the
candidates, and the severity pass places what survives. This is the
shared stance for reviews; language-specific obligations come from the
repository and any guidance consulted, as described below.

## The stance

An antipattern is a defeasible rule, not a law. Matthews calls the
word a weasel word for whatever the speaker dislikes and lands his
definition on "any pattern you don't like" (Matthews, 2024), while
granting that unsafe, inefficient, or unmaintainable practices really
are bad. So every register entry is a rule you must state a reason
for, and what counts as one moves as the language moves. The reader
arbitrates: code that seems simple to its author and complex to
someone else is complex (Ousterhout 2e, 2021), which makes a reader's
report of non-obviousness the one observation that needs no refuting.
Your advantage is not knowing more than the author, it is not carrying
the author's model, so "I had to read this twice" is evidence and "I
would have written this differently" is not. Where a clever
construction and a plain one both work, take the plain one. An audit
that files a finding for every file is reporting its own expectations.
Reporting nothing when every candidate died is a result; say how many
died and to what.

## Name the reflex, then check it

A reaction arriving before the reasoning is a reflex: a heuristic
learned inside one context, doing damage when it fires outside it.
Re-scope it rather than trust or discard it, in two load-bearing
steps. NAME the reflex, in the finding, as the thing that produced the
reaction. CHECK whether this code is the situation the reflex was
learned in. A survivor is a finding with its reasoning attached; the
rest are withdrawn before they cost an author an argument. The unnamed
reflex files a finding whose real content is "this does not look like
the code I expect". Ten recur (Kiehl, Manning MEAP 2026), each
re-scoped and none rejected:

- **DRY.** What is the duplication evidence OF? Hoisting the lines
  leaves the representation error under them in place.
- **Type tests.** A missing-polymorphism smell learned about objects
  asks a different question over data. Say which is under the cursor.
- **Coverage.** It says where tests are absent, never whether the
  present ones assert anything: stub a dependency, assert the stub.
- **"For each".** A plural in a requirement is a fact about the
  sentence. Ask what the abstraction would own before it exists.
- **"What if it changes?"** Audit which indirections HERE have paid;
  where the stakes are low, so little code that replacement is free
  is itself a defense.
- **Anemic.** A behavior-free class is an object defect where the
  thing is an object; judge data by whether it describes itself.
- **Boilerplate.** Weigh a proposed type against safety, correctness,
  and understandability, never against its cost alone.
- **Openness.** Discomfort with a closed type is a reflex to overcome;
  check whether the domain is closed.
- **Rewrite.** Current quality used to justify further descent
  collapses into an imagined rewrite; the counter is incremental.
- **Marker interfaces.** A freshly learned abstraction encoded as
  bespoke markers bills the ecosystem and the next reader both.

## The two instruments

Open `REGISTER.md` on any diff you are filing findings against: run
its seven catalog rows first, they are cheap, then its fourteen red
flags, which need a whole file in view. Both raise CANDIDATES, which
are not findings until they survive the severity pass.

## The shape of a review list

When you write a repo's own review list: topic-scoped, not
file-scoped, five to seven items to a box, each a default with its
exception, so every negation is a filable finding (Bodner, 2026 early
release). Items cluster where the compiler and the linter are silent.

## Severity

The language lenses already encode this ladder without naming it, so
naming it once is this skill's job; it is house ground, not a book's.
RUNG 0, PRECONDITION: what a formatter or a compiler settles is never
a finding, and reporting it spends the credibility the higher rungs
need. RUNG 1, after checking whether altered tests conceal the defect: an escape
from the type or lint system taken with no recorded reason. RUNG 2: a
rule match that survived its counter-case. RUNG 3, ADVISORY: a finding
that cannot cite the standard or acceptance criterion it enforces,
which is nearly every register flag, and which never blocks an author.
Report in that order and keep the rungs apart: a design observation
filed beside a real defect makes both easy to dismiss. The number is
citation strength, never size: a small finding quoting its rule sits
at rung 2, and rung 3 is only for what cites nothing.

Kill before you report. Most candidates describe a real shape and are
still not defects: the shape is deliberate, unreachable, standard, or
harmless, and each of those wants an artifact, not a verdict. Stated
intent kills most design candidates outright and convention kills most
of the rest; what survives is reported carrying the observation that
would have killed it. File the rung 3 survivors anyway, because review
is where a convention is taught as well as enforced.

## Where the lens stops

AGENTS.md owns authority. Derive obligations from the exact task,
diff and repository decisions, independently of the implementer's selections.
A finding names an applicable rule, concrete failure, effect and bounded remedy;
check its counter-case. Distinguish contract violations from advisory improvement.
Use repository instructions, actual configuration and these installed
methods, and any guidance consulted for escape hatches, test judgment and
counter-cases; no absent guidance unit is required reading. A review does not authorize a new toolchain decision.
The register
is silent on security and API compatibility, on performance except
that a speed claim made in a diff with no measurement beside it is a
finding, and on line counts, which is deliberate.

## Sources

Ousterhout, _A Philosophy of Software Design_ (2e), informs the register and
reader's verdict. Kiehl, _Data-Oriented Programming in Java_ (early access,
revisit on publication), informs the reflexes. Bodner, _Learning Go_ (3e early
release, revisit April 2027), informs the box; Matthews, _Idiomatic Rust_, the
catalog and stance. Graded research records are retained by the maintainer as
provenance; they are not missing installed support or required reading.
