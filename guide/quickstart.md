# Quickstart

Install greenline in a Git repository, then describe the work to your agent.
You need no account, no key and no service.

## Install the current pre-beta build

Version 0.1.0 has not been published. Use its supplied or locally built tarball:

```bash
npm install --global /path/to/greenline-0.1.0.tgz
greenline init --targets codex,claude-code
```

After publication, `npx greenline@0.1.0 init` selects this release. An unversioned
registry command can still select the older product until then. The git
hooks init registers run `greenline` from the `PATH`, so install it there
too; while it is missing they let every commit through, and
`greenline status` says so. The source of
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

Three skills are extras that install only on request: diagram-design,
architecture-map and product-description, each with a large set of support
files. Include one by name in .greenline/manifest.json's skills.include
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
  record,** is the orientation: on an empty tree the agent runs
  `groundwork`, which sets up only what the purpose needs, as its own change
  before the feature you asked for, or as your request's own change when
  you asked to set the repository up; otherwise it surveys the documents
  your repository already keeps and, under a quick record it opens first,
  writes what it learns into their homes.
  A question needs no orientation.
- **"Fix the empty-list count."** The agent proposes a mode, likely quick,
  with its reason and cost, and waits for your yes. It then opens one change
  record and runs the mode's steps: at quick, frame, plan, build, verify and
  close, each in one line, with no review, the record keeping a review
  section that says `none at quick`.
- **"Fix the empty-list count in quick."** A request that names a mode has
  chosen it: the agent states the mode and where its commits will go, then
  starts without waiting for a yes, asking only a choice your request
  leaves open.
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
from other commands without guessing. `greenline tidy` removes the working files of done and
dropped changes, and never a file a record cites; the close runs it for its
change at every mode.

## What lives where

```text
.greenline/manifest.json       installation choices, the proceed and trials settings, the declared checks, the hooks' switches, enabled connectors
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
Next: [the pipeline](./pipeline.md).
