# Work artifacts

Use a ticket for a bounded code change. Its identity is independent of any
initiative. An initiative groups a larger intent arc and lists its tickets;
it does not own their location. The agent authors project state. The CLI
parses it, reports facts, and refuses stale or inconsistent references.

## A compact ticket

Inspect the filenames in `.greenline/work/tickets/` (an absent directory is empty)
and choose an unused TKT-NNN; recheck before writing to avoid a concurrent collision.
Use `greenline status --json` to inspect the existing tickets, then write
`.greenline/work/tickets/TKT-001.md`. Keep the intent, affected scope, agreed
authority, acceptance, and relevant constraints self-contained. This is the
same ticket shape used in larger work:

```markdown
---
id: TKT-001
type: ticket
status: ready
revision: 1
intent: "Preserve the caller deadline across retries."
scope:
  - src/http
depends_on: []
consumes: []
acceptance:
  - [ ] Every retry uses the original caller deadline.
---

## Scope and authority

The owner requested this bounded repair. Existing retry policy stays in
force. Record a new consequential choice before implementing it.

## Evidence

Link the execution account and verification witnesses here when available.
```

`scope` names repository-relative roots or paths. `depends_on` contains global
ticket IDs, including prerequisites in another initiative. `consumes` pins
actual upstream artifacts as `{ id: INIT-001/SPEC, revision: 2 }`; omit it or
use an empty list when no upstream artifact is needed. A prose edit that
changes intent, acceptance, or another consumed contract increments the
revision. Pure annotations do not invent a new contract revision.

Claim only ready work whose dependencies are complete. Record `claimed_by`
(the worktree or execution context) and `base_commit`, then move through
`claimed`, `implementing`, and `implemented` as those states become true.
One implementer per worktree; a matching existing claim is continuation.
`blocked: true` is independent of lifecycle state and keeps the ticket off
the ready frontier. Set `result_commit` to the committed implementation result
before the ticket becomes `implemented`. Set its implementation account’s
`resultCommit` to the same commit. Evidence committed later can pin that result
without a self-referential commit hash. Pin bytes that are not committed yet
with `greenline evidence <paths> --pending` once the result is final: doctor
resolves the witnessing commit when it reads the account, so the pin does not
have to be taken a second time and carried by a second accounting commit.
Commit that finalized account and the
updated ticket before requesting review; the accounting commit is a separate
review input and does not extend the implementation range.

Keep raw witnesses and their instruments, with each captured command and
outcome, under `.greenline/work/evidence/TKT-001/` for work with a ticket (a
reviewer uses its own REV id) and under `.greenline/ledger/evidence/<contribution>/`
for standalone upkeep with no ticket; there is no third evidence root. Scratch
work can use `.greenline/tmp/<skill>/`; it is never committed and never cited,
since a reference into it does not resolve and the ledger audit says so.
Promote evidence before a result relies on it: a prototype or a probe that a
decision relies on is copied into the owning evidence home first, and the
citation names that copy. Its source may be kept on a throwaway branch out of
main only when it was built in an isolated checkout, and a branch pointer on
a ticket is context, never evidence.

## Review and verification

Use a fresh independent review context and an explicit committed range.
Write `.greenline/work/reviews/REV-001.md` with this frontmatter:

```yaml
---
id: REV-001
type: review
status: draft
revision: 1
range: <base-commit>..<result-commit>
ticket: TKT-001
implementation_account: implementation-account-id
---
```

`implementation_account` identifies the implementer's account for the reviewed
ticket and result. The reviewer owns a separate review-role account whose
`work` identifies this REV artifact and whose `reviews` pins the implementation
account's bytes. Before completing the review, set the review account’s
`resultCommit` to the implementation commit at the end of `range`; the reviewer
does not need to create a new implementation commit. The finalized implementation
account may live in a later accounting commit outside that range. Read and pin
that commit's account bytes separately; reviewing the implementation diff does
not replace examining its account.

Replace placeholders with the actual commits and account. Record findings,
their evidence, and the verdict in the body; complete the review only when
that examination is finished. Its execution account pins the exact
implementation account examined. Matching commit hashes alone do not prove
ownership: another ticket may share the same commit.

The reviewer holds `reviewing`. Findings return the ticket to `implementing`;
a supported clean review advances it to `verifying`. Verification checks the
ticket's acceptance against its exact result; the implementer's checks stay in
the implementation account, while a separate verifier records its own contribution.
Complete within the owner's implementation grant when acceptance, required
checks, independent review, and verification are supported. Respect an explicit
stop boundary. A missing proof remains a limit, not a completed criterion.
Changed implementation invalidates affected review and verification.

## Larger intent arcs

An initiative directory uses `NNN-name`, for example
`.greenline/work/001-network/initiative.md`, with
`id: INIT-001`, `type: initiative`, `revision: 1`, an appropriate `status`,
and a `tickets` list of global ticket IDs. Joining, leaving, or moving between
initiatives edits membership; ticket identity and evidence locations stay put.
A ticket belongs to at most one initiative at a time.

