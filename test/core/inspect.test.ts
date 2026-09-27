import { describe, expect, it } from "vitest";
import { parseGuidanceRequest } from "../../src/core/guidance-receipts.ts";
import { languageOfPath, lineDiff, receiptView, withStanza } from "../../src/core/inspect.ts";
import { RECEIPTS_FIXTURE } from "../fixtures/receipts.ts";

describe("languageOfPath", () => {
  it("names the roster language a file's extension speaks, or all for anything else", () => {
    expect(languageOfPath("src/sighting.ts")).toBe("typescript");
    expect(languageOfPath("web/app.tsx")).toBe("typescript");
    expect(languageOfPath("cmd/api/main.go")).toBe("go");
    expect(languageOfPath("src/lib.rs")).toBe("rust");
    expect(languageOfPath("src/Main.java")).toBe("java");
    expect(languageOfPath("etl/load.py")).toBe("python");
    expect(languageOfPath("README.md")).toBe("all");
  });
});

describe("lineDiff", () => {
  it("pairs unchanged lines and marks removed and added ones, in order", () => {
    const diff = lineDiff("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(diff).toEqual([
      { kind: "same", line: "a" },
      { kind: "del", line: "b" },
      { kind: "add", line: "B" },
      { kind: "same", line: "c" },
      { kind: "add", line: "d" },
    ]);
  });
});

describe("withStanza", () => {
  const block =
    "<!-- greenline:managed begin policy -->\n> Owned region.\n<!-- greenline:managed end policy -->\n";

  it("replaces the House rulings stanza in the user region and leaves the managed block byte for byte", () => {
    const before = `# demo\n\n## House rulings\n\n- Old one.\n\n## Working here\n\nAsk first.\n\n${block}`;
    const after = withStanza(before, "- New one.\n- And another.");
    expect(after).toBe(
      `# demo\n\n## House rulings\n\n- New one.\n- And another.\n\n## Working here\n\nAsk first.\n\n${block}`,
    );
  });

  it("creates the stanza above the managed block when the file has none", () => {
    const before = `# demo\n\n${block}`;
    expect(withStanza(before, "- First.")).toBe(
      `# demo\n\n## House rulings\n\n- First.\n\n${block}`,
    );
  });
});

describe("receiptView", () => {
  it("shows a schema-4 request's source, binding, owner and every call in order, with no body", () => {
    const parsed = parseGuidanceRequest(RECEIPTS_FIXTURE, "collection");
    if (parsed._tag === "err") throw parsed.error;
    const failed = {
      ...parsed.value,
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-09-27T00:00:00.000Z",
      binding: { state: "unresolved" as const, origin: "https://garden.example/" },
      owner: { record: null, context: null, role: null },
      receipts: [
        {
          ...parsed.value.receipts[0]!,
          sequence: 1,
          operation: "snapshot" as const,
          units: [],
          count: null,
          outcome: "failed" as const,
          error: { kind: "missing-executable", input: "garden was not found" },
        },
      ],
    };
    expect(receiptView([failed, parsed.value])).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        source: "garden",
        binding:
          "publication example-publication-a (published 2026-01-01T00:00:00.000Z), at https://garden.example/",
        owner: "work-one, ctx, maintenance",
        createdAt: "2026-09-26T00:00:00.000Z",
        calls: [
          expect.objectContaining({ sequence: 1, operation: "snapshot", full: [], metadata: [] }),
          expect.objectContaining({
            sequence: 2,
            operation: "resolve",
            metadata: ["example-listed"],
          }),
          expect.objectContaining({
            sequence: 3,
            operation: "read",
            outcome: "received",
            full: [{ id: "example-rule", revision: "b".repeat(64) }],
            error: null,
          }),
        ],
        advisories: 0,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        source: "garden",
        binding: "unresolved, at https://garden.example/",
        owner: "no record named",
        createdAt: "2026-09-27T00:00:00.000Z",
        calls: [
          expect.objectContaining({ outcome: "failed", error: "missing-executable", full: [] }),
        ],
        advisories: 0,
      },
    ]);
    // The failure's input and any content hash stay in the file; the view carries neither.
    expect(JSON.stringify(receiptView([failed, parsed.value]))).not.toMatch(
      /garden was not found|c{64}/,
    );
  });
});
