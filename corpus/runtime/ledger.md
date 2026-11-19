# Change records

This folder holds one record per change, in every mode, and under
`discussions/` one per discussion. AGENTS.md owns the
request loop and the modes, and each step's skill owns its method. This guide
owns the record's format: its front matter, its states, its "next" line,
its sections and the skeleton of each mode, and the discussion's record. `greenline check` and `greenline status` read the
records; a refusal of a record's headings, its "next" line or its floors
cites this guide.
`.greenline/WORK.md` says where the other files of the work live.

## The record

A change's record is `.greenline/ledger/<id>.md`. Its id is the file name
without `.md`: the date its id was chosen and a slug, such as
`2026-10-08-retry-deadline`, chosen when the change's proposal is written,
or earlier for a start's working file, such as a diagnosis's reproducer,
as AGENTS.md says. Open it before the first edit with
`greenline open --change <id> --mode <mode>`, which writes the skeleton of
its mode below: every line the mode owes named, each with a placeholder in
angle brackets, such as `why: "<why the change exists, in one line>"`. Every
line is yours to write, and every line but the `yes` in your own words for
its meaning: replace each placeholder, the choice, the yes, why, the
`ground` and the `agent` at open, the others when their step ends, and take
out an optional line you do not use; add `from` where a discussion was
promoted into it. The `yes` holds the owner's words, those that answered
the proposal, never yours: quote them where your session heard them and ask
for them where it did not, and write nothing outside the proposal's homes
before it. No command
and no hook writes a line of the record. While the change is open,
`greenline status` names the lines the record still lacks, `record lacks:`,
and shows what the hooks saw beside them, `helpers:` and `hints:`, where the
harness gives hooks: a line that disagrees with what they saw is a notice
for you to reconcile, never a refusal. git's hooks refuse `done` while a
line the mode owes is missing, a placeholder stands, or a section holds a
word left in its place, such as `Pending.` or `TBD`; and they refuse the
first commit and `done` while the `agent` line names a model family alone,
such as `codex/GPT-6`, where the harness reports the model, naming the one
to write. One session writes a
change's record at a time: the session holding the change, which opened it
or resumed it. A session that resumes a stopped change from its record
writes on in that record, and its "next" line and sections carry on from
where the last one stopped.

### Open and stopped

A change is `open` while a session holds it, and a planning change stays
`open` while its tickets run; a wait for the owner within the session, at
a proposal, a question or a review, leaves it `open`. A pause bound to a step, such as "pause after the build", leaves it `open` too. Otherwise, while no
session holds it, it is `stopped`: `stopped` is set only on the owner's
words that end the work for now, such as "stop there for today", quoted
whole, one message of theirs, in the record's `stopped` line, or on their
request for another change, written `stopped: "another change: <their
request>"`. Git's hooks and the harness hook refuse the commit that sets
`stopped` with no `stopped` line, on words no message of the owner's holds
or that read as no stop, and on the words of an earlier stop; a record
still `stopped` at the next turn of the session that wrote it is named by
the status line, since a wait leaves it `open`, unless its `stopped` line
holds the owner's stop.
Every stop sets `stopped` and rewrites the "next" line, whether the close
step stops the work or the session that stops does. A stopped change is
set `open` before any edit of its record or its code, as the first write
of the session that resumes it. Every stop commits the record and its
folder, the check facts under it, and nothing else, with the change's
trailer, as AGENTS.md says; working edits the owner asks to commit are a
commit of their own, apart from the stop's. Uncommitted edits the owner
saw, such as tests shown for review, are kept as `shown.patch` in the
folder, which the stop's commit carries, since a clone carries commits
alone; the hooks name them after the write that sets `stopped`. A stopped change
resumes on the branch the stop's commit sits on; a change stopped before
any other commit has that commit as its first. A session on another branch, or
in a clone, finds it by that commit. One session holds one
change at a time, and several changes may be open at once. A request for
another change, not a follow-up of the change a session holds, stops that
change first, then gets its own proposal. `greenline status` lists each open and
stopped change with its "next" line beside its state.

### Stops and resumes

A "next" line whose action waits on the owner, such as
`next: "build: wait for the owner's review of the tests"`, keeps that wait
across a stop: the status line prints it as `waiting on:` while the record
is open or stopped, read from the record, and the resume goes to that wait,
never past it until the owner's words answer it. The owner's words of the
turn outrank the record's next line: where they carry on, go on, continue
or resume, or say yes to a wait that asks for one, the status line says
`the owner's words this turn answer it: set state open as the first write
and go on`, and the resumed change does so. A resume answers the stop and
not a wait for the owner's review or answer, in any form the part on the
"next" line below lists: the status line then says
`the wait on the owner stands`, and the resumed change sets the record
`open`, does the wait's act first, applying the folder's `shown.patch`
where the status line names it, and waits until the owner's yes or the
review's words answer it. Where a turn that began with the record stopped writes the
change's record, its folder or its code and leaves the record `stopped`,
the hooks say so after that write: set it `open` before its next edit. A write of a discussion or of another change
resumes nothing.

