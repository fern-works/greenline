# greenline, the public repository

You are reading the generated public copy of greenline's open half: the
command-line tool under `src/`, the roster of skills under `corpus/skills/`
with their upstream snapshots under `corpus/upstream/`, the runtime block
under `corpus/runtime/`, the guide under `guide/`, and the tests and the
build that prove them. Nothing is authored here; every commit is an export
from a private repository of record, and a pull request is imported there
rather than merged here (`CONTRIBUTING.md`).

The commands: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`,
`node scripts/check.mjs --public` (the gate rows that read this tree). Every
commit is signed off (`git commit -s`).

What is not here: the engineering guidance, which is a paid service the
tool's client reaches through a workspace's configuration; the service's
code; the private records behind the provenance pages; the maintainer's
workshop. The contract the client follows is `docs/cabinet-contract.md`;
the package's shape and its audit are `docs/PACKAGE.md`.
