## The request loop

You are the agent of this repository's practice. To the owner, call it the
practice, never by the name of the CLI that installs it; a command, a path
or a branch is quoted as it stands. A skill named here is a pointer, never
a command: load it through the harness's skill mechanism, or read its
`SKILL.md` whole, since a summary is not a full read, and a page it sends
you to.

1. **Establish intent and read the situation.** Read the request, the open
   and stopped records under `.greenline/ledger/`, the repository's own
   instructions and its decision home, and the situation line
   `greenline status` prints. A factual question about this repository is
   answered from its files: it retrieves no guidance and is not acted on,
   and a defect found is named with its evidence and offered. A question,
   or a step asked for by name that changes no file, needs no mode and no
   record. Furniture the repository lacks is proposed, not added.
2. **Propose the mode and where, then wait.** Before any edit, state the
   mode from the table below, why, its cost in agents and rounds, each
   floor found, the change's id, and the branch its commits go to. Wait for the owner's yes, unless the request names the
   mode or the `proceed` setting allows it; state the proposal all the same. Work that splits into tickets waits twice: for the planning change's
   mode, careful, and for the ticket list.
3. **Open the record.** On that branch, write `.greenline/ledger/<id>.md`
   from its mode's skeleton in `.greenline/ledger/README.md`.
4. **Run the line.** Run the steps in the line's order, each at the depth
   the mode gives it, skipping a step at none: load the step's skill and
   its references page, `references/greenline.md`, which says where the
   step's work lands, and write its section when it ends. Where the harness
   has no delegation, a depth that needs a fresh agent runs without one:
   review inline, verify written, anticipate as its self-questioning pass,
   the section naming the limit. Load a habit when its row's situation
   arises.
5. **Close.** The close step sets the state, offers the landing and ends with `greenline tidy --change <id>`.

## The promises

- Every commit of a change carries `Greenline-Change: <id>` as the last
  line of its message's last paragraph; no commit is rewritten to move it.
  Git hooks hold both.
- A change is `done` only when the latest recorded run of each of its
  checks is green, never over a red or absent one; a git hook refuses it.
- No commit, and no file outside `.greenline/ledger/` and
  `.greenline/tmp/<id>/`, before the owner's yes, nor while no change is
  open; hooks refuse them, reading `choice: standing` as the yes only where
  `proceed` allows the mode.
- No push, pull request or merge without the owner's word in the record's
  `landing`; a git hook refuses it.
- Every check runs through `greenline check`, a red run included; a command
  run plainly proves nothing. The manifest's `checks` declares them.
- Every fresh agent the line's depths start is counted in the record's
  `agents` and named in `starts`; a harness hook counts them.
- `greenline status` is read at the start of each turn; a harness hook
  prints it.
- The record states who chose the mode and has every step's section, a
  skipped one holding only `none at <mode>`; `greenline status` checks both,
  and a fact removed between runs.
- Nothing contacts a remote before the proposal.
- A stop commits only the record and its folder.
- Every scratch file goes under `.greenline/tmp/<id>/`, never the host's
  temporary directory.
- The owner's choice is final; every floor found is in `floors`; a recorded
  check fact is never edited or removed.

## When this happens, read this

| When this happens                                           | Read this                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A request for a change, with no change record on any branch | the orientation: `groundwork` on an empty tree, otherwise `architecture-survey`; frame's references, "The orientation" |
| A question, or a step asked for by name                     | frame's references, "Questions and named steps"                                                                        |
| A follow-up inside an open change                           | it joins that change: `greenline status --change <id>`                                                                 |
| A request for another change while one is held              | close's references, "Stops"                                                                                            |
| A detached HEAD, or a branch a repository rule forbids      | frame's references, "Where the commits go"                                                                             |
| A floor found, or a raise                                   | frame's references, "The proposal"                                                                                     |
| Work that splits into tickets                               | plan's references, "Tickets"                                                                                           |
| No check the project declares                               | plan's references, "Checks"                                                                                            |
| A stopped change to resume                                  | `router`, then close's references, "Stops"                                                                             |
| A fresh agent to start                                      | review's references, "Fresh agents"                                                                                    |
| A test or a check about to run                              | build's references, "Checks"                                                                                           |
| A commit about to be made                                   | build's references, "Commits"                                                                                          |
| A skill marked as installing on request                     | offer it; `.greenline/WORK.md`, "Installing and removing methods"                                                      |
| The close                                                   | `close` and its references, "The landing"                                                                              |
