# The cabinet contract

What the guidance cabinet stores, how it answers, and what it refuses. This
page is the interface between the corpus the maintainer publishes and the
harness agent that retrieves from it. The cabinet service
(`docs/cabinet-service.md`) builds against this page; the fixture cabinet
under test implements the same page in-process; the reshape tool's `list` and `show` are its reference
behaviour today. Authority above it: `docs/CHARTER.md` and the decisions register. If this page
and the code disagree, the code is wrong until this page is changed.

## What the cabinet does and does not do

The cabinet stores, filters, delivers, validates, and records. It returns
every unit whose metadata matches a query, in a stable order, with the
condition and summary the agent needs to choose. It ranks nothing, selects
nothing, judges nothing, and wakes nobody. Relevance, reading, application,
and the decision to ignore a unit are the harness agent's, and the
repository outranks every unit.

## The unit

One unit is one Markdown file: front matter the cabinet indexes, then the
body the agent reads. The file is the publication input; the store keeps
both halves and never rewrites either.

| Field           | Type                                                                                         | Indexed | Notes                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | string, `^[a-z0-9]+(-[a-z0-9]+)*$`, unique across the corpus                                 | yes     | Stable identity. Splits and merges are recorded in `lineage`, never by reusing an id                                               |
| `title`         | string                                                                                       | no      | For a human reading a list                                                                                                         |
| `kind`          | one of `rule`, `pattern`, `explanation`, `option`, `recipe`, `disagreement`, `reference`     | yes     | What the consumer may do with the unit                                                                                             |
| `when`          | string, one sentence                                                                         | no      | The condition the agent judges against the task. Returned by `list`                                                                |
| `summary`       | string, two sentences                                                                        | no      | Enough for a list result to choose. Returned by `list`                                                                             |
| `language`      | string[] from the vocabulary                                                                 | yes     | Empty means unrestricted                                                                                                           |
| `purpose`       | string[] from the vocabulary                                                                 | yes     | Empty means unrestricted                                                                                                           |
| `technology`    | string[] from the vocabulary                                                                 | yes     | Names the technologies the unit is about. Empty means it names none, not that it applies to all                                    |
| `task`          | string[] from the vocabulary                                                                 | yes     | Empty means unrestricted                                                                                                           |
| `concern`       | string[] from the vocabulary                                                                 | yes     | Empty means unrestricted                                                                                                           |
| `option_group`  | `{responsibility: string from the vocabulary, member: string}` or `null`                     | yes     | Non-null only on `option` units; an option may also use `null`                                                                     |
| `requires`      | string[] of unit ids                                                                         | yes     | Reading order. Grants no authority, bypasses no exclusion                                                                          |
| `contains`      | string[] of unit ids                                                                         | yes     | An exclusion of this unit also excludes these                                                                                      |
| `see_also`      | string[] of unit ids                                                                         | yes     | A discovery aid and nothing more                                                                                                   |
| `verification`  | `{verified: date, window_days: int, watch: [{condition: string, due: date}]}`                | yes     | `watch` may be omitted; `verified + window_days` is the unit's due date                                                            |
| `compatibility` | `[{technology, value, grammar, verified: date, condition, note?}]`                           | no      | Dated facts about versions and tools; `verified` is the date the fact holds from, day or month precision; returned whole by `show` |
| `sources`       | `[{kind: sheet, ruling, docs, early-access, treatment, or attribution; ref: string; note?}]` | no      | Every unit has at least one; `attribution` credits an author for doctrine without a sheet                                          |
| `lineage`       | `[{source, lines, disposition} or {old: string} or {renamed_from: string}]`                  | no      | Where the bytes came from and which old catalog units this replaces                                                                |

Every field is present on every unit; an unrestricted facet is an empty
array and `option_group` is `null` when absent. Front matter is written as
one `key: <JSON value>` line per field, which is valid YAML flow and is what
the reshape tool emits and parses.

The body is Markdown. It may carry anchors, `{#some-anchor}`, and anchor
references, `{>some-anchor}`. The store indexes every anchor to the unit
that contains it; an anchor is unique across the corpus. A reference is
resolved through that index, never by treating the anchor as a unit id.

Family is the directory the file lives in (`corpus/units/<family>/`). The
store may keep it as a column for the maintainer; it is not a query facet.
The `language` facet is what a consumer queries.

## The vocabulary

