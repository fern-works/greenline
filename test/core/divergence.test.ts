import { describe, expect, it } from "vitest";
import {
  auditDivergenceRecords,
  divergenceRevision,
  orderDivergenceRecords,
  parseDivergenceRecord,
  renderSkillDivergence,
  replayClaims,
  type DivergenceRecord,
  type DivergenceState,
} from "../../src/core/divergence.ts";
import type { TextHunk } from "../../src/core/diff.ts";

const source = {
  repo: "https://example.com/source",
  commit: "a".repeat(40),
  path: "skills/method",
  revision: "b".repeat(64),
};
const H1 = "h:0123456789abcdef";
const H2 = "h:fedcba9876543210";
const H3 = "h:00000000000000aa";

function record(overrides: Partial<DivergenceRecord> = {}): DivergenceRecord {
  return {
    schemaVersion: 2,
    id: "baseline",
    date: "2026-09-11",
    previous: null,
    links: { decision: "docs/adr/0039.md" },
    changes: [
      {
        skill: "method",
        source,
        result: "d".repeat(64),
        reason: "The copy as cut over.",
        edits: [
          { kind: "harness", reason: "greenline frontmatter", hunks: [H1] },
          { kind: "location", reason: "scratch under .greenline/tmp", hunks: [H2] },
        ],
        retired: [],
      },
    ],
    ...overrides,
  };
}

/** A record-shaped fixture, valid or deliberately broken, on its way to the parser. */
interface RecordLike {
  readonly schemaVersion: number;
}

function parse(value: RecordLike): ReturnType<typeof parseDivergenceRecord> {
  return parseDivergenceRecord(JSON.stringify(value), "fixture");
}

function state(pin: DivergenceRecord, hunks: readonly string[]): DivergenceState {
  const change = pin.changes[0];
  if (change === undefined) throw new Error("fixture change");
  return {
    skill: "method",
    record: { id: pin.id, revision: divergenceRevision(pin) },
    source: change.source,
    result: change.result,
    hunks,
  };
}

describe("parseDivergenceRecord", () => {
  it("parses a schema-2 record and refuses the retired schema", () => {
    expect(parse(record())._tag).toBe("ok");
    expect(parse({ ...record(), schemaVersion: 1 })._tag).toBe("err");
  });

  it("refuses a method edit without the operator's authority witness", () => {
    const base = record();
    const change = base.changes[0];
    if (change === undefined) throw new Error("fixture change");
    const unwitnessed = {
      ...base,
      changes: [{ ...change, edits: [{ kind: "method", reason: "drop a step", hunks: [H1] }] }],
    };
    expect(parse(unwitnessed)._tag).toBe("err");
    const witnessed = {
      ...unwitnessed,
      changes: [
        {
          ...unwitnessed.changes[0],
          authority: { path: "docs/adr/0040.md", revision: "e".repeat(64), reason: "ruled" },
        },
      ],
    };
    expect(parse(witnessed)._tag).toBe("ok");
  });

  it("refuses one hunk claimed twice in one change and accepts a re-kind (retired and claimed again)", () => {
    const base = record();
    const change = base.changes[0];
    if (change === undefined) throw new Error("fixture change");
    const twice = {
      ...base,
      changes: [
        {
          ...change,
          edits: [
            { kind: "harness", reason: "a", hunks: [H1] },
            { kind: "scope", reason: "b", hunks: [H1] },
          ],
        },
      ],
    };
    expect(parse(twice)._tag).toBe("err");
    const rekind = {
      ...base,
      changes: [{ ...change, retired: [{ hunk: H1, reason: "re-kinded as harness" }] }],
    };
    expect(parse(rekind)._tag).toBe("ok");
    const retiredTwice = {
      ...base,
      changes: [
        {
          ...change,
          retired: [
            { hunk: H3, reason: "gone" },
            { hunk: H3, reason: "gone again" },
          ],
        },
      ],
    };
    expect(parse(retiredTwice)._tag).toBe("err");
  });

  it("refuses two changes for one skill and a malformed hunk id", () => {
    const base = record();
    const change = base.changes[0];
    if (change === undefined) throw new Error("fixture change");
    const doubled = { ...base, changes: [change, change] };
    expect(parse(doubled)._tag).toBe("err");
    const malformed = {
      ...base,
      changes: [{ ...change, edits: [{ kind: "harness", reason: "a", hunks: ["h:short"] }] }],
    };
    expect(parse(malformed)._tag).toBe("err");
  });
});

