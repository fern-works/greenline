# The pipeline

You describe the work. The agent proposes a mode, waits for your answer, and
then runs the steps that mode gives, each at the depth the mode sets.
[Every change, in every mode, leaves one record of why, what and how.]{claim: Every change in every mode leaves one change record}
A fresh session can resume the work from that record alone.

<!-- diagram: pipeline-rail -->

## The mode: proposed, then waited on

A mode is a promise about time and assurance. Reading a skill, running a
step, starting another agent and repeating a round all spend time, so a
more careful mode costs more and catches more. There are three: quick,
regular and careful.

Before its first proposal in a session, the agent reads the situation
`greenline status` prints: the commits, the change records, the knowledge
homes, the languages and the changes stopped on other branches
([the status reference](./status.md)). While no branch of the repository,
local or one a clone brought, holds a change record, the first request for
a change is the orientation. On an empty tree, where the situation shows no
commits and no languages, it is `groundwork`: its own change before a
feature you asked for, or your request's own change when you asked to set
the repository up. Otherwise it is a survey of the documents the repository
already keeps, through `architecture-survey` where it is installed, its
result written into the knowledge homes under a quick record opened first,
so later sessions read those. A
question needs no orientation. A session that resumes, or is asked "what
were we doing?", with no open or stopped change says so, proposes nothing
and asks what you want done.

| Mode    | Promise                                                | Typical request                             | Agents, at most |
| ------- | ------------------------------------------------------ | ------------------------------------------- | --------------- |
| quick   | quick, the builder alone                               | a settled one-commit fix                    | 1               |
| regular | one fresh review and one fix pass                      | a bounded change with a clear goal          | 2               |
| careful | the premise attacked, two reviews and a fresh verifier | open decisions, a floor, or several tickets | 5               |

The agents count the one doing the work, the builder, and every fresh agent
the mode's depths start: at careful, one that attacks the plan's premise
before the build, two reviewers and a verifier. An agent a step's method
starts, such as a research agent reading sources at frame, is named in that
step's section and counted nowhere.

