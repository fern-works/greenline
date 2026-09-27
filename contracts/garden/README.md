---
describes:
  - path: contracts/garden/cli-result-v1.schema.json
    sha256: 4150b824e9434cdf5252b4f0094243f5e8295894829bc13ea3e0117d77339423
  - path: contracts/garden/fixtures/refusal-budget.json
    sha256: 535a947c6e5f38a3b9a4c3409f800b8083427464ecbb4c0ba77ae68b09e13efe
  - path: contracts/garden/fixtures/refusal-cancelled.json
    sha256: bd5d9274b5ec276dc4060129769d0fac4bf95133c579a3d9476409092f51e6bb
  - path: contracts/garden/fixtures/refusal-deadline.json
    sha256: 94a4066592ec8230daba99f6e53b08b3a4b38e67c59aa746bc648b72aa154d1f
  - path: contracts/garden/fixtures/refusal-excluded.json
    sha256: 614fbec340d21c9f4eb18e847e2f7a68d976692e74dcdbd74acd949c64662738
  - path: contracts/garden/fixtures/refusal-invalid-request.json
    sha256: be23872c43674358300ef0e76dd671ed9afe7541005a40bc923a5a6c55dfdbac
  - path: contracts/garden/fixtures/refusal-invalid-result.json
    sha256: 0e58dea93feb11c92cdb8725f6c3d6ed7f55ef9d24e1ed86ecaf6c39cbec27ef
  - path: contracts/garden/fixtures/refusal-not-found.json
    sha256: de8a7d542c476f0f2e244e80b25fb592dec1681456a71808d32e6bd401ad00df
  - path: contracts/garden/fixtures/refusal-private-data.json
    sha256: e9e4f1e7f4a400d79ff337feaf55d06428f4767a2ac2a1d3892b4c9f812365dc
  - path: contracts/garden/fixtures/refusal-unauthorized.json
    sha256: 6b04e0cba07ac773b13b44171940697b4f3ed9b781fbed934cfb7bb4e1312975
  - path: contracts/garden/fixtures/refusal-unavailable.json
    sha256: 01c5750af600951f4df7cfe63835488ea5ebeb9f470b611f1be6510455d7e104
  - path: contracts/garden/fixtures/success-capabilities.json
    sha256: f9c6121855a0ebaf488eac02347f017dd51de788249c3ae6ea293fb189c5902d
  - path: contracts/garden/fixtures/success-changes.json
    sha256: e3cba2cdf1a8348065314f08cd56e161ded4032833ce4cecc2ab15e2487fa05d
  - path: contracts/garden/fixtures/success-list.json
    sha256: 616747f668aff82b45ecd83c3b7d0c71d11923e75091d4d0ed9e5de4fcd71ff9
  - path: contracts/garden/fixtures/success-read.json
    sha256: 756e2e1362ba19af9cfe271ce0037af066b67294709652f00fc1845bca4772b5
  - path: contracts/garden/fixtures/success-resolve.json
    sha256: 621f058ae4d7239a6e8612bd4f453b1221164b01ab6648f1cd74326b15aedb30
  - path: contracts/garden/fixtures/success-snapshot.json
    sha256: d398b7f56c412322c574d3aede23b46353af92364e264edaac7c058ee0a618f8
  - path: contracts/garden/fixtures/success-vocabulary.json
    sha256: 9dfa91e4f5d4a76b5fa4ab3b0d0a808164f1ac158ca4c60660e77ccd47280a90
---

# garden's result contract, as greenline copies it

This directory holds a copy of the interface garden publishes for its
command's results, `garden.result/v1`: the JSON Schema of the one document
the `garden` command prints on stdout, and the synthetic fixtures garden
proves that schema on. greenline's garden connector reads garden's results
against this copy. The copy describes an interface; no garden
implementation came with it, and greenline writes its own reader.

## Where it came from

The files were copied byte for byte from garden at commit 05fc448, from
garden's `contracts/cli-result-v1.schema.json` and `contracts/fixtures/`.
Each is pinned in this page's front matter by the SHA-256 digest garden's
own contracts page records for it, and the copy is valid only at those
digests. The schema's digest,
4150b824e9434cdf5252b4f0094243f5e8295894829bc13ea3e0117d77339423, is the
identity of `garden.result/v1`.

## The files

| Path                                         | What it is                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `contracts/garden/cli-result-v1.schema.json` | the JSON Schema (draft 2020-12) of one `garden.result/v1` document                |
| `contracts/garden/fixtures/success-*.json`   | one success of each of the six read operations and of `capabilities`, seven files |
| `contracts/garden/fixtures/refusal-*.json`   | one refusal of each of garden's ten error kinds, ten files                        |

The fixtures name only synthetic publications, units and an example
origin; they carry no key, no guidance and no private server record.

## Changing the copy

`garden.result/v1` is frozen. A change to what a document may hold is a new
format version in a new schema file with its own fixtures, which greenline
copies whole from a named garden commit, pinning the new digests here in the
same change. Nothing edits these files in place: the formatter skips them
(`.oxfmtrc.json`), and a changed byte fails its pin.

## What proves it

`test/connectors/contract.test.ts` holds every file to its pin, the pinned
list to the files in this directory, the schema to the identity above, and
accepts every fixture through the copied schema, which it also shows refusing
altered documents. The `doc-pins` gate row reads the same front matter.