### The front matter

| Field              | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mode`             | the mode the change runs under                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `choice`           | `owner` when the owner named the mode, `accepted` when the owner accepted your proposal, `standing` when you went on without waiting because `proceed` allowed the mode; the request's words alone are no yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `yes`              | the owner's words that answered your proposal, quoted as they said them, written with `choice: accepted`; where the hooks journaled the owner's messages, one of them holds those words as a yes, or the hooks hold the work and the first commit until the owner says yes; once the change's first commit carries the record with this line, the yes is settled, and no session, clone or worktree is asked for it again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `confirmed`        | at careful, the owner's words that confirmed the frame's restatement, quoted as they said them after it was put to them: `confirmed: "<their words>"`; the hooks note when the restatement was put, by a card or the reply that ends your turn, and where they journaled the owner's messages, one said after it holds these words and confirms it: a yes or plain words such as "That's correct.", "Exactly." or "Right." in its opening clause, with no question and no word of negation or contrast such as "not", "dont", "but" or "except", an apostrophe or none, and never the yes to the proposal or an interview's answer; until it holds, the harness hook and git's pre-commit refuse every write and commit outside the change's homes, and git's hooks refuse `done` without it; a record set `dropped` is held the same, so commit it and its folder alone and make other work a new change; once a commit carries the careful record with this line and no ticket line, it is settled; a ticket's record holds none, its frame and its confirmation being its planning change's, the record that names its plan |
| `proposed`         | the mode you proposed, only when the owner chose another; a ticket's entry's mode when the owner overrode it as the ticket opened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `why`              | why the change exists, in one line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `state`            | `open`, `stopped`, `done` or `dropped`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `next`             | the "next" line, below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `outcome`          | what landed, in one sentence of the agent's own words under 200 characters, never the why repeated, written at close: `outcome: "<what landed>"`; the owner's view of the change opens on it, and git's hooks refuse `done` without it or over the length                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `floors`           | each floor you found, by the name the skeletons' section below gives it, such as `[security]`, or `none` where you found none; owed from the open in every mode, its placeholder in the skeleton                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `raises`           | each raise, one list item per raise, as below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reviewed`         | the depth the review ran at: `none`, `inline`, `written`, `independent` or `looped`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `plan`, `ticket`   | the plan directory's name and the ticket's id, for planned work; a ticket is named only with its plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `agents`, `rounds` | the cost, stated at close where the mode may start a fresh agent or run a round: the agents the line's depths started, the builder counted, and the rounds it ran, both or neither; status shows each helper the hooks saw start, fresh or forked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `overrun`          | the owner's words accepting a cost past the mode's count, quoted beside `agents` and `rounds`, `overrun: "<the owner's words>"`; `greenline status` reads the cost as accepted, and the count stays as it ran                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `starts`           | each fresh agent the line's depths started, stated with the cost: one item per start, `"<step> <n>"`, or `"<step> <n> restarted"` for a restart; a method's agent, a picture's helper among them, is listed nowhere here, and git's hooks refuse a commit of a record whose start names no step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `landing`          | the owner's words for a push, a pull request or a merge, quoted, written at close; an answer with no act, the branch left or the merge declined, as `"declined: <the owner's words>"`, which lifts nothing; for a local merge, the base the offer named before the owner's words, `"merge into <base>: <the owner's words>"`, since git's hooks refuse a merge into a base the line does not name; absent, no push: git's pre-push hook refuses one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rebase`           | the owner's words for rewriting the change's branch, a rebase or an amend, quoted; absent, git's hooks refuse the rewrite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `discard`          | the owner's words for throwing the change's work away, quoted: a hard reset, a clean, a checkout or restore of the whole tree, a forced branch delete, which the `landing` line lifts too; absent, the harness hook refuses each                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `stopped`          | the owner's words that ended the work for now, one message of theirs quoted whole, or `"another change: <their request>"`; a stopped record carries it, and git's hooks and the harness hook refuse a stop without it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ground`           | where the change's commits go, written as the record opens: `branch` for a branch in place, the current one or one of its own, or `"worktree: <path>"` for a worktree of its own, from the repository's root                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `agent`            | the harness and the model doing the work, `"<harness>/<model>"`: the harness as the status line names it, the model as the harness reports it, which the status line's ground line names where it does, never a family name alone, which the first commit and `done` refuse; every commit carries it as `Greenline-Agent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `skills`           | the skills the change used, by name, such as `skills: [frame, tdd]`, written at close: status shows beside it the skill loads the hooks noted, `greenline status --change <id>` lists them, and a line that disagrees is a notice to reconcile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `from`             | the discussion the change was promoted from, by id, written as the record opens: `from: <id>`, or a list where it was promoted from several (below, "Discussions")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `refreshes`        | each refresh the close made of the pages the change touched, by a method's fresh agent named apart and counted nowhere: `{ by: <skill>, pages: "<page>, <page>", cost: "<the agent and its time>" }`, written at close; git's pre-commit refuses `done` while a page, journey or the map the change rewrote is in no entry's `pages`, whatever the owner's words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `interface`        | whether the change touches an interface, stated in the proposal where the workspace has interface roots: `no`, `yes`, or `"yes, <register>"` with `site`, `app` or both, as `"yes, site and app"`; on `no` the harness hook refuses a write under a root                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Each field is one line, `<field>: <value>`, with no blank line between
fields. A name, a number and `none` stand bare; any other text is written in
double quotes, and it holds no double quote of its own. A list is written
flat, as `floors: [security, concurrency]`, or one item per line under
its field, each line opening with two spaces, a dash and a space, as the
raise below shows. A field outside this table is refused, unless it is the line of a
kind whose record is a line (below).

