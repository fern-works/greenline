# Changelog

This file records the changes in each published version of the greenline package.
A change to the block or the CLI adds its line under Unreleased in the same
commit; a release moves the lines into the version's section.

## Unreleased

- The guidance client sends a list request without a query mark when the query is empty, so a cabinet sees the same request from Node 22 and Node 24.

## 0.0.1 (2026-08-28)

| Part     | What changed                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commands | `npx greenline init` initializes a Git repository; `greenline sync` regenerates managed output; `greenline doctor` validates the installation and work artifacts; `greenline status` reports project state from artifact frontmatter. Every command runs offline, supports `--json`, and sends no telemetry. |
| Roster   | The full profile installs 38 skills for Codex and Claude Code. The starter profile installs the pipeline and working-law skills.                                                                                                                                                                             |
| Guidance | Installed skills provide local engineering methods. Decisions, specifications, tickets, reviews, and evidence remain as Markdown in the Git repository so another agent or session can continue the work.                                                                                                    |
| Block    | `npx greenline init` adds a managed instruction block to `AGENTS.md` and `CLAUDE.md`. The block carries six working laws for completion, ambiguity, visual explanation, secrets, durable prose, and working preferences.                                                                                     |
