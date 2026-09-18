import { describe, expect, it } from "vitest";
import { auditArtifacts } from "../../src/core/artifact-audit.ts";
import { parseArtifact, type Artifact } from "../../src/core/artifact.ts";

/**
 * Cross-artifact checks (`docs/SPEC.md` §7 "Doctor checks"): findings
 * are literals derived from the spec's checklist rows, each test
 * injecting exactly one defect into an otherwise-clean work tree.
 */

interface Built {
  readonly path: string;
  readonly artifact: Artifact;
}

function build(path: string, frontmatter: string): Built {
  const parsed = parseArtifact(path, `---\n${frontmatter}---\n\nbody\n`);
  if (parsed._tag !== "ok") {
    throw new Error(`fixture ${path} did not parse: ${JSON.stringify(parsed.error.issues)}`);
  }
  return { path, artifact: parsed.value };
}

const INITIATIVE = (id: string, status: string, tickets: readonly string[] = []): string =>
  `id: ${id}\ntype: initiative\nstatus: ${status}\nrevision: 1\ntickets: [${tickets.join(", ")}]\n`;

const TICKET = (id: string, status: string, extra: string): string =>
  `id: ${id}\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: ${status}\nrevision: 1\n${extra}${extra.includes("acceptance:") ? "" : "acceptance:\n  - [x] Fixture behavior is demonstrated.\n"}`;

function ticketPath(id: string): string {
  const number = id.replace("TKT-", "");
  return `tickets/TKT-${number}.md`;
}

function reviewed(): Built {
  return build(
    "reviews/REV-001.md",
    "id: REV-001\ntype: review\nstatus: complete\nrevision: 1\nrange: def5678..abc1234\nticket: TKT-001\nimplementation_account: build-one\n",
  );
}

function cleanTree(): readonly Built[] {
  return [
    reviewed(),
    build("001-user-auth/initiative.md", INITIATIVE("INIT-001", "executing")),
    build(
      "001-user-auth/spec.md",
      "id: INIT-001/SPEC\ntype: spec\nstatus: complete\nrevision: 2\n",
    ),
    build(
      ticketPath("TKT-001"),
      TICKET("TKT-001", "complete", "result_commit: abc1234\nacceptance:\n  - [x] done\n"),
    ),
    build(
      ticketPath("TKT-002"),
      TICKET("TKT-002", "ready", `consumes:\n  - { id: INIT-001/SPEC, revision: 2 }\n`),
    ),
  ];
}

