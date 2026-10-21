# Change records

This folder holds one record per change, in every mode. AGENTS.md owns the
request loop and the modes, and each step's skill owns its method. This guide
owns the record's format: its front matter, its two states, its "next" line,
its sections and the skeleton of each mode. `greenline check` and `greenline status` read the
records; a refusal of a record's headings, its "next" line or its floors
cites this guide.
`.greenline/WORK.md` says where the other files of the work live.

## The record

A change's record is `.greenline/ledger/<id>.md`. Its id is the file name
without `.md`: the date its id was chosen and a slug, such as
`2026-10-08-retry-deadline`, chosen when the change's proposal is written,
or earlier for a start's working file, such as a diagnosis's reproducer,
as AGENTS.md says. Open it before
the first edit, from the skeleton of its mode below: at open its front matter holds the mode, the
choice, why, the state `open` and the "next" line. One session writes a
change's record at a time: the session holding the change, which opened it
or resumed it. A session that resumes a stopped change from its record
writes on in that record, and its "next" line and sections carry on from
where the last one stopped.

### Open and stopped

A change is `open` while a session holds it, and a planning change stays
`open` while its tickets run; a wait for the owner within the session, at
a proposal, a question or a review, leaves it `open`. Otherwise, while no
session holds it, it is `stopped`: `stopped` is set only when the session
leaves the change unfinished, as it ends or as another change's request
stops it.
Every stop sets `stopped` and rewrites the "next" line, whether the close
step stops the work or the session that stops does. A stopped change is
set `open` before any edit of its record or its code, as the first write
of the session that resumes it. Every stop commits the record and its
folder, the check facts under it, and nothing else, with the change's
trailer, as AGENTS.md says; working edits the owner asks to commit are a
commit of their own, apart from the stop's. A stopped change
resumes on the branch the stop's commit sits on; a change stopped before
any other commit has that commit as its first. A session on another branch, or
in a clone, finds it by that commit. One session holds one
change at a time, and several changes may be open at once. A request for
another change, not a follow-up of the change a session holds, stops that
change first, then gets its own proposal. `greenline status` lists each open and
stopped change with its "next" line beside its state.

### The front matter

| Field              | What it holds                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`             | the mode the change runs under                                                                                                                                                                                |
| `choice`           | `owner` when the owner named the mode, `accepted` when the owner accepted your proposal, `standing` when you went on without waiting because `proceed` allowed the mode; the request's words alone are no yes |
| `proposed`         | the mode you proposed, only when the owner chose another; a ticket's entry's mode when the owner overrode it as the ticket opened                                                                             |
| `why`              | why the change exists, in one line                                                                                                                                                                            |
| `state`            | `open`, `stopped`, `done` or `dropped`                                                                                                                                                                        |
| `next`             | the "next" line, below                                                                                                                                                                                        |
| `floors`           | each floor you found, by the name the skeletons' section below gives it, such as `[security]`                                                                                                                 |
| `raises`           | each raise, one list item per raise, as below                                                                                                                                                                 |
| `reviewed`         | the depth the review ran at: `none`, `inline`, `written`, `independent` or `looped`                                                                                                                           |
| `plan`, `ticket`   | the plan directory's name and the ticket's id, for planned work; a ticket is named only with its plan                                                                                                         |
| `agents`, `rounds` | the cost, stated at close: the agents the line's depths started, the builder counted, and the rounds it ran, both or neither                                                                                  |
| `starts`           | each fresh agent the line's depths started, stated with the cost: one item per start, `"<step> <n>"`, or `"<step> <n> restarted"` for a restart                                                               |
| `landing`          | the owner's words for a push, a pull request or a merge, quoted, written at close; absent, no push: git's pre-push hook refuses one                                                                           |
| `rebase`           | the owner's words for rewriting the change's branch, a rebase or an amend, quoted; absent, git's hooks refuse the rewrite                                                                                     |

Each field is one line, `<field>: <value>`, with no blank line between
fields. A name, a number and `none` stand bare; any other text is written in
double quotes, and it holds no double quote of its own. A list is written
flat, as `floors: [security, concurrency]`, or one item per line under
its field, each line opening with two spaces, a dash and a space, as the
raise below shows. A field outside this table is refused, unless it is the line of a
kind whose record is a line (below).

Every floor you find, at the proposal or during the work, goes into
`floors` when you find it, whatever the mode and whoever chose it. The
frame section names where each floor came from: the decision, the file or
the call that raised it. Where the owner names a mode below a floor, the
record says `choice: owner` with `proposed` the mode you proposed, and the
frame section states the floor's reason, so a reader sees the owner chose
below it. A floor is never a second mode: `mode` is the one mode the change
runs under.

A raise records a move to a higher mode during the work. It names the mode it
was raised from and why, and nothing else: where it went is the next raise's
`from`, or the record's `mode` for the last one. The raises ascend, each from
a mode below the record's mode. Write each as one item:

```text
raises:
  - { from: quick, reason: "the change touches the session store" }
