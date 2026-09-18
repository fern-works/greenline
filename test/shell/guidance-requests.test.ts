import { mkdtempSync, mkdirSync, existsSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GuidanceRequests } from "../../src/shell/guidance-requests.ts";
import { parseGuidanceRequest } from "../../src/core/guidance-receipts.ts";

function request() {
  const parsed = parseGuidanceRequest(
    JSON.stringify({
      schemaVersion: 3,
      id: "11111111-1111-4111-8111-111111111111",
      owner: { record: "work-one", context: "ctx", role: "implementation" },
      parent: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      publicationUse: "current",
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
    }),
    "request",
  );
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}
describe("G3 request persistence", () => {
  it("G3 preserves both calls when writers started from the same request version", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-writes-"));
    try {
      const store = new GuidanceRequests(root);
      const bound = request();
      expect(store.create(bound)._tag).toBe("ok");
      for (const id of [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ]) {
        const started = store.begin(bound, {
          id,
          operation: "list",
          query: {},
          requested: [],
          closure: false,
          excluded: [],
          roots: ["."],
          policyRevision: "a".repeat(64),
          startedAt: bound.createdAt,
        });
        expect(started._tag).toBe("ok");
        expect(store.finish(bound, id, null, bound.createdAt, 0)._tag).toBe("ok");
      }
      const current = store.read(bound.id);
      if (current._tag === "err") throw current.error;
      expect(current.value.receipts.map((r) => [r.sequence, r.outcome])).toEqual([
        [1, "received"],
        [2, "received"],
      ]);
      const path = join(root, ".greenline/ledger/receipts", bound.id + ".json");
      expect(readFileSync(path, "utf8")).not.toContain('"content":');
      expect(store.create(bound)._tag).toBe("err");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("files a read-only consultation beside the dispatching request's own calls, and nowhere when the dispatcher is itself read-only", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-advisory-"));
    try {
      const store = new GuidanceRequests(root);
      const bound = request();
      expect(store.create(bound)._tag).toBe("ok");
      const own = "22222222-2222-4222-8222-222222222222";
      expect(
        store.begin(bound, {
          id: own,
          operation: "list",
          query: {},
          requested: [],
          closure: false,
          excluded: [],
          roots: ["."],
          policyRevision: "a".repeat(64),
          startedAt: bound.createdAt,
        })._tag,
      ).toBe("ok");
      expect(store.finish(bound, own, null, bound.createdAt, 0)._tag).toBe("ok");
      const stub = {
        id: "33333333-3333-4333-8333-333333333333",
        request: "44444444-4444-4444-8444-444444444444",
        role: "review" as const,
        operation: "read" as const,
        units: [
          {
            id: "arch-values-crossing-inward",
            coverage: "full" as const,
            revision: "b".repeat(64),
            contentHash: "c".repeat(64),
          },
        ],
        count: 1,
        outcome: "received" as const,
        at: bound.createdAt,
      };
      const filed = store.advise(bound.id, stub);
      if (filed._tag === "err") throw filed.error;
      expect(filed.value).toEqual({ ...stub, sequence: 1 });
      const current = store.read(bound.id);
      if (current._tag === "err") throw current.error;
      expect(current.value.receipts.map((entry) => [entry.sequence, entry.id])).toEqual([[1, own]]);
      expect(current.value.advisories).toEqual([{ ...stub, sequence: 1 }]);
      const orphan = store.advise("55555555-5555-4555-8555-555555555555", stub);
      if (orphan._tag === "err") throw orphan.error;
      expect(orphan.value).toBe(null);
      expect(
        existsSync(
          join(root, ".greenline/ledger/receipts/55555555-5555-4555-8555-555555555555.json"),
        ),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("G3 refuses a receipt directory symlink", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-boundary-"));
    const outside = mkdtempSync(join(tmpdir(), "receipt-outside-"));
    try {
      mkdirSync(join(root, ".greenline/ledger"), { recursive: true });
      symlinkSync(outside, join(root, ".greenline/ledger/receipts"));
      expect(new GuidanceRequests(root).create(request())._tag).toBe("err");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