Every floor you find, at the proposal or during the work, goes into
`floors` when you find it, whatever the mode and whoever chose it. The line
is owed from the open in every mode: `greenline open` writes its
placeholder, and a list or `none` answers it; `greenline status` names it
on the `record lacks:` line until it is answered, and git's hooks refuse
`done` without it. A record opened before the line was owed adds it by
hand. The `situation:` line names a floor the hooks saw, from the class of
a file the session touched or read or from an invariants entry, that the
acting change's line does not hold; adding it is your judgment, and nothing
is refused for it. The
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
`next: "review: rerun the reviewer on the fixed commits"`. A wait on the
owner takes the form `<step>: wait for the owner's <review or answer of
what>`, such as `next: "build: wait for the owner's review of the tests,
then implement"`. Write that form; the status line also reads a wait
written `wait on`, `wait until` or `waiting on` the owner, or naming the
owner's review, answer or yes, `the owner reviews` or `the owner to
review`, and, in a stopped record, a review of shown tests. Rewrite it at every stop. A stopped record requires it. An open record may state it or
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

A frame section of the written depth records its questions in one list
form, as frame's references page gives it: each question one item,
`- Q<n> [<node>] <the question>`, with its proposed, answer,
decided and research lines indented beneath it, each round opening
with a `### Round <n>` line, and each node left closed one item,
`- closed [<node>]: <why>`, one item closing several nodes that share its
reason, `- closed [<node>, <node>]: <why>`. The change's frame map is
derived from it, below. Every question holds its `answer` and its
`decided`, `owner` or `agent`; a question the owner chose to leave open
holds `answer: open` and `decided: owner`. At careful the section covers
every node but `generic`, each asked by a question that names it or closed
by a line that names it with a reason, a research topic covering none, and
holds the restatement outside the list form; the restatement is put to the
owner once the frame is whole, and the `confirmed` line quotes their words
after it, the "next" line meanwhile `frame: wait for the owner's
confirmation of the frame's restatement`. A ticket's frame is its
planning change's, so a ticket's record holds no frame of its own to cover
and no `confirmed` line.

A section at the independent or looped depth cites its own step's reports
alone, `<id>/<step>-<n>.md`, as many as the depth starts agents, and each
report cites its own evidence; a planning change cites its tickets'
reports. The verify section of a change that touches an interface also
links the interface check's runs, `<id>/interface/` or each run's file,
beside its reports: they are the check's evidence, never a report. A step that ran without a fresh agent owes none: a review the
`reviewed` line states as `inline`, and, where the `agent` line names a
harness greenline does not know to delegate, a step `starts` names no
agent of. git's pre-commit hook
refuses `done` while the record breaks one of these forms, a frame
question with neither an answer nor `answer: open`, a `decided` other
than `owner` or `agent`, a question naming no node of the thirteen or a
line the list form does not read, a section's citation of another file
or fewer reports than its depth starts, a line its mode owes left
missing or a placeholder left in a line or a section, the `floors` line
among them, which a list or `none` answers, or a word such as
`Pending.` left in a section's place, an `agent` line naming a model
family alone where the harness reports the model, a skill the change
owed by its trigger rows that neither the loads the hooks recorded nor the
`skills` line names, with no waiver of the owner's, where the hooks
recorded loads at all (with none recorded the owed line stays a hint), an
accepted research topic with no report linked, a done record's
`outcome` line missing or over 200 characters, or, at careful, a subject
node neither asked nor closed, a frame with no restatement, a record
other than a ticket's with no `confirmed` line or a ticket's record with
one, naming the first breach in one line, and
`greenline status` names each breach of an open or stopped record.

