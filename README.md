# greenline

greenline helps a coding agent choose engineering methods from ordinary
requests and carry work across sessions with durable intent and evidence.
It supports Codex and Claude Code.

Skills supply methods and working disciplines. Your agent chooses what the
task needs, works within your decisions, and records the result. greenline
works offline, with no account, no key and no service, and every part of it
is free and open source.

## Install and start work

```bash
npx greenline init
```

Init asks which harnesses to use, installs the default skill roster, and adds
shared instructions to AGENTS.md and CLAUDE.md. `--targets codex,claude-code`
answers its question from a script, and `--yes` accepts both harnesses.
Commit the generated installation before starting feature work. The
[guide](https://fernworks.dev/greenline/docs/) explains everyday use.

## What this repository is

This is the public copy of greenline: the command-line tool, the roster of
skills with the upstream snapshots they were copied from, the runtime block,
the provenance pages, the guide, and the tests and build that prove them. It is generated from a private repository of record by an
export, one commit per release; nothing is authored here. Pull requests are
welcome and are imported into the repository of record rather than merged
here; [CONTRIBUTING](https://github.com/fern-works/greenline/blob/main/CONTRIBUTING.md)
states how.

Maintained engineering knowledge is garden's, a separate product. greenline
reaches it only through the optional connector a workspace's owner enables,
which calls the separately installed `garden` command; a fresh install has it
off. Neither garden's knowledge nor its code is in this repository or in the
package.

## Licence and provenance

The code and the skills in this repository are under the [MIT License](LICENSE);
the Geist fonts the inspector embeds are under the SIL Open Font License,
whose text is `assets/inspect-fonts/OFL.txt`.
Every copied skill names its source repository and commit on its provenance
page: in the package under `provenance/`, one page per skill beside the
ledger's index, and in the repository beside each skill; the
[third-party notices](THIRD_PARTY_NOTICES.md) travel with the package and
every installed method. The same pages are
rendered at [fernworks.dev/greenline/provenance/](https://fernworks.dev/greenline/provenance/).
greenline does not imply upstream endorsement.

fern-works on GitHub, fernworks on npm and fernworks.dev are one owner.
