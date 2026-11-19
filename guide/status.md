# Status reference

`greenline status` is the one diagnosis, and it is read-only. It prints the
situation the repository is in, checks the installation (the manifest, the
decision book, the lock, an override file and the installed files against
what the settings generate), reports the connectors, and shows the changes
with their findings and notices. Errors and
findings exit nonzero; warnings and notices do not.
Each diagnostic names a code, severity and message, with a file when applicable.
Repository files use paths relative to the Git root; GL0140 can name an installed
package file outside that root. Invalid fields appear separately in the message.
This page explains each code and its recovery steps.

## Workspace (GL01xx)

| Code   | Meaning                                           | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL0101 | No manifest                                       | `greenline init`; on a branch cut before the install, which the line names, switch to the default branch or merge it in                                                                                                                                                                                                                                                                                                                                                                              |
| GL0102 | Manifest invalid                                  | Fix the named field using the current installed contract. Earlier pre-beta schemas are refused; no silent conversion occurs.                                                                                                                                                                                                                                                                                                                                                                         |
| GL0103 | No lock                                           | If a valid manifest exists, run `greenline sync`. If GL0101 is also present, initialize with `greenline init` first.                                                                                                                                                                                                                                                                                                                                                                                 |
| GL0104 | Lock invalid                                      | Restore a valid lock, or remove it and run `greenline sync`; occupied paths still require conflict resolution.                                                                                                                                                                                                                                                                                                                                                                                       |
| GL0105 | Not a Git repository                              | Run inside a Git repository; whether to create one is the owner's decision. `greenline init` on a directory that is no repository asks whether to run `git init` there, and `--yes` is the owner's yes; with no terminal it refuses, and an agent offers `git init` and waits for the owner's word. A dry run runs no `git init`                                                                                                                                                                     |
| GL0106 | `AGENTS.override.md` present                      | remove or merge it; it blocks managed writes                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| GL0107 | Sync blocked by conflicts                         | resolve the listed conflicts first                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GL0108 | Managed block or adapter file broken              | restore the block markers, or make the harness's file a JSON object again, then run `greenline sync`; neither can be forced                                                                                                                                                                                                                                                                                                                                                                          |
| GL0110 | Installed output is stale                         | Run `greenline sync` with the intended CLI version. It updates methods and instructions, not repository technology choices.                                                                                                                                                                                                                                                                                                                                                                          |
| GL0111 | Managed file conflict                             | The named path contains edited managed content or an unmanaged file occupies it. Preserve needed user content first. In AGENTS.md/CLAUDE.md, move it outside the markers; whole-file outputs such as agents/openai.yaml require relocating it to a user-owned home. Then authorize replacement of that exact path with `greenline sync --force-managed <path>` (or init for a new workspace). Force replaces the whole generated file or the bounded managed region; it does not merge user entries. |
| GL0112 | Orphaned managed file (warning)                   | Inspect the named output, then remove confirmed generated content with `greenline sync --force-managed <path>`. User edits need resolution first.                                                                                                                                                                                                                                                                                                                                                    |
| GL0115 | Installation left uncommitted (warning)           | Installed files differ from HEAD, counted under `.greenline/` and outside it, as `greenline sync`, `connectors enable` or `disable` left them; `git status` lists them. greenline never commits: the change that is open, or the next one, commits them with its work. A commit of them alone is refused while no change is open. A file git ignores is never named                                                                                                                                  |
| GL0113 | Unknown `--force-managed` target                  | the exact path is absent from the managed plan; init/sync refuse before writing. Check spelling and use an orphan or conflict file path from the dry-run effects                                                                                                                                                                                                                                                                                                                                     |
| GL0114 | Skill reference unresolved (warning)              | the distributed skill definition links to missing support. Restore a corrected CLI build and sync. This checks the distributed definitions; user edits instead produce GL0111, missing installed files GL0110. Template placeholders are excluded                                                                                                                                                                                                                                                    |
| GL0116 | Init needs the harness trees                      | no `--targets` and no terminal to ask; pass `--targets codex,claude-code` (either or both) or `--yes` for both                                                                                                                                                                                                                                                                                                                                                                                       |
| GL0123 | Repository state invalid or another writer active | Repair the named policy file. Retry after the writer finishes; clear an interrupted lock only after confirming no writer remains.                                                                                                                                                                                                                                                                                                                                                                    |
| GL0124 | Workspace already initialized                     | init runs once per workspace; use `greenline sync` to reconcile installed files.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| GL0125 | Connector not ready, or its settings refused      | Enabling refuses a URL that is not HTTPS (or HTTP on a loopback address), carries credentials, a query or a fragment, an executable that is neither `garden` nor an absolute path, and a `skills.exclude` naming the connector's skill; nothing is written. Status warns when garden is enabled and its executable would not run here, or `GARDEN_API_KEY` is not set: install the garden command or name its path with `--executable`, and set the key where the agent runs.                        |

A missing or invalid installation payload is **GL0140**. Reinstall the intended
CLI build. Status keeps the checks it can make without the payload and makes no
writes.
Sync's `orphan` effects classify files that are no longer generated; the same
classification is printed when a successful `--force-managed` invocation removes
them. It is not a post-run count of files still present. Verify removal from the
filesystem or a later `greenline status` before reporting it. Empty parent
directories are left in place.

