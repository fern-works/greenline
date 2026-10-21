# Build: the practice's mechanics

This page holds build at each mode's depth and where its work lands: the section, the checks it runs, the commits it makes and the files it writes on the way. Read it with `SKILL.md` when the mode reaches build, and when AGENTS.md's index sends you here.

## The depths

- **Inline, at quick.** Build the change by `SKILL.md`'s slices, and write the change record's build section, in `.greenline/ledger/<id>.md`, as one line: what was built and the check that shows it, with any deviation from the plan.
- **Written, at regular and careful.** Build the change by `SKILL.md`'s slices, and write the build section: what was built, slice by slice; each deviation from the plan, with what you decided and why; each approach tried and dropped, with what dropped it; and what was noticed outside the task and left alone.

## Checks

Every check runs through `greenline check`, its red runs included; a probe, a run whose green the change never claims, runs outside it, as the verify skill says. A recorded check fact is never removed or edited: a rerun records a new one, and a probe recorded by mistake is marked with `greenline check --change <id> --probe <fact>`. Every file written on the way and not part of the change, a probe, a scratch script or a before-and-after copy, yours or a fresh agent's, goes under `.greenline/tmp/<id>/`, never the host's temporary directory, and a check's facts cite paths inside the repository.

Run each of `SKILL.md`'s increment checks, and the completion contract's final test run, through `greenline check -- <command>`, its red runs included, so the change's checks record it: the short form takes the open change and the step its record is in, and names that step beside the facts, so give `--change <id> --step <step>` where it names another. A run of the change's code you make only to read, a failing test's detail or a quick look after an edit, is a check too: `greenline check -- node --test --test-name-pattern=<name> <file>` records it, and its output shows as it runs, so read the detail there. Each such command is a check of its own: once its cause is fixed, run it again green, since `done` waits on the latest run of every check. The one run left plain is a probe, a run whose green the change never claims: a baseline at an earlier commit, a mutation run, a negative control. `greenline status --change <id>` counts the commits since the last recorded check, and a count above zero is code committed since that no recorded check saw.

## Commits

Each slice's commit goes on the change's branch, the one its proposal named or, for a ticket, the planning change's, never another change's, and the change's first commit carries its record, `.greenline/ledger/<id>.md`, since `greenline status` reads history only from the commit where the first change record entered. Every commit carries the trailer `Greenline-Change: <id>` from the moment it is made, as the last line of the message's last paragraph, one block with any trailer the harness adds there, such as `Co-Authored-By`; no commit, an unpushed one included, is reset, amended, rebuilt or rewritten with `filter-branch` to move it. A trailer-shaped line of another key, such as `Related-Change: <id>`, put in a message after a hook refuses it is not an answer to the refusal: report the refusal to the owner and ask. Generated code follows its generator; vendored contributions follow their upstream's contract.

## Secrets and guidance

Protect secrets and keep guidance bodies in tool output, never in a local library or task compilation; a key or a variable that may hold one is checked for presence, never printed, even while diagnosing.
