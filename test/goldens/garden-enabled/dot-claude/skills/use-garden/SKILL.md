---
name: "use-garden"
description: "Consulting garden, the separately installed guidance command this repository's owner enabled, when an open engineering choice the repository does not settle would be informed by published guidance. Use for a choice between approaches, a pattern or pitfall for a technology or concern the change touches, or a unit a repository decision names; not for a question about this repository's own facts or a change whose choices are already settled."
---

# Use garden

garden is a separately installed command that answers engineering guidance
questions from a published body of units. This repository's owner enabled it,
so you may consult it whenever a question below is relevant, without asking
each time. This method says when a consultation is relevant, what must be in
place, how a consultation stays bounded, what a result is worth here and what
to do when a consultation fails. The commands, their flags and their replies
are in [operations.md](operations.md).

## When a consultation is relevant

Consult garden when the work reaches an open engineering choice that the
repository's instructions, its decisions book, its root statements and the
installed methods do not settle, and published guidance would inform it:

- a choice between approaches, libraries or patterns for a technology a
  governed root declares;
- a known pitfall, a security or data-handling rule, or a verification
  practice for a concern the change touches;
- a unit or an anchor that a repository decision or an earlier consultation
  names by its id.

These trigger no read:

- a factual question about this repository: inspect its files and answer;
- a change whose choices are already settled, the light path among them: a
  fix with no open choice needs no consultation;
- a question the repository's own decisions already answer, even when
  garden might answer it differently;
- wording, formatting, renaming or any change that makes no engineering
  choice.

Enabling permits relevant consultation. It never makes a read due before
every edit, at the start of a session or as a ritual before a handoff. A
consultation is part of the work it informs and is not announced as a step.

## What must be in place

- **The garden command.** The owner installs it separately; the manifest's
  `connectors.garden.executable` names it, `garden` on the `PATH` or an
  absolute path. greenline installs nothing and downloads nothing for garden,
  and there is no other way to reach it: never fetch garden's service or site
  directly.
- **garden's key.** garden reads it from `GARDEN_API_KEY` in the environment
  this session runs in. greenline passes it on unread and stores it nowhere.
  Check only whether the variable is present; never print it, write it to a
  file or the manifest, or ask for it in the conversation.
- **An execution account.** Every consultation is recorded under the account
  of the contribution it serves, as `.greenline/ledger/README.md` describes.
  Work with no account, an answer or a light fix, consults nothing.

You never enable, disable, install or reconfigure garden yourself. Those are
the owner's steps, taken with `greenline connectors enable garden --url URL`
and `greenline connectors disable garden`. You never run the garden command
yourself either: only `greenline connectors call garden` records a receipt
before a result is shown, so a direct run is an unrecorded consultation.

## How a consultation runs

1. Open a request under the account with the first call, usually a list:
   `greenline connectors call garden list --record <account>` with the
   facets the change needs (`--language`, `--technology`, `--task`,
   `--concern`, `--purpose`, `--kind`) and the `--root` values that govern
   the touched files. Derive the facets from the root statements in
   `.greenline/DECISIONS.md` and the actual configuration, and the task and
   concern from the requested change. The `vocabulary` operation lists the
   values a facet may take.
2. Read each candidate's `when` and `summary` and select the units that bear
   on the choice. Read them with `greenline connectors call garden read
   --request <handle> --id <unit> --requires`, which also delivers the units
   a selected unit requires.
3. Continue with `--request <handle>` for the rest of this owner request. A
   new owner request, a continuation asking for further edits included,
   opens a new request with `--record`.

**One pinned publication per request.** The first successful call fixes the
publication garden answered from, and every later call of the request reads
that same publication. A continuation is refused when the repository's policy,
garden's endpoint or the account changed since the request began; open a new
request rather than work around the refusal. Nothing is ever silently rebound
to another publication.

**The read budget.** Each read delivers at most 16 units and 262144 bytes of
content, and each call ends within 30000 ms; a request fixes these limits when
it opens. A `budget` refusal means selecting fewer units, not opening another
request to read past the limit.

