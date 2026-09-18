import { describe, expect, it } from "vitest";
import {
  listUnits,
  parseUnit,
  publish,
  resolveAnchor,
  showUnit,
  snapshotCabinet,
  validateQuery,
  type FrontMatter,
  type Publication,
  type Query,
  type Snapshot,
  type UnitFile,
  type Vocabulary,
} from "../../src/core/cabinet.ts";

/**
 * The cabinet contract (`docs/cabinet-contract.md`), one test per clause:
 * a publication is refused for exactly the listed reasons, and the four
 * reads answer with the listed semantics. Fixtures are minimal units built
 * from the same `key: <JSON>` front matter the reshape tool emits.
 */

const vocabulary = {
  language: ["go", "ruby"],
  purpose: ["service or API", "command-line tool"],
  technology: ["chi", "rails"],
  task: ["decide", "implement", "test"],
  concern: ["errors", "testing", "tooling"],
  kind: ["rule", "pattern", "explanation", "option", "recipe", "disagreement", "reference"],
  responsibility: ["api framework", "toolchain"],
};

type Overrides = Partial<FrontMatter>;

function unit(
  family: string,
  id: string,
  overrides: Overrides = {},
  body = "The body.\n",
): UnitFile {
  const front = {
    id,
    title: `Unit ${id}`,
    kind: "rule",
    when: `Doing the thing that ${id} is about, in a way a fresh agent can judge.`,
    summary: "What it says. Why it matters.",
    language: [family === "shared" ? undefined : family].filter((v) => v !== undefined),
    purpose: [],
    technology: [],
    task: ["implement"],
    concern: ["errors"],
    option_group: null,
    requires: [],
    contains: [],
    see_also: [],
    verification: { verified: "2026-09-08", window_days: 365, watch: [] },
    compatibility: [],
    sources: [{ kind: "treatment", ref: "synthesis" }],
    lineage: [],
    ...overrides,
  };
  const lines = Object.entries(front).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return { family, path: `${family}/${id}.md`, text: `---\n${lines.join("\n")}\n---\n\n${body}` };
}

function publication(files: readonly UnitFile[]): Publication {
  return { id: "snap-1", publishedAt: "2026-09-08T00:00:00Z", vocabulary, files };
}

function published(files: readonly UnitFile[]): Snapshot {
  const result = publish(publication(files));
  if (result._tag === "err") throw new Error(result.error.message);
  return result.value;
}

const refusal = (files: readonly UnitFile[]): readonly string[] => {
  const result = publish(publication(files));
  return result._tag === "err" ? result.error.problems : [];
};

describe("parseUnit", () => {
  it("reads key: <JSON> front matter and keeps the body verbatim", () => {
    const parsed = parseUnit(unit("go", "go-errors", {}, "Body line one.\n\nBody line two.\n"));
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.id).toBe("go-errors");
    expect(parsed.value.family).toBe("go");
    expect(parsed.value.body).toBe("Body line one.\n\nBody line two.\n");
  });

  it("refuses a file without front matter, and an unknown key", () => {
    expect(parseUnit({ family: "go", path: "go/x.md", text: "no front matter\n" })._tag).toBe(
      "err",
    );
    const base = unit("go", "go-x");
    const extra = parseUnit({
      ...base,
      text: base.text.replace("\n---\n\n", "\nextra: 1\n---\n\n"),
    });
    expect(extra._tag).toBe("err");
    if (extra._tag === "err") expect(extra.error.problems[0]).toContain("go/go-x.md");
  });
});

