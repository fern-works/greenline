/** The ledger's core (workshop/components/ledger.md, the rulings of 2026-09-16): one chain across two schema versions. */
import { describe, expect, it } from "vitest";
import {
  divergenceRevision,
  orderDivergenceRecords,
  type DivergenceRecord,
} from "../../src/core/divergence.ts";
import {
  auditCopies,
  auditPins,
  authorityClaims,
  copyChainOf,
  copyRecordOf,
  ledgerRevision,
  ledgerTip,
  orderLedger,
  parseLedgerEntry,
  renderLedgerIndex,
  renderSourcesRegister,
  type LedgerEntry,
  type LedgerEntryV3,
} from "../../src/core/ledger.ts";

const source = {
  repo: "https://example.com/source",
  commit: "a".repeat(40),
  path: "skills/method",
  revision: "b".repeat(64),
};
const licensed = { ...source, license: "MIT" as const };
const H1 = "h:0123456789abcdef";
const H2 = "h:fedcba9876543210";
const ruling = { date: "2026-09-16", words: "the lift is allowed, in these words" };
const authority = { path: "docs/DECISIONS.md", revision: "c".repeat(64), reason: "ruled", ruling };

const record: DivergenceRecord = {
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
      edits: [{ kind: "harness", reason: "greenline frontmatter", hunks: [H1] }],
      retired: [],
    },
  ],
};

type Overrides = Partial<LedgerEntryV3> & Pick<LedgerEntryV3, "kind" | "changes">;
function v3(overrides: Overrides) {
  return { schemaVersion: 3, id: "entry", date: "2026-09-16", previous: null, ...overrides };
}
type Fixture = DivergenceRecord | ReturnType<typeof v3>;
function parse(value: Fixture): LedgerEntry {
  const parsed = parseLedgerEntry(JSON.stringify(value), "fixture");
  if (parsed._tag !== "ok") throw new Error(parsed.error.message);
  return parsed.value;
}
function refuseText(text: string): string {
  const parsed = parseLedgerEntry(text, "fixture");
  if (parsed._tag !== "err") throw new Error("accepted");
  return parsed.error.issues.map((issue) => issue.message).join("; ");
}
function refuse(value: Fixture): string {
  const parsed = parseLedgerEntry(JSON.stringify(value), "fixture");
  if (parsed._tag !== "err") throw new Error("accepted");
  return parsed.error.issues.map((issue) => issue.message).join("; ");
}
const house = (skill: string) => ({
  subject: { skill },
  origin: { house: true as const },
  spans: [],
  reason: "written here",
});
const copyOf = (
  edits: readonly { kind: "harness" | "scope" | "method"; reason: string; hunks: string[] }[],
  extra = {},
) => ({
  skill: "method",
  source: licensed,
  result: "e".repeat(64),
  reason: "r",
  edits,
  retired: [],
  ...extra,
});

