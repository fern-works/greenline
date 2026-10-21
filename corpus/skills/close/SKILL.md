---
name: "close"
description: "Close a change: record the durable decisions it surfaced as ADRs in the repository's decision home, write down the terms it settled, audit the record's claims against the change's commits and checks, set the record's state, \"next\" line and cost, and offer the landing of the change's branch, at the depth the change's mode gives the close step. Use when the mode reaches close or the work stops, when the owner asks to record a decision or to write a term down, and when a change chooses among meaningful alternatives, abandons an approach over a discovered constraint or supersedes an earlier decision."
---

# Close

Close ends a change: it records the durable decisions the work surfaced, writes down the terms it settled, audits the record against what happened, sets the record's state, its "next" line and its cost, and offers the landing of the change's branch. It runs where the change's mode reaches the close step, at the depth the mode gives it, and when the work stops before it is done. Loaded mid-work by one of the situations its description names, or asked for by name to record a decision or to write a term down, it does that part alone; with no change open, a write into the knowledge homes (the decisions book, the ADR home, the glossary) opens a quick record first. It reads the whole change record first, with the change's commits and checks. It never reopens the decision it records, and it changes no code: the audit corrects the record, and a gap it finds in the work itself goes to the owner.

Capture why a decision made sense with the constraints and evidence available at the time. Keep the record useful after those constraints change.

## Closing the record

Close the change in this order:

1. Distil what the change's working files hold worth keeping into the record's sections.
2. Evaluate the change for durable decisions, and write each ADR it calls for ("Evaluate the change" and "Write the ADR", below).
3. Write down the terms the change settled ("The terms", below).
4. Once the decisions and the terms are written, record again each check whose code they moved: an ADR or a glossary entry outside the workspace's own folder moves the code a check last ran on, and the change's status names each such check. No write outside that folder follows that run but the landing's merge, whose checks run on the merged result.
5. Audit the record against what happened ("The audit", below).
6. Offer the landing in one line, by the setup: push the branch and open a pull request where the remote is a forge, merge it into its base branch locally where no remote is a forge, or leave the branch. Each push, pull request and merge is done only on the owner's word. A repository rule against that offer, such as a contribution guide's rule against merging one's own branch, is named beside the offer, never in its place, and the owner's answer decides. Before a local merge, name the base branch: the default branch where the change's branch was made from it at its proposal, and otherwise the one the owner names when asked. Confirm before merging: merging into the wrong base is expensive to undo. Make the merge with its commit, its message carrying the change's trailer, never staged alone with `--no-commit`, then record the change's checks on the merged result, so their facts name the merge they checked; on a red result, stop the landing and tell the owner, leaving the merge, local and recoverable, for the owner to keep or undo. A rejected push is reported, never forced. Where the commits already sit on the base branch and no remote is a forge, there is nothing to land: offer nothing, and the close section says "nothing to land: the commits are on <branch>". A ticket's close offers none: the planning change's close offers the landing for the whole plan, its tickets' commits included.
7. Write the close section, with what the landing did and a link to each brief the change's status lists, taken from that listing and never by opening one, and set the record's state, its "next" line and its cost, as close's references page says. The state is done only when the latest run of every check of the change is green: run a red check again on the final code once its cause is fixed, and while one stays red, the merged result's included, the change stays open, the "next" line names that check, and the owner hears why. A probe never enters the checks: verify's "Checks and probes" tells the two apart.
8. Remove the working files at every close, as close's references page says, once the state is done or dropped; the removal refuses while a record links to a file in them.

When the work stops before it is done, close stops the change as close's references page says, keeps the working files, and leaves the rest to the close that finishes the change. A wait for the owner within the session is no stop.

## Evaluate the change

