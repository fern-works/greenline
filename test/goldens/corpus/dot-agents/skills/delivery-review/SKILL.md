---
name: "delivery-review"
description: "Review an explicit committed range for implemented work or a ticket already in reviewing, along two axes: Standards (the repo's documented standards and installed guideline skills) and Spec (does the code match what the spec asked?). Use for 'review the branch', 'review since X', or a PR."
---

This skill reviews committed work: a ticket at implemented with its recorded range and pinned implementation account, or a range the user names for a read-only report. It fires on "review the branch", "review since X", a PR, and the handoff from implement. Finding discipline and severity come from review-lens, which both child reviews are briefed to read; a pass for over-engineering is ponytail-review's; the proof of acceptance is verify-this's. This skill never implements the fixes it finds, never reviews uncommitted work, and never extends a recorded range to a later HEAD.

Two-axis review of a committed range: the ticket's recorded `base_commit..result_commit`, or, for a read-only request, the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings. Each sub-agent starts fresh with only its brief: on Codex, spawn it without the parent's turns (never `fork_turns: all`); a fork of the implementer's conversation is not an independent context.

## Process

### 1. Pin the fixed point

For a ticket, the fixed point is its recorded range: `base_commit` and `result_commit` from the ticket at implemented, both resolved to exact commits. For a read-only request without a ticket, whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Taking a ticket for a durable review is a separate contribution in an independent context, one that inherits none of the implementer's conversation (a spawned agent started fresh, never a fork of the implementer's turns): read `.greenline/WORK.md` and `.greenline/ledger/README.md`, write the draft `.greenline/work/reviews/REV-NNN.md` naming the ticket, its `implementation_account` and this `range`, open the review-role account whose `reviews` pins the implementation account bytes examined at their accounting commit, then advance the ticket to reviewing. A read-only request produces the report without repository edits.

Capture the diff command once: `git diff <base-commit> <result-commit>` for a recorded range, or `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base) for a user-supplied fixed point. Also note the list of commits via `git log <base-commit>..<result-commit> --oneline`. A later HEAD does not extend a recorded range, and the merge-base does not replace the recorded base.

Before going further, confirm both ends resolve (`git rev-parse <base-commit>`, `git rev-parse <result-commit>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

The originating spec is the one the ticket's `consumes` pins: read the ticket and its consumed spec at that revision where one exists, and the consumed decisions when their rationale matters. For a compact ticket with no separate spec, its intent, scope and acceptance are the fidelity contract for the Spec axis. For a read-only request without a ticket, the spec is the path the user passed as an argument.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`, together with the scoped repository decisions in `.greenline/DECISIONS.md` and the initiative's `decisions.md`, the actual configuration, the installed guideline skills whose methods apply, and, when guidance is configured, the language and shared guidance retrieved under this review's own request handle by the request loop in AGENTS.md. Derive the applicable obligations from the task, the diff and those sources, independently of the implementer's selections; an implementer's selected list, or a repository path to an absent guidance file, is not a source. A source's prestige or location gives it no authority.

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

Beside the smell baseline, both axes carry review-lens and its REGISTER.md: the stance, the reflex check, the catalog and register that raise candidates, and the severity rungs that place what survives.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full diff command and commit list, with the exact ticket and range identities.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it), the scoped decisions, and the retrieval access it needs for its own guidance reads under this review's request handle (`greenline guidance read <ids> --read-only --from-request <handle> --role review`, so each read leaves its advisory stub under the dispatching request).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule, or the decision, or the guidance unit and its revision); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list, with the exact ticket and range identities.
- The ticket's intent, scope and acceptance, and the path or fetched contents of the consumed spec at its pinned revision.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; (d) a state or transition a recorded decision forbids that the diff can reach, whether or not the ticket's acceptance names it; (e) a convention the diff introduces that other code must now follow and that no recorded decision names; (f) a change to a stored representation that an existing installation cannot take. Quote the spec line, the ticket's acceptance line, or the decision, for each finding; for (e), the hunk that sets the convention and the decision home it is absent from; for (f), the statement that creates the representation and the one that changes it. Under 400 words."

Both briefs also say: read review-lens and its REGISTER.md, refute each candidate before filing it, give each surviving finding its severity rung with the rule or acceptance criterion it cites, and keep the pass bounded to the change's own seams and its acceptance: no mutation, load or multi-process experiment unless the ticket or a recorded decision names the risk, never in the first pass of a first delivery; a limit the pass did not probe is reported as a limit, not explored. Each reviewer returns its own ranked findings.

A ticket always supplies the Spec contract, so the spec is missing only on a read-only request with no path; then skip the Spec sub-agent and note this in the final report as a limit, never as a pass. A contract that is present but ambiguous is reported as the concrete limit it is, with the missing intent obtained from the ticket's owner.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned, below the frontmatter of `.greenline/work/reviews/REV-NNN.md` for a durable review, or in the reply for a read-only request. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_); the reviewers' severity rungs stand, and the aggregator adds none.

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

For a durable review, the record is the account of what it saw. A standards finding cites the applicable decision, the exact guidance unit and revision, or the repository rule. A finding that needs a code change returns the ticket to implementing and its request holder; this review does not implement the fix in the review context. A finding that would add repository furniture, a test lane, a script, a convention, is written as a proposal for the owner, not as rework, whatever standard names it. A correction receives a new result, and a second review of it waits for the owner's word. A future-ticket issue can be linked as a bounded trap note with its triggering condition. A clean, supported review sets the review account's `resultCommit` to the implementation commit at the end of `range`, completes the REV artifact, and moves the ticket to verifying, where verify-this proves its acceptance. A missing prior implementation account is an explicit `reviewLimit`, never invented evidence. Respect read-only scope and any other stop boundary, and return the findings or the supported result to the same request holder so the authorized work continues.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

## Handoff

Consumes: the ticket at implemented, its consumed spec (pinned revision), base_commit..result_commit, the pinned implementation account
Produces: .greenline/work/reviews/REV-NNN.md naming ticket, implementation_account and range; a review-role account; status reviewing then verifying on a clean review, or implementing when findings return the ticket
Next: verify-this proves the acceptance at verifying