describe("publish refuses", () => {
  it("a facet value, kind, or responsibility outside the vocabulary", () => {
    expect(refusal([unit("go", "go-a", { concern: ["memory"] })])).toEqual([
      "go-a: concern value 'memory' is not in the vocabulary",
    ]);
    expect(
      refusal([
        unit("go", "go-a", {
          kind: "option",
          option_group: { responsibility: "linter", member: "x" },
        }),
      ]),
    ).toEqual(["go-a: responsibility 'linter' is not in the vocabulary"]);
  });

  it("a duplicate id, a repeated when in one family, and a unit with no restricted facet", () => {
    const twice = [unit("go", "go-a"), unit("go", "go-a")];
    expect(refusal(twice)).toContain("go-a: duplicate id (go/go-a.md)");
    const sameWhen = [
      unit("go", "go-a", { when: "Same sentence, twice over the family." }),
      unit("go", "go-b", { when: "Same sentence, twice over the family." }),
    ];
    expect(refusal(sameWhen)).toEqual(["go-b: when duplicates go-a"]);
    expect(refusal([unit("shared", "arch-a", { task: [], concern: [] })])).toEqual([
      "arch-a: no restricted facet",
    ]);
  });

  it("a relation to an unknown unit, a requires or contains cycle, and an option group on a non-option", () => {
    expect(refusal([unit("go", "go-a", { requires: ["go-missing"] })])).toEqual([
      "go-a: requires names unknown unit go-missing",
    ]);
    const loop = [
      unit("go", "go-a", { requires: ["go-b"] }),
      unit("go", "go-b", { requires: ["go-a"] }),
    ];
    expect(refusal(loop)).toEqual(["requires cycle: go-a -> go-b -> go-a"]);
    expect(
      refusal([
        unit("go", "go-a", { option_group: { responsibility: "toolchain", member: "standard" } }),
      ]),
    ).toEqual(["go-a: option_group on a rule unit"]);
  });

  it("a duplicate anchor across families and a reference to no anchor", () => {
    const anchors = [
      unit("go", "go-a", {}, "Text {#floor}.\n"),
      unit("ruby", "ruby-a", {}, "Text {#floor}.\n"),
    ];
    expect(refusal(anchors)).toEqual(["anchor {#floor} in both go-a and ruby-a"]);
    expect(refusal([unit("go", "go-a", {}, "See {>nowhere}.\n")])).toEqual([
      "go-a: reference {>nowhere} resolves to no anchor",
    ]);
  });

  it("reports every problem, not the first", () => {
    const problems = refusal([
      unit("go", "go-a", { concern: ["memory"], requires: ["go-missing"] }),
    ]);
    expect(problems).toHaveLength(2);
  });
});

const corpus = (): Snapshot =>
  published([
    unit("shared", "testing-doubles", { task: ["test"], concern: ["testing"] }),
    unit("go", "go-errors", { concern: ["errors"] }),
    unit("go", "go-set-chi", {
      kind: "option",
      purpose: ["service or API"],
      technology: ["chi"],
      task: ["decide"],
      concern: ["tooling"],
      option_group: { responsibility: "api framework", member: "chi" },
      see_also: ["go-errors"],
    }),
    unit("go", "go-set-standard", {
      kind: "option",
      task: ["decide"],
      concern: ["tooling"],
      option_group: { responsibility: "toolchain", member: "standard" },
    }),
    unit(
      "ruby",
      "ruby-errors",
      { concern: ["errors"], requires: ["go-errors"] },
      "Ruby errors. {#ruby-floor} See {>go-floor}.\n",
    ),
    unit(
      "go",
      "go-greenfield-stack",
      { kind: "recipe", task: ["decide"], concern: ["tooling"] },
      "The floor. {#go-floor}\n",
    ),
  ]);

describe("list", () => {
  it("G3 counts all matches after filtering, including zero matches", () => {
    const snapshot = corpus();
    for (const [query, count] of [
      [{}, 6],
      [{ language: ["go"], concern: ["errors"] }, 1],
      [{ technology: ["rails"] }, 0],
    ] as const) {
      const result = listUnits(snapshot, query);
      expect(result._tag).toBe("ok");
      if (result._tag === "ok") expect(result.value).toHaveProperty("count", count);
    }
  });
  it("ANDs across facets, ORs within one, lets an empty applicability facet match any value, and treats technology as naming", () => {
    const snapshot = corpus();
    const ids = (query: Parameters<typeof listUnits>[1]): readonly string[] => {
      const result = listUnits(snapshot, query);
      if (result._tag !== "ok") throw new Error(result.error.message);
      return result.value.units.map((record) => record.id);
    };
    expect(ids({ language: ["go"], concern: ["errors"] })).toEqual(["go-errors"]);
    expect(ids({ language: ["go", "ruby"], concern: ["errors"] })).toEqual([
      "go-errors",
      "ruby-errors",
    ]);
    expect(ids({ language: ["ruby"], task: ["test"] })).toEqual(["testing-doubles"]);
    expect(ids({ language: ["go"], technology: ["chi"] })).toEqual(["go-set-chi"]);
    expect(ids({ technology: ["rails"] })).toEqual([]);
    expect(ids({})).toHaveLength(6);
  });

  it("filters kind and responsibility exactly; a unit without an option group never answers a responsibility query", () => {
    const snapshot = corpus();
    const options = listUnits(snapshot, { language: ["go"], responsibility: ["api framework"] });
    expect(options._tag === "ok" && options.value.units.map((u) => u.id)).toEqual(["go-set-chi"]);
    const kinds = listUnits(snapshot, { kind: ["recipe"] });
    expect(kinds._tag === "ok" && kinds.value.units.map((u) => u.id)).toEqual([
      "go-greenfield-stack",
    ]);
  });

  it("narrows: more facets never return more", () => {
    const snapshot = corpus();
    const fewer = listUnits(snapshot, { language: ["go"] });
    const more = listUnits(snapshot, { language: ["go"], task: ["decide"], concern: ["tooling"] });
    if (fewer._tag !== "ok" || more._tag !== "ok") throw new Error("query failed");
    expect(more.value.units.length).toBeLessThanOrEqual(fewer.value.units.length);
    for (const record of more.value.units)
      expect(fewer.value.units.map((u) => u.id)).toContain(record.id);
  });

  it("returns the snapshot id and the choosing fields, never the body", () => {
    const result = listUnits(corpus(), { language: ["ruby"], concern: ["errors"] });
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.snapshot).toBe("snap-1");
    const record = result.value.units[0];
    expect(record).toMatchObject({ id: "ruby-errors", kind: "rule", requires: ["go-errors"] });
    expect(record).not.toHaveProperty("body");
    expect(record).not.toHaveProperty("sources");
  });

  it("refuses an unknown facet, value, kind, or responsibility as an error, not an empty result", () => {
    const snapshot = corpus();
    const cases: readonly [Query, string][] = [
      // SAFETY: an unknown facet name is exactly what this case sends; the type is widened on purpose.
      [{ colour: ["red"] } as Query, "unknown facet"],
      [{ language: ["cobol"] }, "unknown value"],
      [{ kind: ["poem"] }, "unknown kind"],
      [{ responsibility: ["mascot"] }, "unknown responsibility"],
    ];
    for (const [query, kind] of cases) {
      const result = listUnits(snapshot, query);
      expect(result._tag).toBe("err");
      if (result._tag === "err") expect(result.error.kind).toBe(kind);
    }
  });
});