```

### The "next" line

The "next" line names the step reached and the action that resumes it:
`next: "<step>: <action>"`, such as
`next: "review: rerun the reviewer on the fixed commits"`. Rewrite it at
every stop. A stopped record requires it. An open record may state it or
`none`, and a done or dropped record's is `none` or absent. Its step must be a
step of the modes. `greenline status` reports the step it names as the step
reached; for an open record whose "next" line is absent or `none`, the step
reached is the first section of a step the mode runs that is absent or
empty.

### The sections

The body holds one section per step of the line, headed `## <step>`, in the
line's order, whatever the mode: every mode keeps the whole record. A step
the change's mode does not run carries the one line `none at <mode>`, such
as `none at quick`, written when the record opens from its skeleton; a
raise leaves the line as it stands where the new mode does not run the step
either, and replaces it with the step's work where it does. Write each other
section when its step ends. A step stopped midway keeps
its section as written so far, and the "next" line names that step and the
action that resumes it. The depth the mode gives the step decides the
section:

- **none**: the one line `none at <mode>`, and nothing else;
- **inline**: one line by the builder;
- **written**: the builder's section;
- **independent**: the reports of the fresh agents, each cited by a link into
  the change's folder;
- **looped**: one `### ` sub-heading per round, each citing that round's
  report.

The build section records each deviation from the plan and each approach
tried and dropped. In a section of the written depth or above, a finding is
a row of a small table: the finding, its severity and what was done. An
inline section states its findings in its one line.

Every kind of skill writes into the record what its contract in the modes
definition says:

- a step writes its section, as above;
- a kind whose record is a section writes one optional `## <kind>` section,
  at most once, naming the skill that ran and what it handed on. It stands
  before the steps' sections when the kind is chosen as a request opens, as a
  start is, and after them otherwise. A start's section is `## start`; it is
  never required, it names a start only when that start was loaded and
  followed in this change's session, never one only considered, and a start
  that resumes an open or stopped change, as the router does, writes none in
  it;
- a kind whose record is a line writes one optional front-matter line,
  `<kind>: "<text>"`;
- a kind whose record is none writes nothing, as a habit does.

The parse refuses a record, and nothing else about it is judged until it
parses: a file name that is not a real date and a slug; no front matter, an
unclosed one, or one holding a blank line, a repeated field or a line that is
no field; a field this guide does not define, or a value its field does not
take; a mode, a floor or a raise's mode the modes do not hold; `proposed`
without `choice: owner`, or equal to the mode; a raise from the record's mode
or above, raises that do not ascend, and a raise that states where it went; a
stopped record whose "next" line is absent or `none`, and a done or dropped
record whose "next" line is not `none`; a "next" line that does not open with
a step of the modes; a ticket named without its plan; a cost that states one
of its two counts; a start that is not a step of the modes and a number,
`restarted` after them or not; and, by name, a heading that is no step and no kind's
section, a heading of a kind that writes nothing or writes a line, and a
repeated or misplaced section. A record that does not match its mode is never
refused. `greenline status` reports it as a finding with its remedy instead: a
section for a step the mode does not run that holds anything but its
`none at <mode>` line, a section a done record's mode requires and the
record lacks, a done record with no section for a step its mode does not
run, an inline section of more than one line, more
rounds than the mode allows, a "next" line naming a step the record does not
run, a floor the mode does not meet when you went on without waiting
(`choice: standing`), and a cost over the mode's budget.

## The skeleton of each mode

These skeletons, the floors' names and the split are generated from the
modes definition. Copy the skeleton
for the change's mode, fill its placeholders, and drop the optional parts
you do not use.

When the work is split into tickets, the planning record holds the sections of `frame`, `plan`, `anticipate`, `verify` and `close`, and each ticket's record those of `build`, `review`, `verify` and `close`. Each record holds its share whole, a step its mode does not run saying `none at <mode>`.

The `floors` field names each floor you found by its name: `security` for secrets or security; `data-migration` for a data migration; `concurrency` for concurrency; `public-contract` for a public contract; `unchecked-behavior` for a behavior change with no check that could fail.

