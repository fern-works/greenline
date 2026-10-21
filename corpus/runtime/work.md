# Work in this workspace

AGENTS.md owns the request loop, the modes and the roster. This guide owns
where the work's files live and how long each one lives: the change record
and its folder, the plan directory, the working files, the decision home and
the glossary, and the two settings that shape the loop. The record's format
and the skeleton of each mode are in `.greenline/ledger/README.md`.

## Who a file serves

The files the work leaves serve four objectives: the repository's
maintenance, the memory of what a session did, the owner's audit, and the
next step's input. Every file the work leaves names its reader and its
lifetime. A file with no reader is not written, and a new kind of file,
whoever proposes it, names its reader, its lifetime and its shape, or is
not written.

- **The next agent**, which may be a fresh session: to resume the change, as
  the brief handed to a fresh agent, for the constraints already decided,
  for precedent in the same area, and for the proof a claim rests on.
- **The owner**, for bookkeeping: the trust a change earns at a glance (its
  mode, who reviewed it, whether its checks ran on the final code, its
  limits), the history of why each change happened, and what it cost.

Every handoff between agents is a file with a shape, written by the sender,
or by `greenline brief` in its place, and read by the receiver, and it lives as long as its reader needs it. A
report the record cites is permanent, in the change's folder, and so is a
reviewer's or a verifier's brief, which `greenline brief` writes there and
the close cites. Anticipate's brief, a relay note or a probe is a working
file: `greenline tidy` removes them when
the change is done; it never removes a cited file. No file is deleted
because it was read, and none is committed to keep it.

You write at four moments: at open, the front matter the ledger guide's
skeleton gives, before the first edit; at each step's end, that step's
section; at every stop, the state `stopped` and the "next" line, and the
record and its folder committed with the change's trailer; at close,
when the close step distils the working files into the record, moves
lasting choices into the decision home and the glossary, and runs
`greenline tidy --change <id>`, which removes the working files. A stop
commits the record and its folder, the check facts under it, and nothing
else: the change's uncommitted edits stay in its checkout for its resume,
and while they are there a proposal for another change says so and waits
for the owner; edits the owner asks to commit are a commit of their own,
apart from the stop's. A record
holds the facts once: no diary, no pasted log, nothing git already records,
and no fact in two homes.

## Three lifetimes

| Kind      | What it is                                                                                       | Where                                                     | Lifetime                                            |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------- |
| Working   | anticipate's brief, relay notes, round detail, probes, raw output                                | `.greenline/tmp/<id>/`                                    | removed by `greenline tidy` when the change is done |
| Record    | the change record, its check facts, the briefs `greenline brief` writes and the reports it cites | `.greenline/ledger/<id>.md` and `.greenline/ledger/<id>/` | permanent                                           |
| Knowledge | the decision home, decision records, the glossary, the plan documents                            | the homes below                                           | permanent and kept current                          |

The record alone is enough to resume. The working files live under the
git-ignored `.greenline/tmp/<id>/`, named by the change's id; they are never
committed and never cited, since a link into them does not resolve. The id is
chosen when the change's proposal is written, or earlier for a start's
working file, such as a diagnosis's reproducer, as AGENTS.md says, so the folder, the branch and the record
share it from the start. Two working files have a name and a shape, which `.greenline/ledger/README.md` gives: anticipate's brief,
`.greenline/tmp/<id>/brief-anticipate-<n>.md`, and the relay note between
two rounds, `.greenline/tmp/<id>/relay-<step>-<n>.md`. A reviewer's and a
verifier's brief is no working file: `greenline brief` writes it into the
change's folder, as that guide says. `greenline status`
reports a folder left after the change is done. What a record relies on is
copied into the change's folder first, and the record cites that copy. A
change's files live in its one checkout, on the branch its proposal named,
and that checkout is a worktree only when the owner asked for one and the
harness runs the session in it. A
branch is context, never evidence.

## The change record

Every change, in every mode, has one record, `.greenline/ledger/<id>.md`, and
a folder beside it, `.greenline/ledger/<id>/`, whenever something is
attached. A question, a step asked for by name that changes no file and a
start that edits no file have no record; a decision or a term written only
into the knowledge homes (the decisions book, the ADR home, the glossary)
opens a quick record first, as every write does. A follow-up inside an open change
joins that change. `.greenline/ledger/README.md` gives the front matter, the
two states a change stops and resumes in, the "next" line, the sections and
the skeleton of each mode, and says what the folder holds.

