# Close: the practice's mechanics

This page holds close at each mode's depth and where its work lands: the section, the record's state and cost, the commands the close and its audit run, the stops, the landing and the decisions. Read it with `SKILL.md` when the mode reaches close, and when AGENTS.md's index sends you here.

## The depths

- **Inline, at quick.** Close the record by `SKILL.md`'s steps, every one of them, the checks' last run and `greenline tidy` included. The change record's close section, in `.greenline/ledger/<id>.md`, is one line: each ADR written, by its path, and each term written down, or none, the landing done, and the audit's result.
- **Written, at regular and careful.** Close the record by `SKILL.md`'s steps. The close section holds the decisions recorded, each ADR by its path or the statement that none was needed, the terms written down, the landing offered and what was done, and the audit's result: each gap it found and how the record was corrected.

## The record's marks and the commands

Close reads the change's working files under `.greenline/tmp/<id>/`. The checks it records again, after the decisions and the terms, run through `greenline check`: a write outside `.greenline/` moves the code a check last ran on, and `greenline status --change <id>` names each such check (GL0451). After a local merge, the change's checks run on the merged result through `greenline check`. `greenline status --change <id>` lists the change's commits, found by their trailer `Greenline-Change: <id>`, its checks under `.greenline/ledger/<id>/checks/`, the files it changed and each brief as `greenline brief` wrote it, and counts the commits since the last recorded check; the audit and the close section read their numbers there.

The close sets the front matter: the state `done`, or `dropped` for a change the owner dropped; the "next" line `none`; and the cost, the agents and the rounds the change used, with `starts` naming each fresh agent started, such as `review 1`, a restart one more line, `review 1 restarted`, and one more agent. Set `done` only once `greenline status --change <id>` reports no cost below the starts the record names (GL0409). Set `done` only when the latest run of every check under `.greenline/ledger/<id>/checks/` is green, as `greenline status --change <id>` shows; `SKILL.md`'s step 7 says what a red one asks. Remove the working files with `greenline tidy --change <id>` at every close, the quick mode's inline close included: it removes `.greenline/tmp/<id>/` once the state is `done` or `dropped`, and refuses while a record links to a file in it. A lasting choice is linked from the decisions book, `.greenline/DECISIONS.md`.

The skeleton of the record for each mode, its front matter and its sections, is in the workspace's ledger guide, `.greenline/ledger/README.md`; close fills it and does not restate it.

## Stops

A wait for the owner within the session, at a proposal, a question or a review, is no stop: the record stays `open`. A stop is the session leaving the change unfinished, as it ends or as another change's request stops it: set the state `stopped`, rewrite the "next" line and commit the record and its folder, the check facts under it, and nothing else; working edits the owner asks to commit are a commit of their own, apart from the stop's. A request for another change stops the change this session holds first, its state `stopped` with its "next" line, and then gets its own proposal. A stopped change is set `open` before any edit of its record or its code: a session that resumes one, which `router` finds, does so as its first write and writes on in its record. The stop's commit carries the change's trailer, and the working files stay for the close that finishes the change, which `SKILL.md`'s closing order states.

## The landing

The landing is offered as `SKILL.md`'s closing order says, and the close section records what was done. Every close, the quick mode's included, writes its terms and decisions before the checks' last run, so no check is older than the code, and ends with `greenline tidy --change <id>`. The reply carries the outcomes, the meaningful choices and the real limits: a limit names what was not run, never an environment fact not checked, and a method is named only to offer it.

## Decisions

A repository's existing home for a kind of memory is that home; a default home AGENTS.md or `.greenline/WORK.md` names is created only where the repository has none. The repository's law file changes, and an existing decision is superseded, only on the owner's request; a new reversible entry in the decision home is yours to add. A product behavior the request left open (what a user would notice) and the frame does not ask is decided, recorded as reversible in the repository's decision home (the book only where the repository has none) and named in the reply in one line; a product's name, what ships first, a paid service or a consequential exception is asked.
