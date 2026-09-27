# The package

`pnpm build` creates the executable `dist/bin/greenline.mjs` and
`dist/corpus/installation.json`, the payload: the composed methods, the
runtime prose, the intents, the source notices and the preserved-source
identities. No guidance publication, service code or database driver
ships. The strict installation parser verifies the payload's content digest
and refuses extra fields.

The same build prepares `dist/package` with a consumer-only manifest and
the allowed package files: `dist/bin`, `dist/corpus`, `README.md`,
`LICENSE`, `THIRD_PARTY_NOTICES.md`, `provenance/`, the ledger's index
and one provenance page per copied skill, shipped and never installed, and
`assets/inspect-fonts/OFL.txt`, the licence of the Geist fonts the
inspector embeds in the executable.
`npm pack ./dist/package` creates the distributable; packing the checkout
itself refuses with that command. The consumer manifest carries the name,
the version, the executable, two runtime dependencies (`commander` and
`zod`), `license: MIT`, and the `repository`, `homepage` and `bugs` fields
that name this repository, which npm's provenance requires.

The package audit (`scripts/check-consumer-package.mjs`, the
`consumer-package` gate row) checks the tarball's paths against an exact
allowlist, requires package-owned references to resolve (the manifest's
bin and files entries, relative imports, links and literal package paths in
the root documents), binds the notices to every source family, revision and
copyright line, and checks the four manifest fields above. It then
installs the tarball into a clean directory and runs it there offline with
garden disabled: every network connection is refused, a stand-in `garden`
on the PATH is never started, and init, sync, doctor, status and the
connectors listing succeed with no connector entry and no receipt. Then,
where a POSIX launcher can run it, it enables garden against the synthetic
garden executable the connector tests own (`test/connectors/fake-garden.mjs`):
doctor and status report it ready, one read is recorded in a receipt that
keeps no body, and disabling keeps the receipt. Where that half cannot run,
the last line names it as not run and the gate's row reports a skip. In this
tree it proves the package's shape and that offline run; the proofs that no
guidance unit id a publication of the ledger names and no private name is
packed run in the repository of record, which holds the ledger's records.

A release: a version tag, which only the export makes, runs `release.yml`:
the install, the public gate, the build, the tarball audit and
`npm publish ./dist/package` under trusted publishing with provenance.