A step's section names each skill it followed as inline code, such as
`tdd`: the record carries what was followed, and the skill loads below carry
what entered the context. The close section records the skill loads
`greenline status --change <id>` lists, each skill with its count, whole or
part and its steps, beside the skills the sections name: declared and
loaded, loaded and not declared, declared and never loaded.

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
  it; where no start was loaded the record holds no start section, and git's
  hooks refuse `done` over one that says no start ran, its first words
  `none`, `no start`, `not applicable` or `n/a`, as over a placeholder; the orientation is a habit of the first change's frame, and a start
  it loads, `groundwork` on an empty tree, is named there like any other;
- a kind whose record is a line writes one optional front-matter line,
  `<kind>: "<text>"`;
- a kind whose record is none writes nothing, as a habit does.

An interface change's record may hold one `## Interface` section, wherever
it stands among the others, beside `design` most often: the owner's
rulings the design references page names, `- unlock`, `- floor` and
`- page` lines, quoted in the owner's words; `- app <origin>`, the origin
the app serves, which `greenline check interface --path <page>` reads in
place of `--url`; and `- limit <address>: <your words>`, a capture the
check could not make, named for the owner in your words beside the limit
the check's fact keeps, which `done` reads before it lets the page's
render stand on that limit.

The parse refuses a record, and nothing else about it is judged until it
parses: a file name that is not a real date and a slug; no front matter, an
unclosed one, or one holding a blank line, a repeated field or a line that is
no field; a field this guide does not define, or a value its field does not
take; a mode, a floor or a raise's mode the modes do not hold; `proposed`
without `choice: owner`, or equal to the mode; a raise from the record's mode
or above, raises that do not ascend, and a raise that states where it went; a
stopped record whose "next" line is absent or `none`, and a done or dropped
record whose "next" line is not `none`; a `skills` item that is no skill's name; a `from` item that is no real date and a slug; a "next" line that does not open with
a step of the modes; a ticket named without its plan; a cost that states one
of its two counts; a start that is not a step of the modes and a number,
`restarted` after them or not; and, by name, a heading that is no step, no kind's
section and not the Interface section, a second Interface section, a heading of a kind that writes nothing or writes a line, and a
repeated or misplaced section. A record that does not match its mode is never
refused. `greenline status` reports it as a finding with its remedy instead: a
section for a step the mode does not run that holds anything but its
`none at <mode>` line, a section a done record's mode requires and the
record lacks, a done record with no section for a step its mode does not
run, a section the split gives to the plan's or the tickets' records, a
design section that holds anything but `none, no interface` where the
record does not say `interface: yes`, an inline section of more than one
line, the close's marks line on a line of its own not counted, more
rounds than the mode allows, a "next" line naming a step the record does not
run, a floor the mode does not meet when you went on without waiting
(`choice: standing`), and a cost over the mode's budget.

## The skeleton of each mode

These skeletons, the floors' names and the split are generated from the
modes definition. `greenline open` writes the skeleton for the change's
mode: replace its placeholders in your own words, and take out the
optional parts you do not use. The design section runs at its depth only where the record
says `interface: yes`; where it says `interface: no`, or the workspace names
no interface roots, the section is the one line `none, no interface`, and a
record without the `interface` line may leave the section out.

<!-- greenline: the skeleton of each mode -->

## The change's folder

`.greenline/ledger/<id>/` holds what the record cites, whatever the mode.
Every fresh agent writes its report there, and only there, as
`<step>-<n>.md`: the step it serves and its number, the agent's at the
independent depth and the round's at the looped depth, such as
`review-1.md`, `review-2.md` or `anticipate-1.md`; a research agent frame
starts writes its report under `.greenline/tmp/<id>/` and files it with
`greenline research report <file> --change <id> --topic R<n>`, which
writes `frame-research-<n>.md` with its first line
`<!-- generated by the research start: report <n> -->`, and the frame
section cites it. The record links it, such
as `[review](<id>/review-1.md)`, and the builder never edits it. The briefs
`greenline brief` writes stand there too, below. A file in a finished
change's folder that nothing cites is reported.

`greenline event` derives the folder's `frame-map.json` from the record's
frame section after each tool, once that section holds a frame, until HEAD
carries the record done or dropped, so the write that closes the record
derives it once more and the closing commit holds the map it states: the
frame's thirteen nodes, each open, closed with its reason or untouched,
each question with its node, its round, the answer proposed, the answer
taken, who decided and the research it drew on, and the rest of the
section as the restatement, opening with its `generatedBy` key. It is
generated: never edit it, the record never cites it, and `greenline tidy`
leaves it. The inspector draws it on the change page.

A durable visual the change made stands in the visual home,
`.greenline/visuals/<id>/`, with its manifest beside it, never in this
folder; `greenline picture keep` writes the two together, on the owner's
ask, and is the one door into that folder. Its `--ask` is the owner's whole
message asking for a lasting picture, or a whole sentence of it, as they
said it: the command refuses none, a fragment, words no message of theirs
holds, and a question that asks for no picture, which is answered inline.
It writes the manifest's `madeBy` from what the hooks saw: `agent` where a
fresh agent drew the file, `session` where the session did, and none where
the hooks saw no write of it. `greenline event` keeps the folder's `visuals.json`, the change's
links to them, after each tool; the record links it once, as
`[visuals](<id>/visuals.json)`, and may link a visual itself where its
section explains it, as `[the request path](../visuals/<id>/request-path.svg)`.