describe("auditArtifacts", () => {
  it("reports nothing for a clean tree", () => {
    expect(auditArtifacts(cleanTree())).toEqual([]);
  });

  it("flags duplicate ids across files", () => {
    // Two initiative directories with the same number claim one INIT id.
    const tree = [
      build("002-one/initiative.md", INITIATIVE("INIT-002", "executing")),
      build("002-two/initiative.md", INITIATIVE("INIT-002", "executing")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "id-duplicate",
        path: "002-two/initiative.md",
        message:
          "id 'INIT-002' is claimed by both '002-one/initiative.md' and '002-two/initiative.md'",
      },
    ]);
  });

  it("flags consumes references that resolve to no artifact", () => {
    const tree = [
      ...cleanTree(),
      build(
        ticketPath("TKT-003"),
        TICKET(
          "TKT-003",
          "ready",
          "consumes:\n  - { id: INIT-001/SPEC, revision: 2 }\n  - { id: INIT-009/SPEC, revision: 1 }\n",
        ),
      ),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "reference-unresolved",
        path: ticketPath("TKT-003"),
        message: "'TKT-003' consumes 'INIT-009/SPEC', which no artifact declares",
      },
    ]);
  });

  it("flags stale and impossible consumptions against the current revision", () => {
    const tree = [
      ...cleanTree(),
      build(
        ticketPath("TKT-003"),
        TICKET("TKT-003", "ready", "consumes:\n  - { id: INIT-001/SPEC, revision: 1 }\n"),
      ),
      build(
        ticketPath("TKT-004"),
        TICKET("TKT-004", "ready", "consumes:\n  - { id: INIT-001/SPEC, revision: 5 }\n"),
      ),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "consumption-ahead",
        path: ticketPath("TKT-004"),
        message: "'TKT-004' consumes revision 5 of 'INIT-001/SPEC', which is at revision 2",
      },
      {
        kind: "consumption-stale",
        path: ticketPath("TKT-003"),
        message: "'TKT-003' consumes revision 1 of 'INIT-001/SPEC', which is at revision 2",
      },
    ]);
  });

  it("flags one worktree double-claiming two tickets", () => {
    const tree = [
      ...cleanTree(),
      build(ticketPath("TKT-003"), TICKET("TKT-003", "claimed", "claimed_by: worktrees/gl-x\n")),
      build(ticketPath("TKT-004"), TICKET("TKT-004", "claimed", "claimed_by: worktrees/gl-x\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "claim-conflict",
        path: ticketPath("TKT-004"),
        message: "'worktrees/gl-x' claims both 'TKT-003' and 'TKT-004'",
      },
    ]);
  });

  it("keeps a handed-off ticket's claim outside the exclusivity window (ADR 0014)", () => {
    // implemented = handed to review; the held claim is the recorded builder
    // and the bounce return address, not an active build.
    const tree = [
      build(
        "tickets/TKT-001.md",
        TICKET(
          "TKT-001",
          "implemented",
          "claimed_by: worktrees/gl-x\nresult_commit: abc1234\nacceptance:\n  - [x] done\n",
        ),
      ),
      build("tickets/TKT-002.md", TICKET("TKT-002", "claimed", "claimed_by: worktrees/gl-x\n")),
    ];
    expect(auditArtifacts(tree)).toEqual([]);
  });

  it("still flags two active builds in one worktree, review bounce included", () => {
    // TKT-001 bounced back to implementing with its claim held while the
    // worktree already claims TKT-002: WIP-1 stands, one must be parked.
    const tree = [
      build(
        "tickets/TKT-001.md",
        TICKET("TKT-001", "implementing", "claimed_by: worktrees/gl-x\n"),
      ),
      build("tickets/TKT-002.md", TICKET("TKT-002", "claimed", "claimed_by: worktrees/gl-x\n")),
    ];
    expect(auditArtifacts(tree)).toEqual([
      {
        kind: "claim-conflict",
        path: "tickets/TKT-002.md",
        message: "'worktrees/gl-x' claims both 'TKT-001' and 'TKT-002'",
      },
    ]);
  });

  it("treats a complete ticket's claim as history, freeing the worktree name", () => {
    const tree = [
      reviewed(),
      build(
        "tickets/TKT-001.md",
        TICKET(
          "TKT-001",
          "complete",
          "claimed_by: worktrees/gl-x\nresult_commit: abc1234\nacceptance:\n  - [x] done\n",
        ),
      ),
      build("tickets/TKT-002.md", TICKET("TKT-002", "claimed", "claimed_by: worktrees/gl-x\n")),
    ];
    expect(auditArtifacts(tree)).toEqual([]);
  });

  it("flags a dependency cycle by naming its members", () => {
    const tree = [
      ...cleanTree(),
      build(ticketPath("TKT-003"), TICKET("TKT-003", "ready", "depends_on:\n  - TKT-004\n")),
      build(ticketPath("TKT-004"), TICKET("TKT-004", "ready", "depends_on:\n  - TKT-003\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "dependency-cycle",
        path: ticketPath("TKT-003"),
        message: "dependency cycle: TKT-003 -> TKT-004 -> TKT-003",
      },
      {
        kind: "dependency-cycle",
        path: ticketPath("TKT-004"),
        message: "dependency cycle: TKT-004 -> TKT-003 -> TKT-004",
      },
    ]);
  });

  it("flags missing evidence for the spec's evidence table rows", () => {
    const tree = [
      // decided without a completed decisions.md
      build("003-no-decisions/initiative.md", INITIATIVE("INIT-003", "decided")),
      // specified without a completed spec.md
      build("004-no-spec/initiative.md", INITIATIVE("INIT-004", "specified")),
      // claimed without claimed_by
      build("tickets/TKT-001.md", TICKET("TKT-001", "claimed", "")),
      // implemented without result_commit
      build("tickets/TKT-002.md", TICKET("TKT-002", "implemented", "")),
      build("005-no-claim/initiative.md", INITIATIVE("INIT-005", "executing")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "003-no-decisions/initiative.md",
        message: "initiative 'INIT-003' is decided but has no completed decisions.md",
      },
      {
        kind: "evidence-missing",
        path: "004-no-spec/initiative.md",
        message: "initiative 'INIT-004' is specified but has no completed spec.md",
      },
      {
        kind: "evidence-missing",
        path: "tickets/TKT-001.md",
        message: "ticket 'TKT-001' is claimed but records no claimed_by",
      },
      {
        kind: "evidence-missing",
        path: "tickets/TKT-002.md",
        message: "ticket 'TKT-002' is implemented but records no result_commit",
      },
    ]);
  });

  it("flags a ticket complete with unfinished acceptance or no result commit", () => {
    const tree = [
      reviewed(),
      build("006-loose-ends/initiative.md", INITIATIVE("INIT-006", "executing")),
      build(
        "tickets/TKT-001.md",
        TICKET(
          "TKT-001",
          "complete",
          "result_commit: abc1234\nacceptance:\n  - [x] first\n  - [ ] second\n",
        ),
      ),
      build("tickets/TKT-002.md", TICKET("TKT-002", "complete", "acceptance:\n  - [x] only\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "complete-unproven",
        path: "tickets/TKT-001.md",
        message: "ticket 'TKT-001' is complete but has unchecked acceptance items",
      },
      {
        kind: "complete-unproven",
        path: "tickets/TKT-002.md",
        message: "ticket 'TKT-002' is complete but records no result_commit",
      },
      {
        kind: "evidence-missing",
        path: "tickets/TKT-002.md",
        message:
          "ticket 'TKT-002' is complete but has no completed review of this exact ticket and result_commit",
      },
    ]);
  });

  it("flags an initiative planned without a dependency-clean ticket graph", () => {
    const tree = [
      build(
        "007-unplanned/initiative.md",
        INITIATIVE("INIT-007", "planned", ["TKT-001", "TKT-002"]),
      ),
      build("tickets/TKT-001.md", TICKET("TKT-001", "ready", "depends_on:\n  - TKT-002\n")),
      build("tickets/TKT-002.md", TICKET("TKT-002", "ready", "depends_on:\n  - TKT-001\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "dependency-cycle",
        path: "tickets/TKT-001.md",
        message: "dependency cycle: TKT-001 -> TKT-002 -> TKT-001",
      },
      {
        kind: "dependency-cycle",
        path: "tickets/TKT-002.md",
        message: "dependency cycle: TKT-002 -> TKT-001 -> TKT-002",
      },
      {
        kind: "evidence-missing",
        path: "007-unplanned/initiative.md",
        message:
          "initiative 'INIT-007' is planned but its ticket graph is not clean (see dependency-cycle findings)",
      },
    ]);
  });

  it("flags an initiative complete while a ticket is unfinished", () => {
    const tree = [
      build("008-open/initiative.md", INITIATIVE("INIT-008", "complete", ["TKT-001"])),
      build("tickets/TKT-001.md", TICKET("TKT-001", "implementing", "")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "008-open/initiative.md",
        message: "initiative 'INIT-008' is complete but ticket 'TKT-001' is still implementing",
      },
    ]);
  });

  it("flags a depends_on reference that resolves to no ticket", () => {
    const tree = [
      build("009-ghost-dep/initiative.md", INITIATIVE("INIT-009", "executing")),
      build("tickets/TKT-001.md", TICKET("TKT-001", "ready", "depends_on:\n  - TKT-777\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "reference-unresolved",
        path: "tickets/TKT-001.md",
        message: "'TKT-001' depends on 'TKT-777', which no artifact declares",
      },
    ]);
  });

  it("flags a ticket in reviewing with no review artifact in the initiative", () => {
    const tree = [
      build("010-unreviewed/initiative.md", INITIATIVE("INIT-010", "executing")),
      build("tickets/TKT-001.md", TICKET("TKT-001", "reviewing", "")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "tickets/TKT-001.md",
        message:
          "ticket 'TKT-001' is reviewing but has no review of this exact ticket and result_commit",
      },
    ]);
  });

  it("flags a ticket in verifying with no review artifact in the initiative", () => {
    // 041 build-7 advanced tickets to verifying past review and only its
    // own self-correction caught it; doctor was blind above `reviewing`.
    const tree = [
      build("014-unreviewed/initiative.md", INITIATIVE("INIT-014", "executing")),
      build("tickets/TKT-001.md", TICKET("TKT-001", "verifying", "")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "tickets/TKT-001.md",
        message:
          "ticket 'TKT-001' is verifying but has no completed review of this exact ticket and result_commit",
      },
    ]);
  });

  it("flags a review whose ticket link names a ticket no artifact declares", () => {
    const tree = [
      build("015-ghost-link/initiative.md", INITIATIVE("INIT-015", "executing")),
      build("tickets/TKT-001.md", TICKET("TKT-001", "implementing", "claimed_by: main\n")),
      build(
        "reviews/REV-001.md",
        "id: REV-001\ntype: review\nimplementation_account: fixture-tkt-001-implementation\nstatus: complete\nrevision: 1\nrange: abc1234..def5678\nticket: TKT-777\n",
      ),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "reference-unresolved",
        path: "reviews/REV-001.md",
        message: "'REV-001' reviews 'TKT-777', which no artifact declares",
      },
    ]);
  });

  it("flags an initiative planned with no tickets at all", () => {
    const tree = [build("011-empty/initiative.md", INITIATIVE("INIT-011", "planned"))];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "011-empty/initiative.md",
        message: "initiative 'INIT-011' is planned but has no tickets",
      },
    ]);
  });

  it("flags an initiative reviewing with no review artifact", () => {
    const tree = [
      build("012-unreviewed/initiative.md", INITIATIVE("INIT-012", "reviewing")),
      build("tickets/TKT-001.md", TICKET("TKT-001", "implemented", "result_commit: abc1234\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "012-unreviewed/initiative.md",
        message: "initiative 'INIT-012' is reviewing but has no review artifact",
      },
    ]);
  });

  it("does not count an unresolved consumes against the planned ticket graph", () => {
    const tree = [
      build("013-forward-ref/initiative.md", INITIATIVE("INIT-013", "planned", ["TKT-001"])),
      build(
        "tickets/TKT-001.md",
        TICKET("TKT-001", "ready", "consumes:\n  - { id: INIT-013/SPEC, revision: 1 }\n"),
      ),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "reference-unresolved",
        path: "tickets/TKT-001.md",
        message: "'TKT-001' consumes 'INIT-013/SPEC', which no artifact declares",
      },
    ]);
  });

  it("still counts an unresolved depends_on against the planned ticket graph", () => {
    const tree = [
      build("014-bad-graph/initiative.md", INITIATIVE("INIT-014", "planned", ["TKT-001"])),
      build("tickets/TKT-001.md", TICKET("TKT-001", "ready", "depends_on:\n  - TKT-777\n")),
    ];
    const findings = auditArtifacts(tree);
    expect(findings).toEqual([
      {
        kind: "evidence-missing",
        path: "014-bad-graph/initiative.md",
        message:
          "initiative 'INIT-014' is planned but its ticket graph is not clean (see reference-unresolved findings)",
      },
      {
        kind: "reference-unresolved",
        path: "tickets/TKT-001.md",
        message: "'TKT-001' depends on 'TKT-777', which no artifact declares",
      },
    ]);
  });
});
