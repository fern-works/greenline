# garden's operations through greenline

Every consultation runs through one command, `greenline connectors call
garden <operation>`, which starts the garden command the manifest names with
literal arguments, checks its reply and records a receipt before it prints
anything. The six operations:

| Operation    | What it answers                                                           | Its own flags                                              |
| ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `list`       | the units matching the filters: metadata only, never a body               | at least one of `--language`, `--purpose`, `--technology`, `--task`, `--concern`, `--kind`, `--responsibility`, each repeatable |
| `read`       | full units, each bound to its revision and content hash                   | `--id <unit>` (repeatable), `--requires`, `--exclude <unit>` (repeatable) |
| `resolve`    | the unit that carries an anchor                                           | `--anchor <name>`                                          |
| `vocabulary` | every value a facet, a kind or a responsibility may carry                 | none                                                       |
| `snapshot`   | the current publication, resolved once, or an exact one                   | `--id current` (the default) or `--id <publication>`       |
| `changes`    | what changed between two exact publications, in a request of its own      | `--from <publication>`, `--to <publication>`               |

## The flags every operation takes

- `--record <account>` opens a new request owned by that execution account;
  `--request <handle>` continues one. Exactly one of the two is given.
- `--snapshot <publication>` on the first call of a new request reads an
  exact, historical publication; without it the first call asks for the
  current one. `snapshot` takes `--id` instead.
- `--root <path>` names a governed root, repeatable; the default is the
  account's scopes. The roots decide which exclusions apply.
- `--max-units`, `--max-bytes` and `--timeout-ms` set the request's budget
  when it opens: each read delivers at most 16 units and 262144 content
  bytes, and each call ends within 30000 ms. A continuation cannot change
  them.
- `--context <id>` must match the account's context when given; `--call <id>`
  records the harness's own tool-call identity when it has one.

## The reply

A success is one JSON document on stdout with exit status 0. It names the
`request` handle to continue with, the `receipt` the call wrote, any
`supportingReceipts` (the listing that expanded an excluded responsibility
group),
the `consultations` a read produced, each a unit id and the consultation id
the account's annotations use, and the `result` garden returned, with the
unit bodies for a read. The result is shown once and is never stored.

A refusal or failure is one JSON document on stderr with exit status 1,
whose `error` names its `kind` and a short `input`. A usage refusal, a
misspelt flag or a malformed value, exits with status 2 before anything
runs.

## The failure kinds

| Kind                 | Where it comes from                                                                   |
| -------------------- | ------------------------------------------------------------------------------------- |
| `unavailable`        | garden could not reach its service, the service failed or limited the rate; or, with an input naming the output, greenline could not print a result its receipt records as delivered |
| `deadline`           | the call passed its deadline and was ended                                            |
| `cancelled`          | the call was cancelled before garden answered                                         |
| `unauthorized`       | garden had no key, or its service refused the key or the key's entitlement            |
| `private-data`       | the key would have left garden in an argument, the endpoint or an answer, so nothing carrying it was sent or written |
| `not-found`          | the publication, unit or anchor named does not exist there                            |
| `invalid-result`     | the service's answer was malformed, partial, cut off or did not verify                |
| `budget`             | the read asked for more than the request's budget allows                              |
| `excluded`           | the read would deliver a unit the repository excludes                                 |
| `invalid-request`    | garden or greenline refused the call's arguments                                      |
| `missing-executable` | the garden command the manifest names is not installed or cannot run                  |
| `process`            | the command ended without a reply, or could not start                                 |
| `output-cap`         | the command printed more than 2 MiB                                                   |
| `protocol`           | the reply was not one valid garden result for the call made                           |
| `configuration`      | garden is disabled, the account differs, or the policy or endpoint changed            |
| `evidence`           | the receipt could not be written or confirmed, so the call is not recorded            |

The receipts are generated under `.greenline/ledger/receipts/`, one
collection per request. Never edit one by hand; `.greenline/ledger/README.md`
says what they hold and what the account adds.
