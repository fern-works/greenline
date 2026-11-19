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
homes, the languages, the changes stopped on other branches and the
branches cut before greenline was installed
([the status reference](./status.md)). Where your request names files only
such a branch holds and `proceed` lets it go on, the first reply proposes
the merge of the default branch into that branch as its one question, and
once the merge is done you start a new session there. While no branch of the repository,
local or one a clone brought, holds a change record, your first request's
own change carries the orientation the situation's `orientation` line
names, inside its frame: it takes no record, no proposal and no wait of its
own, so a request that names its mode, or that `proceed` allows, starts at
once. On an empty tree, where the situation shows no commits and no code
or document, it is `groundwork`: the setup is that change's own work, before
the feature you asked for. Otherwise, a tree of documents without code
included, the change reads the documents the repository already keeps and
the code your request touches, and writes what it learned into the
knowledge homes before its close, so later sessions read those. A survey,
`architecture-survey`, runs when you ask for one. Outside a Git repository
the agent offers `git init` and ends its turn: nothing is installed before
your yes. A
question needs no orientation. A session that resumes, or is asked "what
were we doing?", with no open or stopped change says so, proposes nothing
and asks what you want done.

| Mode    | Promise                                                | Typical request                             | Agents, at most |
| ------- | ------------------------------------------------------ | ------------------------------------------- | --------------- |
| quick   | quick, the builder alone                               | a settled one-commit fix                    | 1               |
| regular | one fresh review and one fix pass                      | a bounded change with a clear goal          | 2               |
| careful | the premise attacked, two reviews and a fresh verifier | open decisions, a floor, or several tickets | 6               |

The agents count the one doing the work, the builder, and every fresh agent
the mode's depths start: at careful, one that composes the design where the
change touches an interface, one that attacks the plan's premise before the
build, two reviewers and a verifier. An agent a step's method
starts, such as a research agent reading sources at frame, is named in that
step's section and counted nowhere, and the fresh agent a picture skill
starts for a durable picture is named apart in the status line: both stand
outside the mode's "Agents, at most" whatever the mode, and neither is
listed in the record, in its `starts` or its `agents` count.

