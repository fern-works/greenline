import { describe, expect, it } from "vitest";
import { artifactStatuses, parseArtifact, type ArtifactType } from "../../src/core/artifact.ts";

/**
 * Artifact contracts (`docs/SPEC.md` §7). Expected models and texts are
 * literals derived from the spec's frontmatter grammar and lifecycle
 * tables, never from running the parser.
 */

const INITIATIVE_MD = `---
id: INIT-001
type: initiative
status: executing
revision: 3
consumes:
  - { id: INIT-001/SPEC, revision: 2 }
---

# User authentication

Shape, specify, and deliver password sign-in.
`;

describe("parseArtifact", () => {
  it("names the reviewed implementation account explicitly and refuses the retired ambiguous field", () => {
    const body =
      "---\nid: REV-001\ntype: review\nstatus: draft\nrevision: 1\nrange: abc1234..def5678\nticket: TKT-002\nimplementation_account: repair-account\n---\n";
    const result = parseArtifact("reviews/REV-001.md", body);
    expect(result).toEqual({
      _tag: "ok",
      value: {
        id: "REV-001",
        type: "review",
        status: "draft",
        revision: 1,
        range: "abc1234..def5678",
        ticket: "TKT-002",
        implementationAccount: "repair-account",
        consumes: [],
      },
    });
    const retired = parseArtifact(
      "reviews/REV-001.md",
      body.replace("implementation_account:", "execution:"),
    );
    expect(retired._tag).toBe("err");
    if (retired._tag === "err")
      expect(retired.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "execution" }),
          expect.objectContaining({ path: "implementation_account" }),
        ]),
      );
  });

  // Exam finding 3 (2026-08-26): agents naturally write depends_on as a
  // YAML flow list; the parser tore a run refusing it. Flow lists of
  // scalars are legal frontmatter now, equal to the block form.
  // Exam 034: the reviewer instinctively linked its REV to the ticket it
  // covers; the schema refused. The link is legal now, optional, and must
  // be a full ticket id.
  it("accepts an exact ticket and implementation account on a review", () => {
    const result = parseArtifact(
      "reviews/REV-001.md",
      [
        "---",
        "id: REV-001",
        "type: review",
        "implementation_account: fixture-tkt-002-implementation",
        "status: complete",
        "revision: 1",
        "range: abc1234..def5678",
        "ticket: TKT-002",
        "---",
        "",
        "body",
      ].join("\n"),
    );
    expect(result._tag).toBe("ok");
  });

  // The link was accepted and silently dropped: ReviewArtifact carried no
  // ticket property, so `doctor` could never resolve what SPEC §7
  // advertises. The parse now carries it.
  it("carries the review's ticket link through the parse", () => {
    const result = parseArtifact(
      "reviews/REV-001.md",
      "---\nid: REV-001\ntype: review\nimplementation_account: fixture-tkt-001-implementation\nstatus: complete\nrevision: 1\nrange: abc1234..def5678\nticket: TKT-002\n---\n\nbody",
    );
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok" || result.value.type !== "review") return;
    expect(result.value.ticket).toBe("TKT-002");
  });

  it("refuses a review with no delivered ticket instead of inventing ownership", () => {
    const result = parseArtifact(
      "reviews/REV-001.md",
      "---\nid: REV-001\ntype: review\nimplementation_account: implementation-one\nstatus: complete\nrevision: 1\nrange: abc1234..def5678\n---\n",
    );
    expect(result._tag).toBe("err");
    if (result._tag === "err")
      expect(result.error.issues.map((issue) => issue.path)).toContain("ticket");
  });

  it("rejects a review ticket link that is not a full ticket id", () => {
    const result = parseArtifact(
      "reviews/REV-001.md",
      "---\nid: REV-001\ntype: review\nimplementation_account: fixture-tkt-001-implementation\nstatus: complete\nrevision: 1\nrange: abc1234..def5678\nticket: ticket-two\n---\n\nbody",
    );
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues.map((issue) => issue.path)).toContain("ticket");
  });

  it("accepts a flow list of ids", () => {
    const result = parseArtifact(
      "tickets/TKT-003.md",
      [
        "---",
        "id: TKT-003",
        "type: ticket",
        "intent: fixture-change",
        "scope: [src]",
        "status: ready",
        "revision: 1",
        "depends_on: [TKT-001, TKT-002]",
        "---",
        "",
        "body",
      ].join("\n"),
    );
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok" || result.value.type !== "ticket") return;
    expect(result.value.dependsOn).toEqual(["TKT-001", "TKT-002"]);
  });

  it("accepts an empty flow list", () => {
    const result = parseArtifact(
      "tickets/TKT-003.md",
      [
        "---",
        "id: TKT-003",
        "type: ticket",
        "intent: fixture-change",
        "scope: [src]",
        "status: ready",
        "revision: 1",
        "depends_on: []",
        "---",
        "",
        "body",
      ].join("\n"),
    );
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok" || result.value.type !== "ticket") return;
    expect(result.value.dependsOn).toEqual([]);
  });

  it("parses a spec-example initiative with its consumes reference", () => {
    const parsed = parseArtifact("001-user-auth/initiative.md", INITIATIVE_MD);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value).toEqual({
      id: "INIT-001",
      type: "initiative",
      tickets: [],
      status: "executing",
      revision: 3,
      consumes: [{ id: "INIT-001/SPEC", revision: 2 }],
    });
  });

  it("rejects an artifact whose id does not match its file slot", () => {
    const parsed = parseArtifact("tickets/TKT-002.md", INITIATIVE_MD);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toContainEqual({
      path: "id",
      message: "file 'tickets/TKT-002.md' must carry id 'TKT-002' (found 'INIT-001')",
    });
  });

  it("rejects text that does not open with frontmatter", () => {
    const parsed = parseArtifact("001-user-auth/initiative.md", "# No frontmatter\n");
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      { path: "", message: "artifact must start with a '---' frontmatter block" },
    ]);
  });

  it("rejects an unknown lifecycle state for the type", () => {
    const parsed = parseArtifact(
      "001-user-auth/initiative.md",
      INITIATIVE_MD.replace("status: executing", "status: enthusiastic"),
    );
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      {
        path: "status",
        message:
          "invalid status 'enthusiastic' for type initiative (expected one of: proposed, shaping, decided, specified, planned, executing, reviewing, verifying, complete)",
      },
    ]);
  });

  it("parses a ticket with every type-specific field", () => {
    const text = `---
id: TKT-002
type: ticket
intent: fixture-change
scope: [src]
status: implementing
revision: 2
blocked: true
consumes:
  - { id: INIT-001/SPEC, revision: 1 }
depends_on:
  - TKT-001
claimed_by: worktrees/gl-001
base_commit: 4a1b2c3
result_commit: null
acceptance:
  - [x] red test cites the seam
  - [ ] green implementation
---

## TKT-002: CLI envelope
`;
    const parsed = parseArtifact("tickets/TKT-002.md", text);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value).toEqual({
      id: "TKT-002",
      type: "ticket",
      intent: "fixture-change",
      scope: ["src"],
      status: "implementing",
      revision: 2,
      blocked: true,
      consumes: [{ id: "INIT-001/SPEC", revision: 1 }],
      dependsOn: ["TKT-001"],
      claimedBy: "worktrees/gl-001",
      baseCommit: "4a1b2c3",
      resultCommit: null,
      acceptance: [
        { text: "red test cites the seam", done: true },
        { text: "green implementation", done: false },
      ],
    });
  });

  it("defaults a ticket's optional fields when only the common ones are present", () => {
    const text = `---
id: TKT-001
type: ticket
intent: fixture-change
scope: [src]
status: ready
revision: 1
---

## TKT-001: scaffold
`;
    const parsed = parseArtifact("tickets/TKT-001.md", text);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value).toEqual({
      id: "TKT-001",
      type: "ticket",
      intent: "fixture-change",
      scope: ["src"],
      status: "ready",
      revision: 1,
      blocked: false,
      consumes: [],
      dependsOn: [],
      claimedBy: null,
      baseCommit: null,
      resultCommit: null,
      acceptance: [],
    });
  });

  it("requires the committed range on a review", () => {
    const text = `---
id: REV-001
type: review
implementation_account: fixture-tkt-001-implementation
ticket: TKT-001
status: draft
revision: 1
---

# Review
`;
    const parsed = parseArtifact("reviews/REV-001.md", text);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      { path: "range", message: "range must be a non-empty string '<base>..<head>'" },
    ]);
  });

  it("parses the wayfinder map artifact at its initiative-root slot", () => {
    const text = `---
id: INIT-001/MAP
type: map
status: draft
revision: 1
---

# Map

- [ ] Decide the storage layout
- [ ] Decide the retry policy
`;
    const parsed = parseArtifact("001-user-auth/map.md", text);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.type).toBe("map");
    expect(parsed.value.id).toBe("INIT-001/MAP");
    expect(parsed.value.status).toBe("draft");
  });

  it("rejects ticket-only fields on the map artifact", () => {
    const text = `---
id: INIT-001/MAP
type: map
status: draft
revision: 1
depends_on:
  - TKT-001
---

# Map
`;
    const parsed = parseArtifact("001-user-auth/map.md", text);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      { path: "depends_on", message: "field 'depends_on' belongs to tickets only" },
    ]);
  });

  it("rejects ticket-only fields on a non-ticket artifact", () => {
    const text = `---
id: INIT-001/SPEC
type: spec
status: complete
revision: 2
depends_on:
  - TKT-001
---

# Spec
`;
    const parsed = parseArtifact("001-user-auth/spec.md", text);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      { path: "depends_on", message: "field 'depends_on' belongs to tickets only" },
    ]);
  });

  it("rejects a depends_on entry that is not a full ticket id", () => {
    const text = `---
id: TKT-002
type: ticket
intent: fixture-change
scope: [src]
status: ready
revision: 1
depends_on:
  - later
  - TKT-001
  - INIT-001/SPEC
---

# Ticket
`;
    const parsed = parseArtifact("tickets/TKT-002.md", text);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      {
        path: "depends_on[0]",
        message: "'later' is not a full ticket id like 'TKT-002'",
      },
      {
        path: "depends_on[2]",
        message: "'INIT-001/SPEC' is not a full ticket id like 'TKT-002'",
      },
    ]);
  });

  it("accepts a global ticket dependency independently of initiative membership", () => {
    const text = `---
id: TKT-002
type: ticket
intent: fixture-change
scope: [src]
status: ready
revision: 1
depends_on:
  - TKT-001
---

# Ticket
`;
    const parsed = parseArtifact("tickets/TKT-002.md", text);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag === "ok" && parsed.value.type === "ticket")
      expect(parsed.value.dependsOn).toEqual(["TKT-001"]);
  });

  it("rejects unknown fields so typos cannot silently drop a contract", () => {
    const text = `---
id: INIT-001/DEC
type: decisions
status: complete
revision: 1
consummer: INIT-001
---

# Decisions
`;
    const parsed = parseArtifact("001-user-auth/decisions.md", text);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues).toEqual([
      {
        path: "consummer",
        message:
          "unknown field 'consummer' — a decisions artifact's fields are: id, type, status, revision, consumes",
      },
    ]);
  });

  it("records initiative membership by global ticket ID and refuses retired arc grants", () => {
    const body = `---\nid: INIT-001\ntype: initiative\nstatus: executing\nrevision: 1\ntickets: [TKT-001, TKT-002]\n---\n# X\n`;
    const parsed = parseArtifact("001-x/initiative.md", body);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag === "ok" && parsed.value.type === "initiative")
      expect(parsed.value.tickets).toEqual(["TKT-001", "TKT-002"]);
    expect(
      parseArtifact(
        "001-x/initiative.md",
        body.replace("tickets: [TKT-001, TKT-002]", "grant: arc"),
      )._tag,
    ).toBe("err");
    expect(parseArtifact("001-x/initiative.md", body.replace("TKT-002", "TKT-001"))._tag).toBe(
      "err",
    );
  });

  it("rejects frontmatter syntax outside the constrained dialect", () => {
    const text = `---
id: INIT-001
type: initiative
status: shaping
revision: 1
    nested:
      deep: true
---

# Initiative
`;
    const parsed = parseArtifact("001-user-auth/initiative.md", text);
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues.some((issue) => issue.path === "")).toBe(true);
  });

  it("covers every lifecycle state of every type with a parseable fixture", () => {
    const slotByType = {
      initiative: "001-x/initiative.md",
      decisions: "001-x/decisions.md",
      spec: "001-x/spec.md",
      map: "001-x/map.md",
      ticket: "tickets/TKT-001.md",
      research: "001-x/research/RSRCH-001.md",
      prototype: "001-x/prototypes/PROTO-001.md",
      review: "reviews/REV-001.md",
    } satisfies Readonly<Record<ArtifactType, string>>;
    const idByType = {
      initiative: "INIT-001",
      decisions: "INIT-001/DEC",
      spec: "INIT-001/SPEC",
      map: "INIT-001/MAP",
      ticket: "TKT-001",
      research: "INIT-001/RSRCH-001",
      prototype: "INIT-001/PROTO-001",
      review: "REV-001",
    } satisfies Readonly<Record<ArtifactType, string>>;
    const types = [
      "initiative",
      "decisions",
      "spec",
      "map",
      "ticket",
      "research",
      "prototype",
      "review",
    ] as const satisfies readonly ArtifactType[];
    for (const type of types) {
      for (const status of artifactStatuses(type)) {
        const slot = slotByType[type];
        const id = idByType[type];
        const extra =
          type === "review"
            ? "range: abc1234..def5678\nticket: TKT-001\nimplementation_account: implementation-one\n"
            : type === "ticket"
              ? "intent: fixture-change\nscope: [src]\n"
              : "";
        const text = `---\nid: ${id}\ntype: ${type}\nstatus: ${status}\nrevision: 1\n${extra}---\n\nbody\n`;
        const parsed = parseArtifact(slot, text);
        expect(parsed._tag, `${type}/${status}`).toBe("ok");
      }
    }
  });
});