## The skill loads

`greenline event` notes each roster skill the agent loads: a skill's file
under `.claude/skills/` or `.agents/skills/` that enters the context through
the Skill tool, a reading tool or a shell read such as `cat` or `sed -n`. A
load is written first to the session's fact,
`.greenline/ledger/sessions/<date>-<session>.jsonl`, with the turn it
happened in, since loads come before any record: the orientation, frame's
reading before the proposal, a question, a resume. When the session writes a
change's record, opening it or resuming it, by a write tool or a shell
command, the loads the session noted for no change since it last named
one join the change, and every later load goes to the change the branch
holds, open, stopped, malformed or closed and not yet committed, the
session's naming deciding only where the branch holds none, each appended to `.greenline/ledger/<id>/skills/<date>.jsonl`: the skill, the file, whole or
part, the tool or the verb, the time, the step the record was in, the fresh
agent that loaded it, the session and the turn. A session that opens no
change keeps its loads as its own. Both files are generated: never edit
them, the record never cites them, and `greenline tidy` removes neither.
The session's file is local: its folder's own `.gitignore` keeps it out
of every commit and out of `git clean -f`'s reach, while the change's file
is committed with the change.

A load says what entered the context, never what was followed; the
sections say that. A read outside the skill roots is never noted, so the
facts hold none of the repository's own file names. A harness that injects
a skill without a tool call, as Codex may for a skill it loads natively,
fires no hook, and its loads under-count there.

## Marks

A mark is the owner's hand on a capture: one element, or a region drawn
over it, at one width, with a note and an intent (`fix`, `question`,
`options` or `idea`). Marks stand in `marks.jsonl`, in the folder of the
change open on the mark's address, or in `.greenline/ledger/interface/`
while none is; each line is the whole mark after one act, and the last line
of an id is the mark. A mark binds its capture's id and commit, its
element's selector, box, role, text and source, its crop, who made it and
when. `greenline status` and the status line print
`marks: <n> open on <address>`, and name a mark stale once a commit since
its capture touched the files it shows. Open marks on an open change's
address join that change as a follow-up; with no change open they are the
next proposal's input, which lists them. The close section copies the
`marks:` line status prints, or `marks: none open`: on a line of its own,
or in a quick close's one line as its last clause, since the clause runs
to the line's end; git's hooks refuse `done` while it disagrees with the
marks files.

Write a mark only through `greenline mark`: `add` records one the owner said
in words, quoting them; `propose` records the closure you propose with its
evidence, the capture after and the commit, and leaves the mark open; `close`
records the owner's closure, `addressed` or `declined`, quoting the owner's
words, and refuses without them. The owner marks and closes in the viewer
too. A hand edit of the file is refused, and a mark never closes on your
word alone. A closure in words quotes the owner's verdict on that mark, an
outcome such as "fixed" or "declined" or words that name it; an
instruction to close marks unseen, such as "close them all yourself", is
none, and `close` refuses it: leave the marks open and say so.

## The brief and the relay note

Every fresh agent gets one brief, whatever its step: the change record's
front matter less its `agent` line, the change's acceptance, the change's id, the path of its
report, the absolute path of its scratch folder,
`.greenline/tmp/<id>/<step>-<n>/`, and the skill it works by, to read whole; then the extras of its
step, which that step's skill names: review adds the builder's paragraph of
intent and, where two agents read, the axis; anticipate adds the artifact
and its contract, never the claim; design adds the ask's answers and the
lock; verify adds nothing. On a change that
touches an interface, a reviewer's and a verifier's brief also carry the
record's design section and design's critique or capture page. Nothing else: never
the builder's other sections, its diagnosis or another agent's findings,
which are the builder's claims. Every working file the agent writes goes in
its scratch folder, or where its skill names under `.greenline/tmp/<id>/`,
never the host's temporary directory, and a working file there is a finding.
The brief names no model, effort or harness setting. A brief `greenline
brief` writes carries a nonce its report cites on its first line, `<!--
brief nonce <hex> -->`, so status reads that the report's agent read the
brief where the harness shows no spawn; status shows each helper the hooks
saw start as fresh or forked, from Claude Code's agent tool and Codex's
rollout. No fresh agent delegates: it does its whole step itself and starts
no agent of its own. An agent a habit or a step's method starts gets this
brief too, with the extras the page that starts it names.