Status prints each connector's state. A disabled connector raises nothing:
nothing is consulted and no process starts. For an enabled one it shows its
endpoint, the executable that would run and whether its key variable is set,
and it checks this without starting it; the key's value is never read or
printed. garden's own failures are typed in the reply of
`greenline connectors call garden` and recorded in its receipt
([the garden connector](./connector.md)). Status does not start garden, contact
a service or certify its availability.

## The situation

`greenline status` opens with the situation, which your agent reads once
before a session's first proposal. It is read from the tree and `.git`
alone, with git read-only and no network command, and it records no time:

- **commits**: how many commits HEAD reaches, and the branch it names;
- **change records**: how many the ledger holds;
- **knowledge homes**: the ones found, by the names the installed
  `.greenline/WORK.md` gives them: `.greenline/DECISIONS.md`, the ADR folder
  docs/adr/, `GLOSSARY.md` and `GLOSSARY-MAP.md`, and a contributing guide,
  `CONTRIBUTING.md` at the root, in `.github/` or in `docs/`;
- **languages**: each language found by file extension among the files git
  tracks and the untracked ones it would add, with the roots that hold it,
  `.` for the top of the tree and each top-level folder; `.greenline/` and
  the files greenline installed are left out;
- **orientation**: what your first request's own change carries inside its
  frame while no change record exists on any branch, local or
  remote-tracking, with no record, proposal or wait of its own:
  `groundwork (empty tree)` where commits read `none` and no language or
  document is found; `survey (documents, no code)` where the tree holds
  documents, such as Markdown or text files, and no code, so the change
  reads them and writes what it learns into the knowledge homes;
  `survey` where code is found; and `none (a change record exists)` once a
  record is on disk or committed on any branch, local or remote-tracking. The status mirror
  prints the same line at a turn's start while no change record exists;
- **stopped on other branches**: the id of each change whose record is
  stopped on another local `greenline/<id>` branch and is not on disk here,
  with the path of the worktree that has its branch checked out where one
  does, such as `2026-10-25-login (in the worktree .worktrees/2026-10-25-login)`,
  so a change stopped in a worktree is found from the main checkout and
  resumed in its worktree. Every stop commits the record and its folder, so
  your agent also finds a change stopped on a remote-tracking branch a clone
  brought, which this line does not read, by that commit;
- **branches before the practice**: the branches cut before greenline was
  installed, each local branch, and each remote-tracking branch with no
  local branch of its name, that holds no `.greenline/manifest.json` where
  the default branch holds one, such as `branches before the practice:
feature/overdue`, the first ten named and the rest counted, or `none`.
  Where `proceed` names a mode, the line goes on to say what a request for
  their files owes: your agent proposes the merge of the default branch
  into the branch as the one yes, asks no direction first, and once the
  merge is done you start a new session there. The status mirror prints it
  at a session's and a turn's start where a branch is named;
- **open in other worktrees**: printed only where one is, each change whose
  record stands open in another checkout `git worktree list` names, such as
  `open in other worktrees: 2026-10-25-login (in the worktree
.worktrees/2026-10-25-login); each is worked on in its own checkout`, so a
  change resumed in its worktree is seen from the main checkout, and never
  counted as stopped. A worktree that still holds an open copy of a record
  this checkout holds done or dropped, as after a merge, is named apart,
  `left in other worktrees: 2026-10-25-login (in the worktree
.worktrees/2026-10-25-login, its record done here); ...`, as a copy left
  behind and never as open; it is removed only on your word. Where your
  agent's session stands in the main checkout while the change it holds is
  open in a worktree, as Codex's does, the status mirror at each turn's start
  is read from that worktree, its first line naming it. The status mirror
  prints these at every turn too;
- **remote**: the remote a landing goes to and whether it is a forge, read
  from its URL as your repository's configuration holds it, never from the
  network: `remote: origin, a forge (github.com)` where the host is
  GitHub, GitLab, Bitbucket or Codeberg, or a host of your own named after
  one, such as `gitlab.example.com`; `remote: origin, not a forge (a local
path)` for a path, and likewise a file URL or an unknown host; and
  `remote: none` with no remote. The close offers the landing by it, and
  the status mirror prints it at every turn;
- **landing**: printed for the change your agent's latest session holds
  once its close has run, the landing's state read from the record's
  `landing` line and git: `landing: none recorded;
main at 6594a00 does not hold feature/find-by-author` before your answer,
  with the offer after it in the close's order, `; offer: the local merge
of feature/find-by-author into main, or leave the branch; the facts
decide: ...`, the act left out where a contributing guide stands, whose
  path it names instead, and your agent recommends the choice in its reply; `landing: nothing to land: the
commits are on main` where main already holds the change's commits and no
  remote is a forge. Before the offer, only words that name the merge, the
  push or the landing answer it, so your yes to a proposal is no merge. And,
  once you answer the offer with words such as "Merge it.", "Push
  it." or "Leave the branch.", what they ask and what comes next after it,
  `; the owner's words at turn 2 ask for the merge into main: write the
