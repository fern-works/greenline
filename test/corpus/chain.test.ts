/** The fresh chain (`src/corpus/chain.ts`): the entry's schema and canonical bytes, and the chain's refusals, each naming its entry. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  latestChanges,
  parseChain,
  parseEntry,
  resultDigest,
  retiredSkills,
  serializeEntry,
  type EntryFile,
} from "../../src/corpus/chain.ts";
import {
  chainTexts,
  ENTRY_SCHEMA,
  entryText,
  fixtureEntries,
  fixturePlacement,
  fixtureRetirement,
  OLD_TIP,
  RESULT_DIGEST,
  STUB_RULING,
  type FixtureEntry,
  type FixtureObject,
  type FixturePlacement,
  type FixtureValue,
} from "../fixtures/chain.ts";
import { RENDERED_FILES } from "../fixtures/recipe.ts";

/** A handoff to garden of one part, as a test gives an entry. */
const GARDEN: FixtureObject = {
  recipient: "garden",
  parts: [{ part: "its caching rules", locator: "SKILL.md, the caching section" }],
};

const encoder = new TextEncoder();
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function files(texts: readonly { readonly name: string; readonly text: string }[]): EntryFile[] {
  return texts.map(({ name, text }) => ({ name, bytes: encoder.encode(text) }));
}

/** The issues of a refused chain, or the tip of an accepted one. */
function outcome(texts: readonly { readonly name: string; readonly text: string }[]) {
  const chain = parseChain(files(texts));
  return chain._tag === "err"
    ? { issues: chain.error.issues }
    : {
        order: chain.value.entries.map((chained) => chained.entry.id),
        tip: chain.value.entries.at(-1),
      };
}

/** A one-entry chain holding the first fixture entry changed by `change`. */
function single(change: (entry: FixtureEntry) => void, previous?: FixtureValue) {
  const [entry] = fixtureEntries();
  if (entry === undefined) throw new Error("the fixture holds entries");
  change(entry);
  return outcome([
    { name: `${entry.id}.json`, text: entryText(entry, previous ?? { oldChain: { ...OLD_TIP } }) },
  ]);
}

describe("a whole chain", () => {
  it("parses three entries, the first citing the old chain's tip, to its tip", () => {
    const texts = chainTexts(fixtureEntries().slice(0, 3));
    const third = texts[2];
    expect(outcome(texts)).toEqual({
      order: [
        "2026-10-04-fixture-upstream-read",
        "2026-10-05-fixture-skill-recipe",
        "2026-10-06-tiny-skill-stub",
      ],
      tip: expect.objectContaining({
        sha256: sha256(third?.text ?? ""),
        entry: expect.objectContaining({ id: "2026-10-06-tiny-skill-stub", kind: "change" }),
      }),
    });
  });

  it("is empty with no entry file", () => {
    expect(outcome([])).toEqual({ order: [], tip: undefined });
  });

  it("digests a skill directory as one line per file, digest and path, in path order", () => {
    const reversed = [...RENDERED_FILES]
      .reverse()
      .map(([path, text]) => ({ path, bytes: encoder.encode(text) }));
    expect(resultDigest(reversed)).toBe(RESULT_DIGEST);
  });
});