describe("show, resolve, and the cabinet interface", () => {
  it("shows the whole unit and refuses an unknown id", () => {
    const snapshot = corpus();
    const shown = showUnit(snapshot, "ruby-errors");
    expect(shown._tag === "ok" && shown.value.body).toContain("Ruby errors.");
    const missing = showUnit(snapshot, "ruby-nothing");
    expect(missing._tag === "err" && missing.error.kind).toBe("unknown id");
  });

  it("resolves an anchor to the unit that carries it, never by treating it as an id", () => {
    const snapshot = corpus();
    expect(resolveAnchor(snapshot, "go-floor")).toEqual({
      _tag: "ok",
      value: "go-greenfield-stack",
    });
    expect(resolveAnchor(snapshot, "ruby-floor")).toEqual({ _tag: "ok", value: "ruby-errors" });
    const missing = resolveAnchor(snapshot, "go-errors");
    expect(missing._tag === "err" && missing.error.kind).toBe("unknown anchor");
  });

  it("answers the same through the async cabinet interface", async () => {
    const cabinet = snapshotCabinet(corpus());
    const listed = await cabinet.list({ language: ["go"], concern: ["errors"] });
    expect(listed._tag === "ok" && listed.value.units.map((u) => u.id)).toEqual(["go-errors"]);
    expect((await cabinet.vocabulary()).language).toEqual(["go", "ruby"]);
    expect((await cabinet.resolve("go-floor"))._tag).toBe("ok");
  });
});

describe("a value refusal names the facet's vocabulary without reciting it", () => {
  const listed = (count: number): readonly string[] =>
    Array.from({ length: count }, (_, index) => `value-${String(count - index).padStart(2, "0")}`);
  const vocabularyOf = (language: readonly string[]): Vocabulary => ({
    language,
    purpose: [],
    technology: [],
    task: [],
    concern: [],
    kind: ["rule"],
    responsibility: ["api framework"],
  });

  it("R3 names the first ten values in sorted order and counts the rest for a long vocabulary", () => {
    const refused = validateQuery(vocabularyOf(listed(14)), { language: ["cobol"] });
    expect(refused?.kind).toBe("unknown value");
    expect(refused?.input).toBe(
      "language=cobol; language is one of: value-01, value-02, value-03, value-04, value-05, " +
        "value-06, value-07, value-08, value-09, value-10 and 4 more; " +
        "greenline guidance vocabulary lists them all",
    );
  });

  it("R3 names every value and points nowhere else for a vocabulary shorter than ten", () => {
    const refused = validateQuery(vocabularyOf(listed(3)), { language: ["cobol"] });
    expect(refused?.input).toBe("language=cobol; language is one of: value-01, value-02, value-03");
  });

  it("R3 counts the rest of a long kind vocabulary the same way", () => {
    const vocabulary: Vocabulary = { ...vocabularyOf([]), kind: listed(12) };
    const refused = validateQuery(vocabulary, { kind: ["poem"] });
    expect(refused?.kind).toBe("unknown kind");
    expect(
      refused?.input.endsWith("value-10 and 2 more; greenline guidance vocabulary lists them all"),
    ).toBe(true);
  });
});
