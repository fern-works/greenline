import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { parseGuidanceRequest } from "../../src/core/guidance-receipts.ts";

describe("G3 receipt boundary", () => {
  it("G3 refuses body-bearing or discontinuous receipt collections", () => {
    const base = {
      schemaVersion: 5,
      source: "garden",
      publicationUse: "current",
      id: "11111111-1111-4111-8111-111111111111",
      owner: { kind: "change", change: "2026-09-09-change-one" },
      parent: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      binding: {
        state: "publication",
        origin: "https://example.com/",
        snapshot: { id: "snap", publishedAt: "2026-09-09T00:00:00.000Z" },
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

describe("S7 a collection's owner, schema 5", () => {
  const v5 = {
    schemaVersion: 5,
    source: "garden",
    publicationUse: "current",
    id: "11111111-1111-4111-8111-111111111111",
    parent: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    binding: { state: "unresolved", origin: "https://example.com/" },
    limits: { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 },
    receipts: [],
    advisories: [],
  };
  const parse = (owner: JsonValue) =>
    parseGuidanceRequest(JSON.stringify({ ...v5, owner }), "receipt");

  it("S7 the owner is a change or no one", () => {
    expect(parse({ kind: "change", change: "2026-10-04-fix-login" })._tag).toBe("ok");
    expect(parse({ kind: "none" })._tag).toBe("ok");
  });

  it("S20 an account owner and a collection of schema 4 are refused", () => {
    expect(
      parse({
        kind: "account",
        record: "work-one",
        context: "ctx",
        role: "implementation",
        work: null,
      })._tag,
    ).toBe("err");
    const v4 = {
      ...v5,
      schemaVersion: 4,
      owner: { record: "work-one", context: "ctx", role: "implementation" },
    };
    expect(parseGuidanceRequest(JSON.stringify(v4), "receipt")._tag).toBe("err");
  });

  it("S7 a collection cannot name two owners, nor an owner it does not define", () => {
    expect(parse({ kind: "change", change: "2026-10-04-fix-login", record: "work-one" })._tag).toBe(
      "err",
    );
    expect(parse({ kind: "none", record: "work-one" })._tag).toBe("err");
    expect(parse({ kind: "change", change: "fix-login" })._tag).toBe("err");
    expect(parse({ record: "work-one", context: "ctx", role: "implementation" })._tag).toBe("err");
    expect(parse({ kind: "account", record: "work-one", work: null })._tag).toBe("err");
  });
});