The brief of every step that starts a fresh agent, design's, anticipate's,
review's and verify's, is a file the builder never writes:
`greenline brief --change <id> --step <step> --round <n>`, with review's
`--intent` and, where two agents read, its `--axis`, anticipate's
`--artifact` and `--contract`, and design's `--extras`, writes it from the
record to `.greenline/ledger/<id>/brief-<step>-<n>.md`, `<n>` the number
its report takes, its first line the command's mark, and prints its path.
Start the agent with that path and nothing else. The builder never opens,
copies, diffs or derives a brief file, one the command wrote included: a
read of one is a finding for the next review, and `greenline status`
reports a brief file in the folder that the command did not write (GL0408).
`greenline status --change <id>` lists the briefs the command wrote, and the
close section links each one from that listing. After a tool writes a
helper's report, the hook names one that cites no nonce of its brief, or
one of these steps with no brief the command wrote. A harness with no
delegation can hand a brief file
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
research agent, a design agent, a picture's helper or wayfinder's reader,
is named in the section it serves, counted nowhere and listed nowhere:
neither in `agents` nor in `starts`, which names the starts of the line's
steps alone; the close's refresh agent is named in `refreshes`. `greenline status` judges the cost
against the mode's budget: the agents the mode table in AGENTS.md gives, and
the rounds its depths allow, the fix rounds once for each step that takes a
fix pass outside a loop plus each looped step's rounds. `agents` counts every
start, a restarted agent one more line in `starts` and one more count, and
`greenline status` reports an `agents` below the builder and the starts the
record names, in `starts` or by a fresh agent's report in its folder, as
GL0409, which the close clears before `done`. A cost past the mode's count
is never lowered to fit: where the owner accepts it in words, the close
quotes them in `overrun`, and `greenline status` reads the cost as accepted,
GL0402 silent, the change's facts naming the acceptance beside its mode.

## Checks

Run every check through `greenline check -- <command>`, or
`greenline check --change <id> --step <step> -- <command>`. It runs the
command with its output shown and writes the facts of the run under
`.greenline/ledger/<id>/checks/`: the arguments, the outcome, the duration,
and the commit and the tree id of the code, `.greenline/` and every file
`.greenline/lock.json` names left out. It stores
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
check the change ran, is red, unfinished or absent, and while an atlas
page, a journey or the map the change rewrote is named in no `refreshes`
entry's `pages`, whatever the owner's words. Where the manifest's
`interface` block sets `check`, a change whose record says `interface: yes`
is held to `greenline check interface` as a declared check, its findings
written by tier under `.greenline/ledger/<id>/interface/`; a reflex finding
is cleared by a line of the build section, `waived: <rule>: <reason>; the
owner's yes: "<the owner's words>"`, and a floor never is. Where the repository
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
earlier commit, a mutation run, a negative control or a bench, runs through
`check` too, its command run in the baseline's copy where it has one, and
is then marked a probe, so no run a section cites stays plain and none
counts as a check of the change.

A recorded check fact is never removed or edited, by the session holding
the change or by a fresh agent: a rerun of a command records a new fact
beside the earlier ones, and `check` never writes over a facts file already
standing. Each fact names, as `previous`, the newest fact the folder held
when its run started, so `greenline status` names a fact removed from
between two runs (GL0459), whose remedy is to restore it from history; a
fact removed while it was the newest leaves no trace, since the next run
names the one before it, and that is no licence to remove one. A probe recorded through `check` stays where it is:
mark it with `greenline check --change <id> --probe <fact>`, and `status`
leaves it out of the change's checks, the latest-run rule and GL0451
included; the verify section says why it was marked.

## Commits

Every commit of a change carries the trailer `Greenline-Change: <id>`,
written when the commit is made, in the message's last paragraph, where Git
reads trailers: a line the harness adds there, such as `Co-Authored-By`,
shares that paragraph, with no blank line between them, and the change's
trailer is its last line. Just above it stands `Greenline-Agent:
<harness>/<model>`, the record's `agent` line, so every commit names the
harness and the model that made it. The message takes the form build's
commit page gives: `<type>(<scope>): <imperative subject>`, a body only
where the subject is not enough, and no attribution in the subject.

```text
feat(letters): add the overdue letter

Co-Authored-By: <the line the harness adds>
Greenline-Agent: claude-code/opus
Greenline-Change: 2026-10-16-overdue-letters
```