describe("a malformed entry, refused by entry", () => {
  const id = "2026-10-04-fixture-upstream-read";
  it.each<[string, (entry: FixtureEntry) => void, string]>([
    ["another schema", (e) => (e.schema = "greenline.entry/v0"), "schema"],
    ["an unknown field", (e) => (e["extra"] = "x"), "Unrecognized key"],
    ["a kind outside the two", (e) => (e.kind = "unit"), "kind"],
    ["a licence outside the four", (e) => (e["licence"] = "gpl"), "licence"],
    ["a verdict outside the six", (e) => (e["verdict"] = "rejected"), "verdict"],
    [
      "a commit that is not 40 hex",
      (e) => (e["source"] = { repository: "https://example.com/x", commit: "abc1234", path: "." }),
      "40-hex",
    ],
    [
      "a path that climbs out",
      (e) =>
        (e["source"] = {
          repository: "https://example.com/x",
          commit: "a".repeat(40),
          path: "../x",
        }),
      "source.path",
    ],
    [
      "a reason naming a private path",
      (e) => (e["reason"] = "As docs/work/jobs/J-1.md says."),
      "docs/work/",
    ],
    ["a reason over two lines", (e) => (e["reason"] = "One line.\nTwo lines."), "one line"],
  ])("refuses %s", (_name, change, said) => {
    const result = single(change);
    expect(result).toEqual({ issues: [expect.objectContaining({ entry: id })] });
    expect(JSON.stringify(result)).toContain(said);
  });

  it("refuses an id that is not a calendar date and a slug, naming the file", () => {
    expect(
      single((entry) => {
        entry.id = "2026-13-01-fixture-upstream-read";
      }),
    ).toEqual({
      issues: [
        {
          entry: "2026-13-01-fixture-upstream-read",
          message: "id: an entry's id is a calendar date and a slug, as 2026-10-05-a-slug",
        },
      ],
    });
  });

  it("refuses a change entry's subject outside skill:<name>, block and modes", () => {
    const [, change] = fixtureEntries();
    if (change === undefined) throw new Error("the fixture holds a change");
    change["subject"] = "roster";
    expect(
      outcome([
        { name: `${change.id}.json`, text: entryText(change, { oldChain: { ...OLD_TIP } }) },
      ]),
    ).toEqual({
      issues: [
        {
          entry: change.id,
          message: "subject: a subject is skill:<name>, block or modes",
        },
      ],
    });
  });

  it("refuses a measure under the retention minimum without the operator's ruling", () => {
    const [, change] = fixtureEntries();
    if (change === undefined) throw new Error("the fixture holds a change");
    change["measure"] = {
      stub: false,
      sources: [
        {
          source: "fixture-upstream",
          segments: 12,
          taken: 11,
          exact: 9,
          retention: 9 / 11,
          coverage: 11 / 12,
          meetsMinimum: false,
          creditLine: false,
        },
      ],
      growth: 7,
    };
    expect(
      outcome([
        { name: `${change.id}.json`, text: entryText(change, { oldChain: { ...OLD_TIP } }) },
      ]),
    ).toEqual({
      issues: [
        {
          entry: change.id,
          message: "ruling: a measure under the retention minimum needs the operator's ruling",
        },
      ],
    });
  });

  it("refuses bytes that are not the canonical form record writes, and a file that holds another entry", () => {
    const [entry] = fixtureEntries();
    if (entry === undefined) throw new Error("the fixture holds entries");
    const text = entryText(entry, { oldChain: { ...OLD_TIP } });
    expect(outcome([{ name: `${entry.id}.json`, text: text.replaceAll("  ", "    ") }])).toEqual({
      issues: [
        {
          entry: entry.id,
          message: "the bytes are not the entry's canonical form, as record writes it",
        },
      ],
    });
    expect(outcome([{ name: "2026-10-04-elsewhere.json", text }])).toEqual({
      issues: [
        { entry: "2026-10-04-elsewhere", message: `the file holds the entry '${entry.id}'` },
      ],
    });
    expect(outcome([{ name: `${entry.id}.json`, text: "{" }])).toEqual({
      issues: [{ entry: entry.id, message: "the entry: the entry is not valid JSON" }],
    });
  });
});

/** The messages a one-entry chain of the fixture's source entry, changed by `change`, is refused with. */
function refusals(change: (entry: FixtureEntry) => void): readonly string[] {
  const result = single(change);
  return "issues" in result ? (result.issues ?? []).map((issue) => issue.message) : [];
}

