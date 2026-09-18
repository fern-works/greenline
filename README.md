# greenline

greenline helps a coding agent choose engineering methods from ordinary
requests and carry work across sessions with durable intent and evidence.
It supports Codex and Claude Code.

Skills supply methods and working disciplines. Engineering guidance supplies
standards, patterns, explanations and tool options. Your agent reads what the
task needs, applies it within your decisions, and records the result.

## Install and start work

```bash
npx greenline init
```

Init asks which harnesses to use, installs the default skill roster, and adds
shared instructions to AGENTS.md and CLAUDE.md. It also asks for a guidance
provider or no guidance; `--guidance none` and `--targets codex,claude-code`
answer both from a script, and `--yes` accepts both harnesses and no guidance.
Commit the generated installation before starting feature work. The
[guide](https://fernworks.dev/greenline/docs/) explains everyday use.

## What this repository is

This is the public copy of greenline's open half: the command-line tool, the
roster of skills with the upstream snapshots they were copied from, the
runtime block, the provenance pages, the guide, and the tests and build that
prove them. It is generated from a private repository of record by an
export, one commit per release; nothing is authored here. Pull requests are
welcome and are imported into the repository of record rather than merged
here; [CONTRIBUTING](https://github.com/fern-works/greenline/blob/main/CONTRIBUTING.md)
states how.

Engineering guidance is a paid service that the tool talks to when a
workspace configures it; the guidance is not in this repository and not in
the package. The service's code is not here either.

## Licence and provenance

The code and the skills in this repository are under the [MIT License](LICENSE).
Every copied skill names its source repository and commit on its provenance
page: in the package under `provenance/`, one page per skill beside the
ledger's index, and in the repository beside each skill; the
[third-party notices](THIRD_PARTY_NOTICES.md) travel with the package and
every installed method. The same pages are
rendered at [fernworks.dev/greenline/provenance/](https://fernworks.dev/greenline/provenance/).
greenline does not imply upstream endorsement.

fern-works on GitHub, fernworks on npm and fernworks.dev are one owner.
