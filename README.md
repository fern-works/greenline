# greenline

greenline gives a coding agent an engineering practice and carries work
across sessions with one record per change. It supports Codex and Claude
Code.

Before any edit the agent proposes one of four modes, fast, medium, high or
max, and waits for your answer; your choice is final. Each mode runs the
same seven steps at its own depth, and every change, in every mode, leaves
one change record under `.greenline/ledger/`. Skills supply the steps, the
starts and the habits, and the agent works within your decisions. greenline
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
skills with the upstream snapshots they were copied from, the recipes that
define each skill and the ledger that records every change to them, the
runtime block, the guide, and the tests and build that prove them. It is generated from a private repository of record by an
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
Every skill is defined by its recipe in this repository, which names each
source by its pinned repository and commit and states every difference from
it with its reason; every change to a recipe is an entry of the ledger in
this repository, whose index ships in the package under `provenance/`. The
[third-party notices](THIRD_PARTY_NOTICES.md) travel with
the package and every installed method. The website renders each skill's
provenance at [fernworks.dev/greenline/skills/](https://fernworks.dev/greenline/skills/).
greenline does not imply upstream endorsement.

fern-works on GitHub, fernworks on npm and fernworks.dev are one owner.
