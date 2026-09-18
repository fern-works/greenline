import { expect, it } from "vitest";
import { parseArtifact } from "../../src/core/artifact.ts";
import { auditArtifacts } from "../../src/core/artifact-audit.ts";
import { buildStatusView } from "../../src/core/status.ts";

const text = `---
id: TKT-001
type: ticket
status: ready
revision: 1
intent: "Preserve a caller's deadline while retrying."
scope:
  - src/http
acceptance:
  - [ ] Retries share the caller deadline.
---
The repair is bounded to HTTP deadline propagation.
`;

it("P4 keeps a compact ticket independent of initiative membership and visible in status", () => {
  const parsed = parseArtifact("tickets/TKT-001.md", text);
  if (parsed._tag === "err") throw parsed.error;
  const tree = [{ path: "tickets/TKT-001.md", artifact: parsed.value }];
  expect(auditArtifacts(tree)).toEqual([]);
  const status = buildStatusView(tree);
  expect(status.tickets.map((ticket) => ticket.id)).toEqual(["TKT-001"]);
  expect(status.initiatives).toEqual([]);
  const initiative = parseArtifact(
    "001-network/initiative.md",
    `---\nid: INIT-001\ntype: initiative\nstatus: planned\nrevision: 1\ntickets:\n  - TKT-001\n---\nNetwork reliability.\n`,
  );
  if (initiative._tag === "err") throw initiative.error;
  const joined = [...tree, { path: "001-network/initiative.md", artifact: initiative.value }];
  expect(auditArtifacts(joined)).toEqual([]);
  expect(buildStatusView(joined).initiatives[0]?.tickets.map((ticket) => ticket.id)).toEqual([
    "TKT-001",
  ]);
  expect(parseArtifact("001-network/tickets/TKT-001.md", text)._tag).toBe("err");
});

it("P4 refuses blank ticket intent and scopes that escape the repository", () => {
  for (const content of [
    text.replace("Preserve a caller's deadline while retrying.", "   "),
    ...["/outside", "../outside", "src/../outside", "src\\outside", "src/"].map((scope) =>
      text.replace("  - src/http", `  - "${scope.replaceAll("\\", "\\\\")}"`),
    ),
  ])
    expect(parseArtifact("tickets/TKT-001.md", content)._tag).toBe("err");
});

it("P4 requires a completed review of the exact result before a ticket is complete", () => {
  const ticket = parseArtifact(
    "tickets/TKT-001.md",
    text
      .replace("status: ready", "status: complete")
      .replace("revision: 1", "revision: 1\nresult_commit: def5678")
      .replace("[ ]", "[x]"),
  );
  if (ticket._tag === "err") throw ticket.error;
  const row = { path: "tickets/TKT-001.md", artifact: ticket.value };
  expect(auditArtifacts([row]).some((finding) => finding.kind === "evidence-missing")).toBe(true);
  for (const [status, result, valid] of [
    ["draft", "def5678", false],
    ["complete", "ccc1234", false],
    ["complete", "def5678", true],
  ] as const) {
    const review = parseArtifact(
      "reviews/REV-001.md",
      `---\nid: REV-001\ntype: review\nstatus: ${status}\nrevision: 1\nrange: abc1234..${result}\nticket: TKT-001\nimplementation_account: build-one\n---\n`,
    );
    if (review._tag === "err") throw review.error;
    expect(
      auditArtifacts([row, { path: "reviews/REV-001.md", artifact: review.value }]).length === 0,
    ).toBe(valid);
  }
});

it("P4 refuses an actionable ticket whose acceptance is unspecified", () => {
  const ticket = parseArtifact(
    "tickets/TKT-001.md",
    text.replace("acceptance:\n  - [ ] Retries share the caller deadline.\n", ""),
  );
  if (ticket._tag === "err") throw ticket.error;
  expect(
    auditArtifacts([{ path: "tickets/TKT-001.md", artifact: ticket.value }]).some((finding) =>
      finding.message.includes("acceptance"),
    ),
  ).toBe(true);
});