describe("the source entry's six verdicts", () => {
  const HANDED =
    "Its rules for one framework's caching are knowledge, proposed to garden's maintainer.";
  it.each<[string, string, string, boolean]>([
    ["copy", "mit", "The method is taken whole.", true],
    ["combine", "mit", "The method joins the fixture skill's as one recipe.", true],
    ["lift", "ideas-only", "The method enters in greenline's words with credit.", true],
    ["lift", "permissive-other", "The method enters in greenline's words with credit.", true],
    ["hand-off", "permissive-other", HANDED, false],
    ["hold", "refused", "It waits on the author's grant of rights.", false],
    ["decline", "refused", "It restates the fixture method.", false],
    ["decline", "mit", "It restates the fixture method.", false],
  ])("parses %s on a %s licence", (verdict, licence, reason, placed) => {
    const result = single((e) => {
      e["verdict"] = verdict;
      e["licence"] = licence;
      e["reason"] = reason;
      if (!placed) delete e["placement"];
      if (verdict === "hand-off") e["handoff"] = GARDEN;
    });
    expect(result).toEqual({
      order: ["2026-10-04-fixture-upstream-read"],
      tip: expect.objectContaining({ entry: expect.objectContaining({ verdict, licence }) }),
    });
    const entry = "tip" in result ? result.tip?.entry : undefined;
    expect(entry?.kind === "source" && entry.placement !== undefined).toBe(placed);
  });

  it.each(["taken", "credit", "declined", "deferred", "hand off"])(
    "refuses the word %s",
    (word) => {
      const messages = refusals((e) => {
        e["verdict"] = word;
        delete e["placement"];
      });
      expect(messages).toEqual([expect.stringMatching(/^verdict: /)]);
    },
  );

  it.each<[string, string, string]>([
    ["copy", "permissive-other", "verdict: only a plain MIT source is copied or combined"],
    ["copy", "ideas-only", "verdict: only a plain MIT source is copied or combined"],
    ["copy", "refused", "verdict: only a plain MIT source is copied or combined"],
    ["combine", "permissive-other", "verdict: only a plain MIT source is copied or combined"],
    ["combine", "ideas-only", "verdict: only a plain MIT source is copied or combined"],
    ["lift", "refused", "verdict: a refused licence admits only decline or hold"],
  ])("refuses %s on a %s licence", (verdict, licence, said) => {
    const messages = refusals((e) => {
      e["verdict"] = verdict;
      e["licence"] = licence;
    });
    expect(messages).toContainEqual(expect.stringContaining(said));
  });

  it("refuses a hand-off on a refused licence", () => {
    expect(
      refusals((e) => {
        e["verdict"] = "hand-off";
        e["licence"] = "refused";
        e["reason"] = HANDED;
        e["handoff"] = GARDEN;
        delete e["placement"];
      }),
    ).toEqual(["verdict: a refused licence admits only decline or hold"]);
  });

  it("S8c: reads a hand-off's recipient from its handoff alone, never from its reason", () => {
    expect(
      refusals((e) => {
        e["verdict"] = "hand-off";
        e["reason"] = "Garden’s maintainer receives its caching rules.";
        delete e["placement"];
      }),
    ).toEqual([
      "handoff: a hand-off carries its handoff; a handoff names its recipient: garden, or a workshop craft by its page name, craft-<name>",
    ]);
    expect(
      refusals((e) => {
        e["verdict"] = "hand-off";
        e["reason"] = "Its caching rules are knowledge for another product.";
        e["handoff"] = GARDEN;
        delete e["placement"];
      }),
    ).toEqual([]);
  });
});