`corpus/units/VOCABULARY.json` is the authority for every facet value, every
`kind`, and every `responsibility`. It is published with the units as part
of the same snapshot. A value not in the vocabulary is an error at publish
time and an error at query time. Unclassified is not unrestricted: a unit
with an empty facet declared that deliberately.

## Snapshots

A publication produces an immutable snapshot with an identifier and a
timestamp. Every request from one guided task reads under one snapshot;
the response names it so the harness can put it in a receipt. Snapshots
are never edited; a correction is a new publication. The store keeps the
publication log: which snapshot, when, what changed by unit id. That log is
the cabinet's "record"; delivery receipts are the repository's and are
generated by the harness from what it retrieved.

## Queries

### `list`

Input: any subset of the five facets, each a list of values; optionally
`kind` as a list; optionally `responsibility` as a list. All optional at the
service, where an empty query returns the whole snapshot (the consumer CLI
reads it that way for its own exclusion catalog). An agent's list names at
least one facet: the consumer CLI refuses an empty query as `empty query`
before any request is made, because a whole-snapshot list is not a question
a working engineer can choose from.

Semantics, exactly as `scripts/reshape.mjs list` and the fixture behave:

- AND across facets, OR within one facet.
- `language`, `purpose`, `task`, and `concern` are applicability facets: a
  unit whose facet is empty applies everywhere and matches any value.
- `technology` is a naming facet: a unit matches a technology value only if
  it names that technology. An empty technology facet never matches a
  technology query. Without this, half the corpus names no technology and a
  technology query returned half the corpus (the fixture walk of
  2026-09-08 measured 465 of 942 units for `hono`; under the naming rule, 2).
- `kind` is an exact filter on the unit's kind.
- `responsibility` is an exact filter on `option_group.responsibility`; a
  unit without an option group never answers a responsibility query.
- Facets narrow: a query with more facets never returns more than one with
  fewer.
- Unknown facet names and unknown values are errors, not empty results, and
  a refusal of a value names the facet's vocabulary, so a caller who guessed
  can ask correctly on the next call without a separate vocabulary read. It
  names the first ten values in sorted order; a longer vocabulary adds how
  many remain and sends the caller to `greenline guidance vocabulary` for
  them, because a refusal buried in dozens of values is one nobody reads.

Output: one record per matching unit, in a deterministic order (by `id`),
carrying `id`, `kind`, `title`, `when`, `summary`, the five facets,
`option_group`, `requires`, `contains`, `see_also`, and `verification`, plus,
once for the response, the snapshot identifier and `count`, the number of
matching units in the snapshot. A response is complete only when its records
number exactly `count`; a client refuses a response whose records do not,
because a truncated or empty list is otherwise indistinguishable from a
complete one. No score, no rank, no truncation the caller did not ask for;
paging, if offered, is by `id` and still carries the total `count`.

### `show`

Input: one unit id. Output: the whole unit, front matter and body, under
the same snapshot. On HTTP, the unit envelope carries `family`, the exact
original UTF-8 file as `content`, its `contentHash` (SHA-256 of those bytes),
and its `revision` (SHA-256 of JSON `[family, content]`, the store's revision
identity). The client verifies both digests before parsing or exposing the
unit. Parsed client values retain those identities; tool output can deliver
the original content without a second copy of the body.
Unknown id is an error. The `requires` closure is the
agent's to fetch; the cabinet may offer a convenience that returns a unit
with its closure, but the closure is defined by `requires` alone and grants
nothing. Its caller freezes a maximum number of unique units, a total UTF-8
content-byte budget, and an abort signal with a deadline per command invocation,
shared by the entire requires closure. Exceeding a budget
is refused; cancellation bounds even a stalled read. Successful earlier
deliveries remain receipt facts if a later prerequisite fails.

### `resolve`

Input: one anchor name. Output: the id of the unit that contains it, or an
error. This is how a `{>anchor}` reference in a body is followed.

### `vocabulary`

Output: the vocabulary of the snapshot, so a harness can validate a query
before sending it and can name the facets to a human.

### HTTP binding

Responses carry `X-Greenline-Protocol: 1`. A client refuses a successful
response with an absent or unsupported version as `incompatible protocol`.
`GET /v1/snapshots/:id` returns that exact publication's identity and timestamp;
it never resolves `current` on a miss. `current` is reserved for current
discovery. A resumed request uses its recorded origin, protocol, publication
and vocabulary; only a new request resolves current again.

## Configuration and errors