landing line in those words, merge, run the check on the merge commit,
tell the red from its facts`, at every turn until the record's `landing`
  line holds your words, and a reply to your merge words that wrote no
  `landing` line and merged nothing named at the next turn's status mirror
  as `landing: the reply at turn 2 withheld the merge the owner asked
for`; then
  `landing: declined on the owner's words` where you left the branch,
  `landing: merge into main on the owner's words; main does not hold the
branch; the check on the merge commit owed` until the merge and its
  check, then `landing: merged into main, checked at 1a2b3c4`, with the
  red check named where it ran red (GL0404), and for a push whether
  `origin/<branch>` holds the branch. `greenline status --change <id>`
  prints it for that change, and the status mirror at every turn of the
  session that holds it;
- **ground**: where the change open on the branch HEAD names does its work
  and which agent does it, from the record's `ground` and `agent` lines,
  such as `ground: branch greenline/2026-10-25-login; agent: claude-code/opus`
  or `ground: worktree .worktrees/2026-10-25-login on greenline/2026-10-25-login; agent: ...`;
  while no change is open, the manifest's standing `ground` choice, `branch`
  or `worktree`, which the proposal states instead of asking; that the
  proposal offers a branch of its own or a worktree, where your repository
  has a remote and you are on its default branch; or the branch your local
  facts give, `ground: no change open; the local facts give branch main,
stated before the first edit`. When you name the mode, so no proposal
  waits, the agent's first reply still states the mode, this ground and any
  rule of your repository it read, in one line, before its first edit.
  Where the `proceed` setting lets your request go on, the mirror at that
  turn's start says so before the reply, `proceed: regular lets a request
for a change go on; the first reply states the mode taken and its ground
in one line before the first edit`; status itself never prints it. In a
  session the mirror's ground line also names the model the harness reports,
  and tells the agent the agent line to write where the record names
  another, such as `codex/gpt-6.1-sol` rather than `codex/gpt-6`.

Where one change stands stopped and none is open on the branch, as on a
default branch with no remote, a line names what it waits on you for,
read from its record's "next" line: `waiting on: wait for the owner to
resume independent review, from the stopped change 2026-11-08-farewell's
next line; the Waiting on row says it`. Where your message of the turn
answers that wait, words that carry on, go on, continue or resume, or a
yes where the wait asks for one, the line says so instead, `...; the
owner's words this turn answer it: set state open as the first write and
go on`, and the agent resumes the change; a message that answers nothing
leaves the wait as the record states it. Where the "next" line waits for
your review or answer, `wait for the owner's review of the tests`, words
that carry on resume the work and do not answer that wait: the line ends
`...; the owner's words this turn resume the work: set state open as the
first write, at build; the wait on the owner stands, the owner's review of
the tests: do its act first, ...`, and only your review's words, such as
"looks good, go ahead" or "the tests look right; write the code", or a yes
answer it. Where the record's folder holds `shown.patch` and the checkout
lacks its edits, as a clone of the stop's commit does, the line names it,
`...; the folder's shown.patch holds the edits the owner saw: apply it
before the wait's act`. A record that reads stopped while
the session that wrote it goes on is named likewise, `stopped: <record>
reads stopped while this session still holds the change; ...`, unless its
stopped line quotes your own stop, and where your words of the turn answer
it, the line ends with the same answer. A pause bound to a step, such as
"pause after the build", is a wait, never a stop. A
record that reads stopped while no commit holds the stop, untracked or
committed in another state, is named until the stop's commit stands,
`stopped: <record> reads stopped and no commit holds it; commit the record
and its folder now, the stop's commit, since a clone and a fresh session
carry commits alone`, the same words the hooks give the agent after the
write that set it, and `greenline status --change <id>` prints it for
that change; where the tree holds uncommitted edits, the line names them
and the folder's `shown.patch` the stop keeps of them, with the git
command that writes it; where your words of the turn resume the change,
the line is left out.

In a clone whose git configuration registers none of greenline's hooks,
before its first `greenline sync`, one line under the situation says so,
`hooks not installed here: ...; greenline sync installs them, run by the
owner or, once the owner is told what it installs, on the owner's word`,
since a clone carries no local configuration and nothing holds a commit
there until the sync. The sync writes into your
clone's git configuration, so it is yours to decide: the agent tells you the
hooks are missing and asks, and greenline's harness hook refuses the agent's
`greenline sync` there until you have written to it in a later turn, or
your message names the sync; a turn the harness starts with a notice of
its own does not count, and each clone is asked about on its own. Run from your own terminal, or as `greenline sync --dry-run`, it goes
on as before. On a branch cut before greenline was installed,
which holds no `.greenline/manifest.json` while the default branch does,
status fails with GL0101 naming the branch and the way back: `this branch
predates the practice: ... switch to main or merge it into <branch>`. The
line goes on to say that either brings greenline's files to the tree but
not to the running session, since a harness loads its hooks at a session's
start, so once it is done you start a new session, and nothing is edited
until then.