describe("the placement", () => {
  it.each(["copy", "combine", "lift"])("is required on a %s entry", (verdict) => {
    expect(
      refusals((e) => {
        e["verdict"] = verdict;
        delete e["placement"];
      }),
    ).toEqual(["placement: a copy, combine or lift entry carries its placement"]);
  });

  it.each<[string, string]>([
    ["hand-off", "Its caching rules are proposed to garden's maintainer."],
    ["hold", "It waits on a witness."],
    ["decline", "It restates the fixture method."],
  ])("is refused on a %s entry", (verdict, reason) => {
    expect(
      refusals((e) => {
        e["verdict"] = verdict;
        e["reason"] = reason;
        if (verdict === "hand-off") e["handoff"] = GARDEN;
      }),
    ).toEqual(["placement: only a copy, combine or lift entry carries a placement"]);
  });

  /** The refusals of the fixture's source entry with its placement changed by `change`. */
  function placed(change: (placement: FixturePlacement) => void) {
    return refusals((e) => {
      const placement = fixturePlacement();
      change(placement);
      e["placement"] = placement;
    });
  }

  it.each<[string, (p: FixturePlacement) => void, string]>([
    [
      "an evidence grade outside the four",
      (p) => (p["evidence"] = "anecdotal"),
      "placement.evidence",
    ],
    ["a move outside the four", (p) => (p["move"] = "replace"), "placement.move"],
    [
      "a boldest move outside the four",
      (p) => (p["boldest"] = { move: "rewrite", needs: "A run." }),
      "placement.boldest.move",
    ],
    [
      "a boldest option without its evidence",
      (p) => (p["boldest"] = { move: "add" }),
      "placement.boldest.needs",
    ],
    ["a ships word outside trial and default", (p) => (p["ships"] = "beta"), "placement.ships"],
    ["an unknown field", (p) => (p["stack"] = "check"), "Unrecognized key"],
    ["R4: a placement without its kind", (p) => delete p["kind"], "placement.kind"],
    [
      "R5: a kind that is not a kebab-case name, the kinds being the modes definition's, which record reads",
      (p) => (p["kind"] = "Stage"),
      "placement.kind: a kind is a kebab-case name",
    ],
    ["R4: a placement without its slot", (p) => delete p["slot"], "placement.slot"],
    ["R4: a slot that is not a name", (p) => (p["slot"] = "Check Step"), "placement.slot"],
    ["no mode", (p) => (p["modes"] = []), "placement.modes"],
    [
      "a depth outside the five",
      (p) => (p["modes"] = [{ mode: "quick", step: "check", depth: "deep", cost: 40 }]),
      "placement.modes[0].depth: a depth is none, inline, written, independent or looped",
    ],
    [
      "a cost that is not a whole number of words",
      (p) => (p["modes"] = [{ mode: "quick", step: "check", depth: "inline", cost: 4.5 }]),
      "placement.modes[0].cost: Invalid input: expected int",
    ],
    [
      "a mode row without its step",
      (p) => (p["modes"] = [{ mode: "quick", depth: "inline", cost: 40 }]),
      "placement.modes[0].step",
    ],
    ["a catch over two lines", (p) => (p["catches"] = "One.\nTwo."), "one line"],
  ])("refuses %s", (_name, change, said) => {
    expect(placed(change).join("; ")).toContain(said);
  });

  it("refuses a boldest option less bold than the move chosen, in the order fill, strengthen, add, reshape", () => {
    expect(
      placed((p) => {
        p["move"] = "add";
        p["boldest"] = { move: "strengthen", needs: "A run." };
      }),
    ).toEqual([
      "placement.boldest.move: the boldest option is at least as bold as the move chosen, in the order fill, strengthen, add, reshape",
    ]);
    expect(
      placed((p) => {
        p["move"] = "reshape";
        p["boldest"] = { move: "reshape", needs: "A measured run at every mode." };
      }),
    ).toEqual([]);
  });

  it.each(["fill", "reshape"])(
    "R4: refuses a %s whose kind is not step, since it places a step method",
    (move) => {
      expect(
        placed((p) => {
          p["move"] = move;
          p["kind"] = "habit";
          p["boldest"] = { move: "reshape", needs: "A measured run at every mode." };
        }),
      ).toEqual([
        `placement.kind: a ${move} places a step method, so its kind is step, not 'habit'`,
      ]);
    },
  );

  it("accepts a cost below zero, the words a swap removes", () => {
    expect(
      placed((p) => (p["modes"] = [{ mode: "quick", step: "check", depth: "inline", cost: -12 }])),
    ).toEqual([]);
  });
});

describe("an entry's canonical bytes", () => {
  it("put the placement's fields in the schema's order whatever order they were handed in", () => {
    const [entry] = fixtureEntries();
    if (entry === undefined) throw new Error("the fixture holds entries");
    const canonical = entryText(entry, { oldChain: { ...OLD_TIP } });
    const reversed = (value: FixtureObject) => Object.fromEntries(Object.entries(value).reverse());
    const placement = fixturePlacement();
    const handed = { ...reversed(placement), modes: placement.modes.map(reversed) };
    const parsed = parseEntry(
      JSON.stringify({ ...JSON.parse(canonical), placement: handed }),
      "handed",
    );
    if (parsed._tag === "err") throw parsed.error;
    expect(serializeEntry(parsed.value)).toBe(canonical);
  });
});

