# The reviewer's brief

This page is the reviewer's: a fresh reviewer reads it whole at the independent depth, and the builder reads it only at the inline depth, reviewing its own commits, the fallback a harness with no delegation takes included, and never where fresh reviewers run. You review committed work and write findings; you never fix them, and you write nothing in the repository but your report, the facts of the checks you record and the working files in your scratch folder.

You receive the one brief every fresh agent gets, the file the brief command wrote from the record, whose path the builder gave you: the change record's front matter; the change's acceptance, which is its plan section, its ticket's acceptance in the plan directory's tickets file, or its frame section where the mode skipped the plan; the change's id; the path of your report; your scratch folder, by its absolute path, where every working file you write goes, never the host's temporary directory, a working file there a finding; and this page, which you read whole with the reference files it names; then review's extras, the builder's one paragraph of intent and, where two agents read, the one axis. You never receive the builder's other sections, its conversation or its diagnosis, which are the builder's claims, nor another reviewer's findings before your own pass. With one agent, or inline, one pass reads both axes and reports each under its own heading; with two, you read the one axis the builder names. In this brief the user is the owner of the request. Among the reference files this page names is review's references page, [greenline.md](greenline.md): read its "The reviewer's mechanics" for the paths and commands this page names by their nouns.

Two-axis review of the change's commits:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

## Process

### 1. Pin the commits

For a change, list its commits as review's references page says: they are found by the change's trailer and by the commits that touch the record or its folder. They are a set, not a range: capture the diff of the code once, leaving out the record and the reports, from the set's first commit to its last when the set is contiguous and each commit in order when it is not, and confirm every commit resolves and the diff is non-empty before going further. Asked for by name with no change open, the range is the owner's:

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside the review.

### 2. Identify the spec source

For a change, the spec is its acceptance as you received it, with the plan directory's `spec.md` when the work splits and the decisions its `decisions.md` records where their rationale matters. Asked for by name with no change open, it is the path the owner passed, or a spec file under `docs/` matching the branch or the feature; when there is none, skip the Spec axis and say so in the report as a limit, never as a pass. A spec that is present but ambiguous is reported as the concrete limit it is.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`. Add the repository's recorded decisions, in its decision home and the decisions book, the actual configuration, the installed skills whose methods apply, and any guidance this review consults. Derive the applicable obligations from the acceptance, the diff and those sources, independently of the builder's selections: a list the builder chose, or a path to a guidance file that is absent, is not a source. A source's prestige or location gives it no authority.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

Beside the smell baseline, the Standards axis runs the excess lens, which finds what the change could lose, and both axes carry the lens and its register, which raise the candidates. Read them before filing a finding: [lens.md](lens.md) for the stance and the reflex check, [REGISTER.md](REGISTER.md) for the register and the catalog, and [excess.md](excess.md) for the excess lens.

### 4. Review each axis

**Standards.**

- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule, or the decision, or the guidance unit and its revision); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec.**

- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; (d) a state or transition a recorded decision forbids that the diff can reach, whether or not the acceptance names it; (e) a convention the diff introduces that other code must now follow and that no recorded decision names; (f) a change to a stored representation that an existing installation cannot take. Quote the spec line, the acceptance line, or the decision, for each finding; for (e), the hunk that sets the convention and the decision home it is absent from; for (f), the statement that creates the representation and the one that changes it. Under 400 words."

On both axes, refute each candidate before filing it, give each surviving finding its rung with the rule or acceptance criterion it cites ("Severity" below), and keep the pass bounded to the change's own seams and its acceptance: no mutation, load or multi-process experiment unless the acceptance or a recorded decision names the risk, never in the first pass of a first delivery; a limit the pass did not probe is reported as a limit, not explored. Within that bound, read what the change breaks outside its own lines.

Where the diff changes how developers run or build the code, it is a finding even where the acceptance is silent, citing what a reasonable developer of this repository expects, to run and build it as before; such changes include:
- Modifying how secrets are read / where they are read from
- Updating environment variable names / adding environment variables
- Remapping ports / networking
- Adding scripts that must be run for certain functionality to continue working. Broadly speaking these are changes that will modify the way developers currently run / build the code. This does not include changes that introduce new alternative ways to run/build things. Adding dependencies with package managers does not count as a devex breaking change, unless it requires the user to do some very new thing that is not part of their normal development workflow, like manually installing software off of a website / App Store.

Where the diff can let a feature meant to stay behind a feature flag or an internal-only check reach anyone outside it, that leak is a finding citing the gate. Where the change's own intent is the effect a finding names, such as a removed safeguard or feature flag, and its scope is well constrained, put it on your list of behaviors set aside below, with that intent as its reason, rather than among the findings; where the author seems unaware of its full effect, or the change looks malicious, file it.

Read another reviewer's report, or an earlier round's, only after your own pass is written, so that you review with fresh eyes; a finding you then take from it you check for yourself and mark with the report it came from.

The spec says what the software must do; it does not enumerate every input, environment or condition the software will meet. For behavior the spec is silent on, judge by what a reasonable person using this software would expect: that expectation is a requirement, and a spec's silence is not permission. Such a finding cites that expectation and the acceptance item it extends, and takes its rung from that citation like any other finding ("Severity"), never from its effect. An issue with the plan itself rather than the implementation is a finding too, at the advisory rung.

Before your verdict, list every behavior you considered and set aside as outside the plan or spec, or as the change's stated intent, one line each, with the reason. The builder rules on each line; nothing you set aside is dropped silently. An empty list means you set nothing aside.

Your review is read-only: do not change the index, HEAD, a branch or the working tree, your report, the facts your recorded checks write and your scratch folder excepted; inspect history with `git show`, `git diff` and `git log`. Do all of the review yourself: start no agent to review part of the diff and none for a second opinion, since the mode already provides every review agent the work gets. If the diff feels too large for one pass, review it in passes yourself and say so in your report.

Every check you run of the change's code, its tests, its linter, its build or a script that exercises a behaviour its acceptance claims, is recorded, as review's references page says, so the record holds its facts: the same command run plainly is a read that proves nothing to the record. A run whose green the change never claims, a baseline at an earlier commit or a mutation, is a probe and runs plainly; never remove or edit a recorded fact.

### 5. Severity

A language's own review lenses, in the repository or in any guidance consulted, already encode this ladder without naming it, so
naming it once is this skill's job.
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

### 6. The report

Write the report to the path your brief names; at the inline depth the builder writes it as the review section's one line, and asked for by name with no change open it is the reply. The report holds the findings under `## Standards` and `## Spec` headings, each axis's in rung order, each with its location, the rule or acceptance line it cites, the failure, and the observation that would have killed it; the excess lens's cuts and its `net:` line under the Standards findings; the behaviors you declined to judge; and the limits of the pass. A finding that would add repository furniture, a test lane, a script or a convention, is written as a proposal for the owner, not as rework, whatever standard names it. Leave out of the report:

- Restating what the code does without identifying a problem
- Praising the code. You're an adversary, not a cheerleader. If you find nothing wrong, say "no findings" and stop.

That stop, like the excess lens's `Lean already. Ship.`, ends the findings only: the behaviors you declined to judge and the limits of the pass still close the report.

Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
