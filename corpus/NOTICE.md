# Preserved corpus sources

`corpus/manifest.json` names the exact repositories, commits, source paths and
terms for every preserved method. The source checkpoints and terms
are stated per source in the workshop's `docs/SOURCES.md`; the acquisition
records are in git. The consumer’s complete source notices and
terms are owned by the repository-root `THIRD_PARTY_NOTICES.md`; that file travels
with the package and installed methods. This page does not keep a second rights
inventory.

Snapshots under `corpus/upstream/<family>/<commit>/` are immutable. Source files
retain their bytes; every roster skill is one complete copy under
`corpus/skills/`, and a vendored copy's differences from its snapshot are
claimed in the ledger: its index `corpus/ledger/INDEX.md` and the provenance
page beside each copy travel with the public copy and the package, and the
entries themselves stay in the repository of record. A composed method is not represented
as unchanged when a recorded transformation changes it.

The snapshot’s directory layout follows installed skill names. Each selected
file’s original location remains the manifest’s `upstream.path`. At tjcages pin
687c395, three reference files are symlinks; the snapshot retains their targets
from `progress-check/shared/`. Comparing the symlink path alone cannot recover
those bytes.

A source's updates run through the workshop's roster procedure (its refresh
branch, for a preserved skill) or ingest procedure (for guidance), including
source comparison, licence and preservation checks, integration,
recording and verification. A source change does not silently publish a new
consumer build. `docs/SPEC.md` section 10 owns that workflow and its authority.

The consumer CLI projects methods into Codex and Claude Code. Those files are
generated output; they do not become the upstream source. greenline is independent
and does not imply endorsement by any source author.