### quick

```markdown
---
mode: quick
choice: <owner, accepted or standing>
why: "<why the change exists>"
state: open
next: "<step>: <the action that resumes it>"
---

## start

<the start skill that began the change, by name, and what it handed on; leave the section out when none did>

## frame

<one line by the builder>

## plan

<one line by the builder>

## anticipate

none at quick

## build

<one line by the builder>

## review

none at quick

## verify

<one line by the builder>

## close

<one line by the builder>
```

### regular

```markdown
---
mode: regular
choice: <owner, accepted or standing>
why: "<why the change exists>"
state: open
next: "<step>: <the action that resumes it>"
---

## start

<the start skill that began the change, by name, and what it handed on; leave the section out when none did>

## frame

<the builder's section>

## plan

<the builder's section>

## anticipate

none at regular

## build

<the builder's section>

## review

<the reports of 1 fresh agent, each cited by a link into the change's folder>

## verify

<the builder's section>

## close

<the builder's section>
```

### careful

```markdown
---
mode: careful
choice: <owner, accepted or standing>
why: "<why the change exists>"
state: open
next: "<step>: <the action that resumes it>"
---

## start

<the start skill that began the change, by name, and what it handed on; leave the section out when none did>

## frame

<the builder's section>

## plan

<the builder's section>

## anticipate

<the reports of 1 fresh agent, each cited by a link into the change's folder>

## build

<the builder's section>

## review

<the reports of 2 fresh agents, each cited by a link into the change's folder>

## verify

<the reports of 1 fresh agent, each cited by a link into the change's folder>

## close

<the builder's section>
```

## The change's folder

`.greenline/ledger/<id>/` holds what the record cites, whatever the mode.
Every fresh agent writes its report there, and only there, as
`<step>-<n>.md`: the step it serves and its number, the agent's at the
independent depth and the round's at the looped depth, such as
`review-1.md`, `review-2.md` or `anticipate-1.md`. The record links it, such
as `[review](<id>/review-1.md)`, and the builder never edits it. The briefs
`greenline brief` writes stand there too, below. A file in a finished
change's folder that nothing cites is reported.

## The brief and the relay note

Every fresh agent gets one brief, whatever its step: the change record's
front matter, the change's acceptance, the change's id, the path of its
report, the absolute path of its scratch folder,
`.greenline/tmp/<id>/<step>-<n>/`, and the skill it works by, to read whole; then the extras of its
step, which that step's skill names: review adds the builder's paragraph of
intent and, where two agents read, the axis; anticipate adds the artifact
and its contract, never the claim; verify adds nothing. Nothing else: never
the builder's other sections, its diagnosis or another agent's findings,
which are the builder's claims. Every working file the agent writes goes in
its scratch folder, or where its skill names under `.greenline/tmp/<id>/`,
never the host's temporary directory, and a working file there is a finding.
The brief names no model, effort or harness setting. No fresh agent delegates: it does its whole step itself and starts
no agent of its own. An agent a habit or a step's method starts gets this
brief too, with the extras the page that starts it names.

A reviewer's and a verifier's brief is a file the builder never writes:
`greenline brief --change <id> --step <step> --round <n>`, with review's
`--intent` and, where two agents read, its `--axis`, writes it from the
record to `.greenline/ledger/<id>/brief-<step>-<n>.md`, `<n>` the number
its report takes, its first line the command's mark, and prints its path.
Start the agent with that path and nothing else. The builder never opens,
copies, diffs or derives a brief file, one the command wrote included: a
read of one is a finding for the next review, and `greenline status`
reports a brief file in the folder that the command did not write (GL0408).
`greenline status --change <id>` lists the briefs the command wrote, and the
close section links each one from that listing. Anticipate's brief is the
builder's file, `.greenline/tmp/<id>/brief-anticipate-<n>.md`, holding the
brief and nothing else. A harness with no delegation can hand a brief file
to a second session, and a resume finds it. The harness still starts every
agent; the file starts none.

A looped step's relay note is `.greenline/tmp/<id>/relay-<step>-<n>.md`,
written after round `<n>`: what the round changed, and what the next round
must check. It is a working file, and the record never cites it.

## Fix passes and the cost

A mode's fix rounds are per step: outside a loop, review's findings and
verify's verdicts each get their own fix pass, in which the build step fixes
what they found. A looped step's rounds include its fixes, each round
reading the change as the last fixes left it. A fix made after verify is not
reviewed again outside a loop; the owner's word may ask for a second review.
Verify's verdicts stand as its agent gave them: record each item with its
verdict, send each `NOT VERIFIED` to the build step in the fix pass, and
never re-judge a verdict. Review's findings are the builder's to judge, as
the review skill says.

