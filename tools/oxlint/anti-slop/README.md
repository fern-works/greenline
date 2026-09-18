# anti-slop — vendored oxlint rule pack
source: dmmulroy/anti-slop@446268e5d15baa968eaec669ff65358d36ae6259 (2026-08-14) · MIT
15 rules + shared/ + index.ts, VERBATIM CODE (vendored via Foundry-kernel's
pack of the same pin). The one permitted option
(`no-runtime-typeof` allowInTypeGuards) is OFF by default.
House-specific rules, if ever needed, live in a sibling pack —
never in this directory. Rule tests run in the repository's vitest
suite; resync is an ordinary reviewed edit against the pinned sha.
Attribution: THIRD_PARTY_NOTICES.md.
