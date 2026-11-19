# Quickstart

Install greenline in a Git repository, then describe the work to your agent.
You need no account, no key and no service.

## Install

greenline 0.2.0 is on npm and needs Node.js 22 or newer. In a Git repository:

```bash
npx greenline@0.2.0 init --targets codex,claude-code
```

The git hooks init registers run `greenline` from the `PATH`, so install it
there too, `npm install --global greenline@0.2.0`; while it is missing they
let every commit through, and `greenline status` says so. The source of
the tool and the skills is public at https://github.com/fern-works/greenline
under the MIT licence.

At an interactive terminal, `greenline init` asks which harness trees to
install: choose Codex, Claude Code, or both. `--targets codex,claude-code`
answers from a script, and `--yes` accepts both harnesses. Run in a
directory that is no Git repository, init first asks whether to run
`git init` there, and the answer is yours: `--yes` answers yes, and a no
stops init with nothing written. Where no terminal answers, init refuses
with GL0105, and an agent offers you `git init` and waits for your word
before it runs `greenline init --yes`. Init creates .greenline, installs
the default skill roster, adds a shared managed instruction block, writes
the git hooks under `.greenline/hooks/` and registers them, and writes the
adapter of each harness the repository shows. It reads the project's own
files for the commands that run its checks, a package script, a make
target, a Cargo, Python or Go project, writes the ones it finds into the
manifest's `checks` and prints them: a proposal your agent confirms or
corrects in the first change. It asks nothing else. [The pipeline](./pipeline.md#the-hooks-the-promises-held)
says what the hooks and the adapters do.

Codex loads a project's own hooks only once you trust the project's
`.codex` layer and its hooks, which Codex asks the first time you use it
there. Until then the Codex adapter's event hooks do not run: no status
reaches the agent at a request, so it reads `greenline status` itself, and
no write is refused, while the git hooks hold their promises as on every
harness. Trust the project when Codex asks, and the event hooks start then.

Two skills are extras that install only on request: product-description,
with a large set of support files, and interface-catalog, the catalog of
design directions the agent deals from when a change touches an interface
([the catalog](./interface-catalog.md)); the visual skills, diagram-design,
architecture-map and anatomy, are defaults. Where init finds an interface
(a web app, a site, a native or cross-platform app), it writes its roots
into the manifest and offers the design home ([the interface practice](./interface.md)). Include one by name in .greenline/manifest.json's skills.include
list, then run `greenline sync`; init and sync refuse unknown names in either list before writing. Explicit skills.exclude entries override inclusion.
Removing a method from availability does not delete its files. Sync reports
orphans; inspect `greenline sync --dry-run --json`, then ask your agent to collect
the desired exact file paths from its orphan effects and pass them together as
repeated `--force-managed` arguments. A directory or glob is not a supported target.
Preserve edited files unless their deletion is explicitly intended. Sync reports
the orphan classification even for files removed by an authorized force; check
the files or run status to confirm the result. Empty parent directories remain.
Commit the installed practice with the setup change, its record opened
before that commit, or with the first change where none sets the
repository up: every file init
wrote, which `.greenline/lock.json` lists, with the lock and the manifest,
that is AGENTS.md and CLAUDE.md, the harness folders (`.agents/`,
`.claude/`, `.codex/` and any other init wrote), `agents/openai.yaml`, and
`.greenline/` with `WORK.md`, `ledger/README.md`, `hooks/`,
`tmp/.gitignore` and `THIRD_PARTY_NOTICES.md`. A teammate's clone then
holds the practice its records were made under. Each change's record and
the files it cites are committed with the change.

## Your first conversation

- **"What were we doing?"** The agent reads the open and stopped change
  records and explains where each stands. With none to resume, it says so,
  proposes nothing and asks what you want done.
- **Your first request for a change, while no branch holds a change
  record,** carries the orientation `greenline status` names on its
  `orientation` line, inside that change's frame, with no record, proposal
  or wait of its own: on an empty tree the change runs `groundwork`, which
  sets up only what the purpose needs, before the feature you asked for;
  otherwise, even where the tree holds only documents, it reads the
  documents your repository already keeps and writes what it learns into
  their homes before it closes. A question needs no orientation.
- **"Fix the empty-list count."** The agent proposes a mode, likely quick,
  with its reason and cost, and where the work goes: on a repository with a remote, a branch
  of its own, `greenline/<id>`, recommended, and a worktree of its own
  named in one sentence, which you take by answering "worktree". It waits
  for your yes, which greenline quotes in the record from your own words,
  so "just write the code now" is no yes; then it opens one change record and runs the mode's steps: at quick, frame, plan, build, verify and
  close, each in one line, with no review, the record keeping a review
  section that says `none at quick`. While it works, `greenline status` and the viewer show a
  one-line progress bar on those steps; each reply holds one sentence of
  what happened, the line of what it waits on and the viewer's address.
- **"Fix the empty-list count in quick."** A request that names a mode has
  chosen it: the agent states the mode, its floors, which the record's
  `floors` line holds from the open, a list or `none`, and where the work goes
  in one line, then starts without waiting for a yes or putting an
  orientation question first, asking only a choice your request
  leaves open.
- **"Commit it" and "open the PR."** Each slice is committed once its
  checks are green, its files staged by name, in one message form with the
  change's trailer and the agent's, `Greenline-Agent: <harness>/<model>`.
  The close offers one pull request for the change, its body written for a
  reviewer, and pushes and opens it only on your word.
- **"Build a booking feature."** The agent proposes careful and waits.
  Once you agree, it plans; when the work splits into tickets, it lists them
  with a mode beside each and waits again on that list. [The pipeline](./pipeline.md) shows
  every step.
- **"Explain this endpoint; don't change files."** A question needs no mode
  and no record; the answer stays read-only.

## Your repository's choices

Your agent reads settled repository choices and actual constraints. Separate
roots can have different languages, purposes and exceptions. A new install
invents no toolchain.

[Without garden, the same agent uses installed skills and repository evidence.]{claim: Work without garden uses the same methods with no guidance calls}
That is the default: no command contacts a service, and questions about your
repository alone consult nothing. Nothing runs while the agent is idle.

garden, a separate product of maintained engineering knowledge, is reached
only through its optional connector, which a repository's owner enables with
`greenline connectors`. [The garden connector](./connector.md) explains what
enabling it changes and what a consultation leaves behind.

## Useful commands

```bash
greenline status
greenline status --change <id>
greenline status --json
greenline sync
greenline tidy
```

Status is the one diagnosis: it prints the situation your agent reads before
its first proposal, checks the installation, reports the connectors offline
and shows the changes, and it exits nonzero for an error or a finding.
It changes no file and judges no engineering choice. `--change <id>` shows one
change's resume view. Sync reconciles installed methods and instructions from
the CLI you are running. Your agent runs each check of a change through
`greenline check -- <command>`, which takes the open change and the step its
record is in, records the facts of the run beside the change's record and
stores none of its output; a recorded
fact is never removed, and a change is done only when every check's latest
run is green. A check the project lacks is declared once with
`greenline check --declare -- <command>`, so a hook can tell its runs
from other commands without guessing. Set `"fileTokens": {}` in the manifest
and the plan declares a cap on authored files, 5,000 tokens unless you name
another: `greenline check files` refuses a file over it with how to split
it, lockfiles, generated files, vendored trees and data left out.
`greenline tidy` removes the working files of done and
dropped changes, and never a file a record cites; the close runs it for its
change at every mode, and on your word `--worktree` removes a done change's
own worktree too.

## Taking a new version

Install the new version on the `PATH`, where the hooks find it, then run `greenline sync`
in your repository, in your own terminal:

```bash
npm install --global greenline
greenline sync
```

greenline never commits. Sync rewrites the block, the skills, the guides
and the lock, then counts the installed files that differ from HEAD in one
warning, GL0115, those under `.greenline/` apart from the rest; `git
status` lists them. `greenline status` gives the same warning while any
stands. They travel with the repository in a change's commit: the
change that is open, or the next one, commits them with its work, and that
commit carries the change's trailer. A commit of them alone is refused while
no change is open.

The files sync writes are never the code a check ran on: `.greenline/` and
every file the lock names are left out of the tree a check records, so a
sync does not ask for a check again. A check recorded before 0.2.0 took
its tree with those files in, and reads as moved once; running it again
settles it.

A change opened under an earlier version keeps its record as it stands, and
no command converts it. While it is open, the `record lacks:` line names the
lines its record has no line for at all as the form of a record written
before this version, and your two ways: your agent completes it as
ordinary work, or closes the change and opens it again. A missing `yes` is
yours: it holds your words that answered the proposal, which your agent
quotes where its session heard them and asks you for where it did not.

## What lives where

```text
.greenline/manifest.json       installation choices, the proceed, ground and trials settings, the declared checks, the hooks' switches, the file token cap, enabled connectors
.greenline/lock.json           generated owned-file hashes
.greenline/WORK.md             where the work's files live and how long each lives
.greenline/ledger/README.md    the change record's format and the skeleton of each mode
.greenline/ledger/<id>.md      one change record per change
.greenline/ledger/<id>/        the reports and briefs a record cites, and checks/ with the check facts
.greenline/ledger/receipts/    consultation receipts, while garden is enabled
.greenline/plans/<NNN-name>/   a plan's documents and tickets.md, when work splits into tickets
.greenline/tmp/<id>/           a change's working files and each fresh agent's scratch folder, ignored; greenline tidy removes them when it is done
.greenline/hooks/              the git hooks greenline registers, product bytes sync refreshes
.greenline/DECISIONS.md        decisions book (created with the first lasting choice)
.greenline/policy-changes.json latest inspector save evidence
.greenline/THIRD_PARTY_NOTICES.md source attributions and permissions
AGENTS.md / CLAUDE.md          shared instructions inside managed markers
.claude/settings.json, .codex/hooks.json  a harness's adapter, greenline's entries beside yours; other harnesses' adapters sit in their own folders
.agents/skills/                Codex methods and their support files
.claude/skills/                Claude Code methods and their support files
.agents/skills/*/agents/openai.yaml  per-method Codex discovery metadata
agents/openai.yaml             generated installed-method catalog for Codex
```

Only the chosen harness trees and their metadata are installed. The policy
files initially contain managed content; write optional House rulings outside
the markers using WORK.md's format. [Existing user text outside those markers stays unchanged.]{claim: Managed regions preserve surrounding user text; whole-file outputs require explicit conflict resolution} The Codex catalog
`agents/openai.yaml` is owned as a whole file: greenline cannot merge house
entries into it. An existing user catalog causes a conflict. Preserve it in a
user-owned location before explicitly forcing replacement; keep house skills
available through their own harness-supported discovery files.
No engineering knowledge is stored in this tree; a receipt keeps what a
consultation received, never its text. Authored records are yours;
generated methods and managed regions reconcile through sync.

## Removing greenline

No command removes greenline. Take it out by hand in this order, then
commit what is left.

1. **The git hooks.** They are registered in the clone's local git
   configuration, which no commit carries, so take them out in each clone.
   Set `"git": false` under `hooks` in `.greenline/manifest.json` and run
   `greenline sync`, which removes the registration. Without the command,
   `git config --local --get-regexp '^hook\.greenline-'` lists the entries
   and `git config --local --remove-section hook.greenline-pre-commit`
   removes one, a section for each hook; where an older git runs them
   through `core.hooksPath`, `git config --local --unset core.hooksPath`.
   Do this first: while they run, they refuse a commit with no change open.
2. **The harness adapters.** `.greenline/lock.json` lists every file init
   and sync wrote, so read it before you delete `.greenline/`. In
   `.claude/settings.json`, `.codex/hooks.json` and any other harness
   settings file it lists, remove each hook entry whose command is
   `greenline event --harness <name>` and keep yours. Delete an adapter
   greenline wrote whole, such as `.github/hooks/greenline.json` or
   `.opencode/plugins/greenline.js`, and the Hermes or dsh lines you added
   at your user level.
3. **The skills.** Delete each skill folder the lock lists under
   `.agents/skills/` and `.claude/skills/`, and `agents/openai.yaml`.
4. **The instruction block.** In AGENTS.md and CLAUDE.md, delete the lines
   from `<!-- greenline:managed begin policy -->` to
   `<!-- greenline:managed end policy -->`. The rest of each file is yours;
   a file left empty can go.
5. **`.greenline/`.** It holds your change records, plans, decisions book
   and pictures beside greenline's own files. Stop `greenline inspect`,
   copy what you want to keep, then delete the folder. Every record you
   committed stays in git's history.
6. **The command.** `npm uninstall --global greenline`.

Next: [the pipeline](./pipeline.md).