Where git or the disk cannot answer, an unreadable ledger among them, the
fact is shown as unknown. `status --json`
carries the same facts under `situation`; `--change` prints none of it.

## The hooks

After the situation, status says how the hooks stand. The git hooks, under
`.greenline/hooks/`, are registered as config-based hooks on git 2.54 or
later, through `core.hooksPath` on an older git that holds no hooks of its
own, or absent, with the reason and the line to add to your own hooks; a
clone carries the scripts and runs none until `greenline sync` registers
them, and `hooks.git: false` in the manifest turns them off. Then the checks
the manifest declares, or "no checks declared" with the two ways to declare
one: `greenline check --declare -- <command>`, or a run recorded with
`greenline check -- <command>`. A declared check run plainly, such as
`npm test`, is recorded for the change open on the branch; with no change
acting where it ran the hook says after the tool that the declared check ran and no
change records the run, or, where the harness takes no context after a
tool, the next turn's mirror says it once. It is a fact and never a
refusal. Then the harnesses whose adapter the
workspace holds; `hooks.adapters: false` turns them off. `status --json`
carries the same under `hooks`. Where a change is open and its harness's
events name the harness, status ends the view with the running surface's
row of the adapters' table, and outside a session, where no events name
one, with the row of each harness the manifest's `targets` name, the same
surface a session there reads, such as `surface: claude-code, terminal: renders
text; interactive yes; delegation yes; worktree yes; questions cards`: whether the surface renders a mermaid
block or only text, whether a person works at it, whether it gives the
session a delegation tool, whether it gives one that makes a worktree,
which a worktree of the change's own is made with before git (`no` on
Codex's CLI and `codex exec`, whose sessions have no such tool, so the
agent makes it with git), and where
frame's questions go. `questions cards` means the harness's question tool
renders cards to you there, so frame asks each round through them, the
recommended answer first, its label ending "(Recommended)" so a yes takes
it; a card asked without it is named to the agent once, for its next
round. `questions reply` means every question stands in
the agent's reply, as in Claude Code's print mode, Codex's default mode and
`codex exec`, and every harness no source has read; Claude Code's terminal
and its desktop app alike show the cards. In the reply each question is
numbered with its answers numbered under it, the recommended one first and
labelled "(Recommended)" with its reason, and you answer in your next
message by number or in your own words; "yes" takes every recommended
answer.

On Codex the hook reads the row from the session: under `codex exec` the
headless row, `questions reply`, so frame calls no question tool there; in
an interactive session plan mode's row, `questions cards`, or the default
mode's, `questions reply`, by the mode the session runs in. Codex's app
is not told from its CLI, so it reads the CLI's rows. Each turn's start
notes the row, and status prints the row the last turn's start read.
Elsewhere a hook cannot tell a harness's surfaces apart, so it reads the
harness's first row, one that renders text: Claude Code's terminal, whose
questions fact is cards, printed in every session of the harness. Where
the session is offered no question tool or the tool returns no answer, as
in print mode, frame puts the round in the reply all the same.

## The changes view

After the situation, `greenline status` shows the changes. With no flag it lists the open and stopped changes, a record that
does not parse among them, then the ten finished most recently closed,
newest first. A change counts as closed when its latest recorded check
ended, or, while it is unfinished, when it started, a probe left out; one
with no check, a dropped change most often, counts as closed at the start of
the day its id names, and the newer id breaks a tie. `--all`
lists every finished change in the same order. Each row gives the change's id, its state with
its "next" line beside it, its mode and how it was chosen with each raise,
the step reached, the depth the review ran at, its commits and the files
they touch, whether its checks passed on the final code, and the count of its garden consultations. Then come each
plan's tickets, each not started, in progress or done, with the tickets
ready to start; the totals; and the commits that belong to no change.

`greenline status --change <id>` is the resume view of one change: its mode
and how it was chosen, why, its state, its "next" line and the step reached;
each raise, its floors, the review depth, its plan and ticket, and its cost,
where the record states them; its ground and its agent, or `not stated`,
and the owner's `discard` words where the record holds them; its commits
and the files they touch; the
latest run of each check, with whether it ran on the final code and, when it
did not, the files that changed after it; for an open change, the commits of
code since its last recorded check, a probe left out, shown when there are
any, or as unknown when git cannot count them, a nudge to run
the checks again and never a finding; its skill loads, each roster skill
the agent loaded with how many times, whole or in part and at which steps,
the skills the record's sections name set beside them (declared and loaded,
loaded and not declared, declared and never loaded) and the record's
`skills` line, which the agent writes in its own words, this listing shown beside it as a hint; the briefs
`greenline brief` wrote, which the close links from this listing; its
garden consultations; and its plan's tickets. It does not print the sections' text, which the record
holds. A finished record read as history is marked so. The workspace's
ledger guide, `.greenline/ledger/README.md`, defines the step reached.

## The skill loads