describe("a chain that is not whole, refused by entry", () => {
  it("refuses a missing predecessor", () => {
    const [, second] = chainTexts(fixtureEntries().slice(0, 2));
    if (second === undefined) throw new Error("two entries");
    expect(outcome([second])).toEqual({
      issues: [
        {
          entry: "2026-10-05-fixture-skill-recipe",
          message: "its predecessor '2026-10-04-fixture-upstream-read' is missing",
        },
      ],
    });
  });

  it("refuses a predecessor whose bytes changed after its successor named them", () => {
    const [first, second] = chainTexts(fixtureEntries().slice(0, 2));
    if (first === undefined || second === undefined) throw new Error("two entries");
    const changed = first.text.replace("sentence by sentence", "line by line");
    expect(outcome([{ name: first.name, text: changed }, second])).toEqual({
      issues: [
        {
          entry: "2026-10-05-fixture-skill-recipe",
          message: `its predecessor '2026-10-04-fixture-upstream-read' has the digest ${sha256(changed)}, not ${sha256(first.text)}`,
        },
      ],
    });
  });

  it("refuses two entries naming the same predecessor, the old chain's tip included", () => {
    const [a, b, c, d] = fixtureEntries();
    if (a === undefined || b === undefined || c === undefined || d === undefined)
      throw new Error("four entries");
    const forked = [...chainTexts([a, b]), ...chainTexts([a, c]).slice(1)];
    expect(outcome(forked)).toEqual({
      issues: [
        {
          entry: "2026-10-05-fixture-skill-recipe",
          message:
            "2026-10-05-fixture-skill-recipe and 2026-10-06-tiny-skill-stub name the same predecessor, 2026-10-04-fixture-upstream-read",
        },
        {
          entry: "2026-10-06-tiny-skill-stub",
          message:
            "2026-10-05-fixture-skill-recipe and 2026-10-06-tiny-skill-stub name the same predecessor, 2026-10-04-fixture-upstream-read",
        },
      ],
    });
    const twoFirsts = [...chainTexts([a]), ...chainTexts([d])];
    expect(outcome(twoFirsts)).toEqual({
      issues: [
        {
          entry: "2026-10-04-fixture-upstream-read",
          message:
            "2026-10-04-fixture-upstream-read and 2026-10-07-other-read name the same predecessor, the old chain's tip",
        },
        {
          entry: "2026-10-07-other-read",
          message:
            "2026-10-04-fixture-upstream-read and 2026-10-07-other-read name the same predecessor, the old chain's tip",
        },
      ],
    });
  });

  it("refuses a cycle, naming every entry on it", () => {
    const [, b, c] = fixtureEntries();
    if (b === undefined || c === undefined) throw new Error("entries");
    const bText = entryText(b, { id: c.id, sha256: "0".repeat(64) });
    const cText = entryText(c, { id: b.id, sha256: sha256(bText) });
    const result = outcome([
      { name: `${b.id}.json`, text: bText },
      { name: `${c.id}.json`, text: cText },
    ]);
    expect(result).toEqual({
      issues: expect.arrayContaining([
        {
          entry: b.id,
          message: `it is on a cycle: ${b.id} → ${c.id} → ${b.id}`,
        },
        {
          entry: c.id,
          message: `it is on a cycle: ${b.id} → ${c.id} → ${b.id}`,
        },
      ]),
    });
  });
});

