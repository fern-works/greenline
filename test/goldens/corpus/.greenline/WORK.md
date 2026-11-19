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
| Working   | relay notes, round detail, probes, raw output                                                    | `.greenline/tmp/<id>/`                                    | removed by `greenline tidy` when the change is done |
| Record    | the change record, its check facts, the briefs `greenline brief` writes and the reports it cites | `.greenline/ledger/<id>.md` and `.greenline/ledger/<id>/` | permanent                                           |
| Record    | a discussion's record and the research reports it cites                                          | `.greenline/ledger/discussions/<id>.md` and its folder    | permanent                                           |
| Knowledge | the decision home, decision records, the glossary, the plan documents                            | the homes below                                           | permanent and kept current                          |

The record alone is enough to resume. The working files live under the
git-ignored `.greenline/tmp/<id>/`, named by the change's id; they are never
committed and never cited, since a link into them does not resolve. The id is
chosen when the change's proposal is written, or earlier for a start's
working file, such as a diagnosis's reproducer, as AGENTS.md says, so the folder, the branch and the record
share it from the start. One working file has a name and a shape, which `.greenline/ledger/README.md` gives: the relay note between
two rounds, `.greenline/tmp/<id>/relay-<step>-<n>.md`. A fresh agent's
brief, of any step, is no working file: `greenline brief` writes it into
the change's folder, as that guide says. `greenline status`
reports a folder left after the change is done. What a record relies on is
copied into the change's folder first, and the record cites that copy. A
change's files live in its one checkout, on the branch its proposal named:
this checkout, or a worktree of its own the owner chose at the proposal,
which the record's `ground` line names. A
branch is context, never evidence.

## The change record

Every change, in every mode, has one record, `.greenline/ledger/<id>.md`, and
a folder beside it, `.greenline/ledger/<id>/`, whenever something is
attached. A question, a step asked for by name that changes no file and a
start that edits no file have no record; a decision or a term written only
into the knowledge homes (the decisions book, the ADR home, the glossary)
opens a quick record first, as every write does; so does a survey's result.
The orientation the `orientation` line of `greenline status` names while no
change record exists takes no record of its own: it is a habit of the first
change's frame, its reading written into the knowledge homes by that change.
A follow-up inside an open change
joins that change. `.greenline/ledger/README.md` gives the front matter, the
two states a change stops and resumes in, the "next" line, the sections and
the skeleton of each mode, and says what the folder holds.

## Discussions

A discussion, an idea explored before it is work or instead of it, keeps
one record, `.greenline/ledger/discussions/<id>.md`, and a folder of the
same name for the research reports it cites, both permanent; its working
files go under `.greenline/tmp/<id>/` under its own id, and
`greenline tidy --discussion <id>` removes them once it is declined,
promoted or merged. It has no mode and no branch, and a change promoted
from it copies its reports into its own folder.
`.greenline/ledger/README.md` gives its form, its states and its commit.

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

Work that splits waits twice, as AGENTS.md says. The list stands written
in `tickets.md`, each ticket's mode beside it, before the wait that asks the
owner to approve it, and `greenline status` names a planning wait with no
list on disk. Marking `tickets.md`
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
result against the spec. Its ticket list lies outside the change's homes,
so it is written once the owner has confirmed the careful frame, their
words in the record's `confirmed` line. A ticket's frame is its planning
change's, the record that names its plan, so write the `plan` line on the
planning change's record: the hooks read that record's confirmation for
the ticket's writes and commits, hold a careful ticket whose plan no
record names, and refuse a `confirmed` line on the ticket's own record. A
dropped planning record that holds no confirmation still holds its
tickets: take the `plan` and `ticket` lines out of a ticket's record so
the change owes its own frame.

## The settings

Three fields of `.greenline/manifest.json` shape the loop. They are the
owner's: change them only when the owner asks. `greenline inspect` edits them
as it edits the other settings, and `greenline init` writes the defaults of
the two that have one.

```json
{
  "proceed": "none",
  "ground": "branch",
  "trials": []
}
```

- `proceed` is `none` or a mode. At a mode, you proceed without waiting for
  that mode and every faster one, and wait for the slower. At `none`, the
  default, you wait for every mode. A record of a change you proceeded with
  under this setting states `choice: standing`, and a standing choice
  applies only where `proceed` admits the record's mode: elsewhere the hooks
  refuse it, and the request's own words, such as "implement without
  asking" or "go ahead", are no yes. `proceed` admits a mode and confirms
  no frame: a careful change still waits for the owner's confirmation of
  its frame's restatement before anything outside its homes. `greenline status` shows a standing
  record whose mode `proceed` does not allow beside its row: the hooks were
  off or bypassed, or a mistake.