Where a harness adapter runs, `greenline event` notes each roster skill the
agent loads: a file under `.claude/skills/` or `.agents/skills/` that the
Skill tool, a reading tool or a shell read such as `cat` or `sed -n` puts in
its context, whole or in part. A read whose output goes to a file or to `/dev/null`, such as `cat <page> >/dev/null`, puts nothing in the context and is no load,
and nor is a read the shell counts or digests before it reaches the agent,
`cat <page> | wc -l` or `| shasum`, or a search that prints a count, a
status or the files' names, `grep -c` or `grep -q`. A `head` after the read keeps its first lines, so a
page longer than them is a part, and a filter such as `| grep` makes it a
part too. One shell call that prints two skill pages, such as `cat
tdd/method.md ponytail/simplify.md`, reads each in part, since the harness
may cut the joined result, and on Claude Code a result the harness cut,
its `... [N characters truncated] ...` mark in the text, makes the read a
part too, the whole read and its cut noted for the one call and read as
one part. One call is one fact per skill and file: a page it names twice,
as `cat <page> || cat <the same page under the other root>` does, is one
load whichever side ran, and a brace list, `cat
references/{greenline.md,lens.md}`, is a load of each page. Where a
call's before-tool event noted nothing, its event lost or cut, the
after-tool event notes the read, keyed by the call, so no read is two
facts and two reads of one page stay two; an error while a load is noted
leaves one line in the session's log, `.greenline/tmp/sessions/`, in place
of silence. A load is noted first for the session, in
`.greenline/ledger/sessions/`, since the agent reads before any record
exists; once the session writes a change's record, with a write tool or a shell
command, the loads it noted for no change since it last opened one, the
proposal's reading among them, join the change, and every later one goes
to the change the branch or the session holds, in
`.greenline/ledger/<id>/skills/`, with the step its record was in and the
agent that loaded it. A change holds its reads while its record is open,
stopped, being corrected or closed and not yet committed, so a skill read
at the close, after a stop or on a resume is the change's; a read after
the close lands is the session's own. Both are
generated files: never edit them. The session's own file stays local to
your clone, its folder ignored by git, while the change's file is
committed with the change. When you have the agent reset the tree, the
loads noted since the change's last commit leave its file and stay in the
session's; they count as the change's all the same, and the next load or
record write puts them back, so the close holds every skill the change
read. Each load is one fact: a load the change's file and the sessions'
facts both hold, or that two hooks wrote at once, is read once and
written back once. A load says what entered the context, not
what was followed; the record's sections say that. A read outside the skill
roots is never noted, and a harness that injects a skill without a tool
call, as Codex may for a skill it loads natively, under-counts there.

## Changes (GL04xx)

`greenline status` reports these about the change records under `.greenline/ledger/`; a finding (GL040x) fails the command, and a notice (GL045x, a warning) never does.

