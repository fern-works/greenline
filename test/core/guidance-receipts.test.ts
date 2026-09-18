import { describe, expect, it } from "vitest";
import { parseGuidanceRequest } from "../../src/core/guidance-receipts.ts";

describe("G3 receipt boundary", () => {
  it("G3 refuses body-bearing or discontinuous receipt collections", () => {
    const base = {
      schemaVersion: 3,
      publicationUse: "current",
      id: "11111111-1111-4111-8111-111111111111",
      owner: { record: "change-one", context: "ctx", role: "implementation" },
      parent: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      binding: {
        origin: "https://example.com/",
        protocol: 1,
        snapshot: { id: "snap", publishedAt: "2026-09-09T00:00:00.000Z" },
        vocabulary: {
          language: [],
          purpose: [],
          technology: [],
          task: [],
          concern: [],
          kind: [],
          responsibility: [],
        },
      },
      limits: { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 },
      receipts: [],
      advisories: [],
    };
    expect(parseGuidanceRequest(JSON.stringify(base), "receipt")._tag).toBe("ok");
    expect(
      parseGuidanceRequest(JSON.stringify({ ...base, content: "a guidance body" }), "receipt")._tag,
    ).toBe("err");
    const receipt = {
      id: "22222222-2222-4222-8222-222222222222",
      sequence: 2,
      operation: "list",
      query: {},
      requested: [],
      closure: false,
      excluded: [],
      roots: ["."],
      policyRevision: "a".repeat(64),
      units: [],
      count: 0,
      outcome: "received",
      error: null,
      startedAt: base.createdAt,
      finishedAt: base.createdAt,
    };
    expect(
      parseGuidanceRequest(JSON.stringify({ ...base, receipts: [receipt] }), "receipt")._tag,
    ).toBe("err");
  });
});