## Plans and tickets

A mode says how sure; a plan says how big. A change of any mode may stand
alone, with its frame, plan and anticipate sections in its own record. A plan directory exists only when the plan step splits the work
into tickets:
`.greenline/plans/<NNN-name>/`, such as `.greenline/plans/003-login/`. It
holds the plan documents the work needs: `spec.md`, `decisions.md`,
`map.md`, `tickets.md`, and research and prototype notes. Each opens with
front matter holding `status: draft` or `status: complete` and nothing else.

`tickets.md` is one file with one short entry per ticket: a `## <id>` heading
and its fields, the intent, the scope, the acceptance, the entries it comes
after, and its own mode.

```text
---
status: draft
---

# Tickets

## T1

intent: "Keep the caller's deadline across retries."
scope:
  - src/http/retry.ts
acceptance:
  - "Every retry uses the original deadline."
mode: regular

## T2

intent: "Report the deadline in the retry log."
scope:
  - src/http/log.ts
acceptance:
  - "The log line names the deadline."
after: [T1]
mode: quick
```

Work that splits waits twice, as AGENTS.md says. Marking `tickets.md`
complete records the owner's approval of the list and the mode beside each,
a mode the owner names there editing its entry; until then no ticket is
ready. A floor applies per ticket. A ticket opens its own record, naming its
plan and ticket, under its entry's mode or one the owner names as it opens,
an override `greenline status` marks. A ticket nobody started has no
record. Progress is never written: `greenline status` derives each
ticket as not started, in progress or done, and lists those ready to start.
The planning change has one record, under careful unless the owner names
another, since its plan writes the tickets with the floor named, and
`greenline status` reports one below careful. It opens
first, stays open while its tickets run, closes last, and checks the whole
result against the spec.

## The settings

Two fields of `.greenline/manifest.json` shape the loop. They are the
owner's: change them only when the owner asks. `greenline inspect` edits them
as it edits the other settings, and `greenline init` writes their defaults.

```json
{
  "proceed": "none",
  "trials": []
}
```

- `proceed` is `none` or a mode. At a mode, you proceed without waiting for
  that mode and every faster one, and wait for the slower. At `none`, the
  default, you wait for every mode. A record of a change you proceeded with
  under this setting states `choice: standing`, and a standing choice
  applies only where `proceed` admits the record's mode: elsewhere the hooks
  refuse it, and the request's own words, such as "implement without
  asking" or "go ahead", are no yes. `greenline status` shows a standing
  record whose mode `proceed` does not allow beside its row: the hooks were
  off or bypassed, or a mistake.
- `trials` lists the trial skills this workspace enabled, a trial start or
  a trial habit, none by default. A trial skill not listed is not
  installed, and AGENTS.md lists it nowhere. Run `greenline sync` after a
  change, so the installed skills follow.

Two more fields hold the project's checks and its hooks.

```json
{
  "checks": [{ "name": "test", "command": "npm run test", "dir": "." }],
  "hooks": { "git": true, "adapters": true }
}
```

- `checks` declares the project's checks, each a name, the command as one
  line and the directory it runs in. `greenline init` proposes them from the
  project's own files; confirm or correct them in the first change's plan,
  and declare one the change adds with
  `greenline check --declare -- <command>`, a line the owner's yes covers.
  A command a harness hook sees whose text is a declared check's, or begins
  with it and a space, in the same directory, is recorded as that check's
  run; only a run through `greenline check` counts for the close.
- `hooks` turns greenline's git hooks and its harness adapters on or off;
  both are on by default. The git hooks, under `.greenline/hooks/`, write
  the change's trailer and refuse a commit before the owner's yes or while
  no change is open, a done
  over a check that is not green, a rewrite of the change's branch without
  its `rebase` words and a push without its `landing` words. A clone has
  the scripts and runs none until `greenline sync` registers them;
  `greenline status` says when they are absent.

## Installing and removing methods

A skill AGENTS.md marks as installing on request installs only when the
owner authorizes it: add its name to the manifest's `skills.include` and run
`greenline sync`. An explicit `skills.exclude` stays binding until the owner
authorizes changing it. Removing a skill leaves its owned files as orphans
until they are removed explicitly: read sync's JSON effects and pass the
chosen exact paths to `--force-managed`, keeping edited files.