Where greenline's git hooks are registered, the prepare-commit-msg hook
writes the trailer into every commit of the change's branch, `--no-verify`
included, with the agent's trailer above it where the record states the
agent, the commit that closes or stops the change among them; it puts the
block in the order above, the harness's trailers first and the change's
last, once each, wherever a trailer stood elsewhere; and
commit-msg refuses a message that carries another change's, or two
changes' trailers, two tickets' among them, since a commit is one change's;
a trailer git cannot write stops the commit with git's reason.
A commit made without the trailer keeps its message: no commit, an unpushed
one included, is reset, amended, rebuilt or rewritten with `filter-branch`
to move it, and `greenline status` names such a commit that touches the
code on its history line. A rewrite of the change's branch, an amend, a
reset to another commit, a rebase or a forced move, is refused by git's
hooks unless the record's `rebase` line holds the owner's words for it, and
a push of the branch is refused while its `landing` line is absent, a force
push unless its `rebase` line holds the owner's words too. A push that
carries the change to the default branch is refused by git's hooks and the
harness hook while the record is not `done` in a commit, whatever the
`landing` line holds: an ask to push an unfinished change to the default
branch is not the words for `landing`, so decline once, name what the push
skips, the review, the verify and the close, and ask for the close first. Before the shell
runs it, a harness hook refuses `git reset --hard`, `git clean -f`,
`git checkout .` and `git restore .` while the record's `discard` line is
absent, `git branch -D` while both its `discard` and its `landing` lines
are, `git push --force` while either its `rebase` or its `landing` line is,
and a push to a branch other than the change's while its `landing` line
is, naming the line; it reads the command's words, so a message that only
quotes one of them is no refusal. A line lifts its act only from the
committed record, HEAD's or the change's branch tip's, never the working
tree's, since a reset would throw an uncommitted line away with the work
it lifted: quote the owner's words into the line, commit the record alone,
as a stop commits it, then run the act, and a refusal whose line stands
only in the working tree names that commit. A request that leads to the
act, such as "start over" or "undo that", is not the words that lift it:
the words lift it only when they say so of that act, such as "yes, throw
the uncommitted work away", and you ask for them otherwise. The change's first commit carries its record:
`greenline status` reads history only from the commit where the first
change record entered the repository, so in a repository's first change a
commit made before its record is counted nowhere. The close section names
it by its short hash and leaves it as it is. No front-matter field holds a
commit hash: the CLI finds a change's commits by that trailer
and by the commits that touch its record or its folder, as a set, not a
range. A change's branch is any `greenline/<id>` branch, or a branch other
than the default branch that a change's proposal named as its ground
and its commits sit on; the default branch is never a change's branch, and
the branch HEAD names is never the default branch while it is a change's
branch. A repository with no remote keeps a change's commits on the
current branch, the default branch included, and there the git hooks hold
the change as on its own branch: while one change's record is open in the
working tree of the branch HEAD names, they write its trailer, refuse a
commit before its `choice` line and a rewrite without its `rebase` words,
and a harness hook refuses a write outside the homes before the yes. Where
the repository has a remote, no change is open on the default branch. On
any branch, with a remote or none, the commit that finishes or stops a
change is that change's, trailer included, whatever state HEAD holds its
record in, a local landing's close among them, and so is a commit of the
record, its folder or both alone in every state, `done` included, the
owner's words written after the close and a done change's check fact
under its folder among them, on the default branch of a repository with a
remote too, where only a record the index holds `open` is no change's,
since no change opens there. On any branch, with a remote or none,
so is the commit after a local landing's merge, the merge carrying the
change's trailer, that stages only the change's record and folder: it
records the merge's checks, and the hooks refuse its `done` while the
latest run of a check is red. The hooks read each record as the commit
carries it, the staged version, never the working copy apart from it.
The interface home's `paths.json` and `survey.json` under
`.greenline/ledger/interface/`, which the change's interface check writes,
go beside the record or its folder in a commit of them alone, `done`
included; beside
code once the record is `done` they are refused, and staged with no record
or folder they are read as any other path.
A record and its folder are staged by path, never the ledger whole:
pre-commit refuses a change's commit that stages a path under another
change's record or folder, naming the path and the change, since a tool
such as the inspector may have rewritten a finished change's file. Unstage
it and tell the owner it changed; a commit of that change's record and
folder alone is that change's, with its trailer, on any branch.
While no change is open on the
branch HEAD names, pre-commit refuses every other commit, "no change is open on
<branch>, so nothing is committed there yet; open the change's record
under .greenline/ledger/ first, once the owner has said yes", and a harness
hook refuses a write outside `.greenline/ledger/` and `.greenline/tmp/`
with the same words. A record HEAD holds `done` or
`dropped` changes only in a commit of the record and its folder alone, the
owner's words for the landing among them, and never with code beside it,
on every branch, the change's own included: pre-commit refuses such a
commit, naming the commit of the record alone, and its code is a new
change's.
The refusal leaves alone a merge commit, a conflicted merge concluded
with `git commit` among them, and the commit after a local landing's
merge, which is the change's as above. `--no-verify` stays the owner's
bypass: a refusal you believe wrong is reported to the owner by its
first sentence, in their terms, and never worked around, by a working copy
set apart from the index or any other way. A
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
holds no practice to read them by. What `greenline sync` changes takes the
same rule: the change that is open, or the next one, commits it with its
work, never in a commit of its own, and greenline commits nothing.

## Planned work

