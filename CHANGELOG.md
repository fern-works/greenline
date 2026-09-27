# Changelog

This file records the changes in each published version of the greenline package.
A change to the block or the CLI adds its line under Unreleased in the same
commit; a release moves the lines into the version's section.

## Unreleased

A greenline install now needs no account, no key and no service; it works entirely offline and keeps every method, artifact and receipt it had. The built-in guidance was the premium part; it moves to garden, which the owner can enable when they want it. A fresh install has no maintained knowledge until its owner enables garden.

- The built-in guidance commands, the guidance client and the provider setting are gone. greenline carries no guidance, no service and no database, and every part of it is free and open source.
- `greenline connectors list`, `status`, `enable garden --url URL [--executable PATH]` and `disable garden` manage the optional garden connector offline. Enabling writes the connector's entry to the manifest, installs the use-garden skill and adds its line to the managed block, in one change; disabling removes the three and keeps receipts and your text. greenline never installs, runs or contacts garden to enable it, and stores no credential.
- `greenline connectors call garden OPERATION` runs one of garden's six reads through the separately installed garden command, with literal arguments and no shell, and records the call before any result is shown.
- `greenline status` and `greenline doctor` report each connector's state offline. For an enabled garden they show the endpoint, the executable that would run and whether `GARDEN_API_KEY` is set, and warn with GL0125 when the executable would not run or the key is not set, without starting garden or reading the key.
- `greenline inspect` shows each consultation's receipt: its publication and every call's operation, outcome and units, never a unit's text.
- The package carries the licence of the Geist fonts the inspector embeds, `assets/inspect-fonts/OFL.txt`.
- This is a development break with no converter: the manifest is schema 6 and has no guidance field, the receipt collection is schema 4 with the literal source `garden` and the connector's error kinds (`missing-executable`, `cancelled`, `deadline`, `output-cap`, `process`, `protocol`, or garden's own refusal), the execution account has no guidance declaration, and `greenline init` asks no provider question. An earlier workspace is initialized again.

## 0.0.1 (2026-08-28)

| Part     | What changed                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commands | `npx greenline init` initializes a Git repository; `greenline sync` regenerates managed output; `greenline doctor` validates the installation and work artifacts; `greenline status` reports project state from artifact frontmatter. Every command runs offline, supports `--json`, and sends no telemetry. |
| Roster   | The full profile installs 38 skills for Codex and Claude Code. The starter profile installs the pipeline and working-law skills.                                                                                                                                                                             |
| Guidance | Installed skills provide local engineering methods. Decisions, specifications, tickets, reviews, and evidence remain as Markdown in the Git repository so another agent or session can continue the work.                                                                                                    |
| Block    | `npx greenline init` adds a managed instruction block to `AGENTS.md` and `CLAUDE.md`. The block carries six working laws for completion, ambiguity, visual explanation, secrets, durable prose, and working preferences.                                                                                     |
