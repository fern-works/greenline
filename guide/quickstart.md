# Quickstart

Install greenline in a Git repository, then describe the work to your agent.

## Install the current pre-beta build

Version 0.1.0 has not been published. Use its supplied or locally built tarball:

```bash
npm install --global /path/to/greenline-0.1.0.tgz
greenline init --targets codex,claude-code --guidance none
```

After publication, `npx greenline@0.1.0 init` selects this release. An unversioned
registry command can still select the older product until then. The source of
the tool and the skills is public at https://github.com/fern-works/greenline
under the MIT licence; the guidance is a separate, paid service.

At an interactive terminal, `greenline init` asks both questions.
Choose Codex, Claude Code, or both. `--targets codex,claude-code` answers
from a script. Then choose a guidance provider or no guidance.
`--guidance URL` or `--guidance none` answers that question from a script.
`--yes` accepts both harnesses and no guidance. Init creates .greenline, installs
the default skill roster, and adds a shared managed instruction block.

diagram-design and architecture-map carry optional assets. Include either
by name in .greenline/manifest.json's skills.include list, then run
`greenline sync`; init and sync refuse unknown names in either list before writing. Explicit skills.exclude entries override inclusion.
Removing a method from availability does not delete its files. Sync reports
orphans; inspect `greenline sync --dry-run --json`, then ask your agent to collect
the desired exact file paths from its orphan effects and pass them together as
repeated `--force-managed` arguments. A directory or glob is not a supported target.
Preserve edited files unless their deletion is explicitly intended. Sync reports
the orphan classification even for files removed by an authorized force; check
the files or run doctor to confirm the result. Empty parent directories remain.
Commit the generated installation before feature work so its review range can
focus on that change. Commit durable project work and evidence as they become ready.

## Your first conversation

- **“What were we doing?”** The agent reads current work and explains its state.
  An empty workspace is reported as empty.
- **“Fix the empty-list count.”** A settled code change gets one ticket and
  execution account, implementation, independent review, and verification.
- **“Build a booking feature.”** The agent investigates the existing system,
  resolves consequential uncertainty, and uses the planning methods the work
  needs. You do not have to relay between already-authorized stages.
- **“Explain this endpoint; don't change files.”** The answer stays read-only.

## How guidance follows the work

Your agent reads settled repository choices and actual constraints. Separate
roots can have different languages, purposes and exceptions. A new install
invents no toolchain.

With a configured provider, [each code-changing request retrieves current guidance
before editing]{claim: Configured code changes retrieve guidance before editing; an outage is a failure}. [Its subsequent reads use the same publication.]{claim: Knowledge is retrieved for each request under one consistent publication} Set
`GREENLINE_GUIDANCE_KEY` in the harness process environment; never commit it.
A missing key or outage stops guided work with an error.

[Without guidance, the same agent uses installed skills and repository evidence.]{claim: Explicitly unconfigured work uses the same methods with no guidance calls}
Its execution account records that configuration. Questions about your repository
alone do not query the guidance service. Nothing runs while the agent is idle.

## Useful commands

```bash
greenline status
greenline doctor --json
greenline sync
```

Doctor owns the structural verdict. Status includes that same diagnosis alongside
the work index; both exit nonzero for errors. Neither changes files or judges
engineering choices.
Sync reconciles installed methods and instructions from the CLI you are running.
Guidance publications are separate from installed methods.

<!-- diagram: artifact-anatomy -->

## What lives where

```text
.greenline/work/tickets/       compact tasks with global IDs
.greenline/work/reviews/       reviews of exact tickets and results
.greenline/work/evidence/      relied-on instruments and raw results
.greenline/work/<initiative>/  optional planning artifacts
.greenline/DECISIONS.md        decisions book (created with the first lasting choice)
.greenline/manifest.json       installation and guidance configuration
.greenline/ledger/records/     contributor accounts
.greenline/ledger/receipts/    generated guidance delivery facts
.greenline/policy-changes.json latest inspector save evidence
AGENTS.md / CLAUDE.md          shared instructions inside managed markers
.agents/skills/                Codex methods and their support files
.claude/skills/                Claude Code methods and their support files
.agents/skills/*/agents/openai.yaml  per-method Codex discovery metadata
agents/openai.yaml             generated installed-method catalog for Codex
.greenline/WORK.md             artifact and repository-memory formats
.greenline/ledger/README.md    execution-account format
.greenline/THIRD_PARTY_NOTICES.md source attributions and permissions
.greenline/lock.json           generated owned-file hashes
.greenline/tmp/                ignored disposable work
```

Only the chosen harness trees and their metadata are installed. The policy
files initially contain managed content; write optional House rulings outside
the markers using WORK.md's format. [Existing user text outside those markers stays unchanged.]{claim: Managed regions preserve surrounding user text; whole-file outputs require explicit conflict resolution} The Codex catalog
`agents/openai.yaml` is owned as a whole file: greenline cannot merge house
entries into it. An existing user catalog causes a conflict. Preserve it in a
user-owned location before explicitly forcing replacement; keep house skills
available through their own harness-supported discovery files.
Independent guidance remains outside this tree. Authored records are yours;
generated methods and managed regions reconcile through sync.
Next: [the pipeline](./pipeline.md).