Create the supporting artifacts that the work needs, at that initiative's
root: `decisions.md` (`INIT-001/DEC`), `spec.md` (`INIT-001/SPEC`), or `map.md`
(`INIT-001/MAP`). Research and prototype notes use
`research/RSRCH-001.md` and `prototypes/PROTO-001.md` with the corresponding
initiative-qualified IDs; a compact ticket's research note lives under that
ticket's evidence directory, and there is no third home. All have `type`,
`status` (`draft` or `complete`), `revision`, and any actual `consumes` pins.
Supporting artifacts are not required for a settled compact ticket. A
decision item in `map.md` becomes delivery work only through to-tickets,
which writes the ticket; map items are never promoted by hand.

The intent arc can pass through proposed, shaping, decided, specified, planned,
executing, reviewing, verifying, and complete. Record a state only when its
evidence exists. Planning methods own the needed decisions, spec, and ticket
graph; execution methods consume them. A scope correction is an explicit
revision whose affected downstream work must be rechecked.

## Installing and removing methods

diagram-design and architecture-map are optional: they install only when
authorized, by adding the name to the manifest's `skills.include` and running
`greenline sync`; an explicit `skills.exclude` stays binding until the owner
authorizes changing it. Removing availability leaves owned files as orphans
until they are explicitly removed: inspect sync's JSON effects and pass the
chosen exact paths to `--force-managed`, preserving edited files.

## Repository memory

A repository's existing home for a kind of memory is that home: a decisions
document, an ADR directory of its own, a glossary, a contributing guide. The
defaults below are created only where the repository has none, and a default
never stands beside an existing equivalent. The decisions book is the one
exception the CLI needs: root statements live in it, and when the repository
keeps its decisions elsewhere the book holds root statements and references
into that document, never a second copy of its choices.

| Home                                            | Job and creation rule                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decisions book: `.greenline/DECISIONS.md`       | Settled product and engineering choices, per-root statements, and references to their rationale. Create it when the first lasting choice is settled; missing means no recorded choices. A deferral is a line inside the decision it defers from, never an entry of its own. |
| House rulings: user-owned region of `AGENTS.md` | Optional `## House rulings` dash-list outside the managed markers; write only actual owner instructions. Format below.                                                                                                                                                      |
| `CONTEXT.md`                                    | Domain vocabulary. domain-modeling creates it when the first term is resolved.                                                                                                                                                                                              |
| `CONTEXT-MAP.md`                                | Optional index of multiple domain contexts and their own vocabulary homes; create only when needed.                                                                                                                                                                         |
| `docs/adr/`                                     | Consequential technical reasoning, alternatives and costs. record-architecture-decisions supplies the template on first use; link lasting choices from the decisions book.                                                                                                  |
| Initiative `decisions.md`                       | Choices shaping that initiative; promote those that outlive it into the decisions book with source references.                                                                                                                                                              |
| `.greenline/policy-changes.json`                | The latest manual saves made through `greenline inspect`; read the relevant ones when the file exists.                                                                                                                                                                      |
| `.greenline/diagrams/<work-id>/`                | Durable diagrams linked from the owning artifact, with the effective style guide beside them; present only when the optional diagram-design method is installed.                                                                                                            |
| `.greenline/map/`                               | The measured architecture map (map.md, snapshot.json, architecture.html); present only when the optional architecture-map method is installed.                                                                                                                              |

### House rulings

A new policy file can contain only its managed block. Content before or after
those markers is user-owned; no separate user-region marker is needed. To retain
an actual owner rule, create `## House rulings` after the closing marker and
write each ruling as a `- ` bullet. Indented continuations belong to that bullet;
the next Markdown heading ends the stanza. `greenline status` lists this stanza's
bullets only. Other prose instructions still govern the agent, but are not
reported as structured House rulings. An absent stanza means no listed rulings.
Sync preserves every byte outside the managed block.

### Root statements in the decisions book

The book holds settled choices and their rationale. Its optional structured
summary lets the CLI read exact governed roots without interpreting that prose.
Use at most one `greenline-roots` fenced block, containing a JSON array. Every
object requires exactly `root`, `purpose`, `languages`, `technologies`, `decision`
and `exclusions`; unknown keys are refused. `root` is `.` or a confined
repository-relative path; each root appears once. `purpose` is a string or null;
languages and technologies are string arrays. `decision` is the nonempty
reference to that choice's rationale. Unknown choices stay empty or null.
This example is a format, not a default technology decision:

````markdown
# Decisions

## API

The owner settled TypeScript for the existing API. Keep its current tools.

```greenline-roots
[
  {
    "root": "apps/api",
    "purpose": "service or API",
    "languages": ["typescript"],
    "technologies": [],
    "decision": "#api",
    "exclusions": []
  }
]
```
````

An exclusion is exactly `{ "kind": "unit", "id": "<unit-id>" }` or
`{ "kind": "option-group", "responsibility": "<responsibility>" }`.
Use identities and responsibility values from the requested publication's
metadata and vocabulary. The CLI checks them when retrieving; it expands unit
containment, never directory ancestry. The agent must select the actual governed
root rather than substituting a child path. Unknown or absent prohibited
identities refuse a full read. Empty exclusions forbid no units.

Before closing meaningful work, retain lasting choices in the decisions book and
link their rationale rather than copying it into multiple homes. Existing evidence
is not shared guidance policy. The execution ledger records delivery, use and proof;
it does not replace intent or decisions. None of these optional authored documents
is created merely to fill a template.