describe("the chain", () => {
  const baseline = record();
  const next = record({
    id: "next",
    date: "2026-09-12",
    previous: { id: "baseline", revision: divergenceRevision(baseline) },
    changes: [
      {
        skill: "method",
        source: { ...source, commit: "c".repeat(40), revision: "f".repeat(64) },
        result: "e".repeat(64),
        reason: "Refresh: upstream absorbed the scratch redirect.",
        edits: [{ kind: "scope", reason: "narrower trigger", hunks: [H3] }],
        retired: [{ hunk: H2, reason: "upstream now writes under the workspace" }],
      },
    ],
  });

  it("orders baseline to tip and refuses a branch, a changed predecessor and a second baseline", () => {
    expect(orderDivergenceRecords([next, baseline]).chain.map((r) => r.id)).toEqual([
      "baseline",
      "next",
    ]);
    expect(
      orderDivergenceRecords([baseline, next, { ...next, id: "sibling" }]).issues.length,
    ).toBeGreaterThan(0);
    expect(
      orderDivergenceRecords([
        baseline,
        { ...next, previous: { id: "baseline", revision: "0".repeat(64) } },
      ]).issues.length,
    ).toBeGreaterThan(0);
    expect(
      orderDivergenceRecords([baseline, { ...next, previous: null }]).issues.length,
    ).toBeGreaterThan(0);
  });

  it("replays claims and retirements per skill", () => {
    const replay = replayClaims([baseline, next], "method");
    expect(replay.issues).toEqual([]);
    expect([...replay.claims.keys()].sort()).toEqual([H1, H3].sort());
    expect(replay.claims.get(H3)?.record).toBe("next");
    const wrong = replayClaims([next], "method");
    expect(wrong.issues.some((issue) => issue.message.includes("no earlier record claimed"))).toBe(
      true,
    );
  });

  it("audits coverage: an unclaimed live hunk and a stale claim are both refused", () => {
    expect(auditDivergenceRecords([baseline], [state(baseline, [H1, H2])])).toEqual([]);
    expect(
      auditDivergenceRecords([baseline], [state(baseline, [H1, H2, H3])]).map((i) => i.message),
    ).toEqual([`hunk ${H3} is live and no record claims it`]);
    expect(
      auditDivergenceRecords([baseline], [state(baseline, [H1])]).map((i) => i.message),
    ).toEqual([`hunk ${H2} is claimed and no longer live`]);
  });

  it("audits the pin: the latest record, its source and its result", () => {
    const current = state(next, [H1, H3]);
    expect(auditDivergenceRecords([baseline, next], [current])).toEqual([]);
    expect(
      auditDivergenceRecords([baseline, next], [state(baseline, [H1, H2])]).some((issue) =>
        issue.message.includes("latest"),
      ),
    ).toBe(true);
    expect(
      auditDivergenceRecords([baseline, next], [{ ...current, result: "1".repeat(64) }]).map(
        (issue) => issue.message,
      ),
    ).toContain("the copy differs from its pinned record");
    expect(
      auditDivergenceRecords(
        [baseline, next],
        [{ ...current, source: { ...current.source, commit: "9".repeat(40) } }],
      ).map((issue) => issue.message),
    ).toContain("upstream source differs from the pinned record");
  });

  it("renders a skill page from the chain", () => {
    const hunks: readonly TextHunk[] = [
      { id: H1, path: "SKILL.md", kind: "changed", removed: ["name: x"], added: ['name: "x"'] },
      { id: H3, path: "SKILL.md", kind: "changed", removed: ["always"], added: ["when asked"] },
    ];
    const page = renderSkillDivergence({ skill: "method", source, hunks, upstreamLines: 100 }, [
      baseline,
      next,
    ]);
    expect(page).toContain("Drift: 4 of 100 lines changed (4%)");
    expect(page).toContain("## harness: greenline frontmatter");
    expect(page).toContain("## scope: narrower trigger");
    expect(page).toContain("-always\n+when asked");
    expect(page).toContain(`- \`${H2}\` in \`next\`: upstream now writes under the workspace`);
    expect(page).not.toContain("## Unclaimed");
  });
});
