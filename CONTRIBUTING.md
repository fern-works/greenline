# Contributing

This repository is a generated public copy of greenline; the work
happens in a private repository of record, and every commit here is an
export from it. A contribution is therefore imported there, not merged
here, as the section below states.

## Build and prove

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check --public
```

`pnpm check --public` runs the gate rows that read this tree: the typecheck,
the lint, the formatter, the tests, the dependency rules, the build, the
package audit and the source sweeps. The same command runs in CI on every
pull request.

## Sign off every commit

Every commit carries a Developer Certificate of Origin sign-off:

```bash
git commit -s
```

The trailer `Signed-off-by: Your Name <you@example.com>` certifies that you
have the right to submit the change under the MIT licence. A pull request
whose commits lack it is not imported.

## How a pull request lands

A pull request here is reviewed here and is never merged here. The
maintainer imports its patch into the repository of record with your
authorship and your sign-off kept, it passes the private gate and the
ledger there, and it reaches this repository with the next release's
export, whose commit credits you with a `Co-authored-by` trailer and names
your pull request. The pull request is then closed with that export commit
named. Between releases this repository does not move.

## What is not here

garden's engineering knowledge, a separate product, is not in this tree; garden's code is in its own repository, and the private records
behind the provenance pages and the maintainer's workshop are in the
repository of record. A pull request that would need them cannot be
imported; open an issue instead.

## Where to look

- The guide: https://fernworks.dev/greenline/docs/
- The garden result contract the connector reads: `contracts/garden/README.md`
- The package's shape and its audit: `docs/PACKAGE.md`
- A security concern: `SECURITY.md`