[Before any edit the agent states the mode it would use, why, its cost in agents and rounds, any risk it found, and whether it can start a second agent. Then it waits.]{claim: The agent proposes a mode and waits for the owner's answer}
The proposal also names the change's ground, where its work and its
commits go, read from the repository's local setup with no network
command. Where the repository has a remote and you are on its default
branch, the agent offers the ground two ways and recommends a branch of
its own, a new `greenline/<id>` made from the default branch in this
checkout; in one sentence it names the other, a worktree of its own, a
second checkout of the repository on that branch, which you take by
answering "worktree". It recommends the worktree first only when your
checkout holds unfinished work, another change is open here, or more than
one agent works in the repository. With `ground` set to `branch` or
`worktree` in `.greenline/manifest.json`, the proposal states your
standing choice instead of asking. Elsewhere the branch you are on holds
the change, when it is not the default branch or the repository has no
remote, and no offer is made. The agent reads the remote's
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
branch, the working files and the record share it; a `greenline/` branch
whose name holds no such id is no change's branch, whatever record its
files hold open, and the hooks refuse its first commit with the rename
that makes it one.
You accept the proposal or name another mode, branch or ground, and your
choice is final; a mode you name above the agent's has its cost in agents
and rounds restated before the work. A request that names a mode, such as
"fix this in quick", a branch or a worktree has chosen it. A worktree of the
change's own is made with your harness's own tool where it has one, as
Claude Code does, and with git under `.worktrees/` otherwise, the folder
kept out of git through `.git/info/exclude` rather than a commit, a write
the hooks let through before your yes since no change is open yet; the
project's setup runs in it and its tests record a clean baseline before the
first edit, and every command of the change runs there. Where the
session itself stays in your main checkout, each command names the
worktree in its own words, such as `cd .worktrees/<id> && npm test`, since
a harness may hand its hooks no directory for a command; a write or a
commit in the worktree is held against the worktree's own branch and
record, never your main checkout's. A push of the worktree's branch, a
forced push or a forced delete of it is held there too, by the branch its
words name, whatever directory the harness gave the hooks, so the landing
words in the worktree's record lift it and another change open in your main
checkout never does. Where your harness's tool names the worktree's
branch itself, such as Claude Code's `worktree-<slug>`, the record's
`ground` line naming the worktree makes that branch the change's own, so
its commits carry the change's trailer and the landing after done is
lifted by the record's `landing` line, with no reopening of the record.
The change's facts follow the work into its worktree: each tool call the
hooks place there, by the directory its command runs in, a path it writes
or the change a greenline command names, such as `greenline check
--change <id>`, writes the change's event log, its skill loads and its
frame map in the worktree's own folders, beside its record. A
branch cut before greenline was installed holds none of the practice;
the agent is told so at the session's start and at each turn, and
`greenline status` names it with the way back, switching to the default
branch or merging it in. Either brings greenline's files to the tree but
not to a session already running, since a harness loads its hooks when a
session starts, so where the session started on that branch, the agent
asks you to start a new session once the merge is done and edits nothing
until then. Where the harness
or a sandbox refuses the worktree, the agent offers the branch instead and
waits for you. The record's `ground` line names the ground and its `agent`
line the harness and the model, as the harness states the model. The agent goes on without waiting in two cases
only: your request names the mode, or the workspace's `proceed` setting
allows the proposed mode. By default `proceed` allows none. Your yes to a
mode is the mode your request names or your answer to the proposal, which
the record keeps as its `choice` line: a request to commit, to checkpoint, to "go ahead" or to put
a fix straight into a file is not that yes, and neither is "implement
without asking", so under the default the agent still proposes and waits.
Where `proceed` allows the mode, those words start the work, the first
reply saying in one line which mode it took and why: the agent is told so
at the turn's start, before that reply, and a first reply that names no
mode is named to it at the next turn's status; where a floor the
agent read in the code, such as a signing key, raises the mode above what
`proceed` allows, the proposal names the floor and its file and asks that
one yes.
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

## How the agent answers you

Every reply follows one shape, set in the managed block, in three parts:
one sentence of what happened, one line of what it waits on, opening
`Waiting on:`, and the address of the page in the
[inspector](inspect.md) the turn's status printed while the inspector
runs, on every reply, a decline and a stop included. The facts, the
change, the mode and its cost, the step and its depth, where the work
goes, and the progress line stay in `greenline status` and the viewer; the
reply copies none of them. Where a reply leaves out the address its turn
printed, the next turn's status names it to the agent. The answer comes
first: the outcome, yes or no, a number, or "I do not know" and how the
agent will find out; where it is unsure it says what it did not check,
never a percentage. Plain words, short sentences, one idea each. It names
a rule only when the rule stops something you asked for, and then in your
terms. It says a thing once. Three stances, which the managed block carries word
for word, stand beside the shape: thorough analysis and bold
recommendations; a high standard kept and demanded of any fresh agent; and
tool calls run together in large batches, never one after another where
they can run in parallel.

```text
The empty list now shows "0 items", and its 3 new tests pass.
Waiting on: nothing; a fresh reviewer reads the change next.
http://127.0.0.1:7433/changes/2026-10-25-empty-count
```

The address names the page the turn calls for: the change's page at the
proposal and the close, the frame map while a question waits for you, the
deal while you pick a direction, a picture the turn kept, the captures at
an interface change's check, your marks while one is open. Where the
inspector is not running there is no address, and the agent offers
`greenline inspect` once in the session.

`greenline status` prints the change's progress line, which names every
step: `✓` written, `▶` the step in hand, a step to come named bare, and `–`
a step the mode does not run. A stopped change's line ends `stopped`, one
waiting on your word `waiting on you`, and a done one reads `✓ empty-count
done · 6 steps`; with no change open there is none.

```text
progress: `empty-count · frame ✓ plan ✓ anticipate – build ✓ review ▶ verify · close`
```

A proposal is one sentence of what would be built, the change's id, the
mode and its cost, where it goes and a floor only where the agent found
one, the open points each with the answer the agent would take, and
"Yes?", ending on the line of what your next word decides: under 120
words, so a plain yes takes it all. When you say yes, the agent quotes your
words in the record's `yes` line, and the hooks hold the work outside the
record until one of your messages they heard holds them. Your messages
are kept once per session in your main checkout, whichever worktree of
the repository a command runs in, and a finished fresh agent's notice,
which a harness can hand the hooks as if you had typed it, is never taken
for your words.
Once the change's first commit carries the record with your yes, the yes
is settled: a change resumed in a fresh session, a clone or a worktree is
not asked for it again, and only a `yes` line rewritten after that commit
is held against your messages anew. Questions come at
most three at a time, each answerable in a word, and a note you type in
place of a choice is read as your answer. While a long turn runs, the agent
says in one line per act what it learned or decided, never which page or
tool it is reading. The close's reply has the same three parts; what was
checked and what was not, under `Not probed`, `Not landed` and `Not mine`,
stand in the record's close section. Every commit's subject takes the form
`<type>(<scope>): <summary>`, unless your repository keeps its own. A
picture is drawn in the reply only where its shape decides something, and
a durable one is kept only when you ask for it, never offered, a lost
one's re-keeping included. The agent reads the
web inline where a fact needs it; at careful it may propose research for a
stated question, which you accept, a fresh agent reads, and `greenline
research report` files. A stop and a resume name the change, its step and what
picks it up again; what the change waits on you for, such as your review
of the tests, stays across the stop, and the resumed work goes no further
than it until you answer it. Your words that carry on, go on, continue or
resume, or a yes where the wait asks for one, answer it: the status line
says so, `the owner's words this turn answer it: set state open as the
first write and go on`, and the agent sets the record open and goes on
from the step it names. Where the change waits for your review or your
answer, a plain "carry on" picks the work up and does not answer that
wait: the status line says `the wait on the owner stands`, and the agent
sets the record open, shows you again what you are to review and waits;
your review's words, such as "looks good, go ahead", or a yes answer it. A question round's cards put the answer the agent would take
first, marked "(Recommended)", so a yes takes it. A question about your
code gets the words alone, and the inspector's change strip shows the same
steps as the progress line.

## The line: the steps at the mode's depth

Every change runs the same steps in the same order: frame, design, plan,
anticipate, build, review, verify and close. design runs only where the
change touches an interface; elsewhere its section is the one line
`none, no interface`, or absent from a record with no `interface` line, and
costs nothing, its skill unread. Each step's skill is the
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
| design               | inline | written              | independent, 1 agent  |
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
  in an interview. "Grill me" asks for it alone. "How frame thinks a
  request through", below, gives its nodes, its questions and its
  research.
- **design** settles how an interface change looks before the plan: it
  reads your design home, and where that leaves the direction open it asks
  you once and shows three directions to pick from ([the interface
  practice](./interface.md)).
- **plan** writes the plan before the build: the plan section of the
  change's record, or a plan directory when the work splits into tickets.
- **anticipate** is careful's premise review: before any code, a fresh
  agent takes each claim the build would rest on and tries to disprove it.
  Quick and regular skip it.
- **build** turns the plan into code one tested slice at a time, and records
  each deviation from the plan and each approach tried and dropped. Once per
  change, when the same file has been edited three times with no passing
  recorded check since, the hook asks the agent "are you in a rabbithole duct
  taping custom fixes together? is there a native way of doing this that
  would be cleaner?", and the next turn's status repeats it once, at that
  turn's start alone, never again at a resumed session's start.
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
  removes a file the record cites, and stops the processes the change's
  sessions started, the inspector first, never one they did not start. On
  Codex, where a server keeps running past the command that started it,
  greenline names the inspector the turn started at the turn's end and
  before that tidy, so the close stops it too.

[A change closes only when every step its mode runs is recorded, and while its latest check ran under the current installation, `greenline status` reports a done change that lacks a section its mode requires or whose checks failed.]{claim: A done change has every step its mode runs recorded and no failed check}
A done change with no check facts at all is read as history and never
judged; it is reported as a notice.

Two other kinds of skill sit beside the line, and each loads only in its
situation, never ahead of it. A start loads once, in one of two cases: when a
request begins in its situation, or when you name it;
it then hands the job to a mode: "what were we doing?" opens the router, a
known failure opens diagnose. A habit, such as tdd or secrets, loads only when its situation
arises, at any step: secrets with a secret in reach, never for a commit
that has none. The skills a change owes are printed for the agent rather
than remembered: the status line's `owes:` line names each, from the
trigger rows every start and habit carries, by your request's own words
for that change, the files the change touched and the files its plan
names, so a settings page that keeps your choice owes domain-and-types and
a planned test owes tdd whole at a regular build, every step its mode runs
and its mode, while the change is open, looser at careful than at
quick and within the mode's reading budget, a loosely owed habit read by its
front until the step that uses it, and git's hooks refuse `done`
while an owed skill is named by neither a load the hooks recorded nor the
record's `skills` line and your words waive none, or while a skill owed
whole has its `SKILL.md` or a page its recipe names unread or read in part,
one page per read, a page read beside another or cut by the harness
counting as a part. Where the hooks recorded
no load at all, as on a harness without them, the line stays a hint. With
no change open, the line names what your request's words alone owe, so a
question or a simplify request that opens no change still sees the skill
it owes. The record names a start only when it ran.
[The skills](./skills.md) lists them.

## How frame thinks a request through

Frame thinks your request through thirteen subjects, its nodes: purpose,
scope, adjacent, journey, surface, data, behaviour, security,
performance, operations, verification, constraints, and generic for a
question that fits no other. It opens only the nodes your request touches,
and says in one line which it left closed and why, so you can open one; it
never asks a question for a node's sake, and it settles purpose and scope
in the first round. Before that round it reads the code your request
touches and names those files, so it does not ask what the code already
answers.

At careful the questions come in rounds, each with the agent's recommended
answer. Where your harness renders its question tool, as Claude Code does
in a terminal and Codex does in plan mode, each round arrives as cards with
the recommended answer first, in Claude Code's desktop app as in its
terminal; everywhere else, as in Claude Code's print mode, Codex's default
mode and `codex exec`, the round stands
in the agent's reply and the agent waits there. [In the reply each question
is numbered with its answers numbered under it, the recommended one first]{claim: Where no question cards render, a question comes in the reply with numbered answers}
and labelled "(Recommended)" with its reason; you answer in your next
message by number or in words, and "yes" takes every recommended answer.
The surface line of the status mirror says which, `questions cards` or
`questions reply`; under `codex exec` it says `questions reply`, and the
agent calls no question tool there.

