# Groundwork: the practice's mechanics

This page holds where groundwork's work lands in the workspace and the commands it runs, which `SKILL.md` names by their nouns. Read it with `SKILL.md` when the work lands in the workspace.

## Where its work lands

The practice is installed with `greenline init --targets <harness>...`; `greenline init --help` lists the targets. The work guide is `.greenline/WORK.md`, which says where the files of the work live and gives the `greenline-roots` root statement under Repository memory; the decisions book is `.greenline/DECISIONS.md`. Each pinned tool's first run goes through `greenline check -- <command>`.

## The setup change's commit

The setup change commits the installed practice with its own work, so a teammate's clone holds the practice its records are made under: every file `greenline init` wrote, the paths `.greenline/lock.json` lists, with the lock and `.greenline/manifest.json`. That is AGENTS.md and CLAUDE.md, the harness folders init wrote (`.agents/`, `.claude/`, `.codex/` and any other), `agents/openai.yaml`, and under `.greenline/` `WORK.md`, `ledger/README.md`, `hooks/`, `tmp/.gitignore` and `THIRD_PARTY_NOTICES.md`, beside the decisions book and the change's record. Stage them by name as any commit of the change; after the commit, `git status` shows none of them untracked. Open the setup change's record before that commit, never after it: the commit that records the practice carries the record, `.greenline/ledger/<id>.md`, and the change's trailer, and while no change is open the hooks refuse it.
