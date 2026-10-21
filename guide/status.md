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
| GL0101 | No manifest                                       | `greenline init`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
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
- **change records**: how many the ledger holds; with no change record on
  any branch, local or remote-tracking, the first request for a change is the
  orientation, `groundwork` on an empty tree, where commits read `none` and
  languages `none found`, and a survey of the existing documents otherwise;
- **knowledge homes**: the ones found, by the names the installed
  `.greenline/WORK.md` gives them: `.greenline/DECISIONS.md`, the ADR folder
  docs/adr/, `GLOSSARY.md` and `GLOSSARY-MAP.md`, and a contributing guide,
  `CONTRIBUTING.md` at the root, in `.github/` or in `docs/`;
- **languages**: each language found by file extension among the files git
  tracks and the untracked ones it would add, with the roots that hold it,
  `.` for the top of the tree and each top-level folder; `.greenline/` and
  the files greenline installed are left out;
- **stopped on other branches**: the id of each change whose record is
  stopped on another local `greenline/<id>` branch and is not on disk here.
  Every stop commits the record and its folder, so your agent also finds a change stopped
  on a remote-tracking branch a clone brought, which this line does not
  read, by that commit.

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
`greenline check -- <command>`. Then the harnesses whose adapter the
workspace holds; `hooks.adapters: false` turns them off. `status --json`
carries the same under `hooks`.

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
where the record states them; its commits and the files they touch; the
latest run of each check, with whether it ran on the final code and, when it
did not, the files that changed after it; for an open change, the commits of
code since its last recorded check, a probe left out, shown when there are
any, or as unknown when git cannot count them, a nudge to run
the checks again and never a finding; the briefs `greenline brief` wrote,
which the close links from this listing; its garden consultations; and its
plan's tickets. It does not print the sections' text, which the record
holds. A finished record read as history is marked so. The workspace's
ledger guide, `.greenline/ledger/README.md`, defines the step reached.

## Changes (GL04xx)

`greenline status` reports these about the change records under `.greenline/ledger/`; a finding (GL040x) fails the command, and a notice (GL045x, a warning) never does.