Everything a change runs spends time: reading a skill, running a step,
starting another agent, repeating a round. The cost counts what the change
used: `agents`, the builder and each fresh
agent the line's depths start, as the mode's number counts them; `rounds`,
each fix pass and each loop round. An agent a method starts, such as a
research agent, a design agent or wayfinder's reader, is named in the
section it serves and counted nowhere. `greenline status` judges the cost
against the mode's budget: the agents the mode table in AGENTS.md gives, and
the rounds its depths allow, the fix rounds once for each step that takes a
fix pass outside a loop plus each looped step's rounds. `agents` counts every
start, a restarted agent one more line in `starts` and one more count, and
`greenline status` reports an `agents` below the builder and the starts the
record names, in `starts` or by a fresh agent's report in its folder, as
GL0409, which the close clears before `done`.

## Checks

Run every check through `greenline check -- <command>`, or
`greenline check --change <id> --step <step> -- <command>`. It runs the
command with its output shown and writes the facts of the run under
`.greenline/ledger/<id>/checks/`: the arguments, the outcome, the duration,
and the commit and the tree id of the code outside `.greenline/`. It stores
no output. Left out, `--change` takes the one open change and `--step` the
step its record is in: the step its "next" line names, or else the first
required section not yet written, which `check` names beside the facts.
A command run without `check` leaves no facts and is not
evidence. A command a declared check matches runs in the directory the
check is declared in, so `greenline check -- <command>` runs a check
declared in `web` there, from anywhere in the repository; where several
directories declare the same command, run it from the one meant. Where a harness hook runs, a command it sees whose text is one of
the manifest's declared `checks` is written beside the facts as a
hook-recorded run, `source: hook`, which `greenline status` shows and the
close never counts. A commit that sets the record `done` is refused by git's
pre-commit hook, on any branch, while the latest run `check` recorded of a
declared check, read by its name, its command and its directory, or of a
check the change ran, is red, unfinished or absent. Where the repository
has a remote, the default branch is no change's branch, and there no other
hook refuses and none writes a trailer; where it has none, the hooks hold
the change whose record is open on the default branch as they hold a
change's branch, as "Commits" says. On a planning change's branch, a
ticket's commit carries the ticket's trailer. A reviewer's and a verifier's checks are no exception: the same
command run plainly, `npm test` or `node --test`, is a read that proves
nothing to the record. A fresh agent gives the `--step` and the `--round <n>`
its brief names, and `check` runs the command with `TMPDIR` set to that
agent's scratch folder. `greenline status --change <id>` says whether each check ran on the
final code and, when it did not, which files changed after it, and for an
open change counts the commits of code since its last recorded check, a
nudge to run the checks again and never a finding. A change is
set `done` only when the latest run of each of its checks is green, as the
close skill says. Every run of a check on the change's code goes through
`check`, a red one included, such as the red of the red-green cycle, and
a rerun made only to read why it failed. A
probe, a run whose green the change never claims, such as a baseline at an
earlier commit, a mutation run, a negative control or a bench, runs outside
`check` and is never recorded as a check of the change.

A recorded check fact is never removed or edited, by the session holding
the change or by a fresh agent: a rerun of a command records a new fact
beside the earlier ones, and `check` never writes over a facts file already
standing. Each fact names, as `previous`, the newest fact the folder held
when its run started, so `greenline status` names a fact removed from
between two runs (GL0459), whose remedy is to restore it from history; a
fact removed while it was the newest leaves no trace, since the next run
names the one before it, and that is no licence to remove one. A probe recorded through `check` by mistake stays where it is:
mark it with `greenline check --change <id> --probe <fact>`, and `status`
leaves it out of the change's checks, the latest-run rule and GL0451
included; the verify section says why it was marked.

## Commits

Every commit of a change carries the trailer `Greenline-Change: <id>`,
written when the commit is made, in the message's last paragraph, where Git
reads trailers: a line the harness adds there, such as `Co-Authored-By`,
shares that paragraph, with no blank line between them, and the change's
trailer is its last line.

```text
Add the overdue letter

Co-Authored-By: <the line the harness adds>
Greenline-Change: 2026-10-16-overdue-letters
```