| Code   | Meaning                                                                                                                                                            | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL0401 | A change record, check facts file, plan file or garden receipt collection does not parse, or a change folder, plan directory or the receipts folder cannot be read | Correct the named file; until a record parses, nothing else about it is judged. Check facts are written by `greenline check`, and a recorded fact is never removed: restore it from history, or read it with a greenline as new as the one that wrote it, and where neither can, tell the owner. A receipt collection is written by `greenline connectors call`: restore the file or remove it, and open a new request for a consultation a removed collection held                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| GL0402 | A change does not match its mode                                                                                                                                   | An open or stopped record, or a done one whose latest check ran under this installation, does not match what its mode asks of it; the message names which rule and its remedy. A section the mode does not run holds anything but its one line `none at <mode>`: restore that line, or raise the mode. A section the split gives to the other record: a ticket's record moves the text to its plan's record, the planning record leaves it to the tickets'; remove the section. Otherwise correct the record, or raise the mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GL0403 | A floor the mode does not meet                                                                                                                                     | The record names a floor and the agent took its mode without waiting (`choice: standing`), under the `proceed` setting or the request's own words, below that floor: raise the mode with a raise that says why, or have the owner choose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GL0404 | A done change's checks failed                                                                                                                                      | The latest run of a check did not exit zero, ended by a signal, could not start or never finished: a change is `done` only on green checks, so run it again with `greenline check` once its cause is fixed, or reopen the change. A probe, a run whose green the change never claims, runs outside `greenline check`; one recorded by mistake is marked with `greenline check --change <id> --probe <fact>`, and its fact stays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GL0405 | A cited file is missing                                                                                                                                            | The record links into its own folder (`[review](<id>/review-1.md)`) and the file is not there: restore it, or correct the link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GL0406 | A ticket's record opened under a mode its entry does not give                                                                                                      | The record names a plan and a ticket, and the mode it opened under, before any raise, is not the mode beside that ticket in the plan's `tickets.md`. Under `choice: owner` the owner named that mode as the ticket opened, an override that stands: keep it, with `proposed` the entry's mode; a mode named while the list waited belongs in the entry. Otherwise correct the record's mode, or raise it with a raise that says why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| GL0407 | A planning change below careful                                                                                                                                    | A record that names a plan and no ticket runs under quick or regular; a planning change runs under careful: raise its mode with a raise that says why, or have the owner choose. Under `choice: owner` the owner's choice stands: keep it, and raise it only on the owner's word                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GL0408 | A brief file `greenline brief` did not write                                                                                                                       | A `brief-*.md` in the change's folder carries no mark of the command on its first line, or its mark does not hold: it was written, copied, renamed or edited by hand. Every fresh agent's brief, design's, anticipate's, review's and verify's, is written only by `greenline brief --change <id> --step <step> --round <n>`, and the builder never opens, copies, diffs or derives one: remove the file, write the brief with the command, and name the hand-written brief as a finding in the step's section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GL0409 | A cost below the starts the record names                                                                                                                           | The record's `agents` counts fewer than the builder and every fresh agent its record names, in `starts` or by a report `<step>-<n>.md` in its folder, a restart one more. Name each start in `starts`, `"<step> <n>"` or `"<step> <n> restarted"`, and set `agents` to the builder and the starts; the close clears it before `done`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| GL0410 | A done record breaks its forms                                                                                                                                     | A section that fresh agents' reports fill cites another file, or fewer reports than its depth starts; a frame question holds neither its answer nor `answer: open`, or its `decided` is not `owner` or `agent`; the `outcome` line is missing or over 200 characters; a line the mode owes is missing or still holds the skeleton's placeholder, the `floors` line among them, which a list or `none` answers, or a section holds a word left in its place, such as `Pending.`; a start section's first words say no start ran, `none`, `no start`, `not applicable` or `n/a`; the `agent` line names a model family alone where the harness reports the model; the `yes` line quotes words no message of yours the hooks heard holds; a skill the trigger rows owe is named by neither a load the hooks recorded nor the `skills` line and no waiver in your words stands, read only where the hooks recorded loads at all; a research topic you accepted has no report filed; or, at careful, a subject of the frame is neither asked nor closed with a reason, the frame holds no restatement, or no `confirmed` line quotes your words after the restatement was put to you. Correct the record, or open a new change where it is history |
| GL0451 | The code moved after a check (warning)                                                                                                                             | The change's code is not the tree its latest check ran on; the message names the files that changed, never the practice's own: `.greenline/` and the files the lock names are not code. Where no file of the code differs, the run's tree held files no commit of the code holds, as a check recorded before 0.2.0 or a run on uncommitted work leaves it. Run the check again on the final code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GL0452 | An uncited file in a finished change's folder (warning)                                                                                                            | Link the file from the change's record, or remove it; check facts need no link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GL0455 | A change record was deleted (warning)                                                                                                                              | History shows the record added and later deleted, and it is not on disk: restore it from history if the change is to be kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GL0456 | A done change has no check facts (warning)                                                                                                                         | Nothing shows that a check ran: run its checks with `greenline check --change <id> -- <command>`. A run marked a probe with `greenline check --probe` is no check fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| GL0459 | A check fact is missing from its change's folder (warning)                                                                                                         | A facts file names, as the one before it, a facts file the change's folder no longer holds: a recorded fact is never removed or edited. Restore it from history where it was committed, and say in the record what it held. A fact removed while it was the newest leaves no trace, the next run naming the one before it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| GL0460 | A skill the change owes is not loaded (warning)                                                                                                                    | The installation's trigger rows owe a skill by your request's words, the files the change touched, its step or its mode, such as `ponytail` at a regular build, and no load of it stands on the change: the message names each with its reading, the whole page or its front. Load it before the step that uses it and name it in the `skills` line; on a harness whose hooks record no load the line is a hint and done is not refused for it; where you said the change needs none, the agent records your words in the record as `waived: <skill>: <reason>; the owner's yes: "<your words>"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GL0461 | An open record breaks its forms (warning)                                                                                                                          | The same forms as GL0410, named before done; git's hooks refuse the commit that sets `done` while one stands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

A few things status shows are nudges: lines beside a change's row, and in
its resume view, that fail nothing and carry no code, since a mechanism now
holds the method or no fact of the record settles it. A change taken
without waiting (`choice: standing`) under a mode `proceed` does not allow,
since a standing choice applies only where `proceed` admits the mode, so
the hooks were off or bypassed, or it is a mistake; a done planning change
`.greenline/DECISIONS.md` does not name; a finished change whose working
files remain in `.greenline/tmp/<id>/`, which `greenline tidy --change <id>`
removes; a done record whose `agents` differs from the builder and the fresh
agents its harness's events counted; a `skills` line naming a skill the
hooks saw no load of, or leaving out one they saw loaded, a hint the agent
reconciles in its own words; the agents a method started, such as a
picture's agent, named apart from the mode's count, `agents: 2 of 2, and 2
by diagram-design that a method started, counted nowhere and listed
nowhere, neither in the record's starts nor in its agents count`, which a
cost counting them leaves within the mode; and, on the history line, each commit
since the first change record that touches code and belongs to no change,
the first five named, with how the next commit carries the trailer, since
the git hooks write it into every commit of a change's branch.

## Pictures (GL06xx)