The garden connector's method is installed only while the owner has enabled
garden with `greenline connectors enable garden --url URL`, never through
`skills.include`, and `greenline connectors disable garden` removes it again.
Enabling and disabling garden are the owner's steps, never the agent's.

## Repository memory

A repository's existing home for a kind of memory is that home: a decisions
document, an ADR directory of its own, a glossary, a contributing guide. The
defaults below are created only where the repository has none, and a default
never stands beside an existing equivalent. The decisions book is the one
exception the CLI needs: root statements live in it, and when the repository
keeps its decisions elsewhere the book holds root statements and references
into that document, never a second copy of its choices.

| Home                                            | Job and creation rule                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decisions book: `.greenline/DECISIONS.md`       | Settled product and engineering choices, per-root statements, and references to their rationale. Create it when the first lasting choice is settled; missing means no recorded choices. A deferral is a line inside the decision it defers from, never an entry of its own. |
| House rulings: user-owned region of `AGENTS.md` | Optional `## House rulings` dash-list outside the managed markers; write only actual owner instructions. Format below.                                                                                                                                                      |
| `docs/adr/`                                     | Consequential technical reasoning, alternatives and costs. The close step seeds it on first use only where the repository keeps no decisions; link lasting choices from the decisions book.                                                                                 |
| `GLOSSARY.md`                                   | The domain's terms. The close step creates it when the first term is settled.                                                                                                                                                                                               |
| `GLOSSARY-MAP.md`                               | Optional index of several domain contexts and the glossary of each; create it only when a second context needs its own.                                                                                                                                                     |
| A plan's `decisions.md`                         | Choices that shape one plan; the planning change's close moves those that outlive it into the decisions book with references to their sources.                                                                                                                              |
| `.greenline/policy-changes.json`                | The latest manual saves made through `greenline inspect`; read the relevant ones when the file exists.                                                                                                                                                                      |
| `.greenline/diagrams/<work-id>/`                | Durable diagrams, in a folder named by the change id or the plan name they serve and linked from its record or document, with the effective style guide beside them; present only when the diagram skill is installed.                                                      |
| `.greenline/map/`                               | The measured architecture map (map.md, snapshot.json, architecture.html); present only when the architecture map skill is installed.                                                                                                                                        |

### House rulings

A new policy file can contain only its managed block. Content before or after
those markers is user-owned; no separate user-region marker is needed. To retain
an actual owner rule, create `## House rulings` after the closing marker and
write each ruling as a `- ` bullet. Indented continuations belong to that bullet;
the next Markdown heading ends the stanza. `greenline status` lists this stanza's
bullets only. Other prose instructions still govern the agent, but are not
reported as structured House rulings. An absent stanza means no listed rulings.
Sync preserves every byte outside the managed block.

### Root statements in the decisions book

The book holds settled choices and their rationale. Its optional structured
summary lets the CLI read exact governed roots without interpreting that prose.
Use at most one `greenline-roots` fenced block, containing a JSON array. Every
object requires exactly `root`, `purpose`, `languages`, `technologies`, `decision`
and `exclusions`; unknown keys are refused. `root` is `.` or a confined
repository-relative path; each root appears once. `purpose` is a string or null;
languages and technologies are string arrays. `decision` is the nonempty
reference to that choice's rationale. Unknown choices stay empty or null.
This example is a format, not a default technology decision:

````markdown
# Decisions

## API

The owner settled TypeScript for the existing API. Keep its current tools.

```greenline-roots
[
  {
    "root": "apps/api",
    "purpose": "service or API",
    "languages": ["typescript"],
    "technologies": [],
    "decision": "#api",
    "exclusions": []
  }
]
```
````

An exclusion is exactly `{ "kind": "unit", "id": "<unit-id>" }` or
`{ "kind": "option-group", "responsibility": "<responsibility>" }`.
Use identities and responsibility values from the bound publication's
metadata and vocabulary. The garden bridge applies them when it reads: a unit
exclusion passes to garden, and an option group expands through a recorded
listing into its members and the units they contain, never directory ancestry;
a group with no members refuses the read. The agent must select the actual
governed root rather than substituting a child path. Empty exclusions forbid no
units.

Before a change closes, its lasting choices go into the decisions book, with
links to their rationale rather than copies of it in several homes. A
change record holds the why, the what and the how of one change; it does not
replace the decision home. None of these documents is created merely to fill
a template.