- `ground`, absent by default, is the owner's standing choice of where a
  change's work goes: `branch`, a branch of its own in this checkout, or
  `worktree`, a worktree of its own on that branch. The proposal states it
  instead of offering the two, as frame's references say; absent, the
  proposal offers them each time. `greenline status` prints it while no
  change is open.
- `trials` lists the trial skills this workspace enabled, a trial start or
  a trial habit, none by default. A trial skill not listed is not
  installed, and AGENTS.md lists it nowhere. Run `greenline sync` after a
  change, so the installed skills follow.

Three more fields hold the project's checks, its hooks and its file token
cap.

```json
{
  "checks": [{ "name": "test", "command": "npm run test", "dir": "." }],
  "hooks": { "git": true, "adapters": true },
  "fileTokens": { "cap": 5000, "exempt": [] }
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
  its `rebase` words and a push without its `landing` words, a force push
  without both. The harness adapters refuse, before the shell runs it, a
  git command that throws work away without the record's `discard` words,
  a forced push without its `rebase` and `landing` words and a push to
  another branch without its `landing` words. Each line lifts its act
  only once the record is committed with it. A clone has
  the scripts and runs none until `greenline sync` registers them, run by
  the owner or on the owner's word; `greenline status` says when they are
  absent.
- `fileTokens`, absent by default, opts the workspace into the file token
  cap: every authored file stays under `cap` tokens, 5,000 unless it names
  another, a token four bytes, with lockfiles, generated files, vendored
  trees, data and the `exempt` globs left out. The plan declares
  `greenline check files --max-tokens <cap>` as a check where it is set,
  and build splits a file that grows past it in a slice of its own.

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

| Home                                            | Job and creation rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decisions book: `.greenline/DECISIONS.md`       | Settled product and engineering choices, per-root statements, and references to their rationale. Create it when the first lasting choice is settled; missing means no recorded choices. A deferral is a line inside the decision it defers from, never an entry of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| House rulings: user-owned region of `AGENTS.md` | Optional `## House rulings` dash-list outside the managed markers; write only actual owner instructions. Format below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/adr/`                                     | Consequential technical reasoning, alternatives and costs. The close step seeds it on first use only where the repository keeps no decisions; link lasting choices from the decisions book.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GLOSSARY.md`                                   | The domain's terms. The close step creates it when the first term is settled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GLOSSARY-MAP.md`                               | Optional index of several domain contexts and the glossary of each; create it only when a second context needs its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A plan's `decisions.md`                         | Choices that shape one plan; the planning change's close moves those that outlive it into the decisions book with references to their sources.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `.greenline/policy-changes.json`                | The latest manual saves made through `greenline inspect`; read the relevant ones when the file exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.greenline/visuals/`                           | Every durable visual: a change's under `<id>/`, the architecture map under `map/`, the atlas's index `atlas.json` with each subsystem's page and journeys under `subsystems/`, and the documents index `documents.json`; beside each visual its manifest, `<slug>.visual.json`, naming what it covers and the commit it was made at. A visual is written under an open change; `greenline status` reports one whose files changed since. A change's picture is kept only on the owner's ask, through `greenline picture keep`, which writes it and its manifest together; the hooks refuse every other write into a change's folder. For a visual a skill writes, the manifest's `madeBy` records whether a fresh agent or the session drew it, `greenline picture keep` reading it from what the hooks saw, and `greenline status` names a change's visual the session made. A capture the owner takes from the viewer with no change open stands under `interface/`. |
| `.greenline/visuals/documents.json`             | The documents index: the repository's own documents, each with whether the practice or the owner wrote it, the files it covers and the commit it was kept at. The `explain` start's discovery creates it; the hooks keep it, and status names a document that drifted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Durable visuals

Every durable picture lives in `.greenline/visuals/` and is written only under an open change, and only on the owner's ask: a change's under `<id>/`, the architecture map under `map/`, the atlas's index `atlas.json`, each subsystem's page `subsystems/<name>.md` and its journeys under `subsystems/<name>/`, the documents index `documents.json`, and the project's diagram style guide `style-guide.md` where the owner keeps one, its manifest `style-guide.visual.json` of the form `style`. A fresh agent, started by the change's build or its close with the skill's brief, makes the map, each atlas page and its journey; the session draws inline. A change's picture is drawn under `.greenline/tmp/<id>/` and kept with `greenline picture keep <file> --change <id> --ask "<the owner's words>" --title "<title>" --form <form> --skill <skill> --summary "<what it shows and why>" --files <path>,<path>`, which writes the picture and its manifest together, the owner's words recorded as its `ask`: their whole message asking for a lasting picture, or a whole sentence of it, never a fragment or a question that asks for none; nothing else writes a change's folder, and the hooks refuse a hand's, a script's or a `git restore`'s write there and name after the tool a write the command's words hid. A kept picture is never written over: its remake is kept under a new slug with `--replaces <slug>`, the kept picture it replaces, which status names to the owner (GL0609). One kind needs no change: a capture of a page the owner takes from the viewer while no change is open stands under `interface/`, its manifest's `change` null. Beside each visual, an `.svg`, `.html` or `.md` file named by its slug, stands its manifest, `<slug>.visual.json`:

```json
{
  "schema": "greenline.visual/v1",
  "title": "The request path",
  "form": "sequence",
  "skill": "diagram-design",
  "change": "2026-10-25-cache-headers",
  "commit": "0123abc",
  "files": ["src/http/", "src/cache.ts"],
  "made": "2026-10-25",
  "summary": "How a request reaches the cache and back."
}
```

`change` is null only for a visual no change made; `commit` is the commit it was made at, `git rev-parse HEAD`; `files` are the paths it covers, from the root, a trailing `/` for a directory, each one the commit holds: a manifest naming a file its commit does not hold is refused at the write. At the write that sets the record done, the hooks move a manifest to the commit HEAD names only where no file it covers changed since its own commit; one whose covered files changed keeps its commit, and status names its drift. A durable visual keeps its bytes in the home: one whose file loads an address from outside the repository is recorded in the manifest's `reaches` and named (GL0608). `madeBy`, beside `made`, is never written by hand: `greenline picture keep` writes `agent` where the hooks saw a fresh agent draw the file, `session` where they saw the session draw it and none where they saw neither, and the hooks write it after each other write of a visual in the map's and the atlas's folders. A visual is made on the owner's ask, by a fresh agent where its skill starts one, with this brief and nothing else: what the picture shows and for whom, its kind and the skill that draws it, the change's id, the commit and the files it covers, and the file it draws under `.greenline/tmp/<id>/` for `greenline picture keep`. Before it is drawn, its skill writes the picture's brief, `.greenline/tmp/<id>/pictures/<slug>.brief.md`, one line a field, `- question:` the question it answers, `- form:`, `- nodes:` the nodes it draws, `- finish:` `text`, `branded SVG` or `interactive`, `- palette:` by the style guide, and `- reader:`; `greenline picture keep` reads it into the manifest's `brief`, refuses one that does not read and says when it kept a picture with none and the two paths it read, and `greenline status` names a change's kept picture without one (GL0606). A figure's build script and model module are the record's, copied into `.greenline/ledger/<id>/sources/<slug>/`. The record links the change's visuals once, as `[visuals](<id>/visuals.json)`, a file `greenline event` keeps. `greenline status` reports a visual whose covered files changed since its commit, GL0601 naming its tier, `drifting` or `stale`, and what the drift reaches, the capture or the visual and the record of the change that links it, and `greenline inspect` shows each with its tier and deletes one on the owner's word; status names a kept picture deleted from the home (GL0610), the owner's delete where the inspector wrote the links file, and a deleted picture is remade on the owner's ask alone, never restored.

A lasting visual is offered at most once per change, only where the shape a turn wants passes twelve nodes or 72 columns, in one line, `Picture offered: <what it would show>, <form>, <finish>; say keep`, which the hooks count per change, a second offer and an offer of a lost picture's remake named at the next turn; a durable picture is made on the owner's ask alone. The status line's `atlas:` line says `atlas: none`, or the pages, the drifting ones and the map's commits behind, and names a major change since the map; the map's pages are made on the owner's ask.

The repository's own documents drift like atlas pages. `documents.json` lists each with its `path`, its `author`, `practice` or `owner`, the `files` it covers, the `commit` it was kept at and the `change` that kept it; the `explain` start seeds it at discovery from the top level and `docs/`, the hooks keep a listed document's commit when a change writes it, and `greenline status` names one that drifted (GL0607), counted in the status line's `docs:` line. A document the owner wrote is named to the owner, whose ask alone has it refreshed.

At the close, one fresh agent refreshes, without asking, the atlas pages and journeys the change touched, and the map when a page changed, up to three pages; the record's `refreshes` line names the pages and the agent's cost, and done waits for them unless the owner's words "leave the pages" stand in the close section; done waits too, whatever the owner's words, while a page, journey or the map the change rewrote is named nowhere in that line. A larger refresh, the map's first pages, an anatomy figure and a document the owner wrote are made only on the owner's ask.

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