`greenline status` reads every durable picture under `.greenline/visuals/`
and the atlas's index, `.greenline/visuals/atlas.json`, and counts, for each,
the commits since the commit it was made or read at that touched the files it
covers; days are never counted. A picture or a page whose count is above none
is drifting, one whose commit the history no longer holds or one of whose
files is gone is stale, and each is a notice that never fails the command.
The view prints one line beside them, the status line's too, such as
`drift: 2 visuals and 1 atlas page changed since their commits`. Two more
lines follow it. The atlas line says whether the repository has a map yet:
`atlas: none`, or `atlas: 4 pages, 1 drifting; map 3 commits behind`, and
once a large change lands, such as a new top-level module or a third of the
pages drifting, it names that change, so the agent can tell you the map is
behind; the map is made on your ask. At a change's close it names the pages that
change touched, which the close refreshes, and the pages it rewrote that
the record's `refreshes` line does not name yet, which done waits for. Where the repository's own
documents are indexed, `.greenline/visuals/documents.json`, the docs line
counts those that drifted: `docs: 1 page drifting: README.md`.

| Code   | Meaning                                                           | What to do                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL0601 | A picture drifted from the code it covers (warning)               | The message names the picture, its tier, the commits since and who drew it; the agent passes on the fact and offers nothing. Ask the agent to remake it under a change, which it does only on your ask, or delete it in the inspector                                                                    |
| GL0602 | A picture's manifest or the atlas's index does not read (warning) | The message names the file and each field it gets wrong: correct it, or remove the picture it describes                                                                                                                                                                                                  |
| GL0603 | An atlas page drifted from the code it covers (warning)           | The message names the page and the commits since. The close of a change that touched its files refreshes it without asking, up to three pages; any other refresh is made on your ask                                                                                                                     |
| GL0604 | A picture the session drew itself (warning)                       | The message names the picture; the agent passes on the fact and offers nothing. A durable picture is kept through `greenline picture keep` on your ask: ask the agent to remake it that way, or delete it in the inspector                                                                               |
| GL0605 | An interface change's page has no pictures yet (warning)          | The message names the pages and the command. Ask the agent to run `greenline check interface --url <address> --path <page>` for each; where no browser is found the command says so, and the close goes on                                                                                               |
| GL0606 | A picture kept with no brief (warning)                            | The message names the picture; the agent passes on the fact and offers nothing. The brief, the question the picture answers, its form, its size, its finish, its palette and its reader, is written before a picture is drawn: ask for a new picture under a change, or delete this one in the inspector |
| GL0607 | An indexed document drifted from the code it covers (warning)     | The message names the document and the commits since. Ask the agent to refresh it; a document you wrote is refreshed only on your ask                                                                                                                                                                    |
| GL0608 | A picture loads something from outside the repository (warning)   | The message names the picture, the address and who drew it; the agent passes on the fact and offers nothing. Ask the agent to remake it with every byte kept in the repository, which the viewer and an offline reader both need                                                                         |
| GL0609 | A picture a remake replaces (warning)                             | The message names the picture and the remake kept with `--replaces`; the agent passes on the fact and offers nothing. Delete the replaced one in the inspector if the remake is the one you want; nothing is deleted for you                                                                             |
| GL0610 | A kept picture was deleted from the home (warning)                | The message names the picture and, where you deleted it in the inspector, says so; the agent restores nothing. Commit the deletion with the change, or ask for the picture again                                                                                                                         |

## Discussions (GL048x)

`greenline status` lists the discussions beside the changes, each kept as a
record under `.greenline/ledger/discussions/` (the guide's
[discussions page](discussions.md)): each open and parked one with its state
and its idea, a parked one with when to come back to it, and the declined,
promoted and merged ones counted on one line. `--json` carries every one as
`discussions`. The status line prints one line while a discussion is open or
parked, such as `discussions: 1 open (2026-10-21-offline-mode), 1 parked`.

| Code   | Meaning                                                                   | What to do                                                                                                                    |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GL0480 | A discussion record does not read                                         | The message names the record and each field or heading it gets wrong: correct it as the ledger guide's "Discussions" gives it |
| GL0481 | A promoted change lacks its discussion's research report (warning)        | Copy the report the message names into the change's folder and cite the copy, so the change's record stands on its own        |
| GL0482 | A record's `from` line names a discussion that does not name it (warning) | Say which of the two lines is wrong, the record's `from` line or the discussion's `changes` line, and correct it              |

## Tidy (GL047x)

`greenline tidy` removes the working files of done and dropped changes,
`.greenline/tmp/<id>/`: the one change `--change <id>` names, or every
finished change's when it names none. It removes nothing else: never a
folder a file of the ledger links into, directly or through a symbolic
link, never an open or stopped change's, never one with no record or a
record that does not parse, and never through a link or into another file
system. It holds the writer lock, runs no git and reports each folder it
removed and each it kept, with `--json` as the other commands. With
`--change <id> --worktree`, run from the main checkout on your word, it
also removes the change's own worktree once the change is done, read from
the checkout it runs in where its record stands there, so a worktree that
kept an open copy of a record done here goes too, with
`git worktree remove`; it keeps a worktree that holds uncommitted work, an
unfinished change's and the one it runs in, and says why. While it
sweeps every change, the folder of an open or stopped change, of a change
with no record and of one whose record does not parse is kept and fails
nothing.

