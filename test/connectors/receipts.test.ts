import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { parseGuidanceRequest, type GuidanceRequest } from "../../src/core/guidance-receipts.ts";
import { GuidanceRequests } from "../../src/shell/guidance-requests.ts";

/**
 * Request and receipt collections, schema 4: the binding union, the
 * comparison's own collection, the publication a full delivery names, and
 * the store's one move of a binding.
 */

const A = { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" };
const B = { id: "example-publication-b", publishedAt: "2026-01-02T00:00:00.000Z" };
const ORIGIN = "https://garden.example/";
const collection = {
  schemaVersion: 4,
  id: "11111111-1111-4111-8111-111111111111",
  source: "garden",
  owner: { record: "work-one", context: "ctx", role: "maintenance" },
  parent: null,
  createdAt: "2026-09-26T00:00:00.000Z",
  binding: { state: "unresolved", origin: ORIGIN },
  publicationUse: "current",
  limits: { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 },
  receipts: [],
  advisories: [],
};
/** One sealed receipt of an operation. */
function receipt(
  sequence: number,
  operation: string,
  outcome: "received" | "failed",
  units: readonly JsonValue[] = [],
) {
  return {
    id: `2222222${sequence}-2222-4222-8222-222222222222`,
    sequence,
    operation,
    query: operation === "list" ? {} : null,
    requested: [],
    closure: false,
    excluded: [],
    roots: ["."],
    policyRevision: "a".repeat(64),
    units: [...units],
    count: outcome === "received" ? (operation === "changes" ? 3 : units.length) : null,
    outcome,
    error: outcome === "failed" ? { kind: "unavailable", input: "service" } : null,
    startedAt: collection.createdAt,
    finishedAt: collection.createdAt,
  };
}
const full = {
  id: "example-rule",
  coverage: "full",
  revision: "b".repeat(64),
  contentHash: "c".repeat(64),
};
/** The first issue message a collection is refused with, or "accepted". */
function verdict(value: { readonly [key: string]: JsonValue }): string {
  const parsed = parseGuidanceRequest(JSON.stringify(value), "collection");
  return parsed._tag === "ok" ? "accepted" : (parsed.error.issues[0]?.message ?? "refused");
}

describe("schema 4 collections", () => {
  it("an unresolved request is valid before any call and after a failed first call", () => {
    expect(verdict(collection)).toBe("accepted");
    expect(verdict({ ...collection, receipts: [receipt(1, "snapshot", "failed")] })).toBe(
      "accepted",
    );
  });

  it("a successful call cannot leave its request unresolved", () => {
    expect(verdict({ ...collection, receipts: [receipt(1, "snapshot", "received")] })).toBe(
      "a successful call fixes the request's publication",
    );
  });

  it("a comparison's collection holds comparisons only, and a read request holds none", () => {
    const pair = { state: "comparison", origin: ORIGIN, from: A, to: B };
    const one = { state: "publication", origin: ORIGIN, snapshot: A };
    expect(
      verdict({ ...collection, binding: pair, receipts: [receipt(1, "changes", "received")] }),
    ).toBe("accepted");
    for (const value of [
      { ...collection, binding: pair, receipts: [receipt(1, "vocabulary", "received")] },
      { ...collection, binding: one, receipts: [receipt(1, "changes", "received")] },
    ])
      expect(verdict(value)).toBe("a comparison collection holds comparisons only");
  });

  it("a full delivery names its one publication", () => {
    expect(verdict({ ...collection, receipts: [receipt(1, "read", "failed", [full])] })).toBe(
      "a full delivery names its publication",
    );
  });

  it("a collection still carrying a vocabulary field or naming the cabinet is refused, with no converter (D-20)", () => {
    const vocabulary = {
      language: [],
      purpose: [],
      technology: [],
      task: [],
      concern: [],
      kind: [],
      responsibility: [],
    };
    for (const value of [vocabulary, null])
      expect(verdict({ ...collection, vocabulary: value })).toBe('Unrecognized key: "vocabulary"');
    const cabinet = parseGuidanceRequest(
      JSON.stringify({ ...collection, source: "cabinet" }),
      "collection",
    );
    expect(cabinet._tag === "err" ? cabinet.error.issues[0]?.path : "accepted").toBe("source");
  });

  it("a receipt keeps a call id with no invisible character", () => {
    const failed = receipt(1, "snapshot", "failed");
    expect(verdict({ ...collection, receipts: [{ ...failed, nativeCall: "toolu_01" }] })).toBe(
      "accepted",
    );
    for (const nativeCall of ["x\u202e", "x\u0085", "x\u200b"])
      expect(verdict({ ...collection, receipts: [{ ...failed, nativeCall }] })).toBe(
        "a call id with no control, format, private-use or unassigned character",
      );
  });

  it("the stored format refuses an invisible character in each text a receipt keeps", () => {
    const failed = receipt(1, "snapshot", "failed");
    const listed = receipt(1, "list", "failed");
    const hidden = "x\u202e";
    const cases: readonly (readonly [string, { readonly [key: string]: JsonValue }])[] = [
      ["requested", { ...collection, receipts: [{ ...failed, requested: [hidden] }] }],
      ["query", { ...collection, receipts: [{ ...listed, query: { task: [hidden] } }] }],
      ["roots", { ...collection, receipts: [{ ...failed, roots: [hidden] }] }],
      [
        "error.input",
        {
          ...collection,
          receipts: [{ ...failed, error: { kind: "unavailable", input: hidden } }],
        },
      ],
      ["owner.context", { ...collection, owner: { ...collection.owner, context: hidden } }],
      [
        "owner.work.id",
        { ...collection, owner: { ...collection.owner, work: { id: hidden, revision: 1 } } },
      ],
      [
        "error.kind",
        {
          ...collection,
          receipts: [{ ...failed, error: { kind: hidden, input: "service" } }],
        },
      ],
      [
        "binding.snapshot.id",
        {
          ...collection,
          binding: { state: "publication", origin: ORIGIN, snapshot: { ...A, id: hidden } },
        },
      ],
    ];
    for (const [field, value] of cases)
      expect([field, verdict(value)]).toEqual([
        field,
        "no control, format, private-use or unassigned character",
      ]);
    expect(verdict({ ...collection, receipts: [failed] })).toBe("accepted");
  });

  it("a schema-3 collection is refused, with no converter and no legacy reader", () => {
    const parsed = parseGuidanceRequest(
      JSON.stringify({ ...collection, schemaVersion: 3 }),
      "legacy",
    );
    expect(parsed._tag === "err" ? parsed.error.issues[0]?.path : "accepted").toBe("schemaVersion");
  });
});

describe("the store moves a binding once", () => {
  it("a first successful call binds the request, and no later seal rebinds it", () => {
    const root = mkdtempSync(join(tmpdir(), "gl-receipts-bind-"));
    try {
      const store = new GuidanceRequests(root);
      const parsed = parseGuidanceRequest(JSON.stringify(collection), "collection");
      if (parsed._tag === "err") throw parsed.error;
      const start = {
        operation: "snapshot" as const,
        query: null,
        requested: ["current"],
        closure: false,
        excluded: [],
        roots: ["."],
        policyRevision: "a".repeat(64),
        startedAt: collection.createdAt,
        nativeCall: null,
      };
      let request: GuidanceRequest = parsed.value;
      expect(store.create(request)._tag).toBe("ok");
      const first = "33333333-3333-4333-8333-333333333333";
      expect(store.begin(request, { ...start, id: first })._tag).toBe("ok");
      const bound = { state: "publication" as const, origin: ORIGIN, snapshot: A };
      const settled = store.settle(request, first, {
        units: [],
        count: 0,
        error: null,
        at: collection.createdAt,
        binding: bound,
      });
      if (settled._tag === "err") throw settled.error;
      request = settled.value.request;
      expect(request.binding).toEqual(bound);
      const second = "44444444-4444-4444-8444-444444444444";
      expect(store.begin(request, { ...start, id: second })._tag).toBe("ok");
      const rebound = store.settle(request, second, {
        units: [],
        count: 0,
        error: null,
        at: collection.createdAt,
        binding: { state: "publication", origin: ORIGIN, snapshot: B },
      });
      expect(rebound._tag === "err" ? rebound.error.input : "rebound").toBe(
        "request binding is already fixed",
      );
      const refusal = store.settle(request, second, {
        units: [],
        count: null,
        error: { kind: "unavailable", input: "service" },
        at: collection.createdAt,
        binding: bound,
      });
      expect(refusal._tag === "err" ? refusal.error.input : "bound").toBe(
        "a failed call binds no publication",
      );
      expect(store.read(request.id)).toMatchObject({ _tag: "ok", value: { binding: bound } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
