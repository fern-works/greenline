# Execution ledger

One contribution has one account. Generated receipts describe guidance delivery;
the agent supplies concise meaning and result evidence. The account explains the
work, grants no authority, and never becomes the next request's standing guidance.

## Work and close

Create `.greenline/ledger/records/<id>.json` before a code change. Use an unused
kebab-case id, a required contributor context label, actor, role, owning work id
and revision, and affected scopes. Copy the manifest's guidance configuration.
Use the native context id when available; otherwise use an explicit local label
(such as `local:repair-builder`) without claiming it is a captured harness id.
The manifest remains the authority: an omitted declaration cannot disable the
retrieval audit, and a contradictory declaration fails the contract.

For configured work, use `greenline guidance list --record <id>` with task facets
and explicit `--root` values. Read selected units with `--request <handle>` and
`--requires`. A new owner request gets a new handle; a contributor uses its
own account and `--from-request`. The agent chooses roots; the default is the
account's explicit scopes. DECISIONS.md carries their root statements.

The CLI writes one receipt collection per request in
`.greenline/ledger/receipts/`. Every validated full delivery appears in the
compiled account, including earlier deliveries in a failed batch. Metadata
queries remain metadata; an internal exclusion lookup is a generated list
receipt. `roots`, `policyRevision` and expanded `excluded` identities record
which local restrictions were used. Do not hand-edit receipts or transcribe
the delivery inventory. Receipt persistence must succeed before successful
mutating retrieval output. An absent collection is missing evidence, not proof
of zero retrieval.

A reviewer you dispatch reads with `--read-only --from-request <handle>` and
keeps its own receipt in the tool result. That call still reaches the cabinet,
so the collection you dispatched from gains a stub in `advisories`: the read-only
request, the operation, the units with their revisions, the outcome, and the role
the reviewer declared with `--role`. It sits beside your calls, never among them.
The reviewer's reading stays the reviewer's: your account compiles no
consultation from it, and a stub answers none of your own retrieval.

Add sparse `guidanceAnnotations` to the generated consultation ids returned by
read: a useful selection, meaningful rejection, deferral or authorized exception.
Use `applications` when claiming an effect, with actual code/check evidence.
An unannotated delivery is unassessed. Every delivered unit stays visible even
when no annotation is needed. Do not fabricate success or an essay per unit.

Your checks belong to this same contribution in `checks`; changing from
implementation to verification does not require a second account. A separate
reviewer or verifier has its own attribution. Rework invalidates affected proof.
Before handoff, reconcile the actual result, changed inputs, evidence and limits.
Preserve unsuccessful checks and incomplete work honestly. Run doctor when a
structural diagnostic is useful; no acknowledgement write or periodic ceremony
is required.

## Authored record

Every account must include `"schemaVersion": 3` and a nonempty `context`.
This starting unconfigured implementation account validates while work is ready
or implementing; replace its identities and scope with the actual work:

```json
{
  "schemaVersion": 3,
  "id": "repair",
  "context": "local:repair-builder",
  "actor": "agent",
  "role": "implementation",
  "scopes": ["."],
  "work": { "id": "TKT-001", "revision": 1 },
  "guidance": { "state": "unconfigured" }
}
```

The current fields are:

- `schemaVersion`: the literal number 3.

- `id`, `context`, `actor`, `role`, `scopes`; `work: {id, revision}` when work exists.
- `baseCommit` identifies the actual starting commit. Before a ticket becomes
  `implemented`, its implementation account requires `resultCommit` equal to
  the ticket’s `result_commit`. A completed review account also requires
  `resultCommit`: the implementation commit at the end of the review’s `range`,
  not a new commit made by the reviewer. Keep that value on later lifecycle states.
- `guidance`: the configured provider or explicit unconfigured state.
- `selections`: concise method or repository-source declarations when useful.
  Each names `id`, `kind` (skill, guidance or document), repository `source`,
  actual `stage` (before-work, during-work or after-work), `decision` and `reason`.
  An exception also names `authority`. A late consultation never becomes early.
- `guidanceAnnotations`: `consultation`, `decision`, `reason`, optional exception
  `authority`; these add meaning without choosing the generated inventory.
- `applications`: `consultation`, `outcome` (applied, not-applied or unverified),
  `reason`, and `evidence`. An applied outcome requires result evidence and a
  selection or authorized exception.
- `checks`: evidence references to the instruments and results this contribution
  relies on. A captured result includes its exact command and outcome; a script
  used to produce it is pinned too.
