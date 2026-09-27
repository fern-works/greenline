# The garden connector

greenline works on its own. [A greenline install needs no account, no key and no service, and it works offline.]{claim: A greenline install needs no account, key or service and works offline}
Init, sync, status, doctor and the inspector contact nothing, and a question
about your repository consults nothing. The skills, the managed block and the
records are the whole product, and every part of it is free and open source.

## greenline and garden

A greenline install now needs no account, no key and no service; it works
entirely offline and keeps every method, artifact and receipt it had. The
built-in guidance was the premium part; it moves to garden, which the owner
can enable when they want it. A fresh install has no maintained knowledge
until its owner enables garden.

garden is a separate product with its own command. It answers questions of
engineering knowledge: architecture, testing, language rules, patterns,
coherent tooling sets and dated options, with their reasoning and exceptions.
greenline does not install, bundle or download garden. It reaches garden only
through this connector, and only after the repository's owner enables it.

## Enabling it

```bash
greenline connectors enable garden --url https://garden.example/
greenline connectors status garden
```

Enabling writes one entry to .greenline/manifest.json: the endpoint garden is
called with and the executable that runs, `garden` on your PATH unless
`--executable` names an absolute path. The URL is HTTPS, or HTTP on a loopback
address for a local test. In the same change greenline installs the use-garden
skill and adds one line to the managed block that points the agent at it.
Enabling contacts nothing and needs no key. garden reads its key from
`GARDEN_API_KEY` in your environment; greenline never stores or reads it.
The endpoint and the key come from garden, not from greenline.

`greenline status` and `greenline doctor` show whether the connector is
enabled and, when it is, whether the garden command would run here and
whether its key variable is set. They check without starting garden, and a
missing executable or key is a warning, [GL0125](./doctor.md).

## What a consultation is

With the connector enabled, the use-garden skill tells the agent when a
consultation is relevant: an open engineering choice your repository has not
settled. It is never a duty before an edit. The agent consults through
`greenline connectors call garden`, which starts the garden command with
literal arguments and no shell and checks its reply. garden receives facet
queries and unit identifiers, never your code or repository policy.

A consultation is one request. [Its first call fixes the publication it
reads, and every later call in the request reads that same publication.]{claim: A garden consultation reads one publication for its whole request}
What garden returns informs an open choice. It settles nothing your
repository already decided, and your decisions outrank it.

## What a receipt records

Each request keeps one collection under .greenline/ledger/receipts/, and each
call is written there before any result is shown: the source, garden; the
publication the request read; each call's operation; the units it received,
with their revisions and content hashes; its outcome; and, for a failed call,
its kind. [A receipt records what a request received, never what was applied.]{claim: A receipt records what a request received, never what was applied}
It keeps no unit's text: the text reaches the agent for that request and is
not saved. [The inspector](./inspect.md) shows the receipts.

A failed call is recorded with garden's own refusal or with what greenline
observed: `missing-executable`, `cancelled`, `deadline`, `output-cap`,
`process` or `protocol`. The agent reports the failure and carries on from
the installed skills and the repository's evidence.

## Disabling it

```bash
greenline connectors disable garden
```

Disabling removes the entry, the use-garden skill and its line in the block,
in one change. Receipts and your own text stay.