describe("S13: the retirement entry", () => {
  /** The fixture's read and change, then the fixture skill's retirement changed by `change`, and any later entries. */
  function retired(
    change: (entry: FixtureEntry) => void = () => {},
    later: readonly FixtureEntry[] = [],
  ) {
    const [read, recipe] = fixtureEntries();
    if (read === undefined || recipe === undefined) throw new Error("entries");
    const retirement = fixtureRetirement();
    change(retirement);
    return outcome(chainTexts([read, recipe, retirement, ...later]));
  }

  it("parses the skill, the slice, its replacement and the recipe it leaves, in canonical bytes", () => {
    const result = retired();
    expect(result).toEqual({
      order: [
        "2026-10-04-fixture-upstream-read",
        "2026-10-05-fixture-skill-recipe",
        "2026-10-08-fixture-skill-retired",
      ],
      tip: expect.objectContaining({
        entry: expect.objectContaining({
          kind: "retirement",
          skill: "fixture-skill",
          slice: "S13 of the fixture plan",
          replacedBy: "fixture-heir",
        }),
      }),
    });
    const entry = "tip" in result ? result.tip?.entry : undefined;
    if (entry === undefined) throw new Error("a tip");
    expect([...serializeEntry(entry).matchAll(/^ {2}"([a-zA-Z]+)":/gm)].map((m) => m[1])).toEqual([
      "schema",
      "id",
      "kind",
      "previous",
      "skill",
      "slice",
      "replacedBy",
      "recipe",
      "gist",
      "reason",
      "authorisedBy",
      "ruling",
    ]);
  });

  it("parses a retirement that no skill replaces, its replacement null", () => {
    const result = retired((entry) => (entry["replacedBy"] = null));
    const entry = "tip" in result ? result.tip?.entry : undefined;
    expect(entry).toEqual(expect.objectContaining({ kind: "retirement", replacedBy: null }));
  });

  it.each<[string, (entry: FixtureEntry) => void, string]>([
    [
      "a replacement that is the skill itself",
      (e) => (e["replacedBy"] = "fixture-skill"),
      "replacedBy: a skill is never replaced by itself",
    ],
    ["a skill that is no kebab-case name", (e) => (e["skill"] = "Fixture"), "skill: "],
    ["a recipe digest that is not 64 hex", (e) => (e["recipe"] = "abc"), "recipe: "],
    ["no slice", (e) => delete e["slice"], "slice: "],
    [
      "a reason naming a private path",
      (e) => (e["reason"] = "As docs/work/x.md says."),
      "reason: ",
    ],
  ])("refuses %s, naming the entry", (_name, change, said) => {
    const result = retired(change);
    expect(result).toEqual({
      issues: [
        expect.objectContaining({
          entry: "2026-10-08-fixture-skill-retired",
          message: expect.stringContaining(said),
        }),
      ],
    });
  });

  it("takes a retired skill out of each skill's latest change, and a later change brings it back", () => {
    const result = parseChain(
      files(
        (() => {
          const [read, recipe] = fixtureEntries();
          if (read === undefined || recipe === undefined) throw new Error("entries");
          return chainTexts([read, recipe, fixtureRetirement()]);
        })(),
      ),
    );
    if (result._tag === "err") throw result.error;
    expect([...latestChanges(result.value).keys()]).toEqual([]);
    expect([...retiredSkills(result.value)]).toEqual([
      ["fixture-skill", expect.objectContaining({ id: "2026-10-08-fixture-skill-retired" })],
    ]);
    const [read, recipe] = fixtureEntries();
    if (read === undefined || recipe === undefined) throw new Error("entries");
    const back = { ...recipe, id: "2026-10-09-fixture-skill-back" };
    const again = parseChain(files(chainTexts([read, recipe, fixtureRetirement(), back])));
    if (again._tag === "err") throw again.error;
    expect([...latestChanges(again.value).keys()]).toEqual(["fixture-skill"]);
    expect([...retiredSkills(again.value).keys()]).toEqual([]);
  });
});

