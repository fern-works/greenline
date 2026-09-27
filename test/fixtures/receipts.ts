/** One sealed call of the fixture's request, received. */
function received(sequence: number, operation: string, units: readonly object[]) {
  return {
    id: `2222222${sequence}-2222-4222-8222-222222222222`,
    sequence,
    operation,
    query: null,
    requested: [],
    closure: false,
    excluded: [],
    roots: ["."],
    policyRevision: "a".repeat(64),
    units,
    count: units.length,
    outcome: "received",
    error: null,
    startedAt: "2026-09-26T00:00:00.000Z",
    finishedAt: "2026-09-26T00:00:01.000Z",
  };
}

/** The fixture request's id, which names its collection file. */
export const RECEIPTS_FIXTURE_ID = "11111111-1111-4111-8111-111111111111";

/**
 * A schema-4 collection bound to one publication, as its file holds it: a
 * snapshot, a resolve that names a unit by its metadata and a full read.
 */
export const RECEIPTS_FIXTURE: string = JSON.stringify(
  {
    schemaVersion: 4,
    id: RECEIPTS_FIXTURE_ID,
    source: "garden",
    owner: { record: "work-one", context: "ctx", role: "maintenance" },
    parent: null,
    createdAt: "2026-09-26T00:00:00.000Z",
    binding: {
      state: "publication",
      origin: "https://garden.example/",
      snapshot: { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" },
    },
    publicationUse: "current",
    limits: { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 },
    receipts: [
      received(1, "snapshot", []),
      received(2, "resolve", [
        { id: "example-listed", coverage: "metadata", revision: null, contentHash: null },
      ]),
      received(3, "read", [
        {
          id: "example-rule",
          coverage: "full",
          revision: "b".repeat(64),
          contentHash: "c".repeat(64),
        },
      ]),
    ],
    advisories: [],
  },
  null,
  2,
);