A change that the plan step splits into tickets has a plan directory,
`.greenline/plans/<NNN-name>/`, which `.greenline/WORK.md` describes. The
planning change's record names the plan with `plan:`. It opens first, closes
last, and its verify section checks the whole result against the spec. Each
ticket's record names its plan and its ticket, and omits the steps the
planning record holds. The ticket list, `tickets.md` with each ticket's
mode, stands in the plan directory, and the planning record names the plan
with `plan:`, before the reply that asks the owner to approve the list;
`greenline status` names a planning record that waits on its tickets
without them. The sentence above the skeletons names the steps
each record holds when the work is split. The planning record and each
ticket's record carry their own mode's budget and state their own cost;
nothing sums across them. The tickets share the planning change's branch,
each ticket's commits carrying its own trailer and no other ticket's, and
the planning change's close offers the landing for the whole, its
landing words committed with its record alone on whichever branch holds it. A mode the owner names while the
ticket list waits edits that ticket's entry in `tickets.md`; a mode the
owner names when a ticket opens is an override of that ticket: its record
says `choice: owner`, `proposed` the entry's mode, and `greenline status`
marks the difference (GL0406), the owner's choice standing.

A plan extended during a change, a ticket added to `tickets.md` or a plan
document edited, is committed at that change's close: staged with its
closing commit, or committed before it with the planning change's record
alone on the planning change's branch, as a ticket's commits are. git's
pre-commit hook refuses the closing commit's `done` while a file under
the folder of the plan the record names, or that plan's planning record,
holds an edit the commit leaves behind.

## Discussions

A discussion is an idea explored before it is work, beside a change or
instead of one: a whether, a what or a how about something not yet built.
Its record is `.greenline/ledger/discussions/<id>.md`, its id a real date
and a slug chosen when it opens and never one a change holds, and its
folder `.greenline/ledger/discussions/<id>/` holds the research reports it
cites. It has no mode, no ground, no branch and no checks: it runs frame at
the written depth, as frame's references page says ("Discussions"), and
writes only its record and its folder, which the hooks admit before any
yes.

```markdown
---
idea: "<the idea, in one line>"
state: open
---

## frame

<the questions in the list form above, each with its node; the nodes left closed with why; the restatement>

## research

<each report in the folder, linked, with what it answered>

## open questions

<each question still open>
```

| Field     | What it holds                                                                   |
| --------- | ------------------------------------------------------------------------------- |
| `idea`    | the idea, in one line                                                           |
| `state`   | `open`, `parked`, `declined`, `promoted` or `merged`, set on the owner's word   |
| `words`   | the owner's words that set the state, quoted; every state but `open` holds them |
| `revisit` | for a parked discussion, when to come back to it                                |
| `reason`  | for a declined one, why; it is kept if the discussion opens again               |
| `changes` | the changes it promoted, by id, such as `changes: [2026-10-24-cache-headers]`   |
| `into`    | for a merged one, the discussion it joined                                      |
| `related` | the discussions it relates to, by id                                            |

The fields take the form the change record's do. The body holds the three
sections above and no other, each at most once, and no text before the
first. The frame section takes
the question list form, its decisions the questions with an `answer`; a
question still open stays in the frame without one and is named under
open questions. A question's `decided` is `owner` or `agent` alone, never
a sentence: why the owner chose stands in its `answer`.

Each state is set at the end of a discussion session on the owner's word,
never by you alone, and its `words` line quotes that word: `open` while it
is explored; `parked`, set aside until its `revisit`; `declined`, with its
`reason`; `promoted`, once it became one or more changes, each named in
`changes`; and `merged`, joined into the discussion its `into` names. A
record that moves its state with no words of the owner's it did not hold
before is refused by git's pre-commit hook, and so is a record that does
not read as this form.

The record and its folder are committed where the owner sits, with no
change open or beside one, in a commit of their own: a commit whose paths
lie only under `.greenline/ledger/discussions/` carries
`Greenline-Discussion: <id>` for each discussion it touches, which the
prepare-commit-msg hook writes, and no change's trailer, which commit-msg
refuses there. Pre-commit lets
it through while no change is open, and refuses a commit there that mixes
those paths with any other. Nothing of a discussion reaches a branch but
its record's commits.

A discussion's working files, a research agent's scratch and the texts it
fetched, go under `.greenline/tmp/<id>/`, under the discussion's own id.
`greenline tidy --discussion <id>` removes them once it is declined,
promoted or merged and no file of the ledger cites them; the reports in
its folder are permanent.

A change promoted from a discussion names it in its record's `from` line,
and its proposal says so. Its frame section starts from the discussion's
decisions and asks none of them again, and the discussion's research
reports are copied into the change's folder, under
`.greenline/ledger/<change>/discussions/<id>/` so two discussions' reports
never meet, where its frame cites them.
One discussion may promote several changes, a large one a planning change,
and a change may name more than one discussion in `from`.
`greenline status` lists the open and parked discussions beside the
changes. It names a discussion record that does not read as this form, a
change whose discussion holds a report its folder lacks, and a record whose
`from` line names a discussion whose `changes` line does not name it, a
notice: say which of the two lines is wrong and correct it.

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