describe("S8b: the entry's form, greenline.entry/v2", () => {
  /** The fixture's entry at an index: the copy, the skill's change, the stub's change, the decline. */
  function fixture(index: number): FixtureEntry {
    const entry = fixtureEntries()[index];
    if (entry === undefined) throw new Error("the fixture holds four entries");
    return entry;
  }
  const [read, recipe, stub, declined] = [fixture(0), fixture(1), fixture(2), fixture(3)];

  /** The refusals of a one-entry chain holding `entry`, or none when it parses. */
  function newRefusals(entry: FixtureEntry): readonly string[] {
    const result = outcome([
      { name: `${entry.id}.json`, text: entryText(entry, { oldChain: { ...OLD_TIP } }) },
    ]);
    return "issues" in result ? (result.issues ?? []).map((issue) => issue.message) : [];
  }

  /** What a test gives the fixture's copy: its handoff and its placement's loads fact. */
  interface Given {
    readonly handoff?: FixtureObject;
    readonly loads?: readonly FixtureObject[];
  }

  /** The fixture's copy with the fields given, changed by `change`. */
  function source(change: (entry: FixtureEntry) => void = () => {}, fields: Given = {}) {
    const entry = structuredClone(read);
    if (fields.handoff !== undefined) entry["handoff"] = structuredClone(fields.handoff);
    if (fields.loads !== undefined)
      // SAFETY: the fixture's copy carries its placement, an object.
      (entry["placement"] as FixtureObject)["loads"] = structuredClone([...fields.loads]);
    change(entry);
    return entry;
  }

  it("parses every kind, with its gist and its ruling list, and writes it back in its canonical bytes", () => {
    const entries = [
      { ...read, ruling: [{ date: "2026-10-04", words: "Copy it whole; it fits." }] },
      recipe,
      stub,
      declined,
    ];
    const texts = chainTexts(entries);
    expect(outcome(texts)).toMatchObject({ order: entries.map((entry) => entry.id) });
    for (const { text } of texts) {
      const parsed = parseEntry(text, "new");
      if (parsed._tag === "err") throw parsed.error;
      expect(serializeEntry(parsed.value)).toBe(text);
      expect(text).toContain(`"schema": "${ENTRY_SCHEMA}"`);
    }
    const stubbed = parseEntry(texts[2]?.text ?? "", "new");
    expect(
      stubbed._tag === "ok" && stubbed.value.kind === "change" && stubbed.value.ruling,
    ).toEqual([STUB_RULING]);
  });

  it("S8c: refuses an entry of the old form, greenline.entry/v1, with its ruling as one line of text", () => {
    const { gist: _gist, ruling: _ruling, ...rest } = stub;
    const old = { ...rest, schema: "greenline.entry/v1", ruling: "Tiny only delegates." };
    const issues = newRefusals(old);
    expect(issues).toContainEqual(expect.stringMatching(/^schema: /));
    expect(issues).toContainEqual(expect.stringMatching(/^gist: /));
    expect(issues).toContainEqual(expect.stringMatching(/^ruling: /));
  });

  it("writes the fields in their order whatever order they were handed in", () => {
    const entry = source(() => {}, {
      handoff: GARDEN,
      loads: [{ file: "references/caching.md", depth: "independent" }],
    });
    entry["verdict"] = "combine";
    const canonical = entryText(entry, { oldChain: { ...OLD_TIP } });
    const reversed = Object.fromEntries(Object.entries(JSON.parse(canonical)).reverse());
    const parsed = parseEntry(JSON.stringify(reversed), "handed");
    if (parsed._tag === "err") throw parsed.error;
    expect(serializeEntry(parsed.value)).toBe(canonical);
  });

  it.each<[string, (entry: FixtureEntry) => void, string]>([
    [
      "a reason of three sentences",
      (e) => (e["reason"] = "It is taken. It is whole. It fits."),
      "reason: a reason holds at most two sentences, and this one holds 3",
    ],
    [
      "a reason of more than 40 words",
      (e) => (e["reason"] = `It is taken ${"whole ".repeat(38).trim()}.`),
      "reason: a reason holds at most 40 words, and this one holds 41",
    ],
    [
      "a gist of more than twelve words",
      (e) =>
        (e["gist"] = "one two three four five six seven eight nine ten eleven twelve thirteen"),
      "gist: a gist holds at most twelve words",
    ],
    ["a gist that ends in a full stop", (e) => (e["gist"] = "Taken whole."), "gist: a gist ends"],
    ["no gist", (e) => delete e["gist"], "gist"],
    ["no ruling list", (e) => delete e["ruling"], "ruling"],
    ["a ruling as text, the old form's", (e) => (e["ruling"] = "Copy it whole."), "ruling"],
    [
      "a ruling item without its date",
      (e) => (e["ruling"] = [{ words: "Copy it whole." }]),
      "ruling[0].date",
    ],
    [
      "a ruling item whose date is no calendar date",
      (e) => (e["ruling"] = [{ date: "2026-02-30", words: "Copy it whole." }]),
      "ruling[0].date: a ruling's date is a calendar date, as 2026-10-11",
    ],
    [
      "a ruling item naming a private path",
      (e) => (e["ruling"] = [{ date: "2026-10-04", words: "As docs/work/x.md rules." }]),
      "docs/work/",
    ],
  ])("refuses %s", (_name, change, said) => {
    expect(newRefusals(source(change))).toContainEqual(expect.stringContaining(said));
  });

  it("counts a reason's sentences at a full stop, a question mark or an exclamation mark before a space or the end", () => {
    expect(
      newRefusals(source((e) => (e["reason"] = "Taken whole; it fits, as ruled. It fits."))),
    ).toEqual([]);
    expect(newRefusals(source((e) => (e["reason"] = "Taken whole (v1.2 of it). It fits")))).toEqual(
      [],
    );
    expect(newRefusals(source((e) => (e["reason"] = "Taken? Whole! It fits.")))).toEqual([
      "reason: a reason holds at most two sentences, and this one holds 3",
    ]);
  });

  it("refuses the entry's fields under the old schema's identifier", () => {
    expect(newRefusals(source((e) => (e["schema"] = "greenline.entry/v1")))).toEqual([
      'schema: Invalid input: expected "greenline.entry/v2"',
    ]);
  });

  it("refuses a measure under the retention minimum whose ruling list is empty", () => {
    const entry: FixtureEntry = { ...structuredClone(recipe), ruling: [] };
    // SAFETY: the fixture's change entry carries a measure whose sources are objects.
    const measure = entry["measure"] as { sources: FixtureObject[] };
    for (const each of measure.sources) each["meetsMinimum"] = false;
    expect(newRefusals(entry)).toEqual([
      "ruling: a measure under the retention minimum needs the operator's ruling",
    ]);
  });

  describe("the handoff", () => {
    /** The fixture's copy as a hand-off, its handoff given. */
    function handOff(handoff: FixtureObject | undefined): FixtureEntry {
      return source(
        (e) => {
          e["verdict"] = "hand-off";
          e["licence"] = "permissive-other";
          e["reason"] = "Its caching rules are knowledge for another product.";
          delete e["placement"];
        },
        handoff === undefined ? {} : { handoff },
      );
    }

    const named =
      "a handoff names its recipient: garden, or a workshop craft by its page name, craft-<name>";

    it("parses a hand-off to garden and one to a workshop craft by its page name, each part with its locator", () => {
      expect(newRefusals(handOff(GARDEN))).toEqual([]);
      expect(newRefusals(handOff({ ...GARDEN, recipient: "craft-writing-for-agents" }))).toEqual(
        [],
      );
    });

    it("refuses a hand-off with no handoff, a handoff with no recipient, and a recipient that is neither garden nor a craft", () => {
      expect(newRefusals(handOff(undefined))).toEqual([
        `handoff: a hand-off carries its handoff; ${named}`,
      ]);
      expect(newRefusals(handOff({ parts: GARDEN["parts"] ?? [] }))).toEqual([
        expect.stringMatching(/^handoff\.recipient: /),
      ]);
      expect(newRefusals(handOff({ ...GARDEN, recipient: "garden's maintainer" }))).toEqual([
        `handoff.recipient: ${named}`,
      ]);
      expect(newRefusals(handOff({ ...GARDEN, recipient: "craft-" }))).toEqual([
        `handoff.recipient: ${named}`,
      ]);
    });

    it("refuses a handoff with no part, and a part without its locator", () => {
      expect(newRefusals(handOff({ recipient: "garden", parts: [] }))).toEqual([
        "handoff.parts: a handoff names at least one part it hands off",
      ]);
      expect(
        newRefusals(handOff({ recipient: "garden", parts: [{ part: "its caching rules" }] })),
      ).toEqual([expect.stringMatching(/^handoff\.parts\[0\]\.locator: /)]);
    });

    it.each(["copy", "combine", "lift"])("parses a %s that hands parts off", (verdict) => {
      const entry = source((e) => (e["verdict"] = verdict), { handoff: GARDEN });
      if (verdict === "lift") entry["licence"] = "ideas-only";
      expect(newRefusals(entry)).toEqual([]);
    });

    it.each(["hold", "decline"])("refuses a handoff on a %s", (verdict) => {
      const entry = source(
        (e) => {
          e["verdict"] = verdict;
          delete e["placement"];
        },
        { handoff: GARDEN },
      );
      expect(newRefusals(entry)).toEqual([
        "handoff: only a hand-off, or a copy, combine or lift that hands parts off, carries a handoff",
      ]);
    });
  });

  describe("the placement's loads fact", () => {
    it("parses the reference files a placement's depths read", () => {
      expect(
        newRefusals(
          source(() => {}, {
            loads: [
              { file: "references/check.md", depth: "inline" },
              { file: "references/check-deep.md", depth: "independent" },
            ],
          }),
        ),
      ).toEqual([]);
    });

    it.each<[string, FixtureObject[], string]>([
      ["no row", [], "placement.loads: a loads fact names at least one file and its depth"],
      [
        "a depth no row of the placement reaches",
        [{ file: "references/check.md", depth: "looped" }],
        "placement.loads[0].depth: the placement reaches the depth 'looped' at no mode",
      ],
      [
        "the depth none",
        [{ file: "references/check.md", depth: "none" }],
        "placement.loads[0].depth: a file is read at a depth where the step runs, never at none",
      ],
      [
        "a file that climbs out of the skill",
        [{ file: "../other/references/check.md", depth: "inline" }],
        "placement.loads[0].file: a file inside the skill's directory",
      ],
    ])("refuses %s", (_name, loads, said) => {
      expect(newRefusals(source(() => {}, { loads }))).toEqual([said]);
    });
  });
});