A repository is configured with a guidance provider or explicitly
unconfigured. Unconfigured work uses the same agent and skills without the
cabinet and says so. Configured work that cannot reach the cabinet, or has
no key, or gets an error, is an error: the task stops and reports; nothing
falls back to a local library, a cache, or silence. There is no third
state.

The installed manifest determines that state for retrieval audits. An account
may not contradict it, and omitting the account's declaration never disables
the configured repository's retrieval obligation.

An optional server-side witness is enabled by `GREENLINE_CABINET_REQUEST_LOG`.
It appends one JSON line per dispatched authenticated list, show, resolve or vocabulary
operation: `schemaVersion: 1`, `time`, `operation`, `snapshot`, `query` (list
facets or null), `id` (unit/anchor or null), `returnedIds`, `status`, and `error`
(failure kind or null). Vocabulary returns no unit ids. It records server
results, not client receipt persistence or model capture. Publication lookups,
malformed routes and unauthenticated requests are not logged. No headers, keys or bodies enter
the witness. It is off by default. If configured, an unusable log prevents
startup; an append failure refuses the read with `unavailable` before success
is emitted. This witness is local to the cabinet process, not telemetry.

Errors are typed and carry the offending input. Query refusals: unknown
facet, unknown value, unknown kind, unknown responsibility, unknown id,
unknown anchor, and, at the consumer CLI only, empty query. Access failures, which a harness client returns as values
beside the query refusals: configuration (no provider, no key, a credential
in a URL), unauthorized, unavailable, no snapshot (a historical snapshot
that no longer exists never falls back to current), invalid response (a
malformed body, a mismatched snapshot header, a record count that does not
match `count`, a unit whose id or snapshot is not the one asked for),
cancelled (a timeout or an abort), and excluded (a required-reading closure
that would deliver a prohibited unit, refused before any of it is returned).
`incompatible protocol` names unsupported wire versions; `budget exceeded`
names a frozen unit or byte limit. Request-handle or receipt failures use
`configuration` for mismatched request/owner/provider metadata and
`unavailable` for failed persistence. None of these permits a successful
mutating retrieval to be emitted without its receipt.

## Consumer exclusions

The consumer supplies governed roots explicitly (`--root`, or the owning
account's scopes). Read-only full reads require `--root`; a missing root is a
configuration error, never an inferred `.`. The decision home's `greenline-roots` JSON block carries
unit and responsibility-group prohibitions. Local policy parsing checks shape;
retrieval checks group names against its snapshot vocabulary. For a read with
prohibitions, the client obtains complete catalog metadata, expands containment,
and refuses a prohibited unit before fetching its body. Metadata is discovery,
not prohibited full content. No path inheritance or semantic scope choice is
performed. Missing excluded identities, an excluded group with no members, or malformed
containment refuse the read. Every requested/required id must also be present in
that exclusion catalog before show, so an omitted group member cannot bypass it.
The peer supplies count and metadata; their agreement is consistency evidence,
not independent proof that a dishonest peer described group membership correctly.
Receipt entries carry the chosen `roots`, the decision document's `policyRevision`,
and expanded `excluded` identities. Consumer request collections use schema 3,
whose `advisories` keep the read-only consultations dispatched from a request
apart from that request's own `receipts`. Read-only output carries internal
metadata receipts in `supportingReceipts`.
An internal metadata lookup is also a
generated list receipt. Changed policy during an invocation refuses further
dependent delivery; the next invocation reads current policy at the same request
publication.

## Publication

The publish step takes the unit files and the vocabulary from the corpus
tree and refuses the snapshot unless every check passes:

- every front-matter key present with the right type; no unknown keys;
- every facet value, kind, and responsibility in the vocabulary;
- every `requires`, `contains`, and `see_also` id resolves in the same
  snapshot; no cycle in `requires` or `contains`;
- every id unique; every anchor unique; every `{>anchor}` reference
  resolves;
- `when` at least one sentence and unique in its family; `summary`,
  `title`, `verification`, and at least one source present; at least one
  restricted facet.

These are the reshape gate's unit-level checks; the publish step reruns
them because the store, not the tool, is the last thing that can refuse.

## What this page does not decide

Authentication and keys, the transport, paging sizes, and the store's
internal schema are the cabinet service page's to settle. The
maintainer's write path into the corpus is the ingest procedure's, and the
publication it ends in is the publish procedure's; this page only says what
a publication must satisfy.