| Code   | Meaning                            | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL0470 | Tidy kept a change's working files | The message says why. A file of the ledger links into the folder, onto it or above it, directly or through a symbolic link: copy what the link relies on into the change's folder and link that copy, or correct a link that does not mean this folder. The change is open or stopped, or has no record, or its record does not parse: tidy keeps the folder until the change is done or dropped and its record parses. The folder, `tmp/` or `.greenline/` is a link, or `tmp/` or the working folder is a mount of another file system: check where it points, or unmount it, and remove it by hand; a mount deeper inside the folder stops the removal with GL0003 and leaves the rest. A ledger file cannot be read: make it readable. Then run tidy again |

## General (GL00xx)

| Code   | Meaning                                 |
| ------ | --------------------------------------- |
| GL0001 | Usage error: check the command line     |
| GL0003 | I/O failure: the message names the path |

Status reports mechanical facts. It does not choose methods, change repository
policy, refresh shared knowledge, or clear a semantic conflict. Use it when a
diagnostic is useful. The agent reads it at the start of each turn, its
situation line before a session's first proposal; where a harness adapter
runs, `greenline event` prints a short mirror of it into the session at
its start and at each request, with a `skills loaded:` line once the open
change has loaded a skill. A turn whose start did not deliver the mirror,
its hook cut before the mirror reached the harness, gets it at the turn's
first tool call where the harness takes context after a tool, with a line
that says the turn began without it; elsewhere the next turn's mirror says
so. Two lines say what the next reply answers: the
`situation:` line, the mode your request names, the `proceed` setting, the
floors the files read so far set, a floor for each entry of the
invariants start's list marked `public contract` or `security`, named as
`public-contract (an invariant: <the entry>)`, a floor seen that the open
change's `floors` line leaves out, named with its cure, `the record's floors
line lacks public-contract: add it there where you judge it a floor`, which
refuses nothing, and the interface fact,
and, while a
change is open, the `owes:` line, the skills the change owes by the
trigger rows the installation carries, by your request's own words for
this change, the files it touched, the files its plan names and the test
its plan says is written until the build ends, and every step its mode
runs, each with
the step that uses it, as a whole read or its front, heaviest first within
the mode's reading budget. A skill leaves the line once loaded, named in
the record's `skills` line or waived in your words, as `done` reads it,
and another change's request is never read as this one's. From review
on, and at `done`, the line reads the files the change touched alone, so a
file the plan named that the change never touched owes nothing at the
close; a skill the plan owes says so, `tdd (whole: the plan names a test
to write, at build)`. A skill owed
whole stays on the line until its `SKILL.md` and each page its recipe
names are read whole, the line naming each page still held, `tdd (whole:
a test file touched, at build; method.md cut by the harness, read it
again; tests.md unread)`. While no change is open, the `owes:` line names
what your last message's words alone owe, until the turn loads it. While a change is open the mirror adds the `record lacks:`
line, the lines its record still lacks for its mode, the `floors` line
among them from the open until a list or `none` answers it, and the hints the
hooks saw beside them: the skills loaded, each helper's start as fresh or
forked from the builder, and a report that does not cite its brief's nonce.
A hint that disagrees with a line is a notice, never a refusal; every line
of the record is the agent's to write. A missing `yes` is named apart: it
holds your words that answered the proposal, which the agent quotes where
its session heard them and asks you for where it did not, writing nothing
outside the proposal's homes before it. A record with no line at all for a
line the open writes, as one written before 0.2.0, is named as written
before this version's form, with your two ways: complete it as ordinary
work, or close the change and open it again. `greenline status --change`
prints the same line for an open change. At the change's first code write
the `owes:` line comes back to the agent after the tool, on Claude Code;
nothing is refused.

While a change is open, the mirror and status print the same facts block
and progress line, which stay in status and the viewer; the reply copies
neither, saying in one sentence what happened, one line of what it waits
on and the viewer's address:

```text
facts:
| Fact | Now |
| --- | --- |
| Change | 2026-10-26-find-by-year |
| Mode | regular, 2 agents, 1 fix round |
| Step | build, written |
| Where | branch greenline/2026-10-26-find-by-year from main |
| View | http://127.0.0.1:7433/changes/2026-10-26-find-by-year |
progress: `find-by-year · frame ✓ plan ✓ anticipate – build ▶ review · verify · close`
```

`View` is the address of the inspector's page the turn calls for while
`greenline inspect` runs, or `not serving` ([the inspector](inspect.md)).
The progress line names every step of the change's line: `✓` written, `▶`
in progress, a step to come named bare, and `–` a step its mode does not
run. A stopped change's line ends `stopped`, one that waits on your word
`waiting on you`, one whose next step names a red check `red`, and a done
change's line reads `✓ find-by-year done · 6 steps`. While no change is
open there is no block and no line. `greenline status --json` carries the
rows as `facts`.

Each diagnostic prints as one line, what to do first and its cause after,
then its severity and code: `  run the check 'pnpm test' of 'ID' again on
the final code: the code moved after it last ran, a.txt changed; warning
GL0451 (.greenline/ledger/ID.md)`. The agent tells you the first sentence;
the code is for the tables below.