At careful the frame covers every node but generic: each is asked, or
closed in the record with the agent's reason, one line closing several
that share it, and `greenline status` names a node neither asked nor
closed until it is. Once the frame is whole, the agent puts its
restatement to you, what it now understands you want with what is out of
scope, by a card or in its reply, and waits. Your words that confirm it,
a yes or plain words such as "that's correct" or "exactly" said first,
with no question and no "but" or "not" in them, are quoted in
the record's `confirmed` line, and only words you say after
the restatement was put count: your yes to the proposal or an answer to
an earlier question never does. Until they stand, the hooks refuse every
write and commit outside the change's record and working folder, each
refusal saying what is missing, so a careful change cannot go from frame
to code in one turn. A refinement or a no sends the agent back to the
frame, and it puts the restatement again.

A fact the agent can look up, the web included, it reads itself and names
its source in the frame section. At careful, a question that needs a
reading of its own is proposed as research at any round: the topic, its
node, where it would look (papers, the web, or other projects' code) and
what the answer would change. The agent writes each topic in the change
record's frame section and your words that accept it beside it, and
[a fresh research agent reads only a topic you accepted]{claim: Research runs only on a topic the owner accepted}. Each topic you accept goes to one fresh agent working by the
`research` skill, one at a time, each report awaited before the next
starts. [The agent calls services anonymously, pays for nothing, writes to
no one, and reports what other code does in its own words, never copying
it.]{claim: Research calls services anonymously and copies no code} Its report, filed with `greenline research report` as
`frame-research-<n>.md` in the change's folder, is cited by the questions
it informed.

The frame section records each question in one list form, with its node,
the answer proposed, the answer taken and whether you or the agent decided
it, and the hooks derive the frame map from it, `frame-map.json` beside the
record, after any tool that wrote it, a shell command included, until the
commit that closes the record, so the map holds the answers the closing
write left, which [the inspector](./inspect.md) draws on
the change's page.

## One agent at a time

Agents run one after another, never in parallel, and all in the change's one
checkout, this one or the change's worktree, never a worktree of their own. A depth that needs a fresh agent starts it
through the harness's own delegation, on Codex as on Claude Code, waits for
its report, and only then goes on. Each starts with its brief as its only
context, never a fork of the builder's conversation where the harness lets
the builder choose; a forked start is said in the step's section. Where the
harness shows the spawn's parent, the hooks record each start as fresh or
forked, and status shows it as a hint beside the record's `agents` line,
which stays the agent's to write. Every fresh agent gets one brief, which
opens on the standard it keeps, a sentence greenline carries as written: "You are
responsible for maintaining a high standard of excellence and demanding the
same of any subagents"; then the record's front matter, the
acceptance, the change's id, the path of its report, its scratch folder and
the skill it works by, then its step's extras; an agent a step's method
starts gets the same brief with the extras its page names. The brief of
every step that starts a fresh agent, design's, anticipate's, review's and
verify's, is a file greenline writes, never the builder:
`greenline brief` writes it from the record into the change's folder,
`.greenline/ledger/<id>/brief-<step>-<n>.md`, its first line marking it as
the command's, and `greenline status` reports a brief file there that the
command did not write. The brief names no model, and carries a nonce the
report cites on its first line, so a report that does not cite it shows as
a hint where the harness shows no spawn's parent, and the hook names after
the tool that wrote it, as it names a report with no brief the command
wrote. Anticipate's brief carries the artifact and its contract, never the
claim. A fresh agent starts no agent of its
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
A start that fails is said in the harness's own words, and the agent
stops for you: it never reviews inline in the fresh agent's place and
calls the change done. Only where the session has no delegation tool at all does
every independent depth run without a fresh agent: review inline, verify at the
written depth, anticipate as a self-questioning pass the agent marks
degraded. The step's
section says so; nothing is skipped silently.

## The change record

A change's record is one Markdown file, `.greenline/ledger/<id>.md`. Its id
is the date it was chosen and a slug, such as
`2026-10-08-retry-deadline`. The agent opens it before the first edit with
`greenline open --change <id> --mode <mode>`, which writes the skeleton for
its mode, every line the mode owes named with a placeholder in each, and
then replaces each placeholder in its own words for its meaning, but the
`yes`: the agent writes that line too, and what it holds is the owner's
words that answered the proposal, quoted where the session heard them and
asked for where it did not, since a yes in the agent's own words is no yes.
No command writes a line of the record: while the change is open, `greenline status`
and the status line name the lines it still lacks, `record lacks: why now;
skills, outcome by the close; write each in your own words for its meaning;
the yes now, the owner's words that answered your proposal, never yours`,
and show what the hooks saw beside them,
the skills loaded, each helper's start as fresh or forked from the builder,
as hints the agent reconciles; git's hooks refuse `done` while a line is
missing or still holds its placeholder, or a section holds a word left in
its place, such as `Pending.`. The `agent` line names the model the harness
reports, such as `codex/gpt-6.1-terra`, never a family alone such as
`codex/GPT-6`: the record's first commit and its `done` are refused while it
does, the refusal naming the line to write.

```markdown
---
mode: regular
choice: accepted
yes: "Yes, go ahead."
why: "Keep the caller's deadline across retries."
state: stopped
next: "review: start the reviewer on the change's commits"
ground: branch
agent: claude-code/opus
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
agent went on without waiting because `proceed` allowed the mode), under
`accepted` your words that answered the proposal, quoted in `yes` as you
said them, why the change exists, its state (`open`,
`stopped`, `done` or `dropped`) and the "next" line; at close it states the
`skills` the change used, by name, in the agent's words beside the loads
the hooks noted, and, where the mode may start a fresh agent or run a round,
the cost, `agents` and `rounds`, with `starts` naming the starts of the
line's steps alone, `"review 1"` or `"review 1 restarted"`, a method's agent,
a picture's helper among them, named in the section it serves and listed
nowhere, and `greenline status` reports an
`agents` below the builder and those starts. The cost stays as it ran:
where it passes the mode's count and you accept that, the agent quotes
your words in `overrun`, `greenline status` reads the cost as accepted,
and the change's facts name the acceptance in `Mode`. At close it also states
`outcome`, one sentence under 200 characters in the agent's own words
saying what landed, which the viewer's change page opens on; git's hooks
refuse `done` without it. Three more lines carry your
word to git's hooks, each quoted as you said it, and where the hooks heard
your messages a line lifts an act only when one of them holds its words
whole, words joined from two of your messages lifting nothing:
`landing`, written at close with your words for a
push, a pull request or a merge, and `rebase`, with your words for
rewriting the change's branch, and `discard`, with your words for
throwing work away; while one is absent, a hook refuses that act. Where no
hook heard you, a push to the default branch is yours, from your own
terminal. When you answer the landing offer with no act, "leave the branch" or
"not now", the agent writes that answer too, as `landing: "declined: <your
words>"`, which lifts nothing, so the record says what you decided. The "next" line names
the step reached and the action that resumes it. A wait for your answer
within the session, at a proposal, a question or a review, is no stop: the
record stays `open`. A stop is your word: when you say "stop there for
today", or ask for another change, the agent quotes your words in the
record's `stopped` line, and the hooks refuse a stop written without them,
so a wait for your review is never recorded as a stop; if a record still
reads stopped at your next message in the same session, the status line
tells the agent to set it open. Every stop sets
the state to `stopped`, rewrites the "next" line and commits the record and
its folder, the check facts under it, with the change's trailer, so a
session on any branch, or in a clone, can find the change; a step stopped
midway keeps its section as written so far. The commit is made in the
stop's own turn, since a clone and a fresh session carry commits alone:
after the write that sets `stopped`, the hooks tell the agent that no
commit holds the stop, and the status line says so at each turn until the
commit stands. Uncommitted edits you were shown, such as the tests before
their review, are kept as `shown.patch` in the record's folder, which the
stop's commit carries, so a clone has them: the hooks name the edits after
the stop's write, and in a clone the status line names the patch to apply
before the review. The stop's commit holds nothing
else: the change's uncommitted edits stay for its resume, working edits you
ask to commit are a commit of their own, and while the stopped change's
edits are in the tree the agent proposes no new change but says so and waits
for you. The
session that resumes the change sets it to `open` again as its first
write, before any edit of its record or its code; where its first write
leaves the record `stopped`, the hooks say so and the agent writes the
state itself. Several changes may be
open at once, a planning change while its tickets run among them, but one
session holds one change at a time. The body has one section per step of
the line, written when the step ends; a step the mode does not run holds
the one line `none at <mode>`.

Beside the record, `.greenline/ledger/<id>/` holds what it cites: each fresh
agent's report, the briefs `greenline brief` wrote, and under `checks/`
the facts of every check run through `greenline check`: the arguments, the
outcome, the duration, the commit and the tree it ran on. A check stores no output.
A done record links what its folder keeps: its pictures once, as
`[visuals](<id>/visuals.json)`, wherever that file lists one, and the
interface check's runs under `interface/`, each by its path or all at once
as `[interface check](<id>/interface/)`, from the verify section beside the
fresh agents' reports a careful verify cites, the link read as the
check's evidence and never as a report; on an interface change, the design
section's `components:` line names only the closed list's components,
comma-separated, on a line of its own. Git's hooks refuse `done` while one
is missing and `greenline status` names it, so the record never closes
with its evidence unlinked. The files the commands write there are theirs:
the agent links them and never edits, moves or removes them. Every check of the change's
code runs through `greenline check`, its red runs and a reviewer's or a
verifier's included, and so does a rerun made only to read why a test
failed; the same command run plainly proves nothing to the record. Its
short form, `greenline check -- <command>`, takes the one open change and
the step its record is in. A probe, a run whose green the change never
claims, such as a mutation run or a baseline at an earlier commit, runs
through it too and is then marked with
`greenline check --change <id> --probe <fact>`, which keeps it out of the
change's checks, so no run the record cites stays plain. A
recorded fact is never removed or edited: a rerun records a new one. The build commits once
for each slice that leaves the checks green, once as the record first
enters and at every stop, each slice's files staged by name, in one form:
`<type>(<scope>): <imperative subject>`, 50 characters the aim and 72 the
cap, a body only where the subject is not enough and always for a breaking
change, a security fix, a migration or a revert, and no attribution in the
subject. Every commit of the change carries the trailer
`Greenline-Change: <id>` from the moment it is made, as the last line of
the message's last paragraph, beside any trailer the harness adds there
such as `Co-Authored-By`, so greenline finds the change's commits without
the record naming them, and just above it `Greenline-Agent:
<harness>/<model>`, the record's `agent` line; no commit is reset, amended
or rewritten to move it. A slice that breaks is fixed forward with a new
commit; throwing work away is your word, written in the record's `discard`
line.

The session holding the change writes its record, one session at a time; a
fresh session that resumes a stopped change writes on in the same record. A
fresh reviewer or verifier writes only its own report in the folder.
Resuming starts from `greenline status`, which lists each open and stopped
change with its "next" line beside its state, and names by id each change
stopped on another local `greenline/<id>` branch in the situation it prints
first, with the path of the worktree that holds a change's branch where
one does; `greenline status --change <id>` is one change's resume view
([the status reference](./status.md) says what each prints). A stopped
change resumes on the branch its record's commit sits on, in its worktree
where it has one, with no second yes, since its committed record carries
yours.

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
list with a mode beside each ticket, which stands written in `tickets.md`
before the agent asks you to approve it. A mode you name while the list waits
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
its own trailer, one ticket's per commit, and the planning change's close
offers the landing for the whole. A commit stages a record and its folder
by path, never the ledger whole: git's hooks refuse a change's commit that
carries another change's file, such as a finished change's visuals file the
viewer rewrote, and name it.

## Three lifetimes

| Kind      | What it is                                                                                                     | Lifetime                                            |
| --------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Working   | each fresh agent's scratch folder, relay notes, round detail, probes, raw output, under `.greenline/tmp/<id>/` | removed by `greenline tidy` when the change is done |
| Record    | the change record, its check facts, the briefs `greenline brief` wrote and the reports it cites                | permanent                                           |
| Knowledge | the decision home, decision records, the glossary and the plan documents                                       | permanent and kept current                          |

The working files are git-ignored, never committed and never cited. A file
one agent hands another lives as long as its reader needs it: a report the
record cites is permanent, and so is every fresh agent's brief, which
greenline writes into the change's folder, while a relay note between two
rounds is a working file. What a record
relies on is copied into the change's folder first, and the record cites
that copy.

## Close, and what lasts

At close, a change's
[lasting product decisions are retained in .greenline/DECISIONS.md]{claim: The decisions book records lasting choices; House rulings record the owner's instructions}
with references to their sources, or in the decision home your repository
already keeps, and its new terms in the glossary, `GLOSSARY.md`. The next
agent reads them before reopening settled ground. Engineering choices and
root statements live in the same decisions book.

The close also offers the landing's choice in one line, never "ready for
review" in its place, the one your repository's
setup calls for, as the status line's `remote` names it: push the branch
and open a pull request where the remote is a forge such as GitHub, merge
the branch into its base branch locally where the remote is no forge, a
local path for one, or there is none, or leave the branch as it is. The agent pushes,
opens a pull request or merges only on your word, which it writes into the
record's `landing` line, and the close section records what was done. Where your repository holds a review rule, in its contribution guide or its
like, the agent states it beside the choice; where it says nobody merges
their own branch, the agent recommends leaving the branch for that review
and merges only when your words say to merge despite it. A local merge's offer names the base branch first:
the default branch when the agent made the change's branch from it at the
proposal, and otherwise the one you name when it asks. On your word it
commits the record on the change's branch, makes the merge with its
commit, carrying the change's trailer, and then runs the change's checks
on the merge commit through `greenline check`, so their facts name the
merge, and commits those facts as the one commit on the base after the
merge. It acts on your words for the merge in the turn they come: whether
to merge is your word, so a conflict or a red it foresees from reading the
code, your base's newest commit among them, is no reason to hold the merge
back or to ask you again, and a red is told from the check on the merge
commit. The status mirror reads your words after the offer against fixed
lists of words that ask for the merge, the push or neither, and says at
every turn what they ask and what comes next until the `landing` line
holds them; a reply that merged nothing on your merge words is named at
the next turn, a notice and never a refusal. Before you answer, the same
`landing:` line names the offer in that order, with the act the remote
and the base decide, or, where a contribution guide stands, its path, and
the agent recommends the choice in its reply from those facts or from its
reading of the guide; and before the offer, only words that name the merge, the
push or the landing answer it, so your yes to a proposal or a review is
no merge. The close section states what the landing did only once you have
answered; until then it states the offer. A red result stops the landing, keeps the change `open`, and
leaves the merge local, for you to keep or undo; a merge that fails is
reported as it stands. A refusal by greenline's git hooks is answered by
the line it names, and the agent never offers `--no-verify`, which stays
your bypass. A rejected
push is reported, never forced. Your `landing` words carry the landing
itself, the branch's push, the push to the base and the branch's delete
after it, and nothing else: a forced push needs your words for that push,
written anew, and the words you gave for a push earlier in the change, or
before a resume, do not stand for it. Where the commits already sit on the base
branch and no remote is a forge, there is nothing to land, the status line
says `landing: nothing to land: the commits are on main`, and the close
section says so; a ticket's close offers no landing, since its planning
change's close offers it for the whole.

A forge's landing is one pull request per change, and one for a planning
change with its tickets' commits grouped in it, its body written to be
reviewed: a TL;DR that matches the diff, the core files apart from the
mechanical ones, the risks, how to verify and a link to the record. A
change over about 500 changed lines says so with the split the plan should
have made, a note and never a gate. The commits are regrouped before the
pull request only when you ask and the record's `rebase` line holds your
words, the tree compared before and after so the code stays the code the
checks ran on. Once the landing is done the agent offers the cleanup in the
same line: the branch deleted and a worktree of the change's own removed
with `greenline tidy --change <id> --worktree`, each on your word, a
worktree that kept an open copy of the record after the merge among them,
and a worktree holding uncommitted work never removed.

## The hooks: the promises held

A promise the record makes is held by a mechanism wherever one can hold it,
so it does not rest on the agent remembering. greenline installs two kinds.

**Git hooks, on every harness.** `greenline init` writes them under
`.greenline/hooks/` and registers them in the repository's local git
configuration, by the absolute path of the main checkout's scripts, so
every worktree runs them: as config-based hooks on git 2.54 or later, which run beside
your own; through `core.hooksPath` on an older git that holds no hooks of
its own; and otherwise not at all, printing the line to add to your hooks,
with `greenline status` saying they are absent. A clone carries the scripts
but not the registration, so it runs none until `greenline sync` registers
them; until then the agent's commits there are refused by its harness's
hook, which names the sync, so nothing is committed unheld. The sync is
yours to run or to allow: the harness hook refuses the agent's `greenline
sync` there (`sync-on-word`) until you have written to it in a turn after
it told you the hooks are missing, in that checkout, or your message names
the sync, never a dry run, a checkout whose hooks are installed or your own
terminal. Each hook runs `greenline` from the `PATH` git gives it and lets git
go on where none is there, so `greenline status` says beside the
registration when greenline is not on the `PATH`, as after `npx greenline
init` alone. Each hook reads only git's facts, the change record's front matter and
the check facts, the record read as the commit carries it, never a
working copy set apart from the staged one, and on a change's branch:

- writes the change's trailer into every commit, the one that closes or
  stops the change and any commit of its record and folder alone included,
  whatever state the last commit held the record in, stops a commit git
  cannot give it, and
  refuses a message that carries another change's;
- refuses a commit while the change's record is missing or has no `choice`
  line, your answer to the proposal, or holds `choice: standing` under a
  mode the workspace's `proceed` setting does not allow, naming the setting;
- refuses a commit that sets the record `done` while the latest recorded run
  of a check is red, unfinished or absent;
- refuses a commit of a record `greenline status` cannot read, at any state,
  with status's own words first, such as a `starts` line naming a picture
  skill's helper, which is no step: the harness hook holds a `git commit`
  to the same reading of the working tree's record, so every committed
  record stays one status reads;
- refuses an amend, a reset to another commit, a rebase or a forced move of
  the branch unless the record's `rebase` line holds your words;
- refuses a push of the branch while the record has no `landing` line, and a
  force push unless its `rebase` line holds your words too;
- refuses a merge that lands the change into a base its `landing` line
  does not name: the landing's offer names the base and asks once, and
  the agent writes the base before your words, `merge into main: yes`;
- refuses a push that carries the change to the default branch until the
  record is `done` in a commit, whatever its `landing` line holds, so the
  review, the verify and the close come first.

In a repository with no remote, a change's commits go to the current
branch, the default branch included, and the hooks hold the change whose
record is open there as on a branch of its own. Where a remote exists, the
default branch is never a change's branch, so no change is open there.
The hooks hold the workspace while no change is open: no commit but a
[discussion's](./discussions.md) own, and no file outside
`.greenline/ledger/` and `.greenline/tmp/`, until a change's record is open
on the branch HEAD names. Pre-commit refuses the commit, "no change is
open on <branch>, so nothing is committed there yet; open the change's
record under .greenline/ledger/ first, once the owner has said yes", and
the harness adapter refuses the write with the same words, while a write inside those two folders goes through so the
record can be opened; a merge commit, the commit that closes or stops a
change, landed locally or not, a commit of a change's record, its folder
or both alone in any state, a done change's check fact under its folder
among them, on the default branch where a remote exists too unless the
record stands `open` in the index, and the commit after a local landing's
merge that records the merge's checks, the change's record and folder
alone, are left alone, the last held to `done` only over green checks. A
record already committed `done` changes only so, alone, your words for
the landing among them: a commit of it with code beside it is refused on
every branch, the change's own included, naming the commit of the record
alone, and the code is a new change's. The hooks read a `choice: standing` as your yes
only where `proceed` allows the record's mode. Each refusal says first what
stopped and the way forward, in words the agent can pass on to you, and
names the rule and the hook after them; a
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
record's `agents`, the `remote` line the landing's offer reads, and any git
hook that is absent. It records every command
the harness reports in the change's working folder, and a command whose text
is a declared check's as that check's run, which `greenline status` shows
and the close never counts: only a run through `greenline check` proves a
check, and a run of the interface check through it carries the check's
name. A file a shell command writes under `.greenline/ledger/` or
`.greenline/visuals/` feeds the same facts a write tool's does: the
change a record names, a picture's maker where none stands in the map's
and the atlas's folders, never in a change's folder, whose maker the keep
reads, and the frame map. The ledger's machine-written files are greenline's to write and never
the agent's: your marks, `marks.jsonl`, which only `greenline mark` and
the viewer write; a change's `visuals.json`, frame map and skill loads,
which the hooks keep; its `checks/`, which `greenline check` writes; its
`interface/` runs, the interface's `paths.json` and a capture's
`.boxes.json`, which `greenline check interface` writes; your pick of a
direction; and the connector's receipts. The adapter refuses a write tool's
write to any of them, whatever the change's state, and a shell command
whose words write one, by a redirection, `tee`, a copy, a move, a removal,
`sed -i`, or a Python, Node or other script that names it, from an
argument or a here-document, each refusal naming the command that owns the
file. A picture is no record: a PNG, JPEG, WebP, GIF or SVG written under
`.greenline/ledger/` is refused the same way, naming the visual home,
`.greenline/visuals/<id>/`, where a lasting picture stands beside its
manifest, and the change's working folder for a screenshot you need only
while you work. A change's folder in the visual home is `greenline picture
keep`'s alone, which writes a picture you asked for with its manifest: a
write tool's write there, a shell command's copy or redirection into it,
and a `git restore` or `git checkout --` that writes back a picture you
deleted, is refused the same way. A path a script only quotes, as an
argument of a text replacement or in backquoted prose, is no write. These
hooks read what the command's words say; they are no sandbox, and a script
kept in a file, or a path a script builds from pieces, is beyond them
before the tool: after it, a write into a change's folder the words hid is
named to the agent, so the practice still asks the agent to leave the
files to their commands. It refuses a write outside `.greenline/ledger/` and the change's
working folder before the record holds your yes, and outside
`.greenline/ledger/` and `.greenline/tmp/` while no change is open, a shell
command's redirection, copy, move or removal among them, read from its
words as a write tool's path is, with the same words. It also refuses, before the shell runs it, a git command
that throws work away or rewrites a branch: `git reset --hard`, `git clean
-f`, `git checkout .`, `git restore .`, `git branch -D`, `git push --force`
and a push to a branch other than the change's, reading the command's
words, never a string inside a message. A command that names a branch a
worktree of the repository has checked out is judged in that worktree, by
its change and its record, wherever the command ran from. The change and its state, and the
lines that lift the act, are read from the record as the last commit holds
it: a stopped change set open in the working tree alone lifts nothing.
Each refusal names the record's line that lifts it: `discard` for throwing work away, `landing`
for a forced push, never `rebase`, and for a push elsewhere, and
`discard` or `landing` for a forced branch delete. A forced push over a
branch other than the change's own needs `landing` words that name that
branch, and a forced push of many branches at once is yours to run. A line lifts its act only in your own words: where the hooks heard your
messages in the session, a line whose words none of them holds lifts
nothing (`owned-words`), and a push to the default branch with no message
of yours heard is yours to run from your own terminal
(`push-from-terminal`). A line
lifts its act only once
the record is committed with it: your words go into the line, the record
is committed alone, and only then does the act run, so a reset keeps the
words that allowed it. Asking for the act, such as "start over", is not
those words: the agent asks you for them. A line lifts only the act you
gave it for, once: the hook keeps what each line's words lifted in the
repository's git folder, where no reset or clean reaches, so the words
you gave for one hard reset lift no second one, and the words you gave
for a push lift no forced push, after a resume too. The landing's own
steps share your words, the branch's push, the push to the base and the
branch's delete after it, and new words, committed, lift the next act.
The refusal names the command your words were spent on, so the agent can
ask you for this one. A push of the change to the
default branch is refused, as by pre-push, until the record is `done` in
a commit, and an ask to push an unfinished change there is not the words
for `landing`: the agent declines once, names what the push skips and
asks for the close first. It refuses, too, a kill by name or pattern,
`pkill`, `killall`, `fuser -k` or a `kill` with no literal pid, since a
pattern reaches your own processes as well, naming the pid form instead:
a `kill` of a pid goes on when the session started that process, which
the hook notes when a command starts one in the background, or when your
words in the request name the pid. `greenline status` names the processes
the session started that still run. Where a harness
has no hooks, the git hooks hold their promises alone, and the agent reads
`greenline status` at the start of each turn, as its instructions say.

**What `greenline status` checks, and what no mechanism holds.**
`greenline status` checks that the record states who chose the mode and
has a section for every step, and names a check fact removed from between
two runs, each with its code. No mechanism holds the rest, and the agent
keeps them: nothing contacts a remote before the proposal, a stop commits
only the record and its folder, scratch files go under the change's own working folder, never an earlier
change's, so `greenline tidy` at the close leaves no working folder of a
done change, your choice of mode is final, and a recorded check fact is
never edited or removed. The record's `floors` line is owed from the open
in every mode: a list or `none` answers it, the `record lacks:` line names
it until then and the hooks refuse `done` without it; which floor is the
right one stays the agent's judgment, and a floor the hooks saw that the
line leaves out is named on the `situation:` line, never refused.

**What the agent does its own way.** The hooks hold what the work comes
to: the record's lines, the commits they allow and refuse, the checks a
close counts. How the agent carries itself between those is its own, and
it varies with the model and the harness: the form a reply takes and how
soon it gives the outcome, when it reads a skill's page, whole before it
acts or as it goes, and whether it draws a picture on a turn where a shape
would help. The managed block asks the same of every agent in one text,
and greenline enforces none of these, since a rule fitted to one model's
habits pulls another model off its own. Two agents on two harnesses reach
the same outcomes and differ here; greenline's behavioural tests measure
these differences per harness and model, and a change to the block's words
that they call for is written once, for every model.

**The declared checks.** No hook guesses which command is a test. The
manifest's `checks` names the project's checks, each a name, a command and
a directory: `greenline init` proposes them from the project's files, the
agent confirms or corrects them in the first change, in a new repository as
it creates them and in an existing one from how the project already runs
its tests, lint and build, and `greenline check --declare -- <command>`
adds one, `--dir <dir>` naming its directory. The agent declares at the
plan each command the plan names that the manifest does not hold yet,
before the build runs any, so status never says that no check is declared
after one has run. A check declared in a
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