1. At close, review the conversation, the change record (its build section's deviations and the approaches it tried and dropped), the change's checks, and the diff of the change's commits, found by the change's trailer, for durable decisions.
2. Write an ADR when the work:
   - chose among meaningful alternatives;
   - abandoned a preferred design because evidence exposed a constraint;
   - established a convention, dependency, interface, data model, deployment pattern, or operational policy;
   - accepted a trade-off that a future maintainer may otherwise undo without understanding it; or
   - changes a decision documented by an existing ADR.
3. Skip an ADR for routine maintenance, implementation details, straightforward bug fixes, and choices already dictated by an accepted ADR. A deferral is not a decision: a choice put off is a line inside the decision it defers from, never an ADR or a decisions-book entry of its own. A shaping ruling that scoped the work belongs in the change record's frame section, or the plan directory's decisions file when the work splits, not in an ADR; an ADR holds the durable technical reasoning the work itself surfaced, such as a constraint discovered or an approach abandoned.
4. If no ADR is needed, state that explicitly in the close section.

## Write the ADR

1. Find the repository's existing decision home: a decisions document, or an ADR directory of its own. When one exists, write there in that home's format. Only when the repository keeps no decisions anywhere, seed `docs/adr/` on first use from this skill's `adr/README.md` and `adr/template.md`, then read `docs/adr/README.md` and `docs/adr/template.md` completely. If what the repository shows of its decision home conflicts, two homes or two naming schemes, surface the conflict to the owner rather than silently introducing another scheme.
2. In `docs/adr/`, create `docs/adr/YYYY-MM-DD-short-title.md`; in another home, add the entry in that home's own form. Use a specific, durable title and avoid sequential numbers that conflict across concurrent branches.
3. Preserve the facts from the work:
   - the need or problem;
   - the constraints encountered;
   - concrete evidence such as failed approaches, validation results, limits, or links;
   - the chosen approach and meaningful rejected alternatives;
   - positive and negative consequences; and
   - conditions under which the decision should be reconsidered.
4. Keep the ADR terse and scannable:
   - Default to one or two concise bullets under each template heading.
   - Use paragraphs only when bullets would obscure necessary reasoning.
   - Combine closely related alternatives and consequences instead of cataloging every detail.
   - Preserve the decision, evidence, trade-off, and reconsideration trigger without narrating the implementation.
5. Include the ADR in the change's commits whenever possible, and link a lasting choice from the decisions book rather than copying it there.

A decision that spans modules is recorded where a developer must stand to extend it: the ADR lives at, or is pointed at from, the extension point, and it carries an explicit checklist of the other places that must change in step, because that is the moment the reader is already committed to the change (Ousterhout, 2021). The ADR is still a dated file in the decision home; what stands at the extension point is the record's pointer and the in-step checklist the extending reader must act on. Duplicating the explanation into every dependent site drifts apart, and parking it in one dependent site hides it; where no obvious central location exists, the decision home is the fallback and the extension point gains the pointer.

## Preserve history

- Do not rewrite a landed ADR to make the old decision appear current.
- Add a new ADR when a decision changes, and link the earlier record under `Supersedes`.
- Do not add approval or status metadata. Landing with the reviewed change records acceptance; an unmerged ADR remains a proposal in its branch.

## The terms

Write down each term the change settled, the frame section's terms and any the work sharpened since, in `GLOSSARY.md` or the repository's existing glossary in its own format, when the change's scope covers that file; otherwise offer the entry in one line and write it on the owner's word. Asked for by name mid-work, write the term down right there, by the same rule.

Create files lazily: only when you have something to write. An existing glossary or vocabulary document is the home for terms, whatever its name; if the repository has none, create `GLOSSARY.md` when the first term is resolved, in the form [references/GLOSSARY-FORMAT.md](references/GLOSSARY-FORMAT.md) gives, which also says where each glossary lives in a repository of several contexts.

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer an ADR for a term change when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. When all three hold, record it as an ADR by the steps above.

## The audit

Before the change is called done, check that its record tells the truth. Read the change's commits, found by their trailer, its recorded checks and the files it changed, which the change's status lists, and walk every claim the record makes of what was done or checked against them:

- Every claim maps to an action that happened: a commit of the change, or a check that ran.
- Each claim's evidence resolves and shows what the claim says.
- A pivot, a deviation or an abandoned approach that shaped the work and is not in the record is a gap: add it to the build section.
- Count the commits and checks as they stand at the close's end: a number the close section states is read from the change's status when the section is written, after the landing, with the commit that carries the section counted; a statement of what holds of every commit, such as each carrying the trailer, needs no number.
- The change's status counts the commits since the last recorded check: above zero, they may hold code no recorded check saw, so record the change's checks again on the final code before it is done, and a result the record cites from a plain run is named in the close section as not recorded.
- Every code commit of the change is among those its status lists. One made before the record entered the repository, in a repository's first change, is counted for no change: name it in the close section by its short hash, and leave it as it is.

Correct the record, not the story: a claim nothing backs is rewritten to say what happened, and a check the record claims that no run backs is named in the close section as not run. The audit reads the change's commits, checks and files, never a harness transcript, and no other agent runs for it.

## Handoff

Consumes: the change record .greenline/ledger/<id>.md with its sections, the change's commits found by their trailer, its checks under .greenline/ledger/<id>/checks/, its working files under .greenline/tmp/<id>/, and the repository's decision home and glossary
Produces: the close section of .greenline/ledger/<id>.md and its front matter's state, "next" line and cost; each ADR in the decision home, linked from the decisions book .greenline/DECISIONS.md, docs/adr/YYYY-MM-DD-short-title.md only when the repository keeps no decisions elsewhere and docs/adr/ is seeded from this skill's adr/ pages; each term in GLOSSARY.md or the repository's glossary; the landing offered, and done only on the owner's word; the working files removed by greenline tidy
Next: none when the change is done; when the work stops, the record's "next" line, naming the step reached and the action that resumes it