**Exclusions and prerequisites.** The exclusions the governed roots' statements
declare are applied to every read without being named; `--exclude <unit>`
adds one for this read. A unit the repository excludes is never read, even
when another unit requires it: the `excluded` refusal is the repository's
prohibition holding, and the dependent unit is used without it or not at all.
Choose `--root` values explicitly; the command does not infer which root
governs.

## What a result is worth here

- The repository's instructions, decisions, constraints and prohibitions
  outrank any unit. A unit fills a gap they leave; a unit that contradicts a
  repository decision is not applied, and the conflict is named with its
  evidence when it matters to the work.
- A `disagreement` unit records that sources disagree: state the positions
  rather than average them. An `option` unit belongs to an option group, and
  the repository's decision chooses among the options.
- A result serves the request that received it. It never becomes standing
  guidance: it is not copied into the decisions book or a rule file, and a
  later request consults again rather than rely on an earlier reply. When the
  work settles a lasting choice, the book records the choice and its reason
  in the repository's own words.
- Unit bodies stay in the tool output. They are not saved to a file, a local
  library or a compiled task note.
- The receipt records what garden delivered, never what was applied. Say
  what a consultation changed in the account's `guidanceAnnotations` and
  `applications`, with the consultation ids the read returned and the actual
  code or check evidence, as `.greenline/ledger/README.md` describes.

## When a consultation fails

A failed call prints its kind and never a result. Each kind has one outcome:

| What happened | What you do |
| --- | --- |
| `unavailable`, `deadline`, `process` or `output-cap`: garden's service or command did not answer, or limited the rate | The call has ended. Continue the locally supported work without asking permission, and tell the person once in this request that garden was not consulted and what it would have informed. An `unavailable` whose input names the output is different: the receipt records a delivery that was never shown to you, so nothing from it is used and the consultation is reported as not seen. |
| `cancelled` | Stop that consultation. A cancellation is never permission to run it again or to continue it another way. |
| `unauthorized` or `missing-executable`: garden had no key, refused the key or its entitlement, or the command is absent | Nothing protected was delivered. Explain the remedy: the garden command installed, or a `GARDEN_API_KEY` in the session's environment that garden accepts with the entitlement the read needs. Keep ordinary local work going. |
| `private-data`: the key would have left garden in the call's arguments, the endpoint or an answer | Nothing carrying it was sent or written. Never put the key, or anything derived from it, into a flag value. When the endpoint or an answer carried it, tell the owner that the configured endpoint needs checking and that the key may be exposed. Do not repeat the same call. |
| `protocol`, `invalid-result` or `not-found`: the reply did not verify, was incomplete or named no such unit | Nothing from that call is used, and no unit is claimed as read that its receipt does not show delivered. |
| `budget`, `excluded` or `invalid-request`: the call asked past the budget, for an excluded unit, or with refused arguments | Narrow the call or correct its arguments. Never open another request to get past a limit or an exclusion. |
| `configuration`: garden disabled, the account, or a changed policy or endpoint | Change no configuration. A changed policy or endpoint means opening a new request with `--record`. |
| `evidence`: the receipt could not be written or confirmed | The consultation is not recorded and its result was not printed. Report the evidence failure as it is, not as an outage, and leave any lock file for the owner to inspect. Never run the garden command directly to get the result another way. |

When a repository rule or the task genuinely needs what garden could not
deliver, hold the action that depends on it, name the missing guidance and
why the action needs it, and continue the work that does not depend on it. A
failure that blocks nothing needs no hold.

Give one notice per request, not one per failed call: once the person knows
garden was not consulted in this request, a later failed call is not announced
again unless it asks something new of the person, such as a key to set. Do not
retry in a loop; the next request with a relevant question tries garden again,
and a request keeps its pinned publication when the service recovers.

Never manufacture a successful reply, a receipt or a unit's content. Never
switch silently to another source: not another guidance provider or command,
not garden's site, not remembered text presented as garden's guidance. Keep no
copy of a unit to use while garden is unavailable.