[Before any edit the agent states the mode it would use, why, its cost in agents and rounds, any risk it found, and whether it can start a second agent. Then it waits.]{claim: The agent proposes a mode and waits for the owner's answer}
The proposal also says where the change's commits will go, read from the
repository's local setup with no network command: the branch you are on
when it is not the default branch or the repository has no remote, and
otherwise a new branch, `greenline/<id>`. The agent reads the remote's
state only as your repository holds it, its remote list,
`refs/remotes/<remote>/HEAD` and the remote-tracking branches beside it,
and your branch's upstream, and before the proposal it never runs `git ls-remote`, `git fetch`, `git pull` or any
other command that contacts a remote. The default branch is the one
`origin/HEAD` names, else your `init.defaultBranch`, else the branch you
are on when it is no change's branch (a `greenline/<id>` branch, or
another branch a change's proposal named; the default branch is never one); when none can be read, or HEAD is
detached so you are on no branch at all, the agent names no branch and
asks you. A change's commits never go to another
change's branch, a ticket's going to its planning change's: asked for a
new change while you sit on another change's branch, the agent proposes the default branch
where there is no remote, and otherwise a new `greenline/<id>` made from
it. Where a rule of your repository pulls the other way, such as a
contribution guide that wants every change on a branch of its own, the
agent names that rule beside the branch it proposes rather than following
it in its place, and your answer decides. The change's id, a date and a
slug, is chosen with the proposal, so the
branch, the working files and the record share it.
You accept the proposal or name another mode or branch, and your choice is
final; a mode you name above the agent's has its cost in agents and rounds
restated before the work. A request that names a mode, such as "fix this
in quick", or a branch has chosen it. A worktree holds the change's checkout
only when you ask for one and your harness runs the session in it; the
agent never makes one. The agent goes on without waiting in two cases
only: your request names the mode, or the workspace's `proceed` setting
allows the proposed mode. By default `proceed` allows none. Your yes to a
mode is the mode your request names or your answer to the proposal, which
the record keeps as its `choice` line: a request to commit, to checkpoint, to "go ahead" or to put
a fix straight into a file is not that yes, and neither is "implement
without asking", so under the default the agent still proposes and waits.
The proposal still comes before the first
edit: the agent states the mode as taken, its reason and where the commits
go, and asks only a choice your request leaves open. Where a rule of your
repository forbids committing on the branch the setup gives and your
request names no branch, the branch is such a choice: the agent asks which,
recommending `greenline/<id>`, and starts once you answer; a branch you
leave to it is one your rules allow, never one they forbid.

A floor is a risk that makes the proposal careful: secrets or
security, a data migration, concurrency, a public contract, or a change in
behavior that no check could catch. A mode you named stays as you named it,
and a floor or a risk the agent finds later is reported and changes
nothing. Under a proposal you accepted, the agent proposes a raise and
waits again before going on. Either way the record names every floor found
and where it came from; where you name a mode below a floor, the record
says `choice: owner`, with the mode the agent proposed and the floor's
reason, so a reader sees that you chose below it.

A question needs no mode and leaves no record. Neither does a step you ask
for by name that changes no file, such as "review this branch", "verify
this" or "grill me", or a start that edits no file. A decision or a term
written only into the knowledge homes, the decisions book, the ADR home or
the glossary, opens a quick record first, as every write does. A follow-up inside an open change joins that change. A
request for another change stops the open change first, so a later session
can resume it from its record.

## The line: seven steps at the mode's depth

Every change runs the same steps in the same order: frame, plan,
anticipate, build, review, verify and close. Each step's skill is the
method it runs, taken from its sources, and beside it a page of greenline's
own mechanics, `references/greenline.md`: where the step's work lands in
the record, the section's form at each depth and the commands it runs. The
agent reads both when the mode reaches the step. The mode sets how deep
each one runs:

- **none**: the step is skipped, and its section holds the one line
  `none at <mode>`, so every record keeps every section whatever its mode;
- **inline**: the agent doing the work does it, in one line of the record;
- **written**: that agent writes the step's section;
- **independent**: a fresh agent does it and writes a report the record
  cites.

| Step                 | quick  | regular              | careful               |
| -------------------- | ------ | -------------------- | --------------------- |
| frame                | inline | written              | written               |
| plan                 | inline | written              | written               |
| anticipate           | none   | none                 | independent, 1 agent  |
| build                | inline | written              | written               |
| review               | none   | independent, 1 agent | independent, 2 agents |
| verify               | inline | written              | independent, 1 agent  |
| close                | inline | written              | written               |
| Fix rounds, per step | 0      | 1                    | 2                     |

The fix rounds are per step: review's findings and verify's verdicts each
get their own fix passes, one at regular and up to two at careful, and a fix made after verify is reviewed
again only if you ask. A quick fix still frames, plans, builds, verifies
and closes, each in one line, and its review section says `none at quick`.
What each step does:

- **frame** turns the request into a shared understanding: the intent, what
  is out of scope, the terms and the questions still open. At regular the
  agent answers the open questions from the repository and states each
  answer for you to correct; at careful it puts every open behaviour to you
  in an interview. "Grill me" asks for it alone.
- **plan** writes the plan before the build: the plan section of the
  change's record, or a plan directory when the work splits into tickets.
- **anticipate** is careful's premise review: before any code, a fresh
  agent takes each claim the build would rest on and tries to disprove it.
  Quick and regular skip it.
- **build** turns the plan into code one tested slice at a time, and records
  each deviation from the plan and each approach tried and dropped.
- **review** reads the change's commits against the repository's standards
  and the change's acceptance. A fresh reviewer gets the one brief every
  fresh agent gets, with the builder's one paragraph of intent and nothing
  else: never the builder's diagnosis or its other sections, nor an earlier
  reviewer's findings. The builder reads the reviewer's brief only where review runs
  inline, on a harness with no delegation or when you ask for a review by
  name, and reviews its own work; at the independent depth the reviewers
  alone read it. There `greenline brief` writes each
  reviewer's brief from the record into the change's folder, and the
  builder starts the reviewer with the file's path and never opens, copies,
  diffs or derives it.
- **verify** proves each item of the acceptance with a check that could
  fail. The result is verified, not verified, or inconclusive with its
  limit named. A fresh verifier starts from the brief `greenline brief`
  writes, as a reviewer does; its verdicts stand, and each item not
  verified goes back to the build. A baseline at an earlier commit runs in
  a copy of that commit, never over the change's working tree.
- **close** moves the lasting decisions and the new terms into their homes
  before the checks' last run, runs the checks again when `greenline status`
  counts commits of code since the last recorded one, sets the record's
  state, `done` only when the latest run of every check is green, and the
  change's cost, every fresh agent started named in `starts`, and links
  each brief `greenline brief` wrote. At every close, the quick mode's
  included, it removes the working files with `greenline tidy`, which never
  removes a file the record cites.

[A change closes only when every step its mode runs is recorded, and while its latest check ran under the current installation, `greenline status` reports a done change that lacks a section its mode requires or whose checks failed.]{claim: A done change has every step its mode runs recorded and no failed check}
A done change with no check facts at all is read as history and never
judged; it is reported as a notice.

Two other kinds of skill sit beside the line, and each loads only in its
situation, never ahead of it. A start loads once, in one of three cases: at
the orientation, when a request begins in its situation, or when you name it;
it then hands the job to a mode: "what were we doing?" opens the router, a
known failure opens diagnose. A habit, such as tdd or secrets, loads only when its situation
arises, at any step: secrets with a secret in reach, never for a commit
that has none. The record names a start only when it ran.
[The skills](./skills.md) lists them.

## One agent at a time

Agents run one after another, never in parallel, and all in the change's one
checkout, never a separate worktree. A depth that needs a fresh agent starts
it through the harness's delegation, waits for its report, and only then
goes on. Every fresh agent gets one brief: the record's front matter, the
acceptance, the change's id, the path of its report, its scratch folder and
the skill it works by, then its step's extras; an agent a step's method
starts gets the same brief with the extras its page names. A reviewer's and
a verifier's brief is a file greenline writes, never the builder:
`greenline brief` writes it from the record into the change's folder,
`.greenline/ledger/<id>/brief-<step>-<n>.md`, its first line marking it as
the command's, and `greenline status` reports a brief file there that the
command did not write. Anticipate's brief is still the builder's working
file, under `.greenline/tmp/<id>/`. A fresh agent starts no agent of its
own, and its report is `.greenline/ledger/<id>/<step>-<n>.md`, such as
`review-1.md`. Every working file it writes goes in its scratch folder,
`.greenline/tmp/<id>/<step>-<n>/`, or where its skill names under
`.greenline/tmp/<id>/`, never the host's temporary directory, and
`greenline check`, given the `--step` and the `--round <n>` its brief
names, runs its checks with `TMPDIR` set to that folder. Each start is
counted: a fresh agent restarted is one more agent, and the record names
each start in `starts`. The agent tells whether it can start a fresh agent
from the delegation tool the harness gives the session, says so in its
proposal, and never starts one to find out.
Where the harness has no delegation, every independent depth runs without
a fresh agent: review inline, verify at the
written depth, anticipate as a self-questioning pass the agent marks
degraded. The step's
section says so; nothing is skipped silently.

## The change record

A change's record is one Markdown file, `.greenline/ledger/<id>.md`. Its id
is the date it was chosen and a slug, such as
`2026-10-08-retry-deadline`. The agent opens it before the first edit, from
the skeleton for its mode in `.greenline/ledger/README.md`.

```markdown
---
mode: regular
choice: accepted
why: "Keep the caller's deadline across retries."
state: stopped
next: "review: start the reviewer on the change's commits"
---

## frame

Retries reset the deadline; the caller's deadline must hold for the whole call.

## plan

Carry the deadline in the retry context and stop retrying once it passes.

## anticipate

none at regular

## build

The context now holds the deadline; a test covers three retries.
```

The front matter holds the mode and how it was chosen (`owner` when you
named it, `accepted` when you accepted the proposal, `standing` when the
agent went on without waiting because `proceed` allowed the mode), why the change exists, its state (`open`,
`stopped`, `done` or `dropped`) and the "next" line; at close it states the
cost, `agents` and `rounds`, with `starts` naming each fresh agent started,
`"review 1"` or `"review 1 restarted"`, and `greenline status` reports an
`agents` below the builder and those starts. Two more lines carry your
word to git's hooks: `landing`, written at close with your words for a
push, a pull request or a merge, and `rebase`, with your words for
rewriting the change's branch; while either is absent, a hook refuses that
act. The "next" line names
the step reached and the action that resumes it. A wait for your answer
within the session, at a proposal, a question or a review, is no stop: the
record stays `open`. A stop is the session leaving the change unfinished,
as it ends or as a request for another change stops it. Every stop sets
the state to `stopped`, rewrites the "next" line and commits the record and
its folder, the check facts under it, with the change's trailer, so a
session on any branch, or in a clone, can find the change; a step stopped
midway keeps its section as written so far. The stop's commit holds nothing
else: the change's uncommitted edits stay for its resume, working edits you
ask to commit are a commit of their own, and while the stopped change's
edits are in the tree the agent proposes no new change but says so and waits
for you. The
session that resumes the change sets it to `open` again as its first
write, before any edit of its record or its code. Several changes may be
open at once, a planning change while its tickets run among them, but one
session holds one change at a time. The body has one section per step of
the line, written when the step ends; a step the mode does not run holds
the one line `none at <mode>`.

Beside the record, `.greenline/ledger/<id>/` holds what it cites: each fresh
agent's report, the briefs `greenline brief` wrote, and under `checks/`
the facts of every check run through `greenline check`: the arguments, the
outcome, the duration, the commit and the tree it ran on. A check stores no output. Every check of the change's
code runs through `greenline check`, its red runs and a reviewer's or a
verifier's included, and so does a rerun made only to read why a test
failed; the same command run plainly proves nothing to the record. Its
short form, `greenline check -- <command>`, takes the one open change and
the step its record is in. A probe, a run whose green the change never
claims, such as a mutation run or a baseline at an earlier commit, runs
outside it. A
recorded fact is never removed or edited: a rerun records a new one, and a
probe recorded by mistake is marked with
`greenline check --change <id> --probe <fact>`. Every commit of the change
carries the trailer `Greenline-Change: <id>` from the moment it is made, as
the last line of the message's last paragraph, beside any trailer the
harness adds there such as `Co-Authored-By`, so greenline finds the
change's commits without the record naming them; no commit is reset,
amended or rewritten to move it.

The session holding the change writes its record, one session at a time; a
fresh session that resumes a stopped change writes on in the same record. A
fresh reviewer or verifier writes only its own report in the folder.
Resuming starts from `greenline status`, which lists each open and stopped
change with its "next" line beside its state, and names by id each change
stopped on another local `greenline/<id>` branch in the situation it prints
first; `greenline status --change <id>` is one change's resume view
([the status reference](./status.md) says what each prints). A stopped
change resumes on the branch its record's commit sits on.

## Plans and tickets

A mode says how sure; a plan says how big. A change of any mode may stand
alone, its plan in its own record. A plan directory exists only when the
plan step splits the work into tickets: `.greenline/plans/<NNN-name>/`, such
as `.greenline/plans/003-login/`, holding the plan documents the work needs,
`spec.md`, `decisions.md`, `map.md`, `tickets.md` and research and prototype
notes, each marked draft or complete.

`tickets.md` is one file with one short entry per ticket: its intent, scope,
acceptance, the tickets it comes after, and its own mode. Work that splits
waits twice: once at the start, for the planning change's mode, careful,
unless your request names it; and once after ticketing, on the ticket
list with a mode beside each ticket. A mode you name while the list waits
edits that ticket's entry. When you approve the list, the agent marks
`tickets.md` complete, which records your approval. Ask for a ticket by its
id, or for the next one ready, and the agent opens that ticket's own change
record under its approved mode, or under a mode you name as it opens, with
no further wait; that override is recorded on the ticket's record as your
choice, and `greenline status` marks the difference (GL0406). The planning record holds the frame,
plan and anticipate sections; each ticket's record holds build and review;
both hold verify and close, each only where its mode runs the step.
Progress is never written by hand: `greenline status` derives each ticket as
not started, in progress or done, and lists the tickets ready to start. The
planning change opens first, closes last, and checks the whole result
against the spec. Every ticket commits on the planning change's branch with
its own trailer, and the planning change's close offers the landing for the
whole.

## Three lifetimes

| Kind      | What it is                                                                                                                         | Lifetime                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Working   | anticipate's brief, each fresh agent's scratch folder, relay notes, round detail, probes, raw output, under `.greenline/tmp/<id>/` | removed by `greenline tidy` when the change is done |
| Record    | the change record, its check facts, the briefs `greenline brief` wrote and the reports it cites                                    | permanent                                           |
| Knowledge | the decision home, decision records, the glossary and the plan documents                                                           | permanent and kept current                          |

The working files are git-ignored, never committed and never cited. A file
one agent hands another lives as long as its reader needs it: a report the
record cites is permanent, and so is a reviewer's or a verifier's brief,
which greenline writes into the change's folder, while anticipate's brief
or a relay note between two rounds is a working file. What a record
relies on is copied into the change's folder first, and the record cites
that copy.

## Close, and what lasts

At close, a change's
[lasting product decisions are retained in .greenline/DECISIONS.md]{claim: The decisions book records lasting choices; House rulings record the owner's instructions}
with references to their sources, or in the decision home your repository
already keeps, and its new terms in the glossary, `GLOSSARY.md`. The next
agent reads them before reopening settled ground. Engineering choices and
root statements live in the same decisions book.

The close also offers the landing in one line, the one your repository's
setup calls for: push the branch and open a pull request where the remote
is a forge such as GitHub, merge the branch into its base branch locally
where no remote is a forge, or leave the branch as it is. The agent pushes,
opens a pull request or merges only on your word, which it writes into the
record's `landing` line, and the close section records what was done. Where a rule of your repository is against that
offer, such as one that nobody merges their own branch, the agent names the
rule beside the offer rather than offering something else in its place, and
your answer decides. Before a local merge the agent names the base
branch: the default branch when it made the change's branch from it at the
proposal, and otherwise the one you name when it asks. It makes the merge
with its commit, carrying the change's trailer, and then runs the change's
checks on the merged result through `greenline check`, so their facts name
the merge: a red result stops the landing, keeps the change `open`, and
leaves the merge local, for you to keep or undo. A rejected
push is reported, never forced. Where the commits already sit on the base
branch and no remote is a forge, there is nothing to land, and the close
section says so; a ticket's close offers no landing, since its planning
change's close offers it for the whole.

## The hooks: the promises held

A promise the record makes is held by a mechanism wherever one can hold it,
so it does not rest on the agent remembering. greenline installs two kinds.

**Git hooks, on every harness.** `greenline init` writes them under
`.greenline/hooks/` and registers them in the repository's local git
configuration: as config-based hooks on git 2.54 or later, which run beside
your own; through `core.hooksPath` on an older git that holds no hooks of
its own; and otherwise not at all, printing the line to add to your hooks,
with `greenline status` saying they are absent. A clone carries the scripts
but not the registration, so it runs none until `greenline sync` registers
them. Each hook runs `greenline` from the `PATH` git gives it and lets git
go on where none is there, so `greenline status` says beside the
registration when greenline is not on the `PATH`, as after `npx greenline
init` alone. Each hook reads only git's facts, the change record's front matter and
the check facts, and on a change's branch:

- writes the change's trailer into every commit, the one that closes or
  stops the change included, stops a commit git cannot give it, and
  refuses a message that carries another change's;
- refuses a commit while the change's record is missing or has no `choice`
  line, your answer to the proposal, or holds `choice: standing` under a
  mode the workspace's `proceed` setting does not allow, naming the setting;
- refuses a commit that sets the record `done` while the latest recorded run
  of a check is red, unfinished or absent;
- refuses an amend, a reset to another commit, a rebase or a forced move of
  the branch unless the record's `rebase` line holds your words;
- refuses a push of the branch while the record has no `landing` line, and a
  force push always.

In a repository with no remote, a change's commits go to the current
branch, the default branch included, and the hooks hold the change whose
record is open there as on a branch of its own. Where a remote exists, the
default branch is never a change's branch, so no change is open there.
The hooks hold the workspace while no change is open: no commit, and no
file outside `.greenline/ledger/` and `.greenline/tmp/`, until a change's
record is open on the branch HEAD names. Pre-commit refuses the commit,
"no change is open on <branch>; open its record under .greenline/ledger/
before the first commit", and the harness adapter refuses the write with
the same words, while a write inside those two folders goes through so the
record can be opened; a merge, and the commit that closes a change landed
locally, are left alone. The hooks read a `choice: standing` as your yes
only where `proceed` allows the record's mode. Each refusal names the record fact it rests on; a
hook that fails on an error of its own lets git go on; and git's own ways
around a hook, such as `--no-verify`, still work, while `greenline status`
reports from the record and the facts what one let through.

**One adapter per harness, where the harness has hooks of its own.** Every
entry of an adapter runs the same command, `greenline event`, with the
harness's event on its input, and greenline does the rest, so the behaviour
is the same on every harness. Init writes Claude Code's and Codex's into
their settings files beside your own entries, and the adapters of Droid,
Gemini, Cursor, OpenCode, Amp, Pi, Kiro and Copilot where the repository
shows their folders; Hermes and dsh read hooks only from your own
configuration, which greenline never writes, so init prints their lines. At
a session's start and at each request the adapter puts the status mirror
into the agent's context: the open change with its mode and its "next"
line, each declared check's latest run, the fresh agents counted beside the
record's `agents`, and any git hook that is absent. It records every command
the harness reports in the change's working folder, and a command whose text
is a declared check's as that check's run, which `greenline status` shows
and the close never counts: only a run through `greenline check` proves a
check. It refuses one act, a write: outside `.greenline/ledger/` and the
change's working folder before the record holds your yes, and outside
`.greenline/ledger/` and `.greenline/tmp/` while no change is open. Where a harness
has no hooks, the git hooks hold their promises alone, and the agent reads
`greenline status` at the start of each turn, as its instructions say.

**What `greenline status` checks, and what no mechanism holds.**
`greenline status` checks that the record states who chose the mode and
has a section for every step, and names a check fact removed from between
two runs, each with its code. No mechanism holds the rest, and the agent
keeps them: nothing contacts a remote before the proposal, a stop commits
only the record and its folder, scratch files go under the change's working
folder, your choice of mode is final, every floor found is in the record's
`floors`, and a recorded check fact is never edited or removed.

**The declared checks.** No hook guesses which command is a test. The
manifest's `checks` names the project's checks, each a name, a command and
a directory: `greenline init` proposes them from the project's files, the
agent confirms or corrects them in the first change, in a new repository as
it creates them and in an existing one from how the project already runs
its tests, lint and build, and `greenline check --declare -- <command>`
adds one, `--dir <dir>` naming its directory. A check declared in a
directory runs there: `greenline check -- <command>` runs a command a
declared check matches in that check's directory, from anywhere in the
repository, or from the directory meant where several declare the same
command, and the close reads each check by its name, its command and its
directory, so only a run recorded there counts. A command no declaration matches is recorded and nothing more;
with no check declared, `greenline status` says so.

`hooks.git` and `hooks.adapters` in `.greenline/manifest.json` turn each
kind off; both are on by default. `greenline hook <name>` is what each git
hook's script runs and `greenline event` what each adapter runs; you never
need to run either yourself.

## The loop

A review finding, a bug or a changed assumption re-enters the work at the
step it affects, and the record says where. The record holds why, the
commits hold what, and the check facts hold how it was proved; git keeps the
history of all three.
