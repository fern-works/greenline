// The homes the product defines inside a workspace's `.greenline/`
// (corpus/runtime/work.md). One regex, imported by every checker that
// validates a `.greenline/` path; the two copies it replaced had agreed by
// luck (the map's mismatch 12, 2026-09-12).

/** Matches a `.greenline/...` path that names a home the product defines; test a token with `WORKSPACE_HOME.test(token)`. */
export const WORKSPACE_HOME =
  /^\.greenline\/(work\/|ledger\/|diagrams\/|map\/|tmp\/|manifest\.json$|lock\.json$|WORK\.md$|THIRD_PARTY_NOTICES\.md$|DECISIONS\.md$|policy-changes\.json$)/;
