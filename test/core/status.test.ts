import { describe, expect, it } from "vitest";
import { buildStatusView, renderStatusText } from "../../src/core/status.ts";
import { parseArtifact } from "../../src/core/artifact.ts";
import type { AuditedArtifact } from "../../src/core/artifact-audit.ts";
import { initiativeMd, reviewMd, specMd, ticketMd } from "../fixtures/artifacts.ts";

/**
 * The status view (`docs/SPEC.md` §7): a factual projection of parsed
 * artifacts. Expected views are literals derived from the spec's
 * frontier definition (dependencies complete), the blocked flag, and
 * pending reviews (not complete).
 */

function parse(path: string, text: string): AuditedArtifact {
  const parsed = parseArtifact(path, text);
  if (parsed._tag !== "ok") {
    throw new Error(`fixture ${path} did not parse: ${JSON.stringify(parsed.error.issues)}`);
  }
  return { path, artifact: parsed.value };
}

function mixedTree(): readonly AuditedArtifact[] {
  return [
    parse(
      "001-user-auth/initiative.md",
      initiativeMd("001", "user-auth", "executing", 1, [
        "TKT-001",
        "TKT-002",
        "TKT-003",
        "TKT-004",
      ]),
    ),
    parse("001-user-auth/spec.md", specMd("001")),
    parse(
      "tickets/TKT-001.md",
      ticketMd("001", {
        status: "complete",
        resultCommit: "abc1234",
        acceptance: [{ text: "tests green", done: true }],
      }),
    ),
    parse("tickets/TKT-002.md", ticketMd("002", { dependsOn: ["TKT-001"] })),
    parse("tickets/TKT-003.md", ticketMd("003", { dependsOn: ["TKT-002"] })),
    parse("tickets/TKT-004.md", ticketMd("004", { status: "implementing", blocked: true })),
    parse("reviews/REV-001.md", reviewMd("001", "001")),
    parse("reviews/REV-002.md", reviewMd("001", "002", "complete")),
  ];
}

describe("buildStatusView", () => {
  it("projects status, tickets, frontier, blocked, and pending reviews per initiative", () => {
    expect(buildStatusView(mixedTree())).toEqual({
      initiatives: [
        {
          id: "INIT-001",
          directory: "001-user-auth",
          status: "executing",
          tickets: [
            { id: "TKT-001", status: "complete", blocked: false },
            { id: "TKT-002", status: "ready", blocked: false },
            { id: "TKT-003", status: "ready", blocked: false },
            { id: "TKT-004", status: "implementing", blocked: true },
          ],
          ticketsComplete: 1,
          ticketsTotal: 4,
          frontier: ["TKT-002"],
          blocked: ["TKT-004"],
          pendingReviews: ["REV-001"],
        },
      ],
      tickets: [
        { id: "TKT-001", status: "complete", blocked: false },
        { id: "TKT-002", status: "ready", blocked: false },
        { id: "TKT-003", status: "ready", blocked: false },
        { id: "TKT-004", status: "implementing", blocked: true },
      ],
      frontier: ["TKT-002"],
      blocked: ["TKT-004"],
      pendingReviews: ["REV-001"],
    });
  });

  it("counts zero tickets plainly when an initiative has none yet", () => {
    const tree = [parse("001-shaping/initiative.md", initiativeMd("001", "shaping", "shaping"))];
    const view = buildStatusView(tree);
    expect(view.initiatives[0]?.ticketsComplete).toBe(0);
    expect(view.initiatives[0]?.ticketsTotal).toBe(0);
  });

  it("orders initiatives by ID and keeps a standalone ticket visible without inventing a group", () => {
    const tree = [
      parse("002-later/initiative.md", initiativeMd("002", "later", "proposed")),
      parse("001-earlier/initiative.md", initiativeMd("001", "earlier", "shaping")),
      parse("tickets/TKT-001.md", ticketMd("001", { status: "ready" })),
    ];
    const view = buildStatusView(tree);
    expect(view.initiatives.map((initiative) => initiative.id)).toEqual(["INIT-001", "INIT-002"]);
    expect(view.tickets).toEqual([{ id: "TKT-001", status: "ready", blocked: false }]);
  });
});

describe("renderStatusText", () => {
  it("renders the factual view deterministically", () => {
    const text = renderStatusText(buildStatusView(mixedTree()));
    expect(text).toBe(
      [
        "INIT-001 001-user-auth executing tickets 1/4",
        "ticket TKT-001 complete",
        "ticket TKT-002 ready",
        "ticket TKT-003 ready",
        "ticket TKT-004 implementing blocked",
        "frontier: TKT-002",
        "reviews pending: REV-001",
        "",
      ].join("\n"),
    );
  });

  it("states the empty case plainly", () => {
    expect(renderStatusText(buildStatusView([]))).toBe("no recorded work\n");
  });
});