describe("parseLedgerEntry", () => {
  it("reads a version-2 record as a copy entry at the revision it always had", () => {
    const entry = parse(record);
    expect(entry.version).toBe(2);
    expect(entry.kind).toBe("copy");
    expect(entry.revision).toBe(divergenceRevision(record));
    expect(entry.subjects).toEqual(["skill:method"]);
  });
  it("parses every version-3 kind and names its subjects", () => {
    const native = parse(v3({ kind: "native", changes: [house("router")] }));
    expect(native.subjects).toEqual(["skill:router"]);
    const lifted = parse(
      v3({
        kind: "native",
        changes: [
          {
            subject: { block: "corpus/runtime/agent.md" },
            origin: { digest: "bodner-learning-go", pin: "epub sha256 477b" },
            spans: [{ lines: "L12-L40", disposition: "adapted", reason: "the rule in our words" }],
            reason: "lifted",
            authority,
          },
        ],
      }),
    );
    expect(lifted.subjects).toEqual(["block:corpus/runtime/agent.md"]);
    const unit = parse(
      v3({
        kind: "unit",
        changes: [
          {
            family: "go",
            origin: { digest: "bodner-learning-go", pin: "epub sha256 477b" },
            spans: [{ lines: "L1-L9", disposition: "retain" }],
            units: [{ id: "go-law", revision: "f".repeat(64), grade: "confirms" }],
            reason: "the book read against the family",
          },
        ],
      }),
    );
    expect(unit.subjects).toEqual(["family:go"]);
    const publication = parse(
      v3({
        kind: "publication",
        changes: [
          {
            snapshot: "snap-1",
            previous: null,
            at: "2026-09-16T10:00:00Z",
            units: [{ id: "go-law", revision: "f".repeat(64), reason: "first publication" }],
            reason: "the first snapshot",
          },
        ],
      }),
    );
    expect(publication.subjects).toEqual(["snapshot:snap-1"]);
    if (publication.version !== 3) throw new Error("version");
    expect(publication.revision).toBe(ledgerRevision(publication.raw));
    const copy = parse(
      v3({ kind: "copy", changes: [copyOf([{ kind: "scope", reason: "a", hunks: [H1] }])] }),
    );
    expect(copy.subjects).toEqual(["skill:method"]);
  });
  it("refuses a fifth kind, a copy source without its licence, a lift without its authority, and a method edit without one", () => {
    expect(
      refuseText(
        JSON.stringify({
          ...v3({ kind: "native", changes: [house("router")] }),
          kind: "migration",
        }),
      ),
    ).toContain("Expected 'copy' | 'native' | 'unit' | 'publication'");
    expect(
      refuseText(
        JSON.stringify({
          schemaVersion: 3,
          id: "entry",
          date: "2026-09-16",
          previous: null,
          kind: "copy",
          changes: [{ ...copyOf([]), source }],
        }),
      ),
    ).toContain('"MIT"');
    expect(
      refuse(
        v3({
          kind: "native",
          changes: [
            {
              subject: { skill: "router" },
              origin: { digest: "d", pin: "p" },
              spans: [],
              reason: "lifted",
            },
          ],
        }),
      ),
    ).toContain("authority");
    expect(
      refuse(
        v3({
          kind: "copy",
          changes: [copyOf([{ kind: "method", reason: "changes the method", hunks: [H1] }])],
        }),
      ),
    ).toContain("authority");
  });
  it("refuses two changes on one subject, a hunk claimed twice, and a private path", () => {
    expect(
      refuse(
        v3({
          kind: "unit",
          changes: [
            { family: "go", origin: { digest: "d", pin: "p" }, spans: [], units: [], reason: "a" },
            { family: "go", origin: { digest: "d", pin: "p" }, spans: [], units: [], reason: "b" },
          ],
        }),
      ),
    ).toContain("one change per subject");
    expect(
      refuse(
        v3({
          kind: "copy",
          changes: [
            copyOf([
              { kind: "harness", reason: "a", hunks: [H1] },
              { kind: "scope", reason: "b", hunks: [H1] },
            ]),
          ],
        }),
      ),
    ).toContain("claimed twice");
    expect(
      refuse(
        v3({
          kind: "native",
          changes: [{ ...house("router"), reason: "see docs/work/JOBS.md for why" }],
        }),
      ),
    ).toContain("private path");
  });
  it("parses a retirement as a copy change and names its subject", () => {
    const retired = parse(
      v3({
        kind: "copy",
        id: "method-retired",
        changes: [
          {
            skill: "method",
            reason: "replaced by the house method",
            retirement: { replacement: "house-method" },
          },
        ],
      }),
    );
    expect(retired.kind).toBe("copy");
    expect(retired.subjects).toEqual(["skill:method"]);
  });
  it("leaves a retirement out of the replay's projection, which has no hunks to claim", () => {
    const retired = parse(
      v3({
        kind: "copy",
        id: "method-retired",
        changes: [
          {
            skill: "method",
            reason: "replaced by the house method",
            retirement: { replacement: "house-method" },
          },
        ],
      }),
    );
    expect(copyRecordOf(retired)).toBeUndefined();
    expect(copyChainOf([parse(record), retired]).map((item) => item.id)).toEqual(["baseline"]);
  });
  it("renders a retired skill in the index, with its replacement or without one", () => {
    const gone = parse(
      v3({
        kind: "copy",
        id: "method-gone",
        changes: [
          { skill: "method", reason: "abandoned upstream", retirement: { replacement: null } },
        ],
      }),
    );
    expect(renderLedgerIndex([gone])).toContain("- **skill:method** (retired): abandoned upstream");
    const retired = parse(
      v3({
        kind: "copy",
        id: "method-retired",
        changes: [
          {
            skill: "method",
            reason: "replaced by the house method",
            retirement: { replacement: "house-method" },
          },
        ],
      }),
    );
    expect(renderLedgerIndex([retired])).toContain(
      "- **skill:method** (retired; replaced by house-method): replaced by the house method",
    );
  });
  it("refuses a retirement whose replacement is not a skill id", () => {
    expect(
      refuseText(
        JSON.stringify(
          v3({
            kind: "copy",
            changes: [{ skill: "method", reason: "r", retirement: { replacement: "TODO" } }],
          }),
        ),
      ),
    ).toContain("must match pattern");
  });
  it("lets a link name a private path, since a public reader ignores links", () => {
    const entry = parse(
      v3({
        kind: "native",
        links: { review: "docs/work/reviews/REV-x.md" },
        changes: [house("router")],
      }),
    );
    expect(entry.kind).toBe("native");
  });
});