- `reviews`: in a review-role account, references to the **implementation account
  examined**, never source code, a REV artifact, or the reviewer's own account.
  Each target must match the review artifact's `implementation_account`, ticket,
  and implementation result. Other contribution roles may reference review
  evidence they relied on; that does not supply an independent review by itself.
- `reviewLimit` describes a concrete unavailable prior account; it does not
  substitute for required independent review.

Arrays default to empty. `consultations` is a compiled view, never an authored
field. Source declarations are not a claim of complete capture. A repository
source is `{ "kind": "repository", "path": "relative/path", "revision": "<sha256>" }`,
optionally with a historical `commit`. Optional `lines: {start, end}` describes a
partial read. Optional `observation` names a captured `trace` evidence reference,
`format` (claude-stream-json or codex-jsonl), and native tool `call` id. Reference
only a capture that exists; a hash alone cannot prove reading.

An evidence reference is `{ "path": "relative/path", "revision": "<sha256>" }`
with optional `commit`. Use `greenline evidence <paths...>` (optionally
`--commit <exact-hash>`) to construct references from actual bytes without
manual hash transcription. Pin bytes that are not committed yet with
`--pending`: the reference records the path and the hash, and doctor resolves
the witnessing commit when it reads the account, accepting the bytes at HEAD or
its first parent as well as at the account's own range. Use it once the result
is final and before you commit it, so a pin does not have to be taken twice and
carried by a second accounting commit. A pin that already names a commit is
never pending. Paths are relative to the Git root. Capture a command's output when
running it; a later summary cannot replace that observation. Keep relied-on
instruments beside their results under `.greenline/work/evidence/<work-id>/`
using the account's actual work id (TKT for implementation, REV for review)
or `.greenline/ledger/evidence/<contribution>/` for standalone upkeep. Scratch
files are promoted before a claim relies on them. Paths cannot escape the repo.

Roles are implementation, planning, review, verification and maintenance.
Maintenance without
work covers upkeep of greenline's installed files only; code work has a ticket and implementation
account. A compact ticket is its own intent and acceptance contract.

Commit the coherent implementation result, then finalize its evidence account:
an account cannot contain the hash of the commit containing its final self-reference.
Commit the finalized account separately before requesting review. That later
accounting commit is a review input, not the end of the implementation range.
Keep completed accounts historical; correct them through a new contribution.
Independent review names the exact ticket, implementation account and result.
The reviewer has its own review artifact and account, and pins the actual account
bytes examined. Its `work.id` names the REV artifact, while `resultCommit` names
the implementation result being reviewed. A different process id alone does not
prove independence.

### A review account

For a review of TKT-001 whose implementation account is `repair`, first read
that finalized account at its accounting commit and obtain its exact reference:

```bash
greenline evidence .greenline/ledger/records/repair.json --commit <account-commit>
```

Use that returned reference in `reviews` below. Replace the result placeholder
with the ticket's implementation commit and the reference placeholders with
those actual returned values. The review artifact's `implementation_account`
is `repair`, its `ticket` is TKT-001, and its `range` ends at that implementation
commit even when the account was committed later:

```json
{
  "schemaVersion": 3,
  "id": "repair-review",
  "context": "local:repair-reviewer",
  "actor": "agent",
  "role": "review",
  "scopes": ["."],
  "work": { "id": "REV-001", "revision": 1 },
  "guidance": { "state": "unconfigured" },
  "resultCommit": "<implementation-commit>",
  "reviews": [
    {
      "path": ".greenline/ledger/records/repair.json",
      "revision": "<sha256-from-evidence>",
      "commit": "<account-commit>"
    }
  ]
}
```

The reviewer's commands, instruments and results belong in `checks`, under
`.greenline/work/evidence/REV-001/`; they do not replace the implementation
account reference in `reviews`. Complete the REV artifact only after the actual
independent examination. Its separate account uses the same implementation
`resultCommit`. Doctor checks these identities; it cannot certify the verdict.

## Evidence limits

Doctor distinguishes declarations, observed service delivery, supplied native
capture and application evidence. A receipt records a verified service result;
it does not establish that stdout reached the model, was understood, or was
applied correctly. Missing and truncated capture remain limited. A parent's
reading is not a child's reading, and a compaction summary is not full delivery.
Repository-controlled copies are not authenticated or tamper-resistant.

Explicitly unconfigured work needs no receipt or invented consultation.
Read-only advice uses `--read-only` and explicit `--root` values for full reads,
writes no collection of its own, and reports material consultation in its reply.
The returned opaque handle carries metadata only. Advice dispatched from a
durable request leaves its stub in that collection; advice with no such request
leaves the repository unchanged. A stub records that the call happened, not that
the reviewer read or applied what came back. Delivery and accounting award no
compliance score.