| Code   | Meaning                                                                                                                                                            | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL0401 | A change record, check facts file, plan file or garden receipt collection does not parse, or a change folder, plan directory or the receipts folder cannot be read | Correct the named file; until a record parses, nothing else about it is judged. Check facts are written by `greenline check`, and a recorded fact is never removed: restore it from history, or read it with a greenline as new as the one that wrote it, and where neither can, tell the owner. A receipt collection is written by `greenline connectors call`: restore the file or remove it, and open a new request for a consultation a removed collection held                                                             |
| GL0402 | A change does not match its mode                                                                                                                                   | An open or stopped record, or a done one whose latest check ran under this installation, does not match what its mode asks of it; the message names which rule and its remedy. A section the mode does not run holds anything but its one line `none at <mode>`: restore that line, or raise the mode. A section the split gives to the other record: a ticket's record moves the text to its plan's record, the planning record leaves it to the tickets'; remove the section. Otherwise correct the record, or raise the mode |
| GL0403 | A floor the mode does not meet                                                                                                                                     | The record names a floor and the agent took its mode without waiting (`choice: standing`), under the `proceed` setting or the request's own words, below that floor: raise the mode with a raise that says why, or have the owner choose                                                                                                                                                                                                                                                                                        |
| GL0404 | A done change's checks failed                                                                                                                                      | The latest run of a check did not exit zero, ended by a signal, could not start or never finished: a change is `done` only on green checks, so run it again with `greenline check` once its cause is fixed, or reopen the change. A probe, a run whose green the change never claims, runs outside `greenline check`; one recorded by mistake is marked with `greenline check --change <id> --probe <fact>`, and its fact stays                                                                                                 |
| GL0405 | A cited file is missing                                                                                                                                            | The record links into its own folder (`[review](<id>/review-1.md)`) and the file is not there: restore it, or correct the link                                                                                                                                                                                                                                                                                                                                                                                                  |
| GL0406 | A ticket's record opened under a mode its entry does not give                                                                                                      | The record names a plan and a ticket, and the mode it opened under, before any raise, is not the mode beside that ticket in the plan's `tickets.md`. Under `choice: owner` the owner named that mode as the ticket opened, an override that stands: keep it, with `proposed` the entry's mode; a mode named while the list waited belongs in the entry. Otherwise correct the record's mode, or raise it with a raise that says why                                                                                             |
| GL0407 | A planning change below careful                                                                                                                                    | A record that names a plan and no ticket runs under quick or regular; a planning change runs under careful: raise its mode with a raise that says why, or have the owner choose. Under `choice: owner` the owner's choice stands: keep it, and raise it only on the owner's word                                                                                                                                                                                                                                                |
| GL0408 | A brief file `greenline brief` did not write                                                                                                                       | A `brief-*.md` in the change's folder carries no mark of the command on its first line, or its mark does not hold: it was written, copied, renamed or edited by hand. A reviewer's or verifier's brief is written only by `greenline brief --change <id> --step <step> --round <n>`, and the builder never opens, copies, diffs or derives one: remove the file, write the brief with the command, and name the hand-written brief as a finding in the step's section                                                           |
| GL0409 | A cost below the starts the record names                                                                                                                           | The record's `agents` counts fewer than the builder and every fresh agent its record names, in `starts` or by a report `<step>-<n>.md` in its folder, a restart one more. Name each start in `starts`, `"<step> <n>"` or `"<step> <n> restarted"`, and set `agents` to the builder and the starts; the close clears it before `done`                                                                                                                                                                                            |
| GL0451 | The code moved after a check (warning)                                                                                                                             | The change's code is not the tree its latest check ran on; the message names the files that changed. Run the check again on the final code                                                                                                                                                                                                                                                                                                                                                                                      |
| GL0452 | An uncited file in a finished change's folder (warning)                                                                                                            | Link the file from the change's record, or remove it; check facts need no link                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GL0455 | A change record was deleted (warning)                                                                                                                              | History shows the record added and later deleted, and it is not on disk: restore it from history if the change is to be kept                                                                                                                                                                                                                                                                                                                                                                                                    |
| GL0456 | A done change has no check facts (warning)                                                                                                                         | Nothing shows that a check ran: run its checks with `greenline check --change <id> -- <command>`. A run marked a probe with `greenline check --probe` is no check fact                                                                                                                                                                                                                                                                                                                                                          |
| GL0459 | A check fact is missing from its change's folder (warning)                                                                                                         | A facts file names, as the one before it, a facts file the change's folder no longer holds: a recorded fact is never removed or edited. Restore it from history where it was committed, and say in the record what it held. A fact removed while it was the newest leaves no trace, the next run naming the one before it                                                                                                                                                                                                       |

A few things status shows are nudges: lines beside a change's row, and in
its resume view, that fail nothing and carry no code, since a mechanism now
holds the method or no fact of the record settles it. A change taken
without waiting (`choice: standing`) under a mode `proceed` does not allow,
since a standing choice applies only where `proceed` admits the mode, so
the hooks were off or bypassed, or it is a mistake; a done planning change
`.greenline/DECISIONS.md` does not name; a finished change whose working
files remain in `.greenline/tmp/<id>/`, which `greenline tidy --change <id>`
removes; a done record whose `agents` differs from the builder and the fresh
agents its harness's events counted; and, on the history line, each commit
since the first change record that touches code and belongs to no change,
the first five named, with how the next commit carries the trailer, since
the git hooks write it into every commit of a change's branch.

## Tidy (GL047x)

`greenline tidy` removes the working files of done and dropped changes,
`.greenline/tmp/<id>/`: the one change `--change <id>` names, or every
finished change's when it names none. It removes nothing else: never a
folder a file of the ledger links into, directly or through a symbolic
link, never an open or stopped change's, never one with no record or a
record that does not parse, and never through a link or into another file
system. It holds the writer lock, runs no git and reports each folder it
removed and each it kept, with `--json` as the other commands. While it
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
its start and at each request.