describe("the chain across versions", () => {
  const baseline = parse(record);
  const routerHouse = parse(
    v3({
      kind: "native",
      id: "router-house",
      previous: { id: baseline.id, revision: baseline.revision },
      changes: [house("router")],
    }),
  );
  const copy = parse(
    v3({
      kind: "copy",
      id: "later",
      previous: { id: routerHouse.id, revision: routerHouse.revision },
      changes: [
        copyOf([{ kind: "scope", reason: "the opening paragraph", hunks: [H2] }], {
          reason: "a later edit",
          retired: [{ hunk: H1, reason: "re-measured" }],
        }),
      ],
    }),
  );
  it("orders a version-2 baseline, a version-3 native entry and a version-3 copy into one chain", () => {
    const ordered = orderLedger([copy, baseline, routerHouse]);
    expect(ordered.issues).toEqual([]);
    expect(ordered.chain.map((entry) => entry.id)).toEqual(["baseline", "router-house", "later"]);
    expect(ledgerTip(ordered.chain)).toEqual({ id: "later", revision: copy.revision });
  });
  it("refuses a stale predecessor, a branch and a second baseline", () => {
    const stale = parse(
      v3({
        kind: "native",
        id: "stale",
        previous: { id: routerHouse.id, revision: "0".repeat(64) },
        changes: [house("router")],
      }),
    );
    expect(
      orderLedger([baseline, routerHouse, copy, stale]).issues.map((issue) => issue.message),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("branches"),
        expect.stringContaining("missing or changed"),
      ]),
    );
    expect(
      orderLedger([baseline, parse(record)])
        .issues.map((issue) => issue.message)
        .join(" "),
    ).toContain("duplicate");
  });
  it("replays only the copy entries as a valid version-2 chain: the source without its licence, the authority without the ruling's words, the predecessor re-linked", () => {
    const records = copyChainOf([baseline, routerHouse, copy]);
    expect(records.map((item) => item.id)).toEqual(["baseline", "later"]);
    expect(records[1]?.previous).toEqual({ id: "baseline", revision: baseline.revision });
    expect(records[1]?.changes[0]?.source).toEqual(source);
    expect(orderDivergenceRecords(records).issues).toEqual([]);
    expect(orderDivergenceRecords(records).chain.map((item) => item.id)).toEqual([
      "baseline",
      "later",
    ]);
    expect(copyRecordOf(routerHouse)).toBeUndefined();
    const witnessed = parse(
      v3({
        kind: "copy",
        id: "ruled",
        changes: [
          copyOf([{ kind: "method", reason: "the method changes", hunks: [H2] }], { authority }),
        ],
      }),
    );
    expect(copyRecordOf(witnessed)?.changes[0]?.authority).toEqual({
      path: authority.path,
      revision: authority.revision,
      reason: authority.reason,
    });
  });
  it("audits a pin at the version-3 entry's own revision and the live hunks against the replay", () => {
    const chain = orderLedger([baseline, routerHouse, copy]).chain;
    const state = {
      skill: "method",
      record: { id: "later", revision: copy.revision },
      source,
      result: "e".repeat(64),
      hunks: [H2],
    };
    expect(auditCopies(chain, [state])).toEqual([]);
    expect(
      auditCopies(chain, [{ ...state, hunks: [H1, H2] }]).map((issue) => issue.message),
    ).toEqual([`hunk ${H1} is live and no entry claims it`]);
    expect(
      auditCopies(chain, [{ ...state, record: { id: "baseline", revision: baseline.revision } }])
        .map((issue) => issue.message)
        .join(" "),
    ).toContain("latest entry");
  });
  it("names the witnesses an entry's authorities claim, paired with each change's subject", () => {
    expect(authorityClaims(baseline)).toEqual([]);
    const witnessed = parse(
      v3({
        kind: "copy",
        changes: [
          copyOf([{ kind: "method", reason: "the method changes", hunks: [H2] }], { authority }),
        ],
      }),
    );
    expect(authorityClaims(witnessed)).toEqual([
      {
        subject: "skill:method",
        authority: { path: authority.path, revision: authority.revision },
      },
    ]);
    const lifted = parse(
      v3({
        kind: "native",
        changes: [
          {
            subject: { block: "corpus/runtime/agent.md" },
            origin: { digest: "d", pin: "p" },
            spans: [],
            reason: "lifted",
            authority,
          },
        ],
      }),
    );
    expect(authorityClaims(lifted)).toEqual([
      {
        subject: "block:corpus/runtime/agent.md",
        authority: { path: authority.path, revision: authority.revision },
      },
    ]);
  });
  it("audits a pin outside the copy audit: the latest entry for its subject, at that entry's revision", () => {
    const chain = orderLedger([baseline, routerHouse, copy]).chain;
    const subject = "skill:router";
    expect(
      auditPins(chain, [{ subject, pin: { id: routerHouse.id, revision: routerHouse.revision } }]),
    ).toEqual([]);
    expect(
      auditPins(chain, [{ subject, pin: { id: routerHouse.id, revision: "0".repeat(64) } }]).map(
        (issue) => issue.message,
      ),
    ).toEqual(["the pinned ledger entry is missing or changed"]);
    expect(
      auditPins(chain, [
        { subject: "skill:method", pin: { id: baseline.id, revision: baseline.revision } },
      ]).map((issue) => issue.message),
    ).toEqual(["the pin must name the latest entry for this subject"]);
    expect(
      auditPins(chain, [], ["skill:router", "family:go"]).map((issue) => issue.message),
    ).toEqual(["the chain records this subject and it carries no pin"]);
  });
  it("renders a rejected read in the sources register as read against its family and rejected", () => {
    const rejected = parse(
      v3({
        kind: "unit",
        id: "rust-read",
        changes: [
          {
            family: "rust",
            origin: { digest: "a-digest", pin: "epub sha256 0000" },
            spans: [],
            units: [],
            reason: "read against the family; nothing entered",
          },
        ],
      }),
    );
    const kept = parse(
      v3({
        kind: "unit",
        id: "go-read",
        changes: [
          {
            family: "go",
            origin: { digest: "bodner-learning-go", pin: "epub sha256 477b" },
            spans: [{ lines: "L1-L9", disposition: "retain" }],
            units: [{ id: "go-law", revision: "f".repeat(64), grade: "confirms" }],
            reason: "the book read against the family",
          },
        ],
      }),
    );
    const text = renderSourcesRegister(
      [rejected, kept],
      "| Source | Verdict |\n| --- | --- |\n| old | kept |",
    );
    expect(text).toContain("read against the `rust` unit family and rejected");
    expect(text).toContain("in the product as the `go` unit family");
    expect(text).toContain("## Before the ledger, frozen on 2026-09-16");
    expect(text).toContain("| old | kept |");
  });
  it("renders the index with every kind, newest last", () => {
    const text = renderLedgerIndex(orderLedger([baseline, routerHouse, copy]).chain);
    expect(text.indexOf("router-house (native)")).toBeGreaterThan(text.indexOf("baseline (copy)"));
    expect(text).toContain("- **skill:method**: a later edit");
  });
});