Where greenline's git hooks are registered, the prepare-commit-msg hook
writes the trailer into every commit of the change's branch, `--no-verify`
included, the commit that closes or stops the change among them, and
commit-msg refuses a message that carries another change's; a trailer git
cannot write stops the commit with git's reason.
A commit made without the trailer keeps its message: no commit, an unpushed
one included, is reset, amended, rebuilt or rewritten with `filter-branch`
to move it, and `greenline status` names such a commit that touches the
code on its history line. A rewrite of the change's branch, an amend, a
reset to another commit, a rebase or a forced move, is refused by git's
hooks unless the record's `rebase` line holds the owner's words for it, and
a push of the branch is refused while its `landing` line is absent, a force
push always. The change's first commit carries its record:
`greenline status` reads history only from the commit where the first
change record entered the repository, so in a repository's first change a
commit made before its record is counted nowhere. No
record holds a commit hash: the CLI finds a change's commits by that trailer
and by the commits that touch its record or its folder, as a set, not a
range. A change's branch is any `greenline/<id>` branch, or a branch other
than the default branch that a change's proposal named in its "where" line
and its commits sit on; the default branch is never a change's branch, and
the branch HEAD names is never the default branch while it is a change's
branch. A repository with no remote keeps a change's commits on the
current branch, the default branch included, and there the git hooks hold
the change as on its own branch: while one change's record is open in the
working tree of the branch HEAD names, they write its trailer, refuse a
commit before its `choice` line and a rewrite without its `rebase` words,
and a harness hook refuses a write outside the homes before the yes. Where
the repository has a remote, no change is open on the default branch, but
the commit there that finishes or stops a change, a local landing's close,
is that change's, trailer included. While no change is open on the
branch HEAD names, pre-commit refuses every commit, "no change is open on
<branch>; open its record under .greenline/ledger/ before the first
commit", and a harness hook refuses a write outside `.greenline/ledger/`
and `.greenline/tmp/` with the same words; a merge and a commit concluding
one are left alone, and `--no-verify` stays the owner's bypass. A
`choice: standing` is the owner's yes only where the manifest's `proceed`
allows the record's mode, and the hooks refuse it elsewhere, naming the setting.

The installed practice travels with the repository in its commit: the
change that sets the repository up, or the first change where none does,
commits every file `greenline init` wrote, the paths `.greenline/lock.json`
lists with the lock and `.greenline/manifest.json`: AGENTS.md and
CLAUDE.md, the harness folders (`.agents/`, `.claude/`, `.codex/` and any
other init wrote), `agents/openai.yaml`, and under `.greenline/` `WORK.md`,
`ledger/README.md`, `hooks/`, `tmp/.gitignore` and
`THIRD_PARTY_NOTICES.md`. A clone that holds the records without them
holds no practice to read them by.

## Planned work

A change that the plan step splits into tickets has a plan directory,
`.greenline/plans/<NNN-name>/`, which `.greenline/WORK.md` describes. The
planning change's record names the plan with `plan:`. It opens first, closes
last, and its verify section checks the whole result against the spec. Each
ticket's record names its plan and its ticket, and omits the steps the
planning record holds. The sentence above the skeletons names the steps
each record holds when the work is split. The planning record and each
ticket's record carry their own mode's budget and state their own cost;
nothing sums across them. The tickets share the planning change's branch,
each ticket's commits carrying its own trailer, and the planning change's
close offers the landing for the whole. A mode the owner names while the
ticket list waits edits that ticket's entry in `tickets.md`; a mode the
owner names when a ticket opens is an override of that ticket: its record
says `choice: owner`, `proposed` the entry's mode, and `greenline status`
marks the difference (GL0406), the owner's choice standing.

## Garden consultations

When the owner has enabled the garden connector, a consultation that serves
a change runs as `greenline connectors call garden <operation> --change <id>`,
for an open or stopped change. A question's consultation names no change.
The CLI writes one receipt collection per request under
`.greenline/ledger/receipts/`; never edit one by hand. A receipt records what
garden delivered, never what was applied: say in the change's sections what a
consultation changed, with the consultation id the read returned.

## History

A finished record is history. Once the installation moves on, `status` reads
a done or dropped record for its form alone and never judges it against a
later modes definition, so a record stays true to the definition it was
written under. A done record with no check facts is history from the start,
and `status` reports it as a notice. While a done record's latest check facts name the current installation,
`status` still judges it, and a finding's remedy corrects that record. Once
it is history, correct the change by opening a new one.

A record states no version of its form. A finished record is read for its
form alone, so one whose mode, step, floor or kind a later definition
renamed or removed still reads; an open or stopped record is read against
the guide as it stands, and a refusal names what to correct.
